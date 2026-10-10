import { spawn } from "node:child_process"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, test } from "vitest"
import { probeAnvil } from "../../tests/e2e/anvil-probe"
import { assertPackFree, listenerIsOurs, mayAdopt, waitWhileAlive } from "../../tests/e2e/boot-guard"
import { launchEnv, newMarker, readEnviron } from "../../tests/e2e/owned-processes"

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

	describe.skipIf(process.platform !== "linux")("listener ownership", () => {
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
})
