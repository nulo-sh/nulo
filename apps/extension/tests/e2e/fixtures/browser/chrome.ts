// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { Browser, CDPSession, Page, Target } from "puppeteer"
import puppeteer from "puppeteer"
import { cdpInterceptRpc } from "./chrome-rpc-intercept"
import { cdpVirtualAuthenticator } from "./chrome-webauthn"
import type { AnsweredRequests, BrowserDriver, LaunchOptions, LaunchedBrowser, PxeHostState, RequestAnswer } from "./index"
import { EGRESS_CANARY_HOST } from "../egress-guard"

const SCHEME = "chrome-extension://"

/** The page's own interception over CDP, which sees the requests of the page and its frames. */
async function answerRequests(page: Page, answers: ReadonlyMap<string, RequestAnswer>): Promise<AnsweredRequests> {
	const hits = new Map<string, number>()
	const faults: string[] = []
	await page.setRequestInterception(true)
	page.on("request", (req) => {
		const url = req.url()
		const how = answers.get(url)
		if (how === undefined) return req.continue()
		hits.set(url, (hits.get(url) ?? 0) + 1)
		const answered =
			how === "refused"
				? req.abort("connectionrefused")
				: req.respond({ status: how.status, contentType: "application/json", body: JSON.stringify(how.body) })
		answered.catch((err: unknown) => faults.push(`${url}: ${err instanceof Error ? err.message : String(err)}`))
	})
	return {
		hits: async (url) => {
			if (faults.length > 0) throw new Error(`answerRequests: ${faults.join("; ")}`)
			return hits.get(url) ?? 0
		},
	}
}

/** The offscreen document is a target of its own, so its visibility is read in it over CDP. */
async function pxeHostState(page: Page): Promise<PxeHostState> {
	const count = await page.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length)
	const documentUrl = `${SCHEME}${new URL(page.url()).hostname}/src/offscreen/index.html`
	const visibility: string[] = []
	for (const target of page.browser().targets()) {
		if (target.url().split("?")[0] !== documentUrl) continue
		const session = await target.createCDPSession()
		try {
			const { result } = await session.send("Runtime.evaluate", { expression: "document.visibilityState", returnByValue: true })
			visibility.push(String(result.value))
		} finally {
			await session.detach().catch(() => {})
		}
	}
	return { count, visibility }
}

/**
 * Every request for an outside host goes to the guard, and Chrome resolves no outside name.
 * `<-loopback>` drops Chrome's implicit bypasses, link-local addresses among them, and the entries
 * after it put loopback back on the direct path. `MAP *` also captures IP literals, the guard's own
 * address included, hence the excludes; `::1` matches only unbracketed. The canary name resolves to
 * loopback, which only a direct path would use. Each live host is bypassed and excluded by its
 * exact name, so the live hosts alone of the outside names go direct and resolve.
 */
export function egressGuardArgs(guardPort: number, liveHosts: readonly string[] = []): string[] {
	const bypass = liveHosts.map((host) => `;${host}`).join("")
	const exclude = liveHosts.map((host) => `, EXCLUDE ${host}`).join("")
	return [
		`--proxy-server=http://127.0.0.1:${guardPort}`,
		`--proxy-bypass-list=<-loopback>;localhost;127.0.0.1;[::1]${bypass}`,
		`--host-resolver-rules=MAP ${EGRESS_CANARY_HOST} 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1${exclude}`,
	]
}

/** Browsers launched to load their extension over CDP, the only ones `reinstallExtension` may swap. */
const installedInSession = new WeakSet<Browser>()

async function launch({
	extensionPath,
	userDataDir,
	headless,
	fixedWindowSize = true,
	egress,
	installInSession,
}: LaunchOptions): Promise<LaunchedBrowser> {
	// Headless `true` supports MV3 extensions — offscreen documents, the service worker,
	// `chrome.storage` and `chrome.runtime.Port` all work.
	const browser = await puppeteer.launch({
		headless,
		...(userDataDir ? { userDataDir } : {}),
		// CDP's `Extensions.loadUnpacked` answers only over a pipe, behind the unsafe-debugging switch,
		// and an extension it loads is not restored at the next launch.
		...(installInSession ? { pipe: true, enableExtensions: true } : { ignoreDefaultArgs: ["--disable-extensions"] }),
		args: [
			...(installInSession
				? ["--enable-unsafe-extension-debugging"]
				: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]),
			"--no-sandbox",
			"--disable-setuid-sandbox",
			// Headless Chrome's size flag overrides the dimensions `windows.create` asks for.
			...(fixedWindowSize ? ["--window-size=400,600"] : []),
			// Keep a shown page that is not focused rendering: without these flags Chrome
			// backgrounds its renderer, which freezes Vue's `<Transition>` classes mid-enter.
			// They do not make a tab behind another draw: it runs no frame until brought to front.
			"--disable-renderer-backgrounding",
			"--disable-backgrounding-occluded-windows",
			"--disable-features=CalculateNativeWinOcclusion",
			// Chrome asks its autofill server about every form a page shows (the playground's among
			// them), an outside host no test needs.
			"--disable-features=AutofillServerCommunication",
			...(egress ? egressGuardArgs(egress.guardPort, egress.liveHosts) : []),
		],
		// The default 180s is not enough for a cold first run: argon2 unlock plus the bb.js wasm
		// boot can hold a CDP reply past it while the worker pool has the host under memory
		// pressure, and the call then times out on work that did complete.
		protocolTimeout: 300_000,
	})
	if (installInSession) {
		try {
			await browser.installExtension(extensionPath)
		} catch (err) {
			await browser.close().catch(() => {})
			throw err
		}
		installedInSession.add(browser)
	}
	// Chrome owns nothing outside its own process tree, so closing the browser is the whole
	// teardown. A driver that also owns a WebDriver process reaps it here instead.
	return { browser, close: () => browser.close() }
}

async function reinstallExtension(browser: Browser, extensionPath: string): Promise<void> {
	if (!installedInSession.has(browser)) throw new Error("reinstallExtension needs a Chrome launch with installInSession")
	await browser.installExtension(extensionPath)
}

const STOP_WORKER_BUDGET_MS = 15_000
const WORKER_PROBE_BUDGET_MS = 2_000

/** The worker global's creation time: only a new worker instance produces a newer value. The
 *  whole probe — attach included, since Puppeteer's attach carries the 300 s protocol timeout — races
 *  the budget. An attached session is released the moment the budget expires (a session left on a
 *  stopping worker is the very hazard `stopBackground` exists to avoid), and one that attaches
 *  after expiry is released without evaluating. Release is requested, never awaited: the caller's
 *  budget must not depend on Chrome answering a detach. */
async function readWorkerTimeOrigin(target: Target, budgetMs: number): Promise<number> {
	let session: CDPSession | undefined
	let expired = false
	const release = () => session?.detach().catch(() => {})
	const probe = (async () => {
		session = await target.createCDPSession()
		if (expired) throw new Error("worker probe attached after its budget")
		const { result } = await session.send("Runtime.evaluate", { expression: "performance.timeOrigin", returnByValue: true })
		return Number(result.value)
	})()
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			expired = true
			release()
			reject(new Error("worker probe timed out"))
		}, budgetMs)
	})
	try {
		return await Promise.race([probe, timeout])
	} finally {
		if (timer) clearTimeout(timer)
		probe.then(release, release)
	}
}

const isServiceWorkerOf = (extensionId: string) => (t: Target) => t.type() === "service_worker" && t.url().includes(extensionId)

/** MV3 reaps an idle worker, so "none right now" is an answer a caller may have to tolerate. */
const backgroundAlive = async (browser: Browser, extensionId: string): Promise<boolean> =>
	browser.targets().some(isServiceWorkerOf(extensionId))

/**
 * Terminate the extension's service worker and wait until the ORIGINAL worker instance is gone.
 *
 * Chrome parks a stopped worker's DevTools host while any session is attached and hands that host
 * to the worker's next start; an MV3 extension worker restarts within milliseconds of stopping. A
 * stop issued through an attached session (Puppeteer's `worker.close()`) therefore often leaves
 * the restarted worker under the original target id, and `targetdestroyed` never fires. So the
 * stop is an UNATTACHED `Target.closeTarget` from the browser session, and "gone" has two proofs:
 * the identity-keyed `targetdestroyed` (the fast path), or — because a session this helper does
 * not own, such as Puppeteer's own auto-attach on every worker start, can still park the host —
 * a newer `performance.timeOrigin` on whichever worker target is live. The fallback probes attach
 * only after a normal destroy would long have landed; a still-stopping worker met by that attach is
 * parked, not resurrected, and cannot yield a newer origin. `Runtime.terminateExecution` is not an
 * alternative — it leaves the worker running.
 */
async function stopBackground(browser: Browser, extensionId: string): Promise<void> {
	const isExtensionWorker = isServiceWorkerOf(extensionId)
	const swTarget = await browser.waitForTarget(isExtensionWorker, { timeout: STOP_WORKER_BUDGET_MS })
	const originBefore = await readWorkerTimeOrigin(swTarget, WORKER_PROBE_BUDGET_MS)

	let settled = false
	let onDestroyed: (target: Target) => void = () => {}
	const destroyed = new Promise<void>((resolve) => {
		onDestroyed = (target) => {
			if (target === swTarget) resolve()
		}
	})
	browser.on("targetdestroyed", onDestroyed)

	const browserSession = await browser.target().createCDPSession()
	let deadlineTimer: ReturnType<typeof setTimeout> | undefined
	try {
		// The id comes from the browser's own target list (public protocol), matched on the same
		// predicate as the Target above, so no private `_targetId` read is needed.
		const { targetInfos } = await browserSession.send("Target.getTargets")
		const info = targetInfos.find((t) => t.type === "service_worker" && t.url.includes(extensionId))
		if (!info) throw new Error("stopBackground: the browser lists no service-worker target for the extension")
		const { success } = await browserSession.send("Target.closeTarget", { targetId: info.targetId })
		if (!success) throw new Error("stopBackground: Target.closeTarget reported failure")

		const restarted = (async () => {
			await new Promise((r) => setTimeout(r, 2_000))
			while (!settled) {
				const live = browser.targets().find(isExtensionWorker)
				const origin = live ? await readWorkerTimeOrigin(live, WORKER_PROBE_BUDGET_MS).catch(() => undefined) : undefined
				if (origin !== undefined && origin > originBefore) return
				await new Promise((r) => setTimeout(r, 250))
			}
		})()
		const deadline = new Promise<never>((_, reject) => {
			deadlineTimer = setTimeout(
				() =>
					reject(
						new Error(
							`stopBackground: the service-worker target was still alive ${STOP_WORKER_BUDGET_MS / 1000}s after close()`,
						),
					),
				STOP_WORKER_BUDGET_MS,
			)
		})
		// One race, so a probe stuck in a CDP round trip can neither hide the destroy event nor
		// outlive the budget.
		await Promise.race([destroyed, restarted, deadline])
	} finally {
		settled = true
		if (deadlineTimer) clearTimeout(deadlineTimer)
		browser.off("targetdestroyed", onDestroyed)
		browserSession.detach().catch(() => {})
	}
}

/** Over CDP, which the extension's CSP does not govern. The session is gone before this resolves:
 *  one left attached would park the worker's host through a later stop (see `stopBackground`). */
async function evaluateInBackground<T>(browser: Browser, extensionId: string, body: string): Promise<T> {
	const worker = browser.targets().find(isServiceWorkerOf(extensionId))
	if (!worker) throw new Error("evaluateInBackground: no service worker runs for the extension")
	const session = await worker.createCDPSession()
	try {
		const { result, exceptionDetails } = await session.send("Runtime.evaluate", {
			expression: `(function () { ${body} })()`,
			returnByValue: true,
		})
		if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
		return result.value as T
	} finally {
		await session.detach().catch(() => {})
	}
}

async function backgroundOrigin(browser: Browser, extensionId: string): Promise<number | undefined> {
	const workers = browser.targets().filter(isServiceWorkerOf(extensionId))
	const origins = await Promise.all(workers.map((t) => readWorkerTimeOrigin(t, WORKER_PROBE_BUDGET_MS).catch(() => undefined)))
	const answered = origins.filter((origin): origin is number => origin !== undefined)
	return answered.length > 0 ? Math.max(...answered) : undefined
}

/** Developer mode is a profile setting with no launch flag; the extensions page's own API sets it. */
async function allowSelfRestart(browser: Browser): Promise<void> {
	const page = await browser.newPage()
	try {
		await page.goto("chrome://extensions", { waitUntil: "domcontentloaded" })
		await page.evaluate("chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true })")
	} finally {
		await page.close()
	}
}

/** The MV3 service worker is the first extension context Chrome starts, and its URL carries the id. */
async function discoverExtensionId(browser: Browser): Promise<string> {
	const worker = await browser.waitForTarget(
		(target) => target.type() === "service_worker" && target.url().includes("service-worker-loader"),
		{ timeout: 30_000 },
	)
	return new URL(worker.url()).hostname
}

/**
 * Seen at the egress guard with or without `--disable-component-update`, all but the download
 * redirector on every launch.
 */
export const CHROME_OWN_HOSTS: ReadonlyMap<string, string> = new Map([
	["accounts.google.com", "account sign-in state"],
	["android.clients.google.com", "device check-in"],
	["clients2.google.com", "extension and component update checks"],
	["redirector.gvt1.com", "the component updater's download redirector"],
	["update.googleapis.com", "the component updater"],
	["www.google.com", "the default search provider's preconnect"],
])

export const chromeDriver: BrowserDriver = {
	kind: "chrome",
	scheme: SCHEME,
	credentialOutlivesPage: false,
	stopsBackgroundUnderOpenPage: true,
	residentCredentialSlots: 3,
	ownHosts: CHROME_OWN_HOSTS,
	launch,
	reinstallExtension,
	extensionUrl: (extensionId, path) => `${SCHEME}${extensionId}${path}`,
	newPage: (browser) => browser.newPage(),
	discoverExtensionId,
	gotoExtensionPage: async (page, url) => {
		await page.goto(url, { waitUntil: "domcontentloaded" })
	},
	reloadExtensionPage: async (page) => {
		await page.reload({ waitUntil: "domcontentloaded" })
	},
	waitForTarget: (browser, predicate, timeout) => browser.waitForTarget(predicate, { timeout }),
	waitForNewTab: async (browser, open, timeout) => {
		const before = new Set(browser.targets())
		await open()
		const target = await browser.waitForTarget((t) => t.type() === "page" && !before.has(t), { timeout })
		return { close: async () => (await target.asPage()).close() }
	},
	interceptRpc: (browser, extensionId, fromOrigin, mode, backgroundDown) =>
		cdpInterceptRpc(browser, `${SCHEME}${extensionId}/`, fromOrigin, mode, backgroundDown),
	answerRequests,
	bringToFront: (page) => page.bringToFront(),
	setViewport: (page, viewport) => page.setViewport(viewport),
	viewportOf: (page) => page.viewport(),
	// Chrome treats evaluated script as a user gesture and has no focused-window precondition.
	prepareClick: async () => {},
	// Chrome runs a key's default action on the page the key is sent to, focused or not.
	prepareKeys: async () => {},
	doubleClick: async (page, x, y, gapMs) => {
		// Through Puppeteer's mouse first, so its record of where the pointer stands stays true.
		await page.mouse.move(x, y)
		const cdp = await page.createCDPSession()
		const press = async (clickCount: number) => {
			await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount })
			await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount })
		}
		try {
			await press(1)
			await new Promise((resolve) => setTimeout(resolve, gapMs))
			await press(2)
		} finally {
			await cdp.detach().catch(() => undefined)
		}
	},
	pickFile: async (page, open, filePath) => {
		const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 10_000 }), open()])
		await chooser.accept([filePath])
	},
	virtualAuthenticator: cdpVirtualAuthenticator,
	holdNextCredentialGet: async () => {},
	pxeHostState,
	closePxeHost: (page) => page.evaluate(() => chrome.offscreen.closeDocument()),
	stopBackground,
	allowSelfRestart,
	backgroundOrigin,
	backgroundAlive,
	evaluateInBackground,
	openScratchPage: async (browser, extensionId) => {
		const page = await browser.newPage()
		try {
			await page.goto(`${SCHEME}${extensionId}/src/setup/index.html#/install`, { waitUntil: "domcontentloaded" })
			return page
		} catch (err) {
			// The caller retries a detached frame with a fresh page and never sees this one.
			await page.close().catch(() => {})
			throw err
		}
	},
}
