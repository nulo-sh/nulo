// @vitest-environment node
/**
 * A profile erase leaves IndexedDB's `keyval-store` alone because it holds only bb.js's public CRS
 * points: it is idb-keyval's default database, and bb.js's CRS loader is its only caller. A tripwire
 * for dependency bumps, not a proof: it cannot see a package bundling idb-keyval in its own dist, a
 * direct `indexedDB.open("keyval-store")`, or other data stored under an allowed key.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { resolvePackageRoot } from "@nulo/resolve-asset"
import { expect, test } from "vitest"

const BB = "@aztec-foundation/bb.js"

test("bb.js is the only locked package that depends on idb-keyval", () => {
	const lock = readFileSync(new URL("../../../../bun.lock", import.meta.url), "utf8")
	const dependents = lock
		.split("\n")
		.filter((line) => line.includes('"idb-keyval"') && !line.trim().startsWith('"idb-keyval": ['))
		.map((line) => line.trim().match(/^"([^"]+)":/)?.[1] ?? line.trim())
	expect(dependents).toEqual([BB])
})

test("bb.js's browser build reaches idb-keyval only from its CRS loader, which stores three public point arrays", () => {
	const root = join(resolvePackageRoot(BB, { from: import.meta.url }), "dest", "browser")
	const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".js"))
	const importers = files.filter((f) => readFileSync(join(root, f), "utf8").includes("idb-keyval"))
	expect(importers).toEqual([join("crs", "browser", "cached_net_crs.js")])

	const loader = readFileSync(join(root, importers[0]), "utf8")
	expect(loader.match(/^import .* from 'idb-keyval';$/gm)).toEqual(["import { get, set } from 'idb-keyval';"])
	const calls = [...loader.matchAll(/\b(?:get|set)\(/g)]
	const keys = [...loader.matchAll(/\b(?:get|set)\('([^']+)'/g)].map((m) => m[1])
	// A call whose key is not a literal could store anything, so every call must be one of these.
	expect(keys).toHaveLength(calls.length)
	expect(new Set(keys)).toEqual(new Set(["g1Data", "g2Data", "grumpkinG1DataV2"]))
})
