#!/usr/bin/env bun
/**
 * Starts, drives and stops agent chaos sessions: each one an isolated, instrumented wallet in its
 * own browser, served by `tests/e2e/chaos-session.test.ts` from a directory under
 * `~/.cache/nulo-chaos/`. `tests/e2e/README.md` § Chaos runs states the contract.
 *
 *   start --browser chrome|firefox --charter <id> [--minutes 60] [--seed <n>]   prints the directory
 *   cmd <dir> <verb> [args] [--page pN] [--deadline ms] [--nth i] [--now] ...   prints the result;
 *                                                       exits 0 served, 2 refused, 1 otherwise
 *   stop <dir>                                                                  prints what it stopped
 *   seeded --browser chrome|firefox --seed <n> [--runs <n>]                     runs profile chaos seeds
 *   replay <dir>                                                                replays a session's commands
 *
 * The pure contract lives in `tests/e2e/helpers/chaos-session/protocol.ts`; this file only spawns,
 * waits and reports.
 */
import { execFileSync, spawn } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { randomInt } from "node:crypto"
import { readStartTime } from "../../tests/e2e/owned-processes"
import type { ActionRecord, EndState } from "../../tests/e2e/helpers/chaos-session/checks"
import { boundValue, compareReplay } from "../../tests/e2e/helpers/chaos-session/checks"
import { SESSION_ENV, stillTheSame, sweepSession } from "../../tests/e2e/helpers/chaos-session/processes"
import {
	ACTIONS_FILE,
	BROWSERS,
	type Command,
	CommandRefused,
	ENDED_FILE,
	extCopyOf,
	LOG_FILE,
	MAX_SESSION_MINUTES,
	makeSessionDirs,
	newSessionId,
	parseCommandArgs,
	publishCommand,
	publishFile,
	QUEUE_DIR,
	READY_FILE,
	readSessionInfo,
	resFile,
	type Result,
	type SessionBrowser,
	type SessionInfo,
	SESSION_FILE,
	sessionDir,
	sessionRoot,
	STOPPED_FILE,
	SUMMARY_FILE,
	takenFile,
	validateCommand,
} from "../../tests/e2e/helpers/chaos-session/protocol"

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const EXIT_FILE = "exit.code"
/** How long a launch may take to serve its first command. */
const READY_MS = 240_000
/** How long `stop` waits for the runner to end on its own before it signals anything: a session
 *  that ended past a bound first lets its late work stop, up to three minutes, then tears down. */
const STOP_WAIT_MS = 300_000
/** A command's checks and the result's publication, beyond its own deadline. */
const RESULT_TAIL_MS = 180_000
const POLL_MS = 100

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const out = (v: unknown) => process.stdout.write(`${typeof v === "string" ? v : JSON.stringify(v, null, 2)}\n`)

function flags(argv: readonly string[]): Record<string, string> {
	const o: Record<string, string> = {}
	for (let i = 0; i < argv.length; i += 2) {
		if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new CommandRefused(`expected --flag value pairs, got ${argv[i]}`)
		o[argv[i].slice(2)] = argv[i + 1]
	}
	return o
}

function intFlag(raw: string | undefined, what: string, min: number, max: number, fallback?: number): number {
	if (raw === undefined && fallback !== undefined) return fallback
	if (raw === undefined || !/^\d{1,10}$/.test(raw) || Number(raw) < min || Number(raw) > max)
		throw new CommandRefused(`--${what} takes an integer from ${min} to ${max}`)
	return Number(raw)
}

function browserFlag(raw: string | undefined): SessionBrowser {
	if (!(BROWSERS as readonly string[]).includes(raw ?? "")) throw new CommandRefused(`--browser takes ${BROWSERS.join(" or ")}`)
	return raw as SessionBrowser
}

const revision = (): string => {
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], { cwd: APP_DIR, encoding: "utf8" }).trim()
	} catch {
		return "unknown"
	}
}

const WITHHELD = new Set(["GH_TOKEN", "GITHUB_TOKEN"])

/** The environment a runner gets: the caller's, without a GitHub token, plus the session's. */
function runnerEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
	return Object.fromEntries(Object.entries({ ...process.env, ...extra }).filter(([key]) => !WITHHELD.has(key)))
}

/** The armed smoke dist for `browser`, copied where only the session's runner reads it. */
function copyDist(root: string, id: string, browser: SessionBrowser): string {
	const dist = join(APP_DIR, "dist", browser)
	if (!existsSync(join(dist, "manifest.json")))
		throw new CommandRefused(`no ${browser} build at ${dist}: build the armed smoke dist first (tests/e2e/README.md)`)
	const ext = extCopyOf(root, id)
	mkdirSync(dirname(ext), { recursive: true, mode: 0o700 })
	cpSync(dist, ext, { recursive: true })
	return ext
}

/** Spawns `file` under vitest in its own process group, its output to the session's log and its
 *  exit status to `exit.code` when it ends. */
function spawnRunner(dir: string, file: string, env: Record<string, string>): number {
	const script = 'cd "$1" && bun run test:e2e -- "$2" --retry=0 > "$3" 2>&1; echo $? > "$4"'
	const child = spawn("sh", ["-c", script, "sh", APP_DIR, file, join(dir, LOG_FILE), join(dir, EXIT_FILE)], {
		detached: true,
		stdio: "ignore",
		env: runnerEnv({ ...env, [SESSION_ENV]: dir, NULO_E2E_CHAOS: "1", NULO_E2E_MIGRATION_FIXTURE: "1", NULO_E2E_CSP_REPORT: "1" }),
	})
	child.unref()
	if (!child.pid) throw new Error("the runner did not start")
	return child.pid
}

const runnerAlive = (info: SessionInfo): boolean => stillTheSame(info.pid, info.pidStart)

/** The runner's exit status, once it has one. */
function exitCode(dir: string): number | undefined {
	try {
		return Number(readFileSync(join(dir, EXIT_FILE), "utf8").trim())
	} catch {
		return undefined
	}
}

function logTail(dir: string, lines = 30): string {
	try {
		return readFileSync(join(dir, LOG_FILE), "utf8").split("\n").slice(-lines).join("\n")
	} catch {
		return "(no log)"
	}
}

// ── start ───────────────────────────────────────────────────────────────

interface StartOptions {
	browser: SessionBrowser
	charter: string
	minutes: number
	seed: number
}

async function startSession(o: StartOptions): Promise<string> {
	const root = sessionRoot()
	mkdirSync(root, { recursive: true, mode: 0o700 })
	const id = newSessionId(o.charter)
	const dir = join(root, id)
	makeSessionDirs(dir)
	const ext = copyDist(root, id, o.browser)
	const createdAt = Date.now()
	const info: SessionInfo = { id, ...o, createdAt, deadlineAt: createdAt + o.minutes * 60_000, extPath: ext, revision: revision() }
	publishFile(join(dir, SESSION_FILE), JSON.stringify(info))
	const pid = spawnRunner(dir, "tests/e2e/chaos-session.test.ts", { EXTENSION_PATH: ext, NULO_E2E_BROWSER: o.browser })
	Object.assign(info, { pid, pidStart: readStartTime(pid) })
	publishFile(join(dir, SESSION_FILE), JSON.stringify(info))
	const until = Date.now() + READY_MS
	while (!existsSync(join(dir, READY_FILE))) {
		if (exitCode(dir) !== undefined || !runnerAlive(info) || Date.now() > until) {
			await stopSession(dir)
			throw new Error(`the session did not start; its log ends:\n${logTail(dir)}`)
		}
		await sleep(250)
	}
	return dir
}

// ── cmd ─────────────────────────────────────────────────────────────────

const ended = (dir: string): boolean => existsSync(join(dir, ENDED_FILE))

function readResult(dir: string, n: number): Result | undefined {
	try {
		return JSON.parse(readFileSync(join(dir, QUEUE_DIR, resFile(n)), "utf8")) as Result
	} catch {
		return undefined
	}
}

const endedResult = (n: number, cmd: Command, reason: string): Result => ({
	n,
	verb: cmd.verb,
	status: "ended",
	reason,
	elapsedMs: 0,
	findings: 0,
})

/** Why the session can no longer answer command `n`, or undefined while it still may. */
function unanswerable(dir: string, info: SessionInfo, cmd: Command, takenAt: number | undefined): string | undefined {
	if (!runnerAlive(info)) return "the session's runner is gone"
	if (takenAt === undefined) return ended(dir) ? "the session ended before serving it" : undefined
	return Date.now() - takenAt > cmd.deadlineMs + RESULT_TAIL_MS ? "no result within the command's bound" : undefined
}

/** Publishes `cmd` and waits for its result while the session can still serve it. */
async function send(dir: string, cmd: Command): Promise<Result> {
	const info = readSessionInfo(dir)
	if (ended(dir) || !runnerAlive(info)) return endedResult(0, cmd, "the session has ended")
	const n = publishCommand(dir, cmd)
	let takenAt: number | undefined
	for (;;) {
		const result = readResult(dir, n)
		if (result) return result
		if (takenAt === undefined && existsSync(join(dir, QUEUE_DIR, takenFile(n)))) takenAt = Date.now()
		const why = unanswerable(dir, info, cmd, takenAt)
		if (why) return readResult(dir, n) ?? endedResult(n, cmd, why)
		await sleep(POLL_MS)
	}
}

/** A command's exit status: 0 when served, 2 when refused, wherever the refusal came from. */
const EXIT_OF: Record<Result["status"], number> = { ok: 0, refused: 2, failed: 1, timeout: 1, ended: 1 }

async function cmdMain(argv: readonly string[]): Promise<number> {
	const dir = sessionDir(sessionRoot(), argv[0] ?? "")
	const result = await send(dir, parseCommandArgs(argv.slice(1)))
	out(result)
	return EXIT_OF[result.status]
}

// ── stop ────────────────────────────────────────────────────────────────

/** Ends the session: asks it to end, waits a bounded time for its runner, then signals whatever of
 *  the session still runs. The dist copy goes only once nothing of the session is left. */
async function stopSession(dir: string): Promise<Record<string, unknown>> {
	const info = readSessionInfo(dir)
	if (!ended(dir) && runnerAlive(info)) publishCommand(dir, validateCommand({ verb: "end" }))
	const until = Date.now() + STOP_WAIT_MS
	while (runnerAlive(info) && Date.now() < until) await sleep(250)
	const graceful = !runnerAlive(info)
	const { left, groups } = await sweepSession(dir, info.extPath)
	const report = { stoppedAt: Date.now(), graceful, exitCode: exitCode(dir) ?? null, left: left.map((o) => o.pid), groups }
	if (!left.length && !groups.length) rmSync(info.extPath, { recursive: true, force: true })
	publishFile(join(dir, STOPPED_FILE), JSON.stringify(report))
	return report
}

// ── seeded ──────────────────────────────────────────────────────────────

/** Profile chaos seeds in a session's isolation, in the foreground; records land in its directory. */
async function seededMain(argv: readonly string[]): Promise<number> {
	const f = flags(argv)
	const browser = browserFlag(f.browser)
	const seed = intFlag(f.seed, "seed", 0, 2 ** 32 - 1)
	const runs = intFlag(f.runs, "runs", 1, 100, 1)
	const root = sessionRoot()
	const id = newSessionId("seeded")
	const dir = join(root, id)
	makeSessionDirs(dir)
	const ext = copyDist(root, id, browser)
	const info: SessionInfo = {
		id,
		charter: "seeded",
		browser,
		seed,
		minutes: 0,
		createdAt: Date.now(),
		deadlineAt: Date.now(),
		extPath: ext,
		revision: revision(),
	}
	publishFile(join(dir, SESSION_FILE), JSON.stringify(info))
	const pid = spawnRunner(dir, "tests/e2e/profile-chaos.test.ts", {
		EXTENSION_PATH: ext,
		NULO_E2E_BROWSER: browser,
		NULO_E2E_CHAOS_SEED: String(seed),
		NULO_E2E_CHAOS_RUNS: String(runs),
	})
	Object.assign(info, { pid, pidStart: readStartTime(pid) })
	publishFile(join(dir, SESSION_FILE), JSON.stringify(info))
	const interrupt = () => void sweepSession(dir, ext).then(() => process.exit(130))
	process.on("SIGINT", interrupt)
	process.on("SIGTERM", interrupt)
	while (runnerAlive(info) && exitCode(dir) === undefined) await sleep(1_000)
	const code = exitCode(dir) ?? 1
	const { left, groups } = await sweepSession(dir, ext)
	if (!left.length && !groups.length) rmSync(ext, { recursive: true, force: true })
	const verdicts = logTail(dir, 100_000)
		.split("\n")
		.filter((l) => /\[profile-chaos\] seed \d+[: ]/.test(l))
	out(verdicts.join("\n"))
	out({ dir, exitCode: code, left: left.map((o) => o.pid) })
	return code === 0 && !left.length ? 0 : 1
}

// ── replay ──────────────────────────────────────────────────────────────

function readActions(dir: string): (ActionRecord & { reason?: string })[] {
	return readFileSync(join(dir, ACTIONS_FILE), "utf8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as ActionRecord)
}

function readEnd(dir: string): EndState {
	return (JSON.parse(readFileSync(join(dir, SUMMARY_FILE), "utf8")) as { end: EndState }).end
}

/** The command a recorded action replays: as sent, a bound fill taking its value from the replay's
 *  own snapshot of the same number. */
function replayCommand(dir: string, a: ActionRecord): Command {
	const cmd = validateCommand(a.command)
	if (!a.bound || cmd.verb !== "fill") return cmd
	const snap = readResult(dir, a.bound.snapshot)?.data as { items: { testid: string; nth: number; text?: string }[] } | undefined
	const value = snap && boundValue(a.bound, { n: a.bound.snapshot, page: a.bound.page, items: snap.items })
	if (value === undefined)
		throw new Error(`command ${a.n}'s value came from snapshot ${a.bound.snapshot}, which the replay's does not show`)
	return { ...cmd, value }
}

async function replayMain(argv: readonly string[]): Promise<number> {
	const original = sessionDir(sessionRoot(), argv[0] ?? "")
	const info = readSessionInfo(original)
	const actions = readActions(original)
	if (actions.some((a) => !a.command.verb))
		throw new CommandRefused("the session holds a refused command file, which a replay cannot send again")
	const dir = await startSession({
		browser: info.browser,
		charter: `r-${info.charter}`.slice(0, 32),
		minutes: Math.max(info.minutes, 1),
		seed: info.seed,
	})
	out(`replaying ${actions.length} commands of ${info.id} in ${dir}`)
	for (const a of actions) {
		const result = await send(dir, replayCommand(dir, a))
		if (result.status === "ended") break
	}
	const stopped = await stopSession(dir)
	const differences = compareReplay({ actions, end: readEnd(original) }, { actions: readActions(dir), end: readEnd(dir) })
	const replayInfo = readSessionInfo(dir)
	if (replayInfo.revision !== info.revision)
		differences.push(`the replay ran on ${replayInfo.revision}, the original on ${info.revision}`)
	if (stopped.exitCode !== 0) differences.push(`the replay's runner exited ${String(stopped.exitCode)}`)
	const verdict = { of: info.id, replay: replayInfo.id, same: differences.length === 0, differences }
	publishFile(join(dir, "replay.json"), `${JSON.stringify(verdict, null, 2)}\n`)
	out(verdict)
	return verdict.same ? 0 : 1
}

// ── main ────────────────────────────────────────────────────────────────

async function main(argv: readonly string[]): Promise<number> {
	const [sub, ...rest] = argv
	switch (sub) {
		case "start": {
			const f = flags(rest)
			const dir = await startSession({
				browser: browserFlag(f.browser),
				charter: f.charter ?? "",
				minutes: intFlag(f.minutes, "minutes", 1, MAX_SESSION_MINUTES, 60),
				seed: intFlag(f.seed, "seed", 0, 2 ** 32 - 1, randomInt(2 ** 32 - 1)),
			})
			out(dir)
			return 0
		}
		case "cmd":
			return cmdMain(rest)
		case "stop": {
			const report = await stopSession(sessionDir(sessionRoot(), rest[0] ?? ""))
			out(report)
			return (report.left as number[]).length ? 1 : 0
		}
		case "seeded":
			return seededMain(rest)
		case "replay":
			return replayMain(rest)
		default:
			throw new CommandRefused("usage: chaos-session.ts start|cmd|stop|seeded|replay … (see the file's header)")
	}
}

if (import.meta.main) {
	main(process.argv.slice(2)).then(
		(code) => process.exit(code),
		(err: unknown) => {
			const refused = err instanceof CommandRefused
			out({ status: refused ? "refused" : "failed", reason: err instanceof Error ? err.message : String(err) })
			process.exit(refused ? 2 : 1)
		},
	)
}
