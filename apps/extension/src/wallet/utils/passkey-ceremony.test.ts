import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildCreateOptions, buildGetOptions, confirmMinted, runPasskeyCeremony } from "./passkey-ceremony"
import { PasskeyPrfError, PasskeyUnconfirmedError } from "./passkey-errors"

const ID = "a3f29b14"
const SALT_BYTES = new Uint8Array(32).fill(0x5a)
const SALT = Buffer.from(SALT_BYTES).toString("base64")
const OTHER_SALT = Buffer.from(new Uint8Array(32).fill(0x5b)).toString("base64")
const toHex = (b: BufferSource): string => {
	const u =
		b instanceof ArrayBuffer
			? new Uint8Array(b)
			: new Uint8Array((b as ArrayBufferView).buffer, (b as ArrayBufferView).byteOffset, (b as ArrayBufferView).byteLength)
	return Buffer.from(u).toString("hex")
}

describe("buildCreateOptions", () => {
	it("labels the credential with the wallet's name alone, in both user fields", () => {
		const opts = buildCreateOptions(ID, SALT)
		expect(opts.user.name).toBe("Nulo wallet")
		expect(opts.user.displayName).toBe("Nulo wallet")
	})

	it("sets user.id to the hex-decoded handle", () => {
		expect(toHex(buildCreateOptions(ID, SALT).user.id)).toBe(ID)
	})

	it.each(["a3f29b1", "a3f29b1x", " a3f29b14"])("rejects the malformed handle %j instead of truncating user.id", (handle) => {
		expect(() => buildCreateOptions(handle, SALT)).toThrow("invalid hex")
	})

	it("evaluates the PRF at the profile's own input", () => {
		expect(toHex(buildCreateOptions(ID, SALT).extensions?.prf?.eval?.first as BufferSource)).toBe(toHex(SALT_BYTES))
		expect(toHex(buildCreateOptions(ID, OTHER_SALT).extensions?.prf?.eval?.first as BufferSource)).not.toBe(toHex(SALT_BYTES))
	})

	it("keeps rp, challenge size, credential params, and authenticator selection unchanged", () => {
		const opts = buildCreateOptions(ID, SALT)
		expect(opts.rp).toEqual({ name: "Nulo", id: "passkey.nulo.sh" })
		expect((opts.challenge as Uint8Array).byteLength).toBe(32)
		expect(opts.pubKeyCredParams).toEqual([
			{ type: "public-key", alg: -7 },
			{ type: "public-key", alg: -257 },
		])
		expect(opts.authenticatorSelection).toEqual({
			residentKey: "required",
			userVerification: "required",
			requireResidentKey: true,
		})
	})
})

describe("buildGetOptions", () => {
	it("asks only the profile's credential, with user verification, at the profile's input", () => {
		const opts = buildGetOptions(b64(RAW_ID), SALT)
		expect(opts.rpId).toBe("passkey.nulo.sh")
		expect(opts.userVerification).toBe("required")
		expect(opts.allowCredentials).toHaveLength(1)
		expect(b64(opts.allowCredentials?.[0].id as Uint8Array)).toBe(b64(RAW_ID))
		expect(toHex(opts.extensions?.prf?.eval?.first as BufferSource)).toBe(toHex(SALT_BYTES))
	})
})

// jsdom ships no WebAuthn, so the ceremony's `instanceof` checks need real classes to match.
class StubAssertionResponse {
	constructor(readonly userHandle: ArrayBuffer | Uint8Array | null) {}
}
class StubCredential {
	constructor(
		readonly rawId: Uint8Array,
		private readonly ext: Record<string, unknown>,
		readonly response?: StubAssertionResponse,
	) {}
	getClientExtensionResults() {
		return this.ext
	}
}

type CreateArgs = { publicKey: PublicKeyCredentialCreationOptions; signal?: AbortSignal }
type GetArgs = { publicKey: PublicKeyCredentialRequestOptions; signal?: AbortSignal }

const RAW_ID = new Uint8Array([1, 2, 3, 4])
const OTHER_RAW_ID = new Uint8Array([9, 8, 7, 6])
const PRF_AT_CREATE = new Uint8Array(32).fill(7)
const PRF_AT_GET = new Uint8Array(32).fill(9)
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64")
const CREATE_REQUEST = { mode: "create", step: "create", userHandle: ID, prfSalt: SALT, profileName: "Alice" } as const

describe("runPasskeyCeremony in create mode", () => {
	const create = vi.fn<(o: CreateArgs) => Promise<unknown>>()
	const get = vi.fn<(o: GetArgs) => Promise<unknown>>()
	const withPrfOnGet = () => new StubCredential(RAW_ID, { prf: { results: { first: PRF_AT_GET } } }, new StubAssertionResponse(null))

	beforeEach(() => {
		create.mockReset()
		get.mockReset()
		vi.stubGlobal("PublicKeyCredential", StubCredential)
		vi.stubGlobal("AuthenticatorAssertionResponse", StubAssertionResponse)
		vi.stubGlobal("navigator", { credentials: { create, get } })
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("returns the create-time PRF without a second ceremony", async () => {
		create.mockResolvedValue(new StubCredential(RAW_ID, { prf: { enabled: true, results: { first: PRF_AT_CREATE } } }))
		const data = await runPasskeyCeremony(CREATE_REQUEST)
		expect(data).toEqual({ id: b64(RAW_ID), prf: b64(PRF_AT_CREATE), prfSalt: SALT })
		expect(get).not.toHaveBeenCalled()
	})

	// Firefox's shape: `enabled` without output.
	it("falls back to a get pinned to the new credential at the same input", async () => {
		create.mockResolvedValue(new StubCredential(RAW_ID, { prf: { enabled: true } }))
		get.mockResolvedValue(withPrfOnGet())
		const data = await runPasskeyCeremony(CREATE_REQUEST)
		expect(data).toEqual({ id: b64(RAW_ID), prf: b64(PRF_AT_GET), prfSalt: SALT })
		expect(get).toHaveBeenCalledTimes(1)
		const opts = get.mock.calls[0][0].publicKey
		expect(opts.allowCredentials).toHaveLength(1)
		expect(b64(opts.allowCredentials?.[0].id as Uint8Array)).toBe(b64(RAW_ID))
		// The mock accepts invalid options, so check the fallback's security and derivation inputs.
		expect(opts.rpId).toBe("passkey.nulo.sh")
		expect(opts.userVerification).toBe("required")
		expect(toHex(opts.extensions?.prf?.eval?.first as BufferSource)).toBe(toHex(SALT_BYTES))
	})

	/** The created-but-unconfirmed error `runPasskeyCeremony` rejects with. */
	async function unconfirmed(): Promise<PasskeyUnconfirmedError> {
		const err = await runPasskeyCeremony(CREATE_REQUEST).catch((e: unknown) => e)
		expect(err).toBeInstanceOf(PasskeyUnconfirmedError)
		return err as PasskeyUnconfirmedError
	}

	it("a failed confirmation keeps the new credential: its id, the input it was asked for and the cause", async () => {
		const dismissed = new DOMException("not allowed", "NotAllowedError")
		create.mockResolvedValue(new StubCredential(RAW_ID, { prf: { enabled: true } }))
		get.mockRejectedValue(dismissed)
		const err = await unconfirmed()
		expect(err.credentialId).toBe(b64(RAW_ID))
		expect(err.prfSalt).toBe(SALT)
		expect(err.cause).toBe(dismissed)
	})

	it("refuses a fallback assertion from a different credential", async () => {
		create.mockResolvedValue(new StubCredential(RAW_ID, { prf: { enabled: true } }))
		get.mockResolvedValue(
			new StubCredential(OTHER_RAW_ID, { prf: { results: { first: PRF_AT_GET } } }, new StubAssertionResponse(null)),
		)
		expect(((await unconfirmed()).cause as Error).message).toBe("Passkey PRF fallback returned a different credential")
	})

	it("keeps the new credential without re-prompting when the authenticator reports no PRF at all", async () => {
		create.mockResolvedValue(new StubCredential(RAW_ID, {}))
		const err = await unconfirmed()
		expect(err.credentialId).toBe(b64(RAW_ID))
		expect(err.prfSalt).toBe(SALT)
		expect(err.cause).toBeInstanceOf(PasskeyPrfError)
		expect((err.cause as Error).message).toBe("Passkey PRF not available")
		expect(get).not.toHaveBeenCalled()
	})

	it("throws when the fallback assertion carries no PRF output either", async () => {
		create.mockResolvedValue(new StubCredential(RAW_ID, { prf: { enabled: true } }))
		get.mockResolvedValue(new StubCredential(RAW_ID, { prf: {} }, new StubAssertionResponse(null)))
		const cause = (await unconfirmed()).cause
		expect(cause).toBeInstanceOf(PasskeyPrfError)
		expect((cause as Error).message).toBe("Passkey PRF has no results")
	})

	it("with a saved credential: no new credential is created, and a refused confirmation keeps the same id", async () => {
		const dismissed = new DOMException("not allowed", "NotAllowedError")
		get.mockRejectedValue(dismissed)
		const err = await runPasskeyCeremony({ ...CREATE_REQUEST, credentialId: b64(RAW_ID) }).catch((e: unknown) => e)
		expect(create).not.toHaveBeenCalled()
		expect(err).toBeInstanceOf(PasskeyUnconfirmedError)
		expect(err).toMatchObject({ credentialId: b64(RAW_ID), prfSalt: SALT, cause: dismissed })
	})

	it("with a saved credential: the confirmation evaluates the input the first attempt asked for", async () => {
		get.mockResolvedValue(withPrfOnGet())
		const data = await runPasskeyCeremony({ ...CREATE_REQUEST, credentialId: b64(RAW_ID) })
		expect(data).toEqual({ id: b64(RAW_ID), prf: b64(PRF_AT_GET), prfSalt: SALT })
		expect(toHex(get.mock.calls[0][0].publicKey.extensions?.prf?.eval?.first as BufferSource)).toBe(toHex(SALT_BYTES))
		expect(create).not.toHaveBeenCalled()
	})

	it("forwards the abort signal to both ceremonies", async () => {
		const { signal } = new AbortController()
		create.mockResolvedValue(new StubCredential(RAW_ID, { prf: { enabled: true } }))
		get.mockResolvedValue(withPrfOnGet())
		await runPasskeyCeremony(CREATE_REQUEST, signal)
		expect(create.mock.calls[0][0].signal).toBe(signal)
		expect(get.mock.calls[0][0].signal).toBe(signal)
	})
})

describe("confirmMinted", () => {
	const get = vi.fn<(o: GetArgs) => Promise<unknown>>()

	beforeEach(() => {
		get.mockReset()
		vi.stubGlobal("PublicKeyCredential", StubCredential)
		vi.stubGlobal("AuthenticatorAssertionResponse", StubAssertionResponse)
		vi.stubGlobal("navigator", { credentials: { get } })
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("pins the assertion to the credential and reports the input it evaluated", async () => {
		get.mockResolvedValue(new StubCredential(RAW_ID, { prf: { results: { first: PRF_AT_GET } } }, new StubAssertionResponse(null)))
		expect(await confirmMinted(b64(RAW_ID), SALT)).toEqual({ id: b64(RAW_ID), prf: b64(PRF_AT_GET), prfSalt: SALT })
		expect(b64(get.mock.calls[0][0].publicKey.allowCredentials?.[0].id as Uint8Array)).toBe(b64(RAW_ID))
	})

	it("refuses an assertion from a different credential", async () => {
		get.mockResolvedValue(
			new StubCredential(OTHER_RAW_ID, { prf: { results: { first: PRF_AT_GET } } }, new StubAssertionResponse(null)),
		)
		const err = await confirmMinted(b64(RAW_ID), SALT).catch((e: unknown) => e)
		expect(err).toBeInstanceOf(PasskeyUnconfirmedError)
		expect(((err as PasskeyUnconfirmedError).cause as Error).message).toBe("Passkey PRF fallback returned a different credential")
	})
})

describe("runPasskeyCeremony in get mode", () => {
	const get = vi.fn<(o: GetArgs) => Promise<unknown>>()

	beforeEach(() => {
		get.mockReset()
		vi.stubGlobal("PublicKeyCredential", StubCredential)
		vi.stubGlobal("AuthenticatorAssertionResponse", StubAssertionResponse)
		vi.stubGlobal("navigator", { credentials: { create: vi.fn(), get } })
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("asks the profile's credential at its input and reports that input with the answer", async () => {
		get.mockResolvedValue(new StubCredential(RAW_ID, { prf: { results: { first: PRF_AT_GET } } }, new StubAssertionResponse(null)))
		const data = await runPasskeyCeremony({ mode: "get", step: "unlock", credentialId: b64(RAW_ID), prfSalt: SALT })
		expect(data).toEqual({ id: b64(RAW_ID), prf: b64(PRF_AT_GET), prfSalt: SALT })
		const opts = get.mock.calls[0][0].publicKey
		expect(b64(opts.allowCredentials?.[0].id as Uint8Array)).toBe(b64(RAW_ID))
		expect(toHex(opts.extensions?.prf?.eval?.first as BufferSource)).toBe(toHex(SALT_BYTES))
	})
})
