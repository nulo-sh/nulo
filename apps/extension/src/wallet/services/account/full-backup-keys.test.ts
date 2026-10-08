/**
 * The password full-backup key export, driven through the real ProfileService and AccountService
 * with real crypto: what the file's key opens and must never open, the restore of a new and of a
 * legacy backup, and the run fence around the export. Only the per-row seal and unseal are wrapped,
 * to hold an export mid-flight and to see the key buffers it was handed.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { SessionEndedError } from "@nulo/extension-messaging/errors"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { fromBase64, toBase64 } from "@nulo/wallet-core/utils"
import { asBase64MasterSecret, asImportedKeysDek, EncryptionKey, type ImportedKeysDek } from "@nulo/wallet-crypto"
import { validateAndMigrateBackup } from "@/composables/useFullBackupImport"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { EntityStorage } from "@/wallet/storage"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { ProfileService } from "@/wallet/services/profile/service"
import { svc } from "../composition-harness"
import { ImportedKeysRepository } from "./imported-keys-repository"
import { AccountService } from "./service"
import {
	ACCOUNT_SERVICE_NAME,
	ACCOUNT_STORAGE_ROOT,
	type Account,
	AccountType,
	IMPORTED_KEYS_SERVICE_NAME,
	type ImportedAccountKey,
	accountRowId,
} from "./spec"

const box = vi.hoisted(() => ({ beforeSeal: undefined as undefined | (() => Promise<void>) }))
vi.mock("@nulo/wallet-crypto", async (importOriginal) => {
	const original = await importOriginal<typeof import("@nulo/wallet-crypto")>()
	return {
		...original,
		unsealImportedSigningKeyV2: vi.fn(original.unsealImportedSigningKeyV2),
		sealImportedSigningKeyV2: vi.fn(async (...args: Parameters<typeof original.sealImportedSigningKeyV2>) => {
			await box.beforeSeal?.()
			return original.sealImportedSigningKeyV2(...args)
		}),
	}
})

import { sealImportedSigningKeyV2, unsealImportedSigningKeyV2 } from "@nulo/wallet-crypto"

const PASSWORD = "pass1234"
const CHAIN = 0
const L1 = 31337
const ADDR_A = `0x${"0a".repeat(32)}`
const ADDR_B = `0x${"0b".repeat(32)}`

afterEach(() => {
	box.beforeSeal = undefined
	vi.clearAllMocks()
})

async function build() {
	const api = new FakeBrowserApi()
	api.reset()
	const config = new ConfigStore()
	const logger = new LoggerStore(config)
	const services = new ServiceCollection()
	services.add(svc(PASSKEY_SERVICE_NAME, {}))
	services.add(svc(NETWORK_SERVICE_NAME, { registerChainPurgeSubscriber: () => {}, getL1ChainIdStored: async () => L1 }))
	const profile = new ProfileService(config, logger, api)
	services.add(profile)
	const account = new AccountService(logger, api)
	services.add(account)
	await services.start()
	profile.setDeletionDelegate({ snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }), runFor: async () => {} })
	return { api, profile, account, keys: new ImportedKeysRepository(api.storage.local) }
}

/** An imported account as `importAccount` leaves it: its row, and its key sealed under `dek`. */
async function seedImported(api: FakeBrowserApi, profileId: string, address: string, fill: number, dek: ImportedKeysDek) {
	const signingKey = new Uint8Array(32).fill(fill)
	const row: ImportedAccountKey = {
		profileId,
		chainId: CHAIN,
		address,
		encryptedSigningKey: await sealImportedSigningKeyV2(dek, CHAIN, address, signingKey),
	}
	await new ImportedKeysRepository(api.storage.local).set(row)
	const accountRow: Account = {
		profileId,
		chainId: CHAIN,
		address,
		index: 0,
		type: AccountType.Imported,
		l1ChainId: L1,
		name: "Imp",
		visible: true,
	}
	await new EntityStorage<Account>(ACCOUNT_STORAGE_ROOT, api.storage.local).set(accountRowId(profileId, CHAIN, address), accountRow)
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
}) {
	const body = {
		"compat-epoch": 5,
		"backup-schema-version": 1,
		"master-key": keys.masterKey,
		entropy: keys.entropy,
		"imported-keys-dek": keys.importedKeysDek,
		data: {
			profile: { id: "source-id", name: "P", type: "password" },
			[ACCOUNT_SERVICE_NAME]: keys.accounts,
			[IMPORTED_KEYS_SERVICE_NAME]: keys.rows,
		},
	}
	return { ...body, checksum: await EncryptionKey.getHashHex(JSON.stringify(body)) }
}

/** Runs a file through the import gates, restores it into a fresh wallet, and returns the restored
 *  profile's opened signing keys. */
async function restoreIntoFreshWallet(file: Awaited<ReturnType<typeof backupFile>>) {
	const validated = await validateAndMigrateBackup(file)
	if (validated.kind !== "ok") throw new Error(validated.message)
	const envelope = validated.backup as unknown as Record<string, string>
	const rows = validated.data[IMPORTED_KEYS_SERVICE_NAME] as ImportedAccountKey[]
	const fresh = await build()
	const restored = await fresh.profile.restore(
		{ id: "source-id", name: "Restored", type: "password" },
		{
			type: "password",
			masterKey: asBase64MasterSecret(envelope["master-key"]!),
			entropy: envelope.entropy!,
			importedKeysDek: envelope["imported-keys-dek"]!,
		},
		PASSWORD,
	)
	if ("restoreError" in restored && restored.restoreError) throw new Error(String(restored.restoreError))
	const results = await fresh.account.restoreImportedKeys(rows.map((r) => ({ ...r, profileId: restored.id })))
	expect(results.every((r) => !r.restoreError)).toBe(true)
	await fresh.profile.finalizeRestore(restored.id, PASSWORD)
	const destinationDek = (await fresh.profile.getProfileDek(restored.id))!
	return Promise.all((await fresh.keys.backup(restored.id)).map((row) => opened(destinationDek, row)))
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
			{ type: "password", masterKey: asBase64MasterSecret(masterKey), entropy, importedKeysDek: toBase64(transferKey) },
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
