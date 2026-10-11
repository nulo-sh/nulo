/**
 * `sendTx` variants: default (its transfer function picked by `pg-select-transferFn`), `NoFrom`
 * (a public call, which the wallet refuses), `NoFrom` sponsored, `feePayer`, multicall, chunked,
 * delegated.
 *
 * Each variant constructs an `ExecutionPayload` and calls
 * `wallet.sendTx()`. `sendTx` ALWAYS opens `/windows/execute`
 * (`Transactions=5 >= confirmationLevel=5`); tests drive the popup via
 * `approveExecute()` / `rejectExecute()`.
 */
import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { getContractInstanceFromInstantiationParams } from "@aztec-labs/aztec.js/contracts"
import { Fr } from "@aztec-labs/aztec.js/fields"
import { getWallet } from "../lib/wallet"
import { logCall } from "../lib/log"
import { getInput, getState, setState } from "../state"

const TRANSFER_FNS = [
	"transfer_public_to_public",
	"transfer_private_to_private",
	"transfer_private_to_public",
	"transfer_public_to_private",
] as const
type TransferFn = (typeof TRANSFER_FNS)[number]

function selectedTransferFn(): TransferFn {
	const value = getInput("transferFn")
	if (value === "") return TRANSFER_FNS[0]
	const fn = TRANSFER_FNS.find((f) => f === value)
	if (!fn) throw new Error(`transferFn must be one of ${TRANSFER_FNS.join(", ")}`)
	return fn
}

export function renderTransactions(): string {
	const s = getState()
	const dis = s.status === "connected" ? "" : "disabled"
	return `
		<fieldset class="pg-section">
			<legend>Transactions</legend>
			<div class="pg-row">
				<label>Recipient: <input data-testid="pg-input-recipient" name="recipient" type="text" placeholder="0x..." /></label>
				<label>Amount: <input data-testid="pg-input-amount" name="amount" type="number" placeholder="100" /></label>
				<label>FeePayer (FPC addr): <input data-testid="pg-input-feePayer" name="feePayer" type="text" placeholder="0x... (defaults to recipient)" /></label>
				<label>Default transfer: <select data-testid="pg-select-transferFn" name="transferFn">
					${TRANSFER_FNS.map((fn) => `<option value="${fn}">${fn}</option>`).join("")}
				</select></label>
			</div>
			<div class="pg-row">
				<button data-testid="pg-btn-sendTx-default" type="button" ${dis}>sendTx default</button>
				<button data-testid="pg-btn-sendTx-noFrom" type="button" ${dis}>sendTx NoFrom</button>
				<button data-testid="pg-btn-sendTx-noFrom-sponsored" type="button" ${dis}>sendTx NoFrom (sponsored)</button>
				<button data-testid="pg-btn-sendTx-feePayer" type="button" ${dis}>sendTx feePayer</button>
				<button data-testid="pg-btn-sendTx-multicall" type="button" ${dis}>sendTx multicall</button>
				<button data-testid="pg-btn-sendTx-multicall-chunked" type="button" ${dis}>sendTx multicall &gt;5</button>
			</div>
			<div class="pg-row">
				<label>Consumer (pull contract): <input data-testid="pg-input-consumerAddress" name="consumerAddress" type="text" placeholder="0x... (Crowdfunding)" /></label>
				<label>Pull-token instance JSON: <textarea data-testid="pg-input-delegatedTokenInstance" name="delegatedTokenInstance" placeholder="{...}"></textarea></label>
				<label>Consumer instance JSON: <textarea data-testid="pg-input-delegatedConsumerInstance" name="delegatedConsumerInstance" placeholder="{...}"></textarea></label>
				<button data-testid="pg-btn-sendTx-delegated" type="button" ${dis}>sendTx delegated (donate)</button>
			</div>
		</fieldset>
	`
}

async function buildTransferExec(callCount = 1, fn: TransferFn = "transfer_public_to_public") {
	const tokenAddress = getInput("tokenAddress")
	const recipient = getInput("recipient")
	const amount = getInput("amount") || "1"
	if (!tokenAddress || !recipient) throw new Error("tokenAddress + recipient inputs required")

	const { TokenContract } = await import("@aztec-foundation/aztec-standards/artifacts/src/artifacts/Token.js")
	const wallet = getWallet()!
	// biome-ignore lint/suspicious/noExplicitAny: structural typing across SDK boundary
	const token: any = await TokenContract.at(AztecAddress.fromStringUnsafe(tokenAddress), wallet as any)
	// `simFrom` (the Simulation section's override) names the acting account for sends too, so
	// a multi-account test can send from the second granted account.
	const s = getState()
	const from = getInput("simFrom") || s.selectedAccount || recipient
	const fromAddr = AztecAddress.fromStringUnsafe(from)
	const toAddr = AztecAddress.fromStringUnsafe(recipient)

	// Build N transfer calls. For the chunked variant (callCount > 5) we issue
	// N independent BatchCall.request() requests and concat their calls arrays.
	// Nonce 0 on every call: `from` is the sending account, and the Token refuses any other nonce then.
	const calls: unknown[] = []
	for (let i = 0; i < callCount; i++) {
		const exec = await token.methods[fn](fromAddr, toAddr, BigInt(amount), 0n).request()
		calls.push(...(exec.calls ?? []))
	}
	return { exec: { calls, authWitnesses: [], capsules: [], extraHashedArgs: [] }, fromAddr }
}

function safe<T>(method: string, fn: () => Promise<T>): () => Promise<void> {
	return async () => {
		const wallet = getWallet()
		if (!wallet) {
			setState({ lastError: "Not connected — call connect() first" })
			return
		}
		try {
			await logCall(method, fn)
		} catch (err) {
			setState({ lastError: err instanceof Error ? err.message : String(err) })
		}
	}
}

export function bindTransactions(root: HTMLElement): void {
	// All sendTx buttons below use `wait: "NO_WAIT"` so the dApp's promise
	// settles immediately after the wallet submits the tx (txHash + offchain
	// data) rather than blocking on `node.getTxReceipt()`. Playground tests
	// are popup-shape — they assert the popup flow + dApp callback, NOT
	// receipt mining. Without NO_WAIT the dApp blocks on chain mining, which
	// on heavy CI shards (shard 3 after fee-methods's 4 FJ transfers) takes
	// >180s and exceeded the test budget repeatedly.
	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-sendTx-default"]')?.addEventListener(
		"click",
		safe("sendTx", async () => {
			const wallet = getWallet()!
			const { exec, fromAddr } = await buildTransferExec(1, selectedTransferFn())
			// biome-ignore lint/suspicious/noExplicitAny: ExecutionPayload + SendOptions structural cast
			return wallet.sendTx(exec as any, { from: fromAddr, wait: "NO_WAIT" } as any)
		}),
	)

	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-sendTx-noFrom"]')?.addEventListener(
		"click",
		safe("sendTx", async () => {
			const wallet = getWallet()!
			const { exec } = await buildTransferExec(1)
			// The wallet sends `from: "NO_FROM"` through the default entrypoint, not the account contract.
			// biome-ignore lint/suspicious/noExplicitAny: NO_FROM is a sentinel string the SDK doesn't type
			return wallet.sendTx(exec as any, { from: "NO_FROM", wait: "NO_WAIT" } as any)
		}),
	)

	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-sendTx-noFrom-sponsored"]')?.addEventListener(
		"click",
		safe("sendTx", async () => {
			// The default entrypoint runs one private call with no caller, which must pay its own fee:
			// the canonical sponsor's `sponsor_unconditionally` reads no sender and makes itself the payer.
			const wallet = getWallet()!
			const { SponsoredFPCContract } = await import("@aztec-labs/noir-contracts.js/SponsoredFPC")
			const instance = await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, { salt: new Fr(0n) })
			await wallet.registerContract(instance, SponsoredFPCContract.artifact)
			const sponsor = SponsoredFPCContract.at(instance.address, wallet)
			const exec = await sponsor.methods.sponsor_unconditionally().request()
			return wallet.sendTx(exec, { from: "NO_FROM", wait: "NO_WAIT" })
		}),
	)

	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-sendTx-feePayer"]')?.addEventListener(
		"click",
		safe("sendTx", async () => {
			const wallet = getWallet()!
			const { exec, fromAddr } = await buildTransferExec(1)
			// dispatcher.ts:368-369 + execute/index.vue:202: when exec.feePayer is set,
			// the wallet auto-uses embedded paymentMethod and skips the fee picker.
			// Test mode passes a real FPC address via pg-input-feePayer; fallback to
			// recipient for ad-hoc playground usage (will fail at submit but exercises
			// the popup path).
			const feePayerInput = getInput("feePayer")
			const feePayer = AztecAddress.fromStringUnsafe(feePayerInput || getInput("recipient"))
			// biome-ignore lint/suspicious/noExplicitAny: ExecutionPayload doesn't include feePayer in this version's types
			const execWithFeePayer: any = { ...exec, feePayer }
			// biome-ignore lint/suspicious/noExplicitAny: SendOptions structural cast
			return wallet.sendTx(execWithFeePayer, { from: fromAddr, wait: "NO_WAIT" } as any)
		}),
	)

	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-sendTx-multicall"]')?.addEventListener(
		"click",
		safe("sendTx", async () => {
			const wallet = getWallet()!
			const { exec, fromAddr } = await buildTransferExec(3)
			// biome-ignore lint/suspicious/noExplicitAny: structural cast
			return wallet.sendTx(exec as any, { from: fromAddr, wait: "NO_WAIT" } as any)
		}),
	)

	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-sendTx-delegated"]')?.addEventListener(
		"click",
		safe("sendTx", async () => {
			// Delegated pull: the consumer contract (Crowdfunding) pulls the
			// caller's tokens via `transfer_in_private` — msg.sender ≠ from, so
			// the token asserts a call authwit against the CALLER's account. The
			// dApp supplies NO witness: the wallet's estimate-time discovery must
			// find the need and sign it, or the flow cannot complete.
			const wallet = getWallet()!
			const consumer = getInput("consumerAddress")
			const amount = getInput("amount") || "100"
			if (!consumer) throw new Error("consumerAddress input required")
			const { CrowdfundingContract } = await import("@aztec-labs/noir-contracts.js/Crowdfunding")
			const { TokenContract: PullTokenContract } = await import("@aztec-labs/noir-contracts.js/Token")
			const s = getState()
			if (!s.selectedAccount) throw new Error("no selected account")
			const fromAddr = AztecAddress.fromStringUnsafe(s.selectedAccount)
			// A real dApp introduces its own contracts: register instance+artifact
			// with the wallet before calling (the test driver injects the deployed
			// instances; artifacts ship in this bundle).
			const tokenInstanceRaw = getInput("delegatedTokenInstance")
			const consumerInstanceRaw = getInput("delegatedConsumerInstance")
			if (tokenInstanceRaw) {
				// biome-ignore lint/suspicious/noExplicitAny: instance wire shape
				await wallet.registerContract(JSON.parse(tokenInstanceRaw) as any, PullTokenContract.artifact as any)
			}
			if (consumerInstanceRaw) {
				// biome-ignore lint/suspicious/noExplicitAny: instance wire shape
				await wallet.registerContract(JSON.parse(consumerInstanceRaw) as any, CrowdfundingContract.artifact as any)
			}
			// biome-ignore lint/suspicious/noExplicitAny: structural typing across SDK boundary
			const crowdfunding: any = await CrowdfundingContract.at(AztecAddress.fromStringUnsafe(consumer), wallet as any)
			const exec = await crowdfunding.methods.donate(BigInt(amount)).request()
			// biome-ignore lint/suspicious/noExplicitAny: ExecutionPayload + SendOptions structural cast
			return wallet.sendTx(exec as any, { from: fromAddr, wait: "NO_WAIT" } as any)
		}),
	)

	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-sendTx-multicall-chunked"]')?.addEventListener(
		"click",
		safe("sendTx", async () => {
			const wallet = getWallet()!
			// >5 calls triggers nulo-account.ts recursive chunking (CLAUDE.md mentions this).
			const { exec, fromAddr } = await buildTransferExec(7)
			// biome-ignore lint/suspicious/noExplicitAny: structural cast
			return wallet.sendTx(exec as any, { from: fromAddr, wait: "NO_WAIT" } as any)
		}),
	)
}
