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
 * page shows the fee row queued with Send disabled, and a confirmed send that waits shows its card
 * at the journal's `queued` stage.
 *
 * @requires-proverless — formal marker scanned by scripts/e2e/agent.sh; the proof and projection
 * gates exist only in a proverless-armed build.
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { afterEach, expect } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { stopBackground } from "../fixtures/browser"
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
import { readDappExecuteRecords, waitForDappExecuteStagesPresent } from "../fixtures/journal"
import { holdMining, releaseMining, waitForEmptyMempool } from "../fixtures/mining-hold"
import { assertPgOk, setPgInput, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { holdAccountRegistration, releaseAccountRegistration } from "../fixtures/projection-gate"
import { holdProofGate, releaseProofGate } from "../fixtures/proof-gate"
import {
	type BurstSend,
	confirmSend,
	expectEstimateQueued,
	expectStageHeld,
	readTxStatuses,
	startSend,
	waitForEstimate,
	waitForTransferStage,
	waitForTransfersTerminal,
	waitForTxsMined,
} from "../fixtures/send-burst"
import { deleteProfile, exportBackup, waitForHeldProjection } from "../helpers/handshake-import"
import { importFullBackup, POPUP_IMPORT_SHELL } from "../helpers/import-drivers"

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
 * queued and Send stays disabled (never the failure toast, never a fee). Lifting the hold mines A;
 * B's estimate then lands, B confirms, and both succeed. `afterA` runs once A is submitted.
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

test.skipIf(!hasConfig)("two private sends of the same token: the second waits", { timeout: 600_000, retry: 0 }, async ({ burst }) => {
	await expectQueued(
		burst,
		{ token: "TST", from: "private", to: "private", amount: "18", destination: to(), fee: "sponsored" },
		{ token: "TST", from: "private", to: "private", amount: "19", destination: to(), fee: "sponsored" },
	)
})

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
	for (;;) {
		const cards = await readAwaitingCards(page)
		const sampledAt = Date.now()
		const seen = JSON.stringify(cards)
		if (cards.length > 1) throw new Error(`${cards.length} awaiting cards for one send: ${seen}`)
		if (sampledAt > (settleBy ?? appearBy)) throw new Error(`no awaiting card reached ${stage} in time: ${seen}`)
		const [card] = cards
		if (card?.stage === stage && card.cancel) return card
		if (card?.stage) throw new Error(`the awaiting card is not at ${stage} with a cancel control: ${seen}`)
		if (card) settleBy ??= sampledAt + 10_000
		await new Promise((r) => setTimeout(r, 250))
	}
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
			subtitle: "Queued...",
			focus: false,
			cancel: true,
		})
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

test.skipIf(!hasConfig)(
	"a Send-page send confirmed while a dApp send proves waits at queued, then both succeed",
	{ timeout: 600_000, retry: 0 },
	async ({ burst }) => {
		const config = aztecConfig as AztecTestConfig
		await reopen(burst)
		const playground = await connectPlayground(burst.ctx)
		try {
			await grantCapBundle(burst.ctx, playground, "transaction", async (ids) => {
				const mine = ids.find((id) => id?.toLowerCase() === burst.account.toLowerCase())
				if (!mine) throw new Error("the capabilities popup does not offer the matrix account")
				return [mine]
			})
			const b: BurstSend = { token: "TST", from: "private", to: "private", amount: "29", destination: to(), fee: "sponsored" }
			await waitForEmptyMempool(config.nodeUrl)
			await startSend(burst.page, b)
			expect(await waitForEstimate(burst.page)).toBe("ready")

			await playground.bringToFront()
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
