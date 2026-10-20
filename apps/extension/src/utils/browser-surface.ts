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

type SidebarAction = { open(): Promise<void>; close(): Promise<void>; toggle(): Promise<void> }

/** Firefox's `action.setPopup`, which also takes `null`: the manifest's popup back. */
type SetPopup = (details: { popup: string | null }) => Promise<void>

/**
 * Points Firefox's toolbar button at its sidebar, or back at the manifest's popup; Chrome keeps its
 * popup. With no popup set, a click reaches `action.onClicked`. Firefox keeps the choice only while
 * it runs, so every start of the background and of a shell page applies the stored setting again.
 */
export async function pointToolbarAtSidebar(on: boolean): Promise<void> {
	if (!sidebarAction() || chrome.sidePanel) return
	await (chrome.action.setPopup as unknown as SetPopup)({ popup: on ? "" : null })
}

/** This document is Firefox's sidebar, which `window.close()` leaves open. Chrome's `getViews`
 *  refuses the `sidebar` type, so it is asked only where a sidebar exists. */
export function isFirefoxSidebar(): boolean {
	const sidebar = "sidebar" as unknown as chrome.extension.ViewType
	return sidebarAction() !== undefined && chrome.extension.getViews({ type: sidebar }).includes(window)
}

/** A surface that keeps the wallet beside the page: Chrome's side panel or Firefox's sidebar. */
export function hasSidePanelSurface(): boolean {
	return Boolean(chrome.sidePanel) || sidebarAction() !== undefined
}
