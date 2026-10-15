/**
 * Token contract classes the wallet bundles an artifact for. A listed entry with any other class is
 * skipped, since the wallet never fetches an artifact. `token-list-pins.test.ts` in the extension
 * pins this set to `getBundledTokenClassId()`.
 */
export const BUNDLED_TOKEN_CLASS_IDS: readonly string[] = [
	// aztec-standards Token, 6.0.0-rc.3.
	"0x163b2b247391083157f9fc30405e81810e6c08c58501fa2dd10de27d42be1d8a",
]
