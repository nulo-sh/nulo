import type { IConfig } from "@/wallet/config"
import { pointToolbarAtSidebar, sidebarAction } from "@/utils/browser-surface"

/**
 * Makes the toolbar button toggle Firefox's sidebar while "Open as Side Panel" is on, as Chrome's
 * `openPanelOnActionClick` toggles its side panel. With no popup set, a click fires
 * `action.onClicked`, whose listener holds the user input `sidebarAction.toggle` requires. The
 * stored setting is applied again each time the background loads its config, which emits it. Chrome
 * gets neither listener. Registered at module scope: the click that wakes the background reaches
 * only listeners its first run added.
 */
export function registerToolbarSidebar(config: Pick<IConfig, "onUpdate">): void {
	const sidebar = sidebarAction()
	if (!sidebar || chrome.sidePanel) return
	chrome.action.onClicked.addListener(() => {
		sidebar.toggle().catch(() => console.debug("[toolbar-sidebar] Firefox did not toggle the sidebar"))
	})
	config.onUpdate.add(({ key, value }) => {
		if (key !== "sidePanel") return
		pointToolbarAtSidebar(Boolean(value)).catch(() => console.debug("[toolbar-sidebar] Firefox did not change the toolbar popup"))
	})
}
