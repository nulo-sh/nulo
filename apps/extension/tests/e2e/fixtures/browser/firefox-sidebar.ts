import type { Browser } from "puppeteer"
import { actionPopupContext } from "./firefox"
import { evaluateViaFrameScript } from "./firefox-frame-script"

/**
 * Firefox's sidebar (`sidebar_action`) holds its document in a content browser that belongs to no
 * tab, so it has no BiDi navigable and no classic frame to switch into. It is opened and read from
 * Firefox's privileged scope, and clicked with chrome-context WebDriver actions, all in the browser
 * window `chromeScript` runs in.
 *
 * Every privileged call first switches the session's window, and that switch focuses the selected
 * tab, which takes focus from the sidebar. So an input and the step it starts go in one call, and an
 * outcome reached while the sidebar must keep focus (a passkey ceremony) is read from a page opened
 * beforehand, over BiDi.
 */

/**
 * Privileged source that returns this add-on's sidebar browser in the window `chromeScript` runs in,
 * while it is open there. Another window's sidebar never counts: a click lands in this window only.
 */
const LOCATE_SIDEBAR = `
	const controller = window.SidebarController;
	if (!controller?.isOpen) return null;
	const host = controller.browser?.contentDocument?.getElementById("webext-panels-browser");
	const origin = "moz-extension://" + WebExtensionPolicy.getByID(addonId).mozExtensionHostname + "/";
	return host?.currentURI?.spec.startsWith(origin) ? host : null;`

/** Opens the add-on's sidebar, as `sidebarAction.open()` does, and resolves once its document is loaded. */
export async function openSidebar(browser: Browser): Promise<void> {
	const { session, addonId } = actionPopupContext(browser)
	const opened = await session.chromeScript<string>(
		`
		const [addonId, done] = arguments;
		const sidebar = () => { ${LOCATE_SIDEBAR} };
		const { extension } = WebExtensionPolicy.getByID(addonId);
		extension.apiManager.global.sidebarActionFor(extension).open(window);
		const started = Date.now();
		(function poll() {
			if (sidebar()?.browsingContext?.currentWindowGlobal) return done("open");
			if (Date.now() - started > 15000) return done("the sidebar never opened");
			window.setTimeout(poll, 100);
		})();
		`,
		[addonId],
	)
	if (opened !== "open") throw new Error(`openSidebar: ${opened}`)
}

/** Evaluates `body` (a function body; `content` is the sidebar's window) inside the open sidebar. */
export async function evaluateInSidebar<T>(browser: Browser, body: string): Promise<T> {
	const { session, addonId } = actionPopupContext(browser)
	try {
		return await evaluateViaFrameScript<T>(session, { addonId, locate: LOCATE_SIDEBAR, missing: "the sidebar is not open" }, body)
	} catch (err) {
		throw new Error(`evaluateInSidebar: ${err instanceof Error ? err.message : String(err)}`)
	}
}

/**
 * Clicks the centre of the element with `testid` with a real pointer, which also gives the sidebar
 * focus. An element outside the sidebar's view is refused: no person could click it there.
 */
export async function clickInSidebar(browser: Browser, testid: string): Promise<void> {
	const { session } = actionPopupContext(browser)
	const target = await evaluateInSidebar<{ x: number; y: number; inView: boolean } | null>(
		browser,
		`const el = content.document.querySelector(${JSON.stringify(`[data-testid="${testid}"]`)});
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		return { x: content.mozInnerScreenX + x, y: content.mozInnerScreenY + y, inView: x >= 0 && y >= 0 && x < content.innerWidth && y < content.innerHeight };`,
	)
	if (!target) throw new Error(`clickInSidebar: no ${testid} in the sidebar`)
	if (!target.inView) throw new Error(`clickInSidebar: ${testid} is outside the sidebar's view`)
	const origin = await session.chromeScript<{ x: number; y: number }>(
		`const [done] = arguments; done({ x: window.mozInnerScreenX, y: window.mozInnerScreenY });`,
	)
	await session.chromeActions([
		{
			type: "pointer",
			id: "mouse",
			parameters: { pointerType: "mouse" },
			actions: [
				{ type: "pointerMove", x: Math.round(target.x - origin.x), y: Math.round(target.y - origin.y), origin: "viewport" },
				{ type: "pointerDown", button: 0 },
				{ type: "pointerUp", button: 0 },
			],
		},
	])
}
