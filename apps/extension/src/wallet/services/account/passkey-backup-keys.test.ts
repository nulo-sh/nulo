/**
 * The passkey full-backup key export: AccountService reads the slices once and hands the key rows to
 * ProfileService, which counts them where the DEK lives. A stand-in ProfileService records what it
 * was handed and when.
 */
import { describe, expect, test, vi } from "vitest"
import { SessionEndedError } from "@nulo/extension-messaging/errors"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { EntityStorage } from "@/wallet/storage"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { PROFILE_SERVICE_NAME, type PasskeyBackupMaterial, type RunFence } from "@/wallet/services/profile/spec"
import { svc } from "../composition-harness"
import { ImportedKeysRepository } from "./imported-keys-repository"
import { AccountService } from "./service"
import { ACCOUNT_STORAGE_ROOT, type Account, AccountType, type ImportedAccountKey, accountRowId } from "./spec"

const FENCE: RunFence = { profileId: "p1", epoch: 0, session: 1, incarnation: "w1" }
const CREDENTIAL = { id: "cred", prf: "prf" } as unknown as PasskeyCredentialData
const MATERIAL: PasskeyBackupMaterial = { credentialId: "cred", dekSealed: "sealed", dekReplaced: false, unopened: 1 }

async function build(count: (rows: readonly ImportedAccountKey[]) => Promise<PasskeyBackupMaterial>) {
	const api = new FakeBrowserApi()
	api.reset()
	const steps: string[] = []
	let live = true
	const profile = {
		onProfileDeleted: new EventHandler(),
		getDeletionState: () => new ProfileDeletionState(),
		assertRunFence: vi.fn(async () => {
			steps.push("fence")
			if (!live) throw new SessionEndedError()
		}),
		exportPasskeyBackupKeys: vi.fn(async (_id: string, _credentialData: unknown, rows: readonly ImportedAccountKey[]) => {
			steps.push("count")
			return count(rows)
		}),
	}
	const services = new ServiceCollection()
	services.add(svc(PROFILE_SERVICE_NAME, profile))
	services.add(svc(NETWORK_SERVICE_NAME, { registerChainPurgeSubscriber: () => {}, isChainLive: async () => true }))
	const account = new AccountService(new LoggerStore(new ConfigStore()), api)
	services.add(account)
	await services.start()
	for (const [address, fill] of [
		[`0x${"0a".repeat(32)}`, 1],
		[`0x${"0b".repeat(32)}`, 2],
	] as const) {
		await new ImportedKeysRepository(api.storage.local).set({
			profileId: "p1",
			chainId: 0,
			address,
			encryptedSigningKey: `sealed-${fill}`,
		})
		const row: Account = {
			profileId: "p1",
			chainId: 0,
			address,
			index: 0,
			type: AccountType.Imported,
			l1ChainId: 31337,
			name: "Imp",
			visible: true,
		}
		await new EntityStorage<Account>(ACCOUNT_STORAGE_ROOT, api.storage.local).set(accountRowId("p1", 0, address), row)
	}
	return { api, account, profile, steps, endSession: () => (live = false) }
}

describe("exportPasskeyBackupKeys", () => {
	test("the file carries exactly the rows counted, read between two fence checks", async () => {
		let counted: readonly ImportedAccountKey[] = []
		const { account, profile, steps } = await build(async (rows) => {
			counted = rows
			return MATERIAL
		})

		const keys = await account.exportPasskeyBackupKeys(FENCE, CREDENTIAL)

		expect(keys.importedKeyRows).toBe(counted)
		expect(keys.importedKeyRows.map((row) => row.encryptedSigningKey).sort()).toEqual(["sealed-1", "sealed-2"])
		expect(keys.accounts).toHaveLength(2)
		expect(keys).toMatchObject({ credentialId: "cred", dekSealed: "sealed", dekReplaced: false, unopenedImportedKeys: 1 })
		expect(profile.exportPasskeyBackupKeys).toHaveBeenCalledWith("p1", CREDENTIAL, counted)
		expect(steps).toEqual(["fence", "count", "fence"])
	})

	test("a session that ends during the count refuses the material", async () => {
		const env = await build(async () => {
			env.endSession()
			return MATERIAL
		})
		await expect(env.account.exportPasskeyBackupKeys(FENCE, CREDENTIAL)).rejects.toBeInstanceOf(SessionEndedError)
	})

	test("refuses while a reset journal exists, before any row is counted, and when one appears during the count", async () => {
		const key = "nulo:core:network-reset@p1"
		const journal = JSON.stringify({
			profileId: "p1",
			networkId: "n1",
			fromChainId: 1,
			toChainId: 2,
			l1ChainId: 31337,
			cause: { networkReset: true, addressesMoved: false },
			purged: false,
			switchToSeedNode: false,
			probedEndpoint: null,
			accounts: [],
		})
		let appears = false
		const env = await build(async () => {
			if (appears) await env.api.storage.local.set({ [key]: journal })
			return MATERIAL
		})
		await env.api.storage.local.set({ [key]: journal })
		await expect(env.account.exportPasskeyBackupKeys(FENCE, CREDENTIAL)).rejects.toThrow(/^ERR_RESET_PENDING/)
		expect(env.profile.exportPasskeyBackupKeys).not.toHaveBeenCalled()

		await env.api.storage.local.remove(key)
		appears = true
		await expect(env.account.exportPasskeyBackupKeys(FENCE, CREDENTIAL)).rejects.toThrow(/^ERR_RESET_PENDING/)
	})

	test("a count that throws aborts the export", async () => {
		const { account } = await build(async () => {
			throw new TypeError("not a stored row")
		})
		await expect(account.exportPasskeyBackupKeys(FENCE, CREDENTIAL)).rejects.toThrow("not a stored row")
	})
})
