import { describe, expect, test } from "vitest"
import { LEGAL_ACCEPTANCE_KEY, legalSeedValue, updatedTermsAnswer } from "../../tests/e2e/fixtures/legal"

describe("updatedTermsAnswer", () => {
	test.each([
		["no record", {}],
		["a malformed record", { [LEGAL_ACCEPTANCE_KEY]: legalSeedValue("corrupt") }],
	])("refuses storage with %s", (_name, entries) => {
		expect(() => updatedTermsAnswer(entries)).toThrow("holds no readable Terms acceptance")
	})

	test("answers nothing over a current acceptance and the changed sheet over a stale one", () => {
		expect(updatedTermsAnswer({ [LEGAL_ACCEPTANCE_KEY]: legalSeedValue("current") })).toBe("none")
		expect(updatedTermsAnswer({ [LEGAL_ACCEPTANCE_KEY]: legalSeedValue("stale") })).toBe("changed")
	})
})
