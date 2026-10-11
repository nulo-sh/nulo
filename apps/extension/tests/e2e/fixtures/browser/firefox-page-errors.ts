import { readFileSync } from "node:fs"
import path from "node:path"
import type { WebDriverSession } from "./webdriver-classic"

/**
 * Firefox's WebDriver BiDi sends no `log.entryAdded` for a frame whose own principal is an add-on's
 * (Bug 1755014), so Puppeteer never fires `pageerror` or `console` for the wallet's pages. This
 * supplies those events. A listener in every content process sends each error-level message of
 * the add-on's own frames, tagged with its top-level browsing context, to the parent; a relay there
 * emits it on the BiDi session geckodriver opened, the socket Puppeteer reads, as the entry Firefox
 * builds for a web page. Both are armed before the add-on is installed, and live as long as the
 * Firefox the launch owns.
 *
 * The relay calls two Firefox internals, `_onMessageHandlerProtocolEvent` on the BiDi session and
 * `NavigableManager.getIdForBrowsingContext`. Arming fails the launch when either is gone, and the
 * close check fails it when the relay faulted or a process hosting the add-on's pages ran without
 * the listener.
 */

const CHANNEL = "nulo-e2e:page-errors"
/** The relay answers a notification on this topic with its state, in the subject. */
const STATE_TOPIC = "nulo-e2e:page-errors:state"
/** The remote type of the process Firefox runs an add-on's pages in. */
const EXTENSION_PROCESS = "extension"
const FAULTS_KEPT = 20

export interface CallFrame {
	url: string
	functionName: string
	lineNumber: number
	columnNumber: number
}

/** `log.entryAdded` params as Firefox's own log module builds them for a web page. */
export interface LogEntryParams {
	type: "javascript" | "console"
	method?: "error"
	args?: Array<{ type: "string"; value: string }>
	level: "error"
	source: { realm: string; context: string }
	text: string
	timestamp: number
	stackTrace: { callFrames: CallFrame[] }
}

/**
 * Chrome's split, which the fixtures' arrays follow: an exception is a page error and any other
 * error-level message a console error. Firefox's BiDi sends both to `pageerror` for a web page.
 * Serialised into the content listener, so it uses nothing outside itself.
 */
export function kindOf(error: { hasException: boolean }): "javascript" | "console" {
	return error.hasException ? "javascript" : "console"
}

function isCallFrame(frame: unknown): boolean {
	const f = frame as Record<string, unknown> | null
	if (typeof f !== "object" || f === null) return false
	return (
		typeof f.url === "string" &&
		typeof f.functionName === "string" &&
		Number.isInteger(f.lineNumber) &&
		Number.isInteger(f.columnNumber)
	)
}

/**
 * The entry for a content listener's `record`, raised in BiDi context `context`, or `null` when the
 * record is not exactly that shape, which the relay counts as a fault. Serialised into the relay
 * with `isCallFrame`, its one dependency.
 */
export function logEntryFor(record: unknown, context: string): LogEntryParams | null {
	const r = record as Record<string, unknown> | null
	if (typeof r !== "object" || r === null || (r.kind !== "javascript" && r.kind !== "console")) return null
	if (typeof r.topId !== "number" || typeof r.timeStamp !== "number" || typeof r.text !== "string") return null
	if (!Array.isArray(r.args) || !r.args.every((arg) => typeof arg === "string")) return null
	if (!Array.isArray(r.callFrames) || !r.callFrames.every(isCallFrame)) return null
	if (typeof context !== "string" || context === "") return null
	const common = {
		level: "error" as const,
		source: { realm: "", context },
		text: r.text,
		timestamp: r.timeStamp,
		stackTrace: { callFrames: r.callFrames as CallFrame[] },
	}
	if (r.kind === "javascript") return { type: "javascript", ...common }
	return { type: "console", method: "error", args: (r.args as string[]).map((value) => ({ type: "string", value })), ...common }
}

/** What the relay runs: the code its unit tests run. */
export const RELAY_HELPERS = `${isCallFrame}\n${logEntryFor}`

/**
 * A process script, so it runs in every content process, and through the delayed load in each later
 * one before its first page script. It keeps a message only when it is error-level and the frame
 * that raised it is the add-on's own by its own principal, as Firefox's BiDi judges a frame: a web
 * frame inside an extension page stays with Firefox's own BiDi, and another add-on is never read.
 * Page values are read only through Xrays. Once both listeners are registered it reports ready.
 * The parent process refuses a `data:` script from system code, printing one `unsafe filename`
 * error per launch; the relay runs there instead.
 */
function listenerSource(addonId: string): string {
	return `"use strict";
(() => {
	const CHANNEL = ${JSON.stringify(CHANNEL)};
	const ADDON_ID = ${JSON.stringify(addonId)};
	${kindOf}
	const send = (record) => Services.cpmm.sendAsyncMessage(CHANNEL, record);
	const fault = (err) => send({ kind: "fault", reason: String(err) });
	// A window already gone has no page left to hear its message, here or on Chrome.
	const ownTop = (innerWindowId) => {
		const global = innerWindowId ? WindowGlobalChild.getByInnerWindowId(innerWindowId) : null;
		const document = global?.browsingContext?.window?.document;
		if (!document || document.nodePrincipal.addonId !== ADDON_ID) return undefined;
		return global.browsingContext.top.id;
	};
	// BiDi's frame: zero-based, privileged frames dropped.
	const callFrames = (frames) => frames
		.filter((frame) => !/^(chrome|resource):/.test(frame.filename))
		.map((frame) => ({ url: frame.filename, functionName: frame.functionName || "", lineNumber: frame.lineNumber - 1, columnNumber: frame.columnNumber - 1 }));
	const savedFrames = (stack) => {
		const frames = [];
		for (let frame = stack; frame && !Cu.isDeadWrapper(frame); frame = frame.parent || frame.asyncParent) {
			frames.push({ filename: frame.source, functionName: frame.functionDisplayName, lineNumber: frame.line, columnNumber: frame.column });
		}
		return frames;
	};
	const argText = (value) => {
		if (typeof value === "string") return value;
		try { return String(value); } catch { return "[" + typeof value + "]"; }
	};
	const onScriptError = (message) => {
		if (!(message instanceof Ci.nsIScriptError)) return;
		if (message.flags & (Ci.nsIScriptError.warningFlag | Ci.nsIScriptError.infoFlag)) return;
		const topId = ownTop(message.innerWindowID);
		if (topId === undefined) return;
		const kind = kindOf(message);
		const text = message.errorMessage;
		send({ kind, topId, text, args: kind === "console" ? [text] : [], timeStamp: message.timeStamp, callFrames: callFrames(savedFrames(message.stack)) });
	};
	const onConsoleCall = (event) => {
		const message = event.wrappedJSObject;
		if (message.level !== "error") return;
		const topId = ownTop(Number(message.innerID));
		if (topId === undefined) return;
		const args = Array.from(message.arguments ?? [], argText);
		const top = message.filename ? [{ filename: message.filename, functionName: message.functionName, lineNumber: message.lineNumber, columnNumber: message.columnNumber }] : [];
		send({ kind: "console", topId, text: args.join(" "), args, timeStamp: message.timeStamp, callFrames: callFrames(message.stacktrace ?? top) });
	};
	const guarded = (handler) => (message) => { try { handler(message); } catch (err) { fault(err); } };
	try {
		Services.console.registerListener({ observe: guarded(onScriptError) });
		Cc["@mozilla.org/consoleAPI-storage;1"].getService(Ci.nsIConsoleAPIStorage)
			.addLogEventListener(guarded(onConsoleCall), Services.scriptSecurityManager.getSystemPrincipal());
		send({ kind: "ready", childId: ChromeUtils.domProcessChild.childID, remoteType: Services.appinfo.remoteType });
	} catch (err) {
		fault(err);
	}
})();`
}

/**
 * Evaluated in a system sandbox of its own, so it outlives every browser window. A record whose top
 * context has no BiDi id is dropped: the background page and its PXE frame, which no page listener
 * hears on Chrome either, or a page that has closed. The emit is synchronous in the message handler,
 * which is what puts an error a page reported before answering a command ahead of that answer.
 */
const RELAY_SOURCE = `"use strict";
const { RemoteAgent } = ChromeUtils.importESModule("chrome://remote/content/components/RemoteAgent.sys.mjs");
const { NavigableManager } = ChromeUtils.importESModule("chrome://remote/content/shared/NavigableManager.sys.mjs");
const session = RemoteAgent.webDriverBiDi?.session;
const { BrowsingContext } = Components.utils.getGlobalForObject(NavigableManager);
if (typeof session?._onMessageHandlerProtocolEvent !== "function") throw new Error("the BiDi session has no _onMessageHandlerProtocolEvent");
if (typeof NavigableManager.getIdForBrowsingContext !== "function") throw new Error("NavigableManager has no getIdForBrowsingContext");
if (typeof BrowsingContext?.get !== "function") throw new Error("NavigableManager's global has no BrowsingContext");
${RELAY_HELPERS}
const state = { faultCount: 0, faults: [], ready: [] };
const fault = (reason) => {
	state.faultCount++;
	if (state.faults.length < ${FAULTS_KEPT}) state.faults.push(reason);
};
const contextOf = (topId) => {
	const top = BrowsingContext.get(topId);
	return top ? NavigableManager.getIdForBrowsingContext(top) : null;
};
const relay = (record) => {
	if (record?.kind === "ready") return void state.ready.push({ childId: record.childId, remoteType: record.remoteType });
	if (record?.kind === "fault") return fault("listener: " + record.reason);
	const context = typeof record?.topId === "number" ? contextOf(record.topId) : "";
	if (context === null) return;
	const entry = logEntryFor(record, context);
	if (!entry) return fault("a malformed record: " + JSON.stringify(record));
	session._onMessageHandlerProtocolEvent("message-handler-protocol-event", { name: "log.entryAdded", data: entry });
};
Services.ppmm.addMessageListener(${JSON.stringify(CHANNEL)}, {
	receiveMessage({ data }) {
		try { relay(data); } catch (err) { fault("relay: " + err); }
	},
});
Services.obs.addObserver({ observe(subject) { subject.wrappedJSObject.state = JSON.stringify(state); } }, ${JSON.stringify(STATE_TOPIC)});
`

const ARM = `
	const [relay, listener, done] = arguments;
	try {
		const sandbox = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), {
			freshZone: true,
			sandboxName: "nulo-e2e page-error relay",
			wantGlobalProperties: ["ChromeUtils"],
		});
		Cu.evalInSandbox(relay, sandbox, "latest", "resource://nulo-e2e/page-error-relay.js", 1);
		Services.ppmm.loadProcessScript("data:application/javascript;charset=utf-8," + encodeURIComponent(listener), true);
		done("armed");
	} catch (err) {
		done("error: " + err);
	}`

const READ = `
	const [topic, done] = arguments;
	const answer = {};
	Services.obs.notifyObservers({ wrappedJSObject: answer }, topic);
	done({
		state: answer.state ?? null,
		live: ChromeUtils.getAllDOMProcesses().map((process) => ({ childId: process.childID, remoteType: process.remoteType ?? null })),
	});`

/** The add-on's id as its manifest names it: the principal every one of its pages carries. */
function addonIdOf(extensionPath: string): string {
	const manifest = JSON.parse(readFileSync(path.join(extensionPath, "manifest.json"), "utf8")) as {
		browser_specific_settings?: { gecko?: { id?: unknown } }
	}
	const id = manifest.browser_specific_settings?.gecko?.id
	if (typeof id !== "string" || id === "") throw new Error(`${extensionPath}/manifest.json names no browser_specific_settings.gecko.id`)
	return id
}

/** Arms the relay and the listener before the add-on at `extensionPath` is installed, while no page
 *  of it exists for the privileged call's window switch to disturb. Rejects when either cannot be armed. */
export async function armPageErrorRelay(session: WebDriverSession, extensionPath: string): Promise<void> {
	const armed = await session.chromeScript<string>(ARM, [RELAY_SOURCE, listenerSource(addonIdOf(extensionPath))])
	if (armed !== "armed") throw new Error(`Firefox page-error relay: ${armed}`)
}

export interface RelayProcess {
	childId: number
	remoteType: string | null
}

interface RelayState {
	faultCount: number
	faults: string[]
	ready: RelayProcess[]
}

const isProcess = (value: unknown): value is RelayProcess => {
	const p = value as Record<string, unknown> | null
	return typeof p === "object" && p !== null && Number.isInteger(p.childId) && (typeof p.remoteType === "string" || p.remoteType === null)
}

const isProcessList = (value: unknown): value is RelayProcess[] => Array.isArray(value) && value.every(isProcess)

function parseJson(raw: unknown): unknown {
	if (typeof raw !== "string") return undefined
	try {
		return JSON.parse(raw)
	} catch {
		return undefined
	}
}

function parseState(raw: unknown): RelayState | undefined {
	const state = parseJson(raw) as Partial<RelayState> | null | undefined
	if (typeof state !== "object" || state === null || !Number.isInteger(state.faultCount)) return undefined
	if (!Array.isArray(state.faults) || !isProcessList(state.ready)) return undefined
	return state as RelayState
}

/**
 * `undefined` when the relay ran clean: no fault, at least one extension process of this launch
 * reported the listener ready, and every extension process still live is one that did. Otherwise
 * why it did not. `read` is what the close-time read returned.
 */
export function relayVerdict(read: unknown): string | undefined {
	const { state: raw, live } = (typeof read === "object" && read !== null ? read : {}) as { state?: unknown; live?: unknown }
	const state = parseState(raw)
	if (!state || !isProcessList(live)) return `its state could not be read (${JSON.stringify(read)})`
	if (state.faultCount > 0) return `it faulted ${state.faultCount} time(s): ${state.faults.join("; ")}`
	const ready = new Set(state.ready.map((process) => process.childId))
	const unready = live.filter((process) => process.remoteType === EXTENSION_PROCESS && !ready.has(process.childId))
	if (unready.length > 0) return `extension process(es) ${unready.map((p) => p.childId).join(", ")} ran without the listener`
	if (!state.ready.some((process) => process.remoteType === EXTENSION_PROCESS)) return "no extension process reported the listener ready"
	return undefined
}

/** The relay's verdict for this launch, read while its session is still open. Never rejects: a
 *  failed read is a verdict of its own. */
export function checkPageErrorRelay(session: WebDriverSession): Promise<string | undefined> {
	return session.chromeScript<unknown>(READ, [STATE_TOPIC]).then(relayVerdict, (err: unknown) => {
		return `its state could not be read (${err instanceof Error ? err.message : String(err)})`
	})
}
