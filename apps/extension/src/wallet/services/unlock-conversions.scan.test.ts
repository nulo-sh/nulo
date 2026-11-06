import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"
import { REPO_ROOT, sourceFiles, TEST_FILE } from "../../../scripts/type-roles/source-scan"
import { UNLOCK_CONVERSIONS } from "./unlock-conversions"

/**
 * An unlock-time value change of a sealed root's rows is an entry of `UNLOCK_CONVERSIONS`, never code
 * of its own at the hook. This pins what each `onRowKeysReady` handler calls: the handler and the
 * bodies of the same-file methods it calls (one hop), reduced to the set of their callees with
 * logging dropped. A subscriber in a new file, or a new callee, reds until it is reviewed here.
 * Textual by design: code deeper than that hop, changed arguments, a repeated or reordered callee
 * and aliasing all pass, and a root named at a runner call proves the call is written, not that it
 * runs.
 */

const SRC = "apps/extension/src"

/** Every handler of the hook, by file, and what it may call; none converts a row outside the list. */
const REVIEWED: Record<string, readonly string[]> = {
	"wallet/runtime.ts": ["reaper.reapUnlocked"],
	// Deletes key rows whose account is gone: a sweep, not a value change.
	"wallet/services/account/service.ts": ["this.onRowKeysReady", "this.sealLegacyRows", "this.sweepOrphanImportedKeys"],
	"wallet/services/auth-registry/service.ts": [
		"this.authwits.sealLegacy",
		"this.lock.withLock",
		"this.sealLegacyRows",
		"this.statuses.sealLegacy",
	],
	"wallet/services/contact/service.ts": ["this.lock.withLock", "this.sealLegacyRows", "this.storage.sealLegacy"],
	"wallet/services/dapp-session/service.ts": [
		"this.lock.withLock",
		"this.registrations.sealLegacy",
		"this.sealLegacyRows",
		"this.storage.sealLegacy",
	],
	"wallet/services/fpc/service.ts": ["this.lock.withLock", "this.sealLegacyRows", "this.storage.sealLegacy"],
	"wallet/services/incoming-transfer/service.ts": ["this.repo.sealLegacy", "this.sealLegacyRows", "this.withServiceLock"],
	// `convertRows` runs the list; its `this.storage.set` is the runner's commit.
	"wallet/services/network/service.ts": [
		"(expression).filter",
		"findPrimaryEndpoint",
		"network.endpoints.forEach",
		"runSealing",
		"runUnlockConversions",
		"this.convertRows",
		"this.emit",
		"this.lock.withLock",
		"this.nodes.delete",
		"this.sealLegacyRows",
		"this.staleNetworks.getJournal",
		"this.storage.getValues",
		"this.storage.sealLegacy",
		"this.storage.set",
		"this.transientNodes.delete",
	],
	"wallet/services/operation-journal/send-check.ts": ["this.watchFailed", "this.watchFailed().catch"],
	"wallet/services/operation-journal/service.ts": ["this.sealLegacyRows", "this.storage.sealLegacy", "this.transitionLock.withLock"],
	"wallet/services/seal-on-unlock.ts": ["runSealing", "seal"],
	"wallet/services/token-balance/service.ts": [
		"this.invalidatedBalanceIds.has",
		"this.lock.withLock",
		"this.repo.sealLegacy",
		"this.sealLegacyRows",
	],
	"wallet/services/token/service.ts": [
		"fn",
		"ownsLock",
		"this.sealLegacyRows",
		"this.seeder.sealLegacyMarker",
		"this.tokens.sealLegacy",
		"this.withTokenLock",
	],
	// Adopts an ownerless row once accounts across profiles show it is this profile's alone (another
	// root and other profiles, so no single-root conversion), then arms the profile's watches.
	"wallet/services/transaction/service.ts": [
		"live",
		"this.adoptOwnerless",
		"this.arm",
		"this.deletionState.capture",
		"this.deletionState.isCurrent",
		"this.deletionState.isReserved",
		"this.lock.withLock",
		"this.onRowKeysReady",
		"this.txs.getValues",
		"this.txs.sealLegacy",
	],
	"wallet/services/ui-preference/service.ts": ["runSealing", "store.sealLegacy", "this.lock.withLock", "this.sealLegacyRows"],
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

const thisMember = (expr: ts.Node) =>
	ts.isPropertyAccessExpression(expr) && expr.expression.kind === ts.SyntaxKind.ThisKeyword ? expr.name.text : undefined

/** The same-file methods one hop from a handler: itself when it is `this.m`, else each `this.m(...)` it calls. */
function hops(handler: ts.Expression): string[] {
	const own = thisMember(handler)
	if (own) return [own]
	const names: string[] = []
	const visit = (node: ts.Node): void => {
		const name = ts.isCallExpression(node) ? thisMember(node.expression) : undefined
		if (name) names.push(name)
		node.forEachChild(visit)
	}
	visit(handler)
	return names
}

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
			const bodies = hops(handler).flatMap((name) => memberBody(source, name) ?? [])
			steps = [...new Set([...(steps ?? []), ...[handler, ...bodies].flatMap(callees)])].sort()
		}
		node.forEachChild(visit)
	}
	visit(source)
	return steps
}

/** The roots named by a `runUnlockConversions("<root>", ...)` call, and each of `names` imported. */
function scanModule(text: string, names: ReadonlySet<string>): { roots: string[]; imports: string[] } {
	const source = ts.createSourceFile("f.ts", text, ts.ScriptTarget.Latest, true)
	const found = { roots: [] as string[], imports: [] as string[] }
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "runUnlockConversions") {
			const [root] = node.arguments
			if (root && ts.isStringLiteral(root)) found.roots.push(root.text)
		}
		if (ts.isImportSpecifier(node) && names.has((node.propertyName ?? node.name).text)) found.imports.push(node.name.text)
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
		const found = Object.fromEntries(
			files.flatMap(({ path, text }) => {
				const steps = scanFile(path, text)
				return steps ? [[path, steps]] : []
			}),
		)
		expect(
			found,
			"a new step at the unlock hook: a value change of a sealed root's rows is an entry of UNLOCK_CONVERSIONS; anything else is reviewed in REVIEWED",
		).toEqual(REVIEWED)
	})

	test("every root the list names is run, and the transforms are imported only by it", () => {
		const scans = files.map(({ path, text }) => ({ path, ...scanModule(text, TRANSFORMS) }))
		const run = new Set(scans.flatMap((scan) => scan.roots))
		expect([...new Set(UNLOCK_CONVERSIONS.map((entry) => entry.root))].filter((root) => !run.has(root))).toEqual([])
		expect(scans.filter((scan) => scan.imports.length > 0).map((scan) => scan.path)).toEqual(["wallet/services/unlock-conversions.ts"])
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

	test("the scan follows the methods a handler calls one hop and counts member and free callees", () => {
		expect(scanFile("f.ts", service("(profileId) => this.sealLegacyRows(profileId)"))).toEqual([
			"this.sealLegacyRows",
			"this.storage.sealLegacy",
		])
		expect(
			scanFile(
				"f.ts",
				service("async (id) => { await this.sealLegacyRows(id); await runSealing(warn, 'm', () => this.convertRows(id)) }"),
			),
		).toEqual(["runSealing", "this.convertRows", "this.sealLegacyRows", "this.storage.sealLegacy"])
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
		expect(scanFile("f.ts", commented)).toEqual(["this.sealLegacyRows", "this.storage.sealLegacy"])
	})

	test("a root no runner names, and a transform imported outside the list", () => {
		expect(scanModule('await runUnlockConversions("networks", rows, run)', TRANSFORMS).roots).toEqual(["networks"])
		expect(scanModule("await runUnlockConversions(root, rows, run)", TRANSFORMS).roots).toEqual([])
		expect(scanModule('import { retireDefaultName as rename, seedForKind } from "./seeds"', TRANSFORMS).imports).toEqual(["rename"])
	})
})
