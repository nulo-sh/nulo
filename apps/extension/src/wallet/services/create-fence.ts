import type { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { profileDeletedError } from "@/wallet/services/profile/profile-deletion-state"
import type { PreparedWrite } from "@/wallet/storage/sealed-entity-storage"

/** The profile a write is for and the deletion epoch captured before its first await. */
export type DeletionFence = { profileId: string; epoch: number }

/**
 * Commits a prepared row of `fence.profileId` that a profile deletion may overtake: refused before
 * the dispatch once a deletion has begun, with no await between the check and the dispatch; if one
 * begins while the write is in flight, `remove` takes the row back and `profileDeletedError` is
 * thrown, since the deletion's snapshot may predate the row.
 *
 * `admit` runs between the epoch check and the dispatch, for a caller's own synchronous refusal; it
 * is never awaited, so it must not be async. `landed` runs in the turn of the final epoch check: an
 * emit made there cannot follow a deletion unseen.
 */
export async function commitFencedCreate(
	deletion: ProfileDeletionState,
	fence: DeletionFence,
	write: Pick<PreparedWrite, "commit">,
	remove: () => Promise<void>,
	{ admit, landed }: { admit?: () => void; landed?: () => void } = {},
): Promise<void> {
	deletion.assertCurrent(fence.profileId, fence.epoch)
	admit?.()
	await write.commit()
	if (!deletion.isCurrent(fence.profileId, fence.epoch)) {
		await remove()
		throw profileDeletedError(fence.profileId)
	}
	landed?.()
}
