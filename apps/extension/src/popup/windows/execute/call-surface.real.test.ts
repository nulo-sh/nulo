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
import { Fr } from "@aztec-labs/foundation/curves/bn254"
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

describe("a `str<N>` argument as the card reads it, from its wire fields", () => {
	const memoFn: FunctionAbi = {
		...transferOf(StandardToken),
		name: "set_memo",
		parameters: [{ name: "memo", type: { kind: "string", length: 16 }, visibility: "private" }],
	}
	const noteFn: FunctionAbi = {
		...transferOf(StandardToken),
		name: "set_note",
		parameters: [
			{
				name: "note",
				type: {
					kind: "struct",
					path: "memos::Note",
					fields: [
						{ name: "labels", type: { kind: "array", length: 2, type: { kind: "string", length: 4 } } },
						{ name: "count", type: { kind: "integer", sign: "unsigned", width: 32 } },
					],
				},
				visibility: "private",
			},
		],
	}
	const MEMOS = {
		...StandardToken,
		name: "Memos",
		functions: [memoFn, noteFn],
		nonDispatchPublicFunctions: [],
	} as unknown as ContractArtifact

	/** `units` as `str<length>` fields: one field each, then the zeros that pad a shorter string. */
	const padded = (units: readonly number[], length: number): `0x${string}`[] =>
		[...units, ...Array<number>(length - units.length).fill(0)].map((u) => new Fr(BigInt(u)).toString())
	/** As text arrives when a dApp sends its UTF-8 bytes, as Noir writes a `str`. */
	const utf8 = (s: string): number[] => [...new TextEncoder().encode(s)]
	/** As the SDK's encoder writes a JavaScript string: one field per UTF-16 unit. */
	const sdk = (s: string): number[] => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i))

	const read = async (fn: FunctionAbi, args: `0x${string}`[]) => {
		const call = {
			name: fn.name,
			to: TOKEN,
			selector: (await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)).toString(),
			args,
		}
		return callSurface(undefined, call, await decode(MEMOS, call))
	}
	const memo = (units: readonly number[]) => read(memoFn, padded(units, 16))

	test.each([
		["U+202E inside, one field", sdk("pay‮evil")],
		["U+202E inside, as UTF-8", utf8("pay‮evil")],
		["a zero-width joiner", utf8("a‍b")],
		["U+034F, a default-ignorable mark", utf8("pay͏evil")],
		["a UTF-8 BOM", utf8("﻿hi")],
		["a lone surrogate", [0x61, 0xd800]],
		["a NUL before the padding", sdk("pay\u0000alice")],
		["a C1 byte that is not UTF-8", [0x61, 0x85, 0x62]],
		["a character no byte holds", sdk("5 €")],
	])("%s reads as the raw fields, reason arguments", async (_, units) => {
		const surface = await memo(units)
		expect(surface).toMatchObject({ kind: "raw", reason: "arguments", hidden: 0 })
		expect(surface.kind === "raw" && surface.rows).toHaveLength(16)
	})

	test.each([
		["ASCII, its padding dropped", utf8("pay alice"), "pay alice"],
		["UTF-8 with a euro sign", utf8("Total 5 €"), "Total 5 €"],
		["a four-byte emoji", utf8("gm 😀"), "gm 😀"],
		["Latin-1 beside a character past it", utf8("José — café"), "José — café"],
		["the SDK's Latin-1, as today", sdk("José"), "José"],
		["UTF-8 Latin-1 only, as today", utf8("José"), "JosÃ©"],
	])("%s reads as text", async (_, units, text) => {
		expect(await memo(units)).toEqual({
			kind: "decoded",
			fn: "set_memo",
			params: [{ name: "memo", value: { kind: "string", value: text } }],
		})
	})

	test("a string inside an array inside a struct reads the same way, beside the values it sits with", async () => {
		const note = (first: readonly number[]) => read(noteFn, [...padded(first, 4), ...padded(utf8("ok"), 4), new Fr(7n).toString()])
		expect(await note(utf8("€"))).toEqual({
			kind: "decoded",
			fn: "set_note",
			params: [
				{
					name: "note",
					value: {
						kind: "struct",
						fields: [
							{
								name: "labels",
								value: {
									kind: "array",
									items: [
										{ kind: "string", value: "€" },
										{ kind: "string", value: "ok" },
									],
								},
							},
							{ name: "count", value: { kind: "integer", value: "7" } },
						],
					},
				},
			],
		})
		expect(await note(utf8("o​"))).toMatchObject({ kind: "raw", reason: "arguments" })
	})
})
