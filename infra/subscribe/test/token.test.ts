import { describe, expect, test } from "bun:test"
import { MAX_TOKEN_LENGTH, readToken, sendKey, signToken, TOKEN_TTL_MS, toBase64Url } from "../src/token"
import { NORMALIZED, TEST_SECRET } from "./fakes"

const AT = Date.parse("2026-10-27T12:00:00.000Z")
const SKEW_MS = 5 * 60 * 1000

/** An HMAC computed here, independently of the module, so a hostile payload can carry a valid MAC. */
async function tokenOf(payload: unknown, secret = TEST_SECRET): Promise<string> {
	const encoded = toBase64Url(new TextEncoder().encode(typeof payload === "string" ? payload : JSON.stringify(payload)))
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
	const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`token\n${encoded}`))
	return `${encoded}.${toBase64Url(new Uint8Array(mac))}`
}

describe("readToken", () => {
	test("returns the address a token was signed for, and the independent signer agrees with the module", async () => {
		const token = await signToken(TEST_SECRET, NORMALIZED, AT)
		expect(await readToken(TEST_SECRET, token, AT)).toBe(NORMALIZED)
		expect(token).toBe(await tokenOf({ e: NORMALIZED, t: AT }))
	})

	test("refuses one changed character in either part, and the wrong secret", async () => {
		const token = await signToken(TEST_SECRET, NORMALIZED, AT)
		const dot = token.indexOf(".")
		for (const at of [0, dot - 1, dot + 1, token.length - 2]) {
			const changed = token.slice(0, at) + (token[at] === "A" ? "B" : "A") + token.slice(at + 1)
			expect(await readToken(TEST_SECRET, changed, AT)).toBeNull()
		}
		expect(await readToken("another-secret-of-thirty-two-chars!!", token, AT)).toBeNull()
	})

	test("lives exactly 24 h and tolerates 5 minutes of clock skew, not a millisecond more of either", async () => {
		const token = await signToken(TEST_SECRET, NORMALIZED, AT)
		expect(await readToken(TEST_SECRET, token, AT + TOKEN_TTL_MS)).toBe(NORMALIZED)
		expect(await readToken(TEST_SECRET, token, AT + TOKEN_TTL_MS + 1)).toBeNull()
		expect(await readToken(TEST_SECRET, token, AT - SKEW_MS)).toBe(NORMALIZED)
		expect(await readToken(TEST_SECRET, token, AT - SKEW_MS - 1)).toBeNull()
	})

	const hostile: [string, unknown][] = [
		["a JSON array", [NORMALIZED, AT]],
		["a JSON string", NORMALIZED],
		["no address", { t: AT }],
		["an address that is not a string", { e: 5, t: AT }],
		["a time that is not a number", { e: NORMALIZED, t: String(AT) }],
		["a fractional time", { e: NORMALIZED, t: AT + 0.5 }],
		["an address normalization would change", { e: "  Person@Example.COM", t: AT }],
		["an address normalization refuses", { e: "a/b@example.com", t: AT }],
		["bytes that are not JSON", "{not json"],
	]

	test.each(hostile)("refuses %s even under a valid MAC", async (_, payload) => {
		expect(await readToken(TEST_SECRET, await tokenOf(payload), AT)).toBeNull()
	})

	test("refuses the wrong shape before any MAC is computed: parts, alphabet, length", async () => {
		const valid = await signToken(TEST_SECRET, NORMALIZED, AT)
		for (const token of ["", "nodot", `${valid}.x`, valid.replace(".", ".+"), `${valid.split(".")[0]}.`]) {
			expect(await readToken(TEST_SECRET, token, AT)).toBeNull()
		}
		const long = await tokenOf({ e: NORMALIZED, t: AT, pad: "x".repeat(MAX_TOKEN_LENGTH) })
		expect(long.length).toBeGreaterThan(MAX_TOKEN_LENGTH)
		expect(await readToken(TEST_SECRET, long, AT)).toBeNull()
	})
})

describe("sendKey", () => {
	test("is one per exact address and secret, and never shows the address", async () => {
		const key = await sendKey(TEST_SECRET, NORMALIZED)
		expect(key).toBe(await sendKey(TEST_SECRET, NORMALIZED))
		expect(key).toMatch(/^confirm\/[A-Za-z0-9_-]{43}$/)
		expect(await sendKey(TEST_SECRET, NORMALIZED.toLowerCase())).not.toBe(key)
		expect(await sendKey("another-secret-of-thirty-two-chars!!", NORMALIZED)).not.toBe(key)
		expect(key.toLowerCase()).not.toContain("probe")
		// Separate labels: a key's MAC is never a token's MAC for the same input.
		const token = await signToken(TEST_SECRET, NORMALIZED, AT)
		expect(key.slice("confirm/".length)).not.toBe(token.split(".")[1] as string)
	})
})
