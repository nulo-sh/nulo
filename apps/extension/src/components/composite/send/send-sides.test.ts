import { describe, expect, test } from "vitest"
import { canSwitchReceiver, canSwitchSender, forcedSide, openingSendSide, sideBalanceText } from "./send-sides"

describe("openingSendSide", () => {
	test.each([
		["public only", "public", { publicBalance: "1000", privateBalance: "0" }],
		["public only, private side absent", "public", { publicBalance: "1000" }],
		["private only", "private", { publicBalance: "0", privateBalance: "1000" }],
		["both sides", "private", { publicBalance: "1000", privateBalance: "1" }],
		["neither side", "private", { publicBalance: "0", privateBalance: "0" }],
		["no row", "private", undefined],
		["a malformed public side", "private", { publicBalance: "1e3", privateBalance: "0" }],
		["a malformed private side", "private", { publicBalance: "1000", privateBalance: "-1" }],
	])("%s opens on %s", (_, side, row) => {
		expect(openingSendSide(row)).toBe(side)
	})
})

// Every set of the four capability flags, as [private transfers, public transfers, private
// balances, public balances] → [forced side, origin switches, destination switches]. The origin
// and the forced side read transfers, the destination balances; with neither transfer, private.
const T = true
const F = false
describe("forcedSide, canSwitchSender, canSwitchReceiver", () => {
	test.each([
		[F, F, F, F, "private", F, F],
		[F, F, F, T, "private", F, F],
		[F, F, T, F, "private", F, F],
		[F, F, T, T, "private", F, T],
		[F, T, F, F, "public", F, F],
		[F, T, F, T, "public", F, F],
		[F, T, T, F, "public", F, F],
		[F, T, T, T, "public", F, T],
		[T, F, F, F, "private", F, F],
		[T, F, F, T, "private", F, F],
		[T, F, T, F, "private", F, F],
		[T, F, T, T, "private", F, T],
		[T, T, F, F, null, T, F],
		[T, T, F, T, null, T, F],
		[T, T, T, F, null, T, F],
		[T, T, T, T, null, T, T],
	])("transfers %s/%s, balances %s/%s → forced %s, origin %s, destination %s", (privT, pubT, privB, pubB, forced, sender, receiver) => {
		const token = { hasPrivateTransfers: privT, hasPublicTransfers: pubT, hasPrivateBalances: privB, hasPublicBalances: pubB }
		expect(forcedSide(token)).toBe(forced)
		expect(canSwitchSender(token)).toBe(sender)
		expect(canSwitchReceiver(token)).toBe(receiver)
	})

	test("absent flags read as no capability", () => {
		expect(forcedSide({})).toBe("private")
		expect(canSwitchSender({})).toBe(false)
		expect(canSwitchReceiver({})).toBe(false)
	})
})

describe("sideBalanceText", () => {
	test("the balance as Send prints it, grouped and cut at eight places, never rounded up", () => {
		expect(sideBalanceText("1234567891234567891", 18, "TST")).toBe("1.23456789 TST")
		expect(sideBalanceText("123456789000000", 6, "USDC")).toBe("123,456,789 USDC")
	})

	test("nothing for a row or decimals it cannot read", () => {
		expect(sideBalanceText(null, 6, "USDC")).toBeNull()
		expect(sideBalanceText("1", undefined, "USDC")).toBeNull()
		expect(sideBalanceText("x", 6, "USDC")).toBeNull()
	})
})
