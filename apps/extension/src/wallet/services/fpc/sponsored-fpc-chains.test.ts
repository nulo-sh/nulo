import { describe, expect, test } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { offersSponsoredFpc } from "./sponsored-fpc-chains"

describe("offersSponsoredFpc", () => {
	test("Testnet and the local network offer the sponsor", () => {
		expect(offersSponsoredFpc(CHAIN_IDS.TESTNET)).toBe(true)
		expect(offersSponsoredFpc(CHAIN_IDS.SANDBOX)).toBe(true)
	})

	test("Alpha Mainnet and an unlisted chain do not", () => {
		expect(offersSponsoredFpc(CHAIN_IDS.MAINNET)).toBe(false)
		expect(offersSponsoredFpc(11155111)).toBe(false)
	})
})
