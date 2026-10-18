#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { renderGlyphsModule, tablerGlyphs } from "../src/internal/render-glyphs"

/** Run through `bun run gen:glyphs`: only there is Biome on PATH to format what this writes. */
const require = createRequire(import.meta.url)
await Bun.write(
	new URL("../src/core/glyphs.ts", import.meta.url),
	renderGlyphsModule(tablerGlyphs((specifier) => readFileSync(require.resolve(specifier), "utf8"))),
)
console.log("gen:glyphs → src/core/glyphs.ts")
