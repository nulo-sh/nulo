import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { restrictToTrustedContexts } from "./storage-access"

afterEach(() => {
	vi.restoreAllMocks()
})

describe("restrictToTrustedContexts", () => {
	test("sets the trusted-contexts level once where the browser has the method", async () => {
		const setAccessLevel = vi.fn(async () => {})
		await restrictToTrustedContexts({ setAccessLevel })
		expect(setAccessLevel).toHaveBeenCalledTimes(1)
		expect(setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" })
	})

	test("resolves and warns about nothing where the browser has no such method", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		await expect(restrictToTrustedContexts({})).resolves.toBeUndefined()
		expect(warn).not.toHaveBeenCalled()
	})

	test.each([
		["rejects", () => Promise.reject(new Error("refused"))],
		[
			"throws",
			() => {
				throw new Error("refused")
			},
		],
	])("resolves with one warning when the browser %s", async (_name, setAccessLevel) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		await expect(restrictToTrustedContexts({ setAccessLevel })).resolves.toBeUndefined()
		expect(warn).toHaveBeenCalledTimes(1)
		expect(warn.mock.calls[0][1]).toEqual({ error: new Error("refused") })
	})

	test("the worker entry restricts the local area at module scope, beside the other start-up registrations", () => {
		const entry = readFileSync(resolve(__dirname, "../index.ts"), "utf8")
		expect(entry).toMatch(/^registerContentMessageRelay\(\)\nvoid restrictToTrustedContexts\(chrome\.storage\.local\)$/m)
	})
})
