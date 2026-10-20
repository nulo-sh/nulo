import type { Browser } from "puppeteer"
import { actionPopupContext } from "./firefox"
import { clickWithPointer, evaluateViaFrameScript } from "./firefox-frame-script"
import { pollUntil } from "../poll"

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

/** Which sidebar Firefox draws: the default one, or the revamped one with its launcher, which some
 *  profiles get on their own. Each lays the page out at its own width. */
export type SidebarKind = "default" | "revamped"

/**
 * Makes Firefox draw the sidebar `kind` names, and resolves once its rebuild is done. A launch may
 * come up with either, and a spec that does not choose would drive whichever it got.
 */
export async function setSidebarKind(browser: Browser, kind: SidebarKind): Promise<void> {
	const { session } = actionPopupContext(browser)
	const set = await session.chromeScript<string>(
		`
		const [revamped, done] = arguments;
		const controller = window.SidebarController;
		// The pref's observer rebuilds the sidebar in a continuation queued behind the controller's
		// initialisation, so the kind holds once that and one task more have run.
		Services.prefs.setBoolPref("sidebar.revamp", revamped);
		controller.promiseInitialized.then(() =>
			window.setTimeout(() => done(controller.sidebarRevampEnabled === revamped ? "set" : "the sidebar kind did not switch"), 0),
		);
		`,
		[kind === "revamped"],
	)
	if (set !== "set") throw new Error(`setSidebarKind: ${set}`)
}

/**
 * Opens the add-on's sidebar, as `sidebarAction.open()` does, in the sidebar `kind` names, and resolves
 * once the add-on's page is the sidebar's document.
 */
export async function openSidebar(browser: Browser, kind: SidebarKind): Promise<void> {
	await setSidebarKind(browser, kind)
	const { session, addonId } = actionPopupContext(browser)
	const opened = await session.chromeScript<string>(
		`
		const [addonId, done] = arguments;
		const sidebar = () => { ${LOCATE_SIDEBAR} };
		const { extension } = WebExtensionPolicy.getByID(addonId);
		const started = Date.now();
		const poll = () => {
			if (sidebar()?.browsingContext?.currentWindowGlobal) return done("open");
			if (Date.now() - started > 15000) return done("the sidebar never opened");
			window.setTimeout(poll, 100);
		};
		try {
			extension.apiManager.global.sidebarActionFor(extension).open(window);
		} catch (err) {
			return done("open failed: " + err);
		}
		poll();
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

/** Clicks `testid` in the open sidebar with a real pointer, which also gives the sidebar focus (`clickWithPointer`). */
export async function clickInSidebar(browser: Browser, testid: string): Promise<void> {
	const { session, addonId } = actionPopupContext(browser)
	try {
		await clickWithPointer(session, { addonId, locate: LOCATE_SIDEBAR, missing: "the sidebar is not open" }, testid)
	} catch (err) {
		throw new Error(`clickInSidebar: ${err instanceof Error ? err.message : String(err)}`)
	}
}

/** Whether this window's sidebar shows the add-on's page. */
export async function sidebarShows(browser: Browser): Promise<boolean> {
	const { session, addonId } = actionPopupContext(browser)
	return session.chromeScript<boolean>(
		`const [addonId, done] = arguments; done(!!(function () { ${LOCATE_SIDEBAR} })()?.browsingContext?.currentWindowGlobal);`,
		[addonId],
	)
}

/** Closes this window's sidebar, as its close button does, and resolves once it shows nothing. */
export async function closeSidebar(browser: Browser): Promise<void> {
	const { session } = actionPopupContext(browser)
	await session.chromeScript<null>(`const [done] = arguments; window.SidebarController.hide(); done(null);`)
	await pollUntil(
		() => sidebarShows(browser),
		(open) => !open,
		{ label: "closeSidebar: the sidebar closing", timeoutMs: 10_000, intervalMs: 100 },
	)
}
