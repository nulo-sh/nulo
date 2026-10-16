import { expect, inject } from "vitest"
import { trimAddress } from "@/utils/string"
import { deployDelegatedPullRig, type AztecTestConfig } from "../fixtures/aztec"
import { clickByTestId, grantCapBundle, openPopup, test, waitForHash } from "../fixtures/extension"
import { importToken } from "../fixtures/helpers"
import { waitForDappExecuteWorked } from "../fixtures/journal"
import { assertPgOk, setPgInput, setPgTextarea, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { serializeInstance } from "../fixtures/selfpay-phase"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Delegated-authwit discovery against a real consumer. The playground registers a Crowdfunding
 * consumer and its pull token with the wallet, then sends `donate(amount)` with NO witness attached.
 * The consumer pulls the donor's tokens via `transfer_in_private` (msg.sender = crowdfunding ≠
 * from = donor), so the token asserts a call authwit against the DONOR's account. The wallet's
 * folded estimate must DISCOVER that need in its stubbed first sim (the CallAuthorizationRequest
 * offchain effect), show it decoded on its consumer as the transfer it is, sign the witness, and
 * verify it in the validated rebuild.
 */

const sel = (testid: string) => `[data-testid="${testid}"]`
/** 5 PULL in base units, half of what the rig mints the donor. */
const AMOUNT = "5000000000000000000"

test.skipIf(!hasConfig)(
	"tx-sendTx-delegated — folded discovery finds the pull authwit, reads it as the donor's transfer, and the send is submitted",
	{ timeout: 420_000 },
	async ({ dappConnectedExtensionPerTest: ctx }) => {
		const page = ctx.playgroundPage

		// The bundle grants the send and `registerContract` for the dApp's own contracts.
		const [accountAddress] = await grantCapBundle(ctx, page, "transaction-contracts", async (ids) => [ids[0]!])
		const { pullTokenAddress, consumerAddress } = await deployDelegatedPullRig(aztecConfig!, accountAddress!, 10n ** 19n)

		// The window reads a call as a transfer only on a token the wallet holds, from the list it
		// loads when it opens, so the import lands before the send.
		const home = await openPopup(ctx)
		await waitForHash(home, "#/popup/general")
		await importToken(home, pullTokenAddress)
		await home.close()

		// The dApp side registers both instances (instance + bundled artifact) like any real dApp
		// introducing its own contracts.
		const { createAztecNodeClient } = await import("@aztec-labs/aztec.js/node")
		const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses")
		const node = createAztecNodeClient(aztecConfig!.nodeUrl)
		const tokenInstance = await node.getContract(AztecAddress.fromStringUnsafe(pullTokenAddress))
		const consumerInstance = await node.getContract(AztecAddress.fromStringUnsafe(consumerAddress))
		if (!tokenInstance || !consumerInstance) throw new Error("Rig instances not found at node")
		await setPgInput(page, "consumerAddress", consumerAddress)
		await setPgInput(page, "amount", AMOUNT)
		await setPgTextarea(page, "delegatedTokenInstance", serializeInstance(tokenInstance))
		await setPgTextarea(page, "delegatedConsumerInstance", serializeInstance(consumerInstance))

		// Fire: registerContract ×2 (silent on default sessions) + sendTx.
		const seqTx = await snapshotResultSeq(page)
		const execPopupP = waitForPopup(ctx, "execute", { timeout: 60_000 })
		await clickByTestId(page, "pg-btn-sendTx-delegated")
		let execPopup: Awaited<typeof execPopupP>
		try {
			execPopup = await execPopupP
		} catch (e) {
			// The dApp-side `safe()` wrapper swallows pre-sendTx failures into the
			// playground's error banner — surface it instead of a blind timeout.
			const dappError = await page.evaluate(() => document.querySelector('[data-testid="pg-error-text"]')?.textContent ?? "")
			throw new Error(`execute popup never opened; playground lastError: "${dappError}" (${(e as Error).message})`)
		}
		await waitForExecuteContent(execPopup)

		const ops = await execPopup.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>('[data-testid="execute-op-item"]')].map((el) => el.getAttribute("data-op-kind")),
		)
		expect(ops).toEqual(["aztec_sendTx"])

		// The discovered authwit shows once the estimate lands, and its decode after that.
		await execPopup.waitForSelector(sel("execute-discovered-authwit-toggle"), { visible: true, timeout: 60_000 })
		await clickByTestId(execPopup, "execute-discovered-authwit-toggle")
		await execPopup.waitForSelector(sel("execute-discovered-authwit-structured-args"), { visible: true, timeout: 60_000 })
		// Each address fills itself in after its own contact lookup.
		await execPopup.waitForFunction(
			() =>
				["execute-discovered-authwit-transfer-sender-address", "execute-discovered-authwit-transfer-to"].every((id) =>
					document.querySelector(`[data-testid="execute-op-discovered-authwit"] [data-testid="${id}"]`)?.textContent?.trim(),
				),
			{ timeout: 10_000 },
		)
		// One read, so an estimate rerun cannot remount the list between two fields.
		const discovered = await execPopup.evaluate(() => {
			const rows = document.querySelectorAll('[data-testid="execute-op-discovered-authwit"]')
			const at = (id: string) => rows[0]?.querySelector(`[data-testid="${id}"]`)
			const text = (id: string) => (at(id)?.textContent ?? "").replace(/\s+/g, " ").trim()
			return {
				rows: rows.length,
				intent: at("execute-discovered-authwit-structured-args")?.getAttribute("data-intent-kind") ?? null,
				fn: text("execute-discovered-authwit-function"),
				from: at("execute-discovered-authwit-transfer-sender-address")?.getAttribute("data-address-shows") ?? null,
				to: text("execute-discovered-authwit-transfer-to"),
				amount: text("execute-discovered-authwit-amount"),
			}
		})
		// From names the donor (the wallet's own account); To is the consumer that pulls.
		expect(discovered).toEqual({
			rows: 1,
			intent: "transfer",
			fn: "Transfer (private)",
			from: "name",
			to: trimAddress(consumerAddress),
			amount: "5 PULL",
		})

		await approveExecute(execPopup)

		const walletPopup = await openPopup(ctx)
		await waitForDappExecuteWorked(walletPopup)

		// `txHash` at the dApp: the wallet submitted a tx carrying the discovered witness. Without
		// it the token's authwit check fails in private execution, before anything is submitted.
		const result = await waitForPgResult(page, "sendTx", seqTx, 300_000)
		await assertPgOk(page, result, "tx-sendTx-delegated-authwit:result")
		expect(typeof (result.resultJson as { txHash?: string } | undefined)?.txHash).toBe("string")
	},
)
