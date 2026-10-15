import { type PinnedKey, verifyEnvelope } from "./envelope"
import floor from "./floor.json"
import { PINNED_KEYS } from "./keys"
import { PayloadError, parsePayload, selectEntries, type TokenListEntry, type TokenListPair } from "./parse"

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

/**
 * The sequence of the last list that delisted or flagged a token, as of this build: a list below it
 * could restore what that one removed. The publish PR of such a list raises it.
 */
export const SEQUENCE_FLOOR: number = floor.sequence

export type VerifiedTokenList = {
	keyId: string
	sequence: number
	issuedAt: string
	entries: TokenListEntry[]
	/** Every flagged pair, of any class: a flag warns about a token whoever added it. */
	flagged: TokenListPair[]
}

/**
 * Verifies the envelope before parsing a byte of its payload, and refuses a sequence below `floor`.
 * Throws `EnvelopeError` or `PayloadError`.
 */
export async function readTokenList(
	text: string,
	keys: readonly PinnedKey[] = PINNED_KEYS,
	floor: number = SEQUENCE_FLOOR,
): Promise<VerifiedTokenList> {
	const { keyId, payload } = await verifyEnvelope(text, keys)
	const parsed = parsePayload(payload, "wallet")
	if (parsed.sequence < floor) throw new PayloadError("payload.sequence")
	return { keyId, sequence: parsed.sequence, issuedAt: parsed.issuedAt, entries: selectEntries(parsed.tokens), flagged: parsed.flagged }
}
