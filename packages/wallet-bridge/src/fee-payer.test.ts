import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { ProtocolContractAddress } from "@aztec-labs/aztec.js/protocol"
import { describe, expect, test } from "vitest"
import {
	CLAIM_AND_END_SETUP,
	CLAIM_AND_END_SETUP_SELECTOR,
	FEE_JUICE_CONTRACT,
	classifyFeePayer,
	isClaimAndEndSetup,
	isSelfPay,
} from "./fee-payer"

const SENDER = "0x1a228350bbfa130d71aa1105c93e6432bd8c65476bc46ba579d2dc885e2873d1"
const FPC = "0x2ef4be56d83d448d37909ede8ac3a4ac69daab309584a1bceebbc9f0639f825c"

/** The call `FeeJuicePaymentMethodWithClaim` emits, field for field. */
const CLAIM = {
	name: CLAIM_AND_END_SETUP,
	to: FEE_JUICE_CONTRACT,
	selector: CLAIM_AND_END_SETUP_SELECTOR,
	type: "private",
	isStatic: false,
	hideMsgSender: false,
	args: [SENDER, `0x${"0".repeat(63)}5`, `0x${"0".repeat(63)}7`, `0x${"0".repeat(63)}9`],
}

describe("the pinned Fee Juice claim", () => {
	test("the address matches the protocol's, and the claim as emitted is recognised", () => {
		expect(ProtocolContractAddress.FeeJuice.toString()).toBe(FEE_JUICE_CONTRACT)
		expect(isClaimAndEndSetup(CLAIM, SENDER)).toBe(true)
	})

	test("the name is never what identifies it: wrong address, selector, type, flags, arity or recipient are not the claim", () => {
		expect(isClaimAndEndSetup({ ...CLAIM, to: FPC }, SENDER)).toBe(false)
		expect(isClaimAndEndSetup({ ...CLAIM, selector: "0x00000001" }, SENDER)).toBe(false)
		expect(isClaimAndEndSetup({ ...CLAIM, type: "public" }, SENDER)).toBe(false)
		expect(isClaimAndEndSetup({ ...CLAIM, isStatic: true }, SENDER)).toBe(false)
		expect(isClaimAndEndSetup({ ...CLAIM, isStatic: undefined }, SENDER)).toBe(false)
		expect(isClaimAndEndSetup({ ...CLAIM, hideMsgSender: true }, SENDER)).toBe(false)
		expect(isClaimAndEndSetup({ ...CLAIM, args: CLAIM.args.slice(0, 3) }, SENDER)).toBe(false)
		// A genuine claim that credits someone else must not end setup on this account's transaction.
		expect(isClaimAndEndSetup({ ...CLAIM, args: [FPC, ...CLAIM.args.slice(1)] }, SENDER)).toBe(false)
		expect(isClaimAndEndSetup({ name: CLAIM_AND_END_SETUP }, SENDER)).toBe(false)
		// Address-like objects compare by their string form.
		expect(isClaimAndEndSetup({ ...CLAIM, to: AztecAddress.fromStringUnsafe(FEE_JUICE_CONTRACT) }, SENDER)).toBe(true)
	})
})

describe("classifyFeePayer", () => {
	test("no payer named leaves the fee to the wallet", () => {
		expect(classifyFeePayer(undefined, SENDER, [])).toBeUndefined()
		expect(classifyFeePayer(null, SENDER, [CLAIM])).toBeUndefined()
	})

	test("a payer other than the sender is an external fee payment contract, whatever its calls", () => {
		expect(classifyFeePayer(FPC, SENDER, [])).toBe("fpc")
		expect(classifyFeePayer(FPC, SENDER, [CLAIM])).toBe("fpc")
		expect(classifyFeePayer("", SENDER, [])).toBe("fpc")
	})

	test("the sender whose payload LEADS with the Fee Juice contract's own claim claims Fee Juice in setup", () => {
		expect(classifyFeePayer(SENDER, SENDER, [CLAIM, { name: "transfer" }])).toBe("fjwc")
		// Anything before the claim would run inside setup: a claim that does not lead is no claim in setup.
		expect(classifyFeePayer(SENDER, SENDER, [{ name: "transfer" }, CLAIM])).toBe("self-pay")
	})

	test("the sender with no such claim asks to pay from held Fee Juice - a claim-named call elsewhere included", () => {
		expect(classifyFeePayer(SENDER, SENDER, [])).toBe("self-pay")
		expect(classifyFeePayer(SENDER, SENDER, [{ name: "transfer" }])).toBe("self-pay")
		expect(classifyFeePayer(SENDER, SENDER, undefined)).toBe("self-pay")
		expect(classifyFeePayer(SENDER, SENDER, [{ ...CLAIM, to: FPC }])).toBe("self-pay")
		expect(classifyFeePayer(SENDER, SENDER, [{ ...CLAIM, type: "public" }])).toBe("self-pay")
		expect(classifyFeePayer(SENDER, SENDER, [{ ...CLAIM, args: [FPC, ...CLAIM.args.slice(1)] }])).toBe("self-pay")
	})

	test("compares addresses by their string form", () => {
		expect(classifyFeePayer({ toString: () => SENDER }, SENDER, [])).toBe("self-pay")
		expect(classifyFeePayer({ toString: () => FPC }, { toString: () => SENDER }, [])).toBe("fpc")
	})
})

describe("isSelfPay", () => {
	test("reads the payload it is given", () => {
		expect(isSelfPay({ feePayer: SENDER, calls: [{ name: "claim_public" }] }, SENDER)).toBe(true)
		expect(isSelfPay({ feePayer: SENDER, calls: [CLAIM, { name: "claim_public" }] }, SENDER)).toBe(false)
		expect(isSelfPay({ feePayer: SENDER, calls: [{ name: "claim_public" }, CLAIM] }, SENDER)).toBe(true)
		expect(isSelfPay({ feePayer: FPC, calls: [] }, SENDER)).toBe(false)
		expect(isSelfPay({ calls: [] }, SENDER)).toBe(false)
		expect(isSelfPay(undefined, SENDER)).toBe(false)
	})
})
