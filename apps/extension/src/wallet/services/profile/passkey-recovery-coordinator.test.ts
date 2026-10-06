/**
 * Unit tests for `PasskeyRecoveryCoordinator`.
 *
 * Uses a fake `PasskeyService` — no WebAuthn, no `chrome.windows`, no
 * DOM. Exercises the surface + error propagation.
 */

import { describe, expect, test, vi } from "vitest"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { asBase64CredentialId, asBase64SecretPrf, asHexUserHandle, type PasskeyCredential } from "@nulo/wallet-crypto"
import type { PasskeyHandOver, PasskeyService } from "@/wallet/services/passkey/service"
import { PasskeyRecoveryCoordinator } from "./passkey-recovery-coordinator"
import type { Profile } from "./spec"

/** Canonical byte-form of a deterministic Fr. Mirrors the real
 *  `PasskeyCredential.deriveMasterSecret()` return shape. */
const frBytes = (byte: string): Buffer<ArrayBuffer> => Fr.fromHexString(`0x${byte.repeat(32)}`).toBuffer() as Buffer<ArrayBuffer>

/** Real (deterministic) AES-GCM key — mirrors `PasskeyCredential.deriveDekWrapKey()`'s shape. */
const fakeAesKey = (): Promise<CryptoKey> =>
	crypto.subtle.importKey("raw", new Uint8Array(32).fill(0x42), { name: "AES-GCM" }, false, ["encrypt", "decrypt"])

/** PATH B's answer: the credential, and the window's `finish`. */
const handedOver = (credential: object) => ({ credential: credential as PasskeyCredential, finish: vi.fn() })

/** Minimal PasskeyService stand-in. Returns credential objects that
 *  expose `id`, `userHandle`, and a `deriveMasterSecret` that resolves
 *  to deterministic Fr-canonical bytes derived from the credential id. */
function makeFakePasskeyService(
	overrides: Partial<{
		create(userHandle: string): Promise<PasskeyHandOver>
		get(credentialId?: string): Promise<PasskeyHandOver>
		materialize(data: { id: string; prf: string; userHandle?: string }): Promise<PasskeyCredential>
	}> = {},
) {
	const defaultCredential = (id: string, userHandle?: string): PasskeyCredential =>
		({
			id,
			userHandle,
			deriveMasterSecret: async () => frBytes("01"),
			deriveDekWrapKey: async () => fakeAesKey(),
		}) as unknown as PasskeyCredential

	const fake = {
		createKey: overrides.create ?? (async (userHandle: string) => handedOver(defaultCredential(`cred-${userHandle}`, userHandle))),
		getKey:
			overrides.get ??
			(async (credentialId?: string) => handedOver(defaultCredential(credentialId ?? "cred-unknown", "user-handle-abc"))),
		materializeCredential:
			overrides.materialize ??
			(async (data: { id: string; prf: string; userHandle?: string }) => defaultCredential(data.id, data.userHandle)),
	} as unknown as PasskeyService

	return fake
}

function newCoordinator(passkeys: PasskeyService): PasskeyRecoveryCoordinator {
	return new PasskeyRecoveryCoordinator(passkeys, new LoggerStore(new ConfigStore()))
}

describe("PasskeyRecoveryCoordinator", () => {
	describe("createForNewProfile", () => {
		test("wraps PasskeyService.createKey + deriveMasterSecret, and carries the window's finish", async () => {
			const answer = handedOver({
				id: "cred-profile-123",
				userHandle: "profile-123",
				deriveMasterSecret: async () => frBytes("02"),
				deriveDekWrapKey: async () => fakeAesKey(),
			})
			const createKey = vi.fn(async () => answer)
			const passkeys = makeFakePasskeyService({ create: createKey })
			const coord = newCoordinator(passkeys)

			const result = await coord.createForNewProfile("profile-123", "Test")

			expect(createKey).toHaveBeenCalledWith("profile-123", "Test")
			expect(result.finish).toBe(answer.finish)
			expect(answer.finish).not.toHaveBeenCalled()
			expect(result.credentialId).toBe("cred-profile-123")
			expect(result.userHandle).toBe("profile-123")
			expect(Buffer.from(result.secret).toString("hex")).toBe(frBytes("02").toString("hex"))
		})

		test("propagates errors from the underlying PasskeyService", async () => {
			const passkeys = makeFakePasskeyService({
				create: (async () => {
					throw new Error("user cancelled passkey prompt")
				}) as never,
			})
			const coord = newCoordinator(passkeys)

			await expect(coord.createForNewProfile("profile-123", "Test")).rejects.toThrow(/user cancelled/)
		})

		test("a secret that cannot be derived tells the passkey window the step failed, once", async () => {
			const answer = handedOver({
				id: "cred-1",
				userHandle: "profile-123",
				deriveMasterSecret: async () => {
					throw new Error("bad PRF output")
				},
				deriveDekWrapKey: async () => fakeAesKey(),
			})
			const coord = newCoordinator(makeFakePasskeyService({ create: async () => answer }))

			await expect(coord.createForNewProfile("profile-123", "Test")).rejects.toThrow("bad PRF output")
			expect(answer.finish).toHaveBeenCalledExactlyOnceWith("failed")
		})
	})

	describe("recoverByCredentialId", () => {
		test("calls PasskeyService.getKey with the supplied credentialId and returns full recovery shape", async () => {
			const getKey = vi.fn(async (credentialId?: string) =>
				handedOver({
					id: credentialId ?? "unknown",
					userHandle: "handle-from-credential",
					deriveMasterSecret: async () => frBytes("03"),
					deriveDekWrapKey: async () => fakeAesKey(),
				}),
			)
			const passkeys = makeFakePasskeyService({ get: getKey })
			const coord = newCoordinator(passkeys)

			const recovery = await coord.recoverByCredentialId("known-credential-id", "Savings")

			expect(getKey).toHaveBeenCalledWith("known-credential-id", { step: "unlock", profileName: "Savings" })
			expect(recovery.credentialId).toBe("known-credential-id")
			expect(recovery.userHandle).toBe("handle-from-credential")
			expect(Buffer.from(recovery.secret).toString("hex")).toBe(frBytes("03").toString("hex"))
		})
	})

	describe("recoverUnknown", () => {
		test("calls getKey without a credential id and returns full recovery shape", async () => {
			const getKey = vi.fn(async () =>
				handedOver({
					id: "picked-by-user",
					userHandle: "user-handle-xyz",
					deriveMasterSecret: async () => frBytes("04"),
					deriveDekWrapKey: async () => fakeAesKey(),
				}),
			)
			const passkeys = makeFakePasskeyService({ get: getKey })
			const coord = newCoordinator(passkeys)

			const result = await coord.recoverUnknown("Imported")

			expect(getKey).toHaveBeenCalledWith(undefined, { step: "import", profileName: "Imported" })
			expect(result.credentialId).toBe("picked-by-user")
			expect(result.userHandle).toBe("user-handle-xyz")
			expect(result.secret).toBeDefined()
		})

		test("userHandle is optional — WebAuthn may omit it", async () => {
			const passkeys = makeFakePasskeyService({
				get: async () =>
					handedOver({
						id: "cred-without-userhandle",
						// no userHandle
						deriveMasterSecret: async () => frBytes("05"),
						deriveDekWrapKey: async () => fakeAesKey(),
					}),
			})
			const coord = newCoordinator(passkeys)

			const result = await coord.recoverUnknown("Imported")
			expect(result.userHandle).toBeUndefined()
		})
	})

	describe("recoverFromCredentialData (PATH A)", () => {
		test("calls materializeCredential with the supplied data and returns the recovery shape", async () => {
			const materialize = vi.fn(async (data: { id: string; prf: string; userHandle?: string }) => ({
				id: data.id,
				userHandle: data.userHandle,
				deriveMasterSecret: async () => frBytes("06"),
				deriveDekWrapKey: async () => fakeAesKey(),
			})) as unknown as PasskeyService["materializeCredential"]
			const passkeys = makeFakePasskeyService({ materialize: materialize as never })
			const coord = newCoordinator(passkeys)

			const data = {
				id: asBase64CredentialId("cred-from-modal"),
				prf: asBase64SecretPrf("prf-bytes-base64"),
				userHandle: asHexUserHandle("uh-from-modal"),
			}
			const recovery = await coord.recoverFromCredentialData(data)

			expect(materialize).toHaveBeenCalledWith(data)
			expect(recovery.credentialId).toBe("cred-from-modal")
			expect(recovery.userHandle).toBe("uh-from-modal")
			expect(Buffer.from(recovery.secret).toString("hex")).toBe(frBytes("06").toString("hex"))
		})

		test("propagates undefined userHandle from the materialized credential", async () => {
			const passkeys = makeFakePasskeyService({
				materialize: (async () => ({
					id: "cred-no-handle",
					// no userHandle
					deriveMasterSecret: async () => frBytes("07"),
					deriveDekWrapKey: async () => fakeAesKey(),
				})) as never,
			})
			const coord = newCoordinator(passkeys)

			const recovery = await coord.recoverFromCredentialData({
				id: asBase64CredentialId("cred-no-handle"),
				prf: asBase64SecretPrf("prf-bytes"),
			})
			expect(recovery.userHandle).toBeUndefined()
		})

		test("propagates errors from materializeCredential", async () => {
			const passkeys = makeFakePasskeyService({
				materialize: (async () => {
					throw new Error("invalid PRF length")
				}) as never,
			})
			const coord = newCoordinator(passkeys)

			await expect(coord.recoverFromCredentialData({ id: asBase64CredentialId("x"), prf: asBase64SecretPrf("bad") })).rejects.toThrow(
				/invalid PRF/,
			)
		})
	})

	describe("confirm", () => {
		test("returns the passkey window's finish for the caller to report through", async () => {
			const answer = handedOver({ id: "stored-credential" })
			const getKey = vi.fn(async () => answer)
			const passkeys = makeFakePasskeyService({ get: getKey })
			const coord = newCoordinator(passkeys)

			const profile: Profile = {
				id: "pid",
				name: "P",
				type: "passkey",
				pxeGeneration: "gen-test",
				dekSealed: "ZGVrLXNlYWxlZA==",
				walletFingerprint: "fp-test",
				credentialId: "stored-credential",
			}

			await expect(coord.confirm(profile)).resolves.toBe(answer.finish)
			expect(getKey).toHaveBeenCalledWith("stored-credential", { step: "unlock", profileName: "P" })
			expect(answer.finish).not.toHaveBeenCalled()
		})

		test("throws when the profile lacks a credentialId", async () => {
			const passkeys = makeFakePasskeyService()
			const coord = newCoordinator(passkeys)

			const profile = {
				id: "pid",
				name: "P",
				type: "passkey",
				pxeGeneration: "gen-test",
				credentialId: "",
			} as Profile & { type: "passkey" }

			await expect(coord.confirm(profile)).rejects.toThrow(/Missing credentialId/)
		})

		test("propagates failures from PasskeyService.getKey", async () => {
			const passkeys = makeFakePasskeyService({
				get: (async () => {
					throw new Error("user cancelled")
				}) as never,
			})
			const coord = newCoordinator(passkeys)

			const profile: Profile = {
				id: "pid",
				name: "P",
				type: "passkey",
				pxeGeneration: "gen-test",
				dekSealed: "ZGVrLXNlYWxlZA==",
				walletFingerprint: "fp-test",
				credentialId: "stored-credential",
			}

			await expect(coord.confirm(profile)).rejects.toThrow(/user cancelled/)
		})
	})
})
