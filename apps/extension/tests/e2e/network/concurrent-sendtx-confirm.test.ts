import { inject } from "vitest"
import { openPopup, test } from "../fixtures/extension"
import { snapshotResultSeq, waitForPgResults, assertPgOk } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { expectWindowHeldBehindProof, holdProofGate, releaseProofGate } from "../fixtures/proof-gate"
import { type AztecTestConfig, waitForTxMined } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Concurrent sendTx — the second of two dApp sends waits behind the first, and both confirm (v3
 * parallel popups, heavy).
 *
 * Fire two sendTx and approve popup #1 (the baton releases, popup #2 opens). With T1 held at
 * `proving`, popup #2's estimate queues behind it: its fee row reads queued and its Confirm stays
 * off, so T2 cannot be approved, and never reaches the execution mutex, while T1 proves. Releasing
 * T1 lets it prove and submit; T2's estimate then runs and T2 is approved.
 *
 * The mutex releases at submit, not at inclusion, and the PXE simulates against
 * mined state only, so T2 built at once would spend T1's notes again ("duplicate
 * siloed nullifier"). A dApp send therefore waits outside the slot, before its
 * build, until every earlier send of its account is mined and the PXE's node has
 * that block: T2 proves on T1's result and both confirm.
 *
 * Cost: two full proves and two blocks on the sandbox. HEAVY — runs in the
 * dedicated network-e2e job, not the standard shard matrix.
 */
test.skipIf(!hasConfig)(
	"concurrent-sendtx-confirm — the second send's window waits behind the first's proof; both confirm",
	{ timeout: 600_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const { playgroundPage: page, accountAddress } = ctx

		// Pre-mint enough public balance for the transfers. (dev's shared helper.)
		{
			const { mintPublicTokensForAccount } = await import("../fixtures/aztec")
			await mintPublicTokensForAccount(aztecConfig!, accountAddress)
		}

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

		const seqBefore = await snapshotResultSeq(page)

		// Fire two sendTx in rapid succession; both start their dApp promise before
		// either does async work — the concurrent shape.
		const firstPopupP = waitForPopup(ctx, "execute", { timeout: 30_000 })
		await page.evaluate(() => {
			const btn = document.querySelector<HTMLButtonElement>('[data-testid="pg-btn-sendTx-default"]')
			if (!btn) throw new Error("pg-btn-sendTx-default not found")
			btn.click()
			btn.click()
		})

		// Approve popup #1 → baton releases → popup #2 opens.
		const firstPopup = await firstPopupP
		await waitForExecuteContent(firstPopup)
		const secondPopupP = waitForPopup(ctx, "execute", { timeout: 60_000 })
		// Hold the proof gate first so T1 parks at `proving` (no-op under real proving).
		await holdProofGate(firstPopup)
		await approveExecute(firstPopup, { feeMethod: "sponsored" })

		const secondPopup = await secondPopupP
		await waitForExecuteContent(secondPopup)
		const wallet = await openPopup(ctx)
		await expectWindowHeldBehindProof(wallet, secondPopup, { windowMs: 3_000, feeRow: true })

		// Release T1: it proves and submits; T2's estimate runs, T2 is approved, builds once T1 is mined.
		await releaseProofGate(wallet)
		await wallet.close()
		await approveExecute(secondPopup, { feeMethod: "sponsored" })

		// The playground's sendTx is NO_WAIT: each answer is a submission, so inclusion is read on the node.
		const [r1, r2] = await waitForPgResults(page, "sendTx", seqBefore, 2, 480_000)
		for (const [label, result] of [
			["r1", r1],
			["r2", r2],
		] as const) {
			await assertPgOk(page, result, `concurrent-sendtx-confirm:${label}`)
			const txHash = (result.resultJson as { txHash?: string }).txHash
			if (typeof txHash !== "string") throw new Error(`${label}: no txHash in ${JSON.stringify(result.resultJson)}`)
			await waitForTxMined(aztecConfig!, txHash)
		}
	},
)
