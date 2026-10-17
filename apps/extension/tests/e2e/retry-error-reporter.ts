import { appendFileSync } from "node:fs"
import type { Reporter, TestCase } from "vitest/node"

/**
 * Surfaces the first-attempt errors of tests that PASSED on a vitest retry.
 * The default reporter prints only a `(retry xN)` marker for an eventual pass
 * and swallows the failed attempts' errors, leaving retry-masked flakes
 * undiagnosable from CI logs.
 * Vitest retains those errors on the passed result (`TestResultPassed.errors`);
 * this reporter prints them loudly, once, when the case settles.
 *
 * Runs ALONGSIDE the default reporter — it emits only on retried passes and
 * stays silent otherwise, so normal output is untouched.
 *
 * On Actions it also appends the run's count of retried passes, by name, to the
 * job summary. The block is written when the count is 0 too, so a job whose
 * summary lacks it is one whose reporter never ran.
 */
export default class RetryErrorReporter implements Reporter {
	private readonly retried: { name: string; file: string }[] = []

	onTestCaseResult(testCase: TestCase): void {
		const result = testCase.result()
		if (result.state !== "passed" || !result.errors?.length) return
		const location = testCase.module.moduleId
		this.retried.push({ name: testCase.fullName, file: testCase.module.relativeModuleId })
		console.error(`\n[retry-error] PASSED ON RETRY: ${testCase.fullName} (${location})`)
		result.errors.forEach((err, i) => {
			const stack = err.stack ?? err.message ?? String(err)
			console.error(`[retry-error] retained error ${i + 1}:\n${stack}`)
		})
	}

	onTestRunEnd(): void {
		const summary = process.env.GITHUB_STEP_SUMMARY
		if (!summary) return
		const lines = [
			"### e2e retried passes",
			"",
			`${this.retried.length} passed on retry`,
			"",
			...this.retried.map(({ name, file }) => `- ${name} (\`${file}\`)`),
			"",
		]
		appendFileSync(summary, lines.join("\n"))
	}
}
