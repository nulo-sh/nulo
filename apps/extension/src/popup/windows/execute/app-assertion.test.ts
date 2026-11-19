import { ContractAssertionError } from "@nulo/extension-messaging/errors"
import { describe, expect, test } from "vitest"
import { appAssertion } from "./app-assertion"

const field = (n: bigint): string => `0x${n.toString(16).padStart(64, "0")}`
const TOKEN = field(0xc0ffeen)
const FPC = field(0xfeen)
const TRANSFER = "0xedc09d49"
const MINT = "0x2a3b4c5d"
const SETUP = "0x6e7f8091"
// As `aztec_sendTx` carries a call: a field address, a selector, field arguments.
const transfer = { name: "transfer_private_to_private", to: TOKEN, selector: TRANSFER, args: [field(1n), field(2n), field(5n), field(0n)] }

const failure = (assertion: string, frames: { contract: string; selector?: string }[]) =>
	new ContractAssertionError(`Assertion failed: ${assertion} 'x'`, { assertion, frames })
const inTransfer = (assertion: string) =>
	failure(assertion, [
		{ contract: field(0xab12n), selector: "0x27e740b2" },
		{ contract: TOKEN, selector: TRANSFER },
	])

describe("appAssertion", () => {
	test("a frame on one of the calls, by contract and selector, gives the text; the case of either may differ", () => {
		expect(appAssertion(inTransfer("Balance too low"), [transfer])).toBe("Balance too low")
		const upper = failure("Balance too low", [
			{ contract: TOKEN.toUpperCase().replace("0X", "0x"), selector: TRANSFER.toUpperCase().replace("0X", "0x") },
		])
		expect(appAssertion(upper, [transfer])).toBe("Balance too low")
	})

	test("the fee contract's own setup, on a contract the request also calls, is not the app's", () => {
		const mint = { name: "mint", to: FPC, selector: MINT, args: [field(5n)] }
		const setup = failure("Balance too low", [{ contract: FPC, selector: SETUP }])
		expect(appAssertion(setup, [mint, transfer])).toBeUndefined()
		// The same contract, the call's own selector: the app's.
		expect(appAssertion(failure("Balance too low", [{ contract: FPC, selector: MINT }]), [mint, transfer])).toBe("Balance too low")
	})

	test("a frame without a selector, a frame on no call, and a plain error with the same text give nothing", () => {
		expect(appAssertion(failure("Balance too low", [{ contract: TOKEN }]), [transfer])).toBeUndefined()
		expect(appAssertion(failure("Balance too low", [{ contract: field(7n), selector: TRANSFER }]), [transfer])).toBeUndefined()
		expect(appAssertion(new Error("Assertion failed: Balance too low"), [transfer])).toBeUndefined()
	})

	test("a call whose selector or contract is not wire-shaped matches nothing", () => {
		expect(appAssertion(inTransfer("Balance too low"), [{ ...transfer, selector: "edc09d49" }])).toBeUndefined()
		expect(appAssertion(inTransfer("Balance too low"), [{ ...transfer, to: 5 }])).toBeUndefined()
	})

	test("controls are stripped, a line break read as a space, the trailing stop trimmed, and the text capped at 120", () => {
		expect(appAssertion(inTransfer("‮Balance\u0000 too\nlow. ‏"), [transfer])).toBe("Balance too low")
		const long = appAssertion(inTransfer("a".repeat(300)), [transfer])
		expect(long).toBe(`${"a".repeat(120)}…`)
		expect(appAssertion(inTransfer("‮\u0007 ."), [transfer])).toBeUndefined()
	})
})
