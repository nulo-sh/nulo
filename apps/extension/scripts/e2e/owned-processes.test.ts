import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, test, vi } from "vitest"

// Set before the modules load: `E2E_DATA_ROOT` is read at import time, and these cases create and
// delete run dirs that must never be a real run's.
const ROOT = mkdtempSync(path.join(tmpdir(), "nulo-owned-processes-test-"))
process.env.NULO_E2E_DATA_ROOT = ROOT

const { LAUNCH_ENV, OWNER_ENV, RUN_ENV, RUN_OWNER_ENV, WORKTREE_ENV, newMarker, ownIdentity, ownedProcesses, readEnviron, readStartTime } =
	await import("../../tests/e2e/owned-processes")
const {
	chromePattern,
	chromesUnclaimed,
	createRunDir,
	deletableRunDir,
	reapPriorRun,
	stopService,
	stopServiceOnExit,
	sweepDeadRuns,
	sweepOrphanDataDirs,
} = await import("../../tests/e2e/sandbox-ownership")
type OwnedState = import("../../tests/e2e/lockfile").OwnedState

/** An owner no live process can be: what a dead run's processes name. */
const DEAD = "2000000000:1"
const WORKTREE = `/nonexistent/worktree-${newMarker()}`
const markers: string[] = []
const spawned: number[] = []

const marker = () => {
	const m = newMarker()
	markers.push(m)
	return m
}

function deadPid(): number {
	const pid = spawnSync("true").pid
	if (!pid) throw new Error("could not spawn")
	return pid
}

async function until(condition: () => boolean, timeoutMs = 3_000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs
	while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25))
	return condition()
}

/** Running, as opposed to gone or a zombie waiting to be reaped. */
function running(pid: number): boolean {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
		return stat.slice(stat.lastIndexOf(")") + 2)[0] !== "Z"
	} catch {
		return false
	}
}

/** A detached process with `env` added. With `visible`, returns once its environ shows that key: a
 *  child inside execve reads an empty environ. */
async function spawnWith(
	env: Record<string, string>,
	visible?: string,
	command = "sleep",
	args = ["120"],
): Promise<{ pid: number; child: ChildProcess }> {
	const child = spawn(command, args, { detached: true, stdio: "ignore", env: { ...process.env, ...env } })
	const pid = child.pid
	if (!pid) throw new Error("could not spawn")
	spawned.push(pid)
	if (visible) {
		const seen = await until(() => {
			const found = readEnviron(pid)
			return typeof found !== "string" && found.get(visible) === env[visible]
		})
		if (!seen) throw new Error(`process ${pid} never showed ${visible}`)
	}
	return { pid, child }
}

/** A live process to name as an owner, and its identity. */
async function liveOwner(): Promise<{ pid: number; identity: string }> {
	const { pid } = await spawnWith({ NULO_TEST_OWNER: "1" }, "NULO_TEST_OWNER")
	return { pid, identity: `${pid}:${readStartTime(pid)}` }
}

async function kill(pid: number): Promise<void> {
	process.kill(pid, "SIGKILL")
	await until(() => !running(pid))
}

/** `sh` forks a marked `sleep` and exits: a group whose leader is gone while a member lives. */
async function leaderless(env: Record<string, string>, m: string): Promise<{ child: ChildProcess; member: number }> {
	const { child } = await spawnWith(env, undefined, "sh", ["-c", "sleep 120 & exit 0"])
	if (!(await until(() => child.exitCode !== null && ownedProcesses(m).length === 1))) throw new Error("no leaderless group")
	const [member] = ownedProcesses(m)
	spawned.push(member)
	return { child, member }
}

const lock = (fields: Partial<OwnedState>): OwnedState => ({
	startedAt: "2026-10-09T00:00:00.000Z",
	bakedLocalRpcUrl: "http://localhost:1",
	ports: { anvil: 1, aztec: 2, aztecAdmin: 3, aztecP2P: 4, playground: 5 },
	pids: {},
	aztecDataDir: path.join(ROOT, "none"),
	...fields,
})

/** Records every signal sent, and lets it through. */
function spyKill() {
	const sent: Array<[number, unknown]> = []
	const real = process.kill.bind(process)
	const spy = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
		if (signal !== 0 && signal !== undefined) sent.push([pid, signal])
		return real(pid, signal)
	})
	return { sent, restore: () => spy.mockRestore() }
}

const fast = { graceMs: 1_500, killGraceMs: 1_000, pollMs: 50 }

describe.skipIf(process.platform !== "linux")("sandbox ownership by marker", { timeout: 20_000 }, () => {
	afterAll(() => {
		for (const pid of [...spawned, ...markers.flatMap((m) => ownedProcesses(m))]) {
			try {
				process.kill(pid, "SIGKILL")
			} catch {
				// Already stopped by the case under test.
			}
		}
		rmSync(ROOT, { recursive: true, force: true })
	})

	test("teardown stops a leaderless group's marked member and leaves an unmarked sibling", async () => {
		const m = marker()
		const self = ownIdentity() ?? ""
		const { child, member } = await leaderless({ [LAUNCH_ENV]: m, [OWNER_ENV]: self }, m)
		const s = marker()
		const sibling = await leaderless({ [LAUNCH_ENV]: s, [OWNER_ENV]: self }, s)

		expect(await stopService(child, "anvil", true, m, fast)).toBe("stopped")
		expect(await until(() => !running(member))).toBe(true)
		expect(running(sibling.member)).toBe(true)
	})

	test("an orphan sweep never signals a marked process whose own owner lives, whatever the lock says", async () => {
		const m = marker()
		const { pid } = await spawnWith({ [LAUNCH_ENV]: m, [OWNER_ENV]: ownIdentity() ?? "" }, LAUNCH_ENV)
		const dir = path.join(ROOT, `nulo-aztec-${deadPid()}-1`)
		createRunDir(dir, m)
		const spy = spyKill()
		try {
			const outcome = await reapPriorRun(lock({ markers: { aztec: m }, owner: DEAD, aztecDataDir: dir }), fast)
			expect(outcome).toMatchObject({ cleared: false, reason: expect.stringContaining("aztec retained") })
		} finally {
			spy.restore()
		}
		expect(spy.sent.filter(([target]) => Math.abs(target) === pid)).toEqual([])
		expect(running(pid)).toBe(true)
		expect(existsSync(dir)).toBe(true)
	})

	test("a marked process that turns unreadable leaves the sweep unknown; the lock's run dir stays", async () => {
		const m = marker()
		const { pid } = await spawnWith({ [LAUNCH_ENV]: m, [OWNER_ENV]: DEAD }, LAUNCH_ENV)
		const dir = path.join(ROOT, `nulo-aztec-${deadPid()}-2`)
		createRunDir(dir, m)
		let reads = 0
		const read = (p: number) => {
			if (p !== pid) return "gone" as const
			reads++
			return reads === 1
				? new Map([
						[LAUNCH_ENV, m],
						[OWNER_ENV, DEAD],
					])
				: ("unreadable" as const)
		}
		const prior = lock({
			markers: { aztec: m },
			owner: DEAD,
			aztecDataDir: dir,
			pids: { aztec: pid },
			starts: { aztec: readStartTime(pid) },
		})
		const outcome = await reapPriorRun(prior, { ...fast, read })
		expect(outcome).toMatchObject({ cleared: false, reason: expect.stringContaining("aztec unknown") })
		expect(existsSync(dir)).toBe(true)
		// A later reap never saw it marked; the lock's pid and start time are what keep the dir.
		const again = await reapPriorRun(prior, { ...fast, read: (p: number) => (p === pid ? "unreadable" : "gone") })
		expect(again).toMatchObject({ cleared: false, reason: expect.stringContaining("aztec unknown") })
		expect(existsSync(dir)).toBe(true)
	})

	// Its handle ignores kill and it leads no group, so the group stop can only fail; it then turns
	// unreadable before the sweep's first scan.
	test("teardown of a leader that outlives its group stop and turns unreadable is unknown, not stopped", async () => {
		const m = marker()
		const child = spawn("sleep", ["120"], {
			stdio: "ignore",
			env: { ...process.env, [LAUNCH_ENV]: m, [OWNER_ENV]: ownIdentity() ?? "" },
		})
		const pid = child.pid
		if (!pid) throw new Error("could not spawn")
		spawned.push(pid)
		const handle = { pid, exitCode: null, signalCode: null, kill: () => true } as unknown as ChildProcess
		const read = (p: number) => (p === pid ? ("unreadable" as const) : ("gone" as const))
		expect(await stopService(handle, "anvil", true, m, { ...fast, read })).toBe("unknown")
		expect(running(pid)).toBe(true)
	})

	// The control for the case above: another user's processes (pid 1's environ is unreadable to
	// anyone but root) never make a sweep unknown, because none of them was ever seen as marked.
	test("unreadable strangers do not make a sweep unknown", async () => {
		const outcome = await reapPriorRun(lock({ markers: { anvil: marker() }, owner: DEAD }), fast)
		expect(outcome).toEqual({ cleared: true })
	})

	test("a run dir is deleted only directly under the root, with the prefix, stamped with the lock's marker", async () => {
		const m = marker()
		const outside = mkdtempSync(path.join(tmpdir(), "nulo-aztec-outside-"))
		createRunDir(outside, m)
		const unprefixed = path.join(ROOT, "other-run")
		createRunDir(unprefixed, m)
		const foreign = path.join(ROOT, "nulo-aztec-1-3")
		createRunDir(foreign, marker())
		const own = path.join(ROOT, "nulo-aztec-1-4")
		createRunDir(own, m)
		for (const dir of [outside, unprefixed, foreign]) {
			expect(await reapPriorRun(lock({ markers: { aztec: m }, owner: DEAD, aztecDataDir: dir }), fast)).toEqual({ cleared: true })
			expect(existsSync(dir)).toBe(true)
		}
		expect(deletableRunDir(own, m)).toBeDefined()
		expect(await reapPriorRun(lock({ markers: { aztec: m }, owner: DEAD, aztecDataDir: own }), fast)).toEqual({ cleared: true })
		expect(existsSync(own)).toBe(false)
		rmSync(outside, { recursive: true, force: true })
	})

	test("a lock naming no owner is never signalled: all pids dead clears it and its stamped run dir, one live pid refuses", async () => {
		const owner = await liveOwner()
		const m = marker()
		const dir = path.join(ROOT, `nulo-aztec-${deadPid()}-5`)
		createRunDir(dir, m)
		const spy = spyKill()
		try {
			const unowned = lock({ pids: { anvil: deadPid(), aztec: deadPid() }, markers: { aztec: m }, aztecDataDir: dir })
			expect(await reapPriorRun(unowned)).toEqual({ cleared: true })
			expect(existsSync(dir)).toBe(false)
			const refused = await reapPriorRun(lock({ pids: { anvil: deadPid(), aztec: owner.pid } }))
			expect(refused).toMatchObject({ cleared: false, reason: expect.stringContaining(`aztec pid ${owner.pid}`) })
		} finally {
			spy.restore()
		}
		expect(spy.sent).toEqual([])
		expect(running(owner.pid)).toBe(true)
	})

	test("an unstamped run dir a live process names is kept, and swept once that process exits", async () => {
		const dir = path.join(ROOT, `nulo-aztec-${deadPid()}-5`)
		mkdirSync(path.join(dir, "data"), { recursive: true })
		const { pid } = await spawnWith({ NULO_TEST_USER: "1" }, "NULO_TEST_USER", "sh", [
			"-c",
			"sleep 120; :",
			"sh",
			"--data-directory",
			path.join(dir, "data"),
		])
		expect(sweepOrphanDataDirs()).not.toContain(dir)
		expect(existsSync(dir)).toBe(true)
		await kill(pid)
		expect(sweepOrphanDataDirs()).toContain(dir)
		expect(existsSync(dir)).toBe(false)
	})

	test("a stamped run dir is kept while a live process carries its marker", async () => {
		const m = marker()
		const dir = path.join(ROOT, `nulo-aztec-${deadPid()}-6`)
		mkdirSync(dir)
		writeFileSync(path.join(dir, ".nulo-launch"), m)
		const { pid } = await spawnWith({ [LAUNCH_ENV]: m, [OWNER_ENV]: DEAD }, LAUNCH_ENV)
		expect(sweepOrphanDataDirs()).not.toContain(dir)
		await kill(pid)
		expect(sweepOrphanDataDirs()).toContain(dir)
	})

	test("a reused lock's live owner keeps every sweep off services that name a dead owner", async () => {
		const m = marker()
		const { pid } = await spawnWith({ [LAUNCH_ENV]: m, [OWNER_ENV]: DEAD }, LAUNCH_ENV)
		const adopter = await liveOwner()
		expect(await reapPriorRun(lock({ markers: { anvil: m }, owner: adopter.identity }), fast)).toMatchObject({ cleared: false })
		expect(running(pid)).toBe(true)
		expect(await reapPriorRun(lock({ markers: { anvil: m }, owner: DEAD }), fast)).toEqual({ cleared: true })
		expect(ownedProcesses(m)).toEqual([])
	})

	test("a dead run's processes in this worktree are stopped; a live run's, another worktree's and a launch's are not", async () => {
		const run = (extra: Record<string, string>) =>
			spawnWith({ [WORKTREE_ENV]: WORKTREE, [RUN_ENV]: marker(), [RUN_OWNER_ENV]: DEAD, ...extra }, RUN_ENV)
		const dead = await run({})
		const live = await run({ [RUN_OWNER_ENV]: ownIdentity() ?? "" })
		const elsewhere = await run({ [WORKTREE_ENV]: `${WORKTREE}-other` })
		const launched = await run({ [LAUNCH_ENV]: marker(), [OWNER_ENV]: DEAD })
		expect(await sweepDeadRuns(WORKTREE, fast)).toBe("stopped")
		expect(await until(() => !running(dead.pid))).toBe(true)
		for (const kept of [live, elsewhere, launched]) expect(running(kept.pid)).toBe(true)
	})

	test("an agent run's service, adopted by a bare run, outlives every reap until its adopter dies", async () => {
		const m = marker()
		const { pid } = await spawnWith(
			{ [WORKTREE_ENV]: WORKTREE, [RUN_ENV]: marker(), [RUN_OWNER_ENV]: DEAD, [LAUNCH_ENV]: m, [OWNER_ENV]: DEAD },
			LAUNCH_ENV,
		)
		const adopter = await liveOwner()
		const reused = lock({ markers: { anvil: m }, owner: adopter.identity })

		expect(await reapPriorRun(reused, fast)).toMatchObject({ cleared: false })
		expect(await sweepDeadRuns(WORKTREE, fast)).toBe("stopped")
		expect(running(pid)).toBe(true)

		await kill(adopter.pid)
		expect(await reapPriorRun(reused, fast)).toEqual({ cleared: true })
		expect(ownedProcesses(m)).toEqual([])
	})

	describe("the exit hook", () => {
		test("signals the group of a live leader", async () => {
			const m = marker()
			const { pid, child } = await spawnWith({ [LAUNCH_ENV]: m, [OWNER_ENV]: ownIdentity() ?? "" }, LAUNCH_ENV)
			const spy = spyKill()
			try {
				stopServiceOnExit(child, true, m)
			} finally {
				spy.restore()
			}
			expect(spy.sent).toEqual([[-pid, "SIGTERM"]])
		})

		test("sends no group signal once the leader has exited, and stops its marked survivors one by one", async () => {
			const m = marker()
			const { child, member } = await leaderless({ [LAUNCH_ENV]: m, [OWNER_ENV]: ownIdentity() ?? "" }, m)
			const spy = spyKill()
			try {
				stopServiceOnExit(child, true, m)
			} finally {
				spy.restore()
			}
			expect(spy.sent).toEqual([[member, "SIGTERM"]])
		})
	})
})

describe.skipIf(process.platform !== "linux")("chromes by extension path", { timeout: 10_000 }, () => {
	// Chrome shows no environment, so its sweep matches the command line; only pgrep reads it here.
	test("the pattern matches the exact build only, not a neighbour or a path its metacharacters would match", async () => {
		const base = `/nonexistent/${newMarker()}`
		const fake = (extension: string) =>
			spawn("sh", ["-c", "sleep 30", "chrome", `--load-extension=${extension}`, "--no-sandbox"], { stdio: "ignore" })
		const exact = fake(`${base}/a.b/dist/chrome`)
		const others = [fake(`${base}/a.b/dist/chrome-canary`), fake(`${base}/aXb/dist/chrome`)]
		try {
			const matched = () => spawnSync("pgrep", ["-f", chromePattern(`${base}/a.b/dist/chrome`)], { encoding: "utf8" }).stdout.trim()
			expect(await until(() => matched() !== "")).toBe(true)
			expect(matched()).toBe(String(exact.pid))
		} finally {
			for (const child of [exact, ...others]) child.kill("SIGKILL")
		}
	})

	test("a worktree's Chromes are swept only once no live run holds it", async () => {
		const owner = await liveOwner()
		expect(chromesUnclaimed(undefined)).toBe(true)
		expect(chromesUnclaimed(lock({ owner: owner.identity }))).toBe(false)
		expect(chromesUnclaimed(lock({ owner: DEAD }))).toBe(true)
		// A lock naming no owner (no `/proc`) is judged by its recorded services.
		expect(chromesUnclaimed(lock({ pids: { aztec: owner.pid } }))).toBe(false)
		expect(chromesUnclaimed(lock({ pids: { aztec: deadPid() } }))).toBe(true)
		process.kill(owner.pid, "SIGKILL")
	})
})

describe.skipIf(process.platform !== "linux")("process reads", { timeout: 10_000 }, () => {
	// A zombie's environ refuses the read exactly as a non-dumpable process's does.
	test("a zombie reads as gone, not unreadable", async () => {
		const parent = spawn("sh", ["-c", "sleep 0.1 & echo $!; exec sleep 5"], { stdio: ["ignore", "pipe", "ignore"] })
		const zombie = Number(await new Promise<string>((resolve) => parent.stdout?.once("data", (d: Buffer) => resolve(d.toString()))))
		try {
			expect(await until(() => readFileSync(`/proc/${zombie}/stat`, "utf8").includes(") Z "))).toBe(true)
			expect(readEnviron(zombie)).toBe("gone")
		} finally {
			parent.kill("SIGKILL")
		}
	})
})
