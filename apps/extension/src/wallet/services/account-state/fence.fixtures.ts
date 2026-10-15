import { SessionEndedError } from "@nulo/extension-messaging/errors"
import type { IService } from "@/wallet/base"
import { PROFILE_SERVICE_NAME, type RunFence } from "@/wallet/services/profile/spec"

/** The fence of profile `p1`'s open session, as the restore tests issue it. */
export const LIVE_FENCE: RunFence = { profileId: "p1", epoch: 0, session: 1, incarnation: "w1" }

/** The fence surface `AccountStateService.restore` reads, over one live session the test can end. */
export class FakeFenceProfileService implements IService {
	public static readonly name = PROFILE_SERVICE_NAME
	public readonly name = PROFILE_SERVICE_NAME
	public live: RunFence | undefined = LIVE_FENCE
	public generation: string | undefined = "gen-1"

	public async start(): Promise<void> {}

	public isFenceLive(fence: RunFence): boolean {
		const live = this.live
		return live !== undefined && (Object.keys(live) as Array<keyof RunFence>).every((k) => live[k] === fence[k])
	}

	public async assertRunFence(fence: RunFence): Promise<void> {
		if (!this.isFenceLive(fence)) throw new SessionEndedError()
	}

	public async getPxeGeneration(profileId: string): Promise<string | undefined> {
		return profileId === this.live?.profileId ? this.generation : undefined
	}
}
