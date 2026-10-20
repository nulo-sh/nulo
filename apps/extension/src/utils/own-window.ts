/**
 * An own window: Firefox's toolbar panel closes when a passkey prompt or a file picker takes focus,
 * so a page that opens either (Full Backup export and restore, the contacts and account-file imports,
 * Restore again) reopens itself in a popup-sized window first. The document records once, at boot,
 * that it was opened as one; the guard, the lock screen and the import page rewrite the route later,
 * so nothing reads the current route.
 *
 * One window per flow: the window stores its own id in `chrome.storage.session`, since the panel that
 * opened it is gone by the time it could, and a later start from the panel focuses that window.
 */
import type { CreateWindowOptions } from "@nulo/wallet-core/ports"
import type { NavigationHookAfter } from "vue-router"
import { closesOnFocusLoss } from "@/utils/browser-surface"
import { centerOn } from "@/wallet/services/window-manager/placement"

/** The pages that may move to an own window, each its own flow. */
export const OWN_WINDOW_ROUTES = {
	export: "/popup/settings/security/export/full",
	import: "/popup/import",
	contacts: "/popup/settings/contacts",
	accountImport: "/popup/settings/accounts/import",
	restoreAgain: "/popup/restore-again",
} as const
const MARKER = "window"
const MARKER_VALUE = "own"
const WIDTH = 380
const HEIGHT = 660

type OwnFlow = keyof typeof OWN_WINDOW_ROUTES

let ownRoute: string | undefined
let ownFlow: OwnFlow | undefined
let registeredId: number | undefined
let registration: Promise<void> = Promise.resolve()
let opening: Promise<boolean> | undefined

const flowKey = (flow: OwnFlow) => `nulo:own-window:${flow}`

function flowOf(route: string): OwnFlow | undefined {
	const path = route.split("?")[0]
	return (Object.keys(OWN_WINDOW_ROUTES) as OwnFlow[]).find((flow) => OWN_WINDOW_ROUTES[flow] === path)
}

/** Called once in `popup/index.ts`, before the router exists: the document is an own window when its
 *  first URL is one of the own-window routes and carries `window=own`. */
export function captureOwnWindow(hash: string): void {
	const path = hash.replace(/^#/, "")
	const queryStart = path.indexOf("?")
	const route = queryStart < 0 ? path : path.slice(0, queryStart)
	const flow = flowOf(route)
	const params = new URLSearchParams(queryStart < 0 ? "" : path.slice(queryStart + 1))
	if (flow === undefined || params.get(MARKER) !== MARKER_VALUE) {
		void forgetThisWindow()
		return
	}
	params.delete(MARKER)
	const query = params.toString()
	ownRoute = query ? `${route}?${query}` : route
	ownFlow = flow
	registration = register(flow)
}

/** Only a popup-type window registers: a marked URL restored in a tab must never be what the panel
 *  focuses, since that would bring the person's browser window forward and close the panel. */
async function register(flow: OwnFlow): Promise<void> {
	try {
		const current = await chrome.windows.getCurrent()
		if (current.type !== "popup" || current.id === undefined) return
		await chrome.storage.session.set({ [flowKey(flow)]: current.id })
		registeredId = current.id
	} catch (error) {
		console.debug("own window registration failed", { error })
	}
}

/** An own window's URL loses its marker once it routes, so a reload boots a document that is no own
 *  window in a window a flow may still name; no flow may keep naming it. */
async function forgetThisWindow(): Promise<void> {
	try {
		const current = await chrome.windows.getCurrent()
		if (current.type !== "popup") return
		const keys = (Object.keys(OWN_WINDOW_ROUTES) as OwnFlow[]).map(flowKey)
		const stored = await chrome.storage.session.get(keys)
		const naming = keys.filter((key) => stored[key] === current.id)
		if (naming.length > 0) await chrome.storage.session.remove(naming)
	} catch (error) {
		console.debug("own window release failed", { error })
	}
}

/** The route this document was opened for (without the marker), or undefined. */
export function ownWindowRoute(): string | undefined {
	return ownRoute
}

/** The flow finished; from now on the document behaves like any popup page, and a later start opens
 *  a new window. Resolves once the registration is cleared; never rejects. */
export function releaseOwnWindow(): Promise<void> {
	const flow = ownFlow
	ownRoute = undefined
	ownFlow = undefined
	return flow === undefined ? Promise.resolve() : unregister(flow, registration)
}

/** Waits for the boot registration, so it cannot land after the release, and clears the key only
 *  while it still names this window. */
async function unregister(flow: OwnFlow, pending: Promise<void>): Promise<void> {
	await pending
	const id = registeredId
	registeredId = undefined
	if (id === undefined) return
	const key = flowKey(flow)
	try {
		const stored = await chrome.storage.session.get(key)
		if (stored[key] === id) await chrome.storage.session.remove(key)
	} catch (error) {
		console.debug("own window release failed", { error })
	}
}

/** The popup router's `afterEach`: an own window that lands anywhere but its flow's page or the lock
 *  screen, whose unlock returns to the flow, has left the flow. A cancelled or aborted navigation
 *  leaves the flow on screen, so only a completed one counts. */
export const followOwnRoute: NavigationHookAfter = (to, _from, failure) => {
	if (failure || ownFlow === undefined || to.path === OWN_WINDOW_ROUTES[ownFlow] || to.path === "/popup/auth") return
	void releaseOwnWindow()
}

/** Where a document goes after auth: a dApp window's saved page, else its own-window route, else Home. */
export function postAuthRoute(pageAwaitingAuth?: string): string {
	return pageAwaitingAuth || ownRoute || "/popup/general"
}

/** Reopens `route` in a popup-type window sized like the popup and centered on this browser window,
 *  or focuses the window its flow already has open, then closes this document. False, with the panel
 *  left open, when the window cannot be created. Repeated calls while one runs share its answer. */
export function moveToOwnWindow(route: string): Promise<boolean> {
	opening ??= openOwnWindow(route).finally(() => {
		opening = undefined
	})
	return opening
}

async function openOwnWindow(route: string): Promise<boolean> {
	const flow = flowOf(route)
	if (flow !== undefined && (await focusOpenWindow(flow))) {
		window.close()
		return true
	}
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

/** True when the flow's registered window is still open, now focused as the window manager focuses
 *  its windows. A refused focus still counts: the window exists, so a new one would be its twin. */
async function focusOpenWindow(flow: OwnFlow): Promise<boolean> {
	const key = flowKey(flow)
	let id: unknown
	try {
		id = (await chrome.storage.session.get(key))[key]
	} catch {
		return false
	}
	if (typeof id !== "number") return false
	const open = await chrome.windows.get(id).catch(() => undefined)
	if (open?.type !== "popup") {
		await chrome.storage.session.remove(key).catch(() => undefined)
		return false
	}
	await chrome.windows.update(id, { focused: true, drawAttention: true, state: "normal" }).catch((error: unknown) => {
		console.debug("own window focus refused", { error })
	})
	return true
}

/** For a step whose OS file picker or passkey prompt would close Firefox's toolbar panel. True when
 *  the panel moved `route` to its own window, and the page must do nothing more; false elsewhere, or
 *  when no window opened, and the step runs where it is. */
export async function leavePanelFor(route: string): Promise<boolean> {
	return closesOnFocusLoss() && (await moveToOwnWindow(route))
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
