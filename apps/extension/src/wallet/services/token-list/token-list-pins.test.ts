// @vitest-environment node
// Node, not jsdom: bb.js poseidon2 throws std::bad_cast under jsdom.
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { getBundledTokenClassId } from "@nulo/aztec-runtime/pxe/public-events"
import { BN254_FR_MODULUS, BUNDLED_TOKEN_CLASS_IDS, PRICE_IDS } from "@nulo/token-list"
import { describe, expect, test } from "vitest"
import { allCoingeckoIds, getSanityBand, proxyTickerFor } from "@/wallet/services/price/price-map"

// `@nulo/token-list` stays free of Aztec packages so its signer runs without `node_modules`; these
// pins tie its copies of Aztec-derived values to the packages the wallet actually runs.
describe("token-list pins", () => {
	// Red means the bundled Token artifact moved: a list entry for the old class would be skipped.
	test("the list's bundled classes are the class the wallet bundles", async () => {
		expect([...BUNDLED_TOKEN_CLASS_IDS]).toEqual([(await getBundledTokenClassId()).toString()])
	})

	test("the list's field modulus is the BN254 scalar modulus", () => {
		expect(BN254_FR_MODULUS).toBe(Fr.MODULUS)
	})

	test("the price map prices every id from the list's table, with its band and ticker", () => {
		for (const id of allCoingeckoIds()) expect(Object.keys(PRICE_IDS)).toContain(id)
		for (const [id, { sanity, ticker }] of Object.entries(PRICE_IDS)) {
			expect(getSanityBand(id)).toEqual(sanity)
			expect(proxyTickerFor(id)).toBe(ticker)
		}
	})
})
