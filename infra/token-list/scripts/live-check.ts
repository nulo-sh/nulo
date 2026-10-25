/**
 * The `prepare` job's advisory check of each source entry against a public node for its chain, as the
 * wallet checks it before seeding. `matches` means only that the node agrees. Only shape-checked node
 * values and fixed failure categories reach stdout or stderr.
 *
 *   bun infra/token-list/scripts/live-check.ts <nodeUrl>...   (exits 0 only when there are rows and every one matches)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isFieldHex, TOKEN_METADATA_SLOTS, type TokenListEntry } from "@nulo/token-list"
import { checkSource } from "@nulo/token-list/parse"
import { HOST_ROOT, SOURCE } from "./check"
import { cell } from "./summary"

const REQUEST_MS = 10_000
const BUDGET_MS = 4 * 60_000
const MAX_UINT32 = 0xffff_ffff
const NODE_VERSION = /^[0-9A-Za-z.+-]{1,32}$/
const PRINTABLE_ASCII = /^[ -~]+$/
const UTF8 = new TextDecoder()

export type LiveCheckIO = { fetch: typeof fetch; deadline: AbortSignal }

/** A failed read as a fixed category; `ends` marks a transport failure, after which the node is not asked again. */
class NodeFault extends Error {
	constructor(
		readonly category: string,
		readonly ends = false,
	) {
		super(category)
	}
}

const unexpected = () => new NodeFault("unexpected reply")
const lostTransport = (io: LiveCheckIO) => new NodeFault(io.deadline.aborted ? "time budget spent" : "no answer", true)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const isUint32 = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_UINT32
const slotHex = (slot: number) => `0x${slot.toString(16).padStart(64, "0")}`

async function read(url: string, method: string, params: unknown[], io: LiveCheckIO): Promise<unknown> {
	if (io.deadline.aborted) throw lostTransport(io)
	let res: Response
	try {
		res = await io.fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
			redirect: "error",
			signal: AbortSignal.any([AbortSignal.timeout(REQUEST_MS), io.deadline]),
		})
	} catch {
		throw lostTransport(io)
	}
	if (!res.ok) throw new NodeFault(`HTTP ${res.status}`)
	let text: string
	try {
		text = await res.text()
	} catch {
		throw lostTransport(io)
	}
	let reply: unknown
	try {
		reply = JSON.parse(text)
	} catch {
		throw unexpected()
	}
	if (isRecord(reply) && "error" in reply) throw new NodeFault("error reply")
	if (!isRecord(reply) || !("result" in reply)) throw unexpected()
	return reply.result
}

type NodeIdentity = { chainId: number; block: number; line: string }

async function identify(url: string, io: LiveCheckIO): Promise<NodeIdentity> {
	const info = await read(url, "aztec_getNodeInfo", [], io)
	if (!isRecord(info) || !isUint32(info.l1ChainId) || !isUint32(info.rollupVersion)) throw unexpected()
	if (typeof info.nodeVersion !== "string" || !NODE_VERSION.test(info.nodeVersion)) throw unexpected()
	const block = await read(url, "aztec_getBlockNumber", [], io)
	if (!isUint32(block)) throw unexpected()
	// The wallet's chain id (`walletChainId` in `@nulo/wallet-core`), which the list keys entries by.
	const chainId = (info.l1ChainId ^ info.rollupVersion) >>> 0
	const line = `l1ChainId ${info.l1ChainId}, rollupVersion ${info.rollupVersion}, version ${info.nodeVersion}, block ${block}: chain ${chainId}`
	return { chainId, block, line }
}

async function readField(url: string, block: number, address: string, slot: number, io: LiveCheckIO): Promise<string> {
	const value = await read(url, "aztec_getPublicStorageAt", [block, address, slotHex(slot)], io)
	if (!isFieldHex(value)) throw unexpected()
	return value
}

/** The wallet's decoding of the symbol field: UTF-8, every NUL removed (invalid bytes may yield fewer U+FFFD). */
function decodeSymbol(field: string): string {
	const bytes = Uint8Array.from(field.slice(2).match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))
	return UTF8.decode(bytes).replaceAll("\u0000", "")
}

const shownSymbol = (symbol: string, field: string) => (PRINTABLE_ASCII.test(symbol) ? cell(symbol) : `\`${field}\``)

async function checkEntry(url: string, block: number, entry: TokenListEntry, io: LiveCheckIO): Promise<string> {
	const instance = await read(url, "aztec_getContract", [entry.address, block], io)
	if (instance === null) return "differs: not deployed"
	if (!isRecord(instance) || !isFieldHex(instance.address) || !isFieldHex(instance.currentContractClassId)) throw unexpected()
	if (instance.address !== entry.address) return `differs: the node answered for \`${instance.address}\``
	if (instance.currentContractClassId !== entry.classId)
		return `differs: class \`${instance.currentContractClassId}\`, list \`${entry.classId}\``
	const slots = TOKEN_METADATA_SLOTS[entry.classId]
	if (!slots) return "not checked: no storage layout for the class"
	const symbolField = await readField(url, block, entry.address, slots.symbol, io)
	const decimals = BigInt(await readField(url, block, entry.address, slots.decimals, io))
	const symbol = decodeSymbol(symbolField)
	const differences = [
		...(symbol === entry.symbol ? [] : [`symbol ${shownSymbol(symbol, symbolField)}, list ${cell(entry.symbol)}`]),
		...(decimals === BigInt(entry.decimals) ? [] : [`decimals ${decimals}, list ${entry.decimals}`]),
	]
	return differences.length === 0 ? "matches" : `differs: ${differences.join("; ")}`
}

const faultOf = (error: unknown): NodeFault => {
	if (error instanceof NodeFault) return error
	throw error
}

/** Fills the rows of the entries on this node's chain that no earlier node took; returns the node's line. */
async function checkNode(url: string, entries: readonly TokenListEntry[], results: (string | undefined)[], io: LiveCheckIO) {
	const origin = cell(new URL(url).origin)
	let node: NodeIdentity
	try {
		node = await identify(url, io)
	} catch (error) {
		return `- ${origin}: not checked: ${faultOf(error).category}`
	}
	let ended: string | undefined
	for (const [index, entry] of entries.entries()) {
		if (entry.chainId !== node.chainId || results[index] !== undefined) continue
		if (ended !== undefined) {
			results[index] = `not checked: ${ended}`
			continue
		}
		try {
			results[index] = await checkEntry(url, node.block, entry, io)
		} catch (error) {
			const fault = faultOf(error)
			results[index] = `not checked: ${fault.category}`
			if (fault.ends) ended = fault.category
		}
	}
	return `- ${origin}: ${node.line}`
}

/** One row per entry, whatever the nodes answer; `ok` only when there are rows and every one matches. */
export async function liveCheck(
	entries: readonly TokenListEntry[],
	urls: readonly string[],
	io: LiveCheckIO,
): Promise<{ text: string; ok: boolean }> {
	const results: (string | undefined)[] = entries.map(() => undefined)
	const nodes: string[] = []
	for (const url of urls) nodes.push(await checkNode(url, entries, results, io))
	const rows = entries.map((entry, index) => {
		const result = results[index] ?? `not checked: no node read for chain ${entry.chainId}`
		return { line: `| ${entry.chainId} | \`${entry.address}\` | ${cell(entry.symbol)} | ${result} |`, matches: result === "matches" }
	})
	const table =
		rows.length === 0
			? ["The source lists no token."]
			: ["| chainId | address | symbol | result |", "|---|---|---|---|", ...rows.map((r) => r.line)]
	const text = [
		"## Token list: live check (advisory)",
		"",
		"`matches` means the node agrees with the entry, not that the entry is right: the wallet checks every entry again on its own node before it seeds it.",
		"",
		...nodes,
		"",
		...table,
		"",
	].join("\n")
	return { text, ok: rows.length > 0 && rows.every((r) => r.matches) }
}

if (import.meta.main) {
	const SOURCE_FLAG = "--source="
	const args = process.argv.slice(2)
	const urls = args.filter((arg) => !arg.startsWith(SOURCE_FLAG))
	const source = args.find((arg) => arg.startsWith(SOURCE_FLAG))?.slice(SOURCE_FLAG.length) ?? join(HOST_ROOT, SOURCE)
	if (urls.length === 0) {
		console.error("usage: bun infra/token-list/scripts/live-check.ts [--source=<list.source.json>] <nodeUrl>...")
		process.exit(1)
	}
	try {
		const { tokens } = checkSource(JSON.parse(readFileSync(source, "utf8")))
		const { text, ok } = await liveCheck(tokens, urls, { fetch, deadline: AbortSignal.timeout(BUDGET_MS) })
		process.stdout.write(text)
		process.exitCode = ok ? 0 : 1
	} catch {
		console.error("live check: stopped before its table; nothing was checked")
		process.exitCode = 1
	}
}
