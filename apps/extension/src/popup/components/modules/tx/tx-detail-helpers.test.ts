import { describe, expect, test } from "vitest"
import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { OriginType } from "@/wallet/services/transaction/client"
import { PRIVATE_FPC_ADDRESS } from "@/wallet/services/fpc/private-fpc-address"
import { buildGasBreakdown, computeFeeSavings, describeFeePaymentMethod } from "./tx-detail-helpers"

describe("tx-detail-helpers/buildGasBreakdown", () => {
	test("returns null when gas details are missing", () => {
		expect(buildGasBreakdown(null)).toBeNull()
		expect(buildGasBreakdown(undefined)).toBeNull()
	})

	test("the L2 and DA lines alone, whatever the teardown limits: they add up to the fee limit", () => {
		// 1_000 · 1e12 + 500 · 2e12 = 2e15, the fee limit; the teardown sits inside both limits.
		const result = buildGasBreakdown({
			feePerL2Gas: 1_000_000_000_000n,
			feePerDaGas: 2_000_000_000_000n,
			l2GasLimit: 1_000,
			daGasLimit: 500,
			teardownL2GasLimit: 300,
			teardownDaGasLimit: 100,
		})
		expect(result).toEqual({ l2Cost: 10n ** 15n, daCost: 10n ** 15n })
	})
})

describe("tx-detail-helpers/computeFeeSavings", () => {
	test("returns null when either fee is missing", () => {
		expect(computeFeeSavings(undefined, 100n)).toBeNull()
		expect(computeFeeSavings(100n, undefined)).toBeNull()
	})

	test("returns null when estimated fee is zero", () => {
		expect(computeFeeSavings(100n, 0n)).toBeNull()
	})

	test("returns null when actual >= estimated", () => {
		expect(computeFeeSavings(100n, 100n)).toBeNull()
		expect(computeFeeSavings(150n, 100n)).toBeNull()
	})

	test("returns formatted percentage savings when actual < estimated", () => {
		expect(computeFeeSavings(50n, 100n)).toBe("50% less than estimate")
		expect(computeFeeSavings(80n, 100n)).toBe("20% less than estimate")
	})

	test("accepts string inputs", () => {
		expect(computeFeeSavings("50", "100")).toBe("50% less than estimate")
	})
})

describe("tx-detail-helpers/describeFeePaymentMethod", () => {
	/** A recorded call. Fee calls carry no arguments, so an app's look-alike differs from the
	 *  wallet's by its address alone. */
	const call = (contract: string, method: string, args: unknown[] = []) => ({ contract, method, args })
	const field = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`
	const SPONSOR = `0x${"1a".repeat(32)}`
	const APP = `0x${"1c".repeat(32)}`
	const APP_CALL = call(APP, "transfer_in_private", [`0x${"15".repeat(32)}`, `0x${"16".repeat(32)}`, field(5n), field(0n)])

	test("null tx returns null", () => {
		expect(describeFeePaymentMethod(null)).toBeNull()
	})

	test("FeeJuice → 'Public Fee Juice'", () => {
		expect(describeFeePaymentMethod({ feePaymentMethod: AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE })).toStrictEqual({
			method: "Public Fee Juice",
		})
	})

	test("FeeJuiceWithClaim → 'Public Fee Juice (with claim)'", () => {
		expect(describeFeePaymentMethod({ feePaymentMethod: AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM })).toStrictEqual({
			method: "Public Fee Juice (with claim)",
		})
	})

	test("External + sponsor_unconditionally → 'Sponsored'", () => {
		expect(
			describeFeePaymentMethod({
				feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
				calls: [call(SPONSOR, "sponsor_unconditionally")],
			}),
		).toStrictEqual({ method: "Sponsored" })
	})

	test("an app's own `pay_fee` is the app's fee: a no-`from` call reads 'Set by …', and with no origin 'External FPC'", () => {
		const noFrom = {
			feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
			calls: [call(APP, "pay_fee")],
			origin: { type: OriginType.DAPP, name: "Foo" },
		}
		expect(describeFeePaymentMethod(noFrom)).toStrictEqual({ method: "Set by Foo" })
		expect(describeFeePaymentMethod({ ...noFrom, origin: undefined })).toStrictEqual({ method: "External FPC" })
	})

	test("the person's pick is the first fee call, so a fee call after it changes nothing", () => {
		const dappSend = (calls: ReturnType<typeof call>[]) => ({
			feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
			calls,
			origin: { type: OriginType.DAPP, name: "Foo" },
		})
		expect(
			describeFeePaymentMethod(dappSend([call(PRIVATE_FPC_ADDRESS, "pay_fee"), APP_CALL, call(APP, "sponsor_unconditionally")])),
		).toStrictEqual({ method: "Private Fee Juice" })
		expect(
			describeFeePaymentMethod(dappSend([call(SPONSOR, "sponsor_unconditionally"), APP_CALL, call(PRIVATE_FPC_ADDRESS, "pay_fee")])),
		).toStrictEqual({ method: "Sponsored" })
	})

	test("External + DAPP origin → 'Set by {name}'", () => {
		expect(
			describeFeePaymentMethod({
				feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
				calls: [],
				origin: { type: OriginType.DAPP, name: "Foo" },
			}),
		).toStrictEqual({ method: "Set by Foo" })
	})

	test("External + DAPP origin without name → 'Set by the app'", () => {
		expect(
			describeFeePaymentMethod({
				feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
				calls: [],
				origin: { type: OriginType.DAPP },
			}),
		).toStrictEqual({ method: "Set by the app" })
	})

	/** A popup Send as `recordTransfer` writes it: its transfer call alone, and the FPC it paid through
	 *  unless that is Nulo's sponsor. */
	const popupSend = (feeSpender?: string) => ({
		feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
		calls: [{ method: "transfer_private_to_private" }],
		origin: { type: OriginType.UI },
		feeSpender,
	})

	test("a popup Send names the method it was paid with: Private Fee Juice, Nulo's sponsor, a sponsor added by hand", () => {
		expect(describeFeePaymentMethod(popupSend(PRIVATE_FPC_ADDRESS))).toStrictEqual({ method: "Private Fee Juice" })
		expect(describeFeePaymentMethod(popupSend())).toStrictEqual({ method: "Sponsored" })
		expect(describeFeePaymentMethod(popupSend(SPONSOR))).toStrictEqual({ method: "Sponsored" })
	})

	test("a popup Send that records the person's pick reads the same as one that does not", () => {
		expect(describeFeePaymentMethod({ ...popupSend(PRIVATE_FPC_ADDRESS), feeChoice: "wallet" })).toStrictEqual({
			method: "Private Fee Juice",
		})
		expect(describeFeePaymentMethod({ ...popupSend(), feeChoice: "wallet" })).toStrictEqual({ method: "Sponsored" })
		expect(describeFeePaymentMethod({ ...popupSend(SPONSOR), feeChoice: "wallet" })).toStrictEqual({ method: "Sponsored" })
	})

	test("a recorded fee call outranks the spender: the auth registry's own send, which keeps its pay_fee call", () => {
		const revoke = [call(PRIVATE_FPC_ADDRESS, "pay_fee"), call(field(1n), "set_authorized", [field(0xa17n), false])]
		expect(describeFeePaymentMethod({ ...popupSend(), calls: revoke })).toStrictEqual({ method: "Private Fee Juice" })
	})

	test("an app's send stays 'Set by …' and a row of no known origin stays 'External FPC', whatever its spender", () => {
		expect(
			describeFeePaymentMethod({ ...popupSend(PRIVATE_FPC_ADDRESS), origin: { type: OriginType.DAPP, name: "Foo" } }),
		).toStrictEqual({ method: "Set by Foo" })
		expect(describeFeePaymentMethod({ ...popupSend(PRIVATE_FPC_ADDRESS), origin: undefined })).toStrictEqual({ method: "External FPC" })
	})

	describe("who chose the fee", () => {
		const { PREEXISTING_FEE_JUICE: FJ, FEE_JUICE_WITH_CLAIM: FJWC, EXTERNAL } = AccountFeePaymentMethodOptions
		const FEE_JUICE = `0x${"05".padStart(64, "0")}`
		const FOO = { type: OriginType.DAPP, name: "Foo" }
		const row = (
			feeChoice: string,
			feePaymentMethod: number,
			calls: ReturnType<typeof call>[] = [],
			origin: { type: number; name?: string } = FOO,
		) => ({
			feeChoice,
			feePaymentMethod,
			calls: [...calls, APP_CALL],
			origin,
		})

		test.each([
			["you, Fee Juice", row("wallet", FJ), { method: "Public Fee Juice" }],
			["you, Fee Juice with claim", row("wallet", FJWC), { method: "Public Fee Juice (with claim)" }],
			[
				"you, the PrivateFPC's pay_fee",
				row("wallet", EXTERNAL, [call(PRIVATE_FPC_ADDRESS, "pay_fee")]),
				{ method: "Private Fee Juice" },
			],
			["you, a sponsor you picked", row("wallet", EXTERNAL, [call(SPONSOR, "sponsor_unconditionally")]), { method: "Sponsored" }],
			["you, another fee contract", row("wallet", EXTERNAL, [call(APP, "fee_entrypoint_private")]), { method: "External FPC" }],
			[
				"the app, the PrivateFPC's pay_fee",
				row("app", EXTERNAL, [call(PRIVATE_FPC_ADDRESS, "pay_fee")]),
				{ method: "Private Fee Juice", setBy: "Set by Foo" },
			],
			[
				"the app, the PrivateFPC's mint_and_pay_fee after its claim",
				row("app", EXTERNAL, [call(FEE_JUICE, "claim"), call(PRIVATE_FPC_ADDRESS, "mint_and_pay_fee")]),
				{ method: "Private Fee Juice", setBy: "Set by Foo" },
			],
			[
				"the app, the protocol sponsor",
				row("app_protocol_sponsor", EXTERNAL, [call(SPONSOR, "sponsor_unconditionally")]),
				{ method: "Sponsored", setBy: "Set by Foo" },
			],
			[
				"the app, a sponsor-named call on its own contract",
				row("app", EXTERNAL, [call(APP, "sponsor_unconditionally")]),
				{ method: "Set by Foo" },
			],
			["the app, its own pay_fee", row("app", EXTERNAL, [call(APP, "pay_fee")]), { method: "Set by Foo" }],
			["the app, a claim to the account", row("app", FJWC), { method: "Public Fee Juice (with claim)", setBy: "Set by Foo" }],
			["the app, Fee Juice", row("app", FJ), { method: "Set by Foo" }],
			["the app, an unknown method", row("app", 7), { method: "Unknown (7)" }],
			[
				"the app, unnamed",
				row("app_protocol_sponsor", EXTERNAL, [], { type: OriginType.DAPP }),
				{ method: "Sponsored", setBy: "Set by the app" },
			],
			["an unknown chooser reads as today", row("bogus", EXTERNAL, [call(APP, "fee_entrypoint_private")]), { method: "Set by Foo" }],
		])("%s", (_case, tx, label) => {
			expect(describeFeePaymentMethod(tx)).toStrictEqual(label)
		})

		const DECLARED = { type: OriginType.DAPP, name: "Playground \u2705\u{1F680}" }
		test.each([
			[
				"the app's sponsor",
				row("app_protocol_sponsor", EXTERNAL, [call(SPONSOR, "sponsor_unconditionally")], DECLARED),
				{ method: "Sponsored", setBy: "Set by Playground" },
			],
			[
				"a row with no recorded chooser",
				{ ...row("app", EXTERNAL, [call(APP, "fee_entrypoint_private")], DECLARED), feeChoice: undefined },
				{ method: "Set by Playground" },
			],
			[
				"a name the filter empties",
				row("app_protocol_sponsor", EXTERNAL, [], { type: OriginType.DAPP, name: "\u2705\u{1F680}" }),
				{ method: "Sponsored", setBy: "Set by the app" },
			],
		])("an app whose declared name carries emoji is named as its chip does: %s", (_case, tx, label) => {
			expect(describeFeePaymentMethod(tx)).toStrictEqual(label)
		})
	})
})
