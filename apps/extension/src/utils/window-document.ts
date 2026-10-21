/**
 * A window document: the popup page loaded first at a `/windows/*` route, as every dApp approval, the
 * fee question and the json and logger viewers are. Recorded once at boot, because a locked window
 * moves to `/popup/auth` and back (`useDappApprovalWindow`), so the current route can say otherwise.
 */

let windowDocument = false

/** Called once in `popup/index.ts`, before the router can rewrite the URL. */
export function captureWindowDocument(hash: string): void {
	const path = hash.replace(/^#/, "").split("?")[0]
	windowDocument = path.startsWith("/windows/")
}

export const isWindowDocument = (): boolean => windowDocument
