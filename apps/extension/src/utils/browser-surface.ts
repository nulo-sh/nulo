/** Firefox's own extension API; Chrome has none. */
export function isFirefox(): boolean {
	return typeof (chrome.runtime as { getBrowserInfo?: unknown }).getBrowserInfo === "function"
}

/**
 * Firefox closes its toolbar panel when an OS passkey prompt takes focus, which cancels the request
 * (Mozilla bug 2026687): a passkey step started there has to run in a window instead.
 */
export function passkeyNeedsOwnWindow(): boolean {
	return isFirefox() && isToolbarPanel()
}

/** Both Firefox popup kinds (the toolbar button and the unified-extensions panel) are `popup`
 *  views; a tab, a window page or a `windows.create` popup window is not. */
function isToolbarPanel(): boolean {
	return chrome.extension.getViews({ type: "popup" }).includes(window)
}
