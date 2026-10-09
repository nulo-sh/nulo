import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import {
	boundAttr,
	directive,
	NODE,
	type ParsedSource,
	parseSource,
	REPO_ROOT,
	SKIPPED,
	sourceFiles,
	type TemplateNode,
	type TemplateProp,
	textTagNames,
	walkTemplate,
} from "./source-scan"

/**
 * Lists every place a template renders an address, hash or id, so each can be held to a mono type
 * role. A site is one of:
 *
 * 1. a rendered call to `trimAddress`, `shortAddress` or `formatAddress`, or to anything reaching
 *    `trimAddress`: a script-module export outside `src/wallet/` named for an address or hash or
 *    calling one (`addressChangeText`, `maskAddress`), or a same-file `computed` or function that
 *    does; and a member such a same-file function sets from such a call, rendered by member
 *    (`addressText`, `contractTrim`). An export declared to return a boolean is a predicate, not a
 *    formatter, and reaches nothing;
 * 2. `.slice(0, N)` and `.slice(-N)` on one string, in the template or a same-file `computed`;
 * 3. `mono` on a `<Text>`, bare or bound, or `textVariant` on an `<Input>`;
 * 4. a member named in `IDENTIFIER_MEMBERS` or ending in `Address` or `Hash` (`messageHash`), or
 *    `String()` of one, as the whole of template text, of a `title`, `description`, `label` or
 *    `value` binding, or of one `||` / `??` alternative in either;
 * 5. every `AddressDisplay` and `AddressInput` element.
 *
 * "Rendered" means template text or a `v-bind` other than `NON_RENDERING_PROPS`, `data-*` and
 * `aria-*`; a call inside `v-if`, `v-for` or an event handler is not a site. One element is one
 * site: a pattern 3 or 5 element absorbs every match on itself and in its subtree, and a split
 * slice pair is one site at its head. An occurrence is keyed by file, expression, branch and
 * ordinal; the line is a hint.
 *
 * Branch: the conditions of every `v-if` / `v-else-if` / `v-else` on the site's element and its
 * ancestors, outermost first, joined by ` && `. A `v-else-if` contributes its own condition and a
 * `v-else` contributes `!(c1 || c2 …)` over the chain's earlier conditions, so sibling branches of
 * one chain read apart. Ordinal: the index among the file's sites with the same expression, in
 * document order.
 *
 * Blind spots: a key read dynamically (`row[key]`); text a helper builds without `trimAddress`;
 * a value another file formats (`call-surface.ts` trims what `CallArguments.vue` shows as
 * `row.short`), or one a reaching `computed` hands to a `v-for` and the loop renders by member;
 * calls in script blocks. Such a site is held by its testid once it has an entry.
 */

export type BranchStep = {
	/** `line:column` of the `v-if` that heads the chain. */
	chain: string
	condition: string
}

export type IdentifierSite = {
	file: string
	line: number
	expression: string
	component: string
	branch: string
	ordinal: number
	/** The branch as chain steps, outermost first, for telling sibling branches apart. */
	steps: readonly BranchStep[]
	/** The `data-testid`s on the site's element and its ancestors, nearest first; a bound one as its expression. */
	testids: readonly string[]
}

export const IDENTIFIER_MEMBERS = [
	"address",
	"hash",
	"txHash",
	"id",
	"chainId",
	"nonce",
	"origin",
	"hostname",
	"contractAddress",
	"selector",
]
const BOUND_TEXT_PROPS = new Set(["title", "description", "label", "value"])
const NON_RENDERING_PROPS = new Set(["key", "class", "style", "ref", "is", "to", "href", "src", "formatter"])
const BASE_REACHERS = ["trimAddress", "shortAddress", "formatAddress"]
const UI_MODULE = /^apps\/extension\/src\/(?!wallet\/).+\.ts$/
const NAMED_FOR_IDENTIFIER = /address|hash/i
const IDENTIFIER_NAME = new RegExp(String.raw`^(?:${IDENTIFIER_MEMBERS.join("|")}|[\w$]*[a-z0-9](?:Address|Hash))$`)
const PREDICATE = /^(?:Promise<)?boolean>?$/
const SLICE_HEAD = /([\w$][\w$.?!]*)\.slice\(\s*0\s*,\s*-?\d+\s*\)/g
const SLICE_TAIL = /([\w$][\w$.?!]*)\.slice\(\s*-\d+\s*\)/g

type Located = { line: number; column: number; offset: number }
type Candidate = {
	/** The element the site renders through: the bound element, the interpolation's parent, a split pair's common ancestor. */
	owner: TemplateNode
	/** Root first, ending at `owner`. */
	path: readonly TemplateNode[]
	expression: string
	at: Located
	level: "element" | "match"
	/** Nodes this candidate stands for besides its own: a split pair's tail. */
	covers: readonly TemplateNode[]
}

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim()
const start = (node: { loc: { start: unknown } }): Located => node.loc.start as Located
const literal = (name: string): string => name.replace(/[$]/g, "\\$")

function receivers(expression: string, pattern: RegExp): Set<string> {
	return new Set([...expression.matchAll(pattern)].map((match) => match[1].replace(/[?!]/g, "")))
}

function hasSlicePair(text: string): boolean {
	const tails = receivers(text, SLICE_TAIL)
	return [...receivers(text, SLICE_HEAD)].some((receiver) => tails.has(receiver))
}

/** Matches a call to any of `callables` or any mention of `values` (a local `computed`, read bare or as `.value`). */
function reachPattern(callables: readonly string[], values: readonly string[]): RegExp | undefined {
	const parts = [
		...(callables.length ? [String.raw`(?<![\w$])(?:${callables.map(literal).join("|")})\s*\(`] : []),
		...(values.length ? [String.raw`(?<![\w$.])(?:${values.map(literal).join("|")})(?![\w$])`] : []),
	]
	return parts.length ? new RegExp(parts.join("|")) : undefined
}

type Declaration = { name: string; body: string; predicate: boolean }

function isExported(statement: ts.Statement): boolean {
	return ts.canHaveModifiers(statement) && Boolean(ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
}

function returnsBoolean(node: ts.Node, sf: ts.SourceFile): boolean {
	const type = ts.isFunctionLike(node) ? node.type : undefined
	return Boolean(type && PREDICATE.test(type.getText(sf).replace(/\s/g, "")))
}

/** Top-level functions and initialized `const`/`let` bindings with their source text. */
function declarations(source: string, exportedOnly: boolean): Declaration[] {
	const sf = ts.createSourceFile("scan.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const out: Declaration[] = []
	for (const statement of sf.statements) {
		if (exportedOnly && !isExported(statement)) continue
		if (ts.isFunctionDeclaration(statement) && statement.name) {
			out.push({ name: statement.name.text, body: statement.getText(sf), predicate: returnsBoolean(statement, sf) })
		}
		if (!ts.isVariableStatement(statement)) continue
		for (const decl of statement.declarationList.declarations) {
			const init = decl.initializer
			if (!ts.isIdentifier(decl.name) || !init) continue
			out.push({ name: decl.name.text, body: init.getText(sf), predicate: returnsBoolean(init, sf) })
		}
	}
	return out
}

function reaches(decl: Declaration, reach: RegExp | undefined, slicePairs: boolean): boolean {
	if (decl.predicate) return false
	return Boolean(reach?.test(decl.body)) || (slicePairs && hasSlicePair(decl.body))
}

/** Grows `known` (functions) and `values` (`computed`s) with every declaration whose body reaches them, until nothing changes. */
function closeOver(decls: readonly Declaration[], known: Set<string>, values: Set<string>, slicePairs: boolean): void {
	for (let grew = true; grew; ) {
		grew = false
		const reach = reachPattern([...known], [...values])
		for (const decl of decls) {
			if (known.has(decl.name) || values.has(decl.name) || !reaches(decl, reach, slicePairs)) continue
			if (/^computed\s*\(/.test(decl.body)) values.add(decl.name)
			else known.add(decl.name)
			grew = true
		}
	}
}

/** The script-module exports outside `src/wallet/` that reach `trimAddress` or are named for an address or hash. */
export function utilityReachers(files: readonly string[] = sourceFiles()): string[] {
	const decls = files
		.filter((file) => UI_MODULE.test(file))
		.flatMap((file) => declarations(readFileSync(join(REPO_ROOT, file), "utf8"), true))
	const named = decls.filter((d) => !d.predicate && NAMED_FOR_IDENTIFIER.test(d.name)).map((d) => d.name)
	const known = new Set([...BASE_REACHERS, ...named])
	closeOver(decls, known, new Set(), false)
	return [...known].sort()
}

/** Names a declaration binds from a reaching call: `contractTrim: trimAddress(…)`, `const addressText = … addressChangeText(…)`. */
function derivedMembers(decls: readonly Declaration[], reach: RegExp | undefined): string[] {
	if (!reach) return []
	const binding = /(?:([\w$]+)\s*:|(?:const|let)\s+([\w$]+)\s*=)([^,;{}\n]*)/g
	return decls.flatMap(({ body }) => [...body.matchAll(binding)].filter((m) => reach.test(m[3])).map((m) => m[1] ?? m[2]))
}

type Reach = { reach: RegExp | undefined; derived: Set<string> }

function localReach(parsed: ParsedSource, utilities: readonly string[]): Reach {
	const decls = parsed.scripts.flatMap(({ content }) => declarations(content, false))
	const local = new Set(decls.map((d) => d.name))
	const known = new Set(utilities.filter((name) => !local.has(name)))
	const values = new Set<string>()
	closeOver(decls, known, values, true)
	const reach = reachPattern([...known], [...values])
	return { reach, derived: new Set(derivedMembers(decls, reach)) }
}

/** The segments of a pure member chain (`String(a?.b!.c)`, `a.b.toString()`), or undefined. */
function memberChain(expression: string): string[] | undefined {
	const bare = expression
		.replace(/\s/g, "")
		.replace(/^String\((.*)\)$/, "$1")
		.replace(/\.toString\(\)$/, "")
	if (!/^[\w$]+(?:!?\??\.[\w$]+)*!?$/.test(bare)) return undefined
	return bare.split(/!?\??\./).map((segment) => segment.replace(/!$/, ""))
}

/** Pattern 4, and pattern 1's derived members: a whole alternative of `expression` is an identifier member. */
function isIdentifierMember(expression: string, derived: ReadonlySet<string>): boolean {
	return expression.split(/\|\||\?\?/).some((alternative) => {
		const chain = memberChain(alternative)
		if (!chain) return false
		return IDENTIFIER_NAME.test(chain[chain.length - 1]) || chain.slice(1).some((segment) => derived.has(segment))
	})
}

function isRenderingBind(prop: TemplateProp): boolean {
	if (prop.type !== NODE.DIRECTIVE || prop.name !== "bind" || !prop.arg || !prop.exp) return false
	const arg = prop.arg.content
	return !NON_RENDERING_PROPS.has(arg) && !arg.startsWith("data-") && !arg.startsWith("aria-")
}

function hasProp(node: TemplateNode, name: string): boolean {
	return Boolean(
		node.props?.some((p) => (p.type === NODE.ATTRIBUTE && p.name === name) || (p.name === "bind" && p.arg?.content === name)),
	)
}

function modelExpression(node: TemplateNode): string | undefined {
	return directive(node, "model")?.exp?.content ?? boundAttr(node, "modelValue")
}

/** The expression a pattern 3 or 5 element stands for, before any absorbed match overrides it. */
function elementExpression(node: TemplateNode, tag: string): { expression: string; at: Located } | undefined {
	if (tag === "AddressDisplay") {
		const prop = node.props?.find((p) => p.name === "bind" && p.arg?.content === "address")
		return { expression: prop?.exp?.content ?? "AddressDisplay", at: prop?.exp ? start(prop.exp) : start(node) }
	}
	if (tag === "AddressInput" || tag === "Input") return { expression: modelExpression(node) ?? tag, at: start(node) }
	const text = (node.children ?? []).filter((c): c is TemplateNode => typeof c === "object" && c.type === NODE.INTERPOLATION)
	if (text.length) {
		const first = text[0].content as { loc: { start: unknown } }
		return { expression: text.map((t) => (t.content as { content: string }).content).join(" "), at: start(first) }
	}
	const mono = node.props?.find((p) => p.name === "mono" || p.arg?.content === "mono")
	return { expression: mono?.loc.source ?? "mono", at: start(node) }
}

type FileContext = Reach & { parsed: ParsedSource; textTags: Set<string> }

function elementKind(node: TemplateNode, ctx: FileContext): boolean {
	const tag = node.tag ?? ""
	if (tag === "AddressDisplay" || tag === "AddressInput") return true
	if (ctx.textTags.has(tag)) return hasProp(node, "mono")
	return tag === "Input" && hasProp(node, "textVariant")
}

function isIdentifierText(expression: string, ctx: FileContext): boolean {
	const text = normalize(expression)
	return isIdentifierMember(text, ctx.derived) || Boolean(ctx.reach?.test(text)) || hasSlicePair(text)
}

function elementCandidates(node: TemplateNode, path: readonly TemplateNode[], ctx: FileContext): Candidate[] {
	const own = [...path, node]
	const out: Candidate[] = []
	if (elementKind(node, ctx)) {
		const found = elementExpression(node, node.tag ?? "")
		if (found) out.push({ owner: node, path: own, expression: found.expression, at: found.at, level: "element", covers: [] })
	}
	for (const prop of node.props ?? []) {
		if (!isRenderingBind(prop) || !prop.exp) continue
		const text = prop.exp.content
		const bound = BOUND_TEXT_PROPS.has(prop.arg?.content ?? "") && isIdentifierMember(text, ctx.derived)
		if (bound || ctx.reach?.test(normalize(text)) || hasSlicePair(text)) {
			out.push({ owner: node, path: own, expression: text, at: start(prop.exp), level: "match", covers: [] })
		}
	}
	return out
}

type Half = { node: TemplateNode; path: readonly TemplateNode[]; receiver: string }

function commonPath(a: readonly TemplateNode[], b: readonly TemplateNode[]): TemplateNode[] {
	const out: TemplateNode[] = []
	for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) out.push(a[i])
	return out
}

/** A slice head in one interpolation and its tail in another, on one receiver, read as one site. */
function splitPairs(heads: readonly Half[], tails: readonly Half[]): Candidate[] {
	const out: Candidate[] = []
	for (const head of heads) {
		const tail = tails.find((t) => t.receiver === head.receiver && t.node !== head.node)
		if (!tail) continue
		const path = commonPath(head.path, tail.path).filter((n) => n.type === NODE.ELEMENT || n === head.path[0])
		const owner = path[path.length - 1]
		const content = head.node.content as { content: string; loc: { start: unknown } }
		out.push({ owner, path, expression: content.content, at: start(content), level: "match", covers: [head.node, tail.node] })
	}
	return out
}

function collect(ctx: FileContext): Candidate[] {
	const root = ctx.parsed.template
	if (!root) return []
	const out: Candidate[] = []
	const heads: Half[] = []
	const tails: Half[] = []
	walkTemplate(root, (node, ancestors) => {
		if (node.type === NODE.ELEMENT) out.push(...elementCandidates(node, ancestors, ctx))
		if (node.type !== NODE.INTERPOLATION) return
		const content = node.content as { content: string; loc: { start: unknown } }
		const owner = ancestors[ancestors.length - 1]
		if (isIdentifierText(content.content, ctx)) {
			out.push({ owner, path: ancestors, expression: content.content, at: start(content), level: "match", covers: [node] })
			return
		}
		for (const receiver of receivers(content.content, SLICE_HEAD)) heads.push({ node, path: ancestors, receiver })
		for (const receiver of receivers(content.content, SLICE_TAIL)) tails.push({ node, path: ancestors, receiver })
	})
	return [...out, ...splitPairs(heads, tails)]
}

const OWN_EXPRESSION = new Set(["AddressDisplay", "AddressInput", "Input"])

/**
 * One site per pattern 3 or 5 element. A mono `<Text>` reads as the first text match in its
 * subtree, so the site keeps its key once `mono` gives way to a role; a binding such as a native
 * `title` never names it.
 */
function absorb(candidates: readonly Candidate[]): Candidate[] {
	const elements = candidates.filter((c) => c.level === "element")
	const absorbed = new Set<Candidate>()
	const merged = elements.map((element) => {
		const inside = candidates.filter((c) => c.level === "match" && !absorbed.has(c) && c.path.includes(element.owner))
		for (const c of inside) absorbed.add(c)
		const text = inside.find((c) => c.covers.length > 0)
		return OWN_EXPRESSION.has(element.owner.tag ?? "") || !text ? element : { ...element, expression: text.expression, at: text.at }
	})
	return [...merged, ...candidates.filter((c) => c.level === "match" && !absorbed.has(c))]
}

function siblingsOf(parent: TemplateNode): TemplateNode[] {
	return (parent.children ?? []).filter((c): c is TemplateNode => typeof c === "object" && c.type === NODE.ELEMENT)
}

const wrap = (condition: string): string => (/\|\||\?(?!\.)/.test(condition) ? `(${condition})` : condition)

function step(node: TemplateNode, parent: TemplateNode | undefined): BranchStep | undefined {
	const own = directive(node, "if") ?? directive(node, "else-if") ?? directive(node, "else")
	if (!own) return undefined
	if (own.name === "if") return { chain: chainId(node), condition: normalize(own.exp?.content ?? "") }
	const siblings = parent ? siblingsOf(parent) : []
	const earlier: string[] = []
	let head = node
	for (let i = siblings.indexOf(node) - 1; i >= 0; i--) {
		const cond = directive(siblings[i], "if") ?? directive(siblings[i], "else-if")
		if (!cond) break
		earlier.unshift(normalize(cond.exp?.content ?? ""))
		head = siblings[i]
		if (cond.name === "if") break
	}
	const condition = own.name === "else-if" ? normalize(own.exp?.content ?? "") : `!(${earlier.map(wrap).join(" || ")})`
	return { chain: chainId(head), condition }
}

function chainId(node: TemplateNode): string {
	const at = start(node)
	return `${at.line}:${at.column}`
}

function steps(path: readonly TemplateNode[]): BranchStep[] {
	return path.flatMap((node, i) => (node.type === NODE.ELEMENT ? (step(node, path[i - 1]) ?? []) : []))
}

function testidOf(node: TemplateNode): string | undefined {
	if (node.type !== NODE.ELEMENT) return undefined
	return node.props?.find((p) => p.name === "data-testid")?.value?.content ?? boundAttr(node, "data-testid")
}

export const branchText = (branch: readonly BranchStep[]): string =>
	branch.map((s) => (s.condition.startsWith("!(") ? s.condition : wrap(s.condition))).join(" && ")

/** The sites of one source, from its text: what the CLI and the fixtures share. */
export function sitesInSource(file: string, source: string, utilities: readonly string[]): IdentifierSite[] {
	const parsed = parseSource(file, source)
	const ctx: FileContext = { ...localReach(parsed, utilities), parsed, textTags: textTagNames(parsed) }
	const ordered = absorb(collect(ctx)).sort((a, b) => a.at.offset - b.at.offset)
	const seen = new Map<string, number>()
	return ordered.map((c) => {
		const expression = normalize(c.expression)
		const ordinal = seen.get(expression) ?? 0
		seen.set(expression, ordinal + 1)
		const branch = steps(c.path)
		const testids = [...c.path].reverse().flatMap((node) => testidOf(node) ?? [])
		return {
			file,
			line: c.at.line,
			expression,
			component: c.owner.tag ?? "",
			branch: branchText(branch),
			ordinal,
			steps: branch,
			testids,
		}
	})
}

/** Every identifier site in the wallet's templates, by file then document order. */
export function identifierSites(files: readonly string[] = sourceFiles()): IdentifierSite[] {
	const utilities = utilityReachers(files)
	return files
		.filter((file) => file.endsWith(".vue"))
		.flatMap((file) => sitesInSource(file, readFileSync(join(REPO_ROOT, file), "utf8"), utilities))
}

export type ProducerHit = { file: string; text: string }

const PRODUCER_FILE = /\.(ts|js|vue)$/

function filesUnder(root: string): string[] {
	try {
		return readdirSync(join(REPO_ROOT, root), { recursive: true, encoding: "utf8" }).map((f) => `${root}/${f.split("\\").join("/")}`)
	} catch {
		return []
	}
}

/**
 * Every match of `search` in the sources of every app and package, tests aside: the producer set an
 * `unreachable` site pins, each hit's text whitespace-collapsed so a moved line is no change.
 */
export function producerHits(search: RegExp): ProducerHit[] {
	const roots = ["apps", "packages"].flatMap((dir) => readdirSync(join(REPO_ROOT, dir)).map((name) => `${dir}/${name}/src`))
	const global = new RegExp(search.source, search.flags.includes("g") ? search.flags : `${search.flags}g`)
	return roots
		.flatMap(filesUnder)
		.filter((file) => PRODUCER_FILE.test(file) && !SKIPPED.test(file) && !file.includes("/node_modules/"))
		.sort()
		.flatMap((file) => [...readFileSync(join(REPO_ROOT, file), "utf8").matchAll(global)].map((m) => ({ file, text: normalize(m[0]) })))
}

export function formatSite(site: IdentifierSite): string {
	return `${site.file}:${site.line}  ${site.expression}  ${site.component}  ${site.branch || "(always)"}  #${site.ordinal}`
}

if (import.meta.main) for (const site of identifierSites()) console.log(formatSite(site))
