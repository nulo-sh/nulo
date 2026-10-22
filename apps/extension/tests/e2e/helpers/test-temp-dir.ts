import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { onTestFinished } from "vitest"

/**
 * A fresh dir under `os.tmpdir()` that the calling test owns: it is removed when the test's attempt
 * ends, pass or fail, so never keep the path past it (across tests or retries); with no current test
 * (`beforeAll`, module scope) it throws before creating anything. Not for concurrent tests, whose
 * current test is ambiguous.
 */
export function testTempDir(prefix: string): string {
	let dir: string | undefined
	onTestFinished(() => {
		if (dir) rmSync(dir, { recursive: true, force: true })
	})
	dir = mkdtempSync(join(tmpdir(), prefix))
	return dir
}

/** Drop a JSON string onto disk for a test to pick in a file input, in a {@link testTempDir}. */
export function writeBackupToTemp(content: string, filename = "backup.json"): string {
	const file = join(testTempDir("nulo-e2e-backup-"), filename)
	writeFileSync(file, content)
	return file
}
