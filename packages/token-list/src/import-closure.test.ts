import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const HERE = fileURLToPath(new URL(".", import.meta.url))
// The `sign` job runs `bun --no-install` with no `node_modules`: anything the two CLIs reach outside
// this directory or `node:` would fail there, or be fetched from a registry beside the secret.
const ENTRIES = ["sign-cli.ts", "keygen-cli.ts"]
const SPECIFIER = /(?:^|\n)\s*(?:import|export)\s[^;"]*?from\s+"([^"]+)"|(?:^|\n)\s*import\s+"([^"]+)"|\bimport\s*\(/g

function closure(entry: string): Set<string> {
	const seen = new Set<string>()
	const visit = (file: string) => {
		if (seen.has(file)) return
		seen.add(file)
		for (const match of readFileSync(join(HERE, file), "utf8").matchAll(SPECIFIER)) {
			const specifier = match[1] ?? match[2]
			expect(specifier, `${file} uses a dynamic import`).toBeDefined()
			if (specifier.startsWith("node:")) continue
			expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\/[a-z-]+$/)
			const target = `${specifier.slice(2)}.ts`
			expect(resolve(HERE, target).startsWith(HERE)).toBe(true)
			visit(target)
		}
	}
	visit(entry)
	return seen
}

describe("signing import closure", () => {
	test.each(ENTRIES)("%s reaches only node: builtins and files in this directory", (entry) => {
		expect(closure(entry).size).toBeGreaterThan(1)
	})

	test("the signer's closure is exactly the format modules", () => {
		expect([...closure("sign-cli.ts")].sort()).toEqual([
			"class-ids.ts",
			"envelope.ts",
			"keys.ts",
			"parse.ts",
			"price-ids.ts",
			"sign-cli.ts",
			"sign.ts",
		])
	})
})
