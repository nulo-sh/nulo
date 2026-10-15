import { describe, expect, test } from "vitest"
import {
	DOMAIN_PREFIX,
	decodeBase64Url,
	EnvelopeError,
	encodeBase64Url,
	MAX_ENVELOPE_BYTES,
	signEnvelope,
	signedMessage,
	verifyEnvelope,
} from "./envelope"
import { PLACEHOLDER_PUBLIC_KEY } from "./keys"
import { freshKey } from "./test-keys"

const PAYLOAD = new TextEncoder().encode('{"format":"nulo-token-list/1"}')

async function refusal(text: string, keys: Parameters<typeof verifyEnvelope>[1]): Promise<string> {
	const error = await verifyEnvelope(text, keys).catch((e: unknown) => e)
	expect(error).toBeInstanceOf(EnvelopeError)
	return (error as EnvelopeError).reason
}

describe("envelope", () => {
	test("a signed payload verifies and comes back byte-exact", async () => {
		const { privateKey, pinned } = await freshKey()
		const text = JSON.stringify(await signEnvelope(PAYLOAD, privateKey, pinned.keyId))
		const verified = await verifyEnvelope(text, [pinned])
		expect(verified.keyId).toBe(pinned.keyId)
		expect(verified.payload).toEqual(PAYLOAD)
	})

	test("refuses a tampered payload, a tampered signature, a wrong key and an unknown keyId", async () => {
		const { privateKey, pinned } = await freshKey()
		const other = await freshKey("other-1")
		const envelope = await signEnvelope(PAYLOAD, privateKey, pinned.keyId)
		const tampered = encodeBase64Url(new TextEncoder().encode('{"format":"nulo-token-list/2"}'))
		const flipped = decodeBase64Url(envelope.signature)!
		flipped[0] ^= 1
		expect(await refusal(JSON.stringify({ ...envelope, payload: tampered }), [pinned])).toBe("bad-signature")
		expect(await refusal(JSON.stringify({ ...envelope, signature: encodeBase64Url(flipped) }), [pinned])).toBe("bad-signature")
		expect(await refusal(JSON.stringify(envelope), [{ ...other.pinned, keyId: pinned.keyId }])).toBe("bad-signature")
		expect(await refusal(JSON.stringify(envelope), [other.pinned])).toBe("unknown-key")
	})

	test("refuses a signature over the payload without the domain prefix", async () => {
		const { privateKey, pinned } = await freshKey()
		const bare = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, privateKey, PAYLOAD))
		const envelope = {
			format: "nulo-token-list-envelope/1",
			keyId: pinned.keyId,
			payload: encodeBase64Url(PAYLOAD),
			signature: encodeBase64Url(bare),
		}
		expect(await refusal(JSON.stringify(envelope), [pinned])).toBe("bad-signature")
		expect(new TextDecoder().decode(signedMessage(PAYLOAD))).toBe(`${DOMAIN_PREFIX}${new TextDecoder().decode(PAYLOAD)}`)
	})

	test("refuses oversize and malformed envelopes before verifying", async () => {
		const { privateKey, pinned } = await freshKey()
		const envelope = await signEnvelope(PAYLOAD, privateKey, pinned.keyId)
		expect(await refusal(JSON.stringify({ ...envelope, pad: "x".repeat(MAX_ENVELOPE_BYTES) }), [pinned])).toBe("oversize")
		for (const text of [
			"not json",
			"[]",
			JSON.stringify({ ...envelope, format: "nulo-token-list-envelope/2" }),
			JSON.stringify({ ...envelope, keyId: "Upper" }),
			JSON.stringify({ ...envelope, payload: `${envelope.payload}=` }),
			JSON.stringify({ ...envelope, signature: envelope.signature.slice(0, 40) }),
		]) {
			expect(await refusal(text, [pinned])).toBe("malformed-envelope")
		}
	})

	test("the placeholder key refuses every envelope before any signature check", async () => {
		const { privateKey } = await freshKey()
		const text = JSON.stringify(await signEnvelope(PAYLOAD, privateKey, "nulo-ci-1"))
		expect(await refusal(text, [{ keyId: "nulo-ci-1", publicKey: PLACEHOLDER_PUBLIC_KEY }])).toBe("bad-key")
	})

	test("base64url admits one spelling per value", () => {
		const bytes = Uint8Array.from([251, 255, 0])
		expect(encodeBase64Url(bytes)).toBe("-_8A")
		expect(decodeBase64Url("-_8A")).toEqual(bytes)
		for (const text of ["+/8A", "-_8A=", "-_9", "A", "-_8A\n"]) expect(decodeBase64Url(text)).toBeUndefined()
	})
})
