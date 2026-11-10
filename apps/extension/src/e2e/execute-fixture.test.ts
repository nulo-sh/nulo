import { describe, expect, test } from "vitest"
import { isValidAztecAddress } from "@/utils/aztec-address"
import type { Account } from "@/wallet/services/account/client"
import type { DecodedValue } from "@/wallet/services/execution/client"
import type { Network } from "@/wallet/services/network/client"
import { APP_FPC, EXECUTE_FIXTURE_MARKER, EXECUTE_FIXTURES, executeFixture } from "./execute-fixture"

const ACCOUNT = { name: "Main", address: "0x0a1b2c0000000000000000000000000000000000000000000000000000009c2d", chainId: 1 } as Account
const NETWORK = { id: "net-1", chainId: 1, name: "N" } as Network

type WireCall = { to: string; args: string[] }
const callsOf = (name: string) => {
	const fixture = executeFixture(name, ACCOUNT, NETWORK)
	if (!fixture) throw new Error(`no fixture ${name}`)
	return { fixture, calls: (fixture.operations[0] as unknown as { exec: { calls: WireCall[] } }).exec.calls }
}

/** One row per value, as the value tree draws it. */
const rows = (v: DecodedValue): number =>
	1 +
	(v.kind === "array"
		? v.items.reduce((n, i) => n + rows(i), 0)
		: v.kind === "struct"
			? v.fields.reduce((n, f) => n + rows(f.value), 0)
			: 0)
const deepest = (v: DecodedValue, depth = 0): number =>
	v.kind === "array"
		? Math.max(depth, ...v.items.map((i) => deepest(i, depth + 1)))
		: v.kind === "struct"
			? Math.max(depth, ...v.fields.map((f) => deepest(f.value, depth + 1)))
			: depth
const addresses = (v: DecodedValue): string[] =>
	v.kind === "address"
		? [v.value]
		: v.kind === "array"
			? v.items.flatMap(addresses)
			: v.kind === "struct"
				? v.fields.flatMap((f) => addresses(f.value))
				: []

describe("the execute window's fixtures", () => {
	test.each(EXECUTE_FIXTURES)("%s is wire-shaped, one decode per call, every address valid", (name) => {
		const { fixture, calls } = callsOf(name)
		const decodes = fixture.decodedCalls[0]
		expect(decodes).toHaveLength(calls.length)
		const authwits = fixture.feeEstimates[0].discoveredAuthwits ?? []
		const seen = [APP_FPC, ...authwits.flatMap((a) => [a.consumer, a.caller])]
		for (const [j, call] of calls.entries()) {
			expect(call.args.every((a) => /^0x[0-9a-f]{64}$/.test(a))).toBe(true)
			seen.push(call.to)
			const decode = decodes[j]
			if (decode.kind !== "decoded") continue
			seen.push(...decode.params.flatMap((p) => addresses(p.value)))
		}
		expect(seen.filter((a) => !isValidAztecAddress(a))).toEqual([])
		for (const a of authwits) expect(fixture.decodedAuthwits.has(a.messageHash)).toBe(true)
		expect(fixture.operations.every((op) => (op as { executionMode?: string }).executionMode !== "default_entrypoint")).toBe(true)
		expect(fixture.dapp.description).toBe(EXECUTE_FIXTURE_MARKER)
	})

	test("the hostile shapes reach the decoder's bounds: 32,769 rows from zero fields, a leaf at depth 32", () => {
		const wide = callsOf("wide")
		const items = wide.fixture.decodedCalls[0][0]
		expect(wide.calls[0].args).toEqual([])
		expect(items.kind === "decoded" && rows(items.params[0].value)).toBe(32_769)
		const depth = callsOf("depth").fixture.decodedCalls[0][0]
		expect(depth.kind === "decoded" && deepest(depth.params[0].value)).toBe(32)
	})

	test("a name no fixture has shows nothing", () => {
		expect(executeFixture("constructor", ACCOUNT, NETWORK)).toBeUndefined()
	})
})
