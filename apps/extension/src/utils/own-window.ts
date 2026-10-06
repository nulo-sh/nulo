/**
 * An own window: Firefox's toolbar panel closes when a passkey prompt takes focus, so the two pages
 * that run their passkey step in the page (Full Backup export and restore) reopen themselves in a
 * popup-sized window first. The document records once, at boot, that it was opened as one; the guard,
 * the lock screen and the import page rewrite the route later, so nothing reads the current route.
 */
import type { CreateWindowOptions } from "@nulo/wallet-core/ports"
import { centerOn } from "@/wallet/services/window-manager/placement"

/** The two pages that may move to an own window. */
export const OWN_WINDOW_ROUTES = { export: "/popup/settings/security/export/full", import: "/popup/import" } as const
const MARKER = "window"
const MARKER_VALUE = "own"
const WIDTH = 380
const HEIGHT = 660

let ownRoute: string | undefined

/** Called once in `popup/index.ts`, before the router exists: the document is an own window when its
 *  first URL is one of the two own-window routes and carries `window=own`. */
export function captureOwnWindow(hash: string): void {
	const path = hash.replace(/^#/, "")
	const queryStart = path.indexOf("?")
	if (queryStart < 0) return
	const route = path.slice(0, queryStart)
	const params = new URLSearchParams(path.slice(queryStart + 1))
	if (!(Object.values(OWN_WINDOW_ROUTES) as string[]).includes(route) || params.get(MARKER) !== MARKER_VALUE) return
	params.delete(MARKER)
	const query = params.toString()
	ownRoute = query ? `${route}?${query}` : route
}

/** The route this document was opened for (without the marker), or undefined. */
export function ownWindowRoute(): string | undefined {
	return ownRoute
}

/** The flow finished; from now on the document behaves like any popup page. */
export function releaseOwnWindow(): void {
	ownRoute = undefined
}

/** Where a document goes after auth: a dApp window's saved page, else its own-window route, else Home. */
export function postAuthRoute(pageAwaitingAuth?: string): string {
	return pageAwaitingAuth || ownRoute || "/popup/general"
}

/** Reopens `route` in a popup-type window sized like the popup and centered on this browser window,
 *  then closes this document. False, with the panel left open, when the window cannot be created. */
export async function moveToOwnWindow(route: string): Promise<boolean> {
	const url = chrome.runtime.getURL(`src/popup/index.html#${route}${route.includes("?") ? "&" : "?"}${MARKER}=${MARKER_VALUE}`)
	const anchor = await chrome.windows.getCurrent().catch(() => undefined)
	const sized: CreateWindowOptions = { type: "popup", url, width: WIDTH, height: HEIGHT }
	const position = centerOn(anchor, WIDTH, HEIGHT)
	try {
		await chrome.windows.create({ ...sized, ...position })
	} catch {
		// A browser can refuse a position (a display that went away); the size alone still opens.
		if (position.left === undefined && position.top === undefined) return false
		try {
			await chrome.windows.create(sized)
		} catch {
			return false
		}
	}
	window.close()
	return true
}

/** Closes this document's window when it is an own window hosted in a popup-type window: the same
 *  URL in a tab or in the panel keeps ordinary back. */
export async function closeOwnWindow(): Promise<boolean> {
	if (ownRoute === undefined) return false
	const current = await chrome.windows.getCurrent().catch(() => undefined)
	if (current?.type !== "popup") return false
	window.close()
	return true
}
