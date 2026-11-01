import { expect, inject } from "vitest"
import { clickByTestId, test } from "../fixtures/extension"
import {
	createSponsoredFeeOptions,
	createTestWallet,
	mintPrivateTokens,
	mintPublicTokensForAccount,
	type AztecTestConfig,
} from "../fixtures/aztec"
import { assertPgOk, setPgInputs, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { runApprovedPgCall } from "../fixtures/send"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * A dApp's `wait` and `additionalScopes` against a real node and PXE: the receipt's trip back
 * through the wallet-sdk channel, and simulations that must read another account's note. A
 * first-read checkpointed receipt is valid here; the unit tests pin the polling order. The witness
 * the dApp attaches routes the estimate through classic discovery. The first send initializes the
 * owner, whose `verify_private_authwit` reads the signing-key note its constructor writes.
 */
test.skipIf(!hasConfig)(
	"tx-sendTx-fields — a waiting send gets its checkpointed receipt; a send reads its additional scope's notes",
	{ timeout: 420_000 },
	async ({ dappConnectedExtensionWithFirstTwoAccountsCap: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const { playgroundPage: page, accountAddresses } = ctx
		const [owner, sender] = accountAddresses as [string, string]
		expect(accountAddresses).toHaveLength(2)

		await mintPublicTokensForAccount(config, owner)
		// The owner's private note lands while the wait step runs; the scope step awaits it.
		const delivered = (async () => {
			const { wallet, node, cleanup } = await createTestWallet(config.nodeUrl)
			try {
				const fee = await createSponsoredFeeOptions(wallet)
				return await mintPrivateTokens(wallet, node, config.tokenAddress, owner, 10n ** 18n, config.minterAddress, fee)
			} finally {
				await cleanup()
			}
		})().then(
			(txHash) => ({ txHash }),
			(error: unknown) => ({ error }),
		)

		await setPgInputs(page, { tokenAddress: config.tokenAddress, recipient: config.minterAddress, amount: "1" })
		const waited = await runApprovedPgCall(ctx, page, { button: "sendTx-wait", method: "sendTx", label: "fields:wait" })
		const receipt = (waited.resultJson as { receipt?: { status?: string; executionResult?: string } }).receipt
		expect(["checkpointed", "proven", "finalized"]).toContain(receipt?.status)
		expect(receipt?.executionResult).toBe("success")

		const mint = await delivered
		if ("error" in mint) throw mint.error
		await setPgInputs(page, { from: sender, authwitOwner: owner })
		const seq = await snapshotResultSeq(page)
		const signP = waitForPopup(ctx, "execute", { timeout: 60_000 })
		await clickByTestId(page, "pg-btn-sendTx-onBehalf")
		const sign = await signP
		await waitForExecuteContent(sign)
		const sendP = waitForPopup(ctx, "execute", { timeout: 120_000 })
		await approveExecute(sign)
		const send = await sendP
		await waitForExecuteContent(send, 60_000)
		await approveExecute(send, { approvableTimeoutMs: 180_000 })
		const sent = await waitForPgResult(page, "sendTx", seq, 300_000)
		await assertPgOk(page, sent, "fields:additionalScope")
		expect((sent.resultJson as { txHash?: unknown }).txHash).toEqual(expect.stringMatching(/^0x[0-9a-f]{64}$/))
	},
)
