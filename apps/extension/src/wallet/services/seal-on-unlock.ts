import type { ProfileService } from "@/wallet/services/profile/service"

/** A service's own `logWarn`, bound: `(...data) => this.logWarn(...data)`. */
export type SealWarn = (message: string, data: { error: unknown }) => void

/**
 * Runs one unlock-time conversion and logs its failure as `warn(message, { error })` instead of
 * rejecting: the next worker retries, since a later unlock in this one finds the keys held and
 * announces nothing. `task` is called in this call's turn, inside the `try`.
 */
export async function runSealing(warn: SealWarn, message: string, task: () => Promise<unknown>): Promise<void> {
	try {
		await task()
	} catch (error) {
		warn(message, { error })
	}
}

/**
 * Runs `seal` for each profile whose row keys become ready in this worker, through
 * {@link runSealing}, started in the announcement's turn and not awaited by it. No profile service
 * (a service started without one) subscribes nothing.
 */
export function sealOnRowKeysReady(
	profiles: Pick<ProfileService, "onRowKeysReady"> | null,
	warn: SealWarn,
	message: string,
	seal: (profileId: string) => Promise<unknown>,
): void {
	profiles?.onRowKeysReady.add((profileId) => void runSealing(warn, message, () => seal(profileId)))
}
