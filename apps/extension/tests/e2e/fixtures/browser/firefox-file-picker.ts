import { pollUntil } from "../poll"
import type { FirefoxScopeCall } from "./firefox-answer-requests"
import type { WebDriverSession } from "./webdriver-classic"

/**
 * Firefox's file picker, replaced for the launch. Headless Firefox answers its native picker by
 * focus: a focused window's pick is never answered and an unfocused one's is cancelled at once, and
 * the suite controls neither. So no pick reaches it: a pick nobody asked for is cancelled at once,
 * as a person closing the chooser does, and the pick `pickWithStandIn` asks for waits, its input
 * still in the page, until the driver answers it with the file.
 */

/** Commands reach the stand-in on this topic; each writes one outcome word into the subject. */
const TOPIC = "nulo-e2e:file-picker"

interface PickCallback {
	done(result: number): void
}

interface Picker {
	file: unknown
}

/**
 * The stand-in's one pick: the page it is armed for, then the pick it holds. Serialised into
 * Firefox's sandbox, so it uses nothing outside itself. A held pick is taken out of the slot before
 * its callback runs, so no callback runs twice.
 */
export function filePickerSlot(returnOk: number, returnCancel: number, fileAt: (path: string) => unknown) {
	let armed: { browserId: number; path: string } | null = null
	let held: { picker: Picker; callback: PickCallback; path: string } | null = null
	return {
		arm(browserId: number, path: string): string {
			if (armed || held) return "busy"
			armed = { browserId, path }
			return "armed"
		},
		open(picker: Picker, browserId: number | undefined, callback: PickCallback): void {
			if (!armed || armed.browserId !== browserId) {
				callback.done(returnCancel)
				return
			}
			held = { picker, callback, path: armed.path }
			armed = null
		},
		answer(): string {
			const pick = held
			if (!pick) return "not held"
			held = null
			pick.picker.file = fileAt(pick.path)
			pick.callback.done(returnOk)
			return "answered"
		},
		release(): string {
			const pick = held
			armed = null
			held = null
			if (!pick) return "idle"
			pick.callback.done(returnCancel)
			return "released"
		},
	}
}

/** The sandbox's source: the slot, a factory for the picker's contract, and the command observer. */
const STAND_IN_SOURCE = `"use strict";
${filePickerSlot}
const { NavigableManager } = ChromeUtils.importESModule("chrome://remote/content/shared/NavigableManager.sys.mjs");
const CONTRACT = "@mozilla.org/filepicker;1";
const fileAt = (path) => {
	const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
	file.initWithPath(path);
	return file;
};
const slot = filePickerSlot(Components.interfaces.nsIFilePicker.returnOK, Components.interfaces.nsIFilePicker.returnCancel, fileAt);
const factory = {
	createInstance(iid) {
		let browserId;
		const picker = {
			init(browsingContext) { browserId = browsingContext?.browserId; },
			appendFilter() {},
			appendFilters() {},
			appendRawFilter() {},
			open(callback) { slot.open(picker, browserId, callback); },
			file: null,
			displayDirectory: null,
			QueryInterface: ChromeUtils.generateQI(["nsIFilePicker"]),
		};
		return picker.QueryInterface(iid);
	},
	QueryInterface: ChromeUtils.generateQI(["nsIFactory"]),
};
const command = (request) => {
	if (request.op === "answer") return slot.answer();
	if (request.op === "release") return slot.release();
	if (request.op !== "arm") return "unknown command " + request.op;
	const browserId = NavigableManager.getBrowserById(request.context)?.browserId;
	if (browserId === undefined) return "no such page " + request.context;
	if (!fileAt(request.path).exists()) return "no such file " + request.path;
	return slot.arm(browserId, request.path);
};
Services.obs.addObserver({
	observe(subject) {
		const request = subject.wrappedJSObject;
		try {
			request.outcome = command(request);
		} catch (err) {
			request.outcome = "error: " + err;
		}
	},
}, ${JSON.stringify(TOPIC)});
const registrar = Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar);
const cid = Components.ID(Services.uuid.generateUUID().toString());
registrar.registerFactory(cid, "nulo-e2e file picker", CONTRACT, factory);
registrar.contractIDToCID(CONTRACT).equals(cid) ? "installed" : "the picker's contract still names another factory";
`

const INSTALL = `
	const [source, done] = arguments;
	try {
		const sandbox = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), {
			freshZone: true,
			sandboxName: "nulo-e2e file picker",
			wantGlobalProperties: ["ChromeUtils"],
		});
		done(Cu.evalInSandbox(source, sandbox, "latest", "resource://nulo-e2e/file-picker.js", 1));
	} catch (err) {
		done("error: " + err);
	}`

/** Installs the stand-in before any page exists for the privileged call's window switch to disturb. */
export async function installFilePicker(session: WebDriverSession): Promise<void> {
	const installed = await session.chromeScript<string>(INSTALL, [STAND_IN_SOURCE])
	if (installed !== "installed") throw new Error(`Firefox file picker stand-in: ${installed}`)
}

const COMMAND = `function (topic, op, context, path) {
	const request = { op, context, path };
	Services.obs.notifyObservers({ wrappedJSObject: request }, topic);
	return request.outcome ?? "no stand-in answered";
}`

const command = async (call: FirefoxScopeCall, op: string, context = "", path = ""): Promise<string> =>
	String(await call(COMMAND, [TOPIC, op, context, path]))

/**
 * Answers the pick `open` asks for on the page `context` names with `filePath`. The pick is held
 * until `open` resolves, so its input stays in the page for `open` to read, as Chrome's chooser does.
 */
export async function pickWithStandIn(call: FirefoxScopeCall, context: string, open: () => Promise<void>, filePath: string): Promise<void> {
	const armed = await command(call, "arm", context, filePath)
	if (armed !== "armed") throw new Error(`pickFile: ${armed}`)
	let answered: string
	try {
		await open()
		answered = await pollUntil(
			() => command(call, "answer"),
			(outcome) => outcome !== "not held",
			{ label: "pickFile: the click opened the file picker", timeoutMs: 10_000, intervalMs: 50 },
		)
	} catch (err) {
		// Released so a later pick is never held for this one; its failure must not replace `err`.
		await command(call, "release").catch(() => undefined)
		throw err
	}
	const released = await command(call, "release")
	if (answered !== "answered") throw new Error(`pickFile: ${answered}`)
	if (released !== "idle") throw new Error(`pickFile: the release after the answer read ${released}`)
}
