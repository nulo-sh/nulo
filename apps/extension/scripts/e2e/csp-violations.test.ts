import { describe, expect, test, vi } from "vitest"
import { closeAfterCspCheck, EXTENSION_DISABLED } from "../../tests/e2e/fixtures/csp-violations"

const ENTRY = { context: "/src/popup/index.html", directive: "style-src-elem", blocked: "inline", source: "" }

describe("closing an armed launch", () => {
	test.each([
		{ name: "a missing record fails: the recorder never ran", stored: null, failure: /recorder never ran/ },
		{ name: "a recorded violation fails, naming it", stored: [ENTRY], failure: /1 CSP violation\(s\)[\s\S]*style-src-elem/ },
		{ name: "an empty record passes", stored: [], failure: undefined },
		{ name: "an extension the browser disabled has no record to check", stored: EXTENSION_DISABLED, failure: undefined },
	])("$name, and the browser closes", async ({ stored, failure }) => {
		const close = vi.fn(async () => {})
		const closing = closeAfterCspCheck(close, async () => stored)
		if (failure) await expect(closing).rejects.toThrow(failure)
		else await expect(closing).resolves.toBeUndefined()
		expect(close).toHaveBeenCalledOnce()
	})

	test("a read that throws still closes the browser", async () => {
		const close = vi.fn(async () => {})
		await expect(
			closeAfterCspCheck(close, async () => {
				throw new Error("frame detached")
			}),
		).rejects.toThrow("frame detached")
		expect(close).toHaveBeenCalledOnce()
	})
})
