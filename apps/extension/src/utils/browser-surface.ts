/** Firefox's own extension API; Chrome has none. */
export function isFirefox(): boolean {
	return typeof (chrome.runtime as { getBrowserInfo?: unknown }).getBrowserInfo === "function"
}

/**
 * Firefox closes its toolbar panel whenever another window takes focus: an OS passkey prompt, which
 * the close cancels (Mozilla bug 2026687), or a file picker, whose pick never reaches the page. A
 * step that opens either has to run in a window instead.
 */
export function closesOnFocusLoss(): boolean {
	return isFirefox() && isToolbarPopup()
}

/** The browser's toolbar popup: Chrome's action popup, or either Firefox popup kind (the toolbar
 *  button's and the unified-extensions panel's). A tab, the side panel, a window page or a
 *  `windows.create` popup window is not a `popup` view. */
export function isToolbarPopup(): boolean {
	return chrome.extension.getViews({ type: "popup" }).includes(window)
}
