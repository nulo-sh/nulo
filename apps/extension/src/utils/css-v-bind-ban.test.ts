import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "@vue/compiler-sfc"
import { describe, expect, test } from "vitest"
import { REPO_ROOT, SCAN_ROOTS, type SourcePolicy, sourceFiles } from "../../scripts/type-roles/source-scan"

/**
 * Static ban: no component reads a value through a CSS `v-bind`. The compiler turns one into
 * `useCssVars`, which on every mount and update of each instance queries the whole document and
 * watches its parent's children, so a list of such components pays once per row on every render.
 * Set a custom property inline through `:style` and read it with `var()`.
 *
 * Findings are the compiler's own `descriptor.cssVars`, so a commented-out `v-bind` is none and a
 * template `v-bind` never is. They match `REVIEWED` by file and expression as a multiset.
 */

const POLICY: SourcePolicy = { roots: SCAN_ROOTS, exts: ["vue"] }

type Finding = { file: string; text: string }
type Reviewed = Finding & { why: string }

/** A CSS `v-bind` kept by a recorded decision, the reason in `why`; one entry per finding. */
const REVIEWED: Reviewed[] = []

function scan(file: string, source: string): Finding[] {
	return parse(source, { filename: file, sourceMap: false }).descriptor.cssVars.map((expression) => ({
		file,
		text: `v-bind(${expression})`,
	}))
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

describe("css v-bind ban (static)", () => {
	test("no component reads a value through a CSS v-bind", () => {
		expect(treeFiles().length).toBeGreaterThan(200)
		const open = review(scanTree()).open.map(({ file, text }) => `${file}  ${text}`)
		expect(
			open,
			`A CSS \`v-bind\` costs every instance a document-wide query per render: set a custom property through \`:style\` instead. A reviewed entry is only for a recorded decision:\n${open.join("\n")}`,
		).toEqual([])
	})

	test("every reviewed entry still matches a finding", () => {
		const stale = review(scanTree()).stale.map(({ file, text }) => `${file}  ${text}`)
		expect(stale, `Reviewed entries that match no finding, to delete:\n${stale.join("\n")}`).toEqual([])
	})

	test.each([
		["a v-bind in a style", "<template><span /></template><style module>.e { &:hover { color: v-bind(x); } }</style>", ["v-bind(x)"]],
		[
			"a template v-bind spread and an inline custom property",
			`<template><span v-bind="attrs" :style="{ '--x': x }" /></template><style module>.e { color: var(--x); }</style>`,
			[],
		],
	])("%s", (_case, source, findings) => {
		expect(scan("x.vue", source).map(({ text }) => text)).toEqual(findings)
	})

	test("an entry no finding consumes is stale, and a matched one is not", () => {
		const entry = { file: "x.vue", text: "v-bind(x)", why: "a recorded decision" }
		const finding = { file: "x.vue", text: "v-bind(x)" }
		expect(review([], [entry]).stale).toEqual([entry])
		expect(review([finding], [entry])).toEqual({ open: [], stale: [] })
	})
})
