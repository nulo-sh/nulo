import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { describe, expect, test } from "vitest"
import { formatFeeJuice } from "@/utils/fee-estimation"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { PRIVATE_FPC_ADDRESS } from "@/wallet/services/fpc/private-fpc-address"
import { FpcType } from "@/wallet/services/fpc/spec"
import { FEE_RISE_ASKS, feeRiseAsks, personalPayerOf } from "./fee-reask"

const APPROVED = 16_000_000_000_000_000n // 0.016 FJ

describe("feeRiseAsks", () => {
	test("asks for a rise above the tolerance, and the two figures print apart", () => {
		const now = 21_000_000_000_000_000n
		expect(feeRiseAsks(now.toString(), APPROVED.toString())).toBe(true)
		expect(formatFeeJuice(now)).not.toBe(formatFeeJuice(APPROVED))
	})

	test.each([
		["a fall", APPROVED - 1n],
		["the same figure", APPROVED],
		["exactly the tolerance", APPROVED + (APPROVED * FEE_RISE_ASKS.percent) / 100n],
	])("lets %s through", (_case, fee) => {
		expect(feeRiseAsks(fee.toString(), APPROVED.toString())).toBe(false)
	})

	test("a rise over the percentage but under one readout unit goes through: it would print the same figure", () => {
		const tiny = 1_000_000_000n
		expect(feeRiseAsks((tiny + FEE_RISE_ASKS.atLeast - 1n).toString(), tiny.toString())).toBe(false)
		expect(feeRiseAsks((tiny + FEE_RISE_ASKS.atLeast).toString(), tiny.toString())).toBe(true)
	})

	test("the first unit past the tolerance asks", () => {
		expect(feeRiseAsks((APPROVED + (APPROVED * FEE_RISE_ASKS.percent) / 100n + 1n).toString(), APPROVED.toString())).toBe(true)
	})
})

describe("personalPayerOf", () => {
	const row = (type: FpcType) => ({ id: "f1", type, address: "0xf", chainId: 1, isProtocol: true })

	test.each([
		["Fee Juice", AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE, undefined],
		["Fee Juice with a claim", AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM, undefined],
	])("%s is the person's", (_case, feePaymentMethod, fpcIdentity) => {
		expect(personalPayerOf({ feePaymentMethod, fpcIdentity })).toEqual({ type: "fj", isProtocol: false })
	})

	test("Private Fee Juice is the person's, named by its row", () => {
		const payer = personalPayerOf({ feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL, fpcIdentity: row(FpcType.PrivateFpc) })
		expect(payer).toEqual({ type: "private_fpc", fpcId: "f1", isProtocol: true })
	})

	test.each([
		["a sponsor", row(FpcType.DefaultSponsoredFpc)],
		["an app's own fee contract", undefined],
	])("%s pays from a balance that is not the person's", (_case, fpcIdentity) => {
		expect(personalPayerOf({ feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL, fpcIdentity })).toBeUndefined()
	})

	test("an app's own payment the kernel names the PrivateFPC as payer for is the person's; another contract is not", () => {
		const external = (address: string) => ({
			feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
			appPayer: { address: AztecAddress.fromStringUnsafe(address) },
		})
		expect(personalPayerOf(external(PRIVATE_FPC_ADDRESS))).toEqual({ type: "private_fpc", isProtocol: true })
		expect(personalPayerOf(external(`0x${"0f".repeat(32)}`))).toBeUndefined()
	})
})
