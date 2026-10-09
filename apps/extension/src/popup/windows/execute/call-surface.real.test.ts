// @vitest-environment node
/**
 * The approval card's reading of a real aztec-standards Token transfer, nothing stood in. Node
 * environment on purpose: poseidon2 throws `BBApiException: std::bad_cast` under jsdom, and the
 * composition layer stays bb-free.
 */

import { describe, expect, test } from "vitest"
import { TokenContractArtifact as StandardToken } from "@aztec-foundation/aztec-standards/artifacts/src/artifacts/Token.js"
import { type ContractArtifact, type FunctionAbi, FunctionSelector, encodeArguments } from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { decodeCallForDisplay } from "@/wallet/services/execution/call-decoder"
import { callSurface } from "./call-surface"

const TOKEN = `0x00${"c".repeat(62)}`
const FROM = `0x00${"a".repeat(62)}`
const TO = `0x00${"b".repeat(62)}`
const ctx = { accountAddress: FROM, noFrom: false }
const FN = "transfer_private_to_private"

const transferOf = (artifact: ContractArtifact): FunctionAbi => {
	const fn = artifact.functions.find((f) => f.name === FN)
	if (!fn) throw new Error(`${artifact.name} has no ${FN}`)
	return fn
}

/** The selector is derived from `fn`'s own ABI, so a relabeled function decodes and only the
 *  vocabulary's selector check can refuse it. */
const wireCall = async (fn: FunctionAbi) => ({
	name: fn.name,
	to: TOKEN,
	selector: (await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)).toString(),
	args: encodeArguments(fn, [AztecAddress.fromStringUnsafe(FROM), AztecAddress.fromStringUnsafe(TO), 5_000_000n, 3n]).map((f) =>
		f.toString(),
	),
})

const decode = (artifact: ContractArtifact, call: Awaited<ReturnType<typeof wireCall>>) =>
	decodeCallForDisplay(async (address) => (address === TOKEN ? artifact : undefined), call)

describe("callSurface over the real Token, selector hash and decoder", () => {
	test("a registered token's transfer reads as the vocabulary's transfer", async () => {
		const call = await wireCall(transferOf(StandardToken))
		expect(callSurface(ctx, call, await decode(StandardToken, call), true)).toEqual({
			kind: "transfer",
			fn: FN,
			to: TO,
			amount: "5000000",
			sender: { kind: "explicit", address: FROM },
			nonce: "3",
		})
	})

	test("an artifact that relabels the amount as u64 decodes, but its selector is not the vocabulary's", async () => {
		const real = transferOf(StandardToken)
		const relabeled: FunctionAbi = {
			...real,
			parameters: real.parameters.map((p) =>
				p.name === "amount" ? { ...p, type: { kind: "integer", sign: "unsigned", width: 64 } } : p,
			),
		}
		const artifact = {
			...StandardToken,
			functions: StandardToken.functions.map((f) => (f.name === FN ? relabeled : f)),
		} as ContractArtifact
		const call = await wireCall(relabeled)
		const decoded = await decode(artifact, call)
		expect(decoded.kind).toBe("decoded")
		expect(callSurface(ctx, call, decoded, true)).toMatchObject({ kind: "decoded", fn: FN })
	})

	test("the same transfer at an address the wallet has not registered as a token reads as decoded rows", async () => {
		const call = await wireCall(transferOf(StandardToken))
		expect(callSurface(ctx, call, await decode(StandardToken, call), false)).toMatchObject({ kind: "decoded", fn: FN })
	})
})
