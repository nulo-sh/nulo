import type { ConsoleMessage, Page } from "puppeteer"
import { expect, inject } from "vitest"
import { BROWSER } from "../fixtures/browser"
import { clickByTestId, type ExtensionContext, test } from "../fixtures/extension"
import { openPlayground } from "../fixtures/playground"
import { waitForPopup, approveConnect, approveDiscover, approveVerify, waitForPopupClosed } from "../fixtures/popups"
import { shotSend } from "../fixtures/send-page"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Test #41 — closing the dApp tab terminates the wallet-sdk transport session
 * but does NOT delete the persisted DappSession.
 *
 * Per `wireTabLifecycle` (`wallet-sdk/tab-lifecycle.ts`: `chrome.tabs.onRemoved`
 * → `terminateForTab`), close-handling tears down the secure-channel transport
 * but keeps the DappSession record in storage. On reconnect from a fresh tab,
 * the canonical flow (`handleDiscovery`'s returning-session auto-approve in
 * `wallet-sdk/discovery-flow.ts`) auto-approves discover (DappSession exists
 * for origin + unlocked + non-expired) and re-pops verify, as every reconnect does.
 */
test.skipIf(!hasConfig)(
	"session-tabClose — close + reopen auto-approves discover, re-pops verify",
	{ timeout: 90_000 },
	async ({ registeredExtensionPerTest }) => {
		// First connect — full handshake
		const dappPage = await openPlayground(registeredExtensionPerTest)
		const discoverP = waitForPopup(registeredExtensionPerTest, "discover", { timeout: 30_000 })
		await clickByTestId(dappPage, "pg-btn-connect")
		const verifyPage = await approveConnect(registeredExtensionPerTest, await discoverP)
		await approveVerify(verifyPage)
		await dappPage.waitForSelector('[data-testid="pg-status"][data-status="connected"]', { timeout: 20_000 })

		// Close the tab — terminates transport, DappSession persists
		await dappPage.close()

		// Open a fresh playground tab. Snapshot existing targets so we can assert
		// no NEW discover popup opened during the reconnect window.
		const dappPage2 = await openPlayground(registeredExtensionPerTest)
		const targetsBeforeReconnect = registeredExtensionPerTest.browser.targets().map((t) => t.url())

		// Reconnect: discover should auto-approve (DappSession exists for origin),
		// verify should re-pop.
		const verifyP2 = waitForPopup(registeredExtensionPerTest, "verify", { timeout: 30_000 })
		await clickByTestId(dappPage2, "pg-btn-connect")
		const verifyPage2 = await verifyP2
		await approveVerify(verifyPage2)
		await dappPage2.waitForSelector('[data-testid="pg-status"][data-status="connected"]', { timeout: 20_000 })

		// Sanity: no NEW discover popup target opened between the snapshot and now.
		const targetsAfterReconnect = registeredExtensionPerTest.browser.targets().map((t) => t.url())
		const newDiscoverTargets = targetsAfterReconnect.filter(
			(url) => url.includes("#/windows/discover") && !targetsBeforeReconnect.includes(url),
		)
		expect(newDiscoverTargets).toEqual([])

		await dappPage2.close()
	},
)

const ALLOW = '[data-testid="discover-allow-btn"]'
const ACTION = '[data-testid="discover-action"]'
const OVERLAY = '[data-testid="dapp-cancelled-overlay"]'

const STALL_MARK = "e2e:playground-stalled"

/** Blocks `page`'s main thread for `ms`, so its half of the wallet handshake cannot run. Resolves
 *  once the page logs that the loop has begun: a wallet message sent afterwards waits behind it. */
async function stallPage(page: Page, ms: number): Promise<void> {
	let onConsole: ((message: ConsoleMessage) => void) | undefined
	const started = new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("the playground never reported its stall")), 10_000)
		onConsole = (message) => {
			if (message.text() !== STALL_MARK) return
			clearTimeout(timer)
			resolve()
		}
		page.on("console", onConsole)
	})
	// Not awaited: the evaluation returns only when the loop ends, or rejects when the page closes.
	void page
		.evaluate(
			(mark: string, stallMs: number) => {
				console.debug(mark)
				const until = Date.now() + stallMs
				let spins = 0
				while (Date.now() < until) spins++
				return spins
			},
			STALL_MARK,
			ms,
		)
		.catch(() => undefined)
	try {
		await started
	} finally {
		if (onConsole) page.off("console", onConsole)
	}
}

/** A fresh playground tab asks to connect, and Allow is clicked while the tab is stalled for
 *  `stallMs`: the connection cannot establish, so the window waits on its "Connecting on" line. */
async function allowWhileStalled(ctx: ExtensionContext, stallMs: number): Promise<{ dapp: Page; page: Page }> {
	const dapp = await openPlayground(ctx)
	const discoverP = waitForPopup(ctx, "discover", { timeout: 30_000 })
	await clickByTestId(dapp, "pg-btn-connect")
	const page = await discoverP
	await page.waitForFunction(
		(sel: string) => {
			const allow = document.querySelector<HTMLButtonElement>(sel)
			return !!allow && !allow.disabled
		},
		{ timeout: 30_000, polling: 200 },
		ALLOW,
	)
	await page.evaluate(() => {
		;(window as unknown as { __connectDocument?: boolean }).__connectDocument = true
	})
	await stallPage(dapp, stallMs)
	await approveDiscover(page)
	await page.waitForFunction(
		(sel: string) => document.querySelector(sel)?.textContent?.trim().startsWith("Connecting on") ?? false,
		{ timeout: 15_000, polling: 100 },
		ACTION,
	)
	return { dapp, page }
}

/**
 * A connect window waiting after Allow ends one of two ways. Its tab closing is a cancellation: the
 * window closes at once and never shows the expired page. A connection that never establishes
 * expires (the discovery's 55 s deadline plus a 10 s grace): the window stays, says so over the
 * connect page, and OK closes it. The run logs whether the browser kept the page or reloaded it.
 */
test.skipIf(!hasConfig)(
	"closing the app tab while its connect window connects closes the window at once, never on the expired page",
	{ timeout: 90_000 },
	async ({ registeredExtensionPerTest: ctx }) => {
		const { dapp, page } = await allowWhileStalled(ctx, 30_000)
		const loaded: string[] = []
		page.on("framenavigated", (frame) => {
			if (frame === page.mainFrame()) loaded.push(frame.url())
		})

		await dapp.close()
		// Far inside the expiry, which needs the discovery's 55 s deadline to pass first.
		await waitForPopupClosed(page, 10_000)
		expect(loaded.filter((url) => url.includes("expired=1"))).toEqual([])
	},
)

test.skipIf(!hasConfig)(
	"a connection that never establishes keeps its connect window, says the request expired, and OK closes it",
	{ timeout: 180_000 },
	async ({ registeredExtensionPerTest: ctx }) => {
		const { page } = await allowWhileStalled(ctx, 90_000)
		await shotSend(page, "connect-connecting", "discover-action")

		await page.waitForSelector(OVERLAY, { visible: true, timeout: 100_000 })
		const shown = await page.evaluate(() => ({
			message: document.querySelector('[data-testid="dapp-cancelled-message"]')?.textContent?.trim() ?? null,
			sameDocument: (window as unknown as { __connectDocument?: boolean }).__connectDocument === true,
			expiredRoute: new URLSearchParams(location.hash.split("?")[1] ?? "").get("expired"),
		}))
		console.log(`[session-tabClose] ${BROWSER}: the expired page loaded ${shown.sameDocument ? "in the same document" : "by a reload"}`)
		expect({ message: shown.message, expiredRoute: shown.expiredRoute }).toEqual({
			message: "Connection request expired",
			expiredRoute: "1",
		})
		await shotSend(page, "connect-expired", "dapp-cancelled-overlay")

		await clickByTestId(page, "dapp-cancelled-ok-btn")
		await waitForPopupClosed(page, 10_000)
	},
)
