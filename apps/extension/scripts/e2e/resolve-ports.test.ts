import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer, Server } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, test, vi } from "vitest"
import { REPO_ROOT } from "../../tests/e2e/lockfile"
import { ephemeralFloor, reservePort, reservePortPack, resolvePorts, staticWindow } from "./resolve-ports"

const ROOT = mkdtempSync(path.join(tmpdir(), "nulo-resolve-ports-test-"))
// Every draw reads the registry; none of these cases may read or write the host's real one.
process.env.NULO_E2E_PORT_REGISTRY = path.join(ROOT, "ports.md")
afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

/** Can we bind this exact loopback port right now? */
function bindable(port: number): Promise<boolean> {
	return new Promise((res) => {
		const srv = createServer()
		srv.unref()
		srv.once("error", () => {
			srv.close()
			res(false)
		})
		srv.listen(port, "127.0.0.1", () => srv.close(() => res(true)))
	})
}

describe("resolve-ports — collision-immune static allocation", () => {
	test("ephemeralFloor is a sane port above the static window", async () => {
		const floor = await ephemeralFloor()
		expect(floor).toBeGreaterThan(10256)
		expect(floor).toBeLessThanOrEqual(65535)
	})

	test("a pack has five distinct ports", async () => {
		const { ports, release } = await reservePortPack()
		try {
			expect(Object.keys(ports).sort()).toEqual(["anvil", "aztec", "aztecAdmin", "aztecP2P", "playground"])
			const values = Object.values(ports)
			expect(new Set(values).size).toBe(5)
			for (const p of values) {
				expect(p).toBeGreaterThan(1024)
				expect(p).toBeLessThanOrEqual(65535)
			}
		} finally {
			await release()
		}
	})

	// The fix: listener ports must sit BELOW the OS ephemeral floor so the
	// kernel can never assign them as an outgoing connection's source port
	// during the resolve→build→bind gap. This is the invariant the sticky
	// sticky boot flake violated.
	test("every reserved port is below the ephemeral floor", async () => {
		const floor = await ephemeralFloor()
		const { ports, release } = await reservePortPack()
		try {
			for (const p of Object.values(ports)) expect(p).toBeLessThan(floor)
		} finally {
			await release()
		}
	})

	test("release frees the ports for immediate re-binding", async () => {
		const { ports, release } = await reservePortPack()
		await release()
		expect(await bindable(ports.aztec)).toBe(true)
	})

	// 10080 is a Fetch bad port inside the window: Node's WebSocket refused a BiDi socket on it.
	test("never tries to bind 10080, even when every draw lands on it", async () => {
		const { lo, hi } = staticWindow(await ephemeralFloor())
		expect(lo).toBeLessThanOrEqual(10080)
		expect(hi).toBeGreaterThan(10080)
		const random = vi.spyOn(Math, "random").mockReturnValue((10080 - lo + 0.5) / (hi - lo))
		const listen = vi.spyOn(Server.prototype, "listen")
		try {
			const reservation = await reservePort()
			await reservation.release()
			expect(random).toHaveBeenCalled()
			// The binds, not just the result: a draw onto a 10080 held elsewhere also ends on the fallback.
			expect(listen.mock.calls.map(([port]) => port)).not.toContain(10080)
			expect(reservation.port).not.toBe(10080)
		} finally {
			random.mockRestore()
			listen.mockRestore()
		}
	})
})

describe("resolve-ports — host registry", () => {
	test("a draw never returns a port the registry lists", async () => {
		const floor = await ephemeralFloor()
		const { lo, hi } = staticWindow(floor)
		const free = lo + 4321
		const listed = new Set<number>()
		for (let port = lo; port < hi; port++) if (port !== free) listed.add(port)
		const reservation = await reservePort(listed)
		await reservation.release()
		expect(listed.has(reservation.port)).toBe(false)
		expect(reservation.port === free || reservation.port >= floor).toBe(true)
	})

	test("with nothing listed, a draw comes from the static window", async () => {
		const { lo, hi } = staticWindow(await ephemeralFloor())
		const reservation = await reservePort(new Set())
		await reservation.release()
		expect(reservation.port).toBeGreaterThanOrEqual(lo)
		expect(reservation.port).toBeLessThan(hi)
	})

	const ownRows = (file: string) =>
		existsSync(file)
			? readFileSync(file, "utf8")
					.split("\n")
					.filter((l) => l.includes("| nulo-e2e-"))
			: []

	test("an owned run claims its five ports under one run id and names it in ports.json", async () => {
		const file = path.join(ROOT, "claimed.md")
		const portsPath = path.join(ROOT, "claimed", "ports.json")
		const { runId, ports } = await resolvePorts({ ownerPid: String(process.pid), portsPath, registry: { file } })
		expect(runId).toMatch(new RegExp(`^nulo-e2e-${process.pid}-[0-9a-f]{8}$`))
		expect(JSON.parse(readFileSync(portsPath, "utf8"))).toMatchObject({ ...ports, runId, worktree: REPO_ROOT })
		const { runMarker, runOwner } = JSON.parse(readFileSync(portsPath, "utf8"))
		expect(runMarker).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
		if (process.platform === "linux") expect(runOwner).toMatch(new RegExp(`^${process.pid}:\\d+$`))
		const rows = ownRows(file).map((l) =>
			l
				.split("|")
				.slice(1, 6)
				.map((c) => c.trim()),
		)
		expect(rows.map(([port]) => Number(port)).sort()).toEqual(Object.values(ports).sort())
		expect(new Set(rows.map(([, , id, worktree, pid]) => `${id} ${worktree} ${pid}`))).toEqual(
			new Set([`${runId} ${REPO_ROOT} ${process.pid}`]),
		)
	})

	test("a ports.json that cannot be written releases the claim", async () => {
		const file = path.join(ROOT, "rolled-back.md")
		const blocker = path.join(ROOT, "not-a-dir")
		writeFileSync(blocker, "")
		await expect(
			resolvePorts({ ownerPid: String(process.pid), portsPath: path.join(blocker, "ports.json"), registry: { file } }),
		).rejects.toThrow()
		expect(existsSync(file)).toBe(true)
		expect(ownRows(file)).toEqual([])
	})

	test("without an owner pid nothing is claimed", async () => {
		const file = path.join(ROOT, "bare.md")
		const portsPath = path.join(ROOT, "bare", "ports.json")
		const { runId } = await resolvePorts({ ownerPid: undefined, portsPath, registry: { file } })
		expect(runId).toBeUndefined()
		expect(JSON.parse(readFileSync(portsPath, "utf8"))).not.toHaveProperty("runId")
		expect(existsSync(file)).toBe(false)
	})
})
