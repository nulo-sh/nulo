/**
 * The toolbar popup, opened by the background: after onboarding's "Open wallet", after a step that
 * Firefox's toolbar panel handed to the passkey window, whose prompt closed the panel, and after a
 * file pick the panel handed to a window of its own.
 */
import { isSenderAtUrl } from "@nulo/extension-messaging/background"
import { POPUP_PAGE } from "@/wallet/services/window-manager/restart-ended-windows"
import { OPEN_TOOLBAR_POPUP, type OpenToolbarPopupAnswer, onboardingDocumentUrl, RETURN_TO_PANEL } from "./onboarding-tab"

/** How long the return to the wallet waits for its browser window to have focus again. */
export const POPUP_RETURN_FOCUS_MS = 3_000

/** The parts of `chrome.windows` the return to the wallet reads. @types/chrome mistypes
 *  `onFocusChanged.removeListener`; the runtime API takes the listener alone. */
export interface FocusWindows {
	getLastFocused(): Promise<chrome.windows.Window>
	get(windowId: number): Promise<chrome.windows.Window>
	onFocusChanged: {
		addListener(listener: (windowId: number) => void): void
		removeListener(listener: (windowId: number) => void): void
	}
}

/** The parts of `chrome.windows` the return from a hand-off window reads. */
export interface PanelReturnWindows extends FocusWindows {
	remove(windowId: number): Promise<void>
}

/**
 * Opens the popup on `windowId`. A browser can refuse (Firefox does for a window without focus),
 * and the person can still click the icon, so a refusal is not an error.
 */
export async function openToolbarPopup(windowId: number): Promise<void> {
	try {
		await chrome.action.openPopup({ windowId })
	} catch {
		console.debug("[toolbar-popup] the browser did not open the popup")
	}
}

/**
 * Closes the onboarding tab, then opens the popup in its window. A tab that is its window's last
 * stays: closing it would close the window, and the popup with it.
 */
export async function closeTabThenOpenPopup(tab: { id: number; windowId: number }): Promise<OpenToolbarPopupAnswer> {
	let ok = true
	try {
		if ((await chrome.tabs.query({ windowId: tab.windowId })).length > 1) await chrome.tabs.remove(tab.id)
	} catch {
		ok = false
	}
	await openToolbarPopup(tab.windowId)
	return { ok }
}

/**
 * Answers `OPEN_TOOLBAR_POPUP`. Registered synchronously at module scope: a message that wakes the
 * background reaches only the listeners its first run added. Only the onboarding document in a tab
 * may ask, and the tab and window come from the sender, never from the message.
 */
export function registerToolbarPopupMessage(): void {
	chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
		if ((message as { type?: unknown } | null)?.type !== OPEN_TOOLBAR_POPUP) return false
		const tab = sender.tab
		if (!isSenderAtUrl(sender, onboardingDocumentUrl()) || typeof tab?.id !== "number" || typeof tab.windowId !== "number") {
			return false
		}
		void closeTabThenOpenPopup({ id: tab.id, windowId: tab.windowId }).then(sendResponse)
		return true
	})
}

/**
 * Answers `RETURN_TO_PANEL`, registered at module scope like `OPEN_TOOLBAR_POPUP`. Only the popup
 * document in a popup-type window may ask. The window removed is always the sender's, never one the
 * message names; the opener only says where the panel opens, and only a normal window does.
 */
export function registerPanelReturnMessage(windows = chrome.windows as unknown as PanelReturnWindows): void {
	chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
		if ((message as { type?: unknown } | null)?.type !== RETURN_TO_PANEL) return false
		const windowId = sender.tab?.windowId
		if (!isSenderAtUrl(sender, chrome.runtime.getURL(POPUP_PAGE)) || typeof windowId !== "number") return false
		void returnFromWindow(windows, windowId, (message as { opener?: unknown }).opener, sendResponse)
		return true
	})
}

/** Answers before removing the window, whose own close follows the answer: a removal that fails
 *  because the window is already gone still reopens the panel. */
async function returnFromWindow(
	windows: PanelReturnWindows,
	windowId: number,
	opener: unknown,
	answer: (value: OpenToolbarPopupAnswer) => void,
): Promise<void> {
	const sending = await windows.get(windowId).catch(() => undefined)
	if (sending?.type !== "popup") {
		answer({ ok: false })
		return
	}
	answer({ ok: true })
	const target = typeof opener === "number" ? await windows.get(opener).catch(() => undefined) : undefined
	await windows.remove(windowId).catch(() => undefined)
	if (target?.type !== "normal" || typeof opener !== "number" || target.id !== opener) return
	if (await focusReturns(windows, opener)) await openToolbarPopup(opener)
}

/**
 * Records the browser window in focus as a step leaves Firefox's toolbar panel. The returned
 * function, called once the step succeeded, opens the popup there if that window has focus within
 * `POPUP_RETURN_FOCUS_MS`, which the passkey window gives back as it closes. Otherwise nothing opens.
 */
export function armPopupReturn(windows = chrome.windows as unknown as FocusWindows): () => Promise<void> {
	const target = windows.getLastFocused().then(
		(win) => (win.type === "normal" ? win.id : undefined),
		() => undefined,
	)
	return async () => {
		const windowId = await target
		if (windowId !== undefined && (await focusReturns(windows, windowId))) await openToolbarPopup(windowId)
	}
}

function focusReturns(windows: FocusWindows, windowId: number): Promise<boolean> {
	return new Promise((resolve) => {
		const settle = (focused: boolean) => {
			clearTimeout(timer)
			windows.onFocusChanged.removeListener(onFocus)
			resolve(focused)
		}
		const onFocus = (focusedId: number) => {
			if (focusedId === windowId) settle(true)
		}
		const timer = setTimeout(() => settle(false), POPUP_RETURN_FOCUS_MS)
		windows.onFocusChanged.addListener(onFocus)
		windows.get(windowId).then(
			(win) => {
				if (win.focused) settle(true)
			},
			() => settle(false),
		)
	})
}
