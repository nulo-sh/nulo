import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { onTestFinished } from "vitest"

/**
 * Drop a JSON string onto disk so puppeteer's `FileChooser.accept(paths)` can pick it up. The dir
 * is removed when the calling test finishes, so never cache the path across tests; with no current
 * test (`beforeAll`, module scope) it throws before writing. Not for concurrent tests, whose current
 * test is ambiguous.
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
