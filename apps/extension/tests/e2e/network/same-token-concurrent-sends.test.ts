/**
 * Two Send-page sends fired back to back, the second driven while the first is still in flight.
 *
 * Aztec orders a token's private notes per (token, sender, recipient): a send proves that its
 * predecessor's sequence nullifier exists, and the PXE takes the next index when it proves. The
 * first send of a sequence touches the (sender, recipient) handshake every token shares, and a
 * private fee payment spends the payer's fee notes. Sends that share none of this must not wait
 * for each other.
 *
 * "Held" means the local node keeps the first send submitted and unmined (`holdMining`), the window
 * a person on a real network sends into. Every case starts from an empty mempool, so it never pairs
 * with a tx an earlier case left behind, and asserts the journal, the estimate and the balance rows
 * against a ledger of the file's own settled sends. The service worker does the waiting; the Send
 * page shows the fee row queued with Send disabled unless the row offers to queue (a fee cap, or
 * Nulo's sponsor paying), and a confirmed send that waits shows its card at the journal's `queued`
 * stage.
 *
 * @requires-proverless — formal marker scanned by scripts/e2e/agent.sh; the proof and projection
 * gates exist only in a proverless-armed build.
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { afterEach, expect } from "vitest"
import { queuedFeeCap } from "@/wallet/services/execution/queued-fee-cap"
import { type AztecTestConfig, waitForTxMined } from "../fixtures/aztec"
import { bringToFront, stopBackground } from "../fixtures/browser"
import { type Burst, aztecConfig, burstTest as test, expectLedger, raw, reopen, settle } from "../fixtures/burst-account"
import { TEST_PASSWORD } from "../fixtures/constants"
import {
	test as baseTest,
	clickByTestId,
	connectPlayground,
	type ExtensionContext,
	grantCapBundle,
	openPopup,
	registerProfile,
	waitForHash,
} from "../fixtures/extension"
import { pinnedFeeText, refusePrices, seedFeeJuiceQuote } from "../fixtures/fee-quote"
import { PollTimeoutError, pollUntil } from "../fixtures/poll"
import {
	createAndActivateProfile,
	getAccountAddress,
	importTokenAndWaitForBalance,
	lockWallet,
	navigateByHash,
	readSessionRow,
	switchToLocalNetwork,
	unlockAfterBackgroundDeath,
	unlockProfile,
	waitForProfilePurged,
} from "../fixtures/helpers"
import { shotSend, waitForReview, waitForReviewReady, waitForSendGone } from "../fixtures/send-page"
import { pointerClick } from "../helpers/legal-drivers"
import { readDappExecuteRecords, waitForDappExecuteStagesPresent } from "../fixtures/journal"
import { holdMining, pendingTxCount, releaseMining, waitForEmptyMempool } from "../fixtures/mining-hold"
import { assertPgOk, openPlayground, type PgResult, setPgInput, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { reconnectPlayground } from "../fixtures/send"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { holdAccountRegistration, releaseAccountRegistration } from "../fixtures/projection-gate"
import { holdProofGate, releaseProofGate } from "../fixtures/proof-gate"
import {
	type BurstSend,
	confirmSend,
	expectEstimateQueued,
	expectStageHeld,
	readTransferRows,
	readTxStatuses,
	startSend,
	type TransferRow,
	waitForEstimate,
	waitForTransferStage,
	waitForTransfersTerminal,
	waitForTxsMined,
} from "../fixtures/send-burst"
import { readScopeIdentity, seedTransaction } from "../helpers/activity-seeds"
import { deleteProfile, exportBackup, waitForHeldProjection } from "../helpers/handshake-import"
import { importFullBackup, POPUP_IMPORT_SHELL } from "../helpers/import-drivers"
import { readSealedRows } from "../fixtures/sealed-rows"

const hasConfig = aztecConfig !== undefined
const OTHER_PASSWORD = "OtherProfilePw123!"

afterEach(releaseMining)

/** Fires A and leaves it submitted and unmined; the caller drives B. */
async function fireIntoHeldWindow(burst: Burst, a: BurstSend): Promise<string> {
	await reopen(burst)
	await waitForEmptyMempool((aztecConfig as AztecTestConfig).nodeUrl)
	await holdMining()
	await startSend(burst.page, a)
	expect(await waitForEstimate(burst.page)).toBe("ready")
	await confirmSend(burst.page)
	const row = await waitForTransferStage(burst.page, raw(a.amount), ["succeeded"])
	return row.txHash as string
}

/**
 * The no-wait contract for sends that share nothing: B's estimate lands while A is still unmined,
 * B confirms, and the two mine together (the hold needs two txs).
 */
async function expectParallel(burst: Burst, a: BurstSend, b: BurstSend): Promise<void> {
	const aHash = await fireIntoHeldWindow(burst, a)
	const { page } = burst
	await startSend(page, b)
	expect(await waitForEstimate(page, 60_000), "B's estimate must land while A is still unmined").toBe("ready")
	expect((await readTxStatuses(page, [aHash]))[aHash], "A is still pending when B's estimate lands").toBe(0)
	await confirmSend(page)
	await waitForTransferStage(page, raw(b.amount), ["succeeded", "failed"])
	const rows = (await waitForTransfersTerminal(page)).filter((r) => r.amount === raw(a.amount) || r.amount === raw(b.amount))
	expect(rows.map((r) => [r.stage, r.error])).toEqual([
		["succeeded", undefined],
		["succeeded", undefined],
	])
	await waitForTxsMined(
		page,
		rows.map((r) => r.txHash as string),
	)
	await releaseMining()
	await settle(burst, [a, b])
	await expectLedger(burst, [...new Set([a.token, b.token])])
}

const to = (): string => (aztecConfig as AztecTestConfig).minterAddress

test.skipIf(!hasConfig)(
	"different tokens: the second send does not wait for the first",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		await expectParallel(
			burst,
			{ token: "TST", from: "private", to: "private", amount: "1", destination: to(), fee: "sponsored" },
			{ token: "ALT", from: "private", to: "private", amount: "2", destination: to(), fee: "sponsored" },
		)
	},
)

test.skipIf(!hasConfig)(
	"a private send on public fee juice, then a public send on private fee juice: no shared state, no wait",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		await expectParallel(
			burst,
			{ token: "TST", from: "private", to: "private", amount: "3", destination: to(), fee: "public" },
			{ token: "TST", from: "public", to: "public", amount: "4", destination: to(), fee: "private" },
		)
	},
)

test.skipIf(!hasConfig)(
	"two sponsored public sends of one token do not wait for each other",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		await expectParallel(
			burst,
			{ token: "TST", from: "public", to: "public", amount: "5", destination: to(), fee: "sponsored" },
			{ token: "TST", from: "public", to: "public", amount: "6", destination: to(), fee: "sponsored" },
		)
	},
)

test.skipIf(!hasConfig)(
	"public to private sends of one token to two recipients use two sequences: no wait",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		await expectParallel(
			burst,
			{ token: "TST", from: "public", to: "private", amount: "7", destination: to(), fee: "sponsored" },
			{ token: "TST", from: "public", to: "private", amount: "8", destination: burst.other, fee: "sponsored" },
		)
	},
)

/** How long a queued B must keep waiting while A is held. */
const HELD_MS = 15_000

/**
 * The ordering contract for sends that share chain state: while A is held unmined, B's fee row reads
 * queued (never the failure toast, never a fee), with Send enabled only where the row offers to
 * queue. Lifting the hold mines A; B's estimate then lands, B confirms, and both succeed.
 */
async function expectQueued(burst: Burst, a: BurstSend, b: BurstSend, afterA?: (burst: Burst) => Promise<void>): Promise<void> {
	const aHash = await fireIntoHeldWindow(burst, a)
	await afterA?.(burst)
	const { page } = burst
	await startSend(page, b)
	await expectEstimateQueued(page, HELD_MS)
	expect((await readTxStatuses(page, [aHash]))[aHash], "A is still unmined while B waits").toBe(0)
	await releaseMining()
	expect(await waitForEstimate(page), "B's estimate lands once A is mined").toBe("ready")
	await confirmSend(page)
	await expectBothSucceed(burst, a, b)
}

async function expectBothSucceed(burst: Burst, a: BurstSend, b: BurstSend): Promise<void> {
	// B's row exists only once the service worker has resolved its keys, after the page has left.
	await waitForTransferStage(burst.page, raw(b.amount), ["succeeded", "failed", "cancelled"], 300_000)
	const rows = (await waitForTransfersTerminal(burst.page)).filter((r) => r.amount === raw(a.amount) || r.amount === raw(b.amount))
	expect(rows.map((r) => [r.stage, r.error])).toEqual([
		["succeeded", undefined],
		["succeeded", undefined],
	])
	await waitForTxsMined(
		burst.page,
		rows.map((r) => r.txHash as string),
	)
	await settle(burst, [a, b])
	await expectLedger(burst, [...new Set([a.token, b.token])])
}

test.skipIf(!hasConfig)(
	"a private send, then a private to public send of the same token: the second waits",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		await expectQueued(
			burst,
			{ token: "TST", from: "private", to: "private", amount: "14", destination: to(), fee: "sponsored" },
			{ token: "TST", from: "private", to: "public", amount: "15", destination: to(), fee: "sponsored" },
		)
	},
)

test.skipIf(!hasConfig)(
	"a public to private send, then a private send to the same recipient: the second waits",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		await expectQueued(
			burst,
			{ token: "TST", from: "public", to: "private", amount: "16", destination: to(), fee: "sponsored" },
			{ token: "TST", from: "private", to: "private", amount: "17", destination: to(), fee: "sponsored" },
		)
	},
)

test.skipIf(!hasConfig)(
	"two private sends of the same token on Nulo's sponsor: the second is queued while the first is held, then both succeed",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		const a: BurstSend = { token: "TST", from: "private", to: "private", amount: "18", destination: to(), fee: "sponsored" }
		const b: BurstSend = { token: "TST", from: "private", to: "private", amount: "19", destination: to(), fee: "sponsored" }
		const aHash = await fireIntoHeldWindow(burst, a)
		const { page } = burst
		await startSend(page, b)
		await expectEstimateQueued(page, 3_000)
		expect(await page.$eval('[data-testid="send-submit"]', (el) => el.textContent?.trim())).toBe("Queue send")
		await shotSend(page, "send-queued-sponsored", "fee-settings-card")
		await confirmSend(page)
		await expectStageHeld(page, raw(b.amount), "queued", HELD_MS)
		expect((await readTxStatuses(page, [aHash]))[aHash], "A is still unmined while B waits").toBe(0)
		await releaseMining()
		await expectBothSucceed(burst, a, b)
	},
)

test.skipIf(!hasConfig)(
	"two public sends paid with private fee juice: the second waits",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		await expectQueued(
			burst,
			{ token: "TST", from: "public", to: "public", amount: "21", destination: to(), fee: "private" },
			{ token: "TST", from: "public", to: "public", amount: "22", destination: to(), fee: "private" },
		)
	},
)

/** Ends the background under the held send, so all that orders the next one is A's stored tx row. */
async function restartBackground(burst: Burst): Promise<void> {
	await burst.page.close()
	await stopBackground(burst.ctx)
	burst.page = await openPopup(burst.ctx)
	await unlockAfterBackgroundDeath(burst.page)
}

test.skipIf(!hasConfig)(
	"after a background restart, a send on the same private fee contract waits for the pending one",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		await expectQueued(
			burst,
			{ token: "TST", from: "public", to: "public", amount: "31", destination: to(), fee: "private" },
			{ token: "TST", from: "public", to: "public", amount: "32", destination: to(), fee: "private" },
			restartBackground,
		)
	},
)

test.skipIf(!hasConfig)(
	"first private sends of two tokens to a new recipient: the second waits",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		const { randomAztecAddress } = await import("../fixtures/aztec")
		const fresh = await randomAztecAddress()
		await expectQueued(
			burst,
			{ token: "TST", from: "private", to: "private", amount: "23", destination: fresh, fee: "sponsored" },
			{ token: "ALT", from: "private", to: "private", amount: "24", destination: fresh, fee: "sponsored" },
		)
	},
)

interface AwaitingCard {
	stage: string | null
	subtitle: string | null
	focus: boolean
	cancel: boolean
}

async function readAwaitingCards(page: Page): Promise<AwaitingCard[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll('[data-testid="tx-awaiting-card"]')].map((card) => ({
			stage: card.getAttribute("data-stage"),
			subtitle: card.querySelector('[data-testid="tx-awaiting-subtitle"]')?.textContent?.trim() ?? null,
			focus: Boolean(card.querySelector('[data-testid="tx-awaiting-focus"]')),
			cancel: Boolean(card.querySelector('[data-testid="tx-awaiting-cancel"]')),
		})),
	)
}

/**
 * The only awaiting card, at `stage` with its cancel control. A reopened popup can first render a
 * stage-less card (the executing-task snapshot lands before the journal's); only that is waited
 * through, and a second card or any other stage fails at once.
 */
async function waitForAwaitingCard(page: Page, stage: string): Promise<AwaitingCard> {
	const appearBy = Date.now() + 30_000
	let settleBy: number | undefined
	let sampledAt = 0
	let seen = "[]"
	const late = () => new Error(`no awaiting card reached ${stage} in time: ${seen}`)
	const sample = async () => {
		const cards = await readAwaitingCards(page)
		sampledAt = Date.now()
		seen = JSON.stringify(cards)
		if (cards.length > 1) throw new Error(`${cards.length} awaiting cards for one send: ${seen}`)
		// The bound is the test's, so a sample taken past it fails even when it shows the card.
		if (sampledAt > (settleBy ?? appearBy)) throw late()
		const [card] = cards
		if (card?.stage && !(card.stage === stage && card.cancel))
			throw new Error(`the awaiting card is not at ${stage} with a cancel control: ${seen}`)
		return card
	}
	const ready = (card: AwaitingCard | undefined) => card?.stage === stage && card.cancel
	const label = `an awaiting card at ${stage}`
	const lateOnTimeout = (error: unknown): never => {
		throw error instanceof PollTimeoutError ? late() : error
	}
	const first = await pollUntil(sample, (card) => card !== undefined, { label, timeoutMs: 30_000, intervalMs: 250 }).catch(lateOnTimeout)
	if (ready(first)) return first as AwaitingCard
	// The stage-less card gets 10 s from its first sighting to reach `stage`.
	settleBy = sampledAt + 10_000
	return (await pollUntil(sample, ready, { label, timeoutMs: settleBy - Date.now(), intervalMs: 250 }).catch(
		lateOnTimeout,
	)) as AwaitingCard
}

/**
 * A in `page` and B in a second wallet page, both estimated before either is sent, then confirmed
 * back to back while mining is held. The second page cannot see A, so only the service worker can
 * make B wait: B's row must sit at `queued` while A is submitted and unmined.
 */
async function confirmInTwoWindows(ctx: ExtensionContext, page: Page, a: BurstSend, b: BurstSend): Promise<Page> {
	await waitForEmptyMempool((aztecConfig as AztecTestConfig).nodeUrl)
	await holdMining()
	const tab = await openPopup(ctx)
	await waitForHash(tab, "#/popup/general", 30_000)
	await startSend(page, a)
	await startSend(tab, b)
	expect(await waitForEstimate(page, 180_000)).toBe("ready")
	expect(await waitForEstimate(tab, 180_000)).toBe("ready")
	await confirmSend(page)
	await confirmSend(tab)
	await waitForTransferStage(page, raw(a.amount), ["succeeded"], 180_000)
	await expectStageHeld(page, raw(b.amount), "queued", HELD_MS)
	return tab
}

test.skipIf(!hasConfig)(
	"two windows: the second send waits in the wallet at queued, across a closed and reopened popup",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		const a: BurstSend = { token: "TST", from: "private", to: "private", amount: "25", destination: to(), fee: "sponsored" }
		const b: BurstSend = { token: "TST", from: "private", to: "private", amount: "26", destination: to(), fee: "sponsored" }
		await reopen(burst)
		const tab = await confirmInTwoWindows(burst.ctx, burst.page, a, b)
		await tab.close()
		await reopen(burst)
		await expectStageHeld(burst.page, raw(b.amount), "queued", 5_000)
		expect(await waitForAwaitingCard(burst.page, "queued")).toEqual({
			stage: "queued",
			subtitle: "Waiting for your earlier send",
			focus: false,
			cancel: true,
		})
		await shotSend(burst.page, "home-queued-send", "tx-awaiting-card")
		await releaseMining()
		await expectBothSucceed(burst, a, b)
	},
)

test.skipIf(!hasConfig)(
	"two windows: a send waiting at queued is cancelled from its card and never reaches the node",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		const a: BurstSend = { token: "TST", from: "private", to: "private", amount: "27", destination: to(), fee: "sponsored" }
		const b: BurstSend = { token: "TST", from: "private", to: "private", amount: "28", destination: to(), fee: "sponsored" }
		await reopen(burst)
		const tab = await confirmInTwoWindows(burst.ctx, burst.page, a, b)
		await tab.close()
		await reopen(burst)
		await waitForTransferStage(burst.page, raw(b.amount), ["queued"], 5_000)
		await waitForAwaitingCard(burst.page, "queued")
		await clickByTestId(burst.page, "tx-awaiting-cancel")
		const cancelled = await waitForTransferStage(burst.page, raw(b.amount), ["cancelled", "failed", "succeeded"])
		expect([cancelled.stage, cancelled.txHash]).toEqual(["cancelled", undefined])
		await releaseMining()
		const aRow = (await waitForTransfersTerminal(burst.page)).find((r) => r.amount === raw(a.amount))
		expect(aRow?.stage).toBe("succeeded")
		await waitForTxsMined(burst.page, [aRow?.txHash as string])
		await settle(burst, [a, b])
		await expectLedger(burst, ["TST"])
	},
)

/** Whether this file's browser has approved the playground's origin: the burst fixture is file-scoped. */
let playgroundApproved = false

/** The playground with the matrix account granted. Once the origin is approved, a new page's
 *  discovery is automatic and only the emoji check asks. */
async function matrixPlayground(burst: Burst): Promise<Page> {
	if (playgroundApproved) {
		const playground = await openPlayground(burst.ctx)
		await reconnectPlayground(burst.ctx, playground, "transaction", "same-token-concurrent-sends:reconnect")
		return playground
	}
	const playground = await connectPlayground(burst.ctx)
	await grantCapBundle(burst.ctx, playground, "transaction", async (ids) => {
		const mine = ids.find((id) => id?.toLowerCase() === burst.account.toLowerCase())
		if (!mine) throw new Error("the capabilities popup does not offer the matrix account")
		return [mine]
	})
	playgroundApproved = true
	return playground
}

test.skipIf(!hasConfig)(
	"a Send-page send confirmed while a dApp send proves waits at queued, then both succeed",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		const config = aztecConfig as AztecTestConfig
		await reopen(burst)
		const playground = await matrixPlayground(burst)
		try {
			const b: BurstSend = { token: "TST", from: "private", to: "private", amount: "29", destination: to(), fee: "sponsored" }
			await waitForEmptyMempool(config.nodeUrl)
			await startSend(burst.page, b)
			expect(await waitForEstimate(burst.page)).toBe("ready")

			await bringToFront(playground)
			await setPgInput(playground, "tokenAddress", config.tokenAddress)
			await setPgInput(playground, "recipient", config.minterAddress)
			await setPgInput(playground, "amount", "1")
			const seq = await snapshotResultSeq(playground)
			const approvalP = waitForPopup(burst.ctx, "execute", { timeout: 60_000 })
			await clickByTestId(playground, "pg-btn-sendTx-default")
			const approval = await approvalP
			await waitForExecuteContent(approval, 60_000)
			await holdProofGate(burst.page)
			try {
				await approveExecute(approval, { feeMethod: "sponsored", approvableTimeoutMs: 120_000 })
				await waitForDappExecuteStagesPresent(burst.page, ["proving"], { timeout: 60_000 })
				// The proof gate releases itself after 20 s, so B is observed while the page is still leaving.
				const confirmed = confirmSend(burst.page)
				await waitForTransferStage(burst.page, raw(b.amount), ["queued"], 15_000)
				expect((await readDappExecuteRecords(burst.page)).map((r) => r.stage)).toEqual(["proving"])
				await confirmed
			} finally {
				await releaseProofGate(burst.page)
			}
			await assertPgOk(playground, await waitForPgResult(playground, "sendTx", seq, 300_000), "dApp send beside a queued transfer")
			const row = await waitForTransferStage(burst.page, raw(b.amount), ["succeeded", "failed"], 300_000)
			expect([row.stage, row.error]).toEqual(["succeeded", undefined])
			await waitForTxsMined(burst.page, [row.txHash as string])
			await settle(burst, [b])
			burst.ledger.TST.publicRaw -= 1n
			await expectLedger(burst, ["TST"])
		} finally {
			await playground.close()
		}
	},
)

/** The hash a NO_WAIT `sendTx` answered with: the answer comes at submission, not inclusion. */
function dappTxHash(result: PgResult): string {
	const txHash = (result.resultJson as { txHash?: string }).txHash
	if (typeof txHash !== "string") throw new Error(`no txHash in ${JSON.stringify(result.resultJson)}`)
	return txHash
}

/** The dApp send recorded after `known` keeps reading `stage` for `windowMs`: its build has not started. */
async function expectDappRecordHeld(page: Page, known: ReadonlySet<string>, stage: string, windowMs: number): Promise<void> {
	const fresh = async () => (await readDappExecuteRecords(page)).filter((r) => !known.has(r.id))
	await pollUntil(fresh, (rows) => rows.length > 0, { label: "the dApp send recorded", timeoutMs: 30_000, intervalMs: 250 })
	const deadline = Date.now() + windowMs
	while (Date.now() < deadline) {
		const stages = (await fresh()).map((r) => r.stage)
		if (stages.length !== 1 || stages[0] !== stage)
			throw new Error(`the dApp send was expected to wait at ${stage}, but reads ${JSON.stringify(stages)}`)
		await new Promise((r) => setTimeout(r, 250))
	}
}

test.skipIf(!hasConfig)(
	"a Send-page send held unmined, then a dApp send of the same account: the dApp send waits at queued, then both succeed",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		const config = aztecConfig as AztecTestConfig
		await reopen(burst)
		const playground = await matrixPlayground(burst)
		try {
			// A private send on a sponsor: it shares nothing with the dApp's public transfer, so only the
			// opaque wait (a dApp send's spends are unknown before its build) can hold the dApp send.
			const a: BurstSend = { token: "TST", from: "private", to: "private", amount: "33", destination: to(), fee: "sponsored" }
			const aHash = await fireIntoHeldWindow(burst, a)

			await bringToFront(playground)
			await setPgInput(playground, "tokenAddress", config.tokenAddress)
			await setPgInput(playground, "recipient", config.minterAddress)
			await setPgInput(playground, "amount", "1")
			const known = new Set((await readDappExecuteRecords(burst.page)).map((r) => r.id))
			const seq = await snapshotResultSeq(playground)
			const approvalP = waitForPopup(burst.ctx, "execute", { timeout: 60_000 })
			await clickByTestId(playground, "pg-btn-sendTx-default")
			const approval = await approvalP
			await waitForExecuteContent(approval, 60_000)
			await approveExecute(approval, { feeMethod: "sponsored", approvableTimeoutMs: 120_000 })
			await expectDappRecordHeld(burst.page, known, "queued", HELD_MS)
			expect((await readTxStatuses(burst.page, [aHash]))[aHash], "A is still unmined while the dApp send waits").toBe(0)

			await releaseMining()
			const sent = await waitForPgResult(playground, "sendTx", seq, 300_000)
			await assertPgOk(playground, sent, "dApp send behind a held transfer")
			await waitForTxMined(config, dappTxHash(sent))
			const row = (await waitForTransfersTerminal(burst.page)).find((r) => r.amount === raw(a.amount))
			expect([row?.stage, row?.error]).toEqual(["succeeded", undefined])
			await waitForTxsMined(burst.page, [aHash])
			await settle(burst, [a])
			burst.ledger.TST.publicRaw -= 1n
			await expectLedger(burst, ["TST"])
		} finally {
			await playground.close()
		}
	},
)

/**
 * Right after a full-backup import, while the projection gate keeps the account out of the PXE, a
 * fresh account's first two sends, confirmed back to back from two windows. Both carry the
 * account's initialization, so the second waits at `queued` until the first is mined; the first
 * registers the account in the PXE while it holds the execution slot.
 */
baseTest.skipIf(!hasConfig)(
	"right after a full-backup import, a fresh account's first two sends complete in order",
	{ timeout: 900_000, retry: 0 },
	async ({ freshExtensionPerTest: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const dir = mkdtempSync(join(tmpdir(), "nulo-e2e-import-sends-"))
		let page: Page | undefined
		let tab: Page | undefined
		try {
			await registerProfile(ctx)
			page = await openPopup(ctx)
			await waitForHash(page, "#/popup/general", 30_000)
			await switchToLocalNetwork(page)
			const profileId = (await readSessionRow(page))?.profile
			if (!profileId) throw new Error("no unlocked profile after registration")
			const account = await getAccountAddress(page)
			const { mintPublicTokensForAccount } = await import("../fixtures/aztec")
			await mintPublicTokensForAccount(config, account, 100n * 10n ** 18n)
			// The backup must carry the minted balance: the held projection cannot refresh it after import.
			await importTokenAndWaitForBalance(page, account, config.tokenAddress, (100n * 10n ** 18n).toString())
			await createAndActivateProfile(page, "Other", OTHER_PASSWORD)
			await lockWallet(page)
			await unlockProfile(page, profileId, TEST_PASSWORD)
			const file = await exportBackup(page, "password", account, config.tokenAddress, dir)
			await deleteProfile(page, "settings")
			await waitForProfilePurged(page, profileId)
			await waitForHash(page, "#/popup/auth", 30_000)

			await holdAccountRegistration(page, account)
			await navigateByHash(page, "#/popup/import")
			await importFullBackup(page, file, TEST_PASSWORD, POPUP_IMPORT_SHELL)
			await switchToLocalNetwork(page)
			expect(await getAccountAddress(page)).toBe(account)
			await waitForHeldProjection(page)

			const a: BurstSend = {
				token: "TST",
				from: "public",
				to: "private",
				amount: "3",
				destination: config.minterAddress,
				fee: "sponsored",
			}
			const b: BurstSend = {
				token: "TST",
				from: "public",
				to: "public",
				amount: "4",
				destination: config.minterAddress,
				fee: "sponsored",
			}
			tab = await confirmInTwoWindows(ctx, page, a, b)
			await releaseMining()
			const rows = (await waitForTransfersTerminal(page)).filter((r) => r.amount === raw(a.amount) || r.amount === raw(b.amount))
			expect(rows.map((r) => [r.amount, r.stage, r.error])).toEqual([
				[raw(a.amount), "succeeded", undefined],
				[raw(b.amount), "succeeded", undefined],
			])
			await waitForTxsMined(
				page,
				rows.map((r) => r.txHash as string),
			)
			const journal = await page.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)))
			expect(journal).not.toContain("PXE_SCOPE_UNREGISTERED")
		} finally {
			await tab?.close().catch(() => {})
			if (page) await releaseAccountRegistration(page).catch(() => {})
			rmSync(dir, { recursive: true, force: true })
		}
	},
)

type Asking = TransferRow & { reask: { fee: string; cap: string } }

const BEFORE_PROOF = new Set(["pending", "queued", "simulating"])

/** Waits for a re-ask held to `cap` (any, before the first accept) or, after an accept, for proof
 *  progress; fails on a terminal failure, or on proof progress before any accept. */
async function waitForAskOrSent(page: Page, amountRaw: string, cap?: string): Promise<Asking | "sent"> {
	const asking = (row: TransferRow | undefined) =>
		row?.stage === "queued" && row.reask !== undefined && (cap === undefined || row.reask.cap === cap)
	const sent = (row: TransferRow | undefined) => row?.stage !== undefined && !BEFORE_PROOF.has(row.stage)
	const row = await pollUntil(
		async () => {
			const read = (await readTransferRows(page)).find((r) => r.amount === amountRaw)
			if (!asking(read) && sent(read) && (cap === undefined || !["proving", "submitting", "succeeded"].includes(read?.stage ?? ""))) {
				throw new Error(`transfer ${amountRaw} left the queue without an accept: ${JSON.stringify(read)}`)
			}
			return read
		},
		(read) => asking(read) || sent(read),
		{ label: `transfer ${amountRaw} asked again`, timeoutMs: 180_000, intervalMs: 250 },
	)
	return asking(row) ? (row as Asking) : "sent"
}

async function readReaskSheet(page: Page): Promise<{ line: string; button: string }> {
	await waitForReview(page, true)
	await waitForReviewReady(page)
	return page.evaluate(() => ({
		line: document.querySelector('[data-testid="send-review-fee-reask"]')?.textContent?.trim() ?? "",
		button: document.querySelector('[data-testid="send-review-submit"]')?.textContent?.trim() ?? "",
	}))
}

async function readRecordedFee(page: Page, hash: string): Promise<string | undefined> {
	return (await readSealedRows<{ estimatedFee?: string }>(page, "txs")).find((tx) => tx.naturalId === hash)?.row.estimatedFee
}

/** Seeds a finalized private send of TST an hour old, paid from public Fee Juice at Urgent, whose
 *  fee is 4/5 of the recorded fee of `hash`; returns that fee. */
async function seedUrgentSend(burst: Burst, hash: string): Promise<string> {
	const fee = await readRecordedFee(burst.page, hash)
	if (fee === undefined) throw new Error(`no recorded fee for ${hash}`)
	const estimatedFee = ((BigInt(fee) * 4n) / 5n).toString()
	const token = { contract: burst.tokens.TST, name: "TestToken", symbol: "TST", decimals: 18 }
	const scope = { ...(await readScopeIdentity(burst.page)), token }
	const seed = { hash: `0x${"5e".repeat(32)}`, amount: raw("1"), at: Date.now() - 3_600_000, transferType: 0 }
	await seedTransaction(burst.page, scope, { ...seed, estimatedFee, feePaymentMethod: 1, priorityLevel: "urgent" })
	return estimatedFee
}

/** The case's bound on re-asks: each needs a price move between an accept and its build. */
const MAX_ASKS = 3

test.skipIf(!hasConfig)(
	"a private send at Fast held unmined; a second at Urgent is queued against the cap of an older Urgent send, asked again after the release, accepted from Home, and goes out once",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		const { nodeUrl } = aztecConfig as AztecTestConfig
		const prices = await refusePrices(burst.ctx)
		// B's basis is the older Urgent send, never A at Fast: seeded at 4/5 of A's fee, its cap is about
		// A's fee, below B at Urgent, whose multiplier is 5/3 of Fast's in every build.
		const a: BurstSend = { token: "TST", from: "private", to: "private", amount: "9", destination: to(), fee: "public", speed: "fast" }
		const b: BurstSend = { ...a, amount: "10", speed: "urgent" }
		const basis = await seedUrgentSend(burst, await fireIntoHeldWindow(burst, a))
		const { page } = burst
		// Before Home remounts for the first re-ask, which is when its price client reads.
		await seedFeeJuiceQuote(burst.ctx, prices)

		await startSend(page, b)
		await expectEstimateQueued(page, 3_000)
		await page.waitForSelector('[data-testid="fee-estimate-queued-cap-line"]', { timeout: 5_000 })
		await shotSend(page, "4-send-queued-cap", "fee-settings-card")
		await pointerClick(page, "send-submit")
		await waitForReview(page, true)
		await waitForReviewReady(page)
		expect(await page.$eval('[data-testid="send-review-submit"]', (el) => el.textContent?.trim())).toBe("Queue send")
		await shotSend(page, "4-review-queued-cap", "send-review-fee")
		await pointerClick(page, "send-review-submit")
		await waitForSendGone(page, 30_000)

		await expectStageHeld(page, raw(b.amount), "queued", HELD_MS)
		expect(await pendingTxCount(nodeUrl), "while A is held the node holds A alone").toBe(1)
		expect((await waitForAwaitingCard(page, "queued")).subtitle).toBe("Waiting for your earlier send")
		await shotSend(page, "4-home-waiting", "tx-awaiting-card")
		await releaseMining()

		let accepted: string | undefined
		const caps: string[] = []
		for (let asks = 1; ; asks++) {
			const asking = await waitForAskOrSent(burst.page, raw(b.amount), accepted)
			if (asking === "sent") break
			if (asks > MAX_ASKS) throw new Error(`asked again ${asks} times: ${JSON.stringify(asking)}`)
			caps.push(asking.reask.cap)
			console.log(`[same-token] re-ask ${asks} over a ${basis} basis: ${JSON.stringify(asking.reask)}`)
			expect(BigInt(asking.reask.fee) > BigInt(asking.reask.cap), "a re-ask names a fee above its cap").toBe(true)
			expect(await pendingTxCount(nodeUrl), "the node holds no tx of B before the accept").toBe(0)
			if (asks === 1) {
				await reopen(burst)
				// The sheet keeps the quote the feed holds when it opens; the feed's read starts as Home mounts.
				await burst.page.waitForSelector('[data-testid="activity-feed-root"][data-fee-quote="ready"]', { timeout: 30_000 })
			}
			expect((await waitForAwaitingCard(burst.page, "queued")).subtitle).toBe("Fee went up. Review")
			if (asks === 1) await shotSend(burst.page, "4-home-reask-row", "tx-awaiting-card")
			await pointerClick(burst.page, "tx-awaiting-card")
			const sheet = await readReaskSheet(burst.page)
			const [now, cap] = [pinnedFeeText(asking.reask.fee), pinnedFeeText(asking.reask.cap)]
			expect(sheet.line).toBe(`Fee is now ${now}, above the ${cap} you accepted.`)
			expect(sheet.button).toBe("Send")
			if (asks === 1) await shotSend(burst.page, "4-reask-sheet", "send-review-fee")
			await pointerClick(burst.page, "send-review-submit")
			accepted = asking.reask.fee
		}
		expect(await prices.refused.failures(), "price interception failures").toEqual([])
		await prices.refused.stop()

		expect(caps[0], "the first re-ask holds B to the like send's cap").toBe(queuedFeeCap(basis))
		await expectBothSucceed(burst, a, b)
		const sent = (await readTransferRows(burst.page)).filter((r) => r.amount === raw(b.amount))
		expect(
			sent.map((r) => r.stage),
			"B goes out once",
		).toEqual(["succeeded"])
		const fee = await readRecordedFee(burst.page, sent[0].txHash as string)
		expect(
			BigInt(fee ?? "0") > 0n && BigInt(fee ?? "0") <= BigInt(accepted as string),
			`B's fee ${fee} is at most the accepted ${accepted}`,
		).toBe(true)
	},
)
