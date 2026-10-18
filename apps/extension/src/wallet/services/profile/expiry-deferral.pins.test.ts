import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { expect, test } from "vitest"
import { REPO_ROOT, sourceFiles, TEST_FILE } from "../../../../scripts/type-roles/source-scan"

/**
 * Auto-lock is a security timer: only approved sends defer it, through the one slot `ExecutionService`
 * fills, and a second caller would replace that deferral silently. Textual on purpose: aliasing
 * defeats it, which is what review is for.
 */

const SRC = "apps/extension/src"

const files = sourceFiles({ roots: [SRC], exts: ["ts", "vue"], skip: [TEST_FILE] }).map((file) => ({
	path: relative(SRC, file),
	text: readFileSync(join(REPO_ROOT, file), "utf8"),
}))

test("the auto-lock deferral has exactly one caller", () => {
	const callers = files
		.filter(({ text }) => /\.setExpiryDeferral\(/.test(text))
		.map(({ path, text }) => [path, text.match(/\.setExpiryDeferral\(/g)?.length])
	// The profile service's line is the forwarder to its session manager, not a second caller.
	expect(callers).toEqual([
		["wallet/services/execution/service.ts", 1],
		["wallet/services/profile/service.ts", 1],
	])
})
