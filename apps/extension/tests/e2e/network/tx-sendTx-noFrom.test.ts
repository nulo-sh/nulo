import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { UNCLASSIFIED_ERROR_MESSAGE } from "@/wallet/services/wallet-sdk/error-envelope"
import { waitForTxMined, type AztecTestConfig } from "../fixtures/aztec"
import { clickByTestId, type ExtensionContext, grantCapBundle, openPopup, test } from "../fixtures/extension"
import { readSendRecords, type SendRecordView, waitForSendRecord } from "../fixtures/journal"
import { assertPgOk, setPgInput, snapshotResultSeq, waitForPgResult, waitForPgResults } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup, waitForPopupClosed } from "../fixtures/popups"
import { expectWindowHeldBehindProof, holdProofGate, releaseProofGate } from "../fixtures/proof-gate"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Test #30 — `sendTx` with `from: "NO_FROM"` runs the dApp's one call through the default
 * entrypoint: no account is the caller, and the app sets the fee (the window shows the fee-set
 * badge, no fee picker). The default entrypoint runs only a private function: a public call is
 * refused after approval, and the dApp learns nothing more than the wallet's constant for an
 * unclassified throw. `SponsoredFPC.sponsor_unconditionally` is the private call that stands alone:
 * it reads no sender and pays its own fee, so it lands, and two at once both land, one at a time:
 * the second window waits for its preview, Confirm off, while the first proves.
 *
 * @requires-proverless — the concurrent case parks the first send on the proof gate, which exists
 * only in a proverless build; the agent runner refuses this file without `NULO_E2E_PROVERLESS=1`.
 */

const SPONSORED = "pg-btn-sendTx-noFrom-sponsored"
const FEE_SET_BADGE = '[data-testid="execute-op-fee-set-badge"]'

const firstAccount = async (ids: (string | null)[]): Promise<string[]> => {
	if (!ids[0]) throw new Error("capabilities popup returned no accounts")
	return [ids[0]]
}

/** The sponsored control registers the sponsor, which takes the contracts capability. */
async function grantTransactionAndContracts(ctx: ExtensionContext & { playgroundPage: Page }): Promise<void> {
	await grantCapBundle(ctx, ctx.playgroundPage, "transaction-contracts", firstAccount)
}

async function openNoFromWindow(ctx: ExtensionContext, page: Page, button: string): Promise<Page> {
	const opened = waitForPopup(ctx, "execute", { timeout: 60_000 })
	await clickByTestId(page, button)
	const execute = await opened
	await waitForExecuteContent(execute)
	return execute
}

const dappSends = async (wallet: Page): Promise<SendRecordView[]> =>
	(await readSendRecords(wallet)).filter((r) => r.kind === "dapp_execute")

test.skipIf(!hasConfig)(
	"tx-sendTx-noFrom — a public call is refused after approval, and the dApp gets only the wallet's constant",
	{ timeout: 120_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const page = ctx.playgroundPage
		await setPgInput(page, "tokenAddress", aztecConfig!.tokenAddress)
		await setPgInput(page, "recipient", aztecConfig!.minterAddress)
		await setPgInput(page, "amount", "1")

		const seqTx = await snapshotResultSeq(page)
		const execute = await openNoFromWindow(ctx, page, "pg-btn-sendTx-noFrom")
		expect(await execute.$(FEE_SET_BADGE)).not.toBeNull()
		await approveExecute(execute)

		const result = await waitForPgResult(page, "sendTx", seqTx, 60_000)
		expect({ status: result.status, error: result.errorJson }).toEqual({
			status: "error",
			error: { message: JSON.stringify(UNCLASSIFIED_ERROR_MESSAGE) },
		})
		const wallet = await openPopup(ctx)
		await waitForSendRecord(wallet, (r) => r.kind === "dapp_execute" && r.stage === "failed")
		expect((await dappSends(wallet)).map((r) => r.stage)).toEqual(["failed"])
	},
)

test.skipIf(!hasConfig)(
	"tx-sendTx-noFrom — a sponsored private call lands: a transaction hash, a succeeded record, a mined receipt",
	{ timeout: 300_000 },
	async ({ dappConnectedExtensionPerTest: ctx }) => {
		const page = ctx.playgroundPage
		await grantTransactionAndContracts(ctx)

		const seqTx = await snapshotResultSeq(page)
		const execute = await openNoFromWindow(ctx, page, SPONSORED)
		expect(await execute.$(FEE_SET_BADGE)).not.toBeNull()
		await approveExecute(execute)

		const result = await waitForPgResult(page, "sendTx", seqTx, 180_000)
		await assertPgOk(page, result, "tx-sendTx-noFrom:sponsored")
		const txHash = (result.resultJson as { txHash?: string } | undefined)?.txHash
		expect(typeof txHash).toBe("string")
		const wallet = await openPopup(ctx)
		await waitForSendRecord(wallet, (r) => r.kind === "dapp_execute" && r.stage === "succeeded")
		expect((await dappSends(wallet)).map((r) => r.stage)).toEqual(["succeeded"])
		await waitForTxMined(aztecConfig!, txHash as string)
	},
)

test.skipIf(!hasConfig)(
	"tx-sendTx-noFrom — two concurrent sponsored sends run one at a time and both land",
	{ timeout: 360_000 },
	async ({ dappConnectedExtensionPerTest: ctx }) => {
		const page = ctx.playgroundPage
		await grantTransactionAndContracts(ctx)
		const wallet = await openPopup(ctx)

		const seqTx = await snapshotResultSeq(page)
		await holdProofGate(wallet)
		let second: Page
		try {
			const firstP = waitForPopup(ctx, "execute", { timeout: 60_000 })
			await page.evaluate((testid: string) => {
				const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)
				if (!button) throw new Error(`${testid} not found`)
				button.click()
				button.click()
			}, SPONSORED)
			const first = await firstP
			await waitForExecuteContent(first)
			const secondP = waitForPopup(ctx, "execute", { timeout: 60_000 })
			await approveExecute(first)
			second = await secondP
			await waitForExecuteContent(second)
			await expectWindowHeldBehindProof(wallet, second, { windowMs: 3_000, feeRow: false })
		} finally {
			await releaseProofGate(wallet)
		}
		await approveExecute(second)
		await waitForPopupClosed(second, 10_000)

		const results = await waitForPgResults(page, "sendTx", seqTx, 2, 300_000)
		for (const [i, result] of results.entries()) await assertPgOk(page, result, `tx-sendTx-noFrom:concurrent-${i}`)
		const hashes = results.map((r) => (r.resultJson as { txHash?: string } | undefined)?.txHash)
		expect(hashes.every((h) => typeof h === "string")).toBe(true)
		expect(new Set(hashes).size).toBe(2)
		expect((await dappSends(wallet)).map((r) => r.stage)).toEqual(["succeeded", "succeeded"])
		for (const hash of hashes) await waitForTxMined(aztecConfig!, hash as string)
	},
)
