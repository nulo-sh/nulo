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
