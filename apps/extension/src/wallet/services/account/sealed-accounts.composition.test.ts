/**
 * Composition test: the REAL ProfileService (real PBKDF2, HKDF and AES-GCM), AccountService,
 * AccountIntegrityCoordinator and ProfileDeletionCoordinator over one `FakeBrowserApi`, with stubs
 * for the services that hold no account row and a dumb PXE client. The coordinator's derivation is
 * injected (bb.js does not run here): it answers each row's index with the address seeded for it,
 * and records what it was asked, which is what the pre-open check read. A second boot over the same
 * storage stands for a restarted worker: strict mode keeps no session across it, so it holds no row
 * keys until an unlock. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { afterAll, describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ServiceCollection } from "@/wallet/base"
import type { ConfigProp, IConfig } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { AccountIntegrityCoordinator } from "@/wallet/services/account-integrity/coordinator"
import { AUTH_REGISTRY_SERVICE_NAME } from "@/wallet/services/auth-registry/spec"
import { svc } from "@/wallet/services/composition-harness"
import { CONTACT_SERVICE_NAME } from "@/wallet/services/contact/spec"
import { DAPP_SESSION_SERVICE_NAME } from "@/wallet/services/dapp-session/spec"
import { FPC_SERVICE_NAME } from "@/wallet/services/fpc/spec"
import { INCOMING_TRANSFER_SERVICE_NAME } from "@/wallet/services/incoming-transfer/spec"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { OPERATION_JOURNAL_SERVICE_NAME } from "@/wallet/services/operation-journal/spec"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { ProfileDeletionCoordinator } from "@/wallet/services/profile-deletion/coordinator"
import { ProfileService } from "@/wallet/services/profile/service"
import { PROFILE_TOMBSTONE_ROOT } from "@/wallet/services/profile/tombstone-repository"
import { TOKEN_BALANCE_SERVICE_NAME } from "@/wallet/services/token-balance/spec"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import { isSealedText } from "@/wallet/storage/sealed-entity-storage"
import { storedText, trackSubtleCrypto } from "@/wallet/storage/sealed-entity-storage.testing"
import { ImportedKeysRepository } from "./imported-keys-repository"
import { AccountService } from "./service"
import { type Account, AccountType, accountRowId } from "./spec"

vi.mock("@/wallet/services/pxe/client", () => ({
	PxeServiceClient: vi.fn(function () {
		return { clearProfileState: async () => {} }
	}),
}))

const PW = "pass1234"
const CHAIN = 0
const L1 = 31337
/** The address each index derives to, and the imported address two profiles share. */
const ADDR = [`0x${"a1".repeat(32)}`, `0x${"b2".repeat(32)}`]
const SHARED = `0x${"c3".repeat(32)}`
const ORPHAN = `0x${"d4".repeat(32)}`
const ACCOUNTS = "nulo:core:accounts@"
const KEYS = "nulo:core:imported-account-keys@"

function fakeConfig(): IConfig {
	const values: Record<string, unknown> = { sessionTtl: 1_800_000, strictSecurityMode: true, debugMode: false }
	return { onUpdate: new EventHandler<ConfigProp>(), get: ((key: string) => values[key]) as IConfig["get"] }
}

/** Waits out WebCrypto in flight: a worker's unlock-time pass runs after its unlock resolves. */
const crypto = trackSubtleCrypto()
afterAll(() => crypto.restore())

const noop = async () => {}
const none = async () => []

/** One worker over `api`: accounts, the pre-open check and the deletion they take part in. */
async function boot(api: FakeBrowserApi) {
	const config = fakeConfig()
	const logger = new LoggerStore(config)
	const services = new ServiceCollection()
	services.add(svc(PASSKEY_SERVICE_NAME, {}))
	const profiles = new ProfileService(config, logger, api)
	services.add(profiles)
	services.add(
		svc(NETWORK_SERVICE_NAME, {
			registerChainPurgeSubscriber: () => {},
			isChainLive: async () => true,
			isChainQuarantined: async () => false,
			getNetworksRaw: none,
			getL1ChainIdStored: async () => L1,
			purgeForProfile: noop,
		}),
	)
	const accounts = new AccountService(logger, api)
	services.add(accounts)
	services.add(svc(TOKEN_SERVICE_NAME, { getTokensRaw: none, rawTokenIdsForProfile: none, purgeForProfile: noop }))
	services.add(svc(TRANSACTION_SERVICE_NAME, { purgeForAccounts: noop }))
	services.add(svc(AUTH_REGISTRY_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(TOKEN_BALANCE_SERVICE_NAME, { purgeForTokens: noop }))
	services.add(svc(INCOMING_TRANSFER_SERVICE_NAME, { clearProfile: noop }))
	services.add(svc(CONTACT_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(DAPP_SESSION_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(FPC_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(OPERATION_JOURNAL_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(new ProfileDeletionCoordinator(logger, api.storage.local))
	const derived: number[] = []
	const integrity = new AccountIntegrityCoordinator(logger, api, async (_master, account) => {
		derived.push(account.index)
		return ADDR[account.index] ?? "0xunknown"
	})
	services.add(integrity)
	await services.start()
	await integrity.bootVerification
	const keyRows = new ImportedKeysRepository(api.storage.local, (id) => profiles.rowKeys(id))
	return { profiles, accounts, derived, keyRows }
}

function freshApi(): FakeBrowserApi {
	const api = new FakeBrowserApi()
	api.reset()
	return api
}

const account = (profileId: string, index: number, over: Partial<Account> = {}): Account => ({
	profileId,
	chainId: CHAIN,
	address: ADDR[index]!,
	index,
	type: AccountType.Nulo_v1,
	l1ChainId: L1,
	name: `Account ${index + 1}`,
	visible: true,
	...over,
})
const imported = (profileId: string, address: string): Account =>
	account(profileId, 0, { address, type: AccountType.Imported, name: "Imported" })
const keyRow = (profileId: string, address: string) => ({ profileId, chainId: CHAIN, address, encryptedSigningKey: "sealed-key" })

/** Writes rows as a build that did not seal them stored them: plaintext at their natural id. The
 *  creating worker's own unlock-time pass must have finished first, or it would seal them. */
async function plaintext(api: FakeBrowserApi, rows: { accounts?: Account[]; keys?: ReturnType<typeof keyRow>[] }) {
	await crypto.settled()
	const items: Record<string, string> = {}
	for (const row of rows.accounts ?? []) items[ACCOUNTS + accountRowId(row.profileId, row.chainId, row.address)] = JSON.stringify(row)
	for (const row of rows.keys ?? []) items[KEYS + accountRowId(row.profileId, row.chainId, row.address)] = JSON.stringify(row)
	await api.storage.local.set(items)
	await crypto.settled()
	const now = await api.storage.local.get(Object.keys(items))
	if (Object.keys(items).some((k) => now[k] !== items[k])) throw new Error("a pass still running sealed the seeds")
}

async function stored(api: FakeBrowserApi, prefix: string): Promise<Record<string, string>> {
	return Object.fromEntries(Object.entries(await api.storage.local.get()).filter(([k]) => k.startsWith(prefix))) as Record<string, string>
}
const allSealed = async (api: FakeBrowserApi, prefix: string) => Object.values(await stored(api, prefix)).every(isSealedText)

describe("sealed accounts — the real service graph", () => {
	test("the pre-open check verifies a sealed profile; a row moved to another key is hidden and kept, as a corrupt row is", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		await first.accounts.restore([account(p.id, 0), account(p.id, 1)])
		expect(JSON.stringify(await api.storage.local.get())).not.toMatch(/a1a1a1|b2b2b2/)

		const second = await boot(api)
		await second.profiles.unlockProfile(p.id, PW)
		expect(second.derived.sort()).toEqual([0, 1])

		const rows = await stored(api, ACCOUNTS)
		const keyOf = async (address: string) => {
			for (const [k, v] of Object.entries(rows))
				if ((await storedText(k, v, (id) => second.profiles.rowKeys(id)))?.includes(address)) return k
			throw new Error(`no row holds ${address}`)
		}
		const [keyA, keyB] = [await keyOf(ADDR[0]!), await keyOf(ADDR[1]!)]
		await api.storage.local.set({ [keyB]: rows[keyA]! })
		const warn = vi.spyOn(console, "warn")

		const third = await boot(api)
		await third.profiles.unlockProfile(p.id, PW)
		expect(third.derived).toEqual([0])
		expect((await third.accounts.getAccounts(p.id, CHAIN, true)).map((a) => a.address)).toEqual([ADDR[0]])
		expect((await api.storage.local.get(keyB))[keyB]).toBe(rows[keyA])
		expect(warn.mock.calls.some(([line]) => String(line).includes("sealed-authentication — KEEPING"))).toBe(true)
		warn.mockRestore()
	}, 60_000)

	test("the password change's pre-open check reads the sealed accounts", async () => {
		const api = freshApi()
		const worker = await boot(api)
		const p = await worker.profiles.createProfile("P", PW)
		await worker.accounts.restore([account(p.id, 0), account(p.id, 1)])
		worker.derived.length = 0
		await worker.profiles.changeProfilePassword(p.id, PW, "pass5678")
		expect(new Set(worker.derived)).toEqual(new Set([0, 1]))
	}, 60_000)

	test("recovery mode lists the sealed accounts", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		await first.accounts.restore([account(p.id, 0), account(p.id, 1)])
		const profileKey = `nulo:core:profiles@${p.id}`
		const healthy = (await api.storage.local.get(profileKey))[profileKey] as string
		await api.storage.local.set({ [profileKey]: JSON.stringify({ ...JSON.parse(healthy), dekSealed: "AAAAAAAAAAAAAAAAAAAAAAAAAAAA" }) })

		const degraded = await boot(api)
		await degraded.profiles.unlockProfile(p.id, PW)
		expect(degraded.profiles.isRecoveryMode(p.id)).toBe(true)
		expect((await degraded.accounts.getAccounts(p.id, CHAIN)).map((a) => a.address)).toEqual(ADDR)
	}, 60_000)

	test("an unlock seals its profile's account pairs, and its orphan sweep keeps another profile's pair at the same address", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		const q = await first.profiles.createProfile("Q", PW)
		await plaintext(api, {
			accounts: [imported(p.id, SHARED), imported(q.id, SHARED)],
			keys: [keyRow(p.id, SHARED), keyRow(q.id, SHARED), keyRow(p.id, ORPHAN)],
		})
		const qRows = Object.entries(await stored(api, "nulo:core:")).filter(([k]) => k.includes(`"${q.id}"`))

		const second = await boot(api)
		await second.profiles.unlockProfile(p.id, PW)
		await vi.waitFor(async () => expect(await second.keyRows.get(p.id, CHAIN, ORPHAN)).toBeUndefined())
		expect(await second.keyRows.get(p.id, CHAIN, SHARED)).toEqual(keyRow(p.id, SHARED))
		expect(await second.accounts.getAccount(p.id, CHAIN, SHARED)).toEqual(imported(p.id, SHARED))
		expect(Object.entries(await stored(api, "nulo:core:")).filter(([k]) => k.includes(`"${q.id}"`))).toEqual(qRows)
		expect(JSON.stringify(await stored(api, "nulo:core:"))).not.toContain(`"${p.id}",${CHAIN},"${SHARED}"`)

		await second.profiles.unlockProfile(q.id, PW)
		await vi.waitFor(async () => expect(await allSealed(api, KEYS)).toBe(true))
		expect(await second.keyRows.get(q.id, CHAIN, SHARED)).toEqual(keyRow(q.id, SHARED))
		expect(await second.keyRows.get(p.id, CHAIN, SHARED)).toEqual(keyRow(p.id, SHARED))
	}, 60_000)

	test("a crash between sealing an account pair and removing its plaintext leaves both, deletes no key, and the next unlock finishes", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		await plaintext(api, { accounts: [imported(p.id, SHARED)], keys: [keyRow(p.id, SHARED)] })
		const legacyPair = [ACCOUNTS + accountRowId(p.id, CHAIN, SHARED), KEYS + accountRowId(p.id, CHAIN, SHARED)]

		const crashing = await boot(api)
		const area = api.storage.local
		const realRemove = area.remove.bind(area)
		let removals: unknown
		area.remove = async (keys) => {
			if (Array.isArray(keys) && legacyPair.every((k) => keys.includes(k))) {
				removals = keys
				throw new Error("worker ended")
			}
			return realRemove(keys)
		}
		await crashing.profiles.unlockProfile(p.id, PW)
		await vi.waitFor(() => expect(removals).toEqual(legacyPair))
		area.remove = realRemove
		const split = await stored(api, "nulo:core:")
		expect(Object.keys(split).filter((k) => k.startsWith(ACCOUNTS))).toHaveLength(2)
		expect(Object.keys(split).filter((k) => k.startsWith(KEYS))).toHaveLength(2)

		const restarted = await boot(api)
		expect(await stored(api, "nulo:core:")).toEqual(split)
		await restarted.profiles.unlockProfile(p.id, PW)
		await vi.waitFor(async () => expect(Object.keys(await stored(api, KEYS))).toHaveLength(1))
		expect(await allSealed(api, ACCOUNTS)).toBe(true)
		expect(await allSealed(api, KEYS)).toBe(true)
		expect(await restarted.keyRows.get(p.id, CHAIN, SHARED)).toEqual(keyRow(p.id, SHARED))
		expect(await restarted.accounts.getAccount(p.id, CHAIN, SHARED)).toEqual(imported(p.id, SHARED))
	}, 60_000)

	test("a tombstone a build before sealing wrote still purges its rows, plaintext or sealed, in a worker with no keys", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		await first.accounts.restore([account(p.id, 1)])
		await plaintext(api, { accounts: [imported(p.id, SHARED), account(p.id, 0)], keys: [keyRow(p.id, SHARED)] })
		const q = await first.profiles.createProfile("Q", PW)
		await first.accounts.restore([account(q.id, 0)])
		const profileKey = `nulo:core:profiles@${p.id}`
		const { pxeGeneration } = JSON.parse((await api.storage.local.get(profileKey))[profileKey] as string)
		await api.storage.local.set({
			[`${PROFILE_TOMBSTONE_ROOT}@${p.id}`]: JSON.stringify({
				profileId: p.id,
				addresses: [ADDR[0], SHARED],
				tokenIds: [],
				networkIds: [],
				epoch: 0,
				pxeGeneration,
			}),
		})

		const restarted = await boot(api)
		expect(restarted.profiles.rowKeys(p.id)).toBeUndefined()
		await restarted.profiles.resumePendingDeletions()
		const left = await stored(api, "nulo:core:")
		expect(Object.keys(left).filter((k) => k.includes(`"${p.id}"`) || k.endsWith(`@${p.id}`))).toEqual([])
		expect(Object.keys(left).filter((k) => k.startsWith(ACCOUNTS))).toHaveLength(1)
		await restarted.profiles.unlockProfile(q.id, PW)
		expect((await restarted.accounts.getAccounts(q.id, CHAIN)).map((a) => a.address)).toEqual([ADDR[0]])
	}, 60_000)
})
