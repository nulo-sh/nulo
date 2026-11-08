import { expect, inject } from "vitest"
import { REFUSAL_REASON } from "@/popup/windows/execute/refusal"
import { UNATTACHED_AUTHORIZATION_REFUSAL_ENVELOPE } from "@/wallet/services/wallet-sdk/error-envelope"
import { switchAccountByAddress } from "../fixtures/accounts"
import { clickByTestId, openPopup, test, waitForHash } from "../fixtures/extension"
import { waitForSendRecord } from "../fixtures/journal"
import { readJournalDetail } from "../fixtures/journal-page"
import { shotSend } from "../fixtures/shots"
import type { AztecTestConfig } from "../fixtures/aztec"
import { assertPgOk, errorEnvelopeOf, setPgInputs, snapshotResultSeq, tracedEnvelope, waitForPgResult } from "../fixtures/playground"
import { readyAuthwitOwner } from "../fixtures/send"
import { approveExecute, rejectExecute, waitForExecuteApprovable, waitForExecuteContent, waitForPopup } from "../fixtures/popups"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * A dApp's `wait` and `additionalScopes` against a real node and PXE: the receipt's trip back
 * through the wallet-sdk channel, and simulations that must read another account's note. A
 * first-read checkpointed receipt is valid here; the unit tests pin the polling order. The witness
 * the dApp attaches routes the estimate through classic discovery. The first send readies the owner
 * (`readyAuthwitOwner`). A send that needs the owner's authorization without carrying it is held as a refusal the app hears on
 * Reject, and History names what it left out; one that carries it names the owner on its authorization row.
 */
test.skipIf(!hasConfig)(
	"tx-sendTx-fields — a waiting send gets its checkpointed receipt; a send reads its additional scope's notes and names its authorization",
	{ timeout: 420_000 },
	async ({ dappConnectedExtensionWithFirstTwoAccountsCap: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const { playgroundPage: page, accountAddresses } = ctx
		const [owner, sender] = accountAddresses as [string, string]
		expect(accountAddresses).toHaveLength(2)

		const waited = await readyAuthwitOwner(ctx, page, config, owner)
		const receipt = (waited.resultJson as { receipt?: { status?: string; executionResult?: string } }).receipt
		expect(["checkpointed", "proven", "finalized"]).toContain(receipt?.status)
		expect(receipt?.executionResult).toBe("success")

		await setPgInputs(page, { from: sender, authwitOwner: owner })
		const refusedSeq = await snapshotResultSeq(page)
		const refusedP = waitForPopup(ctx, "execute", { timeout: 60_000 })
		await clickByTestId(page, "pg-btn-sendTx-onBehalf-unattached")
		const refused = await refusedP
		await waitForExecuteContent(refused, 60_000)
		await refused.waitForSelector('[data-testid="execute-op-refusal"]', { visible: true, timeout: 180_000 })
		const held = await refused.evaluate(() => ({
			kind: document.querySelector('[data-testid="execute-op-refusal"]')?.getAttribute("data-kind"),
			reason: document.querySelector('[data-testid="execute-op-refusal-reason"]')?.textContent?.trim(),
			confirm: document.querySelector('[data-testid="execute-confirm-btn"]') !== null,
		}))
		expect(held).toEqual({ kind: "unattached", reason: REFUSAL_REASON.unattached, confirm: false })
		await shotSend(refused, "unattached-refusal", "execute-op-refusal")
		await rejectExecute(refused)
		const answer = await waitForPgResult(page, "sendTx", refusedSeq, 120_000)
		expect({ status: answer.status, error: errorEnvelopeOf(answer) }).toEqual({
			status: "error",
			error: tracedEnvelope(UNATTACHED_AUTHORIZATION_REFUSAL_ENVELOPE),
		})

		const seq = await snapshotResultSeq(page)
		const signP = waitForPopup(ctx, "execute", { timeout: 60_000 })
		await clickByTestId(page, "pg-btn-sendTx-onBehalf")
		const sign = await signP
		await waitForExecuteContent(sign)
		const sendP = waitForPopup(ctx, "execute", { timeout: 120_000 })
		await approveExecute(sign)
		const send = await sendP
		await waitForExecuteContent(send, 60_000)
		// The owner's witness rides along: the sender's window names it as the owner's, and signs nothing.
		await waitForExecuteApprovable(send, 180_000)
		// The account's name renders once its address lookup returns.
		await send.waitForSelector('[data-testid="execute-op-summary-authwit-on-behalf-account"][data-address-shows="name"]', {
			timeout: 30_000,
		})
		const shown = await send.evaluate(() => ({
			calls: document.querySelectorAll('[data-testid="execute-op-summary-call"]').length,
			authwits: [...document.querySelectorAll('[data-testid="execute-op-summary-authwit"]')].map((row) => ({
				onBehalf: row.getAttribute("data-on-behalf")?.toLowerCase(),
				line: row.querySelector('[data-testid="execute-op-summary-authwit-on-behalf"]')?.textContent?.replace(/\s+/g, " ").trim(),
			})),
		}))
		expect(shown).toEqual({ calls: 1, authwits: [{ onBehalf: owner.toLowerCase(), line: "Already authorized by Account 1." }] })
		await approveExecute(send, { approvableTimeoutMs: 180_000 })
		const sent = await waitForPgResult(page, "sendTx", seq, 300_000)
		await assertPgOk(page, sent, "fields:additionalScope")
		expect((sent.resultJson as { txHash?: unknown }).txHash).toEqual(expect.stringMatching(/^0x[0-9a-f]{64}$/))

		// History shows the selected account's records only, and the refused send was the sender's.
		const wallet = await openPopup(ctx)
		await waitForHash(wallet, "#/popup/general")
		await switchAccountByAddress(wallet, sender)
		const record = await waitForSendRecord(wallet, (r) => r.kind === "dapp_execute" && r.stage === "failed")
		expect(await readJournalDetail(wallet, record.id, "unattached-history")).toEqual({
			"journal-detail-category": "Not allowed",
			"journal-detail-context": "The app did not include an authorization from another of your accounts. Nothing was sent.",
			"journal-detail-state": "Failed",
			"journal-detail-method": "Transaction",
			"journal-detail-error-message": null,
		})
	},
)
