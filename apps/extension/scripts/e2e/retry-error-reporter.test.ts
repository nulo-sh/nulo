// @vitest-environment node
import * as fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import RetryErrorReporter from "../../tests/e2e/retry-error-reporter"

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>()
	return { ...actual, appendFileSync: vi.fn(actual.appendFileSync) }
})

// The count of a run WITH a retried pass is pinned against the real runner in
// tests/e2e/observability.test.ts; these cover what a nested run cannot show cheaply.
describe("RetryErrorReporter's job summary", () => {
	afterEach(() => {
		vi.unstubAllEnvs()
		vi.mocked(fs.appendFileSync).mockClear()
	})

	test("a run with no retried pass still writes its block, with a count of 0", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "retry-summary-"))
		try {
			const summary = path.join(dir, "summary.md")
			vi.stubEnv("GITHUB_STEP_SUMMARY", summary)
			new RetryErrorReporter().onTestRunEnd()
			expect(fs.readFileSync(summary, "utf8")).toBe("### e2e retried passes\n\n0 passed on retry\n\n")
			expect(fs.appendFileSync).toHaveBeenCalledOnce()
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	test("writes nothing outside Actions", () => {
		vi.stubEnv("GITHUB_STEP_SUMMARY", undefined)
		new RetryErrorReporter().onTestRunEnd()
		expect(fs.appendFileSync).not.toHaveBeenCalled()
	})
})
