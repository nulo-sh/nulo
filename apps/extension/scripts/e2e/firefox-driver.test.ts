import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { runInNewContext } from "node:vm"
import * as puppeteer from "puppeteer"
import { describe, expect, test, vi } from "vitest"
import {
	type BackgroundStopper,
	FIREFOX_LAUNCH_PREFS,
	type SilentCloseWatch,
	abandonSession,
	capabilities,
	egressGuardPrefs,
	firefoxDirFor,
	firefoxDriver,
	permissionRequestPrefs,
	silentlyClosed,
	stopBackgroundWith,
	tabSize,
	uuidFromPrefs,
	viewportRecord,
	withInventory,
} from "../../tests/e2e/fixtures/browser/firefox"
import { trackContexts } from "../../tests/e2e/fixtures/browser/bidi-attach"
import { E2E_FIREFOX_REVISION } from "../../tests/e2e/fixtures/browser/firefox-revision"
import {
	RELAY_HELPERS,
	checkPageErrorRelay,
	errorFrames,
	kindOf,
	recentExceptions,
	relayVerdict,
} from "../../tests/e2e/fixtures/browser/firefox-page-errors"
import type { WebDriverSession } from "../../tests/e2e/fixtures/browser/webdriver-classic"

/** The PXE host is placed where Firefox's timer throttling cannot reach it; the suite must run under
 *  that throttling, as its users do, so a regression shows as a slow send rather than staying hidden. */
describe("launch prefs", () => {
	test("no pref masks timer throttling", () => {
		expect(Object.keys(FIREFOX_LAUNCH_PREFS).filter((key) => /timeout|throttl/i.test(key))).toEqual([])
	})
})

describe("egress guard prefs", () => {
	const findProxyOf = (prefs: ReturnType<typeof egressGuardPrefs>) => {
		const pac = decodeURIComponent(String(prefs["network.proxy.autoconfig_url"]).replace(/^data:text\/javascript,/, ""))
		return new Function(`${pac}; return FindProxyForURL`)() as (url: string, host: string) => string
	}
	const prefs = egressGuardPrefs(4321)
	const findProxy = findProxyOf(prefs)

	test("route by PAC with no fail-over to direct, and resolve only the canary name locally", () => {
		expect(prefs).toEqual({
			"network.proxy.type": 2,
			"network.proxy.autoconfig_url": expect.stringMatching(/^data:text\/javascript,/),
			"network.proxy.failover_direct": false,
			"network.dns.localDomains": "egress-canary.test",
			"browser.newtabpage.trainhopAddon.xpiBaseURL": "",
		})
	})

	test("send loopback direct and every other host to the guard, with nothing after it", () => {
		for (const host of ["localhost", "127.0.0.1", "::1", "[::1]"]) expect(findProxy(`http://${host}/`, host)).toBe("DIRECT")
		for (const host of ["lb.drpc.live", "egress-canary.test", "169.254.0.1", "[fe80::1]"]) {
			expect(findProxy(`https://${host}/`, host)).toBe("PROXY 127.0.0.1:4321")
		}
	})

	test("stay out of the prefs users run with", () => {
		expect(Object.keys(FIREFOX_LAUNCH_PREFS).filter((key) => key.startsWith("network."))).toEqual([])
	})

	test("the live hosts, alone of the outside names, go direct", () => {
		const live = egressGuardPrefs(4321, ["lb.drpc.live", "tokens.nulo.sh"])
		const findLive = findProxyOf(live)
		expect(findLive("https://lb.drpc.live/", "lb.drpc.live")).toBe("DIRECT")
		expect(findLive("https://tokens.nulo.sh/v1/list.json", "tokens.nulo.sh")).toBe("DIRECT")
		for (const host of ["localhost", "127.0.0.1", "::1", "[::1]"]) expect(findLive(`http://${host}/`, host)).toBe("DIRECT")
		for (const host of ["rpc.lb.drpc.live", "lb.drpc.live.evil.test", "nulo.sh", "egress-canary.test", "api.coingecko.com"]) {
			expect(findLive(`https://${host}/`, host)).toBe("PROXY 127.0.0.1:4321")
		}
		expect({ ...live, "network.proxy.autoconfig_url": "" }).toEqual({ ...prefs, "network.proxy.autoconfig_url": "" })
	})
})

/** Users answer Firefox's permission prompt; only a launch that asks skips it. */
describe("permission request prefs", () => {
	const prefsOf = (grantPermissionRequests?: true) => {
		vi.stubEnv("FIREFOX_PATH", process.execPath)
		try {
			const caps = capabilities({ profileDir: "profile", headless: true, grantPermissionRequests })
			return (caps["moz:firefoxOptions"] as { prefs: Record<string, unknown> }).prefs
		} finally {
			vi.unstubAllEnvs()
		}
	}

	test("skip only the prompt, and stay out of the prefs users run with", () => {
		expect(permissionRequestPrefs).toEqual({ "extensions.webextOptionalPermissionPrompts": false })
		expect(Object.keys(FIREFOX_LAUNCH_PREFS).filter((key) => key.startsWith("extensions."))).toEqual([])
	})

	test("join a launch only when it asks", () => {
		expect(prefsOf()).toEqual(FIREFOX_LAUNCH_PREFS)
		expect(prefsOf(true)).toEqual({ ...FIREFOX_LAUNCH_PREFS, ...permissionRequestPrefs })
	})
})

/**
 * Puppeteer's own `executablePath({ browser: "firefox" })` composes the Firefox path from the
 * CHROME build id, so it returns a directory that was never installed and geckodriver rejects the
 * session with "binary is not a Firefox executable". The driver resolves from the cache instead.
 */
describe("firefox cache directory selection", () => {
	test("picks the locked revision, not the newest a shared cache happens to hold", () => {
		const dirs = ["linux-stable_152.0.4", "linux-stable_153.0.4", "linux-stable_154.0.1"]
		expect(firefoxDirFor(dirs, "stable_153.0.4")).toBe("linux-stable_153.0.4")
	})

	test("a revision that is a suffix of another is not mistaken for it", () => {
		expect(firefoxDirFor(["linux-nightly_stable_153.0.4x", "linux-xstable_153.0.4"], "stable_153.0.4")).toBeUndefined()
	})

	test("a cache without the locked revision has no answer, so the caller can say what to install", () => {
		expect(firefoxDirFor(["linux-stable_154.0.1"], "stable_153.0.4")).toBeUndefined()
		expect(firefoxDirFor([], "stable_153.0.4")).toBeUndefined()
	})
})

describe("the pinned Firefox", () => {
	test("is the one launched, with Puppeteer's own revision installed beside it", () => {
		const own = (puppeteer as unknown as { PUPPETEER_REVISIONS: { firefox: string } }).PUPPETEER_REVISIONS.firefox
		const cache = mkdtempSync(path.join(tmpdir(), "nulo-firefox-pin-test-"))
		try {
			for (const revision of [E2E_FIREFOX_REVISION, own]) {
				mkdirSync(path.join(cache, "firefox", `linux-${revision}`, "firefox"), { recursive: true })
				writeFileSync(path.join(cache, "firefox", `linux-${revision}`, "firefox", "firefox"), "")
			}
			vi.stubEnv("FIREFOX_PATH", "")
			vi.stubEnv("PUPPETEER_CACHE_DIR", cache)
			const { binary } = capabilities({ profileDir: "profile", headless: true })["moz:firefoxOptions"] as { binary: string }
			expect(binary).toBe(path.join(cache, "firefox", `linux-${E2E_FIREFOX_REVISION}`, "firefox", "firefox"))
		} finally {
			vi.unstubAllEnvs()
			rmSync(cache, { recursive: true, force: true })
		}
	})

	test("is what CI installs, and what its cache is keyed on", () => {
		const action = readFileSync(path.join(import.meta.dirname, "../../../../.github/actions/setup-puppeteer/action.yml"), "utf8")
		expect(action).toContain("run: bun scripts/e2e/install-firefox.ts")
		expect(action).toContain("hashFiles('apps/extension/tests/e2e/fixtures/browser/firefox-revision.ts')")
		expect(action).not.toMatch(/browsers install firefox/)
	})
})

describe("a session the launch refuses to keep", () => {
	const record = () => ({
		marker: "m",
		pid: 1,
		ownerPid: 1,
		ownerStartTime: "1",
		profileDir: "/profiles/profile-m",
		ownsProfile: true,
		label: "t",
	})
	const cause = new Error("Firefox did not inherit the launch marker")

	test("is ended, and the launch fails with its original reason", async () => {
		const owned = record()
		const disown = vi.fn()
		await expect(abandonSession({ close: async () => {} }, owned, cause, disown)).rejects.toBe(cause)
		expect(disown).not.toHaveBeenCalled()
	})

	// Its Firefox may carry another launch's marker, invisible to this launch's teardown.
	test("that cannot be ended keeps its profile out of teardown's reach", async () => {
		const owned = record()
		const close = () => Promise.reject(new Error("timed out"))
		const disown = vi.fn()
		await expect(abandonSession({ close }, owned, cause, disown)).rejects.toThrow(/could not be ended \(timed out\).*left in place/)
		expect(disown).toHaveBeenCalledWith(owned)
	})
})

/** `installAddon` returns the manifest id; the add-on's pages are served from a per-profile UUID. */
describe("per-profile UUID from prefs.js", () => {
	const pref = (json: string) => `user_pref("extensions.webextensions.uuids", ${JSON.stringify(json)});`

	test("reads the UUID mapped to the add-on id, among other add-ons and prefs", () => {
		const prefs = [
			'user_pref("browser.startup.page", 0);',
			pref('{"formautofill@mozilla.org":"11111111-aaaa","wallet@nulo.sh":"22222222-bbbb"}'),
		].join("\n")
		expect(uuidFromPrefs(prefs, "wallet@nulo.sh")).toBe("22222222-bbbb")
	})

	test("has no answer before the add-on is mapped or the pref is flushed", () => {
		expect(uuidFromPrefs(pref('{"formautofill@mozilla.org":"11111111-aaaa"}'), "wallet@nulo.sh")).toBeUndefined()
		expect(uuidFromPrefs('user_pref("browser.startup.page", 0);', "wallet@nulo.sh")).toBeUndefined()
	})

	test("a half-written pref is a miss, not a throw — the caller polls", () => {
		expect(uuidFromPrefs('user_pref("extensions.webextensions.uuids", "{\\"wallet@nulo.sh\\":\\"22', "wallet@nulo.sh")).toBeUndefined()
		expect(uuidFromPrefs('user_pref("extensions.webextensions.uuids", "not json");', "wallet@nulo.sh")).toBeUndefined()
	})
})

/** Firefox sends no BiDi event for a window that closes itself, so the handle list decides. */
describe("silent window closes", () => {
	const fresh = (): SilentCloseWatch => ({ listed: new Set(), misses: new Map() })

	test("a listed window that leaves the handle list is closed on the second miss, not the first", () => {
		const watch = fresh()
		expect(silentlyClosed(watch, ["a"], new Set(["a"]))).toEqual([])
		expect(silentlyClosed(watch, ["a"], new Set())).toEqual([])
		expect(silentlyClosed(watch, ["a"], new Set())).toEqual(["a"])
	})

	// BiDi can announce a window before the classic channel lists it. Calling that window closed
	// would tear a live approval window out from under the test waiting for it.
	test("a window the handle list has not shown yet is given far longer than a listed one", () => {
		const watch = fresh()
		for (let read = 0; read < 7; read++) expect(silentlyClosed(watch, ["new"], new Set())).toEqual([])
		expect(silentlyClosed(watch, ["new"], new Set(["new"]))).toEqual([])
	})

	// A verify window can open, be approved and close between two reads. If "never listed" meant
	// "never closed", its target would stay in `targets()` for the rest of the run.
	test("a window that opened and closed between reads is still reported, eventually", () => {
		const watch = fresh()
		for (let read = 0; read < 7; read++) expect(silentlyClosed(watch, ["flash"], new Set())).toEqual([])
		expect(silentlyClosed(watch, ["flash"], new Set())).toEqual(["flash"])
	})

	test("one missed read is forgiven when the window is listed again", () => {
		const watch = fresh()
		silentlyClosed(watch, ["a"], new Set(["a"]))
		silentlyClosed(watch, ["a"], new Set())
		expect(silentlyClosed(watch, ["a"], new Set(["a"]))).toEqual([])
		expect(silentlyClosed(watch, ["a"], new Set())).toEqual([])
	})
})

/** Firefox sends an add-on page no `domContentLoaded` or `load`, so its commit supplies its URL when
 *  its own script writes no history. */
describe("an add-on page's URL in targets()", () => {
	const event = (method: string, params: Record<string, unknown>) => JSON.stringify({ type: "event", method, params })
	const created = (context: string, parent: string | null = null) =>
		event("browsingContext.contextCreated", { context, parent, url: "about:blank", children: [] })
	const committed = (context: string, url: string) =>
		event("browsingContext.navigationCommitted", { context, navigation: "n-1", timestamp: 1_000, url })
	const page = "moz-extension://5c9e/src/popup/index.html#/windows/capabilities?requestId=r1"

	test("a top-level window's add-on page commit is followed by a history update carrying its URL", () => {
		const open = new Set<string>()
		trackContexts(created("w"), open, new Set())
		const commit = committed("w", page)
		const handed = trackContexts(commit, open, new Set())
		expect(handed[0]).toBe(commit)
		expect(handed.slice(1).map((raw) => JSON.parse(raw))).toEqual([
			{ type: "event", method: "browsingContext.historyUpdated", params: { context: "w", timestamp: 1_000, url: page } },
		])
	})

	test("a web page's commit, a frame's and a closed window's are handed on alone", () => {
		const open = new Set<string>()
		const closed = new Set<string>()
		trackContexts(created("w"), open, closed)
		trackContexts(created("f", "w"), open, closed)
		const web = committed("w", "http://127.0.0.1:5173/#/windows/capabilities?requestId=r1")
		expect(trackContexts(web, open, closed)).toEqual([web])
		const frame = committed("f", page)
		expect(trackContexts(frame, open, closed)).toEqual([frame])
		trackContexts(event("browsingContext.contextDestroyed", { context: "w", parent: null }), open, closed)
		const late = committed("w", page)
		expect(trackContexts(late, open, closed)).toEqual([late])
	})

	test("a tree read opens its tabs, never Firefox's own windows nor a tab already closed", () => {
		const tree = (...contexts: { context: string; "moz:scope": string }[]) =>
			JSON.stringify({ type: "success", id: 7, result: { contexts } })
		const open = new Set<string>()
		trackContexts(tree({ context: "t", "moz:scope": "content" }, { context: "c", "moz:scope": "chrome" }), open, new Set(["gone"]))
		trackContexts(tree({ context: "gone", "moz:scope": "content" }), open, new Set(["gone"]))
		expect([...open]).toEqual(["t"])
	})

	test("a real destroy arriving after the one the driver reported is not handed on", () => {
		const open = new Set(["w"])
		const destroyed = event("browsingContext.contextDestroyed", { context: "w", parent: null })
		expect(trackContexts(destroyed, open, new Set(["w"]))).toEqual([])
		expect(trackContexts(destroyed, new Set(["v"]), new Set())).toEqual([destroyed])
	})
})

/** Firefox resizes a tab around Puppeteer, so the seam answers for the size it set, a reset included. */
describe("the viewport seam", () => {
	const pageAt = (viewport: puppeteer.Viewport | null) => ({ viewport: () => viewport }) as unknown as puppeteer.Page

	test("reads Puppeteer's size until the seam sets one, and a reset as null", () => {
		const record = viewportRecord()
		const page = pageAt({ width: 800, height: 600 })
		expect(record.of(page)).toEqual({ width: 800, height: 600 })
		record.set(page, { width: 240, height: 600 })
		expect(record.of(page)).toEqual({ width: 240, height: 600 })
		record.set(page, null)
		expect(record.of(page)).toBeNull()
		expect(record.of(pageAt({ width: 800, height: 600 }))).toEqual({ width: 800, height: 600 })
	})

	test("refuses by name a field a tab's size cannot carry", () => {
		expect(tabSize(null)).toBeNull()
		expect(tabSize({ width: 240, height: 600, deviceScaleFactor: undefined })).toEqual({ width: 240, height: 600 })
		expect(() => tabSize({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true })).toThrow(
			"setViewport: Firefox's resize sets no deviceScaleFactor, hasTouch",
		)
	})

	test("a classic switch to a closed window reads as the window gone, a refusal does not", () => {
		expect(firefoxDriver.targetGone?.test("POST /window → no such window: Unable to locate window")).toBe(true)
		expect(firefoxDriver.targetGone?.test("Browsing Context with id 12 not found")).toBe(true)
		expect(
			firefoxDriver.targetGone?.test(
				"POST /window → unknown error: The command does not support browsing contexts in privileged scope",
			),
		).toBe(false)
	})
})

/** A failed wait reports what Firefox had, but the report is a diagnosis: it never stands in for the failure. */
describe("a failed wait's report", () => {
	test("follows the failure", async () => {
		expect(await withInventory("no matching target", async () => "Firefox's windows: none", 1_000)).toBe(
			"no matching target; Firefox's windows: none",
		)
	})

	test("never holds the failure past its budget, nor replaces it when the read fails", async () => {
		expect(await withInventory("no matching target", () => new Promise<string>(() => {}), 20)).toBe(
			"no matching target; no inventory within 20ms",
		)
		expect(await withInventory("no matching target", () => Promise.reject(new Error("session closed")), 1_000)).toBe(
			"no matching target; inventory failed: session closed",
		)
	})
})

describe("a page error's location", () => {
	const reported = { sourceName: "moz-extension://5c9e/assets/creator.js", lineNumber: 5, columnNumber: 812 }

	test("an error with no saved stack names the location it reports", () => {
		expect(errorFrames([], reported)).toEqual([{ filename: reported.sourceName, functionName: "", lineNumber: 5, columnNumber: 812 }])
	})

	test("a saved stack is kept as it is, and an error with neither has no frame", () => {
		const saved = [{ filename: "moz-extension://5c9e/assets/popup.js", functionName: "mount", lineNumber: 18, columnNumber: 3 }]
		expect(errorFrames(saved, reported)).toBe(saved)
		expect(errorFrames([], { sourceName: "", lineNumber: 0, columnNumber: 0 })).toEqual([])
	})

	test("the close reports each recent exception with its context and kept frame, 1-based as Firefox prints a stack", () => {
		const frame = { url: reported.sourceName, functionName: "", lineNumber: 4, columnNumber: 811 }
		const recent = [
			{ context: "w1", text: "InternalError: too much recursion", frame },
			{ context: null, text: "TypeError: x is undefined", frame: null },
		]
		expect(recentExceptions({ state: JSON.stringify({ recent }), live: [] })).toEqual([
			`w1: InternalError: too much recursion at ${reported.sourceName}:5:812`,
			"no context: TypeError: x is undefined",
		])
	})

	const builtIn = { url: "self-hosted", functionName: "forEach", lineNumber: 3601, columnNumber: 20 }
	const addon = { url: "moz-extension://5c9e/assets/client.js", functionName: "walk", lineNumber: 0, columnNumber: 99 }
	const addonReported = { url: reported.sourceName, functionName: "", lineNumber: 4, columnNumber: 811 }
	test.each([
		["its first add-on frame under a built-in's", [builtIn, addon], addonReported, addon],
		["the add-on location it reports when no frame is the add-on's", [builtIn], addonReported, addonReported],
		["its top frame when neither is the add-on's", [builtIn], { ...addonReported, url: "https://dapp.example/x.js" }, builtIn],
	])("the close reports an exception at %s", (_, frames, reported, expected) => {
		expect(runSerialised(RELAY_HELPERS, "recentFrame(frames, reported)", { frames, reported })).toEqual(expected)
	})
})

/**
 * Firefox's termination is a polite suspension that returns early, reporting success, while the
 * background is busy — and the page unloads asynchronously when it does go. Only an observation of
 * the page gone may end the wait; a kill that silently did nothing would let every spec built on it
 * pass against a background that never died.
 */
describe("stopping the background", () => {
	const OLD = 1_000
	const stopper = (over: Partial<BackgroundStopper>): BackgroundStopper => ({
		identity: async () => OLD,
		terminate: async () => "terminated",
		budgetMs: 400,
		retryEveryMs: 40,
		pollEveryMs: 5,
		...over,
	})

	test("a declined termination is asked again until the page is seen gone", async () => {
		let asked = 0
		const terminate = vi.fn(async () => {
			asked++
			return "terminated"
		})
		await stopBackgroundWith(stopper({ terminate, identity: async () => (asked < 2 ? OLD : undefined) }))
		expect(terminate).toHaveBeenCalledTimes(2)
	})

	test("a successor already running counts as gone", async () => {
		let asked = false
		const terminate = async () => {
			asked = true
			return "terminated"
		}
		await expect(stopBackgroundWith(stopper({ terminate, identity: async () => (asked ? OLD + 1 : OLD) }))).resolves.toBeUndefined()
	})

	test("a probe that fails during teardown is asked again, never read as gone", async () => {
		const answers: Array<() => number | undefined> = [
			() => OLD,
			() => {
				throw new Error("the frame script never answered")
			},
			() => undefined,
		]
		const identity = vi.fn(async () => (answers.shift() ?? (() => undefined))())
		await stopBackgroundWith(stopper({ identity }))
		expect(identity).toHaveBeenCalledTimes(3)
	})

	// An add-on event can wake a successor at any moment. An ask made on a stale sighting would end
	// that successor too, and the spec would exercise two background deaths while asserting one.
	test("a successor that appears between two sightings is never asked to end", async () => {
		vi.useFakeTimers()
		try {
			let current = OLD
			const endedWhile: number[] = []
			const terminate = async () => {
				endedWhile.push(current)
				return "terminated"
			}
			const stopping = stopBackgroundWith(stopper({ terminate, identity: async () => current, retryEveryMs: 40, pollEveryMs: 30 }))
			await vi.advanceTimersByTimeAsync(30) // Sighted at 30 ms: the old page, too early to ask again.
			await vi.advanceTimersByTimeAsync(20)
			current = OLD + 1 // The successor wakes mid-sleep, at 50 ms.
			await vi.advanceTimersByTimeAsync(10) // At 60 ms the retry is due — and the sighting comes first.
			await stopping
			expect(endedWhile).toEqual([OLD])
		} finally {
			vi.useRealTimers()
		}
	})

	test("nothing is started once the budget has run out, even by a step that was in flight", async () => {
		vi.useFakeTimers()
		try {
			let release: (outcome: string) => void = () => {}
			const terminate = () =>
				new Promise<string>((resolve) => {
					release = resolve
				})
			const identity = vi.fn(async () => OLD)
			const rejected = expect(stopBackgroundWith(stopper({ terminate, identity, budgetMs: 50 }))).rejects.toThrow(/still alive/)
			await vi.advanceTimersByTimeAsync(50) // The budget runs out while the ask is still in flight.
			await rejected
			release("terminated")
			await vi.advanceTimersByTimeAsync(100)
			expect(identity).toHaveBeenCalledTimes(1)
		} finally {
			vi.useRealTimers()
		}
	})

	test("a failed probe licenses no further ask, however long it keeps failing", async () => {
		let probes = 0
		const identity = async () => {
			probes++
			if (probes === 1) return OLD
			if (probes < 15) throw new Error("the frame script never answered")
			return undefined
		}
		const terminate = vi.fn(async () => "terminated")
		await stopBackgroundWith(stopper({ terminate, identity }))
		expect(terminate).toHaveBeenCalledTimes(1)
	})

	test("a probe that keeps failing rejects with its error, at the budget", async () => {
		let first = true
		const identity = async () => {
			if (first) {
				first = false
				return OLD
			}
			throw new Error("can't access dead object")
		}
		await expect(stopBackgroundWith(stopper({ identity }))).rejects.toThrow(/still alive 0\.4s.*last probe: can't access dead object/)
	})

	test("a probe that never settles cannot outlast the budget", async () => {
		let first = true
		const identity = () => {
			if (!first) return new Promise<number | undefined>(() => {})
			first = false
			return Promise.resolve(OLD)
		}
		const started = Date.now()
		await expect(stopBackgroundWith(stopper({ identity }))).rejects.toThrow(/still alive/)
		expect(Date.now() - started).toBeLessThan(1_500)
	})

	test("no background, or an outcome other than terminated, rejects by name without waiting", async () => {
		const terminate = vi.fn(async () => "no-extension")
		await expect(stopBackgroundWith(stopper({ terminate, identity: async () => undefined }))).rejects.toThrow(/runs no background page/)
		expect(terminate).not.toHaveBeenCalled()
		await expect(stopBackgroundWith(stopper({ terminate }))).rejects.toThrow(/did not terminate the background page \(no-extension\)/)
	})
})

/** Serialised source as Firefox receives it, run alone: a dependency left behind throws here. The
 *  value crosses as JSON, as the relay's entry crosses the BiDi socket. */
function runSerialised(source: string, call: string, bindings: Record<string, unknown>): unknown {
	return JSON.parse(JSON.stringify(runInNewContext(`${source}\n${call}`, bindings) ?? null))
}

describe("the page-error relay", () => {
	test("an exception is a page error and any other error-level message a console error, as on Chrome", () => {
		const kind = (hasException: boolean) => runSerialised(String(kindOf), "kindOf(message)", { message: { hasException } })
		expect(kind(true)).toBe("javascript")
		expect(kind(false)).toBe("console")
	})

	describe("the entry relayed for a record", () => {
		const frame = { url: "moz-extension://uuid/assets/popup.js", functionName: "boot", lineNumber: 0, columnNumber: 4 }
		const record = { kind: "javascript", topId: 7, text: "Error: boom", args: [], timeStamp: 1700, callFrames: [frame] }
		const entryFor = (r: unknown, context = "ctx-1") =>
			runSerialised(RELAY_HELPERS, "logEntryFor(record, context)", { record: r, context })
		const common = { level: "error", source: { realm: "", context: "ctx-1" }, timestamp: 1700, stackTrace: { callFrames: [frame] } }

		test("a page error is a javascript entry of its page's context", () => {
			expect(entryFor(record)).toEqual({ type: "javascript", text: "Error: boom", ...common })
		})

		test("a console error carries the method and its arguments as string values", () => {
			expect(entryFor({ ...record, kind: "console", text: "a b", args: ["a", "b"] })).toEqual({
				type: "console",
				method: "error",
				args: [
					{ type: "string", value: "a" },
					{ type: "string", value: "b" },
				],
				text: "a b",
				...common,
			})
		})

		test.each([
			["a record that is no object", null, "ctx-1"],
			["kind", { ...record, kind: "warning" }, "ctx-1"],
			["topId", { ...record, topId: "7" }, "ctx-1"],
			["timeStamp", { ...record, timeStamp: undefined }, "ctx-1"],
			["text", { ...record, text: 42 }, "ctx-1"],
			["args", { ...record, args: [1] }, "ctx-1"],
			["callFrames", { ...record, callFrames: [{ ...frame, lineNumber: "0" }] }, "ctx-1"],
			["context", record, ""],
		])("is refused for a malformed %s", (_field, malformed, context) => {
			expect(entryFor(malformed, context)).toBeNull()
		})
	})

	describe("the close verdict", () => {
		const extension = (childId: number) => ({ childId, remoteType: "extension" })
		const web = (childId: number) => ({ childId, remoteType: "web" })
		const parent = { childId: 0, remoteType: null }
		const read = (state: object, live: object[]) => ({
			state: JSON.stringify({ faultCount: 0, faults: [], extensionProcesses: [3], ...state }),
			live,
		})

		test("is clean when nothing faulted and the live extension process reported ready", () => {
			expect(relayVerdict(read({ ready: [extension(3), web(4)] }, [parent, extension(3), web(4)]))).toBeUndefined()
		})

		test("stays clean once a ready extension process has exited", () => {
			expect(relayVerdict(read({ ready: [extension(3)] }, [parent, web(4)]))).toBeUndefined()
		})

		test("fails on a fault, with its reason", () => {
			expect(relayVerdict(read({ faultCount: 1, faults: ["relay: boom"], ready: [extension(3)] }, [extension(3)]))).toBe(
				"it faulted 1 time(s): relay: boom",
			)
		})

		test("fails on a live extension process that never reported ready", () => {
			expect(relayVerdict(read({ ready: [extension(3)] }, [extension(3), extension(5)]))).toBe(
				"extension process(es) 5 ran without the listener",
			)
		})

		test("fails on an extension process that exited without reporting ready", () => {
			expect(relayVerdict(read({ ready: [extension(3)], extensionProcesses: [3, 5] }, [parent, extension(3)]))).toBe(
				"extension process(es) 5 ran without the listener",
			)
		})

		test("fails when no extension process ever reported ready, even with none live", () => {
			expect(relayVerdict(read({ ready: [web(4)], extensionProcesses: [] }, [parent, web(4)]))).toBe(
				"no extension process reported the listener ready",
			)
		})

		test("fails on a read that came back malformed", () => {
			const state = { faultCount: 0, faults: [], ready: [extension(3)], extensionProcesses: [3] }
			const badReady = JSON.stringify({ ...state, ready: [{ childId: "3", remoteType: "extension" }] })
			const badSeen = JSON.stringify({ ...state, extensionProcesses: ["3"] })
			const unseen = JSON.stringify({ faultCount: 0, faults: [], ready: [extension(3)] })
			for (const bad of [
				undefined,
				{ state: null, live: [] },
				{ state: "{", live: [] },
				...[badReady, badSeen, unseen].map((s) => ({ state: s, live: [] })),
			]) {
				expect(relayVerdict(bad)).toMatch(/^its state could not be read/)
			}
		})

		test("fails, without rejecting, on a read that failed", async () => {
			const session = { chromeScript: () => Promise.reject(new Error("no such window")) } as unknown as WebDriverSession
			await expect(checkPageErrorRelay(session)).resolves.toEqual({
				verdict: "its state could not be read (no such window)",
				exceptions: [],
			})
		})
	})
})
