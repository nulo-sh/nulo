import { describe, expect, test } from "vitest"
import { feeChoiceOf } from "./fee-choice"

const SPONSOR = `0x${"1a".repeat(32)}`
const APP_FPC = `0x${"1c".repeat(32)}`
const TOKEN = `0x${"1d".repeat(32)}`
const call = (contract: string, method: string) => ({ contract, method })
const transfer = call(TOKEN, "transfer_in_public")

describe("feeChoiceOf", () => {
	test("the person's pick is the wallet's, whatever its calls", () => {
		expect(feeChoiceOf("wallet", [call(SPONSOR, "sponsor_unconditionally"), transfer], SPONSOR)).toBe("wallet")
	})

	test("the app's call to the protocol sponsor proves it, in any spelling and behind a decoy fee call", () => {
		expect(feeChoiceOf("app", [call(SPONSOR, "sponsor_unconditionally"), transfer], SPONSOR)).toBe("app_protocol_sponsor")
		expect(feeChoiceOf("app", [call(SPONSOR.toUpperCase().replace("0X", "0x"), "sponsor_unconditionally")], SPONSOR)).toBe(
			"app_protocol_sponsor",
		)
		const decoyFirst = [call(APP_FPC, "sponsor_unconditionally"), transfer, call(SPONSOR, "sponsor_unconditionally")]
		expect(feeChoiceOf("app", decoyFirst, SPONSOR)).toBe("app_protocol_sponsor")
	})

	test("the same method on another contract, or no derived address, is the app's plain pick", () => {
		expect(feeChoiceOf("app", [call(APP_FPC, "sponsor_unconditionally"), transfer], SPONSOR)).toBe("app")
		expect(feeChoiceOf("app", [call(SPONSOR, "sponsor_unconditionally")], undefined)).toBe("app")
	})
})
