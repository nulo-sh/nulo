/** In a real browser: where a page or window has a bottom action row, an error snack sits at least
 *  12px above the row's top edge, so it never covers the row's buttons, even in a window shorter
 *  than the page, where a scroll brings the row up and a click lands on it in one task. A send
 *  that fails once its record is written offers Details, which opens that record. */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { type Tx, TxStatus } from "@/wallet/services/transaction/spec"
import { readSealedRows } from "../fixtures/sealed-rows"
import {
	type AztecTestConfig,
	createSponsoredFeeOptions,
	createTestWallet,
	finalizeThrough,
	mintPublicTokens,
	spendPublicAuthwit,
	waitForTxMined,
} from "../fixtures/aztec"
import { TEST_PASSWORD } from "../fixtures/constants"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "../fixtures/extension"
import {
	captureBalanceBaseline,
	clearGetStarted,
	enterSendForm,
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
import { pollUntil } from "../fixtures/poll"
import { assertPgOk, setPgInput, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { shotSend } from "../fixtures/send-page"
import { approveExecute, rejectExecute, waitForExecuteContent, waitForPopup, waitForPopupClosed } from "../fixtures/popups"
import { bringToFront, setViewport } from "../fixtures/browser"

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

type Box = { top: number; bottom: number; left: number; right: number }
type ControlPlacement = { at: string; hit: string; covered: boolean; snack: Box; control: Box; viewport: number }

/** Scrolls `testid` to `at` (the top of the container that scrolls it, the highest it shows, or
 *  centred) and waits for the snack to measure again. */
async function scrollControl(page: Page, testid: string, at: "rest" | "top" | "centre"): Promise<void> {
	await page.evaluate(
		async (id: string, where: string) => {
			const el = document.querySelector(`[data-testid="${id}"]`)
			if (!el) throw new Error(`${id} not found`)
			if (where === "top") el.scrollIntoView({ block: "start" })
			if (where === "centre") el.scrollIntoView({ block: "center" })
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
		},
		testid,
		at,
	)
}

/** `testid` where the page rests, at the top of the container that scrolls it, then centred, each
 *  read once the snack has measured again: what a click at its centre hits, whether any part of it is
 *  under the snack, and where both are. */
async function placementsAtRestAndScrolled(page: Page, testid: string): Promise<ControlPlacement[]> {
	const placements: ControlPlacement[] = []
	for (const at of ["rest", "top", "centre"] as const) {
		await scrollControl(page, testid, at)
		const placement = await page.evaluate(
			(s: string, id: string, where: string) => {
				const box = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()
				const card = document.querySelector(s)?.getBoundingClientRect()
				if (!box || !card) throw new Error("no control or no snack")
				const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
				return {
					at: where,
					hit: hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? hit?.tagName ?? "none",
					covered: card.top < box.bottom && card.bottom > box.top && card.left < box.right && card.right > box.left,
					snack: { top: card.top, bottom: card.bottom, left: card.left, right: card.right },
					control: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
					viewport: window.innerHeight,
				}
			},
			SNACK,
			testid,
			at,
		)
		placements.push(placement)
	}
	return placements
}

type DrainCtx = ExtensionContext & { playgroundPage: Page; accountAddress: string }

const DRAINED = 10n * 10n ** 18n
/** Two finality reads at the production minute, each a single attempt that can fail, and margin, so
 *  the bound holds on a build without the e2e clocks. */
const FINAL_READ_MS = 180_000

async function storedTx(page: Page, hash: string): Promise<Tx | undefined> {
	return (await readSealedRows<Tx>(page, "txs")).find((tx) => tx.naturalId === hash)?.row
}

async function waitFor(what: string, done: () => Promise<boolean>, timeoutMs = 120_000): Promise<void> {
	await pollUntil(done, (met) => met, { label: what, timeoutMs, intervalMs: 500 })
}

/** The wallet acted on the public receipt `txHash`: its record exists and no balance refresh it
 *  asked for is still owed. */
async function receiptSettled(page: Page, txHash: string): Promise<boolean> {
	const records = await readSealedRows<{ kind?: string; txHash?: string }>(page, "incomingTransfers")
	const recorded = records.some(({ row }) => row.kind === "public-event" && row.txHash === txHash)
	const owed = await page.evaluate(async () =>
		Object.keys(await chrome.storage.local.get(null)).some((k) => k.startsWith("nulo:core:incoming-balance-outbox@")),
	)
	return recorded && !owed
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
		const tx = await storedTx(page, grantHash)
		return tx !== undefined && tx.status !== TxStatus.Pending
	})
	return grantHash
}

type TxNode = Awaited<ReturnType<typeof createTestWallet>>["node"]

async function accountTxRows(page: Page, account: string): Promise<Tx[]> {
	return (await readSealedRows<Tx>(page, "txs")).map(({ row }) => row).filter((tx) => tx.account?.toLowerCase() === account.toLowerCase())
}

/** The account's rows, which must be exactly the grant: any other row could owe a write of its own. */
async function soleGrantRow(page: Page, account: string, grantHash: string): Promise<Tx> {
	const rows = await accountTxRows(page, account)
	const [grant] = rows
	if (rows.length !== 1 || grant?.hash !== grantHash) {
		throw new Error(`expected the grant ${grantHash} as the account's only tx row: ${JSON.stringify(rows)}`)
	}
	return grant
}

/**
 * Drives the grant's block final and waits for the balance write the wallet owes for it. The worker
 * commits the row Finalized, then emits the update its balance subscriber answers with a refresh it
 * does not await, so the row alone proves nothing. The grant still awaits finality once its mined
 * write has settled, so the final commit follows that write; with the mint's receipt settled the final
 * refresh is the only one left to enqueue, so a write newer than the commit is its write, and the idle
 * queue after it ends it.
 */
async function settledGrantFinality(page: Page, node: TxNode, account: string, grantHash: string, publicRaw: string): Promise<void> {
	const mined = await soleGrantRow(page, account, grantHash)
	const block = mined.block?.number
	if (block === undefined || !Number.isFinite(block) || !mined.awaitingFinality) {
		throw new Error(`expected the grant mined below Finalized, its final read still owed: ${JSON.stringify(mined)}`)
	}
	const started = Date.now()
	await finalizeThrough(node, block)
	const chainFinal = Date.now()
	const grant = await pollUntil(
		() => soleGrantRow(page, account, grantHash),
		(row) => row.status === TxStatus.Finalized && !row.awaitingFinality,
		{ label: "the wallet reading its grant final", timeoutMs: FINAL_READ_MS, intervalMs: 500 },
	)
	console.log(
		`[snack-placement] grant block ${block}: chain final in ${chainFinal - started} ms, wallet final ${Date.now() - chainFinal} ms later`,
	)
	await settledBalanceWrite(page, account, publicRaw, grant.updatedAt)
}

/**
 * Leaves the wallet showing a public balance the chain no longer holds, as when a dApp spends a
 * public approval: the account receives {@link DRAINED}, grants the sandbox's first account a
 * public authwit for it, and the spender takes it all; `beforeGrant` runs once the wallet shows the
 * balance. A balance refreshes only on a token import, the wallet's own transactions, receipts to
 * its accounts and a manual refresh, and the spend is none of them. A wallet transaction first seen
 * mined below Finalized refreshes balances twice, when mined and when the worker reads its block
 * final; one first seen Finalized refreshes once; each move or prune of its block can add another.
 * A receipt to the account refreshes it once. Nothing here asks for a refresh, so each write has
 * one known cause, and none is owed at the spend.
 */
async function balanceDrainedBehindTheWallet(ctx: DrainCtx, beforeGrant?: (page: Page) => Promise<void>): Promise<Page> {
	const config = aztecConfig as AztecTestConfig
	const account = ctx.accountAddress
	const { wallet, accounts, node, cleanup } = await createTestWallet(config.nodeUrl)
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
		await beforeGrant?.(page)

		// The grant leaving Pending refreshes the account's balances once.
		const nonce = BigInt(Math.floor(Math.random() * 2 ** 48))
		baseline = await captureBalanceBaseline(page, account, config.tokenAddress)
		const grantHash = await grantSpender(ctx, page, spender, nonce)
		await settledBalanceWrite(page, account, DRAINED.toString(), baseline)
		// The grant read final refreshes them again.
		await settledGrantFinality(page, node, account, grantHash, DRAINED.toString())

		await spendPublicAuthwit(wallet, config.tokenAddress, account, spender, DRAINED, nonce, fee)
		return page
	} finally {
		await cleanup()
	}
}

const ONE_TO_MINTER = () => ({ amount: "1", destination: (aztecConfig as AztecTestConfig).minterAddress })

async function openPublicSend(page: Page): Promise<void> {
	await navigateByHash(page, "#/popup/send", 10_000)
	await page.waitForSelector(sel("send-from-type"), { timeout: 10_000 })
	await setActiveSendType(page, "send-from-type", "public")
	await setActiveSendType(page, "send-to-type", "public")
}

/** On Send: 1 token, public to public, to the sandbox minter, from a balance the chain no longer
 *  holds, until the estimate has failed. Nothing goes out on a fee the person has not seen, so the
 *  footer stays off. */
async function sendFromDrainedBalance(page: Page): Promise<void> {
	await openPublicSend(page)
	await enterSendForm(page, ONE_TO_MINTER())
	await waitForToast(page, "Couldn't estimate fee", 120_000, { kind: "error" })
	expect(await page.$eval(sel("send-submit"), (el) => getComputedStyle(el).pointerEvents)).toBe("none")
}

/**
 * On Send, while the chain still holds the balance: the same transfer, until its estimate lands.
 * Confirm reuses that estimate's build without simulating it again unless a send of the account
 * reached the node since; the grant that follows is one, so Confirm builds afresh against the
 * balance the chain holds then.
 */
async function estimateOnSend(page: Page): Promise<void> {
	await openPublicSend(page)
	await fillSendForm(page, ONE_TO_MINTER())
}

/** A drained send whose estimate landed before the grant: Confirm builds again, so it fails once its
 *  record is written. */
async function confirmDrainedSend(page: Page): Promise<void> {
	await bringToFront(page)
	// A public origin needs no review, so the footer sends at once.
	expect(await page.$eval(sel("send-submit"), (el) => el.getAttribute("data-action"))).toBe("send")
	await clickByTestId(page, "send-submit")
}

/** Asks, through the playground, for a public transfer of 1,000,000 base units from an account that
 *  holds none, and returns the execute window it opens; its estimate fails. */
async function openUnfundedDappSend(ctx: ExtensionContext & { playgroundPage: Page }): Promise<Page> {
	const config = aztecConfig as AztecTestConfig
	const pg = ctx.playgroundPage
	await setPgInput(pg, "tokenAddress", config.tokenAddress)
	await setPgInput(pg, "recipient", config.minterAddress)
	await setPgInput(pg, "amount", "1000000")
	const execute = waitForPopup(ctx, "execute", { timeout: 60_000 })
	await clickByTestId(pg, "pg-btn-sendTx-default")
	return execute
}

test.skipIf(!hasConfig)(
	"Send: a fee-estimate error sits 12px above the footer and follows it when it grows",
	{ timeout: 420_000 },
	async ({ dappConnectedExtensionWithTransactionCap }) => {
		// `openPopup` restarts the arrays, so what came since the last one is asserted before the drain
		// opens one: here the fixture's setup popup and its connect and grant windows.
		expect(dappConnectedExtensionWithTransactionCap.consoleErrors).toEqual([])
		expect(dappConnectedExtensionWithTransactionCap.pageErrors).toEqual([])
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

		expect(dappConnectedExtensionWithTransactionCap.consoleErrors).toEqual([])
		expect(dappConnectedExtensionWithTransactionCap.pageErrors).toEqual([])
	},
)

test.skipIf(!hasConfig)(
	"Send: a send that fails once its record is written offers Details, which opens that record",
	{ timeout: 420_000 },
	async ({ dappConnectedExtensionWithTransactionCap }) => {
		expect(dappConnectedExtensionWithTransactionCap.consoleErrors).toEqual([])
		expect(dappConnectedExtensionWithTransactionCap.pageErrors).toEqual([])
		const page = await balanceDrainedBehindTheWallet(dappConnectedExtensionWithTransactionCap, estimateOnSend)
		await confirmDrainedSend(page)

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

		expect(dappConnectedExtensionWithTransactionCap.consoleErrors).toEqual([])
		expect(dappConnectedExtensionWithTransactionCap.pageErrors).toEqual([])
	},
)

test.skipIf(!hasConfig)(
	"the execute window: a fee-estimate error sits 12px above the approve/reject footer",
	{ timeout: 300_000 },
	async ({ dappConnectedExtensionWithTransactionCap }) => {
		const ctx = dappConnectedExtensionWithTransactionCap
		const execute = await openUnfundedDappSend(ctx)
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
		await setViewport(execute, { width: 400, height: 500 })
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

		await rejectExecute(execute)
		await waitForPopupClosed(execute)
		expect(ctx.consoleErrors).toEqual([])
		expect(ctx.pageErrors).toEqual([])
	},
)

test.skipIf(!hasConfig)(
	"Home: an error snack covers no part of an awaiting send's Cancel, at rest or scrolled",
	{ timeout: 480_000 },
	async ({ dappConnectedExtensionWithTransactionCap }) => {
		const ctx = dappConnectedExtensionWithTransactionCap
		expect(ctx.consoleErrors).toEqual([])
		expect(ctx.pageErrors).toEqual([])
		// Where Home rests, the Get started card would hold the awaiting row below the fold.
		const setup = await openPopup(ctx)
		await waitForHash(setup, "#/popup/general", 30_000)
		await clearGetStarted(setup, TEST_PASSWORD)
		await setup.close()
		const page = await balanceDrainedBehindTheWallet(ctx, estimateOnSend)
		await confirmDrainedSend(page)
		await waitForHash(page, "#/popup/general", 10_000)
		await waitForToast(page, "Send failed", 180_000, { kind: "error" })

		// A dApp send waiting on its approval window keeps its Cancel; the failure snack stays until closed.
		const execute = await openUnfundedDappSend(ctx)
		await waitForExecuteContent(execute)
		await bringToFront(page)
		await page.waitForSelector(`${sel("tx-awaiting-card")}[data-stage="queued"] ${sel("tx-awaiting-cancel")}`, { timeout: 60_000 })
		await waitForToast(page, "Send failed", 5_000, { kind: "error" })
		// The snack measures again on the frame after the card arrives.
		await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
		await settledCard(page)

		const placed = await placementsAtRestAndScrolled(page, "tx-awaiting-cancel")
		console.log(`[snack-placement] Home, Cancel at rest, at the top of the middle and centred: ${JSON.stringify(placed)}`)
		for (const p of placed) {
			expect([p.at, p.covered, p.hit], "Cancel is clear of the snack and takes the click").toEqual([
				p.at,
				false,
				"tx-awaiting-cancel",
			])
			expect(p.snack.top >= 0 && p.snack.bottom <= p.viewport, `${p.at}: the snack is wholly on screen`).toBe(true)
		}
		// The snack rests 12px above the 64px nav, and climbs to 12px above the Cancel only where resting
		// would cover it; at the top of the middle the row is clear, so it is back at rest.
		for (const p of placed) {
			const rest = { bottom: p.viewport - 76, top: p.viewport - 76 - (p.snack.bottom - p.snack.top) }
			const meets = p.control.top < rest.bottom && p.control.bottom > rest.top
			expect(p.snack.bottom, `${p.at}: the snack's bottom`).toBeCloseTo(meets ? p.control.top - 12 : rest.bottom, 0)
		}
		expect(placed.filter((p) => p.at === "top").map((p) => p.viewport - p.snack.bottom)).toEqual([76])
		await page.evaluate(async () => {
			window.scrollTo(0, 0)
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
		})
		await shotSend(page, "home-snack-above-cancel", "tx-awaiting-card")

		await rejectExecute(execute)
		await waitForPopupClosed(execute)
		expect(ctx.consoleErrors).toEqual([])
		expect(ctx.pageErrors).toEqual([])
	},
)
