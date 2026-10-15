/**
 * The popup's first screen while the background starts. A navigation that finds the session
 * unchecked waits for the background's Ready, but only until one deadline taken at page load: past
 * it the guard routes without the service's reads (an auth-required route to the unlock screen,
 * any other route unselected) and marks the navigation provisional. A provisional navigation is
 * replayed through the guard once the service is Ready, so its reads decide exactly as they would
 * have: register for an empty wallet, the last active profile, an own window's route.
 */
import type { InjectionKey } from "vue"
import type { LocationQuery, RouteLocationNormalized, RouteLocationRaw } from "vue-router"

/** How long the page waits for Ready before showing a screen without it; the start-up bar shows
 *  after the same delay, so a normal open shows neither. */
export const START_GRACE_MS = 200

export interface StartGrace {
	/** True once the service is Ready; false when the page-load grace has run out first. */
	ready(): Promise<boolean>
	/** The navigation to `to` was decided without the service's reads. */
	markProvisional(to: RouteLocationNormalized): void
	/** A guard run's reads completed, so no route stands undecided. */
	settle(): void
	/** Runs the provisional navigation through the guard again, once the service is Ready. */
	replay(): void
}

export const START_GRACE_KEY: InjectionKey<StartGrace> = Symbol("start-grace")

export interface StartGraceDeps {
	/** The page-load deadline, on the `now` clock. */
	deadline: number
	now: () => number
	isReady: () => boolean
	waitForReady: (ms: number) => Promise<boolean>
	replace: (to: RouteLocationRaw) => Promise<unknown>
}

export function createStartGrace(deps: StartGraceDeps): StartGrace {
	let provisional: { path: string; query: LocationQuery; hash: string } | undefined
	return {
		async ready() {
			if (deps.isReady()) return true
			const left = deps.deadline - deps.now()
			return left > 0 ? deps.waitForReady(left) : false
		},
		markProvisional(to) {
			provisional = { path: to.path, query: to.query, hash: to.hash }
		},
		settle() {
			provisional = undefined
		},
		replay() {
			if (!provisional || !deps.isReady()) return
			console.debug("start grace: replaying a route decided without the service")
			// A replay the router cancels or fails keeps the mark; the next Ready or boot decision retries.
			void deps.replace({ ...provisional, force: true }).catch(() => {})
		},
	}
}
