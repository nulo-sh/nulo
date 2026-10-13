import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseSfc } from "@vue/compiler-sfc"
import postcss, { type Container, type Document, type Root, type Rule } from "postcss"
import { compileString } from "sass"

/**
 * One reader of the wallet's sources for the type-role guard and the two inventory generators, so
 * all three see the same files the same way: Vue SFCs split into template, scripts and styles,
 * stylesheets parsed by postcss (nested rules kept as written), the one `.scss` file compiled first.
 */

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")
export const SCAN_ROOTS = ["apps/extension/src", "packages/design/src"] as const
/** The generated layer and its inputs: the roles themselves live here. */
export const EXEMPT = /^packages\/design\/src\/(base\.css|utilities\.css|token-contract\.ts|tokens\.ts|internal\/)/
export const SKIPPED = /\.(test|stories)\.[jt]s$|\.d\.ts$/
const SCANNED = /\.(vue|ts|js|css|scss)$/

/** compiler-core's `NodeTypes`, which compiler-sfc does not re-export. */
export const NODE = { ELEMENT: 1, TEXT: 2, INTERPOLATION: 5, ATTRIBUTE: 6, DIRECTIVE: 7 } as const

export type Position = { line: number }
export type Expression = { content: string; loc: { start: Position; source: string } }
export type TemplateProp = {
	type: number
	name: string
	value?: { content: string; loc: { start: Position } }
	arg?: { content: string } | null
	exp?: Expression | null
	loc: { start: Position; source: string }
}
export type TemplateNode = {
	type: number
	tag?: string
	props?: readonly TemplateProp[]
	children?: readonly (TemplateNode | string | symbol)[]
	content?: unknown
	loc: { start: Position; source: string }
}

export type StyleSheet = { root: Root; module: boolean; lang: "css" | "scss"; startLine: number }
export type ScriptBlock = { content: string; startLine: number }
export type ParsedSource = {
	/** Repo-relative, `/`-separated. */
	file: string
	template?: TemplateNode
	scripts: ScriptBlock[]
	styles: StyleSheet[]
}

function walk(dir: string, out: string[]): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name)
		if (statSync(full).isDirectory()) walk(full, out)
		else if (SCANNED.test(name) && !SKIPPED.test(name)) out.push(full)
	}
	return out
}

/** Every scanned file under the roots, repo-relative, minus the generated layer. */
export function sourceFiles(): string[] {
	return SCAN_ROOTS.flatMap((root) => walk(join(REPO_ROOT, root), []))
		.map((full) => relative(REPO_ROOT, full).split("\\").join("/"))
		.filter((file) => !EXEMPT.test(file))
		.sort()
}

function parseCss(content: string, file: string): Root {
	return postcss.parse(content, { from: file })
}

function parseVue(file: string, source: string): ParsedSource {
	const { descriptor } = parseSfc(source, { filename: file, sourceMap: false })
	const scripts = [descriptor.script, descriptor.scriptSetup]
		.filter((block) => block !== null)
		.map((block) => ({ content: block.content, startLine: block.loc.start.line }))
	const styles = descriptor.styles.map((block) => ({
		root: parseCss(block.content, file),
		module: Boolean(block.module),
		lang: block.lang === "scss" ? ("scss" as const) : ("css" as const),
		startLine: block.loc.start.line,
	}))
	return { file, template: descriptor.template?.ast as TemplateNode | undefined, scripts, styles }
}

/** Parses one source by its extension. `source` defaults to the file on disk; tests pass snippets. */
export function parseSource(file: string, source = readFileSync(join(REPO_ROOT, file), "utf8")): ParsedSource {
	if (file.endsWith(".vue")) return parseVue(file, source)
	if (file.endsWith(".scss")) {
		const root = parseCss(compileString(source, { style: "expanded" }).css, file)
		return { file, scripts: [], styles: [{ root, module: false, lang: "scss", startLine: 1 }] }
	}
	if (file.endsWith(".css")) {
		return {
			file,
			scripts: [],
			styles: [{ root: parseCss(source, file), module: file.endsWith(".module.css"), lang: "css", startLine: 1 }],
		}
	}
	return { file, scripts: [{ content: source, startLine: 1 }], styles: [] }
}

/** `text` with every regular-expression metacharacter escaped, so it matches only itself. */
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** `text` split at each `separator` character outside parentheses and brackets, parts trimmed, empty parts dropped. */
export function splitTopLevel(text: string, separator: RegExp): string[] {
	const parts: string[] = []
	let depth = 0
	let current = ""
	for (const char of text) {
		if (char === "(" || char === "[") depth++
		if (char === ")" || char === "]") depth--
		if (depth === 0 && separator.test(char)) {
			parts.push(current)
			current = ""
		} else current += char
	}
	parts.push(current)
	return parts.map((part) => part.trim()).filter(Boolean)
}

/** The nearest rule a nested rule sits in, through any at-rules between them. */
export function enclosingRule(rule: Rule): Rule | undefined {
	let node: Container | Document | undefined = rule.parent
	while (node && node.type !== "rule") node = node.parent
	return node?.type === "rule" ? (node as Rule) : undefined
}

function resolvedParts(rule: Rule): string[] {
	const own = splitTopLevel(rule.selector, /,/).map((part) => part.replace(/\s+/g, " "))
	const parent = enclosingRule(rule)
	if (!parent) return own
	return resolvedParts(parent).flatMap((outer) =>
		own.map((inner) => (inner.includes("&") ? inner.replaceAll("&", outer) : `${outer} ${inner}`)),
	)
}

/** A rule's selector with CSS nesting resolved against its enclosing rules (`.a { &.b {} }` → `.a.b`), parts joined by ", ". */
export function resolveSelector(rule: Rule): string {
	return resolvedParts(rule).join(", ")
}

/** The declarations every rule resolving to exactly `selector` makes directly, a later one winning. */
export function declarationsOf(parsed: ParsedSource, selector: string): Record<string, string> {
	const out: Record<string, string> = {}
	for (const sheet of parsed.styles) {
		sheet.root.walkRules((rule) => {
			if (resolveSelector(rule) !== selector) return
			for (const node of rule.nodes) if (node.type === "decl") out[node.prop] = node.value
		})
	}
	return out
}

/** The element carrying a static `data-testid`, with its ancestors outermost first, or undefined. */
export function elementByTestid(
	parsed: ParsedSource,
	testid: string,
): { node: TemplateNode; ancestors: readonly TemplateNode[] } | undefined {
	let found: { node: TemplateNode; ancestors: readonly TemplateNode[] } | undefined
	if (parsed.template) {
		walkElements(parsed.template, (node, ancestors) => {
			if (!found && staticAttr(node, "data-testid") === testid) found = { node, ancestors }
		})
	}
	return found
}

export function isElement(node: TemplateNode | string | symbol): node is TemplateNode {
	return typeof node === "object" && node.type === NODE.ELEMENT
}

/** Depth-first over every element, with its ancestors outermost first. */
export function walkElements(root: TemplateNode, visit: (node: TemplateNode, ancestors: readonly TemplateNode[]) => void): void {
	const go = (node: TemplateNode, ancestors: TemplateNode[]): void => {
		if (node.type === NODE.ELEMENT) visit(node, ancestors)
		const next = node.type === NODE.ELEMENT ? [...ancestors, node] : ancestors
		for (const child of node.children ?? []) if (typeof child === "object") go(child, next)
	}
	go(root, [])
}

/** Depth-first over every node, interpolations and text included, with its ancestors from the root outermost first. */
export function walkTemplate(root: TemplateNode, visit: (node: TemplateNode, ancestors: readonly TemplateNode[]) => void): void {
	const go = (node: TemplateNode, ancestors: TemplateNode[]): void => {
		visit(node, ancestors)
		const next = [...ancestors, node]
		for (const child of node.children ?? []) if (typeof child === "object") go(child, next)
	}
	go(root, [])
}

/** A directive (`v-if`, `v-model`, …) by its name without the `v-`, or undefined. */
export function directive(node: TemplateNode, name: string): TemplateProp | undefined {
	return node.props?.find((prop) => prop.type === NODE.DIRECTIVE && prop.name === name)
}

/** A tag as a component name: `router-view` → `RouterView`; a PascalCase tag is returned as is. */
export function componentName(tag: string): string {
	return tag.replace(/(^|-)(\w)/g, (_, _dash: string, letter: string) => letter.toUpperCase())
}

/** A static attribute's value, or undefined. */
export function staticAttr(node: TemplateNode, name: string): string | undefined {
	return node.props?.find((prop) => prop.type === NODE.ATTRIBUTE && prop.name === name)?.value?.content
}

/** A `:name` / `v-bind:name` binding's expression text, or undefined. */
export function boundAttr(node: TemplateNode, name: string): string | undefined {
	const prop = node.props?.find((p) => p.type === NODE.DIRECTIVE && p.name === "bind" && p.arg?.content === name)
	return prop?.exp?.content
}

const TEXT_IMPORT = /import\s+(\w+)\s+from\s+["'][^"']*\/Text\.vue["']/g
const BARREL_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']@nulo\/design["']/g
const BARREL_TEXT = /(?:^|,)\s*Text\s+as\s+(\w+)\s*(?=,|$)/g

/** Every tag name `Text` renders under in this file: the auto-import, plus each local import name. */
export function textTagNames(parsed: ParsedSource): Set<string> {
	const names = new Set(["Text"])
	for (const { content } of parsed.scripts) {
		for (const match of content.matchAll(TEXT_IMPORT)) names.add(match[1])
		for (const [, list] of content.matchAll(BARREL_IMPORT)) for (const match of list.matchAll(BARREL_TEXT)) names.add(match[1])
	}
	return names
}
