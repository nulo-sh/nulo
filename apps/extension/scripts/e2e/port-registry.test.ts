import { spawn, spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, test } from "vitest"
import {
	PortClaimConflict,
	RegistryLocked,
	acquireRegistryLock,
	claimPorts,
	registeredPorts,
	releaseDeadRows,
	releasePorts,
} from "../../tests/e2e/port-registry"

const ROOT = mkdtempSync(path.join(tmpdir(), "nulo-port-registry-test-"))
// Belt and braces: a case that forgot its `file` must never touch the host's real registry.
process.env.NULO_E2E_PORT_REGISTRY = path.join(ROOT, "default-ports.md")

const MODULE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tests/e2e/port-registry.ts")
const HEADER = [
	"# Ports registry — who is RUNNING what, where (atomic-locked)",
	"| port | service | owner (run) | worktree | pid-hint | claimed |",
	"|---|---|---|---|---|---|",
]

let n = 0
const registry = (lines?: string[]): string => {
	const file = path.join(ROOT, `ports-${n++}.md`)
	if (lines) writeFileSync(file, `${lines.join("\n")}\n`)
	return file
}
const read = (file: string) => readFileSync(file, "utf8")
const opts = (file: string) => ({ file, lockWaitMs: 300, pollMs: 10 })

/** A pid the kernel has just reaped: nothing reissues it within a test. */
function deadPid(): number {
	const pid = spawnSync("true").pid
	if (!pid) throw new Error("could not spawn")
	return pid
}

const row = (port: number, service: string, runId: string, worktree: string, pid: number | string) =>
	`| ${port} | ${service} | ${runId} | ${worktree} | ${pid} | 2026-10-09T00:00:00.000Z |`

afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

describe("host port registry", { timeout: 20_000 }, () => {
	test("a claim on a host with no registry writes the header and one six-cell row per service", async () => {
		const file = registry()
		await claimPorts(
			{ runId: "nulo-e2e-1-aa", ports: { anvil: 11001, aztec: 11002 }, ownerPid: process.pid, worktree: "/w" },
			opts(file),
		)
		const lines = read(file).split("\n")
		expect(lines.slice(0, 3)).toEqual(HEADER)
		expect(
			lines.slice(3, 5).map((l) =>
				l
					.split("|")
					.slice(1, 6)
					.map((c) => c.trim()),
			),
		).toEqual([
			["11001", "nulo-e2e-anvil", "nulo-e2e-1-aa", "/w", String(process.pid)],
			["11002", "nulo-e2e-aztec", "nulo-e2e-1-aa", "/w", String(process.pid)],
		])
		expect(lines.slice(3, 5).every((l) => l.split("|").length === 8)).toBe(true)
		expect(registeredPorts(file)).toEqual(new Set([11001, 11002]))
	})

	test("a port another row lists is refused and nothing is written", async () => {
		const file = registry([...HEADER, row(12001, "tools-e2e-tools", "tools-1", "/other", deadPid())])
		const before = read(file)
		const claim = claimPorts({ runId: "r", ports: { anvil: 12000, aztec: 12001 }, ownerPid: process.pid, worktree: "/w" }, opts(file))
		await expect(claim).rejects.toBeInstanceOf(PortClaimConflict)
		await expect(claim).rejects.toMatchObject({ ports: [12001] })
		expect(read(file)).toBe(before)
	})

	test("a claim drops only dead nulo-e2e rows; live, unsignallable, foreign and unparsed lines survive byte for byte", async () => {
		const dead = row(13001, "nulo-e2e-anvil", "old", "/w", deadPid())
		const survivors = [
			row(13002, "nulo-e2e-anvil", "live", "/w", process.pid),
			// pid 1 answers EPERM to an unprivileged probe: alive, and not ours to judge.
			row(13003, "nulo-e2e-aztec", "init", "/w", 1),
			row(13004, "bridge-sandbox-anvil", "foreign", "/w", deadPid()),
			`| 13005 | nulo-e2e-anvil | seven | /w | ${deadPid()} | x | extra |`,
			"some note a human left",
		]
		const file = registry([...HEADER, dead, ...survivors])
		await claimPorts({ runId: "new", ports: { playground: 13006 }, ownerPid: process.pid, worktree: "/w" }, opts(file))
		const lines = read(file).split("\n")
		expect(lines).not.toContain(dead)
		expect(lines.slice(0, 3 + survivors.length)).toEqual([...HEADER, ...survivors])
		expect(lines[3 + survivors.length]).toContain("| 13006 | nulo-e2e-playground | new |")
	})

	test("a foreign row with a '|' inside a later cell still excludes its port", async () => {
		const file = registry([...HEADER, `| 14001 | hd-shots-x | run | /a|b | ${process.pid} | t |`])
		expect(registeredPorts(file).has(14001)).toBe(true)
		await expect(
			claimPorts({ runId: "r", ports: { anvil: 14001 }, ownerPid: process.pid, worktree: "/w" }, opts(file)),
		).rejects.toBeInstanceOf(PortClaimConflict)
	})

	test("a cell holding '|' or a newline is refused before the registry is touched", async () => {
		const file = registry()
		await expect(
			claimPorts({ runId: "r", ports: { anvil: 15001 }, ownerPid: process.pid, worktree: "/a|b" }, opts(file)),
		).rejects.toThrow(/cell/)
		await expect(
			claimPorts({ runId: "r\n| 1 |", ports: { anvil: 15001 }, ownerPid: process.pid, worktree: "/w" }, opts(file)),
		).rejects.toThrow(/cell/)
		expect(existsSync(file)).toBe(false)
	})

	test("release drops only this run's rows", async () => {
		const others = [row(16002, "nulo-e2e-anvil", "other", "/w", process.pid), row(16003, "tools-e2e-tools", "mine", "/w", process.pid)]
		const file = registry([...HEADER, row(16001, "nulo-e2e-anvil", "mine", "/w", process.pid), ...others])
		expect(await releasePorts("mine", opts(file))).toBe(true)
		expect(read(file)).toBe(`${[...HEADER, ...others].join("\n")}\n`)
	})

	// The rewrite is a rename onto a new inode, which would otherwise take the umask's mode.
	test("a rewrite keeps the registry's own mode", async () => {
		const file = registry([...HEADER, row(16101, "nulo-e2e-anvil", "mine", "/w", process.pid)])
		chmodSync(file, 0o600)
		expect(await releasePorts("mine", opts(file))).toBe(true)
		expect(statSync(file).mode & 0o777).toBe(0o600)
	})

	test("releaseDeadRows drops only the named worktree's dead nulo-e2e rows", async () => {
		const keep = [
			row(17002, "nulo-e2e-anvil", "live", "/w", process.pid),
			row(17003, "nulo-e2e-anvil", "elsewhere", "/other", deadPid()),
			row(17004, "tools-e2e-tools", "foreign", "/w", deadPid()),
		]
		const file = registry([...HEADER, row(17001, "nulo-e2e-anvil", "dead", "/w", deadPid()), ...keep])
		expect(await releaseDeadRows("/w", opts(file))).toBe(1)
		expect(read(file)).toBe(`${[...HEADER, ...keep].join("\n")}\n`)
	})

	describe("the lock", () => {
		// Fresh and long abandoned alike: breaking either races a writer that took it since.
		test.each([
			["fresh, another writer's", "", 0],
			["an hour old, one of ours", "nulo-e2e 1 deadbeef\n", 3600],
		])("a held lock (%s) fails the claim closed and is left as it was", async (_, content, ageS) => {
			const file = registry([...HEADER])
			const lock = `${file}.lock`
			writeFileSync(lock, content)
			const then = new Date(Date.now() - ageS * 1000)
			utimesSync(lock, then, then)
			const before = { registry: read(file), mtime: statSync(lock).mtimeMs }
			await expect(
				claimPorts({ runId: "r", ports: { anvil: 18001 }, ownerPid: process.pid, worktree: "/w" }, opts(file)),
			).rejects.toBeInstanceOf(RegistryLocked)
			expect(read(lock)).toBe(content)
			expect(statSync(lock).mtimeMs).toBe(before.mtime)
			expect(read(file)).toBe(before.registry)
			expect(await releasePorts("r", opts(file))).toBe(false)
		})

		test("a lock released during the wait lets the claim through", async () => {
			const file = registry([...HEADER])
			writeFileSync(`${file}.lock`, "")
			setTimeout(() => unlinkSync(`${file}.lock`), 150)
			await claimPorts(
				{ runId: "r", ports: { anvil: 18101 }, ownerPid: process.pid, worktree: "/w" },
				{ file, lockWaitMs: 3_000, pollMs: 10 },
			)
			expect(registeredPorts(file).has(18101)).toBe(true)
			expect(existsSync(`${file}.lock`)).toBe(false)
		})

		test.each([
			["another holder's token", "nulo-e2e 1 0123456789abcdef\n"],
			["an empty lock", ""],
		])("release leaves a lock that now holds %s", async (_, replacement) => {
			const file = registry([...HEADER])
			const held = await acquireRegistryLock(opts(file))
			writeFileSync(`${file}.lock`, replacement)
			held.release()
			expect(read(`${file}.lock`)).toBe(replacement)
		})

		test("release removes the lock it took", async () => {
			const file = registry([...HEADER])
			const held = await acquireRegistryLock(opts(file))
			expect(read(`${file}.lock`)).toMatch(new RegExp(`^nulo-e2e ${process.pid} [0-9a-f]{16}\\n$`))
			held.release()
			expect(existsSync(`${file}.lock`)).toBe(false)
		})

		test("three writers in separate processes never overlap, and a foreign row survives every rewrite", async () => {
			const foreign = row(19999, "bridge-sandbox-anvil", "foreign", "/w|x", deadPid())
			const file = registry([...HEADER, foreign])
			const log = path.join(ROOT, "critical.log")
			const script = path.join(ROOT, "writer.mjs")
			writeFileSync(
				script,
				`import { appendFileSync } from "node:fs"
const { withRegistry } = await import(${JSON.stringify(MODULE)})
const { REG: file, LOG: log, ID: id } = process.env
const spin = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
for (let i = 0; i < 5; i++) {
	await withRegistry((lines) => {
		appendFileSync(log, id + " enter\\n")
		spin(15)
		appendFileSync(log, id + " exit\\n")
		const end = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length
		return [...lines.slice(0, end), "| " + (20000 + Number(id) * 10 + i) + " | nulo-e2e-t | w" + id + " | /w | " + process.pid + " | t |", ""]
	}, { file, lockWaitMs: 15000, pollMs: 2 })
}
`,
			)
			const exits = await Promise.all(
				[1, 2, 3].map(
					(id) =>
						new Promise<number | null>((resolve) => {
							const child = spawn(process.execPath, [script], {
								stdio: "inherit",
								env: { ...process.env, REG: file, LOG: log, ID: String(id) },
							})
							child.once("exit", resolve)
						}),
				),
			)
			expect(exits).toEqual([0, 0, 0])
			const events = read(log).trim().split("\n")
			expect(events).toHaveLength(30)
			for (let i = 0; i < events.length; i += 2) {
				const [id] = events[i].split(" ")
				expect([events[i], events[i + 1]]).toEqual([`${id} enter`, `${id} exit`])
			}
			expect(read(file).split("\n")).toContain(foreign)
			expect(registeredPorts(file).size).toBe(16)
		})

		test("two concurrent claims for one port: exactly one wins", async () => {
			const file = registry([...HEADER])
			const claim = (runId: string) =>
				claimPorts(
					{ runId, ports: { anvil: 21001 }, ownerPid: process.pid, worktree: "/w" },
					{ file, lockWaitMs: 3_000, pollMs: 5 },
				)
			const outcomes = await Promise.allSettled([claim("a"), claim("b")])
			expect(outcomes.map((o) => o.status).sort()).toEqual(["fulfilled", "rejected"])
			expect(outcomes.find((o) => o.status === "rejected")).toMatchObject({ reason: expect.any(PortClaimConflict) })
			expect(
				read(file)
					.split("\n")
					.filter((l) => l.startsWith("| 21001 ")),
			).toHaveLength(1)
		})
	})
})
