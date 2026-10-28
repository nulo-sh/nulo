import { describe, expect, test } from "vitest"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { trimAddress } from "@/utils/string"
import { vocabularySelector } from "@/utils/token-transfer-vocabulary"
import type { DecodedGrant, DecodedValue } from "@/wallet/services/execution/client"
import type { TokenInfo } from "@/wallet/services/token/client"
import {
	type CallSurface,
	amountLabel,
	authwitLine,
	authwitTitle,
	callSurface,
	nonceValue,
	rawRows,
	readableGrants,
	rowTitle,
	tokenAt,
	uncheckedCallsLine,
	valueText,
	valueTitle,
} from "./call-surface"

const OWNER = `0x${"a".repeat(64)}`
const TO = `0x${"b".repeat(64)}`
const TOKEN = `0x${"c".repeat(64)}`
const field = (n: bigint): string => `0x${n.toString(16).padStart(64, "0")}`
const ctx = { accountAddress: OWNER, noFrom: false }
/** The selector the vocabulary's own signature dispatches on, as an honest call carries it. */
const sel = (fn: string, arity: number): string => vocabularySelector(fn, arity) ?? "0x00000000"
const FOUR = ["from", "to", "amount", "authwit_nonce"]
const USDC = { id: 1, chainId: 1, contract: TOKEN, name: "USD Coin", symbol: "USDC", decimals: 6 } as TokenInfo
const BEL = String.fromCharCode(7)
const RLO = String.fromCharCode(0x202e)

const value = (role: string): DecodedValue =>
	role === "amount"
		? { kind: "integer", value: "0" }
		: role === "authwit_nonce" || role === "_nonce"
			? { kind: "field", value: field(0n) }
			: { kind: "address", value: TO }
/** A token ABI that spells the vocabulary's signature; the values are irrelevant to the reading. */
const abi = (fn: string, roles: string[]) => ({
	kind: "decoded" as const,
	contract: "Token",
	fn,
	params: roles.map((name) => ({ name, value: value(name) })),
})

describe("callSurface", () => {
	test("on a registered token whose call proves the signature, the vocabulary reads by position and names the sender the call omits", () => {
		const transfer = { name: "transfer", to: TOKEN, selector: sel("transfer", 2), args: [TO, field(5n)] }
		expect(callSurface(ctx, transfer, abi("transfer", ["to", "amount"]), true)).toEqual({
			kind: "transfer",
			fn: "transfer",
			to: TO,
			amount: "5",
			sender: { kind: "account", address: OWNER },
		})
		expect(callSurface({ ...ctx, noFrom: true }, transfer, abi("transfer", ["to", "amount"]), true)).toMatchObject({
			sender: { kind: "none" },
		})
		const tip = abi("transfer_in_private", FOUR)
		const tipCall = { name: "transfer_in_private", selector: sel("transfer_in_private", 4), args: [OWNER, TO, field(5n), field(3n)] }
		expect(callSurface(ctx, tipCall, tip, true)).toEqual({
			kind: "transfer",
			fn: "transfer_in_private",
			to: TO,
			amount: "5",
			sender: { kind: "explicit", address: OWNER },
			nonce: "3",
		})
		const mint = { name: "mint_to_public", selector: sel("mint_to_public", 2), args: [TO, field(5n)] }
		expect(callSurface(ctx, mint, abi("mint_to_public", ["to", "amount"]), true)).toEqual({
			kind: "mint",
			fn: "mint_to_public",
			to: TO,
			amount: "5",
		})
	})

	test("the ABI, not the app's name, picks the vocabulary entry", () => {
		const call = { name: "claim_lie", selector: sel("transfer", 2), args: [TO, field(5n)] }
		expect(callSurface(ctx, call, abi("transfer", ["to", "amount"]), true)).toMatchObject({ kind: "transfer", to: TO, amount: "5" })
	})

	test("the vocabulary needs the call's own selector to be its signature's: another function's, none, or a non-string reads decoded", () => {
		const args = [OWNER, TO, field(5n), field(0n)]
		const reads = (fn: string, selector: unknown) => callSurface(ctx, { name: fn, selector, args }, abi(fn, FOUR), true).kind
		// transfer_public_to_commitment's and burn_public's selectors on the standard Token, under a
		// decode a searched interface could produce for them.
		expect(reads("transfer_public_to_public", "0xd427610c")).toBe("decoded")
		expect(reads("transfer_in_public", "0xc611b0c5")).toBe("decoded")
		expect(reads("transfer_in_public", undefined)).toBe("decoded")
		expect(reads("transfer_in_public", Number(sel("transfer_in_public", 4)))).toBe("decoded")
		expect(reads("transfer_in_public", [sel("transfer_in_public", 4)])).toBe("decoded")
		expect(reads("transfer_in_public", sel("transfer_in_public", 4))).toBe("transfer")
	})

	test("without corroboration the vocabulary never applies: unregistered contract, swapped roles, a wrong kind, or no decode yet", () => {
		const call = { name: "transfer", to: TOKEN, selector: sel("transfer", 2), args: [TO, field(5n)] }
		expect(callSurface(ctx, call, abi("transfer", ["to", "amount"]), false)).toMatchObject({ kind: "decoded", fn: "transfer" })
		const swapped = abi("transfer", ["amount", "to"])
		expect(callSurface(ctx, { ...call, args: [field(5n), TO] }, swapped, true)).toEqual({
			kind: "decoded",
			fn: "transfer",
			params: swapped.params,
			labels: "unchecked",
		})
		const wrongKind = {
			...abi("transfer", ["to", "amount"]),
			params: [
				{ name: "to", value: value("to") },
				{ name: "amount", value: { kind: "field" as const, value: field(5n) } },
			],
		}
		expect(callSurface(ctx, call, wrongKind, true)).toMatchObject({ kind: "decoded" })
		expect(callSurface(ctx, call, undefined, true)).toEqual({ kind: "pending" })
		expect(callSurface(ctx, call, { kind: "undecoded", reason: "unknown-contract" }, true)).toMatchObject({
			kind: "raw",
			reason: "unknown-contract",
		})
	})

	test("a registered token's call that claims the vocabulary but fails it marks its labels as the contract's", () => {
		const args = [TO, OWNER, field(5n), field(0n)]
		const p2p = sel("transfer_private_to_private", 4)
		const marked = (fn: string, roles: string[], selector: string, tokenKnown = true) =>
			callSurface(ctx, { name: fn, to: TOKEN, selector, args }, abi(fn, roles), tokenKnown)
		const reversed = ["to", "from", "amount", "_nonce"]
		expect(marked("transfer_private_to_private", reversed, p2p)).toMatchObject({ kind: "decoded", labels: "unchecked" })
		expect(marked("claim_x", reversed, p2p)).toMatchObject({ kind: "decoded", fn: "claim_x", labels: "unchecked" })
		expect(marked("transfer_private_to_private", reversed, "0x11223344")).toMatchObject({ kind: "decoded", labels: "unchecked" })
		expect(marked("transfer_private_to_public", ["to", "amount", "memo"], "0x11223344")).toMatchObject({ labels: "unchecked" })
		expect(marked("transfer_private_to_private", ["from", "to", "amount", "_nonce"], p2p)).toMatchObject({ kind: "transfer" })
		expect(marked("transfer_private_to_private", reversed, p2p, false)).not.toHaveProperty("labels")
		expect(marked("claim_x", reversed, "0x11223344")).toEqual({
			kind: "decoded",
			fn: "claim_x",
			params: abi("claim_x", reversed).params,
		})
	})

	test("a hidden msg_sender or a missing caller context falls through to the decode instead of claiming a sender", () => {
		const two = abi("transfer", ["to", "amount"])
		const call = { name: "transfer", selector: sel("transfer", 2), args: [TO, field(5n)] }
		expect(callSurface(ctx, { ...call, hideMsgSender: true }, two, true)).toEqual({
			kind: "decoded",
			fn: "transfer",
			params: two.params,
		})
		expect(callSurface(undefined, call, two, true)).toMatchObject({ kind: "decoded" })
		const tip = abi("transfer_in_private", FOUR)
		const tipCall = { name: "transfer_in_private", selector: sel("transfer_in_private", 4), args: [OWNER, TO, field(5n), field(0n)] }
		expect(callSurface(undefined, tipCall, tip, true)).toMatchObject({
			kind: "transfer",
			sender: { kind: "explicit", address: OWNER },
		})
	})

	test("raw fields carry the reason, trim, and read small values as decimals; the row cap is the caller's", () => {
		const args = [TO, field(500n)]
		expect(callSurface(ctx, { name: "claim", args }, { kind: "undecoded", reason: "arguments" })).toEqual({
			kind: "raw",
			reason: "arguments",
			rows: [
				{ kind: "field", short: trimAddress(TO, 10, 6), full: TO, decimal: undefined },
				{ kind: "field", short: trimAddress(field(500n), 10, 6), full: field(500n), decimal: "500" },
			],
			hidden: 0,
		})
		const many = Array.from({ length: 40 }, (_, i) => field(BigInt(i)))
		expect(callSurface(ctx, { args: many }, { kind: "undecoded", reason: "arguments" })).toMatchObject({ hidden: 8 })
		expect(callSurface(ctx, { args: many }, { kind: "undecoded", reason: "arguments" }, false, Number.POSITIVE_INFINITY)).toMatchObject(
			{ hidden: 0 },
		)
	})

	test("rowTitle prefers the ABI's name once decoded, sanitizes it, and keeps protocol labels on their contract", () => {
		const call = { name: "claim_lie", to: TO, selector: "0x11223344", args: [] }
		expect(rowTitle(call, { kind: "pending" })).toBe(rowTitle({ name: "claim_lie", to: TO, args: [] }, { kind: "pending" }))
		expect(rowTitle(call, { kind: "decoded", fn: "claim_private", params: [] })).not.toContain("lie")
		expect(rowTitle(call, { kind: "decoded", fn: `claim${RLO}_private`, params: [] })).not.toContain(RLO)
		expect(rowTitle(call, { kind: "decoded", fn: "x".repeat(200), params: [] }).length).toBeLessThan(80)
		// A third-party `claim` is not the fee-juice claim, decoded or app-named.
		expect(rowTitle({ name: "claim", to: TO, args: [] }, { kind: "pending" })).toBe("Claim")
		expect(rowTitle(call, { kind: "decoded", fn: "claim", params: [] })).toBe("Claim")
	})

	test("a transfer row is titled by the function its selector runs, whatever the app labels it", () => {
		const args = [OWNER, TO, field(5n), field(0n)]
		const selector = sel("transfer_in_public", 4)
		for (const name of ["transfer_in_private", undefined]) {
			const call = { name, to: TOKEN, selector, args }
			const surface = callSurface(ctx, call, abi("transfer_in_public", FOUR), true)
			expect(surface.kind).toBe("transfer")
			expect(rowTitle(call, surface)).toBe("Transfer (public)")
		}
	})
})

describe("rawRows, tokenAt, amountLabel, valueText, valueTitle", () => {
	test("rows cap at 32 by default and count the rest; text is sanitized; objects without toString are opaque", () => {
		const { rows, hidden } = rawRows([...Array.from({ length: 33 }, (_, i) => field(BigInt(i))), "x"])
		expect(rows).toHaveLength(32)
		expect(hidden).toBe(2)
		expect(rawRows([`a${RLO}b`, {}]).rows).toEqual([{ kind: "text", value: "ab", full: "ab" }, { kind: "opaque" }])
	})

	test("tokenAt matches contract and chain case-blind", () => {
		expect(tokenAt([USDC], 1, TOKEN.toUpperCase().replace("0X", "0x"))).toBe(USDC)
		expect(tokenAt([USDC], 2, TOKEN)).toBeUndefined()
		expect(tokenAt(undefined, 1, TOKEN)).toBeUndefined()
	})

	test("an amount carries the known token's units and symbol; an unknown contract or an empty symbol keeps the raw integer", () => {
		expect(amountLabel([USDC], 1, TOKEN, "5000000")).toEqual({ text: "5", symbol: "USDC" })
		expect(amountLabel([USDC], 1, TOKEN, "1500000")).toEqual({ text: "1.5", symbol: "USDC" })
		expect(amountLabel([USDC], 2, TOKEN, "5000000")).toEqual({ text: "5000000" })
		expect(amountLabel(undefined, 1, TOKEN, "7")).toEqual({ text: "7" })
		expect(amountLabel([{ ...USDC, symbol: BEL }], 1, TOKEN, "5000000")).toEqual({ text: "5000000" })
	})

	test("values read on one line; a long list is summarized inline and complete in the title", () => {
		expect(valueText({ kind: "integer", value: "5" })).toBe("5")
		expect(valueText({ kind: "boolean", value: false })).toBe("false")
		expect(valueText({ kind: "field", value: TO })).toBe(trimAddress(TO, 10, 6))
		expect(valueText({ kind: "address", value: TO })).toBe(trimAddress(TO))
		expect(valueText({ kind: "string", value: `hi${BEL}` })).toBe("hi")
		expect(valueText({ kind: "none" })).toBe("none")
		const ten: DecodedValue = {
			kind: "array",
			items: Array.from({ length: 10 }, (_, i) => ({ kind: "integer", value: String(i + 1) })),
		}
		expect(valueText(ten)).toBe("[1, 2, 3, 4, 5, 6, 7, 8, +2 more]")
		expect(valueTitle(ten)).toBe("[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]")
		const two: DecodedValue = { kind: "array", items: [{ kind: "integer", value: "1" }] }
		expect(valueTitle(two)).toBeUndefined()
		expect(valueTitle({ kind: "field", value: TO })).toBe(TO)
		expect(valueText({ kind: "struct", fields: [{ name: "a", value: { kind: "boolean", value: true } }] })).toBe("{ a: true }")
		expect(valueTitle({ kind: "struct", fields: [{ name: "list", value: ten }] })).toContain("10]")
	})
})

describe("a wire alias cannot outrank the decoded name; hover text is complete", () => {
	test("a `method` alias on the call is ignored: the vocabulary entry is the decoded function's", () => {
		const call = {
			name: "transfer",
			method: "mint_to_public",
			to: TOKEN,
			selector: sel("transfer", 2),
			args: [TO, field(5n)],
		} as Parameters<typeof callSurface>[1]
		expect(callSurface(ctx, call, abi("transfer", ["to", "amount"]), true)).toEqual({
			kind: "transfer",
			fn: "transfer",
			to: TO,
			amount: "5",
			sender: { kind: "account", address: OWNER },
		})
	})

	test("full mode prints whole addresses, fields and strings, so a title never collapses distinct values", () => {
		const other = `0x${"d".repeat(64)}`
		const pair: DecodedValue = {
			kind: "array",
			items: [
				{ kind: "address", value: TO },
				{ kind: "address", value: other },
			],
		}
		expect(valueText(pair)).toBe(`[${trimAddress(TO)}, ${trimAddress(other)}]`)
		expect(valueTitle(pair)).toBe(`[${TO}, ${other}]`)
		const nested: DecodedValue = { kind: "struct", fields: [{ name: "secret", value: { kind: "field", value: TO } }] }
		expect(valueTitle(nested)).toBe(`{ secret: ${TO} }`)
		const long = "x".repeat(100)
		expect(valueText({ kind: "string", value: long }).length).toBeLessThan(100)
		expect(valueTitle({ kind: "string", value: long })).toBe(long)
	})
})

describe("the aztec-standards Token names its nonce `_nonce`", () => {
	const STANDARD = [
		"transfer_private_to_private",
		"transfer_public_to_public",
		"transfer_private_to_public",
		"transfer_public_to_private",
	]
	const ROLES = ["from", "to", "amount", "_nonce"]
	const call = (fn: string, nonce: bigint, extra: Record<string, unknown> = {}) => ({
		name: fn,
		to: TOKEN,
		selector: sel(fn, 4),
		args: [OWNER, TO, field(5n), field(nonce)],
		...extra,
	})

	test.each(STANDARD)("%s reads as the transfer row from its explicit sender; a zero nonce is no row, another is", (fn) => {
		expect(callSurface(ctx, call(fn, 0n), abi(fn, ROLES), true)).toEqual({
			kind: "transfer",
			fn,
			to: TO,
			amount: "5",
			sender: { kind: "explicit", address: OWNER },
		})
		expect(callSurface(ctx, call(fn, 7n), abi(fn, ROLES), true)).toMatchObject({ kind: "transfer", nonce: "7" })
	})

	test("a hidden msg_sender keeps the explicit from", () => {
		const fn = "transfer_public_to_public"
		expect(callSurface(ctx, call(fn, 0n, { hideMsgSender: true }), abi(fn, ROLES), true)).toMatchObject({
			kind: "transfer",
			sender: { kind: "explicit", address: OWNER },
		})
	})

	test("the alias fills the nonce role only: anything else about the call keeps the decoded rows", () => {
		const fn = "transfer_public_to_public"
		const reads = (c: Parameters<typeof callSurface>[1], decoded: ReturnType<typeof abi>, tokenKnown = true) =>
			callSurface(ctx, c, decoded, tokenKnown).kind
		expect(reads(call(fn, 0n), abi(fn, ROLES), false)).toBe("decoded")
		expect(reads(call(fn, 0n), abi(fn, ["from", "to", "_nonce", "amount"]))).toBe("decoded")
		const integerNonce = {
			...abi(fn, ROLES),
			params: abi(fn, ROLES).params.map((p) => (p.name === "_nonce" ? { ...p, value: { kind: "integer" as const, value: "0" } } : p)),
		}
		expect(reads(call(fn, 0n), integerNonce)).toBe("decoded")
		expect(reads(call(fn, 0n), abi(fn, ["from", "to", "amount", "nonce"]))).toBe("decoded")
		// An address under the nonce's name fails on the name alone: the alias never fills `to`.
		const nonceAsRecipient = {
			...abi("transfer", ["to", "amount"]),
			params: [{ name: "_nonce", value: value("to") }, ...abi("transfer", ["amount"]).params],
		}
		expect(reads({ name: "transfer", selector: sel("transfer", 2), args: [TO, field(5n)] }, nonceAsRecipient)).toBe("decoded")
		const burn = { name: "burn_public", to: TOKEN, selector: "0xc611b0c5", args: [OWNER, field(5n), field(0n)] }
		expect(reads(burn, abi("burn_public", ["from", "amount", "_nonce"]))).toBe("decoded")
		const withCommitment = { ...call(fn, 0n), name: "transfer_private_to_public_with_commitment", selector: "0x398c27b4" }
		expect(reads(withCommitment, abi("transfer_private_to_public_with_commitment", ROLES))).toBe("decoded")
	})
})

describe("nonceValue", () => {
	test("a nonce below 2^64 reads as its decimal, anything larger as the field's whole hex, trimmed in the row", () => {
		const two64 = 1n << 64n
		expect(nonceValue("9")).toEqual({ kind: "integer", value: "9" })
		expect(nonceValue((two64 - 1n).toString())).toEqual({ kind: "integer", value: (two64 - 1n).toString() })
		expect(nonceValue(two64.toString())).toEqual({ kind: "field", value: field(two64) })
		const largest = nonceValue((Fr.MODULUS - 1n).toString())
		expect(valueText(largest)).toBe(trimAddress(field(Fr.MODULUS - 1n), 10, 6))
		expect(valueTitle(largest)).toBe(field(Fr.MODULUS - 1n))
	})

	test("two nonces that trim alike read the same in the row and differ on hover", () => {
		const a = nonceValue(BigInt(`0x0f3c7a91${"1".repeat(50)}c07e2a`).toString())
		const b = nonceValue(BigInt(`0x0f3c7a91${"2".repeat(50)}c07e2a`).toString())
		expect(valueText(a)).toBe("0x0f3c7a91..c07e2a")
		expect(valueText(b)).toBe(valueText(a))
		expect(valueTitle(b)).not.toBe(valueTitle(a))
	})
})

describe("rowTitle, authwitTitle and authwitLine: the wallet's words only on what it read", () => {
	const transfer = {
		kind: "transfer" as const,
		fn: "transfer_public_to_public",
		to: TO,
		amount: "5",
		sender: { kind: "explicit" as const, address: OWNER },
	}
	const decoded = (fn: string) => ({ kind: "decoded" as const, fn, params: [] })

	test("a transfer or mint label names only a call the wallet read as one; the same name read otherwise is its own", () => {
		const call = { name: "transfer_public_to_public", to: TOKEN, args: [] }
		expect(rowTitle(call, transfer)).toBe("Transfer (public)")
		expect(rowTitle(call, decoded("transfer_public_to_public"))).toBe("Transfer Public To Public")
		expect(rowTitle(call, { kind: "pending" })).toBe("Transfer Public To Public")
		expect(rowTitle({ name: "mint_to_private", to: TOKEN }, { kind: "raw", reason: "unknown-contract", rows: [], hidden: 0 })).toBe(
			"Mint To Private",
		)
		expect(rowTitle(call, { kind: "mint", fn: "mint_to_private", to: TO, amount: "5" })).toBe("Mint (private)")
	})

	test("every other name reads by its curated label on its contract, else as its contract spells it", () => {
		for (const [name, surface, title] of [
			["shield", decoded("shield"), "Shield"],
			["claim", decoded("claim"), "Claim"],
			["exit_to_l1", decoded("exit_to_l1"), "Exit To L1"],
			["checkpoint", { kind: "pending" as const }, "Checkpoint"],
		] as const) {
			expect(rowTitle({ name, to: TO, args: [] }, surface)).toBe(title)
		}
	})

	test("an authorization is titled by its decoded name under the same rule, by its selector until then", () => {
		expect(authwitTitle("0x1234abcd", TOKEN, transfer)).toBe("Transfer (public)")
		expect(authwitTitle("0x1234abcd", TOKEN, decoded("transfer_public_to_public"))).toBe("Transfer Public To Public")
		expect(authwitTitle("0x1234abcd", TOKEN, decoded("withdraw_for"))).toBe("Withdraw For")
		expect(authwitTitle(`0x1234${RLO}abcd`, TOKEN, { kind: "pending" })).toBe("0x1234abcd")
	})

	test("an authorization reads as moving tokens only when the wallet read a transfer from a named sender", () => {
		expect(authwitLine(transfer, "Transfer (public)")).toEqual({ kind: "move", amount: "5", from: OWNER, to: TO })
		const others = [
			{ ...transfer, sender: { kind: "account" as const, address: OWNER } },
			{ ...transfer, sender: { kind: "none" as const } },
			{ kind: "mint" as const, fn: "mint_to_private", to: TO, amount: "5" },
			decoded("withdraw_for"),
			{ kind: "pending" as const },
		]
		for (const surface of others) expect(authwitLine(surface, "F")).toEqual({ kind: "call", fn: "F" })
	})
})

describe("readableGrants", () => {
	const TOKEN = `0x${"2f".repeat(32)}`
	const grantWith = (...params: { name: string; value: DecodedValue }[]): DecodedGrant => ({
		kind: "decoded",
		call: { to: TOKEN, selector: "0x12345678", args: [] },
		decoded: { kind: "decoded", contract: "Registry", fn: "set", params },
	})
	const memo = (value: string) => grantWith({ name: "memo", value: { kind: "string", value } })

	test("a grant whose every value prints whole is read as decoded", () => {
		const shown = memo("pay alice 25")
		expect(readableGrants([shown], 1)).toEqual([shown])
	})

	test("a string the whole print would alter is unreadable: a control or direction character, a lone surrogate, a cut", () => {
		const nested = grantWith({ name: "notes", value: { kind: "array", items: [{ kind: "string", value: "pay\u0000alice" }] } })
		for (const grant of [
			memo("pay\u0000alice"),
			memo(`ab${String.fromCharCode(0x202e)}cd`),
			memo("\ud800"),
			memo("x".repeat(4097)),
			nested,
		]) {
			expect(readableGrants([grant], 1)).toEqual([{ kind: "undecoded", reason: "arguments" }])
		}
	})

	test("a grant the batch left out is unavailable, so a short batch cannot read as complete", () => {
		const shown = memo("ok")
		expect(readableGrants([shown], 2)).toEqual([shown, { kind: "undecoded", reason: "unavailable" }])
	})
})

describe("uncheckedCallsLine", () => {
	const read: CallSurface = { kind: "transfer", fn: "transfer", to: TO, amount: "5", sender: { kind: "account", address: OWNER } }
	const minted: CallSurface = { kind: "mint", fn: "mint_to_public", to: TO, amount: "5" }
	const named: CallSurface = { kind: "decoded", fn: "exit_to_l1", params: [] }
	const claimed: CallSurface = { kind: "decoded", fn: "transfer", params: [], labels: "unchecked" }
	const pending: CallSurface = { kind: "pending" }
	const raw: CallSurface = { kind: "raw", reason: "unknown-contract", rows: [], hidden: 0 }

	test.each([
		["no call", [], undefined],
		["every call read", [read, minted], undefined],
		["calls still being read or unreadable", [pending, raw], undefined],
		[
			"a one-call transaction",
			[named],
			"Nulo can only check transfers and mints of tokens in your list, so it can't say what this call does.",
		],
		[
			"every call in the list",
			[named, claimed],
			"Nulo can only check transfers and mints of tokens in your list, so it can't say what these calls do.",
		],
		[
			"one call among several",
			[read, raw, named],
			"Nulo can only check transfers and mints of tokens in your list, so it can't say what call 3 does.",
		],
		[
			"two of three",
			[named, minted, claimed],
			"Nulo can only check transfers and mints of tokens in your list, so it can't say what calls 1 and 3 do.",
		],
		[
			"three of four",
			[named, read, named, claimed],
			"Nulo can only check transfers and mints of tokens in your list, so it can't say what calls 1, 3 and 4 do.",
		],
	] as const)("%s", (_, surfaces, line) => {
		expect(uncheckedCallsLine(surfaces)).toBe(line)
	})
})
