import { basename } from "node:path"
import type { Browser, Page, Target, Viewport } from "puppeteer"
import { acceptLists, PENDING_FILE_INPUT } from "../file-accept"
import { chromeDriver } from "./chrome"
import { firefoxDriver } from "./firefox"
import { type BrowserKind, resolveBrowserKind } from "./selection"
import { standingInterceptions } from "./standing-interception"

export type { BrowserKind }

export interface LaunchOptions {
	/** Unpacked extension directory, as the run's global setup resolved it. */
	extensionPath: string
	/** Persists profile state across launches, which is what makes a relaunch a real cold boot. */
	userDataDir?: string
	headless: boolean
	/** `false` drops the fixed window size a driver launches with; only Chrome's launch has one. */
	fixedWindowSize?: boolean
	/** Route every request for an outside host to the egress guard on this loopback port, but the
	 *  `liveHosts`, which go direct. */
	egress?: { guardPort: number; liveHosts?: readonly string[] }
	/** A permission request from a real click is granted with no prompt, which no protocol can
	 *  answer. Chrome ignores it: its `permissions.remove` refuses a required host permission, so no
	 *  spec there reaches a withheld one to grant. */
	grantPermissionRequests?: true
	/** Install through the browser's own install call, not at launch, so `reinstallExtension` can
	 *  swap the build in place. Firefox always installs so; Chrome then loads it over CDP. */
	installInSession?: true
}

export interface LaunchedBrowser {
	browser: Browser
	/** Releases everything this launch owns, browser process included. */
	close(): Promise<void>
}

export interface VirtualAuthenticator {
	/**
	 * Fails the next passkey step in `page` the way a dismissed prompt fails it, with the browser's
	 * own `NotAllowedError`. The returned call lets the steps after it succeed again.
	 */
	refuseNextStep(page: Page): Promise<() => Promise<void>>
	/** Removes every authenticator this setup added. Safe once the pages that held them are gone. */
	cleanup(): Promise<void>
}

export type RpcInterception = { kind: "refuse" } | { kind: "redirect"; to: string }

export interface ArmedInterception {
	/** Requests intercepted so far. */
	hits: () => Promise<number>
	/** Every arming or reply failure on a request this interception must control. A test checks
	 *  this after its scenario: a request that escaped to the real endpoint is a failed test,
	 *  however the scenario itself came out. */
	failures: () => Promise<string[]>
	stop: () => Promise<void>
}

export interface HeldInterception extends ArmedInterception {
	/** Whether the launch's own interception is armed now: false while a kill or a spec's interception
	 *  has the origin, while it re-arms, after a failed re-arm and after `stop()`. */
	holding: () => boolean
}

/** How `answerRequests` answers a request: a JSON body with its status, or a refused connection. */
export type RequestAnswer = { status: number; body: unknown } | "refused"

export interface AnsweredRequests {
	/**
	 * How many requests for `url` the page has sent since the answer was armed, answered or not.
	 * Rejects once any answer has failed, or once the count can no longer be read.
	 */
	hits(url: string): Promise<number>
}

/**
 * The documents hosting the PXE — Chrome's offscreen document, Firefox's background-page frame —
 * and each one's own `visibilityState`. Visibility is what keeps a document's timers unthrottled.
 */
export interface PxeHostState {
	count: number
	visibility: string[]
}

/** A tab or window `waitForNewTab` found. */
export interface OpenedTab {
	close(): Promise<void>
}

export interface BrowserDriver {
	readonly kind: BrowserKind
	/** Extension URL scheme, trailing `//` included. */
	readonly scheme: string
	/**
	 * Whether a WebAuthn credential made on one extension page can still be used once that page has
	 * closed. Chrome's virtual authenticator is attached to the page that anchors it and dies with
	 * it; Firefox's belongs to the session. A spec that has to close every extension page before a
	 * background kill reads this to know whether its ceremony may move to a fresh popup.
	 */
	readonly credentialOutlivesPage: boolean
	/**
	 * Whether `stopBackground` ends the background while an extension page stays open. Chrome stops
	 * its service worker under any page; Firefox will not end an event page that one keeps busy, so a
	 * spec there closes every extension page before a restart.
	 */
	readonly stopsBackgroundUnderOpenPage: boolean
	/**
	 * How many resident credentials one virtual authenticator keeps; a create past it is refused at
	 * once with `NotAllowedError`, as a dismissed prompt is. Chrome's CTAP2 virtual device stores
	 * three and CDP has no option to raise it; Firefox's keeps every one.
	 */
	readonly residentCredentialSlots: number
	/**
	 * Hosts this browser reaches on its own on every run, whatever the wallet does, each with why.
	 * The egress guard refuses them without failing a launch. Exact names, never a domain, so a wallet
	 * dependency that calls a new host under a vendor's domain still fails the run.
	 */
	readonly ownHosts: ReadonlyMap<string, string>
	launch(opts: LaunchOptions): Promise<LaunchedBrowser>
	/** `path` starts at the package root: `/src/popup/index.html#/windows/execute`. */
	extensionUrl(extensionId: string, path: string): string
	/** Every page the suite opens comes from here: where a browser puts a new tab is not neutral. */
	newPage(browser: Browser): Promise<Page>
	/**
	 * The host part of the extension's own URLs, once it is installed. Chrome derives it from the
	 * service-worker target; Firefox MV3 runs a background *script* and has no such target, and
	 * its id is a per-profile UUID that only appears once one of the add-on's own contexts exists.
	 */
	discoverExtensionId(browser: Browser): Promise<string>
	/**
	 * Load one of the extension's own pages into `page`, resolving once its DOM is ready. Firefox
	 * swaps the tab into the extension process on the way, and a BiDi `navigate` across that swap
	 * arrives but strands the `Page` on a dead context — so this cannot be a bare `page.goto`.
	 */
	gotoExtensionPage(page: Page, url: string): Promise<void>
	/** Reload an extension page in place. Over BiDi a reload strands the `Page` just as a navigation does. */
	reloadExtensionPage(page: Page): Promise<void>
	/**
	 * An extension page with `chrome.*` for the launch fixture to settle the extension through, whose
	 * lifetime no onboarding state decides: both browsers honour the `window.close()` that the popup
	 * and the onboarding page call when they redirect. Both drivers load the setup page, static text
	 * that no product code opens, so deleting it as dead code fails every launch.
	 */
	openScratchPage(browser: Browser, extensionId: string): Promise<Page>
	/**
	 * Resolve with the first target matching `predicate`, or reject after `timeout` ms. Over BiDi a
	 * window is born `about:blank` and its URL arrives in a later event that re-announces no target,
	 * so Puppeteer's own `waitForTarget` never matches a URL there, while `targets()` reads it as it
	 * stands. On Firefox the rejection also reports the browser's own windows.
	 */
	waitForTarget(browser: Browser, predicate: (target: Target) => boolean, timeout: number): Promise<Target>
	/**
	 * Run `open`, then resolve with the tab or window it opened, or reject once `timeout` ms pass after
	 * it without one. Nothing else may open a tab or window meanwhile: being new is what identifies it.
	 * For a tab the browser opens by itself, such as a modified click's, which Firefox's BiDi can leave
	 * unannounced for good, so `targets()` never lists it.
	 */
	waitForNewTab(browser: Browser, open: () => Promise<void>, timeout: number): Promise<OpenedTab>
	/**
	 * Answer every request the browser makes to `fromOrigin` — whichever of the extension's
	 * contexts issues it — without touching the network. Resolves once no request can escape. With
	 * `backgroundDown`, a killed background's successor may not run yet; it is armed before it does.
	 */
	interceptRpc(
		browser: Browser,
		extensionId: string,
		fromOrigin: string,
		mode: RpcInterception,
		backgroundDown?: boolean,
	): Promise<ArmedInterception>
	/**
	 * Answer the requests `page` itself sends for each exact URL in `answers`, before any connection
	 * starts; every other request goes out. Lives as long as the page, once per page. Firefox 157 and
	 * later refuse Puppeteer's page interception on an extension page.
	 */
	answerRequests(page: Page, answers: ReadonlyMap<string, RequestAnswer>): Promise<AnsweredRequests>
	/**
	 * Select `page`'s tab and focus its window. Firefox 157 and later refuse Puppeteer's
	 * `bringToFront` on an extension page.
	 */
	bringToFront(page: Page): Promise<void>
	/**
	 * Size `page`'s viewport, or with `null` give it its window's size. Firefox 157 and later refuse
	 * Puppeteer's `setViewport` on an extension page; Firefox's resize resolves once the page reads
	 * the size, and refuses `deviceScaleFactor`, `isMobile`, `isLandscape` and `hasTouch` by name.
	 */
	setViewport(page: Page, viewport: Viewport | null): Promise<void>
	/** The viewport last set on `page`, by `setViewport` or by Puppeteer's `newPage`; `null` once reset, or never set. */
	viewportOf(page: Page): Viewport | null
	/**
	 * Runs before every scripted click. The suite clicks from inside the page, which — unlike a
	 * person's click — neither focuses the window nor, on every browser, counts as a user gesture.
	 */
	prepareClick(page: Page): Promise<void>
	/**
	 * Runs before keys pressed at `page` once the wallet has opened a window from it, after that
	 * window shows its page, and resolves once `page` has focus. Headless Firefox focuses every window
	 * the wallet opens, and a key sent to a page whose window lost focus reaches its focused element
	 * with no default action: Space on a button fires keydown and keyup but no click. A person goes
	 * back to the popup before pressing it.
	 */
	prepareKeys(page: Page): Promise<void>
	/**
	 * Two primary presses at viewport point (`x`, `y`), the second `gapMs` after the first's release,
	 * which the page sees as one double-click: `detail` 1, then 2. CDP takes the count as given;
	 * Firefox counts presses only inside one action chain, and restarts the count on any pointer move.
	 */
	doubleClick(page: Page, x: number, y: number, gapMs: number): Promise<void>
	/** Answer the file picker that `open` asks for with `filePath`. `open` is a scripted click. */
	pickFile(page: Page, open: () => Promise<void>, filePath: string): Promise<void>
	/** A PRF-capable virtual authenticator. `anchorPage` matters where one is scoped to a page. */
	virtualAuthenticator(browser: Browser, anchorPage: Page): Promise<VirtualAuthenticator>
	/**
	 * With no authenticator left, make the next `credentials.get` on `page` stay pending until its
	 * caller aborts it. Chrome already waits for an authenticator that never comes.
	 */
	holdNextCredentialGet(page: Page): Promise<void>
	/**
	 * Read from an open extension page. The count comes from the browser (`runtime.getContexts` on
	 * Chrome, the background page's frames on Firefox), the visibility from each host document.
	 */
	pxeHostState(page: Page): Promise<PxeHostState>
	/**
	 * From an open extension page, close the document hosting the PXE where it outlives the
	 * background: Chrome's offscreen document, whose clients reconnect to a stopped worker and so wake
	 * it within a second. Firefox's frame is the background page's own and ends with it. Rejects on
	 * Chrome when no offscreen document is open.
	 */
	closePxeHost(page: Page): Promise<void>
	/**
	 * End the extension's background — Chrome's service worker, Firefox's event page — and resolve
	 * once THAT instance is gone; every other extension page and `storage.session` stay. Chrome starts
	 * a successor within milliseconds, Firefox only on the add-on's next event, so a caller that needs
	 * one running waits for it (`waitForWorkerLiveness`) after doing something that wakes it.
	 * Close every extension page first: Firefox will not end an event page that one keeps busy.
	 * Rejects by name when no background runs, or when it outlives the call.
	 */
	stopBackground(browser: Browser, extensionId: string): Promise<void>
	/**
	 * Let the extension restart itself (`runtime.reload()`) and come back, as a store install does.
	 * Chrome checks an unpacked extension again when it reloads and, with developer mode off,
	 * leaves it disabled; Firefox reloads a temporary add-on in place.
	 */
	allowSelfRestart(browser: Browser): Promise<void>
	/**
	 * The running background's `performance.timeOrigin`, or undefined while none runs; a newer value
	 * is a new instance. After a restart Chrome can list the dead worker's target beside its
	 * successor's, and attaching to the dead one never answers.
	 */
	backgroundOrigin(browser: Browser, extensionId: string): Promise<number | undefined>
	/** Whether a background instance runs right now. Both browsers reap an idle one. */
	backgroundAlive(browser: Browser, extensionId: string): Promise<boolean>
	/**
	 * Run `body`, the source of a function body, in the running background with the globals the
	 * extension's own code holds there, and resolve with the JSON value it returns. Rejects when no
	 * background runs, or with the message `body` throws.
	 */
	evaluateInBackground<T>(browser: Browser, extensionId: string, body: string): Promise<T>
	/**
	 * Install `extensionPath` again in the running browser, over the build installed from it, which
	 * the browser treats as an update: `runtime.onInstalled` reason `update`, the same id and storage.
	 * Closing and relaunching over a replaced directory reports `install` on both browsers instead.
	 * Chrome needs a launch with `installInSession`: under `--load-extension` its reload blocks the
	 * extension.
	 */
	reinstallExtension(browser: Browser, extensionPath: string): Promise<void>
	/**
	 * How this driver's protocol words "the window went away under the call", beyond the CDP
	 * phrases the fixtures already match. An approval window closes itself on the click that
	 * resolves it, so that error is the expected end of a click there, not a failure.
	 */
	readonly targetGone?: RegExp
}

const DRIVERS: Partial<Record<BrowserKind, BrowserDriver>> = { chrome: chromeDriver, firefox: firefoxDriver }

/** `resolveBrowserKind` has already rejected anything unsupported, so a kind with no entry here
 *  means this registry drifted from that list — which must fail, never fall back to Chrome. */
function selectDriver(): BrowserDriver {
	const kind = resolveBrowserKind()
	const selected = DRIVERS[kind]
	if (!selected) throw new Error(`NULO_E2E_BROWSER=${kind} is supported but has no registered driver`)
	return selected
}

export const driver = selectDriver()
export const BROWSER: BrowserKind = driver.kind
export const EXTENSION_SCHEME = driver.scheme
export const isFirefox = BROWSER === "firefox"
export const credentialOutlivesPage = driver.credentialOutlivesPage
export const stopsBackgroundUnderOpenPage = driver.stopsBackgroundUnderOpenPage
export const residentCredentialSlots = driver.residentCredentialSlots
/** What the egress guard checks a launch's record against: whose traffic it is, and which of it is the browser's own. */
export const browserTraffic = { browser: driver.kind, ownHosts: driver.ownHosts }

/** Why a whole file does not run on Firefox: a capability the browser lacks — never a failing test. */
export const CHROME_ONLY = {
	backgroundKillUnderPage: "ends the background under an open extension page; Firefox will not end an event page one keeps busy",
	cdpFetch: "arms CDP Fetch interception on held targets; BiDi has no equivalent",
} as const

/** Why a test does not run on Chrome: a state headless Chrome cannot be driven into — never a failing test. */
export const FIREFOX_ONLY = {
	windowRefocus: "refocuses an approval popup; headless Chrome moves focus only by creating a window",
	toolbarPanel: "drives the toolbar popup itself, which no protocol opens on Chrome",
	permissionRequest: "withholds and re-grants a required host permission, which Chrome's permissions.remove refuses",
	sidebar: "drives Firefox's sidebar (sidebar_action); Chrome's side panel is another API, which the suite does not open",
} as const

/** The launch a background call is made against; every `ExtensionContext` is one. */
export interface BackgroundOwner {
	browser: Browser
	extensionId: string
}

export const extensionUrl = (extensionId: string, path: string): string => driver.extensionUrl(extensionId, path)
export const launchBrowser = (opts: LaunchOptions): Promise<LaunchedBrowser> => driver.launch(opts)
export const reinstallExtension = (browser: Browser, extensionPath: string): Promise<void> =>
	driver.reinstallExtension(browser, extensionPath)
export const newPage = (browser: Browser): Promise<Page> => driver.newPage(browser)
export const discoverExtensionId = (browser: Browser): Promise<string> => driver.discoverExtensionId(browser)
export const gotoExtensionPage = (page: Page, url: string): Promise<void> => driver.gotoExtensionPage(page, url)
export const reloadExtensionPage = (page: Page): Promise<void> => driver.reloadExtensionPage(page)
export const isTargetGone = (text: string): boolean => driver.targetGone?.test(text) ?? false
export const waitForTarget = (browser: Browser, predicate: (target: Target) => boolean, timeout: number): Promise<Target> =>
	driver.waitForTarget(browser, predicate, timeout)
export const waitForNewTab = (browser: Browser, open: () => Promise<void>, timeout: number): Promise<OpenedTab> =>
	driver.waitForNewTab(browser, open, timeout)
const standing = standingInterceptions<Browser>((browser, extensionId, fromOrigin, mode, backgroundDown) =>
	driver.interceptRpc(browser, extensionId, fromOrigin, mode, backgroundDown),
)
/** A spec's interception; on an origin the launch holds, it replaces the launch's until `stop()`. */
export const interceptRpc = (
	browser: Browser,
	extensionId: string,
	fromOrigin: string,
	mode: RpcInterception,
): Promise<ArmedInterception> => standing.intercept(browser, extensionId, fromOrigin, mode)
/** An interception the launch holds for its life; a spec's own on the same origin suspends it. */
export const holdRpcInterception = (
	browser: Browser,
	extensionId: string,
	fromOrigin: string,
	mode: RpcInterception,
): Promise<HeldInterception> => standing.hold(browser, extensionId, fromOrigin, mode)
export const answerRequests = (page: Page, answers: ReadonlyMap<string, RequestAnswer>): Promise<AnsweredRequests> =>
	driver.answerRequests(page, answers)
export const openScratchPage = (browser: Browser, extensionId: string): Promise<Page> => driver.openScratchPage(browser, extensionId)
export const bringToFront = (page: Page): Promise<void> => driver.bringToFront(page)
export const setViewport = (page: Page, viewport: Viewport | null): Promise<void> => driver.setViewport(page, viewport)
export const viewportOf = (page: Page): Viewport | null => driver.viewportOf(page)
export const prepareClick = (page: Page): Promise<void> => driver.prepareClick(page)
export const prepareKeys = (page: Page): Promise<void> => driver.prepareKeys(page)
export const doubleClick = (page: Page, x: number, y: number, gapMs: number): Promise<void> => driver.doubleClick(page, x, y, gapMs)
/** Answers the picker `open` asks for with `filePath`, once the picker's `accept` lists that file:
 *  a person's chooser offers only the files it lists until they ask for every file. */
export const pickFile = (page: Page, open: () => Promise<void>, filePath: string): Promise<void> =>
	driver.pickFile(
		page,
		async () => {
			await open()
			await expectPickerLists(page, filePath)
		},
		filePath,
	)

async function expectPickerLists(page: Page, filePath: string): Promise<void> {
	const pending = await page.waitForFunction(
		(selector: string) => {
			const inputs = document.querySelectorAll<HTMLInputElement>(selector)
			return inputs.length > 0 && { accept: inputs[inputs.length - 1].accept }
		},
		{ timeout: 10_000 },
		PENDING_FILE_INPUT,
	)
	const { accept } = (await pending.jsonValue()) as { accept: string }
	await pending.dispose()
	if (!acceptLists(accept, basename(filePath))) throw new Error(`the picker's accept "${accept}" does not list ${basename(filePath)}`)
}
export const virtualAuthenticator = (browser: Browser, anchorPage: Page): Promise<VirtualAuthenticator> =>
	driver.virtualAuthenticator(browser, anchorPage)
export const holdNextCredentialGet = (page: Page): Promise<void> => driver.holdNextCredentialGet(page)
export const pxeHostState = (page: Page): Promise<PxeHostState> => driver.pxeHostState(page)
export const closePxeHost = (page: Page): Promise<void> => driver.closePxeHost(page)
export const stopBackground = (owner: BackgroundOwner): Promise<void> =>
	standing.whileReleased(owner.browser, () => driver.stopBackground(owner.browser, owner.extensionId))
export const allowSelfRestart = (browser: Browser): Promise<void> => driver.allowSelfRestart(browser)
export const backgroundOrigin = (owner: BackgroundOwner): Promise<number | undefined> =>
	driver.backgroundOrigin(owner.browser, owner.extensionId)
export const backgroundAlive = (owner: BackgroundOwner): Promise<boolean> => driver.backgroundAlive(owner.browser, owner.extensionId)
/** Runs `run`, which ends the background, with the launch's interceptions let go as `stopBackground`
 *  does, and re-arms them after it for the background that replaces it. */
export const withInterceptionsReleased = <T>(owner: BackgroundOwner, run: () => Promise<T>): Promise<T> =>
	standing.whileReleased(owner.browser, run)
/** Stops a live background; false, with a warning, when the browser already stopped it. A failed
 *  kill still throws. */
export const stopBackgroundIfAlive = async (owner: BackgroundOwner): Promise<boolean> => {
	if (!(await backgroundAlive(owner))) {
		console.warn("[stopBackgroundIfAlive] no live background: the browser already stopped it")
		return false
	}
	await stopBackground(owner)
	return true
}
export const evaluateInBackground = <T>(owner: BackgroundOwner, body: string): Promise<T> =>
	driver.evaluateInBackground<T>(owner.browser, owner.extensionId, body)
