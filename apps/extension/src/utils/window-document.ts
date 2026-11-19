/**
 * A window document: the popup page loaded first at a `/windows/*` route. Recorded once at boot,
 * because a locked window moves to `/popup/auth` and back (`useDappApprovalWindow`), so the current
 * route can say otherwise.
 */

let windowDocument = false
let unlockWindowDocument = false

/** Called once in `popup/index.ts`, before the router can rewrite the URL. */
export function captureWindowDocument(hash: string): void {
	const path = hash.replace(/^#/, "").split("?")[0]
	windowDocument = path.startsWith("/windows/")
	unlockWindowDocument = path === "/windows/unlock"
}

export const isWindowDocument = (): boolean => windowDocument

/** Opened as a locked discovery's unlock window. Still true after the worker hands the window to
 *  the connect window, so it speaks only for a route the router has not resolved. */
export const isUnlockWindowDocument = (): boolean => unlockWindowDocument
