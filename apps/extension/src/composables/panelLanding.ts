import { watch } from "vue"
import { endLanding, pendingLanding, removeHandbackIfUnchanged } from "@/utils/panel-handback"
import type { Snack } from "@/utils/snack"

/** What the panel shows now: its completed route, and the open session's profile. */
export interface LandingState {
	path: string
	loggedIn: boolean
	profileId: string | undefined
}

/**
 * Settles the hand-back this panel landed for on its first arrival at the route with a session open:
 * the landing ends, the record is removed, and the snack shows when the session, read after the
 * removal, is still open on the snack's profile. A preload Firefox abandons dies holding it.
 */
export function settleLanding(state: () => LandingState, show: (snack: Snack) => void): void {
	const taken = pendingLanding()
	if (!taken) return
	let settled = false
	const stop = watch(
		state,
		async ({ path, loggedIn }) => {
			if (settled || !loggedIn || path !== taken.handback.route) return
			settled = true
			endLanding()
			queueMicrotask(() => stop())
			try {
				await removeHandbackIfUnchanged(taken.raw)
			} catch (error) {
				console.debug("hand-back removal failed", { error })
			}
			const { snack } = taken.handback
			const now = state()
			if (snack && now.loggedIn && now.profileId === snack.profileId) show({ kind: snack.kind, label: snack.label })
		},
		{ immediate: true },
	)
}
