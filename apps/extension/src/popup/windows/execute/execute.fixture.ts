/**
 * One multi-call `aztec_sendTx` as a dApp's `FunctionCall.toJSON` sends it, with the two
 * authorizations the fee estimate discovers: an app call on its Hub, a transfer on USDC (a token the
 * account holds), a call the wallet has no interface for, a USDC authorization the wallet reads, and
 * an app authorization on a Vault. USDC's call and authorization decode through the real decoder and
 * Token artifact; the Hub's and the Vault's are the records the decoder returns for an interface the
 * app registered. Also a public grant on USDC as `grantPublicAuthwit` sends it, decoded the same way.
 * A test fixture: nothing in the wallet imports it.
 */

// @ts-expect-error — raw JSON import via vite alias
import WonderlandTokenJson from "@wonderland-token-artifact"
import { FunctionSelector, loadContractArtifact } from "@aztec-labs/stdlib/abi"
import { vi } from "vitest"
import { trimAddress } from "@/utils/string"
import { vocabularySelector } from "@/utils/token-transfer-vocabulary"
import { decodeCallForDisplay, decodeGrantForDisplay } from "@/wallet/services/execution/call-decoder"
import type { CallAuthwitContent, DecodedCall, DecodedGrant, DiscoveredAuthwit } from "@/wallet/services/execution/client"
import type { TokenInfo } from "@/wallet/services/token/client"
import { authwitDisplayCall, displayCallsOf } from "./display-calls"
import type { DraftUIOperation } from "./types"

/** Every address passes `isValidAztecAddress`; each is told apart by its trimmed form. */
export const MAIN = "0x0a1b2c0000000000000000000000000000000000000000000000000000009c2d"
export const HUB = "0x1b5c090000000000000000000000000000000000000000000000000000083d4e"
export const USDC = "0x2f4e8100000000000000000000000000000000000000000000000000000077a0"
export const RECIPIENT = "0x1e6f120000000000000000000000000000000000000000000000000000007a8b"
export const UNKNOWN = "0x2c3d4e0000000000000000000000000000000000000000000000000000004e5f"
export const VAULT = "0x0d9a170000000000000000000000000000000000000000000000000000045f6a"
const L1_RECIPIENT = "0x7c41d2a90b3e85f61c0d7e4b2a9f13c86d5be9f0"

export const field = (n: bigint): string => `0x${n.toString(16).padStart(64, "0")}`
const EXIT_NONCE = "0x2f9e41c7a05b3d18e6f42c90b7d15a3e8c06f21d94b7e3a50c18d6f2a97c1b08"
const AUTH_NONCE = "0x1a7c03e59d2b46f80c3e1a5b7d9f2c4e6a8b0d1f3e5c7a9b1d3f5e7c9a1b3d5f"
const CHECKPOINT_ROOT = "0x0b6e2f91d4a7c3058e1f6b2d9a4c7e0f3b8d5a2c6e9f1b4d7a0c3e6f9b2d5a8c"
const INNER_1 = "0x14f2a6c8e0b3d5f7192b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c"
const INNER_2 = "0x05d7f9b1c3e5a7092d4f6b8c0e2a4d6f8b0c2e4a6d8f0b2c4e6a8d0f2b4c6e8a"
const MESSAGE_1 = "0x21a3c5e7f9b1d3052f4b6d8e0a2c4f6b8d0e2a4c6f8b0d2e4a6c8f0b2d4e6a8c"
const MESSAGE_2 = "0x12c4e6a8f0b2d4062e8a0c2f4b6d8e0a2c4f6b8d0e2a4c6f8b0d2e4a6c8f0b2d"

const EXIT_SELECTOR = "0x5a3e1b2c"
const CHECKPOINT_SELECTOR = "0x6c4d2e1f"
const WITHDRAW_SELECTOR = "0x7b2c4d1e"

export const USDC_TOKEN = { id: 1, chainId: 1, contract: USDC, name: "USD Coin", symbol: "USDC", decimals: 6 } as TokenInfo
const TOKEN_ARTIFACT = loadContractArtifact(WonderlandTokenJson as never)

/** bb.js's poseidon2 cannot run under jsdom, so a Token function's selector is the vocabulary's
 *  pinned one (`token-transfer-vocabulary.real.test.ts` checks each against the real hash). */
export const stubTokenSelectors = (): void => {
	vi.spyOn(FunctionSelector, "fromNameAndParameters").mockImplementation(async (name, params) =>
		FunctionSelector.fromString(vocabularySelector(name, params.length) ?? "0x00000000"),
	)
}

const wireCall = (name: string, to: string, selector: string, args: string[]) => ({
	name,
	to,
	selector,
	type: "private",
	isStatic: false,
	hideMsgSender: false,
	args,
	returnTypes: [],
})

const CALLS = [
	wireCall("exit_to_l1", HUB, EXIT_SELECTOR, [USDC, field(25_000_000n), `0x${L1_RECIPIENT.slice(2).padStart(64, "0")}`, EXIT_NONCE]),
	wireCall("transfer_private_to_private", USDC, vocabularySelector("transfer_private_to_private", 4) ?? "", [
		MAIN,
		RECIPIENT,
		field(100_000n),
		field(0n),
	]),
	wireCall("checkpoint", UNKNOWN, CHECKPOINT_SELECTOR, [CHECKPOINT_ROOT, field(7n)]),
]

export const fixtureOp = (): DraftUIOperation =>
	({
		kind: "aztec_sendTx" as const,
		networkId: "net-1",
		accountAddress: MAIN,
		account: { name: "Main", address: MAIN, profileId: "p1", chainId: 1, index: 0, type: 0, visible: true },
		network: { id: "net-1", chainId: 1, name: "N" },
		exec: { calls: CALLS },
		opts: { from: MAIN },
		feeSettings: { paymentMethod: { kind: "fj" } },
	}) as unknown as DraftUIOperation

export const AUTHWITS: readonly DiscoveredAuthwit[] = [
	{
		consumer: USDC,
		caller: HUB,
		selector: vocabularySelector("transfer_private_to_public", 4) ?? "",
		args: [MAIN, HUB, field(25_000_000n), AUTH_NONCE],
		innerHash: INNER_1,
		messageHash: MESSAGE_1,
	},
	{ consumer: VAULT, caller: HUB, selector: WITHDRAW_SELECTOR, args: [MAIN, field(1000n)], innerHash: INNER_2, messageHash: MESSAGE_2 },
]

export const feeEstimateWith = (discoveredAuthwits: readonly DiscoveredAuthwit[]) => ({
	maxFee: "1",
	gasDetails: { l2GasLimit: 0, daGasLimit: 0, teardownL2GasLimit: 0, teardownDaGasLimit: 0, feePerL2Gas: "1", feePerDaGas: "1" },
	discoveredAuthwits,
})

const HUB_DECODE: DecodedCall = {
	kind: "decoded",
	contract: "Hub",
	fn: "exit_to_l1",
	params: [
		{ name: "token", value: { kind: "address", value: USDC } },
		{ name: "amount", value: { kind: "integer", value: "25000000" } },
		{ name: "recipient", value: { kind: "address", value: L1_RECIPIENT } },
		{ name: "authwit_nonce", value: { kind: "field", value: EXIT_NONCE } },
	],
}

const VAULT_DECODE: DecodedCall = {
	kind: "decoded",
	contract: "Vault",
	fn: "withdraw_for",
	params: [
		{ name: "owner", value: { kind: "address", value: MAIN } },
		{ name: "amount", value: { kind: "integer", value: "1000" } },
	],
}

const lookup = async (address: string) => (address === USDC ? TOKEN_ARTIFACT : undefined)

/** The decodes the window fetches after it opens; `vaultDecoded: false` leaves the Vault
 *  authorization unreadable, so its raw fields are what the person can reach. */
export const decodeFixture = async ({ vaultDecoded = true } = {}) => {
	const [, transfer, checkpoint] = await Promise.all(displayCallsOf(fixtureOp()).map((call) => decodeCallForDisplay(lookup, call)))
	const usdcAuthwit = await decodeCallForDisplay(lookup, authwitDisplayCall(AUTHWITS[0]))
	const vault: DecodedCall = vaultDecoded ? VAULT_DECODE : { kind: "undecoded", reason: "unknown-contract" }
	return {
		decodedCalls: [HUB_DECODE, transfer, checkpoint] as const,
		decodedAuthwits: new Map<string, DecodedCall>([
			[MESSAGE_1, usdcAuthwit],
			[MESSAGE_2, vault],
		]),
	}
}

/** A `grantPublicAuthwit` content as the playground sends it: the owner and spender as hex, the
 *  amount and nonce as decimal strings. */
export const GRANT: CallAuthwitContent = {
	kind: "call",
	caller: HUB,
	contract: USDC,
	method: "transfer_public_to_public",
	args: [MAIN, RECIPIENT, "25000000", "0"],
}

/** The grant's decode as the worker returns it; call `stubTokenSelectors` first under jsdom. */
export const decodeGrantFixture = (content: CallAuthwitContent = GRANT): Promise<DecodedGrant> => decodeGrantForDisplay(lookup, content)

/** A fact the window shows today: text in its row, or a row element's `title`. A row is every element
 *  carrying its `data-call-index` (a call) or `data-message-hash` (an authorization). */
export type Fact = { row: string; text: string }

const call = (j: number, ...texts: string[]): Fact[] => texts.map((text) => ({ row: `[data-call-index="${j}"]`, text }))
const authwit = (hash: string, ...texts: string[]): Fact[] => texts.map((text) => ({ row: `[data-message-hash="${hash}"]`, text }))

export const FACTS: readonly Fact[] = [
	...call(0, "Exit To L1", trimAddress(HUB), "token:", trimAddress(USDC), "amount:", "25000000", "recipient:"),
	...call(0, trimAddress(L1_RECIPIENT), "authwit_nonce:", trimAddress(EXIT_NONCE, 10, 6), EXIT_NONCE),
	...call(1, "Transfer (private)", trimAddress(USDC), "Main", trimAddress(RECIPIENT), "0.1 USDC"),
	...call(2, "Checkpoint", trimAddress(UNKNOWN), "Can't read the arguments", "Nulo doesn't have this contract's interface"),
	...call(2, trimAddress(CHECKPOINT_ROOT, 10, 6), CHECKPOINT_ROOT, "= 7"),
	...authwit(MESSAGE_1, trimAddress(USDC), trimAddress(HUB), "Transfer to public", "Main", "25 USDC"),
	...authwit(MESSAGE_1, trimAddress(AUTH_NONCE, 10, 6), AUTH_NONCE, trimAddress(INNER_1, 10, 6), INNER_1),
	...authwit(MESSAGE_2, trimAddress(VAULT), trimAddress(HUB), trimAddress(INNER_2, 10, 6), INNER_2),
]

/** The Vault authorization's facts when it decodes, and when it reads as raw fields. */
export const VAULT_DECODED_FACTS: readonly Fact[] = authwit(MESSAGE_2, "Withdraw For", "owner:", "Main", "amount:", "1000")
export const VAULT_RAW_FACTS: readonly Fact[] = authwit(MESSAGE_2, WITHDRAW_SELECTOR, trimAddress(MAIN, 10, 6), MAIN, "= 1000")
