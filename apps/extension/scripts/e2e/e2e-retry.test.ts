// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest"
import { e2eRetry } from "../../vite.shared"

describe("e2eRetry, the NULO_E2E_RETRY reader every e2e config shares", () => {
	afterEach(() => vi.unstubAllEnvs())

	test.each([undefined, ""])("falls back when the variable is %j", (raw) => {
		vi.stubEnv("NULO_E2E_RETRY", raw)
		expect(e2eRetry(2)).toBe(2)
	})

	test.each(["0", "3"])("runs %s as given", (raw) => {
		vi.stubEnv("NULO_E2E_RETRY", raw)
		expect(e2eRetry(2)).toBe(Number(raw))
	})

	test.each([
		["not a number", "abc"],
		["a negative count", "-1"],
		["a fraction", "1.5"],
		["another spelling of a number", " 2"],
	])("refuses %s: %j", (_, raw) => {
		vi.stubEnv("NULO_E2E_RETRY", raw)
		expect(() => e2eRetry(2)).toThrow(`NULO_E2E_RETRY=${JSON.stringify(raw)} is not a non-negative integer`)
	})
})
