// @vitest-environment node
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"
import pkg from "../../package.json"
import { tablerGlyphs } from "../internal/render-glyphs"
import { glyphSources } from "./glyph-sources"
import { glyphs } from "./glyphs"

// Anchored at this file: vitest's own `import.meta.resolve` searches from its chunk under Node.
const require = createRequire(import.meta.url)

describe("glyphs drift guard", () => {
	test("every glyph is its Tabler icon as published; regenerate with `bun run gen:glyphs`", () => {
		expect(Object.keys(glyphs)).toEqual(Object.keys(glyphSources))
		expect(glyphs).toEqual(tablerGlyphs((specifier) => readFileSync(require.resolve(specifier), "utf8")))
	})

	test("the installed release is the one the third-party notices record", () => {
		expect(
			pkg.devDependencies["@tabler/icons"],
			"A Tabler bump redraws what screens show: take pictures for the owner's sign-off, and move the DERIVED record in packages/third-party-notices/src/policy.ts with it.",
		).toBe("3.49.0")
	})
})
