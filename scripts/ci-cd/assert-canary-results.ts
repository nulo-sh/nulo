#!/usr/bin/env bun
/**
 * Refuse a canary, chaos or soak job whose listed files did not all run and pass.
 *
 * The job's exit code and its file count cannot see a skipped `describe`, a missing sandbox
 * config or a deleted test: every canary file also carries a setup-contract test that keeps
 * passing on its own, and the chaos file skips its one test unless armed, so "the file passed"
 * says nothing about the test in it. This reads vitest's `json` report and requires every file the
 * job was given to be present, every test in it `passed` (nothing skipped or todo), and each title
 * `canary-expectations.json` names for that file among them.
 *
 *   assert-canary-results.ts [--allow-unlisted] <vitest json report> <test file…>
 *
 * `--allow-unlisted` serves a soak, which may name any network file: a file with no entry must
 * still be present with every test passed, and a listed file keeps its titles.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { command } from "../release/workflow-command"

export type AssertionResult = { title: string; status: string }
export type FileResult = { name: string; status: string; assertionResults: AssertionResult[] }
export type CanaryReport = { testResults: FileResult[] }
/** A spec path as a job's `test_files` spells it → the titles that must have passed in it. */
export type CanaryExpectations = Record<string, string[]>

export const EXPECTATIONS_FILE = join(import.meta.dir, "canary-expectations.json")

export function loadExpectations(path: string = EXPECTATIONS_FILE): CanaryExpectations {
	return JSON.parse(readFileSync(path, "utf8"))
}

/** The report names files by absolute path; a job's list is relative to `apps/extension`. */
function resultFor(report: CanaryReport, file: string): FileResult | undefined {
	return report.testResults.find((result) => result.name === file || result.name.endsWith(`/${file}`))
}

function fileProblems(file: string, result: FileResult, expected: readonly string[]): string[] {
	const problems = result.assertionResults
		.filter((test) => test.status !== "passed")
		.map((test) => `${file}: "${test.title}" ${test.status}`)
	const reported = new Set(result.assertionResults.map((test) => test.title))
	for (const title of expected) {
		if (!reported.has(title)) problems.push(`${file}: "${title}" not reported — the expected test is gone`)
	}
	if (result.assertionResults.length === 0) problems.push(`${file}: reported no tests`)
	return problems
}

/** Every reason the report does not prove the listed files ran and passed; empty means it does. */
export function canaryProblems(report: CanaryReport, files: readonly string[], expectations: CanaryExpectations): string[] {
	if (files.length === 0) return ["no test files were given — nothing to assert"]
	const problems: string[] = []
	for (const file of files) {
		const expected = expectations[file]
		if (expected === undefined) problems.push(`${file}: no entry in canary-expectations.json`)
		const result = resultFor(report, file)
		if (result === undefined) {
			problems.push(`${file}: absent from the report — it never ran`)
			continue
		}
		problems.push(...fileProblems(file, result, expected ?? []))
	}
	return problems
}

/** `expectations` with an empty title list for each listed file it has no entry for. */
export function allowUnlisted(expectations: CanaryExpectations, files: readonly string[]): CanaryExpectations {
	return { ...Object.fromEntries(files.map((file) => [file, []])), ...expectations }
}

function readReport(path: string): CanaryReport {
	try {
		return JSON.parse(readFileSync(path, "utf8"))
	} catch (error) {
		console.error(command("error", `canary report unreadable at ${path}: ${error instanceof Error ? error.message : String(error)}`))
		process.exit(1)
	}
}

if (import.meta.main) {
	const args = process.argv.slice(2)
	const unlisted = args[0] === "--allow-unlisted"
	const [reportPath, ...files] = unlisted ? args.slice(1) : args
	if (!reportPath) {
		console.error("usage: assert-canary-results.ts [--allow-unlisted] <vitest json report> <test file…>")
		process.exit(2)
	}
	const expectations = unlisted ? allowUnlisted(loadExpectations(), files) : loadExpectations()
	const problems = canaryProblems(readReport(reportPath), files, expectations)
	for (const problem of problems) console.error(command("error", `canary results: ${problem}`))
	if (problems.length > 0) process.exit(1)
	console.log(`canary results: ${files.length} file(s) present, every test passed`)
}
