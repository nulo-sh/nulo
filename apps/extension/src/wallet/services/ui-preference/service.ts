import type { BrowserApi, StorageArea } from "@nulo/wallet-core/ports"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import type { ServiceCollection, ServiceSpec } from "@/wallet/base"
import type { ILogger } from "@/wallet/logger"
import { applyFeePickUpdate, type FeePickUpdate, parseFeePickUpdate, readAppPicks, readSendPicks } from "@/utils/fee-picks"
import { type PinMap, sanitizePinMap } from "@/utils/pinned-tokens"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import { ProfileService } from "@/wallet/services/profile/service"
import { WalletLockedError } from "@/wallet/services/profile/wallet-locked-error"
import { commitSealedTogether, type PreparedWrite, type SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { Lock } from "@/wallet/utils"
import { type Events, type FeePicks, type Methods, UI_PREFERENCE_SERVICE_NAME } from "./spec"

export * from "./spec"

type Refusal = "not-the-session" | "session-moved"

/**
 * The popup's per-profile preferences: the pins and the two fee-pick maps, one sealed row per
 * profile each. Every write of these roots holds `lock`, which the unlock's conversion holds too,
 * so no write lands between a pre-seal row's read and its sealed commit.
 */
export class UiPreferenceService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()("getPinnedTokens", "setPinnedTokens", "getFeePicks", "saveFeePick")
	public static name = UI_PREFERENCE_SERVICE_NAME

	public readonly dependencies = [ProfileService.name] as const

	private readonly area: StorageArea
	private readonly pins: SealedEntityStorage<unknown>
	private readonly appPicks: SealedEntityStorage<unknown>
	private readonly sendPicks: SealedEntityStorage<unknown>
	private readonly lock = new Lock()

	private profiles: ProfileService = null!

	public constructor(logger: ILogger, browserApi: BrowserApi) {
		super(UI_PREFERENCE_SERVICE_NAME, logger)
		this.area = browserApi.storage.local
		const keys = (profileId: string) => this.profiles.rowKeys(profileId)
		this.pins = sealedEntityStorage("uiPinnedTokens", this.area, keys)
		this.appPicks = sealedEntityStorage("uiFeePicks", this.area, keys)
		this.sendPicks = sealedEntityStorage("uiSendFeePicks", this.area, keys)
	}

	protected async init(services: ServiceCollection) {
		this.profiles = services.get(ProfileService.name)
		this.profiles.onRowKeysReady.add((profileId) => void this.sealLegacyRows(profileId))
	}

	private async sealLegacyRows(profileId: string): Promise<void> {
		for (const store of [this.pins, this.appPicks, this.sendPicks]) {
			try {
				await store.sealLegacy(profileId, (fn) => this.lock.withLock(fn))
			} catch (error) {
				this.logWarn("sealing a plaintext preference failed; the next worker retries", { error })
			}
		}
	}

	public async getPinnedTokens(profileId: string): Promise<PinMap> {
		await this.ensureInitialized()
		const [pins] = await this.read(profileId, [this.pins])
		return sanitizePinMap(pins)
	}

	public async setPinnedTokens(profileId: string, map: PinMap): Promise<boolean> {
		await this.ensureInitialized()
		const next = sanitizePinMap(map)
		return this.write(profileId, async () => [await this.pins.prepare(profileId, next)])
	}

	public async getFeePicks(profileId: string): Promise<FeePicks> {
		await this.ensureInitialized()
		const [app, send] = await this.read(profileId, [this.appPicks, this.sendPicks])
		return { app: readAppPicks(app), send: readSendPicks(send) }
	}

	public async saveFeePick(profileId: string, update: FeePickUpdate): Promise<boolean> {
		await this.ensureInitialized()
		const parsed = parseFeePickUpdate(update)
		if (typeof profileId !== "string" || !parsed) throw InvalidWalletArgumentsError.forMethod("saveFeePick")
		return this.write(profileId, async () => {
			const [app, send] = await Promise.all([this.appPicks.get(profileId), this.sendPicks.get(profileId)])
			const next = applyFeePickUpdate({ app, send }, parsed)
			return Promise.all([
				...(next.app ? [this.appPicks.prepare(profileId, next.app)] : []),
				...(next.send ? [this.sendPicks.prepare(profileId, next.send)] : []),
			])
		})
	}

	/** The fence of the live session when it is `profileId`'s; none when locked, another profile's,
	 *  or a profile whose deletion has begun. */
	private async fenceFor(profileId: string): Promise<ExecutionFence | undefined> {
		let fence: ExecutionFence
		try {
			fence = await this.profiles.captureExecutionFence()
		} catch {
			return undefined
		}
		return fence.profileId === profileId ? fence : undefined
	}

	/** The profile's rows of `stores`, served only while the session captured before the reads is
	 *  still the live one after them; each absent otherwise. */
	private async read(profileId: string, stores: SealedEntityStorage<unknown>[]): Promise<unknown[]> {
		const fence = await this.fenceFor(profileId)
		if (!fence)
			return this.refuse(
				"not-the-session",
				stores.map(() => undefined),
			)
		const rows = await Promise.all(stores.map((store) => store.get(profileId)))
		if (!this.profiles.isFenceLive(fence))
			return this.refuse(
				"session-moved",
				stores.map(() => undefined),
			)
		return rows
	}

	/** Prepares the profile's sealed writes under the lock and commits them in one `set`, only while
	 *  the section still owns the lock and the session captured before the wait is the live one,
	 *  checked with no await before the dispatch: row keys outlive a lock and a switch. */
	private async write(profileId: string, prepare: () => Promise<PreparedWrite[]>): Promise<boolean> {
		const fence = await this.fenceFor(profileId)
		if (!fence) return this.refuse("not-the-session", false)
		try {
			return await this.lock.withLock(async (isCurrent) => {
				const writes = await prepare()
				if (!isCurrent() || !this.profiles.isFenceLive(fence)) return this.refuse("session-moved", false)
				await commitSealedTogether(this.area, writes)
				return true
			})
		} catch (error) {
			if (error instanceof WalletLockedError) return this.refuse("session-moved", false)
			throw error
		}
	}

	private refuse<T>(category: Refusal, empty: T): T {
		this.logDebug(`ui preference refused: ${category}`)
		return empty
	}
}
