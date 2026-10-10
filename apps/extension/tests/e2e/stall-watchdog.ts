import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { RunnerTaskEventPack } from "vitest"
import type { Reporter, ReportedHookContext, TestCase, TestModule, Vitest } from "vitest/node"
import { STATE_DIR } from "./sentinel.ts"

/** The fork pool's worker entry in vitest 4.1.10; `scripts/e2e/stall-watchdog.test.ts` pins it. */
export const FORK_ENTRY = "/vitest/dist/workers/forks.js"

export interface StallWatchdogOptions {
	/** Silence after which the run is failed and cancelled. */
	stallMs: number
	/** How long a cancelled run's forks get to end before they are killed. */
	killAfterMs?: number
	stateDir?: string
}

type Silence = { ms: number; file: string; after: string; until: string }

/**
 * Fails a network run that goes silent instead of letting it hold its CI job to the job's timeout.
 * Silence is the time between reporter events from the first file's queueing on; global setup has its
 * own budget. A fork whose event loop is blocked cannot answer the cancel, so it is killed after
 * `killAfterMs`, on Linux only (forks are found under /proc). Each run prints its longest silence, the
 * measure `STALL_MS` is set from. A test that logs while it hangs is never silent; its timeout stops it.
 */
export default class StallWatchdog implements Reporter {
	private vitest?: Vitest
	private stallTimer?: NodeJS.Timeout
	private killTimer?: NodeJS.Timeout
	private lastAt = 0
	private lastEvent = ""
	private file = ""
	private longest?: Silence
	private readonly running = new Map<string, string>()
	private readonly options: StallWatchdogOptions

	constructor(options: StallWatchdogOptions) {
		this.options = options
	}

	onInit(vitest: Vitest): void {
		this.vitest = vitest
	}

	// Files run one at a time, so a queued file is the only one running; a crashed fork's tests never end.
	onTestModuleQueued(testModule: TestModule): void {
		this.file = testModule.moduleId
		this.running.clear()
		this.progress("file queued")
	}

	onTestModuleStart(): void {
		this.progress("file start")
	}

	onTestModuleEnd(): void {
		this.progress("file end")
	}

	onTestCaseReady(testCase: TestCase): void {
		this.running.set(testCase.id, `${testCase.module.moduleId} > ${testCase.fullName}`)
		this.progress(`test start: ${testCase.name}`)
	}

	onTestCaseResult(testCase: TestCase): void {
		this.running.delete(testCase.id)
		this.progress(`test end: ${testCase.name}`)
	}

	onHookStart(hook: ReportedHookContext): void {
		this.progress(`${hook.name} start`)
	}

	onHookEnd(hook: ReportedHookContext): void {
		this.progress(`${hook.name} end`)
	}

	onUserConsoleLog(): void {
		this.progress("console")
	}

	// A retry fires no case or hook event of its own; this undeclared hook is where its start shows.
	onTaskUpdate(_packs: unknown, events: RunnerTaskEventPack[]): void {
		if (events.some(([, event]) => event === "test-retried")) this.progress("test retried")
	}

	onTestRunEnd(): void {
		clearTimeout(this.stallTimer)
		clearTimeout(this.killTimer)
		const l = this.longest
		if (l) console.log(`[stall-watchdog] longest silence ${seconds(l.ms)} in ${l.file} (after ${l.after}, until ${l.until})`)
	}

	private progress(event: string): void {
		const now = Date.now()
		if (this.lastAt && now - this.lastAt > (this.longest?.ms ?? -1)) {
			this.longest = { ms: now - this.lastAt, file: this.file, after: this.lastEvent, until: event }
		}
		this.lastAt = now
		this.lastEvent = event
		clearTimeout(this.stallTimer)
		this.stallTimer = setTimeout(() => this.stall(), this.options.stallMs)
		this.stallTimer.unref()
	}

	private stall(): void {
		// A blocked fork never reports its test's start, so the file is the most that can be named.
		const running = this.running.size ? [...this.running.values()] : [this.file]
		const report = [`no progress for ${seconds(this.options.stallMs)} after ${this.lastEvent}; running:`, ...running]
		console.error(report.map((line) => `[stall-watchdog] ${line}`).join("\n"))
		const dir = this.options.stateDir ?? STATE_DIR
		mkdirSync(dir, { recursive: true })
		writeFileSync(path.join(dir, "stalled"), `${report.join("\n")}\n`)
		process.exitCode = 1
		// Not awaited: it settles only once the running file ends, which a blocked fork never does.
		void this.vitest?.cancelCurrentRun("stall" as Parameters<Vitest["cancelCurrentRun"]>[0])
		this.killTimer = setTimeout(() => {
			let pids: number[]
			try {
				pids = forkWorkers(process.pid)
			} catch {
				console.error("[stall-watchdog] no /proc on this host, so a blocked fork is left running")
				return
			}
			for (const pid of pids) {
				console.error(`[stall-watchdog] killing fork ${pid}`)
				try {
					process.kill(pid, "SIGKILL")
				} catch {}
			}
		}, this.options.killAfterMs ?? 30_000)
		this.killTimer.unref()
	}
}

/** The children of `parent` whose command line runs vitest's fork entry; nothing wider. */
export function forkWorkers(parent: number): number[] {
	const pids: number[] = []
	for (const name of readdirSync("/proc")) {
		if (!/^\d+$/.test(name)) continue
		try {
			const stat = readFileSync(`/proc/${name}/stat`, "utf8")
			if (Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]) !== parent) continue
			if (
				readFileSync(`/proc/${name}/cmdline`, "utf8")
					.split("\0")
					.some((arg) => arg.endsWith(FORK_ENTRY))
			)
				pids.push(Number(name))
		} catch {}
	}
	return pids
}

function seconds(ms: number): string {
	return `${(ms / 1_000).toFixed(1)} s`
}
