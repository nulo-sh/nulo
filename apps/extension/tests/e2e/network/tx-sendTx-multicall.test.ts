import { expect, inject } from "vitest"
import { clickByTestId, openPopup, test } from "../fixtures/extension"
import { assertPgOk, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { readSendRecords, waitForSendRecord } from "../fixtures/journal"
import { mintPublicTokensForAccount, waitForTxMined, type AztecTestConfig } from "../fixtures/aztec"
import { readPublicTokenBalance } from "../fixtures/selfpay-phase"
import { shotSend } from "../fixtures/send-page"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Tests #32 + #33 — a multicall of `transfer_public_to_public` runs every call through public
 * execution: the dApp gets a transaction hash, its record succeeds, the transaction mines, and the
 * recipient's public balance grows by one unit per call. The standard Token refuses a nonzero nonce
 * when `from` is the caller, so a multicall that numbered its calls would revert in public
 * execution, which a test that stopped at an active stage could not see.
 *
 * #33 sends seven calls, past the account entrypoint's five, so the wallet chunks them.
 * The fixture grants the transaction bundle for one account; every call is FROM that account.
 */
const cases: Array<{ id: number; name: string; btn: string; calls: number }> = [
	{ id: 32, name: "multicall", btn: "pg-btn-sendTx-multicall", calls: 3 },
	{ id: 33, name: "multicall-chunked", btn: "pg-btn-sendTx-multicall-chunked", calls: 7 },
]

for (const c of cases) {
	test.skipIf(!hasConfig)(
		`tx-sendTx-${c.name} (#${c.id}) — all ${c.calls} calls land in public execution`,
		{ timeout: 360_000 },
		async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
			const { playgroundPage: page, accountAddress } = ctx
			const { tokenAddress, minterAddress } = aztecConfig!

			await mintPublicTokensForAccount(aztecConfig!, accountAddress)
			const recipientBefore = await readPublicTokenBalance(aztecConfig!, tokenAddress, minterAddress)

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
				{ token: tokenAddress, recipient: minterAddress },
			)

			const seqTx = await snapshotResultSeq(page)
			const execPopupP = waitForPopup(ctx, "execute", { timeout: 30_000 })
			await clickByTestId(page, c.btn)
			const execPopup = await execPopupP
			await waitForExecuteContent(execPopup)

			// The summary lists every call at rest; the value rows stay closed under it.
			const atRest = await execPopup.evaluate(() => ({
				calls: document.querySelectorAll('[data-testid="execute-op-summary-call"]').length,
				rows: document.querySelectorAll('[data-testid="execute-op-payload-row"]').length,
			}))
			expect(atRest.calls).toBeGreaterThanOrEqual(c.calls)
			expect(atRest.rows).toBe(0)
			// The decodes land after the window opens; the token is not in the wallet's list, so once
			// they have, the summary names every call as one Nulo cannot check.
			await execPopup.waitForFunction(
				() =>
					document.querySelector('[data-testid="execute-op-summary-call"]') !== null &&
					document.querySelector('[data-testid="execute-op-summary-args-pending"]') === null,
				{ timeout: 60_000, polling: 200 },
			)
			expect(
				await execPopup.evaluate(
					() => document.querySelector('[data-testid="execute-op-summary-unchecked"]')?.textContent?.trim() ?? null,
				),
			).toBe("Nulo can only check transfers and mints of tokens in your list, so it can't say what these calls do.")
			await shotSend(execPopup, `multicall-${c.calls}-summary`, "execute-op-summary")

			await approveExecute(execPopup)

			const result = await waitForPgResult(page, "sendTx", seqTx, 300_000)
			await assertPgOk(page, result, `tx-sendTx-${c.name}:result`)
			const txHash = (result.resultJson as { txHash?: string } | undefined)?.txHash
			expect(typeof txHash).toBe("string")

			const walletPopup = await openPopup(ctx)
			await waitForSendRecord(walletPopup, (r) => r.kind === "dapp_execute" && r.stage === "succeeded")
			expect((await readSendRecords(walletPopup)).map((r) => r.stage)).toEqual(["succeeded"])

			// The receipt says only that the transaction is in a block; the balance says every call ran.
			await waitForTxMined(aztecConfig!, txHash as string)
			expect(await readPublicTokenBalance(aztecConfig!, tokenAddress, minterAddress)).toBe(recipientBefore + BigInt(c.calls))
		},
	)
}
