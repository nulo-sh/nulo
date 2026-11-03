import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "../..")
const WORKFLOWS = join(ROOT, ".github/workflows")

test("every release script a workflow runs loads only relative files, node: builtins and bun", () => {
	// Each of those jobs runs Bun with nothing installed, so any other import fails only at release time.
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
	expect(refused).toEqual([])
	expect([...seen]).toEqual(
		expect.arrayContaining([
			"scripts/release/publish-chrome-store-run.ts",
			"scripts/release/workflow-command.ts",
			"packages/legal/src/launch.ts",
		]),
	)
})
