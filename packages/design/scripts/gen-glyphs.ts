#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { renderGlyphsModule, tablerGlyphs } from "../src/internal/render-glyphs"

/**
 * Writes src/core/glyphs.ts from src/core/glyph-sources.ts and the installed @tabler/icons. Run via
 * `bun run gen:glyphs`, which then formats the file with Biome (on PATH only under `bun run`).
 */
const require = createRequire(import.meta.url)
await Bun.write(
	new URL("../src/core/glyphs.ts", import.meta.url),
	renderGlyphsModule(tablerGlyphs((specifier) => readFileSync(require.resolve(specifier), "utf8"))),
)
console.log("gen:glyphs → src/core/glyphs.ts")
