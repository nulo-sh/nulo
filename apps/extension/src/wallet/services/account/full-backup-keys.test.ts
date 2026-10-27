/**
 * The password full-backup key export, driven through the real ProfileService and AccountService
 * with real crypto: what the file's key opens and must never open, the restore of a new and of a
 * legacy backup, and the run fence around the export. Only the per-row seal and unseal are wrapped,
 * to hold an export mid-flight and to see the key buffers it was handed.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { fromBase64, toBase64 } from "@nulo/wallet-core/utils"
import {
	asBase64MasterSecret,
	asImportedKeysDek,
	EncryptionKey,
	type ImportedKeysDek,
	PasskeyCredential,
	type PasskeyCredentialData,
} from "@nulo/wallet-crypto"
import { InvalidPasswordError, RetiredProfileError, SessionEndedError } from "@nulo/extension-messaging/errors"
import { fakePasskeyAnswer, freshPrfSalt } from "../../../../tests/helpers/fake-passkey"
import { validateAndMigrateBackup } from "@/composables/useFullBackupImport"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { EntityStorage } from "@/wallet/storage"
import { DEFAULT_SEEDS } from "@/wallet/services/network/seeds"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { ProfileService } from "@/wallet/services/profile/service"
import { svc } from "../composition-harness"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { ImportedKeysRepository } from "./imported-keys-repository"
import { AccountService } from "./service"
import {
	ACCOUNT_SERVICE_NAME,
	ACCOUNT_STORAGE_ROOT,
	type Account,
	AccountType,
	IMPORTED_KEYS_SERVICE_NAME,
	IMPORTED_KEYS_STORAGE_ROOT,
	type ImportedAccountKey,
	accountRowId,
} from "./spec"

const box = vi.hoisted(() => ({ beforeSeal: undefined as undefined | (() => Promise<void>) }))
vi.mock("@nulo/wallet-crypto", async (importOriginal) => {
	const original = await importOriginal<typeof import("@nulo/wallet-crypto")>()
	return {
		...original,
		unsealImportedSigningKeyV2: vi.fn(original.unsealImportedSigningKeyV2),
		deriveAccountSeed: vi.fn(original.deriveAccountSeed),
		sealImportedSigningKeyV2: vi.fn(async (...args: Parameters<typeof original.sealImportedSigningKeyV2>) => {
			await box.beforeSeal?.()
			return original.sealImportedSigningKeyV2(...args)
		}),
	}
})

import { deriveAccountSeed, sealImportedSigningKeyV2, unsealImportedSigningKeyV2 } from "@nulo/wallet-crypto"

const PASSWORD = "pass1234"
const CHAIN = 0
const L1 = 31337
const ADDR_A = `0x${"0a".repeat(32)}`
const ADDR_B = `0x${"0b".repeat(32)}`

afterEach(() => {
	box.beforeSeal = undefined
	vi.clearAllMocks()
})

/** A network service whose profile has a network row for exactly the chains of `l1ByChain`. */
function networksOf(l1ByChain: Map<number, number>) {
	return {
		registerChainPurgeSubscriber: () => {},
		isChainLive: async () => true,
		getNetworksRaw: async (profileId: string) => [...l1ByChain].map(([chainId, l1ChainId]) => ({ profileId, chainId, l1ChainId })),
		getL1ChainIdStored: async (_profileId: string, chainId: number) => {
			const l1 = l1ByChain.get(chainId)
			if (l1 === undefined) throw new Error(`No network for chain ${chainId} in this profile`)
			return l1
		},
	}
}

function freshApi() {
	const api = new FakeBrowserApi()
	api.reset()
	return api
}

/** Boots the services; given an `api`, boots them over its store, as a worker restart does. */
async function build(opts: { api?: FakeBrowserApi; networks?: ReturnType<typeof networksOf> } = {}) {
	const api = opts.api ?? freshApi()
	const config = new ConfigStore()
	const logger = new LoggerStore(config)
	const services = new ServiceCollection()
	services.add(svc(PASSKEY_SERVICE_NAME, { materializeCredential: (data: PasskeyCredentialData) => PasskeyCredential.create(data) }))
	services.add(svc(NETWORK_SERVICE_NAME, opts.networks ?? networksOf(new Map([[CHAIN, L1]]))))
	const profile = new ProfileService(config, logger, api)
	services.add(profile)
	const account = new AccountService(logger, api)
	services.add(account)
	await services.start()
	profile.setDeletionDelegate({ snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }), runFor: async () => {} })
	return { api, profile, account, keys: new ImportedKeysRepository(api.storage.local, (id) => profile.rowKeys(id)) }
}

/** An imported account as `importAccount` leaves it: its row, and its key sealed under `dek`. */
async function seedImported(api: FakeBrowserApi, profileId: string, address: string, fill: number, dek: ImportedKeysDek, chainId = CHAIN) {
	const signingKey = new Uint8Array(32).fill(fill)
	const row: ImportedAccountKey = {
		profileId,
		chainId,
		address,
		encryptedSigningKey: await sealImportedSigningKeyV2(dek, chainId, address, signingKey),
	}
	// Seeded plaintext, as a row written before the root was sealed: the dual read serves it.
	await new EntityStorage<ImportedAccountKey>(IMPORTED_KEYS_STORAGE_ROOT, api.storage.local).set(
		accountRowId(profileId, chainId, address),
		row,
	)
	const accountRow: Account = {
		profileId,
		chainId,
		address,
		index: 0,
		type: AccountType.Imported,
		l1ChainId: L1,
		name: "Imp",
		visible: true,
	}
	await new EntityStorage<Account>(ACCOUNT_STORAGE_ROOT, api.storage.local).set(accountRowId(profileId, chainId, address), accountRow)
	return row
}

const opened = async (key: ImportedKeysDek, row: ImportedAccountKey) =>
	Array.from(await unsealImportedSigningKeyV2(key, row.chainId, row.address, row.encryptedSigningKey))
const keyOf = (b64: string) => asImportedKeysDek(fromBase64(b64))
const allZero = (b: Uint8Array) => b.every((x) => x === 0)

/** A password backup as the export page assembles it, checksummed like the real file. */
async function backupFile(keys: {
	masterKey: string
	entropy: string
	importedKeysDek: string
	accounts: Account[]
	rows: ImportedAccountKey[]
	type?: "password" | "passkey"
}) {
	const body = {
		"compat-epoch": 5,
		"backup-schema-version": 1,
		"master-key": keys.masterKey,
		entropy: keys.entropy,
		"imported-keys-dek": keys.importedKeysDek,
		data: {
			profile: { id: "source-id", name: "P", type: keys.type ?? "password" },
			[ACCOUNT_SERVICE_NAME]: keys.accounts,
			[IMPORTED_KEYS_SERVICE_NAME]: keys.rows,
		},
	}
	return { ...body, checksum: await EncryptionKey.getHashHex(JSON.stringify(body)) }
}

/** Runs a file through the import gates and restores its profile into `fresh`, unfinalized. */
async function restoreProfileFrom(file: Awaited<ReturnType<typeof backupFile>>, fresh: Awaited<ReturnType<typeof build>>) {
	const validated = await validateAndMigrateBackup(file)
	if (validated.kind !== "ok") throw new Error(validated.message)
	const envelope = validated.backup as unknown as Record<string, string>
	const restored = await fresh.profile.restore(
		{ id: "source-id", name: "Restored", type: "password" },
		{
			masterKey: asBase64MasterSecret(envelope["master-key"]!),
			entropy: envelope.entropy!,
			importedKeysDek: envelope["imported-keys-dek"]!,
		},
		PASSWORD,
	)
	if ("restoreError" in restored && restored.restoreError) throw new Error(String(restored.restoreError))
	const remap = <T>(rows: T[]) => rows.map((r) => ({ ...r, profileId: restored.id }))
	return {
		profileId: restored.id,
		accounts: remap(validated.data[ACCOUNT_SERVICE_NAME] as Account[]),
		keyRows: remap(validated.data[IMPORTED_KEYS_SERVICE_NAME] as ImportedAccountKey[]),
	}
}

/** Restores a file into a fresh wallet and returns the restored profile's opened signing keys. */
async function restoreIntoFreshWallet(file: Awaited<ReturnType<typeof backupFile>>) {
	const fresh = await build()
	const { profileId, keyRows } = await restoreProfileFrom(file, fresh)
	const results = await fresh.account.restoreImportedKeys(keyRows)
	expect(results.every((r) => !r.restoreError)).toBe(true)
	await fresh.profile.finalizeRestore(profileId, PASSWORD)
	const destinationDek = (await fresh.profile.getProfileDek(profileId))!
	return Promise.all((await fresh.keys.backup(profileId)).map((row) => opened(destinationDek, row)))
}

describe("exportFullBackupKeys — the per-backup key", () => {
	test("every exported row opens under the file's key, which is not the DEK and never travels with it", async () => {
		const { api, profile, account } = await build()
		const p = await profile.createProfile("P", PASSWORD)
		const dek = (await profile.getProfileDek(p.id))!
		await seedImported(api, p.id, ADDR_A, 0x2a, dek)

		const keys = await account.exportFullBackupKeys(await profile.captureRunFence(), PASSWORD)

		const fileKey = keyOf(keys.importedKeysKey)
		expect(Array.from(fileKey)).not.toEqual(Array.from(dek))
		expect(JSON.stringify(keys)).not.toContain(toBase64(dek))
		expect(keys.dekReplaced).toBe(false)
		expect(keys.unopenedImportedKeys).toBe(0)
		expect(keys.accounts.map((a) => a.address)).toEqual([ADDR_A])
		expect(keys.importedKeyRows).toHaveLength(1)
		expect(await opened(fileKey, keys.importedKeyRows[0]!)).toEqual(Array(32).fill(0x2a))
	}, 30_000)

	test("a key imported after the export does not open under the file's key", async () => {
		const { api, profile, account } = await build()
		const p = await profile.createProfile("P", PASSWORD)
		const dek = (await profile.getProfileDek(p.id))!
		await seedImported(api, p.id, ADDR_A, 0x2a, dek)
		const keys = await account.exportFullBackupKeys(await profile.captureRunFence(), PASSWORD)

		const later = await seedImported(api, p.id, ADDR_B, 0x2b, dek)

		await expect(opened(keyOf(keys.importedKeysKey), later)).rejects.toThrow()
		expect(await opened(keyOf(keys.importedKeysKey), keys.importedKeyRows[0]!)).toEqual(Array(32).fill(0x2a))
	}, 30_000)

	test("rows that do not open travel as stored: one corrupt row beside a good one, and every row once the slot is unrecoverable", async () => {
		const { api, profile, account, keys: repo } = await build()
		const p = await profile.createProfile("P", PASSWORD)
		const dek = (await profile.getProfileDek(p.id))!
		await seedImported(api, p.id, ADDR_A, 0x2a, dek)
		const corrupt = { ...(await seedImported(api, p.id, ADDR_B, 0x2b, dek)), encryptedSigningKey: toBase64(new Uint8Array(45).fill(1)) }
		await repo.set(corrupt)

		const partial = await account.exportFullBackupKeys(await profile.captureRunFence(), PASSWORD)
		expect(partial.dekReplaced).toBe(false)
		expect(partial.unopenedImportedKeys).toBe(1)
		expect(partial.importedKeyRows.find((r) => r.address === ADDR_B)).toEqual(corrupt)
		expect(await opened(keyOf(partial.importedKeysKey), partial.importedKeyRows.find((r) => r.address === ADDR_A)!)).toEqual(
			Array(32).fill(0x2a),
		)

		const stored = await repo.backup(p.id)
		await profile.lockActiveProfile()
		const rowKey = `nulo:core:profiles@${p.id}`
		const row = JSON.parse((await api.storage.local.get(rowKey))[rowKey] as string)
		await api.storage.local.set({ [rowKey]: JSON.stringify({ ...row, dekSealed: toBase64(new Uint8Array(45)) }) })
		await profile.unlockProfile(p.id, PASSWORD)

		const replaced = await account.exportFullBackupKeys(await profile.captureRunFence(), PASSWORD)
		expect(replaced.dekReplaced).toBe(true)
		expect(replaced.unopenedImportedKeys, "a replaced DEK has only its own warning").toBe(0)
		expect(replaced.importedKeyRows).toEqual(stored)
	}, 30_000)

	test("a seal failure aborts the export and zeroizes both keys", async () => {
		const { api, profile, account } = await build()
		const p = await profile.createProfile("P", PASSWORD)
		await seedImported(api, p.id, ADDR_A, 0x2a, (await profile.getProfileDek(p.id))!)
		vi.mocked(sealImportedSigningKeyV2).mockClear()
		box.beforeSeal = async () => {
			throw new Error("seal failed")
		}

		await expect(account.exportFullBackupKeys(await profile.captureRunFence(), PASSWORD)).rejects.toThrow("seal failed")

		const sourceDek = vi.mocked(unsealImportedSigningKeyV2).mock.calls.at(-1)![0]
		const transferKey = vi.mocked(sealImportedSigningKeyV2).mock.calls.at(-1)![0]
		expect(sourceDek).toHaveLength(32)
		expect(allZero(sourceDek) && allZero(transferKey)).toBe(true)
	}, 30_000)
})

describe("exportFullBackupKeys — restore", () => {
	test("a new backup restores through ProfileService.restore and restoreImportedKeys to the original signing key", async () => {
		const { api, profile, account } = await build()
		const p = await profile.createProfile("P", PASSWORD)
		await seedImported(api, p.id, ADDR_A, 0x2a, (await profile.getProfileDek(p.id))!)
		const keys = await account.exportFullBackupKeys(await profile.captureRunFence(), PASSWORD)

		const restored = await restoreIntoFreshWallet(
			await backupFile({ ...keys, importedKeysDek: keys.importedKeysKey, rows: keys.importedKeyRows }),
		)

		expect(restored).toEqual([Array(32).fill(0x2a)])
	}, 60_000)

	// One body for both methods: a passkey profile's file carries what a password profile's does, and
	// opens with the file's password alone.
	test("a passkey profile's backup, opened with its own answer, restores under the file password to the original signing key", async () => {
		const { api, profile, account } = await build()
		const answer = await fakePasskeyAnswer("cred-a", freshPrfSalt())
		const p = await profile.createPasskeyProfile("PK", answer)
		await seedImported(api, p.id, ADDR_A, 0x2b, (await profile.getProfileDek(p.id))!)
		const fence = await profile.captureRunFence()
		await expect(account.exportFullBackupKeys(fence, PASSWORD)).rejects.toBeInstanceOf(InvalidPasswordError)
		await expect(account.exportFullBackupKeys(fence, undefined, await fakePasskeyAnswer("cred-a", freshPrfSalt()))).rejects.toThrow(
			"Passkey did not open this profile",
		)
		const keys = await account.exportFullBackupKeys(fence, undefined, answer)
		expect(keys.importedKeyRows).toHaveLength(1)

		const restored = await restoreIntoFreshWallet(
			await backupFile({ ...keys, importedKeysDek: keys.importedKeysKey, rows: keys.importedKeyRows, type: "passkey" }),
		)

		expect(restored).toEqual([Array(32).fill(0x2b)])
	}, 60_000)

	test("a legacy backup, which carries the profile's DEK and DEK-sealed rows, still restores", async () => {
		const { api, profile, account, keys: repo } = await build()
		const p = await profile.createProfile("P", PASSWORD)
		const dek = (await profile.getProfileDek(p.id))!
		await seedImported(api, p.id, ADDR_A, 0x2a, dek)
		const { masterKey, entropy, accounts } = await account.exportFullBackupKeys(await profile.captureRunFence(), PASSWORD)

		const restored = await restoreIntoFreshWallet(
			await backupFile({ masterKey, entropy, accounts, importedKeysDek: toBase64(dek), rows: await repo.backup(p.id) }),
		)

		expect(restored).toEqual([Array(32).fill(0x2a)])
	}, 60_000)
})

describe("full-backup restore — an imported account on a network the new profile lacks", () => {
	test("keeps its row and its key across a worker restart, and the per-chain read lists it", async () => {
		const DEVNET = 1337
		const source = await build()
		const p = await source.profile.createProfile("P", PASSWORD)
		await seedImported(source.api, p.id, ADDR_A, 0x2a, (await source.profile.getProfileDek(p.id))!, DEVNET)
		const keys = await source.account.exportFullBackupKeys(await source.profile.captureRunFence(), PASSWORD)
		const file = await backupFile({ ...keys, importedKeysDek: keys.importedKeysKey, rows: keys.importedKeyRows })

		const seeded = new Map(DEFAULT_SEEDS.map((seed) => [seed.chainId, seed.l1ChainId]))
		const fresh = await build({ networks: networksOf(seeded) })
		const { profileId, accounts, keyRows } = await restoreProfileFrom(file, fresh)
		await fresh.account.restore(accounts)
		await fresh.account.restoreImportedKeys(keyRows)
		await fresh.account.reconcileImportedAccounts(profileId)
		await fresh.profile.finalizeRestore(profileId, PASSWORD)

		const restarted = await build({ api: fresh.api, networks: networksOf(seeded) })
		await restarted.profile.unlockProfile(profileId, PASSWORD)
		const kept = await restarted.keys.backup(profileId)
		expect(kept.map((row) => row.address)).toEqual([ADDR_A])
		expect(await opened((await restarted.profile.getProfileDek(profileId))!, kept[0]!)).toEqual(Array(32).fill(0x2a))
		const stored = await sealedEntityStorage("accounts", fresh.api.storage.local, (id) => restarted.profile.rowKeys(id)).get(
			accountRowId(profileId, DEVNET, ADDR_A),
		)
		expect(stored).toEqual({ ...keys.accounts[0], profileId })
		expect((await restarted.account.getAccounts(profileId, DEVNET)).map((a) => a.address)).toEqual([ADDR_A])
	}, 60_000)
})

describe("exportFullBackupKeys — the run fence", () => {
	/** Starts an export that stops at its first seal, after the password check and the reads. */
	async function heldExport() {
		const { api, profile, account } = await build()
		const a = await profile.createProfile("A", PASSWORD)
		await seedImported(api, a.id, ADDR_A, 0x2a, (await profile.getProfileDek(a.id))!)
		const fence = await profile.captureRunFence()
		let reached!: () => void
		const atSeal = new Promise<void>((resolve) => {
			reached = resolve
		})
		let release!: () => void
		box.beforeSeal = () => {
			reached()
			return new Promise<void>((resolve) => {
				release = resolve
			})
		}
		const run = account.exportFullBackupKeys(fence, PASSWORD)
		await atSeal
		box.beforeSeal = undefined
		return { profile, account, a, run, release: () => release() }
	}

	test("a held export released with nothing in between resolves (control)", async () => {
		const { run, release } = await heldExport()
		release()
		await expect(run).resolves.toMatchObject({ dekReplaced: false })
	}, 30_000)

	test("a lock between the password check and the last seal refuses the export and still zeroizes both keys", async () => {
		const { profile, run, release } = await heldExport()
		await profile.lockActiveProfile()
		release()
		await expect(run).rejects.toBeInstanceOf(SessionEndedError)
		const sourceDek = vi.mocked(unsealImportedSigningKeyV2).mock.calls.at(-1)![0]
		const transferKey = vi.mocked(sealImportedSigningKeyV2).mock.calls.at(-1)![0]
		expect(allZero(sourceDek) && allZero(transferKey)).toBe(true)
	}, 30_000)

	test("a switch away and back between the password check and the last seal refuses the export", async () => {
		const { profile, a, run, release } = await heldExport()
		await profile.createProfile("B", "other-pass")
		await profile.unlockProfile(a.id, PASSWORD)
		release()
		await expect(run).rejects.toBeInstanceOf(SessionEndedError)
	}, 60_000)

	test("a deletion between the password check and the last seal refuses the export", async () => {
		const { profile, a, run, release } = await heldExport()
		await profile.deleteProfile(a.id)
		release()
		await expect(run).rejects.toBeInstanceOf(SessionEndedError)
	}, 30_000)

	test("a deletion and a same-id re-creation, unlocked again, between the password check and the last seal refuses the export", async () => {
		const { profile, a, run, release } = await heldExport()
		const { masterKey, entropy, transferKey } = await profile.openBackupTransfer(a.id, PASSWORD)
		await profile.deleteProfile(a.id)
		const recreated = await profile.restore(
			{ id: a.id, name: "A", type: "password" },
			{ masterKey: asBase64MasterSecret(masterKey), entropy, importedKeysDek: toBase64(transferKey) },
			PASSWORD,
		)
		await profile.finalizeRestore(recreated.id, PASSWORD)
		expect(recreated.id).toBe(a.id)
		expect((await profile.getActiveProfile())?.id).toBe(a.id)
		release()
		await expect(run).rejects.toBeInstanceOf(SessionEndedError)
	}, 60_000)

	test("a fence from another session is refused before the password check or any read", async () => {
		const { api, profile, account } = await build()
		const a = await profile.createProfile("A", PASSWORD)
		await seedImported(api, a.id, ADDR_A, 0x2a, (await profile.getProfileDek(a.id))!)
		const stale = await profile.captureRunFence()
		await profile.lockActiveProfile()
		await profile.unlockProfile(a.id, PASSWORD)
		const transfer = vi.spyOn(profile, "openBackupTransfer")

		await expect(account.exportFullBackupKeys(stale, PASSWORD)).rejects.toBeInstanceOf(SessionEndedError)
		expect(transfer).not.toHaveBeenCalled()
		expect(unsealImportedSigningKeyV2).not.toHaveBeenCalled()
	}, 30_000)
})

describe("exportFullBackupKeys — a network reset in progress", () => {
	test("refuses while a reset journal exists, with no key opened, and exports again once it is gone", async () => {
		const { api, profile, account } = await build()
		const p = await profile.createProfile("P", PASSWORD)
		await seedImported(api, p.id, ADDR_A, 0x2a, (await profile.getProfileDek(p.id))!)
		const journal = {
			profileId: p.id,
			networkId: "n1",
			fromChainId: 1,
			toChainId: 2,
			l1ChainId: L1,
			cause: { networkReset: true, addressesMoved: false },
			purged: true,
			switchToSeedNode: false,
			probedEndpoint: null,
			accounts: [],
		}
		await api.storage.local.set({ [`nulo:core:network-reset@${p.id}`]: JSON.stringify(journal) })

		await expect(account.exportFullBackupKeys(await profile.captureRunFence(), PASSWORD)).rejects.toThrow(/^ERR_RESET_PENDING/)
		expect(unsealImportedSigningKeyV2).not.toHaveBeenCalled()
		await expect(account.backup()).rejects.toThrow(/^ERR_RESET_PENDING/)
		await expect(account.backupImportedKeys()).rejects.toThrow(/^ERR_RESET_PENDING/)

		await api.storage.local.remove(`nulo:core:network-reset@${p.id}`)
		await expect(account.exportFullBackupKeys(await profile.captureRunFence(), PASSWORD)).resolves.toMatchObject({ dekReplaced: false })
		await expect(account.backupImportedKeys()).resolves.toHaveLength(1)
	}, 30_000)

	test("refuses when a reset journal appears while the backup reads", async () => {
		const { api, profile, account } = await build()
		const p = await profile.createProfile("P", PASSWORD)
		await seedImported(api, p.id, ADDR_A, 0x2a, (await profile.getProfileDek(p.id))!)
		const open = profile.openBackupTransfer.bind(profile)
		vi.spyOn(profile, "openBackupTransfer").mockImplementation(async (...args) => {
			await api.storage.local.set({
				[`nulo:core:network-reset@${p.id}`]: JSON.stringify({
					profileId: p.id,
					networkId: "n1",
					fromChainId: 1,
					toChainId: 2,
					l1ChainId: L1,
					cause: { networkReset: true, addressesMoved: false },
					purged: false,
					switchToSeedNode: false,
					probedEndpoint: null,
					accounts: [],
				}),
			})
			return open(...args)
		})
		await expect(account.exportFullBackupKeys(await profile.captureRunFence(), PASSWORD)).rejects.toThrow(/^ERR_RESET_PENDING/)
	}, 30_000)

	test("the imported-keys and accounts slices refuse when a reset journal appears while they read", async () => {
		const { api, profile, account, keys } = await build()
		const p = await profile.createProfile("P", PASSWORD)
		await seedImported(api, p.id, ADDR_A, 0x2a, (await profile.getProfileDek(p.id))!)
		const journal = JSON.stringify({
			profileId: p.id,
			networkId: "n1",
			fromChainId: 1,
			toChainId: 2,
			l1ChainId: L1,
			cause: { networkReset: true, addressesMoved: false },
			purged: false,
			switchToSeedNode: false,
			probedEndpoint: null,
			accounts: [],
		})
		const read = keys.backup.bind(keys)
		const keysRead = vi.spyOn(ImportedKeysRepository.prototype, "backup").mockImplementation(async (id: string) => {
			const rows = await read(id)
			await api.storage.local.set({ [`nulo:core:network-reset@${p.id}`]: journal })
			return rows
		})
		await expect(account.backupImportedKeys()).rejects.toThrow(/^ERR_RESET_PENDING/)
		keysRead.mockRestore()
		await api.storage.local.remove(`nulo:core:network-reset@${p.id}`)
		const internals = account as unknown as { liveRows: () => Promise<unknown[]> }
		const live = internals.liveRows.bind(account)
		vi.spyOn(internals, "liveRows").mockImplementation(async () => {
			const rows = await live()
			await api.storage.local.set({ [`nulo:core:network-reset@${p.id}`]: journal })
			return rows
		})
		await expect(account.backup()).rejects.toThrow(/^ERR_RESET_PENDING/)
	}, 30_000)
})

// The password the caller gives opens the key, never the session, so an export answers the same
// whichever profile is unlocked.
describe("exportAccount — an imported account's key", () => {
	test("opens under the profile's own DEK by its password while another profile is unlocked", async () => {
		const { api, profile, account } = await build()
		const a = await profile.createProfile("A", PASSWORD)
		const dek = (await profile.getProfileDek(a.id))!
		const dekOfA = Array.from(dek)
		await seedImported(api, a.id, ADDR_A, 0x2a, dek)
		await profile.createProfile("B", "other-pass")
		const actual = await vi.importActual<typeof import("@nulo/wallet-crypto")>("@nulo/wallet-crypto")
		const keys: number[][] = []
		vi.mocked(unsealImportedSigningKeyV2).mockImplementationOnce(async (key, ...rest) => {
			keys.push(Array.from(key))
			return actual.unsealImportedSigningKeyV2(key, ...rest)
		})
		await account.exportAccount(a.id, CHAIN, ADDR_A, PASSWORD, true).catch(() => undefined)
		expect(keys).toEqual([dekOfA])
	}, 30_000)
})

// A row an earlier build wrote for a passkey profile holds no slot any answer opens, so each
// account export refuses it with the typed error before it opens a key.
describe("account exports — a retired profile row", () => {
	type Ctx = Awaited<ReturnType<typeof withImported>>
	async function withImported() {
		const built = await build()
		const a = await built.profile.createProfile("A", PASSWORD)
		const row = await seedImported(built.api, a.id, ADDR_A, 0x2a, (await built.profile.getProfileDek(a.id))!)
		return { ...built, id: a.id, row, fence: await built.profile.captureRunFence() }
	}
	const heldInReset = ({ api, id, row }: Ctx) =>
		api.storage.local.set({
			[`nulo:core:network-reset@${id}`]: JSON.stringify({
				profileId: id,
				networkId: "n1",
				fromChainId: 1,
				toChainId: CHAIN,
				l1ChainId: L1,
				cause: { networkReset: true, addressesMoved: false },
				purged: true,
				switchToSeedNode: false,
				probedEndpoint: null,
				accounts: [
					{
						type: AccountType.Imported,
						index: 0,
						name: "Imp",
						visible: true,
						oldAddress: "0xOLD",
						newAddress: ADDR_A,
						encryptedSigningKey: row.encryptedSigningKey,
						done: true,
					},
				],
			}),
		})
	const derivedAt = ({ api, id }: Ctx) =>
		new EntityStorage<Account>(ACCOUNT_STORAGE_ROOT, api.storage.local).set(accountRowId(id, CHAIN, ADDR_B), {
			profileId: id,
			chainId: CHAIN,
			address: ADDR_B,
			index: 0,
			type: AccountType.Nulo_v1,
			l1ChainId: L1,
			name: "Main",
			visible: true,
		})
	const retire = async ({ api, id }: Ctx) => {
		const key = `nulo:core:profiles@${id}`
		const {
			guard: _g,
			secret: _s,
			entropy: _e,
			envelopeMac: _m,
			...rest
		} = JSON.parse((await api.storage.local.get(key))[key] as string)
		await api.storage.local.set({ [key]: JSON.stringify({ ...rest, type: "passkey", credentialId: "Y3JlZA==" }) })
	}

	const opensKey = vi.mocked(unsealImportedSigningKeyV2)
	test.each<[string, (ctx: Ctx) => Promise<unknown>, (ctx: Ctx) => Promise<unknown>, typeof opensKey | typeof deriveAccountSeed]>([
		[
			"exportAccount, an imported account",
			async () => {},
			(c) => c.account.exportAccount(c.id, CHAIN, ADDR_A, PASSWORD, true),
			opensKey,
		],
		[
			"exportAccount, a derived account",
			derivedAt,
			(c) => c.account.exportAccount(c.id, CHAIN, ADDR_B, PASSWORD, true),
			deriveAccountSeed,
		],
		["exportResetHeldAccount", heldInReset, (c) => c.account.exportResetHeldAccount(c.id, ADDR_A, PASSWORD, true), opensKey],
		["exportFullBackupKeys", async () => {}, (c) => c.account.exportFullBackupKeys(c.fence, PASSWORD), opensKey],
	])(
		"%s opens the key of a password row, and refuses the same row retired before it opens one or writes",
		async (_label, arrange, call, opener) => {
			const ctx = await withImported()
			await arrange(ctx)
			await call(ctx).catch(() => undefined)
			expect(opener).toHaveBeenCalled()
			vi.mocked(opener).mockClear()

			await retire(ctx)
			const before = await ctx.api.storage.local.get(null)
			await expect(call(ctx)).rejects.toBeInstanceOf(RetiredProfileError)
			expect(opener).not.toHaveBeenCalled()
			expect(await ctx.api.storage.local.get(null)).toStrictEqual(before)
		},
		60_000,
	)
})
