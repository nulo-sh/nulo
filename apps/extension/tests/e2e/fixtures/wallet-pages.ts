// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { type ConsoleMessage, type Page, TimeoutError } from "puppeteer"
import { bringToFront, extensionUrl, gotoExtensionPage, newPage, setViewport } from "./browser"
import { isFrameDetachError, patchPagePolling } from "./dom"
import type { ExtensionContext } from "./extension"
import { type LegalSeed, LEGAL_ACCEPTANCE_KEY, legalSeedValue } from "./legal"
import { pageErrorOf } from "./page-errors"
import { PRESTO_HTTPS_HEALTH_URL, PRESTO_HTTP_HEALTH_URL } from "./presto"

/**
 * Chrome reports a refused loopback probe as a "Failed to load resource" console error. The
 * wallet probes Presto on the onboarding step and on every settings open, and a box without
 * Presto (every smoke runner, the plaintext-only CI prover on the HTTPS port) refuses it by
 * design — that is the browser's report of a probe the wallet expects to fail, not an
 * extension error. Only a refused connection to the two exact health URLs is exempt; a 500,
 * a certificate failure, or any other URL still counts.
 */
export function isPrestoProbeNoise(msg: ConsoleMessage): boolean {
	if (!msg.text().startsWith("Failed to load resource") || !msg.text().includes("net::ERR_CONNECTION_REFUSED")) return false
	const url = msg.location().url
	return url === PRESTO_HTTPS_HEALTH_URL || url === PRESTO_HTTP_HEALTH_URL
}

/** Put the acceptance record in the named state, from any extension page. The service reads storage
 *  on every call, so a write here is seen by the very next admission check. */
export async function seedLegalAcceptance(page: Page, seed: Exclude<LegalSeed, "keep">): Promise<void> {
	await page.evaluate(
		async ({ key, value }: { key: string; value: unknown }) => {
			if (value === undefined) await chrome.storage.local.remove(key)
			else await chrome.storage.local.set({ [key]: value })
		},
		{ key: LEGAL_ACCEPTANCE_KEY, value: legalSeedValue(seed) },
	)
}

/** Open the onboarding tab directly. Use in tests that exercise the tab
 *  flow; complementary to `openPopup` which targets the popup HTML.
 *  Clears the `onboardingCompleted` flag first so the redirect predicates
 *  in register/import/profile-new behave as they would on a fresh install. */
export async function openOnboarding(ctx: ExtensionContext, opts: { legal?: Exclude<LegalSeed, "keep"> } = {}): Promise<Page> {
	// Reset onboardingCompleted=false so the onboarding flow runs as on
	// fresh install (launchExtension seeded it to true by default).
	const setupPage = await newPage(ctx.browser)
	patchPagePolling(setupPage)
	await gotoExtensionPage(setupPage, extensionUrl(ctx.extensionId, "/src/popup/index.html"))
	// A real fresh install has no acceptance; specs that are about the gate ask for that. Left alone,
	// the launch's `current` seed stands and a spec about a later step can still jump to it.
	// Seeded BEFORE the flag flips: the popup reads the flag while it mounts, and on a profile with
	// no wallet a `false` makes it open the onboarding tab and close itself — so the flip is the
	// last thing evaluated in it, and it may already be gone when this closes it.
	if (opts.legal) await seedLegalAcceptance(setupPage, opts.legal)
	await setupPage.evaluate(async () => {
		await chrome.storage.local.set({ "nulo:onboarding:completed": false })
	})
	await setupPage.close().catch(() => {})

	const page = await newPage(ctx.browser)
	patchPagePolling(page)
	await setViewport(page, { width: 720, height: 900 })
	await bringToFront(page)

	ctx.consoleErrors = []
	ctx.pageErrors = []

	recordPageErrors(ctx, page)

	const url = extensionUrl(ctx.extensionId, "/src/onboarding/index.html#/onboarding/welcome")
	await gotoExtensionPage(page, url)
	// Wait for Vue mount: welcome CTA must render.
	await page.waitForSelector('[data-testid="onboarding-welcome-create"]', { visible: true, timeout: 30_000 })
	return page
}

/** Open the extension popup in a new page with error collection. */
export async function openPopup(ctx: ExtensionContext): Promise<Page> {
	// One bounded retry on frame-detach errors: under accumulated suite load,
	// `browser.newPage()` can return a page whose CDP frame is in a half-
	// initialized state, causing the first `page.goto(popupUrl)` to throw
	// "Navigating frame was detached" immediately. The mitigation is simply
	// to close and re-create the page. A broader catch would mask real
	// crashes — match only on known detach-error signatures.
	let attempt = 0
	const maxAttempts = 2
	for (;;) {
		try {
			return await openPopupOnce(ctx)
		} catch (err) {
			attempt += 1
			if (attempt >= maxAttempts || !isFrameDetachError(err)) throw err
			if (process.env.NULO_E2E_OPENPOPUP_LOG === "1") {
				console.log(`[openPopup] retry-on-detach attempt=${attempt}`)
			}
		}
	}
}

async function openPopupOnce(ctx: ExtensionContext): Promise<Page> {
	const page = await newPage(ctx.browser)
	try {
		return await setUpPopupPage(ctx, page)
	} catch (err) {
		// The retry in `openPopup` re-creates the page, so this one must not be
		// left behind: a live target keeps its listeners and its extension
		// connections, which the next attempt then races.
		await page.close().catch(() => {})
		throw err
	}
}

const recorded = new WeakSet<Page>()

/** Records `page`'s errors into the launch's arrays from now on, once however often it is asked:
 *  `asPage()` hands every caller resolving one target the same `Page`. */
export function recordPageErrors(ctx: ExtensionContext, page: Page): void {
	if (recorded.has(page)) return
	recorded.add(page)
	const onConsole = (msg: ConsoleMessage) => {
		// "Client disconnected" is the benign port-close cascade: pending RPCs reject en masse when the
		// background restarts, and production treats it as benign too (`isClientDisconnectRejection`).
		// App `console.*` never reaches this listener on the success path: the console sniffer reroutes
		// it to the background's log ring (`fixtures/journal.ts` readSwLogTrail). Browser-emitted entries
		// do ("Unchecked runtime.lastError", on Chrome). `pageerror` holds every uncaught throw and
		// unhandled rejection on both browsers, Firefox's through the driver's relay (FIREFOX.md). An
		// error the app catches and logs reaches neither array: prefer DOM, storage or stage evidence.
		if (msg.type() === "error" && !msg.text().includes("Client disconnected") && !isPrestoProbeNoise(msg)) {
			ctx.consoleErrors.push(msg.text())
		}
	}
	const onPageError = (payload: unknown) => {
		const err = pageErrorOf(payload)
		if (err) ctx.pageErrors.push(err)
	}
	page.on("console", onConsole)
	page.on("pageerror", onPageError)
}

/** Loads the popup into `page` and records its errors, leaving the arrays as they are. */
async function loadPopup(ctx: ExtensionContext, page: Page): Promise<void> {
	patchPagePolling(page)
	await setViewport(page, { width: 360, height: 600 })
	// Bring the new page to the front so the tab is "focused" — defense in
	// depth against rAF throttling. Combined with `--disable-renderer-
	// backgrounding` it prevents Chrome from suspending the offscreen
	// renderer.
	await bringToFront(page)
	recordPageErrors(ctx, page)
	await gotoExtensionPage(page, extensionUrl(ctx.extensionId, "/src/popup/index.html"))
}

/** Puppeteer's BiDi `close()` swallows a failed close, so only the `close` event proves one. */
export async function closeConfirmed(page: Page, what: string): Promise<void> {
	const closed = new Promise<void>((resolve) => page.once("close", () => resolve()))
	let timer: ReturnType<typeof setTimeout> | undefined
	const refused = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`${what} did not close within 10 s`)), 10_000)
	})
	try {
		await Promise.race([page.close().then(() => closed), refused])
	} finally {
		clearTimeout(timer)
	}
}

/** Until the shell has heard the background's Ready: before it, every call the page makes waits. */
export async function waitForServiceReady(page: Page, timeout = 30_000): Promise<void> {
	await page.waitForSelector('[data-service-ready="true"]', { timeout })
}

const popupReady = (page: Page, timeout: number, polling: number) =>
	page.waitForFunction(
		() => window.location.hash !== "#/" && window.location.hash !== "" && document.querySelector('[data-service-ready="true"]'),
		{ timeout, polling },
	)

async function setUpPopupPage(ctx: ExtensionContext, page: Page): Promise<Page> {
	ctx.consoleErrors = []
	ctx.pageErrors = []

	// Fast-path-then-fallback for the SW-handshake workaround.
	//
	// Background: the SW's FIRST popup connection on a brand-new tab can
	// lose the wallet-bridge handshake (popup logs "Client disconnected"
	// from `client-*.js` and Vue never mounts; hash stays at "#/" with an
	// empty body). The historical workaround was an unconditional
	// triple-nav (popup → about:blank → popup); it now loads the popup again in
	// a fresh tab — the second load sees a fully-warm SW.
	//
	// Readiness predicate: hash leaves "#/" AND the shell has heard the
	// background's Ready (`data-service-ready`). The hash alone fires too
	// early: past the start grace the guard routes before the service
	// answers, and a route decided then is replayed once Ready comes.
	//
	// Budget: 2s is provisional and tuned for the prewarmed SW that
	// `launchExtension()` produces (the SW liveness wait at line 70-80
	// runs before any test even starts). On a genuinely cold SW + slow CI,
	// this may need to lengthen — revisit if fallback-count > 0 ever
	// appears in CI logs. P99 of the fast-path was 811ms in smoke,
	// 238ms in network in the spike.
	//
	// Catch: TimeoutError only. A broader catch would mask page crashes,
	// CDP disconnects, etc. as "fast-path failed → try fallback" and bury
	// the real fault.
	//
	// Logging is env-gated so the per-call line doesn't pollute default
	// test output. Set NULO_E2E_OPENPOPUP_LOG=1 to re-emit (useful for
	// counting fallback occurrences in CI artifacts).
	const FAST_PATH_BUDGET_MS = 2_000
	const t0 = Date.now()
	await loadPopup(ctx, page)
	try {
		await popupReady(page, FAST_PATH_BUDGET_MS, 100)
		if (process.env.NULO_E2E_OPENPOPUP_LOG === "1") console.log(`[openPopup] path=fast totalMs=${Date.now() - t0}`)
		return page
	} catch (err) {
		if (!(err instanceof TimeoutError)) throw err
	}
	// Closing a tab raises nothing from it, imports in flight included, while a navigation would make
	// Firefox reject the left document's in-flight imports from it; the tab stays recorded until gone.
	await closeConfirmed(page, "openPopup: the slow popup tab")
	const fresh = await newPage(ctx.browser)
	try {
		await loadPopup(ctx, fresh)
		await popupReady(fresh, 30_000, 200)
	} catch (err) {
		await fresh.close().catch(() => {})
		throw err
	}
	if (process.env.NULO_E2E_OPENPOPUP_LOG === "1") console.log(`[openPopup] path=fallback totalMs=${Date.now() - t0}`)
	return fresh
}
