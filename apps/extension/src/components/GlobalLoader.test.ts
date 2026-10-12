/**
 * jsdom resolves no custom property, so the loader's scrim is pinned in its sources: the token it
 * reads must hold `rgba(10, 9, 8, 0.85)` in both themes.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { resolveExportedAsset } from "@nulo/resolve-asset"
import { expect, test } from "vitest"

const baseCss = readFileSync(resolveExportedAsset("@nulo/design", "./base.css", { from: import.meta.url }), "utf8")
const loader = readFileSync(resolve(__dirname, "GlobalLoader.vue"), "utf8")
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "")

test("the loader's scrim is --scrim-loader, declared once in the dark palette, which the light theme inherits", () => {
	const declarations = [...baseCss.matchAll(/--scrim-loader:\s*([^;]+);/g)]
	expect(declarations.map(([, value]) => value)).toEqual(["rgba(10, 9, 8, 0.85)"])
	const selector = baseCss.slice(0, declarations[0]?.index).match(/([^{}]+)\{[^{}]*$/)?.[1] ?? ""
	expect(withoutComments(selector).replace(/\s+/g, " ").trim()).toBe(':root, [theme="dark"]')
	expect(loader).toMatch(/\.wrapper \{[^}]*background-color: var\(--scrim-loader\);/)
})
