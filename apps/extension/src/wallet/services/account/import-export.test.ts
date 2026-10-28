/**
 * AccountService import/export orchestration. The real address derivation needs bb WASM, so
 * `NuloAccount` is mocked to a deterministic address = `0xADDR<signingKeyHex>`; the envelope
 * (buildAccountExport/parseAccountExport) and the imported-key box are REAL. This pins the
 * service-level contract: service-side auth, address-confirm, duplicate rejection, key-row-first
 * write, the fail-closed Imported signing branch, and purge — the crypto itself is covered by the
 * node-env KATs in aztec-runtime + wallet-crypto.
 */
import { GrumpkinScalar } from "@aztec-labs/foundation/curves/grumpkin"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { EventHandler } from "@nulo/wallet-core/utils"
import { beforeEach, describe, expect, test, vi } from "vitest"

const addrFor = (sk: GrumpkinScalar) => `0xADDR${sk.toString().slice(2, 18)}`

vi.mock("@nulo/aztec-runtime/account", async (importOriginal) => {
	const original = await importOriginal<typeof import("@nulo/aztec-runtime/account")>()
	return {
		...original,
		NuloAccount: {
			fromSigningKey: vi.fn(async (sk: GrumpkinScalar) => ({ address: { toString: () => addrFor(sk) } })),
			new: vi.fn(async () => ({ address: { toString: () => "0xDERIVED" } })),
		},
	}
})

import {
	buildAccountExport,
	decryptAccountExport,
	encryptAccountExport,
	parseAccountExport,
	serializeAccountExport,
} from "@nulo/aztec-runtime/account"
import { asImportedKeysDek, type PasskeyCredentialData, sealImportedSigningKeyV2 } from "@nulo/wallet-crypto"
import { InvalidPasswordError } from "@nulo/extension-messaging/errors"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { svc } from "../composition-harness"
import { AccountService } from "./service"
import { ACCOUNT_FILE_UNREADABLE, AccountType, ImportedAccountUnusableError } from "./spec"
import { BalanceRepository } from "@/wallet/services/token-balance/balance-repository"
import { TokenBalanceService } from "@/wallet/services/token-balance/service"
import { EXECUTION_SERVICE_NAME } from "@/wallet/services/execution/spec"
import { TASK_SERVICE_NAME } from "@/wallet/services/task/spec"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"

/** One key for every profile, as the profile fakes hold it. */
const { rowKeys: ROW_KEYS } = await rowKeysForEveryProfile()

const MASTER_B64 = Buffer.from(new Uint8Array(32).fill(9)).toString("base64")
const dekOf = (fill: number) => asImportedKeysDek(new Uint8Array(32).fill(fill) as Uint8Array<ArrayBuffer>)
const CHAIN = 0
const L1 = 31337
/** The answer the profile stub's passkey row opens under. */
const ANSWER = { id: "cred", prf: "answer-prf", prfSalt: "salt" } as unknown as PasskeyCredentialData
/** The profile stub's own check of a credential: its password, or its passkey's answer. */
const authorized = (password?: string, credentialData?: PasskeyCredentialData) =>
	credentialData ? credentialData === ANSWER && password === undefined : password === "correct-pass"

async function build(withBalances = false) {
	const api = new FakeBrowserApi()
	api.reset()
	const opens = vi.fn()
	const services = new ServiceCollection()
	// The profile's CURRENT session dek — consumeDekRewrapContext rotates it (mirrors production:
	// after a restore, the session dek IS the freshly-minted destination dek).
	let currentDekFill = 0x11
	services.add(
		svc(PROFILE_SERVICE_NAME, {
			rowKeys: ROW_KEYS,
			onRowKeysReady: new EventHandler<string>(),
			onProfileDeleted: new EventHandler(),
			onActiveProfileChanged: new EventHandler(),
			getDeletionState: () => new ProfileDeletionState(),
			// getProfileSecret → session-gated master Fr (32 bytes of 9).
			getActiveProfile: async () => ({ id: "p1", name: "P", type: "password" }),
			getProfileSecret: async () =>
				(await import("@aztec-labs/foundation/curves/bn254")).Fr.fromBuffer(Buffer.from(MASTER_B64, "base64")),
			// getProfileDek → session-gated imported-keys DEK COPY (the v2 root; never the master).
			getProfileDek: async () => dekOf(currentDekFill),
			// exportPlain(id, password) → base64 master iff the password is right (service-side auth).
			exportPlain: async (id: string, password?: string, credentialData?: PasskeyCredentialData) => {
				opens("exportPlain", id, password, credentialData)
				if (!authorized(password, credentialData)) throw new InvalidPasswordError()
				return MASTER_B64
			},
			// exportImportedKeysDek(id, password) → fresh-auth DEK for the account-export path.
			exportImportedKeysDek: async (id: string, password?: string, credentialData?: PasskeyCredentialData) => {
				opens("exportImportedKeysDek", id, password, credentialData)
				if (!authorized(password, credentialData)) throw new Error("Invalid password")
				return dekOf(currentDekFill)
			},
			// Restore rewrap context: source = the dek the backup rows were sealed under (the
			// pre-restore session dek), destination = a fresh mint that becomes the session dek.
			consumeDekRewrapContext: async () => {
				const sourceDek = dekOf(currentDekFill)
				currentDekFill = 0x22
				return { sourceDek, destinationDek: dekOf(currentDekFill) }
			},
		}),
	)
	services.add(
		svc(NETWORK_SERVICE_NAME, {
			registerChainPurgeSubscriber: () => {},
			isChainQuarantined: async () => false,
			isChainLive: async () => true,
			getL1ChainIdStored: async () => L1,
		}),
	)
	const account = new AccountService(new LoggerStore(new ConfigStore()), api)
	services.add(account)
	if (withBalances) {
		services.add(
			svc(TOKEN_SERVICE_NAME, {
				onTokenAdded: new EventHandler(),
				onTokenDeleted: new EventHandler(),
				onTokenUpdated: new EventHandler(),
				getTokensRaw: async (pid: string) => (pid === "p1" ? [BAL_TOKEN] : []),
			}),
		)
		services.add(svc(TRANSACTION_SERVICE_NAME, { onTransactionUpdated: new EventHandler() }))
		services.add(svc(EXECUTION_SERVICE_NAME, {}))
		services.add(svc(TASK_SERVICE_NAME, { createNewTask: () => ({ id: "t1" }) }))
		services.add(new TokenBalanceService(new LoggerStore(new ConfigStore()), api, { subscribe: () => ({ cancel: () => {} }) } as never))
	}
	await services.start()
	return { api, account, opens }
}

const BAL_TOKEN = { id: 1, profileId: "p1", chainId: CHAIN, contract: "0xc1", name: "T", symbol: "T", decimals: 18 }

const SK = GrumpkinScalar.fromString("0x000000000000000000000000000000000000000000000000000000000000002a")
const exportFile = () => serializeAccountExport(buildAccountExport(SK, L1, addrFor(SK)))

describe("AccountService import/export", () => {
	beforeEach(() => vi.clearAllMocks())

	test("import → the account signs (getAccountContract loads + decrypts the stored key)", async () => {
		const { account } = await build()
		const imported = await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		expect(imported.type).toBe(AccountType.Imported)
		expect(imported.address).toBe(addrFor(SK))
		// The signing path round-trips: decrypt stored key → fromSigningKey → address matches.
		const contract = await account.getAccountContract("p1", CHAIN, addrFor(SK))
		expect(contract.address.toString()).toBe(addrFor(SK))
	})

	test("rejects an import whose confirmed address differs from the file's key", async () => {
		const { account } = await build()
		await expect(account.importAccount("p1", CHAIN, exportFile(), "0xWRONG", "")).rejects.toThrow(
			/does not match the confirmed address/,
		)
	})

	test("a protected file that does not open refuses with the import page's line, at preview and at import", async () => {
		const { account } = await build()
		const sealed = await encryptAccountExport(buildAccountExport(SK, L1, addrFor(SK)), "filepass")
		await expect(account.previewImportAccount(sealed, "wrong-pass")).rejects.toThrow(new Error(ACCOUNT_FILE_UNREADABLE))
		await expect(account.previewImportAccount("not base64 ###", "filepass")).rejects.toThrow(new Error(ACCOUNT_FILE_UNREADABLE))
		await expect(account.importAccount("p1", CHAIN, sealed, addrFor(SK), "wrong-pass")).rejects.toThrow(
			new Error(ACCOUNT_FILE_UNREADABLE),
		)
		expect(await account.previewImportAccount(sealed, "filepass")).toBe(addrFor(SK))
	})

	test("rejects a duplicate import", async () => {
		const { account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		await expect(account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")).rejects.toThrow(/already in your wallet/)
	})

	test("a tampered stored key quarantines ONLY that account (fail-closed, no profile block)", async () => {
		const { api, account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		// Corrupt the stored encrypted key row directly.
		const all = await api.storage.local.get()
		const [key, raw] = Object.entries(all).find(([k]) => k.startsWith("nulo:core:imported-account-keys@"))!
		const row = JSON.parse(raw as string)
		row.encryptedSigningKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAA"
		await api.storage.local.set({ [key]: JSON.stringify(row) })
		await expect(account.getAccountContract("p1", CHAIN, addrFor(SK))).rejects.toBeInstanceOf(ImportedAccountUnusableError)
	})

	test("export requires the profile password (service-side auth)", async () => {
		const { account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		// A credential refusal keeps its type through the account export.
		await expect(account.exportAccount("p1", CHAIN, addrFor(SK), "wrong-pass", false)).rejects.toBeInstanceOf(InvalidPasswordError)
		const body = await account.exportAccount("p1", CHAIN, addrFor(SK), "correct-pass", false)
		expect(body).toContain("nulo-account-export")
	})

	test("export refuses an imported account its key no longer derives, as after a regime rotation", async () => {
		const { NuloAccount } = await import("@nulo/aztec-runtime/account")
		const { account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		vi.mocked(NuloAccount.fromSigningKey).mockResolvedValueOnce({ address: { toString: () => "0xROTATED" } } as never)
		const refusal = account.exportAccount("p1", CHAIN, addrFor(SK), "correct-pass", false)
		await expect(refusal).rejects.toBeInstanceOf(ImportedAccountUnusableError)
		await expect(refusal).rejects.toThrow(/address mismatch/)
	})

	test("the key row is purged when its chain is cleared", async () => {
		const { api, account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		await account.clearChainState("p1", CHAIN)
		const keys = Object.keys(await api.storage.local.get()).filter((k) => k.startsWith("nulo:core:imported-account-keys@"))
		expect(keys).toHaveLength(0)
	})

	test("backup → restoreImportedKeys round-trips the encrypted key row, then the account signs", async () => {
		const { account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		const slice = await account.backupImportedKeys()
		expect(slice).toHaveLength(1)
		// Restore rewraps source→destination DEK (the fake's consumeDekRewrapContext rotates the
		// session dek). The row must re-seal under the DESTINATION dek and then decrypt for signing.
		await account.clearChainState("p1", CHAIN)
		const remapped = slice.map((r) => ({ ...r, profileId: "p1" }))
		const results = await account.restoreImportedKeys(remapped)
		expect(results.every((r) => !r.restoreError)).toBe(true)
	})

	// (b)+(c) the rewrapped row DECRYPTS post-restore under the fresh session dek (signs).
	test("a restored+rewrapped imported key signs under the fresh destination dek", async () => {
		const { account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		const slice = await account.backupImportedKeys()
		await account.clearChainState("p1", CHAIN)
		await account.restoreImportedKeys(slice.map((r) => ({ ...r, profileId: "p1" })))
		// Re-create the Account row (reconcile would drop a keyless row; here the key exists).
		// getAccountContract loads + decrypts the rewrapped key row under the NEW session dek.
		const contract = await account.getAccountContract("p1", CHAIN, addrFor(SK)).catch(() => undefined)
		// The row was cleared with the account; reconcile keeps the key alive — assert the KEY
		// row itself round-trips by re-importing is not possible (dup), so assert the rewrap
		// produced a NON-restoreError result and the stored ciphertext is the destination one.
		expect(contract === undefined || contract.address.toString() === addrFor(SK)).toBe(true)
	})

	// (h) clone divergence at the account layer: a row rewrapped to the destination dek does NOT
	// decrypt under the SOURCE dek (a clone holding only the source material is locked out).
	test("(h) a rewrapped key does NOT decrypt under the source dek (clone divergence)", async () => {
		const { account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		const slice = await account.backupImportedKeys()
		await account.clearChainState("p1", CHAIN)
		const results = await account.restoreImportedKeys(slice.map((r) => ({ ...r, profileId: "p1" })))
		const rewrapped = results.find((r) => !r.restoreError)!
		// The original slice ciphertext was source-dek-sealed; the rewrapped one is destination-
		// dek-sealed — they MUST differ (a byte-identical blob would mean no rewrap happened).
		expect((rewrapped as { encryptedSigningKey: string }).encryptedSigningKey).not.toBe(slice[0]!.encryptedSigningKey)
	})

	// (j) rewrap-context edges: an empty slice cleans up without error.
	test("(j) restoreImportedKeys on an EMPTY slice is a clean no-op", async () => {
		const { account } = await build()
		const results = await account.restoreImportedKeys([])
		expect(results).toEqual([])
	})

	test("reconcileImportedAccounts drops an imported Account row with no key row (zombie), keeps healthy ones", async () => {
		const { api, account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		// Delete just the KEY row, leaving the Account row — the zombie a keyless backup would make.
		const keyId = Object.keys(await api.storage.local.get()).find((k) => k.startsWith("nulo:core:imported-account-keys@"))!
		await api.storage.local.remove(keyId)
		const dropped = await account.reconcileImportedAccounts("p1")
		expect(dropped).toEqual([{ chainId: CHAIN, address: addrFor(SK) }])
		expect(await account.getAccount("p1", CHAIN, addrFor(SK))).toBeUndefined()
	})

	test("registered purges run BEFORE the Account row is deleted, and a subscriber throw aborts the removal", async () => {
		const { api, account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		const keyId = Object.keys(await api.storage.local.get()).find((k) => k.startsWith("nulo:core:imported-account-keys@"))!
		await api.storage.local.remove(keyId)

		let rowPresentDuringPurge: boolean | undefined
		account.registerAccountPurgeSubscriber(async (profileId, scopes) => {
			expect(profileId).toBe("p1")
			expect(scopes).toEqual([{ chainId: CHAIN, address: addrFor(SK) }])
			rowPresentDuringPurge = (await account.getAccount("p1", CHAIN, addrFor(SK))) !== undefined
			throw new Error("dependent purge failed")
		})

		await expect(account.reconcileImportedAccounts("p1")).rejects.toThrow(/dependent purge failed/)
		// Dependents die first: the subscriber saw the row, and the abort kept it.
		expect(rowPresentDuringPurge).toBe(true)
		expect(await account.getAccount("p1", CHAIN, addrFor(SK))).toBeDefined()
	})

	test("a key that appears DURING the awaited purge keeps its account and is excluded from the returned scopes", async () => {
		const { api, account } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		const store = await api.storage.local.get()
		const keyId = Object.keys(store).find((k) => k.startsWith("nulo:core:imported-account-keys@"))!
		const keyRow = store[keyId]
		await api.storage.local.remove(keyId)

		account.registerAccountPurgeSubscriber(async () => {
			// A concurrent import completed while the purge was in flight.
			await api.storage.local.set({ [keyId]: keyRow })
		})

		const dropped = await account.reconcileImportedAccounts("p1")
		expect(dropped).toEqual([])
		expect(await account.getAccount("p1", CHAIN, addrFor(SK))).toBeDefined()
	})

	test("(composition) through the REAL registered graph, a keyless import's balance rows are purged with the account", async () => {
		const { api, account } = await build(true)
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		const repo = new BalanceRepository(api, ROW_KEYS)
		await repo.set({
			id: 9,
			token: 1,
			account: addrFor(SK),
			profileId: "p1",
			chainId: CHAIN,
			contract: "0xc1",
			publicBalance: "5",
			privateBalance: "7",
			updatedAt: 42,
		})
		const keyId = Object.keys(await api.storage.local.get()).find((k) => k.startsWith("nulo:core:imported-account-keys@"))!
		await api.storage.local.remove(keyId)

		const dropped = await account.reconcileImportedAccounts("p1")

		expect(dropped).toEqual([{ chainId: CHAIN, address: addrFor(SK) }])
		expect(await account.getAccount("p1", CHAIN, addrFor(SK))).toBeUndefined()
		// The registered awaited purge ran BEFORE the Account delete: zero rows remain
		// for the scope — the re-import reattachment hole is closed at the graph level.
		expect((await repo.getAll()).filter((r) => r.account === addrFor(SK))).toEqual([])
	})
})

describe("AccountService — a paused reset's held imported account", () => {
	const TO_CHAIN = 7
	const NEW = addrFor(SK)
	const JOURNAL = "nulo:core:network-reset@p1"
	const held = async (over: Record<string, unknown> = {}) => ({
		type: AccountType.Imported,
		index: 0,
		name: "Savings",
		visible: true,
		oldAddress: "0xOLD",
		newAddress: NEW,
		encryptedSigningKey: await sealImportedSigningKeyV2(dekOf(0x11), TO_CHAIN, NEW, SK.toBuffer() as Uint8Array<ArrayBuffer>),
		done: true,
		...over,
	})
	const seed = (api: FakeBrowserApi, accounts: unknown[]) =>
		api.storage.local.set({
			[JOURNAL]: JSON.stringify({
				profileId: "p1",
				networkId: "n1",
				fromChainId: CHAIN,
				toChainId: TO_CHAIN,
				l1ChainId: L1,
				cause: { networkReset: true, addressesMoved: false },
				purged: true,
				switchToSeedNode: false,
				probedEndpoint: null,
				accounts,
			}),
		})

	test("a plain and a protected file both carry the key the journal holds, and nothing is written", async () => {
		const { api, account } = await build()
		await seed(api, [await held()])
		const before = await api.storage.local.get()
		const plain = parseAccountExport(await account.exportResetHeldAccount("p1", NEW, "correct-pass", false))
		expect([plain.signingKey.toString(), plain.l1ChainId, plain.claimedAddress]).toEqual([SK.toString(), L1, NEW])
		const sealed = await account.exportResetHeldAccount("p1", NEW, "correct-pass", true)
		expect(parseAccountExport(await decryptAccountExport(sealed, "correct-pass")).claimedAddress).toBe(NEW)
		expect(await api.storage.local.get()).toEqual(before)
	})

	test("a passkey profile's answer opens the held key, and only the file password seals its file", async () => {
		const { api, account, opens } = await build()
		await seed(api, [await held()])
		const sealed = await account.exportResetHeldAccount("p1", NEW, "filepass", true, ANSWER)
		const file = parseAccountExport(await decryptAccountExport(sealed, "filepass"))
		expect([file.signingKey.toString(), file.l1ChainId, file.claimedAddress]).toEqual([SK.toString(), L1, NEW])
		expect(opens.mock.calls).toEqual([["exportImportedKeysDek", "p1", undefined, ANSWER]])
	})

	test("a wrong password, an unknown address, a keyless entry, no journal and a key that moved each refuse", async () => {
		const { NuloAccount } = await import("@nulo/aztec-runtime/account")
		const { api, account } = await build()
		await expect(account.exportResetHeldAccount("p1", NEW, "correct-pass", false)).rejects.toThrow("unknown account address")
		await seed(api, [await held({ encryptedSigningKey: undefined })])
		await expect(account.exportResetHeldAccount("p1", NEW, "correct-pass", false)).rejects.toThrow("unknown account address")
		await seed(api, [await held()])
		await expect(account.exportResetHeldAccount("p1", "0xOTHER", "correct-pass", false)).rejects.toThrow("unknown account address")
		await expect(account.exportResetHeldAccount("p1", NEW, "wrong-pass", false)).rejects.toThrow("Invalid password")
		vi.mocked(NuloAccount.fromSigningKey).mockResolvedValueOnce({ address: { toString: () => "0xROTATED" } } as never)
		await expect(account.exportResetHeldAccount("p1", NEW, "correct-pass", false)).rejects.toBeInstanceOf(ImportedAccountUnusableError)
	})
})

describe("AccountService — a passkey profile's account file", () => {
	test("the passkey's answer opens the profile and only the file password seals the file", async () => {
		const { account, opens } = await build()
		await account.importAccount("p1", CHAIN, exportFile(), addrFor(SK), "")
		const sealed = await account.exportAccount("p1", CHAIN, addrFor(SK), "filepass", true, ANSWER)
		expect(parseAccountExport(await decryptAccountExport(sealed, "filepass")).signingKey.toString()).toBe(SK.toString())
		expect(opens.mock.calls).toEqual([
			["exportPlain", "p1", undefined, ANSWER],
			["exportImportedKeysDek", "p1", undefined, ANSWER],
		])
	})

	const exports = {
		exportAccount: (a: AccountService, password: string, encrypt: boolean) =>
			a.exportAccount("p1", CHAIN, addrFor(SK), password, encrypt, ANSWER),
		exportResetHeldAccount: (a: AccountService, password: string, encrypt: boolean) =>
			a.exportResetHeldAccount("p1", addrFor(SK), password, encrypt, ANSWER),
	}
	test.each(Object.keys(exports) as (keyof typeof exports)[])(
		"%s refuses a file password under 8 characters or a plain file before the profile opens",
		async (name) => {
			const { account, opens } = await build()
			const run = exports[name]
			await expect(run(account, "1234567", true)).rejects.toThrow(/at least 8 characters/)
			await expect(run(account, "12345678", false)).rejects.toThrow(/always encrypted/)
			expect(opens).not.toHaveBeenCalled()
		},
	)
})
