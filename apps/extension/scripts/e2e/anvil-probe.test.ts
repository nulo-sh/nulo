// @vitest-environment node
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, test } from "vitest"
import { probeAnvil } from "../../tests/e2e/anvil-probe"

const servers: Server[] = []

async function fakeL1(results: Record<string, unknown>): Promise<string> {
	const server = createServer((req, res) => {
		let body = ""
		req.on("data", (c) => {
			body += c
		})
		req.on("end", () => {
			const { id, method } = JSON.parse(body) as { id: number; method: string }
			res.setHeader("Content-Type", "application/json")
			res.end(JSON.stringify({ jsonrpc: "2.0", id, result: results[method] }))
		})
	})
	servers.push(server)
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

afterEach(async () => {
	await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))))
})

describe("probeAnvil", () => {
	test("(control) adopts a listener on chain 31337 with a hex block number", async () => {
		expect(await probeAnvil(await fakeL1({ eth_chainId: "0x7a69", eth_blockNumber: "0x2a" }))).toBe(true)
	})

	test("refuses a JSON-RPC listener on another chain", async () => {
		expect(await probeAnvil(await fakeL1({ eth_chainId: "0x1", eth_blockNumber: "0x2a" }))).toBe(false)
	})

	test("refuses a block number that is not a hex quantity", async () => {
		expect(await probeAnvil(await fakeL1({ eth_chainId: "0x7a69", eth_blockNumber: "latest" }))).toBe(false)
	})
})
