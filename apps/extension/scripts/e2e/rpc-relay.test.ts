// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, expect, test } from "vitest"
import { RELAY_REPLIES, type RpcRelay, startRpcRelay } from "../../tests/e2e/fixtures/rpc-relay"

const ROOT = mkdtempSync(path.join(tmpdir(), "nulo-rpc-relay-test-"))
const REGISTRY = path.join(ROOT, "ports.md")
// The relay claims its port in the host registry; this suite must never write the real one.
process.env.NULO_E2E_PORT_REGISTRY = REGISTRY

let tip = 10
let upstream: Server
let upstreamUrl = ""
let relay: RpcRelay | undefined

const resultOf = (method: string): unknown =>
	method === "aztec_getChainTips" ? { proposed: { number: tip } } : method === "aztec_getBlockNumber" ? tip : `${method}:ok`

beforeAll(async () => {
	upstream = createServer(async (req, res) => {
		let body = ""
		for await (const chunk of req) body += String(chunk)
		const parsed = JSON.parse(body) as { id: unknown; method: string } | { id: unknown; method: string }[]
		const answer = (e: { id: unknown; method: string }) => ({ jsonrpc: "2.0", id: e.id, result: resultOf(e.method) })
		res.writeHead(200, { "content-type": "application/json" }).end(
			JSON.stringify(Array.isArray(parsed) ? parsed.map(answer) : answer(parsed)),
		)
	})
	await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve))
	upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
})

afterEach(async () => {
	await relay?.close()
	relay = undefined
	tip = 10
})

afterAll(async () => {
	await new Promise<void>((resolve) => upstream.close(() => resolve()))
	rmSync(ROOT, { recursive: true, force: true })
})

async function start(): Promise<RpcRelay> {
	relay = await startRpcRelay(upstreamUrl)
	return relay
}

/** One batch of `methods` through the relay. */
async function rpc(target: RpcRelay, methods: string[], params: unknown[] = [], timeoutMs = 2_000) {
	const body = JSON.stringify(methods.map((m, id) => ({ jsonrpc: "2.0", id, method: `aztec_${m}`, params })))
	const res = await fetch(target.url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body,
		signal: AbortSignal.timeout(timeoutMs),
	})
	return { status: res.status, text: await res.text() }
}

const results = (text: string) => (JSON.parse(text) as { result: unknown }[]).map((r) => r.result)
const claimed = (target: RpcRelay) => readFileSync(REGISTRY, "utf8").includes(`| ${new URL(target.url).port} |`)

test("forwards a batch unchanged and counts requests, methods and the bodies carrying a text", async () => {
	const r = await start()
	const answer = await rpc(r, ["getNodeInfo", "getTxReceipt"], ["0xABCdef"])
	expect(answer.status).toBe(200)
	expect(results(answer.text)).toEqual(["aztec_getNodeInfo:ok", "aztec_getTxReceipt:ok"])
	expect(r.requests()).toBe(1)
	expect(r.methods()).toEqual(["aztec_getNodeInfo", "aztec_getTxReceipt"])
	expect(r.carried("0xabcDEF")).toBe(1)
	expect(r.carried("0x123")).toBe(0)
	expect(claimed(r)).toBe(true)
})

test("kill resets every connection and refuses until restore, on the same port and claim; close releases it", async () => {
	const r = await start()
	await rpc(r, ["getNodeInfo"])
	await r.kill()
	await expect(rpc(r, ["getNodeInfo"])).rejects.toThrow()
	expect(claimed(r)).toBe(true)
	await r.restore()
	expect((await rpc(r, ["getNodeInfo"])).status).toBe(200)
	await r.close()
	expect(claimed(r)).toBe(false)
})

test("a blackhole holds a request unanswered until the client gives up; a delay answers late", async () => {
	const r = await start()
	r.fail({ fault: { kind: "blackhole" } })
	await expect(rpc(r, ["getNodeInfo"], [], 300)).rejects.toThrow(/timed out/)
	r.clear()
	r.fail({ fault: { kind: "delay", ms: 300 } })
	const started = Date.now()
	expect((await rpc(r, ["getNodeInfo"])).status).toBe(200)
	expect(Date.now() - started).toBeGreaterThanOrEqual(290)
})

test.each(Object.entries(RELAY_REPLIES))("answers %s with its status and body", async (_name, fault) => {
	const r = await start()
	r.fail({ fault })
	expect(await rpc(r, ["getNodeInfo"])).toEqual({ status: fault.status, text: fault.body })
})

test("a rule on chosen methods takes only requests calling one, as many times as asked", async () => {
	const r = await start()
	r.fail({ methods: ["getBlock"], times: 1, fault: RELAY_REPLIES.refused })
	expect((await rpc(r, ["getNodeInfo"])).status).toBe(200)
	expect((await rpc(r, ["getChainTips", "getBlock"])).status).toBe(400)
	expect((await rpc(r, ["getBlock"])).status).toBe(200)
})

test("a rule lets its first `after` matches through, takes only batches made wholly of its methods with `every`, and counts what it took", async () => {
	const r = await start()
	const taken = r.fail({ methods: ["getBlock", "getContract"], entries: "every", after: 1, times: 2, fault: RELAY_REPLIES.refused })
	expect((await rpc(r, ["getBlock"])).status).toBe(200)
	expect((await rpc(r, ["getChainTips", "getBlock"])).status).toBe(200)
	expect((await rpc(r, ["getBlock", "getContract"])).status).toBe(400)
	expect((await rpc(r, ["getContract"])).status).toBe(400)
	expect((await rpc(r, ["getBlock"])).status).toBe(200)
	expect(taken.taken()).toBe(2)
	expect(taken.took().map((t) => JSON.parse(t.body).map((e: { method: string }) => e.method))).toEqual([
		["aztec_getblock", "aztec_getcontract"],
		["aztec_getcontract"],
	])
})

test("a batch cap refuses a larger batch and forwards one within it", async () => {
	const r = await start()
	r.cap(2)
	expect((await rpc(r, ["getNodeInfo", "getChainTips", "getBlockNumber"])).status).toBe(400)
	expect((await rpc(r, ["getNodeInfo", "getChainTips"])).status).toBe(200)
})

test("a frozen tip answers getChainTips and getBlockNumber with the values captured at the freeze", async () => {
	const r = await start()
	await r.freeze()
	tip = 12
	expect(results((await rpc(r, ["getChainTips", "getBlockNumber", "getNodeInfo"])).text)).toEqual([
		{ proposed: { number: 10 } },
		10,
		"aztec_getNodeInfo:ok",
	])
	r.unfreeze()
	expect(results((await rpc(r, ["getChainTips", "getBlockNumber"])).text)).toEqual([{ proposed: { number: 12 } }, 12])
})

test("a kill armed on a method fires on the first request calling it, and the relay stays down until restore", async () => {
	const r = await start()
	r.fail({ methods: ["getPublicStorageAt"], times: 1, fault: { kind: "kill" } })
	expect((await rpc(r, ["getNodeInfo"])).status).toBe(200)
	await expect(rpc(r, ["getPublicStorageAt"])).rejects.toThrow()
	await expect(rpc(r, ["getNodeInfo"])).rejects.toThrow()
	await r.restore()
	expect((await rpc(r, ["getPublicStorageAt"])).status).toBe(200)
})

test("a hold parks only the requests carrying its text until release, and stops counting a client that gave up", async () => {
	const r = await start()
	r.fail({ carrying: "0xABC", fault: { kind: "hold" } })
	expect((await rpc(r, ["getTxReceipt"], ["0x123"])).status).toBe(200)
	const waiting = rpc(r, ["getTxReceipt"], ["0xabc"], 5_000)
	await expect(rpc(r, ["getTxReceipt"], ["0xabc"], 300)).rejects.toThrow(/timed out/)
	await expect.poll(() => r.held()).toBe(1)
	await r.release()
	expect(results((await waiting).text)).toEqual(["aztec_getTxReceipt:ok"])
	expect(r.held()).toBe(0)
	expect(r.received()).toHaveLength(3)
	const [first, second, third] = r.received().map((request) => request.seq)
	expect((first as number) < (second as number) && (second as number) < (third as number)).toBe(true)
	const answered = rpc(r, ["getTxReceipt"], ["0xabc"])
	await expect.poll(() => r.held()).toBe(1)
	await r.release(RELAY_REPLIES.overloaded)
	expect(await answered).toEqual({ status: 429, text: RELAY_REPLIES.overloaded.body })
})
