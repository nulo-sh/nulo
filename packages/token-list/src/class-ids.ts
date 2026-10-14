/**
 * Token contract classes the wallet bundles an artifact for. A listed entry with any other class is
 * skipped, since the wallet never fetches an artifact. `token-list-pins.test.ts` in the extension
 * pins this set to `getBundledTokenClassId()`.
 */
export const BUNDLED_TOKEN_CLASS_IDS: readonly string[] = [
	// aztec-standards Token, 6.0.0-rc.1.
	"0x24c34002788720c941a327a20c369b12c8bdcff3b5a974673a8f618763471505",
]
