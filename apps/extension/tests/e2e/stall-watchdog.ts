import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { Reporter, ReportedHookContext, TestCase, TestModule, Vitest } from "vitest/node"
import { STATE_DIR } from "./sentinel"

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
 * Fails a network run that stops making progress, instead of letting it hold its CI job to the job's
 * timeout. Progress is any reporter event (a file, test or hook starting or ending, or a test's
 * console line) from the first file's start: global setup has its own budget and the boot
 * classifier. After `stallMs` of silence it names the running tests in `.e2e-state/stalled`, fails the
 * run and cancels it so no new file starts. A fork that cannot answer the cancel (a blocked event
 * loop) is killed after `killAfterMs`; global teardown then stops the sandbox as on any red run.
 * Every run ends by printing its longest silence and the events around it, the measure `STALL_MS`
 * is set from.
 * Limit: a test that logs while it hangs is never silent; its own timeout is what stops it.
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

	constructor(private readonly options: StallWatchdogOptions) {}

	onInit(vitest: Vitest): void {
		this.vitest = vitest
	}

	onTestModuleStart(testModule: TestModule): void {
		this.file = testModule.moduleId
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
			for (const pid of forkWorkers(process.pid)) {
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
