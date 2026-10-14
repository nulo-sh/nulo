import { describe, expect, test } from "vitest"
import { applyFeePickUpdate, type FeePickUpdate, parseFeePickUpdate, readAppPicks, readSendSlots, type SendPick } from "./fee-picks"

const sendPick = (send: unknown, address: string, side: "private" | "public", pick: SendPick) =>
	applyFeePickUpdate({ app: undefined, send }, { kind: "send", address, side, pick }).send

describe("Send picks", () => {
	test("round trip, slots independent per account and side", () => {
		let raw: unknown
		raw = sendPick(raw, "0xA", "private", { type: "fj" })
		raw = sendPick(raw, "0xA", "public", { type: "fpc", fpc: { id: "s1" } })
		raw = sendPick(raw, "0xB", "private", { type: "private_fpc" })
		expect(readSendSlots(raw, "0xA")).toEqual({ private: { type: "fj" }, public: { type: "fpc", fpc: { id: "s1" } } })
		expect(readSendSlots(raw, "0xB")).toEqual({ private: { type: "private_fpc" } })
		expect(readSendSlots(raw, "0xC")).toEqual({})
	})

	test("stores the semantic key and the preview label; everything else is dropped", () => {
		const update = parseFeePickUpdate({
			kind: "send",
			address: "0xA",
			side: "private",
			pick: { type: "fpc", fpc: { id: "s1", name: "Sponsor", type: 1, address: "0xfpc" }, title: "Sponsor" },
		})
		expect(update && applyFeePickUpdate({ app: undefined, send: undefined }, update).send).toEqual({
			"0xA": { private: { type: "fpc", fpc: { id: "s1", name: "Sponsor" } } },
		})
	})

	test.each([
		["a non-string", 7],
		["an empty string", ""],
		["an oversized string", "x".repeat(65)],
	])("a label that is %s is dropped, the pick is kept", (_, name) => {
		const stored = { "0xA": { private: { type: "fpc", fpc: { id: "s1", name } } } }
		expect(readSendSlots(stored, "0xA")).toEqual({ private: { type: "fpc", fpc: { id: "s1" } } })
	})

	test.each<[string, unknown]>([
		["non-object", "nope"],
		["array", [{ private: { type: "fj" } }]],
		["number", 7],
		["null", null],
		["account entry is an array", { "0xA": [{ type: "fj" }] }],
		["unknown slot only", { "0xA": { sideways: { type: "fj" } } }],
		["missing type", { "0xA": { private: {} } }],
		["unknown type", { "0xA": { private: { type: "embedded" } } }],
		["fpc without an id", { "0xA": { private: { type: "fpc" } } }],
		["non-string fpc id", { "0xA": { private: { type: "fpc", fpc: { id: 12 } } } }],
		["empty fpc id", { "0xA": { private: { type: "fpc", fpc: { id: "" } } } }],
	])("hostile input reads as absent and never throws: %s", (_name, raw) => {
		expect(readSendSlots(raw, "0xA")).toEqual({})
		expect(() => sendPick(raw, "0xA", "public", { type: "fj" })).not.toThrow()
		expect(() => applyFeePickUpdate({ app: raw, send: raw }, { kind: "forgetFpc", fpcId: "s1" })).not.toThrow()
	})

	test("a write does not carry a malformed neighbour forward", () => {
		const raw = sendPick({ "0xBad": 5, "0xOk": { public: { type: "fj" } } }, "0xA", "private", { type: "fj" })
		expect(raw).toEqual({ "0xOk": { public: { type: "fj" } }, "0xA": { private: { type: "fj" } } })
	})

	test("a stored map that is an array is not a map: its entries are never carried forward", () => {
		expect(sendPick([{ private: { type: "fj" } }], "0xA", "public", { type: "fj" })).toEqual({ "0xA": { public: { type: "fj" } } })
	})
})

describe("app picks", () => {
	test("keeps the type, the labels and the sponsor's identity; drops the rest", () => {
		const raw = {
			"0xA": { type: "fpc", title: "Sponsored", subtitle: "sponsored", fpc: { id: "s1", isProtocol: true, address: "0xf" } },
			"0xB": { type: "fj", title: "Public Fee Juice", subtitle: "public", balance: "5" },
		}
		expect(readAppPicks(raw)).toEqual({
			"0xA": { type: "fpc", title: "Sponsored", subtitle: "sponsored", fpc: { id: "s1", isProtocol: true } },
			"0xB": { type: "fj", title: "Public Fee Juice", subtitle: "public" },
		})
	})

	test.each<[string, unknown]>([
		["unknown type", { type: "embedded", title: "x" }],
		["a sponsor without an id", { type: "fpc", title: "Sponsored", fpc: {} }],
		["not an object", "fj"],
	])("a malformed pick reads as absent: %s", (_name, value) => {
		expect(readAppPicks({ "0xA": value, "0xB": { type: "fj" } })).toEqual({ "0xB": { type: "fj" } })
	})

	test("a long sponsor name is cut for the preview, not dropped", () => {
		expect(readAppPicks({ "0xA": { type: "fpc", title: "n".repeat(200), fpc: { id: "s1" } } })["0xA"]?.title).toBe("n".repeat(64))
	})
})

describe("forgetting an FPC", () => {
	test("prunes both maps on every account and side and leaves the rest", () => {
		const send = {
			"0xA": { private: { type: "fpc", fpc: { id: "s1" } }, public: { type: "fj" } },
			"0xB": { private: { type: "fpc", fpc: { id: "s1" } }, public: { type: "fpc", fpc: { id: "s1" } } },
			"0xC": { public: { type: "fpc", fpc: { id: "s2" } } },
		}
		const app = { "0xA": { type: "fpc", fpc: { id: "s1" } }, "0xC": { type: "fpc", fpc: { id: "s2" } } }
		expect(applyFeePickUpdate({ app, send }, { kind: "forgetFpc", fpcId: "s1" })).toEqual({
			app: { "0xC": { type: "fpc", fpc: { id: "s2" } } },
			send: { "0xA": { public: { type: "fj" } }, "0xC": { public: { type: "fpc", fpc: { id: "s2" } } } },
		})
	})
})

describe("the update crossing the RPC", () => {
	test.each<[string, unknown]>([
		["not an object", "app"],
		["an unknown kind", { kind: "wipe", address: "0xA" }],
		["no address", { kind: "app", pick: { type: "fj" } }],
		["an absurd address", { kind: "app", address: "0x".padEnd(200, "0"), pick: { type: "fj" } }],
		["an unknown side", { kind: "send", address: "0xA", side: "both", pick: { type: "fj" } }],
		["a malformed pick", { kind: "send", address: "0xA", side: "public", pick: { type: "embedded" } }],
		["an empty fpc id", { kind: "forgetFpc", fpcId: "" }],
	])("refuses %s", (_name, value) => {
		expect(parseFeePickUpdate(value)).toBeUndefined()
	})

	test("passes a well-formed update of each kind", () => {
		const updates: FeePickUpdate[] = [
			{ kind: "app", address: "0xA", pick: { type: "fj", title: "Public Fee Juice", subtitle: "public" } },
			{ kind: "send", address: "0xA", side: "private", pick: { type: "fpc", fpc: { id: "s1" } } },
			{ kind: "forgetFpc", fpcId: "s1" },
		]
		for (const update of updates) expect(parseFeePickUpdate(update)).toEqual(update)
	})
})
