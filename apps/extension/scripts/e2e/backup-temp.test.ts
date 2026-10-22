import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { writeBackupToTemp } from "../../tests/e2e/helpers/backup-temp"

// The helper reads `os.tmpdir()` per call, which follows `TMPDIR`: every dir these cases make lands
// under ROOT, so a leak shows here and never in the host's temp dir.
const savedTmpDir = process.env.TMPDIR
const ROOT = mkdtempSync(join(tmpdir(), "nulo-backup-temp-test-"))
process.env.TMPDIR = ROOT

afterAll(() => {
	if (savedTmpDir === undefined) delete process.env.TMPDIR
	else process.env.TMPDIR = savedTmpDir
	rmSync(ROOT, { recursive: true, force: true })
})

/** The runtime may write its own temp files under `TMPDIR`; only the helper's dirs count. */
const backupDirs = () => readdirSync(ROOT).filter((name) => name.startsWith("nulo-e2e-backup-"))

describe("writeBackupToTemp outside a test", () => {
	let thrown: unknown
	beforeAll(() => {
		try {
			writeBackupToTemp("{}")
		} catch (error) {
			thrown = error
		}
	})

	test("refuses before it writes anything", () => {
		expect(thrown).toBeInstanceOf(Error)
		expect((thrown as Error).message).toMatch(/inside a test/)
		expect(backupDirs()).toEqual([])
	})
})

describe("writeBackupToTemp inside a test", () => {
	let passed = ""
	let failed = ""

	test("writes the content under the given name, in its own dir under the temp dir", () => {
		passed = writeBackupToTemp('{"a":1}', "named.json")
		expect(basename(passed)).toBe("named.json")
		expect(basename(dirname(passed))).toMatch(/^nulo-e2e-backup-/)
		expect(dirname(dirname(passed))).toBe(ROOT)
		expect(readFileSync(passed, "utf8")).toBe('{"a":1}')
	})

	test("removes that dir once the test that wrote it has finished", () => {
		expect(passed).not.toBe("")
		expect(existsSync(dirname(passed))).toBe(false)
	})

	test.fails("a test that fails after its write", () => {
		failed = writeBackupToTemp("{}")
		throw new Error("fails after the write")
	})

	test("removes the dir of a test that failed too", () => {
		// `test.fails` passes on any throw, so the write itself must be shown to have happened.
		expect(failed).not.toBe("")
		expect(existsSync(dirname(failed))).toBe(false)
	})
})
