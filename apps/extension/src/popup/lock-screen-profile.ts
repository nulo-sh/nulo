/**
 * The profile the lock screen opens on: the last active one while it exists, else the only one.
 * With several and none of them last active (the last active was deleted), there is no profile to
 * presume: `undefined`, and the lock screen offers the profile chooser. Never a list position: the
 * repository lists profiles in no set order.
 */
export function lockScreenProfile<P extends { id: string }>(profiles: readonly P[], lastActiveId: string | undefined): P | undefined {
	const lastActive = lastActiveId === undefined ? undefined : profiles.find((p) => p.id === lastActiveId)
	return lastActive ?? (profiles.length === 1 ? profiles[0] : undefined)
}
