/**
 * The `prepare` job's advisory check of each source price feed against CoinGecko: one keyless request
 * for every feed's USD quote, and a row saying whether it sits inside the band the source names.
 * `inside` means only that today's quote falls in the band, not that the id names the token. Only
 * shape-checked numbers, strictly parsed ids and fixed failure categories reach stdout or stderr.
 *
 *   bun infra/token-list/scripts/price-check.ts   (exits 0 only when every feed is inside its band)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { PriceFeed, PriceFeeds } from "@nulo/token-list"
import { checkSource } from "@nulo/token-list/parse"
import { HOST_ROOT, SOURCE } from "./check"
import { cell } from "./summary"

const ENDPOINT = "https://api.coingecko.com/api/v3/simple/price"
const REQUEST_MS = 10_000
/** 32 feeds of at most 64-character ids answer in about 3 KiB. */
const MAX_BODY_BYTES = 16 * 1024

const HEADING = "## Price feeds against CoinGecko (advisory)"

export type PriceCheckIO = { fetch: typeof fetch; timeoutMs?: number }

class Unchecked extends Error {
	constructor(readonly category: string) {
		super(category)
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** Each id escaped on its own, so no source id can add a query parameter. */
export function priceCheckUrl(ids: readonly string[]): string {
	return `${ENDPOINT}?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=usd`
}

async function readCapped(res: Response): Promise<string> {
	if (Number(res.headers.get("content-length")) > MAX_BODY_BYTES) {
		res.body?.cancel().catch(() => {})
		throw new Unchecked("reply too large")
	}
	const reader = res.body?.getReader()
	if (!reader) return ""
	const chunks: Uint8Array[] = []
	let size = 0
	for (let read = await reader.read(); !read.done; read = await reader.read()) {
		size += read.value.byteLength
		if (size > MAX_BODY_BYTES) {
			reader.cancel().catch(() => {})
			throw new Unchecked("reply too large")
		}
		chunks.push(read.value)
	}
	const bytes = new Uint8Array(size)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.byteLength
	}
	return new TextDecoder().decode(bytes)
}

async function fetchQuotes(ids: readonly string[], io: PriceCheckIO): Promise<Record<string, unknown>> {
	const signal = AbortSignal.timeout(io.timeoutMs ?? REQUEST_MS)
	let text: string
	try {
		const res = await io.fetch(priceCheckUrl(ids), { redirect: "error", signal })
		if (!res.ok) throw new Unchecked(`HTTP ${res.status}`)
		text = await readCapped(res)
	} catch (error) {
		if (error instanceof Unchecked) throw error
		throw new Unchecked("no answer")
	}
	let body: unknown
	try {
		body = JSON.parse(text)
	} catch {
		throw new Unchecked("unexpected reply")
	}
	if (!isRecord(body)) throw new Unchecked("unexpected reply")
	return body
}

function resultOf(id: string, feed: PriceFeed, quotes: Record<string, unknown>): string {
	if (!Object.hasOwn(quotes, id)) return "unknown to CoinGecko"
	const quote = quotes[id]
	const usd = isRecord(quote) ? quote.usd : undefined
	if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return "not checked: unexpected reply"
	return usd >= feed.min && usd <= feed.max ? "inside" : `outside the band ($${usd})`
}

/** One row per feed, whatever CoinGecko answers; `ok` only when every feed is inside its band. */
export async function priceCheck(feeds: PriceFeeds, io: PriceCheckIO): Promise<{ text: string; ok: boolean }> {
	const entries = Object.entries(feeds)
	if (entries.length === 0) return { text: `${HEADING}\n\nThe source names no price feed.\n`, ok: true }
	let results: string[]
	try {
		const quotes = await fetchQuotes(
			entries.map(([id]) => id),
			io,
		)
		results = entries.map(([id, feed]) => resultOf(id, feed, quotes))
	} catch (error) {
		if (!(error instanceof Unchecked)) throw error
		results = entries.map(() => `not checked: ${error.category}`)
	}
	const rows = entries.map(([id, feed], i) => `| ${cell(id)} | $${feed.min} to $${feed.max} | ${results[i]} |`)
	const text = [
		HEADING,
		"",
		"`inside` means CoinGecko's quote sits in the band today, not that the id names the token. The request is keyless and a shared runner is often rate-limited, so `not checked` proves nothing.",
		"",
		"| price id | band | result |",
		"|---|---|---|",
		...rows,
		"",
	].join("\n")
	return { text, ok: results.every((result) => result === "inside") }
}

if (import.meta.main) {
	try {
		const { priceFeeds = {} } = checkSource(JSON.parse(readFileSync(join(HOST_ROOT, SOURCE), "utf8")))
		const { text, ok } = await priceCheck(priceFeeds, { fetch })
		process.stdout.write(text)
		process.exitCode = ok ? 0 : 1
	} catch {
		console.error("price check: stopped before its table; nothing was checked")
		process.exitCode = 1
	}
}
