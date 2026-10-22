import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { testTempDir, writeBackupToTemp } from "../../tests/e2e/helpers/test-temp-dir"

// The helpers read `os.tmpdir()` per call, which follows `TMPDIR`: every dir these cases make lands
// under ROOT, so a leak shows here and never in the host's temp dir.
const savedTmpDir = process.env.TMPDIR
const ROOT = mkdtempSync(join(tmpdir(), "nulo-test-temp-dir-test-"))
process.env.TMPDIR = ROOT

afterAll(() => {
	if (savedTmpDir === undefined) delete process.env.TMPDIR
	else process.env.TMPDIR = savedTmpDir
	rmSync(ROOT, { recursive: true, force: true })
})

const PREFIX = "nulo-test-temp-dir-"

describe("testTempDir outside a test", () => {
	let thrown: unknown
	beforeAll(() => {
		try {
			testTempDir(PREFIX)
		} catch (error) {
			thrown = error
		}
	})

	test("refuses before it creates anything", () => {
		expect(thrown).toBeInstanceOf(Error)
		expect((thrown as Error).message).toMatch(/inside a test/)
		// The runtime may write its own temp files under `TMPDIR`; only the helper's dirs count.
		expect(readdirSync(ROOT).filter((name) => name.startsWith(PREFIX))).toEqual([])
	})
})

describe("testTempDir inside a test", () => {
	let passed = ""
	let failed = ""

	test("makes an empty dir under the temp dir", () => {
		passed = testTempDir(PREFIX)
		expect(dirname(passed)).toBe(ROOT)
		expect(basename(passed)).toMatch(/^nulo-test-temp-dir-/)
		expect(readdirSync(passed)).toEqual([])
	})

	test("removes that dir once the test that made it has finished", () => {
		expect(passed).not.toBe("")
		expect(existsSync(passed)).toBe(false)
	})

	test.fails("a test that fails after it made its dir", () => {
		failed = testTempDir(PREFIX)
		throw new Error("fails after the dir exists")
	})

	test("removes the dir of a test that failed too", () => {
		// `test.fails` passes on any throw, so the dir itself must be shown to have been made.
		expect(failed).not.toBe("")
		expect(existsSync(failed)).toBe(false)
	})
})

describe("writeBackupToTemp", () => {
	let written = ""

	test("writes the content under the given name, in its own dir under the temp dir", () => {
		written = writeBackupToTemp('{"a":1}', "named.json")
		expect(basename(written)).toBe("named.json")
		expect(basename(dirname(written))).toMatch(/^nulo-e2e-backup-/)
		expect(dirname(dirname(written))).toBe(ROOT)
		expect(readFileSync(written, "utf8")).toBe('{"a":1}')
	})

	test("removes that dir once the test that wrote it has finished", () => {
		expect(written).not.toBe("")
		expect(existsSync(dirname(written))).toBe(false)
	})
})
