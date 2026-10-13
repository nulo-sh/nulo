import { readFileSync } from "node:fs"
import { resolvePackageAsset } from "@nulo/resolve-asset"
import { describe, expect, test } from "vitest"

/**
 * The onboarding and popup pages talk to Presto through `presto-core` alone, and onboarding
 * loads before any wallet exists — an Aztec dependency there would pull megabytes of WASM
 * into a page that never proves anything.
 */
describe("@alejoamiras/presto-core", () => {
	test("declares no @aztec dependency", () => {
		// The manifest is not in the package's exports, which Node enforces on a require.
		const manifest = resolvePackageAsset("@alejoamiras/presto-core", "package.json", { from: import.meta.url })
		const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
			dependencies?: Record<string, string>
			peerDependencies?: Record<string, string>
			optionalDependencies?: Record<string, string>
		}
		const declared = Object.keys({
			...pkg.dependencies,
			...pkg.peerDependencies,
			...pkg.optionalDependencies,
		})
		expect(declared.filter((name) => /^@aztec(-labs|-foundation)?\//.test(name))).toEqual([])
	})
})
