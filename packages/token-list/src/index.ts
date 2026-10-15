import { type PinnedKey, verifyEnvelope } from "./envelope"
import { PINNED_KEYS } from "./keys"
import { parsePayload, selectEntries, type TokenListEntry, type TokenListPair } from "./parse"

export { BUNDLED_TOKEN_CLASS_IDS } from "./class-ids"
export {
	ENVELOPE_FORMAT,
	EnvelopeError,
	type EnvelopeRefusal,
	MAX_ENVELOPE_BYTES,
	PAYLOAD_FORMAT,
	type PinnedKey,
	verifyEnvelope,
} from "./envelope"
export { PINNED_KEYS, PLACEHOLDER_PUBLIC_KEY } from "./keys"
export {
	BN254_FR_MODULUS,
	isFieldHex,
	MAX_ENTRIES_PER_CHAIN,
	PayloadError,
	parsePayload,
	selectEntries,
	type TokenListEntry,
	type TokenListPair,
	type TokenListPayload,
} from "./parse"
export { isPriceId, PRICE_IDS, type PriceId } from "./price-ids"

export type VerifiedTokenList = {
	keyId: string
	sequence: number
	issuedAt: string
	entries: TokenListEntry[]
	/** Every flagged pair, of any class: a flag warns about a token whoever added it. */
	flagged: TokenListPair[]
}

/**
 * Verifies an envelope's signature, then parses its payload, then keeps the entries the wallet acts
 * on. Throws `EnvelopeError` or `PayloadError`; a caller keeps its previous list on either.
 */
export async function readTokenList(text: string, keys: readonly PinnedKey[] = PINNED_KEYS): Promise<VerifiedTokenList> {
	const { keyId, payload } = await verifyEnvelope(text, keys)
	const parsed = parsePayload(payload, "wallet")
	return { keyId, sequence: parsed.sequence, issuedAt: parsed.issuedAt, entries: selectEntries(parsed.tokens), flagged: parsed.flagged }
}
