import ts from "typescript"
import { describe, expect, test } from "vitest"
import {
	DECLARATION,
	GENERATED_TYPES,
	NODE,
	type ParsedSource,
	parseSource,
	STORY_FILE,
	sourceFiles,
	TEST_FILE,
	type TemplateNode,
	type TemplateProp,
	walkElements,
} from "../../scripts/type-roles/source-scan"

/**
 * Static guard: a `Toggle` renders `role="switch"`, which a screen reader announces by its state
 * alone unless it has a name. Every `<Toggle>` a template states (any case) carries a non-empty
 * `aria-label` or `aria-labelledby`, static or bound; a `v-bind` object spread does not count. No
 * source imports `Toggle` or reads `.Toggle`, so an aliased tag or a render function cannot hold a
 * switch this scan never sees: templates take it from the component resolver.
 *
 * Limits: it cannot tell whether an `aria-labelledby` id exists or what text it holds, nor whether a
 * bound expression yields nothing at run time; the page and component tests resolve each name. A
 * template inside a story's string is not read.
 */

const POLICY = { roots: ["apps/extension/src"], exts: ["vue", "ts", "js"], skip: [TEST_FILE, STORY_FILE, DECLARATION, GENERATED_TYPES] }
const NAME_ATTRS = new Set(["aria-label", "aria-labelledby"])
const EMPTY_BINDINGS = new Set(["''", '""', "``", "undefined", "null"])
const DESIGN = /^@nulo\/design(\/|$)/
const TOGGLE_MODULE = /(^|\/)Toggle(\.vue)?$/

type Hit = { file: string; line: number; text: string }

function names(prop: TemplateProp): boolean {
	if (prop.type === NODE.ATTRIBUTE) return NAME_ATTRS.has(prop.name) && (prop.value?.content.trim() ?? "") !== ""
	if (prop.type !== NODE.DIRECTIVE || prop.name !== "bind" || !prop.arg?.isStatic || !NAME_ATTRS.has(prop.arg.content)) return false
	const exp = prop.exp?.content.trim() ?? ""
	return exp !== "" && !EMPTY_BINDINGS.has(exp)
}

const isToggle = (node: TemplateNode): boolean => node.tag?.toLowerCase() === "toggle"

function scanTemplate(file: string, root: TemplateNode, out: Hit[]): number {
	let tags = 0
	walkElements(root, (node) => {
		if (!isToggle(node)) return
		tags++
		if (!(node.props ?? []).some(names))
			out.push({ file, line: node.loc.start.line, text: "a <Toggle> with no aria-label or aria-labelledby" })
	})
	return tags
}

function importsToggle(node: ts.ImportDeclaration): boolean {
	const from = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : ""
	if (TOGGLE_MODULE.test(from)) return true
	const bindings = node.importClause?.namedBindings
	return (
		DESIGN.test(from) &&
		!!bindings &&
		ts.isNamedImports(bindings) &&
		bindings.elements.some((el) => (el.propertyName ?? el.name).text === "Toggle")
	)
}

function scanScript(file: string, content: string, startLine: number, out: Hit[]): void {
	const tree = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const visit = (node: ts.Node): void => {
		const refused =
			(ts.isImportDeclaration(node) && importsToggle(node)) || (ts.isPropertyAccessExpression(node) && node.name.text === "Toggle")
		if (refused) {
			const line = startLine + tree.getLineAndCharacterOfPosition(node.getStart(tree)).line
			out.push({ file, line, text: "a Toggle reached outside a template's tag" })
		}
		ts.forEachChild(node, visit)
	}
	visit(tree)
}

/** Every unnamed `<Toggle>` and every script reach for `Toggle` in one parsed source, and its tag count. */
function scan(parsed: ParsedSource): { hits: Hit[]; tags: number } {
	const hits: Hit[] = []
	for (const block of parsed.scripts) scanScript(parsed.file, block.content, block.startLine, hits)
	const tags = parsed.template ? scanTemplate(parsed.file, parsed.template, hits) : 0
	return { hits, tags }
}

const sfc = (template: string, script = "") => parseSource("x.vue", `<script setup>${script}</script><template>${template}</template>`)

describe("switch names (static)", () => {
	test("every Toggle in the wallet carries a name", () => {
		const results = sourceFiles(POLICY).map((file) => scan(parseSource(file)))
		expect(results.reduce((sum, r) => sum + r.tags, 0)).toBeGreaterThanOrEqual(9)
		const open = results.flatMap((r) => r.hits).map(({ file, line, text }) => `${file}:${line}  ${text}`)
		expect(open, `Name each switch by the words beside it (aria-labelledby to their element):\n${open.join("\n")}`).toEqual([])
	})

	test.each([
		["no name at all", sfc('<Toggle v-model="on" />'), 1],
		["a static aria-label", sfc('<Toggle aria-label="Show fiat values" />'), 0],
		["a blank static aria-label", sfc('<Toggle aria-label="  " />'), 1],
		["a bound aria-labelledby", sfc('<Toggle :aria-labelledby="titleId" />'), 0],
		["a long-form bound aria-label", sfc('<Toggle v-bind:aria-label="row.title" />'), 0],
		["an empty literal bound", sfc("<Toggle :aria-label=\"''\" />"), 1],
		["undefined bound", sfc('<Toggle :aria-labelledby="undefined" />'), 1],
		["an object spread alone", sfc('<Toggle v-bind="attrs" />'), 1],
		["a description alone", sfc('<Toggle aria-describedby="sub" />'), 1],
		["a lower-case tag", sfc("<toggle />"), 1],
		["a named Toggle import", sfc("", 'import { Toggle as Switch } from "@nulo/design"'), 1],
		["the Toggle file imported", parseSource("x.ts", 'import Switch from "@nulo/design/ui/Toggle.vue"'), 1],
		["a namespace read", parseSource("x.ts", 'import * as design from "@nulo/design"\nh(design.Toggle)'), 1],
		["another design import", parseSource("x.ts", 'import { Flex } from "@nulo/design"'), 0],
	])("%s", (_case, parsed, hits) => {
		expect(scan(parsed).hits).toHaveLength(hits)
	})
})
