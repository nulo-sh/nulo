/**
 * The agent chaos session's contract on disk, shared by the launcher (`scripts/e2e/chaos-session.ts`)
 * and the session it starts (`chaos-session.test.ts`): the directory layout, the command grammar,
 * the queue and the one path a command may name. Pure Node: no browser, no Vitest.
 *
 * A command is published once, whole, under the next free number, and served in number order; its
 * result is published the same way. Every file the session writes has a name it chose, in a
 * directory it made and holds open; the only path a command names is the file `pick-file` reads,
 * which must open as a regular file inside the session directory. Linux only: a held directory is
 * reached through `/proc/self/fd`.
 */
import {
	constants,
	closeSync,
	fstatSync,
	linkSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	realpathSync,
	renameSync,
	unlinkSync,
	writeFileSync,
	writeSync,
} from "node:fs"
import { randomBytes } from "node:crypto"
import { homedir } from "node:os"
import { isAbsolute, join, normalize, relative, sep } from "node:path"

/** Where sessions live: on real disk, outside every worktree. */
export const sessionRoot = (home: string = homedir()): string => join(home, ".cache", "nulo-chaos")

/** A session's dist copy sits outside its directory, so an agent that may read the directory never
 *  reads the build. */
export const extCopyOf = (root: string, id: string): string => join(root, ".ext", id)

/** The runner's output sits outside it too: the browser writes page errors there unmasked. */
export const logOf = (root: string, id: string): string => join(root, ".log", `${id}.log`)

/** What the session tells the launcher about its browser, outside the directory an agent reads. */
export const runOf = (root: string, id: string): string => join(root, ".run", `${id}.json`)

export const SESSION_FILE = "session.json"
export const READY_FILE = "ready.json"
export const ENDED_FILE = "ended.json"
export const STOPPED_FILE = "stopped.json"
export const ACTIONS_FILE = "actions.jsonl"
export const FINDINGS_FILE = "findings.jsonl"
export const SUMMARY_FILE = "summary.json"
export const QUEUE_DIR = "q"
/** The directories the session writes into, each made by the session at start. */
export const OUTPUT_DIRS = ["screenshots", "downloads", "files"] as const

export const BROWSERS = ["chrome", "firefox"] as const
export type SessionBrowser = (typeof BROWSERS)[number]

const CHARTER = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}-\d{8}T\d{6}-[0-9a-f]{8}$/

export const MAX_SESSION_MINUTES = 120

/** What `start` records and the session reads back. */
export interface SessionInfo {
	id: string
	charter: string
	browser: SessionBrowser
	/** Seeds the secrets `do` generates, so a replay types the same ones. */
	seed: number
	minutes: number
	createdAt: number
	deadlineAt: number
	extPath: string
	revision: string
	/** A digest of the build the session loads. */
	dist?: string
	/** The process group the launcher spawned, and its leader's start time. */
	pid?: number
	pidStart?: string
}

export function newSessionId(charter: string, now = new Date()): string {
	if (!CHARTER.test(charter)) throw new Error(`charter ${JSON.stringify(charter)} is not 1-32 letters, digits and dashes`)
	const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15)
	return `${charter}-${stamp}-${randomBytes(4).toString("hex")}`
}

// ── commands ────────────────────────────────────────────────────────────

const KEYS = [
	"Enter",
	"Escape",
	"Tab",
	"Shift+Tab",
	"Space",
	"Backspace",
	"Delete",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End",
] as const
export type Key = (typeof KEYS)[number]

export const PASSKEY_FAULTS = ["refuse", "hold", "release", "no-prf", "other"] as const
export type PasskeyFault = (typeof PASSKEY_FAULTS)[number]

/** A page the session holds: `p0` is the anchor, which holds the authenticator on Chrome. */
export type PageId = `p${number}`

interface Base {
	/** The page the command acts on; `p0` when omitted. */
	page: PageId
	/** How long the command may run before the session ends; the verb's default when omitted. */
	deadlineMs: number
}

export type Command = Base &
	(
		| { verb: "snapshot" }
		| { verb: "click"; testid: string; nth?: number; now?: true }
		| { verb: "fill"; testid: string; value: string; nth?: number }
		| { verb: "press"; key: Key; now?: true }
		| { verb: "open"; surface: "popup" | "onboarding"; route?: string }
		| { verb: "close" }
		| { verb: "screenshot" }
		| { verb: "pick-file"; testid: string; file: string; truncate?: number; flip?: number }
		| { verb: "downloads" }
		| { verb: "passkey"; fault: PasskeyFault; profile?: string }
		| { verb: "bg-restart" }
		| { verb: "do"; action: string; params?: Record<string, unknown> }
		| { verb: "oracle" }
		| { verb: "report"; text: string }
		| { verb: "end" }
	)

export type Verb = Command["verb"]

/** Each verb's longest run; a command may ask for less, never more. */
export const VERB_DEADLINE_MS: Readonly<Record<Verb, number>> = {
	snapshot: 15_000,
	click: 15_000,
	fill: 15_000,
	press: 10_000,
	open: 30_000,
	close: 15_000,
	screenshot: 30_000,
	"pick-file": 30_000,
	downloads: 10_000,
	passkey: 15_000,
	"bg-restart": 150_000,
	do: 300_000,
	oracle: 60_000,
	report: 5_000,
	end: 60_000,
}
export const MIN_DEADLINE_MS = 250

/** Verbs that change nothing in the wallet: a `do` may still follow them. */
export const READ_VERBS: ReadonlySet<Verb> = new Set(["snapshot", "screenshot", "downloads", "oracle", "report"])

/** Testids the codebase writes: no quote, bracket, backslash or space, so a selector built from one
 *  is always one attribute match. */
const TESTID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
const PAGE = /^p\d{1,3}$/
const ROUTE = /^\/[A-Za-z0-9/_-]{0,200}(\?[A-Za-z0-9=&_%.-]{0,200})?$/
const ACTION = /^[A-Za-z]{1,40}$/
const MAX_VALUE = 2_000
const MAX_FILE = 255
const MAX_PROFILE_NAME = 64
const MAX_PARAMS = 4_000

export class CommandRefused extends Error {}

const refuse = (why: string): never => {
	throw new CommandRefused(why)
}

const text = (v: unknown, what: string, max: number): string => {
	if (typeof v !== "string") return refuse(`${what} must be a string`)
	if (v.length > max) return refuse(`${what} is longer than ${max} characters`)
	if (v.includes("\0")) return refuse(`${what} holds a NUL`)
	return v
}

const shaped = (v: unknown, what: string, re: RegExp): string => {
	const s = text(v, what, 400)
	if (!re.test(s)) return refuse(`${what} ${JSON.stringify(s)} is not a valid ${what}`)
	return s
}

const flag = (v: unknown, what: string): true | undefined => {
	if (v === undefined) return undefined
	return v === true ? true : refuse(`${what} is a flag`)
}

const count = (v: unknown, what: string): number | undefined => {
	if (v === undefined) return undefined
	if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) return refuse(`${what} must be a non-negative integer`)
	return v
}

/** A path relative to the session directory that stays inside it lexically; the session checks the
 *  opened file again, since a directory on the way may be a link. */
export function relativeInside(v: unknown): string {
	const file = text(v, "file", MAX_FILE)
	if (file === "" || isAbsolute(file)) return refuse(`file ${JSON.stringify(file)} must be a path relative to the session directory`)
	const norm = normalize(file)
	if (norm === ".." || norm.startsWith(`..${sep}`) || norm.split(sep).includes(".."))
		return refuse(`file ${JSON.stringify(file)} leaves the session directory`)
	return norm
}

function deadline(verb: Verb, v: unknown): number {
	const max = VERB_DEADLINE_MS[verb]
	if (v === undefined) return max
	if (typeof v !== "number" || !Number.isSafeInteger(v) || v < MIN_DEADLINE_MS || v > max)
		return refuse(`deadline must be an integer from ${MIN_DEADLINE_MS} to ${max} ms for ${verb}`)
	return v
}

const has = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v)

/** The command a parsed file holds, or a refusal naming what is wrong with it. Unknown fields are
 *  refused, so a command never carries what the session would ignore. */
export function validateCommand(raw: unknown): Command {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return refuse("a command is a JSON object")
	const o = raw as Record<string, unknown>
	const verb = o.verb
	if (typeof verb !== "string" || !Object.hasOwn(VERB_DEADLINE_MS, verb)) return refuse(`unknown verb ${JSON.stringify(verb)}`)
	const v = verb as Verb
	const page = o.page === undefined ? "p0" : (shaped(o.page, "page", PAGE) as PageId)
	const base: Base = { page, deadlineMs: deadline(v, o.deadlineMs) }
	const allowed = new Set(["verb", "page", "deadlineMs", ...FIELDS[v]])
	const extra = Object.keys(o).filter((k) => !allowed.has(k))
	if (extra.length) return refuse(`${v} takes no ${extra.join(", ")}`)
	return { ...base, ...BODY[v](o) } as Command
}

const FIELDS: Readonly<Record<Verb, readonly string[]>> = {
	snapshot: [],
	click: ["testid", "nth", "now"],
	fill: ["testid", "value", "nth"],
	press: ["key", "now"],
	open: ["surface", "route"],
	close: [],
	screenshot: [],
	"pick-file": ["testid", "file", "truncate", "flip"],
	downloads: [],
	passkey: ["fault", "profile"],
	"bg-restart": [],
	do: ["action", "params"],
	oracle: [],
	report: ["text"],
	end: [],
}

type Body = (o: Record<string, unknown>) => Record<string, unknown>
const none: Body = (o) => ({ verb: o.verb })
const defined = (o: Record<string, unknown>): Record<string, unknown> =>
	Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

const BODY: Readonly<Record<Verb, Body>> = {
	snapshot: none,
	click: (o) => defined({ verb: "click", testid: shaped(o.testid, "testid", TESTID), nth: count(o.nth, "nth"), now: flag(o.now, "now") }),
	fill: (o) =>
		defined({
			verb: "fill",
			testid: shaped(o.testid, "testid", TESTID),
			value: text(o.value, "value", MAX_VALUE),
			nth: count(o.nth, "nth"),
		}),
	press: (o) =>
		has(KEYS, o.key)
			? defined({ verb: "press", key: o.key, now: flag(o.now, "now") })
			: refuse(`key must be one of ${KEYS.join(", ")}`),
	open: (o) =>
		has(["popup", "onboarding"] as const, o.surface)
			? defined({ verb: "open", surface: o.surface, route: o.route === undefined ? undefined : shaped(o.route, "route", ROUTE) })
			: refuse("open takes popup or onboarding"),
	close: none,
	screenshot: none,
	"pick-file": (o) =>
		defined({
			verb: "pick-file",
			testid: shaped(o.testid, "testid", TESTID),
			file: relativeInside(o.file),
			truncate: count(o.truncate, "truncate"),
			flip: count(o.flip, "flip"),
		}),
	downloads: none,
	passkey: (o) => {
		if (!has(PASSKEY_FAULTS, o.fault)) return refuse(`passkey takes ${PASSKEY_FAULTS.join(", ")}`)
		if (o.fault === "other") return { verb: "passkey", fault: "other", profile: text(o.profile, "profile", MAX_PROFILE_NAME) }
		if (o.profile !== undefined) return refuse(`passkey ${o.fault} names no profile`)
		return { verb: "passkey", fault: o.fault }
	},
	"bg-restart": none,
	do: (o) => {
		const action = shaped(o.action, "action", ACTION)
		if (o.params === undefined) return { verb: "do", action }
		if (!o.params || typeof o.params !== "object" || Array.isArray(o.params)) return refuse("do's params are a JSON object")
		if (JSON.stringify(o.params).length > MAX_PARAMS) return refuse(`do's params are longer than ${MAX_PARAMS} characters`)
		checkDoParams(o.params as Record<string, unknown>, 0)
		return { verb: "do", action, params: o.params }
	},
	oracle: none,
	report: (o) => ({ verb: "report", text: text(o.text, "text", MAX_VALUE) }),
	end: none,
}

/** Keys whose value is a symbol of the model: the catalog's drivers build file names from them. */
const REF_KEYS = new Set(["ref", "file", "password", "credential", "phrase", "to", "target", "other", "sentinel"])
const REF = /^[PKFSW]\d{1,6}$/
/** Names and variants: no separator, no dot, so no value reaches a path as anything but a name. */
const WORD = /^[A-Za-z0-9 _-]{1,64}$/

/** `do`'s params as the catalog draws them, checked only for shape: the model checks whether they
 *  can run. A string is a symbol where the key names one, else a plain word. */
function checkDoParams(o: Record<string, unknown>, depth: number): void {
	if (depth > 2) refuse("do's params nest too deep")
	for (const [key, v] of Object.entries(o)) checkDoValue(key, v, depth)
}

const checkDoString = (key: string, v: string): void => {
	const ref = REF_KEYS.has(key)
	if (!(ref ? REF : WORD).test(v)) refuse(`do's ${key} ${JSON.stringify(v)} is not a valid ${ref ? "symbol" : "word"}`)
}

function checkDoValue(key: string, v: unknown, depth: number): void {
	if (typeof v === "boolean") return
	if (typeof v === "string") {
		checkDoString(key, v)
		return
	}
	if (typeof v === "number") {
		if (!Number.isSafeInteger(v) || v < 0) refuse(`do's ${key} must be a non-negative integer`)
		return
	}
	if (!v || typeof v !== "object" || Array.isArray(v)) refuse(`do's ${key} has an unsupported value`)
	checkDoParams(v as Record<string, unknown>, depth + 1)
}

const VALUE_FLAGS = /^--(page|deadline|nth|truncate|flip)$/

/** The flags and positional arguments of `args`; `--now` takes no value. */
function splitArgs(args: readonly string[]): { positional: string[]; flags: Record<string, string> } {
	const positional: string[] = []
	const flags: Record<string, string> = {}
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (arg === "--now") flags.now = "1"
		else if (!VALUE_FLAGS.test(arg)) positional.push(arg)
		else if (i + 1 >= args.length) refuse(`${arg} needs a value`)
		else flags[arg.slice(2)] = args[++i]
	}
	return { positional, flags }
}

const intFlag = (s: string | undefined, what: string): number | undefined => {
	if (s === undefined) return undefined
	if (!/^\d{1,9}$/.test(s)) return refuse(`--${what} takes a non-negative integer`)
	return Number(s)
}

/** The launcher's argv for `cmd`, after the session directory, as a command: positional arguments
 *  by verb, then `--page`, `--deadline`, `--nth`, `--truncate`, `--flip` and `--now`. */
export function parseCommandArgs(argv: readonly string[]): Command {
	const [verb, ...rest] = argv
	if (!Object.hasOwn(POSITIONAL, verb ?? "")) return refuse(`unknown verb ${JSON.stringify(verb)}`)
	const { positional, flags } = splitArgs(rest)
	return validateCommand(
		defined({
			verb,
			page: flags.page,
			deadlineMs: intFlag(flags.deadline, "deadline"),
			nth: intFlag(flags.nth, "nth"),
			truncate: intFlag(flags.truncate, "truncate"),
			flip: intFlag(flags.flip, "flip"),
			now: flags.now === undefined ? undefined : true,
			...POSITIONAL[verb as Verb](positional),
		}),
	)
}

const exactly = (n: number, args: readonly string[], usage: string): readonly string[] =>
	args.length === n ? args : refuse(`usage: ${usage}`)

const noArgs =
	(usage: string) =>
	(a: readonly string[]): Record<string, unknown> => {
		exactly(0, a, usage)
		return {}
	}

const POSITIONAL: Readonly<Record<Verb, (args: readonly string[]) => Record<string, unknown>>> = {
	snapshot: noArgs("snapshot"),
	click: (a) => ({ testid: exactly(1, a, "click <testid>")[0] }),
	fill: (a) => {
		const [testid, value] = exactly(2, a, "fill <testid> <value>")
		return { testid, value }
	},
	press: (a) => ({ key: exactly(1, a, "press <key>")[0] }),
	open: (a) => {
		if (a.length < 1 || a.length > 2) refuse("usage: open popup|onboarding [route]")
		return { surface: a[0], route: a[1] }
	},
	close: noArgs("close --page <page>"),
	screenshot: noArgs("screenshot"),
	"pick-file": (a) => {
		const [testid, file] = exactly(2, a, "pick-file <testid> <file>")
		return { testid, file }
	},
	downloads: noArgs("downloads"),
	passkey: (a) => {
		if (a.length < 1 || a.length > 2) refuse("usage: passkey refuse|hold|release|no-prf|other [profile name]")
		return { fault: a[0], profile: a[1] }
	},
	"bg-restart": noArgs("bg-restart"),
	do: (a) => {
		if (a.length < 1 || a.length > 2) refuse("usage: do <action> [params JSON]")
		if (a[1] === undefined) return { action: a[0] }
		try {
			return { action: a[0], params: JSON.parse(a[1]) }
		} catch {
			return refuse("do's params are not JSON")
		}
	},
	oracle: noArgs("oracle"),
	report: (a) => ({ text: exactly(1, a, "report <what you saw, and what you expected>")[0] }),
	end: noArgs("end"),
}

// ── the session directory ───────────────────────────────────────────────

/** `dir` as a session directory: it resolves to a directory directly under `root`'s real path,
 *  named like a session, holding `session.json`. Returns its real path. */
export function sessionDir(root: string, dir: string): string {
	const realRoot = realpathSync(root)
	let real: string
	try {
		real = realpathSync(dir)
	} catch {
		return refuse(`${dir} is no session directory`)
	}
	const rel = relative(realRoot, real)
	if (rel.includes(sep) || !SESSION_ID.test(rel)) return refuse(`${dir} is no session directory under ${root}`)
	try {
		readFileSync(join(real, SESSION_FILE))
	} catch {
		return refuse(`${dir} holds no ${SESSION_FILE}`)
	}
	return real
}

export function readSessionInfo(dir: string): SessionInfo {
	return JSON.parse(readFileSync(join(dir, SESSION_FILE), "utf8")) as SessionInfo
}

/** The largest file `pick-file` reads. */
export const MAX_PICK_BYTES = 50 * 1024 * 1024
/** The largest command file the session reads. */
const MAX_COMMAND_BYTES = 64 * 1024

/** Opens `path` for reading without following a link at its end or waiting on a FIFO, and holds it
 *  only as a regular file of at most `max` bytes. */
function openRegular(path: string, what: string, max: number): { fd: number; size: number } {
	let fd: number
	try {
		fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
	} catch (err) {
		return refuse(`${what} cannot be opened: ${(err as NodeJS.ErrnoException).code ?? "error"}`)
	}
	const stat = fstatSync(fd)
	const why = !stat.isFile() ? "is not a regular file" : stat.size > max ? `is larger than ${max} bytes` : undefined
	if (why) {
		closeSync(fd)
		return refuse(`${what} ${why}`)
	}
	return { fd, size: stat.size }
}

function readAll(fd: number, size: number): Buffer {
	const buf = Buffer.alloc(size)
	let at = 0
	while (at < size) {
		const n = readSync(fd, buf, at, size - at, at)
		if (n === 0) break
		at += n
	}
	return buf.subarray(0, at)
}

/** Opens `file` (relative to `dir`) for reading without following a link at its end, and holds it
 *  only when the opened file is a regular file whose real path is inside `dir`'s: a link anywhere on
 *  the way, or a rename after the check, leaves the opened descriptor outside and is refused. */
export function readInside(dir: string, file: string, procFd = (fd: number) => `/proc/self/fd/${fd}`): Buffer {
	const rel = relativeInside(file)
	const realDir = realpathSync(dir)
	const { fd, size } = openRegular(join(realDir, rel), rel, MAX_PICK_BYTES)
	try {
		let opened: string
		try {
			opened = realpathSync(procFd(fd))
		} catch {
			return refuse(`${rel}: where the opened file lives cannot be read on this host`)
		}
		if (!opened.startsWith(`${realDir}${sep}`)) return refuse(`${rel} resolves outside the session directory`)
		return readAll(fd, size)
	} finally {
		closeSync(fd)
	}
}

/** A directory held open: its files are reached through the descriptor, so a directory renamed or
 *  replaced by a link after it was opened never redirects a read or a write. */
export class HeldDir {
	private constructor(private readonly fd: number) {}

	/** Opens `path`, refused when its last component is a link or no directory. */
	public static open(path: string): HeldDir {
		return new HeldDir(openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW))
	}

	/** The path of `name` in this directory, through the descriptor. */
	public at(name: string): string {
		if (!/^[^/\0]+$/.test(name) || name === "." || name === "..") throw new Error(`${JSON.stringify(name)} is no file name`)
		return `${this.path()}/${name}`
	}

	/** The directory itself, through the descriptor. */
	public path(): string {
		return `/proc/self/fd/${this.fd}`
	}

	public sub(name: string): HeldDir {
		return HeldDir.open(this.at(name))
	}

	public list(): string[] {
		return readdirSync(this.path())
	}

	public close(): void {
		closeSync(this.fd)
	}
}

export type OutputDir = (typeof OUTPUT_DIRS)[number]

/** A session directory and every directory in it, held for the session's life. */
export interface SessionDirs {
	top: HeldDir
	q: HeldDir
	out: Record<OutputDir, HeldDir>
	close(): void
}

export function holdSessionDirs(dir: string): SessionDirs {
	const top = HeldDir.open(realpathSync(dir))
	const q = top.sub(QUEUE_DIR)
	const out = Object.fromEntries(OUTPUT_DIRS.map((sub) => [sub, top.sub(sub)])) as Record<OutputDir, HeldDir>
	return {
		top,
		q,
		out,
		close: () => {
			for (const held of [top, q, ...Object.values(out)]) held.close()
		},
	}
}

/** Writes `body` as a new file the session names, in one of its own directories; refuses to replace
 *  anything. Returns the path relative to the session directory. */
export function writeOwn(dirs: SessionDirs, sub: OutputDir, name: string, body: string | Uint8Array): string {
	const safe =
		name
			.replace(/[^A-Za-z0-9._-]+/g, "_")
			.replace(/^\.+/, "_")
			.slice(0, 120) || "file"
	const fd = openSync(dirs.out[sub].at(safe), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
	try {
		writeSync(fd, typeof body === "string" ? Buffer.from(body) : body)
	} finally {
		closeSync(fd)
	}
	return join(sub, safe)
}

/** Appends one line to the session's own log `name`, never through a link. */
export function appendOwn(held: HeldDir, name: string, line: string): void {
	const fd = openSync(held.at(name), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
	try {
		writeSync(fd, line)
	} finally {
		closeSync(fd)
	}
}

/** A copy of `bytes` cut to `truncate` bytes, then with the byte at `flip` inverted: the damaged
 *  files a person might pick. */
export function damaged(bytes: Uint8Array, truncate?: number, flip?: number): Uint8Array {
	const out = Uint8Array.from(truncate === undefined ? bytes : bytes.subarray(0, truncate))
	if (flip !== undefined) {
		if (flip >= out.length) refuse(`flip ${flip} is past the file's ${out.length} bytes`)
		out[flip] ^= 0xff
	}
	return out
}

// ── deadlines ───────────────────────────────────────────────────────────

export class DeadlineExceeded extends Error {}

/** `work`, or a `DeadlineExceeded` at `ms`. Past the deadline the work goes on unobserved, so its
 *  later failure is no unhandled rejection; the session ends rather than let it act again. */
export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
	work.catch(() => {})
	let timer: ReturnType<typeof setTimeout> | undefined
	const late = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new DeadlineExceeded(`passed its ${ms} ms deadline`)), ms)
	})
	return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

// ── the queue ───────────────────────────────────────────────────────────

const CMD = /^(\d+)\.cmd\.json$/
export const cmdFile = (n: number): string => `${n}.cmd.json`
export const takenFile = (n: number): string => `${n}.taken`
export const resFile = (n: number): string => `${n}.res.json`

export type Status = "ok" | "refused" | "failed" | "timeout" | "ended"

export interface Result {
	n: number
	verb: string
	status: Status
	/** Why it was refused or failed; names no secret. */
	reason?: string
	data?: unknown
	elapsedMs: number
	/** Findings and incomplete checks the command's checks added. */
	findings: number
}

function nextNumber(q: HeldDir): number {
	let max = 0
	for (const name of q.list()) {
		const m = CMD.exec(name)
		if (m) max = Math.max(max, Number(m[1]))
	}
	return max + 1
}

/** Publishes `cmd` as the next command: written whole under a temporary name, then linked to the
 *  first free number, which fails rather than replaces when another writer took it. */
export function publishCommand(dir: string, cmd: Command): number {
	const top = HeldDir.open(dir)
	const q = top.sub(QUEUE_DIR)
	const tmp = `.tmp-${process.pid}-${randomBytes(6).toString("hex")}`
	try {
		writeFileSync(q.at(tmp), JSON.stringify(cmd), { flag: "wx", mode: 0o600 })
		try {
			for (let attempt = 0; attempt < 1_000; attempt++) {
				const n = nextNumber(q)
				try {
					linkSync(q.at(tmp), q.at(cmdFile(n)))
					return n
				} catch (err) {
					if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
				}
			}
			throw new Error("no free command number after 1000 tries")
		} finally {
			unlinkSync(q.at(tmp))
		}
	} finally {
		q.close()
		top.close()
	}
}

/** Publishes the file `name` in `held` whole: readers see it absent or complete. */
export function publishFile(held: HeldDir, name: string, body: string): void {
	const tmp = `${name}.${randomBytes(6).toString("hex")}.tmp`
	writeFileSync(held.at(tmp), body, { flag: "wx", mode: 0o600 })
	renameSync(held.at(tmp), held.at(name))
}

/** `publishFile` into the directory `dir`, held for the one write. */
export function publishInto(dir: string, name: string, body: string): void {
	const held = HeldDir.open(dir)
	try {
		publishFile(held, name, body)
	} finally {
		held.close()
	}
}

/** The command numbered `n`, if published: validated again, since anything the user runs can write
 *  into the queue. A file that is not a valid command yields its refusal. */
export function readCommand(q: HeldDir, n: number): { cmd: Command } | { refused: string } | undefined {
	let raw: string
	try {
		// A link in the queue is never followed: a command is a file someone published there.
		const { fd, size } = openRegular(q.at(cmdFile(n)), "the command file", MAX_COMMAND_BYTES)
		try {
			raw = readAll(fd, size).toString("utf8")
		} finally {
			closeSync(fd)
		}
	} catch (err) {
		if (err instanceof CommandRefused) {
			if (err.message.endsWith("ENOENT")) return undefined
			return { refused: err.message.endsWith("ELOOP") ? "the command file is a link" : err.message }
		}
		throw err
	}
	try {
		return { cmd: validateCommand(JSON.parse(raw)) }
	} catch (err) {
		return { refused: err instanceof CommandRefused ? err.message : "the command file is not JSON" }
	}
}

/** Makes a new session directory under `root`, failing rather than reusing anything there. */
export function makeSessionDirs(dir: string): void {
	mkdirSync(dir, { mode: 0o700 })
	for (const sub of [QUEUE_DIR, ...OUTPUT_DIRS]) mkdirSync(join(dir, sub), { mode: 0o700 })
}
