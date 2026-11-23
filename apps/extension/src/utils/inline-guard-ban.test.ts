import { readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"
import {
	DECLARATION,
	parseSource,
	REPO_ROOT,
	type SourcePolicy,
	STORY_FILE,
	sourceFiles,
	TEST_FILE,
	workspaceSrcRoots,
} from "../../scripts/type-roles/source-scan"

/**
 * Static ban: code in a workspace that depends on `@nulo/wallet-core` calls its shape guards
 * (`isObjectLike`, `isRecord`, `isHex32` or `HEX_32`) instead of restating them, so changing what
 * "object" or "32-byte hex" means at a trust boundary is one edit.
 *
 * A finding is a `typeof E` test for "object" beside a null exclusion of the same `E` in one run of
 * `&&` (`E !== null`, `E != null`, `E` or `!!E`) or, negated, of `||` (`E === null`, `E == null` or
 * `!E`); or a regex literal whose hex character class follows `0x` and is quantified `{64}`. Findings match
 * `inline-guard-ban.reviewed.json` by file and the run's text as a multiset, so a moved line needs no
 * edit and an edited expression needs a fresh review; `scripts/ci-cd/inline-guard-ratchet.test.ts`
 * refuses a new entry on a pull request.
 *
 * Blind spots: a guard split across statements (`if (x === null) return`, then `typeof x`), a
 * template expression, a pattern built by `new RegExp`, an alias of the operand.
 */

const CORE = "@nulo/wallet-core"
const REVIEWED_PATH = join(__dirname, "inline-guard-ban.reviewed.json")

/** The workspaces that can import the helpers, so a new dependent is read the day it adds one. */
function dependentRoots(): string[] {
	return [...workspaceSrcRoots("apps"), ...workspaceSrcRoots("packages")].filter((root) => {
		const pkg = JSON.parse(readFileSync(join(REPO_ROOT, root, "..", "package.json"), "utf8"))
		return pkg.name === CORE || CORE in { ...pkg.dependencies, ...pkg.devDependencies }
	})
}

const POLICY: SourcePolicy = {
	roots: dependentRoots(),
	exts: ["ts", "js", "vue"],
	skip: [TEST_FILE, STORY_FILE, DECLARATION, /^packages\/wallet-core\/src\/utils\/(guards|field)\.ts$/],
}

type Hit = { file: string; line: number; text: string; hint: string }
type Entry = { text: string; why: string }
type Reviewed = Record<string, Entry[]>

const K = ts.SyntaxKind
const EQUAL = new Set([K.EqualsEqualsEqualsToken, K.EqualsEqualsToken])
const UNEQUAL = new Set([K.ExclamationEqualsEqualsToken, K.ExclamationEqualsToken])

const squash = (text: string): string => text.replace(/\s+/g, " ").trim()
const unwrap = (node: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node)
const textOf = (node: ts.Node): string => squash(node.getText())
const isNot = (node: ts.Expression): node is ts.PrefixUnaryExpression =>
	ts.isPrefixUnaryExpression(node) && node.operator === K.ExclamationToken
const isObjectString = (node: ts.Expression): boolean => ts.isStringLiteralLike(node) && node.text === "object"

/** `typeof E` compared with "object": `E`'s text, and whether the test asks "is it an object". */
function typeofObject(node: ts.Node): { operand: string; positive: boolean } | undefined {
	if (!ts.isBinaryExpression(node)) return undefined
	const operator = node.operatorToken.kind
	if (!EQUAL.has(operator) && !UNEQUAL.has(operator)) return undefined
	const [left, right] = [unwrap(node.left), unwrap(node.right)]
	const tested = ts.isTypeOfExpression(left) && isObjectString(right) ? left : isObjectString(left) ? right : undefined
	if (!tested || !ts.isTypeOfExpression(tested)) return undefined
	return { operand: textOf(tested.expression), positive: EQUAL.has(operator) }
}

function operandsOf(node: ts.Expression, operator: ts.SyntaxKind): ts.Expression[] {
	const inner = unwrap(node)
	if (!ts.isBinaryExpression(inner) || inner.operatorToken.kind !== operator) return [inner]
	return [...operandsOf(inner.left, operator), ...operandsOf(inner.right, operator)]
}

/** The run of `operator` that `node` is an operand of, through parentheses. */
function runOf(node: ts.Node, operator: ts.SyntaxKind): ts.BinaryExpression | undefined {
	let root: ts.BinaryExpression | undefined
	for (let parent = node.parent; parent; parent = parent.parent) {
		if (ts.isParenthesizedExpression(parent)) continue
		if (!ts.isBinaryExpression(parent) || parent.operatorToken.kind !== operator) break
		root = parent
	}
	return root
}

/** In an `&&` run, `E !== null`, `E != null`, `E` or `!!E`; in an `||` run, `E === null`, `E == null` or `!E`. */
function excludesNull(node: ts.Expression, operand: string, positive: boolean): boolean {
	if (positive && textOf(node) === operand) return true
	if (positive && isNot(node)) {
		const inner = unwrap(node.operand)
		return isNot(inner) && textOf(unwrap(inner.operand)) === operand
	}
	if (!positive && isNot(node)) return textOf(unwrap(node.operand)) === operand
	if (!ts.isBinaryExpression(node) || !(positive ? UNEQUAL : EQUAL).has(node.operatorToken.kind)) return false
	const [left, right] = [unwrap(node.left), unwrap(node.right)]
	if (right.kind === K.NullKeyword) return textOf(left) === operand
	return left.kind === K.NullKeyword && textOf(right) === operand
}

/** In an `&&` run, `!Array.isArray(E)`; in an `||` run, `Array.isArray(E)`. */
function excludesArrays(node: ts.Expression, operand: string, positive: boolean): boolean {
	const call = positive ? (isNot(node) ? unwrap(node.operand) : undefined) : node
	if (!call || !ts.isCallExpression(call) || call.arguments.length !== 1) return false
	return call.expression.getText() === "Array.isArray" && textOf(call.arguments[0]) === operand
}

function objectHit(node: ts.Node): Omit<Hit, "file" | "line"> | undefined {
	const test = typeofObject(node)
	if (!test) return undefined
	const { operand, positive } = test
	const root = runOf(node, positive ? K.AmpersandAmpersandToken : K.BarBarToken)
	if (!root) return undefined
	const others = operandsOf(root, root.operatorToken.kind).filter((other) => other !== node)
	if (!others.some((other) => excludesNull(other, operand, positive))) return undefined
	const helper = others.some((other) => excludesArrays(other, operand, positive)) ? "isRecord" : "isObjectLike"
	return { text: textOf(root), hint: `${positive ? "" : "!"}${helper}(${operand})` }
}

/** Whether `0x` ends at `end`, past any group brackets between them. */
function follows0x(pattern: string, end: number): boolean {
	for (;;) {
		if (end >= 3 && pattern.startsWith("(?:", end - 3)) end -= 3
		else if (end > 0 && "()".includes(pattern[end - 1])) end -= 1
		else return end >= 2 && pattern.slice(end - 2, end).toLowerCase() === "0x"
	}
}

/** A character class holding a hex range, after `0x` (group brackets aside) and quantified exactly
 *  `{64}`: the field shape `isHex32` names (a bare 64-digit digest has no helper). Plain string
 *  scanning: no pattern of its own for a ReDoS query to judge. */
function hasHexClass64(pattern: string): boolean {
	for (let open = pattern.indexOf("["); open !== -1; open = pattern.indexOf("[", open + 1)) {
		const close = pattern.indexOf("]", open)
		if (close === -1) return false
		const range = pattern.slice(open + 1, close)
		if (follows0x(pattern, open) && (range.includes("a-f") || range.includes("A-F")) && pattern.startsWith("{64}", close + 1)) {
			return true
		}
	}
	return false
}

function hexHit(node: ts.Node): Omit<Hit, "file" | "line"> | undefined {
	if (!ts.isRegularExpressionLiteral(node) || !hasHexClass64(node.text)) return undefined
	return { text: node.text, hint: "isHex32 or HEX_32" }
}

function scanScript(file: string, code: string, firstLine: number, out: Hit[]): void {
	if (!code.includes("typeof") && !code.includes("{64}")) return
	const tree = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const visit = (node: ts.Node): void => {
		const hit = objectHit(node) ?? hexHit(node)
		if (hit) out.push({ file, line: firstLine + tree.getLineAndCharacterOfPosition(node.getStart(tree)).line, ...hit })
		ts.forEachChild(node, visit)
	}
	visit(tree)
}

/** Every inline restatement in one source; `source` defaults to the file on disk. */
function scan(file: string, source?: string): Hit[] {
	const out: Hit[] = []
	for (const block of parseSource(file, source).scripts) scanScript(file, block.content, block.startLine, out)
	return out
}

const treeFiles = (): string[] => sourceFiles(POLICY)

let treeHits: Hit[] | undefined

function scanTree(): Hit[] {
	treeHits ??= treeFiles().flatMap((file) => scan(file))
	return treeHits
}

const readReviewed = (): Reviewed => JSON.parse(readFileSync(REVIEWED_PATH, "utf8"))
const keyOf = (file: string, text: string): string => `${file}\n${text}`

/** Hits no entry covers, and entries no hit consumed; each entry covers one hit. */
function review(hits: readonly Hit[], reviewed: Reviewed): { open: Hit[]; stale: string[] } {
	const pending = new Map<string, number>()
	for (const [file, entries] of Object.entries(reviewed)) {
		for (const { text } of entries) pending.set(keyOf(file, text), (pending.get(keyOf(file, text)) ?? 0) + 1)
	}
	const open = hits.filter((hit) => {
		const left = pending.get(keyOf(hit.file, hit.text)) ?? 0
		if (left > 0) pending.set(keyOf(hit.file, hit.text), left - 1)
		return left === 0
	})
	const stale = [...pending].flatMap(([key, left]) => Array.from({ length: left }, () => key.replace("\n", "  ")))
	return { open, stale }
}

function reviewedProblems(reviewed: Reviewed): string[] {
	const files = Object.keys(reviewed)
	const order = files.join("\n") === [...files].sort().join("\n") ? [] : ["files out of order"]
	const reasons = files.flatMap((file) =>
		reviewed[file].flatMap(({ text, why }, i) => (why.trim() ? [] : [`${file}[${i}] ${text}: no reason`])),
	)
	return [...order, ...reasons]
}

describe("inline guard ban (static)", () => {
	test("no inline object guard or 64-hex regex outside the reviewed baseline", () => {
		expect(treeFiles().length).toBeGreaterThan(900)
		const open = review(scanTree(), readReviewed()).open.map(
			({ file, line, text, hint }) => `${file}:${line} (use ${hint})\n  ${JSON.stringify({ text, why: "" })}`,
		)
		expect(
			open,
			`Call the wallet-core helper named in each line; a site whose contract differs from every helper keeps its own named check and needs a reviewed entry with its reason:\n${open.join("\n")}`,
		).toEqual([])
	})

	test("every reviewed entry still matches a site, and each states its reason", () => {
		const reviewed = readReviewed()
		expect(review(scanTree(), reviewed).stale, "Reviewed entries that match no site, to delete").toEqual([])
		expect(reviewedProblems(reviewed)).toEqual([])
	})

	test.each<[string, string, string, string[]]>([
		["a null test", "x.ts", 'const a = typeof x === "object" && x !== null', ["isObjectLike(x)"]],
		["a null test first", "x.ts", 'const a = x != null && typeof x == "object"', ["isObjectLike(x)"]],
		["a truthiness test", "x.ts", 'if (x && typeof x === "object") f()', ["isObjectLike(x)"]],
		["the negated form", "x.ts", 'if (typeof x !== "object" || x === null) return', ["!isObjectLike(x)"]],
		["the negated truthiness form", "x.ts", 'if (!x || typeof x !== "object") return', ["!isObjectLike(x)"]],
		["an array exclusion", "x.ts", 'if (typeof x !== "object" || x === null || Array.isArray(x)) return', ["!isRecord(x)"]],
		[
			"a member operand with an extra clause",
			"x.ts",
			'const a = typeof o.b === "object" && o.b !== null && "c" in o.b',
			["isObjectLike(o.b)"],
		],
		["an escaped type name", "x.ts", 'const a = typeof x === "\\x6fbject" && x !== null', ["isObjectLike(x)"]],
		["a script block", "x.vue", '<script setup>\nconst a = typeof x === "object" && x !== null\n</script>', ["isObjectLike(x)"]],
		["a 64-hex regex", "x.ts", "const R = /^0x[0-9a-f]{64}$/i", ["isHex32 or HEX_32"]],
		["a double negation", "x.ts", 'const a = typeof x === "object" && !!x', ["isObjectLike(x)"]],
		["a bare typeof test", "x.ts", 'const a = typeof x === "object"', []],
		["a mixed-polarity form", "x.ts", 'const a = typeof x === "object" || x === null', []],
		["a null test on another operand", "x.ts", 'const a = typeof x === "object" && y !== null', []],
		["the helper itself", "x.ts", "const a = isObjectLike(x)", []],
		["a short field regex", "x.ts", "const R = /^0x[0-9a-fA-F]{1,64}$/", []],
		["a selector regex", "x.ts", "const R = /^0x[0-9a-f]{8}$/", []],
		["an open-ended hex run", "x.ts", "const R = /0x[0-9a-f]{64,}/g", []],
		["a non-hex class", "x.ts", "const R = /^[z]{64}$/", []],
		["a digest with no 0x prefix", "x.ts", "const R = /^[0-9a-f]{64}$/", []],
		["a grouped prefix", "x.ts", "const R = /^(?:0x)[0-9a-fA-F]{64}$/", ["isHex32 or HEX_32"]],
		["a grouped class", "x.ts", "const R = /^0x(?:[0-9a-fA-F]{64})$/", ["isHex32 or HEX_32"]],
		["a repeated prefix", "x.ts", "const R = /^(0x[0-9a-f]){64}$/", []],
	])("%s", (_case, file, source, hints) => {
		expect(scan(file, source).map(({ hint }) => hint)).toEqual(hints)
	})

	test("an edited expression or an entry's duplicate is a fresh finding", () => {
		const text = 'typeof x === "object" && x !== null'
		const hits = scan("x.ts", `const a = ${text}\nconst b = ${text}`)
		expect(review(hits, { "x.ts": [{ text, why: "w" }] }).open).toHaveLength(1)
		expect(
			review(hits, {
				"x.ts": [
					{ text, why: "w" },
					{ text, why: "w" },
				],
			}),
		).toEqual({ open: [], stale: [] })
		expect(
			review(scan("x.ts", 'const a = typeof x === "object" && x !== null && y'), { "x.ts": [{ text, why: "w" }] }).stale,
		).toHaveLength(1)
	})
})
