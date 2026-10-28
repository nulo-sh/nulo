import { hashToEmoji } from "@aztec-labs/wallet-sdk/crypto"
import type { ConsoleMessage, Page } from "puppeteer"
import { expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { BROWSER, bringToFront, prepareKeys } from "../fixtures/browser"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "../fixtures/extension"
import { switchToLocalNetwork } from "../fixtures/helpers"
import { navigateByHash } from "../fixtures/navigation"
import { openPlayground, PLAYGROUND_TEST_URL, selectPgBundle, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import {
	approveVerify,
	openConnectedApp,
	recordWindowChanges,
	rejectCapabilities,
	waitForPopup,
	waitForPopupClosed,
	type WindowChange,
} from "../fixtures/popups"
import { shotSend } from "../fixtures/send-page"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const ALLOW = '[data-testid="discover-allow-btn"]'
const ACTION = '[data-testid="discover-action"]'
const GRID = '[data-testid="verify-emoji-grid"]'
const CONNECTED = '[data-testid="pg-status"][data-status="connected"]'
const MARKS = "e2e:connect-marks"
const STALL_MARK = "e2e:playground-stalled"
const STALL_MS = 10_000
const ANNOUNCE = '[data-testid="verify-announce"][role="status"][aria-live="polite"]'
const ROW_NOT_CONNECTED = '[data-testid="connected-app-row-not-connected"]'
const APP_NOT_CONNECTED = '[data-testid="connected-app-not-connected"]'
const ANNOUNCEMENT =
	"Connection check. Check that the app shows these same emojis in the same order. If they differ, the connection may not be safe. Choose They don't match."

type Mark = { mark: string; at: number }
type CheckShown = { docStart: number; gridBy: number }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** What other extension pages post on `MARKS`, each stamped where it happened: the connect page's
 *  marks outlive its window. */
async function recordMarks(control: Page): Promise<() => Promise<Mark[]>> {
	await control.evaluate((channel: string) => {
		const w = window as unknown as { __marks: Mark[] }
		w.__marks = []
		new BroadcastChannel(channel).onmessage = (e) => w.__marks.push(e.data as Mark)
	}, MARKS)
	return () => control.evaluate(() => (window as unknown as { __marks: Mark[] }).__marks)
}

async function postConnectMarks(page: Page): Promise<void> {
	await page.evaluate(
		(channel: string, allow: string, action: string) => {
			const out = new BroadcastChannel(channel)
			const post = (mark: string) => out.postMessage({ mark, at: Date.now() })
			document.addEventListener("click", (e) => (e.target as Element | null)?.closest(allow) && post("allow"), true)
			let last = ""
			const read = () => {
				const text = document.querySelector(action)?.textContent?.trim() ?? ""
				if (!text || text === last) return
				last = text
				post(`line:${text}`)
			}
			read()
			new MutationObserver(read).observe(document.documentElement, { subtree: true, childList: true, characterData: true })
		},
		MARKS,
		ALLOW,
		ACTION,
	)
}

/** The check's document start, and when the test first saw its grid in the DOM (not a paint time). */
function checkShown(check: Page): Promise<CheckShown> {
	return check.evaluate(
		(grid: string) =>
			new Promise<CheckShown>((resolve, reject) => {
				const done = () => resolve({ docStart: Math.round(performance.timeOrigin), gridBy: Date.now() })
				if (document.querySelector(grid)) return done()
				const timer = setTimeout(() => reject(new Error("the check never showed its grid")), 30_000)
				const observer = new MutationObserver(() => {
					if (!document.querySelector(grid)) return
					observer.disconnect()
					clearTimeout(timer)
					done()
				})
				observer.observe(document.documentElement, { subtree: true, childList: true })
			}),
		GRID,
	)
}

/** Milliseconds after Allow, for the run's log line. */
function timeline(marks: Mark[], changes: WindowChange[], connect: number | undefined, check: number | undefined, shown?: CheckShown) {
	const allow = marks.find((m) => m.mark === "allow")?.at
	const at = (change: WindowChange["change"], id: number | undefined) => changes.find((c) => c.change === change && c.id === id)?.at
	const since = (t: number | null | undefined) => (allow === undefined || t == null ? null : t - allow)
	return {
		checkCreated: since(at("created", check)),
		connectRemoved: since(at("removed", connect)),
		checkDocStart: since(shown?.docStart),
		gridBy: since(shown?.gridBy),
	}
}

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

async function openConnect(ctx: ExtensionContext) {
	const control = await openPopup(ctx)
	await waitForHash(control, "#/popup/general", 30_000)
	await switchToLocalNetwork(control)
	const dapp = await openPlayground(ctx)
	const changes = await recordWindowChanges(control)
	const marks = await recordMarks(control)
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
	const connectWindow = await page.evaluate(async () => (await chrome.windows.getCurrent()).id)
	await postConnectMarks(page)
	return { control, dapp, page, connectWindow, changes, marks }
}

const popupsOpen = (control: Page) =>
	control.evaluate(async () => (await chrome.windows.getAll({ windowTypes: ["popup"] })).filter((w) => w.type === "popup").length)

test.skipIf(!aztecConfig)(
	"a dApp that connects at once: Allow closes the connect window, and the check opens in its own, focused, answering no key until a press",
	{ timeout: 180_000 },
	async ({ localNetworkExtension: ctx }) => {
		const { dapp, page, connectWindow, changes, marks } = await openConnect(ctx)
		await shotSend(page, "connect-discover", "discover-allow-btn")

		const checkP = waitForPopup(ctx, "verify", { timeout: 30_000 })
		await clickByTestId(page, "discover-allow-btn")
		const check = await checkP
		const shown = await checkShown(check)
		await waitForPopupClosed(page, 10_000)

		const focus = await check.evaluate(async () => {
			const [current, lastFocused] = await Promise.all([chrome.windows.getCurrent(), chrome.windows.getLastFocused()])
			return {
				window: current.id,
				hasFocus: document.hasFocus(),
				lastFocused: lastFocused.id === current.id,
				activeElement: document.activeElement === document.body ? "body" : (document.activeElement?.outerHTML ?? null),
			}
		})
		expect(focus).toEqual({ window: expect.any(Number), hasFocus: true, lastFocused: true, activeElement: "body" })
		expect(focus.window).not.toBe(connectWindow)

		const hash = await dapp.waitForFunction(
			() => document.querySelector('[data-testid="pg-verification-hash"]')?.textContent || false,
			{ timeout: 30_000, polling: 200 },
		)
		const read = await check.evaluate((grid: string) => {
			const label = (testid: string) => document.querySelector(`[data-testid="${testid}"]`)?.textContent?.trim() ?? null
			return {
				grid: document.querySelector(grid)?.textContent?.replace(/\s/g, "") ?? "",
				header: { account: label("identity-account"), network: label("identity-network") },
				action: label("verify-action"),
				error: document.querySelector('[data-testid="error-text"]')?.textContent ?? null,
			}
		}, GRID)
		expect(read).toEqual({
			grid: hashToEmoji((await hash.jsonValue()) as string),
			header: { account: "No account shared", network: "Local Network" },
			action: "Connection established",
			error: null,
		})
		await check.waitForFunction(
			(sel: string, want: string) => document.querySelector(sel)?.textContent === want,
			{ timeout: 5_000, polling: 50 },
			ANNOUNCE,
			ANNOUNCEMENT,
		)
		await shotSend(check, "connect-check", "verify-emoji-grid")

		await check.evaluate(() => {
			const w = window as unknown as { __keys: Array<{ key: string; repeat: boolean }> }
			w.__keys = []
			window.addEventListener("keydown", (e) => w.__keys.push({ key: e.key, repeat: e.repeat }), true)
		})
		await prepareKeys(check)
		await check.keyboard.press("Enter")
		for (let i = 0; i < 3; i++) await check.keyboard.down("Enter")
		await check.keyboard.up("Enter")
		await check.keyboard.press("Escape")
		await sleep(1_000)
		const keys = await check.evaluate(() => (window as unknown as { __keys: Array<{ key: string; repeat: boolean }> }).__keys)
		expect(
			keys.some((k) => k.key === "Enter" && k.repeat),
			"the driver sent no repeat, so the held Enter proved nothing",
		).toBe(true)
		expect(keys.some((k) => k.key === "Escape")).toBe(true)
		// Either answer closes the check, so a check still open on its grid was answered by no key.
		expect(check.isClosed(), "a key answered the check").toBe(false)
		expect(await check.$(GRID)).not.toBeNull()

		await approveVerify(check)
		await dapp.waitForSelector(CONNECTED, { timeout: 30_000 })
		await selectPgBundle(dapp, "accounts")
		const seq = await snapshotResultSeq(dapp)
		const capsP = waitForPopup(ctx, "capabilities", { timeout: 60_000 })
		await clickByTestId(dapp, "pg-btn-requestCapabilities")
		const caps = await capsP
		const capsWindow = await caps.evaluate(async () => (await chrome.windows.getCurrent()).id)
		const created = (await changes()).filter((c) => c.change === "created").map((c) => c.id)
		expect(created).toEqual([connectWindow, focus.window, capsWindow])
		await rejectCapabilities(caps)
		expect((await waitForPgResult(dapp, "requestCapabilities", seq, 30_000)).status).toBe("error")
		await waitForPopupClosed(caps)

		const lines = (await marks()).filter((m) => m.mark.startsWith("line:")).map((m) => m.mark.slice(5))
		const times = timeline(await marks(), await changes(), connectWindow, focus.window, shown)
		console.log(`[connect-check-window] ${BROWSER} at once: ${JSON.stringify({ ...times, lines })}`)
		expect(times.checkCreated).not.toBeNull()
		expect(times.connectRemoved).not.toBeNull()
		expect(ctx.consoleErrors).toEqual([])
		expect(ctx.pageErrors).toEqual([])
	},
)

test.skipIf(!aztecConfig)(
	"a dApp that starts its check late: Allow closes the connect window, Settings lists the app as not connected until its check opens in its own",
	{ timeout: 150_000 },
	// A wallet of its own: the other test's remembered connection would make this one a reconnection.
	async ({ registeredExtensionPerTest: ctx }) => {
		const { control, dapp, page, connectWindow, changes, marks } = await openConnect(ctx)
		const host = new URL(PLAYGROUND_TEST_URL).host
		const row = `[data-testid="connected-app-row"][data-app-host="${host}"]`

		const checkP = waitForPopup(ctx, "verify", { timeout: 60_000 })
		await stallPage(dapp, STALL_MS)
		await clickByTestId(page, "discover-allow-btn")
		await waitForPopupClosed(page, 10_000)

		// Before the late check, a gap with no wallet window open.
		expect((await changes()).filter((c) => c.change === "created").map((c) => c.id)).toEqual([connectWindow])
		expect(await popupsOpen(control)).toBe(0)

		const readFrom = Date.now()
		await bringToFront(control)
		await navigateByHash(control, "#/popup/settings/connected-apps", 15_000)
		// A wallet of its own lists this one app, so the row's line is the only one.
		await control.waitForSelector(row, { timeout: 5_000 })
		await control.waitForSelector(ROW_NOT_CONNECTED, { visible: true, timeout: 5_000 })
		expect(await control.$eval(ROW_NOT_CONNECTED, (el) => el.textContent?.trim())).toBe("Allowed. Not connected yet.")
		await shotSend(control, "connect-not-connected-row", "connected-app-row")
		await openConnectedApp(control, host, APP_NOT_CONNECTED)
		expect(await control.$eval(APP_NOT_CONNECTED, (el) => el.textContent?.replace(/\s+/g, " ").trim())).toBe(
			"You allowed this app, but it has not finished connecting. Nothing is shared with it. Its next connection starts with the emoji check.",
		)
		await shotSend(control, "connect-not-connected-app", "connected-app-not-connected")
		const settingsMs = Date.now() - readFrom
		await bringToFront(dapp)

		const check = await checkP
		const shown = await checkShown(check)
		const read = await check.evaluate(async () => ({
			window: (await chrome.windows.getCurrent()).id,
			action: document.querySelector('[data-testid="verify-action"]')?.textContent?.trim() ?? null,
		}))
		expect(read.action).toBe("Connection established")
		await control.waitForFunction(
			(sel: string) => document.querySelector(sel) === null,
			{ timeout: 10_000, polling: 100 },
			APP_NOT_CONNECTED,
		)
		await approveVerify(check)
		await dapp.waitForSelector(CONNECTED, { timeout: 30_000 })

		const lines = (await marks()).filter((m) => m.mark.startsWith("line:")).map((m) => m.mark.slice(5))
		expect(lines).toEqual(["wants to connect on Local Network"])
		expect((await changes()).filter((c) => c.change === "created").map((c) => c.id)).toEqual([connectWindow, read.window])
		const times = timeline(await marks(), await changes(), connectWindow, read.window, shown)
		console.log(`[connect-check-window] ${BROWSER} late: ${JSON.stringify({ ...times, settingsMs })}`)
		expect(ctx.consoleErrors).toEqual([])
		expect(ctx.pageErrors).toEqual([])
	},
)
