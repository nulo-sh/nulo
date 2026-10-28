/**
 * Integration tests for the `ProfileService` facade.
 *
 * Exercises concurrency invariants that unit tests of collaborators
 * cannot: the phase-1/2/3 lock dance must serialize writers while
 * keeping the slow middle phase (PBKDF2 / WebAuthn) unlocked. Drives
 * the real facade with `FakeBrowserApi` for storage + a minimal
 * `PasskeyService` stub, hits methods in overlapping orders, and
 * asserts the facade never ends up with a stuck lock or a corrupt
 * persisted session.
 *
 * Real crypto (`EncryptionKey` PBKDF2 + AES-GCM) runs — ~1s per unseal.
 * Tests pay that cost rather than dropping iteration counts; scenarios
 * stay small (1–2 PBKDF2 runs each) so the suite stays under ~30s total.
 */

import { svc } from "@/wallet/services/composition-harness"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { createHmac, hkdfSync } from "node:crypto"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { ConfigProp, IConfig } from "@/wallet/config"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { LoggerStore } from "@/wallet/logger"
import { ServiceCollection } from "@/wallet/base"
import { Service } from "@nulo/extension-messaging/background"
import { EventHandler } from "@nulo/wallet-core/utils"
import {
	AccountAddressInconsistencyError,
	DuplicateWalletError,
	InvalidPasswordError,
	RestoreTornError,
	RecoveryModeError,
	RetiredProfileError,
	SessionEndedError,
} from "@nulo/extension-messaging/errors"
import { AccountIntegrityBlockedRepository } from "../account-integrity/blocked-repository"
import { StaleNetworkRepository } from "../stale-network/repository"
import {
	asBase64Ciphertext,
	asBase64MasterSecret,
	asMasterSecretBytes,
	EncryptionKey,
	IMPORTED_DEK_AAD,
	PasswordSecretBox,
	PasskeyCredential,
	type PasskeyCredentialData,
	type SessionWrappedSecret,
	unsealDekUnderWrapKey,
} from "@nulo/wallet-crypto"
import { type PasskeyHandOver, PasskeyService } from "@/wallet/services/passkey/service"
import type { PasskeyDisplay, PasskeyStepOutcome } from "@/wallet/services/passkey/spec"
import { ServiceClient as OffscreenServiceClient } from "@nulo/extension-messaging/offscreen"
import { DappSessionService } from "@/wallet/services/dapp-session/service"
import { signDappSession } from "@/wallet/services/dapp-session/integrity"
import { PxeServiceClient } from "@/wallet/services/pxe/client"
import { wirePxeProviders } from "@/wallet/runtime"
import { flushPromises } from "@vue/test-utils"
import { ProfileService } from "./service"
import type { ProfileInfo } from "./spec"
import { RESTORE_PENDING_ROOT, RestorePendingRepository } from "./restore-pending-repository"
import { SESSION_STORAGE_ROOT, SESSION_TTL_ALARM_NAME, SessionManager } from "./session-manager"
import type { ProfileRepository } from "./repository"
import { pinnedTokensKey, profileImportedKey, profileNotFirstKey, profileUiKeys } from "@/utils/profile-ui-keys"
import { recordWrites } from "../storage-write-log"
import { PROFILE_TOMBSTONE_ROOT, type Tombstone } from "./tombstone-repository"
import { WalletLockedError } from "./wallet-locked-error"
import { RowKeyring } from "./row-keyring"
import { fromBase64, getMnemonic, toBase64 } from "@nulo/wallet-core/utils"
import { BUFFER_BINDINGS, withBuffer } from "../../../../tests/helpers/shipped-buffer"
import { fakePasskeyAnswer, fakePasskeyCredential, freshPrfSalt } from "../../../../tests/helpers/fake-passkey"
import { asBase64CredentialId, deriveMasterFromMnemonic, openPasskeySlots, openRow, sealRow } from "@nulo/wallet-crypto"

/** Recovery words for a deterministic 32-byte entropy fill (the v2 restore pairing check
 *  requires entropy whose words actually derive the master). */
async function wordsForFill(fill: number): Promise<string[]> {
	return getMnemonic(new Uint8Array(32).fill(fill))
}

/** A valid `(masterKey, entropy)` restore pair for a deterministic entropy fill — memoized:
 *  PBKDF2 runs once per fill across the suite. */
const restorePairCache = new Map<number, { masterKey: string; entropy: string }>()
async function restorePairFor(fill: number): Promise<{ masterKey: string; entropy: string }> {
	const cached = restorePairCache.get(fill)
	if (cached) return cached
	const entropy = new Uint8Array(32).fill(fill)
	const master = await deriveMasterFromMnemonic(await getMnemonic(entropy))
	const pair = { masterKey: Buffer.from(master).toString("base64"), entropy: Buffer.from(entropy).toString("base64") }
	restorePairCache.set(fill, pair)
	return pair
}

/** Deterministic 32-byte source-dek carrier for password restore secrets (any 32B is valid —
 *  the service only feeds it into the rewrap context). */
const RESTORE_DEK_B64 = Buffer.from(new Uint8Array(32).fill(0x55)).toString("base64")

/** RestoreSecret for a fill — the standard happy-path shape. */
async function restoreSecretFor(
	fill: number,
): Promise<{ masterKey: ReturnType<typeof asBase64MasterSecret>; entropy: string; importedKeysDek: string }> {
	const pair = await restorePairFor(fill)
	return { masterKey: asBase64MasterSecret(pair.masterKey), entropy: pair.entropy, importedKeysDek: RESTORE_DEK_B64 }
}

/** Fake `IConfig` with `sessionTtl` + `strictSecurityMode`. Default is
 *  `strictSecurityMode = false` so the bearer-cache tests preserve
 *  their semantics; strict-mode tests opt in via `init.strict` or call
 *  `config.set("strictSecurityMode", true)` mid-test. */
function fakeConfig(init: { sessionTtl?: number; strict?: boolean; debugMode?: boolean } = {}): IConfig & {
	set: <K extends "sessionTtl" | "strictSecurityMode" | "debugMode">(key: K, value: K extends "sessionTtl" ? number : boolean) => void
} {
	const onUpdate = new EventHandler<ConfigProp>()
	let sessionTtl = init.sessionTtl ?? 1_800_000
	let strictSecurityMode = init.strict ?? false
	let debugMode = init.debugMode ?? false
	return {
		onUpdate,
		get: ((key: string) => {
			if (key === "sessionTtl") return sessionTtl
			if (key === "strictSecurityMode") return strictSecurityMode
			if (key === "debugMode") return debugMode
			return undefined
		}) as IConfig["get"],
		set: (key, value) => {
			if (key === "sessionTtl") sessionTtl = value as number
			else if (key === "strictSecurityMode") strictSecurityMode = value as boolean
			else if (key === "debugMode") debugMode = value as boolean
			onUpdate.invoke({ key, value } as ConfigProp)
		},
	}
}

/** A PasskeyService that answers every prompt as one authenticator would: a credential answers
 *  its own PRF at the input asked, the same each time (`tests/helpers/fake-passkey.ts`). Extends
 *  the real Service so it satisfies ServiceCollection's IService shape. */
class FakePasskeyService extends Service<Record<string, never>> {
	protected readonly rpcMethods = new Set<string>()

	public constructor(logger: LoggerStore) {
		super(PasskeyService.name, logger)
	}

	protected override async init(): Promise<void> {
		// no-op — no upstream deps
	}

	public override async start(services: ServiceCollection): Promise<void> {
		await super.start(services)
	}

	/** What the passkey window would show, from the last PATH B step. */
	public lastDisplay?: PasskeyDisplay

	/** The PRF input the last PATH B step asked for. */
	public lastPrfSalt?: string

	/** Every outcome a PATH B step reported to its window, in order. */
	public readonly outcomes: PasskeyStepOutcome[] = []

	/** The PRF input a PATH B answer reports, when a test makes the window answer another. */
	public answerAt?: string

	public async createKey(userHandle: string, prfSalt: string, display: PasskeyDisplay): Promise<PasskeyHandOver> {
		this.lastDisplay = display
		this.lastPrfSalt = prfSalt
		return this.handOver(await fakePasskeyCredential(`cred-${userHandle}`, this.answerAt ?? prfSalt))
	}

	public async getKey(credentialId: string, prfSalt: string, display: PasskeyDisplay): Promise<PasskeyHandOver> {
		this.lastDisplay = display
		this.lastPrfSalt = prfSalt
		return this.handOver(await fakePasskeyCredential(credentialId, this.answerAt ?? prfSalt))
	}

	/** The credential a discovery get finds on the device. */
	public held = "cred-held"

	/** Every PRF input a PATH B discovery get asked at, in order. */
	public readonly discovered: string[] = []

	public async discoverKey(prfSalt: string, display: PasskeyDisplay): Promise<PasskeyHandOver> {
		this.lastDisplay = display
		this.discovered.push(prfSalt)
		return this.handOver(await fakePasskeyCredential(this.held, this.answerAt ?? prfSalt))
	}

	public async materializeCredential(data: PasskeyCredentialData): Promise<PasskeyCredential> {
		return PasskeyCredential.create(data)
	}

	private handOver(credential: PasskeyCredential): PasskeyHandOver {
		return { credential, finish: (outcome) => this.outcomes.push(outcome) }
	}
}

/** The page's answer for a passkey profile row: its credential at its own PRF input. */
async function answerFor(service: ProfileService, id: string): Promise<PasskeyCredentialData> {
	const { credentialId, prfSalt } = await service.getPasskeyUnlockParams(id)
	return fakePasskeyAnswer(credentialId, prfSalt)
}

/** A PATH A create's answer: a new credential at a fresh input. */
const newPasskeyAnswer = (credentialId: string) => fakePasskeyAnswer(credentialId, freshPrfSalt())

async function makeService(ttlOrInit: number | { sessionTtl?: number; strict?: boolean } = 1_800_000): Promise<{
	api: FakeBrowserApi
	config: ReturnType<typeof fakeConfig>
	logger: LoggerStore
	service: ProfileService
	passkeys: FakePasskeyService
}> {
	const init = typeof ttlOrInit === "number" ? { sessionTtl: ttlOrInit } : ttlOrInit
	const api = new FakeBrowserApi()
	api.reset()
	const config = fakeConfig(init)
	const logger = new LoggerStore(config)
	const passkeys = new FakePasskeyService(logger)

	const services = new ServiceCollection()
	services.add(passkeys)

	const service = new ProfileService(config, logger, api)
	services.add(service)

	await services.start()
	// deleteProfile now requires the coordinator delegate (finding D); these tests
	// exercise the profile lifecycle, not the purge cascade → no-op delegate.
	service.setDeletionDelegate({ snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }), runFor: async () => {} })
	return { api, config, logger, service, passkeys }
}

/** The coordinator's purge, as far as the UI keys go: it removes the profile's. */
const purgingDelegate = (api: FakeBrowserApi, gate?: Promise<void>) => ({
	snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
	runFor: async (id: string) => {
		await gate
		await api.storage.local.remove(profileUiKeys(id))
	},
})

/** Constructs a fresh `ProfileService` bound to a pre-existing
 *  `FakeBrowserApi` — simulates an MV3 SW restart that observes the
 *  prior persisted state. Used by strict-mode tests to verify
 *  `restore()` behavior across config-only upgrades (legacy passhash
 *  present + strict ON). */
async function makeServiceFromExistingApi(
	api: FakeBrowserApi,
	init: { sessionTtl?: number; strict?: boolean } = {},
): Promise<{
	config: ReturnType<typeof fakeConfig>
	logger: LoggerStore
	service: ProfileService
}> {
	const config = fakeConfig(init)
	const logger = new LoggerStore(config)
	const passkeys = new FakePasskeyService(logger)

	const services = new ServiceCollection()
	services.add(passkeys)

	const service = new ProfileService(config, logger, api)
	services.add(service)

	await services.start()
	service.setDeletionDelegate({ snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }), runFor: async () => {} })
	return { config, logger, service }
}

describe("ProfileService integration", () => {
	describe("Change 2 — unlockProfile phase-1/2/3", () => {
		test("concurrent unlock + changeProfilePassword: either unlock succeeds or throws InvalidPasswordError", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "oldpass")
			await service.lockActiveProfile()

			// Kick off unlock with OLD password. Phase-2 PBKDF2 is in flight.
			const unlockPromise = service.unlockProfile(profile.id, "oldpass")
			// Race with changeProfilePassword. For change we need an active
			// session first, so bounce: re-unlock quickly via a second path
			// is tricky — instead, we accept that changeProfilePassword
			// requires an unlocked profile, so drive the race via a second
			// "already unlocked" setup. Skip: instead run change after
			// unlock completes but BEFORE a second unlock.
			const result = await unlockPromise
			expect(result.id).toBe(profile.id)

			// Now run the real race: lock, then fire a fresh unlock
			// concurrently with changeProfilePassword (which needs the
			// active session from the completed unlock above — we didn't
			// lock yet, so changeProfilePassword proceeds).
			const [unlock2, changed] = await Promise.allSettled([
				service.unlockProfile(profile.id, "oldpass"),
				service.changeProfilePassword(profile.id, "oldpass", "newpass"),
			])

			// Change must succeed.
			expect(changed.status).toBe("fulfilled")

			// Unlock either:
			//  (a) ran phases 1/2/3 before change completed phase-3 write → succeed
			//  (b) ran phase 3 after change wrote → encrypted bytes mismatch → `InvalidPasswordError`
			if (unlock2.status === "rejected") {
				expect(unlock2.reason).toBeInstanceOf(InvalidPasswordError)
			}

			// Regardless of order, the profile should now be unlockable with
			// the NEW password — proves no stuck lock, no storage corruption.
			await service.lockActiveProfile()
			const final = await service.unlockProfile(profile.id, "newpass")
			expect(final.id).toBe(profile.id)
		}, 30_000)

		test("concurrent unlock + deleteProfile: delete wins → unlock throws 'Invalid profile id'", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			// Don't lock — deleteProfile can run without the profile being locked.
			// But we need the profile locked to exercise unlock. So:
			await service.lockActiveProfile()

			const [unlockRes, deleteRes] = await Promise.allSettled([
				service.unlockProfile(profile.id, "pass1234"),
				service.deleteProfile(profile.id),
			])

			// Delete always succeeds (does not depend on password).
			expect(deleteRes.status).toBe("fulfilled")

			// Unlock either races ahead and succeeds (session opens, then delete
			// closes it), or races behind and finds profile missing.
			if (unlockRes.status === "rejected") {
				expect(unlockRes.reason.message).toMatch(/Invalid profile id/)
			}

			// Active session must be clear and profile must be gone.
			expect(await service.getActiveProfile()).toBeUndefined()
			const all = await service.getProfiles()
			expect(all.find((p) => p.id === profile.id)).toBeUndefined()
		}, 30_000)

		test("two parallel unlocks with correct password both succeed serially", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			await service.lockActiveProfile()

			const [a, b] = await Promise.all([service.unlockProfile(profile.id, "pass1234"), service.unlockProfile(profile.id, "pass1234")])
			expect(a.id).toBe(profile.id)
			expect(b.id).toBe(profile.id)
			// Final state: unlocked.
			expect(await service.getActiveProfile()).toBeDefined()
		}, 30_000)

		test("unlock + concurrent lockActiveProfile: facade stays consistent", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			await service.lockActiveProfile()

			const [unlockRes] = await Promise.allSettled([service.unlockProfile(profile.id, "pass1234"), service.lockActiveProfile()])

			// Unlock itself must not throw a lock-related error. Either it
			// runs before the racing lock (session open, then lock closes it)
			// or it runs after (session opens fresh on top). Either way, the
			// facade must remain responsive.
			expect(unlockRes.status).toBe("fulfilled")

			// Re-query — no stuck lock.
			await service.getProfiles() // would hang if lock leaked
		}, 30_000)
	})

	describe("Change 4 — exportPlain single PBKDF2", () => {
		test("exportPlain for password profile returns raw secret under correct password", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			const exported = await service.exportPlain(profile.id, "pass1234")
			expect(exported).toBeDefined()
			expect(exported.length).toBeGreaterThan(0)
		}, 30_000)

		test("exportPlain with wrong password throws with InvalidPasswordError's legacy message", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			await expect(service.exportPlain(profile.id, "wrong")).rejects.toThrow(/Invalid profile password/)
		}, 30_000)

		test("exportPlain + exportMnemonic REJECT a tombstoned profile — no secret exfil mid-delete", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			// Simulate a delete beginning: the id is reserved (+ epoch bumped) while
			// the row/session still linger (the SW-died-mid-delete window).
			service.getDeletionState().beginDeletion(profile.id)
			await expect(service.exportPlain(profile.id, "pass1234")).rejects.toThrow(/Invalid profile id/)
			await expect(service.exportMnemonic(profile.id, "pass1234")).rejects.toThrow(/Invalid profile id/)
		}, 30_000)

		test("captureExecutionFence captures the current epoch, then rejects once reserved (atomic)", async () => {
			const { service } = await makeService()
			await service.createProfile("P", "pass1234")
			const fence = await service.captureExecutionFence()
			expect(fence.epoch).toBe(0)
			service.getDeletionState().beginDeletion(fence.profileId)
			const reserved = await service.captureExecutionFence().catch((e: unknown) => e)
			expect((reserved as Error).message).toBe("Wallet locked")
			// A deletion answers as locked but is not a lock, so it is not typed as one.
			expect(reserved).not.toBeInstanceOf(WalletLockedError)
		}, 30_000)

		test("captureExecutionFence with no live session throws the typed lock, with the message callers match", async () => {
			const { service } = await makeService()
			await service.createProfile("P", "pass1234")
			await service.lockActiveProfile()
			const locked = await service.captureExecutionFence().catch((e: unknown) => e)
			expect(locked).toBeInstanceOf(WalletLockedError)
			expect((locked as Error).message).toBe("Wallet locked")
		}, 30_000)

		test("exportPlain for a passkey profile returns the master its recovery phrase derives", async () => {
			const { service } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			const answer = await answerFor(service, profile.id)
			const exported = await service.exportPlain(profile.id, undefined, answer)
			const words = await service.exportMnemonic(profile.id, undefined, answer)
			expect(Buffer.from(await deriveMasterFromMnemonic(words)).toString("base64")).toBe(exported)
		}, 30_000)

		test("PATH B asks the passkey window for the create at a fresh 32-byte input, the one the row keeps", async () => {
			const { service, passkeys } = await makeService()
			const profile = await service.createPasskeyProfile("My Wallet")
			expect(passkeys.lastDisplay).toEqual({ step: "create", profileName: "My Wallet" })
			expect(fromBase64(passkeys.lastPrfSalt as string)).toHaveLength(32)
			expect((await service.getPasskeyUnlockParams(profile.id)).prfSalt).toBe(passkeys.lastPrfSalt)
		}, 30_000)

		test("exportPlain refuses another credential's answer, even one carrying this credential's output, and the same credential's at another input", async () => {
			const { service } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			const { credentialId, prfSalt } = await service.getPasskeyUnlockParams(profile.id)
			const ownOutput = await fakePasskeyAnswer(credentialId, prfSalt)
			for (const answer of [
				await fakePasskeyAnswer("cred-OTHER", prfSalt),
				{ ...ownOutput, id: asBase64CredentialId("cred-OTHER") },
				await fakePasskeyAnswer(credentialId, freshPrfSalt()),
			]) {
				await expect(service.exportPlain(profile.id, undefined, answer)).rejects.toThrow("Passkey did not open this profile")
			}
			expect(await service.exportPlain(profile.id, undefined, ownOutput)).toMatch(/\S/)
		}, 30_000)

		test("unlockPasskeyProfile rejects credentialData for a different credential", async () => {
			const { service } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			await service.lockActiveProfile()
			const { prfSalt } = await service.getPasskeyUnlockParams(profile.id)
			await expect(service.unlockPasskeyProfile(profile.id, await fakePasskeyAnswer("cred-OTHER", prfSalt))).rejects.toThrow(
				/Invalid profile id/,
			)
		}, 30_000)

		test("exportPlain of a passkey profile with no passkey answer opens nothing", async () => {
			const { service } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			await expect(service.exportPlain(profile.id)).rejects.toThrow(/Password is required/)
			await expect(service.exportPlain(profile.id, "pass1234")).rejects.toThrow(/Invalid profile password/)
		}, 30_000)

		test("exportPlain passkey revalidates after the answer: a delete + recreate mid-export returns nothing stale", async () => {
			const { service } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			const answer = await answerFor(service, profile.id)
			// Settled synchronously: the export can reject inside the delete's ticks, before a late
			// `.catch` would attach.
			const exportSettled = service.exportPlain(profile.id, undefined, answer).then(
				(v) => v,
				(err: unknown) => err,
			)
			await service.deleteProfile(profile.id)
			const newProfile = await service.createPasskeyProfile("PK new")

			const exportResult = await exportSettled
			if (exportResult instanceof Error) {
				expect(exportResult.message).toMatch(/Invalid profile id/)
			} else {
				const newMaster = await service.exportPlain(newProfile.id, undefined, await answerFor(service, newProfile.id))
				expect(exportResult).not.toBe(newMaster)
			}
		}, 30_000)
	})

	describe("execution fence: assertFence and isFenceLive", () => {
		test("the capturing session passes; a lock ends it; re-unlocking the same profile does not revive it", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			const fence = await service.captureExecutionFence()
			await expect(service.assertFence(fence)).resolves.toBeUndefined()
			expect(service.isFenceLive(fence)).toBe(true)

			await service.lockActiveProfile()
			await expect(service.assertFence(fence)).rejects.toBeInstanceOf(SessionEndedError)
			expect(service.isFenceLive(fence)).toBe(false)

			await service.unlockProfile(profile.id, "pass1234")
			const next = await service.captureExecutionFence()
			expect(next.profileId).toBe(fence.profileId)
			expect(next.session).not.toBe(fence.session)
			await expect(service.assertFence(fence)).rejects.toBeInstanceOf(SessionEndedError)
			expect(service.isFenceLive(fence)).toBe(false)
			await expect(service.assertFence(next)).resolves.toBeUndefined()
			expect(service.isFenceLive(next)).toBe(true)
		}, 30_000)

		test("another profile's unlock ends the fence; a fence pairing a live serial with another profile never passes", async () => {
			const { service } = await makeService()
			await service.createProfile("A", "pass1234")
			const fenceA = await service.captureExecutionFence()
			await service.createProfile("B", "pass5678")
			await expect(service.assertFence(fenceA)).rejects.toBeInstanceOf(SessionEndedError)
			expect(service.isFenceLive(fenceA)).toBe(false)

			const forged = { ...(await service.captureExecutionFence()), profileId: fenceA.profileId }
			await expect(service.assertFence(forged)).rejects.toBeInstanceOf(SessionEndedError)
			expect(service.isFenceLive(forged)).toBe(false)
		}, 30_000)

		test("a begun deletion keeps its own epoch error, and the synchronous check refuses it too", async () => {
			const { service } = await makeService()
			await service.createProfile("P", "pass1234")
			const fence = await service.captureExecutionFence()
			service.getDeletionState().beginDeletion(fence.profileId)

			const error = await service.assertFence(fence).then(
				() => undefined,
				(e: unknown) => e,
			)
			expect(error).toBeInstanceOf(Error)
			expect(error).not.toBeInstanceOf(SessionEndedError)
			expect((error as Error).message).toMatch(/being deleted/)
			expect(service.isFenceLive(fence)).toBe(false)
		}, 30_000)

		test("a capture queued behind a rolled-back publication never obtains the burned session", async () => {
			const { api, service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			await service.lockActiveProfile()

			let writeReached!: () => void
			const reached = new Promise<void>((resolve) => {
				writeReached = resolve
			})
			let releaseWrite!: () => void
			const release = new Promise<void>((resolve) => {
				releaseWrite = resolve
			})
			// The unlock publishes, parks inside its persisted write holding the facade lock, then the
			// write, the compensating delete and the read-back all fail: the publication rolls back.
			vi.spyOn(api.storage.session, "set").mockImplementationOnce(async () => {
				writeReached()
				await release
				throw new Error("write failed")
			})
			vi.spyOn(api.storage.session, "remove").mockRejectedValueOnce(new Error("delete failed"))
			vi.spyOn(api.storage.session, "get").mockRejectedValueOnce(new Error("read failed"))

			const unlocking = service.unlockProfile(profile.id, "pass1234").then(
				() => undefined,
				(e: unknown) => e,
			)
			await reached
			const capturing = service.captureExecutionFence()
			releaseWrite()

			await expect(capturing).rejects.toThrow(/Wallet locked/)
			expect(await unlocking).toBeInstanceOf(Error)
			expect(await service.getActiveProfile()).toBeUndefined()
		}, 30_000)
	})

	describe("cross-profile transplant defenses", () => {
		// Two profiles sharing a password: purpose-AAD does NOT stop moving a single authentic
		// ciphertext between them, so the pairing checks + whole-envelope MAC must.
		const profileRowKey = (id: string) => `nulo:core:profiles@${id}`
		async function readRow(api: FakeBrowserApi, id: string) {
			const all = await api.storage.local.get()
			return JSON.parse(all[profileRowKey(id)] as string)
		}
		async function writeRow(api: FakeBrowserApi, id: string, row: unknown) {
			await api.storage.local.set({ [profileRowKey(id)]: JSON.stringify(row) })
		}

		test("transplanting another profile's entropy is caught at unlock, and change-password can't launder it", async () => {
			const { api, service } = await makeService()
			const a = await service.createProfile("A", "shared-pass1")
			await service.lockActiveProfile()
			const b = await service.createProfile("B", "shared-pass1")
			await service.lockActiveProfile()

			const rowA = await readRow(api, a.id)
			const rowB = await readRow(api, b.id)
			await writeRow(api, a.id, { ...rowA, entropy: rowB.entropy }) // B's authentic entropy into A

			// Unlock catches the pair mismatch.
			await expect(service.unlockProfile(a.id, "shared-pass1")).rejects.toThrow()
			// And change-password refuses too — it must NOT reseal + rewrite the MAC into a
			// bearer-valid-but-unrecoverable profile.
			await expect(service.changeProfilePassword(a.id, "shared-pass1", "new-pass12")).rejects.toThrow()
		}, 30_000)

		test("a WHOLE-envelope swap between same-password profiles is rejected at unlock (identity binding)", async () => {
			// The attack: overwrite EVERY sealed field of A with B's row — every byte,
			// including B's authentic tag, is genuine. The MAC binds the ROW's own id, so the
			// pasted envelope fails verification under A's storage key: no unlock, no identity
			// adoption, no laundering via password change.
			const { api, service } = await makeService()
			const a = await service.createProfile("A", "shared-pass1")
			await service.lockActiveProfile()
			const b = await service.createProfile("B", "shared-pass1")
			await service.lockActiveProfile()

			const rowB = await readRow(api, b.id)
			await writeRow(api, a.id, { ...rowB, id: a.id, name: "A" })

			let outcome = "unlocked"
			service.onImportedKeysDegraded.add(() => {
				outcome = "derived-only"
			})
			try {
				await service.unlockProfile(a.id, "shared-pass1")
			} catch {
				outcome = "rejected"
			}
			expect(outcome).not.toBe("unlocked")
			if (outcome === "derived-only") {
				// Even the degraded open must not have laundered the swap: change-password
				// refuses an uncovered DEK, and no DEK is trusted in the session.
				expect(await service.getProfileDek(a.id)).toBeUndefined()
				await expect(service.changeProfilePassword(a.id, "shared-pass1", "new-pass12")).rejects.toThrow()
			}
			// And the sibling wallet is untouched.
			const info = await service.unlockProfile(b.id, "shared-pass1")
			expect(info.name).toBe("B")
		}, 30_000)

		test("an EMBEDDED-ID swap (B's row verbatim, id field intact, under A's storage key) does not adopt", async () => {
			// Bypass attempt: keep B's row byte-identical INCLUDING its embedded
			// id="B", but store it under A's storage key. The MAC would verify against the
			// embedded id — so the id/key consistency guard must hide the row instead.
			const { api, service } = await makeService()
			const a = await service.createProfile("A", "shared-pass1")
			await service.lockActiveProfile()
			const b = await service.createProfile("B", "shared-pass1")
			await service.lockActiveProfile()

			const rowB = await readRow(api, b.id)
			await writeRow(api, a.id, { ...rowB, name: "A" }) // id stays "B"; only name edited

			// Unlocking by A's id must NOT succeed as wallet B. The guard makes the row
			// unreadable under that key → invalid-profile rejection (or at worst a degraded,
			// DEK-less open — never a clean session carrying B's master).
			let outcome = "unlocked"
			try {
				const info = await service.unlockProfile(a.id, "shared-pass1")
				outcome = info.name === "A" ? "adopted-as-A" : `unlocked-as-${info.name}`
			} catch {
				outcome = "rejected"
			}
			expect(outcome).toBe("rejected")
			// And B itself still unlocks normally.
			const info = await service.unlockProfile(b.id, "shared-pass1")
			expect(info.id).toBe(b.id)
		}, 30_000)

		test("blinding a PASSKEY profile's plaintext walletFingerprint degrades its unlock", async () => {
			// A passkey row's envelope MAC binds the fingerprint as a password row's does: corrupting it
			// quarantines the DEK slot.
			const { api, service } = await makeService()
			const pk = await service.createPasskeyProfile("PK", await newPasskeyAnswer("cred-pk-blind"))
			await service.lockActiveProfile()
			const row = await readRow(api, pk.id)
			await writeRow(api, pk.id, { ...row, walletFingerprint: "0".repeat(64) })

			let degraded = false
			service.onImportedKeysDegraded.add(() => {
				degraded = true
			})
			const unlocked = await service.unlockPasskeyProfile(pk.id)
			expect(unlocked.id).toBe(pk.id)
			expect(degraded).toBe(true)
			expect(await service.getProfileDek(pk.id)).toBeUndefined()
		}, 30_000)

		describe("two profiles on one passkey", () => {
			/** A and B made with the same credential, each at its own PRF input, then locked. */
			async function sharedCredential() {
				const env = await makeService()
				const saltA = freshPrfSalt()
				const saltB = freshPrfSalt()
				const a = await env.service.createPasskeyProfile("A", await fakePasskeyAnswer("cred-shared", saltA))
				const masterA = await env.service.exportPlain(a.id, undefined, await fakePasskeyAnswer("cred-shared", saltA))
				const b = await env.service.createPasskeyProfile("B", await fakePasskeyAnswer("cred-shared", saltB))
				const masterB = await env.service.exportPlain(b.id, undefined, await fakePasskeyAnswer("cred-shared", saltB))
				await env.service.lockActiveProfile()
				return { ...env, a, b, saltA, saltB, masterA, masterB }
			}

			test("each opens only under its own input: one's answer never opens the other", async () => {
				const { service, a, b, saltA, saltB, masterA, masterB } = await sharedCredential()
				expect(masterA).not.toBe(masterB)
				await expect(service.unlockPasskeyProfile(b.id, await fakePasskeyAnswer("cred-shared", saltA))).rejects.toThrow(
					"Passkey did not open this profile",
				)
				await expect(service.exportPlain(a.id, undefined, await fakePasskeyAnswer("cred-shared", saltB))).rejects.toThrow(
					"Passkey did not open this profile",
				)
				expect((await service.unlockPasskeyProfile(a.id, await fakePasskeyAnswer("cred-shared", saltA))).id).toBe(a.id)
			}, 60_000)

			test("with their inputs swapped, neither opens: the swapped input keys neither row's slots", async () => {
				const { api, service, a, b, saltA, saltB } = await sharedCredential()
				await writeRow(api, a.id, { ...(await readRow(api, a.id)), prfSalt: saltB })
				await writeRow(api, b.id, { ...(await readRow(api, b.id)), prfSalt: saltA })
				for (const [id, salt] of [
					[a.id, saltB],
					[b.id, saltA],
					[a.id, saltA],
					[b.id, saltB],
				] as const) {
					await expect(service.unlockPasskeyProfile(id, await fakePasskeyAnswer("cred-shared", salt))).rejects.toThrow(
						"Passkey did not open this profile",
					)
				}
				// PATH B asks at the row's input, and fares no better.
				await expect(service.unlockPasskeyProfile(a.id)).rejects.toThrow("Passkey did not open this profile")
			}, 60_000)

			// Moving B's slots with its input into A's row is the same-password sibling case: the row
			// opens, but A's DEK slot is keyed at A's input and its MAC binds A's slots, so the session
			// is derived-only and never holds A's imported keys.
			test("with B's slots and input moved into A's row, A opens derived-only", async () => {
				const { api, service, a, b, saltB, masterB } = await sharedCredential()
				const rowB = await readRow(api, b.id)
				await writeRow(api, a.id, {
					...(await readRow(api, a.id)),
					guard: rowB.guard,
					secret: rowB.secret,
					entropy: rowB.entropy,
					prfSalt: saltB,
				})
				let degraded = false
				service.onImportedKeysDegraded.add(() => {
					degraded = true
				})
				const answer = await fakePasskeyAnswer("cred-shared", saltB)
				expect((await service.unlockPasskeyProfile(a.id, answer)).id).toBe(a.id)
				expect(degraded).toBe(true)
				expect(await service.getProfileDek(a.id)).toBeUndefined()
				expect(await service.exportPlain(a.id, undefined, answer)).toBe(masterB)
			}, 60_000)

			test("a profile on the passkey already held asks a discovery get at its own fresh input", async () => {
				const { api, service, passkeys, a, saltA } = await sharedCredential()
				passkeys.held = "cred-shared"
				const c = await service.createPasskeyProfile("C", undefined, true)
				const [asked] = passkeys.discovered
				expect(passkeys.lastDisplay).toEqual({ step: "create", profileName: "C" })
				expect([asked, (await readRow(api, c.id)).prfSalt]).toEqual([asked, asked])
				expect(asked).not.toBe(saltA)
				await expect(service.unlockPasskeyProfile(a.id, await fakePasskeyAnswer("cred-shared", asked as string))).rejects.toThrow(
					"Passkey did not open this profile",
				)
				const before = await api.storage.local.get(null)
				passkeys.answerAt = saltA
				await expect(service.createPasskeyProfile("D", undefined, true)).rejects.toThrow("Passkey answered for another request")
				await expect(service.createPasskeyProfile("D", await fakePasskeyAnswer("cred-shared", saltA))).rejects.toThrow(
					"Passkey input already belongs to another profile",
				)
				expect(await api.storage.local.get(null)).toStrictEqual(before)
			}, 60_000)
		})

		test("blinding the plaintext walletFingerprint is caught at unlock + password change", async () => {
			const { api, service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			const row = await readRow(api, p.id)
			await writeRow(api, p.id, { ...row, walletFingerprint: "0".repeat(64) })

			// Unlock opens derived-only (visible degradation), never a clean session.
			let degradedFired = false
			service.onImportedKeysDegraded.add(() => {
				degradedFired = true
			})
			await service.unlockProfile(p.id, "pass1234")
			expect(degradedFired).toBe(true)
			expect(await service.getProfileDek(p.id)).toBeUndefined()
			// And the tamper cannot be blessed by a password change.
			await service.lockActiveProfile()
			await expect(service.changeProfilePassword(p.id, "pass1234", "new-pass12")).rejects.toThrow()
		}, 30_000)

		test("transplanting another profile's master (secret) is caught by the whole-envelope bearer MAC", async () => {
			const { api, service } = await makeService() // non-strict → a bearer is persisted
			const b = await service.createProfile("B", "shared-pass1")
			await service.lockActiveProfile()
			// Create A LAST so it is the active session with a persisted bearer at reboot.
			const a = await service.createProfile("A", "shared-pass1")

			const rowA = await readRow(api, a.id)
			const rowB = await readRow(api, b.id)
			// Move B's master ciphertext into A but keep A's entropy + A's (now-stale) envelope MAC.
			await writeRow(api, a.id, { ...rowA, secret: rowB.secret })

			// A fresh SW runs the passwordless bearer restore during start(); the envelope MAC
			// (keyed by the master the bearer carries) no longer matches A's mutated envelope,
			// so the session is silently closed rather than opened on a mismatched master.
			const { service: rebooted } = await makeServiceFromExistingApi(api)
			expect(await rebooted.getActiveProfile()).toBeUndefined()
			// Password unlock also refuses via the pairing check.
			await expect(rebooted.unlockProfile(a.id, "shared-pass1")).rejects.toThrow()
		}, 30_000)
	})

	describe("lockActiveProfile given a session handle", () => {
		test("closes the session the handle names and leaves a session that replaced it open", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			const first = await service.getSessionHandle()
			await service.lockActiveProfile()
			expect(await service.getSessionHandle()).toBeUndefined()
			await service.unlockProfile(profile.id, "pass1234")
			const second = await service.getSessionHandle()
			expect(second).not.toBe(first)

			await service.lockActiveProfile(first)
			expect((await service.getActiveProfile())?.id).toBe(profile.id)
			await service.lockActiveProfile(second)
			expect(await service.getActiveProfile()).toBeUndefined()
		}, 30_000)

		test("a handle from before a worker restart does not name the session the restart restored", async () => {
			const { api, service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			const before = await service.getSessionHandle()
			const { service: rebooted } = await makeServiceFromExistingApi(api)
			expect((await rebooted.getActiveProfile())?.id).toBe(profile.id)

			await rebooted.lockActiveProfile(before)
			expect((await rebooted.getActiveProfile())?.id).toBe(profile.id)
		}, 30_000)
	})

	describe("lockActiveProfile announces the lock exactly once", () => {
		test("over an in-memory session: close() emits, the service adds nothing", async () => {
			const { service } = await makeService()
			await service.createProfile("P", "pass1234")
			const events: unknown[] = []
			service.onActiveProfileChanged.add((p) => events.push(p))
			await service.lockActiveProfile()
			expect(events).toEqual([undefined])
		}, 30_000)

		test("after a restart that restored no session: the record is deleted and the lock is announced", async () => {
			const { api, service } = await makeService()
			await service.createPasskeyProfile("PK")
			// The persisted record survives a restart whose restore left memory empty.
			vi.spyOn(SessionManager.prototype, "restore").mockResolvedValueOnce(undefined)
			const { service: rebooted } = await makeServiceFromExistingApi(api)
			expect(await rebooted.getActiveProfile()).toBeUndefined()
			expect(SESSION_STORAGE_ROOT in (await api.storage.session.get(SESSION_STORAGE_ROOT))).toBe(true)
			const events: unknown[] = []
			rebooted.onActiveProfileChanged.add((p) => events.push(p))
			await rebooted.lockActiveProfile()
			expect(events).toEqual([undefined])
			expect(SESSION_STORAGE_ROOT in (await api.storage.session.get(SESSION_STORAGE_ROOT))).toBe(false)
		}, 30_000)

		test("a lock whose close returns with a successor's session published does not announce over it", async () => {
			const { service } = await makeService()
			const created = await service.createProfile("P", "pass1234")
			await service.lockActiveProfile()
			const internals = service as unknown as { repo: ProfileRepository; sessionManager: SessionManager }
			const profile = await internals.repo.get(created.id)
			if (!profile) throw new Error("setup: no profile row")
			const close = internals.sessionManager.close.bind(internals.sessionManager)
			vi.spyOn(internals.sessionManager, "close").mockImplementationOnce(async (...args) => {
				const emitted = await close(...args)
				await internals.sessionManager.open(profile, asMasterSecretBytes(new Uint8Array(32).fill(1)))
				return emitted
			})
			const events: unknown[] = []
			service.onActiveProfileChanged.add((p) => events.push(p))

			await service.lockActiveProfile().catch(() => undefined)

			expect(events).toEqual([expect.objectContaining({ id: created.id })])
		}, 30_000)

		test("after a restart that already dropped the record (strict password): the lock is still announced", async () => {
			const { api, service } = await makeService({ strict: true })
			await service.createProfile("P", "pass1234")
			// Strict mode persists no bearer; `restore()` drops the bearerless record at boot.
			const { service: rebooted } = await makeServiceFromExistingApi(api, { strict: true })
			expect(await rebooted.getActiveProfile()).toBeUndefined()
			expect(SESSION_STORAGE_ROOT in (await api.storage.session.get(SESSION_STORAGE_ROOT))).toBe(false)
			const events: unknown[] = []
			rebooted.onActiveProfileChanged.add((p) => events.push(p))
			await rebooted.lockActiveProfile()
			expect(events).toEqual([undefined])
		}, 30_000)
	})

	describe("recovery-phrase round trip (NULO-ACCOUNT-KDF v2)", () => {
		test("create → export words → re-import → the SAME master secret", async () => {
			const { service } = await makeService()
			const created = await service.createProfile("P", "pass1234")
			const words = await service.exportMnemonic(created.id, "pass1234")
			expect(words).toHaveLength(24)
			const master = await service.exportPlain(created.id, "pass1234")

			const { service: fresh } = await makeService()
			const imported = await fresh.importMnemonic("Recovered", words, "otherpass1")
			expect(await fresh.exportPlain(imported.id, "otherpass1")).toBe(master)
			// And the words re-display identically from the imported profile's stored entropy.
			expect(await fresh.exportMnemonic(imported.id, "otherpass1")).toEqual(words)
		}, 30_000)

		test("importMnemonic canonicalizes (case/whitespace) and enforces exactly 24 words", async () => {
			const { service } = await makeService()
			const created = await service.createProfile("P", "pass1234")
			const words = await service.exportMnemonic(created.id, "pass1234")
			const master = await service.exportPlain(created.id, "pass1234")

			const { service: fresh } = await makeService()
			const messy = ` ${words.join("  ").toUpperCase()} `.split(" ")
			const imported = await fresh.importMnemonic("Messy", messy, "otherpass1")
			expect(await fresh.exportPlain(imported.id, "otherpass1")).toBe(master)

			await expect(fresh.importMnemonic("Short", words.slice(0, 12), "otherpass1")).rejects.toThrow(/Invalid mnemonic length/)
			// A word off the BIP-39 list fails wordlist validation on EVERY run. Swapping the last word
			// for another list word is a random outcome: ~1/256 forms a valid checksum for a different
			// phrase, and if the swap equals the original word the import is a DUPLICATE, not invalid.
			const corrupted = [...words.slice(0, 23), "notaword"]
			await expect(fresh.importMnemonic("BadWord", corrupted, "otherpass1")).rejects.toThrow(/Invalid checksum|Invalid mnemonic/)
		}, 30_000)

		test("restore rejects a doctored backup whose entropy does not derive the master (H3)", async () => {
			const { service } = await makeService()
			const good = await restorePairFor(11)
			const evil = await restorePairFor(12)
			// The pairing check throws BEFORE anything is sealed or persisted — a doctored blob
			// (checksum is integrity-not-auth) fails loudly, never as a half-restored profile.
			await expect(
				service.restore(
					{ id: "px", name: "Doctored", type: "password" },
					{
						masterKey: asBase64MasterSecret(good.masterKey),
						entropy: evil.entropy,
						importedKeysDek: RESTORE_DEK_B64,
					},
					"pass1234",
				),
			).rejects.toThrow(/entropy does not derive/)
			expect(await service.getProfiles()).toEqual([])
		}, 30_000)
	})

	describe("openBackupTransfer — atomic paired export", () => {
		test("returns a master+entropy pair from one unseal, the live DEK, and a transfer key that is not the DEK", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			const material = await service.openBackupTransfer(profile.id, "pass1234")
			const entropy = new Uint8Array(Buffer.from(material.entropy, "base64"))
			expect(entropy.byteLength).toBe(32)
			const rederived = await deriveMasterFromMnemonic(await getMnemonic(entropy))
			expect(Buffer.from(rederived).toString("base64")).toBe(material.masterKey)
			// And `master-key` semantics hold: exportPlain returns the SAME master.
			expect(await service.exportPlain(profile.id, "pass1234")).toBe(material.masterKey)
			expect(Array.from(material.sourceDek!)).toEqual(Array.from((await service.getProfileDek(profile.id))!))
			expect(material.transferKey).toHaveLength(32)
			expect(Array.from(material.transferKey)).not.toEqual(Array.from(material.sourceDek!))
		}, 30_000)

		test("rejects a wrong password", async () => {
			const { service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			await expect(service.openBackupTransfer(profile.id, "wrong-pass")).rejects.toThrow()
		}, 30_000)

		// A passkey row's slots are sealed under its unlock key alone, so no password opens them.
		test("a passkey profile's material never opens with a password", async () => {
			const { service } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			await expect(service.openBackupTransfer(profile.id, "irrelevant")).rejects.toBeInstanceOf(InvalidPasswordError)
			await expect(service.openBackupTransfer(profile.id)).rejects.toThrow("Password is required")
		}, 30_000)

		test("the popup can reach neither the DEK export nor the sealed-DEK read", () => {
			const service = new ProfileService(fakeConfig(), new LoggerStore(fakeConfig()), new FakeBrowserApi())
			const rpc = (service as unknown as { rpcMethods: ReadonlySet<string> }).rpcMethods
			for (const name of ["exportBackupMaterial", "getProfileDekSealed", "openBackupTransfer", "exportImportedKeysDek"]) {
				expect(rpc.has(name)).toBe(false)
			}
			expect(rpc.has("captureRunFence") && rpc.has("assertRunFence")).toBe(true)
		})
	})

	describe("run fence — a popup-held fence across RPCs", () => {
		test("a restarted worker refuses the old worker's fence at the same profile, epoch and serial; a refresh keeps it", async () => {
			const { api, service } = await makeService()
			await service.createProfile("P", "pass1234")
			const fence = await service.captureRunFence()
			await service.refreshSession()
			await expect(service.assertRunFence(fence)).resolves.toBeUndefined()

			const { service: restarted } = await makeServiceFromExistingApi(api)
			const reissued = await restarted.captureRunFence()
			expect({ ...reissued, incarnation: fence.incarnation }).toEqual(fence)
			await expect(restarted.assertRunFence(fence)).rejects.toBeInstanceOf(SessionEndedError)
			await expect(restarted.assertRunFence(reissued)).resolves.toBeUndefined()
		}, 30_000)
	})

	describe("createPasskeyProfile", () => {
		// Create, lock, unlock: the one end-to-end proof that the master a passkey create seals is the
		// master its unlock opens, the one its recovery phrase derives.
		test("create, lock and unlock open the master the create sealed, the one its phrase derives", async () => {
			const { service } = await makeService()
			const answer = await newPasskeyAnswer("cred-roundtrip")
			const profile = await service.createPasskeyProfile("PK", answer)
			expect(await service.getProfileDek(profile.id)).toBeDefined()
			const sealedMaster = await service.exportPlain(profile.id, undefined, answer)
			const words = await service.exportMnemonic(profile.id, undefined, answer)
			await service.lockActiveProfile()

			expect((await service.unlockPasskeyProfile(profile.id)).id).toBe(profile.id)
			expect((await service.getActiveProfile())?.id).toBe(profile.id)
			expect(await service.getProfileDek(profile.id)).toBeDefined()
			expect(await service.exportPlain(profile.id, undefined, await answerFor(service, profile.id))).toBe(sealedMaster)
			expect(Buffer.from(await deriveMasterFromMnemonic(words)).toString("base64")).toBe(sealedMaster)
			expect(words).toHaveLength(24)
		}, 30_000)

		test("PATH A stores the credential and the PRF input the passkey answered for", async () => {
			const { service } = await makeService()
			const answer = await newPasskeyAnswer("cred-a")
			const profile = await service.createPasskeyProfile("PK", answer)
			expect(await service.getPasskeyUnlockParams(profile.id)).toEqual({ credentialId: "cred-a", prfSalt: answer.prfSalt })
		}, 30_000)

		test.each([
			["a 31-byte passkey output", (answer: PasskeyCredentialData) => ({ ...answer, prf: toBase64(new Uint8Array(31).fill(1)) })],
			["a 33-byte passkey output", (answer: PasskeyCredentialData) => ({ ...answer, prf: toBase64(new Uint8Array(33).fill(1)) })],
			["a 31-byte PRF input", (answer: PasskeyCredentialData) => ({ ...answer, prfSalt: toBase64(new Uint8Array(31).fill(1)) })],
			["no PRF input", (answer: PasskeyCredentialData) => ({ ...answer, prfSalt: "" })],
		])(
			"a create answer with %s stores nothing and opens nothing",
			async (_label, damage) => {
				const { service } = await makeService()
				const answer = damage(await newPasskeyAnswer("cred-bad")) as PasskeyCredentialData
				await expect(service.createPasskeyProfile("PK", answer)).rejects.toThrow(/Invalid passkey PRF/)
				expect(await service.getProfiles()).toEqual([])
				expect(await service.getActiveProfile()).toBeUndefined()
			},
			30_000,
		)
	})

	describe("Change 1 — unlockPasskeyProfile phase-1/2/3", () => {
		test("unlocks a passkey profile and opens session", async () => {
			const { service } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			await service.lockActiveProfile()

			const unlocked = await service.unlockPasskeyProfile(profile.id)
			expect(unlocked.id).toBe(profile.id)
			const active = await service.getActiveProfile()
			expect(active?.id).toBe(profile.id)
		}, 30_000)

		test("throws 'Invalid profile id' when profile deleted during phase 2", async () => {
			const { service } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			await service.lockActiveProfile()

			const [unlockRes, deleteRes] = await Promise.allSettled([
				service.unlockPasskeyProfile(profile.id),
				service.deleteProfile(profile.id),
			])
			expect(deleteRes.status).toBe("fulfilled")
			if (unlockRes.status === "rejected") {
				expect(unlockRes.reason.message).toMatch(/Invalid profile id/)
			}
			// If unlock won the race, active profile is set but then the
			// facade's deleteProfile closed the session (isActive check).
			const all = await service.getProfiles()
			expect(all.find((p) => p.id === profile.id)).toBeUndefined()
		}, 30_000)
	})

	describe("PATH B (the passkey window)", () => {
		test("an unfinished restore is refused before the passkey window opens", async () => {
			const { api, service, passkeys } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			await service.lockActiveProfile()
			const row = JSON.parse(
				(await api.storage.local.get(`nulo:core:profiles@${profile.id}`))[`nulo:core:profiles@${profile.id}`] as string,
			)
			await new RestorePendingRepository(api.storage.local).write({
				profileId: profile.id,
				pxeGeneration: row.pxeGeneration,
				at: Date.now() - 10,
			})
			const getKey = vi.spyOn(passkeys, "getKey")

			await expect(service.unlockPasskeyProfile(profile.id)).rejects.toBeInstanceOf(RestoreTornError)
			expect(getKey).not.toHaveBeenCalled()
			expect(await service.getActiveProfile()).toBeUndefined()
		}, 30_000)

		// The window must not hand the service an answer for another input: the row would be sealed
		// under a key no unlock at its stored input rebuilds.
		test("create refuses an answer at another PRF input, stores nothing, and tells the window", async () => {
			const { service, passkeys } = await makeService()
			passkeys.answerAt = freshPrfSalt()

			await expect(service.createPasskeyProfile("PK")).rejects.toThrow("Passkey answered for another request")
			expect(await service.getProfiles()).toEqual([])
			expect(await service.getActiveProfile()).toBeUndefined()
			expect(passkeys.outcomes).toEqual(["failed"])
		}, 30_000)

		test("create tells the window it is done once the profile is open", async () => {
			const { service, passkeys } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			expect((await service.getActiveProfile())?.id).toBe(profile.id)
			expect(passkeys.outcomes).toEqual(["done"])
		}, 30_000)

		test("unlock asks the row's input, names the profile on the window, and reports done, or failed for another credential", async () => {
			const { service, passkeys } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			await service.lockActiveProfile()
			passkeys.outcomes.length = 0

			await service.unlockPasskeyProfile(profile.id)
			expect(passkeys.lastDisplay).toEqual({ step: "unlock", profileName: "PK" })
			expect(passkeys.lastPrfSalt).toBe((await service.getPasskeyUnlockParams(profile.id)).prfSalt)
			expect(passkeys.outcomes).toEqual(["done"])

			await service.lockActiveProfile()
			const realGetKey = passkeys.getKey.bind(passkeys)
			vi.spyOn(passkeys, "getKey").mockImplementation((_id, prfSalt, display) => realGetKey("cred-someone-else", prfSalt, display))
			await expect(service.unlockPasskeyProfile(profile.id)).rejects.toThrow(/Invalid profile id/)
			expect(passkeys.outcomes).toEqual(["done", "failed"])
		}, 30_000)

		// The slots opened from the snapshot; a row whose input changed meanwhile is another row.
		test("unlock refuses a row whose input changed while its passkey was asked, and opens nothing", async () => {
			const { api, service, passkeys } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			await service.lockActiveProfile()
			const realGetKey = passkeys.getKey.bind(passkeys)
			vi.spyOn(passkeys, "getKey").mockImplementation(async (id, prfSalt, display) => {
				await writeRawRow(api, profile.id, { ...(await readRawRow(api, profile.id)), prfSalt: freshPrfSalt() })
				return realGetKey(id, prfSalt, display)
			})

			await expect(service.unlockPasskeyProfile(profile.id)).rejects.toThrow(/Invalid profile id/)
			expect(await service.getActiveProfile()).toBeUndefined()
		}, 30_000)

		test("unlock refuses an answer at another input and tells the window", async () => {
			const { service, passkeys } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			await service.lockActiveProfile()
			passkeys.outcomes.length = 0
			passkeys.answerAt = freshPrfSalt()

			await expect(service.unlockPasskeyProfile(profile.id)).rejects.toThrow("Passkey did not open this profile")
			expect(await service.getActiveProfile()).toBeUndefined()
			expect(passkeys.outcomes).toEqual(["failed"])
		}, 30_000)
	})

	/**
	 * Strict Security Mode integration tests.
	 *
	 * The architectural decision: `SessionManager` owns the
	 * bearer-persistence gate. `ProfileService` is unchanged — it still
	 * passes `passhash` to `sessionManager.open(...)` from all four call
	 * sites (`createProfile`, `unlockProfile`, `changeProfilePassword`,
	 * `importPasswordProfile`). `SessionManager` decides whether to
	 * persist.
	 * These tests verify all four caller paths respect strict mode + cover
	 * the toggle race + SW-restart upgrade.
	 */
	describe("Strict Security Mode", () => {
		async function readPersistedBearer(api: FakeBrowserApi): Promise<SessionWrappedSecret | undefined> {
			const raw = await api.storage.session.get("nulo:core:session")
			if (!raw["nulo:core:session"]) return undefined
			const session = JSON.parse(raw["nulo:core:session"] as string) as { bearer?: SessionWrappedSecret }
			return session.bearer
		}

		test("default unlock under strict ON: persisted Session has no bearer", async () => {
			const { api, service } = await makeService({ strict: true })
			const profile = await service.createProfile("P", "pass1234")
			// createProfile already opens a session (no separate unlock needed).
			expect(await readPersistedBearer(api)).toBeUndefined()
			expect(profile.id).toBeDefined()
		}, 30_000)

		test("opt-out unlock keeps bearer (legacy lenient behavior)", async () => {
			const { api, service } = await makeService({ strict: false })
			await service.createProfile("P", "pass1234")
			expect((await readPersistedBearer(api))?.v).toBe(2)
		}, 30_000)

		test("createProfile honors strict mode (gate applies even on profile creation, not just unlock)", async () => {
			const { api, service } = await makeService({ strict: true })
			await service.createProfile("P", "pass1234")
			expect(await readPersistedBearer(api)).toBeUndefined()
		}, 30_000)

		test("changeProfilePassword honors strict mode (gate applies on re-open after password change)", async () => {
			const { api, service } = await makeService({ strict: true })
			const profile = await service.createProfile("P", "oldpass1")
			expect(await readPersistedBearer(api)).toBeUndefined() // create was strict

			await service.changeProfilePassword(profile.id, "oldpass1", "newpass1")
			// changeProfilePassword reopens the session with the new credentials
			// — still must respect strict mode.
			expect(await readPersistedBearer(api)).toBeUndefined()
		}, 30_000)

		test("importMnemonic honors strict mode (gate applies on import-then-open)", async () => {
			const { api, service } = await makeService({ strict: true })
			await service.importMnemonic("Imported", await wordsForFill(0x2e), "pass1234")
			// importPasswordProfile reopens the session as part of the import flow
			// — must respect strict mode.
			expect(await readPersistedBearer(api)).toBeUndefined()
		}, 30_000)

		test("toggle ON during unlocked session: bearer cleared from persisted record + in-memory", async () => {
			const { api, config, service } = await makeService({ strict: false })
			await service.createProfile("P", "pass1234")
			expect((await readPersistedBearer(api))?.v).toBe(2)

			config.set("strictSecurityMode", true)
			// onConfigUpdated fires `void clearBearer()` — flush microtasks.
			await Promise.resolve()
			await Promise.resolve()
			await Promise.resolve()
			await Promise.resolve()

			expect(await readPersistedBearer(api)).toBeUndefined()
			// Master secret survives toggle — wallet stays unlocked.
			const active = await service.getActiveProfile()
			expect(active).toBeDefined()
		}, 30_000)

		test("toggle OFF during strict session: no immediate backfill", async () => {
			const { api, config, service } = await makeService({ strict: true })
			await service.createProfile("P", "pass1234")
			expect(await readPersistedBearer(api)).toBeUndefined()

			config.set("strictSecurityMode", false)
			await Promise.resolve()
			await Promise.resolve()

			// Session storage stays bearer-less; bearer reappears on the
			// NEXT unlock (after the user manually locks + unlocks).
			expect(await readPersistedBearer(api)).toBeUndefined()
		}, 30_000)

		test("toggle OFF + relock + unlock: bearer is restored on the next unlock", async () => {
			const { api, config, service } = await makeService({ strict: true })
			const profile = await service.createProfile("P", "pass1234")

			config.set("strictSecurityMode", false)
			await Promise.resolve()
			await Promise.resolve()

			await service.lockActiveProfile()
			await service.unlockProfile(profile.id, "pass1234")

			// Now the bearer is back — confirms toggle OFF takes effect on
			// next unlock.
			expect((await readPersistedBearer(api))?.v).toBe(2)
		}, 30_000)

		test("SW restart simulation: legacy passhash record → silentClose + profile still unlockable (upgrade-path safety)", async () => {
			// A build that predates the bearer persisted a password-equivalent `passhash` string.
			// After upgrade, restore() must NEVER accept it — the profile
			// record is intact, so the user re-unlocks ONCE. This proves the
			// no-re-registration invariant end-to-end: no wipe, no re-create.
			const { api } = await makeService({ strict: false })
			const profile = await (async () => {
				const built = await makeServiceFromExistingApi(api, { strict: false })
				const p = await built.service.createProfile("P", "pass1234")
				await built.service.lockActiveProfile() // clears the session
				return p
			})()

			// Hand-seed a genuine legacy passhash session as an old build left it.
			await api.storage.session.set({
				[SESSION_STORAGE_ROOT]: JSON.stringify({
					profile: profile.id,
					passhash: Buffer.from(new ArrayBuffer(8)).toString("base64"),
					since: Date.now(),
					lockedAt: Date.now() + 1_800_000,
				}),
			})

			// SW restart. restore() sees the legacy passhash → silentClose,
			// regardless of strict mode (the legacy shape is never trusted).
			const { service: service2 } = await makeServiceFromExistingApi(api, { strict: false })
			expect(await service2.getActiveProfile()).toBeUndefined() // lock-screen state
			const raw = await api.storage.session.get(SESSION_STORAGE_ROOT)
			expect(SESSION_STORAGE_ROOT in raw).toBe(false) // legacy record cleaned up

			// The profile is untouched: the SAME password unlocks it — no
			// re-registration, no data loss.
			const reunlocked = await service2.unlockProfile(profile.id, "pass1234")
			expect(reunlocked.id).toBe(profile.id)
			expect((await readPersistedBearer(api))?.v).toBe(2) // fresh bearer on re-unlock
		}, 30_000)

		test("SW restart simulation: clean strict session + strict ON → no in-memory restore (passkey-equivalent)", async () => {
			const { api } = await makeService({ strict: true })
			const built = await makeServiceFromExistingApi(api, { strict: true })
			await built.service.createProfile("P", "pass1234")

			// Fresh ProfileService against the same api with strict ON.
			const { service: service2 } = await makeServiceFromExistingApi(api, { strict: true })
			// Persisted Session has no bearer (strict open never wrote one).
			// restore() takes the `!session.bearer` branch → silentClose.
			expect(await service2.getActiveProfile()).toBeUndefined()
		}, 30_000)

		test("SW restart simulation: lenient session + strict OFF → silent restore (lenient path intact)", async () => {
			const { api } = await makeService({ strict: false })
			const built = await makeServiceFromExistingApi(api, { strict: false })
			await built.service.createProfile("P", "pass1234")
			expect((await readPersistedBearer(api))?.v).toBe(2)

			const { service: service2 } = await makeServiceFromExistingApi(api, { strict: false })
			// Persisted bearer + strict OFF → silent restore.
			const active = await service2.getActiveProfile()
			expect(active).toBeDefined()
		}, 30_000)

		test("passkey profile + strict ON: behavior unchanged (no bearer to begin with)", async () => {
			const { api, service } = await makeService({ strict: true })
			const profile = await service.createPasskeyProfile("PK")
			expect(profile.type).toBe("passkey")
			expect(await readPersistedBearer(api)).toBeUndefined()
		}, 30_000)
	})

	describe("an adopted id starts with no UI keys", () => {
		const PIN = JSON.stringify({ 1: ["0xc0ffee"] })
		const keysOf = async (api: FakeBrowserApi) => Object.keys(await api.storage.local.get(null))
		const writesFor = (log: string[], id: string) => log.filter((entry) => entry.endsWith(`@${id}`))

		test("a restore that keeps its backup's id removes that id's pins before the marker and the row; another profile's stay", async () => {
			const { api, service } = await makeService()
			await api.storage.local.set({ [pinnedTokensKey("abc12345")]: PIN, [pinnedTokensKey("feed0001")]: PIN })
			const writes = recordWrites(api.storage.local, "nulo:")

			const out = await service.restore({ id: "abc12345", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			writes.restore()

			expect(out.id).toBe("abc12345")
			expect(writesFor(writes.log, "abc12345")).toEqual([
				...profileUiKeys("abc12345").map((key) => `remove:${key}`),
				`set:${RESTORE_PENDING_ROOT}@abc12345`,
				"set:nulo:core:profiles@abc12345",
				`set:${profileImportedKey("abc12345")}`,
			])
			expect(await keysOf(api)).toContain(pinnedTokensKey("feed0001"))
		}, 30_000)

		test("a removal that rejects fails the restore before its marker or row is written", async () => {
			const { api, service } = await makeService()
			const remove = api.storage.local.remove.bind(api.storage.local)
			api.storage.local.remove = async (keys) => {
				if ([keys].flat().some((key) => key.startsWith("nulo:ui:"))) throw new Error("storage refused")
				await remove(keys)
			}

			const outcome = await service
				.restore({ id: "abc12345", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
				.catch((error: unknown) => ({ restoreError: String(error) }))

			expect("restoreError" in outcome && outcome.restoreError).toMatch(/storage refused/)
			expect((await keysOf(api)).filter((key) => key.endsWith("@abc12345"))).toEqual([])
		}, 30_000)
	})

	describe("an import records its profile as imported; a create beside another profile, as not first", () => {
		type Built = Awaited<ReturnType<typeof makeService>>
		const flag = async (api: FakeBrowserApi, key: string) => (await api.storage.local.get(key))[key]
		const imported = (api: FakeBrowserApi, id: string) => flag(api, profileImportedKey(id))
		const notFirst = (api: FakeBrowserApi, id: string) => flag(api, profileNotFirstKey(id))

		test.each<[string, (built: Built) => Promise<{ id: string }>]>([
			["a phrase import", async ({ service }) => service.importMnemonic("M", await wordsForFill(0x51), "pass1234")],
			[
				"a password backup restore",
				async ({ service }) => service.restore({ id: "r", name: "R", type: "password" }, await restoreSecretFor(0x52), "pass1234"),
			],
		])(
			"%s marks its profile",
			async (_label, run) => {
				const built = await makeService()
				const { id } = await run(built)
				expect(await imported(built.api, id)).toBe(true)
			},
			30_000,
		)

		test.each<[string, (built: Built) => Promise<{ id: string }>]>([
			["a password create", ({ service }) => service.createProfile("P", "pass1234")],
			["a passkey create", async ({ service }) => service.createPasskeyProfile("PK", await newPasskeyAnswer("cred-new-1"))],
		])(
			"%s of the install's first profile marks neither (control)",
			async (_label, run) => {
				const built = await makeService()
				const { id } = await run(built)
				expect(await imported(built.api, id)).toBeUndefined()
				expect(await notFirst(built.api, id)).toBeUndefined()
			},
			30_000,
		)

		test.each<[string, (built: Built) => Promise<{ id: string }>]>([
			["a password create", ({ service }) => service.createProfile("B", "pass1234")],
			["a passkey create", async ({ service }) => service.createPasskeyProfile("PK", await newPasskeyAnswer("cred-new-2"))],
		])(
			"%s beside another profile marks it not first after its row and before the session switches to it",
			async (_label, run) => {
				const built = await makeService()
				await built.service.createProfile("A", "pass1234")
				const writes = recordWrites(built.api.storage.local, "nulo:")
				built.service.onActiveProfileChanged.add(() => writes.log.push("active"))
				const { id } = await run(built)
				writes.restore()
				const row = `set:nulo:core:profiles@${id}`
				const mark = `set:${profileNotFirstKey(id)}`
				expect(writes.log.filter((entry) => entry === row || entry === mark || entry === "active")).toEqual([row, mark, "active"])
				expect(await imported(built.api, id)).toBeUndefined()
			},
			30_000,
		)

		test.each<[string, (built: Built) => Promise<{ id: string }>]>([
			["a password create", ({ service }) => service.createProfile("B", "pass1234")],
			["a passkey create", async ({ service }) => service.createPasskeyProfile("PK", await newPasskeyAnswer("cred-new-3"))],
		])(
			"%s beside an imported profile is not first, and the imported one stays imported alone",
			async (_label, run) => {
				const built = await makeService()
				const { api } = built
				const first = await built.service.importMnemonic("M", await wordsForFill(0x55), "pass1234")
				const { id } = await run(built)
				expect(await notFirst(api, id)).toBe(true)
				expect(await imported(api, id)).toBeUndefined()
				expect(await imported(api, first.id)).toBe(true)
				expect(await notFirst(api, first.id)).toBeUndefined()
			},
			30_000,
		)

		test("an import beside another profile is marked imported, not not-first", async () => {
			const { api, service } = await makeService()
			await service.createProfile("A", "pass1234")
			const { id } = await service.importMnemonic("M", await wordsForFill(0x54), "pass1234")
			expect(await imported(api, id)).toBe(true)
			expect(await notFirst(api, id)).toBeUndefined()
		}, 30_000)

		test("a profile whose deletion has begun is no other profile", async () => {
			const { api, service } = await makeService()
			const a = await service.createProfile("A", "pass1234")
			service.getDeletionState().beginDeletion(a.id)
			const b = await service.createProfile("B", "pass1234")
			expect((await service.getActiveProfile())?.id).toBe(b.id)
			expect(await notFirst(api, b.id)).toBeUndefined()
		}, 30_000)

		test("a later profile stays not first when the first is deleted; with none left, the next is first", async () => {
			const { api, service } = await makeService()
			service.setDeletionDelegate(purgingDelegate(api))
			const a = await service.createProfile("A", "pass1234")
			const b = await service.createProfile("B", "pass1234")
			await service.deleteProfile(a.id)
			expect(await notFirst(api, b.id)).toBe(true)
			await service.deleteProfile(b.id)
			expect(await notFirst(api, b.id)).toBeUndefined()
			const c = await service.createProfile("C", "pass1234")
			expect((await service.getActiveProfile())?.id).toBe(c.id)
			expect(await notFirst(api, c.id)).toBeUndefined()
		}, 60_000)

		test("a refused not-first write still completes the create", async () => {
			const { api, service } = await makeService()
			await service.createProfile("A", "pass1234")
			const set = api.storage.local.set.bind(api.storage.local)
			api.storage.local.set = async (items) => {
				if (Object.keys(items).some((key) => key.startsWith("nulo:ui:profileNotFirst@"))) throw new Error("storage refused")
				await set(items)
			}
			const profile = await service.createProfile("B", "pass1234")
			expect((await service.getActiveProfile())?.id).toBe(profile.id)
			expect(await notFirst(api, profile.id)).toBeUndefined()
		}, 30_000)

		test("a refused flag write still completes the import", async () => {
			const { api, service } = await makeService()
			const set = api.storage.local.set.bind(api.storage.local)
			api.storage.local.set = async (items) => {
				if (Object.keys(items).some((key) => key.startsWith("nulo:ui:profileImported@"))) throw new Error("storage refused")
				await set(items)
			}
			const profile = await service.importMnemonic("M", await wordsForFill(0x53), "pass1234")
			expect((await service.getActiveProfile())?.id).toBe(profile.id)
			expect(await imported(api, profile.id)).toBeUndefined()
		}, 30_000)
	})

	/**
	 * Backup-import: restore() + finalizeRestore() contract.
	 *
	 * `restore()` writes the profile only — NO session open, NO
	 * `onActiveProfileChanged` emit. The session is opened explicitly via
	 * `finalizeRestore()` after the caller has finished restoring backup data
	 * (networks / accounts / etc.). This split prevents
	 * `app.vue:onActiveProfileChanged` from racing the rest of the import
	 * (it would otherwise call `getOrInitNetworks` + `ensureDefaultAccount`
	 * against an empty profile, seeding duplicate networks / addresses).
	 */
	describe("restore + finalizeRestore", () => {
		// 32-byte base64 master key used for restore() password-profile path.

		test("restore() writes the profile but does NOT open a session", async () => {
			const { service } = await makeService()

			const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")

			expect("restoreError" in out && out.restoreError).toBeFalsy()
			// Profile is in storage but no session.
			expect((await service.getProfiles()).find((p) => p.id === out.id)).toBeDefined()
			expect(await service.getActiveProfile()).toBeUndefined()
		}, 30_000)

		// A password restore keeps a free backup id, so the file would otherwise choose this
		// profile's storage keys; only the shape the wallet generates is kept.
		test.each<[string, unknown]>([
			["a string of another shape", "x@y"],
			["an array whose text is generated-shaped", ["abc12345"]],
		])(
			"restore() replaces %s with a fresh generated id",
			async (_, id) => {
				const { service } = await makeService()
				const out = await service.restore(
					{ id, name: "P", type: "password" } as ProfileInfo,
					await restoreSecretFor(11),
					"pass1234",
				)
				if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))
				expect(out.id).toMatch(/^[0-9a-f]{8}$/)
				expect(out.id).not.toBe("abc12345")
			},
			30_000,
		)

		test("restore() keeps a free generated-shaped id and rerolls a taken one", async () => {
			const { service } = await makeService()
			const first = await service.restore({ id: "abc12345", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			const second = await service.restore({ id: "abc12345", name: "Q", type: "password" }, await restoreSecretFor(12), "pass1234")
			expect(first.id).toBe("abc12345")
			expect(second.id).toMatch(/^[0-9a-f]{8}$/)
			expect(second.id).not.toBe("abc12345")
		}, 30_000)

		test("finalizeRestore() opens the session with the supplied password and emits onActiveProfileChanged", async () => {
			const { service } = await makeService()

			const events: Array<{ id: string } | undefined> = []
			service.onActiveProfileChanged.add((p) => events.push(p))

			const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))

			// No emit happened during restore — sanity-check before finalize.
			expect(events).toEqual([])

			const { profile: active, fence } = await service.finalizeRestore(out.id, "pass1234")
			expect(active.id).toBe(out.id)
			await expect(service.assertRunFence(fence)).resolves.toBeUndefined()
			expect(service.isFenceLive(fence)).toBe(true)
			expect((await service.getActiveProfile())?.id).toBe(out.id)
			expect(events.length).toBe(1)
			expect(events[0]?.id).toBe(out.id)
		}, 30_000)

		test("finalizeRestore() returns the fence of the session it opened, which a same-id successor ends", async () => {
			const { service } = await makeService()
			const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			const { fence } = await service.finalizeRestore(out.id, "pass1234")
			expect(fence.profileId).toBe(out.id)
			expect(service.isFenceLive(fence)).toBe(true)

			await service.lockActiveProfile()
			await service.deleteProfile(out.id)
			const again = await service.restore({ id: out.id, name: "P", type: "password" }, await restoreSecretFor(12), "pass1234")
			expect(again.id).toBe(out.id)
			const { fence: successor } = await service.finalizeRestore(again.id, "pass1234")

			expect(service.isFenceLive(fence)).toBe(false)
			await expect(service.assertRunFence(fence)).rejects.toThrow()
			expect(service.isFenceLive(successor)).toBe(true)
		}, 30_000)

		test("finalizeRestore() captures its fence in the hold that opened the session: a lock queued behind it ends that fence", async () => {
			const { service } = await makeService()
			const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			const finalizing = service.finalizeRestore(out.id, "pass1234")
			const locking = service.lockActiveProfile()

			const { fence } = await finalizing
			await locking

			expect(fence.profileId).toBe(out.id)
			expect(service.isFenceLive(fence)).toBe(false)
			await expect(service.assertRunFence(fence)).rejects.toBeInstanceOf(SessionEndedError)
		}, 30_000)

		test("finalizeRestore() with wrong password throws InvalidPasswordError; profile stays in storage", async () => {
			const { service } = await makeService()
			const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))

			await expect(service.finalizeRestore(out.id, "wrong-pass")).rejects.toBeInstanceOf(InvalidPasswordError)
			// Still in storage, still no session — user can retry or fall back to /popup/auth.
			expect((await service.getProfiles()).find((p) => p.id === out.id)).toBeDefined()
			expect(await service.getActiveProfile()).toBeUndefined()
		}, 30_000)

		test("finalizeRestore() is idempotent: a second call on an already-active session is a no-op", async () => {
			const { service } = await makeService()
			const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))

			await service.finalizeRestore(out.id, "pass1234")
			const events: Array<{ id: string } | undefined> = []
			service.onActiveProfileChanged.add((p) => events.push(p))

			await service.finalizeRestore(out.id, "pass1234") // second call
			expect(events.length).toBe(0) // no second emit
			expect((await service.getActiveProfile())?.id).toBe(out.id)
		}, 30_000)

		test("finalizeRestore() throws when the profile no longer exists (rollback case)", async () => {
			const { service } = await makeService()
			const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))

			await service.deleteProfile(out.id)
			await expect(service.finalizeRestore(out.id, "pass1234")).rejects.toThrow(/Invalid profile id/)
		}, 30_000)

		// One backup body for both methods: a passkey profile's backup restores as a password profile
		// under the file password, and nothing about the passkey survives into the new row.
		test("a passkey profile's backup restores as a password profile under the file password", async () => {
			const { api, service } = await makeService()
			const out = await service.restore({ id: "abc12345", name: "PK", type: "passkey" }, await restoreSecretFor(11), "file-pass1")
			if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))
			expect(out.type).toBe("password")
			const row = await readRawRow(api, out.id)
			expect(row.type).toBe("password")
			expect(row).not.toHaveProperty("credentialId")
			expect(row).not.toHaveProperty("prfSalt")
			await service.finalizeRestore(out.id, "file-pass1")
			expect((await service.getActiveProfile())?.id).toBe(out.id)
			expect(await service.exportMnemonic(out.id, "file-pass1")).toEqual(await wordsForFill(11))
		}, 30_000)

		test("an explicit lock wipes and drops every pending rewrap context, even when the close fails", async () => {
			const { service } = await makeService()
			const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))
			// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
			const internals = service as any
			const buffers: Uint8Array[] = []
			for (const e of internals.pendingDekRewraps.values()) buffers.push(e.sourceDek, e.destinationDek)
			expect(buffers).toHaveLength(2)
			// The sweep runs before the close, so a close that fails cannot leave the stash alive.
			vi.spyOn(internals.sessionManager, "close").mockRejectedValue(new Error("close failed"))
			await expect(service.lockActiveProfile()).rejects.toThrow("close failed")
			expect(internals.pendingDekRewraps.size).toBe(0)
			expect(buffers.every((b) => b.every((x) => x === 0))).toBe(true)
			expect(await service.consumeDekRewrapContext(out.id)).toBeUndefined()
		}, 30_000)

		test("deleteProfile drops the pending rewrap context, and finalize then refuses the id", async () => {
			const { service } = await makeService()
			const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))
			await service.deleteProfile(out.id)
			expect(await service.consumeDekRewrapContext(out.id)).toBeUndefined()
			await expect(service.finalizeRestore(out.id, "pass1234")).rejects.toThrow(/Invalid profile id/)
		}, 30_000)

		test("restore() password path with invalid master key length throws, no session", async () => {
			const { service } = await makeService()

			// The 32-byte guard is an early-throw (before the try-catch), so
			// callers see a thrown Error rather than `{restoreError}`. The
			// guarantee that matters is "no session, no orphan profile" —
			// both verified below.
			await expect(
				service.restore(
					{ id: "ignored", name: "P", type: "password" },
					{
						masterKey: asBase64MasterSecret(Buffer.from(new Uint8Array(16)).toString("base64")), // 16 bytes, not 32
						entropy: Buffer.from(new Uint8Array(32)).toString("base64"),
						importedKeysDek: RESTORE_DEK_B64,
					},
					"pass1234",
				),
			).rejects.toThrow(/master key length/i)
			expect(await service.getActiveProfile()).toBeUndefined()
			expect(await service.getProfiles()).toEqual([])
		}, 30_000)

		test.each([
			["no entropy", { entropy: "" }, /Invalid entropy length/],
			["no imported-keys carrier", { importedKeysDek: "" }, /Invalid imported-keys dek length/],
			[
				"entropy whose words derive another master",
				{ entropy: Buffer.from(new Uint8Array(32).fill(12)).toString("base64") },
				/does not derive/,
			],
		])(
			"restore refuses a secret with %s before any write",
			async (_label, damage, refusal) => {
				const { api, service } = await makeService()
				const secret = { ...(await restoreSecretFor(11)), ...damage }
				await expect(service.restore({ id: "abc12345", name: "P", type: "password" }, secret, "pass1234")).rejects.toThrow(refusal)
				expect(await service.getProfiles()).toEqual([])
				expect(Object.keys(await api.storage.local.get(null)).filter((key) => key.endsWith("@abc12345"))).toEqual([])
			},
			30_000,
		)

		test("restore + finalize password profile survives a simulated SW restart via chrome.storage.session", async () => {
			const { service, api } = await makeService()
			const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
			if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))
			await service.finalizeRestore(out.id, "pass1234")
			expect((await service.getActiveProfile())?.id).toBe(out.id)

			// Simulate an MV3 SW restart: a fresh ProfileService over the SAME persisted
			// storage must rehydrate the password session from chrome.storage.session.
			const { service: service2 } = await makeServiceFromExistingApi(api)
			expect((await service2.getActiveProfile())?.id).toBe(out.id)
		}, 30_000)
	})

	// The browserApi port carries alarms as well as storage, so the proactive TTL auto-lock is live
	// wherever ProfileService is constructed.
	describe("ProfileService composition seam — proactive TTL activation", () => {
		test("SessionManager subscribes to the proactive-TTL alarm", () => {
			const api = new FakeBrowserApi()
			api.reset()
			const onAlarm = vi.spyOn(api.alarms, "onAlarm")
			const config = fakeConfig()
			const logger = new LoggerStore(config)
			new ProfileService(config, logger, api)
			expect(onAlarm).toHaveBeenCalledTimes(1)
		})
	})

	// Proactive-TTL alarm-vs-refresh RACE fix.
	// The alarm's close() is routed through ProfileService.runExclusive (the facade lock),
	// so it cannot interleave with a refreshSession() storage write-back. Without that, a
	// refresh().set() landing after the alarm close().delete() would resurrect an expired
	// session on the next SW restore (a TTL bypass).
	describe("TTL alarm-vs-refresh race (serialized close)", () => {
		async function fireTtlAlarm(scheduledTime: number): Promise<void> {
			const { fakeBrowser } = await import("@webext-core/fake-browser")
			fakeBrowser.alarms.onAlarm.trigger({
				name: SESSION_TTL_ALARM_NAME,
				scheduledTime,
				periodInMinutes: undefined,
			} as chrome.alarms.Alarm)
		}
		const readLockedAt = async (api: FakeBrowserApi): Promise<number> => {
			const raw = await api.storage.session.get(SESSION_STORAGE_ROOT)
			return (JSON.parse(raw[SESSION_STORAGE_ROOT] as string) as { lockedAt: number }).lockedAt
		}

		test("alarm firing during refreshSession()'s write-back does NOT delete the session mid-write; session stays consistent", async () => {
			const { api, service } = await makeService(60_000)
			const profile = await service.createProfile("P", "pass1234")
			await service.unlockProfile(profile.id, "pass1234")
			const oldLockedAt = await readLockedAt(api)

			// Block the NEXT storage.session.set (refreshSession's write-back) so refresh
			// parks WHILE holding the facade lock.
			let releaseSet!: () => void
			const blocked = new Promise<void>((r) => {
				releaseSet = r
			})
			const sessionArea = api.storage.session
			const origSet = sessionArea.set.bind(sessionArea)
			let armed = true
			sessionArea.set = async (items: Record<string, unknown>) => {
				if (armed) {
					armed = false
					await blocked
				}
				return origSet(items)
			}

			const refreshP = service.refreshSession()
			await flushPromises() // let refresh acquire the lock + park at the blocked set

			// Fire the (now-old) alarm while refresh holds the lock. onAlarmFired routes
			// close() through runExclusive → it BLOCKS on the facade lock.
			await fireTtlAlarm(oldLockedAt)
			await flushPromises()

			// MID-STATE: the alarm's close is serialized behind refresh — it must NOT have
			// deleted the session. (In the un-fixed code the close ran concurrently here.)
			// NB: probe via storage.get (lock-free) — `service.getActiveProfile()` here would
			// block on the facade lock the parked refresh still holds.
			const midRaw = await api.storage.session.get(SESSION_STORAGE_ROOT)
			expect(midRaw[SESSION_STORAGE_ROOT]).toBeDefined()

			// Release refresh's write-back → it finishes (bumps lockedAt + reschedules) +
			// releases the lock → the queued alarm-close runs, finds the gate stale
			// (oldLockedAt ≠ new lockedAt), and no-ops. Session stays active + consistent.
			releaseSet()
			await refreshP
			await flushPromises()

			// Whatever the serialized outcome (refresh-won → extended/active, or alarm-won →
			// locked), in-memory state and a fresh SW restore must AGREE. The bug this fixes is
			// the resurrection HYBRID: the alarm clears memory while a racing refresh re-persists
			// the session, so restore() silently un-expires it. Asserting agreement catches that.
			const memActive = (await service.getActiveProfile()) !== undefined
			const restarted = await makeServiceFromExistingApi(api, { sessionTtl: 60_000 })
			const restoredActive = (await restarted.service.getActiveProfile()) !== undefined
			expect(restoredActive).toBe(memActive)
		}, 30_000)
	})

	// TTL residual: the CONFIG-driven session writebacks — applyTtlChange
	// (sessionTtl change) and clearBearer (strictSecurityMode toggle) — are now
	// ALSO routed through ProfileService.runExclusive, like the alarm close. Before,
	// they ran lock-free and could interleave with a refreshSession() write-back:
	// a TTL-shorten close could be resurrected (TTL bypass), and clearBearer's
	// stale-snapshot write could clobber a newer lockedAt (lost update).
	describe("config-driven writeback vs refresh race (serialized)", () => {
		const readRoot = async (api: FakeBrowserApi): Promise<string | undefined> => {
			const raw = await api.storage.session.get(SESSION_STORAGE_ROOT)
			return raw[SESSION_STORAGE_ROOT] as string | undefined
		}
		const readSession = async (api: FakeBrowserApi): Promise<{ lockedAt?: number; bearer?: SessionWrappedSecret }> => {
			const raw = await api.storage.session.get(SESSION_STORAGE_ROOT)
			return JSON.parse(raw[SESSION_STORAGE_ROOT] as string)
		}
		/** Arm a one-shot block on the next storage.session.set so the next writer
		 *  (refresh) parks WHILE holding the facade lock. Returns the release fn. */
		function blockNextSessionSet(api: FakeBrowserApi): () => void {
			let release!: () => void
			const blocked = new Promise<void>((r) => {
				release = r
			})
			const area = api.storage.session
			const origSet = area.set.bind(area)
			let armed = true
			area.set = async (items: Record<string, unknown>) => {
				if (armed) {
					armed = false
					await blocked
				}
				return origSet(items)
			}
			return release
		}

		test("a sessionTtl shorten-to-elapsed close during refresh's write-back does NOT resurrect the session", async () => {
			const { api, config, service } = await makeService(60_000)
			const profile = await service.createProfile("P", "pass1234")
			await service.unlockProfile(profile.id, "pass1234")

			const releaseSet = blockNextSessionSet(api)
			const refreshP = service.refreshSession()
			await flushPromises() // refresh acquires the lock + parks at the blocked set (bumped `since`)

			// Shorten the TTL to ~0 → onConfigUpdated fires applyTtlChange, now routed
			// through runExclusive → it BLOCKS behind the parked refresh.
			config.set("sessionTtl", 1)
			await flushPromises()
			// Advance real time so applyTtlChange's `since + 1 <= now` close branch is
			// deterministic once it runs.
			await new Promise((r) => setTimeout(r, 25))

			// MID-STATE: neither refresh's set nor applyTtlChange's close has run — the
			// session is still in storage (not deleted mid-write).
			expect(await readRoot(api)).toBeDefined()

			// Release refresh → it persists (bumped lockedAt) + releases the lock → the
			// queued applyTtlChange runs, takes the close branch (TTL elapsed), deletes.
			releaseSet()
			await refreshP
			await flushPromises()

			// Memory + a fresh SW restore must AGREE (no resurrection hybrid).
			const memActive = (await service.getActiveProfile()) !== undefined
			const restarted = await makeServiceFromExistingApi(api, { sessionTtl: 1 })
			const restoredActive = (await restarted.service.getActiveProfile()) !== undefined
			expect(restoredActive).toBe(memActive)
			expect(memActive).toBe(false) // TTL shortened-past-elapsed → locked
		}, 30_000)

		test("enabling strict mode during refresh's write-back drops the bearer WITHOUT reverting the bumped lockedAt", async () => {
			const { api, config, service } = await makeService(60_000) // lenient → bearer persisted
			const profile = await service.createProfile("P", "pass1234")
			await service.unlockProfile(profile.id, "pass1234")
			expect((await readSession(api)).bearer).toBeDefined() // lenient bearer cached
			const lockedAtBeforeRefresh = (await readSession(api)).lockedAt as number

			// Ensure refresh bumps `since` strictly past unlock so a stale-snapshot
			// clobber (the bug) would be DETECTABLE as a reverted (smaller) lockedAt.
			await new Promise((r) => setTimeout(r, 12))

			const releaseSet = blockNextSessionSet(api)
			const refreshP = service.refreshSession()
			await flushPromises() // refresh parks holding the lock (in-memory bearer still present)

			// Toggle strict ON → clearBearer() routed through runExclusive → BLOCKS
			// behind the parked refresh.
			config.set("strictSecurityMode", true)
			await flushPromises()

			// Release refresh → persists {bumped lockedAt, bearer present} + releases
			// lock → queued clearBearer runs, re-reads the bumped session, drops the
			// bearer, persists THAT object (not a stale pre-refresh snapshot).
			releaseSet()
			await refreshP
			await flushPromises()

			expect((await service.getActiveProfile()) !== undefined).toBe(true) // strict ≠ force-lock
			const persisted = await readSession(api)
			expect(persisted.bearer).toBeUndefined() // bearer dropped — strict enforced
			// The bumped lockedAt survived: a stale-snapshot write would have reverted it
			// to the pre-refresh value. (Strict deliberately drops the cross-restart bearer,
			// so a SW-restart agreement check does NOT apply here — that's expected, not a hybrid.)
			expect(persisted.lockedAt).toBeGreaterThan(lockedAtBeforeRefresh)
		}, 30_000)
	})
})

describe("ProfileService — deletion coordinator integration (finding D)", () => {
	test("a FAILED purge keeps the tombstone → the id stays reserved (no successor-clobber)", async () => {
		const { service } = await makeService()
		// A delegate whose purge fails, simulating a SW-kill / retryable failure.
		service.setDeletionDelegate({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async () => {
				throw new Error("purge interrupted")
			},
		})
		const p = await service.createProfile("A", "password123")

		await expect(service.deleteProfile(p.id)).rejects.toThrow(/purge interrupted/)

		// The profile row is gone AND it's tombstoned → absent to every read.
		expect((await service.getProfiles()).map((x) => x.id)).not.toContain(p.id)
		// A new profile can NEVER be handed the tombstoned id (fail-closed reservation).
		const q = await service.createProfile("B", "password123")
		expect(q.id).not.toBe(p.id)
	})

	test("a SUCCESSFUL purge clears the tombstone + releases the id", async () => {
		const { service } = await makeService() // default no-op (success) delegate
		const p = await service.createProfile("A", "password123")
		await service.deleteProfile(p.id)
		expect(await service.getProfiles()).toHaveLength(0)
	})

	test("resumePendingDeletions finishes an interrupted delete on the next boot", async () => {
		const { api } = await makeService()
		// First boot: a delete whose purge fails leaves a tombstone behind.
		const boot1 = new ProfileService(fakeConfig({}), new LoggerStore(fakeConfig({})), api)
		const c1 = new ServiceCollection()
		c1.add(new FakePasskeyService(new LoggerStore(fakeConfig({}))))
		c1.add(boot1)
		await c1.start()
		boot1.setDeletionDelegate({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async () => {
				throw new Error("interrupted")
			},
		})
		const p = await boot1.createProfile("A", "password123")
		await expect(boot1.deleteProfile(p.id)).rejects.toThrow()

		// Second boot over the SAME storage: the tombstone is still there.
		const boot2 = new ProfileService(fakeConfig({}), new LoggerStore(fakeConfig({})), api)
		const c2 = new ServiceCollection()
		c2.add(new FakePasskeyService(new LoggerStore(fakeConfig({}))))
		c2.add(boot2)
		await c2.start()
		let resumed = false
		boot2.setDeletionDelegate({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async () => {
				resumed = true
			},
		})
		// Until resume runs, the id is still reserved (deletion pending).
		expect((await boot2.getProfiles()).map((x) => x.id)).not.toContain(p.id)

		await boot2.resumePendingDeletions()

		expect(resumed).toBe(true)
		// A fresh profile can now reuse... no — the id was random; assert the tombstone
		// cleared by confirming a NEW delete of a NEW profile still works cleanly.
		const q = await boot2.createProfile("B", "password123")
		await boot2.deleteProfile(q.id)
		expect(await boot2.getProfiles()).toHaveLength(0)
	})

	test.each([
		["a clean purge releases the id and removes the tombstone", false],
		["a tombstone corrupted during the purge stays, and keeps the id reserved", true],
	])("%s", async (_, corrupt) => {
		const { api, service } = await makeService()
		const p = await service.createProfile("A", "password123")
		const key = `${PROFILE_TOMBSTONE_ROOT}@${p.id}`
		service.setDeletionDelegate({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async () => {
				if (corrupt) await api.storage.local.set({ [key]: "{not json" })
			},
		})
		await service.deleteProfile(p.id)
		expect(service.getDeletionState().isReserved(p.id)).toBe(corrupt)
		expect(key in (await api.storage.local.get(key))).toBe(corrupt)
	})

	describe("a deleted profile leaves no session record", () => {
		const hasRecord = async (api: FakeBrowserApi) => SESSION_STORAGE_ROOT in (await api.storage.session.get(SESSION_STORAGE_ROOT))
		const recordedProfile = async (api: FakeBrowserApi) =>
			(JSON.parse((await api.storage.session.get(SESSION_STORAGE_ROOT))[SESSION_STORAGE_ROOT] as string) as { profile: string })
				.profile

		/** A restart whose restore could not delete the record: no session in memory, the record kept. */
		async function restartKeepingRecord(api: FakeBrowserApi): Promise<ProfileService> {
			vi.spyOn(api.storage.session, "remove").mockRejectedValueOnce(new Error("session remove failed"))
			const { service } = await makeServiceFromExistingApi(api, { strict: true })
			expect(await service.getActiveProfile()).toBeUndefined()
			return service
		}

		test("a delete after a restart that kept the profile's record removes it", async () => {
			const { api, service } = await makeService({ strict: true })
			const pk = await service.createPasskeyProfile("PK")
			const rebooted = await restartKeepingRecord(api)
			expect(await recordedProfile(api)).toBe(pk.id)

			await rebooted.deleteProfile(pk.id)

			expect(await hasRecord(api)).toBe(false)
		}, 30_000)

		test("a deletion resumed at boot removes the record its restart kept", async () => {
			const { api, service } = await makeService({ strict: true })
			const pk = await service.createPasskeyProfile("PK")
			// The worker stops after the tombstone is written and before the row is deleted.
			vi.spyOn((service as unknown as { repo: ProfileRepository }).repo, "delete").mockRejectedValueOnce(new Error("worker stopped"))
			await expect(service.deleteProfile(pk.id)).rejects.toThrow("worker stopped")
			const rebooted = await restartKeepingRecord(api)
			expect(await recordedProfile(api)).toBe(pk.id)

			await rebooted.resumePendingDeletions()

			expect(await hasRecord(api)).toBe(false)
		}, 30_000)

		test.each([
			["another profile's open session stays open", false],
			["the record another profile's restart kept stays", true],
		])(
			"%s",
			async (_, restart) => {
				const { api, service } = await makeService({ strict: true })
				const deleted = await service.createProfile("A", "password123")
				const kept = await service.createPasskeyProfile("PK")
				const current = restart ? await restartKeepingRecord(api) : service

				await current.deleteProfile(deleted.id)

				expect(await recordedProfile(api)).toBe(kept.id)
				expect((await current.getActiveProfile())?.id).toBe(restart ? undefined : kept.id)
			},
			30_000,
		)

		test("an unreadable record stays and the delete completes", async () => {
			const { api, service } = await makeService({ strict: true })
			const pk = await service.createPasskeyProfile("PK")
			await service.lockActiveProfile()
			await api.storage.session.set({ [SESSION_STORAGE_ROOT]: "{not json" })

			await service.deleteProfile(pk.id)

			expect(await service.getProfiles()).toEqual([])
			expect((await api.storage.session.get(SESSION_STORAGE_ROOT))[SESSION_STORAGE_ROOT]).toBe("{not json")
		}, 30_000)
	})

	describe("a delete that arrives before the coordinator has started", () => {
		const noopDelegate = () => ({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async () => {},
		})

		/** A started service whose coordinator has not injected its delegate yet: the boot window in
		 *  which this service already answers RPCs. */
		async function bootWithoutDelegate() {
			const api = new FakeBrowserApi()
			api.reset()
			const config = fakeConfig({})
			const services = new ServiceCollection()
			services.add(new FakePasskeyService(new LoggerStore(config)))
			const service = new ProfileService(config, new LoggerStore(config), api)
			services.add(service)
			await services.start()
			return { api, service }
		}

		const tombstoneKey = (id: string) => `${PROFILE_TOMBSTONE_ROOT}@${id}`

		afterEach(() => {
			vi.useRealTimers()
		})

		test("it waits, holding no lock, and completes once the delegate is set", async () => {
			const { api, service } = await bootWithoutDelegate()
			const p = await service.createProfile("A", "password123")
			vi.useFakeTimers()

			let settled = false
			const deleting = service.deleteProfile(p.id).finally(() => {
				settled = true
			})
			await vi.advanceTimersByTimeAsync(29_000)
			expect(settled).toBe(false)
			// The wait holds no facade lock: another profile operation runs to completion meanwhile.
			await expect(service.changeProfileName(p.id, "Renamed")).resolves.toMatchObject({ name: "Renamed" })
			expect(await api.storage.local.get(tombstoneKey(p.id))).toEqual({})

			service.setDeletionDelegate(noopDelegate())
			await expect(deleting).resolves.toMatchObject({ id: p.id })
			expect(await service.getProfiles()).toEqual([])
		})

		test("with no delegate, it refuses at the bound having written nothing", async () => {
			const { api, service } = await bootWithoutDelegate()
			const p = await service.createProfile("A", "password123")
			vi.useFakeTimers()

			const deleting = service.deleteProfile(p.id).catch((e: unknown) => e)
			await vi.advanceTimersByTimeAsync(30_000)

			expect(((await deleting) as Error).message).toBe("deletion coordinator not ready")
			expect(await api.storage.local.get(tombstoneKey(p.id))).toEqual({})
			expect((await service.getProfiles()).map((x) => x.id)).toEqual([p.id])
			expect(service.getDeletionState().isReserved(p.id)).toBe(false)
		})

		test("the init wait and the delegate wait share one budget, so the whole wait never outlasts init's", async () => {
			const { api, service } = await bootWithoutDelegate()
			const p = await service.createProfile("A", "password123")
			const svc = service as unknown as { initialized: boolean }
			vi.useFakeTimers()

			// A delete that arrives before this service has finished its own init.
			svc.initialized = false
			let settled = false
			const deleting = service
				.deleteProfile(p.id)
				.catch((e: unknown) => e)
				.finally(() => {
					settled = true
				})
			await vi.advanceTimersByTimeAsync(20_000)
			svc.initialized = true
			await vi.advanceTimersByTimeAsync(9_000)
			expect(settled).toBe(false)
			await vi.advanceTimersByTimeAsync(1_000)
			expect(settled).toBe(true)

			expect(((await deleting) as Error).message).toBe("deletion coordinator not ready")
			expect(await api.storage.local.get(tombstoneKey(p.id))).toEqual({})
		})

		test.each([
			["set back an hour", -3_600_000],
			["set forward an hour", 3_600_000],
		])("a wall clock %s mid-wait neither stretches nor cuts the budget", async (_, shift) => {
			const { service } = await bootWithoutDelegate()
			const p = await service.createProfile("A", "password123")
			const svc = service as unknown as { initialized: boolean }
			vi.useFakeTimers()

			svc.initialized = false
			let settled = false
			const deleting = service
				.deleteProfile(p.id)
				.catch((e: unknown) => e)
				.finally(() => {
					settled = true
				})
			await vi.advanceTimersByTimeAsync(20_000)
			vi.setSystemTime(Date.now() + shift)
			svc.initialized = true
			await vi.advanceTimersByTimeAsync(9_000)
			expect(settled).toBe(false)
			await vi.advanceTimersByTimeAsync(1_000)
			expect(settled).toBe(true)
			expect(((await deleting) as Error).message).toBe("deletion coordinator not ready")
		})
	})

	test("a tombstone filed under one id but naming another neither hydrates nor deletes the profile it names", async () => {
		const { api, service } = await makeService()
		const named = await service.createProfile("Named", "password123")
		const misfiled: Tombstone = { profileId: named.id, addresses: [], tokenIds: [], networkIds: [], epoch: 7, pxeGeneration: "gen" }
		await api.storage.local.set({ [`${PROFILE_TOMBSTONE_ROOT}@other`]: JSON.stringify(misfiled) })

		const { service: boot2 } = await makeServiceFromExistingApi(api)
		const purged: string[] = []
		boot2.setDeletionDelegate({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async (id: string) => {
				purged.push(id)
			},
		})
		const state = boot2.getDeletionState()
		expect(state.isReserved("other")).toBe(true)
		expect(state.isReserved(named.id)).toBe(false)
		expect(state.capture(named.id)).toBe(0)

		await boot2.resumePendingDeletions()
		expect(purged).toEqual([])
		expect((await boot2.getProfiles()).map((x) => x.id)).toContain(named.id)
		expect(state.isReserved("other")).toBe(true)
	})
})

describe("torn-import sweep on boot resume", () => {
	// A torn import (restore() ran; finalize never did — SW/popup death, transport
	// death, or a persistently-failed compensating delete) leaves the profile row
	// + its restore-pending marker durable. A marker only proves the restore is
	// INCOMPLETE (a password import whose SW died can still finalize via the
	// popup's auto-reconnect), so the sweep proves ABANDONMENT by
	// age: only markers older than TORN_IMPORT_MIN_AGE_MS are reaped. The boot
	// resume must then complete the compensating delete instead of leaving the
	// zombie immortal.
	const AGED = ProfileService.TORN_IMPORT_MIN_AGE_MS + 60 * 60 * 1000 // floor + 1h

	const tornRestore = async (service: ProfileService, id = "ignored") => {
		const out = await service.restore({ id, name: "Torn", type: "password" }, await restoreSecretFor(13), "pass1234", true)
		if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))
		return out
	}

	const markerKey = (id: string) => `${RESTORE_PENDING_ROOT}@${id}`
	const markerRaw = async (api: FakeBrowserApi, id: string) => (await api.storage.local.get(markerKey(id)))[markerKey(id)]

	/** Back-date a real marker so the sweep sees it as aged past the floor. */
	const ageMarker = async (api: FakeBrowserApi, id: string, ageMs = AGED) => {
		const raw = await markerRaw(api, id)
		const marker = JSON.parse(raw as string)
		marker.at = Date.now() - ageMs
		await api.storage.local.set({ [markerKey(id)]: JSON.stringify(marker) })
	}

	test("(RED-1) an ABANDONED torn import (aged past the floor) is completed by the next boot's resume", async () => {
		const { api, service: boot1 } = await makeService()
		const orphan = await tornRestore(boot1)
		// The import dies here: no finalize, and the compensating delete never
		// reached the service (transport death) — row + marker are durable.
		expect(await markerRaw(api, orphan.id)).toBeDefined()
		await ageMarker(api, orphan.id)

		const bootCutoff = Date.now()
		const { service: boot2 } = await makeServiceFromExistingApi(api)
		const purged: string[] = []
		boot2.setDeletionDelegate({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async (id: string) => {
				purged.push(id)
			},
		})

		await boot2.resumePendingDeletions(bootCutoff)

		// The orphan is gone: row deleted, siblings purged, marker cleared.
		expect((await boot2.getProfiles()).map((p) => p.id)).not.toContain(orphan.id)
		expect(purged).toContain(orphan.id)
		expect(await markerRaw(api, orphan.id)).toBeUndefined()
	}, 30_000)

	test("(RED-2) a persistently-failed compensating delete (the tombstone-write window) self-heals at the next boot", async () => {
		const { api, service: boot1 } = await makeService()
		const orphan = await tornRestore(boot1)
		// The rollback's deleteProfile fails CLEANLY at the tombstone WRITE — the
		// exact tombstone-write window: reservation released, nothing durable recorded.
		const realSet = api.storage.local.set.bind(api.storage.local)
		const setSpy = vi.spyOn(api.storage.local, "set").mockImplementation(async (items: Record<string, unknown>) => {
			if (Object.keys(items).some((k) => k.startsWith("nulo:core:profile-tombstones@"))) {
				throw new Error("tombstone write failed")
			}
			return realSet(items)
		})
		await expect(boot1.deleteProfile(orphan.id)).rejects.toThrow(/tombstone write failed/)
		setSpy.mockRestore()
		// Pin territory: NOT reserved, still listed, marker still present.
		expect((await boot1.getProfiles()).map((p) => p.id)).toContain(orphan.id)
		expect(await markerRaw(api, orphan.id)).toBeDefined()

		await ageMarker(api, orphan.id)
		const bootCutoff = Date.now()
		const { service: boot2 } = await makeServiceFromExistingApi(api)
		await boot2.resumePendingDeletions(bootCutoff)

		expect((await boot2.getProfiles()).map((p) => p.id)).not.toContain(orphan.id)
		expect(await markerRaw(api, orphan.id)).toBeUndefined()
	}, 30_000)

	test("a LIVE import's marker (at >= bootCutoff) is never reaped", async () => {
		const { api, service } = await makeService()
		const bootCutoff = Date.now()
		await new Promise((r) => setTimeout(r, 3))
		// The import starts AFTER this lifetime's cutoff — e.g. an import RPC that
		// raced startup. Its marker must be invisible to the sweep (boot-cutoff discipline).
		const live = await tornRestore(service)

		await service.resumePendingDeletions(bootCutoff)

		expect((await service.getProfiles()).map((p) => p.id)).toContain(live.id)
		expect(await markerRaw(api, live.id)).toBeDefined()
	}, 30_000)

	test("an INCOMPLETE-but-young torn import (below the age floor) is NOT reaped — it may still finalize", async () => {
		const { api, service: boot1 } = await makeService()
		const young = await tornRestore(boot1)
		// The SW dies and reboots mid-import; the popup's auto-reconnect could
		// still legitimately finalize a password import — the sweep must wait.
		await new Promise((r) => setTimeout(r, 3))
		const bootCutoff = Date.now()
		const { service: boot2 } = await makeServiceFromExistingApi(api)

		await boot2.resumePendingDeletions(bootCutoff)

		expect((await boot2.getProfiles()).map((p) => p.id)).toContain(young.id)
		expect(await markerRaw(api, young.id)).toBeDefined()
	}, 30_000)

	test("one failing reap does not abort the rest of the sweep (per-marker isolation)", async () => {
		const { api, service: boot1 } = await makeService()
		const first = await tornRestore(boot1, "torn-a")
		const second = await tornRestore(boot1, "torn-b")
		await ageMarker(api, first.id)
		await ageMarker(api, second.id)

		const bootCutoff = Date.now()
		const { service: boot2 } = await makeServiceFromExistingApi(api)
		// The FIRST reap's purge fails (delegate throws for torn-a only) — the
		// sweep must still complete torn-b's compensating delete.
		boot2.setDeletionDelegate({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async (id: string) => {
				if (id === first.id) throw new Error("purge interrupted")
			},
		})

		await boot2.resumePendingDeletions(bootCutoff)

		// torn-a: purge failed post-tombstone → reserved (deletion pending), absent
		// from reads, finished by a later tombstone resume; torn-b: fully completed.
		expect((await boot2.getProfiles()).map((p) => p.id)).not.toContain(second.id)
		expect(await markerRaw(api, second.id)).toBeUndefined()
	}, 30_000)

	test("a torn reap RETAINS its tombstone; the next boot re-purges (late-row cleanup) then releases", async () => {
		const { api, service: boot1 } = await makeService()
		const orphan = await tornRestore(boot1)
		await ageMarker(api, orphan.id)

		const cutoff2 = Date.now()
		const { service: boot2 } = await makeServiceFromExistingApi(api)
		const boot2Purges: string[] = []
		boot2.setDeletionDelegate({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async (id: string) => {
				boot2Purges.push(id)
			},
		})
		await boot2.resumePendingDeletions(cutoff2)
		expect(boot2Purges).toContain(orphan.id)
		// Phase 3 was skipped: the tombstone survives, so a wall-clock-corner
		// loser's late slice writes get re-purged once it has quiesced.
		const tombKeys = Object.keys(await api.storage.local.get()).filter((k) => k.startsWith("nulo:core:profile-tombstones@"))
		expect(tombKeys).toContain(`nulo:core:profile-tombstones@${orphan.id}`)

		// Next boot: the tombstone loop re-purges idempotently, then releases.
		const { service: boot3 } = await makeServiceFromExistingApi(api)
		const boot3Purges: string[] = []
		boot3.setDeletionDelegate({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async (id: string) => {
				boot3Purges.push(id)
			},
		})
		await boot3.resumePendingDeletions(Date.now())
		expect(boot3Purges).toContain(orphan.id)
		const tombKeysAfter = Object.keys(await api.storage.local.get()).filter((k) => k.startsWith("nulo:core:profile-tombstones@"))
		expect(tombKeysAfter).not.toContain(`nulo:core:profile-tombstones@${orphan.id}`)
		// Fully settled: a fresh delete lifecycle still works end-to-end.
		const q = await boot3.createProfile("B", "password123")
		await boot3.deleteProfile(q.id)
		expect((await boot3.getProfiles()).map((p) => p.id)).not.toContain(q.id)
	}, 30_000)

	test("a finalize that lands BEFORE the reap wins: the marker guard refuses the delete (finalized profile survives)", async () => {
		const { api, service: boot1 } = await makeService()
		const orphan = await tornRestore(boot1)
		await ageMarker(api, orphan.id) // aged past the floor → sweep-eligible

		// The popup's finalize arrives first (auto-reconnect continuation): it
		// clears the marker under the facade lock and opens the session. The
		// generation is UNCHANGED — only the marker guard can save the profile.
		await boot1.finalizeRestore(orphan.id, "pass1234")

		const bootCutoff = Date.now()
		await boot1.resumePendingDeletions(bootCutoff)

		// The just-finalized profile must survive the sweep.
		expect((await boot1.getProfiles()).map((p) => p.id)).toContain(orphan.id)
		expect((await boot1.getActiveProfile())?.id).toBe(orphan.id)
	}, 30_000)

	test("the tornGuard itself refuses when the marker changed after the sweep's observation (finalize won the race)", async () => {
		const { api, service } = await makeService()
		const orphan = await tornRestore(service)
		// The sweep observed this tuple…
		const observed = JSON.parse((await markerRaw(api, orphan.id)) as string)
		// …then finalize landed (clears the marker under the lock; generation unchanged).
		await service.finalizeRestore(orphan.id, "pass1234")

		// A reap decided on the stale observation must refuse UNDER THE LOCK.
		await expect(service.deleteProfile(orphan.id, { pxeGeneration: observed.pxeGeneration, markerAt: observed.at })).rejects.toThrow(
			/marker changed/,
		)
		expect((await service.getProfiles()).map((p) => p.id)).toContain(orphan.id)
	}, 30_000)

	test("a generation-MISMATCHED stale marker is purged without touching the row", async () => {
		const { api, service } = await makeService()
		const p = await service.createProfile("Kept", "password123")
		// A stale marker from a previous incarnation of the same id.
		await new RestorePendingRepository(api.storage.local).write({ profileId: p.id, pxeGeneration: "deadbeef", at: Date.now() - 10 })

		await service.resumePendingDeletions(Date.now())

		expect((await service.getProfiles()).map((x) => x.id)).toContain(p.id)
		expect(await markerRaw(api, p.id)).toBeUndefined()
	}, 30_000)

	test("a bare marker with NO row is purged", async () => {
		const { api, service } = await makeService()
		await new RestorePendingRepository(api.storage.local).write({ profileId: "ghost", pxeGeneration: "aa", at: Date.now() - 10 })

		await service.resumePendingDeletions(Date.now())

		expect(await markerRaw(api, "ghost")).toBeUndefined()
	}, 30_000)

	test("a CORRUPT marker fails closed: marker and row both untouched", async () => {
		const { api, service } = await makeService()
		const p = await service.createProfile("Kept", "password123")
		await api.storage.local.set({ [`${RESTORE_PENDING_ROOT}@${p.id}`]: "{not json" })

		await service.resumePendingDeletions(Date.now())

		expect((await service.getProfiles()).map((x) => x.id)).toContain(p.id)
		expect(await markerRaw(api, p.id)).toBe("{not json")
	}, 30_000)

	test("resume WITHOUT a bootCutoff skips the torn sweep entirely (safe default)", async () => {
		const { api, service: boot1 } = await makeService()
		const orphan = await tornRestore(boot1)
		await new Promise((r) => setTimeout(r, 3))
		const { service: boot2 } = await makeServiceFromExistingApi(api)

		await boot2.resumePendingDeletions()

		// No cutoff → no way to distinguish a live import → sweep must not run.
		expect((await boot2.getProfiles()).map((p) => p.id)).toContain(orphan.id)
		expect(await markerRaw(api, orphan.id)).toBeDefined()
	}, 30_000)
})

describe("account-integrity delegate — the session-open chokepoint", () => {
	const throwingDelegate = () => {
		const calls: Array<{ profileId: string }> = []
		return {
			calls,
			delegate: {
				verifyBeforeSessionOpen: async (profileId: string) => {
					calls.push({ profileId })
					throw new AccountAddressInconsistencyError()
				},
			},
		}
	}

	test("unlock with a mismatching profile is WITHHELD: typed error, no session", async () => {
		const { service } = await makeService()
		const profile = await service.createProfile("P", "pass1234")
		await service.lockActiveProfile()

		const { calls, delegate } = throwingDelegate()
		service.setIntegrityDelegate(delegate)

		await expect(service.unlockProfile(profile.id, "pass1234")).rejects.toBeInstanceOf(AccountAddressInconsistencyError)
		expect(calls).toEqual([{ profileId: profile.id }])
		expect(await service.getActiveProfile()).toBeUndefined()
	}, 30_000)

	test("STARTUP-WINDOW FAIL-CLOSED: unlock refuses on a durable block even with NO delegate injected yet", async () => {
		const { api, service } = await makeService()
		const profile = await service.createProfile("P", "pass1234")
		await service.lockActiveProfile()

		// Simulate the coordinator having persisted a block on a prior boot, but not yet having
		// injected its delegate this boot (the startup window). No `setIntegrityDelegate` call.
		await new AccountIntegrityBlockedRepository(api.storage.local).set({
			profileId: profile.id,
			chainId: 0,
			accountIndex: 0,
			storedAddress: "0xstored",
			derivedAddress: "0xderived",
			regimeId: "nulo-v6",
			walletVersion: "0.0.0",
			detectedAt: 1,
		})

		await expect(service.unlockProfile(profile.id, "pass1234")).rejects.toBeInstanceOf(AccountAddressInconsistencyError)
		expect(await service.getActiveProfile()).toBeUndefined()
	}, 30_000)

	test("no delegate + NO block: unlock proceeds (the gate is targeted, not a blanket refusal)", async () => {
		const { service } = await makeService()
		const profile = await service.createProfile("P", "pass1234")
		await service.lockActiveProfile()
		// No delegate, no block record.
		const info = await service.unlockProfile(profile.id, "pass1234")
		expect(info.id).toBe(profile.id)
		expect((await service.getActiveProfile())?.id).toBe(profile.id)
	}, 30_000)

	test("backup-import path: finalizeRestore runs the check AFTER restore, BEFORE the session opens", async () => {
		const { service } = await makeService()
		const events: unknown[] = []
		service.onActiveProfileChanged.add((p) => events.push(p))

		const out = await service.restore({ id: "ignored", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
		if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))

		// Accounts are restored by the caller between restore() and finalizeRestore() — the
		// delegate registered here stands in for the coordinator seeing a mismatched row.
		const { calls, delegate } = throwingDelegate()
		service.setIntegrityDelegate(delegate)

		await expect(service.finalizeRestore(out.id, "pass1234")).rejects.toBeInstanceOf(AccountAddressInconsistencyError)
		expect(calls).toEqual([{ profileId: out.id }])
		// The mismatched import never activated: no session, no emit.
		expect(await service.getActiveProfile()).toBeUndefined()
		expect(events).toEqual([])
	}, 30_000)

	test("SW-restart persistence: a blocked profile's session is NOT silently rehydrated", async () => {
		const { api, service } = await makeService()
		const profile = await service.createProfile("P", "pass1234")
		expect((await service.getActiveProfile())?.id).toBe(profile.id)

		// The coordinator persisted a blocking record (simulated directly), then the SW died.
		const repo = new AccountIntegrityBlockedRepository(api.storage.local)
		await repo.set({
			profileId: profile.id,
			chainId: 0,
			accountIndex: 0,
			storedAddress: "0xstored",
			derivedAddress: "0xderived",
			regimeId: "nulo-v6",
			walletVersion: "0.0.0",
			detectedAt: 1,
		})

		// Fresh service over the same persisted state = the SW restart.
		const { service: rebooted } = await makeServiceFromExistingApi(api)
		expect(await rebooted.getActiveProfile()).toBeUndefined()
	}, 30_000)

	test("SW-restart control: WITHOUT a blocking record the session rehydrates (gate is targeted)", async () => {
		const { api, service } = await makeService()
		const profile = await service.createProfile("P", "pass1234")
		expect((await service.getActiveProfile())?.id).toBe(profile.id)

		const { service: rebooted } = await makeServiceFromExistingApi(api)
		expect((await rebooted.getActiveProfile())?.id).toBe(profile.id)
	}, 30_000)

	test("deleting a blocked profile clears its blocking record (no orphaned barrier)", async () => {
		const { api, service } = await makeService()
		const profile = await service.createProfile("P", "pass1234")
		const repo = new AccountIntegrityBlockedRepository(api.storage.local)
		await repo.set({
			profileId: profile.id,
			chainId: 0,
			accountIndex: 0,
			storedAddress: "0xstored",
			derivedAddress: "0xderived",
			regimeId: "nulo-v6",
			walletVersion: "0.0.0",
			detectedAt: 1,
		})
		expect(await repo.isBlocked(profile.id)).toBe(true)

		await service.deleteProfile(profile.id)
		expect(await repo.isBlocked(profile.id)).toBe(false)
	}, 30_000)

	test("persistIntegrityBlockIfLive: writes for a live profile, SKIPS a deleted one (no orphan)", async () => {
		const { api, service } = await makeService()
		const profile = await service.createProfile("P", "pass1234")
		const repo = new AccountIntegrityBlockedRepository(api.storage.local)
		const record = {
			profileId: profile.id,
			chainId: 0,
			accountIndex: 0,
			storedAddress: "0xstored",
			derivedAddress: "0xderived",
			regimeId: "nulo-v6",
			walletVersion: "0.0.0",
			detectedAt: 1,
		}
		// Live profile → persisted.
		await service.persistIntegrityBlockIfLive(record)
		expect(await repo.isBlocked(profile.id)).toBe(true)
		await repo.clear(profile.id)

		// Delete it, then a late off-lock writer tries to persist for the gone profile → SKIPPED.
		await service.deleteProfile(profile.id)
		await service.persistIntegrityBlockIfLive(record)
		expect(await repo.isBlocked(profile.id)).toBe(false)
	}, 30_000)

	test("persistIntegrityVerdictIfLive: runs the write for a live profile and returns its result, SKIPS a deleted one", async () => {
		const { service } = await makeService()
		const profile = await service.createProfile("P", "pass1234")
		const writes: string[] = []
		expect(await service.persistIntegrityVerdictIfLive(profile.id, async () => writes.push("live"))).toBe(1)
		await service.deleteProfile(profile.id)
		expect(await service.persistIntegrityVerdictIfLive(profile.id, async () => writes.push("gone"))).toBeUndefined()
		expect(writes).toEqual(["live"])
	}, 30_000)

	test("deleting a profile clears its stale-network record, reset journal and reset notice", async () => {
		const { api, service } = await makeService()
		const profile = await service.createProfile("P", "pass1234")
		const stale = new StaleNetworkRepository(api.storage.local)
		await stale.mergeEntry(profile.id, { networkId: "n", chainId: 1, networkReset: true, addressesMoved: false }, "d", async () => "d")
		await stale.withLock(profile.id, async () => {
			await stale.setJournalLocked({
				profileId: profile.id,
				networkId: "n",
				fromChainId: 1,
				toChainId: 2,
				l1ChainId: 5,
				cause: { networkReset: true, addressesMoved: false },
				purged: false,
				switchToSeedNode: false,
				probedEndpoint: null,
				accounts: [],
			})
			await stale.setNoticeLocked(profile.id, { networkId: "other", addressesMoved: false })
		})
		await service.deleteProfile(profile.id)
		const keys = Object.keys(await api.storage.local.get(null))
		expect(keys.filter((k) => k.endsWith(`@${profile.id}`) && k.startsWith("nulo:core:network-reset"))).toEqual([])
		expect(keys.filter((k) => k.startsWith(`nulo:core:stale-networks@${profile.id}`))).toEqual([])
	}, 30_000)

	test("EPOCH FENCE: a deletion that completes (reserve→release) DURING verify aborts the open", async () => {
		const { service } = await makeService()
		const profile = await service.createProfile("P", "pass1234")
		await service.lockActiveProfile()

		// The delegate stands in for a slow verify; while it runs, a delete fully completes
		// (reserve then release) — `isReserved` is false afterward, but the epoch advanced.
		const state = service.getDeletionState()
		service.setIntegrityDelegate({
			verifyBeforeSessionOpen: async () => {
				state.beginDeletion(profile.id)
				state.release(profile.id)
			},
		})

		await expect(service.unlockProfile(profile.id, "pass1234")).rejects.toThrow(/Invalid profile id/)
		// A deleted profile must never be resurrected — no active session.
		expect(await service.getActiveProfile()).toBeUndefined()
	}, 30_000)

	test("changePassword: a PRE-CHECK integrity block fails honestly — password unchanged + active session closed", async () => {
		const { service } = await makeService()
		const profile = await service.createProfile("P", "oldpass12")
		expect((await service.getActiveProfile())?.id).toBe(profile.id)

		// Drift present BEFORE the change → the pre-persist verify throws.
		service.setIntegrityDelegate({
			verifyBeforeSessionOpen: async () => {
				throw new AccountAddressInconsistencyError()
			},
		})

		await expect(service.changeProfilePassword(profile.id, "oldpass12", "newpass12")).rejects.toBeInstanceOf(
			AccountAddressInconsistencyError,
		)
		// The blocked profile's live session was closed (must not keep operating), and nothing was
		// persisted — the OLD password still unlocks (with the delegate healed).
		expect(await service.getActiveProfile()).toBeUndefined()
		await service.setIntegrityDelegate({ verifyBeforeSessionOpen: async () => {} })
		const reunlocked = await service.unlockProfile(profile.id, "oldpass12")
		expect(reunlocked.id).toBe(profile.id)
	}, 30_000)

	test("changePassword: an integrity block on RE-OPEN commits the password but withholds the session", async () => {
		const { service } = await makeService()
		const profile = await service.createProfile("P", "oldpass12")

		// Pass the PRE-check (before persist), throw on the RE-open (post-persist) — simulating a
		// mismatched account restored between the two. The password change must still report success.
		let call = 0
		service.setIntegrityDelegate({
			verifyBeforeSessionOpen: async () => {
				call++
				if (call >= 2) throw new AccountAddressInconsistencyError()
			},
		})

		const info = await service.changeProfilePassword(profile.id, "oldpass12", "newpass12")
		expect(info.id).toBe(profile.id)
		expect(call).toBe(2)
		// Session withheld (re-open threw + closed), but the NEW password is what's persisted.
		expect(await service.getActiveProfile()).toBeUndefined()
		await service.setIntegrityDelegate({ verifyBeforeSessionOpen: async () => {} })
		const reunlocked = await service.unlockProfile(profile.id, "newpass12")
		expect(reunlocked.id).toBe(profile.id)
	}, 30_000)

	/**
	 * Torn-restore detection: the restore-pending marker (written before the
	 * profile row, cleared at finalizeRestore ENTRY) turns a mid-restore death
	 * into a typed unlock refusal instead of a silent bootstrap re-seed.
	 */
	describe("restore-pending marker (torn-restore gate)", () => {
		async function restoreOnly(service: ProfileService) {
			const out = await service.restore({ id: "ignored", name: "Torn", type: "password" }, await restoreSecretFor(13), "pass1234")
			if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))
			return out
		}

		test("restore() leaves the marker present alongside the row (marker-before-row bracket)", async () => {
			const { api, service } = await makeService()
			const out = await restoreOnly(service)
			const pending = new RestorePendingRepository(api.storage.local as never)
			const lookup = await pending.get(out.id)
			expect(lookup.kind).toBe("valid")
			expect((await service.getProfiles()).find((p) => p.id === out.id)).toBeDefined()
		}, 30_000)

		test("unlocking a marker-bearing profile throws RestoreTornError; session withheld", async () => {
			const { service } = await makeService()
			const out = await restoreOnly(service)
			// No finalize — this is the popup-died-mid-restore shape.
			await expect(service.unlockProfile(out.id, "pass1234")).rejects.toBeInstanceOf(RestoreTornError)
			expect(await service.getActiveProfile()).toBeUndefined()
		}, 30_000)

		test("finalizeRestore ENTRY clears the marker even when the session open FAILS (wrong password) — the unlock-later recovery survives", async () => {
			const { service } = await makeService()
			const out = await restoreOnly(service)
			await expect(service.finalizeRestore(out.id, "wrong-pass")).rejects.toBeInstanceOf(InvalidPasswordError)
			// The finalize call itself proved the slice phase completed → the
			// marker is gone and a normal unlock now WORKS.
			const active = await service.unlockProfile(out.id, "pass1234")
			expect(active.id).toBe(out.id)
			expect((await service.getActiveProfile())?.id).toBe(out.id)
		}, 30_000)

		test("happy finalize clears the marker; a second finalize (no-op path) stays clean", async () => {
			const { api, service } = await makeService()
			const out = await restoreOnly(service)
			await service.finalizeRestore(out.id, "pass1234")
			const pending = new RestorePendingRepository(api.storage.local as never)
			expect((await pending.get(out.id)).kind).toBe("absent")
			await service.finalizeRestore(out.id, "pass1234")
			expect((await pending.get(out.id)).kind).toBe("absent")
		}, 30_000)

		test("a CORRUPT marker fails closed at unlock (tombstone precedent)", async () => {
			const { api, service } = await makeService()
			const out = await restoreOnly(service)
			await service.finalizeRestore(out.id, "pass1234")
			await service.lockActiveProfile()
			await (api.storage.local as never as { set: (o: Record<string, string>) => Promise<void> }).set({
				[`${RESTORE_PENDING_ROOT}@${out.id}`]: "{not json",
			})
			await expect(service.unlockProfile(out.id, "pass1234")).rejects.toBeInstanceOf(RestoreTornError)
		}, 30_000)

		test("a generation-MISMATCHED marker is a stale leftover: purged, unlock proceeds", async () => {
			const { api, service } = await makeService()
			const out = await restoreOnly(service)
			await service.finalizeRestore(out.id, "pass1234")
			await service.lockActiveProfile()
			const pending = new RestorePendingRepository(api.storage.local as never)
			await pending.write({ profileId: out.id, pxeGeneration: "some-older-incarnation", at: 1 })
			const active = await service.unlockProfile(out.id, "pass1234")
			expect(active.id).toBe(out.id)
			expect((await pending.get(out.id)).kind).toBe("absent")
		}, 30_000)

		test("deleteProfile clears the marker (torn profiles stay deletable — the documented recovery)", async () => {
			const { api, service } = await makeService()
			const out = await restoreOnly(service)
			await service.deleteProfile(out.id)
			const pending = new RestorePendingRepository(api.storage.local as never)
			expect((await pending.get(out.id)).kind).toBe("absent")
		}, 30_000)

		test("deleteProfile survives a rejecting marker removal: session closed + pending secret gone FIRST", async () => {
			const { api, service } = await makeService()
			const out = await restoreOnly(service)
			await service.finalizeRestore(out.id, "pass1234")
			expect((await service.getActiveProfile())?.id).toBe(out.id)

			// Make ONLY the restore-pending removal reject (the fallible tail).
			const storage = api.storage.local as never as { remove: (k: string | string[]) => Promise<void> }
			const originalRemove = storage.remove.bind(storage)
			storage.remove = async (k: string | string[]) => {
				if (typeof k === "string" && k.startsWith(`${RESTORE_PENDING_ROOT}@`)) throw new Error("storage remove rejected")
				return originalRemove(k)
			}

			await expect(service.deleteProfile(out.id)).rejects.toThrow("storage remove rejected")
			// The ordering contract: the session was closed BEFORE the fallible
			// marker cleanup — no deleted-profile session lingers.
			expect(await service.getActiveProfile()).toBeUndefined()
			storage.remove = originalRemove
		}, 30_000)

		test("silent rehydration purges a generation-MISMATCHED marker and keeps the session", async () => {
			const { api, service } = await makeService()
			const out = await restoreOnly(service)
			await service.finalizeRestore(out.id, "pass1234")
			const pending = new RestorePendingRepository(api.storage.local as never)
			await pending.write({ profileId: out.id, pxeGeneration: "prior-incarnation", at: 1 })

			const { service: restarted } = await makeServiceFromExistingApi(api)
			expect((await restarted.getActiveProfile())?.id).toBe(out.id)
			expect((await pending.get(out.id)).kind).toBe("absent")
		}, 30_000)

		test("silent rehydration of a marker-bearing profile closes the session WITHOUT aborting service init", async () => {
			const { api, service } = await makeService()
			const out = await restoreOnly(service)
			await service.finalizeRestore(out.id, "pass1234")
			// Re-arm the marker for THIS incarnation (as if a same-id re-import
			// died mid-restore while a persisted session existed).
			const profile = (await service.getProfiles()).find((p) => p.id === out.id)
			expect(profile).toBeDefined()
			const pending = new RestorePendingRepository(api.storage.local as never)
			const raw = await (api.storage.local as never as { get: (k: string) => Promise<Record<string, unknown>> }).get(
				`nulo:core:profiles@${out.id}`,
			)
			const gen = (JSON.parse(String(raw[`nulo:core:profiles@${out.id}`])) as { pxeGeneration: string }).pxeGeneration
			await pending.write({ profileId: out.id, pxeGeneration: gen, at: Date.now() })

			// SW restart: a fresh service over the same storage must come up
			// cleanly (no init throw) with the session silently closed.
			const { service: restarted } = await makeServiceFromExistingApi(api)
			expect(await restarted.getActiveProfile()).toBeUndefined()
		}, 30_000)
	})

	// An abandoned restore's rewrap context must not outlive its TTL, even when nothing but another
	// restore runs after it.
	describe("(SECRET-LIFETIME PIN) rewrap-context lifetime", () => {
		test("an abandoned restore's rewrap context is wiped by a later restore's sweep after the TTL", async () => {
			vi.useFakeTimers()
			try {
				const { service } = await makeService()
				const out = await service.restore(
					{ id: "ignored", name: "P", type: "password" },
					await restoreSecretFor(11),
					"pass1234",
					true,
				)
				if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))
				// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
				const entry = (service as any).pendingDekRewraps.get(out.id)
				expect(entry.sourceDek.some((b: number) => b !== 0)).toBe(true)

				vi.advanceTimersByTime(31 * 60 * 1000)
				await service.restore({ id: "ignored2", name: "P2", type: "password" }, await restoreSecretFor(12), "pass1234", true)

				expect(entry.sourceDek.every((b: number) => b === 0) && entry.destinationDek.every((b: number) => b === 0)).toBe(true)
				expect(await service.consumeDekRewrapContext(out.id)).toBeUndefined()
			} finally {
				vi.useRealTimers()
			}
		}, 30_000)
	})

	// (TOMBSTONE-WRITE PIN) A failed tombstone write must roll back the in-memory reservation
	// so the still-live profile is not wedged (falsely reserved) for the rest of
	// the SW lifetime. beginDeletion reserves synchronously BEFORE the durable
	// tombstone write; if that write rejects, repo.delete never runs, so the
	// profile is still present and must stay unlockable.
	describe("(TOMBSTONE-WRITE PIN) failed tombstone write does not wedge the live profile", () => {
		test("a rejecting tombstone write releases the reservation and leaves the profile usable", async () => {
			const { api, service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")

			const tombPrefix = "nulo:core:profile-tombstones@"
			const realSet = api.storage.local.set.bind(api.storage.local)
			vi.spyOn(api.storage.local, "set").mockImplementation(async (items: Record<string, unknown>) => {
				if (Object.keys(items).some((k) => k.startsWith(tombPrefix))) {
					throw new Error("tombstone write failed")
				}
				return realSet(items)
			})

			await expect(service.deleteProfile(profile.id)).rejects.toThrow()

			// The delete did not durably happen — the profile must NOT be wedged.
			expect(service.getDeletionState().isReserved(profile.id)).toBe(false)
			// And it is still present + re-readable (repo.delete never ran).
			const profiles = await service.getProfiles()
			expect(profiles.some((p) => p.id === profile.id)).toBe(true)
		}, 30_000)

		test("a commit-AMBIGUOUS tombstone write (key landed, then rejects) RETAINS the reservation fail-closed", async () => {
			const { api, service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")

			const tombPrefix = "nulo:core:profile-tombstones@"
			const realSet = api.storage.local.set.bind(api.storage.local)
			vi.spyOn(api.storage.local, "set").mockImplementation(async (items: Record<string, unknown>) => {
				if (Object.keys(items).some((k) => k.startsWith(tombPrefix))) {
					// Commit-ambiguous: the write ACTUALLY lands, then the promise rejects.
					await realSet(items)
					throw new Error("tombstone write ack lost")
				}
				return realSet(items)
			})

			await expect(service.deleteProfile(profile.id)).rejects.toThrow()

			// The tombstone is durable → resumePendingDeletions will finish the delete.
			// Releasing would let an unlock race the resume, so the reservation is KEPT.
			expect(service.getDeletionState().isReserved(profile.id)).toBe(true)
		}, 30_000)
	})

	// (CLOSE READ-BACK PIN) An explicit lock whose persisted-session delete
	// fails must NOT report success — lockActiveProfile reads back and surfaces it,
	// else the surviving bearer would silently re-unlock on the next SW start.
	// A record that refused both deletes restarts the wallet; nothing else does.
	describe("(CLOSE READ-BACK PIN) lockActiveProfile surfaces a failed persisted-session clear", () => {
		// The read-back fails in every row, so a restart keyed on it rather than on the deletes fails here.
		test.each([
			{ failedDeletes: 0, attempts: 1, restarts: 0 },
			{ failedDeletes: 1, attempts: 2, restarts: 0 },
			{ failedDeletes: 2, attempts: 2, restarts: 1 },
		])(
			"a lock with $failedDeletes failed delete(s) restarts the wallet $restarts time(s), and throws",
			async ({ failedDeletes, attempts, restarts }) => {
				const { api, service } = await makeService()
				await service.createProfile("P", "pass1234")
				const reload = vi.spyOn(api.runtime, "reload")
				const remove = vi.spyOn(api.storage.session, "remove")
				for (let i = 0; i < failedDeletes; i++) remove.mockRejectedValueOnce(new Error("session remove failed"))
				vi.spyOn(api.storage.session, "get").mockRejectedValue(new Error("session get failed"))

				await expect(service.lockActiveProfile()).rejects.toThrow(/did not persist/)
				expect(remove).toHaveBeenCalledTimes(attempts)
				expect(reload).toHaveBeenCalledTimes(restarts)
			},
			30_000,
		)

		test("a close the person did not ask for restarts nothing, its deletes refused", async () => {
			const { api, service } = await makeService()
			const profile = await service.createProfile("P", "pass1234")
			const reload = vi.spyOn(api.runtime, "reload")

			vi.spyOn(api.storage.session, "remove").mockRejectedValue(new Error("session remove failed"))
			await service.lockProfileIfActive(profile.id)
			expect(await service.getActiveProfile()).toBeUndefined()
			expect(reload).not.toHaveBeenCalled()
		}, 30_000)

		test("a lock that saves restarts nothing", async () => {
			const { api, service } = await makeService()
			await service.createProfile("P", "pass1234")
			const reload = vi.spyOn(api.runtime, "reload")
			const prepare = vi.fn()
			service.setRestartPreparation(prepare)

			await service.lockActiveProfile()
			expect(await service.getActiveProfile()).toBeUndefined()
			expect(reload).not.toHaveBeenCalled()
			expect(prepare).not.toHaveBeenCalled()
		}, 30_000)

		test("a lock that cannot be saved runs the restart's preparation, then restarts, in one turn", async () => {
			const { api, service } = await makeService()
			await service.createProfile("P", "pass1234")
			const events: string[] = []
			vi.spyOn(api.runtime, "reload").mockImplementation(() => void events.push("reload"))
			service.setRestartPreparation(() => {
				events.push("prepare")
				queueMicrotask(() => events.push("a microtask the preparation queued"))
			})

			vi.spyOn(api.storage.session, "remove").mockRejectedValue(new Error("session remove failed"))
			await expect(service.lockActiveProfile()).rejects.toThrow(/did not persist/)
			expect(events).toEqual(["prepare", "reload", "a microtask the preparation queued"])
		}, 30_000)

		test("a preparation that throws still restarts", async () => {
			const { api, service } = await makeService()
			await service.createProfile("P", "pass1234")
			const reload = vi.spyOn(api.runtime, "reload")
			service.setRestartPreparation(() => {
				throw new Error("preparation failed")
			})

			vi.spyOn(api.storage.session, "remove").mockRejectedValue(new Error("session remove failed"))
			await expect(service.lockActiveProfile()).rejects.toThrow(/did not persist/)
			expect(reload).toHaveBeenCalledTimes(1)
		}, 30_000)

		test("a restarted worker whose lock cannot be saved announces the lock, then restarts", async () => {
			const { api, service } = await makeService()
			await service.createPasskeyProfile("PK")
			vi.spyOn(SessionManager.prototype, "restore").mockResolvedValueOnce(undefined)
			const { service: rebooted } = await makeServiceFromExistingApi(api)
			expect(await rebooted.getActiveProfile()).toBeUndefined()
			const events: unknown[] = []
			const reload = vi.spyOn(api.runtime, "reload").mockImplementation(() => {
				events.push("reload")
			})
			rebooted.onActiveProfileChanged.add((p) => events.push(p))

			vi.spyOn(api.storage.session, "remove").mockRejectedValue(new Error("session remove failed"))
			await expect(rebooted.lockActiveProfile()).rejects.toThrow(/did not persist/)
			expect(events).toEqual([undefined, "reload"])
			expect(reload).toHaveBeenCalledTimes(1)
		}, 30_000)
	})

	// Integration criteria for the imported-keys DEK.
	describe("imported-keys DEK lifecycle", () => {
		/** Read a persisted profile row straight from storage. */
		async function readRow(api: FakeBrowserApi, id: string): Promise<Record<string, unknown>> {
			const key = `nulo:core:profiles@${id}`
			const raw = (await api.storage.local.get(key))[key]
			return typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>)
		}

		// (a) every creation path stamps dekSealed + walletFingerprint, both profile types.
		test("(a) createProfile stamps dekSealed + walletFingerprint", async () => {
			const { api, service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			const row = await readRow(api, p.id)
			expect(typeof row.dekSealed).toBe("string")
			expect((row.dekSealed as string).length).toBeGreaterThan(0)
			expect(typeof row.walletFingerprint).toBe("string")
			expect((row.walletFingerprint as string).length).toBe(64) // sha256 hex
		})

		test("(a) importMnemonic + createPasskeyProfile both stamp the two fields", async () => {
			const { api, service } = await makeService()
			const words = await wordsForFill(0x21)
			const imported = await service.importMnemonic("M", words, "pass1234")
			const importedRow = await readRow(api, imported.id)
			expect(typeof importedRow.dekSealed).toBe("string")
			expect(typeof importedRow.walletFingerprint).toBe("string")

			const pk = await service.createPasskeyProfile("PK", await newPasskeyAnswer("cred-pk-a"))
			const pkRow = await readRow(api, pk.id)
			expect(typeof pkRow.dekSealed).toBe("string")
			expect(typeof pkRow.walletFingerprint).toBe("string")
		})

		test("getProfileDek returns a live dek; a locked profile has none", async () => {
			const { service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			expect(await service.getProfileDek(p.id)).toBeDefined()
			await service.lockActiveProfile()
			await expect(service.getProfileDek(p.id)).rejects.toThrow(/locked/)
		})

		test("getProfileDek refuses a reserved id even while its session is open", async () => {
			const { service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			expect(await service.getProfileDek(p.id)).toBeDefined()
			service.getDeletionState().beginDeletion(p.id)
			await expect(service.getProfileDek(p.id)).rejects.toThrow(/^Invalid profile id$/)
		})

		// (d) degraded unlock: a corrupt dek slot opens derived-only, emits the event, no bearer.
		test("(d) a corrupt dekSealed slot → derived-only unlock, onImportedKeysDegraded, no bearer", async () => {
			const { api, service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			await service.lockActiveProfile()
			// Tamper the dek slot at rest.
			const key = `nulo:core:profiles@${p.id}`
			const row = await readRow(api, p.id)
			row.dekSealed = "AAAAAAAAAAAAAAAAAAAAAAAAAAAA"
			await api.storage.local.set({ [key]: JSON.stringify(row) })

			const degraded: string[] = []
			service.onImportedKeysDegraded.add((info) => degraded.push(info.id))
			await service.unlockProfile(p.id, "pass1234")
			// Session is open (derived-only) but carries NO dek and persisted NO bearer.
			expect((await service.getActiveProfile())?.id).toBe(p.id)
			expect(await service.getProfileDek(p.id)).toBeUndefined()
			expect(degraded).toContain(p.id)
			const bearerKey = SESSION_STORAGE_ROOT
			const rawSession = (await api.storage.session.get(bearerKey))[bearerKey]
			const session = typeof rawSession === "string" ? JSON.parse(rawSession) : rawSession
			expect(session.bearer).toBeUndefined()
		})

		// A password change RESEALS the dek — it survives + still round-trips.
		test("changeProfilePassword reseals the dek (still usable under the new password)", async () => {
			const { service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			const before = await service.getProfileDek(p.id)
			await service.changeProfilePassword(p.id, "pass1234", "newpass9")
			const after = await service.getProfileDek(p.id)
			expect(Array.from(after!)).toEqual(Array.from(before!))
			// Lock + unlock under the NEW password: the dek unseals (no degradation).
			await service.lockActiveProfile()
			await service.unlockProfile(p.id, "newpass9")
			expect(await service.getProfileDek(p.id)).toBeDefined()
		})

		// (e)+bearer: SW-restart silent restore recovers the dek via the v2 pair bearer.
		test("(e) SW-restart silent restore recovers BOTH master and dek", async () => {
			const { api, service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			const dekBefore = await service.getProfileDek(p.id)
			// Fresh service on the same storage = MV3 SW restart.
			const { service: restarted } = await makeServiceFromExistingApi(api)
			expect((await restarted.getActiveProfile())?.id).toBe(p.id)
			const dekAfter = await restarted.getProfileDek(p.id)
			expect(Array.from(dekAfter!)).toEqual(Array.from(dekBefore!))
		})

		const CORRUPT_SLOT = "AAAAAAAAAAAAAAAAAAAAAAAAAAAA"
		async function corruptDekSlot(api: FakeBrowserApi, id: string) {
			const key = `nulo:core:profiles@${id}`
			await api.storage.local.set({ [key]: JSON.stringify({ ...(await readRow(api, id)), dekSealed: CORRUPT_SLOT }) })
		}

		test("recovery mode: a degraded unlock projects `recoveryMode` on the live info only, and the DEK-keyed derivation refuses", async () => {
			const { api, service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			expect(service.isRecoveryMode(p.id)).toBe(false)
			expect((await service.getActiveProfile())?.recoveryMode).toBeUndefined()
			await service.lockActiveProfile()
			await corruptDekSlot(api, p.id)

			await service.unlockProfile(p.id, "pass1234")
			expect(service.isRecoveryMode(p.id)).toBe(true)
			expect((await service.getActiveProfile())?.recoveryMode).toBe(true)
			expect((await service.getProfiles()).find((x) => x.id === p.id)?.recoveryMode).toBe(true)
			// Never persisted, never in the backup's profile slice.
			expect("recoveryMode" in (await readRow(api, p.id))).toBe(false)
			expect(await service.backup()).toEqual({ id: p.id, name: "P", type: "password" })
			// The dApp-session key takes HKDF(master ‖ dek): no DEK, no key — typed, so the read path hides instead of deleting.
			await expect(service.deriveDappSessionMacKey(p.id)).rejects.toBeInstanceOf(RecoveryModeError)
			// Locked keeps the locked contract (not recovery mode).
			await service.lockActiveProfile()
			expect(service.isRecoveryMode(p.id)).toBe(false)
			await expect(service.deriveDappSessionMacKey(p.id)).rejects.toThrow(/locked/)
		})

		test("changeProfilePassword REFUSES an undecryptable dekSealed (no fresh mint) and leaves the row unchanged", async () => {
			const { api, service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			await service.lockActiveProfile()
			await corruptDekSlot(api, p.id)
			await service.unlockProfile(p.id, "pass1234")
			const before = await readRow(api, p.id)
			await expect(service.changeProfilePassword(p.id, "pass1234", "newpass9")).rejects.toThrow(/unrecoverable/)
			expect(await readRow(api, p.id)).toEqual(before)
			await service.lockActiveProfile()
			await service.unlockProfile(p.id, "pass1234")
			expect(service.isRecoveryMode(p.id)).toBe(true)
		})

		test("password export tolerates an undecryptable slot (no source DEK), and the export → restore round trip lands healthy", async () => {
			const { api, service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			const liveDek = await service.getProfileDek(p.id)
			const intact = await service.openBackupTransfer(p.id, "pass1234")
			expect(Array.from(intact.sourceDek!)).toEqual(Array.from(liveDek!))

			await service.lockActiveProfile()
			await corruptDekSlot(api, p.id)
			await service.unlockProfile(p.id, "pass1234")
			expect(service.isRecoveryMode(p.id)).toBe(true)
			const material = await service.openBackupTransfer(p.id, "pass1234")
			expect(material.sourceDek).toBeNull()
			expect(material.masterKey).toBe(intact.masterKey)
			expect(material.entropy).toBe(intact.entropy)
			expect(material.transferKey).toHaveLength(32)

			// The repair: restore the export into a fresh profile and finalize — a healthy session.
			await service.lockActiveProfile()
			const restored = await service.restore(
				{ id: "fresh", name: "P2", type: "password" },
				{
					masterKey: asBase64MasterSecret(material.masterKey),
					entropy: material.entropy,
					importedKeysDek: toBase64(material.transferKey),
				},
				"pass1234",
				true,
			)
			if ("restoreError" in restored && restored.restoreError) throw new Error(String(restored.restoreError))
			await service.finalizeRestore(restored.id, "pass1234")
			expect(service.isRecoveryMode(restored.id)).toBe(false)
			expect(await service.getProfileDek(restored.id)).toBeDefined()
			expect((await service.getActiveProfile())?.recoveryMode).toBeUndefined()
		}, 30_000)

		test("a passkey backup opens only with the row's own answer, tolerates an undecryptable slot, and restores healthy under a file password", async () => {
			const { api, service } = await makeService()
			const p = await service.createPasskeyProfile("PK")
			const liveDek = await service.getProfileDek(p.id)
			const answer = await answerFor(service, p.id)
			const { credentialId, prfSalt } = await service.getPasskeyUnlockParams(p.id)
			const intact = await service.openBackupTransfer(p.id, undefined, answer)
			expect(Array.from(intact.sourceDek!)).toEqual(Array.from(liveDek!))
			expect(intact.masterKey).toBe(await service.exportPlain(p.id, undefined, answer))

			await service.lockActiveProfile()
			for (const other of [await fakePasskeyAnswer("cred-other", prfSalt), await fakePasskeyAnswer(credentialId, freshPrfSalt())]) {
				await expect(service.openBackupTransfer(p.id, undefined, other)).rejects.toThrow("Passkey did not open this profile")
			}
			await expect(service.openBackupTransfer(p.id, "pass1234")).rejects.toBeInstanceOf(InvalidPasswordError)
			await corruptDekSlot(api, p.id)
			const before = await readRow(api, p.id)
			const material = await service.openBackupTransfer(p.id, undefined, answer)
			expect(material.sourceDek).toBeNull()
			expect(material.masterKey).toBe(intact.masterKey)
			expect(material.entropy).toBe(intact.entropy)
			expect(material.transferKey).toHaveLength(32)
			expect(await readRow(api, p.id)).toEqual(before)

			await service.deleteProfile(p.id)
			const restored = await service.restore(
				{ id: "ignored", name: "PK", type: "passkey" },
				{
					masterKey: asBase64MasterSecret(material.masterKey),
					entropy: material.entropy,
					importedKeysDek: toBase64(material.transferKey),
				},
				"file-pass1",
			)
			if ("restoreError" in restored && restored.restoreError) throw new Error(String(restored.restoreError))
			await service.finalizeRestore(restored.id, "file-pass1")
			expect(service.isRecoveryMode(restored.id)).toBe(false)
			expect(await service.getProfileDek(restored.id)).toBeDefined()
		}, 30_000)

		// (g) the duplicate-phrase guard: same phrase → DuplicateWalletError unless allowDuplicate.
		test("(g) importMnemonic rejects a duplicate phrase, then accepts it with allowDuplicate", async () => {
			const { service } = await makeService()
			const words = await wordsForFill(0x31)
			await service.importMnemonic("First", words, "pass1234")
			await expect(service.importMnemonic("Second", words, "pass1234")).rejects.toBeInstanceOf(DuplicateWalletError)
			const dup = await service.importMnemonic("Second", words, "pass1234", true)
			expect(dup.id).toBeDefined()
		})

		test("(g) a third import of one phrase names both profiles already on it", async () => {
			const { service } = await makeService()
			const words = await wordsForFill(0x32)
			await service.importMnemonic("Savings", words, "pass1234")
			await service.importMnemonic("Main", words, "pass1234", true)
			await service.importMnemonic("Other", await wordsForFill(0x33), "pass1234")
			const refused = await service.importMnemonic("Third", words, "pass1234").catch((err: unknown) => err)
			expect(refused).toBeInstanceOf(DuplicateWalletError)
			const names = ((refused as DuplicateWalletError).details as { existingProfileNames?: string[] }).existingProfileNames
			expect([...(names ?? [])].sort()).toEqual(["Main", "Savings"])
		})

		// (h) clone divergence: a fresh destination dek — B cannot equal A's session dek.
		test("(h) restoring a backup mints a FRESH dek (clone divergence — differs from the source)", async () => {
			const { service } = await makeService()
			// Source profile, capture its dek.
			const src = await service.createProfile("Src", "pass1234")
			const srcDek = await service.getProfileDek(src.id)
			await service.lockActiveProfile()
			// Restore a backup carrying the SAME source dek as its carrier, under a NEW password.
			const pair = await restorePairFor(0x41)
			const restored = await service.restore(
				{ id: "clone", name: "Clone", type: "password" },
				{
					masterKey: asBase64MasterSecret(pair.masterKey),
					entropy: pair.entropy,
					importedKeysDek: Buffer.from(srcDek!).toString("base64"),
				},
				"otherpass",
				true, // same phrase as nothing here; allowDuplicate keeps the test focused on the dek
			)
			if ("restoreError" in restored && restored.restoreError) throw new Error(String(restored.restoreError))
			await service.finalizeRestore(restored.id, "otherpass")
			const cloneDek = await service.getProfileDek(restored.id)
			// The restored row's dek is freshly minted — NOT the source dek it carried.
			expect(Array.from(cloneDek!)).not.toEqual(Array.from(srcDek!))
		})

		// A tamper landing BETWEEN restore() and finalizeRestore must not yield a
		// non-degraded (bearer-backed) session — finalize re-verifies MAC v3.
		test("a MAC tamper between restore and finalize → derived-only finalize (no bearer)", async () => {
			const { api, service } = await makeService()
			const pair = await restorePairFor(0x51)
			const srcDek = Buffer.from(new Uint8Array(32).fill(0x77)).toString("base64")
			const restored = await service.restore(
				{ id: "r", name: "R", type: "password" },
				{ masterKey: asBase64MasterSecret(pair.masterKey), entropy: pair.entropy, importedKeysDek: srcDek },
				"pass1234",
				true,
			)
			if ("restoreError" in restored && restored.restoreError) throw new Error(String(restored.restoreError))
			// Corrupt the envelope MAC on the freshly-restored row, THEN finalize.
			const key = `nulo:core:profiles@${restored.id}`
			const row = JSON.parse((await api.storage.local.get(key))[key] as string)
			row.envelopeMac = Buffer.from(new Uint8Array(32).fill(0xee)).toString("base64")
			await api.storage.local.set({ [key]: JSON.stringify(row) })

			const degraded: string[] = []
			service.onImportedKeysDegraded.add((info) => degraded.push(info.id))
			await service.finalizeRestore(restored.id, "pass1234")
			// Session opened derived-only: no dek, no persisted bearer, warning emitted.
			expect(await service.getProfileDek(restored.id)).toBeUndefined()
			expect(degraded).toContain(restored.id)
			const rawSession = (await api.storage.session.get(SESSION_STORAGE_ROOT))[SESSION_STORAGE_ROOT]
			const session = typeof rawSession === "string" ? JSON.parse(rawSession) : rawSession
			expect(session.bearer).toBeUndefined()
		})

		// Deleting a profile mid-restore zeroizes + drops its rewrap context.
		test("deleteProfile drops the pending rewrap context (no leak past delete)", async () => {
			const { service } = await makeService()
			const pair = await restorePairFor(0x61)
			const srcDek = Buffer.from(new Uint8Array(32).fill(0x77)).toString("base64")
			const restored = await service.restore(
				{ id: "d", name: "D", type: "password" },
				{ masterKey: asBase64MasterSecret(pair.masterKey), entropy: pair.entropy, importedKeysDek: srcDek },
				"pass1234",
				true,
			)
			if ("restoreError" in restored && restored.restoreError) throw new Error(String(restored.restoreError))
			service.setDeletionDelegate({ snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }), runFor: async () => {} })
			await service.deleteProfile(restored.id)
			// The context is gone: a later consume returns undefined (nothing to rewrap).
			expect(await service.consumeDekRewrapContext(restored.id)).toBeUndefined()
		})

		// A password change must neither LAUNDER an uncovered dek (re-MACing
		// a transplanted slot into a freshly-valid envelope) NOR self-heal by minting a fresh one —
		// a MAC failure cannot tell a replaced slot from corruption of the MAC field alone, so
		// minting would silently destroy still-recoverable imported keys. It refuses, and the
		// backup escape hatch (below) stays open so the refusal is not a dead end.
		test("changeProfilePassword REFUSES when the stored MAC does not cover the dek", async () => {
			const { api, service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			const before = await service.getProfileDek(p.id)
			await service.lockActiveProfile()
			// Break ONLY the MAC: dekSealed still unseals, so the dek and every imported key that
			// roots in it are still recoverable — exactly the case a mint-fresh would have lost.
			const key = `nulo:core:profiles@${p.id}`
			const row = await readRow(api, p.id)
			row.envelopeMac = Buffer.from(new Uint8Array(32).fill(0xee)).toString("base64")
			await api.storage.local.set({ [key]: JSON.stringify(row) })

			await service.unlockProfile(p.id, "pass1234")
			expect(await service.getProfileDek(p.id)).toBeUndefined() // derived-only, as designed
			await expect(service.changeProfilePassword(p.id, "pass1234", "newpass9")).rejects.toThrow(/integrity check failed/)
			// Nothing was committed: the OLD password still works and the dek is untouched.
			await service.lockActiveProfile()
			await service.unlockProfile(p.id, "pass1234")
			const material = await service.openBackupTransfer(p.id, "pass1234")
			expect(Array.from(material.sourceDek!)).toEqual(Array.from(before!))
		})

		// The counterpart of the refusal above: exporting under an unverified dek cannot leak (a
		// planted dek is the attacker's own key; a genuine one makes the backup correct), so the
		// export deliberately still works — it is the only non-destructive repair path out of a
		// MAC-corrupted profile.
		test("the fresh-auth export RPCs still work when the MAC no longer covers the row", async () => {
			const { api, service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			const dek = await service.getProfileDek(p.id)
			const key = `nulo:core:profiles@${p.id}`
			const row = await readRow(api, p.id)
			row.envelopeMac = Buffer.from(new Uint8Array(32).fill(0xee)).toString("base64")
			await api.storage.local.set({ [key]: JSON.stringify(row) })

			const material = await service.openBackupTransfer(p.id, "pass1234")
			expect(Array.from(material.sourceDek!)).toEqual(Array.from(dek!))
			expect(Array.from(await service.exportImportedKeysDek(p.id, "pass1234"))).toEqual(Array.from(dek!))
		})

		// The stale sweep EXCLUDES the id being consumed, so the TTL has to
		// be enforced on the consumed entry too — otherwise an abandoned restore's raw SOURCE dek
		// stays consumable for the whole SW lifetime.
		test("consumeDekRewrapContext enforces the TTL on the entry it consumes", async () => {
			vi.useFakeTimers()
			try {
				const { service } = await makeService()
				const pair = await restorePairFor(0x71)
				const srcDek = Buffer.from(new Uint8Array(32).fill(0x77)).toString("base64")
				const restored = await service.restore(
					{ id: "ttl", name: "TTL", type: "password" },
					{ masterKey: asBase64MasterSecret(pair.masterKey), entropy: pair.entropy, importedKeysDek: srcDek },
					"pass1234",
					true,
				)
				if ("restoreError" in restored && restored.restoreError) throw new Error(String(restored.restoreError))
				vi.advanceTimersByTime(31 * 60 * 1000)
				// No other map operation happened, so the sweep alone would never have freed it.
				expect(await service.consumeDekRewrapContext(restored.id)).toBeUndefined()
			} finally {
				vi.useRealTimers()
			}
		})
	})

	/**
	 * Equivalence pins: freeze the OBSERVABLE error identities, event order, and
	 * lock-phase behavior the repeated lock/fetch/check blocks produce today, so
	 * any structural change to them must prove itself against unchanged behavior.
	 */
	describe("equivalence pins — error/event/lock contracts", () => {
		async function readRow(api: FakeBrowserApi, id: string): Promise<Record<string, unknown>> {
			const key = `nulo:core:profiles@${id}`
			const raw = (await api.storage.local.get(key))[key]
			return typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>)
		}

		test("wrong-password error identities: typed for the export pair, exact plain string for mnemonic + password change", async () => {
			const { service } = await makeService()
			const p = await service.createProfile("P", "pass1234")

			// openBackupTransfer + exportImportedKeysDek expose the TYPED error.
			await expect(service.openBackupTransfer(p.id, "wrong-pass")).rejects.toBeInstanceOf(InvalidPasswordError)
			await expect(service.exportImportedKeysDek(p.id, "wrong-pass")).rejects.toBeInstanceOf(InvalidPasswordError)

			// exportMnemonic + changeProfilePassword throw a PLAIN Error with the same
			// legacy message; the change-password UI string-matches it (from
			// changeProfilePassword) for its wrong-password branch — both pinned so
			// neither drifts.
			const mnemonicErr = await service.exportMnemonic(p.id, "wrong-pass").then(
				() => null,
				(e: unknown) => e,
			)
			expect(mnemonicErr).toBeInstanceOf(Error)
			expect(mnemonicErr).not.toBeInstanceOf(InvalidPasswordError)
			expect((mnemonicErr as Error).message).toBe("Invalid profile old password")

			const changeErr = await service.changeProfilePassword(p.id, "wrong-pass", "newpass9").then(
				() => null,
				(e: unknown) => e,
			)
			expect(changeErr).toBeInstanceOf(Error)
			expect(changeErr).not.toBeInstanceOf(InvalidPasswordError)
			expect((changeErr as Error).message).toBe("Invalid profile old password")
		}, 30_000)

		test("onProfileAdded fires BEFORE the session opens on createProfile", async () => {
			const { service } = await makeService()
			const order: string[] = []
			service.onProfileAdded.add(() => {
				order.push("added")
			})
			service.onActiveProfileChanged.add((p) => {
				if (p) order.push("active")
			})
			await service.createProfile("P", "pass1234")
			expect(order).toEqual(["added", "active"])
		}, 30_000)

		test("(BUG PIN) a tombstoned-but-present row (crash window) still accepts changeProfileName", async () => {
			// deleteProfile writes the tombstone BEFORE deleting the row, under one lock —
			// a crash between the two leaves the row present with its id reserved. The
			// rename/change-password openers check only row presence, not the reservation,
			// so the mutation SUCCEEDS while every read hides the profile. Preserved
			// verbatim; tracked separately for fix.
			const { api, service } = await makeService()
			const p = await service.createProfile("P", "pass1234")
			const row = await readRow(api, p.id)
			await api.storage.local.set({
				[`nulo:core:profile-tombstones@${p.id}`]: JSON.stringify({
					profileId: p.id,
					addresses: [],
					tokenIds: [],
					networkIds: [],
					epoch: 1,
					pxeGeneration: row.pxeGeneration,
				}),
			})
			const boot2 = await makeServiceFromExistingApi(api)
			const renamed = await boot2.service.changeProfileName(p.id, "renamed")
			expect(renamed.name).toBe("renamed")
			expect((await boot2.service.getProfiles()).find((x) => x.id === p.id)).toBeUndefined()
		}, 30_000)

		test("deterministic passkey unlock: a delete landing during the HELD phase-2 ceremony is rejected", async () => {
			const { service, passkeys } = await makeService()
			const profile = await service.createPasskeyProfile("PK")
			await service.lockActiveProfile()

			// The stub's getKey IS the WebAuthn ceremony — holding it open is a
			// deterministic phase-2 barrier. deleteProfile completing while the
			// ceremony is held also proves phase 2 runs outside the facade lock.
			let ceremonyStarted!: () => void
			const started = new Promise<void>((resolve) => {
				ceremonyStarted = resolve
			})
			let releaseCeremony!: () => void
			const gate = new Promise<void>((resolve) => {
				releaseCeremony = resolve
			})
			const realGetKey = passkeys.getKey.bind(passkeys)
			passkeys.getKey = async (credentialId, prfSalt, display) => {
				ceremonyStarted()
				await gate
				return realGetKey(credentialId, prfSalt, display)
			}

			const unlock = service.unlockPasskeyProfile(profile.id)
			unlock.catch(() => {})
			await started
			await service.deleteProfile(profile.id)
			releaseCeremony()
			await expect(unlock).rejects.toThrow(/Invalid profile id/)
		}, 30_000)
	})
})

// ── Real-session pins: the production PXE wiring and the real dApp-session derivation ──

const profileRowKey = (id: string) => `nulo:core:profiles@${id}`
const readRawRow = async (api: FakeBrowserApi, id: string) =>
	JSON.parse((await api.storage.local.get(profileRowKey(id)))[profileRowKey(id)] as string)
const writeRawRow = (api: FakeBrowserApi, id: string, row: unknown) => api.storage.local.set({ [profileRowKey(id)]: JSON.stringify(row) })

describe("warm PXE runtime — admission is decided in the SW by the PRODUCTION wiring", () => {
	test("healthy unlock admits; after a degraded re-unlock an IMMEDIATE request against the warm chain is rejected with no wire traffic; an admitted in-flight job completes; a healthy re-unlock admits again", async () => {
		const { api, service } = await makeService()
		vi.stubGlobal("self", globalThis)
		const wire: string[] = []
		let parked: Promise<void> | undefined
		const impl = async function (method: unknown) {
			wire.push(method as string)
			if (parked) await parked
			return []
		}
		vi.spyOn(
			OffscreenServiceClient.prototype as unknown as { request: (...a: unknown[]) => Promise<unknown> },
			"request",
		).mockImplementation(impl)
		vi.spyOn(
			Object.getPrototypeOf(OffscreenServiceClient.prototype) as { request: (...a: unknown[]) => Promise<unknown> },
			"request",
		).mockImplementation(impl)
		try {
			// The same call `createWalletRuntime` makes — a deleted guard registration reds this test.
			wirePxeProviders(service)
			const p = await service.createProfile("P", "pass1234")
			const healthyRow = await readRawRow(api, p.id)
			const client = new PxeServiceClient({ log: () => {} } as never)
			const net = { profileId: p.id, chainId: 31337, rpcUrl: "http://n/1" }

			await client.getSenders(net)
			expect(wire).toEqual(["getSenders"])

			// A job admitted while healthy is still on the wire when the lock lands.
			let release!: () => void
			parked = new Promise<void>((r) => (release = r))
			const inflight = client.getSenders(net)
			await new Promise((r) => setTimeout(r, 0))
			expect(wire).toEqual(["getSenders", "getSenders"])
			parked = undefined

			await service.lockActiveProfile()
			await writeRawRow(api, p.id, { ...healthyRow, dekSealed: "AAAAAAAAAAAAAAAAAAAAAAAAAAAA" })
			await service.unlockProfile(p.id, "pass1234")
			expect(service.isRecoveryMode(p.id)).toBe(true)
			// The offscreen still holds the store key and the open chain runtime: only the SW-side
			// guard stands between the degraded session and it.
			await expect(client.getSenders(net)).rejects.toBeInstanceOf(RecoveryModeError)
			expect(wire).toEqual(["getSenders", "getSenders"])
			// Cleanup stays admitted for a profile in recovery mode.
			await client.clearChainState(p.id, 31337)
			expect(wire.at(-1)).toBe("clearChainState")

			release()
			await inflight

			await service.lockActiveProfile()
			await writeRawRow(api, p.id, healthyRow)
			await service.unlockProfile(p.id, "pass1234")
			expect(service.isRecoveryMode(p.id)).toBe(false)
			await client.getSenders(net)
			expect(wire.at(-1)).toBe("getSenders")
		} finally {
			vi.restoreAllMocks()
			vi.unstubAllGlobals()
		}
	}, 30_000)
})

describe("dApp-session rows under same-phrase SIBLINGS — the real ProfileService derivation", () => {
	async function makeSiblings() {
		const api = new FakeBrowserApi()
		api.reset()
		const config = fakeConfig()
		const logger = new LoggerStore(config)
		const services = new ServiceCollection()
		services.add(new FakePasskeyService(logger))
		const profiles = new ProfileService(config, logger, api)
		services.add(profiles)
		const sessions = new DappSessionService(logger, api)
		services.add(svc(NETWORK_SERVICE_NAME, { registerChainPurgeSubscriber: () => {} }))
		services.add(sessions)
		await services.start()
		profiles.setDeletionDelegate({ snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }), runFor: async () => {} })
		const words = await wordsForFill(0x53)
		const p1 = await profiles.importMnemonic("A", words, "pass1234")
		const p2 = await profiles.importMnemonic("B", words, "pass1234", true)
		return { api, profiles, sessions, p1, p2 }
	}
	const rowKeys = async (api: FakeBrowserApi) =>
		Object.keys((await api.storage.local.get(null)) as Record<string, unknown>).filter((k) => k.startsWith("nulo:core:dappSessions@"))
	const settle = () => new Promise((r) => setTimeout(r, 0))

	test("a row p1 signed, re-targeted at p2 (same master), is REJECTED and dropped under p2; p1's authentic row is hidden under p2 and re-read by p1; a degraded p1 hides without deleting", async () => {
		const { api, profiles, sessions, p1, p2 } = await makeSiblings()
		await profiles.lockActiveProfile()
		await profiles.unlockProfile(p1.id, "pass1234")
		const row = await sessions.addDappSession({ name: "dApp", url: "https://dapp.example" }, [], [], 0 as never, "1", p1.id)
		const [key] = await rowKeys(api)
		const authentic = (await api.storage.local.get(key))[key] as string
		expect(JSON.parse(authentic).profileId).toBe(p1.id)

		// The forgery: a sibling holding the SAME master builds a p2-targeted row and signs it with
		// ITS key (master shared, DEK not) — p1's real derivation stands in for the attacker's. The
		// row seal is master-only, so the sibling opens p1's row and seals the forgery for p2 (the
		// keyring's keys stand in for its derivation): only the DEK-keyed MAC is out of its reach.
		const keysOf = (id: string) => {
			const keys = profiles.rowKeys(id)
			if (!keys) throw new Error(`no row keys for ${id}`)
			return keys
		}
		const root = "nulo:core:dappSessions"
		const sealedText = (JSON.parse(authentic) as { sealed: string }).sealed
		const authenticRow = JSON.parse(await openRow(keysOf(p1.id), sealedText, { root, storageKey: key, profileId: p1.id })) as Record<
			string,
			unknown
		> & { mac: string }
		const { mac: _authenticMac, ...forgedBody } = { ...authenticRow, profileId: p2.id }
		const forgedMac = await signDappSession(await profiles.deriveDappSessionMacKey(p1.id), forgedBody as never)
		const forged = await sealRow(keysOf(p2.id), JSON.stringify({ ...forgedBody, mac: forgedMac }), {
			root,
			storageKey: key,
			profileId: p2.id,
		})
		await api.storage.local.set({ [key]: JSON.stringify({ profileId: p2.id, sealed: forged }) })
		await profiles.lockActiveProfile()
		await profiles.unlockProfile(p2.id, "pass1234")
		expect(await sessions.getDappSessions()).toEqual([])
		await settle()
		expect(await rowKeys(api)).toEqual([])

		// p1's authentic row, read while p2 is active: hidden (p1 is locked), never deleted.
		await api.storage.local.set({ [key]: authentic })
		expect(await sessions.getDappSessions()).toEqual([])
		await settle()
		expect(await rowKeys(api)).toEqual([key])
		await profiles.lockActiveProfile()
		await profiles.unlockProfile(p1.id, "pass1234")
		expect((await sessions.getDappSessions()).map((r) => r.id)).toEqual([row.id])

		// p1 in recovery mode: no DEK → no key → hidden, never deleted; a healthy re-unlock re-reads it.
		const healthy = await readRawRow(api, p1.id)
		await profiles.lockActiveProfile()
		await writeRawRow(api, p1.id, { ...healthy, dekSealed: "AAAAAAAAAAAAAAAAAAAAAAAAAAAA" })
		await profiles.unlockProfile(p1.id, "pass1234")
		expect(profiles.isRecoveryMode(p1.id)).toBe(true)
		expect(await sessions.getDappSessions()).toEqual([])
		await settle()
		expect(await rowKeys(api)).toEqual([key])
		await profiles.lockActiveProfile()
		await writeRawRow(api, p1.id, healthy)
		await profiles.unlockProfile(p1.id, "pass1234")
		expect((await sessions.getDappSessions()).map((r) => r.id)).toEqual([row.id])
	}, 60_000)
})

// ── Credential rows, the degraded-open tail and the restore stash: byte-exact characterization ──

/** Persisted rows recorded under `seedRandom` before the row builders existed. A diff here is a
 *  refactor bug in a MAC binding, the key order or the draw order: never re-record it. */
const VECTORS = {
	createProfile:
		'{"id":"57da5de0","name":"P","type":"password","pxeGeneration":"63e669ec6ff275f87bfe8104870a8d10","dekSealed":"ADO2Obw/wkXIS85R1NMgBYiGSWwUgq/hQCr9ZzEZufA77Ha+SCp26O7VKJCXaDRjIkMhv2tagTp6fHB8xQ==","walletFingerprint":"1651dc30b4ebf7710b5f3f131fe00e2e86c42fdca894fbc4dd619f1f6b984536","guard":"AMdKzVDTVtlc32LlaLhYN5POF5LNA7UdWEq2C+zExBLZWw5rSw==","secret":"AOtu8XT3ev2AA4YJjCKQyN0gHvwl+u2FB9gMO5ypZAO29B3WdP4M57RcnQoIONwNTb6AbRK+zZkMVDZiBw==","entropy":"AA+SFZgbniGkJ6otsDE3fkvg6RJwKRzHmr6YLWyZRgfKZ40yOQPktSPx00LxrhGQ988bjZX3LlB/aVqvow==","envelopeMac":"P4nG6bXWpPTsWXuwNGZVKUwK5K1iloeN4Ll61ROFD90="}',
	importMnemonic:
		'{"id":"67ea6df0","name":"M","type":"password","pxeGeneration":"0386098c0f9215981b9e21a427aa2db0","dekSealed":"AN9i5WjrbvF093r9gHLKfNQHa4NskbXmv/TnqEUG0SH+hm+O2PzyL56PeyDxfLzWUrCKdsn273CqBNjdaQ==","walletFingerprint":"88011021d699c4b34d147248125216475436ee0002a7228be357ee8a685263d4","guard":"AHP2efx/AoUIiw6RFE7T9C1c7DUJjweN0tJ5Xolvvsj+CIg2bA==","secret":"AJcanSCjJqksrzK1OLxCFQzxpKp5m7SWVSoGphW33bVUeBxiPjj+wTICidIPEZFIA8fVtqQvtm7mCO/y1A==","entropy":"ALs+wUTHSs1Q01bZXJ2iuEGKeQhZ/7iUgvWxsCv+pI4fqRGnJonrlzfHApRrPqTTG2+S2cZqj5d3YOylBA==","envelopeMac":"hXTIcKfyBtK4kfUpSg8gSVyEyI+VywFSWMQZGtuC5uQ="}',
	changeProfilePassword:
		'{"id":"57da5de0","name":"P","type":"password","pxeGeneration":"63e669ec6ff275f87bfe8104870a8d10","dekSealed":"AONm6WzvcvV4+34BhNRM886Dpo/BUS4qCIvzgWsjSF1MS4OFwmwIfnPsKEc/SJwcVAbcGBxnPT/yP30c6w==","walletFingerprint":"1651dc30b4ebf7710b5f3f131fe00e2e86c42fdca894fbc4dd619f1f6b984536","guard":"AHf6fQCDBokMjxKVGEtBg/X7i/NZAKqh/+DlNVBdAgsZ9tnORg==","secret":"AJseoSSnKq0wsza5PIgkjE6hfkPaqNI0l7h72i4SZ6Ll5F8oiOEGpTAOPrVa/d12wlQYkmCxcRvC2Hdf+w==","entropy":"AL9CxUjLTtFU11rdYKOXbbCH4GkKcYrboh8agZiPhTGgBXXHU/pT8uPAelVoxbaNGjWciADYioVvkLUA/w==","envelopeMac":"CV/4ufEGDHF1ejQgbntfJ6oyQQJmCfZXv+ExwbAx3NU="}',
	restorePassword:
		'{"id":"67ea6df0","name":"R","type":"password","pxeGeneration":"73f679fc7f0285088b0e9114971a9d20","dekSealed":"AEPGScxP0lXYW95h5D67/zGqm5B/CEse9VMfenzOoLZjNdBd6P4Qk9bx8MYoq5517yIgiFQ/5VlYAbzzbw==","walletFingerprint":"0014d75992f28a43b1dadc1ddb9f392bfb0a268bd8cd742c16f5a947a084ceb0","guard":"AHf6fQCDBokMjxKVGBl8hNX5SjXkQY4jdUg+/4FBnopbeXrg+Q==","secret":"AJseoSSnKq0wsza5PFma/GRXgcPZSVeg3c3nH21GvSQQR5dAOT7B4JdfOoPr4xAnvUeSjoeEx8w01DpeUA==","entropy":"AL9CxUjLTtFU11rdYK4GQ1tgife8Dlg86+tbPbJdGiWbDFeSalaCwUkTlm6nLGcDehqk+SiuHju41Ub+fw==","envelopeMac":"nnyNrT5fiff60sASdg4uYLMlUePURymzglspFrn264c="}',
	createPasskeyProfile:
		'{"id":"57da5de0","name":"PK","type":"passkey","pxeGeneration":"63e669ec6ff275f87bfe8104870a8d10","dekSealed":"ATO2Obw/wkXIS85R1LigvY2bVg6l1SW9LE5l8hGBH4/1JF6vuwLD3iLujCBDITHWYi/AVEdBPqBulArfAg==","walletFingerprint":"1651dc30b4ebf7710b5f3f131fe00e2e86c42fdca894fbc4dd619f1f6b984536","guard":"AcdKzVDTVtlc32LlaNRFykhbQLJBaSMZHBYlxT24dFbOW/WJZA==","secret":"Aetu8XT3ev2AA4YJjIwiRnhoEnRWIj0q3Y6mFOsZv4Hq3Gz0A28m/J7HLa9nbsPUb/BhpJnnfNXjWN5Vww==","entropy":"AQ+SFZgbniGkJ6otsMaVvnYEIjhB0gOzMYsMDtvBqQNryZePNPkjf6Cpbo2xN+xm6HbogUPIksyesCha0w==","envelopeMac":"kVh+jrNZtfScSiGhtTza81oOMucl/QMzG70SF2z12rc=","credentialId":"cred-kat-1","prfSalt":"WlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlo="}',
}

describe("credential rows, degraded opens and the restore stash", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	/** Counter-filled `getRandomValues`, so every row path persists the same bytes on every run. */
	function seedRandom(): void {
		let n = 0
		vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((array: ArrayBufferView) => {
			const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
			for (let i = 0; i < bytes.length; i++) bytes[i] = (n++ * 131 + 7) & 0xff
			return array
		}) as typeof globalThis.crypto.getRandomValues)
	}

	const rawRow = async (api: FakeBrowserApi, id: string): Promise<string> =>
		(await api.storage.local.get(profileRowKey(id)))[profileRowKey(id)] as string

	function expectVector(name: keyof typeof VECTORS, raw: string): void {
		expect(raw).toBe(VECTORS[name])
	}

	type SealedRow = { guard: string; secret: string; entropy: string; dekSealed: string; walletFingerprint: string; envelopeMac: string }

	/** The v3 tag recomputed with node:crypto over the persisted fields, keyed on the STORAGE key. */
	function oracleTag(storageKey: string, row: SealedRow, master: Uint8Array, dek: Uint8Array): string {
		const ikm = Buffer.concat([Buffer.from(master), Buffer.from(dek)])
		const macKey = Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(32), Buffer.from("nulo:envelope-mac:v3", "utf8"), 64))
		const preimage = `${storageKey}.${row.guard}.${row.secret}.${row.entropy}.${row.dekSealed}.${row.walletFingerprint}`
		return createHmac("sha256", macKey).update(preimage, "utf8").digest("base64")
	}

	async function unsealPasswordDek(row: SealedRow, password: string): Promise<Uint8Array> {
		const key = await EncryptionKey.fromPasshash(await EncryptionKey.getPasshash(password))
		return key.decrypt(Buffer.from(row.dekSealed, "base64") as Uint8Array<ArrayBuffer>, IMPORTED_DEK_AAD)
	}

	async function unsealPasswordMaster(row: SealedRow, password: string): Promise<Uint8Array> {
		const unsealed = await new PasswordSecretBox().unseal(password, {
			guard: asBase64Ciphertext(row.guard),
			secret: asBase64Ciphertext(row.secret),
			entropy: asBase64Ciphertext(row.entropy),
		})
		if (!unsealed) throw new Error("oracle could not unseal the row")
		return unsealed.secret
	}

	async function expectOracle(storageKey: string, row: SealedRow, master: Uint8Array, password: string): Promise<void> {
		const dek = await unsealPasswordDek(row, password)
		expect(oracleTag(storageKey, row, master, dek)).toBe(row.envelopeMac)
		expect(oracleTag(storageKey, row, dek, master)).not.toBe(row.envelopeMac)
	}

	describe("row known-answer vectors (seeded RNG)", () => {
		test("createProfile persists the pinned row", async () => {
			seedRandom()
			const { api, service } = await makeService()
			const created = await service.createProfile("P", "pass1234")
			const raw = await rawRow(api, created.id)
			expectVector("createProfile", raw)
			await expectOracle(created.id, JSON.parse(raw), await unsealPasswordMaster(JSON.parse(raw), "pass1234"), "pass1234")
		}, 30_000)

		test("importMnemonic persists the pinned row", async () => {
			seedRandom()
			const { api, service } = await makeService()
			const words = await wordsForFill(0x21)
			const imported = await service.importMnemonic("M", words, "pass1234")
			const raw = await rawRow(api, imported.id)
			expectVector("importMnemonic", raw)
			await expectOracle(imported.id, JSON.parse(raw), await deriveMasterFromMnemonic(words), "pass1234")
		}, 30_000)

		test("changeProfilePassword persists the pinned re-MACed row", async () => {
			seedRandom()
			const { api, service } = await makeService()
			const created = await service.createProfile("P", "pass1234")
			await service.changeProfilePassword(created.id, "pass1234", "newpass99")
			const raw = await rawRow(api, created.id)
			expectVector("changeProfilePassword", raw)
			await expectOracle(created.id, JSON.parse(raw), await unsealPasswordMaster(JSON.parse(raw), "newpass99"), "newpass99")
		}, 30_000)

		test("a password restore over a taken id MACs the re-minted id and returns only the info", async () => {
			seedRandom()
			const { api, service } = await makeService()
			const live = await service.createProfile("L", "pass1234")
			await service.lockActiveProfile()
			const secret = await restoreSecretFor(0x31)
			const out = await service.restore({ id: live.id, name: "R", type: "password" }, secret, "pass1234")
			expect(out).toStrictEqual({ id: out.id, name: "R", type: "password" })
			expect(out.id).not.toBe(live.id)
			const raw = await rawRow(api, out.id)
			expectVector("restorePassword", raw)
			await expectOracle(out.id, JSON.parse(raw), Buffer.from(secret.masterKey, "base64"), "pass1234")
		}, 30_000)

		// The oracle derives the unlock key with node:crypto's HKDF, so a production derivation wired
		// the same wrong way on both seal and open cannot pass.
		test("createPasskeyProfile persists the pinned row, whose slots, DEK and MAC open under the unlock key", async () => {
			seedRandom()
			const { api, service } = await makeService()
			const prfSalt = Buffer.alloc(32, 0x5a).toString("base64")
			const answer = await fakePasskeyAnswer("cred-kat-1", prfSalt)
			const created = await service.createPasskeyProfile("PK", answer)
			const raw = await rawRow(api, created.id)
			expectVector("createPasskeyProfile", raw)
			const row = JSON.parse(raw)
			expect(row).toMatchObject({ type: "passkey", credentialId: "cred-kat-1", prfSalt })
			const keyBytes = hkdfSync(
				"sha256",
				fromBase64(answer.prf),
				fromBase64(prfSalt),
				Buffer.from("nulo:passkey-unlock:v1", "utf8"),
				32,
			)
			const unlockKey = await globalThis.crypto.subtle.importKey("raw", Buffer.from(keyBytes), { name: "AES-GCM" }, false, [
				"encrypt",
				"decrypt",
			])
			const opened = await openPasskeySlots(unlockKey, { guard: row.guard, secret: row.secret, entropy: row.entropy })
			if (!opened) throw new Error("oracle could not open the row")
			const dek = await unsealDekUnderWrapKey(unlockKey, row.dekSealed)
			expect(oracleTag(created.id, row, opened.secret, dek)).toBe(row.envelopeMac)
			expect(Buffer.from(opened.secret).toString("base64")).toBe(await service.exportPlain(created.id, undefined, answer))
		}, 30_000)
	})

	describe("profile RPC returns", () => {
		type Ctx = Awaited<ReturnType<typeof makeService>>
		const fresh = async ({ service }: Ctx) => (await service.createProfile("P", "pass1234")).id

		test.each<[string, (ctx: Ctx) => Promise<unknown>, string, string]>([
			["createProfile", ({ service }) => service.createProfile("P", "pass1234"), "P", "password"],
			[
				"createPasskeyProfile",
				async ({ service }) => service.createPasskeyProfile("PK", await newPasskeyAnswer("cred-ret-1")),
				"PK",
				"passkey",
			],
			["changeProfileName", async (ctx) => ctx.service.changeProfileName(await fresh(ctx), "Q"), "Q", "password"],
			[
				"changeProfilePassword",
				async (ctx) => ctx.service.changeProfilePassword(await fresh(ctx), "pass1234", "newpass99"),
				"P",
				"password",
			],
			["importMnemonic", async ({ service }) => service.importMnemonic("M", await wordsForFill(0x41), "pass1234"), "M", "password"],
			["deleteProfile", async (ctx) => ctx.service.deleteProfile(await fresh(ctx)), "P", "password"],
			[
				"deleteProfile of a torn import",
				async ({ api, service }) => {
					const out = await service.restore({ id: "t", name: "T", type: "password" }, await restoreSecretFor(0x42), "pass1234")
					const marker = await new RestorePendingRepository(api.storage.local).get(out.id)
					if (marker.kind !== "valid") throw new Error("restore wrote no marker")
					return service.deleteProfile(out.id, { pxeGeneration: marker.marker.pxeGeneration, markerAt: marker.marker.at })
				},
				"T",
				"password",
			],
		])(
			"%s returns the projection, never the stored row",
			async (_label, call, name, type) => {
				expect(await call(await makeService())).toStrictEqual({ id: expect.any(String), name, type })
			},
			30_000,
		)
	})

	describe("the degraded-open tail", () => {
		function observe(service: ProfileService) {
			const order: string[] = []
			const degraded: unknown[] = []
			service.onActiveProfileChanged.add((p) => {
				if (p) order.push("active")
			})
			service.onImportedKeysDegraded.add((info) => {
				order.push("degraded")
				degraded.push(info)
			})
			return { order, degraded }
		}

		const nonZero = (bytes: Uint8Array | undefined) => bytes?.some((b) => b !== 0) === true

		async function expectDegraded(service: ProfileService, seen: ReturnType<typeof observe>, returned: unknown, info: object) {
			const payload = { ...info, recoveryMode: true }
			expect(seen.degraded).toStrictEqual([payload])
			expect(seen.order).toStrictEqual(["active", "degraded"])
			expect(returned).toStrictEqual(payload)
			const id = (info as { id: string }).id
			expect(await service.getProfileDek(id)).toBeUndefined()
			expect(nonZero((await service.getProfileSecret(id)).toBuffer())).toBe(true)
		}

		async function expectHealthy(
			service: ProfileService,
			seen: ReturnType<typeof observe>,
			returned: unknown,
			info: object,
			dek: Uint8Array,
		) {
			expect(seen.degraded).toStrictEqual([])
			expect(seen.order).toStrictEqual(["active"])
			expect(returned).toStrictEqual(info)
			const id = (info as { id: string }).id
			const sessionDek = await service.getProfileDek(id)
			expect(nonZero(sessionDek)).toBe(true)
			expect(Array.from(sessionDek!)).toStrictEqual(Array.from(dek))
			expect(nonZero((await service.getProfileSecret(id)).toBuffer())).toBe(true)
		}

		async function lockedPasswordProfile(name = "P", password = "pass1234") {
			const ctx = await makeService()
			const created = await ctx.service.createProfile(name, password)
			await ctx.service.lockActiveProfile()
			return { ...ctx, id: created.id, info: { id: created.id, name, type: "password" } }
		}

		test("a rename in recovery mode keeps recoveryMode, so the popup's recovery banner stays", async () => {
			// The popup stores the rename's result as its profile, and the banner reads the flag there.
			const { api, service, id } = await lockedPasswordProfile()
			await writeRawRow(api, id, { ...(await readRawRow(api, id)), envelopeMac: Buffer.alloc(32, 0xee).toString("base64") })
			await service.unlockProfile(id, "pass1234")
			const renamed = { id, name: "Renamed", type: "password", recoveryMode: true }
			expect(await service.changeProfileName(id, "Renamed")).toStrictEqual(renamed)
			expect(await service.getActiveProfile()).toStrictEqual(renamed)
		}, 30_000)

		test("unlockProfile: a healthy open stays silent and holds the real master and DEK", async () => {
			const { api, service, id, info } = await lockedPasswordProfile()
			const dek = await unsealPasswordDek(await readRawRow(api, id), "pass1234")
			const seen = observe(service)
			await expectHealthy(service, seen, await service.unlockProfile(id, "pass1234"), info, dek)
		}, 30_000)

		test("unlockProfile: a same-password sibling's DEK slot opens derived-only and warns once", async () => {
			const { api, service, id, info } = await lockedPasswordProfile("A", "shared-pass1")
			const sibling = await service.createProfile("B", "shared-pass1")
			await service.lockActiveProfile()
			await writeRawRow(api, id, { ...(await readRawRow(api, id)), dekSealed: (await readRawRow(api, sibling.id)).dekSealed })
			const seen = observe(service)
			await expectDegraded(service, seen, await service.unlockProfile(id, "shared-pass1"), info)
		}, 30_000)

		test.each([
			["deleted", undefined],
			["non-string", 12345],
		])(
			"unlockProfile: an envelopeMac that is %s opens derived-only, warns once, and blocks the password change",
			async (_label, mac) => {
				const { api, service, id, info } = await lockedPasswordProfile()
				const { envelopeMac: _dropped, ...row } = await readRawRow(api, id)
				await writeRawRow(api, id, mac === undefined ? row : { ...row, envelopeMac: mac })
				const seen = observe(service)
				await expectDegraded(service, seen, await service.unlockProfile(id, "pass1234"), info)
				await service.lockActiveProfile()
				await expect(service.changeProfilePassword(id, "pass1234", "newpass99")).rejects.toThrow()
			},
			30_000,
		)

		test("unlockProfile: a degraded open that the integrity delegate refuses never warns", async () => {
			const { api, service, id } = await lockedPasswordProfile()
			const { envelopeMac: _dropped, ...row } = await readRawRow(api, id)
			await writeRawRow(api, id, row)
			service.setIntegrityDelegate({
				verifyBeforeSessionOpen: async () => {
					throw new AccountAddressInconsistencyError()
				},
			})
			const seen = observe(service)
			await expect(service.unlockProfile(id, "pass1234")).rejects.toBeInstanceOf(AccountAddressInconsistencyError)
			expect(seen.degraded).toStrictEqual([])
		}, 30_000)

		async function lockedPasskeyProfile() {
			const ctx = await makeService()
			const created = await ctx.service.createPasskeyProfile("PK", await newPasskeyAnswer("cred-tail"))
			const dek = new Uint8Array((await ctx.service.getProfileDek(created.id))!)
			await ctx.service.lockActiveProfile()
			return { ...ctx, id: created.id, dek, info: { id: created.id, name: "PK", type: "passkey" } }
		}

		test("unlockPasskeyProfile: a healthy open stays silent and holds the real master and DEK", async () => {
			const { service, id, info, dek } = await lockedPasskeyProfile()
			const seen = observe(service)
			await expectHealthy(service, seen, await service.unlockPasskeyProfile(id), info, dek)
		}, 30_000)

		test("unlockPasskeyProfile: a same-credential sibling's DEK slot opens derived-only and warns once", async () => {
			const { api, service, id, info } = await lockedPasskeyProfile()
			const { credentialId } = await service.getPasskeyUnlockParams(id)
			const sibling = await service.createPasskeyProfile("PK2", await newPasskeyAnswer(credentialId))
			await service.lockActiveProfile()
			await writeRawRow(api, id, { ...(await readRawRow(api, id)), dekSealed: (await readRawRow(api, sibling.id)).dekSealed })
			const seen = observe(service)
			await expectDegraded(service, seen, await service.unlockPasskeyProfile(id), info)
		}, 30_000)

		test("unlockPasskeyProfile: a blinded fingerprint opens derived-only and warns once", async () => {
			const { api, service, id, info } = await lockedPasskeyProfile()
			await writeRawRow(api, id, { ...(await readRawRow(api, id)), walletFingerprint: "0".repeat(64) })
			const seen = observe(service)
			await expectDegraded(service, seen, await service.unlockPasskeyProfile(id), info)
		}, 30_000)

		async function restoredPassword() {
			const ctx = await makeService()
			const out = await ctx.service.restore({ id: "r", name: "R", type: "password" }, await restoreSecretFor(0x51), "pass1234")
			return { ...ctx, id: out.id, info: { id: out.id, name: "R", type: "password" } }
		}

		test("finalizeRestore (password): a healthy open stays silent and holds the real master and DEK", async () => {
			const { api, service, id, info } = await restoredPassword()
			const dek = await unsealPasswordDek(await readRawRow(api, id), "pass1234")
			const seen = observe(service)
			await expectHealthy(service, seen, (await service.finalizeRestore(id, "pass1234")).profile, info, dek)
		}, 30_000)

		test("finalizeRestore (password): a corrupted envelopeMac opens derived-only and warns once", async () => {
			const { api, service, id, info } = await restoredPassword()
			await writeRawRow(api, id, { ...(await readRawRow(api, id)), envelopeMac: Buffer.alloc(32, 0xee).toString("base64") })
			const seen = observe(service)
			await expectDegraded(service, seen, (await service.finalizeRestore(id, "pass1234")).profile, info)
		}, 30_000)
	})

	describe("the restore stash", () => {
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to the stash map and its TTL
		const internalsOf = (service: ProfileService) => service as any
		const allZero = (bytes: Uint8Array) => bytes.every((b) => b === 0)

		async function restoredPassword(fill: number) {
			const ctx = await makeService()
			const out = await ctx.service.restore({ id: "ignored", name: "PR", type: "password" }, await restoreSecretFor(fill), "pass1234")
			const internals = internalsOf(ctx.service)
			return { ...ctx, id: out.id, internals, ttl: internals.constructor.PENDING_RESTORE_TTL_MS as number }
		}

		type RestoredPassword = Awaited<ReturnType<typeof restoredPassword>>
		const editRowType = async ({ api, id }: RestoredPassword, type: string) =>
			writeRawRow(api, id, { ...(await readRawRow(api, id)), type })
		const retireRow = async ({ api, id }: RestoredPassword) => {
			const { guard: _g, secret: _s, entropy: _e, envelopeMac: _m, ...row } = await readRawRow(api, id)
			await writeRawRow(api, id, { ...row, type: "passkey", credentialId: "Y3JlZA==" })
		}

		test.each<[string, (restored: RestoredPassword) => unknown, string | undefined]>([
			["the type refusal", (r) => editRowType(r, "bogus"), "Profile type changed between restore and finalizeRestore"],
			["a row edited into a retired one", retireRow, RetiredProfileError.MESSAGE],
			[
				"the already-active return",
				({ internals, id }) => {
					vi.spyOn(internals.sessionManager, "isActive").mockImplementation((p) => p === id)
					vi.spyOn(internals.sessionManager, "getActive").mockResolvedValue({ profile: { id }, serial: 1 })
				},
				undefined,
			],
			["a missing row", ({ api, id }) => api.storage.local.remove(profileRowKey(id)), "Invalid profile id"],
			["a tombstoned id", ({ service, id }) => service.getDeletionState().beginDeletion(id), "Invalid profile id"],
		])(
			"finalize wipes and drops the rewrap context on %s",
			async (_label, arrange, refusal) => {
				const restored = await restoredPassword(0x63)
				const { service, id, internals } = restored
				const { sourceDek, destinationDek } = internals.pendingDekRewraps.get(id)
				const buffers = [sourceDek, destinationDek]
				expect(buffers.some(allZero)).toBe(false)
				await arrange(restored)
				const finalized = service.finalizeRestore(id, "pass1234")
				if (refusal) await expect(finalized).rejects.toThrow(refusal)
				else await expect(finalized).resolves.toMatchObject({ profile: { id }, fence: { profileId: id, session: 1 } })
				expect(internals.pendingDekRewraps.has(id)).toBe(false)
				expect(buffers.every(allZero)).toBe(true)
			},
			30_000,
		)

		test("finalize spares the context a later restore stashed under the same id", async () => {
			const restored = await restoredPassword(0x64)
			const { service, id, internals } = restored
			const fresh = (fill: number) => new Uint8Array(32).fill(fill)
			const laterRewrap = { sourceDek: fresh(9), destinationDek: fresh(10), capturedAt: Date.now() }
			await editRowType(restored, "bogus")
			// A delete and a same-id restore landing while finalize is parked past the lock's watchdog.
			const clearMarker = internals.restorePending.delete.bind(internals.restorePending)
			vi.spyOn(internals.restorePending, "delete").mockImplementation(async (profileId) => {
				await clearMarker(profileId)
				internals.pendingDekRewraps.drop(id)
				internals.pendingDekRewraps.set(id, laterRewrap)
			})
			await expect(service.finalizeRestore(id, "pass1234")).rejects.toThrow(
				"Profile type changed between restore and finalizeRestore",
			)
			expect(internals.pendingDekRewraps.get(id)).toBe(laterRewrap)
			expect([laterRewrap.sourceDek, laterRewrap.destinationDek].some(allZero)).toBe(false)
		}, 30_000)

		test("consumeDekRewrapContext hands over exactly the two buffers once", async () => {
			const { service } = await makeService()
			const out = await service.restore({ id: "c", name: "C", type: "password" }, await restoreSecretFor(0x61), "pass1234")
			const context = await service.consumeDekRewrapContext(out.id)
			expect(Object.keys(context!)).toStrictEqual(["sourceDek", "destinationDek"])
			expect(Array.from(context!.sourceDek)).toStrictEqual(new Array(32).fill(0x55))
			expect(allZero(context!.destinationDek)).toBe(false)
			expect(await service.consumeDekRewrapContext(out.id)).toBeUndefined()
		}, 30_000)

		test("consumeDekRewrapContext wipes and drops an entry exactly at the TTL", async () => {
			const { service } = await makeService()
			const out = await service.restore({ id: "e", name: "E", type: "password" }, await restoreSecretFor(0x62), "pass1234")
			const internals = internalsOf(service)
			const entry = internals.pendingDekRewraps.get(out.id)
			const now = Date.now()
			vi.spyOn(Date, "now").mockReturnValue(now)
			entry.capturedAt = now - internals.constructor.PENDING_RESTORE_TTL_MS
			expect(await service.consumeDekRewrapContext(out.id)).toBeUndefined()
			expect(internals.pendingDekRewraps.has(out.id)).toBe(false)
			expect(allZero(entry.sourceDek) && allZero(entry.destinationDek)).toBe(true)
		}, 30_000)

		test("an unrelated consume wipes and drops another restore's context exactly at the TTL", async () => {
			const { service, id, internals, ttl } = await restoredPassword(0x65)
			const entry = internals.pendingDekRewraps.get(id)
			const now = Date.now()
			vi.spyOn(Date, "now").mockReturnValue(now)
			entry.capturedAt = now - ttl
			expect(await service.consumeDekRewrapContext("unrelated")).toBeUndefined()
			expect(internals.pendingDekRewraps.has(id)).toBe(false)
			expect(allZero(entry.sourceDek) && allZero(entry.destinationDek)).toBe(true)
		}, 30_000)
	})
})

describe("byte codecs: export encoders and the lenient decodes of stored and restored secrets", () => {
	/** 32 bytes of 0xfb: the encoding uses `+`, `/` and `=`, so alphabet and padding changes show. */
	const FB32_B64 = "+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/s="
	const urlSafe = (s: string) => s.replaceAll("+", "-").replaceAll("/", "_")
	const usesAlphabetEdges = (s: string) => s.includes("+") && s.includes("/") && s.endsWith("=")
	const profileRowKey = (id: string) => `nulo:core:profiles@${id}`

	afterEach(() => vi.unstubAllGlobals())

	/** A password profile created while `getRandomValues` fills 0xfb: fixed entropy, DEK and IVs. */
	async function fixedProfile() {
		const made = await makeService()
		const spy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
			;(array as unknown as Uint8Array).fill(0xfb)
			return array
		})
		try {
			return { ...made, profile: await made.service.createProfile("P", "pass1234") }
		} finally {
			spy.mockRestore()
		}
	}

	test("the export encoders write standard padded base64 of the stored bytes", async () => {
		const { api, service, profile } = await fixedProfile()
		const master = await deriveMasterFromMnemonic(await getMnemonic(new Uint8Array(32).fill(0xfb)))
		const masterB64 = Buffer.from(master).toString("base64")
		expect(usesAlphabetEdges(masterB64)).toBe(true)

		const material = await service.openBackupTransfer(profile.id, "pass1234")
		expect(material).toMatchObject({ masterKey: masterB64, entropy: FB32_B64 })
		expect(toBase64(material.sourceDek!)).toBe(FB32_B64)
		expect(await service.exportPlain(profile.id, "pass1234")).toBe(masterB64)

		const row = JSON.parse((await api.storage.local.get())[profileRowKey(profile.id)] as string)
		const dekSealed = row.dekSealed as string
		expect(usesAlphabetEdges(dekSealed)).toBe(true)
		expect(toBase64(fromBase64(dekSealed))).toBe(dekSealed)
		expect(dekSealed).toHaveLength(84)
		expect(fromBase64(dekSealed)[0]).toBe(0)
	}, 30_000)

	describe.each(BUFFER_BINDINGS)("%s Buffer", (_name, binding) => {
		test.each([
			["junk-suffixed", (s: string) => `${s}!`],
			["URL-safe", urlSafe],
		])(
			"a restore whose three secrets are %s restores the canonical master",
			async (_label, variant) => {
				const pair = await restorePairFor(0xfb)
				expect(usesAlphabetEdges(pair.masterKey)).toBe(true)
				expect(pair.entropy).toBe(FB32_B64)
				const { service } = await makeService()
				withBuffer(binding)
				const out = await service.restore(
					{ id: "ignored", name: "R", type: "password" },
					{
						masterKey: asBase64MasterSecret(variant(pair.masterKey)),
						entropy: variant(pair.entropy),
						importedKeysDek: variant(FB32_B64),
					},
					"pass1234",
				)
				if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))
				expect(await service.exportPlain(out.id, "pass1234")).toBe(pair.masterKey)
			},
			30_000,
		)

		test("a junk-suffixed stored dekSealed still unseals the stored DEK", async () => {
			const { api, service, profile } = await fixedProfile()
			const key = profileRowKey(profile.id)
			const row = JSON.parse((await api.storage.local.get())[key] as string)
			await api.storage.local.set({ [key]: JSON.stringify({ ...row, dekSealed: `${row.dekSealed}!` }) })
			withBuffer(binding)
			const material = await service.openBackupTransfer(profile.id, "pass1234")
			expect(toBase64(material.sourceDek!)).toBe(FB32_B64)
		}, 30_000)
	})

	test.each([
		["master key", { masterKey: Buffer.alloc(31, 1).toString("base64") }, "Invalid master key length"],
		// 28 bytes, not 31: `getMnemonic` itself refuses a length off a multiple of 4 with this same text.
		["entropy", { entropy: Buffer.alloc(28, 1).toString("base64") }, "Invalid entropy length"],
		["imported-keys DEK (absent)", { importedKeysDek: undefined }, "Invalid imported-keys dek length"],
		["imported-keys DEK (short)", { importedKeysDek: Buffer.alloc(31, 1).toString("base64") }, "Invalid imported-keys dek length"],
	])(
		"a restore refuses a wrong-length %s",
		async (_label, override, message) => {
			const { service } = await makeService()
			const secret = { ...(await restoreSecretFor(0xfb)), ...override } as Awaited<ReturnType<typeof restoreSecretFor>>
			await expect(service.restore({ id: "ignored", name: "R", type: "password" }, secret, "pass1234")).rejects.toThrow(message)
		},
		30_000,
	)
})

describe("row keys — held for the worker's lifetime, never for a dead incarnation", () => {
	const BINDING = { root: "nulo:core:contacts", storageKey: "nulo:core:contacts@c-1", profileId: "abc12345" }

	test("unlock fills them once; lock, switch and a password change keep the same keys", async () => {
		const { service } = await makeService()
		const announced: string[] = []
		service.onRowKeysReady.add((id) => announced.push(id))
		const a = await service.createProfile("A", "pass1234")
		const keys = service.rowKeys(a.id)
		expect(keys).toBeDefined()

		const b = await service.createProfile("B", "pass1234")
		await service.lockActiveProfile()
		expect(service.rowKeys(a.id)).toBe(keys)
		expect(service.rowKeys(b.id)).toBeDefined()
		await service.unlockProfile(a.id, "pass1234")
		await service.changeProfilePassword(a.id, "pass1234", "newpass1")
		expect(service.rowKeys(a.id)).toBe(keys)
		expect(announced).toEqual([a.id, b.id])
	}, 30_000)

	test("the integrity check sees them; a refused open keeps none it derived; recovery mode keeps them", async () => {
		const { api, service } = await makeService()
		const p = await service.createProfile("P", "pass1234")
		const { service: restarted } = await makeServiceFromExistingApi(api, { strict: true })
		expect(restarted.rowKeys(p.id)).toBeUndefined()

		const seen: boolean[] = []
		let refuse = true
		restarted.setIntegrityDelegate({
			verifyBeforeSessionOpen: async (id: string) => {
				seen.push(restarted.rowKeys(id) !== undefined)
				if (refuse) throw new AccountAddressInconsistencyError()
			},
		})
		await expect(restarted.unlockProfile(p.id, "pass1234")).rejects.toBeInstanceOf(AccountAddressInconsistencyError)
		expect(restarted.rowKeys(p.id)).toBeUndefined()

		refuse = false
		await writeRawRow(api, p.id, { ...(await readRawRow(api, p.id)), dekSealed: "AAAAAAAAAAAAAAAAAAAAAAAAAAAA" })
		await restarted.unlockProfile(p.id, "pass1234")
		expect(restarted.isRecoveryMode(p.id)).toBe(true)
		expect(restarted.rowKeys(p.id)).toBeDefined()
		expect(seen).toEqual([true, true])
	}, 30_000)

	test("a restore holds them before its finalize; a later incarnation of the same id never opens the dead one's rows", async () => {
		const { service } = await makeService()
		service.setDeletionDelegate({
			snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
			runFor: async (id) => service.dropRowKeys(id),
		})
		const first = await service.restore({ id: "abc12345", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
		const keys = service.rowKeys(first.id)
		if (!keys) throw new Error("a restore commit fills the row keys")
		const sealed = await sealRow(keys, "row", BINDING)
		await service.finalizeRestore(first.id, "pass1234")
		expect(service.rowKeys(first.id)).toBe(keys)

		await service.deleteProfile(first.id)
		expect(service.rowKeys(first.id)).toBeUndefined()
		const again = await service.restore({ id: "abc12345", name: "P", type: "password" }, await restoreSecretFor(11), "pass1234")
		expect(again.id).toBe(first.id)
		const reborn = service.rowKeys(again.id)
		if (!reborn) throw new Error("a restore commit fills the row keys")
		await expect(openRow(reborn, sealed, BINDING)).rejects.toThrow()
	}, 30_000)

	test("a deletion that lands while an open derives the row keys stops the open and keeps no keys", async () => {
		const { service } = await makeService()
		const p = await service.createProfile("P", "pass1234")
		await service.lockActiveProfile()
		service.dropRowKeys(p.id)
		const fill = RowKeyring.prototype.fill
		let release = () => {}
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		let reached = () => {}
		const deriving = new Promise<void>((resolve) => {
			reached = resolve
		})
		vi.spyOn(RowKeyring.prototype, "fill").mockImplementationOnce(async function (this: RowKeyring, ...args) {
			reached()
			await held
			return fill.apply(this, args)
		})
		const announced: string[] = []
		service.onRowKeysReady.add((id) => announced.push(id))

		const opening = service.unlockProfile(p.id, "pass1234")
		await deriving
		// What a whole deletion that a force-released facade lock let through leaves behind: a newer
		// epoch, and the id released again.
		service.getDeletionState().beginDeletion(p.id)
		service.getDeletionState().release(p.id)
		release()
		await expect(opening).rejects.toThrow("Invalid profile id")
		expect(service.rowKeys(p.id)).toBeUndefined()
		expect(await service.getActiveProfile()).toBeUndefined()
		expect(announced).toEqual([])
		vi.restoreAllMocks()
	}, 30_000)

	test("a worker that restores the session holds its keys, and a handler that subscribes late gets them on replay", async () => {
		const { api, service } = await makeService()
		const p = await service.createProfile("P", "pass1234")
		const { service: restarted } = await makeServiceFromExistingApi(api)
		expect(restarted.rowKeys(p.id)).toBeDefined()

		const late: string[] = []
		restarted.onRowKeysReady.add((id) => late.push(id))
		restarted.replayRowKeysReady()
		expect(late).toEqual([p.id])
	}, 30_000)
})

// A retired row holds no recovery phrase and no slot any unlock opens, so every path that would open,
// export or rewrite it refuses before it reads a secret, prompts a passkey or writes; listing, renaming
// and deleting it stay, so it can be removed.
describe("ProfileService — a retired passkey profile", () => {
	const RETIRED_ID = "0a1b2c3d"
	const retiredRow = () => ({
		id: RETIRED_ID,
		name: "Old",
		type: "passkey",
		pxeGeneration: "0".repeat(32),
		dekSealed: "ZGVr",
		walletFingerprint: "ff",
		credentialId: "Y3JlZA==",
	})

	async function withRetired() {
		const ctx = await makeService()
		await writeRawRow(ctx.api, RETIRED_ID, retiredRow())
		return ctx
	}

	const answer = () => fakePasskeyAnswer("Y3JlZA==", freshPrfSalt())

	test.each<[string, (service: ProfileService) => Promise<unknown>]>([
		["getPasskeyUnlockParams", (s) => s.getPasskeyUnlockParams(RETIRED_ID)],
		["unlockProfile", (s) => s.unlockProfile(RETIRED_ID, "pass1234")],
		["unlockPasskeyProfile in the passkey window", (s) => s.unlockPasskeyProfile(RETIRED_ID)],
		["unlockPasskeyProfile with an answer", async (s) => s.unlockPasskeyProfile(RETIRED_ID, await answer())],
		["exportMnemonic with a password", (s) => s.exportMnemonic(RETIRED_ID, "pass1234")],
		["exportMnemonic with an answer", async (s) => s.exportMnemonic(RETIRED_ID, undefined, await answer())],
		["exportPlain", async (s) => s.exportPlain(RETIRED_ID, undefined, await answer())],
		["exportImportedKeysDek", (s) => s.exportImportedKeysDek(RETIRED_ID, "pass1234")],
		["openBackupTransfer", async (s) => s.openBackupTransfer(RETIRED_ID, undefined, await answer())],
		["changeProfilePassword", (s) => s.changeProfilePassword(RETIRED_ID, "pass1234", "newpass99")],
		["finalizeRestore", (s) => s.finalizeRestore(RETIRED_ID, "pass1234")],
	])(
		"%s refuses with the typed error, prompts nothing, opens nothing and writes nothing",
		async (_label, call) => {
			const { api, service, passkeys } = await withRetired()
			const getKey = vi.spyOn(passkeys, "getKey")
			const before = await api.storage.local.get(null)

			await expect(call(service)).rejects.toBeInstanceOf(RetiredProfileError)
			expect(getKey).not.toHaveBeenCalled()
			expect(await service.getActiveProfile()).toBeUndefined()
			expect(await api.storage.local.get(null)).toStrictEqual(before)
		},
		30_000,
	)

	test("it is listed as retired, can be renamed and deleted, and another profile beside it works", async () => {
		const { api, service } = await withRetired()
		const live = await service.createProfile("Live", "pass1234")
		expect((await service.getProfiles()).find((p) => p.id === RETIRED_ID)).toStrictEqual({
			id: RETIRED_ID,
			name: "Old",
			type: "passkey",
			retired: true,
		})
		expect((await service.getProfiles()).find((p) => p.id === live.id)?.retired).toBeUndefined()
		expect(await service.changeProfileName(RETIRED_ID, "Older")).toMatchObject({ name: "Older", retired: true })
		expect(await readRawRow(api, RETIRED_ID)).toStrictEqual({ ...retiredRow(), name: "Older" })
		await service.deleteProfile(RETIRED_ID)
		expect((await service.getProfiles()).map((p) => p.id)).toEqual([live.id])
		expect((await service.getActiveProfile())?.id).toBe(live.id)
	}, 30_000)

	// Start-up must not depend on a retired row: a session persisted for its id is dropped silently.
	test("a session persisted for an id whose row is now retired is dropped, not restored, and the worker starts", async () => {
		const { api, service } = await makeService()
		const p = await service.createProfile("P", "pass1234")
		await writeRawRow(api, p.id, { ...retiredRow(), id: p.id })
		const persisted = async () => (await api.storage.session.get(SESSION_STORAGE_ROOT))[SESSION_STORAGE_ROOT]
		expect(await persisted()).toBeDefined()
		const { service: restarted } = await makeServiceFromExistingApi(api)
		expect(await restarted.getActiveProfile()).toBeUndefined()
		expect(await persisted()).toBeUndefined()
		expect((await restarted.getProfiles()).map((x) => x.retired)).toEqual([true])
	}, 30_000)

	// The opener and the row-key fill are where every open and every derivation ends: each refuses a
	// retired row itself, so a caller that skips its own gate still reads and derives nothing.
	test("the slot opener and the row-key fill refuse a retired row themselves", async () => {
		const { service } = await withRetired()
		const internals = service as unknown as {
			openSlots(row: unknown, key: { password: string }): Promise<unknown>
			fillRowKeysHoldingLock(row: unknown, master: Uint8Array): Promise<void>
		}
		await expect(internals.openSlots(retiredRow(), { password: "pass1234" })).rejects.toBeInstanceOf(RetiredProfileError)
		await expect(internals.fillRowKeysHoldingLock(retiredRow(), new Uint8Array(32).fill(7))).rejects.toBeInstanceOf(RetiredProfileError)
	}, 30_000)
})
