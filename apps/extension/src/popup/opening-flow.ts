import type { Router } from "vue-router"
import { createRunFence } from "@/composables/runFence"
import type { ToastOptions } from "@/composables/toast"
import { handsBackToPanel, releaseOwnWindow, returnToPanel } from "@/utils/own-window"
import { type Snack, showSnack } from "@/utils/snack"

const OPENING_ROUTES: ReadonlySet<string> = new Set(["popup-import", "popup-profile-new"])

/** Whether `name` is a page whose flow opens a profile's session. */
export const isOpeningRoute = (name: unknown) => typeof name === "string" && OPENING_ROUTES.has(name)

const flows = createRunFence()

/** Ends every opening flow in this document: the shell owns the window from now on. Runs before the
 *  lock it precedes, whose navigation is not awaited, so a completion that settles before that
 *  navigation commits still finds its flow ended. */
export const endOpeningFlows = (): void => flows.invalidate()

/** Taken when a page opens: false once the shell has ended the flows. */
export const openingFlowLive = (): (() => boolean) => flows.snapshot()

/** Where an opening flow ends once its profile exists. */
export interface OpenedLanding {
	profileId: string
	/** This document's page: Home, or the lock screen when the session did not open here. */
	route: "/popup/general" | "/popup/auth"
	/** The line shown with `route`. */
	line?: Snack
	/** The line the panel shows on Home once this profile's session is open there. */
	panelLine?: Snack
}

/**
 * Ends a create or an import as the panel would, in the caller's task, so nothing runs between the
 * caller's last check and the landing. An own window still in its flow hands Home back: a fresh panel
 * boots there, and its guard sends a locked session to the lock screen, whose unlock returns Home.
 * Any other document releases its window, shows `line` and goes to `route`.
 */
export function landOpenedProfile(
	router: Pick<Router, "push">,
	openToast: (toast: ToastOptions) => unknown,
	{ profileId, route, line, panelLine }: OpenedLanding,
): void {
	if (handsBackToPanel()) {
		void returnToPanel("/popup/general", panelLine && { snack: panelLine, profileId })
		return
	}
	void releaseOwnWindow()
	if (line) showSnack(openToast, line)
	void router.push(route)
}
