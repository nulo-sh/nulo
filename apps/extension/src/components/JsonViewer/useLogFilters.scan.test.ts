import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, test } from "vitest"
import { LOG_SOURCES } from "./useLogFilters"

/**
 * Static pins on the logs window's source filter. `isLogInclude` refuses a source with no row,
 * so a line logged under an unlisted source vanishes at the window's first rebuild.
 *
 * The first pin starts from the registration sites: every service the worker or the offscreen
 * document registers, and its popup client, has a row. The second resolves the source of every
 * logger call: each is a row, and each mapped helper logs under the service that owns it. Both
 * fail closed: a shape the resolver does not understand is a failure, never a skip.
 *
 * KNOWN FALSE-NEGATIVES, textual like `log-payload-ban.test.ts`: a logger reached under another
 * name (`logger.log.bind`, `logger["log"]`, a variable not named `logger`), and files outside
 * the scan roots. The second pin proves a source is a row, not that it is the right owner, past
 * the helpers it names.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..")
const REGISTRATION_FILES = ["apps/extension/src/wallet/runtime.ts", "packages/aztec-runtime/src/offscreen/entry.ts"]
const ADD_OPENER = "services.add("

const SCAN_ROOTS = [
	"apps/extension/src",
	...readdirSync(join(REPO_ROOT, "packages"))
		.map((name) => `packages/${name}/src`)
		.filter((rel) => {
			try {
				return statSync(join(REPO_ROOT, rel)).isDirectory()
			} catch {
				return false
			}
		}),
]

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) return walk(path)
		return /\.(ts|vue)$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name) ? [path] : []
	})
}

const SOURCES = new Map(
	SCAN_ROOTS.flatMap((root) => walk(join(REPO_ROOT, root))).map((path) => [relative(REPO_ROOT, path), readFileSync(path, "utf8")]),
)

const QUOTES = "\"'`"
const COMMENTS = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g

/** The index of the last character of the string or comment that starts at `at`, or `at` itself. */
function skipToken(source: string, at: number): number {
	const c = source[at] as string
	if (c === "/" && source[at + 1] === "/") return source.indexOf("\n", at)
	if (c === "/" && source[at + 1] === "*") return source.indexOf("*/", at) + 1
	if (!QUOTES.includes(c)) return at
	for (let i = at + 1; i < source.length; i++) {
		if (source[i] === "\\") i++
		else if (source[i] === c) return i
	}
	throw new Error(`unterminated string at offset ${at}`)
}

/** The top-level arguments of the call whose `(` sits just before `open`, comments dropped. */
function callArgs(source: string, open: number): string[] {
	const args: string[] = []
	let depth = 0
	let start = open
	for (let i = open; i < source.length; i++) {
		const skipped = skipToken(source, i)
		if (skipped !== i) i = skipped
		else if ("([{".includes(source[i] as string)) depth++
		else if (source[i] === "," && depth === 0) {
			args.push(source.slice(start, i))
			start = i + 1
		} else if (")]}".includes(source[i] as string) && depth-- === 0) {
			return [...args, source.slice(start, i)].map((arg) => arg.replace(COMMENTS, "").trim()).filter(Boolean)
		}
	}
	throw new Error(`unbalanced call at offset ${open}`)
}

/** The class a `services.add(<arg>)` registers: `new X(…)`, or `<id>` bound by `const <id> = new X(` in the same file. */
function registeredClass(source: string, arg: string): string {
	const direct = /^new\s+(\w+)\s*\(/.exec(arg)
	if (direct) return direct[1] as string
	const bound = /^\w+$/.test(arg) && new RegExp(`\\bconst\\s+${arg}\\s*=\\s*new\\s+(\\w+)\\s*\\(`).exec(source)
	if (bound) return bound[1] as string
	throw new Error(`unsupported services.add argument: ${arg.split("\n")[0]}`)
}

/** Every `services.add` call in one file: the classes it resolved and the arguments it refused. */
function registrations(source: string) {
	const classes: string[] = []
	const refused: string[] = []
	for (let at = source.indexOf(ADD_OPENER); at !== -1; at = source.indexOf(ADD_OPENER, at + 1)) {
		const arg = callArgs(source, at + ADD_OPENER.length)[0] ?? ""
		try {
			classes.push(registeredClass(source, arg))
		} catch (error) {
			refused.push((error as Error).message)
		}
	}
	return { classes, refused }
}

function single<T>(found: T[], what: string): T {
	if (found.length !== 1) throw new Error(`expected exactly one ${what}, found ${found.length}`)
	return found[0] as T
}

function filesMatching(pattern: RegExp): [string, string][] {
	return [...SOURCES].filter(([, text]) => pattern.test(text))
}

const STATIC_NAME = /\bstatic\s+(?:readonly\s+)?name\s*=\s*(\w+)/g

/** The constant a file's class names itself with, checked against the name it logs under. */
function fileNameConstant(file: string, text: string): string {
	const constant = single([...text.matchAll(STATIC_NAME)], `static name in ${file}`)[1] as string
	const passesToBase = new RegExp(`\\bsuper\\(\\s*${constant}\\b`).test(text)
	const ownsInstanceName = new RegExp(`^\\s*(?:public\\s+)?readonly\\s+name\\s*=\\s*${constant}\\b`, "m").test(text)
	if (!passesToBase && !ownsInstanceName) throw new Error(`${file} declares ${constant} but does not log under it`)
	return constant
}

function nameConstant(cls: string): { constant: string; file: string } {
	const [file, text] = single(filesMatching(new RegExp(`\\bexport class ${cls}\\b`)), `\`export class ${cls}\``)
	return { constant: fileNameConstant(file, text), file }
}

function constantValue(constant: string): string {
	const declarations = [...SOURCES.values()].flatMap((text) => [
		...text.matchAll(new RegExp(`\\bexport const ${constant}\\s*=\\s*(.+)`, "g")),
	])
	const value = single(declarations, `\`export const ${constant}\``)[1] as string
	const literal = /^"([^"]+)"\s*$/.exec(value.trim())
	if (!literal) throw new Error(`${constant} is not a string literal: ${value}`)
	return literal[1] as string
}

/** The sources a registered class writes: its own name, and `<name>-client` when a client extends the base under it. */
function requiredSources(cls: string): string[] {
	const { constant, file } = nameConstant(cls)
	const name = constantValue(constant)
	const client = filesMatching(new RegExp(`\\bsuper\\(\\s*${constant}\\b`)).some(([path]) => path !== file)
	return client ? [name, `${name}-client`] : [name]
}

describe("log source filter: every registered service is listed", () => {
	const perFile = REGISTRATION_FILES.map((path) => {
		const text = SOURCES.get(path)
		if (!text) throw new Error(`registration file missing: ${path}`)
		return { path, ...registrations(text) }
	})

	test("every services.add call resolves to a class, the multiline and bound forms included", () => {
		for (const { path, refused } of perFile) expect(refused, path).toEqual([])
		const [worker, offscreen] = perFile.map((f) => f.classes)
		expect(worker).toEqual(expect.arrayContaining(["AccountService", "IncomingTransferService", "ProfileDeletionCoordinator"]))
		expect(offscreen).toEqual(["PxeService"])
	})

	test("an argument the resolver does not understand is refused, not skipped", () => {
		expect(registrations("services.add(makeService(logger))")).toEqual({
			classes: [],
			refused: ["unsupported services.add argument: makeService(logger)"],
		})
	})

	test("every registered service and its client has a source row", () => {
		const required = perFile.flatMap((f) => f.classes).flatMap(requiredSources)
		expect(required.filter((name) => !LOG_SOURCES.includes(name))).toEqual([])
	})
})

/** A logger call, on any receiver named `logger`: a class's own `log` helper or the logger client's `shared.log` is not one. */
const LOGGER_CALL = /\blogger\??\.log\(/g
const SERVICE_LOG_CALL = /\bthis\.log(?:Debug|Info|Warn|Error)\(/
const UPPER_IDENTIFIER = /^[A-Z][A-Z0-9_]*$/

/** Base classes whose name the registration pin above proves is a row: a service's own name, a client's `<name>-client`. */
const PROVEN = [
	{ file: "packages/extension-messaging/src/core/base-service.ts", expr: "this.name" },
	{ file: "packages/extension-messaging/src/core/base-client.ts", expr: "this.clientName" },
	{ file: "packages/extension-messaging/src/offscreen/client.ts", expr: "this.clientName" },
]

const passed = (logger: string | undefined) => logger !== undefined && logger !== "undefined"
/** The source argument at `index` of a site that passes a logger at `loggerIndex`; "" when the logger comes without one. */
const positional = (index: number, loggerIndex: number) => (args: string[]) => (passed(args[loggerIndex]) ? (args[index] ?? "") : undefined)

/**
 * A primitive that logs under a source its caller supplies. The source is resolved at every site
 * that builds it, in the site's own file; a site that passes no logger never logs and is skipped.
 */
const INJECTED: { file: string; expr: string; site: RegExp; source: (args: string[]) => string | undefined }[] = [
	{ file: "packages/wallet-core/src/utils/lock.ts", expr: "this.name!", site: /\bnew Lock\(/g, source: positional(0, 1) },
	{
		file: "packages/wallet-core/src/utils/keyed-lock.ts",
		expr: "this.#name",
		site: /\bnew KeyedLock\(/g,
		source: ([opts = ""]) => (/\blogger\b/.test(opts) ? (/\bname\s*:\s*([^,}\s]+)/.exec(opts)?.[1] ?? "") : undefined),
	},
	{ file: "packages/wallet-core/src/utils/rw-guard.ts", expr: "this.name", site: /\bnew ReadWriteGuard\(/g, source: positional(0, 1) },
	{
		file: "apps/extension/src/wallet/services/window-manager/window-manager.ts",
		expr: "source",
		site: /(?<!function\s)\bcreatePlaced\(/g,
		source: positional(4, 3),
	},
	{
		file: "packages/extension-messaging/src/offscreen/telemetry.ts",
		expr: "this.logSource",
		site: /\bnew LoggingTelemetrySink\(/g,
		source: positional(1, 0),
	},
	{
		file: "apps/extension/src/core/adapters/clock-ticker-adapter.ts",
		expr: "this.logSource",
		site: /\bnew ClockTickerAdapter\(/g,
		source: positional(2, 1),
	},
	{
		file: "packages/aztec-runtime/src/account/nulo-account.ts",
		expr: "this.logSource",
		site: /\bNuloAccount\.(?:new|fromSigningKey)\(/g,
		source: positional(2, 1),
	},
]

interface Resolution {
	sources: string[]
	refused: string[]
}

/** A same-file `const` bound to a literal or to an exported constant, else an exported constant itself. */
function identifierValue(text: string, name: string): string {
	const rhs = new RegExp(`\\bconst ${name}\\s*=\\s*([^\\n;]+)`).exec(text)?.[1]?.trim()
	if (rhs === undefined) return constantValue(name)
	const literal = /^"([^"]+)"$/.exec(rhs)
	if (literal) return literal[1] as string
	if (UPPER_IDENTIFIER.test(rhs)) return constantValue(rhs)
	throw new Error(`${name} is bound to neither a literal nor a constant: ${rhs}`)
}

function resolveSource(file: string, text: string, expr: string): string | undefined {
	if (PROVEN.some((p) => p.file === file && p.expr === expr)) return undefined
	const literal = /^"([^"]+)"$/.exec(expr)
	if (literal) return literal[1] as string
	if (expr === "this.name") return constantValue(fileNameConstant(file, text))
	if (UPPER_IDENTIFIER.test(expr)) return identifierValue(text, expr)
	throw new Error(expr ? `unsupported source ${expr}` : "a logger with no source")
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length

/** Every source expression in one file, with its line: logger calls, a service's own log calls, and the sources it supplies to a primitive. */
function sourceExprs(file: string, text: string): { expr: string; line: number }[] {
	const at = (m: RegExpMatchArray) => ({ args: callArgs(text, (m.index ?? 0) + m[0].length), line: lineOf(text, m.index ?? 0) })
	const calls = [...text.matchAll(LOGGER_CALL)].map(at).map(({ args, line }) => ({ expr: args[0] ?? "", line }))
	const own = STATIC_NAME.test(text) && SERVICE_LOG_CALL.test(text) ? [{ expr: "this.name", line: 0 }] : []
	STATIC_NAME.lastIndex = 0
	const supplied = INJECTED.flatMap((inj) =>
		[...text.matchAll(inj.site)].map(at).flatMap(({ args, line }) => {
			const expr = inj.source(args)
			return expr === undefined ? [] : [{ expr, line }]
		}),
	)
	// A primitive's own parameter is resolved at its sites, so its own logger call is not.
	return [...calls, ...own, ...supplied].filter(({ expr }) => !INJECTED.some((inj) => inj.file === file && inj.expr === expr))
}

function fileSources(file: string, text: string): Resolution {
	const result: Resolution = { sources: [], refused: [] }
	for (const { expr, line } of sourceExprs(file, text)) {
		try {
			const source = resolveSource(file, text, expr)
			if (source !== undefined) result.sources.push(source)
		} catch (error) {
			result.refused.push(`${file}:${line}: ${(error as Error).message}`)
		}
	}
	return result
}

const owner = (path: string) => `apps/extension/src/wallet/services/${path}`

/** Each helper that logged under a name of its own, filed under the service that owns it. */
const OWNED: [string, string][] = [
	[owner("price/service.ts"), "price"],
	[owner("operation-journal/send-check.ts"), "operation-journal"],
	[owner("operation-journal/gc.ts"), "operation-journal"],
	[owner("operation-journal/reaper.ts"), "operation-journal"],
	[owner("operation-journal/service.ts"), "operation-journal"],
	[owner("execution/contract-resolver.ts"), "execution"],
	[owner("execution/tx-request-builder.ts"), "execution"],
	[owner("execution/helpers/batched-view-simulation.ts"), "execution"],
	[owner("profile/session-manager.ts"), "profile"],
	[owner("token/seeder.ts"), "token"],
	[owner("token-balance/balance-job-queue.ts"), "token-balance"],
	[owner("token-balance/balance-projector.ts"), "token-balance"],
	[owner("token-balance/service.ts"), "token-balance"],
	[owner("wallet-sdk/background.ts"), "wallet-sdk"],
	[owner("wallet-sdk/session-established.ts"), "wallet-sdk"],
	[owner("wallet-sdk/session-revocation.ts"), "wallet-sdk"],
	[owner("wallet-sdk/profile-switch-teardown.ts"), "wallet-sdk"],
	[owner("wallet-sdk/queued-journal.ts"), "wallet-sdk"],
	[owner("window-manager/window-manager.ts"), "wallet"],
	[owner("account/service.ts"), "account"],
	["packages/aztec-runtime/src/pxe/service.ts", "pxe"],
	["packages/aztec-runtime/src/pxe/artifact-registry.ts", "pxe"],
]

describe("log source filter: every logger call's source is listed", () => {
	test("every source resolves to a row", () => {
		const all = [...SOURCES].map(([file, text]) => fileSources(file, text))
		expect(all.flatMap((r) => r.refused)).toEqual([])
		expect([...new Set(all.flatMap((r) => r.sources))].filter((source) => !LOG_SOURCES.includes(source))).toEqual([])
	})

	test.each(OWNED)("%s logs under %s", (file, service) => {
		const { sources, refused } = fileSources(file, SOURCES.get(file) ?? "")
		expect({ sources: [...new Set(sources)], refused }).toEqual({ sources: [service], refused: [] })
	})

	test("a source the resolver cannot read is refused, not skipped", () => {
		const read = (text: string) => fileSources("inline.ts", text)
		expect(read('logger.log("fpc", level, "m"); new Lock("network", this.logger); new Lock()')).toEqual({
			sources: ["fpc", "network"],
			refused: [],
		})
		expect(read(`logger.log(\`fpc-\${id}\`, level, 'm')`).refused).toHaveLength(1)
		expect(read("this.logger.log(source, level, 'm')").refused).toEqual(["inline.ts:1: unsupported source source"])
		expect(read("new ClockTickerAdapter(clock, logger)").refused).toEqual(["inline.ts:1: a logger with no source"])
	})
})
