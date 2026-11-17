/**
 * Tests for the production note-schema map.
 *
 * Covers three areas, none on real bb.js:
 * 1. `canonicalSlotHex` normalization — pure logic.
 * 2. Storage-layout regression gates — read each bundled artifact's
 *    `storageLayout.<field>.slot` and assert it still matches the slot
 *    we hardcoded in `note-schemas.ts`. If a future aztec-packages bump
 *    moves a slot, this test fails loudly instead of the notes viewer
 *    silently falling back to raw-items rendering.
 * 3. The contract name each bundled class's notes carry, read from the real
 *    schema map. Its class ids go through `getContractClassFromArtifact`
 *    (Poseidon/bb.js), mocked here because real bb.js tends to fault under
 *    repeated unit-test calls.
 */
import { describe, expect, test, vi } from "vitest"
import { type ContractArtifact, loadContractArtifact } from "@aztec-labs/stdlib/abi"
import { NFTContractArtifact } from "@aztec-labs/noir-contracts.js/NFT"
import { TokenContractArtifact } from "@aztec-labs/noir-contracts.js/Token"
// @ts-expect-error — vite alias
import WonderlandTokenJson from "@wonderland-token-artifact"
// @ts-expect-error — vite alias
import PrivateFPCJson from "@private-fpc-artifact"
import { _resetNoteSchemasForTests, canonicalSlotHex, loadProductionNoteSchemas } from "@nulo/aztec-runtime/pxe"

/** An artifact's class id stand-in, from what tells the bundled artifacts apart: real bb.js faults here. */
const mockClassId = vi.hoisted(
	() => (artifact: { name: string; storageLayout: Record<string, unknown> }) =>
		`0xmock:${artifact.name}:${Object.keys(artifact.storageLayout).sort().join(",")}`,
)
vi.mock("@aztec-labs/stdlib/contract", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	getContractClassFromArtifact: async (artifact: ContractArtifact) => ({ id: { toString: () => mockClassId(artifact) } }),
}))

const slotOf = (artifact: { storageLayout: Record<string, { slot: { value?: bigint } | bigint }> }, field: string): bigint => {
	const slot = artifact.storageLayout[field].slot
	return BigInt((slot as { value?: bigint }).value ?? (slot as bigint))
}

describe("canonicalSlotHex", () => {
	test("strips leading zeros from a padded Fr-string", () => {
		expect(canonicalSlotHex("0x0000000000000000000000000000000000000000000000000000000000000003")).toBe("0x3")
		expect(canonicalSlotHex("0x0000000000000000000000000000000000000000000000000000000000000007")).toBe("0x7")
	})

	test("preserves a short hex unchanged in canonical form", () => {
		expect(canonicalSlotHex("0x3")).toBe("0x3")
		expect(canonicalSlotHex("0x7")).toBe("0x7")
	})

	test("normalizes a decimal Fr-string to lowercase hex", () => {
		expect(canonicalSlotHex("3")).toBe("0x3")
	})

	test("handles 2-digit hex slots without re-padding", () => {
		expect(canonicalSlotHex("0xff")).toBe("0xff")
	})
})

describe("note-schema storage-slot regression gates", () => {
	test("Aztec Token: balances at slot 0x3 (UintNote)", () => {
		expect(slotOf(TokenContractArtifact, "balances")).toBe(0x3n)
	})

	test("Aztec NFT: private_nfts at slot 0x7 (NFTNote)", () => {
		expect(slotOf(NFTContractArtifact, "private_nfts")).toBe(0x7n)
	})

	test("Token (AIP-20): private_balances at slot 0x7 (UintNote)", () => {
		const artifact = loadContractArtifact(WonderlandTokenJson)
		expect(slotOf(artifact, "private_balances")).toBe(0x7n)
	})

	test("PrivateFPC: balances at slot 0x1 (UintNote)", () => {
		const artifact = loadContractArtifact(PrivateFPCJson)
		expect(slotOf(artifact, "balances")).toBe(0x1n)
	})
})

describe("the production note-schema map", () => {
	test("a note of the aztec-standards Token class names its contract Token (AIP-20), apart from the other three", async () => {
		_resetNoteSchemasForTests()
		const schemas = await loadProductionNoteSchemas()
		expect(schemas.get(mockClassId(loadContractArtifact(WonderlandTokenJson)))?.get("0x7")).toEqual({
			noteName: "UintNote",
			contractName: "Token (AIP-20)",
			fields: [{ name: "value", type: "u128" }],
		})
		expect([...schemas.values()].flatMap((slots) => [...slots.values()].map((schema) => schema.contractName))).toEqual([
			"Aztec Token",
			"Aztec NFT",
			"Token (AIP-20)",
			"Private FPC",
		])
	})
})
