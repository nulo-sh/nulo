// @vitest-environment node
// Node, not jsdom: bb.js poseidon2 throws std::bad_cast under jsdom.
import { loadContractArtifact } from "@aztec-labs/stdlib/abi"
import { getContractClassFromArtifact } from "@aztec-labs/stdlib/contract"
import { BUNDLED_TOKEN_CLASS_IDS } from "@nulo/token-list"
// @ts-expect-error — raw JSON import via vite alias
import WonderlandTokenJson from "@wonderland-token-artifact"
import { describe, expect, test } from "vitest"
import { TEST_LIST_ENTRIES } from "@/wallet/services/token-list/list.fixture"
import { seedsFromList } from "./default-tokens"

describe("default-token seeds", () => {
	// Red means an `@aztec-foundation/aztec-standards` move shifted the Token class: the live
	// tokens keep the class they were deployed with, so the wallet would skip every list entry.
	// Hold the pin (aztec-update skill); the entries' class is what the chain serves.
	test("the list admits only the aztec-standards Token class the wallet bundles", async () => {
		const bundled = (await getContractClassFromArtifact(loadContractArtifact(WonderlandTokenJson))).id.toString()
		expect([...BUNDLED_TOKEN_CLASS_IDS]).toEqual([bundled])
	})

	test("a list entry becomes a seed pinned to its class, symbol and decimals", () => {
		expect(seedsFromList(undefined)).toEqual([])
		expect(seedsFromList({ sequence: 1, keyId: "k", entries: TEST_LIST_ENTRIES.slice(0, 1) })).toEqual([
			{
				chainId: TEST_LIST_ENTRIES[0].chainId,
				contract: TEST_LIST_ENTRIES[0].address,
				expectedClassId: BUNDLED_TOKEN_CLASS_IDS[0],
				expectedSymbol: "USDC",
				expectedDecimals: 6,
				displayName: "Test USDC",
			},
		])
	})
})
