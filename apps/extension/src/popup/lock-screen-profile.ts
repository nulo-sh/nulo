import { stringCompare } from "@/utils/string"

/** What the lock screen's pick reads off a listed profile. */
export type LockScreenCandidate = { id: string; name: string; retired?: boolean }

/**
 * The profile the lock screen opens on: the last active one while it exists, else the first by
 * name in the chooser's order, ties by id, a retired profile (which this build cannot open) after
 * every other; `undefined` only for an empty list. The repository lists profiles in no set order,
 * so the pick never reads a list position.
 */
export function lockScreenProfile<P extends LockScreenCandidate>(profiles: readonly P[], lastActiveId: string | undefined): P | undefined {
	const lastActive = lastActiveId === undefined ? undefined : profiles.find((p) => p.id === lastActiveId)
	return lastActive ?? [...profiles].sort(byLockScreenOrder)[0]
}

function byLockScreenOrder(a: LockScreenCandidate, b: LockScreenCandidate): number {
	if (Boolean(a.retired) !== Boolean(b.retired)) return a.retired ? 1 : -1
	return stringCompare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
