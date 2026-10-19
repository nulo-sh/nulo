/**
 * The scaffold the full-backup-import suites drive `useFullBackupImport` over: one shared spy
 * instance per backup-service client, the restore-outcome reminder, the background-liveness probe,
 * the spec and migration modules, and the backup and options builders. Test-only.
 *
 * A suite mocks each module in one line, with a literal specifier (a top-level constant is still
 * in its temporal dead zone when the hoisted factory runs):
 *
 * ```ts
 * vi.mock("@/wallet/services/profile/client", async () => (await import("./useFullBackupImport.harness")).profileClientModule)
 * ```
 *
 * A spec module's factory hands this file its `importOriginal`, so every storage root is the real
 * constant. A factory is what first loads this file, so it imports no module a suite mocks: that
 * import would wait on the factory loading it. `resetBackupImportHarness` runs in `beforeEach`.
 */
import { setActivePinia } from "pinia"
import { createTestingPinia } from "@pinia/testing"
import { ref } from "vue"
import { vi } from "vitest"
import { EncryptionKey } from "@nulo/wallet-crypto"

type ImportOriginal = <T>() => Promise<T>

export const profileClient = {
	restore: vi.fn(),
	finalizeRestore: vi.fn(),
	assertRunFence: vi.fn(),
	deleteProfile: vi.fn(),
	disconnect: vi.fn(),
}
/** The fence `finalizeRestore` hands back for the created profile. */
export const FENCE = { profileId: "new-id", epoch: 0, session: 1, incarnation: "w1" }
export const reminder = {
	arm: vi.fn(async (..._args: unknown[]): Promise<string | undefined> => "run-1"),
	admit: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})),
	finish: vi.fn(async (..._args: unknown[]) => undefined),
}
export const networkClient = {
	seedDefaultsForProfile: vi.fn(),
	setActiveForProfile: vi.fn(),
	probeNodeStatus: vi.fn(),
	disconnect: vi.fn(),
}
export const accountClient = {
	restore: vi.fn(),
	restoreImportedKeys: vi.fn(async () => []),
	reconcileImportedAccounts: vi.fn(async () => []),
	disconnect: vi.fn(),
}
export const tokenClient = {
	restore: vi.fn(),
	refreshRestoredTokens: vi.fn(),
	disconnect: vi.fn(),
}
/** Registrable child for account-state fixtures: since the bounded
 *  chain-registration tail landed, zero-work items dial nothing and never
 *  reach the restore call — remap observability needs at least one child. */
export const AS_SENDER = { address: `0x${"ab".repeat(32)}` }

function passthroughClient() {
	return { restore: vi.fn(async (): Promise<unknown[]> => []), disconnect: vi.fn() }
}
// Rebound, not reset in place, by `resetBackupImportHarness`: a client an earlier test constructed
// keeps that test's spies, so its late work never lands on the next test's.
export let transactionClient = passthroughClient()
export let tokenBalanceClient = passthroughClient()
export let accountStateClient = passthroughClient()
export let authRegistryClient = passthroughClient()
export let contactClient = passthroughClient()
export let configClient = passthroughClient()

/** A mocked client class: `new` returns whatever `current` names at construction. */
function clientClass(current: () => object) {
	// Vitest 4 constructs the implementation with `new`, which an arrow cannot be.
	function Client() {
		return current()
	}
	return vi.fn(Client)
}

export const profileClientModule = { ProfileServiceClient: clientClass(() => profileClient) }
export const networkClientModule = { NetworkServiceClient: clientClass(() => networkClient) }
export const accountClientModule = { AccountServiceClient: clientClass(() => accountClient) }
export const tokenClientModule = { TokenServiceClient: clientClass(() => tokenClient) }
export const transactionClientModule = { TransactionServiceClient: clientClass(() => transactionClient) }
export const tokenBalanceClientModule = { TokenBalanceServiceClient: clientClass(() => tokenBalanceClient) }
export const accountStateClientModule = { AccountStateServiceClient: clientClass(() => accountStateClient) }
export const authRegistryClientModule = { AuthRegistryServiceClient: clientClass(() => authRegistryClient) }
export const contactClientModule = { ContactServiceClient: clientClass(() => contactClient) }
export const configClientModule = { ConfigServiceClient: clientClass(() => configClient) }

export const restoreOutcomeModule = {
	armRestoreOutcome: reminder.arm,
	admitRestoreOutcome: reminder.admit,
	finishRestoreOutcome: reminder.finish,
}

export const livenessModule = {
	readLiveness: vi.fn(async () => 100),
	awaitLivenessAdvance: vi.fn(async () => 101),
}

// Each spec module is mocked down to the names the composable's graph reads. Its storage roots are
// the real constants, read through the factory's `importOriginal`: the backup-migration registry
// files every slice under them, so a root renamed in its spec moves this scaffold with it.

export async function accountSpecModule(importOriginal: ImportOriginal) {
	const real = await importOriginal<typeof import("@/wallet/services/account/spec")>()
	return {
		ACCOUNT_SERVICE_NAME: "account",
		ACCOUNT_STORAGE_ROOT: real.ACCOUNT_STORAGE_ROOT,
		IMPORTED_KEYS_SERVICE_NAME: "imported-account-keys",
		IMPORTED_KEYS_STORAGE_ROOT: real.IMPORTED_KEYS_STORAGE_ROOT,
		accountRowId: (profileId: string, chainId: number, address: string) => JSON.stringify(["account", profileId, chainId, address]),
		accountScopeKey: (chainId: number, address: string) => `${chainId}:${address}`,
		DEFAULT_IMPORTED_ACCOUNT_NAME: "Imported account",
	}
}

export const accountStateSpecModule = { ACCOUNT_STATE_SERVICE_NAME: "account-state" }

export async function authRegistrySpecModule(importOriginal: ImportOriginal) {
	const real = await importOriginal<typeof import("@/wallet/services/auth-registry/spec")>()
	return {
		AUTH_REGISTRY_SERVICE_NAME: "auth-registry",
		AUTH_REGISTRY_STORAGE_ROOT: real.AUTH_REGISTRY_STORAGE_ROOT,
		AUTH_REGISTRY_ENABLED_STORAGE_ROOT: real.AUTH_REGISTRY_ENABLED_STORAGE_ROOT,
	}
}

export const configSpecModule = { CONFIG_SERVICE_NAME: "config" }

export async function contactSpecModule(importOriginal: ImportOriginal) {
	const real = await importOriginal<typeof import("@/wallet/services/contact/spec")>()
	return { CONTACT_SERVICE_NAME: "contact", CONTACT_STORAGE_ROOT: real.CONTACT_STORAGE_ROOT }
}

const NODE_STATUS = { Active: 0, Inactive: 1, InvalidChain: 2 }

export async function networkSpecModule(importOriginal: ImportOriginal) {
	const real = await importOriginal<typeof import("@/wallet/services/network/spec")>()
	return { NETWORK_SERVICE_NAME: "network", NETWORK_STORAGE_ROOT: real.NETWORK_STORAGE_ROOT, NodeStatus: NODE_STATUS }
}

export async function tokenBalanceSpecModule(importOriginal: ImportOriginal) {
	const real = await importOriginal<typeof import("@/wallet/services/token-balance/spec")>()
	return { TOKEN_BALANCE_SERVICE_NAME: "token-balance", TOKEN_BALANCE_STORAGE_ROOT: real.TOKEN_BALANCE_STORAGE_ROOT }
}

export async function tokenSpecModule(importOriginal: ImportOriginal) {
	const real = await importOriginal<typeof import("@/wallet/services/token/spec")>()
	return { TOKEN_SERVICE_NAME: "token", TOKEN_STORAGE_ROOT: real.TOKEN_STORAGE_ROOT }
}

export async function transactionSpecModule(importOriginal: ImportOriginal) {
	const real = await importOriginal<typeof import("@/wallet/services/transaction/spec")>()
	return { TRANSACTION_SERVICE_NAME: "transaction", TRANSACTION_STORAGE_ROOT: real.TRANSACTION_STORAGE_ROOT }
}

/**
 * A REAL pending backup-safe migration (v2, contact legacyName → name), so a suite exercises the
 * full migrate-then-restore path: `buildBackup` stamps `backup-schema-version: 1`, so every
 * restore migrates 1 → 2 before any service restore runs.
 */
export async function migrationsModule() {
	const { defineRowMapMigration } = await vi.importActual<typeof import("@/wallet/services/backup/row-map-migration")>(
		"@/wallet/services/backup/row-map-migration",
	)
	const { CONTACT_STORAGE_ROOT } =
		await vi.importActual<typeof import("@/wallet/services/contact/spec")>("@/wallet/services/contact/spec")
	const v2 = defineRowMapMigration({
		version: 2,
		description: "test: rename contact legacyName to name",
		rowMaps: { [CONTACT_STORAGE_ROOT]: { rename: { legacyName: "name" } } },
	})
	return { BASELINE_VERSION: 1, realMigrations: [], migrations: [], backupMigrations: [v2] }
}

/** Build a backup payload + matching checksum so the integrity guard passes.
 *  `overrides.data` MERGES over the default slices (it must not clobber them:
 *  the mocked v2 migration reads contacts, so the default `contact: []` has to
 *  survive every override). */
export async function buildBackup(overrides: Record<string, unknown> = {}) {
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

export interface MakeOpts {
	password?: string
	repeatedPassword?: string
}
export function makeOpts(o: MakeOpts = {}) {
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

export function resetBackupImportHarness(): void {
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
	networkClient.probeNodeStatus.mockReset().mockResolvedValue(NODE_STATUS.Active)
	networkClient.disconnect.mockReset()
	accountClient.restore.mockReset()
	accountClient.reconcileImportedAccounts.mockReset().mockResolvedValue([])
	accountClient.restoreImportedKeys.mockReset().mockResolvedValue([])
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
}
