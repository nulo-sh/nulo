/** In a real browser: where a page or window has a bottom action row, an error snack sits at least
 *  12px above the row's top edge, so it never covers the row's buttons, even in a window shorter
 *  than the page, where a scroll brings the row up and a click lands on it in one task. A send
 *  that fails once its record is written offers Details, which opens that record. */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import {
	type AztecTestConfig,
	createSponsoredFeeOptions,
	createTestWallet,
	mintPublicTokens,
	spendPublicAuthwit,
	waitForTxMined,
} from "../fixtures/aztec"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "../fixtures/extension"
import {
	captureBalanceBaseline,
	fillSendForm,
	importToken,
	navigateByHash,
	setActiveSendType,
	setDebugMode,
	setDeveloperMode,
	waitForFreshBalanceRow,
	waitForToast,
} from "../fixtures/helpers"
import { readSendRecords, waitForBalanceQueueIdle } from "../fixtures/journal"
import { assertPgOk, setPgInput, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const sel = (testid: string) => `[data-testid="${testid}"]`
const SNACK = sel("snackbar")

type Placement = { snackTop: number; snackBottom: number; footerTop: number; left: number; width: number; columnCentre: number }
type AtEnd = { viewport: number; inset: number; footerTop: number; footerTopAtEnd: number; snackBottom: number }
type Hit = { id: string; hit: string; covered: boolean }

const FOOTER = sel("dapp-approval-footer")
const BUTTONS = ["execute-reject-btn", "execute-confirm-btn"]

/** The card rises 20px as it fades in. */
async function settledCard(page: Page): Promise<void> {
	await page.waitForFunction(
		(s: string) => {
			const card = document.querySelector(s)
			return card !== null && getComputedStyle(card).opacity === "1" && card.getAnimations().length === 0
		},
		{ timeout: 10_000, polling: 50 },
		SNACK,
	)
}

async function placement(page: Page, footer: string): Promise<Placement> {
	await settledCard(page)
	return page.evaluate(
		(s: string, f: string) => {
			const card = document.querySelector(s)?.getBoundingClientRect()
			const row = document.querySelector(f)?.getBoundingClientRect()
			if (!card || !row) throw new Error("no snack or no footer")
			return {
				snackTop: card.top,
				snackBottom: card.bottom,
				footerTop: row.top,
				left: card.left,
				width: card.width,
				columnCentre: (() => {
					const body = document.body.getBoundingClientRect()
					return body.left + body.width / 2
				})(),
			}
		},
		SNACK,
		footer,
	)
}

/** Adds a line of `height` px at the top of the footer, as its error line does. */
async function addFooterLine(page: Page, footer: string, height: number): Promise<void> {
	await page.evaluate(
		(f: string, px: number) => {
			const line = document.createElement("div")
			line.dataset.testid = "e2e-footer-line"
			line.style.height = `${px}px`
			line.style.flexShrink = "0"
			document.querySelector(f)?.prepend(line)
		},
		footer,
		height,
	)
}

/** Grows the footer by one 40px line, as a wrapping error line does, and returns the new placement
 *  once the snack has followed it. */
async function growFooter(page: Page, footer: string, before: Placement): Promise<Placement> {
	await addFooterLine(page, footer, 40)
	await page.waitForFunction(
		(s: string, top: number) => (document.querySelector(s)?.getBoundingClientRect().top ?? top) < top - 20,
		{ timeout: 5_000, polling: 50 },
		SNACK,
		before.snackTop,
	)
	return placement(page, footer)
}

/** Waits until the card sits 12px above where the footer stops once the page is scrolled to its end,
 *  and reads both. */
async function placementAtEnd(page: Page, footer: string): Promise<AtEnd> {
	await settledCard(page)
	await page.waitForFunction(
		(s: string, f: string) => {
			const card = document.querySelector(s)?.getBoundingClientRect()
			const row = document.querySelector(f)?.getBoundingClientRect()
			const root = document.scrollingElement ?? document.documentElement
			const toEnd = root.scrollHeight - root.clientHeight - root.scrollTop
			return card !== undefined && row !== undefined && Math.abs(row.top - toEnd - 12 - card.bottom) < 0.5
		},
		{ timeout: 5_000, polling: 50 },
		SNACK,
		footer,
	)
	return page.evaluate(
		(s: string, f: string) => {
			const card = document.querySelector(s)?.getBoundingClientRect()
			const row = document.querySelector(f)?.getBoundingClientRect()
			if (!card || !row) throw new Error("no snack or no footer")
			const root = document.scrollingElement ?? document.documentElement
			const viewport = document.documentElement.clientHeight
			const toEnd = root.scrollHeight - root.clientHeight - root.scrollTop
			return {
				viewport,
				inset: viewport - card.bottom,
				footerTop: row.top,
				footerTopAtEnd: row.top - toEnd,
				snackBottom: card.bottom,
			}
		},
		SNACK,
		footer,
	)
}

/** From the top of the page, scrolls each control into view and hit-tests its centre in the same
 *  task, as a pointer click does. */
async function hitsAfterScroll(page: Page, testids: string[]): Promise<Hit[]> {
	return page.evaluate(
		(s: string, ids: string[]) =>
			ids.map((id) => {
				window.scrollTo(0, 0)
				const el = document.querySelector(`[data-testid="${id}"]`)
				if (!el) throw new Error(`${id} not found`)
				el.scrollIntoView({ block: "center" })
				const box = el.getBoundingClientRect()
				const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
				const owner = hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? hit?.tagName ?? "none"
				return { id, hit: owner, covered: document.querySelector(s)?.contains(hit) === true }
			}),
		SNACK,
		testids,
	)
}

type DrainCtx = ExtensionContext & { playgroundPage: Page; accountAddress: string }

const DRAINED = 10n * 10n ** 18n

async function storedValue<T>(page: Page, key: string): Promise<T | undefined> {
	const raw = await page.evaluate(async (k: string) => (await chrome.storage.local.get(k))[k], key)
	if (raw === undefined) return undefined
	return (typeof raw === "string" ? JSON.parse(raw) : raw) as T
}

async function waitFor(what: string, done: () => Promise<boolean>, timeoutMs = 120_000): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (!(await done())) {
		if (Date.now() > deadline) throw new Error(`${what} within ${timeoutMs} ms`)
		await new Promise((r) => setTimeout(r, 500))
	}
}

/** The wallet acted on the public receipt `txHash`: its record exists and no balance refresh it
 *  asked for is still owed. */
async function receiptSettled(page: Page, txHash: string): Promise<boolean> {
	return page.evaluate(async (hash: string) => {
		const keys = Object.keys(await chrome.storage.local.get(null))
		const recorded = keys.some((k) => k.startsWith("nulo:core:incoming-transfers@pub:") && k.includes(hash))
		return recorded && !keys.some((k) => k.startsWith("nulo:core:incoming-balance-outbox@"))
	}, txHash)
}

/** Waits, without asking for a refresh, for the balance row's next write to carry `expectedRaw`, then
 *  for the balance queue to fall idle: nothing that projection's tick re-queued is still owed. */
async function settledBalanceWrite(page: Page, account: string, expectedRaw: string, baseline: number): Promise<void> {
	await waitForFreshBalanceRow(page, {
		account,
		tokenContract: (aztecConfig as AztecTestConfig).tokenAddress,
		expectedPublicRaw: expectedRaw,
		baselineUpdatedAt: baseline,
		maxRefreshes: 0,
	})
	await waitForBalanceQueueIdle(page)
}

/** Through the playground, `ctx`'s account grants `spender` a public authwit for {@link DRAINED};
 *  resolves with the grant's hash once the wallet has seen it mined. */
async function grantSpender(ctx: DrainCtx, page: Page, spender: string, nonce: bigint): Promise<string> {
	const config = aztecConfig as AztecTestConfig
	const pg = ctx.playgroundPage
	await setPgInput(pg, "tokenAddress", config.tokenAddress)
	await setPgInput(pg, "authwitOwner", ctx.accountAddress)
	await setPgInput(pg, "authwitCaller", spender)
	await setPgInput(pg, "authwitAmount", DRAINED.toString())
	await setPgInput(pg, "authwitNonce", nonce.toString())
	const seq = await snapshotResultSeq(pg)
	const execute = waitForPopup(ctx, "execute", { timeout: 60_000 })
	await clickByTestId(pg, "pg-btn-grantPublicAuthwit")
	const popup = await execute
	await waitForExecuteContent(popup)
	await approveExecute(popup)
	const granted = await waitForPgResult(pg, "grantPublicAuthwit", seq, 180_000)
	await assertPgOk(pg, granted, "snack-placement:grant")
	const grantHash = String(granted.resultJson).replace(/^"(.*)"$/, "$1")
	await waitForTxMined(config, grantHash)
	await waitFor("the wallet never saw its grant mined", async () => {
		const tx = await storedValue<{ status?: number }>(page, `nulo:core:txs@${grantHash}`)
		return tx !== undefined && tx.status !== 0
	})
	return grantHash
}

/**
 * Leaves the wallet showing a public balance the chain no longer holds, as when a dApp spends a
 * public approval: the account grants the sandbox's first account a public authwit for
 * {@link DRAINED}, receives that much, and the spender takes it all. A balance refreshes only on the
 * wallet's own transactions, receipts to its accounts and a manual refresh, and the spend is none
 * of them. Nothing here asks for a refresh, so each balance write has one known cause, and the
 * balance queue is idle before the spend.
 */
async function balanceDrainedBehindTheWallet(ctx: DrainCtx): Promise<Page> {
	const config = aztecConfig as AztecTestConfig
	const account = ctx.accountAddress
	const { wallet, accounts, cleanup } = await createTestWallet(config.nodeUrl)
	try {
		const spender = accounts[0]?.toString()
		if (!spender) throw new Error("expected at least one sandbox-deployed test account")
		const fee = await createSponsoredFeeOptions(wallet)
		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 30_000)
		// The barrier reads the balance queue's debug lines from the stored log trail.
		await setDeveloperMode(page, true)
		await setDebugMode(page, true)

		// The import projects the new row once.
		let baseline = await captureBalanceBaseline(page, account, config.tokenAddress)
		await importToken(page, config.tokenAddress)
		await settledBalanceWrite(page, account, "0", baseline)

		// The grant leaving Pending refreshes the account's balances once.
		const nonce = BigInt(Math.floor(Math.random() * 2 ** 48))
		baseline = await captureBalanceBaseline(page, account, config.tokenAddress)
		await grantSpender(ctx, page, spender, nonce)
		await settledBalanceWrite(page, account, "0", baseline)

		// The mint's receipt refreshes the balance once, and its outbox row clears after that.
		baseline = await captureBalanceBaseline(page, account, config.tokenAddress)
		const minted = await mintPublicTokens(wallet, config.tokenAddress, account, DRAINED, config.minterAddress, fee)
		await waitForFreshBalanceRow(page, {
			account,
			tokenContract: config.tokenAddress,
			expectedPublicRaw: DRAINED.toString(),
			baselineUpdatedAt: baseline,
			maxRefreshes: 0,
		})
		await waitFor("the wallet never settled the mint's receipt", () => receiptSettled(page, minted))
		await waitForBalanceQueueIdle(page)

		await spendPublicAuthwit(wallet, config.tokenAddress, account, spender, DRAINED, nonce, fee)
		return page
	} finally {
		await cleanup()
	}
}

/** On Send: 1 token, public to public, to the sandbox minter, from a balance the chain no longer
 *  holds, until the estimate has failed. */
async function sendFromDrainedBalance(page: Page): Promise<void> {
	await navigateByHash(page, "#/popup/send", 10_000)
	await page.waitForSelector(sel("send-from-type"), { timeout: 10_000 })
	await setActiveSendType(page, "send-from-type", "public")
	await setActiveSendType(page, "send-to-type", "public")
	await fillSendForm(page, { amount: "1", destination: (aztecConfig as AztecTestConfig).minterAddress })
	await waitForToast(page, "Couldn't estimate fee", 120_000, { kind: "error" })
}

test.skipIf(!hasConfig)(
	"Send: a fee-estimate error sits 12px above the footer and follows it when it grows",
	{ timeout: 420_000 },
	async ({ dappConnectedExtensionWithTransactionCap }) => {
		const page = await balanceDrainedBehindTheWallet(dappConnectedExtensionWithTransactionCap)
		await sendFromDrainedBalance(page)

		const at = await placement(page, sel("send-footer"))
		console.log(`[snack-placement] Send: ${Math.round(at.footerTop - at.snackBottom)}px above the footer`)
		expect(at.footerTop - at.snackBottom).toBeGreaterThanOrEqual(11.5)
		expect(at.footerTop - at.snackBottom).toBeLessThanOrEqual(12.5)

		const grown = await growFooter(page, sel("send-footer"), at)
		expect(grown.footerTop).toBeLessThanOrEqual(at.footerTop - 40)
		expect(grown.footerTop - grown.snackBottom).toBeGreaterThanOrEqual(11.5)
		expect(grown.footerTop - grown.snackBottom).toBeLessThanOrEqual(12.5)

		expect(dappConnectedExtensionWithTransactionCap.pageErrors).toEqual([])
	},
)

test.skipIf(!hasConfig)(
	"Send: a send that fails once its record is written offers Details, which opens that record",
	{ timeout: 420_000 },
	async ({ dappConnectedExtensionWithTransactionCap }) => {
		const page = await balanceDrainedBehindTheWallet(dappConnectedExtensionWithTransactionCap)
		await sendFromDrainedBalance(page)
		// A public origin needs no review, so the footer sends at once.
		expect(await page.$eval(sel("send-submit"), (el) => el.getAttribute("data-action"))).toBe("send")
		await clickByTestId(page, "send-submit")

		const card = await waitForToast(page, "Send failed", 180_000, { kind: "error" })
		expect(await card.$eval(sel("snackbar-action"), (el) => el.textContent?.trim())).toBe("Details")
		await clickByTestId(page, "snackbar-action")
		await page.waitForFunction(() => window.location.hash.startsWith("#/popup/journal/"), { timeout: 10_000 })
		const id = (await page.evaluate(() => window.location.hash)).slice("#/popup/journal/".length)
		const failed = (await readSendRecords(page)).filter((r) => r.kind === "transfer" && r.stage === "failed")
		expect(failed.map((r) => r.id)).toEqual([id])
		await page.waitForFunction(
			(s: string) => document.querySelector(s)?.textContent?.trim() === "Failed",
			{ timeout: 10_000, polling: 100 },
			sel("journal-detail-state"),
		)
		// The card leaves over 150ms, and the journal page can load inside that.
		await page.waitForFunction((s: string) => document.querySelector(s) === null, { timeout: 5_000, polling: 50 }, SNACK)
		expect(await page.$(SNACK)).toBeNull()

		expect(dappConnectedExtensionWithTransactionCap.pageErrors).toEqual([])
	},
)

test.skipIf(!hasConfig)(
	"the execute window: a fee-estimate error sits 12px above the approve/reject footer",
	{ timeout: 300_000 },
	async ({ dappConnectedExtensionWithTransactionCap }) => {
		const ctx = dappConnectedExtensionWithTransactionCap
		const config = aztecConfig as AztecTestConfig
		const pg = ctx.playgroundPage
		// A public transfer of 1,000,000 base units from an account that holds none fails the estimate.
		await pg.evaluate(
			({ token, recipient }: { token: string; recipient: string }) => {
				const setVal = (s: string, v: string) => {
					const input = document.querySelector<HTMLInputElement>(s)
					if (!input) return
					Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(input, v)
					input.dispatchEvent(new Event("input", { bubbles: true }))
				}
				setVal('[data-testid="pg-input-tokenAddress"]', token)
				setVal('[data-testid="pg-input-recipient"]', recipient)
				setVal('[data-testid="pg-input-amount"]', "1000000")
			},
			{ token: config.tokenAddress, recipient: config.minterAddress },
		)
		const executeP = waitForPopup(ctx, "execute", { timeout: 60_000 })
		await clickByTestId(pg, "pg-btn-sendTx-default")
		const execute = await executeP
		await waitForToast(execute, "Couldn't estimate fee", 180_000, { kind: "error" })

		const at = await placement(execute, sel("dapp-approval-footer"))
		console.log(`[snack-placement] execute: ${Math.round(at.footerTop - at.snackBottom)}px above the footer, ${at.width}px wide`)
		expect(at.footerTop - at.snackBottom).toBeGreaterThanOrEqual(11.5)
		expect(at.footerTop - at.snackBottom).toBeLessThanOrEqual(12.5)
		// The window centres the 360px column; the card spans it less 16px a side.
		expect(Math.abs(at.width - 328)).toBeLessThanOrEqual(0.5)
		expect(Math.abs(at.left + at.width / 2 - at.columnCentre)).toBeLessThanOrEqual(0.5)

		const grown = await growFooter(execute, sel("dapp-approval-footer"), at)
		expect(grown.footerTop).toBeLessThanOrEqual(at.footerTop - 40)
		expect(grown.footerTop - grown.snackBottom).toBeGreaterThanOrEqual(11.5)
		expect(grown.footerTop - grown.snackBottom).toBeLessThanOrEqual(12.5)

		// A 500px window over the 600px page: the footer starts below the fold.
		await execute.evaluate(() => document.querySelector('[data-testid="e2e-footer-line"]')?.remove())
		await execute.setViewport({ width: 400, height: 500 })
		const short = await placementAtEnd(execute, FOOTER)
		console.log(`[snack-placement] 400x500 before scrolling: ${JSON.stringify(short)}`)
		expect(short.footerTop).toBeGreaterThanOrEqual(short.viewport)
		const hits = await hitsAfterScroll(execute, BUTTONS)
		console.log(`[snack-placement] 400x500 hits after the scroll: ${JSON.stringify(hits)}`)
		expect(hits.map((h) => h.covered)).toEqual([false, false])
		expect(hits[0]?.hit).toBe("execute-reject-btn")
		const scrolled = await placementAtEnd(execute, FOOTER)
		expect(scrolled.footerTop - scrolled.snackBottom).toBeCloseTo(12, 0)
		expect(scrolled.snackBottom).toBeCloseTo(short.snackBottom, 0)

		// The error line (a little taller than the real one, so the footer's top peeks onto the screen).
		await execute.evaluate(() => window.scrollTo(0, 0))
		await addFooterLine(execute, FOOTER, 18)
		const lined = await placementAtEnd(execute, FOOTER)
		console.log(`[snack-placement] 400x500 with the error line: ${JSON.stringify(lined)}`)
		expect(lined.inset).toBeGreaterThanOrEqual(short.inset + 27.5)
		const linedHits = await hitsAfterScroll(execute, BUTTONS)
		expect(linedHits.map((h) => h.covered)).toEqual([false, false])
		expect(linedHits[0]?.hit).toBe("execute-reject-btn")

		expect(ctx.pageErrors).toEqual([])
	},
)
