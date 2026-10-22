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
		["a child that is no path", svg(OUTLINE_ROOT, '<circle cx="12" cy="12" r="9" />'), "holds content other than bare <path d>"],
		["a path attribute beyond d", svg(OUTLINE_ROOT, '<path d="M6 6l12 12" fill="currentColor" />'), "holds content other than"],
		[
			"an extra root attribute",
			svg(`${OUTLINE_ROOT} transform="rotate(45)"`, '<path d="M6 6l12 12" />'),
			'root transform="rotate(45)"',
		],
		[
			"a single-quoted root attribute",
			svg(`${OUTLINE_ROOT} transform='rotate(45)'`, '<path d="M6 6l12 12" />'),
			"unreadable root attributes",
		],
		["a repeated root attribute", svg(`fill="red" ${OUTLINE_ROOT}`, '<path d="M6 6l12 12" />'), "root repeats fill"],
		[
			"a root that lacks a paint",
			svg(OUTLINE_ROOT.replace(' stroke-linejoin="round"', ""), '<path d="M6 6l12 12" />'),
			"root lacks stroke-linejoin",
		],
		[
			"a stroke Icon.vue does not draw",
			svg(OUTLINE_ROOT.replace('stroke-width="2"', 'stroke-width="1.5"'), '<path d="M6 6l12 12" />'),
			'root stroke-width="1.5"',
		],
		[
			"a filled root with a stroke",
			svg(`${FILLED_ROOT} stroke="currentColor"`, '<path d="M6 6l12 12" />'),
			'root stroke="currentColor"',
		],
		["a repeated path", svg(OUTLINE_ROOT, '<path d="M6 6l12 12" />', '<path d="M6 6l12 12" />'), "repeats a path"],
		["no path", svg(OUTLINE_ROOT), "draws nothing"],
		["an empty path", svg(OUTLINE_ROOT, '<path d="" />'), "draws nothing"],
		["a blank path", svg(OUTLINE_ROOT, '<path d="  " />'), "draws nothing"],
		[
			"a path opening with a relative move",
			svg(OUTLINE_ROOT, '<path d="M6 6l12 12" />', '<path d="m6 18l12 -12" />'),
			"opens a path with other than an absolute M",
		],
	])("refuses %s", (_, text, reason) => {
		const source = text.includes(FILLED_ROOT) ? "filled/x" : "x"
		expect(() => tablerGlyph(source, text)).toThrow(`${source}: ${reason}`)
	})

	test("names each source's file under the package's exports", () => {
		expect([tablerSpecifier("coins"), tablerSpecifier("filled/square")]).toEqual([
			"@tabler/icons/outline/coins.svg",
			"@tabler/icons/filled/square.svg",
		])
	})
})
