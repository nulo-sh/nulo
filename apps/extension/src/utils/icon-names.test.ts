import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { glyphs } from "@nulo/design/core/glyphs.ts"
import { parse as parseSfc } from "@vue/compiler-sfc"
import ts from "typescript"
import { describe, expect, test } from "vitest"

/**
 * Static guard: `Icon` draws an unknown name blank, so every glyph name a template states must be a
 * key of `glyphs`.
 *
 * It reads the `name` of `<Icon>` and any attribute named `icon`, `*Icon` or `*-icon`, static or
 * bound, and the `default` of a prop so named. In a bound expression only value positions count:
 * both branches of `?:`, the right of `&&`, both sides of `||` and `??`. An `<Icon :name>` bound to
 * anything else must forward a prop of its own SFC named like an icon, or sit in a `lang="ts"` SFC,
 * where vue-tsc checks it against `GlyphName`.
 *
 * Limits: a forwarded prop is checked only where a template states it, so a non-literal passed to a
 * forwarding component from a plain-JS SFC is unchecked; a name built by concatenation or returned
 * from a helper is checked only by its type.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..")
const SCAN_ROOTS = ["apps/extension/src", "packages/design/src"]
const SCANNED = /\.(ts|js|vue|css)$/
const SKIPPED = /\.test\.[jt]s$|\.d\.ts$/

/** compiler-core's `NodeTypes`, which compiler-sfc does not re-export. */
const ELEMENT = 1
const ATTRIBUTE = 6
const DIRECTIVE = 7

const ICON_ATTR = /^(icon|.+Icon|.+-icon)$/
const RETIRED = [/<MaterialIcon\b/, /\bmaterialIcon\b|\bmaterial-icon\b/, /<StaleIcon\b/, /material-symbols/]

type Hit = { file: string; line: number; text: string }
type Expression = { content: string; loc: { start: { line: number } } }
type TemplateProp = { type: number; name: string; value?: Expression; arg?: { content: string; isStatic?: boolean }; exp?: Expression }
type TemplateNode = { type: number; tag?: string; props?: readonly TemplateProp[]; children?: readonly unknown[] }
type Sfc = { file: string; isTs: boolean; props: Set<string>; out: Hit[] }

const isGlyph = (name: string): boolean => Object.hasOwn(glyphs, name)

/** The leaves an expression can evaluate to: string literals, and every other leaf's source. */
function leaves(node: ts.Expression): { literals: string[]; others: ts.Expression[] } {
	if (ts.isParenthesizedExpression(node)) return leaves(node.expression)
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { literals: [node.text], others: [] }
	const both = (a: ts.Expression, b: ts.Expression) => {
		const [l, r] = [leaves(a), leaves(b)]
		return { literals: [...l.literals, ...r.literals], others: [...l.others, ...r.others] }
	}
	if (ts.isConditionalExpression(node)) return both(node.whenTrue, node.whenFalse)
	if (ts.isBinaryExpression(node)) {
		const op = node.operatorToken.kind
		if (op === ts.SyntaxKind.AmpersandAmpersandToken) return leaves(node.right)
		if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return both(node.left, node.right)
	}
	return { literals: [], others: [node] }
}

function parseExpression(source: string): ts.Expression {
	const tree = ts.createSourceFile("x.ts", `(${source})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const [statement] = tree.statements
	if (!statement || !ts.isExpressionStatement(statement)) throw new Error(`unparsable binding: ${source}`)
	return statement.expression
}

/** The prop an expression forwards: `icon` or `props.icon`. */
function forwardedProp(node: ts.Expression): string | undefined {
	if (ts.isIdentifier(node)) return node.text
	if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "props") return node.name.text
	return undefined
}

function checkLiteral(sfc: Sfc, line: number, name: string): void {
	if (!isGlyph(name)) sfc.out.push({ file: sfc.file, line, text: `unknown glyph "${name}"` })
}

function checkBinding(sfc: Sfc, exp: Expression, isIconName: boolean): void {
	const { literals, others } = leaves(parseExpression(exp.content))
	for (const name of literals) checkLiteral(sfc, exp.loc.start.line, name)
	if (!isIconName || sfc.isTs) return
	for (const other of others) {
		const prop = forwardedProp(other)
		if (prop && ICON_ATTR.test(prop) && sfc.props.has(prop)) continue
		sfc.out.push({ file: sfc.file, line: exp.loc.start.line, text: `untyped <Icon :name="${exp.content}">` })
	}
}

/** The attribute a prop sets: its name, or a `v-bind`'s static argument. */
const targetOf = (prop: TemplateProp): string | undefined =>
	prop.type === ATTRIBUTE ? prop.name : prop.arg?.isStatic ? prop.arg.content : undefined

function scanProp(sfc: Sfc, tag: string | undefined, prop: TemplateProp): void {
	const target = targetOf(prop)
	if (target === undefined) return
	const isIconName = tag === "Icon" && target === "name"
	if (!isIconName && !ICON_ATTR.test(target)) return
	if (prop.type === ATTRIBUTE && prop.value) checkLiteral(sfc, prop.value.loc.start.line, prop.value.content)
	if (prop.type === DIRECTIVE && prop.name === "bind" && prop.exp) checkBinding(sfc, prop.exp, isIconName)
}

function scanTemplate(sfc: Sfc, node: TemplateNode): void {
	if (node.type === ELEMENT) for (const prop of node.props ?? []) scanProp(sfc, node.tag, prop)
	for (const child of node.children ?? []) if (typeof child === "object" && child) scanTemplate(sfc, child as TemplateNode)
}

const propName = (p: ts.ObjectLiteralElementLike): string | undefined =>
	p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined

function checkDefault(sfc: Sfc, option: ts.ObjectLiteralElementLike, lineOf: (node: ts.Node) => number): void {
	if (!ts.isPropertyAssignment(option) || !ts.isObjectLiteralExpression(option.initializer)) return
	const fallback = option.initializer.properties.find((q) => propName(q) === "default")
	if (fallback && ts.isPropertyAssignment(fallback) && ts.isStringLiteral(fallback.initializer)) {
		checkLiteral(sfc, lineOf(fallback), fallback.initializer.text)
	}
}

const isDefineProps = (node: ts.Node): node is ts.CallExpression =>
	ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "defineProps"

/** The props `defineProps` declares, checking each icon prop's literal `default`. */
function scanProps(sfc: Sfc, source: string, firstLine: number): void {
	const tree = ts.createSourceFile(sfc.file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const lineOf = (node: ts.Node) => firstLine + tree.getLineAndCharacterOfPosition(node.getStart(tree)).line
	const visit = (node: ts.Node): void => {
		const [options] = isDefineProps(node) ? node.arguments : []
		for (const option of options && ts.isObjectLiteralExpression(options) ? options.properties : []) {
			const name = propName(option)
			if (name) sfc.props.add(name)
			if (name && ICON_ATTR.test(name)) checkDefault(sfc, option, lineOf)
		}
		ts.forEachChild(node, visit)
	}
	visit(tree)
}

/** Every unknown glyph name, untyped `<Icon :name>` and retired icon reference in `source`. */
function scan(file: string, source: string): Hit[] {
	const out: Hit[] = []
	for (const [i, text] of source.split("\n").entries()) {
		for (const retired of RETIRED) if (retired.test(text)) out.push({ file, line: i + 1, text: `retired: ${text.trim()}` })
	}
	if (!file.endsWith(".vue")) return out
	const { descriptor } = parseSfc(source, { filename: file, sourceMap: false })
	const scripts = [descriptor.script, descriptor.scriptSetup].filter((block) => block !== null)
	const sfc: Sfc = { file, isTs: scripts.some((block) => block.lang === "ts"), props: new Set(), out }
	for (const block of scripts) scanProps(sfc, block.content, block.loc.start.line)
	if (descriptor.template?.ast) scanTemplate(sfc, descriptor.template.ast as unknown as TemplateNode)
	return out
}

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name)
		if (statSync(full).isDirectory()) walk(full, out)
		else if (SCANNED.test(name) && !SKIPPED.test(name)) out.push(full)
	}
	return out
}

const treeFiles = (): string[] => SCAN_ROOTS.flatMap((root) => walk(join(REPO_ROOT, root)))

const tsSfc = (template: string, script = "") => `<script setup lang="ts">${script}</script><template>${template}</template>`
const jsSfc = (template: string, script = "") => `<script setup>${script}</script><template>${template}</template>`

describe("icon names (static)", () => {
	test("every glyph name a template states is drawn, and every bound Icon name is typed", () => {
		const files = treeFiles()
		expect(files.filter((file) => file.endsWith(".vue")).length).toBeGreaterThan(200)
		const hits = files.flatMap((full) => scan(relative(REPO_ROOT, full), readFileSync(full, "utf8")))
		const open = hits.map(({ file, line, text }) => `${file}:${line}  ${text}`)
		expect(open, `Name a key of \`glyphs\` (packages/design/src/core/glyphs.ts), or type the binding:\n${open.join("\n")}`).toEqual([])
	})

	test.each([
		["a static Icon name", jsSfc('<Icon name="check-circle" />'), 1],
		["a known static name", jsSfc('<Icon name="check" />'), 0],
		["a static icon attribute on any tag", jsSfc('<Row icon="expand_more" />'), 1],
		["a kebab *-icon attribute", jsSfc('<Row leading-icon="arrow_back" />'), 1],
		["a camel *Icon binding", jsSfc("<Row :leftIcon=\"'nope'\" />"), 1],
		["both branches of a conditional", jsSfc("<Icon :name=\"on ? 'eye' : 'visibility'\" />"), 1],
		["the right of &&", jsSfc("<Icon :name=\"on && 'nope'\" />"), 1],
		["both sides of ??", jsSfc("<Row :icon=\"a ?? 'nope'\" />"), 1],
		["an icon prop's default", jsSfc("", 'defineProps({ icon: { type: String, default: "nope" } })'), 1],
		["a forwarded prop in a JS SFC", jsSfc('<Icon :name="icon" />', "defineProps({ icon: String })"), 0],
		[
			"props.icon in a JS SFC",
			jsSfc('<Icon :name="props.icon" />', "const props = defineProps({ leadingIcon: String, icon: String })"),
			0,
		],
		["an undeclared name in a JS SFC", jsSfc('<Icon :name="row.icon" />'), 1],
		["a computed in a JS SFC", jsSfc('<Icon :name="glyph" />', "const glyph = computed(() => 'x')"), 1],
		["a computed in a TS SFC", tsSfc('<Icon :name="glyph" />', "const glyph = computed<GlyphName>(() => 'check')"), 0],
		["a MaterialIcon tag", jsSfc('<MaterialIcon name="lock" />'), 1],
		["a materialIcon attribute", jsSfc('<SettingItem materialIcon="lock" />'), 1],
		["a StaleIcon tag", jsSfc('<StaleIcon name="x" />'), 1],
	])("%s", (_case, source, hits) => {
		expect(scan("x.vue", source)).toHaveLength(hits)
	})

	test("a material-symbols class anywhere", () => {
		expect(scan("x.css", ".material-symbols-outlined { font-size: 1em; }")).toHaveLength(1)
	})
})
