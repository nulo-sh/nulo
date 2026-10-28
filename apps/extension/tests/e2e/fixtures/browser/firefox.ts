import { type ChildProcess, spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import type { Browser, Page, Target, Viewport } from "puppeteer"
import { reservePort } from "../../../../scripts/e2e/resolve-ports"
import { registeredPorts } from "../../port-registry"
import { type BiDiAttachment, attachPuppeteerOverBiDi } from "./bidi-attach"
import { LOCATE_BACKGROUND_PAGE, evaluateViaFrameScript } from "./firefox-frame-script"
import { E2E_FIREFOX_REVISION } from "./firefox-revision"
import { armPageErrorRelay, checkPageErrorRelay } from "./firefox-page-errors"
import { answerPageRequests } from "./firefox-answer-requests"
import { observeAndIntercept } from "./firefox-rpc-intercept"
import type { BrowserDriver, LaunchOptions, LaunchedBrowser, OpenedTab, PxeHostState, VirtualAuthenticator } from "./index"
import { launchEnv, ownedProcesses, readStartTime } from "../../owned-processes"
import {
	type LaunchOwnership,
	disownProfile,
	newLaunchMarker,
	newProfileDir,
	ownedByThisRun,
	reapOrphanLaunches,
	recordLaunch,
	releaseLaunch,
} from "./ownership"
import { WebDriverSession } from "./webdriver-classic"
import { EGRESS_CANARY_HOST } from "../egress-guard"
import { PENDING_FILE_INPUT } from "../file-accept"
import { PollTimeoutError, pollUntil } from "../poll"

const SCHEME = "moz-extension://"

/** Extension-page WebAuthn landed in Firefox 150; 153 is the shipped manifest's `strict_min_version`. */
const MIN_MAJOR = 153

interface LaunchContext {
	/**
	 * The classic channel. Puppeteer's BiDi session has no WebAuthn module and no window handles, so
	 * the passkey fixtures and the window finders reach through here.
	 */
	session: WebDriverSession
	profileDir: string
	/** The manifest id, which is what `installAddon` returns — NOT the per-profile UUID. */
	addonId: string
	attachment: BiDiAttachment
	/** The latest contexts the silent-close watch reported closed, for a failed wait's report. */
	reportedClosed: ReportedClose[]
}

interface ReportedClose {
	context: string
	at: number
}

const REPORTED_CLOSES_KEPT = 20

/** Keyed by the `Browser` rather than carried on the shared launch interface, so nothing
 *  Chrome-side has to know this channel exists. */
const contexts = new WeakMap<Browser, LaunchContext>()

function contextFor(browser: Browser): LaunchContext {
	const context = contexts.get(browser)
	if (!context) throw new Error("no WebDriver classic session for this browser — is it a Firefox launch?")
	return context
}

export const classicSessionFor = (browser: Browser): WebDriverSession => contextFor(browser).session

/** What reaching a document outside every tab (the toolbar popup, the sidebar) takes: the privileged
 *  channel, and the id Firefox files the add-on under. */
export const actionPopupContext = (browser: Browser): Pick<LaunchContext, "session" | "addonId"> => contextFor(browser)

/**
 * Ends a session the launch refuses to keep: its Firefox holds this launch's profile. If the
 * session cannot be ended, that Firefox may carry a marker this launch cannot see, so the profile
 * is disowned — left on disk — rather than deleted under a live process.
 */
export async function abandonSession(
	session: Pick<WebDriverSession, "close">,
	record: LaunchOwnership,
	cause: unknown,
	disown: (record: LaunchOwnership) => void = disownProfile,
): Promise<never> {
	try {
		await session.close()
	} catch (closeErr) {
		disown(record)
		const text = (err: unknown) => (err instanceof Error ? err.message : String(err))
		throw new Error(`${text(cause)}; the session could not be ended (${text(closeErr)}), so ${record.profileDir} was left in place`, {
			cause,
		})
	}
	throw cause
}

/** One sweep per process, before the first launch claims ports or writes a record. */
let sweep: Promise<string[]> | undefined

async function launch({ extensionPath, userDataDir, headless, egress, grantPermissionRequests }: LaunchOptions): Promise<LaunchedBrowser> {
	sweep ??= reapOrphanLaunches()
	const reaped = await sweep
	if (reaped.length) console.warn(`[firefox] reaped ${reaped.length} orphaned launch(es): ${reaped.join(", ")}`)

	const marker = newLaunchMarker()
	// Built before anything exists to clean up, so every failure below has the same one way out.
	const record = ownedByThisRun({
		marker,
		pid: 0,
		profileDir: userDataDir ?? "",
		ownsProfile: userDataDir === undefined,
		label: "geckodriver",
	})
	try {
		// A caller-supplied directory belongs to the caller: a relaunch-on-the-same-profile test
		// exists to prove data survives teardown, so deleting it would destroy the fixture.
		if (!userDataDir) record.profileDir = newProfileDir(marker)
		const { profileDir } = record
		mkdirSync(profileDir, { recursive: true })
		// On disk before the spawn: a worker killed between the two would otherwise leave a marked
		// geckodriver no record names, which no sweep would ever look for.
		recordLaunch(record)

		const { gecko, base } = await spawnGeckodriver(marker)
		record.pid = gecko.pid
		record.pidStartTime = readStartTime(gecko.pid)
		record.label = `geckodriver:${base}`
		recordLaunch(record)

		const running = () => gecko.exitCode === null && gecko.signalCode === null
		const session = await WebDriverSession.open(base, capabilities({ profileDir, headless, egress, grantPermissionRequests }), running)
		try {
			assertVersion(session.capabilities.browserVersion)
			// Teardown owns a process by the marker in its environment. A Firefox that did not inherit
			// it would outlive every release unnoticed, so that is a launch failure, not a later leak.
			if (ownedProcesses(marker).length < 2)
				throw new Error("Firefox did not inherit the launch marker, so teardown could not own it")
			await armPageErrorRelay(session, extensionPath)
		} catch (err) {
			await abandonSession(session, record, err)
		}
		const addonId = await session.installAddon(extensionPath)
		const attachment = await attachPuppeteerOverBiDi(session.capabilities, session.sessionId)
		const { browser } = attachment
		const reportedClosed: ReportedClose[] = []
		contexts.set(browser, { session, profileDir, addonId, attachment, reportedClosed })
		const stopWatching = watchForSilentCloses(session, attachment, reportedClosed)
		let closing: Promise<void> | undefined
		return {
			browser,
			// Once: the relay's state is readable only while the session is open, and a second close
			// is the same teardown, so it answers with the first one's outcome.
			close: () => {
				closing ??= (async () => {
					stopWatching()
					let relay: string | undefined
					try {
						const report = await checkPageErrorRelay(session)
						relay = report.verdict
						if (report.exceptions.length > 0)
							console.warn(`[firefox] the add-on's latest exceptions: ${report.exceptions.join("; ")}`)
						// Disconnect first: the BiDi transport is a client of a session the classic channel
						// owns, and ending the session under it produces a socket error on the way out.
						await browser.disconnect().catch(() => {})
						await session.close().catch(() => {})
					} finally {
						await releaseLaunch(record)
					}
					if (relay) throw new Error(`Firefox page-error relay: ${relay}`)
				})()
				return closing
			},
		}
	} catch (err) {
		await releaseLaunch(record)
		throw err
	}
}

/**
 * The reservations skip every port the host registry lists, which another run may have claimed
 * but not bound yet, and are held until the moment before spawn. Another launch can still win a
 * port in that window; geckodriver then exits on the failed bind, which `WebDriverSession.open` reports
 * instead of opening a session on the winner's geckodriver.
 */
async function spawnGeckodriver(marker: string): Promise<{ gecko: ChildProcess & { pid: number }; base: string }> {
	const claimed = registeredPorts()
	const reserved = [await reservePort(claimed)]
	try {
		reserved.push(await reservePort(claimed))
	} finally {
		if (reserved.length < 2) await reserved[0].release()
	}
	const [http, bidi] = reserved
	await Promise.all([http.release(), bidi.release()])
	const gecko = spawn(
		geckodriverPath(),
		// Without system access Firefox limits remote navigation to web-safe schemes and refuses
		// `moz-extension://` on both channels; geckodriver rejects the Firefox-side flag when it
		// arrives through capabilities, so this is the only place it can be set.
		["--host", "127.0.0.1", "--port", String(http.port), "--websocket-port", String(bidi.port), "--allow-system-access"],
		// Detached so a signal to this run's own group — a Ctrl-C — cannot stop it half-way through a
		// session. The marker is how teardown finds it, and the Firefox that inherits it.
		{ detached: true, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, ...launchEnv(marker) } },
	)
	// Without a listener a missing binary surfaces as an unhandled `error` event, not a rejection.
	const failed = new Promise<never>((_, reject) =>
		gecko.once("error", (err) => reject(new Error(`geckodriver did not start: ${err.message}`))),
	)
	const started = new Promise<void>((resolve) => gecko.once("spawn", resolve))
	await Promise.race([started, failed])
	if (gecko.pid === undefined) throw new Error("geckodriver did not start")
	return { gecko: gecko as ChildProcess & { pid: number }, base: `http://127.0.0.1:${http.port}` }
}

/** `spawn` reports a missing binary as a bare ENOENT, which reads as a crash rather than a missing
 *  prerequisite. geckodriver is not installed by any repo script and is rarely on PATH. */
function geckodriverPath(): string {
	const configured = process.env.GECKODRIVER
	if (configured && !existsSync(configured)) throw new Error(`GECKODRIVER=${configured} does not exist`)
	return configured ?? "geckodriver"
}

/** Cache directories are `<platform>-<revision>`. The cache is shared by every checkout on the
 *  host, so "newest" would let another worktree's install change this one's browser. */
export const firefoxDirFor = (dirs: readonly string[], revision: string): string | undefined =>
	dirs.find((dir) => dir.endsWith(`-${revision}`))

/**
 * Puppeteer's `executablePath({ browser: "firefox" })` builds the path from the CHROME build id,
 * so it names a directory that was never installed and geckodriver rejects it as "not a Firefox
 * executable". Resolve from what the cache actually holds.
 */
function resolveFirefoxBinary(): string {
	const configured = process.env.FIREFOX_PATH
	if (configured) {
		if (!existsSync(configured)) throw new Error(`FIREFOX_PATH=${configured} does not exist`)
		return configured
	}
	const root = path.join(process.env.PUPPETEER_CACHE_DIR ?? path.join(homedir(), ".cache", "puppeteer"), "firefox")
	const installed = (existsSync(root) ? readdirSync(root) : []).filter((dir) => existsSync(path.join(root, dir, "firefox", "firefox")))
	const pinned = firefoxDirFor(installed, E2E_FIREFOX_REVISION)
	if (!pinned) {
		throw new Error(
			`Firefox ${E2E_FIREFOX_REVISION} is not installed under ${root} — run \`bun scripts/e2e/install-firefox.ts\` from apps/extension, or set FIREFOX_PATH`,
		)
	}
	return path.join(root, pinned, "firefox", "firefox")
}

/**
 * Every pref the suite launches Firefox with. Exported so a unit test can hold the list to what the
 * wallet's users run with: a pref that masks timer throttling would hide the slowdown the PXE host
 * is placed in the background page to avoid.
 */
export const FIREFOX_LAUNCH_PREFS = {
	// Without both of these the virtual authenticator is never consulted and
	// `credentials.create` never settles — it does not fail, it hangs.
	"security.webauth.webauthn_enable_softtoken": true,
	"security.webauth.webauthn_enable_usbtoken": false,
}

/**
 * Every request for a host other than loopback goes to the guard, with no `DIRECT` after it and no
 * fail-over, so a dead guard fails a request rather than sending it out. The canary name resolves to
 * loopback, which only a direct path would use. Each live host, compared exactly, goes direct and
 * resolves as usual. An empty train-hop base URL is New Tab's off state for the add-on update a Nimbus
 * enrollment names, which Firefox 158 fetches from archive.mozilla.org on a fresh profile. All prefs,
 * since `failover_direct` and `localDomains` have no capability form, and kept out of
 * `FIREFOX_LAUNCH_PREFS`, which holds what users run with.
 */
export function egressGuardPrefs(guardPort: number, liveHosts: readonly string[] = []): Record<string, string | number | boolean> {
	const live = liveHosts.map((host) => `\n\tif (host === ${JSON.stringify(host)}) return "DIRECT";`).join("")
	const pac = `function FindProxyForURL(url, host) {
	if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return "DIRECT";${live}
	return "PROXY 127.0.0.1:${guardPort}";
}`
	return {
		"network.proxy.type": 2,
		"network.proxy.autoconfig_url": `data:text/javascript,${encodeURIComponent(pac)}`,
		"network.proxy.failover_direct": false,
		"network.dns.localDomains": EGRESS_CANARY_HOST,
		"browser.newtabpage.trainhopAddon.xpiBaseURL": "",
	}
}

/**
 * `permissions.request` still needs the click's user input under this pref; it only skips the
 * doorhanger. Kept out of `FIREFOX_LAUNCH_PREFS`, since users are asked.
 */
export const permissionRequestPrefs = { "extensions.webextOptionalPermissionPrompts": false }

export function capabilities({
	profileDir,
	headless,
	egress,
	grantPermissionRequests,
}: {
	profileDir: string
	headless: boolean
	egress?: LaunchOptions["egress"]
	grantPermissionRequests?: LaunchOptions["grantPermissionRequests"]
}): Record<string, unknown> {
	return {
		// Asks geckodriver for a BiDi endpoint on the session it owns, which is what makes one
		// browser drivable from both channels at once.
		webSocketUrl: true,
		"moz:firefoxOptions": {
			binary: resolveFirefoxBinary(),
			args: ["-profile", profileDir, ...(headless ? ["-headless"] : [])],
			prefs: {
				...FIREFOX_LAUNCH_PREFS,
				...(egress ? egressGuardPrefs(egress.guardPort, egress.liveHosts) : {}),
				...(grantPermissionRequests ? permissionRequestPrefs : {}),
			},
		},
	}
}

function assertVersion(browserVersion: string): void {
	const major = Number.parseInt(browserVersion, 10)
	if (Number.isNaN(major) || major < MIN_MAJOR) {
		throw new Error(`Firefox ${browserVersion} is below the ${MIN_MAJOR} floor this suite and the shipped manifest require`)
	}
	console.log(`[firefox] ${browserVersion}`)
}

/**
 * Firefox mints a per-profile UUID for every add-on and serves its pages from that, not from the
 * manifest id — so the id this suite needs exists nowhere until the add-on is loaded, and
 * `installAddon`'s return value is the wrong one. The profile's own pref map is the authority;
 * an open add-on page is the fallback for the window before Firefox has flushed prefs to disk.
 */
export function uuidFromPrefs(prefsText: string, addonId: string): string | undefined {
	const pref = /user_pref\("extensions\.webextensions\.uuids",\s*"((?:[^"\\]|\\.)*)"\);/.exec(prefsText)
	if (!pref?.[1]) return undefined
	try {
		return (JSON.parse(JSON.parse(`"${pref[1]}"`) as string) as Record<string, string>)[addonId]
	} catch {
		// A half-flushed prefs.js is a normal race, not a failure: the caller polls.
		return undefined
	}
}

function hostFromPrefs({ profileDir, addonId }: LaunchContext): string | undefined {
	const prefs = path.join(profileDir, "prefs.js")
	return existsSync(prefs) ? uuidFromPrefs(readFileSync(prefs, "utf8"), addonId) : undefined
}

/** Reading a handle's URL switches to it, so this is second: it costs the caller's focus. */
async function hostFromWindows({ session }: LaunchContext): Promise<string | undefined> {
	const open = (await session.windowsWithUrls()).find((window) => window.url.startsWith(SCHEME))
	return open && new URL(open.url).hostname
}

async function discoverExtensionId(browser: Browser): Promise<string> {
	const context = contextFor(browser)
	const host = await pollUntil(
		async () => hostFromPrefs(context) ?? (await hostFromWindows(context).catch(() => undefined)),
		(host) => Boolean(host),
		{ label: `a per-profile UUID for ${context.addonId} in prefs.js or an open ${SCHEME} window`, timeoutMs: 30_000, intervalMs: 250 },
	)
	return host as string
}

/**
 * A classic window handle and a BiDi browsing-context id are the same string in Firefox — both come
 * from the tab's id — which is what lets a `Page` be addressed on the classic channel at all.
 * Puppeteer keeps the id on an internal field, so a rename there must fail here, not navigate
 * whichever window happens to be current.
 */
function contextIdOf(page: Page): string {
	const id = (page.mainFrame() as unknown as { _id?: unknown })._id
	if (typeof id !== "string" || !id) throw new Error("puppeteer no longer exposes the BiDi context id on Frame._id")
	return id
}

async function gotoExtensionPage(page: Page, url: string): Promise<void> {
	await classicSessionFor(page.browser()).navigateWindow(contextIdOf(page), url)
}

async function reloadExtensionPage(page: Page): Promise<void> {
	await classicSessionFor(page.browser()).refreshWindow(contextIdOf(page))
}

/**
 * A new *tab* goes into the most recently focused window, which can be one the wallet opened — an
 * approval window — rather than the suite's own. A page there is not the active tab, which WebAuthn
 * requires, and may never be visible: no animation frames, so every Vue transition freezes
 * half-way. A window of its own is visible whatever the wallet has opened.
 */
const newPage = (browser: Browser): Promise<Page> => browser.newPage({ type: "window" })

async function openScratchPage(browser: Browser, extensionId: string): Promise<Page> {
	const page = await newPage(browser)
	await gotoExtensionPage(page, `${SCHEME}${extensionId}/src/setup/index.html#/install`)
	return page
}

/** Firefox 157 and later refuse BiDi `activate` on an extension page; Marionette's own switch focuses any tab. */
const bringToFront = (page: Page): Promise<void> => classicSessionFor(page.browser()).selectWindow(contextIdOf(page))

/** Puppeteer's `viewport()` never hears of a resize made around it, so the seam keeps its own record, `null` included. */
export function viewportRecord(): { set(page: Page, viewport: Viewport | null): void; of(page: Page): Viewport | null } {
	const sizes = new WeakMap<Page, Viewport | null>()
	return {
		set: (page, viewport) => sizes.set(page, viewport),
		of: (page) => (sizes.has(page) ? (sizes.get(page) ?? null) : page.viewport()),
	}
}

const viewports = viewportRecord()

/** The size a tab's `<browser>` can take; a field it cannot honour throws rather than being dropped. */
export function tabSize(viewport: Viewport | null): { width: number; height: number } | null {
	if (!viewport) return null
	const { width, height, ...rest } = viewport
	const unsupported = Object.entries(rest).flatMap(([key, value]) => (value === undefined ? [] : [key]))
	if (unsupported.length > 0) throw new Error(`setViewport: Firefox's resize sets no ${unsupported.join(", ")}`)
	return { width, height }
}

/**
 * Firefox's own `browsingContext.setViewport` body, run in its scope: the tab's `<browser>` takes the
 * size, or with `null` loses it and takes its window's. Returns the size the page will read, or `gone`.
 */
const RESIZE_TAB = `function (id, width, height) {
	const { NavigableManager } = ChromeUtils.importESModule("chrome://remote/content/shared/NavigableManager.sys.mjs");
	const browser = NavigableManager.getBrowserById(id);
	if (!browser) return "gone";
	if (width === null) {
		width = browser.parentElement.clientWidth;
		height = browser.parentElement.clientHeight;
		browser.style.removeProperty("width");
		browser.style.removeProperty("height");
	} else {
		browser.style.setProperty("width", width + "px");
		browser.style.setProperty("height", height + "px");
	}
	browser.ownerDocument.synchronouslyUpdateRemoteBrowserDimensions(/* includeInactive */ true);
	return width + "x" + height;
}`

const VIEWPORT_SETTLE_MS = 10_000

type BiDiSend = (method: string, params: object) => Promise<unknown>

/** Puppeteer keeps its BiDi session on internal fields; a rename there must fail by name. */
function bidiSendOf(page: Page): BiDiSend {
	const frame = page.mainFrame() as unknown as {
		browsingContext?: {
			userContext?: { browser?: { session?: { send?: (method: string, params: object) => Promise<{ result?: unknown }> } } }
		}
	}
	const session = frame.browsingContext?.userContext?.browser?.session
	const send = session?.send
	if (typeof send !== "function") throw new Error("puppeteer no longer exposes its BiDi session on Frame.browsingContext")
	return async (method, params) => (await send.call(session, method, params)).result
}

type BiDiArgument = { type: "null" } | { type: "number"; value: number } | { type: "string"; value: string }

/**
 * Calls `declaration` in the oldest of Firefox's own windows over BiDi and resolves with what it
 * returns. Unlike `chromeScript`, it switches no window, so the page holding focus keeps it. A throw
 * rejects with its message.
 */
async function callInFirefoxScope(page: Page, declaration: string, args: BiDiArgument[]): Promise<unknown> {
	const send = bidiSendOf(page)
	const tree = (await send("browsingContext.getTree", { "moz:scope": "chrome", maxDepth: 0 })) as { contexts?: { context: string }[] }
	const scope = tree.contexts?.[0]?.context
	if (!scope) throw new Error("Firefox lists no window of its own")
	const outcome = (await send("script.callFunction", {
		functionDeclaration: declaration,
		target: { context: scope },
		arguments: args,
		awaitPromise: false,
		resultOwnership: "none",
	})) as { result?: { value?: unknown }; exceptionDetails?: { text?: string } }
	if (outcome.exceptionDetails) throw new Error(outcome.exceptionDetails.text ?? "the call threw")
	return outcome.result?.value
}

/**
 * Firefox 157 and later refuse BiDi `setViewport` on an extension page, so the resize runs from
 * Firefox's own scope.
 */
async function setViewport(page: Page, viewport: Viewport | null): Promise<void> {
	const size = tabSize(viewport)
	const number = (value: number | undefined): BiDiArgument => (value === undefined ? { type: "null" } : { type: "number", value })
	const read = await callInFirefoxScope(page, RESIZE_TAB, [
		{ type: "string", value: contextIdOf(page) },
		number(size?.width),
		number(size?.height),
	]).catch((err: unknown) => {
		throw new Error(`setViewport: ${err instanceof Error ? err.message : String(err)}`)
	})
	if (read === "gone") throw new Error(`setViewport: no such window ${contextIdOf(page)}`)
	const match = typeof read === "string" ? /^(\d+)x(\d+)$/.exec(read) : null
	if (!match) throw new Error(`setViewport: ${JSON.stringify(read)}`)
	// Recorded before the wait: the tab already has the size, whether or not the page reads it in time.
	viewports.set(page, viewport)
	const [width, height] = [Number(match[1]), Number(match[2])]
	await page
		.waitForFunction((w, h) => innerWidth === w && innerHeight === h, { timeout: VIEWPORT_SETTLE_MS, polling: 50 }, width, height)
		.catch((err: unknown) => {
			throw new Error(`setViewport: the page did not read ${width}×${height} within ${VIEWPORT_SETTLE_MS} ms`, { cause: err })
		})
}

/** Firefox reports a closed window as a missing browsing context per BiDi command, and as `no such window` on the classic channel. */
const TARGET_GONE =
	/no such window|no such frame|Browsing Context with id \S+ not found|DiscardedBrowsingContext|Browsing context already closed/i

/**
 * Headless Firefox hands focus to every window the wallet opens and refuses WebAuthn from any
 * window but the focused one. A person's click would have focused the page; a scripted one has to
 * be given that. A window that closed itself has nothing left to focus.
 */
const prepareClick = (page: Page): Promise<void> =>
	bringToFront(page).catch((err: unknown) => {
		if (!TARGET_GONE.test(err instanceof Error ? err.message : String(err))) throw err
	})

type BiDiPointerAction =
	| { type: "pointerMove"; x: number; y: number }
	| { type: "pointerDown" | "pointerUp"; button: number }
	| { type: "pause"; duration: number }

/** Puppeteer's BiDi mouse sends every `down` and `up` as a chain of its own, which Firefox never
 *  counts as one double-click, so the whole sequence goes out as one chain on the page's context. */
async function doubleClick(page: Page, x: number, y: number, gapMs: number): Promise<void> {
	const frame = page.mainFrame() as unknown as {
		browsingContext?: { performActions(sources: { type: "pointer"; id: string; actions: BiDiPointerAction[] }[]): Promise<void> }
	}
	if (!frame.browsingContext) throw new Error("doubleClick: the page's frame has no BiDi browsing context")
	const press: BiDiPointerAction[] = [
		{ type: "pointerDown", button: 0 },
		{ type: "pointerUp", button: 0 },
	]
	// Through Puppeteer's mouse first, so its record of where the pointer stands stays true; the chain
	// then drives the same input source, and a move to where it already stands changes nothing.
	await page.mouse.move(x, y)
	await frame.browsingContext.performActions([
		{
			type: "pointer",
			id: "__puppeteer_mouse",
			actions: [{ type: "pointerMove", x: Math.round(x), y: Math.round(y) }, ...press, { type: "pause", duration: gapMs }, ...press],
		},
	])
}

const KEYS_FOCUS_BUDGET_MS = 5_000
const KEYS_FOCUS_ATTEMPT_MS = 500

/**
 * Firefox raises a window it opens once more as it starts loading that window's page, which undoes
 * a bringToFront made in between; so `page` is brought forward again until it reports focus.
 */
async function prepareKeys(page: Page): Promise<void> {
	const focus = async () => {
		await bringToFront(page)
		return page
			.waitForFunction(() => document.hasFocus(), { timeout: KEYS_FOCUS_ATTEMPT_MS, polling: 50 })
			.then(
				() => true,
				() => false,
			)
	}
	await pollUntil(focus, (focused) => focused, {
		label: "prepareKeys: the page taking focus",
		timeoutMs: KEYS_FOCUS_BUDGET_MS,
		intervalMs: 0,
	})
}

const BACKGROUND_NOT_RUNNING = "the background page is not running"

/** Evaluates `body` (a function body; `content` is the background window) in the background page. */
export function evaluateInBackgroundPage<T>(browser: Browser, body: string): Promise<T> {
	const { session, addonId } = contextFor(browser)
	return evaluateViaFrameScript<T>(session, { addonId, locate: LOCATE_BACKGROUND_PAGE, missing: BACKGROUND_NOT_RUNNING }, body)
}

/** The PXE host is a frame of the background page: how many, and each frame's own visibility. */
const PXE_HOST_STATE = `
	const frames = [...content.document.querySelectorAll("iframe")];
	return { count: frames.length, visibility: frames.map((frame) => frame.contentDocument?.visibilityState ?? "unloaded") };`

export interface BackgroundIdentity {
	/** The background page's own `performance.timeOrigin`: a new value is a new page. */
	timeOrigin: number
	/** The `src` of every PXE host frame; the generation in its query names the frame. */
	hosts: string[]
}

const BACKGROUND_IDENTITY = `
	return { timeOrigin: content.performance.timeOrigin, hosts: [...content.document.querySelectorAll("iframe")].map((frame) => frame.src) };`

/** Rejects while the background page is not running. */
export const backgroundIdentity = (browser: Browser): Promise<BackgroundIdentity> => evaluateInBackgroundPage(browser, BACKGROUND_IDENTITY)

/**
 * `body` in the event page's own realm. A frame script sees the page through Xrays, which hide the
 * `chrome` the page's code holds, and the page's CSP refuses its `eval`; a sandbox with the page's
 * principal and the page, unwrapped, as its prototype sees those globals, and `evalInSandbox` is
 * not the page's `eval`. The sandbox stays alive: a function `body` leaves in the page runs in it.
 */
export const inPageRealm = (body: string) => `
	const sandbox = Components.utils.Sandbox(content, { sandboxPrototype: content, wantXrays: false });
	return JSON.parse(Components.utils.evalInSandbox(${JSON.stringify(`JSON.stringify((function () { ${body} })() ?? null)`)}, sandbox));`

/** The running background page's `timeOrigin`, or undefined while none runs. Any other failure is thrown. */
async function backgroundTimeOrigin(browser: Browser): Promise<number | undefined> {
	try {
		return (await backgroundIdentity(browser)).timeOrigin
	} catch (err) {
		if (err instanceof Error && err.message === BACKGROUND_NOT_RUNNING) return undefined
		throw err
	}
}

export interface BackgroundStopper {
	/** The running background's identity, or undefined while none runs. */
	identity(): Promise<number | undefined>
	/** Asks Firefox to end it, and resolves with Firefox's outcome word. */
	terminate(): Promise<string>
	/** The whole call, first read included. */
	budgetMs: number
	retryEveryMs: number
	pollEveryMs: number
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

interface StopProgress {
	expired: boolean
	lastError?: unknown
}

/** `unknown` is a probe that failed: the page unloads asynchronously after the termination resolves,
 *  so a failure proves nothing either way. */
type Sighting = "same" | "gone" | "unknown"

async function sight(stopper: BackgroundStopper, before: number, progress: StopProgress): Promise<Sighting> {
	try {
		return (await stopper.identity()) === before ? "same" : "gone"
	} catch (err) {
		progress.lastError = err
		return "unknown"
	}
}

async function askToEnd(stopper: BackgroundStopper): Promise<void> {
	const outcome = await stopper.terminate()
	if (outcome !== "terminated") throw new Error(`stopBackground: Firefox did not terminate the background page (${outcome})`)
}

/**
 * Every ask directly follows a sighting of the SAME page: an ask made on a stale or failed read could
 * land on a successor an add-on event woke in between, and the test would see two deaths for one.
 */
async function endObserved(stopper: BackgroundStopper, progress: StopProgress): Promise<void> {
	const before = await stopper.identity()
	if (before === undefined) throw new Error("stopBackground: the add-on runs no background page")
	let askAt = 0
	let sighting: Sighting = "same"
	while (!progress.expired && sighting !== "gone") {
		if (sighting === "same" && Date.now() >= askAt) {
			await askToEnd(stopper)
			askAt = Date.now() + stopper.retryEveryMs
		}
		await pause(stopper.pollEveryMs)
		// The caller already has its rejection by now; a probe begun here would race its teardown.
		if (!progress.expired) sighting = await sight(stopper, before, progress)
	}
	if (sighting !== "gone") throw new Error("stopBackground: the budget ran out before the background page was seen gone")
}

/**
 * The termination is a polite suspension: Firefox returns early — reporting success — while a
 * listener's promise is pending or an extension page keeps the background busy. So it is asked again
 * for as long as the same page is observed, and only an observation ends the wait: the page absent,
 * or a different one running. The budget is enforced from outside because a frame-script probe can
 * outlast it; a step already in flight cannot be recalled, but none starts after expiry.
 */
export async function stopBackgroundWith(stopper: BackgroundStopper): Promise<void> {
	const progress: StopProgress = { expired: false }
	let timer: ReturnType<typeof setTimeout> | undefined
	const budget = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			progress.expired = true
			const { lastError } = progress
			const probe =
				lastError === undefined ? "" : ` (last probe: ${lastError instanceof Error ? lastError.message : String(lastError)})`
			reject(
				new Error(
					`stopBackground: the background page was still alive ${stopper.budgetMs / 1000}s after termination — close every extension page first${probe}`,
				),
			)
		}, stopper.budgetMs)
	})
	try {
		await Promise.race([endObserved(stopper, progress), budget])
	} finally {
		progress.expired = true
		if (timer) clearTimeout(timer)
	}
}

/**
 * Ends the event page alone: every other extension page, the content scripts and `storage.session`
 * stay. Firefox starts a new one only on the add-on's next event, so this resolves on "the old page
 * is gone" and never waits for a successor — the caller's next step is what wakes one.
 */
const stopBackground = (browser: Browser): Promise<void> =>
	stopBackgroundWith({
		identity: () => backgroundTimeOrigin(browser),
		terminate: () => terminateBackground(browser),
		budgetMs: 15_000,
		retryEveryMs: 2_000,
		pollEveryMs: 100,
	})

/**
 * Firefox refuses a file picker without a user gesture, and an evaluated click is not one, so no
 * chooser event ever comes. The wallet appends its `<input type="file">` to the body before asking
 * for the picker and removes it on `change`, so the file goes straight into that pending input.
 * Over the classic channel: Firefox 157 and later refuse BiDi `input.setFiles` on an extension page.
 * The window it selects is the one the opening click's `prepareClick` selected.
 */
async function pickFile(page: Page, open: () => Promise<void>, filePath: string): Promise<void> {
	// An abandoned pick leaves its input behind, and the file would go to that dead request.
	await page.evaluate(() => {
		for (const stale of document.querySelectorAll('body > input[type="file"]')) stale.setAttribute("data-e2e-stale", "")
	})
	await open()
	await page.waitForSelector(PENDING_FILE_INPUT, { timeout: 10_000 })
	await classicSessionFor(page.browser()).setFileInput(contextIdOf(page), PENDING_FILE_INPUT, filePath)
}

export interface SessionAuthenticator extends VirtualAuthenticator {
	/** False refuses every ceremony that requires verification, as a person dismissing the prompt does. */
	setUserVerified(verified: boolean): Promise<void>
}

/**
 * BiDi has no WebAuthn module, so the authenticator is added over the classic channel. It is scoped
 * to the session rather than to a page, so one serves every window and — unlike Chrome's — a
 * credential outlives the window that created it.
 */
export async function sessionAuthenticator(browser: Browser): Promise<SessionAuthenticator> {
	const session = classicSessionFor(browser)
	const authenticatorId = await session.addVirtualAuthenticator({
		protocol: "ctap2_1",
		transport: "internal",
		hasResidentKey: true,
		hasUserVerification: true,
		isUserVerified: true,
		extensions: ["prf"],
	})
	return {
		cleanup: () => session.removeVirtualAuthenticator(authenticatorId).catch(() => {}),
		setUserVerified: (verified) => session.setUserVerified(authenticatorId, verified),
		async refuseNextStep() {
			await session.setUserVerified(authenticatorId, false)
			return () => session.setUserVerified(authenticatorId, true)
		},
	}
}

/**
 * Firefox answers a request it has no authenticator for at once, and nothing in WebDriver holds a
 * ceremony open, so the page's own `get` is replaced by one that settles only on the caller's
 * abort — which is the path a cancel takes.
 */
async function holdNextCredentialGet(page: Page): Promise<void> {
	await page.evaluate(() => {
		navigator.credentials.get = (options) =>
			new Promise((_, reject) => {
				const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"))
				// An aborted signal never fires the event again, so one aborted before this runs is lost.
				if (options?.signal?.aborted) abort()
				options?.signal?.addEventListener("abort", abort)
			})
	})
}

/** `targets()` is a synchronous read of Puppeteer's own map, so a tight poll costs no round trip. */
async function waitForTarget(browser: Browser, predicate: (target: Target) => boolean, timeout: number): Promise<Target> {
	try {
		const match = await pollUntil(
			async () => browser.targets().find(predicate),
			(match) => match !== undefined,
			{ label: "waitForTarget: a matching target", timeoutMs: timeout, intervalMs: 100 },
		)
		return match as Target
	} catch (error) {
		if (!(error instanceof PollTimeoutError)) throw error
		// The e2e-testing skill's triage rows key on this exact text.
		const failure = `waitForTarget: no matching target after ${timeout}ms`
		throw new Error(await withInventory(failure, () => windowInventory(browser), INVENTORY_BUDGET_MS))
	}
}

const INVENTORY_BUDGET_MS = 5_000

/** `failure`, then what `read` reports within `budgetMs` or why it reported nothing: a failed wait's
 *  report never replaces its failure, and never holds it past the budget. */
export async function withInventory(failure: string, read: () => Promise<string>, budgetMs: number): Promise<string> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const deadline = new Promise<string>((resolve) => {
		timer = setTimeout(() => resolve(`no inventory within ${budgetMs}ms`), budgetMs)
	})
	const report = read().catch((err: unknown) => `inventory failed: ${err instanceof Error ? err.message : String(err)}`)
	try {
		return `${failure}; ${await Promise.race([report, deadline])}`
	} finally {
		clearTimeout(timer)
	}
}

/**
 * Firefox's own windows beside what Puppeteer was told, read after a failed wait: a window BiDi
 * never announced, a page on the wrong URL and a window the watch reported closed each point at a
 * different cause. A caller may let a wait expire as an expected outcome and keep driving the
 * browser, so this switches no window and runs nothing privileged, either of which moves focus; the
 * add-on's exceptions are reported at the launch's close instead.
 */
async function windowInventory(browser: Browser): Promise<string> {
	const { session, attachment, reportedClosed } = contextFor(browser)
	const now = Date.now()
	const windows = await session.listWindows()
	const pages = browser
		.targets()
		.filter((target) => target.type() === "page")
		.map((target) => target.url())
	const closed = reportedClosed.map((close) => `${close.context} ${now - close.at}ms ago`)
	return [
		`Firefox's windows: ${listed(windows)}`,
		`BiDi's open contexts: ${listed(attachment.openContexts())}`,
		`Puppeteer's pages: ${listed(pages)}`,
		`reported closed by the watch: ${listed(closed)}`,
	].join("; ")
}

const listed = (items: readonly string[]): string => (items.length > 0 ? items.join(", ") : "none")

/**
 * The classic handle list, not `targets()`: BiDi announces a tab through its first browsing context
 * only, and sends nothing when that context is replaced before BiDi has seen its document, which a
 * link's tab can be.
 */
async function waitForNewTab(browser: Browser, open: () => Promise<void>, timeout: number): Promise<OpenedTab> {
	const session = classicSessionFor(browser)
	const before = new Set(await session.listWindows())
	await open()
	const handle = await pollUntil(
		async () => (await session.listWindows()).find((listed) => !before.has(listed)),
		(handle) => handle !== undefined,
		{ label: "waitForNewTab: a new tab or window", timeoutMs: timeout, intervalMs: 100 },
	)
	return { close: () => closeTab(session, handle as string) }
}

/** By handle, from Firefox's own scope: a classic close would switch to the tab first, which selects it. */
async function closeTab(session: WebDriverSession, handle: string): Promise<void> {
	const outcome = await session.chromeScript<string>(
		`const [id, done] = arguments;
		try {
			const { NavigableManager } = ChromeUtils.importESModule("chrome://remote/content/shared/NavigableManager.sys.mjs");
			const browser = NavigableManager.getBrowserById(id);
			if (!browser) return done("gone");
			const tabs = browser.getTabBrowser();
			tabs.removeTab(tabs.getTabForBrowser(browser));
			done("removing");
		} catch (err) { done("error: " + err); }`,
		[handle],
	)
	if (outcome !== "removing" && outcome !== "gone") throw new Error(`closeTab: ${outcome}`)
	// `removeTab` can return with the tab still open: a refused unload, or a last tab's window closing.
	await pollUntil(
		async () => (await session.listWindows()).includes(handle),
		(open) => !open,
		{ label: `closeTab: ${handle} closed after removeTab`, timeoutMs: 5_000, intervalMs: 100 },
	)
}

/**
 * A window that closes itself — every approval window does — is never reported over BiDi, so
 * Puppeteer would keep it in `targets()` and keep its page "open" for good. The classic handle
 * list is Firefox's own account of which windows exist; a context seen there and then missing from
 * two consecutive reads is reported closed. A window BiDi has just announced may not be in the
 * handle list yet, so one never seen there is given much longer before it is judged the same way.
 */
function watchForSilentCloses(session: WebDriverSession, attachment: BiDiAttachment, reported: ReportedClose[]): () => void {
	const watch: SilentCloseWatch = { listed: new Set(), misses: new Map() }
	let reading = false
	const timer = setInterval(async () => {
		if (reading) return
		reading = true
		try {
			const open = attachment.openContexts()
			const handles = new Set(await session.listWindows())
			for (const context of silentlyClosed(watch, open, handles)) {
				attachment.reportClosed(context)
				reported.push({ context, at: Date.now() })
				if (reported.length > REPORTED_CLOSES_KEPT) reported.shift()
			}
		} catch {
			// The session is closing or geckodriver is busy; the next tick reads again.
		} finally {
			reading = false
		}
	}, 150)
	timer.unref()
	return () => clearInterval(timer)
}

export interface SilentCloseWatch {
	listed: Set<string>
	misses: Map<string, number>
}

const LISTED_MISSES = 2
/** A window can open, be approved and close between two reads, so "never listed" cannot mean
 *  "never closed" — that target would be stale for good. It is given over a second instead, far
 *  longer than the handle list lags a window BiDi has already announced. */
const UNLISTED_MISSES = 8

/** One read of the handle list: the contexts that have now been missing from it long enough. `open`
 *  must have been taken BEFORE the read, or a window born during it counts a miss it never had. */
export function silentlyClosed(watch: SilentCloseWatch, open: readonly string[], handles: ReadonlySet<string>): string[] {
	const closed: string[] = []
	for (const context of open) {
		if (handles.has(context)) {
			watch.listed.add(context)
			watch.misses.delete(context)
			continue
		}
		const missed = (watch.misses.get(context) ?? 0) + 1
		watch.misses.set(context, missed)
		if (missed >= (watch.listed.has(context) ? LISTED_MISSES : UNLISTED_MISSES)) closed.push(context)
	}
	return closed
}

/**
 * Remote settings' startup sync, seen at the egress guard on every launch and retried after each
 * refusal. Setting `services.settings.server` to a dummy at launch, as the Remote Agent does once it
 * starts, did not stop it.
 */
export const FIREFOX_OWN_HOSTS: ReadonlyMap<string, string> = new Map([
	["content-signature-2.cdn.mozilla.net", "remote settings: collection signature checks"],
	["firefox-settings-attachments.cdn.mozilla.net", "remote settings: attachments"],
	["firefox.settings.services.mozilla.com", "remote settings: the collections"],
])

export const firefoxDriver: BrowserDriver = {
	kind: "firefox",
	scheme: SCHEME,
	credentialOutlivesPage: true,
	stopsBackgroundUnderOpenPage: false,
	residentCredentialSlots: Number.POSITIVE_INFINITY,
	ownHosts: FIREFOX_OWN_HOSTS,
	launch,
	// A temporary install over the installed add-on is an update to it; the UUID and storage stay.
	reinstallExtension: async (browser, extensionPath) => {
		await contextFor(browser).session.installAddon(extensionPath)
	},
	extensionUrl: (extensionId, path) => `${SCHEME}${extensionId}${path}`,
	discoverExtensionId,
	gotoExtensionPage,
	reloadExtensionPage,
	newPage,
	openScratchPage,
	waitForTarget,
	waitForNewTab,
	interceptRpc: (browser, _extensionId, fromOrigin, mode) => observeAndIntercept(classicSessionFor(browser), fromOrigin, mode),
	answerRequests: (page, answers) =>
		answerPageRequests(
			(declaration, args) =>
				callInFirefoxScope(
					page,
					declaration,
					args.map((value) => ({ type: "string", value })),
				),
			contextIdOf(page),
			answers,
		),
	bringToFront,
	setViewport,
	viewportOf: viewports.of,
	prepareClick,
	prepareKeys,
	doubleClick,
	pickFile,
	virtualAuthenticator: sessionAuthenticator,
	holdNextCredentialGet,
	pxeHostState: (page) => evaluateInBackgroundPage<PxeHostState>(page.browser(), PXE_HOST_STATE),
	closePxeHost: async () => {},
	stopBackground,
	allowSelfRestart: async () => {},
	backgroundOrigin: (browser) => backgroundTimeOrigin(browser),
	backgroundAlive: async (browser) => (await backgroundTimeOrigin(browser)) !== undefined,
	evaluateInBackground: (browser, _extensionId, body) => evaluateInBackgroundPage(browser, inPageRealm(body)),
	targetGone: TARGET_GONE,
}

/** Resolves with the outcome in one word — `terminated`, `no-extension` — or `error: …`. */
async function terminateBackground(browser: Browser): Promise<string> {
	const { session, addonId } = contextFor(browser)
	return session.chromeScript<string>(
		`const [id, done] = arguments;
		(async () => {
			try {
				const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
				const extension = ExtensionParent.GlobalManager.getExtension(id);
				if (!extension) return done("no-extension");
				await extension.terminateBackground({ ignoreDevToolsAttached: true });
				done("terminated");
			} catch (err) { done("error: " + err); }
		})();`,
		[addonId],
	)
}
