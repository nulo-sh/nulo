import type { Browser } from "puppeteer"
import { actionPopupContext, inPageRealm } from "./firefox"
import { evaluateViaFrameScript } from "./firefox-frame-script"

/**
 * The toolbar popup is a *panel*: not a tab, not a window, and no WebDriver or BiDi command reaches
 * its document — which is why the rest of the suite opens the popup document in a window, and why
 * a layout that only breaks inside a panel went unseen. These reach it the way Firefox's own tests
 * do: from the browser's privileged scope, and into the panel with a frame script.
 */

/**
 * Privileged source, run with `addonId`, that returns this add-on's panel browser while its panel is
 * open, in any browser window. Firefox first loads the popup into a hidden preload browser inside a
 * closed panel, which `hidePopup()` cannot close, so a preload never counts.
 */
const LOCATE_LIVE_PANEL = `
	const origin = "moz-extension://" + WebExtensionPolicy.getByID(addonId).mozExtensionHostname + "/";
	for (const candidate of Services.wm.getEnumerator("navigator:browser")) {
		for (const host of candidate.document.querySelectorAll(".webextension-popup-browser:not(.webextension-preload-browser)")) {
			if (host.closest("panel")?.state === "open" && host.currentURI?.spec.startsWith(origin)) return host;
		}
	}
	return null;`

/** Opens the panel as a toolbar click would, and resolves once its document sits in the open panel. */
export async function openActionPopup(browser: Browser): Promise<void> {
	const { session, addonId } = actionPopupContext(browser)
	const opened = await session.chromeScript<string>(
		`
		const [addonId, done] = arguments;
		const livePanel = () => { ${LOCATE_LIVE_PANEL} };
		// A popup-type window has no toolbar to anchor the panel on.
		let win = Services.wm.getMostRecentWindow("navigator:browser");
		if (!win.toolbar.visible) for (const candidate of Services.wm.getEnumerator("navigator:browser")) if (candidate.toolbar.visible) win = candidate;
		const { extension } = WebExtensionPolicy.getByID(addonId);
		extension.apiManager.global.browserActionFor(extension).openPopup(win, true);
		const started = Date.now();
		(function poll() {
			if (livePanel()) return done("open");
			if (Date.now() - started > 15000) return done("the action popup never opened");
			win.setTimeout(poll, 100);
		})();
		`,
		[addonId],
	)
	if (opened !== "open") throw new Error(`openActionPopup: ${opened}`)
}

/** Evaluates `body` (a function body; `content` is the popup's window) inside the open panel. */
export async function evaluateInActionPopup<T>(browser: Browser, body: string): Promise<T> {
	const { session, addonId } = actionPopupContext(browser)
	try {
		return await evaluateViaFrameScript<T>(
			session,
			{ addonId, locate: LOCATE_LIVE_PANEL, missing: "the action popup is not open" },
			body,
		)
	} catch (err) {
		throw new Error(`evaluateInActionPopup: ${err instanceof Error ? err.message : String(err)}`)
	}
}

/** Closes the panel, as a click outside it would. */
export async function closeActionPopup(browser: Browser): Promise<void> {
	const { session, addonId } = actionPopupContext(browser)
	const closed = await session.chromeScript<string>(
		`
		const [addonId, done] = arguments;
		const host = (function () { ${LOCATE_LIVE_PANEL} })();
		if (!host) return done("the action popup is not open");
		host.closest("panel").hidePopup();
		done("closed");
		`,
		[addonId],
	)
	if (closed !== "closed") throw new Error(`closeActionPopup: ${closed}`)
}

/** What a panel armed by `armPanelDeath` saw. */
export interface PanelDeathRecord {
	/** `get` or `create`, for each WebAuthn call the panel's page made, in order. */
	calls: string[]
	/** When a window opened after arming became the active one, which is when the panel was hidden. */
	windowActiveAt?: number
	/** Whether the panel was still open at that moment, rather than already closed by its page. */
	hidPanel: boolean
	/** How often focus left that window and was put back. */
	refocused: number
}

export interface PanelDeath {
	record(): Promise<PanelDeathRecord>
	/** Stops the observer and the focus guard; the record is gone with it. */
	disarm(): Promise<void>
}

/** Where the armed state is kept between privileged scripts: the browser window they all run in. */
const SLOT = "__nuloE2ePanelDeath"
const CALL_CHANNEL = "nulo-e2e:panel-webauthn"
const CALL_EVENT = "nulo-e2e:panel-webauthn"

/**
 * In the page's own realm, where the wallet's code sees it: each WebAuthn call reports itself through
 * a DOM event that the frame script, listening for untrusted events, turns into a synchronous
 * message, so the record reaches the parent process before the call goes any further.
 */
const RECORD_WEBAUTHN = `
	content.addEventListener(${JSON.stringify(CALL_EVENT)}, (event) => sendSyncMessage(${JSON.stringify(CALL_CHANNEL)}, { kind: String(event.detail) }), true, true);
	${inPageRealm(`
		const credentials = navigator.credentials;
		for (const kind of ["get", "create"]) {
			const call = credentials[kind];
			credentials[kind] = function (options) {
				window.dispatchEvent(new CustomEvent(${JSON.stringify(CALL_EVENT)}, { detail: kind }));
				return call.call(credentials, options);
			};
		}
		return "recording";`)}`

/**
 * Makes the open panel die as it does on a Mac, where it closes as soon as anything else takes focus.
 * A WebAuthn call in the panel is recorded and then closes it, as the OS prompt would. A window that
 * opens after arming hides the panel once it is the active window, as the focus it takes would, and
 * is kept focused until it closes: nothing in the panel may survive into the step it hands over.
 *
 * Arm it after the test has opened its own windows, since it reacts to any window, and move no focus
 * until the outcome is read: read it passively, through BiDi or from a page opened beforehand.
 */
export async function armPanelDeath(browser: Browser): Promise<PanelDeath> {
	const { session, addonId } = actionPopupContext(browser)
	const armed = await session.chromeScript<string>(
		`
		const [slot, channel, addonId, done] = arguments;
		if (window[slot]) return done("a panel death is already armed in this browser");
		const host = (function () { ${LOCATE_LIVE_PANEL} })();
		if (!host) return done("the action popup is not open");
		const panel = host.closest("panel");
		const record = { calls: [], windowActiveAt: undefined, hidPanel: false, refocused: 0 };
		const state = { record, live: true };
		const hide = () => {
			if (panel.state !== "open") return false;
			panel.hidePopup();
			return true;
		};
		const onCall = (message) => {
			record.calls.push(String(message.data.kind));
			// After the reply: the page is blocked on this synchronous message until it returns.
			window.setTimeout(hide, 0);
		};
		const guard = (opened) => {
			if (!state.live || opened.closed) return;
			if (Services.focus.activeWindow !== opened) {
				record.refocused++;
				opened.focus();
			}
			window.setTimeout(() => guard(opened), 100);
		};
		const observer = {
			observe(opened, topic) {
				if (topic !== "domwindowopened" || record.windowActiveAt !== undefined) return;
				const started = Date.now();
				(function settle() {
					if (!state.live || opened.closed || Date.now() - started > 10000) return;
					if (Services.focus.activeWindow !== opened) return window.setTimeout(settle, 20);
					record.windowActiveAt = Date.now();
					record.hidPanel = hide();
					guard(opened);
				})();
			},
		};
		host.messageManager.addMessageListener(channel, onCall);
		Services.ww.registerNotification(observer);
		window[slot] = {
			state,
			stop() {
				state.live = false;
				Services.ww.unregisterNotification(observer);
				try { host.messageManager?.removeMessageListener(channel, onCall); } catch {}
			},
		};
		done("armed");
		`,
		[SLOT, CALL_CHANNEL, addonId],
	)
	if (armed !== "armed") throw new Error(`armPanelDeath: ${armed}`)
	const disarm = async () => {
		await session.chromeScript<null>(`const [slot, done] = arguments; window[slot]?.stop(); delete window[slot]; done(null);`, [SLOT])
	}
	try {
		const recording = await evaluateInActionPopup<string>(browser, RECORD_WEBAUTHN)
		if (recording !== "recording") throw new Error(`the recorder answered ${JSON.stringify(recording)}`)
	} catch (err) {
		await disarm()
		throw new Error(`armPanelDeath: ${err instanceof Error ? err.message : String(err)}`)
	}
	return {
		record: async () => {
			const record = await session.chromeScript<PanelDeathRecord | null>(
				`const [slot, done] = arguments; done(window[slot]?.state.record ?? null);`,
				[SLOT],
			)
			if (!record) throw new Error("armPanelDeath: read after disarm")
			return record
		},
		disarm,
	}
}
