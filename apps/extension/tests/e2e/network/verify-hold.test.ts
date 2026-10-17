import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "../fixtures/extension"
import { lockWallet } from "../fixtures/helpers"
import { type DappExecuteOutcome, readDappExecuteOutcomes, waitForDappExecuteOutcomes } from "../fixtures/journal"
import { getPgStatus, openPlayground, setPgInput, snapshotResultSeq } from "../fixtures/playground"
import {
	approveVerify,
	recordCreatedWindows,
	rejectExecute,
	waitForExecuteContent,
	waitForPopup,
	waitForPopupClosed,
} from "../fixtures/popups"

/**
 * An app's calls wait while its session's emoji check is unanswered: They match runs them in the
 * order they came, and every other ending drops them, the held send's queued row failing with the
 * wallet's existing copy. Each test reconnects a remembered app, so its check opens in a window of
 * its own while the app keeps its stored grants. That no call reaches the dispatcher
 * before They match is proven in `background.connect-window.test.ts`; these tests prove what the
 * person and the app observe.
 */

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const CONNECTED = '[data-testid="pg-status"][data-status="connected"]'
const DISCONNECTED = '[data-testid="pg-status"][data-status="disconnected"]'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The app disconnects and connects again; its check opens in its own window. */
async function reconnectToCheck(ctx: ExtensionContext, page: Page): Promise<Page> {
	await clickByTestId(page, "pg-btn-disconnect")
	await page.waitForSelector(DISCONNECTED, { timeout: 10_000 })
	return connectToCheck(ctx, page)
}

async function connectToCheck(ctx: ExtensionContext, page: Page): Promise<Page> {
	const checkP = waitForPopup(ctx, "verify", { timeout: 60_000 })
	await clickByTestId(page, "pg-btn-connect")
	const check = await checkP
	await page.waitForSelector(CONNECTED, { timeout: 30_000 })
	return check
}

/** A one-token transfer from the granted account, named explicitly: a reconnected page has none selected. */
async function fillSend(page: Page, from: string): Promise<void> {
	await setPgInput(page, "from", from)
	await setPgInput(page, "tokenAddress", aztecConfig!.tokenAddress)
	await setPgInput(page, "recipient", aztecConfig!.minterAddress)
	await setPgInput(page, "amount", "1")
}

/** Clicks `pg-btn-<name>` and returns the seq of the result row the call appended as it started. */
async function call(page: Page, name: string): Promise<number> {
	await clickByTestId(page, `pg-btn-${name}`)
	return snapshotResultSeq(page)
}

const ROW = (seq: number) => `[data-testid="pg-result"][data-result-seq="${seq}"]`

function rowStatus(page: Page, seq: number): Promise<string> {
	return page.evaluate((sel) => document.querySelector(sel)?.getAttribute("data-status") ?? "", ROW(seq))
}

/** Waits for the result row `seq` to settle and returns its status and its result or error JSON. */
async function settled(page: Page, seq: number, timeout = 30_000): Promise<{ status: string; json: string }> {
	await page.waitForFunction(
		(sel: string) => ["ok", "error"].includes(document.querySelector(sel)?.getAttribute("data-status") ?? ""),
		{ timeout, polling: 200 },
		ROW(seq),
	)
	return page.evaluate((sel) => {
		const row = document.querySelector(sel)
		return { status: row?.getAttribute("data-status") ?? "", json: row?.getAttribute("data-result-json") ?? "" }
	}, ROW(seq))
}

/** Nothing signals that a drop did not happen, so a kept state is read across a window. */
async function staysFor(ms: number, what: string, read: () => Promise<unknown>, want: unknown): Promise<void> {
	const until = Date.now() + ms
	while (Date.now() < until) {
		expect(await read(), what).toEqual(want)
		await sleep(200)
	}
}

const queued = (n: number) => (rows: DappExecuteOutcome[]) => rows.length === n && rows.every((r) => r.stage === "queued")
const failedAs = (failure: string) => (rows: DappExecuteOutcome[]) =>
	rows.length === 1 && rows[0]!.stage === "failed" && rows[0]!.failure === failure

/** The hash a check window shows, as the service worker wrote it into the window's URL. */
const checkHash = (check: Page) => decodeURIComponent(/verificationHash=([^&]+)/.exec(check.url())?.[1] ?? "")
/** The hash the app derived for its own session. */
const appHash = (page: Page) => page.$eval('[data-testid="pg-verification-hash"]', (el) => el.textContent ?? "")

async function controlPage(ctx: ExtensionContext): Promise<Page> {
	const control = await openPopup(ctx)
	await waitForHash(control, "#/popup/general", 30_000)
	return control
}

test.skipIf(!aztecConfig)(
	"calls sent while the check is open wait for They match, then run in the order they came",
	{ timeout: 240_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const { playgroundPage: dapp, accountAddress } = ctx
		const control = await controlPage(ctx)
		const check = await reconnectToCheck(ctx, dapp)
		await fillSend(dapp, accountAddress)

		const readA = await call(dapp, "getChainInfo")
		await call(dapp, "sendTx-default")
		await call(dapp, "sendTx-default")
		await waitForDappExecuteOutcomes(control, "both held sends queued before They match", queued(2))
		const readB = await call(dapp, "getChainInfo")
		await staysFor(2_000, "read A before They match", () => rowStatus(dapp, readA), "pending")

		const firstP = waitForPopup(ctx, "execute", { timeout: 60_000 })
		await approveVerify(check)
		const first = await firstP
		expect((await settled(dapp, readA)).status).toBe("ok")
		// The second read came after both sends, so it waits behind the first send's window.
		expect(await rowStatus(dapp, readB)).toBe("pending")

		await waitForExecuteContent(first)
		const secondP = waitForPopup(ctx, "execute", { timeout: 60_000 })
		await rejectExecute(first)
		const second = await secondP
		await waitForExecuteContent(second)
		await rejectExecute(second)
		expect((await settled(dapp, readB)).status).toBe("ok")
	},
)

test.skipIf(!aztecConfig)(
	"They don't match ends the session: its calls reject, the held send's row is refused, and no window opens",
	{ timeout: 240_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const { playgroundPage: dapp, accountAddress } = ctx
		const control = await controlPage(ctx)
		const check = await reconnectToCheck(ctx, dapp)
		const created = await recordCreatedWindows(control)
		await fillSend(dapp, accountAddress)

		const read = await call(dapp, "getChainInfo")
		await call(dapp, "sendTx-default")
		await waitForDappExecuteOutcomes(control, "the held send queued", queued(1))
		await clickByTestId(check, "verify-mismatch-btn")
		await waitForPopupClosed(check, 10_000)

		await dapp.waitForSelector(DISCONNECTED, { timeout: 30_000 })
		const refused = await settled(dapp, read)
		expect(refused.status).toBe("error")
		expect(JSON.parse(refused.json)).toEqual({ message: "Wallet disconnected" })
		await waitForDappExecuteOutcomes(control, "the held send refused", failedAs("wallet_refused"))
		await staysFor(2_000, "windows created after They don't match", created, [])
	},
)

test.skipIf(!aztecConfig)(
	"closing the check keeps the app connected and its send held; closing the app's tab then refuses it",
	{ timeout: 240_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const { playgroundPage: dapp, accountAddress } = ctx
		const control = await controlPage(ctx)
		const check = await reconnectToCheck(ctx, dapp)
		const created = await recordCreatedWindows(control)
		await fillSend(dapp, accountAddress)

		await call(dapp, "sendTx-default")
		await waitForDappExecuteOutcomes(control, "the held send queued", queued(1))
		const checkWindow = await check.evaluate(async () => (await chrome.windows.getCurrent()).id)
		await control.evaluate((id) => chrome.windows.remove(id!), checkWindow)
		await waitForPopupClosed(check, 10_000)
		await staysFor(
			3_000,
			"the app and its held send after the check closed",
			async () => [await getPgStatus(dapp), (await readDappExecuteOutcomes(control)).map((r) => r.stage)],
			["connected", ["queued"]],
		)

		await dapp.close()
		await waitForDappExecuteOutcomes(control, "the held send refused", failedAs("wallet_refused"))
		await staysFor(2_000, "windows created after the check closed", created, [])
	},
)

test.skipIf(!aztecConfig)(
	"two checks for one app hold apart: They match on one runs only that tab's calls",
	{ timeout: 240_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const { playgroundPage: tab1, accountAddress } = ctx
		const control = await controlPage(ctx)
		const checks = [await reconnectToCheck(ctx, tab1)]
		const tab2 = await openPlayground(ctx)
		checks.push(await connectToCheck(ctx, tab2))
		const checkOf = async (tab: Page) => {
			const hash = await appHash(tab)
			const found = checks.find((check) => checkHash(check) === hash)
			if (!found) throw new Error(`no open check shows the hash of ${tab === tab1 ? "tab 1" : "tab 2"}`)
			return found
		}
		await fillSend(tab1, accountAddress)

		const read1 = await call(tab1, "getChainInfo")
		await call(tab1, "sendTx-default")
		await waitForDappExecuteOutcomes(control, "tab 1's send queued", queued(1))
		const read2 = await call(tab2, "getChainInfo")
		await approveVerify(await checkOf(tab2))
		expect((await settled(tab2, read2)).status).toBe("ok")
		await staysFor(2_000, "tab 1's read", () => rowStatus(tab1, read1), "pending")

		await tab1.close()
		await waitForDappExecuteOutcomes(control, "tab 1's send refused", failedAs("wallet_refused"))
	},
)

test.skipIf(!aztecConfig)(
	"a lock with the check open ends the session: the app is disconnected and its held send reads the lock",
	{ timeout: 240_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const { playgroundPage: dapp, accountAddress } = ctx
		const control = await controlPage(ctx)
		await reconnectToCheck(ctx, dapp)
		await fillSend(dapp, accountAddress)

		await call(dapp, "sendTx-default")
		await waitForDappExecuteOutcomes(control, "the held send queued", queued(1))
		await lockWallet(control)
		await dapp.waitForSelector(DISCONNECTED, { timeout: 30_000 })
		await waitForDappExecuteOutcomes(control, "the held send stopped by the lock", failedAs("session_ended"))
	},
)
