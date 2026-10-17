/**
 * Unit coverage for the full-backup-import composable.
 *
 * Mocks every backup-service client so we can drive `restoreBackup` through
 * its branches: schema/checksum guards, success, no-networks fail, the
 * duplicate-address fix (post-A11: matches on err.message instead of the
 * dead `err === string` check), non-duplicate failure re-throw,
 * `finalizeRestore` failure, partial-errors path, and the success-without-
 * errors path that triggers `completeImport` automatically.
 *
 * Notes on test mechanics:
 *
 *  - Service clients are constructed via `new ServiceClient()` inside the
 *    composable, so each module is mocked at the import level to return a
 *    shared spy instance the test can configure per-case.
 *  - Pinia stores `useCacheStore` / `usePopupStore` are accessed via
 *    `createTestingPinia()`. The composable only writes to them inside
 *    `showRestoreErrorLog` (not exercised here) so a no-op pinia is fine.
 *  - Checksum match uses the real `EncryptionKey.getHashHex` over the
 *    test's backup object so we hit the integrity branch only when we
 *    intentionally corrupt it.
 */
import { setActivePinia } from "pinia"
import { createTestingPinia } from "@pinia/testing"
import { ref, watch } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NodeStatus } from "@/wallet/services/network/spec"
import {
	asBase64CredentialId,
	asBase64SecretPrf,
	asHexUserHandle,
	computeBackupMac,
	EncryptionKey,
	PasskeyCredential,
	type PasskeyCredentialData,
} from "@nulo/wallet-crypto"
import { RpcDisconnectedError, SessionEndedError, UserRejectedError } from "@nulo/extension-messaging/errors"

// ── Mocks ───────────────────────────────────────────────────────────────────

const profileClient = {
	restore: vi.fn(),
	finalizeRestore: vi.fn(),
	assertRunFence: vi.fn(),
	deleteProfile: vi.fn(),
	disconnect: vi.fn(),
}
/** The fence `finalizeRestore` hands back for the created profile. */
const FENCE = { profileId: "new-id", epoch: 0, session: 1, incarnation: "w1" }
const reminder = vi.hoisted(() => ({
	arm: vi.fn(async (..._args: unknown[]): Promise<string | undefined> => "run-1"),
	admit: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})),
	finish: vi.fn(async (..._args: unknown[]) => undefined),
}))
vi.mock("@/utils/restore-outcome", () => ({
	armRestoreOutcome: reminder.arm,
	admitRestoreOutcome: reminder.admit,
	finishRestoreOutcome: reminder.finish,
}))
const networkClient = {
	seedDefaultsForProfile: vi.fn(),
	setActiveForProfile: vi.fn(),
	probeNodeStatus: vi.fn(),
	disconnect: vi.fn(),
}
const accountClient = {
	restore: vi.fn(),
	restoreImportedKeys: vi.fn(async () => []),
	reconcileImportedAccounts: vi.fn(async () => []),
	disconnect: vi.fn(),
}
const tokenClient = {
	restore: vi.fn(),
	refreshRestoredTokens: vi.fn(),
	disconnect: vi.fn(),
}
/** Registrable child for account-state fixtures: since the bounded
 *  chain-registration tail landed, zero-work items dial nothing and never
 *  reach the restore call — remap observability needs at least one child. */
const AS_SENDER = { address: `0x${"ab".repeat(32)}` }

function passthroughClient() {
	return { restore: vi.fn(async (): Promise<unknown[]> => []), disconnect: vi.fn() }
}
let transactionClient = passthroughClient()
let tokenBalanceClient = passthroughClient()
let accountStateClient = passthroughClient()
let authRegistryClient = passthroughClient()
let contactClient = passthroughClient()
let configClient = passthroughClient()

// Vitest 4 requires `function` expressions (not arrow functions) for mocks
// instantiated with `new`. Arrow factories error: "() => ... is not a constructor".
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: vi.fn(function () {
		return profileClient
	}),
}))
vi.mock("@/wallet/services/network/client", () => ({
	NetworkServiceClient: vi.fn(function () {
		return networkClient
	}),
}))
vi.mock("@/wallet/services/account/client", () => ({
	AccountServiceClient: vi.fn(function () {
		return accountClient
	}),
}))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return tokenClient
	}),
}))
vi.mock("@/wallet/services/transaction/client", () => ({
	TransactionServiceClient: vi.fn(function () {
		return transactionClient
	}),
}))
vi.mock("@/wallet/services/token-balance/client", () => ({
	TokenBalanceServiceClient: vi.fn(function () {
		return tokenBalanceClient
	}),
}))
vi.mock("@/wallet/services/account-state/client", () => ({
	AccountStateServiceClient: vi.fn(function () {
		return accountStateClient
	}),
}))
vi.mock("@/wallet/services/auth-registry/client", () => ({
	AuthRegistryServiceClient: vi.fn(function () {
		return authRegistryClient
	}),
}))
vi.mock("@/wallet/services/contact/client", () => ({
	ContactServiceClient: vi.fn(function () {
		return contactClient
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return configClient
	}),
}))

// Service-name modules pull in side-effecting validators when imported
// from the real client modules, so re-export the bare name constants (plus
// the storage-root constants the backup-migration registry imports).
vi.mock("@/wallet/services/account/spec", () => ({
	ACCOUNT_SERVICE_NAME: "account",
	ACCOUNT_STORAGE_ROOT: "nulo:core:accounts",
	IMPORTED_KEYS_SERVICE_NAME: "imported-account-keys",
	IMPORTED_KEYS_STORAGE_ROOT: "nulo:core:imported-account-keys",
	accountRowId: (profileId: string, chainId: number, address: string) => JSON.stringify(["account", profileId, chainId, address]),
	accountScopeKey: (chainId: number, address: string) => `${chainId}:${address}`,
}))
vi.mock("@/wallet/services/account-state/spec", () => ({ ACCOUNT_STATE_SERVICE_NAME: "account-state" }))
vi.mock("@/utils/background-liveness", () => ({
	readLiveness: vi.fn(async () => 100),
	awaitLivenessAdvance: vi.fn(async () => 101),
}))
vi.mock("@/wallet/services/auth-registry/spec", () => ({
	AUTH_REGISTRY_SERVICE_NAME: "auth-registry",
	AUTH_REGISTRY_STORAGE_ROOT: "nulo:core:auth-registry",
	AUTH_REGISTRY_ENABLED_STORAGE_ROOT: "nulo:core:auth-registry-enabled",
}))
vi.mock("@/wallet/services/config/spec", () => ({ CONFIG_SERVICE_NAME: "config" }))
vi.mock("@/wallet/services/contact/spec", () => ({ CONTACT_SERVICE_NAME: "contact", CONTACT_STORAGE_ROOT: "nulo:core:contacts" }))
vi.mock("@/wallet/services/network/spec", () => ({
	NETWORK_SERVICE_NAME: "network",
	NETWORK_STORAGE_ROOT: "nulo:core:networks",
	NodeStatus: { Active: 0, Inactive: 1, InvalidChain: 2 },
}))
vi.mock("@/wallet/services/token-balance/spec", () => ({
	TOKEN_BALANCE_SERVICE_NAME: "token-balance",
	TOKEN_BALANCE_STORAGE_ROOT: "nulo:core:token-balances",
}))
vi.mock("@/wallet/services/token/spec", () => ({ TOKEN_SERVICE_NAME: "token", TOKEN_STORAGE_ROOT: "nulo:core:tokens" }))
vi.mock("@/wallet/services/transaction/spec", () => ({
	TRANSACTION_SERVICE_NAME: "transaction",
	TRANSACTION_STORAGE_ROOT: "nulo:core:txs",
}))

// A REAL pending backup-safe migration (v2, contact legacyName → name) so the
// suite exercises the full migrate-then-restore path: `buildBackup` stamps
// `backup-schema-version: 1`, so every restore in this file migrates 1 → 2
// before any service restore runs.
vi.mock("@/wallet/storage/migrations", async () => {
	const { defineRowMapMigration } = await vi.importActual<typeof import("@/wallet/services/backup/row-map-migration")>(
		"@/wallet/services/backup/row-map-migration",
	)
	const v2 = defineRowMapMigration({
		version: 2,
		description: "test: rename contact legacyName to name",
		rowMaps: { "nulo:core:contacts": { rename: { legacyName: "name" } } },
	})
	return { BASELINE_VERSION: 1, realMigrations: [], migrations: [], backupMigrations: [v2] }
})

// Imported AFTER mocks are registered.
import {
	refreshRestoredTokensStage,
	relinkRestoredTokenBalances,
	resolvePasskeyCredential,
	restoreAccountsAndFilterOwnedSlices,
	restoredNetworkIds,
} from "./full-backup-restore"
import { deferred } from "@nulo/wallet-core/utils"
import { DECRYPTION_FAILED, errorLogWriters, useFullBackupImport, validateAndMigrateBackup } from "./useFullBackupImport"
import { showsDecryptCta } from "@/utils/full-backup-ctas"
import { collectRestoreErrors, sealFullBackupText } from "@/utils/full-backup-helpers"
import { PasskeyPrfError } from "@/wallet/utils/passkey-errors"
import { awaitLivenessAdvance, readLiveness } from "@/utils/background-liveness"
import { ACCOUNT_STATE_SKIP_DEADLINE, ACCOUNT_STATE_SKIP_WRONG_NETWORK } from "@/wallet/services/account-state/normalize"
import { IMPORT_CHAIN_SYNC_TOTAL_BUDGET_MS } from "./importChainSync"

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a backup payload + matching checksum so the integrity guard passes.
 *  `overrides.data` MERGES over the default slices (it must not clobber them:
 *  the mocked v2 migration reads contacts, so the default `contact: []` has to
 *  survive every override). */
async function buildBackup(overrides: Record<string, unknown> = {}) {
	const { data: dataOverride, ...bodyOverrides } = overrides
	const body = {
		"compat-epoch": 5,
		"backup-schema-version": 1,
		"master-key": Buffer.from(new Uint8Array(32)).toString("base64"),
		// Epoch-4 password blobs REQUIRE the entropy field. The composable checks only
		// presence/shape; the words↔master pairing check is service-side (mocked here).
		entropy: Buffer.from(new Uint8Array(32).fill(1)).toString("base64"),
		// Epoch-4 password blobs also REQUIRE the imported-keys DEK carrier (plaintext beside
		// the plaintext master; the rewrap semantics are service-side, mocked here).
		"imported-keys-dek": Buffer.from(new Uint8Array(32).fill(2)).toString("base64"),
		data: {
			profile: { id: "src-profile-id", name: "Imported", type: "password" },
			// Schema-complete account fixture so the default path mirrors what the real services accept.
			account: [
				{
					profileId: "src-profile-id",
					chainId: 1,
					address: "0xaaaa",
					index: 0,
					type: 0,
					l1ChainId: 1,
					name: "Account 1",
					visible: true,
				},
			],
			token: [],
			// Present-but-empty: the mocked v2 migration READS contacts, and a
			// missing non-optional slice a pending migration reads rejects.
			contact: [],
			...((dataOverride as Record<string, unknown>) ?? {}),
		},
		...bodyOverrides,
	}
	const checksum = await EncryptionKey.getHashHex(JSON.stringify(body))
	return { ...body, checksum }
}

// biome-ignore lint/suspicious/noExplicitAny: the extracted validator takes the raw backup envelope
const validate = (b: unknown) => validateAndMigrateBackup(b as any)

describe("validateAndMigrateBackup — exact reject copy", () => {
	it("tampered checksum → 'Backup Integrity Check Failed' with the exact message", async () => {
		const r = await validate({ ...(await buildBackup()), checksum: "definitely-wrong" })
		expect(r).toEqual({
			kind: "rejected",
			title: "Backup Integrity Check Failed",
			message: "The backup file appears to be corrupted or has been tampered with. Please ensure you have the correct backup file.",
		})
	})

	it("unsupported compat-epoch → 'Incompatible backup' (incompatible-version copy)", async () => {
		const r = await validate(await buildBackup({ "compat-epoch": 2 }))
		expect(r).toEqual({
			kind: "rejected",
			title: "Incompatible backup",
			message:
				"This backup was created by an incompatible wallet version and cannot be imported. Re-export a backup from a current version of the wallet.",
		})
	})

	it("malformed schema-version → 'Incompatible backup' (no-valid-version copy)", async () => {
		const r = await validate(await buildBackup({ "backup-schema-version": 0 }))
		expect(r).toEqual({
			kind: "rejected",
			title: "Incompatible backup",
			message: "This backup does not carry a valid schema version. Re-export a backup from a current version of the wallet.",
		})
	})

	it("too-new schema-version → 'Backup is too new' with the exact message", async () => {
		const r = await validate(await buildBackup({ "backup-schema-version": 999 }))
		expect(r).toEqual({
			kind: "rejected",
			title: "Backup is too new",
			message: "This backup was created by a newer version of the wallet. Update the wallet, then import it again.",
		})
	})

	it("checksum wins over a bad compat-epoch (trust-gate order)", async () => {
		const r = await validate({ ...(await buildBackup({ "compat-epoch": 2 })), checksum: "wrong" })
		expect((r as { title: string }).title).toBe("Backup Integrity Check Failed")
	})

	it("a valid backup resolves ok with the migrated data + checksum-stripped backup", async () => {
		const r = await validate(await buildBackup())
		expect(r.kind).toBe("ok")
		if (r.kind === "ok") {
			expect(r.backup).not.toHaveProperty("checksum")
			expect((r.data.profile as { id: unknown }).id).toBe("src-profile-id")
		}
	})
})

describe("errorLogWriters — what reaches the log", () => {
	it("logs the service and the count, never a row's network id or address", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const log = ref<Record<string, unknown[]>>({})
		const contract = `0x${"07".repeat(32)}`
		const rows = errorLogWriters(log).recordRestoreErrors("account-state", [
			{ networkId: "net-secret-id", senders: [], contracts: [{ address: contract, restoreError: "boom" }] },
		])
		expect(rows).toHaveLength(1)
		expect(log.value["account-state"]).toEqual(rows)
		const logged = JSON.stringify(warn.mock.calls)
		expect(logged).toContain("1 restore error(s)")
		expect(logged).not.toContain("net-secret-id")
		expect(logged).not.toContain(contract)
		warn.mockRestore()
	})
})

describe("restoredNetworkIds", () => {
	it("names only a network whose outcome and every child carry no error, which the collected rows leave out", () => {
		const outcomes = [
			{ networkId: "M1", senders: [AS_SENDER], contracts: [] },
			{ networkId: "M2", senders: [], contracts: [], restoreError: ACCOUNT_STATE_SKIP_WRONG_NETWORK },
			{
				networkId: "M3",
				senders: [AS_SENDER],
				contracts: [
					{ address: `0x${"07".repeat(32)}`, restoreError: "Contract artifact doesn't match instance's current class id" },
				],
			},
			{
				networkId: "M4",
				senders: [],
				contracts: [],
				restoreError: `${ACCOUNT_STATE_SKIP_DEADLINE} (1 registration(s) not attempted)`,
			},
		]

		expect(restoredNetworkIds(outcomes)).toEqual(["M1"])
		const collected = collectRestoreErrors("account-state", outcomes) as Array<{ networkId?: unknown }>
		expect(collected.map((row) => row.networkId)).toEqual(["M2", "M3", "M4"])
	})
})

// Direct-call contract pins for the stage-2 units (F-Q02). The seam — the
// `${chainId}:${address}` allow-set — is now an explicit return/parameter, so
// its contract is pinned HERE at the unit level; the black-box suites below
// remain the end-to-end proof.
describe("restoreAccountsAndFilterOwnedSlices — stage 2a contract", () => {
	const fakeAccountService = (rows: unknown) => ({ restore: vi.fn(async () => rows) }) as never

	it("returns the allow-set from SUCCESSFUL accounts only and filters every account-owned slice in place", async () => {
		const data = {
			account: [{ address: "0xa", chainId: 1 }],
			transaction: [
				{ account: "0xa", chainId: 1, hash: "keep" },
				{ account: "0xa", chainId: 2, hash: "wrong-chain" },
				{ account: "0xevil", chainId: 1, hash: "foreign" },
			],
			"auth-registry": [
				{ account: "0xa", chainId: 1, hash: "keep" },
				{ account: "0xa", chainId: 2, hash: "wrong-chain" },
				{ account: "0xevil", chainId: 1, hash: "foreign" },
			],
			"token-balance": [
				{ account: "0xa", id: 1 },
				{ account: "0xevil", id: 2 },
			],
		} as never
		const recorder = vi.fn()

		const set = await restoreAccountsAndFilterOwnedSlices(
			data,
			fakeAccountService([
				{ address: "0xa", chainId: 1 },
				{ address: "0xfail", chainId: 1, restoreError: "boom" },
			]),
			recorder,
		)

		expect([...set]).toEqual(["1:0xa"]) // failed accounts never enter the allow-set
		const d = data as Record<string, Array<Record<string, unknown>>>
		expect(d.transaction.map((t) => t.hash)).toEqual(["keep"])
		// authwits are keyed by the (chainId, account) tuple like txs: the same address on a
		// non-imported chain is dropped, not just a foreign address.
		expect(d["auth-registry"].map((a) => a.hash)).toEqual(["keep"])
		expect(d["token-balance"].map((b) => b.id)).toEqual([1])
		expect(recorder).toHaveBeenCalledWith("account", expect.anything())
	})

	it("propagates a restore rejection with its IDENTITY intact (the caller matches .message; the outer catch classifies)", async () => {
		const boom = new Error("Duplicate account")
		const failing = { restore: vi.fn(async () => Promise.reject(boom)) } as never

		await expect(restoreAccountsAndFilterOwnedSlices({ account: [] } as never, failing, vi.fn())).rejects.toBe(boom)
	})
})

describe("relinkRestoredTokenBalances — stage 2b contract", () => {
	it("re-links by result index, drops failed-token and chain-mismatched balances, mutates in place, returns the dropped rows", () => {
		const data = {
			token: [
				{ id: 1, chainId: 1 },
				{ id: 2, chainId: 2 },
				{ id: 3, chainId: 1 },
			],
			"token-balance": [
				{ id: 10, token: 1, account: "0xa" }, // ok → n1
				{ id: 11, token: 2, account: "0xa" }, // account not imported on chain 2 → dropped
				{ id: 12, token: 3, account: "0xa" }, // token failed restore → dropped
			],
		} as never
		const newTokens = [
			{ id: "n1", chainId: 1, contract: "0xT" },
			{ id: "n2", chainId: 2, contract: "0xU" },
			{ id: 3, chainId: 1, contract: "0xV", restoreError: "boom" },
		]

		const dropped = relinkRestoredTokenBalances(data, newTokens, new Set(["1:0xa"]))

		expect((data as Record<string, unknown>)["token-balance"]).toEqual([{ id: 10, token: "n1", account: "0xa" }])
		expect(dropped).toHaveLength(2)
		for (const row of dropped as Array<Record<string, unknown>>) {
			expect(row.restoreError).toBe("Token balance could not be re-linked to a restored token")
		}
	})

	it("chain authority is the RESTORED token, not the blob's old row", () => {
		// The old row claims chain 1 (which IS in the allow-set); the persisted
		// restore result says chain 2. Attacker-controlled old-row authority would
		// keep the balance; restored-token authority must drop it.
		const data = {
			token: [{ id: 1, chainId: 1 }],
			"token-balance": [{ id: 10, token: 1, account: "0xa" }],
		} as never
		const dropped = relinkRestoredTokenBalances(data, [{ id: "n1", chainId: 2, contract: "0xT" }], new Set(["1:0xa"]))
		expect((data as Record<string, unknown>)["token-balance"]).toEqual([])
		expect(dropped).toHaveLength(1)
	})

	it("records only the POSITION of a dropped row, never its content", () => {
		// This path never reaches `collectRestoreErrors`, so it does its own allowlisting. `tb` is
		// raw backup content: migration validates only `id`, so `token` can be an arbitrary nested
		// object, and the balances are financial data.
		const data = {
			token: [{ id: 1, chainId: 1 }],
			"token-balance": [
				{
					id: 10,
					token: { nested: "https://rpc.example.com/v2/SECRET-KEY" },
					account: "0xUNIMPORTED",
					publicBalance: "123456789",
					privateBalance: "987654321",
				},
			],
		} as never

		const dropped = relinkRestoredTokenBalances(data, [{ id: "n1", chainId: 1, contract: "0xT" }], new Set(["1:0xa"]))

		const wire = JSON.stringify(dropped)
		expect(wire).not.toContain("SECRET-KEY")
		expect(wire).not.toContain("987654321")
		expect(wire).not.toContain("0xUNIMPORTED")
		expect(dropped).toEqual([{ row: 0, restoreError: "Token balance could not be re-linked to a restored token" }])
	})

	it("bounds the dropped-row count — this path has no collector cap behind it", () => {
		const data = {
			token: [{ id: 1, chainId: 1 }],
			"token-balance": Array.from({ length: 5000 }, (_, i) => ({ id: i, token: 999, account: "0xa" })),
		} as never

		const dropped = relinkRestoredTokenBalances(data, [{ id: "n1", chainId: 1, contract: "0xT" }], new Set(["1:0xa"]))

		// 200 records plus one truncation marker — the cap must not read as "exactly 200 failures".
		expect(dropped).toHaveLength(201)
		expect(JSON.stringify(dropped[200])).toContain("further dropped balance(s) not recorded")
	})
})

interface MakeOpts {
	password?: string
	repeatedPassword?: string
}
function makeOpts(o: MakeOpts = {}) {
	const password = ref(o.password ?? "pass1234")
	const repeatedPassword = ref(o.repeatedPassword ?? "pass1234")
	const fillError = vi.fn()
	const clearError = vi.fn()
	const pickFile = vi.fn()
	const completeImport = vi.fn()
	const resolveProfileName = vi.fn(async (backupName: string | null): Promise<string | null> => backupName ?? "Main")
	const openToast = vi.fn()
	return { password, repeatedPassword, fillError, clearError, pickFile, completeImport, resolveProfileName, openToast }
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
	setActivePinia(createTestingPinia({ createSpy: vi.fn }))
	profileClient.restore.mockReset()
	profileClient.finalizeRestore
		.mockReset()
		.mockResolvedValue({ profile: { id: "new-id", name: "Imported", type: "password" }, fence: FENCE })
	profileClient.assertRunFence.mockReset().mockResolvedValue(undefined)
	reminder.arm.mockReset().mockResolvedValue("run-1")
	reminder.admit.mockReset().mockResolvedValue({})
	reminder.finish.mockReset().mockResolvedValue(undefined)
	profileClient.deleteProfile.mockReset().mockResolvedValue(undefined)
	profileClient.disconnect.mockReset()
	networkClient.seedDefaultsForProfile.mockReset()
	networkClient.setActiveForProfile.mockReset().mockResolvedValue("new-net-1")
	networkClient.probeNodeStatus.mockReset().mockResolvedValue(NodeStatus.Active)
	networkClient.disconnect.mockReset()
	accountClient.restore.mockReset()
	accountClient.reconcileImportedAccounts.mockReset().mockResolvedValue([])
	accountClient.disconnect.mockReset()
	tokenClient.restore.mockReset().mockResolvedValue([])
	tokenClient.disconnect.mockReset()
	tokenClient.refreshRestoredTokens.mockReset().mockResolvedValue(undefined)
	transactionClient = passthroughClient()
	tokenBalanceClient = passthroughClient()
	accountStateClient = passthroughClient()
	authRegistryClient = passthroughClient()
	contactClient = passthroughClient()
	configClient = passthroughClient()
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe("useFullBackupImport — isAllowedToImportBackup", () => {
	it("returns false when no backup is selected", () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		expect(c.isAllowedToImportBackup.value).toBe(false)
	})

	it("returns false for a password backup with a short password", async () => {
		const opts = makeOpts({ password: "short", repeatedPassword: "short" })
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup: {}, kind: "plain", profileType: "password" }
		expect(c.isAllowedToImportBackup.value).toBe(false)
	})

	it("returns false when the new password and repeat don't match", () => {
		const opts = makeOpts({ password: "longenough", repeatedPassword: "mismatch12" })
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup: {}, kind: "plain", profileType: "password" }
		expect(c.isAllowedToImportBackup.value).toBe(false)
	})

	it("returns true when password matches and is ≥8 chars", () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup: {}, kind: "plain", profileType: "password" }
		expect(c.isAllowedToImportBackup.value).toBe(true)
	})

	it("bypasses the password rule for passkey-typed backups", () => {
		const opts = makeOpts({ password: "", repeatedPassword: "" })
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup: {}, kind: "plain", profileType: "passkey" }
		expect(c.isAllowedToImportBackup.value).toBe(true)
	})
})

describe("useFullBackupImport — the reconcile call's account client", () => {
	async function startImport() {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])
		return c
	}

	it("is closed again only after reconcileImportedAccounts resolves", async () => {
		let release!: () => void
		accountClient.reconcileImportedAccounts.mockReturnValue(new Promise<never[]>((resolve) => (release = () => resolve([]))))
		const c = await startImport()

		const run = c.restoreBackup()
		await vi.waitFor(() => expect(accountClient.reconcileImportedAccounts).toHaveBeenCalled())
		// The accounts stage closed it once; the reconcile call reconnected it and still holds it.
		expect(accountClient.disconnect).toHaveBeenCalledTimes(1)

		release()
		await run
		expect(accountClient.disconnect).toHaveBeenCalledTimes(2)
		expect(c.restoreStatus.value).toBe("finished")
	})

	it("is closed again when reconcileImportedAccounts rejects, and the import still fails", async () => {
		accountClient.reconcileImportedAccounts.mockRejectedValue(new Error("reconcile failed"))
		const c = await startImport()

		await c.restoreBackup()

		expect(accountClient.disconnect).toHaveBeenCalledTimes(2)
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(c.restoreStatus.value).not.toBe("finished")
	})
})

describe("useFullBackupImport — restoreBackup happy path", () => {
	it("calls restore + finalizeRestore + completeImport on clean success", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])

		await c.restoreBackup()

		expect(profileClient.restore).toHaveBeenCalledOnce()
		expect(profileClient.finalizeRestore).toHaveBeenCalledWith("new-id", "pass1234")
		expect(opts.completeImport).toHaveBeenCalledOnce()
		expect(c.restoreStatus.value).toBe("finished")
		expect(c.isRestoreHasErrors.value).toBe(false)
		expect(profileClient.disconnect).toHaveBeenCalled()
		expect(networkClient.disconnect).toHaveBeenCalled()
	})

	it("re-reads the restored tokens after finalizeRestore, on the fence it returned and the tail's deadline, and trusts none", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([])
		const startedAt = Date.now()

		await c.restoreBackup()

		expect(tokenClient.refreshRestoredTokens).toHaveBeenCalledExactlyOnceWith(FENCE, expect.any(Number))
		const deadlineAt = tokenClient.refreshRestoredTokens.mock.calls[0]?.[1] as number
		expect(deadlineAt - startedAt).toBeGreaterThan(0)
		expect(deadlineAt - startedAt).toBeLessThanOrEqual(IMPORT_CHAIN_SYNC_TOTAL_BUDGET_MS + 1_000)
		expect(tokenClient.refreshRestoredTokens.mock.invocationCallOrder[0]).toBeGreaterThan(
			profileClient.finalizeRestore.mock.invocationCallOrder[0],
		)
		expect(opts.completeImport).toHaveBeenCalledOnce()
	})

	it("a re-read that rejects keeps the import", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup: await buildBackup(), kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([])
		tokenClient.refreshRestoredTokens.mockRejectedValue(new Error("worker gone"))
		await c.restoreBackup()
		expect(c.restoreStatus.value).toBe("finished")
		expect(opts.completeImport).toHaveBeenCalledOnce()
	})

	it("a re-read that never answers ends at the deadline and closes its port", async () => {
		tokenClient.refreshRestoredTokens.mockReturnValue(new Promise(() => {}))
		const startedAt = Date.now()
		await refreshRestoredTokensStage(FENCE, startedAt + 50)
		expect(Date.now() - startedAt).toBeLessThan(2_000)
		expect(tokenClient.disconnect).toHaveBeenCalledOnce()
		// A deadline already past asks nothing.
		tokenClient.refreshRestoredTokens.mockClear()
		await refreshRestoredTokensStage(FENCE, Date.now() - 1)
		expect(tokenClient.refreshRestoredTokens).not.toHaveBeenCalled()
	})

	it("restores the ACTIVE-network selection by chain BEFORE finalizeRestore", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({ "active-chain-id": 1 })
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([
			{ id: "new-net-0", name: "Alpha", rpcUrl: "https://a/", chainId: 0 },
			{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 },
		])
		accountClient.restore.mockResolvedValue([])

		await c.restoreBackup()

		expect(networkClient.seedDefaultsForProfile).toHaveBeenCalledWith("new-id")
		expect(networkClient.setActiveForProfile).toHaveBeenCalledWith("new-id", "new-net-1")
		// The setter is profileId-parameterized precisely because the profile isn't active until finalize.
		expect(networkClient.setActiveForProfile.mock.invocationCallOrder[0]).toBeLessThan(
			profileClient.finalizeRestore.mock.invocationCallOrder[0],
		)
	})

	it("a backup with NO active-chain-id, or one naming an unseeded or non-numeric chain, sets nothing (the primary seed stays)", async () => {
		for (const body of [{}, { "active-chain-id": 99 }, { "active-chain-id": "1" }]) {
			networkClient.setActiveForProfile.mockClear()
			const opts = makeOpts()
			const c = useFullBackupImport(opts)
			const backup = await buildBackup(body)
			c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
			profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
			networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
			accountClient.restore.mockResolvedValue([])
			await c.restoreBackup()
			expect(c.restoreStatus.value).toBe("finished")
			expect(networkClient.setActiveForProfile).not.toHaveBeenCalled()
		}
	})

	it("restores account-state AFTER finalizeRestore (store key needs an open session; 5.0.1 regression fix)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				"account-state": [{ networkId: "N1", chainId: 1, contracts: [], senders: [AS_SENDER] }],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "M1", name: "A", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([])

		await c.restoreBackup()

		// The crux: account-state's registerContract needs the PXE store key, which is
		// only provisionable once finalizeRestore has opened the session. So account-state
		// restore MUST run strictly after finalizeRestore (running it before hit
		// PXE_STORE_KEY_MISSING under 5.0.1 → "completed with errors").
		expect(accountStateClient.restore).toHaveBeenCalledOnce()
		expect(profileClient.finalizeRestore).toHaveBeenCalledOnce()
		expect(accountStateClient.restore.mock.invocationCallOrder[0]).toBeGreaterThan(
			profileClient.finalizeRestore.mock.invocationCallOrder[0],
		)
		expect(accountStateClient.disconnect).toHaveBeenCalled()
		expect(c.isRestoreHasErrors.value).toBe(false)
	})

	it("a present-but-malformed account-state slice records a violation and blocks auto-completion", async () => {
		// Hostile `{}` where the array belongs: gating the chain-sync tail on
		// Array.isArray would skip the normalizer's violation record and let the
		// import auto-route past the Continue gate unrecorded.
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				"account-state": { evil: true } as never,
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "M1", name: "A", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([])

		await c.restoreBackup()

		expect(accountStateClient.restore).not.toHaveBeenCalled() // nothing registrable
		expect(c.isRestoreHasErrors.value).toBe(true)
		const records = c.restoreErrorLog.value["account-state"] as Array<{ restoreError?: unknown }>
		expect(records?.some((r) => typeof r.restoreError === "string" && r.restoreError.includes("not an array"))).toBe(true)
	})

	it("does NOT auto-call completeImport when partial errors exist (Continue button shows)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: { "account-state": [{ networkId: "old", chainId: 2, contracts: [], senders: [AS_SENDER] }] },
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		// One account-state item names an unseeded chain → dropped and recorded → isRestoreHasErrors=true
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])

		await c.restoreBackup()

		expect(c.restoreStatus.value).toBe("finished")
		expect(c.isRestoreHasErrors.value).toBe(true)
		expect(c.importedProfile.value).toEqual({ id: "new-id", name: "Imported", type: "password" })
		expect(opts.completeImport).not.toHaveBeenCalled()
	})
})

describe("useFullBackupImport — guards before any writes", () => {
	async function expectRejected(backup: unknown, title: string, opts = makeOpts()) {
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		await c.restoreBackup()
		expect(c.restoreStatus.value).toBe("failed")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", title, expect.any(String))
		expect(profileClient.restore).not.toHaveBeenCalled()
	}

	it("rejects an unsupported compat-epoch (incl. epoch 4 — a V5 backup, the nulo-v5 account regime)", async () => {
		await expectRejected(await buildBackup({ "compat-epoch": 2 }), "Incompatible backup")
		await expectRejected(await buildBackup({ "compat-epoch": 3 }), "Incompatible backup")
		await expectRejected(await buildBackup({ "compat-epoch": 4 }), "Incompatible backup")
		await expectRejected(await buildBackup({ "compat-epoch": 6 }), "Incompatible backup")
	})

	it("rejects a pre-baseline blob (legacy schema-version only, no new fields) with the re-export copy", async () => {
		const legacy = await buildBackup({ "compat-epoch": undefined, "backup-schema-version": undefined, "schema-version": 2 })
		await expectRejected(legacy, "Incompatible backup")
	})

	it("rejects a missing or malformed backup-schema-version", async () => {
		for (const bad of [undefined, 0, -1, 1.5, "1"]) {
			profileClient.restore.mockClear()
			await expectRejected(await buildBackup({ "backup-schema-version": bad }), "Incompatible backup")
		}
	})

	it("rejects a backup-schema-version newer than this build", async () => {
		await expectRejected(await buildBackup({ "backup-schema-version": 999 }), "Backup is too new")
	})

	it("rejects a tampered checksum", async () => {
		const backup = await buildBackup()
		;(backup as { checksum: string }).checksum = "deadbeef"
		await expectRejected(backup, "Backup Integrity Check Failed")
	})

	it("verifies the checksum BEFORE any version field is interpreted", async () => {
		// Bad epoch AND bad checksum: the integrity error must win — the
		// trust-gate order is checksum → epoch → schema-version.
		const backup = await buildBackup({ "compat-epoch": 2 })
		;(backup as { checksum: string }).checksum = "deadbeef"
		await expectRejected(backup, "Backup Integrity Check Failed")
	})

	it.each([
		["not an object", "Imported"],
		["an unknown type", { id: "src-profile-id", name: "Imported", type: "seed" }],
		["a non-string name", { id: "src-profile-id", name: { first: "Imported" }, type: "password" }],
	])("refuses a profile part that is %s with the integrity message", async (_label, profile) => {
		await expectRejected(await buildBackup({ data: { profile } }), "Backup Integrity Check Failed")
	})

	it("a profile part with an id the wallet would not generate passes; the service picks the id", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({ data: { profile: { id: ["not", "an", "id"], name: "Imported", type: "password" } } })
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([])

		await c.restoreBackup()

		expect(profileClient.restore).toHaveBeenCalledOnce()
		expect(profileClient.finalizeRestore).toHaveBeenCalledWith("new-id", "pass1234")
		expect(c.restoreStatus.value).toBe("finished")
	})

	it("a migration failure aborts BEFORE any restore() call — zero-rollback atomicity", async () => {
		// An unknown slice fails the migrator's trust-boundary validation; the
		// import must reject with profileService.restore never invoked (nothing
		// touched live storage, so there is nothing to roll back).
		const backup = await buildBackup({ data: { mystery: [] } })
		await expectRejected(backup, "Import failed")
	})
})

describe("useFullBackupImport — backup migration wiring", () => {
	it("a v1 backup migrates forward and services restore CURRENT-shape slices", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: { contact: [{ id: "c1", profileId: "src-profile-id", address: "0xc", legacyName: "Ali" }] },
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])

		await c.restoreBackup()

		expect(c.restoreStatus.value).toBe("finished")
		// The v2 migration renamed legacyName → name before the restore ran.
		expect(contactClient.restore).toHaveBeenCalledWith([{ id: "c1", profileId: "new-id", address: "0xc", name: "Ali" }], "new-id")
	})
})

describe("useFullBackupImport — tx-restore provenance filter (P1)", () => {
	it("drops-and-records a tx whose account was NOT imported by this restore", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				account: [{ profileId: "src-profile-id", chainId: 1, address: "0xMINE" }],
				transaction: [
					{ hash: "h1", account: "0xMINE", chainId: 1 },
					{ hash: "h2", account: "0xFOREIGN", chainId: 1 },
				],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xMINE", chainId: 1 }])

		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		await c.restoreBackup()

		// Only the imported-account tx reaches restore; the foreign one is dropped
		// BEFORE it can be written (it would otherwise surface in another profile's
		// activity and never be purged after the subscriber removal).
		expect(transactionClient.restore).toHaveBeenCalledWith(
			[{ hash: "h1", account: "0xMINE", chainId: 1, networkId: "new-net-1" }],
			"new-id",
		)
		// Recorded (console), NOT surfaced as a user-facing restore error — a
		// dropped foreign/corrupt tx must not flip a clean import to error-mode.
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("dropped 1 transaction"))
		expect(c.restoreErrorLog.value.transaction).toBeUndefined()
		expect(c.isRestoreHasErrors.value).toBe(false)
		warn.mockRestore()
	})

	it("keeps every tx when all accounts were imported (no false drops)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				account: [
					{ profileId: "src-profile-id", chainId: 1, address: "0xA" },
					{ profileId: "src-profile-id", chainId: 1, address: "0xB" },
				],
				transaction: [
					{ hash: "h1", account: "0xA", chainId: 1 },
					{ hash: "h2", account: "0xB", chainId: 1 },
				],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([
			{ address: "0xA", chainId: 1 },
			{ address: "0xB", chainId: 1 },
		])

		await c.restoreBackup()

		expect(transactionClient.restore).toHaveBeenCalledWith(
			[
				{ hash: "h1", account: "0xA", chainId: 1, networkId: "new-net-1" },
				{ hash: "h2", account: "0xB", chainId: 1, networkId: "new-net-1" },
			],
			"new-id",
		)
		expect(c.restoreErrorLog.value.transaction).toBeUndefined()
	})

	it("drops a tx whose account FAILED to import (allow-set is SUCCESSFUL accounts only)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				account: [
					{ profileId: "src-profile-id", chainId: 1, address: "0xOK" },
					{ profileId: "src-profile-id", chainId: 1, address: "0xBAD" },
				],
				transaction: [{ hash: "h1", account: "0xBAD", chainId: 1 }],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xOK" }, { address: "0xBAD", restoreError: "boom" }])

		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		await c.restoreBackup()

		// The tx's account failed to restore → dropped (allow-set is SUCCESSFUL
		// accounts). The failed ACCOUNT already surfaces its own restoreError, so
		// the dropped tx is only console-recorded, not double-flagged.
		expect(transactionClient.restore).toHaveBeenCalledWith([], "new-id")
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("dropped 1 transaction"))
		warn.mockRestore()
	})
})

describe("useFullBackupImport — account-owned-slice provenance (P3)", () => {
	it("drops an auth-registry row whose account was NOT imported (graft closed)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				account: [{ profileId: "src-profile-id", chainId: 1, address: "0xMINE" }],
				"auth-registry": [
					{ id: 1, chainId: 1, account: "0xMINE", hash: "0xh1" },
					{ id: 2, chainId: 1, account: "0xVICTIM", hash: "0xh2" },
					{ id: 3, chainId: 2, account: "0xMINE", hash: "0xh3" },
				],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xMINE", chainId: 1 }])
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

		await c.restoreBackup()

		// Only the imported-account authwit reaches restore; the foreign one is
		// dropped before it can graft into the victim's revocation index.
		expect(authRegistryClient.restore).toHaveBeenCalledWith([{ id: 1, chainId: 1, account: "0xMINE", hash: "0xh1" }], "new-id")
		warn.mockRestore()
	})

	it("drops a token-balance whose account was NOT imported (graft closed)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				account: [{ profileId: "src-profile-id", chainId: 1, address: "0xMINE" }],
				token: [{ id: 1, chainId: 1, contract: "0xT" }],
				"token-balance": [
					{ id: 10, token: 1, account: "0xMINE" },
					{ id: 11, token: 1, account: "0xVICTIM" },
				],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xMINE", chainId: 1 }])
		tokenClient.restore.mockResolvedValue([{ id: "n1", chainId: 1, contract: "0xT" }])
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

		await c.restoreBackup()

		expect(tokenBalanceClient.restore).toHaveBeenCalledWith([{ id: 10, token: "n1", account: "0xMINE" }], "new-id")
		warn.mockRestore()
	})

	it("drops a tx referencing an imported account on the WRONG chain (chain-provenance)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				account: [{ profileId: "src-profile-id", chainId: 1, address: "0xMINE" }],
				transaction: [
					{ hash: "h1", account: "0xMINE", chainId: 1 },
					{ hash: "h2", account: "0xMINE", chainId: 2 },
				],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xMINE", chainId: 1 }])
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

		await c.restoreBackup()

		// 0xMINE was imported on chain 1 only → the chain-2 tx is dropped (an
		// address-only filter would have admitted it).
		expect(transactionClient.restore).toHaveBeenCalledWith(
			[{ hash: "h1", account: "0xMINE", chainId: 1, networkId: "new-net-1" }],
			"new-id",
		)
		warn.mockRestore()
	})
})

describe("useFullBackupImport — rows bind to the seeded network of their chain", () => {
	const seeds = [
		{ id: "M1", name: "A", rpcUrl: "https://a/", chainId: 1 },
		{ id: "M2", name: "B", rpcUrl: "https://b/", chainId: 2 },
	]

	it("account-state items and transaction rows take the seeded id of their chainId; the exported networkId is ignored", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				"account-state": [
					{ networkId: "evil-1", chainId: 1, contracts: [], senders: [AS_SENDER] },
					{ networkId: "evil-2", chainId: 2, contracts: [], senders: [AS_SENDER] },
				],
				transaction: [{ hash: "h1", account: "0xaaaa", chainId: 1 }],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue(seeds)
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa", chainId: 1 }])

		await c.restoreBackup()

		expect(accountStateClient.restore).toHaveBeenCalledTimes(2)
		expect(accountStateClient.restore).toHaveBeenCalledWith(
			[{ networkId: "M1", contracts: [], senders: [AS_SENDER] }],
			seeds,
			FENCE,
			expect.anything(),
		)
		expect(accountStateClient.restore).toHaveBeenCalledWith(
			[{ networkId: "M2", contracts: [], senders: [AS_SENDER] }],
			seeds,
			FENCE,
			expect.anything(),
		)
		expect(transactionClient.restore).toHaveBeenCalledWith([{ hash: "h1", account: "0xaaaa", chainId: 1, networkId: "M1" }], "new-id")
		expect(c.isRestoreHasErrors.value).toBe(false)
	})

	it("a doctored backup cannot define a network: a `network` slice rejects the whole import before any write", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: { network: [{ id: "N1", profileId: "src-profile-id", name: "Alpha V5", rpcUrl: "https://evil/", chainId: 1 }] },
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		await c.restoreBackup()

		expect(c.restoreStatus.value).toBe("failed")
		expect(profileClient.restore).not.toHaveBeenCalled()
		expect(networkClient.seedDefaultsForProfile).not.toHaveBeenCalled()
	})

	it("rows on an unseeded, missing or non-numeric chain are dropped and reported, never bound by their exported id", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				"account-state": [
					{ networkId: "M1", chainId: 7, contracts: [], senders: [AS_SENDER] },
					{ networkId: "M1", contracts: [], senders: [AS_SENDER] },
					{ networkId: "M1", chainId: "1", contracts: [], senders: [AS_SENDER] },
				],
				transaction: [{ hash: "h1", account: "0xaaaa", chainId: 7 }],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue(seeds)
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])

		await c.restoreBackup()

		expect(accountStateClient.restore).not.toHaveBeenCalled()
		expect(transactionClient.restore).toHaveBeenCalledWith([], "new-id")
		expect(networkClient.probeNodeStatus).not.toHaveBeenCalled()
		expect(c.isRestoreHasErrors.value).toBe(true)
		// Ordinal-only records: the dropped rows are backup payload and the log is user-visible.
		const reason = "Skipped: its network is not one of the built-in networks"
		expect(c.restoreErrorLog.value["account-state"]).toEqual([0, 1, 2].map((row) => ({ row, restoreError: reason })))
		expect(c.restoreErrorLog.value.transaction).toEqual([{ row: 0, restoreError: reason }])
		expect(JSON.stringify(c.restoreErrorLog.value)).not.toMatch(/0xabab|h1|senders|0xaaaa/)
	})
})

describe("useFullBackupImport — Retry the networks that did not restore", () => {
	const seeds = [
		{ id: "M1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 },
		{ id: "M2", name: "Alpha V5", rpcUrl: "https://a/", chainId: 2 },
	]
	const DROPPED = "Skipped: its network is not one of the built-in networks"
	const item = (networkId: string, senders = [AS_SENDER]) => ({ networkId, contracts: [], senders })
	const answered = (networkId: string) => [item(networkId)]
	const ranOutOfTime = (networkId: string) => [
		{ ...item(networkId, []), restoreError: `${ACCOUNT_STATE_SKIP_DEADLINE} (1 registration(s) not attempted)` },
	]
	const networkOf = (items: unknown) => (items as Array<{ networkId: string }>)[0]?.networkId
	type Import = ReturnType<typeof useFullBackupImport>
	const accountStateRows = (c: Import) => (c.restoreErrorLog.value["account-state"] ?? []) as Array<Record<string, unknown>>
	const rowsFor = (c: Import, networkId: string) => accountStateRows(c).filter((r) => r.networkId === networkId)

	/** Real macrotask turns, so the flow's WebCrypto and mocked RPCs settle while fake timers hold,
	 *  bounded by real time: WebCrypto finishes on the clock, not within a count of turns. */
	async function until(cond: () => boolean) {
		const deadline = performance.now() + 5_000
		while (!cond() && performance.now() < deadline) await new Promise((r) => setImmediate(r))
		expect(cond()).toBe(true)
	}

	/** Restores a backup with one sender on each seeded chain; `restore` answers per network. */
	async function start(restore: (networkId: string) => unknown, data: Record<string, unknown> = {}) {
		accountStateClient.restore = vi.fn(async (items: unknown) => restore(networkOf(items))) as never
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				"account-state": [
					{ ...item("x1"), chainId: 1 },
					{ ...item("x2"), chainId: 2 },
				],
				...data,
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue(seeds)
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa", chainId: 1 }])
		return { c, opts, restored: c.restoreBackup() }
	}

	it("replays only the network that ran out of time; its clean answer clears its row and keeps every other row", async () => {
		let m2Calls = 0
		const { c, opts, restored } = await start((id) => (id === "M2" && ++m2Calls === 1 ? ranOutOfTime("M2") : answered(id)), {
			"account-state": [
				{ ...item("x1"), chainId: 1 },
				{ ...item("x2"), chainId: 2 },
				{ ...item("x7"), chainId: 7 },
			],
			transaction: [{ hash: "h9", account: "0xaaaa", chainId: 7 }],
		})
		await restored
		expect(c.canRetryAccountState.value).toBe(true)
		expect(rowsFor(c, "M2")).toHaveLength(1)
		expect(c.unrestoredNetworkNames.value).toEqual(["Alpha V5"])
		expect(c.hasOtherRestoreErrors.value).toBe(true)
		accountStateClient.restore.mockClear()

		await c.retryAccountState()

		expect(accountStateClient.restore).toHaveBeenCalledOnce()
		expect(accountStateClient.restore).toHaveBeenCalledWith([item("M2")], seeds, FENCE, expect.anything())
		expect(accountStateRows(c)).toEqual([{ row: 2, restoreError: DROPPED }])
		expect(c.restoreErrorLog.value.transaction).toEqual([{ row: 0, restoreError: DROPPED }])
		expect(c.canRetryAccountState.value).toBe(false)
		expect(c.unrestoredNetworkNames.value).toEqual([])
		expect(opts.completeImport).not.toHaveBeenCalled()
	})

	it("names the networks a Retry replays by their seeded names, in seed order", async () => {
		const { c, restored } = await start((id) => ranOutOfTime(id), {
			"account-state": [
				{ ...item("x2"), chainId: 2 },
				{ ...item("x1"), chainId: 1 },
			],
		})
		await restored

		expect(c.unrestoredNetworkNames.value).toEqual(["Testnet", "Alpha V5"])
		expect(c.hasOtherRestoreErrors.value).toBe(false)
	})

	it("a Retry that leaves no error row goes into the wallet, once", async () => {
		let m2Calls = 0
		const { c, opts, restored } = await start((id) => (id === "M2" && ++m2Calls === 1 ? ranOutOfTime("M2") : answered(id)))
		await restored
		expect(opts.completeImport).not.toHaveBeenCalled()
		expect(c.hasOtherRestoreErrors.value).toBe(false)

		await c.retryAccountState()

		expect(c.restoreErrorLog.value).toEqual({})
		expect(c.isRestoreHasErrors.value).toBe(false)
		expect(opts.completeImport).toHaveBeenCalledOnce()
		expect(opts.completeImport).toHaveBeenCalledWith({ id: "new-id", name: "Imported", type: "password" })
	})

	it("the first run's late answer lands on nothing while the Retry's own answer clears the row", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
		try {
			const late = deferred<unknown>()
			const retried = deferred<unknown>()
			let m2Calls = 0
			const { c, opts, restored } = await start((id) => {
				if (id !== "M2") return answered(id)
				return ++m2Calls === 1 ? late.promise : retried.promise
			})
			await until(() => m2Calls === 1)
			await vi.advanceTimersByTimeAsync(45_000)
			await restored
			expect(rowsFor(c, "M2")).toHaveLength(1)

			const retry = c.retryAccountState()
			await until(() => m2Calls === 2)
			late.resolve(ranOutOfTime("M2"))
			retried.resolve(answered("M2"))
			await retry
			await until(() => true)

			expect(c.restoreErrorLog.value).toEqual({})
			expect(opts.completeImport).toHaveBeenCalledOnce()
		} finally {
			vi.useRealTimers()
		}
	})

	it("a Retry that stalls again leaves exactly one row for that network, still retryable", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
		try {
			let m2Calls = 0
			const { c, opts, restored } = await start((id) => {
				if (id !== "M2") return answered(id)
				m2Calls++
				return new Promise(() => {})
			})
			await until(() => m2Calls === 1)
			await vi.advanceTimersByTimeAsync(45_000)
			await restored

			const retry = c.retryAccountState()
			await until(() => m2Calls === 2)
			await vi.advanceTimersByTimeAsync(45_000)
			await retry

			expect(rowsFor(c, "M2")).toEqual([{ networkId: "M2", contracts: [], senders: [], restoreError: ACCOUNT_STATE_SKIP_DEADLINE }])
			expect(c.canRetryAccountState.value).toBe(true)
			expect(c.retryFailedAgain.value).toBe(true)
			expect(opts.completeImport).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})

	it("a Retry that fails again says so until a Retry restores the network or the page moves on", async () => {
		let m2Calls = 0
		const { c, restored } = await start((id) => (id === "M2" && ++m2Calls < 3 ? ranOutOfTime("M2") : answered(id)))
		await restored
		expect(c.retryFailedAgain.value).toBe(false)

		await c.retryAccountState()
		expect(c.retryFailedAgain.value).toBe(true)
		expect(c.unrestoredNetworkNames.value).toEqual(["Alpha V5"])

		await c.retryAccountState()
		expect(c.retryFailedAgain.value).toBe(false)
	})

	it("View Errors hands the shell every restored network's name and the networks a Retry replays", async () => {
		const showErrorLog = vi.fn()
		accountStateClient.restore = vi.fn(async (items: unknown) =>
			networkOf(items) === "M2" ? ranOutOfTime("M2") : answered(networkOf(items)),
		) as never
		const c = useFullBackupImport({ ...makeOpts(), showErrorLog })
		const backup = await buildBackup({
			data: {
				"account-state": [
					{ ...item("x1"), chainId: 1 },
					{ ...item("x2"), chainId: 2 },
				],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue(seeds)
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa", chainId: 1 }])
		await c.restoreBackup()

		c.showRestoreErrorLog()

		expect(showErrorLog).toHaveBeenCalledExactlyOnceWith(c.restoreErrorLog.value, {
			byNetworkId: new Map([
				["M1", "Testnet"],
				["M2", "Alpha V5"],
			]),
			unrestored: ["Alpha V5"],
		})
	})

	it("arms the remapped networks with registrable work after the networks stage, before the profile opens", async () => {
		const { c, restored } = await start((id) => answered(id), {
			"account-state": [
				{ ...item("x1"), chainId: 1 },
				{ ...item("x2", []), chainId: 2 },
			],
		})
		await restored

		const backup = c.selectedBackup.value?.backup as { checksum: string }
		expect(reminder.arm).toHaveBeenCalledExactlyOnceWith("new-id", backup.checksum, ["M1"])
		const order = (mock: { mock: { invocationCallOrder: number[] } }) => mock.mock.invocationCallOrder[0]
		expect(order(networkClient.seedDefaultsForProfile)).toBeLessThan(order(reminder.arm))
		expect(order(reminder.arm)).toBeLessThan(order(profileClient.finalizeRestore))
		expect(order(reminder.admit)).toBeGreaterThan(order(profileClient.finalizeRestore))
		expect(reminder.admit).toHaveBeenCalledWith("new-id", "run-1")
		expect(reminder.finish).toHaveBeenCalledExactlyOnceWith("new-id", "run-1", ["M1"])
	})

	it("a reminder that cannot be armed costs the reminder, never the restore", async () => {
		reminder.arm.mockRejectedValue(new Error("storage gone"))
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const { c, opts, restored } = await start((id) => answered(id))
		await restored

		expect(c.restoreStatus.value).toBe("finished")
		expect(accountStateClient.restore).toHaveBeenCalledTimes(2)
		expect(reminder.admit).not.toHaveBeenCalled()
		expect(reminder.finish).not.toHaveBeenCalled()
		expect(opts.completeImport).toHaveBeenCalledOnce()
		warn.mockRestore()
	})

	/** One sender over the per-network cap: the normalizer cuts it, and the rest registers. */
	const overCap = Array.from({ length: 65 }, (_, i) => ({ address: `0x${i.toString(16).padStart(64, "0")}` }))

	it("a network whose items the normalizer cut stays in the reminder though the rest registered", async () => {
		const { restored } = await start((id) => answered(id), {
			"account-state": [
				{ ...item("x1", overCap), chainId: 1 },
				{ ...item("x2"), chainId: 2 },
			],
		})
		await restored
		expect(reminder.finish).toHaveBeenCalledExactlyOnceWith("new-id", "run-1", ["M2"])
	})

	it("a Retry that registers a cut network leaves it in the reminder", async () => {
		let m1Calls = 0
		const { c, restored } = await start((id) => (id === "M1" && ++m1Calls === 1 ? ranOutOfTime("M1") : answered(id)), {
			"account-state": [
				{ ...item("x1", overCap), chainId: 1 },
				{ ...item("x2"), chainId: 2 },
			],
		})
		await restored
		reminder.finish.mockClear()

		await c.retryAccountState()

		expect(reminder.finish).toHaveBeenCalledExactlyOnceWith("new-id", "run-1", [])
		expect(c.canRetryAccountState.value).toBe(false)
		expect(c.isRestoreHasErrors.value).toBe(true)
	})

	it("drops only the networks the tail restored; one that ran out of time stays", async () => {
		const { restored } = await start((id) => (id === "M2" ? ranOutOfTime("M2") : answered(id)))
		await restored
		expect(reminder.finish).toHaveBeenCalledExactlyOnceWith("new-id", "run-1", ["M1"])
	})

	it("a tail whose session ended settles nothing", async () => {
		profileClient.assertRunFence.mockRejectedValue(new Error("Session ended"))
		const { restored } = await start((id) => answered(id))
		await restored
		expect(reminder.admit).toHaveBeenCalledOnce()
		expect(reminder.finish).not.toHaveBeenCalled()
	})

	it("a tail whose reminder is gone settles nothing", async () => {
		reminder.admit.mockResolvedValue(undefined)
		const { restored } = await start((id) => answered(id))
		await restored
		expect(reminder.finish).not.toHaveBeenCalled()
	})

	it("Retry admits and settles the same run, under the same fence", async () => {
		let m2Calls = 0
		const { c, restored } = await start((id) => (id === "M2" && ++m2Calls === 1 ? ranOutOfTime("M2") : answered(id)))
		await restored
		reminder.admit.mockClear()
		reminder.finish.mockClear()

		await c.retryAccountState()

		expect(reminder.admit).toHaveBeenCalledExactlyOnceWith("new-id", "run-1")
		expect(reminder.finish).toHaveBeenCalledExactlyOnceWith("new-id", "run-1", ["M2"])
		expect(accountStateClient.restore).toHaveBeenLastCalledWith([item("M2")], seeds, FENCE, expect.anything())
	})

	it("a Retry whose session ended registers nothing and drops Retry, leaving the reminder's lease alone", async () => {
		const { c, opts, restored } = await start((id) => (id === "M2" ? ranOutOfTime("M2") : answered(id)))
		await restored
		const rows = [...accountStateRows(c)]
		reminder.admit.mockClear()
		reminder.finish.mockClear()
		accountStateClient.restore.mockClear()
		profileClient.assertRunFence.mockRejectedValue(new SessionEndedError())

		await c.retryAccountState()

		expect(accountStateClient.restore).not.toHaveBeenCalled()
		expect(reminder.admit).not.toHaveBeenCalled()
		expect(reminder.finish).not.toHaveBeenCalled()
		expect(c.canRetryAccountState.value).toBe(false)
		expect(c.unrestoredNetworkNames.value).toEqual([])
		expect(accountStateRows(c)).toEqual(rows)
		expect(c.isRestoreHasErrors.value).toBe(true)
		expect(opts.completeImport).not.toHaveBeenCalled()
	})

	it("a second press while a Retry runs makes no call", async () => {
		const retried = deferred<unknown>()
		let m2Calls = 0
		const { c, restored } = await start((id) => {
			if (id !== "M2") return answered(id)
			return ++m2Calls === 1 ? ranOutOfTime("M2") : retried.promise
		})
		await restored

		const first = c.retryAccountState()
		await until(() => m2Calls === 2)
		expect(c.isRetryingAccountState.value).toBe(true)
		const second = c.retryAccountState()
		retried.resolve(answered("M2"))
		await Promise.all([first, second])

		expect(m2Calls).toBe(2)
		expect(c.isRetryingAccountState.value).toBe(false)
	})

	it("a Retry never clears a normalization violation, so a clean answer does not complete the import", async () => {
		const overCap = Array.from({ length: 65 }, (_, i) => ({ address: `0x${(i + 1).toString(16).padStart(64, "0")}` }))
		let m2Calls = 0
		const { c, opts, restored } = await start((id) => (id === "M2" && ++m2Calls === 1 ? ranOutOfTime("M2") : answered(id)), {
			"account-state": [
				{ ...item("x1"), chainId: 1 },
				{ ...item("x2", overCap), chainId: 2 },
			],
		})
		await restored
		const violation = rowsFor(c, "M2").find((r) => String(r.restoreError).includes("per-network cap"))
		expect(violation).toBeDefined()
		expect(rowsFor(c, "M2")).toHaveLength(2)

		await c.retryAccountState()

		expect(rowsFor(c, "M2")).toEqual([violation])
		expect(c.canRetryAccountState.value).toBe(false)
		expect(opts.completeImport).not.toHaveBeenCalled()
	})

	it("Back while a Retry runs drops it: its answer writes nothing into the reset page", async () => {
		const retried = deferred<unknown>()
		let m2Calls = 0
		const { c, restored } = await start((id) => {
			if (id !== "M2") return answered(id)
			return ++m2Calls === 1 ? ranOutOfTime("M2") : retried.promise
		})
		await restored

		const retry = c.retryAccountState()
		await until(() => m2Calls === 2)
		c.resetBackupState()
		retried.resolve(ranOutOfTime("M2"))
		await retry

		expect(c.restoreErrorLog.value).toEqual({})
		expect(c.isRetryingAccountState.value).toBe(false)
		expect(c.canRetryAccountState.value).toBe(false)
	})

	it("picking another backup while a Retry runs drops it: its clean answer completes nothing", async () => {
		const retried = deferred<unknown>()
		let m2Calls = 0
		const { c, opts, restored } = await start((id) => {
			if (id !== "M2") return answered(id)
			return ++m2Calls === 1 ? ranOutOfTime("M2") : retried.promise
		})
		await restored

		const retry = c.retryAccountState()
		await until(() => m2Calls === 2)
		opts.pickFile.mockResolvedValue(new File([JSON.stringify(await buildBackup())], "other.json", { type: "application/json" }))
		await c.pickBackupFile()
		retried.resolve(answered("M2"))
		await retry

		expect(opts.completeImport).not.toHaveBeenCalled()
		expect(rowsFor(c, "M2")).toHaveLength(1)
		expect(c.selectedBackup.value?.name).toBe("other.json")
	})

	it("Continue drops the Retry, so a press while its handshake waits makes no call and no second completion", async () => {
		let m2Calls = 0
		const { c, opts, restored } = await start((id) => (id === "M2" && ++m2Calls === 1 ? ranOutOfTime("M2") : answered(id)))
		await restored
		const handshake = deferred<void>()
		opts.completeImport.mockReturnValue(handshake.promise)

		const continued = c.continueImport()
		expect(c.canRetryAccountState.value).toBe(false)
		await c.retryAccountState()
		handshake.resolve()
		await continued

		expect(m2Calls).toBe(1)
		expect(opts.completeImport).toHaveBeenCalledOnce()
		expect(opts.completeImport).toHaveBeenCalledWith({ id: "new-id", name: "Imported", type: "password" })
	})
})

describe("useFullBackupImport — profileId normalization (P2 hardening)", () => {
	it("normalizes a hostile foreign profileId even when the root profile id is UNCHANGED (unconditional remap)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		// Crafted backup: root profile id "src-profile-id" is unused → restore
		// KEEPS it (so `newProfile.id === profile.id`, the old guard's skip case),
		// but a child row smuggles a DIFFERENT (victim) profileId.
		const backup = await buildBackup({
			data: { contact: [{ id: "c1", profileId: "victim-profile-id", name: "Alice", address: "0xccc", abbr: "A" }] },
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		// restore returns the SAME id → `newProfile.id !== profile.id` is false.
		profileClient.restore.mockResolvedValue({ id: "src-profile-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([])

		await c.restoreBackup()

		// The foreign profileId was rewritten to the created profile's id. Under the
		// old `if (newProfile.id !== profile.id)` guard it would have been written
		// verbatim → the row would bind to (graft into) the victim profile.
		const restoredContacts = (contactClient.restore.mock.calls[0] as unknown[])[0] as Array<{ profileId: string }>
		expect(restoredContacts[0].profileId).toBe("src-profile-id")
	})
})

describe("useFullBackupImport — token-balance (chainId,contract) key (P3)", () => {
	it("keeps same-contract tokens on different chains distinct (no balance collapse)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				token: [
					{ id: 1, chainId: 1, contract: "0xT" },
					{ id: 2, chainId: 2, contract: "0xT" },
				],
				"token-balance": [
					{ id: 10, token: 1, account: "0xa" },
					{ id: 11, token: 2, account: "0xa" },
				],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		// 0xa is imported on BOTH chains (chain-distinct accounts) so each chain's
		// balance passes the token/account chain-equality check.
		accountClient.restore.mockResolvedValue([
			{ address: "0xa", chainId: 1 },
			{ address: "0xa", chainId: 2 },
		])
		tokenClient.restore.mockResolvedValue([
			{ id: "n1", chainId: 1, contract: "0xT" },
			{ id: "n2", chainId: 2, contract: "0xT" },
		])

		await c.restoreBackup()

		// Balance for old token 1 (chain 1) → n1; for old token 2 (chain 2) → n2.
		// A contract-only key would collapse both onto the last (n2).
		expect(tokenBalanceClient.restore).toHaveBeenCalledWith(
			[
				{ id: 10, token: "n1", account: "0xa" },
				{ id: 11, token: "n2", account: "0xa" },
			],
			"new-id",
		)
	})

	it("index-pairs duplicate-contract tokens distinctly — a balance maps to its OWN token by id (not dropped)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				token: [
					{ id: 1, chainId: 1, contract: "0xDUP" },
					{ id: 2, chainId: 1, contract: "0xDUP" },
				],
				"token-balance": [{ id: 10, token: 1, account: "0xa" }],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xa", chainId: 1 }])
		// Both restore successfully; INDEX-pairing maps old id 1→n1, 2→n2 — the old
		// composite-key approach used to falsely DROP this balance as "ambiguous".
		tokenClient.restore.mockResolvedValue([
			{ id: "n1", chainId: 1, contract: "0xDUP" },
			{ id: "n2", chainId: 1, contract: "0xDUP" },
		])

		await c.restoreBackup()

		expect(tokenBalanceClient.restore).toHaveBeenCalledWith([{ id: 10, token: "n1", account: "0xa" }], "new-id")
	})

	it("drops a balance whose account was imported on a DIFFERENT chain than the token (chain-equality cross-check)", async () => {
		// The seam pin the prior suite lacked: every earlier test imported the
		// address on BOTH chains, so deleting the chain-equality check kept them
		// green. Here 0xa is imported ONLY on chain 1, while the balance's token
		// lives on chain 2 — the cross-check (fed by the stage-2a allow-set) must
		// drop it with a diagnostic.
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				token: [{ id: 2, chainId: 2, contract: "0xT" }],
				"token-balance": [{ id: 11, token: 2, account: "0xa" }],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xa", chainId: 1 }])
		tokenClient.restore.mockResolvedValue([{ id: "n2", chainId: 2, contract: "0xT" }])

		await c.restoreBackup()

		expect(tokenBalanceClient.restore).toHaveBeenCalledWith([], "new-id")
		expect(c.restoreErrorLog.value["token-balance"]).toHaveLength(1)
	})

	it("detects OLD-side ambiguity: two old tokens share (chainId,contract), one FAILS restore → balance NOT grafted onto survivor", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				token: [
					{ id: 1, chainId: 1, contract: "0xDUP" },
					{ id: 2, chainId: 1, contract: "0xDUP" },
				],
				// The balance references old token 2 — the one that FAILS to restore.
				"token-balance": [{ id: 10, token: 2, account: "0xa" }],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xa", chainId: 1 }])
		// token 1 succeeds; token 2 FAILS. The NEW side now sees only ONE
		// (1,0xDUP) → looks unambiguous. The OLD-side duplicate must still mark
		// the key ambiguous, or the balance would silently graft onto n1.
		tokenClient.restore.mockResolvedValue([
			{ id: "n1", chainId: 1, contract: "0xDUP" },
			{ id: 2, chainId: 1, contract: "0xDUP", restoreError: "boom" },
		])

		await c.restoreBackup()

		expect(tokenBalanceClient.restore).toHaveBeenCalledWith([], "new-id")
		expect(c.restoreErrorLog.value["token-balance"]).toHaveLength(1)
	})

	it("MERGES un-relinkable-balance diagnostics with a later token-balance restore error (no clobber)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup({
			data: {
				token: [{ id: 1, chainId: 1, contract: "0xT" }],
				"token-balance": [
					{ id: 10, token: 999, account: "0xa" }, // references a MISSING old token → dropped-and-recorded
					{ id: 11, token: 1, account: "0xa" }, // re-links to n1 → passed to restore
				],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xa", chainId: 1 }])
		tokenClient.restore.mockResolvedValue([{ id: "n1", chainId: 1, contract: "0xT" }])
		// The re-linked balance then FAILS its actual restore. recordRestoreErrors
		// must APPEND this to the drop diagnostic, not overwrite it.
		tokenBalanceClient.restore.mockResolvedValue([{ id: 11, token: "n1", account: "0xa", restoreError: "quota exceeded" }])

		await c.restoreBackup()

		// 1 dropped (missing token) + 1 real restore error = 2, not 1.
		expect(c.restoreErrorLog.value["token-balance"]).toHaveLength(2)
	})
})

describe("useFullBackupImport — completeImport + client hygiene (P7)", () => {
	it("a rejected completeImport keeps status 'finished' and does NOT roll back", async () => {
		const opts = makeOpts()
		const handshake = new Error("handshake failed")
		opts.completeImport = vi.fn().mockRejectedValue(handshake)
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])

		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			await c.restoreBackup()
			const message = "completeImport failed after a successful restore:"
			expect(logged.mock.calls.filter(([m]) => m === message)).toEqual([[message, { error: handshake }]])
		} finally {
			logged.mockRestore()
		}

		// The import genuinely succeeded — a failed handshake must not undo it.
		expect(c.restoreStatus.value).toBe("finished")
		expect(profileClient.deleteProfile).not.toHaveBeenCalled()
		expect(opts.fillError).not.toHaveBeenCalledWith("full_backup", "Import failed", expect.anything())
	})

	it("disconnects EVERY backup-service client even when a mid-loop restore throws", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])
		// TRANSACTION is the FIRST client in the backup-services loop; make it throw.
		transactionClient.restore = vi.fn().mockRejectedValue(new Error("kaboom"))

		await c.restoreBackup()

		// The whole-loop finally must disconnect every constructed LOOP client — the
		// one that threw AND all the ones after it that never ran.
		expect(transactionClient.disconnect).toHaveBeenCalled()
		expect(tokenBalanceClient.disconnect).toHaveBeenCalled()
		expect(authRegistryClient.disconnect).toHaveBeenCalled()
		expect(contactClient.disconnect).toHaveBeenCalled()
		expect(configClient.disconnect).toHaveBeenCalled()
		// account-state is NOT in the loop — it is restored AFTER finalizeRestore, which
		// a mid-loop throw never reaches, so its client is never even constructed (nothing
		// to leak). Its own restore step owns its disconnect (see the happy-path test).
		expect(accountStateClient.disconnect).not.toHaveBeenCalled()
	})
})

describe("useFullBackupImport — failure branches", () => {
	it("surfaces restoreError when ProfileService.restore returns one", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "src-profile-id", name: "Imported", type: "password", restoreError: "seal failed" })

		await c.restoreBackup()

		expect(c.restoreStatus.value).toBe("failed")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Import failed", "seal failed")
		expect(profileClient.finalizeRestore).not.toHaveBeenCalled()
	})

	it("rolls back and fails when the default networks cannot be seeded", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockRejectedValue(new Error("profile new-id does not exist"))

		await c.restoreBackup()

		expect(c.restoreStatus.value).toBe("failed")
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Can't import", expect.stringMatching(/networks/i))
		expect(profileClient.finalizeRestore).not.toHaveBeenCalled()
	})

	it("a persistently-failing rollback retries and surfaces a cleanup-pending error", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "x", restoreError: "boom" }]) // no networks → site-1 rollback
		// The compensating delete rejects on every attempt (e.g. its tombstone write fails).
		profileClient.deleteProfile.mockRejectedValue(new Error("tombstone write failed"))

		await c.restoreBackup()

		// Retried a bounded number of times, not swallowed after one attempt.
		expect(profileClient.deleteProfile).toHaveBeenCalledTimes(3)
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(c.restoreStatus.value).toBe("failed")
		// Actionable cleanup-pending message instead of the generic per-site error.
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Import incomplete", expect.stringContaining("Delete it in Settings"))
	})

	it("duplicate account: matches on err.message, rolls back, surfaces new copy", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		// The composable once did `if (err === "Duplicate account")`. RPC layer
		// reconstructs server throws as Error instances, so that check was DEAD.
		// Post-fix: composable matches on err.message.
		accountClient.restore.mockRejectedValue(new Error("Duplicate account"))

		await c.restoreBackup()

		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Can't import", "An account from this backup is already in your wallet")
		expect(c.restoreStatus.value).toBe("failed")
		expect(profileClient.finalizeRestore).not.toHaveBeenCalled()
	})

	it("non-duplicate account failure re-throws into the outer catch, which deletes the orphan profile (pre-finalize rollback)", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockRejectedValue(new Error("Profile locked"))

		await c.restoreBackup()

		expect(c.restoreStatus.value).toBe("")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Import failed", "Profile locked")
		expect(profileClient.finalizeRestore).not.toHaveBeenCalled()
		// The half-created profile must not be left behind.
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
	})

	it("(P3) a reconcile/purge failure is fail-fast: pre-finalize rollback, never a committed import with orphans", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([])
		accountClient.reconcileImportedAccounts.mockRejectedValueOnce(new Error("dependent purge failed"))

		await c.restoreBackup()

		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Import failed", "dependent purge failed")
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(profileClient.finalizeRestore).not.toHaveBeenCalled()
	})

	it("a token restore throw (pre-finalize) also rolls the orphan profile back", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])
		tokenClient.restore.mockRejectedValue(new Error("storage exploded"))

		await c.restoreBackup()

		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Import failed", "storage exploded")
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(profileClient.finalizeRestore).not.toHaveBeenCalled()
	})

	it("finalizeRestore failure surfaces a distinct error and leaves the profile in storage", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([])
		profileClient.finalizeRestore.mockRejectedValue(new Error("session storage full"))

		await c.restoreBackup()

		expect(c.restoreStatus.value).toBe("failed")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Couldn't open the imported profile", "session storage full")
		// Profile is intentionally NOT deleted — user can fall back to unlocking via /popup/auth.
		expect(profileClient.deleteProfile).not.toHaveBeenCalled()
		expect(opts.completeImport).not.toHaveBeenCalled()
	})
})

// ── Passkey ceremony branch (Path A handoff) ─────────────────────────────────

describe("useFullBackupImport — passkey backup", () => {
	const PASSKEY_CRED_ID = Buffer.from("cred-PK123").toString("base64")
	const prf = (fill: number) => asBase64SecretPrf(Buffer.from(new Uint8Array(32).fill(fill)).toString("base64"))
	const PASSKEY_DATA = {
		id: asBase64CredentialId(PASSKEY_CRED_ID),
		prf: prf(4),
		userHandle: asHexUserHandle("src-profile-id"),
	}
	/** The same credential id answered by another passkey. */
	const OTHER_PASSKEY = { ...PASSKEY_DATA, prf: prf(5) }
	const macOf = async (checksum: string, credential: PasskeyCredentialData = PASSKEY_DATA) =>
		computeBackupMac(await PasskeyCredential.create(credential), checksum)

	async function buildPasskeyBackup(): Promise<Record<string, unknown> & { checksum: string }> {
		// For passkey backups, `master-key` IS the credentialId (per
		// `ProfileService.exportPlain`'s passkey return). The composable
		// uses `master-key` as the runCeremony's credentialId so the
		// modal targets the right key.
		// Passkey blobs must NOT carry an entropy field (the composable rejects one).
		const backup = await buildBackup({
			"master-key": PASSKEY_CRED_ID,
			entropy: undefined,
			// Passkey blobs carry the SEALED dek blob instead of the plaintext carrier.
			"imported-keys-dek": undefined,
			"imported-keys-dek-sealed": "AZGVrLXNlYWxlZA==",
			data: {
				profile: { id: "src-profile-id", name: "PK", type: "passkey" },
				account: [{ profileId: "src-profile-id", chainId: 1, address: "0xaaaa" }],
				token: [],
			},
		})
		return { ...backup, "backup-mac": await macOf(backup.checksum) }
	}

	/** The body edited after export, its checksum recomputed and its MAC kept. */
	async function editedPasskeyBackup(edit: (body: { data: Record<string, unknown> } & Record<string, unknown>) => void) {
		const { checksum: _stale, "backup-mac": mac, ...body } = await buildPasskeyBackup()
		edit(body as { data: Record<string, unknown> } & Record<string, unknown>)
		return { ...body, checksum: await EncryptionKey.getHashHex(JSON.stringify(body)), "backup-mac": mac }
	}

	function mountPasskeyImport(backup: unknown, answer: PasskeyCredentialData = PASSKEY_DATA) {
		const runCeremony = vi.fn().mockResolvedValue(answer)
		const opts = { ...makeOpts({ password: "" }), runCeremony }
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "passkey" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "PK", type: "passkey" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])
		return { c, opts, runCeremony }
	}

	function expectNothingWritten() {
		expect(profileClient.restore).not.toHaveBeenCalled()
		expect(networkClient.setActiveForProfile).not.toHaveBeenCalled()
		expect(tokenClient.restore).not.toHaveBeenCalled()
		expect(contactClient.restore).not.toHaveBeenCalled()
		expect(configClient.restore).not.toHaveBeenCalled()
	}

	it("a body its own passkey checked restores (control)", async () => {
		const { c, opts } = mountPasskeyImport(await buildPasskeyBackup())
		await c.restoreBackup()
		expect(opts.fillError).not.toHaveBeenCalled()
		expect(profileClient.restore).toHaveBeenCalledOnce()
		expect(c.restoreStatus.value).toBe("finished")
	})

	it.each([
		["a MAC of another body", async (b: Record<string, unknown>) => ({ ...b, "backup-mac": await macOf("0".repeat(64)) })],
		[
			"a MAC another passkey made",
			async (b: Record<string, unknown>) => ({ ...b, "backup-mac": await macOf(b.checksum as string, OTHER_PASSKEY) }),
		],
		["a MAC that is not base64", async (b: Record<string, unknown>) => ({ ...b, "backup-mac": "not base64!" })],
	])("%s is refused after the passkey answers, before anything is written", async (_label, doctor) => {
		const { c, opts, runCeremony } = mountPasskeyImport(await doctor(await buildPasskeyBackup()))
		await c.restoreBackup()
		expect(runCeremony).toHaveBeenCalledOnce()
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Backup Integrity Check Failed", expect.any(String))
		expect(c.restoreStatus.value).toBe("failed")
		expectNothingWritten()
	})

	it("a body another passkey answers for is refused", async () => {
		const { c, opts } = mountPasskeyImport(await buildPasskeyBackup(), OTHER_PASSKEY)
		await c.restoreBackup()
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Backup Integrity Check Failed", expect.any(String))
		expectNothingWritten()
	})

	it.each([
		[
			"a token",
			(b: { data: Record<string, unknown> }) => {
				b.data.token = [{ id: 1, chainId: 1, contract: `0x${"cd".repeat(32)}`, name: "Tether", symbol: "USDT", decimals: 2 }]
			},
		],
		[
			"a contact",
			(b: { data: Record<string, unknown> }) => {
				b.data.contact = [{ id: "c1", name: "Savings", address: `0x${"ef".repeat(32)}` }]
			},
		],
		[
			"a setting",
			(b: { data: Record<string, unknown> }) => {
				b.data.config = [{ key: "stealthMode", value: false }]
			},
		],
		[
			"the active chain",
			(b: Record<string, unknown>) => {
				b["active-chain-id"] = 31337
			},
		],
	])("a body with %s changed and its checksum recomputed writes nothing", async (_label, edit) => {
		const { c, opts } = mountPasskeyImport(await editedPasskeyBackup(edit as never))
		await c.restoreBackup()
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Backup Integrity Check Failed", expect.any(String))
		expectNothingWritten()
	})

	it.each([
		["no MAC", undefined],
		["a MAC that is not a string", 42],
	])("a passkey body with %s is an incompatible backup, refused before any prompt", async (_label, mac) => {
		const { c, opts, runCeremony } = mountPasskeyImport({ ...(await buildPasskeyBackup()), "backup-mac": mac })
		await c.restoreBackup()
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Incompatible backup", expect.stringMatching(/Re-export a backup/))
		expect(runCeremony).not.toHaveBeenCalled()
		expectNothingWritten()
	})

	it.each([
		["keeps its check through the seal and restores (control)", true],
		["whose check was stripped before the seal is refused before any prompt", false],
	])("an encrypted passkey file %s", async (_label, keepMac) => {
		const { "backup-mac": mac, ...body } = await buildPasskeyBackup()
		const sealed = await sealFullBackupText(JSON.stringify(keepMac ? { ...body, "backup-mac": mac } : body), "pass1234")
		const { c, opts, runCeremony } = mountPasskeyImport(sealed)
		c.selectedBackup.value = { name: "x.txt", backup: sealed, kind: "sealed", profileType: null }
		c.decryptionPassword.value = "pass1234"
		await c.decryptBackup()
		expect(c.selectedBackup.value?.profileType).toBe("passkey")
		await c.restoreBackup()
		if (keepMac) {
			expect(opts.fillError).not.toHaveBeenCalled()
			expect(profileClient.restore).toHaveBeenCalledOnce()
			return
		}
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Incompatible backup", expect.any(String))
		expect(runCeremony).not.toHaveBeenCalled()
		expectNothingWritten()
	})

	it("a password body restores with no MAC field", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		expect("backup-mac" in backup).toBe(false)
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])
		await c.restoreBackup()
		expect(opts.fillError).not.toHaveBeenCalled()
		expect(c.restoreStatus.value).toBe("finished")
	})

	it("runs the ceremony for passkey backups and passes credentialData to restore", async () => {
		const runCeremony = vi.fn().mockResolvedValue(PASSKEY_DATA)
		const opts = { ...makeOpts({ password: "" }), runCeremony }
		const c = useFullBackupImport(opts)
		const backup = await buildPasskeyBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "passkey" }

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "PK", type: "passkey" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])

		await c.restoreBackup()

		expect(runCeremony).toHaveBeenCalledWith({ mode: "get", credentialId: PASSKEY_CRED_ID, step: "restore", profileName: "PK" })
		expect(profileClient.restore).toHaveBeenCalledWith(
			expect.objectContaining({ type: "passkey" }),
			{ type: "passkey", credentialId: PASSKEY_CRED_ID, dekSealed: "AZGVrLXNlYWxlZA==" },
			"", // empty password for passkey
			PASSKEY_DATA, // credentialData forwarded
			undefined, // allowDuplicate: no confirmed override on the happy path
		)
		expect(opts.completeImport).toHaveBeenCalledOnce()
	})

	it("UserRejectedError from the ceremony silently resets state (no toast, no fillError)", async () => {
		const runCeremony = vi.fn().mockRejectedValue(new UserRejectedError("cancelled"))
		const opts = { ...makeOpts({ password: "" }), runCeremony }
		const c = useFullBackupImport(opts)
		const backup = await buildPasskeyBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "passkey" }

		await c.restoreBackup()

		expect(c.restoreStatus.value).toBe("") // reset so the Import button is usable again
		expect(opts.fillError).not.toHaveBeenCalled()
		expect(opts.openToast).not.toHaveBeenCalled()
		expect(profileClient.restore).not.toHaveBeenCalled()
	})

	it("an unconfirmed passkey prompt toasts, keeps the chosen backup, and a second Import restores it", async () => {
		const runCeremony = vi
			.fn()
			.mockRejectedValueOnce(new DOMException("The operation either timed out or was not allowed.", "NotAllowedError"))
			.mockResolvedValueOnce(PASSKEY_DATA)
		const opts = { ...makeOpts({ password: "" }), runCeremony }
		const c = useFullBackupImport(opts)
		const backup = await buildPasskeyBackup()
		const selection = { name: "x.json", backup, kind: "plain" as const, profileType: "passkey" as const }
		c.selectedBackup.value = selection

		await c.restoreBackup()

		expect(opts.openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Passkey not confirmed. Try again." })
		expect(opts.fillError).not.toHaveBeenCalled()
		expect(c.restoreStatus.value).toBe("")
		expect(c.selectedBackup.value).toStrictEqual(selection)
		expect(c.isAllowedToImportBackup.value).toBe(true)
		expect(profileClient.restore).not.toHaveBeenCalled()

		profileClient.restore.mockResolvedValue({ id: "new-id", name: "PK", type: "passkey" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])
		await c.restoreBackup()

		expect(runCeremony).toHaveBeenCalledTimes(2)
		expect(profileClient.restore).toHaveBeenCalledWith(expect.anything(), expect.anything(), "", PASSKEY_DATA, undefined)
		expect(c.restoreStatus.value).toBe("finished")
		expect(opts.completeImport).toHaveBeenCalledOnce()
	})

	it("non-cancel ceremony error surfaces a specific fillError (not generic 'Import failed')", async () => {
		const runCeremony = vi.fn().mockRejectedValue(new Error("authenticator unavailable"))
		const opts = { ...makeOpts({ password: "" }), runCeremony }
		const c = useFullBackupImport(opts)
		const backup = await buildPasskeyBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "passkey" }

		await c.restoreBackup()

		expect(c.restoreStatus.value).toBe("failed")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Couldn't authenticate", "authenticator unavailable")
		expect(opts.openToast).not.toHaveBeenCalled()
		expect(profileClient.restore).not.toHaveBeenCalled()
	})

	it("missing runCeremony option surfaces an actionable error (defensive — page should always wire it)", async () => {
		const opts = makeOpts({ password: "" }) // no runCeremony
		const c = useFullBackupImport(opts)
		const backup = await buildPasskeyBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "passkey" }

		await c.restoreBackup()

		expect(c.restoreStatus.value).toBe("failed")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Can't import", expect.stringMatching(/ceremony not wired/i))
		expect(profileClient.restore).not.toHaveBeenCalled()
	})
})

describe("resolvePasskeyCredential — how a failed passkey step ends", () => {
	const notAllowed = new DOMException("The operation either timed out or was not allowed.", "NotAllowedError")
	it.each([
		["a cancel", new UserRejectedError("cancelled"), { kind: "silent-reset" }, false],
		["an unconfirmed prompt", notAllowed, { kind: "silent-reset" }, true],
		[
			"a passkey without PRF",
			new PasskeyPrfError("no prf"),
			{ kind: "fail", title: "Couldn't authenticate", message: "This passkey can't unlock Nulo." },
			false,
		],
		[
			"any other failure",
			new Error("authenticator unavailable"),
			{ kind: "fail", title: "Couldn't authenticate", message: "authenticator unavailable" },
			false,
		],
	])("%s", async (_name, err, outcome, toasts) => {
		const openToast = vi.fn()
		const runCeremony = vi.fn().mockRejectedValue(err)

		expect(await resolvePasskeyCredential({ type: "passkey" }, "cred", runCeremony, "PK", openToast)).toEqual(outcome)
		expect(openToast).toHaveBeenCalledTimes(toasts ? 1 : 0)
	})
})

// ── The restored profile's name ─────────────────────────────────────────────

describe("useFullBackupImport — parsedBackupName + the resolved profile name", () => {
	function mockCleanRestore() {
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Restored", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])
	}

	async function namedBackup(name: unknown) {
		return buildBackup({
			data: {
				profile: { id: "src-profile-id", name, type: "password" },
				account: [{ profileId: "src-profile-id", chainId: 1, address: "0xaaaa" }],
				token: [],
			},
		})
	}

	it("parsedBackupName is null until a backup is parsed", () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		expect(c.parsedBackupName.value).toBeNull()
	})

	it("pickBackupFile surfaces the embedded profile name from a plain backup", async () => {
		const file = new File([JSON.stringify(await namedBackup("Vault A"))], "backup.json", { type: "application/json" })
		const opts = makeOpts()
		opts.pickFile.mockResolvedValue(file)
		const c = useFullBackupImport(opts)

		await c.pickBackupFile()

		expect(c.parsedBackupName.value).toBe("Vault A")
		expect(c.selectedBackup.value?.kind).toBe("plain")
		expect(c.selectedBackup.value?.profileType).toBe("password")
	})

	it("restores under the resolver's answer, asked with the backup's sanitized name, without mutating the backup", async () => {
		const opts = makeOpts()
		opts.resolveProfileName.mockResolvedValue("Acme")
		const c = useFullBackupImport(opts)
		const backup = await namedBackup("From‮Backup")
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		mockCleanRestore()

		await c.restoreBackup()

		expect(opts.resolveProfileName).toHaveBeenCalledExactlyOnceWith("FromBackup")
		expect(profileClient.restore.mock.calls[0][0]).toMatchObject({ name: "Acme" })
		expect((backup.data as { profile: { name: string } }).profile.name).toBe("From‮Backup")
	})

	it("a null answer stops quietly before anything is restored; a rejected one fails the import", async () => {
		const opts = makeOpts()
		opts.resolveProfileName.mockResolvedValueOnce(null)
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup: await namedBackup("Named"), kind: "plain", profileType: "password" }
		mockCleanRestore()

		await c.restoreBackup()
		expect(profileClient.restore).not.toHaveBeenCalled()
		expect(c.restoreStatus.value).toBe("")
		expect(opts.fillError).not.toHaveBeenCalled()

		opts.resolveProfileName.mockRejectedValueOnce(new Error("worker gone"))
		await c.restoreBackup()
		expect(profileClient.restore).not.toHaveBeenCalled()
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Import failed", "worker gone")
	})

	it.each([
		["whitespace only", "   "],
		["spaces around a bidi override", "  ‮  "],
		["control characters only", "\u0000\u0007​"],
	])("a %s name never reaches restore raw (plain and encrypted)", async (_label, hostile) => {
		// Plain.
		{
			const opts = makeOpts()
			const c = useFullBackupImport(opts)
			const body = await namedBackup(hostile)
			opts.pickFile.mockResolvedValue(new File([JSON.stringify(body)], "b.json", { type: "application/json" }))
			await c.pickBackupFile()
			expect(c.parsedBackupName.value).toBeNull()
			// A pick clears the new-password fields; fill them as the user would.
			opts.password.value = "pass1234"
			opts.repeatedPassword.value = "pass1234"
			mockCleanRestore()
			await c.restoreBackup()
			expect(opts.resolveProfileName).toHaveBeenCalledExactlyOnceWith(null)
			expect(profileClient.restore.mock.calls[0][0]).toMatchObject({ name: "Main" })
		}
		// Encrypted: the name only exists after decrypt.
		profileClient.restore.mockReset()
		{
			const opts = makeOpts()
			const c = useFullBackupImport(opts)
			const key = await EncryptionKey.fromPasshash(await EncryptionKey.getPasshash("pass1234"))
			const plain = new TextEncoder().encode(JSON.stringify(await namedBackup(hostile)))
			const sealed = btoa(String.fromCharCode(...(await key.encrypt(plain))))
			c.selectedBackup.value = { name: "b.txt", backup: sealed, kind: "sealed", profileType: null }
			c.decryptionPassword.value = "pass1234"
			await c.decryptBackup()
			expect(c.selectedBackup.value?.profileType).toBe("password")
			expect(c.parsedBackupName.value).toBeNull()
			mockCleanRestore()
			await c.restoreBackup()
			expect(opts.resolveProfileName).toHaveBeenCalledExactlyOnceWith(null)
			expect(profileClient.restore.mock.calls[0][0]).toMatchObject({ name: "Main" })
		}
	})

	it("the duplicate-phrase retry restores under the same resolved name, asked once", async () => {
		const opts = {
			...makeOpts(),
			// Confirms the warning: the first run is refused, the retry goes through.
			confirmDuplicate: async <T>(run: () => Promise<T>) => {
				await run().catch(() => undefined)
				return run()
			},
		}
		opts.resolveProfileName.mockResolvedValue("Profile 3")
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup: await namedBackup("Named"), kind: "plain", profileType: "password" }
		mockCleanRestore()
		profileClient.restore.mockRejectedValueOnce(new Error("duplicate phrase"))

		await c.restoreBackup()

		expect(opts.resolveProfileName).toHaveBeenCalledOnce()
		expect(profileClient.restore).toHaveBeenCalledTimes(2)
		expect(profileClient.restore.mock.calls.map((call) => (call[0] as { name: string }).name)).toEqual(["Profile 3", "Profile 3"])
	})
})

describe("restoreStage — phase observability", () => {
	// A synchronous watcher records every transition, so ordering is asserted
	// on the full history rather than on sampled snapshots.
	function recordStages(c: ReturnType<typeof useFullBackupImport>) {
		const seen: string[] = [c.restoreStage.value]
		watch(
			c.restoreStage,
			(v) => {
				seen.push(v)
			},
			{ flush: "sync" },
		)
		return seen
	}

	it("advances through the stages in order on a clean import, never backward", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])
		const seen = recordStages(c)

		await c.restoreBackup()

		const order = [
			"",
			"restoring:profile",
			"restoring:networks",
			"restoring:tokens",
			"restoring:services",
			"finalizing",
			"restoring:account-state",
			"finished",
		]
		// The chain-sync stage only appears when the backup carries an
		// account-state slice; assert the observed history is an ordered
		// subsequence-superset of the required order.
		const required = seen.filter((v) => order.includes(v))
		expect(required).toEqual(order)
		expect(c.restoreStage.value).toBe("finished")
	})

	it("a pre-finalize service failure lands rolled-back and deleteProfile was called", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		// The token restore rejecting is a pre-finalize failure that reaches the
		// outer catch (unlike per-service loop errors, which are recorded).
		tokenClient.restore.mockRejectedValue(new Error("boom mid-restore"))
		const seen = recordStages(c)

		await c.restoreBackup()

		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(seen).toContain("rolling-back")
		expect(c.restoreStage.value).toBe("rolled-back")
		expect(profileClient.finalizeRestore).not.toHaveBeenCalled()
	})

	it("a post-finalize failure never enters rolling-back and keeps the profile", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		// The slice must EXIST (and its networkId must survive the remap) for
		// the account-state leg to run at all — without it the rejection mock
		// is never invoked and every assert passes vacuously.
		const backup = await buildBackup({
			data: {
				"account-state": [{ networkId: "N1", chainId: 1, contracts: [], senders: [AS_SENDER] }],
			},
		})
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "M1", name: "A", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])
		// Post-finalize failures are RETAIN + record, never rollback: the
		// chain-sync runner contractually converts this rejection into recorded
		// skip errors (importChainSync's own catch) — the outer catch is
		// UNREACHABLE from this boundary by design, which is exactly the
		// contract this pin holds.
		accountStateClient.restore.mockRejectedValue(new Error("post-finalize boom"))
		const seen = recordStages(c)

		await c.restoreBackup()

		expect(accountStateClient.restore).toHaveBeenCalled()
		expect(profileClient.finalizeRestore).toHaveBeenCalled()
		expect(profileClient.deleteProfile).not.toHaveBeenCalled()
		expect(seen).not.toContain("rolling-back")
		expect(c.restoreStage.value).toBe("finished")
	})

	it("deleteProfile rejecting EVERY bounded attempt lands rollback-failed", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		tokenClient.restore.mockRejectedValue(new Error("boom mid-restore"))
		profileClient.deleteProfile.mockRejectedValue(new Error("delete refused"))

		await c.restoreBackup()

		expect(c.restoreStage.value).toBe("rollback-failed")
		// Integration: the stage wraps the SHARED bounded rollback helper —
		// all attempts ran before the failure was declared.
		expect(profileClient.deleteProfile).toHaveBeenCalledTimes(3)
	})
})

describe("crash-rollback liveness gate", () => {
	// The MV3 respawn gap: a disconnect-classified pre-finalize failure means
	// the worker died mid-restore — the rollback must wait for the NEW
	// worker's liveness signal before the bounded delete helper runs, or every
	// attempt burns into doomed ports in milliseconds (see
	// implementations-plan/archive/e2e-deflake/plan.md, Respawn gap).
	function primeHappyRestore() {
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])
	}

	it("a disconnect-classified failure awaits the liveness advance, THEN rolls back", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		primeHappyRestore()
		tokenClient.restore.mockRejectedValue(new Error("Client disconnected"))

		await c.restoreBackup()

		expect(readLiveness).toHaveBeenCalledTimes(1)
		expect(awaitLivenessAdvance).toHaveBeenCalledTimes(1)
		expect(awaitLivenessAdvance).toHaveBeenCalledWith(100, 60_000)
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		// Ordering: the gate resolves BEFORE the first delete attempt.
		expect(vi.mocked(awaitLivenessAdvance).mock.invocationCallOrder[0]).toBeLessThan(
			profileClient.deleteProfile.mock.invocationCallOrder[0],
		)
		expect(c.restoreStage.value).toBe("rolled-back")
	})

	it("an RpcDisconnectedError send-failure shape is gated too", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		primeHappyRestore()
		tokenClient.restore.mockRejectedValue(new RpcDisconnectedError("RPC 'restore' aborted: port disconnected", {}))

		await c.restoreBackup()

		expect(awaitLivenessAdvance).toHaveBeenCalledTimes(1)
		expect(c.restoreStage.value).toBe("rolled-back")
	})

	it("a NON-disconnect failure rolls back immediately — no liveness wait", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		primeHappyRestore()
		tokenClient.restore.mockRejectedValue(new Error("boom mid-restore"))

		await c.restoreBackup()

		expect(awaitLivenessAdvance).not.toHaveBeenCalled()
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(c.restoreStage.value).toBe("rolled-back")
	})

	it("a rejected baseline READ also fails closed — zero deletes, rollback-failed", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		primeHappyRestore()
		tokenClient.restore.mockRejectedValue(new Error("Client disconnected"))
		vi.mocked(readLiveness).mockRejectedValueOnce(new Error("session storage unavailable"))

		await c.restoreBackup()

		// The rejection must NOT escape the catch (stage stuck at rolling-back,
		// status stuck at progress was the failure mode) — same fail-closed
		// path as a ceiling expiry.
		expect(awaitLivenessAdvance).not.toHaveBeenCalled()
		expect(profileClient.deleteProfile).not.toHaveBeenCalled()
		expect(c.restoreStage.value).toBe("rollback-failed")
		expect(c.restoreStatus.value).toBe("failed")
	})

	it("a liveness ceiling expiry SKIPS the delete helper and fails closed to rollback-failed", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		primeHappyRestore()
		tokenClient.restore.mockRejectedValue(new Error("Client disconnected"))
		vi.mocked(awaitLivenessAdvance).mockRejectedValueOnce(new Error("liveness never advanced past 100"))

		await c.restoreBackup()

		// Fail-closed: NO delete attempts against a worker that never proved
		// itself; the torn-marker backstop stays authoritative.
		expect(profileClient.deleteProfile).not.toHaveBeenCalled()
		expect(c.restoreStage.value).toBe("rollback-failed")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Import incomplete", expect.stringContaining("Delete it in Settings"))
	})
})

describe("useFullBackupImport — a legacy password backup's imported-keys key", () => {
	it("reaches the profile restore unchanged, so a backup carrying the profile's long-lived DEK still restores its keys", async () => {
		const backup = await buildBackup()
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		opts.pickFile.mockResolvedValue(new File([JSON.stringify(backup)], "b.json", { type: "application/json" }))
		await c.pickBackupFile()
		opts.password.value = "pass1234"
		opts.repeatedPassword.value = "pass1234"
		profileClient.restore.mockResolvedValue({ id: "new-id", name: "Restored", type: "password" })
		networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
		accountClient.restore.mockResolvedValue([{ address: "0xaaaa" }])

		await c.restoreBackup()

		expect(profileClient.restore.mock.calls[0][1]).toEqual({
			type: "password",
			masterKey: backup["master-key"],
			entropy: backup.entropy,
			importedKeysDek: backup["imported-keys-dek"],
		})
	})
})

describe("useFullBackupImport — decryptBackup accepts the padding the detector accepted", () => {
	it("decrypts a protected file whose base64 is wrapped in non-breaking spaces", async () => {
		const key = await EncryptionKey.fromPasshash(await EncryptionKey.getPasshash("pass1234"))
		const plain = new TextEncoder().encode(JSON.stringify({ data: { profile: { type: "password", name: "Padded" } } }))
		const sealed = btoa(String.fromCharCode(...(await key.encrypt(plain))))
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "padded.txt", backup: `\u00a0\u00a0${sealed}\n\u00a0`, kind: "sealed", profileType: null }
		c.decryptionPassword.value = "pass1234"

		await c.decryptBackup()

		expect(c.selectedBackup.value?.profileType).toBe("password")
		expect(c.parsedBackupName.value).toBe("Padded")
		expect(opts.fillError).not.toHaveBeenCalled()
	})
})

describe("useFullBackupImport — decryptBackup stale-selection fence", () => {
	it("a decrypt that succeeds after a re-pick publishes nothing and leaves the new state alone", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const sealed = await sealFullBackupText(JSON.stringify({ data: { profile: { type: "password", name: "Old" } } }), "pass1234")
		c.selectedBackup.value = { name: "old.txt", backup: sealed, kind: "sealed", profileType: null }
		c.decryptionPassword.value = "pass1234"

		// Hold the KDF open so the selection can change mid-flight (the too-large re-pick path
		// clears it to null), then let it finish with the real passhash so the decrypt succeeds.
		const realPasshash = EncryptionKey.getPasshash.bind(EncryptionKey)
		let releaseKdf!: () => void
		const kdfGate = new Promise<void>((res) => {
			releaseKdf = res
		})
		const passhashSpy = vi.spyOn(EncryptionKey, "getPasshash").mockImplementation(async (password) => {
			await kdfGate
			return realPasshash(password)
		})
		const decrypt = vi.spyOn(EncryptionKey.prototype, "decrypt")

		const run = c.decryptBackup()
		c.selectedBackup.value = null
		releaseKdf()
		await run

		await expect(decrypt.mock.results[0]?.value).resolves.toBeInstanceOf(Uint8Array)
		// The superseded run must neither resurrect a selection husk nor touch
		// the error channel (the re-pick's own error must survive).
		expect(c.selectedBackup.value).toBeNull()
		expect(c.parsedBackupName.value).toBeNull()
		expect(opts.clearError).not.toHaveBeenCalled()
		expect(opts.fillError).not.toHaveBeenCalled()
		passhashSpy.mockRestore()
		decrypt.mockRestore()
	})
})

describe("useFullBackupImport — a second Decrypt on an opened backup", () => {
	async function pickSealed(c: ReturnType<typeof useFullBackupImport>, opts: ReturnType<typeof makeOpts>, text: string) {
		opts.pickFile.mockResolvedValue(new File([text], "sealed.txt", { type: "text/plain" }))
		await c.pickBackupFile()
		c.decryptionPassword.value = "pass1234"
	}

	it("(BUG PIN) a decrypted body with no profile type keeps Decrypt offered, and a second Decrypt fails", async () => {
		// The opened body is no longer text, so the second Decrypt throws before any key derivation.
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		await pickSealed(c, opts, await sealFullBackupText(JSON.stringify({ data: {} }), "pass1234"))

		await c.decryptBackup()
		expect(opts.fillError).not.toHaveBeenCalled()
		expect(c.selectedBackup.value?.profileType).toBeNull()
		expect(showsDecryptCta({ selectedBackup: c.selectedBackup.value })).toBe(true)

		await c.decryptBackup()
		expect(opts.fillError).toHaveBeenCalledExactlyOnceWith("full_backup", DECRYPTION_FAILED.title, DECRYPTION_FAILED.message)
		expect(showsDecryptCta({ selectedBackup: c.selectedBackup.value })).toBe(true)
	})

	it("(BUG PIN) a file sealed twice opens its inner backup on the second Decrypt", async () => {
		const inner = await sealFullBackupText(JSON.stringify({ data: { profile: { type: "password", name: "Inner" } } }), "pass1234")
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		await pickSealed(c, opts, await sealFullBackupText(JSON.stringify(inner), "pass1234"))

		await c.decryptBackup()
		expect(c.selectedBackup.value?.profileType).toBeNull()
		expect(showsDecryptCta({ selectedBackup: c.selectedBackup.value })).toBe(true)

		await c.decryptBackup()
		expect(opts.fillError).not.toHaveBeenCalled()
		expect(c.selectedBackup.value?.profileType).toBe("password")
		expect(c.parsedBackupName.value).toBe("Inner")
		expect(showsDecryptCta({ selectedBackup: c.selectedBackup.value })).toBe(false)
	})
})
