import { readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"
import { REPO_ROOT } from "../../../scripts/type-roles/source-scan"

/**
 * The services that fetch from a remote host build every request from `privateFetchInit`, the one
 * holder of the Privacy Policy's promise and of the redirect refusal: none names a request option
 * in an object literal, however the name is written, and every `this.fetchFn` call passes the
 * helper's init. A spread or a property assigned after the call is outside this pin.
 */

const SERVICES = ["apps/extension/src/wallet/services/token-list/service.ts", "apps/extension/src/wallet/services/price/service.ts"]
const OPTIONS = new Set(["credentials", "referrerPolicy", "cache", "redirect"])

function staticName(name: ts.Node | undefined): string | undefined {
	if (!name) return undefined
	if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text
	if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text
	return undefined
}

const calleeName = (callee: ts.Expression): string | undefined => {
	if (ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword) return callee.name.text
	if (ts.isElementAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword)
		return staticName(callee.argumentExpression)
	return undefined
}

const isPrivateInit = (init: ts.Expression | undefined): boolean =>
	!!init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "privateFetchInit"

const optionProperties = (node: ts.Node): ts.ObjectLiteralElementLike[] =>
	ts.isObjectLiteralExpression(node)
		? node.properties.filter((p) => !ts.isSpreadAssignment(p) && OPTIONS.has(staticName(p.name) ?? ""))
		: []

const isFetchFnCall = (node: ts.Node): node is ts.CallExpression => ts.isCallExpression(node) && calleeName(node.expression) === "fetchFn"

/** The object-literal properties named after a request option, and the `this.fetchFn` calls, each
 *  as `file:line → text`. */
function scan(file: string, text: string): { spelled: string[]; fetches: string[]; notPrivate: string[] } {
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
	const at = (node: ts.Node, shown: ts.Node = node) =>
		`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} → ${shown.getText(source)}`
	const found = { spelled: [] as string[], fetches: [] as string[], notPrivate: [] as string[] }
	const visit = (node: ts.Node): void => {
		found.spelled.push(...optionProperties(node).map((p) => at(p)))
		if (isFetchFnCall(node)) {
			found.fetches.push(at(node))
			if (!isPrivateInit(node.arguments[1])) found.notPrivate.push(at(node, node.arguments[1] ?? node))
		}
		node.forEachChild(visit)
	}
	visit(source)
	return found
}

describe("remote fetches build their request from privateFetchInit", () => {
	test.each(SERVICES)("%s names no request option and passes the helper's init to every fetch", (file) => {
		const { spelled, fetches, notPrivate } = scan(file, readFileSync(join(REPO_ROOT, file), "utf8"))
		expect(spelled).toEqual([])
		expect(fetches).not.toEqual([])
		expect(notPrivate).toEqual([])
	})

	test("the pins catch every spelling of a name and of the fetch, and skip a comment and a class field", () => {
		const fixture = [
			'const a = { "redirect": "follow" }',
			"fetch(u, { redirect: mode })",
			"const b = { cache }",
			'const c = { ["credentials"]: "include", get referrerPolicy() { return "origin" } }',
			'// credentials: "include"',
			"class S {",
			"	private readonly cache = new Map()",
			"	async a() {",
			"		await this.fetchFn(url, privateFetchInit(signal))",
			"		await this . fetchFn(url, { signal })",
			'		await this["fetchFn"](url, init)',
			"	}",
			"}",
		].join("\n")
		expect(scan("f.ts", fixture)).toEqual({
			spelled: [
				'f.ts:1 → "redirect": "follow"',
				"f.ts:2 → redirect: mode",
				"f.ts:3 → cache",
				'f.ts:4 → ["credentials"]: "include"',
				'f.ts:4 → get referrerPolicy() { return "origin" }',
			],
			fetches: [
				"f.ts:9 → this.fetchFn(url, privateFetchInit(signal))",
				"f.ts:10 → this . fetchFn(url, { signal })",
				'f.ts:11 → this["fetchFn"](url, init)',
			],
			notPrivate: ["f.ts:10 → { signal }", "f.ts:11 → init"],
		})
	})
})
