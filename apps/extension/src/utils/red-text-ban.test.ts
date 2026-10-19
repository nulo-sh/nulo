import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
	componentName,
	DECLARATION,
	EXEMPT,
	enclosingRule,
	NODE,
	parseSource,
	REPO_ROOT,
	resolveSelector,
	SCAN_ROOTS,
	type SourcePolicy,
	STORY_FILE,
	sourceFiles,
	TEST_FILE,
	type TemplateNode,
	walkElements,
} from "../../scripts/type-roles/source-scan"

/**
 * Static ban: no text renders in `--red`, which reads 3.56:1 on the light page, under AA's 4.5:1.
 * Error and refusal text is `txt-danger`; `red` paints glyphs, fills and borders.
 *
 * Template, on any element but a glyph component: a `color` of `red`, a class naming `color--red`,
 * or a style whose `color` names `var(--red)`. Stylesheet: a `color` naming `var(--red)`, or a
 * `composes` naming `color--red`. Findings match `REVIEWED` by file and text as a multiset.
 *
 * Blind spots: a `v-bind` spread, a colour chosen in script (`:color="tone"`), a custom property
 * aliasing `--red`, a wrapper forwarding `color` under another prop name, a render function.
 */

const POLICY: SourcePolicy = {
	roots: SCAN_ROOTS,
	exts: ["vue", "css", "scss"],
	skip: [TEST_FILE, STORY_FILE, DECLARATION, EXEMPT],
}

/** Components whose `color` paints a glyph only; `ProcessingErrorNote.test.ts` pins its text `secondary`. */
const GLYPH_COLOR: ReadonlySet<string> = new Set(["Icon", "ProcessingErrorNote"])

/** A quoted `red` the expression can yield; one compared with `===` or `!==` is a tone, not a colour. */
const RED_LITERAL = /(?<![=!]=\s*)(["'`])red\1(?!\s*[=!]=)/
const RED_CLASS = /(?<![\w-])color--red(?![\w-])/
const RED_VAR = /var\(\s*--red(?![\w-])/
/** A `color` key or declaration, not `border-color` or `borderColor`. */
const COLOR_KEY = /(?<![\w-])["']?color["']?\s*:/g

/** Each value a `color` key takes in a style, cut at the first `,`, `;` or closing bracket at its own depth. */
function colorValues(style: string): string[] {
	return [...style.matchAll(COLOR_KEY)].map((key) => {
		const start = key.index + key[0].length
		let depth = 0
		let end = start
		for (; end < style.length; end++) {
			const char = style[end]
			if ("([{".includes(char)) depth++
			else if (")]}".includes(char) && depth-- === 0) break
			else if (depth === 0 && (char === "," || char === ";")) break
		}
		return style.slice(start, end)
	})
}

const RED_ATTR = new Map<string, (value: string, bound: boolean) => boolean>([
	["color", (value, bound) => (bound ? RED_LITERAL.test(value) : value === "red")],
	["class", (value) => RED_CLASS.test(value)],
	["style", (value) => colorValues(value).some((color) => RED_VAR.test(color))],
])

type Finding = { file: string; line: number; text: string }
type Reviewed = { file: string; text: string; why: string }

/** Red that is a glyph, large text, or waits on a decision; one entry per finding. */
const REVIEWED: Reviewed[] = [
	{
		file: "apps/extension/src/components/composite/CollapsingHeroLayout.vue",
		text: ".title_main_destructive { color: var(--red) }",
		why: "the 40 px Reset hero: large text, where AA asks 3:1",
	},
	{
		file: "apps/extension/src/popup/pages/tokens/[id].vue",
		text: ".hover_red:hover span { color: var(--red) }",
		why: "a destructive row's hover label, not an error; its colour awaits an owner decision",
	},
	{
		file: "apps/extension/src/popup/pages/tokens/[id].vue",
		text: ".hover_red:hover svg { color: var(--red) }",
		why: "a glyph",
	},
	{
		file: "apps/extension/src/popup/pages/settings/connected-apps/index.vue",
		text: ".action_danger:hover svg, .action_danger:focus-visible svg { color: var(--red) }",
		why: "a glyph",
	},
	{
		file: "packages/design/src/ui/Banner.vue",
		text: ".wrapper.error .icon svg { color: var(--red) }",
		why: "a glyph",
	},
]

const flat = (text: string): string => text.replace(/\s+/g, " ").trim()

function scanElement(file: string, node: TemplateNode, out: Finding[]): void {
	if (!node.tag || GLYPH_COLOR.has(componentName(node.tag))) return
	for (const prop of node.props ?? []) {
		const bound = prop.type === NODE.DIRECTIVE && prop.name === "bind" && prop.arg?.isStatic === true
		const name = bound ? prop.arg?.content : prop.type === NODE.ATTRIBUTE ? prop.name : undefined
		const value = bound ? prop.exp?.content : prop.value?.content
		if (name === undefined || value === undefined || !RED_ATTR.get(name)?.(value, bound)) continue
		out.push({ file, line: prop.loc.start.line, text: flat(`<${node.tag} ${prop.loc.source}>`) })
	}
}

function scan(file: string, source: string): Finding[] {
	const out: Finding[] = []
	const { template, styles } = parseSource(file, source)
	if (template) walkElements(template, (node) => scanElement(file, node, out))
	for (const sheet of styles) {
		sheet.root.walkDecls((decl) => {
			const red = decl.prop === "color" ? RED_VAR.test(decl.value) : decl.prop === "composes" && RED_CLASS.test(decl.value)
			if (!red) return
			const rule = enclosingRule(decl)
			const line = sheet.startLine + (decl.source?.start?.line ?? 1) - 1
			out.push({ file, line, text: flat(`${rule ? resolveSelector(rule) : ":root"} { ${decl.prop}: ${decl.value} }`) })
		})
	}
	return out
}

const treeFiles = (): string[] => sourceFiles(POLICY)

let treeFindings: Finding[] | undefined

function scanTree(): Finding[] {
	treeFindings ??= treeFiles().flatMap((file) => scan(file, readFileSync(join(REPO_ROOT, file), "utf8")))
	return treeFindings
}

const keyOf = ({ file, text }: { file: string; text: string }): string => `${file}\n${text}`

function review(findings: Finding[], reviewed: readonly Reviewed[] = REVIEWED): { open: Finding[]; stale: Reviewed[] } {
	const pending = new Map<string, Reviewed[]>()
	for (const entry of reviewed) pending.set(keyOf(entry), [...(pending.get(keyOf(entry)) ?? []), entry])
	const open = findings.filter((finding) => pending.get(keyOf(finding))?.pop() === undefined)
	return { open, stale: [...pending.values()].flat() }
}

describe("red text ban (static)", () => {
	test("no text renders in --red", () => {
		expect(treeFiles().length).toBeGreaterThan(200)
		const open = review(scanTree()).open.map(({ file, line, text }) => `${file}:${line}  ${text}`)
		expect(
			open,
			`Error and refusal text is \`txt-danger\`: move each to it. A reviewed entry is only for large text, a glyph or a recorded decision:\n${open.join("\n")}`,
		).toEqual([])
	})

	test("every reviewed entry still matches a finding", () => {
		const stale = review(scanTree()).stale.map(({ file, text }) => `${file}  ${text}`)
		expect(stale, `Reviewed entries that match no finding, to delete:\n${stale.join("\n")}`).toEqual([])
	})

	test.each([
		["a static Text colour", "x.vue", `<template><Text color="red">No</Text></template>`, 1],
		["a bound colour holding the literal", "x.vue", `<template><Text :color="bad ? 'red' : 'body'">No</Text></template>`, 1],
		["a wrapper that forwards its colour", "x.vue", `<template><AddressDisplay color="red" /></template>`, 1],
		["the utility class", "x.vue", `<template><span class="row color--red">No</span></template>`, 1],
		["a bound style colour", "x.vue", `<template><span :style="{ color: 'var(--red)' }">No</span></template>`, 1],
		[
			"a conditional style colour",
			"x.vue",
			`<template><span :style="{ color: bad ? 'var(--red)' : 'inherit' }">No</span></template>`,
			1,
		],
		[
			"a mixed style colour",
			"x.vue",
			`<template><span style="color: color-mix(in srgb, var(--red) 80%, black)">No</span></template>`,
			1,
		],
		["a style array's colour", "x.vue", `<template><span :style="[base, { color: 'var(--red)' }]">No</span></template>`, 1],
		["a flat rule", "x.vue", "<template><span /></template><style module>.e { color: var(--red); }</style>", 1],
		[
			"a nested hover rule",
			"x.vue",
			"<template><span /></template><style module>.r { &:hover span { color: var(--red); } }</style>",
			1,
		],
		["a rule in a stylesheet file", "x.module.css", ".e { color: var(--red, #f03c3c); }", 1],
		["composing the utility", "x.module.css", ".e { composes: color--red from global; }", 1],
		["an icon", "x.vue", `<template><Icon name="info" color="red" /></template>`, 0],
		["a glyph-only note", "x.vue", `<template><ProcessingErrorNote color="red" /></template>`, 0],
		["the danger text colour", "x.vue", `<template><Text color="txt-danger">No</Text></template>`, 0],
		["a red fill", "x.module.css", ".e { background: var(--red); }", 0],
		["a red border", "x.module.css", ".e { border-color: var(--red); }", 0],
		["a bound red border", "x.vue", `<template><span :style="{ borderColor: 'var(--red)' }">No</span></template>`, 0],
		["a static red border", "x.vue", `<template><span style="border-color: var(--red)">No</span></template>`, 0],
		[
			"a red fill beside another colour",
			"x.vue",
			`<template><span :style="{ color: 'white', background: 'var(--red)' }">No</span></template>`,
			0,
		],
		[
			"a red fill in a style array",
			"x.vue",
			`<template><span :style="[{ color: 'white', background: 'var(--red)' }]">No</span></template>`,
			0,
		],
		[
			"a red border in parentheses",
			"x.vue",
			`<template><span :style="({ color: 'white', borderColor: 'var(--red)' })">No</span></template>`,
			0,
		],
		[
			"a colour picked by comparing a tone",
			"x.vue",
			`<template><Text :color="tone === 'red' ? 'txt-danger' : 'body'">No</Text></template>`,
			0,
		],
	])("%s", (_case, file, source, findings) => {
		expect(scan(file, source)).toHaveLength(findings)
	})

	test("a nested rule is keyed by its resolved selector", () => {
		const source = "<template><span /></template><style module>.r { &:hover span { color: var(--red); } }</style>"
		expect(scan("x.vue", source).map(({ text }) => text)).toEqual([".r:hover span { color: var(--red) }"])
	})

	test("an entry no finding consumes is stale, and a matched one is not", () => {
		const entry = { file: "x.vue", text: ".e { color: var(--red) }", why: "a glyph" }
		const finding = { file: "x.vue", line: 1, text: ".e { color: var(--red) }" }
		expect(review([], [entry]).stale).toEqual([entry])
		expect(review([finding], [entry])).toEqual({ open: [], stale: [] })
	})
})
