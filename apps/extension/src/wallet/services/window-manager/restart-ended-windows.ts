/**
 * The request windows a background restart leaves behind. Approval handles, interaction records,
 * check holds and transport sessions live only in the background's memory, so a restart ends the
 * request each of these windows shows, and all a person can meet there is an error.
 */
import { LogLevel, type ILogger } from "@/wallet/logger"
import type { ExtensionContextInfo, RuntimePort, WindowPort } from "@nulo/wallet-core/ports"

export const RESTART_ENDED_ROUTES: ReadonlySet<string> = new Set(["discover", "capabilities", "verify"])

export const POPUP_PAGE = "src/popup/index.html"

const LOG_SOURCE = "wallet"
const WINDOWS_ROUTE = /^#\/windows\/([^/?]+)(?:\?|$)/

/** Whether `url` is the popup page on one of `RESTART_ENDED_ROUTES`. Scheme, host and path are
 *  compared one by one: `origin` reads `"null"` for an extension scheme, so it cannot tell two
 *  extensions apart. */
export function isRestartEndedUrl(url: string, popupPageUrl: string): boolean {
	let page: URL
	let own: URL
	try {
		page = new URL(url)
		own = new URL(popupPageUrl)
	} catch {
		return false
	}
	if (page.protocol !== own.protocol || page.host !== own.host || page.pathname !== own.pathname) return false
	const route = WINDOWS_ROUTE.exec(page.hash)?.[1]
	return route !== undefined && RESTART_ENDED_ROUTES.has(route)
}

/**
 * Closes the tab of every request window a predecessor background left. Run before services start,
 * so no window this background opened can exist yet and no page can reach a service first. A tab,
 * never its window: a request URL opened in an ordinary window must not take the window's other
 * tabs with it. Never throws; logs a count, never a URL (it carries request ids and the check's
 * hash) nor a browser error (which can quote the URL).
 */
export async function closeRestartEndedTabs(runtime: RuntimePort, windows: Pick<WindowPort, "closeTab">, logger: ILogger): Promise<void> {
	let contexts: ExtensionContextInfo[]
	try {
		contexts = (await runtime.getContexts?.({ contextTypes: ["TAB"] })) ?? []
	} catch {
		logger.log(LOG_SOURCE, LogLevel.Debug, "Request windows left by a restart could not be listed")
		return
	}
	if (contexts.length === 0) return
	const popupPageUrl = runtime.getURL(POPUP_PAGE)
	const tabs = new Set<number>()
	for (const { tabId, documentUrl } of contexts) {
		if (tabId !== undefined && documentUrl !== undefined && isRestartEndedUrl(documentUrl, popupPageUrl)) tabs.add(tabId)
	}
	if (tabs.size === 0) return
	const results = await Promise.allSettled([...tabs].map((tabId) => windows.closeTab(tabId)))
	const failed = results.filter((result) => result.status === "rejected").length
	logger.log(LOG_SOURCE, failed ? LogLevel.Warn : LogLevel.Info, "Closed the request windows a restart ended", {
		closed: tabs.size - failed,
		failed,
	})
}

/** The background's window port, remembering each window it opened with the URL it opened or last
 *  navigated it to: what the window is for, whatever its page's router shows by now. */
export interface TrackedWindowPort extends WindowPort {
	/** Fires `remove` for every remembered window on a restart-ended route and returns at once. */
	closeRestartEnded(): void
}

/** Every method delegates to `windows` itself, so the adapter's own state holds and its results
 *  and failures pass through unchanged. */
export function trackOpenWindows(windows: WindowPort, popupPageUrl: string): TrackedWindowPort {
	const opened = new Map<number, string>()
	windows.onRemoved((windowId) => opened.delete(windowId))
	const removeQuietly = (windowId: number): void => {
		try {
			windows.remove(windowId).catch(() => undefined)
		} catch {
			// A removal that throws at once ends only itself; the browser's error can quote the URL.
		}
	}
	return {
		create: async (options) => {
			const created = await windows.create(options)
			if (created.id !== undefined) opened.set(created.id, options.url)
			return created
		},
		onRemoved: (listener) => windows.onRemoved(listener),
		remove: (windowId) => windows.remove(windowId),
		closeTab: (tabId) => windows.closeTab(tabId),
		update: (windowId, options) => windows.update(windowId, options),
		navigate: async (windowId, url) => {
			await windows.navigate(windowId, url)
			// A window closed while its navigation was in flight stays forgotten.
			if (opened.has(windowId)) opened.set(windowId, url)
		},
		getLastFocused: () => windows.getLastFocused(),
		closeRestartEnded: () => {
			for (const [windowId, url] of opened) if (isRestartEndedUrl(url, popupPageUrl)) removeQuietly(windowId)
		},
	}
}
