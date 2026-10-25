import fc from "fast-check"
import { asImportedKeysDek, asMasterSecretBytes } from "@nulo/wallet-crypto"
import { describe, expect, test } from "vitest"
import { classifyProfileRow, newPasskeyRow, newPasswordRow, ProfileRowSchema } from "./profile-row"

const master = asMasterSecretBytes(new Uint8Array(32).fill(1) as Uint8Array<ArrayBuffer>)
const dek = asImportedKeysDek(new Uint8Array(32).fill(2) as Uint8Array<ArrayBuffer>)
const slots = { guard: "Z3VhcmQ=", secret: "c2VjcmV0", entropy: "ZW50cm9weQ==" }

const passwordRow = () => newPasswordRow({ id: "abcd1234", name: "P", slots, dekSealed: "ZGVr", walletFingerprint: "ff" }, master, dek)
const passkeyRow = () => newPasskeyRow({ id: "abcd1234", name: "K", dekSealed: "ZGVr", walletFingerprint: "ff", credentialId: "Y3JlZA==" })

/** The classes, decided independently of the classifier's schemas. */
function expectedKind(row: unknown): "password" | "passkey" | "unreadable" {
	if (typeof row !== "object" || row === null || Array.isArray(row)) return "unreadable"
	const r = row as Record<string, unknown>
	if (r.type === "password" && [r.guard, r.secret, r.entropy].every((v) => typeof v === "string")) return "password"
	if (r.type === "passkey" && typeof r.credentialId === "string") return "passkey"
	return "unreadable"
}

describe("classifyProfileRow", () => {
	test("sorts each row a build writes into its own kind, carrying only the fields it checked", async () => {
		const password = await passwordRow()
		expect(ProfileRowSchema.safeParse(password).success).toBe(true)
		expect(classifyProfileRow(password)).toStrictEqual({ kind: "password", slots: { type: "password", ...slots } })
		const passkey = passkeyRow()
		expect(ProfileRowSchema.safeParse(passkey).success).toBe(true)
		expect(classifyProfileRow(passkey)).toStrictEqual({ kind: "passkey", credentialId: "Y3JlZA==" })
	})

	// A failed MAC, DEK or fingerprint opens derived-only at unlock; classification must not turn
	// that damage into a row no unlock reads.
	test.each([
		["no envelope MAC", { envelopeMac: undefined }],
		["a non-string envelope MAC", { envelopeMac: 12345 }],
		["no DEK slot", { dekSealed: undefined }],
		["no fingerprint", { walletFingerprint: undefined }],
	])("a password row with %s is still a password row", async (_label, damage) => {
		const row = { ...(await passwordRow()), ...damage }
		expect(ProfileRowSchema.safeParse(row).success).toBe(false)
		expect(classifyProfileRow(row).kind).toBe("password")
	})

	test.each<[string, (row: Record<string, unknown>) => unknown]>([
		["a password row with no guard", ({ guard: _g, ...rest }) => rest],
		["a password row with no master slot", ({ secret: _s, ...rest }) => rest],
		["a password row with no entropy slot", ({ entropy: _e, ...rest }) => rest],
		["a password row with a non-string slot", (row) => ({ ...row, entropy: ["ZW50"] })],
		["a password row typed as anything else", (row) => ({ ...row, type: "bogus" })],
		["a password row with no type", ({ type: _t, ...rest }) => rest],
		["a passkey-typed row with only slots", (row) => ({ ...row, type: "passkey" })],
	])("%s is unreadable", async (_label, damage) => {
		expect(classifyProfileRow(damage(await passwordRow()))).toStrictEqual({ kind: "unreadable" })
	})

	test.each<[string, unknown]>([
		["a passkey row with no credential id", (({ credentialId: _c, ...rest }) => rest)(passkeyRow())],
		["a password-typed passkey row", { ...passkeyRow(), type: "password" }],
		["null", null],
		["a string", "row"],
		["an array", [passkeyRow()]],
	])("%s is unreadable", (_label, row) => {
		expect(classifyProfileRow(row)).toStrictEqual({ kind: "unreadable" })
	})

	test("over generated rows, every row lands in the one kind its unlock fields decide", () => {
		const field = fc.oneof(
			fc.constant(undefined),
			fc.string(),
			fc.integer(),
			fc.constant(null),
			fc.array(fc.string(), { maxLength: 2 }),
		)
		const row = fc.record({
			id: field,
			name: field,
			type: fc.oneof(fc.constantFrom("password", "passkey", "bogus", "PASSWORD"), field),
			pxeGeneration: field,
			dekSealed: field,
			walletFingerprint: field,
			guard: field,
			secret: field,
			entropy: field,
			envelopeMac: field,
			credentialId: field,
			prfSalt: field,
		})
		fc.assert(
			fc.property(row, (generated) => {
				expect(classifyProfileRow(generated).kind).toBe(expectedKind(generated))
			}),
			{ numRuns: 2000 },
		)
	})

	test("never throws on any value a decoded row can hold", () => {
		fc.assert(
			fc.property(fc.oneof(fc.jsonValue(), fc.anything()), (value) => {
				expect(classifyProfileRow(value).kind).toBe(expectedKind(value))
			}),
			{ numRuns: 1000 },
		)
	})
})
