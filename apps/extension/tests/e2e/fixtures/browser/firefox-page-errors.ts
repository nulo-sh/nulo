import { readFileSync } from "node:fs"
import path from "node:path"
import type { WebDriverSession } from "./webdriver-classic"

/**
 * Firefox's WebDriver BiDi sends no `log.entryAdded` for a frame whose own principal is an add-on's
 * (Bug 1755014), so Puppeteer never fires `pageerror` or `console` for the wallet's pages. This
 * supplies those events: a listener in every content process sends the add-on's frames' error-level
 * messages to a relay in the parent, which emits each on the BiDi session Puppeteer reads, as the
 * entry Firefox builds for a web page.
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
/** The latest exceptions the relay heard, emitted or not, kept for the launch's close to report. */
const RECENT_KEPT = 20

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

export interface RawFrame {
	filename: string
	functionName: string
	lineNumber: number
	columnNumber: number
}

/**
 * An error's saved stack, or the one location it reports when it has none. Serialised into the
 * content listener, so it uses nothing outside itself.
 */
export function errorFrames(saved: RawFrame[], error: { sourceName: string; lineNumber: number; columnNumber: number }): RawFrame[] {
	if (saved.length > 0 || !error.sourceName) return saved
	return [{ filename: error.sourceName, functionName: "", lineNumber: error.lineNumber, columnNumber: error.columnNumber }]
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
	${errorFrames}
	const send = (record) => Services.cpmm.sendAsyncMessage(CHANNEL, record);
	const fault = (err) => send({ kind: "fault", reason: String(err) });
	// Only a window its tab still shows, active as Firefox's extension code judges it, so a replaced
	// window is never judged by its successor's principal.
	const ownTop = (innerWindowId) => {
		const global = innerWindowId ? WindowGlobalChild.getByInnerWindowId(innerWindowId) : null;
		if (!global?.isCurrentGlobal || global.windowContext.isInBFCache) return undefined;
		const document = global.browsingContext.window?.document;
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
		send({ kind, topId, text, args: kind === "console" ? [text] : [], timeStamp: message.timeStamp, callFrames: callFrames(errorFrames(savedFrames(message.stack), message)) });
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
 * context has no BiDi id is not emitted: the background page and its PXE frame, which no page
 * listener hears on Chrome either, or a page that has closed. Every exception, emitted or not, is
 * kept with its first frame among the recent ones the launch's close reports; console errors are
 * not, as the wallet's logger writes many. The emit is synchronous in the message handler; that an error a page reported before
 * answering a command arrives ahead of the answer is measured, not derived, and the smoke control's
 * barrier holds it.
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
const state = { faultCount: 0, faults: [], ready: [], extensionProcesses: [], recent: [] };
const fault = (reason) => {
	state.faultCount++;
	if (state.faults.length < ${FAULTS_KEPT}) state.faults.push(reason);
};
// Every extension process of the launch, so the close check also judges one that has exited.
const sawExtensionProcess = (childId) => {
	if (!state.extensionProcesses.includes(childId)) state.extensionProcesses.push(childId);
};
for (const process of ChromeUtils.getAllDOMProcesses()) {
	if (process.remoteType === ${JSON.stringify(EXTENSION_PROCESS)}) sawExtensionProcess(process.childID);
}
const processObserver = {
	observe(subject, topic, data) {
		try {
			const process = subject.QueryInterface(Components.interfaces.nsIDOMProcessParent);
			if (process.remoteType === ${JSON.stringify(EXTENSION_PROCESS)}) sawExtensionProcess(Number(data));
		} catch (err) {
			fault(topic + ": " + err);
		}
	},
};
Services.obs.addObserver(processObserver, "ipc:content-created");
Services.obs.addObserver(processObserver, "process-type-set");
const contextOf = (topId) => {
	const top = BrowsingContext.get(topId);
	return top ? NavigableManager.getIdForBrowsingContext(top) : null;
};
const relay = (record) => {
	if (record?.kind === "ready") return void state.ready.push({ childId: record.childId, remoteType: record.remoteType });
	if (record?.kind === "fault") return fault("listener: " + record.reason);
	const context = typeof record?.topId === "number" ? contextOf(record.topId) : "";
	if (record?.kind === "javascript" && typeof record.text === "string") {
		state.recent.push({ context, text: record.text.slice(0, 300), frame: record.callFrames?.[0] ?? null });
		if (state.recent.length > ${RECENT_KEPT}) state.recent.shift();
	}
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
	extensionProcesses: number[]
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
	if (!Array.isArray(state.extensionProcesses) || !state.extensionProcesses.every(Number.isInteger)) return undefined
	return state as RelayState
}

/**
 * `undefined` when the relay ran clean: no fault, at least one extension process of this launch
 * reported the listener ready, and every extension process it saw or that is still live is one that
 * did. Otherwise why it did not. `read` is what the close-time read returned.
 */
export function relayVerdict(read: unknown): string | undefined {
	const { state: raw, live } = (typeof read === "object" && read !== null ? read : {}) as { state?: unknown; live?: unknown }
	const state = parseState(raw)
	if (!state || !isProcessList(live)) return `its state could not be read (${JSON.stringify(read)})`
	if (state.faultCount > 0) return `it faulted ${state.faultCount} time(s): ${state.faults.join("; ")}`
	const ready = new Set(state.ready.map((process) => process.childId))
	const liveExtension = live.filter((process) => process.remoteType === EXTENSION_PROCESS).map((process) => process.childId)
	const unready = [...new Set([...state.extensionProcesses, ...liveExtension])].filter((childId) => !ready.has(childId))
	if (unready.length > 0) return `extension process(es) ${unready.join(", ")} ran without the listener`
	if (!state.ready.some((process) => process.remoteType === EXTENSION_PROCESS)) return "no extension process reported the listener ready"
	return undefined
}

/**
 * The relay's latest exceptions, oldest first, each with the BiDi context it was raised in ("no
 * context" when none was available) and its first frame, 1-based as Firefox prints a stack.
 * `read` is what the close-time read returned.
 */
export function recentExceptions(read: unknown): string[] {
	const raw = typeof read === "object" && read !== null ? (read as { state?: unknown }).state : undefined
	const recent = (parseJson(raw) as { recent?: unknown } | undefined)?.recent
	if (!Array.isArray(recent)) return []
	return recent.map((r: { context?: unknown; text?: unknown; frame?: unknown }) => {
		const at = isCallFrame(r.frame) ? ` at ${locationOf(r.frame as CallFrame)}` : ""
		return `${r.context || "no context"}: ${String(r.text)}${at}`
	})
}

const locationOf = (frame: CallFrame): string => `${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`

export interface RelayReport {
	/** Why the relay cannot be trusted for this launch, or `undefined` when it ran clean. */
	verdict: string | undefined
	exceptions: string[]
}

/** The relay's verdict and latest exceptions for this launch, read while its session is still open.
 *  Never rejects: a failed read is a verdict of its own. */
export function checkPageErrorRelay(session: WebDriverSession): Promise<RelayReport> {
	return session.chromeScript<unknown>(READ, [STATE_TOPIC]).then(
		(read) => ({ verdict: relayVerdict(read), exceptions: recentExceptions(read) }),
		(err: unknown) => ({
			verdict: `its state could not be read (${err instanceof Error ? err.message : String(err)})`,
			exceptions: [],
		}),
	)
}
