import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"
import { callsTo } from "../../scripts/type-roles/source-code"
import { REPO_ROOT, sourceFiles } from "../../scripts/type-roles/source-scan"

/**
 * A snack's kind is a per-site decision nothing types: a call that leaves it out lands as an error,
 * and a stray icon, colour or duration is a site the rewrite missed. Textual on purpose — aliasing
 * defeats it, which is what review is for.
 */

const SRC = "apps/extension/src"

const files = sourceFiles({ roots: [SRC], exts: ["ts", "js", "vue"], skip: [/\.(test|stories|d)\.ts$/] }).map((file) => ({
	path: relative(SRC, file),
	text: readFileSync(join(REPO_ROOT, file), "utf8"),
}))
const filesMatching = (pattern: RegExp) => files.filter((file) => pattern.test(file.text)).map((file) => file.path)

interface Call {
	site: string
	args: readonly ts.Expression[]
}

function callsIn(file: { path: string; text: string }): Call[] {
	return callsTo(file.path, file.text, /\bopenToast$/).map(({ line, args }) => ({ site: `${file.path}:${line}`, args }))
}

const LITERAL_KIND = /\bkind:\s*(?:"(?:success|info|error)"|[^,{}?]+\?\s*"(?:success|info|error)"\s*:\s*"(?:success|info|error)")\s*[,}\n]/

/** One object literal, nothing after it, with a literal `kind`. */
function oneLiteralWithKind(args: readonly ts.Expression[]): boolean {
	const [only] = args
	return args.length === 1 && only !== undefined && ts.isObjectLiteralExpression(only) && LITERAL_KIND.test(only.getText())
}

describe("every snack names its kind", () => {
	const calls = files.flatMap(callsIn)

	test("a call on a member is read like a bare one", () => {
		const [call] = callsIn({ path: "x.ts", text: 'ui.openToast({ label: "x" })' })
		expect(call?.site).toBe("x.ts:1")
		expect(call && oneLiteralWithKind(call.args)).toBe(false)
	})

	test("there are enough calls for the scan to mean something", () => {
		expect(calls.length).toBeGreaterThanOrEqual(100)
	})

	test("each call passes one object literal whose kind is success, info, error, or a ternary of two of them", () => {
		expect(calls.filter((call) => !oneLiteralWithKind(call.args)).map((call) => call.site)).toEqual([])
	})

	test("no call carries an icon or a colour, and nothing reads a duration", () => {
		const strays = calls.filter((call) => call.args.some((arg) => /\b(?:icon|color):/.test(arg.getText())))
		expect(strays.map((call) => call.site)).toEqual([])
		expect(filesMatching(/\bTOAST_DURATION\b/)).toEqual([])
	})
})
