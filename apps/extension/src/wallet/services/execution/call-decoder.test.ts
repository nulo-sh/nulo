// @vitest-environment node
/**
 * The decoder reads a call's wire fields with the registered artifact's ABI — real `encodeArguments`
 * in, real `decodeFromAbi` out — and names why a call stays undecoded instead of guessing.
 *
 * Node environment on purpose: a selector lookup hashes with poseidon2, which throws
 * `BBApiException: std::bad_cast` under jsdom, so there every lookup would miss.
 */

import { describe, expect, test } from "vitest"
import { TokenContractArtifact as StandardToken } from "@aztec-foundation/aztec-standards/artifacts/src/artifacts/Token.js"
import { computeAuthWitMessageHash } from "@aztec-labs/aztec.js/authorization"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import {
	type AbiType,
	type ContractArtifact,
	type FunctionAbi,
	FunctionCall,
	FunctionSelector,
	FunctionType,
	encodeArguments,
	getFunctionReturnType,
} from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import type { AuthwitContent, CallAuthwitContent } from "@nulo/wallet-bridge"
import { EventHandler } from "@nulo/wallet-core/utils"
import { isValidAztecAddress } from "@/utils/aztec-address"
import type { ConfigProp, IConfig } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { AuthwitDiscoverer } from "./authwit-discoverer"
import { decodeCallForDisplay, decodeGrantForDisplay } from "./call-decoder"
import { findFunctionByName } from "./contract-resolver"

const ADDRESS: AbiType = {
	kind: "struct",
	path: "aztec::protocol_types::address::aztec_address::AztecAddress",
	fields: [{ name: "inner", type: { kind: "field" } }],
}
const U128: AbiType = { kind: "integer", sign: "unsigned", width: 128 }
const fn = (name: string, params: { name: string; type: AbiType }[]): FunctionAbi => ({
	name,
	functionType: FunctionType.PRIVATE,
	isOnlySelf: false,
	isStatic: false,
	isInitializer: false,
	parameters: params.map((p) => ({ ...p, visibility: "private" as const })),
	returnTypes: [],
	errorTypes: {},
})
const claim = fn("claim_private", [
	{ name: "to", type: ADDRESS },
	{ name: "amount", type: U128 },
	{ name: "secret", type: { kind: "field" } },
	{ name: "shielded", type: { kind: "boolean" } },
	{ name: "limits", type: { kind: "array", length: 2, type: U128 } },
])
const artifact = { name: "BridgeHub", functions: [claim], nonDispatchPublicFunctions: [] } as unknown as ContractArtifact
const lookup = (known: Record<string, ContractArtifact>) => async (address: string) => known[address]

const TOKEN = `0x00${"c".repeat(62)}`
const TO = `0x00${"b".repeat(62)}`
const encoded = encodeArguments(claim, [AztecAddress.fromStringUnsafe(TO), 5_000_000n, 7n, true, [1n, 2n]]).map((f) => f.toString())

describe("decodeCallForDisplay", () => {
	test("names every parameter from the ABI and projects each value by its type", async () => {
		const result = await decodeCallForDisplay(lookup({ [TOKEN]: artifact }), { to: TOKEN, name: "claim_private", args: encoded })
		expect(result).toEqual({
			kind: "decoded",
			contract: "BridgeHub",
			fn: "claim_private",
			params: [
				{ name: "to", value: { kind: "address", value: TO } },
				{ name: "amount", value: { kind: "integer", value: "5000000" } },
				{ name: "secret", value: { kind: "field", value: `0x${"0".repeat(63)}7` } },
				{ name: "shielded", value: { kind: "boolean", value: true } },
				{
					name: "limits",
					value: {
						kind: "array",
						items: [
							{ kind: "integer", value: "1" },
							{ kind: "integer", value: "2" },
						],
					},
				},
			],
		})
	})

	test("an unregistered contract, an unknown function and a wrong argument count each say why", async () => {
		expect(await decodeCallForDisplay(lookup({}), { to: TOKEN, name: "claim_private", args: encoded })).toEqual({
			kind: "undecoded",
			reason: "unknown-contract",
		})
		expect(await decodeCallForDisplay(lookup({ [TOKEN]: artifact }), { to: TOKEN, name: "steal", args: encoded })).toEqual({
			kind: "undecoded",
			reason: "unknown-function",
		})
		expect(
			await decodeCallForDisplay(lookup({ [TOKEN]: artifact }), { to: TOKEN, name: "claim_private", args: encoded.slice(1) }),
		).toEqual({ kind: "undecoded", reason: "arguments" })
	})

	test("a non-field argument or a failing artifact lookup never throws", async () => {
		expect(
			await decodeCallForDisplay(lookup({ [TOKEN]: artifact }), {
				to: TOKEN,
				name: "claim_private",
				args: [...encoded.slice(0, 5), "5"],
			}),
		).toEqual({ kind: "undecoded", reason: "arguments" })
		const failing = async () => {
			throw new Error("pxe down")
		}
		expect(await decodeCallForDisplay(failing, { to: TOKEN, name: "claim_private", args: encoded })).toEqual({
			kind: "undecoded",
			reason: "unknown-contract",
		})
	})

	test("an interface that would decode into thousands of values is refused before decoding", async () => {
		const empty: AbiType = { kind: "struct", path: "Empty", fields: [] }
		const flood = fn("flood", [{ name: "items", type: { kind: "array", length: 10_000, type: empty } }])
		const hostile = { name: "Flood", functions: [flood], nonDispatchPublicFunctions: [] } as unknown as ContractArtifact
		// Zero fields encode ten thousand empty structs: the argument count cannot bound this.
		expect(await decodeCallForDisplay(lookup({ [TOKEN]: hostile }), { to: TOKEN, name: "flood", args: [] })).toEqual({
			kind: "undecoded",
			reason: "unavailable",
		})
	})

	test("a selector is the truth: a dApp-supplied name cannot pick a different function", async () => {
		const sweep = fn("sweep", [
			{ name: "to", type: ADDRESS },
			{ name: "amount", type: U128 },
		])
		const hub = { name: "BridgeHub", functions: [claim, sweep], nonDispatchPublicFunctions: [] } as unknown as ContractArtifact
		const sweepArgs = encodeArguments(sweep, [AztecAddress.fromStringUnsafe(TO), 9n]).map((f) => f.toString())
		const selectorOf = async (f: FunctionAbi) => (await FunctionSelector.fromNameAndParameters(f.name, f.parameters)).toString()
		const claimSelector = await selectorOf(claim)
		const sweepSelector = await selectorOf(sweep)
		expect(claimSelector).not.toBe(sweepSelector)
		const decode = (name: string, selector: string, args: string[]) =>
			decodeCallForDisplay(lookup({ [TOKEN]: hub }), { to: TOKEN, name, selector, args })

		// Each call names the other function, so only a selector lookup that matches can decode it: a run
		// where every lookup misses fails these two instead of passing the refusal below.
		expect(await decode("claim_private", sweepSelector, sweepArgs)).toMatchObject({ kind: "decoded", fn: "sweep" })
		expect(await decode("sweep", claimSelector, encoded)).toMatchObject({ kind: "decoded", fn: "claim_private" })
		expect(await decode("claim_private", "0x00000000", encoded)).toEqual({ kind: "undecoded", reason: "unknown-function" })
	})
})

describe("decodeGrantForDisplay over the real Token", () => {
	const OWNER = "0x0a1b2c0000000000000000000000000000000000000000000000000000009c2d"
	const SPENDER = "0x1b5c090000000000000000000000000000000000000000000000000000083d4e"
	const USDC = "0x2f4e8100000000000000000000000000000000000000000000000000000077a0"
	const RECIPIENT = "0x1e6f120000000000000000000000000000000000000000000000000000007a8b"
	const METHOD = "transfer_public_to_public"
	const CHAIN = { l1ChainId: 31337, rollupVersion: 1 }
	const grant = (args: unknown[], method = METHOD): CallAuthwitContent => ({
		kind: "call",
		caller: SPENDER,
		contract: USDC,
		method,
		args,
	})
	const tokenLookup = lookup({ [USDC]: StandardToken as ContractArtifact })
	const decodedOf = async (content: AuthwitContent) => {
		const shown = await decodeGrantForDisplay(tokenLookup, content)
		if (shown.kind !== "decoded") throw new Error(`undecoded: ${shown.reason}`)
		return shown
	}

	/** What the wallet signs for `content`, through the signing path itself. */
	const signedHash = async (content: CallAuthwitContent) => {
		const instances = new Map([[USDC, { currentContractClassId: { toString: () => "0xc1a55" } }]])
		const artifacts = new Map([["0xc1a55", StandardToken]])
		const config: IConfig = { onUpdate: new EventHandler<ConfigProp>(), get: (() => false) as IConfig["get"] }
		const discoverer = new AuthwitDiscoverer(new LoggerStore(config))
		return (await discoverer.computeCallMessageHash(content, CHAIN as never, instances as never, artifacts as never)).toString()
	}

	/** The hash over the call the card decoded, assembled from that call alone. */
	const shownHash = async (call: { to: string; selector?: string; args: readonly string[] }) => {
		const fn = findFunctionByName(StandardToken as ContractArtifact, METHOD) as FunctionAbi
		const functionCall = new FunctionCall(
			fn.name,
			AztecAddress.fromStringUnsafe(call.to),
			FunctionSelector.fromString(call.selector ?? ""),
			fn.functionType,
			false,
			fn.isStatic,
			call.args.map((a) => Fr.fromString(a)),
			getFunctionReturnType(fn),
		)
		const chainInfo = { chainId: new Fr(CHAIN.l1ChainId), version: new Fr(CHAIN.rollupVersion) }
		return (
			await computeAuthWitMessageHash({ caller: AztecAddress.fromStringUnsafe(SPENDER), call: functionCall }, chainInfo)
		).toString()
	}

	test("the call the card decodes is the one the message hash signs", async () => {
		for (const address of [OWNER, SPENDER, USDC, RECIPIENT]) expect(isValidAztecAddress(address)).toBe(true)
		const content = grant([OWNER, RECIPIENT, "25000000", "0"])
		const shown = await decodedOf(content)
		expect(shown.decoded.params).toEqual([
			{ name: "from", value: { kind: "address", value: OWNER } },
			{ name: "to", value: { kind: "address", value: RECIPIENT } },
			{ name: "amount", value: { kind: "integer", value: "25000000" } },
			{ name: "_nonce", value: { kind: "field", value: `0x${"0".repeat(64)}` } },
		])
		expect(shown.call.to).toBe(USDC)
		expect(await shownHash(shown.call)).toBe(await signedHash(content))
		// The comparison can fail: another amount's signature is not this card's.
		expect(await shownHash(shown.call)).not.toBe(await signedHash(grant([OWNER, RECIPIENT, "25000001", "0"])))
	})

	test("an object, a decimal string and a hex string argument each decode to the value the hash encodes", async () => {
		const plain = await decodedOf(grant([OWNER, RECIPIENT, "25000000", "0"]))
		const object = await decodedOf(grant([OWNER, { address: RECIPIENT }, "25000000", "0"]))
		const hex = await decodedOf(grant([OWNER, RECIPIENT, "0x17d7840", "0x0"]))
		for (const shown of [object, hex]) {
			expect(shown.call.args).toEqual(plain.call.args)
			expect(shown.decoded.params).toEqual(plain.decoded.params)
		}
	})

	test("each grant the wallet cannot encode or decode says why", async () => {
		const args = [OWNER, RECIPIENT, "25000000", "0"]
		expect(await decodeGrantForDisplay(tokenLookup, { kind: "message_hash", messageHash: `0x${"1".repeat(64)}` })).toEqual({
			kind: "undecoded",
			reason: "unavailable",
		})
		expect(await decodeGrantForDisplay(lookup({}), grant(args))).toEqual({ kind: "undecoded", reason: "unknown-contract" })
		expect(await decodeGrantForDisplay(tokenLookup, grant(args, "steal"))).toEqual({ kind: "undecoded", reason: "unknown-function" })
		// A dApp that formats the amount as a decimal number: the encoder refuses it.
		expect(await decodeGrantForDisplay(tokenLookup, grant([OWNER, RECIPIENT, "25.5", "0"]))).toEqual({
			kind: "undecoded",
			reason: "arguments",
		})
		// More fields than the card decodes row by row, refused before encoding them.
		const wide = fn("set_many", [{ name: "values", type: { kind: "array", length: 300, type: { kind: "field" } } }])
		const registry = { name: "Registry", functions: [wide], nonDispatchPublicFunctions: [] } as unknown as ContractArtifact
		const many = grant([Array(300).fill("1")], "set_many")
		expect(encodeArguments(wide, many.args)).toHaveLength(300)
		expect(await decodeGrantForDisplay(lookup({ [USDC]: registry }), many)).toEqual({ kind: "undecoded", reason: "arguments" })
	})

	test("a grant whose decode drops signed bits is not read: an EthAddress field past 160 bits", async () => {
		const ETH: AbiType = {
			kind: "struct",
			path: "aztec::protocol_types::address::eth_address::EthAddress",
			fields: [{ name: "inner", type: { kind: "field" } }],
		}
		const bridge = fn("exit_to", [{ name: "recipient", type: ETH }])
		const hub = lookup({ [USDC]: { name: "Hub", functions: [bridge], nonDispatchPublicFunctions: [] } as unknown as ContractArtifact })
		const recipient = "0x7c41d2a90b3e85f61c0d7e4b2a9f13c86d5be9f0"
		expect(await decodeGrantForDisplay(hub, grant([recipient], "exit_to"))).toMatchObject({
			kind: "decoded",
			decoded: { params: [{ name: "recipient", value: { kind: "address", value: recipient } }] },
		})
		// The same last 20 bytes under a set upper bit: the decoder reads the address above, the hash signs more.
		const padded = `0x${(2n ** 160n + BigInt(recipient)).toString(16)}`
		expect(await decodeGrantForDisplay(hub, grant([padded], "exit_to"))).toEqual({ kind: "undecoded", reason: "arguments" })
	})
})
