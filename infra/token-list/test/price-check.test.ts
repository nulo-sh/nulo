import type { PriceFeeds } from "@nulo/token-list"
import { describe, expect, test } from "vitest"
import { type PriceCheckIO, priceCheck } from "../scripts/price-check"

const FEEDS: PriceFeeds = {
	"usd-coin": { min: 0.2, max: 5, ticker: "USDC" },
	weth: { min: 100, max: 50_000, ticker: "WETH" },
}

type Call = { url: string; init: RequestInit | undefined }

/** A CoinGecko that answers `reply` (a body, a `Response`, or an error to reject `fetch` with). */
function coingecko(reply: unknown) {
	const calls: Call[] = []
	const io: PriceCheckIO = {
		fetch: (async (url: string, init?: RequestInit) => {
			calls.push({ url, init })
			if (reply instanceof Error) throw reply
			if (reply instanceof Response) return reply
			return Response.json(reply)
		}) as typeof fetch,
	}
	return { io, calls }
}

const resultRows = (text: string) =>
	text
		.split("\n")
		.filter((line) => line.startsWith("| ") && !line.startsWith("| price id"))
		.map((line) => line.split(" | ").at(-1)?.replace(/ \|$/, ""))

describe("priceCheck: one keyless request, a row per feed", () => {
	test("a quote inside every band passes; the request is escaped, keyless and refuses redirects", async () => {
		const { io, calls } = coingecko({ "usd-coin": { usd: 1.0001 }, weth: { usd: 3012.5 } })
		const { text, ok } = await priceCheck(FEEDS, io)
		expect(ok).toBe(true)
		expect(text).toContain("| usd\\-coin | $0.2 to $5 | inside |")
		expect(resultRows(text)).toEqual(["inside", "inside"])
		expect(calls).toHaveLength(1)
		expect(calls[0].url).toBe("https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,weth&vs_currencies=usd")
		expect(calls[0].init?.redirect).toBe("error")
		expect(calls[0].init?.headers).toBeUndefined()
	})

	test("a quote outside its band, an id CoinGecko does not know and a malformed quote each fail their own row", async () => {
		const feeds = { ...FEEDS, "not-a-coin": { min: 1, max: 2, ticker: "NAC" }, tether: { min: 0.2, max: 5, ticker: "USDT" } }
		const { io } = coingecko({ "usd-coin": { usd: 7 }, weth: { usd: 3012.5 }, tether: { usd: "1" } })
		const { text, ok } = await priceCheck(feeds, io)
		expect(ok).toBe(false)
		expect(resultRows(text)).toEqual(["outside the band ($7)", "inside", "unknown to CoinGecko", "not checked: unexpected reply"])
	})

	test("a reply over the byte cap is not read, whether it declares its length or streams past it", async () => {
		const big = "x".repeat(16 * 1024 + 1)
		const declared = new Response("{}", { headers: { "content-length": String(big.length) } })
		for (const reply of [declared, new Response(big)]) {
			const { text, ok } = await priceCheck(FEEDS, coingecko(reply).io)
			expect(ok).toBe(false)
			expect(resultRows(text)).toEqual(["not checked: reply too large", "not checked: reply too large"])
		}
	})

	test("no answer within the timeout, a refused redirect and an HTTP error leave every row not checked", async () => {
		const stalled: PriceCheckIO = {
			timeoutMs: 20,
			fetch: ((_url: string, init?: RequestInit) =>
				new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as typeof fetch,
		}
		const cases: [PriceCheckIO, string][] = [
			[stalled, "no answer"],
			[coingecko(new TypeError("fetch failed: redirect mode is set to error")).io, "no answer"],
			[coingecko(new Response("rate limited", { status: 429 })).io, "HTTP 429"],
			[coingecko(new Response("<html>")).io, "unexpected reply"],
		]
		for (const [io, category] of cases) {
			const { text, ok } = await priceCheck(FEEDS, io)
			expect(ok).toBe(false)
			expect(resultRows(text)).toEqual([`not checked: ${category}`, `not checked: ${category}`])
			expect(text).toContain("so `not checked` proves nothing")
		}
	})

	test("no feed sends no request and passes", async () => {
		const { io, calls } = coingecko({})
		expect(await priceCheck({}, io)).toEqual({
			text: "## Price feeds against CoinGecko (advisory)\n\nThe source names no price feed.\n",
			ok: true,
		})
		expect(calls).toHaveLength(0)
	})
})
