import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, test } from "vitest"
import { LOG_SOURCES } from "./useLogFilters"

/**
 * Static pin: every service the worker or the offscreen document registers has a row in the
 * logs window's source filter, and so does its popup client. `isLogInclude` refuses a source
 * with no row, so an unlisted service's lines vanish at the window's first rebuild.
 *
 * It starts from the registration sites, not from declarations, and fails closed: a
 * `services.add` argument it cannot resolve to a class, a class it cannot resolve to one name
 * constant, or a class that logs under another name is a failure, never a skip.
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
		return /\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name) ? [path] : []
	})
}

const SOURCES = new Map(
	SCAN_ROOTS.flatMap((root) => walk(join(REPO_ROOT, root))).map((path) => [relative(REPO_ROOT, path), readFileSync(path, "utf8")]),
)

/** The text between `open` (an index just past a `(`) and its balanced `)`. */
function callArgument(source: string, open: number): string {
	let depth = 1
	for (let i = open; i < source.length; i++) {
		if (source[i] === "(") depth++
		if (source[i] === ")") depth--
		if (depth === 0) return source.slice(open, i).trim()
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
		const arg = callArgument(source, at + ADD_OPENER.length)
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

/** The constant a class names itself with, checked against the name it logs under. */
function nameConstant(cls: string): { constant: string; file: string } {
	const [file, text] = single(filesMatching(new RegExp(`\\bexport class ${cls}\\b`)), `\`export class ${cls}\``)
	const constant = single([...text.matchAll(/\bstatic\s+(?:readonly\s+)?name\s*=\s*(\w+)/g)], `static name in ${file}`)[1] as string
	const passesToBase = new RegExp(`\\bsuper\\(\\s*${constant}\\b`).test(text)
	const ownsInstanceName = new RegExp(`^\\s*(?:public\\s+)?readonly\\s+name\\s*=\\s*${constant}\\b`, "m").test(text)
	if (!passesToBase && !ownsInstanceName) throw new Error(`${cls} declares ${constant} but does not log under it`)
	return { constant, file }
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
