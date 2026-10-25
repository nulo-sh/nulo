import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { clickByTestId, openPopup, test } from "../fixtures/extension"
import { pinnedFeeText, refusePrices, seedFeeJuiceQuote, settledText } from "../fixtures/fee-quote"
import { shotSend } from "../fixtures/send-page"
import { callService } from "../fixtures/helpers"
import { snapshotResultSeq, waitForPgResult, assertPgOk } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { BROWSER_AWAITING_CARD, PRESTO_AWAITING_CARD, waitForAwaitingCardBackend, waitForDappExecuteWorked } from "../fixtures/journal"
import { readSealedRows } from "../fixtures/sealed-rows"
import { createTestWallet, fundPublicFeeJuice, mintPublicTokensForAccount, type AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/** The playground's transfer of one fixture token to the minter. */
async function setTransferInputs(page: Page): Promise<void> {
	await page.evaluate(
		({ token, recipient }: { token: string; recipient: string }) => {
			const setVal = (sel: string, v: string) => {
				const input = document.querySelector<HTMLInputElement>(sel)
				if (!input) return
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
				setter?.call(input, v)
				input.dispatchEvent(new Event("input", { bubbles: true }))
			}
			setVal('[data-testid="pg-input-tokenAddress"]', token)
			setVal('[data-testid="pg-input-recipient"]', recipient)
			setVal('[data-testid="pg-input-amount"]', "1")
		},
		{ token: aztecConfig!.tokenAddress, recipient: aztecConfig!.minterAddress },
	)
}

/**
 * Test #29 — sendTx default (account-bound). Always opens /windows/execute
 * (Transactions=5 >= confirmationLevel=5).
 *
 * Flow: tx cap pre-granted by fixture → set inputs → click → /windows/execute
 * opens with FeeSettingsCard (no fee preset) → user accepts default → wallet
 * journal-driven awaiting card transitions to `proving` stage.
 *
 * Uses `dappConnectedExtensionWithTransactionCap` so the cap-popup round-trip
 * happens during fixture setup (hookTimeout=300s) rather than in this test's
 * test budget.
 *
 * Waits on the journal reaching real work instead of the dApp's full sendTx
 * promise (the popup-shape signal), then on the awaiting card's backend
 * evidence: `presto` / "Proving with Presto ✦" in the prover-ON CI lane
 * (`VITE_NULO_PRESTO_REQUIRED=1`), `browser` / "Proving in browser…" on a
 * plain build with no Presto listening, which on a runner is every plain
 * build. Under a proverless build the op never lingers in `proving`, so that
 * assertion is skipped there.
 */
test.skipIf(!hasConfig)(
	"tx-sendTx-default — popup opens, fee picker shown, confirm submits with real proof (prover-ON canary)",
	{ timeout: 360_000 },
	async ({ dappConnectedExtensionWithTransactionCap }) => {
		const { playgroundPage: page, accountAddress } = dappConnectedExtensionWithTransactionCap

		// Pre-mint tokens to the dApp account so simulate succeeds (otherwise
		// the journal goes straight to `failed` and the awaiting card never
		// reaches an active stage — breaks waitForDappExecuteWorked).
		await mintPublicTokensForAccount(aztecConfig!, accountAddress)

		await setTransferInputs(page)

		// Fire sendTx + drive the execute popup
		const seqTx = await snapshotResultSeq(page)
		const execPopupP = waitForPopup(dappConnectedExtensionWithTransactionCap, "execute", { timeout: 30_000 })
		await clickByTestId(page, "pg-btn-sendTx-default")
		const execPopup = await execPopupP
		await waitForExecuteContent(execPopup)

		// Verify the op card shows aztec_sendTx
		const ops = await execPopup.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>('[data-testid="execute-op-item"]')].map((el) => ({
				id: el.getAttribute("data-op-id"),
				kind: el.getAttribute("data-op-kind"),
			})),
		)
		expect(ops.length).toBe(1)
		expect(ops[0].kind).toBe("aztec_sendTx")

		await approveExecute(execPopup)

		// Wait for the wallet's journal to reach real work instead of the dApp's
		// full sendTx promise. See waitForDappExecuteWorked for rationale.
		const walletPopup = await openPopup(dappConnectedExtensionWithTransactionCap)
		await waitForDappExecuteWorked(walletPopup)

		if (process.env.NULO_E2E_PROVERLESS !== "1") {
			// A runner starts presto-server for required-mode builds only, so a plain build there must
			// prove in the browser; elsewhere a healthy local Presto may take the proof.
			const native = process.env.VITE_NULO_PRESTO_REQUIRED === "1"
			const runner = process.env.GITHUB_ACTIONS === "true"
			const accepted = native
				? [PRESTO_AWAITING_CARD]
				: runner
					? [BROWSER_AWAITING_CARD]
					: [PRESTO_AWAITING_CARD, BROWSER_AWAITING_CARD]
			await waitForAwaitingCardBackend(walletPopup, accepted)
		}

		// Prover-ON canary (this file runs in the real-proving canary job, NOT the
		// proverless pool): wait through the REAL prove to submit and assert the
		// node accepted the real proof. The playground hard-codes `wait: "NO_WAIT"`
		// (transactions.ts), so the dApp result settles at submit — `txHash`
		// present is the direct signal the node validated a real BB proof at
		// `node.sendTx` (block-mine is not awaited). 300s budget covers the real
		// prove on a dedicated runner. Under proverless this still passes (fast
		// submit) — that's the local assertion-logic check; the real-prove timing
		// is exercised in CI.
		const result = await waitForPgResult(page, "sendTx", seqTx, 300_000)
		await assertPgOk(page, result, "tx-sendTx-default:result")
		expect(typeof (result.resultJson as { txHash?: string } | undefined)?.txHash).toBe("string")
	},
)

/**
 * A dApp send the account pays for, whose build comes out above the figure the person approved, is
 * held and asked about in its own window; only the accept proves it. Failure mode: the worker's hold,
 * the window, the accept and the proof together, in a real browser against a live node, which no
 * mocked layer reaches. The approval goes through the worker's entry, the account paying from its own
 * Fee Juice, with a figure half the estimate's, so the real build lands above it past both of the
 * tolerance's thresholds: no node fixture, no seam.
 */
test.skipIf(!hasConfig)(
	"tx-sendTx-default — a fee above the approved figure is asked again in its own window; the accept proves",
	{ timeout: 480_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const { playgroundPage: page, accountAddress } = ctx
		const prices = await refusePrices(ctx)
		await mintPublicTokensForAccount(aztecConfig!, accountAddress)
		const { wallet, accounts, node, cleanup } = await createTestWallet(aztecConfig!.nodeUrl)
		try {
			const scriptAccount = accounts[0]
			if (!scriptAccount) throw new Error("expected at least one sandbox-deployed test account")
			await fundPublicFeeJuice(wallet, node, scriptAccount, aztecConfig!, accountAddress)
		} finally {
			await cleanup()
		}

		await setTransferInputs(page)
		const seqTx = await snapshotResultSeq(page)
		const execPopupP = waitForPopup(ctx, "execute", { timeout: 30_000 })
		await clickByTestId(page, "pg-btn-sendTx-default")
		const execPopup = await execPopupP
		await waitForExecuteContent(execPopup)

		const requestId = new URL(execPopup.url().replace("#/", "")).searchParams.get("requestId")
		expect(requestId).toBeTruthy()
		// The account's own Fee Juice: Nulo's sponsor, the card's default, is not bound by the figure.
		const feeSettings = { paymentMethod: { kind: "fj" } }
		const estimate = await callService<{ maxFee: string; estimateId?: string; previewId?: string; feeJuiceShortfall?: unknown }>(
			execPopup,
			"execution",
			"estimateOperationFee",
			[requestId, 0, feeSettings],
			120_000,
		)
		expect(estimate.feeJuiceShortfall).toBeUndefined()
		const shown = BigInt(estimate.maxFee)
		const approved = shown / 2n
		// Below either threshold the send would go out at the new fee unasked.
		expect(shown - approved).toBeGreaterThanOrEqual(10n ** 12n)
		expect((shown - approved) * 100n).toBeGreaterThan(approved * 10n)

		await seedFeeJuiceQuote(ctx, prices)
		const feePopupP = waitForPopup(ctx, "fee", { timeout: 180_000 })
		await callService(execPopup, "dapp-interaction", "approveInteraction", [
			requestId,
			[{ feeSettings, estimateId: estimate.estimateId, previewId: estimate.previewId, feeCeiling: approved.toString() }],
		])
		const feePopup = await feePopupP
		await feePopup.waitForSelector('[data-testid="fee-raised"]', { visible: true, timeout: 60_000 })

		// Held, unproven: the record asks the question the window shows, with the figure approved.
		type Asked = { kind?: string; progress?: { stage?: string; reask?: { fee: string; cap: string; payer: unknown } } }
		const asked = (await readSealedRows<Asked>(feePopup, "journal"))
			.map(({ row }) => row)
			.filter((record) => record.kind === "dapp_execute" && record.progress?.stage === "queued")
			.map((record) => record.progress?.reask)
		expect(asked).toEqual([{ fee: expect.any(String), cap: approved.toString(), payer: { type: "fj", isProtocol: false } }])
		const fee = BigInt(asked[0]!.fee)
		const text = (id: string) => feePopup.$eval(`[data-testid="${id}"]`, (el) => el.textContent?.replace(/\s+/g, " ").trim())
		const [was, now] = [`Was ${pinnedFeeText(approved)}`, `Now ${pinnedFeeText(fee)}`]
		expect(await settledText(feePopup, "fee-raised-was", was)).toBe(was)
		expect(await settledText(feePopup, "fee-raised-now", now)).toBe(now)
		expect(await text("fee-raised-method")).toBe("Public Fee Juice")
		// The Confirm repeats the card's figure, its dollars on a second line.
		const confirmText = `Send for ${pinnedFeeText(fee)}`
		expect(await settledText(feePopup, "fee-confirm-btn", confirmText)).toBe(confirmText)
		expect(await prices.refused.failures(), "price interception failures").toEqual([])
		await prices.refused.stop()
		await shotSend(feePopup, "fee-window-raised", "fee-raised")
		// The dApp's own row is pending from its request on; only a settled one would mean an answer.
		const settled = await page.evaluate(
			(after) =>
				[...document.querySelectorAll<HTMLElement>('[data-testid="pg-result"][data-method="sendTx"]')].filter(
					(row) => Number(row.getAttribute("data-result-seq") ?? "0") > after && row.getAttribute("data-status") !== "pending",
				).length,
			seqTx,
		)
		expect(settled).toBe(0)

		await clickByTestId(feePopup, "fee-confirm-btn")
		const walletPopup = await openPopup(ctx)
		await waitForDappExecuteWorked(walletPopup)
		const result = await waitForPgResult(page, "sendTx", seqTx, 300_000)
		await assertPgOk(page, result, "tx-sendTx-default:fee-rose")
		expect(typeof (result.resultJson as { txHash?: string } | undefined)?.txHash).toBe("string")
	},
)
