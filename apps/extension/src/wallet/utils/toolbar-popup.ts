/**
 * The toolbar popup, opened by the background: after onboarding's "Open wallet", and after a step
 * that Firefox's toolbar panel handed to the passkey window, whose prompt closed the panel.
 */
import { isSenderAtUrl } from "@nulo/extension-messaging/background"
import { OPEN_TOOLBAR_POPUP, type OpenToolbarPopupAnswer, onboardingDocumentUrl } from "./onboarding-tab"

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
