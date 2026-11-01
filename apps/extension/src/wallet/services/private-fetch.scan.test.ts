import { readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"
import { callsTo } from "../../../scripts/type-roles/source-code"
import { REPO_ROOT } from "../../../scripts/type-roles/source-scan"

/**
 * The services that fetch from a remote host build every request from `privateFetchInit`, the one
 * holder of the Privacy Policy's promise and of the redirect refusal: none names a request option
 * in an object literal, whatever its spelling or value, and every `this.fetchFn` call passes the
 * helper's init. A spread or a property assigned after the call is outside this pin.
 */

const SERVICES = ["apps/extension/src/wallet/services/token-list/service.ts", "apps/extension/src/wallet/services/price/service.ts"]
const OPTIONS = new Set(["credentials", "referrerPolicy", "cache", "redirect"])

function propertyName(node: ts.ObjectLiteralElementLike): string | undefined {
	if (ts.isShorthandPropertyAssignment(node)) return node.name.text
	if (!ts.isPropertyAssignment(node) && !ts.isMethodDeclaration(node)) return undefined
	return ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : undefined
}

/** Each object-literal property named after a request option, as `line → text`. */
function optionsSpelled(file: string, text: string): string[] {
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
	const hits: string[] = []
	const visit = (node: ts.Node): void => {
		if (ts.isObjectLiteralExpression(node)) {
			for (const property of node.properties) {
				if (!OPTIONS.has(propertyName(property) ?? "")) continue
				const line = source.getLineAndCharacterOfPosition(property.getStart(source)).line + 1
				hits.push(`${file}:${line} → ${property.getText(source)}`)
			}
		}
		node.forEachChild(visit)
	}
	visit(source)
	return hits
}

/** Each `this.fetchFn` call whose init is not a `privateFetchInit(...)` call. */
function initsNotPrivate(file: string, text: string): string[] {
	return callsTo(file, text, /^this\.fetchFn$/)
		.filter(({ args }) => {
			const init = args[1]
			return !init || !ts.isCallExpression(init) || init.expression.getText() !== "privateFetchInit"
		})
		.map(({ line, args }) => `${file}:${line} → ${args[1]?.getText() ?? "(no init)"}`)
}

describe("remote fetches build their request from privateFetchInit", () => {
	test.each(SERVICES)("%s names no request option and passes the helper's init to every fetch", (file) => {
		const text = readFileSync(join(REPO_ROOT, file), "utf8")
		expect(optionsSpelled(file, text)).toEqual([])
		expect(callsTo(file, text, /^this\.fetchFn$/)).not.toEqual([])
		expect(initsNotPrivate(file, text)).toEqual([])
	})

	test("the pins catch a quoted name, a variable value and a shorthand, and skip a comment and a class field", () => {
		const spelled = [
			'const a = { "redirect": "follow" }',
			"fetch(u, {\n\tredirect: mode,\n})",
			"const b = { cache }",
			'// credentials: "include"',
			"class C {\n\tprivate readonly cache = new Map()\n}",
		].join("\n")
		expect(optionsSpelled("fixture.ts", spelled)).toEqual([
			'fixture.ts:1 → "redirect": "follow"',
			"fixture.ts:3 → redirect: mode",
			"fixture.ts:5 → cache",
		])
		const calls =
			"class S {\n\tasync a() {\n\t\tawait this.fetchFn(url, { signal })\n\t\tawait this.fetchFn(url, privateFetchInit(signal))\n\t}\n}"
		expect(initsNotPrivate("fixture.ts", calls)).toEqual(["fixture.ts:3 → { signal }"])
	})
})
