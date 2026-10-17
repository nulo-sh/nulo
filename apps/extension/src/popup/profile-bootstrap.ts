import { errorMessageFromUnknown } from "@nulo/wallet-core/utils"

export interface FencedBootstrapDeps {
	profileId: string
	bootstrap: () => Promise<void>
	/** Bound to the shell's profile-event sequence at call time. */
	isCurrent: () => boolean
	setFailure: (record: { profileId: string; message: string } | null) => void
	readFailure: () => { profileId: string } | null
	shouldToast: () => boolean
	toast: () => void
}

/**
 * Compare-and-commit wrapper around one profile-activation bootstrap. A run
 * superseded by a newer profile event commits NOTHING after its await: a stale
 * success must not clear a newer run's failure record, and a stale failure must
 * not overwrite the channel or toast over a newer profile's outcome.
 */
export async function runFencedBootstrap(deps: FencedBootstrapDeps): Promise<void> {
	// Before the bootstrap's first await: a record names its profile's latest activation, so a wait
	// that starts after this event never acts on a predecessor's failure (a reused id re-imports).
	if (deps.isCurrent() && deps.readFailure()?.profileId === deps.profileId) deps.setFailure(null)
	try {
		await deps.bootstrap()
		if (deps.isCurrent()) deps.setFailure(null)
	} catch (err) {
		console.error("bootstrap failed", err)
		if (!deps.isCurrent()) return
		deps.setFailure({ profileId: deps.profileId, message: errorMessageFromUnknown(err) })
		if (deps.shouldToast()) deps.toast()
	}
}
