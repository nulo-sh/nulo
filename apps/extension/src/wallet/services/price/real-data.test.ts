/**
 * Real-data integration test against the live CoinGecko API. Local
 * diagnostic only (NOT a CI gate — shared-IP rate limits make it flaky
 * there): run with `COINGECKO_REAL_TESTS=1 bun run test src/wallet/services/price`.
 *
 * Verifies the two load-bearing external assumptions:
 * - the endpoint answers with no redirect, which the wallet refuses, and Fee Juice's id and the
 *   fixture list's feed ids exist and resolve to quotes inside their bands;
 * - the keyless endpoint answers with permissive CORS (the manifest ships
 *   NO CoinGecko host_permission — the fetch relies on `ACAO: *`).
 */

import { describe, expect, test } from "vitest"
import { TEST_PRICE_FEEDS } from "@/wallet/services/token-list/list.fixture"
import { inBand, priceIdsOf, priceTableOf } from "./price-map"
import { priceRequestUrl } from "./service"

describe.skipIf(!process.env.COINGECKO_REAL_TESTS)("CoinGecko live API", () => {
	test("all mapped ids resolve to in-band quotes with last_updated_at", async () => {
		const table = priceTableOf(TEST_PRICE_FEEDS)
		const ids = priceIdsOf(table)
		const response = await fetch(priceRequestUrl(ids), { redirect: "error" })
		expect(response.ok).toBe(true)

		const body = (await response.json()) as Record<string, { usd?: number; last_updated_at?: number }>
		for (const id of ids) {
			const row = body[id]
			expect(row, `id "${id}" missing from response — delisted or renamed?`).toBeDefined()
			expect(typeof row.usd).toBe("number")
			expect(inBand(row.usd as number, table[id]), `id "${id}" outside its band`).toBe(true)
			expect(typeof row.last_updated_at).toBe("number")
		}
	}, 20_000)

	test("keyless endpoint serves permissive CORS (no host_permission needed)", async () => {
		const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd")
		expect(response.ok).toBe(true)
		expect(response.headers.get("access-control-allow-origin")).toBe("*")
	}, 20_000)
})
