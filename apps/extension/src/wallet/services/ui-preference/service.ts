import type { BrowserApi, StorageArea } from "@nulo/wallet-core/ports"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import type { ServiceCollection, ServiceSpec } from "@/wallet/base"
import type { ILogger } from "@/wallet/logger"
import { applyFeePickUpdate, type FeePickUpdate, parseFeePickUpdate, readAppPicks, readSendPicks } from "@/utils/fee-picks"
import { type PinMap, sanitizePinMap } from "@/utils/pinned-tokens"
import { AccountService } from "@/wallet/services/account/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import { ProfileService } from "@/wallet/services/profile/service"
import { WalletLockedError } from "@/wallet/services/profile/wallet-locked-error"
import {
	commitLegacyTogether,
	commitSealedTogether,
	type PreparedWrite,
	type SealedEntityStorage,
} from "@/wallet/storage/sealed-entity-storage"
import { namesProfile } from "@/wallet/storage/sealed-roots"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { Lock } from "@/wallet/utils"
import {
	type Events,
	type FeePicks,
	LEGACY_SELECTED_ACCOUNT_KEY,
	MAX_SELECTED_ADDRESS_LENGTH,
	type Methods,
	SELECTED_ACCOUNT_ROOT,
	SELECTED_ACCOUNT_ROW_ID,
	UI_PREFERENCE_SERVICE_NAME,
} from "./spec"

export * from "./spec"

type Refusal = "not-the-session" | "session-moved"

const SELECTED_ACCOUNT_KEY = `${SELECTED_ACCOUNT_ROOT}@${SELECTED_ACCOUNT_ROW_ID}`

type SelectedAccountRow = { profileId: string; address: string }

/**
 * The popup's per-profile preferences: the pins and the two fee-pick maps, one sealed row per
 * profile each, and the device's last account selection, one sealed row naming the profile that
 * made it. Every write of these roots and of the pre-seal selection holds `lock`, which the
 * unlock's conversion and the deletion's purge hold too, so no write lands between a row's read
 * and the commit that depends on it.
 */
export class UiPreferenceService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()(
		"getSelectedAccount",
		"setSelectedAccount",
		"getPinnedTokens",
		"setPinnedTokens",
		"getFeePicks",
		"saveFeePick",
	)
	public static name = UI_PREFERENCE_SERVICE_NAME

	public readonly dependencies = [ProfileService.name, AccountService.name] as const

	private readonly area: StorageArea
	private readonly pins: SealedEntityStorage<unknown>
	private readonly appPicks: SealedEntityStorage<unknown>
	private readonly sendPicks: SealedEntityStorage<unknown>
	private readonly selected: SealedEntityStorage<SelectedAccountRow>
	private readonly lock = new Lock()

	private profiles: ProfileService = null!
	private accounts: AccountService = null!

	public constructor(logger: ILogger, browserApi: BrowserApi) {
		super(UI_PREFERENCE_SERVICE_NAME, logger)
		this.area = browserApi.storage.local
		const keys = (profileId: string) => this.profiles.rowKeys(profileId)
		this.pins = sealedEntityStorage("uiPinnedTokens", this.area, keys)
		this.appPicks = sealedEntityStorage("uiFeePicks", this.area, keys)
		this.sendPicks = sealedEntityStorage("uiSendFeePicks", this.area, keys)
		this.selected = sealedEntityStorage("uiSelectedAccount", this.area, keys)
	}

	protected async init(services: ServiceCollection) {
		this.profiles = services.get(ProfileService.name)
		this.accounts = services.get(AccountService.name)
		this.profiles.onRowKeysReady.add((profileId) => void this.sealLegacyRows(profileId))
	}

	private async sealLegacyRows(profileId: string): Promise<void> {
		for (const store of [this.pins, this.appPicks, this.sendPicks, this.selected]) {
			try {
				await store.sealLegacy(profileId, (fn) => this.lock.withLock(fn))
			} catch (error) {
				this.logWarn("sealing a plaintext preference failed; the next worker retries", { error })
			}
		}
	}

	/**
	 * A stored selection row answers only the profile it names. With none stored, the pre-seal
	 * selection is moved into `profileId`'s row when it is one of the profile's accounts, on any
	 * chain, and left for its owner otherwise. A pre-seal selection beside a stored row is older
	 * than the row, so it is removed unread: a stop between a move's seal and its removal converges.
	 */
	public async getSelectedAccount(profileId: string): Promise<string | undefined> {
		await this.ensureInitialized()
		const fence = await this.fenceFor(profileId)
		if (!fence) return this.refuse("not-the-session", undefined)
		try {
			return await this.lock.withLock(async (isCurrent) => {
				const live = () => isCurrent() && this.profiles.isFenceLive(fence)
				const stored = await this.area.get([SELECTED_ACCOUNT_KEY, LEGACY_SELECTED_ACCOUNT_KEY])
				const legacy = stored[LEGACY_SELECTED_ACCOUNT_KEY]
				const address =
					SELECTED_ACCOUNT_KEY in stored
						? await this.storedSelection(profileId, legacy !== undefined, live)
						: await this.moveLegacySelection(profileId, legacy, live, isCurrent)
				return live() ? address : this.refuse("session-moved", undefined)
			})
		} catch (error) {
			if (error instanceof WalletLockedError) return this.refuse("session-moved", undefined)
			throw error
		}
	}

	private async storedSelection(profileId: string, legacyStored: boolean, live: () => boolean): Promise<string | undefined> {
		if (legacyStored && live()) await this.area.remove(LEGACY_SELECTED_ACCOUNT_KEY)
		const row = await this.selected.get(SELECTED_ACCOUNT_ROW_ID)
		return row?.profileId === profileId ? row.address : undefined
	}

	/** Seals the pre-seal selection as `profileId`'s row and removes it in one commit, only while it
	 *  still holds what was read and the session and the lock section are still the live ones. */
	private async moveLegacySelection(
		profileId: string,
		legacy: unknown,
		live: () => boolean,
		isCurrent: () => boolean,
	): Promise<string | undefined> {
		if (typeof legacy !== "string" || legacy.length > MAX_SELECTED_ADDRESS_LENGTH) return undefined
		const accounts = await this.accounts.getAccountsRaw(profileId)
		if (!accounts.some((account) => account.address === legacy)) return undefined
		const write = await this.selected.prepare(SELECTED_ACCOUNT_ROW_ID, { profileId, address: legacy })
		const seal = {
			items: write.items,
			legacyKey: LEGACY_SELECTED_ACCOUNT_KEY,
			removals: [LEGACY_SELECTED_ACCOUNT_KEY],
			current: (now: unknown) => now === legacy && write.sealed?.held() === true && live(),
		}
		return (await commitLegacyTogether(this.area, [seal], isCurrent)) ? legacy : undefined
	}

	/** Overwrites the device's selection with `profileId`'s and removes the pre-seal one, as a
	 *  selection overwrote it before the seal. */
	public async setSelectedAccount(profileId: string, address: string): Promise<boolean> {
		await this.ensureInitialized()
		if (typeof profileId !== "string" || typeof address !== "string" || address.length > MAX_SELECTED_ADDRESS_LENGTH)
			throw InvalidWalletArgumentsError.forMethod("setSelectedAccount")
		return this.write(profileId, async () => {
			const write = await this.selected.prepare(SELECTED_ACCOUNT_ROW_ID, { profileId, address })
			return write.sealed ? [{ ...write, sealed: { ...write.sealed, removals: [LEGACY_SELECTED_ACCOUNT_KEY] } }] : [write]
		})
	}

	/**
	 * A deletion's removal of the device's selection when `profileId` made it, read with no key so
	 * a resumed deletion finds it; a row naming no profile stays. Runs before the deletion drops the
	 * profile's keys and its keyless sweep, under the lock every writer of the row holds, so it never
	 * removes a selection another profile made meanwhile. Takes no `ProfileService` lock.
	 */
	public async purgeForProfile(profileId: string): Promise<void> {
		await this.ensureInitialized()
		await this.lock.withLock(async (isCurrent) => {
			const raw = await this.selected.rawValue(SELECTED_ACCOUNT_ROW_ID)
			if (namesProfile(raw, profileId) && isCurrent()) await this.selected.deleteStorageId(SELECTED_ACCOUNT_ROW_ID)
		})
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
