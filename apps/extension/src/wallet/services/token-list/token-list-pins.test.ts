// @vitest-environment node
// Node, not jsdom: bb.js poseidon2 throws std::bad_cast under jsdom.
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { TokenContractArtifact } from "@aztec-foundation/aztec-standards/artifacts/src/artifacts/Token.js"
import { getBundledTokenClassId } from "@nulo/aztec-runtime/pxe/public-events"
import { BN254_FR_MODULUS, BUNDLED_TOKEN_CLASS_IDS, TOKEN_METADATA_SLOTS } from "@nulo/token-list"
import { describe, expect, test } from "vitest"

// `@nulo/token-list` stays free of Aztec packages so its signer runs without `node_modules`; these
// pins tie its copies of Aztec-derived values to the packages the wallet actually runs.
describe("token-list pins", () => {
	// Red means the bundled Token artifact moved: a list entry for the old class would be skipped.
	test("the list's bundled classes are the class the wallet bundles", async () => {
		expect([...BUNDLED_TOKEN_CLASS_IDS]).toEqual([(await getBundledTokenClassId()).toString()])
	})

	// Red means the publish job's live check would read another field's storage as the symbol or decimals.
	test("the list's metadata slots are the bundled artifact's storage layout", async () => {
		const { symbol, decimals } = TokenContractArtifact.storageLayout
		expect(TOKEN_METADATA_SLOTS[(await getBundledTokenClassId()).toString()]).toEqual({
			symbol: Number(symbol.slot.toBigInt()),
			decimals: Number(decimals.slot.toBigInt()),
		})
	})

	test("the list's field modulus is the BN254 scalar modulus", () => {
		expect(BN254_FR_MODULUS).toBe(Fr.MODULUS)
	})
})
