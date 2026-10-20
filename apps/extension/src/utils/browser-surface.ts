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

/** Firefox's sidebar (the manifest's `sidebar_action`), which opens or closes only inside a user
 *  input; Chrome has none. Read off `globalThis`: the build would import the WebExtension polyfill
 *  for a bare `browser`, which the wallet never loads. */
export function sidebarAction(): SidebarAction | undefined {
	return (globalThis as { browser?: { sidebarAction?: SidebarAction } }).browser?.sidebarAction
}

type SidebarAction = { open(): Promise<void>; close(): Promise<void> }

/** This document is Firefox's sidebar, which `window.close()` leaves open. Chrome's `getViews`
 *  refuses the `sidebar` type, so it is asked only where a sidebar exists. */
export function isFirefoxSidebar(): boolean {
	const sidebar = { type: "sidebar" } as unknown as chrome.extension.FetchProperties
	return sidebarAction() !== undefined && chrome.extension.getViews(sidebar).includes(window)
}

/** A surface that keeps the wallet beside the page: Chrome's side panel or Firefox's sidebar. */
export function hasSidePanelSurface(): boolean {
	return Boolean(chrome.sidePanel) || sidebarAction() !== undefined
}
