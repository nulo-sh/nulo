/**
 * Public storage slots of a bundled class's `symbol` and `decimals`, which its getters return
 * verbatim. A class id hashes the bytecode the slots are compiled into, so an entry cannot go stale;
 * `token-list-pins.test.ts` in the extension pins them to the bundled artifact's `storageLayout`.
 */
export type TokenMetadataSlots = { symbol: number; decimals: number }

export const TOKEN_METADATA_SLOTS: Readonly<Record<string, TokenMetadataSlots>> = {
	// aztec-standards Token, 6.0.0-rc.3.
	"0x163b2b247391083157f9fc30405e81810e6c08c58501fa2dd10de27d42be1d8a": { symbol: 3, decimals: 5 },
}

/**
 * Token contract classes the wallet bundles an artifact for, keyed off their slots so none lacks
 * them. A listed entry with any other class is skipped, since the wallet never fetches an artifact.
 * `token-list-pins.test.ts` in the extension pins this set to `getBundledTokenClassId()`.
 */
export const BUNDLED_TOKEN_CLASS_IDS: readonly string[] = Object.keys(TOKEN_METADATA_SLOTS)
