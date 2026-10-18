import { describe, expect, test } from "vitest"
import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { OriginType } from "@/wallet/services/transaction/client"
import { formatGas } from "@/utils/fee-estimation"
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
		expect(result).toEqual({ l2Gas: formatGas(1_000), daGas: formatGas(500), l2Cost: 10n ** 15n, daCost: 10n ** 15n })
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
	test("null tx returns null", () => {
		expect(describeFeePaymentMethod(null)).toBeNull()
	})

	test("FeeJuice → 'Public Fee Juice'", () => {
		expect(describeFeePaymentMethod({ feePaymentMethod: AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE })).toBe(
			"Public Fee Juice",
		)
	})

	test("FeeJuiceWithClaim → 'Public Fee Juice (with claim)'", () => {
		expect(describeFeePaymentMethod({ feePaymentMethod: AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM })).toBe(
			"Public Fee Juice (with claim)",
		)
	})

	test("External + sponsor_unconditionally → 'Sponsored'", () => {
		expect(
			describeFeePaymentMethod({
				feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
				calls: [{ method: "sponsor_unconditionally" }],
			}),
		).toBe("Sponsored")
	})

	test("External + fee_entrypoint_private → 'Private Fee Juice'", () => {
		expect(
			describeFeePaymentMethod({
				feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
				calls: [{ method: "fee_entrypoint_private" }],
			}),
		).toBe("Private Fee Juice")
	})

	test("External + DAPP origin → 'Set by {name}'", () => {
		expect(
			describeFeePaymentMethod({
				feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
				calls: [],
				origin: { type: OriginType.DAPP, name: "Foo" },
			}),
		).toBe("Set by Foo")
	})

	test("External + DAPP origin without name → 'Set by the app'", () => {
		expect(
			describeFeePaymentMethod({
				feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
				calls: [],
				origin: { type: OriginType.DAPP },
			}),
		).toBe("Set by the app")
	})

	test("External fallback → 'External FPC'", () => {
		expect(
			describeFeePaymentMethod({
				feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
				calls: [],
				origin: { type: OriginType.UI },
			}),
		).toBe("External FPC")
	})
})
