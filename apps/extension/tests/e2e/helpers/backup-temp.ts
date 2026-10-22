import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { onTestFinished } from "vitest"

/**
 * Drop a JSON string onto disk for a test to pick in a file input. The dir is removed when the
 * calling test's attempt ends, so never keep the path past it (across tests or retries); with no
 * current test (`beforeAll`, module scope) it throws before writing. Not for concurrent tests, whose
 * current test is ambiguous.
 */
export function writeBackupToTemp(content: string, filename = "backup.json"): string {
	let dir: string | undefined
	onTestFinished(() => {
		if (dir) rmSync(dir, { recursive: true, force: true })
	})
	dir = mkdtempSync(join(tmpdir(), "nulo-e2e-backup-"))
	const file = join(dir, filename)
	writeFileSync(file, content)
	return file
}
