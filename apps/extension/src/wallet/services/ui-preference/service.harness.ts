import type { BrowserApi } from "@nulo/wallet-core/ports"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ConfigStore } from "@/wallet/config"
import { ServiceCollection } from "@/wallet/base"
import { LoggerStore } from "@/wallet/logger"
import { type ExecutionFence, ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { WalletLockedError } from "@/wallet/services/profile/wallet-locked-error"
import { TestRowKeys } from "@/wallet/storage/sealed-entity-storage.testing"
import { UiPreferenceService } from "./service"

function emptiedFakeBrowser(): BrowserApi {
	const api = new FakeBrowserApi()
	api.reset()
	return api
}

/** The session surface of `ProfileService` the preference service reads: one live session at a
 *  time, whose serial moves on every lock, switch and unlock, over real row keys that outlive them. */
export class FakeSession {
	public readonly name = PROFILE_SERVICE_NAME
	public readonly dependencies = []
	public readonly keys = new TestRowKeys()
	public readonly deletion = new ProfileDeletionState()
	public readonly onRowKeysReady = new EventHandler<string>()
	public readonly rowKeys = this.keys.source
	private active: string | undefined
	private serial = 0

	public async start(): Promise<void> {}

	/** Derives `profileId`'s keys and opens its session. */
	public async unlock(profileId: string): Promise<void> {
		await this.keys.unlock(profileId)
		this.open(profileId)
	}

	/** Opens the session of a profile whose keys are held, synchronously, and announces the keys. */
	public open(profileId: string): void {
		this.active = profileId
		this.serial++
		this.onRowKeysReady.invoke(profileId)
	}

	public lock(): void {
		this.active = undefined
		this.serial++
	}

	public async captureExecutionFence(): Promise<ExecutionFence> {
		if (!this.active) throw new WalletLockedError()
		if (this.deletion.isReserved(this.active)) throw new Error("Wallet locked")
		return { profileId: this.active, epoch: this.deletion.capture(this.active), session: this.serial }
	}

	public isFenceLive(fence: ExecutionFence): boolean {
		return fence.session === this.serial && fence.profileId === this.active && this.deletion.isCurrent(fence.profileId, fence.epoch)
	}
}

/** A started `UiPreferenceService` over `api`'s local area (by default an emptied fake browser's,
 *  which every `FakeBrowserApi` shares) and a fresh {@link FakeSession}. */
export async function startUiPreferences(api: BrowserApi = emptiedFakeBrowser()) {
	const session = new FakeSession()
	const service = new UiPreferenceService(new LoggerStore(new ConfigStore()), api)
	const services = new ServiceCollection()
	services.add(session as never)
	services.add(service)
	await services.start()
	return { service, session, area: api.storage.local }
}
