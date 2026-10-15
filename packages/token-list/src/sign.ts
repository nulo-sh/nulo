/**
 * Turns `list.source.json` into a signed envelope. The signer refuses every payload a wallet would
 * fail to verify or parse, so a published list never fails either for a reason the signer could
 * have caught. It never checks the compiled floor: its sequence is above the published one, which
 * the tree check holds at or above the floor.
 */

import { decodeBase64Url, importSeed, type PinnedKey, PAYLOAD_FORMAT, publicKeyOf, signEnvelope, verifyEnvelope } from "./envelope"
import { checkSource, parsePayload, type TokenListPayload } from "./parse"

export type SignInput = {
	sourceText: string
	/** The envelope currently served, if any. Its sequence is the floor. */
	publishedText?: string
	seedHex: string
	keyId: string
	nowMs: number
	keys: readonly PinnedKey[]
	/** The `listSha256` digest the approver was shown; signing refuses any other tokens or flags. */
	expectTokensSha256?: string
}

/** `tokensSha256` is the `listSha256` digest, under the output name `publish-token-list.yml` reads. */
export type SignResult = { envelopeText: string; sequence: number; payloadSha256: string; tokensSha256: string; tokenCount: number }

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
	return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** The digest of the tokens and the flags as the payload serializes them. `prepare` shows it; `sign` checks it. */
export function listSha256({ tokens, flagged }: Pick<TokenListPayload, "tokens" | "flagged">): Promise<string> {
	return sha256Hex(new TextEncoder().encode(JSON.stringify({ tokens, flagged })))
}

/** The sequence of the published envelope, read without verifying: it only sets a floor, and a key
 *  rotation can leave it signed by a key no longer pinned. Unreadable means stop. */
export function publishedSequence(text: string | undefined): number {
	if (text === undefined) return 0
	try {
		const envelope = JSON.parse(text) as { payload?: unknown }
		const payload = typeof envelope.payload === "string" ? decodeBase64Url(envelope.payload) : undefined
		const sequence = payload ? (JSON.parse(new TextDecoder().decode(payload)) as { sequence?: unknown }).sequence : undefined
		if (typeof sequence === "number" && Number.isSafeInteger(sequence) && sequence >= 1) return sequence
	} catch {}
	throw new Error("the published envelope is unreadable; fix the tree before signing")
}

async function signingKey(input: SignInput): Promise<CryptoKey> {
	const privateKey = await importSeed(input.seedHex)
	const pinned = input.keys.find((key) => key.keyId === input.keyId)
	if (!pinned || pinned.publicKey !== (await publicKeyOf(privateKey))) {
		throw new Error(`the signing key does not match the pinned key ${input.keyId}`)
	}
	return privateKey
}

export async function signList(input: SignInput): Promise<SignResult> {
	const { tokens, flagged = [] } = checkSource(JSON.parse(input.sourceText))
	const digest = await listSha256({ tokens, flagged })
	if (input.expectTokensSha256 !== undefined && input.expectTokensSha256 !== digest) {
		throw new Error("the tokens and flags differ from the ones the approver was shown")
	}
	const sequence = Math.floor(input.nowMs / 1000)
	if (sequence <= publishedSequence(input.publishedText)) {
		throw new Error("the signing clock is not above the published sequence")
	}
	const issuedAt = new Date(sequence * 1000).toISOString()
	const payload: TokenListPayload = { format: PAYLOAD_FORMAT, sequence, issuedAt, tokens, flagged }
	const bytes = new TextEncoder().encode(JSON.stringify(payload))
	parsePayload(bytes, "strict")
	const envelope = await signEnvelope(bytes, await signingKey(input), input.keyId)
	const envelopeText = `${JSON.stringify(envelope, null, "\t")}\n`
	const verified = await verifyEnvelope(envelopeText, input.keys)
	if (parsePayload(verified.payload, "strict").sequence !== sequence) throw new Error("self-verification failed")
	return { envelopeText, sequence, payloadSha256: await sha256Hex(bytes), tokensSha256: digest, tokenCount: tokens.length }
}
