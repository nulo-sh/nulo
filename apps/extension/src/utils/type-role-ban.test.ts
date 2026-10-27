// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the self-tests feed the scanner Vue and script snippets whose template literals are plain strings.

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fontSizes, MIN_MONO_PX, MIN_TEXT_PX, siteSizedTypeRoles, type TypeRole, typeRoleNames, typeRoles } from "@nulo/design/tokens"
import postcss, { type Container, type Declaration, type Rule } from "postcss"
import ts from "typescript"
import { describe, expect, test } from "vitest"
import { CARVE_OUTS, type CarveOut, OVERRIDES, type Override, type RuleId } from "../../scripts/type-roles/exceptions"
import {
	boundAttr,
	type Expression,
	enclosingRule,
	NODE,
	type ParsedSource,
	parseSource,
	resolveSelector,
	type StyleSheet,
	sourceFiles,
	splitTopLevel,
	staticAttr,
	type TemplateNode,
	type TemplateProp,
	textTagNames,
	walkTemplate,
} from "../../scripts/type-roles/source-scan"

/**
 * Static ban: a face, letter spacing, upper case or text size comes only from a type role
 * (`type--<role>`, generated from `@nulo/design`'s token contract), reached through
 * `composes: type--<role> from global`, a static class or `<Text variant>`.
 *
 * Rules, in the order each declaration, prop, key or string is judged (one finding each): face,
 * tracking, case (upper case), size (off the scale, or under `MIN_TEXT_PX`, or mono under
 * `MIN_MONO_PX`), text-prop (`size`, `weight`, `mono`, `tabular` on a `<Text>`), tie (a role
 * property at the role's specificity), faceless (a size or weight outside a role, in module CSS or
 * a bound style), site-size (a role property other than the size in the module class of a
 * site-sized `<Text variant>`), identifier (a template `trimAddress(` outside a mono role), role (a
 * `type--` name in `composes` or a static class, or a literal of `<Text variant>`, `titleVariant` or
 * `descriptionVariant`, that names no role; a bound literal counts only where the expression can
 * evaluate to it). `font` and `font-variant` are judged by their longhands. Findings match
 * `type-role-ban.reviewed.json` by file, rule and text as a multiset: a moved line needs no edit,
 * a second identical pick its own entry.
 *
 * Blind spots: dynamic class expressions (`Button`'s `getStyles()`, computed class arrays, a
 * `v-bind` spread), composition chains that cross files, compound and descendant selectors whose
 * target element cannot be resolved, `trimAddress(` calls in script blocks, and styles set from
 * script at run time. The computed-style sweep (`tests/e2e/fixtures/type-roles.ts`) covers them on
 * every board's surfaces and on its listed pages in CI. Neither sees an element that should carry a
 * role and carries none, or a valid role on the wrong job, unless it is a generated identifier site.
 *
 * `TYPE_ROLE_BAN_DUMP=<path>` writes every current finding in the baseline's shape, role "TODO".
 */

const REVIEWED_PATH = join(__dirname, "type-role-ban.reviewed.json")
const RULE_ORDER: readonly RuleId[] = [
	"face",
	"tracking",
	"case",
	"size",
	"text-prop",
	"tie",
	"faceless",
	"site-size",
	"identifier",
	"role",
]
/** An override silences only the rules a compound declaration trips; a tie or a prop is never overridden. */
const OVERRIDABLE: ReadonlySet<RuleId> = new Set(["face", "tracking", "case", "size", "faceless"])
const ROLE_NAMES: ReadonlySet<string> = new Set(typeRoleNames)
const SITE_SIZED: ReadonlySet<string> = new Set(siteSizedTypeRoles)
const SCALE: ReadonlySet<number> = new Set<number>(fontSizes)
/** The roles an address, hash or id may render in. */
const IDENTIFIER_ROLES: ReadonlySet<string> = new Set(["data-lead", "meta", "input-data"])
/** Components that pick the role of the identifier they are given; the e2e sweep reads what they render. */
const IDENTIFIER_COMPONENTS: ReadonlySet<string> = new Set(["AddressDisplay"])
const TEXT_PROPS: ReadonlySet<string> = new Set(["size", "weight", "mono", "tabular"])
/** What a role sets; a shorthand sets its longhands. */
const ROLE_PROPERTIES: ReadonlySet<string> = new Set([
	"font-family",
	"font-size",
	"font-weight",
	"letter-spacing",
	"text-transform",
	"font-variant-numeric",
	"font",
	"font-variant",
])
/** Style keys judged in any script; template `:style` objects are judged on every role property. */
const SCRIPT_KEYS: ReadonlySet<string> = new Set(["font", "font-family", "font-size", "font-weight", "letter-spacing", "text-transform"])
const MONO_FAMILY = /--font-mono|\bmonospace\b/
const CSS_WIDE = /^(inherit|initial|unset|revert|revert-layer)$/
const FONT_SIZE_TOKEN = /^(\d*\.?\d+(px|em|rem|%|pt|ex|ch|vw|vh)|calc\(.*\)|(x{1,3}-)?(small|large)|medium|larger|smaller)(\/|$)/
const FONT_WEIGHT_TOKEN = /^(bold|bolder|lighter|[1-9]\d{2})$/
const STRING_PICKS: readonly (readonly [RuleId, RegExp])[] = [
	["face", /font-family\s*:\s*(?!inherit\b)[^;"'`]*/i],
	["tracking", /letter-spacing\s*:\s*[^;"'`]*/i],
	["case", /text-transform\s*:\s*uppercase/i],
]
/** A `font` shorthand in a style string, judged through its longhands; a later one wins, so each is judged. */
const STRING_FONT = /(?<![\w-])font\s*:\s*([^;"'`]*)/gi

type Finding = { file: string; rule: RuleId; text: string; at: string; line: number; selector?: string; hard?: string }
type Entry = { rule: RuleId; text: string; role: TypeRole | "carve-out" | "drop"; at: string }
type Reviewed = Record<string, Entry[]>
/** The role an element or a rule carries; `viaText` when it comes from a `<Text variant>`. */
type Carrier = { roles: readonly TypeRole[]; viaText: boolean }
type Judged = { module: boolean; carrier?: Carrier; mono: boolean }
type Longhand = readonly [property: string, value: string]
type Scan = { file: string; findings: Finding[]; overrides: readonly Override[]; matched: Set<Override> }
type ScriptContext = { module: boolean; keys: ReadonlySet<string>; firstLine: number; carrier?: Carrier; at?: string }
type TemplateScan = { scan: Scan; textNames: ReadonlySet<string>; composed: ReadonlyMap<string, TypeRole>; links: Map<string, Carrier> }

const normalize = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").trim()
const isRole = (name: string): name is TypeRole => ROLE_NAMES.has(name)
const isMonoRole = (role: TypeRole): boolean => typeRoles[role].family === "--font-mono"
const carrierMono = (carrier: Carrier | undefined): boolean => carrier?.roles.some(isMonoRole) ?? false
const siteSized = (carrier: Carrier): boolean => carrier.roles.every((role) => SITE_SIZED.has(role))
/** The site-size case: the module class of a site-sized `<Text variant>` may set the size and no other role property. */
const siteSizeCase = (carrier: Carrier): boolean => carrier.viaText && siteSized(carrier)
const setsRoleProperty = (property: string, carrier: Carrier): boolean =>
	property === "font-size" ? !siteSized(carrier) : ROLE_PROPERTIES.has(property)
const cssName = (key: string): string => (key.includes("-") ? key.toLowerCase() : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))

// ── Judging one declaration ─────────────────────────────────────────────────────────────────

function fontLonghands(value: string): Longhand[] {
	const tokens = splitTopLevel(value.replace(/\s*\/\s*/g, "/"), /\s/)
	const at = tokens.findIndex((token) => FONT_SIZE_TOKEN.test(token))
	if (at < 0) return [["font-family", value]]
	const hands: Longhand[] = [
		["font-size", tokens[at].split("/")[0]],
		["font-family", tokens.slice(at + 1).join(" ")],
	]
	const weight = tokens.slice(0, at).find((token) => FONT_WEIGHT_TOKEN.test(token))
	if (weight) hands.push(["font-weight", weight])
	return hands
}

function longhands(property: string, value: string): Longhand[] {
	if (property === "font-variant") return [["font-variant-numeric", value]]
	if (property !== "font") return [[property, value]]
	if (CSS_WIDE.test(value)) return ["font-family", "font-size", "font-weight"].map((hand) => [hand, value])
	return fontLonghands(value)
}

function offScale(value: string, mono: boolean): boolean {
	return [...value.matchAll(/(\d*\.?\d+)px/g)].some(([, digits]) => {
		const px = Number(digits)
		return !SCALE.has(px) || px < MIN_TEXT_PX || (mono && px < MIN_MONO_PX)
	})
}

const hasHand = (hands: readonly Longhand[], property: string, test: (value: string) => boolean): boolean =>
	hands.some(([hand, value]) => hand === property && test(value))

type Check = (property: string, value: string, hands: readonly Longhand[], judged: Judged) => boolean

const CHECKS: Record<RuleId, Check> = {
	face: (_property, value, hands) => /var\(--font-/.test(value) || hasHand(hands, "font-family", (family) => family !== "inherit"),
	tracking: (_property, _value, hands) => hands.some(([hand]) => hand === "letter-spacing"),
	case: (_property, _value, hands) => hasHand(hands, "text-transform", (value) => /\buppercase\b/.test(value)),
	size: (_property, _value, hands, { mono }) => hasHand(hands, "font-size", (value) => offScale(value, mono)),
	"text-prop": () => false,
	tie: (property, _value, _hands, { carrier }) => carrier !== undefined && !siteSizeCase(carrier) && setsRoleProperty(property, carrier),
	faceless: (_property, _value, hands, { module, carrier }) =>
		module &&
		carrier === undefined &&
		hands.some(([hand, value]) => (hand === "font-size" || hand === "font-weight") && !CSS_WIDE.test(value)),
	"site-size": (property, _value, _hands, { carrier }) =>
		carrier !== undefined && siteSizeCase(carrier) && setsRoleProperty(property, carrier),
	identifier: () => false,
	role: () => false,
}

function judge(property: string, value: string, judged: Judged): RuleId | undefined {
	const hands = longhands(property, value)
	return RULE_ORDER.find((rule) => CHECKS[rule](property, value, hands, judged))
}

// ── Stylesheets ─────────────────────────────────────────────────────────────────────────────

/** A rule's own declarations, those inside its at-rules included, nested rules excluded. */
function ownDeclarations(container: Container): Declaration[] {
	return (container.nodes ?? []).flatMap((node) => {
		if (node.type === "decl") return [node]
		return node.type === "atrule" ? ownDeclarations(node) : []
	})
}

const NOT_A_ROLE = "not a role"
const FROM_GLOBAL = /\sfrom\s+global\s*$/

/** The `type--` names in a list of class names, prefix dropped. */
const typeNames = (names: readonly string[]): string[] =>
	names.filter((name) => name.startsWith("type--")).map((name) => name.slice("type--".length))

/** The `type--` names a `composes` declaration takes from global. */
const composedNames = (decl: Declaration): string[] =>
	decl.prop === "composes" && FROM_GLOBAL.test(decl.value) ? typeNames(decl.value.replace(FROM_GLOBAL, "").split(/\s+/)) : []

const composedRole = (rule: Rule): TypeRole | undefined => ownDeclarations(rule).flatMap(composedNames).find(isRole)

const SINGLE_CLASS = /^\.([\w-]+)$/

function ruleCarrier(rule: Rule, selector: string, links: ReadonlyMap<string, Carrier>): Carrier | undefined {
	const role = composedRole(rule)
	if (role) return { roles: [role], viaText: false }
	const name = SINGLE_CLASS.exec(selector)?.[1]
	return name === undefined ? undefined : links.get(name)
}

const familyIsMono = (decl: Declaration): boolean => (decl.prop === "font-family" || decl.prop === "font") && MONO_FAMILY.test(decl.value)

function ruleMono(rule: Rule, carrier: Carrier | undefined, memo: Map<Rule, boolean>): boolean {
	const parent = enclosingRule(rule)
	const mono = carrierMono(carrier) || ownDeclarations(rule).some(familyIsMono) || (parent !== undefined && memo.get(parent) === true)
	memo.set(rule, mono)
	return mono
}

function matchOverride(scan: Scan, selector: string, property: string, value: string): Override | undefined {
	const found = scan.overrides.find(
		(entry) =>
			entry.file === scan.file &&
			normalize(entry.selector) === normalize(selector) &&
			entry.property === property &&
			normalize(entry.value) === normalize(value),
	)
	if (found) scan.matched.add(found)
	return found
}

function scanComposes(scan: Scan, decl: Declaration, selector: string, line: number): void {
	for (const name of composedNames(decl).filter((name) => !isRole(name))) {
		const text = normalize(`composes: type--${name}`)
		scan.findings.push({ file: scan.file, rule: "role", text, at: selector, line, selector, hard: NOT_A_ROLE })
	}
}

function scanSheet(scan: Scan, sheet: StyleSheet, links: ReadonlyMap<string, Carrier>): void {
	const memo = new Map<Rule, boolean>()
	sheet.root.walkRules((rule) => {
		const selector = resolveSelector(rule)
		const carrier = ruleCarrier(rule, selector, links)
		const judged: Judged = { module: sheet.module, carrier, mono: ruleMono(rule, carrier, memo) }
		for (const decl of ownDeclarations(rule)) {
			const property = decl.prop.toLowerCase()
			const line = sheet.startLine + (decl.source?.start?.line ?? 1) - 1
			scanComposes(scan, decl, selector, line)
			if (property === "composes") continue
			const found = judge(property, decl.value, judged)
			const override = matchOverride(scan, selector, property, decl.value)
			if (!found || (override && OVERRIDABLE.has(found))) continue
			const text = normalize(`${decl.prop}: ${decl.value}${decl.important ? " !important" : ""}`)
			scan.findings.push({ file: scan.file, rule: found, text, at: selector, line, selector })
		}
	})
}

/** Single-class module rules that compose a role, by class name. */
function composedClasses(parsed: ParsedSource): Map<string, TypeRole> {
	const composed = new Map<string, TypeRole>()
	for (const sheet of parsed.styles.filter((style) => style.module)) {
		sheet.root.walkRules((rule) => {
			const name = SINGLE_CLASS.exec(resolveSelector(rule))?.[1]
			const role = composedRole(rule)
			if (name !== undefined && role) composed.set(name, role)
		})
	}
	return composed
}

// ── Scripts and bound expressions ───────────────────────────────────────────────────────────

function literalText(node: ts.Node): string | undefined {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
	if (!ts.isTemplateExpression(node)) return undefined
	return node.head.text + node.templateSpans.map((span) => `\${…}${span.literal.text}`).join("")
}

/** The variable or property a script value sits under, as a hint. */
function nearestName(node: ts.Node | undefined): string {
	for (let at = node; at; at = at.parent) {
		if (ts.isPropertyAssignment(at) || ts.isVariableDeclaration(at))
			return ts.isIdentifier(at.name) || ts.isStringLiteral(at.name) ? at.name.text : ""
	}
	return ""
}

function keyName(property: ts.ObjectLiteralElementLike): string | undefined {
	if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return undefined
	return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : undefined
}

function keyValue(property: ts.ObjectLiteralElementLike, tree: ts.SourceFile): { judged: string; source: string } {
	if (!ts.isPropertyAssignment(property))
		return { judged: property.name?.getText(tree) ?? "", source: property.name?.getText(tree) ?? "" }
	const source = property.initializer.getText(tree)
	return { judged: literalText(property.initializer) ?? source, source }
}

function scanStyleKeys(scan: Scan, tree: ts.SourceFile, object: ts.ObjectLiteralExpression, context: ScriptContext): void {
	const keyed = object.properties.flatMap((property) => {
		const key = keyName(property)
		return key !== undefined && context.keys.has(cssName(key)) ? [{ key, property, ...keyValue(property, tree) }] : []
	})
	const mono =
		carrierMono(context.carrier) ||
		keyed.some(({ key, judged }) => ["font", "font-family"].includes(cssName(key)) && MONO_FAMILY.test(judged))
	for (const { key, property, judged, source } of keyed) {
		const found = judge(cssName(key), judged, { module: context.module, carrier: context.carrier, mono })
		if (!found) continue
		const line = context.firstLine + tree.getLineAndCharacterOfPosition(property.getStart(tree)).line
		scan.findings.push({
			file: scan.file,
			rule: found,
			text: normalize(`${key}: ${source}`),
			at: context.at ?? nearestName(object.parent),
			line,
		})
	}
}

function stringPick(text: string, context: ScriptContext): readonly [RuleId, string] | undefined {
	for (const [rule, pattern] of STRING_PICKS) {
		const match = pattern.exec(text)
		if (match) return [rule, match[0]]
	}
	for (const font of text.matchAll(STRING_FONT)) {
		const value = font[1].trim()
		const rule = judge("font", value, { module: context.module, carrier: context.carrier, mono: MONO_FAMILY.test(value) })
		if (rule) return [rule, font[0]]
	}
	return undefined
}

function scanString(scan: Scan, tree: ts.SourceFile, node: ts.Node, context: ScriptContext): void {
	const text = literalText(node)
	const pick = text === undefined ? undefined : stringPick(text, context)
	if (!pick) return
	const line = context.firstLine + tree.getLineAndCharacterOfPosition(node.getStart(tree)).line
	scan.findings.push({ file: scan.file, rule: pick[0], text: normalize(pick[1]), at: context.at ?? nearestName(node.parent), line })
}

/** Every judged key and style string spells font, letter or transform in some case, unless an escape hides a letter. */
const MAY_PICK = /font|letter|transform|\\/i

function scanScript(scan: Scan, source: string, context: ScriptContext): void {
	if (!MAY_PICK.test(source)) return
	const tree = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const visit = (node: ts.Node): void => {
		if (ts.isObjectLiteralExpression(node)) scanStyleKeys(scan, tree, node, context)
		else scanString(scan, tree, node, context)
		ts.forEachChild(node, visit)
	}
	visit(tree)
}

function trimCalls(expression: string): string[] {
	const tree = ts.createSourceFile("expression.ts", `(${expression})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const calls: string[] = []
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && /(^|\.)trimAddress$/.test(node.expression.getText(tree))) calls.push(node.getText(tree))
		ts.forEachChild(node, visit)
	}
	visit(tree)
	return calls
}

// ── Templates ───────────────────────────────────────────────────────────────────────────────

function isExpression(value: unknown): value is Expression {
	return typeof value === "object" && value !== null && "content" in value && typeof value.content === "string" && "loc" in value
}

/** The tag plus its testid, else its first 30 characters of text, as a hint. */
function elementAt(node: TemplateNode | undefined): string {
	if (!node) return ""
	const testid = staticAttr(node, "data-testid") ?? boundAttr(node, "data-testid")
	if (testid) return `${node.tag}[data-testid=${testid}]`
	const words = (node.children ?? [])
		.flatMap((child) => {
			if (typeof child !== "object") return []
			if (child.type === NODE.TEXT && typeof child.content === "string") return [child.content]
			return child.type === NODE.INTERPOLATION && isExpression(child.content) ? [`{{ ${child.content.content} }}`] : []
		})
		.join(" ")
	const text = words.replace(/\s+/g, " ").trim().slice(0, 30)
	return text ? `${node.tag} "${text}"` : (node.tag ?? "")
}

const propName = (prop: TemplateProp): string | undefined =>
	prop.type === NODE.ATTRIBUTE ? prop.name : prop.name === "bind" ? prop.arg?.content : undefined

function propSource(prop: TemplateProp): string {
	if (prop.type === NODE.ATTRIBUTE) return prop.value ? `${prop.name}="${prop.value.content}"` : prop.name
	return prop.exp ? `:${prop.arg?.content}="${prop.exp.content}"` : `:${prop.arg?.content}`
}

const isWrapper = (node: ts.Expression): node is ts.Expression & { expression: ts.Expression } =>
	ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)

function literalResults(node: ts.Expression): string[] {
	if (isWrapper(node) || ts.isTypeAssertionExpression(node)) return literalResults(node.expression)
	if (ts.isConditionalExpression(node)) return [...literalResults(node.whenTrue), ...literalResults(node.whenFalse)]
	if (ts.isBinaryExpression(node)) return operandResults(node)
	return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? [node.text] : []
}

/** The left of `&&` is a result only when falsy, and of `||` only when truthy: an empty string names no role. */
function operandResults(node: ts.BinaryExpression): string[] {
	const operator = node.operatorToken.kind
	if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return literalResults(node.right)
	if (operator === ts.SyntaxKind.BarBarToken) return [...literalResults(node.left).filter(Boolean), ...literalResults(node.right)]
	return operator === ts.SyntaxKind.QuestionQuestionToken ? [...literalResults(node.left), ...literalResults(node.right)] : []
}

/** The string literals an expression can evaluate to: the whole of it, or a branch of a conditional, `&&` or a fallback. */
function resultLiterals(expression: string | undefined): string[] {
	if (expression === undefined) return []
	const tree = ts.createSourceFile("expression.ts", `(${expression})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const [statement] = tree.statements
	return statement && ts.isExpressionStatement(statement) ? literalResults(statement.expression) : []
}

/** Names a static attribute gives, or that its binding can evaluate to. */
function attrNames(node: TemplateNode, name: string): string[] {
	const value = staticAttr(node, name)
	return [...(value === undefined ? [] : [value]), ...resultLiterals(boundAttr(node, name))]
}

const namedRoles = (node: TemplateNode, name: string): TypeRole[] => attrNames(node, name).filter(isRole)

const classTypeNames = (node: TemplateNode): string[] => typeNames((staticAttr(node, "class") ?? "").split(/\s+/))

function elementCarrier(node: TemplateNode, textNames: ReadonlySet<string>): Carrier | undefined {
	const fromClass = classTypeNames(node).filter(isRole)
	const fromVariant = textNames.has(node.tag ?? "") ? namedRoles(node, "variant") : []
	if (fromClass.length === 0 && fromVariant.length === 0) return undefined
	return { roles: [...fromClass, ...fromVariant], viaText: fromClass.length === 0 }
}

const STYLE_REF = /\$style(?:\.([\w-]+)|\[\s*["'`]([\w-]+)["'`]\s*\])/g

const styleRefs = (expression: string): string[] => [...expression.matchAll(STYLE_REF)].map(([, dotted, bracketed]) => dotted ?? bracketed)

function link(links: Map<string, Carrier>, node: TemplateNode, carrier: Carrier): void {
	for (const name of styleRefs(boundAttr(node, "class") ?? "")) {
		const known = links.get(name)
		const merged = known ? { roles: [...known.roles, ...carrier.roles], viaText: known.viaText && carrier.viaText } : carrier
		links.set(name, merged)
	}
}

/** Props that hand a role to the `<Text>` a component renders. */
const ROLE_PROPS = ["titleVariant", "title-variant", "descriptionVariant", "description-variant"]

/** A `type--` class, or a `<Text variant>` or role-prop literal, that names no role. */
function scanRoleNames(scan: Scan, node: TemplateNode, isText: boolean): void {
	const named = [
		...classTypeNames(node).map((name) => [name, `class="type--${name}"`] as const),
		...(isText ? attrNames(node, "variant") : []).map((name) => [name, `variant="${name}"`] as const),
		...ROLE_PROPS.flatMap((prop) => attrNames(node, prop).map((name) => [name, `${prop}="${name}"`] as const)),
	]
	for (const [, text] of named.filter(([name]) => !isRole(name))) {
		scan.findings.push({
			file: scan.file,
			rule: "role",
			text: normalize(text),
			at: elementAt(node),
			line: node.loc.start.line,
			hard: NOT_A_ROLE,
		})
	}
}

function scanTextProps(scan: Scan, node: TemplateNode): void {
	const props = node.props ?? []
	const withVariant = props.some((prop) => propName(prop) === "variant")
	const at = elementAt(node)
	for (const prop of props.filter((candidate) => TEXT_PROPS.has(propName(candidate) ?? ""))) {
		const finding: Finding = { file: scan.file, rule: "text-prop", text: normalize(propSource(prop)), at, line: prop.loc.start.line }
		scan.findings.push(withVariant ? { ...finding, hard: "beside variant" } : finding)
	}
}

function scanStaticStyle(scan: Scan, node: TemplateNode, carrier: Carrier | undefined): void {
	const style = staticAttr(node, "style")
	const rule = style ? postcss.parse(`x{${style}}`).first : undefined
	if (rule?.type !== "rule") return
	const declarations = ownDeclarations(rule)
	const judged: Judged = { module: true, carrier, mono: carrierMono(carrier) || declarations.some(familyIsMono) }
	for (const decl of declarations) {
		const found = judge(decl.prop.toLowerCase(), decl.value, judged)
		if (found)
			scan.findings.push({
				file: scan.file,
				rule: found,
				text: normalize(`${decl.prop}: ${decl.value}`),
				at: elementAt(node),
				line: node.loc.start.line,
			})
	}
}

function scanBoundStyle(scan: Scan, node: TemplateNode, carrier: Carrier | undefined): void {
	const prop = node.props?.find(
		(candidate) => candidate.type === NODE.DIRECTIVE && candidate.name === "bind" && candidate.arg?.content === "style",
	)
	if (!prop?.exp) return
	scanScript(scan, `(${prop.exp.content})`, {
		module: true,
		keys: ROLE_PROPERTIES,
		firstLine: prop.exp.loc.start.line,
		carrier,
		at: elementAt(node),
	})
}

function carriesIdentifierRole(template: TemplateScan, node: TemplateNode): boolean {
	if (IDENTIFIER_COMPONENTS.has(node.tag ?? "")) return true
	const roles = [
		...(elementCarrier(node, template.textNames)?.roles ?? []),
		...styleRefs(boundAttr(node, "class") ?? "").flatMap((name) => template.composed.get(name) ?? []),
	]
	return roles.some((role) => IDENTIFIER_ROLES.has(role))
}

/** `description` or `title` bound beside a variant prop of `meta`, the one mono role `SettingItem` renders for either. */
function passedToIdentifierRole(node: TemplateNode | undefined, attribute: string | undefined): boolean {
	if (!node || (attribute !== "description" && attribute !== "title")) return false
	return [...namedRoles(node, `${attribute}Variant`), ...namedRoles(node, `${attribute}-variant`)].includes("meta")
}

function scanIdentifiers(template: TemplateScan, expression: Expression, chain: readonly TemplateNode[], attribute?: string): void {
	if (!/trimAddress\s*\(/.test(expression.content)) return
	const element = chain.at(-1)
	if (chain.some((node) => carriesIdentifierRole(template, node)) || passedToIdentifierRole(element, attribute)) return
	for (const call of trimCalls(expression.content)) {
		template.scan.findings.push({
			file: template.scan.file,
			rule: "identifier",
			text: normalize(call),
			at: elementAt(element),
			line: expression.loc.start.line,
		})
	}
}

function scanElement(template: TemplateScan, node: TemplateNode, ancestors: readonly TemplateNode[]): void {
	const carrier = elementCarrier(node, template.textNames)
	if (carrier) link(template.links, node, carrier)
	const isText = template.textNames.has(node.tag ?? "")
	scanRoleNames(template.scan, node, isText)
	if (isText) scanTextProps(template.scan, node)
	scanStaticStyle(template.scan, node, carrier)
	scanBoundStyle(template.scan, node, carrier)
	for (const prop of node.props ?? []) {
		if (prop.type === NODE.DIRECTIVE && prop.name === "bind" && prop.exp)
			scanIdentifiers(template, prop.exp, [...ancestors, node], prop.arg?.content)
	}
}

/** Scans the template and returns the module classes its role-bearing elements use, with their roles. */
function scanTemplate(scan: Scan, parsed: ParsedSource, root: TemplateNode): Map<string, Carrier> {
	const template: TemplateScan = { scan, textNames: textTagNames(parsed), composed: composedClasses(parsed), links: new Map() }
	walkTemplate(root, (node, ancestors) => {
		const elements = ancestors.filter((ancestor) => ancestor.type === NODE.ELEMENT)
		if (node.type === NODE.ELEMENT) scanElement(template, node, elements)
		else if (node.type === NODE.INTERPOLATION && isExpression(node.content)) scanIdentifiers(template, node.content, elements)
	})
	return template.links
}

// ── Files, the tree and the baseline ────────────────────────────────────────────────────────

/** Every finding in one source; `source` defaults to the file on disk. */
function scanSource(file: string, source?: string, overrides: readonly Override[] = OVERRIDES): Scan {
	const parsed = parseSource(file, source)
	const scan: Scan = { file, findings: [], overrides, matched: new Set() }
	const links = parsed.template ? scanTemplate(scan, parsed, parsed.template) : new Map<string, Carrier>()
	for (const sheet of parsed.styles) scanSheet(scan, sheet, links)
	const vue = file.endsWith(".vue")
	for (const block of parsed.scripts) {
		scanScript(scan, block.content, { module: vue, keys: SCRIPT_KEYS, firstLine: block.startLine })
	}
	return scan
}

let tree: { files: number; findings: Finding[]; matched: Set<Override> } | undefined

function scanTree(): { files: number; findings: Finding[]; matched: Set<Override> } {
	if (tree) return tree
	const files = sourceFiles()
	const scans = files.map((file) => scanSource(file))
	tree = {
		files: files.length,
		findings: scans.flatMap((scan) => scan.findings),
		matched: new Set(scans.flatMap((scan) => [...scan.matched])),
	}
	return tree
}

function compareEntries(a: Pick<Entry, "rule" | "text" | "at">, b: Pick<Entry, "rule" | "text" | "at">): number {
	const byRule = RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule)
	if (byRule !== 0) return byRule
	if (a.text !== b.text) return a.text < b.text ? -1 : 1
	return a.at < b.at ? -1 : a.at > b.at ? 1 : 0
}

/** Findings in the baseline's shape, role "TODO", files and entries in canonical order. */
function entriesOf(findings: readonly Finding[]): Record<string, { rule: RuleId; text: string; role: string; at: string }[]> {
	const out: Record<string, { rule: RuleId; text: string; role: string; at: string }[]> = {}
	for (const { file, rule, text, at } of findings) out[file] = [...(out[file] ?? []), { rule, text, role: "TODO", at }]
	const files = Object.keys(out).sort()
	return Object.fromEntries(files.map((file) => [file, out[file].sort(compareEntries)]))
}

const keyOf = (file: string, rule: RuleId, text: string): string => `${file}\n${rule}\n${normalize(text)}`

function carveOutMatches(carveOut: CarveOut, finding: Finding): boolean {
	if (keyOf(carveOut.file, carveOut.rule, carveOut.text) !== keyOf(finding.file, finding.rule, finding.text)) return false
	return carveOut.selector === undefined || normalize(carveOut.selector) === normalize(finding.selector ?? "")
}

type Review = { open: Finding[]; stale: { file: string; entry: Entry }[]; staleCarveOuts: CarveOut[]; kept: Finding[] }

/** Findings no carve-out or entry covers, and entries and carve-outs no finding consumed; each covers one finding. */
function review(findings: readonly Finding[], reviewed: Reviewed, carveOuts: readonly CarveOut[] = CARVE_OUTS): Review {
	const unused = new Set(carveOuts)
	const carved = (finding: Finding): boolean => {
		const carveOut = [...unused].find((candidate) => carveOutMatches(candidate, finding))
		if (carveOut) unused.delete(carveOut)
		return carveOut !== undefined
	}
	const kept = findings.filter((finding) => finding.hard !== undefined || !carved(finding))
	const pending = new Map<string, { file: string; entry: Entry }[]>()
	for (const [file, entries] of Object.entries(reviewed)) {
		for (const entry of entries)
			pending.set(keyOf(file, entry.rule, entry.text), [...(pending.get(keyOf(file, entry.rule, entry.text)) ?? []), { file, entry }])
	}
	const open = kept.filter(
		(finding) => finding.hard !== undefined || pending.get(keyOf(finding.file, finding.rule, finding.text))?.pop() === undefined,
	)
	return {
		open,
		stale: [...pending.values()].flat(),
		staleCarveOuts: [...unused],
		kept: kept.filter((finding) => finding.hard === undefined),
	}
}

/** Each named file's current findings, ready to paste over its entries in the reviewed file. */
function pasteReady(files: readonly string[], kept: readonly Finding[]): string {
	const shaped = entriesOf(kept.filter((finding) => files.includes(finding.file)))
	return [...new Set(files)]
		.sort()
		.map((file) => `${JSON.stringify(file)}: ${JSON.stringify(shaped[file] ?? [], null, "\t")}`)
		.join(",\n")
}

const ENTRY_ROLES: ReadonlySet<string> = new Set([...typeRoleNames, "carve-out", "drop"])

function entryProblems(file: string, entries: unknown): string[] {
	if (!Array.isArray(entries)) return [`${file}: not a list`]
	const problems = entries.flatMap((entry: Partial<Record<keyof Entry, unknown>>, index) => {
		if (entry.role === "TODO") return [`${file}[${index}]: role "TODO" (give it its target role)`]
		const valid =
			RULE_ORDER.includes(entry.rule as RuleId) &&
			typeof entry.text === "string" &&
			typeof entry.at === "string" &&
			ENTRY_ROLES.has(String(entry.role))
		return valid ? [] : [`${file}[${index}]: ${JSON.stringify(entry)}`]
	})
	const sorted = [...entries].sort(compareEntries)
	return problems.length > 0 || sorted.every((entry, index) => entry === entries[index]) ? problems : [`${file}: entries out of order`]
}

/** Shape, role and order problems of a reviewed file's content. */
function reviewedProblems(reviewed: unknown): string[] {
	if (typeof reviewed !== "object" || reviewed === null || Array.isArray(reviewed)) return ["not an object of files"]
	const files = Object.keys(reviewed)
	const order = files.every((file, index) => index === 0 || files[index - 1] < file) ? [] : ["files out of order"]
	return [...order, ...files.flatMap((file) => entryProblems(file, (reviewed as Record<string, unknown>)[file]))]
}

function overrideProblems(overrides: readonly Override[]): string[] {
	return overrides.flatMap(({ file, selector, property, value, role }) => {
		const problems: string[] = []
		const compound = splitTopLevel(selector, /,/).every((part) => (part.match(/\.[\w-]+/g) ?? []).length >= 2)
		if (!compound) problems.push(`${file} ${selector}: not a compound rule`)
		if (!setsRoleProperty(property, { roles: [role], viaText: false }))
			problems.push(`${file} ${selector}: ${role} does not set ${property}`)
		const active = role === "segment" && property === "font-weight" ? String(typeRoles.segment.activeWeight) : undefined
		if (active !== undefined && value !== active)
			problems.push(`${file} ${selector}: a segment's weight override is its active weight, ${active}`)
		return problems
	})
}

const REVIEWED_RAW: unknown = JSON.parse(readFileSync(REVIEWED_PATH, "utf8"))
const REVIEWED = REVIEWED_RAW as Reviewed

// ── Tests ───────────────────────────────────────────────────────────────────────────────────

const rulesOf = (file: string, source: string): RuleId[] => scanSource(file, source, []).findings.map(({ rule }) => rule)

describe("type role ban (static)", () => {
	test("no pick outside a role or a reviewed entry", () => {
		const { files, findings } = scanTree()
		expect(files).toBeGreaterThan(500)
		const { open, kept } = review(findings, REVIEWED)
		const listed = open.map(
			({ file, line, rule, text, hard }) => `${file}:${line}  ${rule}  ${text}${hard ? `  (${hard}: no entry covers it)` : ""}`,
		)
		expect(
			listed,
			`Give each pick its type role (composes: type--<role> from global, a type-- class, or <Text variant>), or review it in.\nCurrent findings of each file named, for type-role-ban.reviewed.json:\n${pasteReady(
				open.map(({ file }) => file),
				kept,
			)}\n`,
		).toEqual([])
	})

	test("every reviewed entry still matches a pick", () => {
		const { stale, kept } = review(scanTree().findings, REVIEWED)
		const listed = stale.map(({ file, entry }) => `${file}  ${entry.rule}  ${entry.text}`)
		expect(
			listed,
			`Reviewed entries that match no pick, to delete.\nCurrent findings of each file named:\n${pasteReady(
				stale.map(({ file }) => file),
				kept,
			)}\n`,
		).toEqual([])
	})

	test("every carve-out and override still matches a pick", () => {
		const { findings, matched } = scanTree()
		const staleCarveOuts = review(findings, REVIEWED).staleCarveOuts.map(
			({ file, rule, text }) => `carve-out ${file}  ${rule}  ${text}`,
		)
		const staleOverrides = OVERRIDES.filter((entry) => !matched.has(entry)).map(
			({ file, selector, property }) => `override ${file}  ${selector}  ${property}`,
		)
		expect([...staleCarveOuts, ...staleOverrides], "Exceptions that match nothing, to delete").toEqual([])
	})

	test("the reviewed file names a role for every entry, in canonical order", () => {
		expect(reviewedProblems(REVIEWED_RAW)).toEqual([])
	})

	test("every override is a compound rule setting a property of its role", () => {
		expect(overrideProblems(OVERRIDES)).toEqual([])
	})

	test.runIf(Boolean(process.env.TYPE_ROLE_BAN_DUMP))("writes the current findings for review", () => {
		writeFileSync(
			String(process.env.TYPE_ROLE_BAN_DUMP),
			`${JSON.stringify(entriesOf(review(scanTree().findings, {}).kept), null, "\t")}\n`,
		)
	})
})

describe("type role ban rules", () => {
	test.each([
		["face: a family in module CSS", "a.module.css", ".a { font-family: var(--font-mono); }", ["face"]],
		["face: `inherit` passes", "a.module.css", ".a { font-family: inherit; }", []],
		["face: a variable naming a family", "a.module.css", ".a { --banner-font: var(--font-body); }", ["face"]],
		["tracking", "a.module.css", ".a { letter-spacing: 0.1em; }", ["tracking"]],
		[
			"tracking: a composing rule without it passes",
			"a.module.css",
			".a { composes: type--label-section from global; color: red; }",
			[],
		],
		["role: a composed role passes", "a.module.css", ".a { composes: row type--meta from global; }", []],
		["case: upper case", "a.module.css", ".a { text-transform: uppercase; }", ["case"]],
		["case: capitalize passes", "a.module.css", ".a { text-transform: capitalize; }", []],
		["size: under the floor", "a.module.css", ".a { font-size: 9px; }", ["size"]],
		["size: off the scale inside calc()", "a.module.css", ".a { font-size: calc(30px * var(--hero-scale, 1)); }", ["size"]],
		["size: mono under the mono floor", "a.module.css", ".a { composes: type--meta from global; font-size: 10px; }", ["size"]],
		["size: em passes", "a.scss", ".a { font-size: 0.5em; }", []],
		[
			"faceless: a size and a weight outside a role",
			"a.module.css",
			".a { font-size: 12px; font-weight: 600; }",
			["faceless", "faceless"],
		],
		["faceless: not judged outside module CSS", "a.scss", ".a { font-size: 12px; font-weight: 600; }", []],
		[
			"tie: a role property beside the role",
			"a.module.css",
			".a { composes: type--label-section from global; font-weight: 600; }",
			["tie"],
		],
		["tie: a site-sized role's size passes", "a.module.css", ".a { composes: type--row-title from global; font-size: 16px; }", []],
		["shorthand: font is judged by its family", "a.module.css", ".a { font: 600 12px/1.4 var(--font-mono); }", ["face"]],
		["shorthand: font: inherit passes off a role", "a.module.css", ".a { font: inherit; }", []],
		[
			"shorthand: font: inherit on a role element",
			"a.module.css",
			".a { composes: type--label-section from global; font: inherit; }",
			["tie"],
		],
		[
			"shorthand: font-variant beside a role",
			"a.module.css",
			".a { composes: type--meta from global; font-variant: tabular-nums; }",
			["tie"],
		],
		[
			"the SCSS file: face and size, no faceless",
			"a.scss",
			"body { font-family: var(--font-body); .b { font-size: 9px; font-weight: 600; } }",
			["face", "size"],
		],
	])("%s", (_case, file, source, rules) => {
		expect(rulesOf(file, source)).toEqual(rules)
	})

	test("a nested rule resolves against its parent", () => {
		const { findings } = scanSource("a.module.css", ".a { &.b { letter-spacing: 1px; } input { font-size: 12px; } }", [])
		expect(findings.map(({ rule, selector }) => [rule, selector])).toEqual([
			["tracking", ".a.b"],
			["faceless", ".a input"],
		])
	})

	test.each([
		["text-prop: each prop is one finding", '<template><Text size="12" weight="600">x</Text></template>', ["text-prop", "text-prop"]],
		["text-prop: a variant passes", '<template><Text variant="body">x</Text></template>', []],
		[
			"role: a bound variant whose branches are roles passes",
			"<template><Text :variant=\"x ? 'meta' : 'body'\">x</Text></template>",
			[],
		],
		[
			"role: a bound variant's comparison operand is not a branch",
			"<template><Text :variant=\"kind === 'address' ? 'meta' : 'body'\">x</Text></template>",
			[],
		],
		["role: a static role class passes", '<template><span class="row type--meta">x</span></template>', []],
		["role: an empty string a fallback passes over", "<template><Text :variant=\"'' || 'meta'\">x</Text></template>", []],
		[
			"role: a role prop whose branches are roles passes",
			"<template><SettingItem :titleVariant=\"x ? 'row-title' : 'meta'\" descriptionVariant=\"caption\" /></template>",
			[],
		],
		["text-prop: a bare tabular", "<template><Text tabular>1</Text></template>", ["text-prop"]],
		[
			"text-prop: an aliased Text import",
			'<script setup>import Label from "../core/Text.vue"</script><template><Label :size="s">x</Label></template>',
			["text-prop"],
		],
		[
			"text-prop: Text aliased from the package barrel",
			'<script setup>import { Flex, Text as Label } from "@nulo/design"</script><template><Label size="12">x</Label></template>',
			["text-prop"],
		],
		[
			"tie: the module class of a <Text variant>",
			'<template><Text variant="label-section" :class="$style.k">x</Text></template><style module>.k { font-weight: 600; }</style>',
			["tie"],
		],
		[
			"tie: font: inherit on an element with a role class",
			'<template><button class="type--button-md" :class="$style.retry">R</button></template><style module>.retry { font: inherit; }</style>',
			["tie"],
		],
		[
			"site-size: a site-sized <Text variant>'s class may set its size",
			'<template><Text variant="row-title" :class="$style.t">x</Text></template><style module>.t { font-size: 16px; }</style>',
			[],
		],
		[
			"site-size: and no other role property",
			'<template><Text variant="row-title" :class="$style.t">x</Text></template><style module>.t { font-size: 16px; font-weight: 600; }</style>',
			["site-size"],
		],
		[
			"a dynamic class expression is not followed (a blind spot)",
			'<template><span class="type--label-section" :class="classes">x</span></template><style module>.k { font-weight: 600; }</style>',
			["faceless"],
		],
		[
			"a bound :style object, by camelCase key",
			"<template><span :style=\"{ fontFamily: 'x', letterSpacing: '1px', fontSize: `${s}px` }\">x</span></template>",
			["face", "tracking", "faceless"],
		],
		[
			"a static style attribute",
			'<template><span style="letter-spacing: 1px; font-size: 12px">x</span></template>',
			["tracking", "faceless"],
		],
		["identifier: outside a mono role", "<template><span>{{ trimAddress(a) }}</span></template>", ["identifier"]],
		["identifier: a space before the call's parenthesis", "<template><span>{{ trimAddress (a) }}</span></template>", ["identifier"]],
		["identifier: inside <Text variant>", '<template><Text variant="meta">{{ trimAddress(a) }}</Text></template>', []],
		[
			"identifier: inside a class composing a mono role",
			'<template><div :class="$style.x"><span>{{ trimAddress(a) }}</span></div></template><style module>.x { composes: type--meta from global; }</style>',
			[],
		],
		[
			"identifier: passed to a meta description",
			'<template><SettingItem :description="trimAddress(a)" descriptionVariant="meta" /></template>',
			[],
		],
		["identifier: passed to AddressDisplay", '<template><AddressDisplay :formatter="(a) => trimAddress(a, 6, 4)" /></template>', []],
		[
			"identifier: passed to a caption description",
			'<template><SettingItem :description="trimAddress(a)" /></template>',
			["identifier"],
		],
		[
			"identifier: passed beside a mono role SettingItem never renders",
			'<template><SettingItem :description="trimAddress(a)" descriptionVariant="input-data" /></template>',
			["identifier"],
		],
		["script: a family in a style string", '<script setup>const s = "color: red; font-family: serif"</script>', ["face"]],
		["script: a module-scoped size key", "<script setup>const s = { fontWeight: 600 }</script>", ["faceless"]],
		["script: a font shorthand key", '<script setup>const s = { font: "700 12px serif" }</script>', ["face"]],
		["a bound :style string with a font shorthand", "<template><span :style=\"'font: 700 12px serif'\">x</span></template>", ["face"]],
		["a font: inherit style string passes", "<template><span :style=\"'font: inherit'\">x</span></template>", []],
		[
			"a bound :style key a character reference spells",
			'<template><span :style="{ &#102;ontWeight: 600 }">x</span></template>',
			["faceless"],
		],
		[
			"a font shorthand after a font: inherit",
			"<template><span :style=\"'font: inherit; font: 700 9px monospace'\">x</span></template>",
			["face"],
		],
	])("%s", (_case, source, rules) => {
		expect(rulesOf("x.vue", source)).toEqual(rules)
	})

	test.each([
		["a family key", 'export const theme = { "&": { fontFamily: "monospace" } }', ["face"]],
		["an off-scale size key", 'const s = { fontSize: "9px" }', ["size"]],
		["a weight key outside a component passes", "const s = { fontWeight: 600 }", []],
		["a capitalize key passes", 'const s = { textTransform: "capitalize" }', []],
		["upper case in a string", "const s = `text-transform: uppercase; color: ${c}`", ["case"]],
		["a letter-spacing key", 'const s = { letterSpacing: "1px" }', ["tracking"]],
		["an upper-case key", 'const s = { textTransform: "uppercase" }', ["case"]],
		["an escaped key", 'const s = { "\\u0066ontSize": "9px" }', ["size"]],
		["a family in upper case", 'const s = "FONT-FAMILY: serif"', ["face"]],
	])("script: %s", (_case, source, rules) => {
		expect(rulesOf("x.ts", source)).toEqual(rules)
	})

	test("every judged key and style-string pick spells a name the script check admits", () => {
		const camel = (key: string): string => key.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())
		const keys = [...SCRIPT_KEYS, ...ROLE_PROPERTIES].flatMap((key) => [key, camel(key)])
		const picks = [...STRING_PICKS.map(([, pattern]) => pattern.source), STRING_FONT.source]
		expect([...keys, ...picks].filter((text) => !MAY_PICK.test(text))).toEqual([])
	})

	test.each([
		["a size beside a variant", "x.vue", '<template><Text variant="meta" size="12">x</Text></template>', "beside variant"],
		["a variant outside the roles", "x.vue", '<template><Text variant="huge">x</Text></template>', "not a role"],
		[
			"a bound variant's branch outside the roles",
			"x.vue",
			"<template><Text :variant=\"x ? 'meta' : 'huge'\">x</Text></template>",
			"not a role",
		],
		["a static class outside the roles", "x.vue", '<template><span class="row type--huge">x</span></template>', "not a role"],
		["a composed name outside the roles", "a.module.css", ".a { composes: type--huge from global; }", "not a role"],
		["a role prop outside the roles", "x.vue", '<template><SettingItem descriptionVariant="data" /></template>', "not a role"],
		[
			"a variant behind && outside the roles",
			"x.vue",
			"<template><Text :variant=\"(x && 'data') || 'meta'\">x</Text></template>",
			"not a role",
		],
		[
			"an asserted variant outside the roles",
			"x.vue",
			"<template><Text :variant=\"'data' as const\">x</Text></template>",
			"not a role",
		],
	])("hard: %s fails with any entry", (_case, file, source, reason) => {
		const { findings } = scanSource(file, source, [])
		const covering = { [file]: findings.map(({ rule, text }) => ({ rule, text, role: "drop" as const, at: "" })) }
		expect(findings.map(({ hard }) => hard)).toEqual([reason])
		expect(review(findings, covering, []).open).toHaveLength(1)
	})
})

describe("type role ban baseline", () => {
	const twice = ".a { letter-spacing: 0.1em; }\n.b { letter-spacing: 0.1em; }"
	const entry = { rule: "tracking" as const, text: "letter-spacing: 0.1em", role: "label-section" as const, at: "" }

	test("two identical picks need two entries", () => {
		const { findings } = scanSource("a.module.css", twice, [])
		expect(review(findings, { "a.module.css": [entry] }, []).open).toHaveLength(1)
		expect(review(findings, { "a.module.css": [entry, entry] }, []).open).toEqual([])
	})

	test("a moved line needs no entry change", () => {
		const { findings } = scanSource("a.module.css", `\n\n\n${twice}`, [])
		expect(review(findings, { "a.module.css": [entry, entry] }, [])).toMatchObject({ open: [], stale: [] })
	})

	test("an entry, a carve-out and an override that match nothing are stale", () => {
		const carveOut: CarveOut = { file: "a.module.css", rule: "size", text: "font-size: 48px", selector: ".hero", why: "" }
		const override: Override = {
			file: "a.module.css",
			selector: ".a.b",
			scope: "",
			property: "font-weight",
			value: "700",
			role: "segment",
			why: "",
		}
		const scan = scanSource("a.module.css", ".x { font-size: 48px; }", [override])
		const result = review(scan.findings, { "a.module.css": [entry] }, [carveOut])
		expect(result.stale).toEqual([{ file: "a.module.css", entry }])
		expect(result.staleCarveOuts).toEqual([carveOut])
		expect(scan.matched.size).toBe(0)
	})

	test("a carve-out and an override cover their declaration only", () => {
		const carveOut: CarveOut = { file: "a.module.css", rule: "size", text: "font-size: 48px", selector: ".hero", why: "" }
		const override: Override = {
			file: "a.module.css",
			selector: ".base.mini input",
			scope: "",
			property: "font-size",
			value: "12px",
			role: "input",
			why: "",
		}
		const source =
			".hero { font-size: 48px; }\n.other { font-size: 48px; }\n.base.mini { input { font-size: 12px; } }\n.base input { font-size: 12px; }"
		const scan = scanSource("a.module.css", source, [override])
		const { open } = review(scan.findings, {}, [carveOut])
		expect(open.map(({ selector }) => selector)).toEqual([".other", ".base input"])
		expect(scan.matched).toEqual(new Set([override]))
	})

	test("a TODO role and an unknown role are refused, and order is canonical", () => {
		const todo = { "a.vue": [{ rule: "face", text: "t", role: "TODO", at: "" }] }
		const unknown = { "a.vue": [{ rule: "face", text: "t", role: "huge", at: "" }] }
		const unordered = { "b.vue": [], "a.vue": [] }
		expect(reviewedProblems(todo)).toEqual(['a.vue[0]: role "TODO" (give it its target role)'])
		expect(reviewedProblems(unknown)).toHaveLength(1)
		expect(reviewedProblems(unordered)).toEqual(["files out of order"])
	})

	test("an override is compound, sets its role's property, and a segment weight is its active weight", () => {
		const base = { file: "a.vue", scope: "", why: "" }
		expect(overrideProblems([{ ...base, selector: ".tab", property: "font-weight", value: "700", role: "segment" }])).toHaveLength(1)
		expect(
			overrideProblems([{ ...base, selector: ".tab.active", property: "font-weight", value: "600", role: "segment" }]),
		).toHaveLength(1)
		expect(
			overrideProblems([{ ...base, selector: ".tab.active", property: "font-size", value: "16px", role: "row-title" }]),
		).toHaveLength(1)
		expect(overrideProblems([{ ...base, selector: ".tab.active", property: "font-weight", value: "700", role: "segment" }])).toEqual([])
	})
})
