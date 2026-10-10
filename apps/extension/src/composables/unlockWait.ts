import { watch } from "vue"

/** The bounded activation wait expired with no matching activation. */
export class UnlockTimeoutError extends Error {
	constructor() {
		super("Unlock timed out")
	}
}

/** The shell recorded a definitive bootstrap failure for the awaited profile. */
export class BootstrapFailedError extends Error {}

export interface ProfileActivationWithFailureSubject {
	isLogined: boolean
	profile?: { id: string }
	bootstrapFailure: { profileId: string; message: string } | null
}

/** The shell selected another profile after it had started bootstrapping the awaited one. */
export class ActivationSupersededError extends Error {}

export interface ActivationWaitOptions {
	/** `"start"`: the deadline ends when the shell selects the expected profile, which its bootstrap
	 *  does at entry; every await in the bootstrap is bounded and a failure is recorded, so a slow
	 *  but healthy start-up still resolves. */
	deadlineCovers?: "start"
}

/** What one change of the watched store means for the wait. `started` is `undefined` without a
 *  start-only deadline, else whether the shell has selected the expected profile yet. */
function activationStep(
	logged: boolean,
	id: string | undefined,
	failure: ProfileActivationWithFailureSubject["bootstrapFailure"],
	expectedId: string,
	started: boolean | undefined,
): "active" | "failed" | "start" | "superseded" | "wait" {
	if (logged && id === expectedId) return "active"
	if (failure?.profileId === expectedId) return "failed"
	if (started === undefined || id === undefined) return "wait"
	if (id === expectedId) return started ? "wait" : "start"
	return started ? "superseded" : "wait"
}

/**
 * Resolves when the shell finishes bootstrapping the EXPECTED profile (`isLogined` flips last).
 * Rejects with `BootstrapFailedError` the moment the shell records that profile's bootstrap
 * failure, and with `UnlockTimeoutError` at `timeoutMs`. Under `deadlineCovers: "start"` the
 * deadline ends once the shell selects the profile; from then on the shell selecting another one
 * rejects with `ActivationSupersededError`, and a lock that clears the profile leaves it pending.
 *
 * One watcher covers every signal ON PURPOSE, so every settlement stops it: racing separate
 * watchers leaves the loser's live until its own timeout. Callers branch on `instanceof`.
 */
export function awaitProfileActivation(
	store: ProfileActivationWithFailureSubject,
	expectedId: string,
	timeoutMs: number,
	opts: ActivationWaitOptions = {},
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (store.isLogined && store.profile?.id === expectedId) {
			return resolve()
		}
		const initialFailure = store.bootstrapFailure
		if (initialFailure && initialFailure.profileId === expectedId) {
			return reject(new BootstrapFailedError(initialFailure.message))
		}
		let started = opts.deadlineCovers === "start" ? store.profile?.id === expectedId : undefined
		const timer = started
			? undefined
			: setTimeout(() => {
					stop()
					reject(new UnlockTimeoutError())
				}, timeoutMs)
		const finish = (error?: Error) => {
			clearTimeout(timer)
			stop()
			if (error) reject(error)
			else resolve()
		}
		const stop = watch([() => store.isLogined, () => store.profile?.id, () => store.bootstrapFailure], ([logged, id, failure]) => {
			const f = failure as ProfileActivationWithFailureSubject["bootstrapFailure"]
			const step = activationStep(logged, id, f, expectedId, started)
			if (step === "active") finish()
			else if (step === "failed") finish(new BootstrapFailedError(f?.message))
			else if (step === "superseded") finish(new ActivationSupersededError())
			else if (step === "start") {
				started = true
				clearTimeout(timer)
			}
		})
	})
}
