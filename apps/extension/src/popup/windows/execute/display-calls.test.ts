import { describe, expect, test, vi } from "vitest"
import type { DecodedCall } from "@/wallet/services/execution/client"
import { authwitDisplayCall, decodeCallsOrUnavailable, displayCallsOf, pendingAuthwitDecodes, undecodedAll } from "./display-calls"

const TOKEN = `0x${"c".repeat(64)}`
const base = { networkId: "net-1", accountAddress: "0xacc", network: { id: "net-1", chainId: 1, name: "N" } }

describe("displayCallsOf", () => {
	test("an aztec_sendTx lists every execution call with its fields stringified", () => {
		const op = {
			...base,
			kind: "aztec_sendTx",
			exec: {
				calls: [
					{ to: TOKEN, name: "transfer", selector: "0x11223344", args: ["0x01", { toString: () => "0x02" }, { toString: null }] },
				],
			},
			opts: {},
		}
		// A `toString` that throws yields an empty argument, which the decoder rejects; it never throws here.
		expect(displayCallsOf(op as never)).toEqual([{ to: TOKEN, name: "transfer", selector: "0x11223344", args: ["0x01", "0x02", ""] }])
	})

	test("a createAuthWit call intent is one call; an inner-hash intent and other kinds are none", () => {
		const intent = {
			...base,
			kind: "aztec_createAuthWit",
			messageHashOrIntent: { caller: "0xd", call: { to: TOKEN, name: "transfer", args: [] } },
		}
		expect(displayCallsOf(intent as never)).toEqual([{ to: TOKEN, name: "transfer", selector: undefined, args: [] }])
		const hash = { ...base, kind: "aztec_createAuthWit", messageHashOrIntent: { consumer: TOKEN, innerHash: "0x1" } }
		expect(displayCallsOf(hash as never)).toEqual([])
		expect(displayCallsOf({ ...base, kind: "register_contract", address: TOKEN } as never)).toEqual([])
	})
})

describe("pendingAuthwitDecodes", () => {
	const record = (hash: string) => ({
		consumer: TOKEN,
		caller: "0xc",
		selector: "0x1",
		args: ["0x2"],
		innerHash: "0xi",
		messageHash: hash,
	})

	test("skips settled, in-flight and duplicate records", () => {
		const settled = new Map([["a", { kind: "undecoded" as const, reason: "arguments" as const }]])
		const pending = pendingAuthwitDecodes([record("a"), record("b"), record("b"), record("c")], settled, new Set(["c"]))
		expect(pending.map((r) => r.messageHash)).toEqual(["b"])
		expect(authwitDisplayCall(pending[0]!)).toEqual({ to: TOKEN, selector: "0x1", args: ["0x2"] })
	})

	test("undecodedAll marks every call unavailable", () => {
		expect(undecodedAll(2)).toEqual([
			{ kind: "undecoded", reason: "unavailable" },
			{ kind: "undecoded", reason: "unavailable" },
		])
	})
})

describe("decodeCallsOrUnavailable", () => {
	const calls = [
		{ to: TOKEN, selector: "0x11223344", args: ["0x01"] },
		{ to: TOKEN, selector: "0x55667788", args: [] },
	]

	test("an unreachable decoder reads every call as undecoded for that reason; an answer is passed through", async () => {
		const refused = { decodeCallsForDisplay: async () => Promise.reject(new Error("worker gone")) }
		expect(await decodeCallsOrUnavailable(refused, "net-1", calls)).toEqual(undecodedAll(2))
		const answer: DecodedCall[] = [{ kind: "undecoded", reason: "unknown-contract" }]
		const decoder = { decodeCallsForDisplay: vi.fn(async () => answer) }
		expect(await decodeCallsOrUnavailable(decoder, "net-1", calls)).toBe(answer)
		expect(decoder.decodeCallsForDisplay).toHaveBeenCalledExactlyOnceWith("net-1", calls)
	})
})
