import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { callsTo } from "../../../scripts/type-roles/source-code"
import { PACKAGE_SRC_ROOTS, REPO_ROOT, sourceFiles } from "../../../scripts/type-roles/source-scan"
import { LOG_SOURCES } from "./useLogFilters"

/**
 * Static pins on the logs window's source filter. `isLogInclude` refuses a source with no row,
 * so a line logged under an unlisted source vanishes at the window's first rebuild.
 *
 * The first pin starts from the registration sites: every service the worker or the offscreen
 * document registers, and its popup client, has a row. The second resolves the source of every
 * logger call: each is a row, and each mapped helper logs under the service that owns it. The
 * third is the converse: every row is a source the first two find, so a row nothing logs under
 * cannot come back. All fail closed: a shape the resolver does not understand is a failure,
 * never a skip.
 *
 * KNOWN FALSE-NEGATIVES, textual like `log-payload-ban.test.ts`: a logger reached under another
 * name (`logger.log.bind`, `logger["log"]`, a variable not named `logger`), and files outside
 * the scan roots. The second pin proves a source is a row, not that it is the right owner, past
 * the helpers it names.
 */

const REGISTRATION_FILES = ["apps/extension/src/wallet/runtime.ts", "packages/aztec-runtime/src/offscreen/entry.ts"]
const ADD_CALLEE = /services\.add$/

const SOURCES = new Map(
	sourceFiles({ roots: ["apps/extension/src", ...PACKAGE_SRC_ROOTS], exts: ["ts", "vue"], skip: [/\.(test|spec)\.ts$/] }).map((file) => [
		file,
		readFileSync(join(REPO_ROOT, file), "utf8"),
	]),
)

/** The class a `services.add(<arg>)` registers: `new X(…)`, or `<id>` bound by `const <id> = new X(` in the same file. */
function registeredClass(source: string, arg: string): string {
	const direct = /^new\s+(\w+)\s*\(/.exec(arg)
	if (direct) return direct[1] as string
	const bound = /^\w+$/.test(arg) && new RegExp(`\\bconst\\s+${arg}\\s*=\\s*new\\s+(\\w+)\\s*\\(`).exec(source)
	if (bound) return bound[1] as string
	throw new Error(`unsupported services.add argument: ${arg.split("\n")[0]}`)
}

/** Every `services.add` call in one file: the classes it resolved and the arguments it refused. */
function registrations(file: string, source: string) {
	const classes: string[] = []
	const refused: string[] = []
	for (const call of callsTo(file, source, ADD_CALLEE)) {
		const arg = call.args[0]?.getText() ?? ""
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

/** `SOURCES` is read once, so a resolved constant keeps its value. */
const constantValues = new Map<string, string>()

function constantValue(constant: string): string {
	const known = constantValues.get(constant)
	if (known !== undefined) return known
	const declarations = [...SOURCES.values()].flatMap((text) => [
		...text.matchAll(new RegExp(`\\bexport const ${constant}\\s*=\\s*(.+)`, "g")),
	])
	const value = single(declarations, `\`export const ${constant}\``)[1] as string
	const literal = /^"([^"]+)"\s*$/.exec(value.trim())
	if (!literal) throw new Error(`${constant} is not a string literal: ${value}`)
	constantValues.set(constant, literal[1] as string)
	return literal[1] as string
}

/** The sources a registered class writes: its own name, and `<name>-client` when a client extends the base under it. */
function requiredSources(cls: string): string[] {
	const { constant, file } = nameConstant(cls)
	const name = constantValue(constant)
	const client = filesMatching(new RegExp(`\\bsuper\\(\\s*${constant}\\b`)).some(([path]) => path !== file)
	return client ? [name, `${name}-client`] : [name]
}

/** Computed on first use inside a test, so a resolver error fails that test by name rather than the collection. */
function once<T>(compute: () => T): () => T {
	let value: { result: T } | undefined
	return () => {
		value ??= { result: compute() }
		return value.result
	}
}

const registeredPerFile = once(() =>
	REGISTRATION_FILES.map((path) => {
		const text = SOURCES.get(path)
		if (!text) throw new Error(`registration file missing: ${path}`)
		return { path, ...registrations(path, text) }
	}),
)
const registeredSources = once(() =>
	registeredPerFile()
		.flatMap((f) => f.classes)
		.flatMap(requiredSources),
)

describe("log source filter: every registered service is listed", () => {
	test("every services.add call resolves to a class, the multiline and bound forms included", () => {
		const perFile = registeredPerFile()
		for (const { path, refused } of perFile) expect(refused, path).toEqual([])
		const [worker, offscreen] = perFile.map((f) => f.classes)
		expect(worker).toEqual(expect.arrayContaining(["AccountService", "IncomingTransferService", "ProfileDeletionCoordinator"]))
		expect(offscreen).toEqual(["PxeService"])
	})

	test("an argument the resolver does not understand is refused, not skipped", () => {
		expect(registrations("inline.ts", "services.add(makeService(logger))")).toEqual({
			classes: [],
			refused: ["unsupported services.add argument: makeService(logger)"],
		})
	})

	test("a services.add on a member is read like a bare one", () => {
		expect(registrations("inline.ts", "this.services.add(makeService(logger))").refused).toEqual([
			"unsupported services.add argument: makeService(logger)",
		])
	})

	test("every registered service and its client has a source row", () => {
		expect(registeredSources().filter((name) => !LOG_SOURCES.includes(name))).toEqual([])
	})
})

/** A logger call, on a receiver named `logger` or `_logger`: a class's own `log` helper or the logger client's `shared.log` is not one. */
const LOGGER_CALL = /\b_?logger\??\.log$/
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
	{ file: "packages/wallet-core/src/utils/lock.ts", expr: "this.name!", site: /^Lock$/, source: positional(0, 1) },
	{
		file: "packages/wallet-core/src/utils/keyed-lock.ts",
		expr: "this.#name",
		site: /^KeyedLock$/,
		source: ([opts = ""]) => (/\blogger\b/.test(opts) ? (/\bname\s*:\s*([^,}\s]+)/.exec(opts)?.[1] ?? "") : undefined),
	},
	{ file: "packages/wallet-core/src/utils/rw-guard.ts", expr: "this.name", site: /^ReadWriteGuard$/, source: positional(0, 1) },
	{
		file: "apps/extension/src/wallet/services/window-manager/window-manager.ts",
		expr: "source",
		site: /\bcreatePlaced$/,
		source: positional(4, 3),
	},
	{
		file: "packages/extension-messaging/src/offscreen/telemetry.ts",
		expr: "this.logSource",
		site: /^LoggingTelemetrySink$/,
		source: positional(1, 0),
	},
	{
		file: "apps/extension/src/core/adapters/clock-ticker-adapter.ts",
		expr: "this.logSource",
		site: /^ClockTickerAdapter$/,
		source: positional(2, 1),
	},
	{
		file: "packages/aztec-runtime/src/account/nulo-account.ts",
		expr: "this.logSource",
		site: /\bNuloAccount\.(?:new|fromSigningKey)$/,
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

/** Every callee `sourceExprs` reads, so each file is parsed once. */
const READ_CALLEES = new RegExp([LOGGER_CALL, ...INJECTED.map((inj) => inj.site)].map((re) => `(?:${re.source})`).join("|"))

/**
 * Every callee `READ_CALLEES` matches spells one of these names. A script's callee is matched as written, so an escape
 * cannot spell one. A template's code is decoded, and only `&#` can hide a letter: `&fjlig;`, the one named reference
 * that decodes to letters, spells none of them.
 */
const CALLEE_NAMES = ["logger", "Lock", "ReadWriteGuard", "createPlaced", "LoggingTelemetrySink", "ClockTickerAdapter", "NuloAccount", "&#"]

/** Every source expression in one file, with its line: logger calls, a service's own log calls, and the sources it supplies to a primitive. */
function sourceExprs(file: string, text: string): { expr: string; line: number }[] {
	const found = CALLEE_NAMES.some((name) => text.includes(name)) ? callsTo(file, text, READ_CALLEES) : []
	const calls = found
		.filter((call) => LOGGER_CALL.test(call.callee))
		.map((call) => ({ expr: call.args[0]?.getText() ?? "", line: call.line }))
	const own = STATIC_NAME.test(text) && SERVICE_LOG_CALL.test(text) ? [{ expr: "this.name", line: 0 }] : []
	STATIC_NAME.lastIndex = 0
	const supplied = INJECTED.flatMap((inj) =>
		found
			.filter((call) => inj.site.test(call.callee))
			.flatMap((call) => {
				const expr = inj.source(call.args.map((arg) => arg.getText()))
				return expr === undefined ? [] : [{ expr, line: call.line }]
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

/** A row in the filter does not prove ownership: each file here logs under its owner alone. */
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
	[owner("wallet-sdk/discovery-flow.ts"), "wallet-sdk"],
	[owner("wallet-sdk/session-established.ts"), "wallet-sdk"],
	[owner("wallet-sdk/session-revocation.ts"), "wallet-sdk"],
	[owner("wallet-sdk/profile-switch-teardown.ts"), "wallet-sdk"],
	[owner("wallet-sdk/queued-journal.ts"), "wallet-sdk"],
	[owner("window-manager/window-manager.ts"), "wallet"],
	[owner("account/service.ts"), "account"],
	["packages/aztec-runtime/src/pxe/service.ts", "pxe"],
	["packages/aztec-runtime/src/pxe/artifact-registry.ts", "pxe"],
]

const loggedPerFile = once(() => [...SOURCES].map(([file, text]) => fileSources(file, text)))

describe("log source filter: every logger call's source is listed", () => {
	test("every source resolves to a row", () => {
		const all = loggedPerFile()
		expect(all.flatMap((r) => r.refused)).toEqual([])
		expect([...new Set(all.flatMap((r) => r.sources))].filter((source) => !LOG_SOURCES.includes(source))).toEqual([])
	})

	test.each(OWNED)("%s logs under %s", (file, service) => {
		const { sources, refused } = fileSources(file, SOURCES.get(file) ?? "")
		expect({ sources: [...new Set(sources)], refused }).toEqual({ sources: [service], refused: [] })
	})

	test("a source the resolver cannot read is refused, not skipped", () => {
		const read = (text: string) => fileSources("inline.ts", text)
		expect(
			read('logger.log("fpc", level, "m"); this._logger.log("pxe", level, "m"); new Lock("network", this.logger); new Lock()'),
		).toEqual({
			sources: ["fpc", "pxe", "network"],
			refused: [],
		})
		expect(read('logger.log(`fpc`, level, "m"); logger.log("fpc-" + id, level, "m")').refused).toEqual([
			"inline.ts:1: unsupported source `fpc`",
			'inline.ts:1: unsupported source "fpc-" + id',
		])
		expect(read("this.logger.log(source, level, 'm')").refused).toEqual(["inline.ts:1: unsupported source source"])
		expect(read("new ClockTickerAdapter(clock, logger)").refused).toEqual(["inline.ts:1: a logger with no source"])
	})
})

describe("log source filter: a primitive reached through a member", () => {
	test("is read like a bare call", () => {
		const text = 'helpers.createPlaced(a, b, c, logger, "fpc"); Accounts.NuloAccount.new(a, logger, "pxe")'
		expect(fileSources("inline.ts", text)).toEqual({ sources: ["fpc", "pxe"], refused: [] })
	})
})

describe("log source filter: the files the callee check admits", () => {
	test.each([
		['new Lock("network", log)', "network"],
		['new ReadWriteGuard("fpc", log)', "fpc"],
		['h.createPlaced(a, b, c, log, "fpc")', "fpc"],
		['new LoggingTelemetrySink(log, "fpc")', "fpc"],
		['new ClockTickerAdapter(c, log, "fpc")', "fpc"],
		['NuloAccount.new(a, log, "pxe")', "pxe"],
	])("%s is read", (text, source) => {
		expect(fileSources("inline.ts", text)).toEqual({ sources: [source], refused: [] })
	})

	test("a service that logs only through its helpers is read", () => {
		const text =
			'class S extends BaseService { static name = CONFIG_SERVICE_NAME; constructor() { super(CONFIG_SERVICE_NAME) } run() { this.logWarn("m") } }'
		expect(fileSources("inline.ts", text)).toEqual({ sources: ["config"], refused: [] })
	})

	test("every logger call and primitive site spells a name the file check admits", () => {
		const sites = [LOGGER_CALL, ...INJECTED.map((inj) => inj.site)]
		expect(sites.filter((site) => !CALLEE_NAMES.some((name) => site.source.includes(name))).map(String)).toEqual([])
	})

	test("a template call that hides a letter behind a character reference is read", () => {
		const text = '<template><span :title="&#108;ogger.log(&quot;fpc&quot;, l, &quot;m&quot;)" /></template>'
		expect(fileSources("x.vue", text)).toEqual({ sources: ["fpc"], refused: [] })
	})
})

describe("log source filter: every row is a live source", () => {
	test("every row is a source a registered service, its client or a logger call writes", () => {
		const live = new Set([...registeredSources(), ...loggedPerFile().flatMap((r) => r.sources)])
		expect(LOG_SOURCES.filter((row) => !live.has(row))).toEqual([])
	})
})
