import { expect, inject } from "vitest"
import { trimAddress } from "@/utils/string"
import { deployDelegatedPullRig, type AztecTestConfig } from "../fixtures/aztec"
import type { Page } from "puppeteer"
import { clickByTestId, type ExtensionContext, grantCapBundle, openPopup, test, waitForHash } from "../fixtures/extension"
import { importToken } from "../fixtures/helpers"
import { waitForDappExecuteWorked } from "../fixtures/journal"
import { assertPgOk, setPgInput, setPgTextarea, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { approveExecute, openExecuteDetails, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { serializeInstance } from "../fixtures/selfpay-phase"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Delegated-authwit discovery against a real consumer. The playground registers a Crowdfunding
 * consumer and its pull token with the wallet, then sends `donate(amount)` with NO witness attached.
 * The consumer pulls the donor's tokens via `transfer_in_private` (msg.sender = crowdfunding ≠
 * from = donor), so the token asserts a call authwit against the DONOR's account. The wallet's
 * folded estimate must DISCOVER that need in its stubbed first sim (the CallAuthorizationRequest
 * offchain effect), show it decoded on the token as the transfer it is, sign the witness, and
 * verify it in the validated rebuild.
 */

const sel = (testid: string) => `[data-testid="${testid}"]`
const DONOR_MINT = 10n ** 19n
/** 5 PULL in base units, half of `DONOR_MINT`. */
const AMOUNT = "5000000000000000000"

type Ctx = ExtensionContext & { playgroundPage: Page }

/** Deploys the rig, imports its token and asks the playground to donate; returns once the execute
 *  window shows its operation. */
async function openDonation(ctx: Ctx) {
	const page = ctx.playgroundPage

	const [accountAddress] = await grantCapBundle(ctx, page, "transaction-contracts", async (ids) => [ids[0]!])
	const { pullTokenAddress, consumerAddress } = await deployDelegatedPullRig(aztecConfig!, accountAddress!, DONOR_MINT)

	// The window reads a call as a transfer only on a token the wallet holds, from the list it
	// loads when it opens, so the import lands before the send.
	const home = await openPopup(ctx)
	await waitForHash(home, "#/popup/general")
	await importToken(home, pullTokenAddress)
	await home.close()

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
	return { page, execPopup, seqTx, consumerAddress }
}

test.skipIf(!hasConfig)(
	"tx-sendTx-delegated — folded discovery finds the pull authwit, reads it as the donor's transfer, and the send is submitted",
	{ timeout: 420_000 },
	async ({ dappConnectedExtensionPerTest: ctx }) => {
		const { page, execPopup, seqTx, consumerAddress } = await openDonation(ctx)

		const ops = await execPopup.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>('[data-testid="execute-op-item"]')].map((el) => el.getAttribute("data-op-kind")),
		)
		expect(ops).toEqual(["aztec_sendTx"])

		// The discovered authwit sits under the card's "Show all details", closed at rest, and its
		// values open with it once the estimate lands.
		await openExecuteDetails(execPopup)
		await execPopup.waitForSelector(sel("execute-discovered-authwit-structured-args"), { visible: true, timeout: 60_000 })
		// Each address fills itself in after its own contact lookup. The row is read in the same pass
		// that sees both filled, so an estimate rerun that remounts the list cannot split the read.
		const discovered = await execPopup.waitForFunction(
			() => {
				const rows = document.querySelectorAll('[data-testid="execute-op-discovered-authwit"]')
				const at = (id: string) => rows[0]?.querySelector(`[data-testid="${id}"]`)
				const text = (id: string) => (at(id)?.textContent ?? "").replace(/\s+/g, " ").trim()
				const to = text("execute-discovered-authwit-transfer-to")
				if (!text("execute-discovered-authwit-transfer-sender-address") || !to) return false
				return {
					rows: rows.length,
					intent: at("execute-discovered-authwit-structured-args")?.getAttribute("data-intent-kind") ?? null,
					fn: text("execute-discovered-authwit-function"),
					from: at("execute-discovered-authwit-transfer-sender-address")?.getAttribute("data-address-shows") ?? null,
					to,
					amount: text("execute-discovered-authwit-amount"),
				}
			},
			{ timeout: 60_000 },
		)
		// A name: From is the wallet's account, the donor. To is the Crowdfunding contract that pulls.
		expect(await discovered.jsonValue()).toEqual({
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

test.skipIf(!hasConfig)(
	"tx-sendTx-delegated — a sponsored Confirm pressed at its first offer is submitted with the discovered authwit",
	{ timeout: 420_000 },
	async ({ dappConnectedExtensionPerTest: ctx }) => {
		const { page, execPopup, seqTx } = await openDonation(ctx)
		// Pressed as soon as the button allows, without waiting for the discovered rows: the press
		// must still carry the estimate whose authorization confirm holds the send to.
		await approveExecute(execPopup, { feeMethod: "sponsored" })

		const walletPopup = await openPopup(ctx)
		await waitForDappExecuteWorked(walletPopup)
		const result = await waitForPgResult(page, "sendTx", seqTx, 300_000)
		await assertPgOk(page, result, "tx-sendTx-delegated-authwit:first-offer")
		expect(typeof (result.resultJson as { txHash?: string } | undefined)?.txHash).toBe("string")
	},
)
