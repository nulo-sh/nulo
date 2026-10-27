/**
 * The notice card has square corners. jsdom gets no module CSS here, so the shape is pinned in the
 * card's file: no declaration in its sheet or inline style rounds a corner, and no binding or script
 * names a radius. Blind spots: a global or shared rule, a `composes`, `clip-path` rounding.
 */
import { describe, expect, test } from "vitest"
import {
	declarationsOf,
	elementByTestid,
	enclosingRule,
	NODE,
	parseSource,
	resolveSelector,
	staticAttr,
	type TemplateNode,
	walkElements,
} from "../../scripts/type-roles/source-scan"

const FILE = "apps/extension/src/components/NotificationManager.vue"

/** Every radius property, longhand, logical or prefixed; CSS property names are case-insensitive. */
const RADIUS_PROP = /(^|-)radius$/i
const ZERO = /^0+(\.0+)?[a-z%]*$/i

const rounds = (prop: string, value: string) => RADIUS_PROP.test(prop) && !value.split(/[\s/]+/).every((part) => ZERO.test(part))

/** A binding's style is not evaluated, so any radius it names counts, as in the script. */
function elementRounding(node: TemplateNode): string[] {
	const found: string[] = []
	for (const sheet of parseSource("inline.css", `x{${staticAttr(node, "style") ?? ""}}`).styles) {
		sheet.root.walkDecls((decl) => {
			if (rounds(decl.prop, decl.value)) found.push(`<${node.tag}> ${decl.prop}: ${decl.value}`)
		})
	}
	for (const prop of node.props ?? []) {
		const bindsStyle = prop.type === NODE.DIRECTIVE && prop.name === "bind" && (!prop.arg || prop.arg.content === "style")
		if (bindsStyle && /radius/i.test(prop.exp?.content ?? "")) found.push(`<${node.tag}> ${prop.exp?.content}`)
	}
	return found
}

function roundedCorners(source?: string): string[] {
	const parsed = parseSource(FILE, source)
	const found: string[] = []
	for (const sheet of parsed.styles) {
		sheet.root.walkDecls((decl) => {
			if (!rounds(decl.prop, decl.value)) return
			const rule = enclosingRule(decl)
			found.push(`${rule ? resolveSelector(rule) : ""} { ${decl.prop}: ${decl.value} }`)
		})
	}
	for (const { content } of parsed.scripts) if (/radius/i.test(content)) found.push("<script> names a radius")
	if (parsed.template) walkElements(parsed.template, (node) => found.push(...elementRounding(node)))
	return found
}

const sfc = (template: string, style = "") => `<template>${template}</template><style module>${style}</style>`

describe("the notice card has square corners", () => {
	test("its sheet and template round no corner", () => {
		expect(roundedCorners()).toEqual([])
	})

	test("the read is not empty: it reaches the card's rule and the card's template", () => {
		const parsed = parseSource(FILE)
		expect(declarationsOf(parsed, ".card")).toHaveProperty("background")
		expect(elementByTestid(parsed, "notification-description")).toBeDefined()
	})

	test.each([
		[sfc("<div />", ".card { border-radius: 16px; }"), ".card { border-radius: 16px }"],
		[sfc("<div />", ".card { border-top-left-radius: 4px; }"), ".card { border-top-left-radius: 4px }"],
		[sfc("<div />", ".card { border-start-end-radius: 4px; }"), ".card { border-start-end-radius: 4px }"],
		[sfc("<div />", ".card { BORDER-RADIUS: 4px; }"), ".card { BORDER-RADIUS: 4px }"],
		[sfc("<div />", ".card { -webkit-border-radius: 4px; }"), ".card { -webkit-border-radius: 4px }"],
		[sfc("<div />", ".card { &:hover { border-radius: 0 4px; } }"), ".card:hover { border-radius: 0 4px }"],
		[sfc('<div style="border-radius: 4px" />'), "<div> border-radius: 4px"],
		[sfc('<div style="border-radius/**/: 4px" />'), "<div> border-radius: 4px"],
		[sfc(`<div :style="{ borderRadius: '4px' }" />`), "<div> { borderRadius: '4px' }"],
		[sfc(`<div v-bind="{ style: { borderRadius: '4px' } }" />`), "<div> { style: { borderRadius: '4px' } }"],
		[`<script setup>const s = { borderRadius: "4px" }</script>${sfc('<div :style="s" />')}`, "<script> names a radius"],
	])("finds the corner in %s", (source, finding) => {
		expect(roundedCorners(source)).toEqual([finding])
	})

	test.each([
		sfc("<div />", ".card { border-radius: 0; }"),
		sfc("<div />", ".card { border-radius: 0 0; }"),
		sfc("<div />", ".card { border-top-left-radius: 0px; }"),
		sfc('<div style="border-radius: 0" />'),
	])("passes %s", (source) => {
		expect(roundedCorners(source)).toEqual([])
	})
})

/** The document under the notice can scroll (the onboarding tab), so its layer holds the viewport. */
describe("the notice is fixed to the viewport", () => {
	test("its layer is fixed and covers the whole viewport", () => {
		expect(declarationsOf(parseSource(FILE), ".layer")).toMatchObject({ position: "fixed", inset: "0" })
	})
})

/**
 * Notice text can carry data wider than the card.
 * Blind spot: a descendant that turns wrapping off (`noWrap`).
 */
describe("a notice's text stays inside its card", () => {
	test("the card breaks a string wider than itself anywhere", () => {
		expect(declarationsOf(parseSource(FILE), ".card")).toMatchObject({ "overflow-wrap": "anywhere" })
	})
})
