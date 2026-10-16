import { spawn } from "node:child_process"
import { createServer, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { BUNDLED_TOKEN_CLASS_IDS, TOKEN_METADATA_SLOTS, type TokenListEntry } from "@nulo/token-list"
import { describe, expect, test } from "vitest"
import { type LiveCheckIO, liveCheck } from "../scripts/live-check"
import { REPO_ROOT } from "../scripts/summary"

// Wire shapes as `https://aztec-testnet.drpc.org` sends them (6.0.0-rc.3): chain 3415328944.
const NODE_INFO = { nodeVersion: "6.0.0-rc.3", l1ChainId: 11155111, rollupVersion: 3409706519, enr: "enr:-NK4QCUw" }
const CHAIN = 3415328944
const BLOCK = 4926
const CLASS = BUNDLED_TOKEN_CLASS_IDS[0]
const OTHER_CLASS = `0x${"2".repeat(64)}`
const SLOTS = TOKEN_METADATA_SLOTS[CLASS]

const hex = (n: number | bigint) => `0x${n.toString(16).padStart(64, "0")}`
/** A CompressedString field: the bytes big-endian after a zero top byte, zero-padded. */
const textField = (bytes: Uint8Array) => `0x00${Buffer.from(bytes).toString("hex")}`.padEnd(66, "0")
const symbolField = (symbol: string) => textField(new TextEncoder().encode(symbol))
const token = (n: number, over: Partial<TokenListEntry> = {}): TokenListEntry => ({
	chainId: CHAIN,
	address: hex(n),
	classId: CLASS,
	symbol: "USDC",
	decimals: 6,
	name: "Test USDC",
	...over,
})

type Call = { method: string; params: unknown[] }
/** What a node answers: a JSON-RPC body, a `Response`, or an error to reject `fetch` with. */
type Answer = (call: Call) => unknown

const result = (value: unknown) => ({ jsonrpc: "2.0", id: 1, result: value })
const ERROR_REPLY = { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "method is not available" } }

/** A node holding `deployed` (with `symbolOf` overriding a stored symbol field), unless `answer` answers first. */
function node(
	deployed: readonly TokenListEntry[],
	answer: Answer = () => undefined,
	symbolOf: (t: TokenListEntry) => string = (t) => symbolField(t.symbol),
) {
	const calls: Call[] = []
	const reply = (call: Call): unknown => {
		const at = (address: unknown) => deployed.find((t) => t.address === address)
		switch (call.method) {
			case "aztec_getNodeInfo":
				return result(NODE_INFO)
			case "aztec_getBlockNumber":
				return result(BLOCK)
			case "aztec_getContract": {
				const t = at(call.params[0])
				if (!t) return result(null)
				return result({ version: 2, address: t.address, currentContractClassId: t.classId, originalContractClassId: t.classId })
			}
			case "aztec_getPublicStorageAt": {
				const t = at(call.params[1])
				if (!t) return result(hex(0))
				return result(call.params[2] === hex(SLOTS.symbol) ? symbolOf(t) : hex(t.decimals))
			}
		}
		return ERROR_REPLY
	}
	const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
		const { method, params } = JSON.parse(String(init?.body)) as Call
		calls.push({ method, params })
		const answered = answer({ method, params }) ?? reply({ method, params })
		if (answered instanceof Error) throw answered
		return answered instanceof Response ? answered : Response.json(answered)
	}) as typeof fetch
	return { calls, reply, io: { fetch: fake, deadline: new AbortController().signal } satisfies LiveCheckIO }
}

/** A node on an OS-assigned local port, answering each JSON-RPC call with `answer`. */
async function serve(answer: (call: Call, res: ServerResponse, path: string) => void) {
	const server = createServer((req, res) => {
		let body = ""
		req.on("data", (chunk) => {
			body += chunk
		})
		req.on("end", () => answer(JSON.parse(body) as Call, res, req.url ?? ""))
	})
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const close = () => {
		server.closeAllConnections()
		server.close()
	}
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close }
}

const URL_A = "https://node.example"

async function rows(list: readonly TokenListEntry[], n: { io: LiveCheckIO }) {
	const { text, ok } = await liveCheck(list, [URL_A], n.io)
	const table = text.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| chainId"))
	return { text, ok, results: table.map((line) => line.split(" | ").at(-1)?.replace(/ \|$/, "")) }
}

describe("the live check", () => {
	test("every entry the node holds as listed matches, read at one block", async () => {
		const list = [token(1), token(2, { symbol: "GBPC" })]
		const n = node(list)
		const { text, ok, results } = await rows(list, n)
		expect(results).toEqual(["matches", "matches"])
		expect(ok).toBe(true)
		expect(text).toContain(
			"- https\\:\\/\\/node\\.example: l1ChainId 11155111, rollupVersion 3409706519, version 6.0.0-rc.3, block 4926: chain 3415328944",
		)
		const reads = n.calls.filter((c) => c.method === "aztec_getContract" || c.method === "aztec_getPublicStorageAt")
		expect(reads.map((c) => (c.method === "aztec_getContract" ? c.params[1] : c.params[0]))).toEqual(Array(6).fill(BLOCK))
	})

	test.each<[string, TokenListEntry[], Answer, string]>([
		["not deployed", [], () => undefined, "differs: not deployed"],
		[
			"another contract",
			[token(1)],
			(c) => (c.method === "aztec_getContract" ? result({ address: hex(9), currentContractClassId: CLASS }) : undefined),
			`differs: the node answered for \`${hex(9)}\``,
		],
		["class", [token(1, { classId: OTHER_CLASS })], () => undefined, `differs: class \`${OTHER_CLASS}\`, list \`${CLASS}\``],
		["symbol", [token(1, { symbol: "USDT" })], () => undefined, "differs: symbol USDT, list USDC"],
		["decimals", [token(1, { decimals: 18 })], () => undefined, "differs: decimals 18, list 6"],
	])("reports a difference: %s", async (_name, deployed, answer, expected) => {
		const n = node(deployed, answer)
		const { ok, results } = await rows([token(1)], n)
		expect(results).toEqual([expected])
		expect(ok).toBe(false)
		if (deployed[0]?.classId === OTHER_CLASS) expect(n.calls.map((c) => c.method)).not.toContain("aztec_getPublicStorageAt")
	})

	test("a source with no token checks nothing, so it does not pass", async () => {
		const { text, ok } = await liveCheck([], [URL_A], node([]).io)
		expect(text).toContain("The source lists no token.")
		expect(ok).toBe(false)
	})

	test("an entry on a chain no node serves stays a row, beside one that matches", async () => {
		const list = [token(1), token(2, { chainId: 1 })]
		const { ok, results } = await rows(list, node(list))
		expect(results).toEqual(["matches", "not checked: no node read for chain 1"])
		expect(ok).toBe(false)
	})

	test("a node whose info fails checks nothing, and every row says so", async () => {
		const list = [token(1), token(2)]
		const n = node(list, (c) => (c.method === "aztec_getNodeInfo" ? ERROR_REPLY : undefined))
		const { text, ok, results } = await rows(list, n)
		expect(results).toEqual(Array(2).fill(`not checked: no node read for chain ${CHAIN}`))
		expect(text).toContain("- https\\:\\/\\/node\\.example: not checked: error reply")
		expect(n.calls).toHaveLength(1)
		expect(ok).toBe(false)
	})

	test.each<[string, unknown, string]>([
		["an error reply", ERROR_REPLY, "not checked: error reply"],
		["an HTTP failure", new Response("rate limited", { status: 429 }), "not checked: HTTP 429"],
		["a body that is not JSON", new Response("<html>"), "not checked: unexpected reply"],
		[
			"an instance outside its shape",
			result({ address: hex(1).toUpperCase(), currentContractClassId: CLASS }),
			"not checked: unexpected reply",
		],
	])("a failed read of one entry is not checked, and the next is still read: %s", async (_name, answer, expected) => {
		const list = [token(1), token(2)]
		const n = node(list, (c) => (c.method === "aztec_getContract" && c.params[0] === hex(1) ? answer : undefined))
		expect((await rows(list, n)).results).toEqual([expected, "matches"])
	})

	test("a storage read outside its shape is not checked", async () => {
		const n = node([token(1)], (c) => (c.method === "aztec_getPublicStorageAt" ? result(12) : undefined))
		expect((await rows([token(1)], n)).results).toEqual(["not checked: unexpected reply"])
	})

	test("a class with no known slots is not checked", async () => {
		const other = token(1, { classId: OTHER_CLASS })
		expect((await rows([other], node([other]))).results).toEqual(["not checked: no storage layout for the class"])
	})

	test("a transport failure ends the node's reads", async () => {
		const list = [token(1), token(2)]
		const n = node(list, (c) => (c.method === "aztec_getContract" ? new TypeError("fetch failed") : undefined))
		expect((await rows(list, n)).results).toEqual(["not checked: no answer", "not checked: no answer"])
		expect(n.calls.filter((c) => c.method === "aztec_getContract")).toHaveLength(1)
	})

	// Real `fetch` against a local node that never finishes a body, with a test timeout below the
	// 10 s request timeout: only the deadline reaching the request can end the read.
	test("the deadline ends a stalled read, and the rows it leaves unread say so", async () => {
		const list = [token(1), token(2), token(3)]
		const { origin, close } = await serve((call, res) => {
			if (call.method === "aztec_getContract" && call.params[0] === hex(2)) res.writeHead(200).write("{")
			else res.end(JSON.stringify(node(list).reply(call)))
		})
		try {
			const { text } = await liveCheck(list, [origin], { fetch, deadline: AbortSignal.timeout(300) })
			const results = text
				.split("\n")
				.filter((line) => line.startsWith(`| ${CHAIN}`))
				.map((line) => line.split(" | ").at(-1))
			expect(results).toEqual(["matches |", "not checked: time budget spent |", "not checked: time budget spent |"])
		} finally {
			close()
		}
	}, 3_000)

	test.each<[string, Uint8Array, string]>([
		["UTF-8", new TextEncoder().encode("€URC"), "€URC"],
		["an interior NUL", Uint8Array.of(0x55, 0x53, 0x00, 0x44, 0x43), "USDC"],
	])("decodes the symbol as the wallet does: %s", async (_name, bytes, listed) => {
		const entry = token(1, { symbol: listed })
		expect(
			(
				await rows(
					[entry],
					node([entry], undefined, () => textField(bytes)),
				)
			).results,
		).toEqual(["matches"])
	})

	test("shows a printable chain symbol escaped, and any other as its field", async () => {
		const printable = node([token(1)], undefined, () => symbolField("U|S`"))
		expect((await rows([token(1)], printable)).results).toEqual(["differs: symbol U\\|S\\`, list USDC"])
		const control = textField(Uint8Array.of(0x55, 0x07))
		expect(
			(
				await rows(
					[token(1)],
					node([token(1)], undefined, () => control),
				)
			).results,
		).toEqual([`differs: symbol \`${control}\`, list USDC`])
	})
})

describe("the live check script", () => {
	// A real process against a local node: what reaches stdout (the step summary) and stderr (which
	// the runner reads for workflow commands), and that no redirect is followed.
	test("prints no node text, follows no redirect, and exits 1 on a row it could not check", async () => {
		const HOSTILE = "6.0.0\n::error::forged\u202e"
		const paths: string[] = []
		const { origin, close } = await serve((_call, res, path) => {
			paths.push(path)
			if (path === "/moved") res.writeHead(302, { location: "/elsewhere" }).end()
			else
				res.writeHead(200, { "content-type": "application/json" }).end(
					JSON.stringify(result({ ...NODE_INFO, nodeVersion: HOSTILE })),
				)
		})
		try {
			const child = spawn(process.execPath, ["infra/token-list/scripts/live-check.ts", `${origin}/hostile`, `${origin}/moved`], {
				cwd: REPO_ROOT,
			})
			let stdout = ""
			let stderr = ""
			child.stdout.on("data", (chunk) => {
				stdout += chunk
			})
			child.stderr.on("data", (chunk) => {
				stderr += chunk
			})
			const code = await new Promise<number | null>((resolve) => child.on("close", resolve))
			expect(code).toBe(1)
			expect(stdout).toContain(": not checked: unexpected reply\n")
			expect(stdout).toContain(": not checked: no answer\n")
			expect(stdout).toContain(`| not checked: no node read for chain ${CHAIN} |`)
			for (const output of [stdout, stderr]) {
				expect(output).not.toContain("forged")
				expect(output).not.toContain("\u202e")
			}
			expect(paths).toEqual(["/hostile", "/moved"])
		} finally {
			close()
		}
	}, 30_000)
})
