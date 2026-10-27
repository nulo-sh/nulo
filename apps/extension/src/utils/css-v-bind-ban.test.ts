import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "@vue/compiler-sfc"
import { describe, expect, test } from "vitest"
import {
	DECLARATION,
	GENERATED_TYPES,
	REPO_ROOT,
	SCAN_ROOTS,
	type SourcePolicy,
	STORY_FILE,
	sourceFiles,
	TEST_FILE,
} from "../../scripts/type-roles/source-scan"
import { callsTo } from "../../scripts/type-roles/source-code"

/**
 * Static ban: no component runs `useCssVars`, which on every mount and update of each instance
 * queries the whole document and watches its parent's children, so a list of such components pays
 * once per row on every render. The compiler injects it for any CSS `v-bind`: set a custom property
 * inline through `:style` and read it with `var()` instead.
 *
 * Findings are the compiler's own `descriptor.cssVars` (a commented-out `v-bind` is none, a template
 * `v-bind` never one) and each call to `useCssVars` in a script; each matches one `REVIEWED` entry by file and text.
 */

const POLICY: SourcePolicy = {
	roots: SCAN_ROOTS,
	exts: ["vue", "ts", "js"],
	skip: [TEST_FILE, STORY_FILE, DECLARATION, GENERATED_TYPES],
}
const HAND_CALL = /(^|\.)useCssVars$/

type Finding = { file: string; text: string }
type Reviewed = Finding & { why: string }

/** A `useCssVars` kept by a recorded decision, the reason in `why`; one entry per finding. */
const REVIEWED: Reviewed[] = []

function scan(file: string, source: string): Finding[] {
	// A file holds a finding only if it spells `useCssVars` or `v-bind`, or a template hides a letter
	// behind a `&#` reference, which the compiler decodes.
	if (!["useCssVars", "v-bind", "&#"].some((word) => source.includes(word))) return []
	const calls = callsTo(file, source, HAND_CALL).map(() => ({ file, text: "useCssVars(…)" }))
	if (!file.endsWith(".vue")) return calls
	const vars = parse(source, { filename: file, sourceMap: false }).descriptor.cssVars
	return [...vars.map((expression) => ({ file, text: `v-bind(${expression})` })), ...calls]
}

const treeFiles = (): string[] => sourceFiles(POLICY)

let treeFindings: Finding[] | undefined

function scanTree(): Finding[] {
	treeFindings ??= treeFiles().flatMap((file) => scan(file, readFileSync(join(REPO_ROOT, file), "utf8")))
	return treeFindings
}

const keyOf = ({ file, text }: Finding): string => `${file}\n${text}`

function review(findings: Finding[], reviewed: readonly Reviewed[] = REVIEWED): { open: Finding[]; stale: Reviewed[] } {
	const pending = new Map<string, Reviewed[]>()
	for (const entry of reviewed) pending.set(keyOf(entry), [...(pending.get(keyOf(entry)) ?? []), entry])
	const open = findings.filter((finding) => pending.get(keyOf(finding))?.pop() === undefined)
	return { open, stale: [...pending.values()].flat() }
}

describe("css vars ban (static)", () => {
	test("no component runs useCssVars: no CSS v-bind, no hand-written call", () => {
		expect(treeFiles().length).toBeGreaterThan(200)
		const open = review(scanTree()).open.map(({ file, text }) => `${file}  ${text}`)
		expect(
			open,
			`\`useCssVars\` (which every CSS \`v-bind\` compiles to) costs each instance a document-wide query per render: set a custom property through \`:style\` instead. A reviewed entry is only for a recorded decision:\n${open.join("\n")}`,
		).toEqual([])
	})

	test("every reviewed entry still matches a finding", () => {
		const stale = review(scanTree()).stale.map(({ file, text }) => `${file}  ${text}`)
		expect(stale, `Reviewed entries that match no finding, to delete:\n${stale.join("\n")}`).toEqual([])
	})

	test.each([
		[
			"a v-bind in a style",
			"x.vue",
			"<template><span /></template><style module>.e { &:hover { color: v-bind(x); } }</style>",
			["v-bind(x)"],
		],
		["a hand-written call in a component", "x.vue", "<script setup>useCssVars(() => ({ x: 1 }))</script>", ["useCssVars(…)"]],
		[
			"a hand-written call in a composable, a comment before its arguments",
			"x.ts",
			'import { useCssVars } from "vue"\nexport const use = () => useCssVars /* why */ (() => ({}))',
			["useCssVars(…)"],
		],
		[
			"a hand-written call a template spells with a character reference",
			"x.vue",
			'<template><span :title="&#117;seCssVars(f)" /></template>',
			["useCssVars(…)"],
		],
		["a comment and a string naming it", "x.ts", '// useCssVars()\nexport const hint = "useCssVars()"', []],
		[
			"a template v-bind spread and an inline custom property",
			"x.vue",
			`<template><span v-bind="attrs" :style="{ '--x': x }" /></template><style module>.e { color: var(--x); }</style>`,
			[],
		],
	])("%s", (_case, file, source, findings) => {
		expect(scan(file, source).map(({ text }) => text)).toEqual(findings)
	})

	test("a finding no entry matches is open, an entry no finding consumes is stale, and a matched pair is neither", () => {
		const entry = { file: "x.vue", text: "v-bind(x)", why: "a recorded decision" }
		const finding = { file: "x.vue", text: "v-bind(x)" }
		expect(review([finding], []).open).toEqual([finding])
		expect(review([], [entry]).stale).toEqual([entry])
		expect(review([finding], [entry])).toEqual({ open: [], stale: [] })
	})
})
