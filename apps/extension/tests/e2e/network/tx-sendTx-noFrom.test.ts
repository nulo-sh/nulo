import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { UNCLASSIFIED_ERROR_MESSAGE } from "@/wallet/services/wallet-sdk/error-envelope"
import { waitForTxMined, type AztecTestConfig } from "../fixtures/aztec"
import { clickByTestId, type ExtensionContext, grantCapBundle, openPopup, test } from "../fixtures/extension"
import { readSendRecords, type SendRecordView, waitForSendRecord } from "../fixtures/journal"
import { assertPgOk, setPgInput, snapshotResultSeq, waitForPgResult, waitForPgResults } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup, waitForPopupClosed } from "../fixtures/popups"
import { PROOF_GATE_HOLD_MS, holdProofGate, releaseProofGate } from "../fixtures/proof-gate"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Test #30 — `sendTx` with `from: "NO_FROM"` runs the dApp's one call through the default
 * entrypoint: no account is the caller, and the app sets the fee (the window shows the fee-set
 * badge, no fee picker). The default entrypoint runs only a private function: a public call is
 * refused after approval, and the dApp learns nothing more than the wallet's constant for an
 * unclassified throw. `SponsoredFPC.sponsor_unconditionally` is the private call that stands alone:
 * it reads no sender and pays its own fee, so it lands, and two at once both land, one at a time.
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** How long the second send must keep waiting behind the held first once its approval is in. */
const QUEUED_HELD_MS = 3_000

/** The send held at `proving` while the other waits `queued`, if the journal shows exactly that. */
const heldPair = (sends: SendRecordView[]): SendRecordView | undefined =>
	sends.length === 2 && sends.some((r) => r.stage === "queued") ? sends.find((r) => r.stage === "proving") : undefined

/**
 * Serialization evidence: after the second approval is in, the second send stays `queued` behind the
 * first, held at `proving`, for `QUEUED_HELD_MS`. A record reads `queued` from the request's arrival
 * too, so one snapshot could catch the second before its approval reached the mutex. Every read falls
 * before `PROOF_GATE_HOLD_MS` past the first's `enteredProveAt`: later, the gate may have released
 * itself, and a `queued` record would prove nothing about the mutex.
 */
async function expectQueuedBehindHeld(wallet: Page): Promise<void> {
	const pairBy = Date.now() + 60_000
	let sends = await dappSends(wallet)
	let held = heldPair(sends)
	while (!held) {
		if (Date.now() > pairBy) throw new Error(`no send held at proving with the other queued; sends: ${JSON.stringify(sends)}`)
		await sleep(250)
		sends = await dappSends(wallet)
		held = heldPair(sends)
	}
	const gateHoldsUntil = (held.enteredProveAt ?? Number.NaN) + PROOF_GATE_HOLD_MS
	const observeUntil = Date.now() + QUEUED_HELD_MS
	for (;;) {
		await sleep(250)
		sends = await dappSends(wallet)
		const readAt = Date.now()
		expect(heldPair(sends)?.id, `the second send must stay queued behind the held first: ${JSON.stringify(sends)}`).toBe(held.id)
		expect(readAt, "every read must fall while the first send's gate certainly still holds").toBeLessThanOrEqual(gateHoldsUntil)
		if (readAt >= observeUntil) return
	}
}

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
			const second = await secondP
			await waitForExecuteContent(second)
			await approveExecute(second)
			await waitForPopupClosed(second, 10_000)
			await expectQueuedBehindHeld(wallet)
		} finally {
			await releaseProofGate(wallet)
		}

		const results = await waitForPgResults(page, "sendTx", seqTx, 2, 300_000)
		for (const [i, result] of results.entries()) await assertPgOk(page, result, `tx-sendTx-noFrom:concurrent-${i}`)
		const hashes = results.map((r) => (r.resultJson as { txHash?: string } | undefined)?.txHash)
		expect(hashes.every((h) => typeof h === "string")).toBe(true)
		expect(new Set(hashes).size).toBe(2)
		expect((await dappSends(wallet)).map((r) => r.stage)).toEqual(["succeeded", "succeeded"])
		for (const hash of hashes) await waitForTxMined(aztecConfig!, hash as string)
	},
)
