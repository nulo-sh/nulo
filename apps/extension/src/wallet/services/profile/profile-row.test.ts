import fc from "fast-check"
import { asImportedKeysDek, asMasterSecretBytes } from "@nulo/wallet-crypto"
import { describe, expect, test } from "vitest"
import { classifyProfileRow, newPasskeyRow, newPasswordRow, ProfileRowSchema } from "./profile-row"

const master = asMasterSecretBytes(new Uint8Array(32).fill(1) as Uint8Array<ArrayBuffer>)
const dek = asImportedKeysDek(new Uint8Array(32).fill(2) as Uint8Array<ArrayBuffer>)
const slots = { guard: "Z3VhcmQ=", secret: "c2VjcmV0", entropy: "ZW50cm9weQ==" }
const SALT = "c2FsdA=="

const sealed = { id: "abcd1234", slots, dekSealed: "ZGVr", walletFingerprint: "ff" }
const passwordRow = () => newPasswordRow({ ...sealed, name: "P" }, master, dek)
const passkeyRow = () => newPasskeyRow({ ...sealed, name: "K", credentialId: "Y3JlZA==", prfSalt: SALT }, master, dek)
/** A passkey row as builds before 1.1 wrote it: no sealed slot, no MAC, no PRF input. */
const retiredRow = (): Record<string, unknown> => ({
	id: "abcd1234",
	name: "Old",
	type: "passkey",
	pxeGeneration: "Z2Vu",
	dekSealed: "ZGVr",
	walletFingerprint: "ff",
	credentialId: "Y3JlZA==",
})

const NEW_ONLY = ["guard", "secret", "entropy", "envelopeMac", "prfSalt"] as const
const isString = (v: unknown) => typeof v === "string"

/** The classes, decided independently of the classifier's schemas. */
function expectedKind(row: unknown): "password" | "passkey" | "retired" | "unreadable" {
	if (typeof row !== "object" || row === null || Array.isArray(row)) return "unreadable"
	const r = row as Record<string, unknown>
	const sealedSlots = [r.guard, r.secret, r.entropy].every(isString)
	if (r.type === "password" && sealedSlots) return "password"
	if (r.type === "passkey" && sealedSlots && isString(r.credentialId) && isString(r.prfSalt)) return "passkey"
	if (r.type === "passkey" && isString(r.credentialId) && NEW_ONLY.every((key) => r[key] === undefined)) return "retired"
	return "unreadable"
}

describe("classifyProfileRow", () => {
	test("sorts each row a build writes or wrote into its own kind, carrying only the fields it checked", async () => {
		const password = await passwordRow()
		expect(ProfileRowSchema.safeParse(password).success).toBe(true)
		expect(classifyProfileRow(password)).toStrictEqual({ kind: "password", slots })
		const passkey = await passkeyRow()
		expect(ProfileRowSchema.safeParse(passkey).success).toBe(true)
		expect(classifyProfileRow(passkey)).toStrictEqual({ kind: "passkey", credentialId: "Y3JlZA==", prfSalt: SALT, slots })
		expect(ProfileRowSchema.safeParse(retiredRow()).success).toBe(true)
		expect(classifyProfileRow(retiredRow())).toStrictEqual({ kind: "retired" })
	})

	// A failed MAC, DEK or fingerprint opens derived-only at unlock; classification must not turn
	// that damage into a row no unlock reads.
	test.each([
		["no envelope MAC", { envelopeMac: undefined }],
		["a non-string envelope MAC", { envelopeMac: 12345 }],
		["no DEK slot", { dekSealed: undefined }],
		["no fingerprint", { walletFingerprint: undefined }],
	])("a password or passkey row with %s keeps its kind", async (_label, damage) => {
		for (const row of [await passwordRow(), await passkeyRow()]) {
			const damaged = { ...row, ...damage }
			expect(ProfileRowSchema.safeParse(damaged).success).toBe(false)
			expect(classifyProfileRow(damaged).kind).toBe(row.type)
		}
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

	test.each<[string, (row: Record<string, unknown>) => unknown]>([
		["no PRF input", ({ prfSalt: _p, ...rest }) => rest],
		["a non-string PRF input", (row) => ({ ...row, prfSalt: 7 })],
		["no credential id", ({ credentialId: _c, ...rest }) => rest],
		["no guard", ({ guard: _g, ...rest }) => rest],
		["a password type", (row) => ({ ...row, type: "password", guard: undefined })],
	])("a passkey row with %s is unreadable, never retired", async (_label, damage) => {
		expect(classifyProfileRow(damage(await passkeyRow()))).toStrictEqual({ kind: "unreadable" })
	})

	// Retired is decided by what the row lacks, so a later row that lost its slots can never pass as
	// one: any key only a later build writes makes it unreadable.
	test.each(NEW_ONLY)("a retired row carrying %s is unreadable", (key) => {
		expect(classifyProfileRow({ ...retiredRow(), [key]: "eA==" })).toStrictEqual({ kind: "unreadable" })
	})

	test.each<[string, unknown]>([
		["a retired row with no credential id", (({ credentialId: _c, ...rest }) => rest)(retiredRow())],
		["a password-typed retired row", { ...retiredRow(), type: "password" }],
		["null", null],
		["a string", "row"],
		["an array", [retiredRow()]],
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

	// Every slot and PRF input as strings is a later row with a lost MAC, which opens derived-only;
	// anything less is unreadable. Neither is retired.
	test("over generated retired rows, any new-only key moves the row out of retired", () => {
		const value = fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.boolean())
		const added = fc
			.subarray([...NEW_ONLY], { minLength: 1 })
			.chain((keys) => fc.tuple(...keys.map((key) => value.map((v) => [key, v] as const))))
		fc.assert(
			fc.property(added, (entries) => {
				const row = { ...retiredRow(), ...Object.fromEntries(entries) }
				const kind = classifyProfileRow(row).kind
				expect(kind).not.toBe("retired")
				expect(kind).toBe(expectedKind(row))
			}),
			{ numRuns: 1000 },
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

describe("newPasskeyRow", () => {
	test("writes the password row's keys in their order, then the credential and its PRF input", async () => {
		const password = Object.keys(await passwordRow())
		expect(Object.keys(await passkeyRow())).toStrictEqual([...password, "credentialId", "prfSalt"])
	})
})
