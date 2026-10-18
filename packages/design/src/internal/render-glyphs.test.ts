import { describe, expect, test } from "vitest"
import { tablerGlyph, tablerSpecifier } from "./render-glyphs"

const BOX = '<path stroke="none" d="M0 0h24v24H0z" fill="none" />'
const OUTLINE_ROOT =
	'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"'
const FILLED_ROOT = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="icon"'
const svg = (root: string, ...children: string[]) => `<svg\n  ${root}\n>\n  ${[BOX, ...children].join("\n  ")}\n</svg>\n`

describe("tablerGlyph", () => {
	test("an outline icon strokes its paths, without the no-op box, a space after each M", () => {
		expect(tablerGlyph("x", svg(OUTLINE_ROOT, '<path d="M18 6l-12 12" />', '<path d="M6 6l12 12" />'))).toEqual({
			s: ["M 18 6l-12 12", "M 6 6l12 12"],
		})
	})

	test("a filled icon fills its paths", () => {
		expect(tablerGlyph("filled/square", svg(FILLED_ROOT, '<path d="M19 2h-14v20h14z" />'))).toEqual({ f: ["M 19 2h-14v20h14z"] })
	})

	test.each([
		["a child that is no path", svg(OUTLINE_ROOT, '<circle cx="12" cy="12" r="9" />')],
		["a path attribute beyond d", svg(OUTLINE_ROOT, '<path d="M6 6l12 12" fill="currentColor" />')],
		["an extra root attribute", svg(`${OUTLINE_ROOT} transform="rotate(45)"`, '<path d="M6 6l12 12" />')],
		["a stroke Icon.vue does not draw", svg(OUTLINE_ROOT.replace('stroke-width="2"', 'stroke-width="1.5"'), '<path d="M6 6l12 12" />')],
		["a filled root with a stroke", svg(`${FILLED_ROOT} stroke="currentColor"`, '<path d="M6 6l12 12" />')],
		["a repeated path", svg(OUTLINE_ROOT, '<path d="M6 6l12 12" />', '<path d="M6 6l12 12" />')],
		["no path", svg(OUTLINE_ROOT)],
	])("refuses %s", (_, text) => {
		const source = text.includes(FILLED_ROOT) ? "filled/x" : "x"
		expect(() => tablerGlyph(source, text)).toThrow(/^(filled\/)?x: /)
	})

	test("names each source's file under the package's exports", () => {
		expect([tablerSpecifier("coins"), tablerSpecifier("filled/square")]).toEqual([
			"@tabler/icons/outline/coins.svg",
			"@tabler/icons/filled/square.svg",
		])
	})
})
