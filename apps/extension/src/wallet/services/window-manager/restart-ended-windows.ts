/**
 * The windows a background restart leaves behind. Approval handles, interaction records, check
 * holds and transport sessions live only in the background's memory, so a restart ends the request
 * each request window shows, and all a person can meet there is an error. The lock's own restart
 * also ends every wallet page, and Chrome leaves each popup window it ends as a New Tab window.
 */
import { LogLevel, type ILogger } from "@/wallet/logger"
import type { ExtensionContextInfo, RuntimePort, WindowPort } from "@nulo/wallet-core/ports"

export const RESTART_ENDED_ROUTES: ReadonlySet<string> = new Set([
	"discover",
	"capabilities",
	"verify",
	"execute",
	"fee",
	"network-unavailable",
])

export const POPUP_PAGE = "src/popup/index.html"

const LOG_SOURCE = "wallet"
const WINDOWS_ROUTE = /^#\/windows\/([^/?]+)(?:\?|$)/

/** Whether `url` is the popup page on one of `RESTART_ENDED_ROUTES`. Scheme, host and path are
 *  compared one by one: `origin` reads `"null"` for an extension scheme, so it cannot tell two
 *  extensions apart. */
export function isRestartEndedUrl(url: string, popupPageUrl: string): boolean {
	const page = parse(url)
	const own = parse(popupPageUrl)
	if (!page || !own || !sameExtension(page, own) || page.pathname !== own.pathname) return false
	const route = WINDOWS_ROUTE.exec(page.hash)?.[1]
	return route !== undefined && RESTART_ENDED_ROUTES.has(route)
}

function isOwnExtensionUrl(url: string | undefined, popupPageUrl: string): boolean {
	const page = url === undefined ? undefined : parse(url)
	const own = parse(popupPageUrl)
	return page !== undefined && own !== undefined && sameExtension(page, own)
}

function parse(url: string): URL | undefined {
	try {
		return new URL(url)
	} catch {
		return undefined
	}
}

function sameExtension(page: URL, own: URL): boolean {
	return page.protocol === own.protocol && page.host === own.host
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

/** The background's window port, which also knows every popup window showing a wallet page. */
export interface TrackedWindowPort extends WindowPort {
	/** Fires `remove` for every window this background opened and every popup window a wallet page
	 *  reported from, and returns at once. */
	closeOwnWindows(): void
}

/**
 * Every method delegates to `windows` itself, so the adapter's own state holds and its results and
 * failures pass through unchanged. A page opens its windows itself (the logs viewer, request JSON,
 * an export or import in its own window), so they are learned from the ports their pages open: the
 * browser reports each port's tab and window, and only a popup-type window is kept, since closing a
 * person's own window would take their other tabs with it.
 */
export function trackOpenWindows(windows: WindowPort, runtime: Pick<RuntimePort, "onConnect">, popupPageUrl: string): TrackedWindowPort {
	const own = new Set<number>()
	const asked = new Set<number>()
	windows.onRemoved((windowId) => {
		own.delete(windowId)
		asked.delete(windowId)
	})
	runtime.onConnect(({ sender }) => {
		const windowId = sender?.tab?.windowId
		if (windowId === undefined || asked.has(windowId) || !isOwnExtensionUrl(sender?.url, popupPageUrl)) return
		asked.add(windowId)
		void windows.isPopup(windowId).then((popup) => {
			if (popup && asked.has(windowId)) own.add(windowId)
		})
	})
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
			if (created.id !== undefined) own.add(created.id)
			return created
		},
		onRemoved: (listener) => windows.onRemoved(listener),
		remove: (windowId) => windows.remove(windowId),
		closeTab: (tabId) => windows.closeTab(tabId),
		isPopup: (windowId) => windows.isPopup(windowId),
		update: (windowId, options) => windows.update(windowId, options),
		getLastFocused: () => windows.getLastFocused(),
		closeOwnWindows: () => {
			for (const windowId of own) removeQuietly(windowId)
		},
	}
}
