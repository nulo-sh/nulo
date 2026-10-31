import { type ChildProcess, spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import { probeAnvil } from "../../tests/e2e/anvil-probe"
import { assertAdminKeyRequired, assertPackFree, listenerIsOurs, mayAdopt, nodeStores, waitWhileAlive } from "../../tests/e2e/boot-guard"
import { LAUNCH_ENV, launchEnv, newMarker, readEnviron } from "../../tests/e2e/owned-processes"

const servers: http.Server[] = []
afterEach(async () => {
	await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))))
})

/** A listener that answers JSON-RPC exactly as a fresh local anvil does. */
function strangerAnvil(): Promise<number> {
	const srv = http.createServer((req, res) => {
		let body = ""
		req.on("data", (c) => {
			body += c
		})
		req.on("end", () => {
			const { id, method } = JSON.parse(body) as { id: number; method: string }
			const result = method === "eth_chainId" ? "0x7a69" : "0x0"
			res.setHeader("Content-Type", "application/json")
			res.end(JSON.stringify({ jsonrpc: "2.0", id, result }))
		})
	})
	servers.push(srv)
	return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve((srv.address() as AddressInfo).port)))
}

type AdminStub = "enforces" | "open" | "refusesKey" | "rpcError"

/** An admin RPC; `enforces` answers as the node's key middleware does, with a 401 JSON-RPC error
 *  when the key is missing or wrong. */
function stubAdmin(mode: AdminStub, key: string): Promise<string> {
	const srv = http.createServer((req, res) => {
		req.resume()
		const keyed = req.headers["x-api-key"] === key
		res.setHeader("Content-Type", "application/json")
		if (mode === "refusesKey" || (mode !== "open" && !keyed)) {
			res.statusCode = 401
			res.end(
				JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Unauthorized: invalid or missing API key" } }),
			)
		} else if (mode === "rpcError") {
			res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }))
		} else {
			res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { minTxsPerBlock: 0 } }))
		}
	})
	servers.push(srv)
	return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`)))
}

/** A pack of currently free ports: each bound, read, and closed. */
async function freePorts(n: number): Promise<number[]> {
	const ports: number[] = []
	for (let i = 0; i < n; i++) {
		const srv = http.createServer()
		await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve))
		ports.push((srv.address() as AddressInfo).port)
		await new Promise((resolve) => srv.close(resolve))
	}
	return ports
}

const environShown = (pid: number | undefined) => {
	const env = pid ? readEnviron(pid) : "gone"
	return typeof env !== "string" && env.size > 0
}

/** A detached process carrying `marker`, once its environ shows it (a child in execve reads empty). */
async function spawnMarked(marker: string, args: string[]) {
	const child = spawn(process.execPath, args, {
		detached: true,
		stdio: ["ignore", "pipe", "ignore"],
		env: { ...process.env, ...launchEnv(marker) },
	})
	const deadline = Date.now() + 5_000
	while (!environShown(child.pid)) {
		if (Date.now() > deadline) throw new Error("the marked child never became readable")
		await new Promise((resolve) => setTimeout(resolve, 20))
	}
	return child
}

describe("boot guard", () => {
	test("a claimed pack with a held port fails naming the service and port; the same pack freed passes", async () => {
		const [aztec, playground] = await freePorts(2)
		const anvil = await strangerAnvil()
		const pack = { anvil, aztec, playground }
		await expect(assertPackFree(pack)).rejects.toThrow(`anvil's claimed port ${anvil} is already in use`)
		await new Promise((resolve) => servers.pop()?.close(resolve))
		await expect(assertPackFree(pack)).resolves.toBeUndefined()
	})

	test("a stranger answering as chain 31337 is adopted by a bare run only", async () => {
		const url = `http://127.0.0.1:${await strangerAnvil()}`
		expect(await probeAnvil(url)).toBe(true)
		expect(await mayAdopt(undefined, () => probeAnvil(url))).toBe(true)
		expect(await mayAdopt("nulo-e2e-1-deadbeef", () => probeAnvil(url))).toBe(false)
	})

	test("a readiness wait fails within one poll once its child has exited, whatever answers the probe", async () => {
		const child = spawn("true")
		await new Promise((resolve) => child.once("exit", resolve))
		const started = Date.now()
		await expect(waitWhileAlive(child, async () => true, "anvil", 30_000, 250)).rejects.toThrow(/exited/)
		expect(Date.now() - started).toBeLessThan(250)
	})

	test("a probe still pending when the child exits fails on the exit, not the deadline", async () => {
		const child = spawn("sleep", ["0.2"])
		const started = Date.now()
		await expect(waitWhileAlive(child, () => new Promise<boolean>(() => {}), "node", 30_000, 10)).rejects.toThrow(/exited/)
		expect(Date.now() - started).toBeLessThan(2_000)
	})

	test("a probe that never settles fails at the deadline", async () => {
		const child = spawn("sleep", ["30"])
		try {
			await expect(waitWhileAlive(child, () => new Promise<boolean>(() => {}), "node", 300, 10)).rejects.toThrow(/Timed out/)
		} finally {
			child.kill("SIGKILL")
		}
	})

	test("the admin key check passes a node that refuses a keyless call and answers the key, and fails the rest naming the URL, never the key", async () => {
		const key = "9f".repeat(32)
		await expect(assertAdminKeyRequired(await stubAdmin("enforces", key), key)).resolves.toBeUndefined()
		const [closed] = await freePorts(1)
		const failing: Array<[string, string]> = [
			["open", await stubAdmin("open", key)],
			["refusesKey", await stubAdmin("refusesKey", key)],
			["rpcError", await stubAdmin("rpcError", key)],
			["closed", `http://127.0.0.1:${closed}`],
		]
		for (const [label, url] of failing) {
			const error = await assertAdminKeyRequired(url, key).then(
				() => undefined,
				(e: Error) => e,
			)
			expect(error, label).toBeInstanceOf(Error)
			expect(error?.message, label).toContain(url)
			expect(error?.message, label).not.toContain(key)
		}
	})

	describe.skipIf(process.platform !== "linux")("listener ownership", () => {
		test("a stranger answering while the live, still-unbound child starts is refused", async () => {
			const port = await strangerAnvil()
			const marker = newMarker()
			const child = await spawnMarked(marker, ["-e", "setTimeout(() => {}, 30_000)"])
			try {
				await expect(
					waitWhileAlive(
						child,
						() => probeAnvil(`http://127.0.0.1:${port}`),
						"anvil",
						5_000,
						10,
						() => listenerIsOurs(port, marker),
					),
				).rejects.toThrow("answered by a listener this run did not start")
			} finally {
				child.kill("SIGKILL")
			}
		})

		test("the child's own listener reaches ready", async () => {
			const marker = newMarker()
			// The child picks its own port: a port freed here for it could be taken first on a busy host.
			const child = await spawnMarked(marker, [
				"-e",
				`const s = require("node:http").createServer((_, res) => res.end("ok")).listen(0, "127.0.0.1", () => console.log(s.address().port))`,
			])
			try {
				const port = Number(
					await new Promise<string>((resolve) => child.stdout?.once("data", (d: Buffer) => resolve(d.toString()))),
				)
				const answers = () =>
					new Promise<boolean>((resolve) =>
						http.get(`http://127.0.0.1:${port}/`, (res) => resolve(res.statusCode === 200)).on("error", () => resolve(false)),
					)
				await waitWhileAlive(child, answers, "playground", 5_000, 20, () => listenerIsOurs(port, marker))
				expect(listenerIsOurs(port, newMarker())).toBe(false)
			} finally {
				child.kill("SIGKILL")
			}
		})
	})

	describe.skipIf(process.platform !== "linux")("node stores", () => {
		let root = ""
		let run = ""
		const children: ChildProcess[] = []
		beforeAll(() => {
			root = mkdtempSync(path.join(tmpdir(), "nulo-node-stores-test-"))
			run = path.join(root, "nulo-aztec-1-1")
			mkdirSync(run)
		})
		afterAll(() => {
			for (const child of children) child.kill("SIGKILL")
			if (root) rmSync(root, { recursive: true, force: true })
		})

		const store = (...parts: string[]) => {
			const file = path.join(root, ...parts, "data.mdb")
			mkdirSync(path.dirname(file), { recursive: true })
			writeFileSync(file, "")
			return file
		}

		/** A process carrying `marker` that holds `files` open, `unlinked` already removed from disk. */
		async function holding(marker: string, files: string[], unlinked: string[] = []) {
			const child = await spawnMarked(marker, [
				"-e",
				`const fs = require("node:fs")
				for (const f of ${JSON.stringify(files)}) fs.openSync(f, "r")
				for (const f of ${JSON.stringify(unlinked)}) fs.unlinkSync(f)
				console.log("ready")
				setTimeout(() => {}, 60_000)`,
			])
			children.push(child)
			await new Promise((resolve) => child.stdout?.once("data", resolve))
		}

		test("a store under the run dir is inside; a sibling dir's and an unlinked one's are outside", async () => {
			const marker = newMarker()
			const inside = store("nulo-aztec-1-1", "tmp", "archiver-a")
			const sibling = store("nulo-aztec-1-1-other", "p2p-b")
			const unlinked = store("elsewhere", "sentinel-c")
			await holding(marker, [inside, sibling, unlinked], [unlinked])
			const found = nodeStores(run, marker)
			expect(found.inside).toEqual([inside])
			expect([...found.outside].sort()).toEqual([sibling, unlinked].sort())
			expect(found.unreadable).toEqual([])
		})

		test("another run's open store is not this node's, and a node with none open has none inside", async () => {
			const marker = newMarker()
			await holding(newMarker(), [store("stranger", "archiver-d")])
			await holding(marker, [])
			expect(nodeStores(run, marker)).toEqual({ inside: [], outside: [], unreadable: [] })
		})

		test("a marked process whose open files /proc will not list is reported", () => {
			// The suite runs unprivileged, where init's fd list is refused.
			expect(() => readdirSync("/proc/1/fd")).toThrow(expect.objectContaining({ code: "EACCES" }))
			const marker = newMarker()
			const read = (pid: number) => (pid === 1 ? new Map([[LAUNCH_ENV, marker]]) : ("gone" as const))
			expect(nodeStores(run, marker, read)).toEqual({ inside: [], outside: [], unreadable: [1] })
		})
	})
})
