import { expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "../..")
const WORKFLOWS = join(ROOT, ".github/workflows")

/** Every repository file a workflow-run release script loads, and each import that is not a relative file. */
function releaseClosure(): { seen: Set<string>; refused: string[] } {
	const roots = new Set(
		readdirSync(WORKFLOWS).flatMap((name) => readFileSync(join(WORKFLOWS, name), "utf8").match(/scripts\/release\/[\w-]+\.ts/g) ?? []),
	)
	const transpiler = new Bun.Transpiler({ loader: "ts" })
	const seen = new Set<string>()
	const refused: string[] = []
	const visit = (file: string) => {
		if (seen.has(file)) return
		seen.add(file)
		for (const { path } of transpiler.scanImports(readFileSync(join(ROOT, file), "utf8").replace(/^#!.*/, ""))) {
			if (path.startsWith(".")) visit(relative(ROOT, resolve(ROOT, dirname(file), path.endsWith(".ts") ? path : `${path}.ts`)))
			else if (!/^node:|^bun$/.test(path)) refused.push(`${file}: ${path}`)
		}
	}
	for (const root of roots) visit(root)
	return { seen, refused }
}

test("every release script a workflow runs loads only relative files, node: builtins and bun", () => {
	// Each of those jobs runs Bun with nothing installed, so any other import fails only at release time.
	const { seen, refused } = releaseClosure()
	expect(refused).toEqual([])
	expect([...seen]).toEqual(
		expect.arrayContaining([
			"scripts/release/publish-chrome-store-run.ts",
			"scripts/release/workflow-command.ts",
			"packages/legal/src/launch.ts",
		]),
	)
})

test("no tsconfig those scripts resolve through maps an import", () => {
	// Bun applies the nearest tsconfig's `paths` and `baseUrl`, through `extends`, to every import
	// at run time, so one there would redirect what a job holding a release secret loads.
	const chain = new Set<string>()
	const mapping: string[] = []
	const follow = (config: string) => {
		if (chain.has(config)) return
		chain.add(config)
		const { extends: parent, compilerOptions: options = {} } = Bun.JSONC.parse(readFileSync(join(ROOT, config), "utf8")) as {
			extends?: string
			compilerOptions?: Record<string, unknown>
		}
		if ("paths" in options || "baseUrl" in options) mapping.push(config)
		if (parent) follow(relative(ROOT, resolve(ROOT, dirname(config), parent)))
	}
	for (const file of releaseClosure().seen) {
		let dir = dirname(file)
		while (dir !== "." && !existsSync(join(ROOT, dir, "tsconfig.json"))) dir = dirname(dir)
		follow(join(dir, "tsconfig.json"))
	}
	expect(mapping).toEqual([])
	expect([...chain].sort()).toEqual(["packages/legal/tsconfig.json", "scripts/tsconfig.json", "tsconfig.base.json"])
})
