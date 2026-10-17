import ts from "typescript"
import { type Expression, NODE, parseSource, type TemplateNode, walkTemplate } from "./source-scan"

/**
 * Code read through the TypeScript parser, for the guards that scan code rather than markup: the
 * parser decides what is a string, a template part, a regex or a comment, so no guard keeps a lexer
 * of its own.
 */

type Span = { from: number; to: number }

/** Comments are read off the text, so the parser need not build JSDoc nodes. */
const PARSE = { languageVersion: ts.ScriptTarget.Latest, jsDocParsingMode: ts.JSDocParsingMode.ParseNone }

/** A line, block or JSDoc comment starting at `at`, as the index just past it; undefined if none starts there. */
function commentEnd(text: string, at: number): number | undefined {
	if (text[at] !== "/") return undefined
	if (text[at + 1] === "/") {
		const eol = text.indexOf("\n", at)
		return eol === -1 ? text.length : eol
	}
	if (text[at + 1] !== "*") return undefined
	const close = text.indexOf("*/", at + 2)
	return close === -1 ? text.length : close + 2
}

function blank(out: string[], { from, to }: Span): void {
	for (let i = from; i < to; i++) if (out[i] !== "\n") out[i] = " "
}

/** Masks only the brackets, to `\0`: text stays readable, and no mask is whitespace. */
function maskBrackets(out: string[], { from, to }: Span): void {
	for (let i = from; i < to; i++) if ("()[]{}".includes(out[i] as string)) out[i] = "\0"
}

/** The text between a string's or a template part's delimiters; undefined for any other node. */
function literalText(node: ts.Node, source: ts.SourceFile): Span | undefined {
	switch (node.kind) {
		case ts.SyntaxKind.StringLiteral:
		case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
		case ts.SyntaxKind.TemplateTail:
			return { from: node.getStart(source) + 1, to: node.end - 1 }
		case ts.SyntaxKind.TemplateHead:
		case ts.SyntaxKind.TemplateMiddle:
			return { from: node.getStart(source) + 1, to: node.end - 2 }
		default:
			return undefined
	}
}

/**
 * Blanks every comment: a `//` or `/*` outside every literal span. Reading comments off the text
 * rather than the parser's trivia finds one wherever it sits, before a bare `)` or `,` included.
 */
function blankComments(text: string, out: string[], literals: readonly Span[], from: number): void {
	let next = 0
	for (let i = from; i < text.length; i++) {
		while (next < literals.length && (literals[next] as Span).to <= i) next++
		const literal = literals[next]
		if (literal && literal.from <= i) {
			i = literal.to - 1
			continue
		}
		const end = commentEnd(text, i)
		if (end === undefined) continue
		blank(out, { from: i, to: end })
		i = end - 1
	}
}

/**
 * `text` with comments, a shebang, regex bodies and the text of strings and template parts blanked
 * to spaces; delimiters, regex flags and newlines stay, so every offset and line keeps its place. A
 * `${}` body stays code, and a string or template text inside one stays readable with its brackets
 * masked to `\0`, so a bracket key (`${row["master-key"]}`) is still read and its brackets are
 * never counted.
 */
function maskScript(text: string): string {
	const source = ts.createSourceFile("code.ts", text, PARSE, false, ts.ScriptKind.TS)
	const out = text.split("")
	const literals: Span[] = []
	const visit = (node: ts.Node, nested: boolean): void => {
		if (ts.isTemplateSpan(node) || ts.isTemplateLiteralTypeSpan(node)) {
			visit(ts.isTemplateSpan(node) ? node.expression : node.type, true)
			visit(node.literal, nested)
			return
		}
		if (ts.isRegularExpressionLiteral(node)) {
			const from = node.getStart(source)
			literals.push({ from, to: node.end })
			blank(out, { from, to: from + node.text.lastIndexOf("/") + 1 })
			return
		}
		const inner = literalText(node, source)
		if (!inner) {
			node.forEachChild((child) => visit(child, nested))
			return
		}
		literals.push({ from: node.getStart(source), to: node.end })
		if (nested) maskBrackets(out, inner)
		else blank(out, inner)
	}
	visit(source, false)
	const shebang = ts.getShebang(text)?.length ?? 0
	blank(out, { from: 0, to: shebang })
	blankComments(text, out, literals, shebang)
	return out.join("")
}

/**
 * The file's lines with noise blanked (see `maskScript`), one per real line. A `.vue` file
 * contributes its script blocks at their real lines; its template and styles are blank.
 */
export function codeLines(file: string, text: string): string[] {
	if (!file.endsWith(".vue")) return maskScript(text).split("\n")
	const lines = text.split("\n").map(() => "")
	for (const block of parseSource(file, text).scripts) {
		for (const [i, line] of maskScript(block.content).split("\n").entries()) lines[block.startLine - 1 + i] = line
	}
	return lines
}

export type Call = {
	/** The 1-based line of the callee's name. */
	line: number
	/** The callee's source text: `this._logger.log`, `NuloAccount.new`, `Lock` for `new Lock(…)`. */
	callee: string
	args: readonly ts.Expression[]
}

type Fragment = { code: string; line: number }

function isExpression(value: unknown): value is Expression {
	return typeof value === "object" && value !== null && "content" in value && "loc" in value
}

/** A template node's code: an interpolation, a directive's value, a dynamic directive argument. */
function templateCode(node: TemplateNode): Fragment[] {
	const expressions: unknown[] = node.type === NODE.INTERPOLATION ? [node.content] : []
	for (const prop of node.props ?? []) {
		if (prop.type !== NODE.DIRECTIVE) continue
		expressions.push(prop.exp, prop.arg?.isStatic === false ? prop.arg : undefined)
	}
	return expressions.filter(isExpression).map((exp) => ({ code: exp.content, line: exp.loc.start.line }))
}

function callsIn({ code, line }: Fragment, callee: RegExp): Call[] {
	// Parent links, so a caller can read an argument with `getText()`.
	const source = ts.createSourceFile("code.ts", code, PARSE, true, ts.ScriptKind.TS)
	const calls: Call[] = []
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
			const text = node.expression.getText(source)
			if (text.search(callee) !== -1) {
				const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression
				const at = source.getLineAndCharacterOfPosition(name.getStart(source)).line
				calls.push({ line: line + at, callee: text, args: node.arguments ?? [] })
			}
		}
		node.forEachChild(visit)
	}
	visit(source)
	return calls
}

/**
 * Every call and `new` whose callee's source text `callee` matches, in the file's scripts and, for
 * a `.vue` file, its template's interpolations, directive values and dynamic directive arguments,
 * each at its real line. A guard reads an argument's shape from its node and its text with
 * `getText()`.
 */
export function callsTo(file: string, text: string, callee: RegExp): Call[] {
	const { scripts, template } = parseSource(file, text)
	const fragments: Fragment[] = scripts.map((block) => ({ code: block.content, line: block.startLine }))
	if (template) walkTemplate(template, (node) => fragments.push(...templateCode(node)))
	return fragments.flatMap((fragment) => callsIn(fragment, callee))
}
