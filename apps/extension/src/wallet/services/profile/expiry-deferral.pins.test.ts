import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { expect, test } from "vitest"

/**
 * Auto-lock is a security timer: only approved sends defer it, through the one slot `ExecutionService`
 * fills, and a second caller would replace that deferral silently. Textual on purpose: aliasing
 * defeats it, which is what review is for.
 */

const SRC = resolve(__dirname, "../../..")

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) return walk(path)
		return /\.(ts|vue)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : []
	})
}

test("the auto-lock deferral has exactly one caller", () => {
	const callers = walk(SRC)
		.map((path) => ({ path: relative(SRC, path), text: readFileSync(path, "utf8") }))
		.filter(({ text }) => /\.setExpiryDeferral\(/.test(text))
		.map(({ path, text }) => [path, text.match(/\.setExpiryDeferral\(/g)?.length])
	expect(callers).toEqual([
		["wallet/services/execution/service.ts", 1],
		["wallet/services/profile/service.ts", 1],
	])
})
