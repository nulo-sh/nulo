import type { IConfig } from "@/wallet/config"
import { sidebarAction } from "@/utils/browser-surface"

/** Firefox's `action.setPopup`, which also takes `null`: the manifest's popup back. */
type SetPopup = (details: { popup: string | null }) => Promise<void>

/**
 * Makes the toolbar button open Firefox's sidebar while "Open as Side Panel" is on, as Chrome's
 * `openPanelOnActionClick` does for its side panel. With no popup set, a click fires
 * `action.onClicked`, whose listener holds the user input `sidebarAction.open` requires. Firefox
 * keeps a set popup only while it runs, so the stored setting is applied again each time the
 * background loads its config, which emits it. Chrome gets neither listener. Registered at module
 * scope: the click that wakes the background reaches only listeners its first run added.
 */
export function registerToolbarSidebar(config: Pick<IConfig, "onUpdate">): void {
	const sidebar = sidebarAction()
	if (!sidebar || chrome.sidePanel) return
	chrome.action.onClicked.addListener(() => {
		sidebar.open().catch(() => console.debug("[toolbar-sidebar] Firefox did not open the sidebar"))
	})
	config.onUpdate.add(({ key, value }) => {
		if (key !== "sidePanel") return
		;(chrome.action.setPopup as unknown as SetPopup)({ popup: value ? "" : null }).catch(() =>
			console.debug("[toolbar-sidebar] Firefox did not change the toolbar popup"),
		)
	})
}
