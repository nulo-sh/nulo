import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"
import { REPO_ROOT, sourceFiles, TEST_FILE } from "../../../scripts/type-roles/source-scan"
import { UNLOCK_CONVERSIONS } from "./unlock-conversions"

/**
 * An unlock-time value change of a sealed root's rows is an entry of `UNLOCK_CONVERSIONS`, never code
 * of its own at the hook. This pins what each `onRowKeysReady` handler calls: the handler, followed
 * one hop when it only calls `this.m(...)`, reduced to the set of its callees with logging dropped.
 * A new subscriber or a new callee reds until it is reviewed here. Textual by design: code deeper
 * than that hop, changed arguments, a repeated or reordered callee and aliasing all pass, and a root
 * named at a runner call proves the call is written, not that it runs.
 */

const SRC = "apps/extension/src"

/** Every handler of the hook, by file, and what it may call; none of these is a row conversion. */
const REVIEWED: Record<string, readonly string[]> = {
	// The journal reaper fails the dead records the profile's keys now open.
	"wallet/runtime.ts": ["reaper.reapUnlocked"],
	// Seals accounts with their key rows, then deletes key rows whose account is gone.
	"wallet/services/account/service.ts": ["this.sealLegacyRows", "this.sweepOrphanImportedKeys"],
	"wallet/services/auth-registry/service.ts": ["this.authwits.sealLegacy", "this.lock.withLock", "this.statuses.sealLegacy"],
	"wallet/services/contact/service.ts": ["this.lock.withLock", "this.storage.sealLegacy"],
	"wallet/services/dapp-session/service.ts": ["this.lock.withLock", "this.registrations.sealLegacy", "this.storage.sealLegacy"],
	"wallet/services/fpc/service.ts": ["this.lock.withLock", "this.storage.sealLegacy"],
	"wallet/services/incoming-transfer/service.ts": ["this.repo.sealLegacy", "this.withServiceLock"],
	// Seals, then applies the list: `convertRows` is the network root's runner call.
	"wallet/services/network/service.ts": ["runSealing", "this.convertRows", "this.sealLegacyRows"],
	// Rechecks the profile's failed sends once their rows open.
	"wallet/services/operation-journal/send-check.ts": ["this.watchFailed", "this.watchFailed().catch"],
	"wallet/services/operation-journal/service.ts": ["this.storage.sealLegacy", "this.transitionLock.withLock"],
	// The shell every `sealOnRowKeysReady` caller goes through.
	"wallet/services/seal-on-unlock.ts": ["runSealing", "seal"],
	"wallet/services/token-balance/service.ts": ["this.invalidatedBalanceIds.has", "this.lock.withLock", "this.repo.sealLegacy"],
	"wallet/services/token/service.ts": ["fn", "ownsLock", "this.seeder.sealLegacyMarker", "this.tokens.sealLegacy", "this.withTokenLock"],
	// Seals, adopts an ownerless row once accounts across profiles show it is this profile's alone
	// (two roots and other profiles, so no single-root conversion), then arms the profile's watches.
	"wallet/services/transaction/service.ts": [
		"live",
		"this.adoptOwnerless",
		"this.arm",
		"this.deletionState.capture",
		"this.deletionState.isCurrent",
		"this.deletionState.isReserved",
		"this.lock.withLock",
		"this.txs.getValues",
		"this.txs.sealLegacy",
	],
	"wallet/services/ui-preference/service.ts": ["runSealing", "store.sealLegacy", "this.lock.withLock"],
}

/** The callee of a call as a dotted path, `this`-rooted where it is. */
function calleeKey(node: ts.Expression): string {
	if (node.kind === ts.SyntaxKind.ThisKeyword) return "this"
	if (ts.isIdentifier(node)) return node.text
	if (ts.isPropertyAccessExpression(node)) return `${calleeKey(node.expression)}.${node.name.text}`
	if (ts.isElementAccessExpression(node)) return `${calleeKey(node.expression)}[]`
	if (ts.isCallExpression(node)) return `${calleeKey(node.expression)}()`
	if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) return calleeKey(node.expression)
	return "(expression)"
}

const isLogging = (key: string) => /(^|\.)log(Debug|Info|Warn|Error)?$/.test(key)

function callees(node: ts.Node): string[] {
	const found = new Set<string>()
	const visit = (child: ts.Node): void => {
		if (ts.isCallExpression(child)) {
			const key = calleeKey(child.expression)
			if (!isLogging(key)) found.add(key)
		}
		child.forEachChild(visit)
	}
	visit(node)
	return [...found].sort()
}

/** The one expression a function body is: an expression body, or a block of one expression or
 *  return statement, with `void` or `await` peeled. */
function soleExpression(body: ts.ConciseBody): ts.Node {
	let expr: ts.Node = body
	if (ts.isBlock(body) && body.statements.length === 1) {
		const only = body.statements[0] as ts.Statement
		if (ts.isExpressionStatement(only)) expr = only.expression
		else if (ts.isReturnStatement(only) && only.expression) expr = only.expression
	}
	return ts.isVoidExpression(expr) || ts.isAwaitExpression(expr) ? expr.expression : expr
}

const thisMember = (expr: ts.Node) =>
	ts.isPropertyAccessExpression(expr) && expr.expression.kind === ts.SyntaxKind.ThisKeyword ? expr.name.text : undefined

/** The method a handler only delegates to: `this.m`, or a function whose body is one `this.m(...)`. */
function delegate(handler: ts.Expression): string | undefined {
	if (ts.isPropertyAccessExpression(handler)) return thisMember(handler)
	if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) return undefined
	const call = soleExpression(handler.body)
	return ts.isCallExpression(call) ? thisMember(call.expression) : undefined
}

/** The body of the class member named `name` in `source`. */
function memberBody(source: ts.SourceFile, name: string): ts.Node | undefined {
	let body: ts.Node | undefined
	const visit = (node: ts.Node): void => {
		if (body) return
		const named =
			(ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) && ts.isIdentifier(node.name) && node.name.text === name
		if (named && ts.isMethodDeclaration(node)) body = node.body
		else if (named && ts.isPropertyDeclaration(node)) body = node.initializer
		else node.forEachChild(visit)
	}
	visit(source)
	return body
}

/** The handler argument of an `onRowKeysReady` subscription, or `undefined` for any other call. */
function handlerOf(call: ts.CallExpression): ts.Expression | undefined {
	const callee = call.expression
	if (ts.isIdentifier(callee) && callee.text === "sealOnRowKeysReady") return call.arguments[3]
	const isAdd =
		ts.isPropertyAccessExpression(callee) &&
		callee.name.text === "add" &&
		ts.isPropertyAccessExpression(callee.expression) &&
		callee.expression.name.text === "onRowKeysReady"
	return isAdd ? call.arguments[0] : undefined
}

/** The callees of every unlock handler in `text`, or `undefined` when it subscribes none. */
function scanFile(file: string, text: string): string[] | undefined {
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
	let steps: string[] | undefined
	const visit = (node: ts.Node): void => {
		const handler = ts.isCallExpression(node) ? handlerOf(node) : undefined
		if (handler) {
			const name = delegate(handler)
			const body = (name && memberBody(source, name)) || handler
			steps = [...new Set([...(steps ?? []), ...callees(body)])].sort()
		}
		node.forEachChild(visit)
	}
	visit(source)
	return steps
}

/** The roots named by a `runUnlockConversions("<root>", ...)` call, and every caller of `names`. */
function scanRunners(text: string, names: ReadonlySet<string>): { roots: string[]; calls: string[] } {
	const source = ts.createSourceFile("f.ts", text, ts.ScriptTarget.Latest, true)
	const found = { roots: [] as string[], calls: [] as string[] }
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			const [root] = node.arguments
			if (node.expression.text === "runUnlockConversions" && root && ts.isStringLiteral(root)) found.roots.push(root.text)
			if (names.has(node.expression.text)) found.calls.push(node.expression.text)
		}
		node.forEachChild(visit)
	}
	visit(source)
	return found
}

const files = sourceFiles({ roots: [SRC], exts: ["ts"], skip: [TEST_FILE] }).map((file) => ({
	path: relative(SRC, file),
	text: readFileSync(join(REPO_ROOT, file), "utf8"),
}))

const TRANSFORMS = new Set(["retireEndpoints", "retireDefaultName"])

describe("unlock-time conversions live in UNLOCK_CONVERSIONS", () => {
	test("every unlock handler calls only what was reviewed", () => {
		const found = Object.fromEntries(files.flatMap(({ path, text }) => (scanFile(path, text) ? [[path, scanFile(path, text)]] : [])))
		expect(
			found,
			"a new step at the unlock hook: a value change of a sealed root's rows is an entry of UNLOCK_CONVERSIONS; anything else is reviewed in REVIEWED",
		).toEqual(REVIEWED)
	})

	test("every root the list names is run, and the transforms are called only through it", () => {
		const scans = files.map(({ path, text }) => ({ path, ...scanRunners(text, TRANSFORMS) }))
		const run = new Set(scans.flatMap((scan) => scan.roots))
		expect([...new Set(UNLOCK_CONVERSIONS.map((entry) => entry.root))].filter((root) => !run.has(root))).toEqual([])
		expect(scans.filter((scan) => scan.calls.length > 0).map((scan) => scan.path)).toEqual(["wallet/services/unlock-conversions.ts"])
	})

	const service = (handler: string, body = "await this.storage.sealLegacy(profileId, lock)") =>
		[
			"class S {",
			"	init() {",
			`		sealOnRowKeysReady(this.profiles, warn, "m", ${handler})`,
			"	}",
			"	private async sealLegacyRows(profileId: string): Promise<void> {",
			`		${body}`,
			"	}",
			"}",
		].join("\n")

	test("the scan follows a delegating handler one hop and counts member and free callees", () => {
		expect(scanFile("f.ts", service("(profileId) => this.sealLegacyRows(profileId)"))).toEqual(["this.storage.sealLegacy"])
		expect(
			scanFile(
				"f.ts",
				service("async (id) => { await this.sealLegacyRows(id); await runSealing(warn, 'm', () => this.convertRows(id)) }"),
			),
		).toEqual(["runSealing", "this.convertRows", "this.sealLegacyRows"])
		expect(
			scanFile(
				"f.ts",
				"class S { start() { this.profile.onRowKeysReady.add(this.onKeys) } private readonly onKeys = (id) => { void this.watch(id) } }",
			),
		).toEqual(["this.watch"])
		expect(scanFile("f.ts", "const a = sealOnRowKeysReady")).toBeUndefined()
	})

	test("a new step in a handler, an inline write in its followed body, and a comment", () => {
		expect(scanFile("f.ts", service("async (id) => { await this.sealLegacyRows(id); await this.renameTokens(id) }"))).toContain(
			"this.renameTokens",
		)
		const inline = service(
			"(id) => this.sealLegacyRows(id)",
			"await this.storage.sealLegacy(id, lock); await this.storage.set(row.id, row)",
		)
		expect(scanFile("f.ts", inline)).toContain("this.storage.set")
		const commented = service(
			"(id) => this.sealLegacyRows(id)",
			"// this.storage.set(row.id, row)\n\t\tawait this.storage.sealLegacy(id, lock)",
		)
		expect(scanFile("f.ts", commented)).toEqual(["this.storage.sealLegacy"])
	})

	test("a root no runner names, and a transform called outside the list", () => {
		expect(scanRunners('await runUnlockConversions("networks", rows, run)', TRANSFORMS).roots).toEqual(["networks"])
		expect(scanRunners("await runUnlockConversions(root, rows, run)", TRANSFORMS).roots).toEqual([])
		expect(scanRunners("const next = retireDefaultName(row, rows)", TRANSFORMS).calls).toEqual(["retireDefaultName"])
	})
})
