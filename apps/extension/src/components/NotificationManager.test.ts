/**
 * The notice card has square corners. jsdom gets no module CSS here, so the shape is pinned in the
 * card's source: no declaration in its sheet and no style in its template rounds a corner.
 * Blind spots: a global or shared rule, a `composes`, a style set in script or through a custom
 * property, `clip-path` rounding.
 */
import { describe, expect, test } from "vitest"
import {
	boundAttr,
	declarationsOf,
	enclosingRule,
	parseSource,
	resolveSelector,
	staticAttr,
	walkElements,
} from "../../scripts/type-roles/source-scan"

const FILE = "apps/extension/src/components/NotificationManager.vue"

/** Every radius property, longhand, logical or prefixed; CSS property names are case-insensitive. */
const RADIUS_PROP = /(^|-)radius$/i
const ZERO = /^0+(\.0+)?[a-z%]*$/i

function roundedCorners(source?: string): string[] {
	const parsed = parseSource(FILE, source)
	const found: string[] = []
	for (const sheet of parsed.styles) {
		sheet.root.walkDecls((decl) => {
			if (!RADIUS_PROP.test(decl.prop) || decl.value.split(/[\s/]+/).every((part) => ZERO.test(part))) return
			const rule = enclosingRule(decl)
			found.push(`${rule ? resolveSelector(rule) : ""} { ${decl.prop}: ${decl.value} }`)
		})
	}
	if (parsed.template) {
		walkElements(parsed.template, (node) => {
			for (const style of [staticAttr(node, "style"), boundAttr(node, "style")]) {
				if (style && /radius/i.test(style)) found.push(`<${node.tag}> ${style}`)
			}
		})
	}
	return found
}

const sfc = (template: string, style = "") => `<template>${template}</template><style module>${style}</style>`

describe("the notice card has square corners", () => {
	test("its sheet and template round no corner", () => {
		expect(roundedCorners()).toEqual([])
	})

	test("the read is not empty: the card's rule and the template's inline style are both reached", () => {
		const parsed = parseSource(FILE)
		expect(declarationsOf(parsed, ".card")).toHaveProperty("background")
		const styles: string[] = []
		if (parsed.template) walkElements(parsed.template, (node) => styles.push(staticAttr(node, "style") ?? ""))
		expect(styles).toContain("font-style: italic;")
	})

	test.each([
		[sfc("<div />", ".card { border-radius: 16px; }"), ".card { border-radius: 16px }"],
		[sfc("<div />", ".card { border-top-left-radius: 4px; }"), ".card { border-top-left-radius: 4px }"],
		[sfc("<div />", ".card { border-start-end-radius: 4px; }"), ".card { border-start-end-radius: 4px }"],
		[sfc("<div />", ".card { BORDER-RADIUS: 4px; }"), ".card { BORDER-RADIUS: 4px }"],
		[sfc("<div />", ".card { -webkit-border-radius: 4px; }"), ".card { -webkit-border-radius: 4px }"],
		[sfc("<div />", ".card { &:hover { border-radius: 0 4px; } }"), ".card:hover { border-radius: 0 4px }"],
		[sfc('<div style="border-radius: 4px" />'), "<div> border-radius: 4px"],
		[sfc(`<div :style="{ borderRadius: '4px' }" />`), "<div> { borderRadius: '4px' }"],
	])("finds the corner in %s", (source, finding) => {
		expect(roundedCorners(source)).toEqual([finding])
	})

	test.each([".card { border-radius: 0; }", ".card { border-radius: 0 0; }", ".card { border-top-left-radius: 0px; }"])(
		"passes %s",
		(style) => {
			expect(roundedCorners(sfc("<div />", style))).toEqual([])
		},
	)
})
