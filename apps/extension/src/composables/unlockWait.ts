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
	/**
	 * `"start"`: the deadline covers only the wait for the shell to select the expected profile,
	 * which its bootstrap does at entry. From then on the bootstrap ends the wait by itself (every
	 * await in it is a timed RPC or a storage call, and a failure is recorded), so a start-up that is
	 * slow but healthy still resolves, and the shell selecting another profile rejects with
	 * `ActivationSupersededError`.
	 */
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
 * Bounded, identity-aware, failure-joined activation wait: resolves when the
 * shell finishes bootstrapping the EXPECTED profile (`isLogined` flips last),
 * rejects with `BootstrapFailedError` the moment the shell records a
 * definitive bootstrap failure for that profile (a definitive rejection must
 * release the waiter immediately — never burn the remaining bound), and
 * rejects with `UnlockTimeoutError` at `timeoutMs`.
 *
 * One watcher covers all three signals ON PURPOSE: composing
 * `waitForProfileActive` with a separate failure watcher via `Promise.race`
 * leaks the loser's live watcher until its own timeout and then fires an
 * unobserved rejection (unhandled-rejection noise). Errors are TYPED —
 * callers branch on `instanceof`, never message matching.
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
