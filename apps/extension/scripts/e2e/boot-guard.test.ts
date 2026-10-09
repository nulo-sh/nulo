import { spawn } from "node:child_process"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, test } from "vitest"
import { probeAnvil } from "../../tests/e2e/anvil-probe"
import { assertPackFree, mayAdopt, waitWhileAlive } from "../../tests/e2e/boot-guard"

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

	test("a live child that answers reaches ready", async () => {
		const child = spawn("sleep", ["30"])
		try {
			let polls = 0
			await waitWhileAlive(child, async () => ++polls >= 3, "anvil", 5_000, 10)
			expect(polls).toBe(3)
		} finally {
			child.kill("SIGKILL")
		}
	})
})
