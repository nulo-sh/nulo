/**
 * Composition test: the REAL ProfileService (real PBKDF2, HKDF and AES-GCM), AccountService,
 * TransactionService and ProfileDeletionCoordinator over one `FakeBrowserApi`, with a dumb node per
 * endpoint and stubs for the services the deletion drives that hold no transaction. A second boot
 * over the same storage stands for a restarted worker: strict mode keeps no session across it, so
 * it holds no row keys until an unlock. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { openRow } from "@nulo/wallet-crypto"
import { ServiceCollection } from "@/wallet/base"
import type { ConfigProp, IConfig } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { AccountService } from "@/wallet/services/account/service"
import { accountRowId } from "@/wallet/services/account/spec"
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
import { TOKEN_BALANCE_SERVICE_NAME } from "@/wallet/services/token-balance/spec"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { parseEnvelope } from "@/wallet/storage/sealed-entity-storage"
import { TRANSACTION_STORAGE_ROOT, TransactionService, TxStatus, type Tx } from "./service"

vi.mock("@/wallet/services/pxe/client", () => ({
	PxeServiceClient: vi.fn(function () {
		return { clearProfileState: async () => {} }
	}),
}))

const PW = "pass1234"
const CHAIN = 31337
const ADDR = `0x${"ab".repeat(32)}`
const HASH = `0x${"11".repeat(32)}`
const OTHER_HASH = `0x${"22".repeat(32)}`
const NODE_P = "https://p.node.example"
const NODE_Q = "https://q.node.example"

const pendingReceipt = () => ({ status: "pending" })
const minedReceipt = () => ({ status: "proposed", executionResult: "success" })

function fakeConfig(): IConfig {
	const values: Record<string, unknown> = { sessionTtl: 1_800_000, strictSecurityMode: true, debugMode: false }
	return { onUpdate: new EventHandler<ConfigProp>(), get: ((key: string) => values[key]) as IConfig["get"] }
}

const noop = async () => {}
const none = async () => []

/** The receipt reads each endpoint answers, by hash, and the hashes it was asked about. */
function nodes() {
	const answers = new Map<string, () => unknown>()
	const asked: Array<{ url: string; hash: string }> = []
	const node = (url: string) => ({
		getTxReceipt: async (hash: { toString(): string }) => {
			asked.push({ url, hash: hash.toString() })
			return (answers.get(url) ?? pendingReceipt)()
		},
	})
	return { answers, asked, node }
}
type Nodes = ReturnType<typeof nodes>

/** One worker over `api`: the transaction store's services and the deletion that purges it. */
async function boot(api: FakeBrowserApi, chain: Nodes = nodes()) {
	const config = fakeConfig()
	const logger = new LoggerStore(config)
	const services = new ServiceCollection()
	services.add(svc(PASSKEY_SERVICE_NAME, {}))
	const profiles = new ProfileService(config, logger, api)
	services.add(profiles)
	services.add(
		svc(NETWORK_SERVICE_NAME, {
			registerChainPurgeSubscriber: () => {},
			getNetworksRaw: none,
			purgeForProfile: noop,
			getNodeForUrl: async (url: string) => chain.node(url),
			getNode: async () => undefined,
			reportEndpointFailure: () => {},
		}),
	)
	const accounts = new AccountService(logger, api)
	services.add(accounts)
	const txs = new TransactionService(logger, api)
	services.add(txs)
	services.add(svc(TOKEN_SERVICE_NAME, { getTokensRaw: none, rawTokenIdsForProfile: none, purgeForProfile: noop }))
	services.add(svc(AUTH_REGISTRY_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(TOKEN_BALANCE_SERVICE_NAME, { purgeForTokens: noop }))
	services.add(svc(INCOMING_TRANSFER_SERVICE_NAME, { clearProfile: noop }))
	services.add(svc(CONTACT_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(DAPP_SESSION_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(FPC_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(OPERATION_JOURNAL_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(new ProfileDeletionCoordinator(logger, api.storage.local))
	await services.start()
	return { profiles, txs, chain }
}
type Worker = Awaited<ReturnType<typeof boot>>

function freshApi(): FakeBrowserApi {
	const api = new FakeBrowserApi()
	api.reset()
	return api
}

/** `profileId`'s account at `ADDR`, as the account service stores it. */
async function seedAccount(api: FakeBrowserApi, profileId: string): Promise<void> {
	const row = { profileId, chainId: CHAIN, address: ADDR, index: 0, type: 0, l1ChainId: 1, name: "Account 1", visible: true }
	await api.storage.local.set({ [`nulo:core:accounts@${accountRowId(profileId, CHAIN, ADDR)}`]: JSON.stringify(row) })
}

/** A transaction row as a build that did not seal wrote it, at its hash. */
async function seedLegacy(api: FakeBrowserApi, overrides: Partial<Tx> = {}): Promise<Tx> {
	const row: Tx = {
		chainId: CHAIN,
		account: ADDR,
		nonce: "0",
		feePaymentMethod: 0 as never,
		hash: HASH,
		createdAt: 1,
		updatedAt: 1,
		status: TxStatus.Proposed,
		origin: { type: 0 } as never,
		calls: [],
		submittedEndpointUrl: NODE_P,
		...overrides,
	}
	await api.storage.local.set({ [`${TRANSACTION_STORAGE_ROOT}@${row.hash}`]: JSON.stringify(row) })
	return row
}

/** A pending send of `hash` from the active profile, recorded as the executor records it. */
async function send(worker: Worker, hash = HASH, submittedEndpointUrl = NODE_P): Promise<Tx> {
	return await worker.txs.addTransaction({
		origin: { type: 0 } as never,
		chainId: CHAIN,
		account: ADDR,
		calls: [],
		nonce: "0",
		feePaymentMethod: 0 as never,
		hash,
		submittedEndpointUrl,
		fence: await worker.profiles.captureExecutionFence(),
	})
}

const txRows = async (api: FakeBrowserApi) =>
	Object.fromEntries(Object.entries(await api.storage.local.get()).filter(([key]) => key.startsWith(`${TRANSACTION_STORAGE_ROOT}@`)))

/** Rewrites every sealed row as the plaintext a build that did not seal wrote, at its hash. */
async function toLegacy(api: FakeBrowserApi, worker: Worker): Promise<void> {
	for (const [key, value] of Object.entries(await txRows(api))) {
		const envelope = parseEnvelope(JSON.parse(value as string))
		const keys = envelope && worker.profiles.rowKeys(envelope.profileId)
		if (!envelope || !keys) continue
		const { k, r } = JSON.parse(
			await openRow(keys, envelope.sealed, { root: TRANSACTION_STORAGE_ROOT, storageKey: key, profileId: envelope.profileId }),
		) as { k: string; r: string }
		await api.storage.local.remove(key)
		await api.storage.local.set({ [`${TRANSACTION_STORAGE_ROOT}@${k}`]: r })
	}
}

const askedFor = (chain: Nodes, hash: string, url = NODE_P) => chain.asked.filter((a) => a.hash === hash && a.url === url).length
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("sealed transaction history — the real service graph", () => {
	test("a restarted worker arms a profile's rows only once its keys arrive; they are sealed at ids that name no hash", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		await seedAccount(api, p.id)
		await send(first)
		await toLegacy(api, first)
		const q = await first.profiles.createProfile("Q", PW)
		expect(Object.keys(await txRows(api))).toEqual([`${TRANSACTION_STORAGE_ROOT}@${HASH}`])

		const restarted = await boot(api)
		await restarted.profiles.unlockProfile(q.id, PW)
		await settle(1_500)
		expect(askedFor(restarted.chain, HASH)).toBe(0)

		await restarted.profiles.unlockProfile(p.id, PW)
		await expect.poll(() => askedFor(restarted.chain, HASH), { timeout: 5_000 }).toBeGreaterThan(0)
		const stored = await txRows(api)
		expect(Object.keys(stored)).toHaveLength(1)
		const [[key, value]] = Object.entries(stored)
		expect(key).not.toContain(HASH.slice(2))
		expect(String(value)).not.toContain(HASH.slice(2))
		expect(parseEnvelope(JSON.parse(String(value)))?.profileId).toBe(p.id)
		expect((await restarted.txs.transactionsOf(ADDR, p.id)).map((tx) => [tx.hash, tx.profileId])).toEqual([[HASH, p.id]])
	}, 60_000)

	test.each([
		{ label: "its sole owner adopts it, sealed", unreadable: false },
		{ label: "while another profile's account row is unreadable, it stays ownerless", unreadable: true },
	])(
		"a row that names no profile: $label",
		async ({ unreadable }) => {
			const api = freshApi()
			const first = await boot(api)
			const p = await first.profiles.createProfile("P", PW)
			await seedAccount(api, p.id)
			await send(first, OTHER_HASH)
			await toLegacy(api, first)
			const ownerless = await seedLegacy(api)
			if (unreadable) await api.storage.local.set({ [`nulo:core:accounts@${accountRowId("other", CHAIN, ADDR)}`]: "{" })

			const restarted = await boot(api)
			await restarted.profiles.unlockProfile(p.id, PW)
			// The profile's own pending row is armed after the adoption pass, so its first read marks the pass done.
			await expect.poll(() => askedFor(restarted.chain, OTHER_HASH), { timeout: 5_000 }).toBeGreaterThan(0)

			const legacyKey = `${TRANSACTION_STORAGE_ROOT}@${HASH}`
			if (unreadable) {
				expect((await api.storage.local.get(legacyKey))[legacyKey]).toBe(JSON.stringify(ownerless))
				expect((await restarted.txs.transactionsOf(ADDR, p.id)).find((tx) => tx.hash === HASH)?.profileId).toBeUndefined()
			} else {
				expect(await api.storage.local.get(legacyKey)).toEqual({})
				expect((await restarted.txs.transactionsOf(ADDR, p.id)).find((tx) => tx.hash === HASH)?.profileId).toBe(p.id)
				expect(Object.values(await txRows(api)).every((value) => parseEnvelope(JSON.parse(String(value))) !== undefined)).toBe(true)
			}
		},
		60_000,
	)

	test("a row two profiles may own is kept and marked when one of them deletes the account", async () => {
		const api = freshApi()
		const worker = await boot(api)
		await seedAccount(api, "p")
		await seedAccount(api, "q")
		await seedLegacy(api)
		await worker.txs.purgeForAccounts([ADDR], "p", CHAIN)
		const legacyKey = `${TRANSACTION_STORAGE_ROOT}@${HASH}`
		expect(JSON.parse((await api.storage.local.get(legacyKey))[legacyKey] as string)).toMatchObject({ hash: HASH, ambiguous: true })
	})

	test("restore refuses a hash its profile holds in either key form, and another profile keeps its own row of it", async () => {
		const api = freshApi()
		const worker = await boot(api)
		const p = await worker.profiles.createProfile("P", PW)
		await seedAccount(api, p.id)
		const q = await worker.profiles.createProfile("Q", PW)
		await seedAccount(api, q.id)
		const backup: Tx = { ...(await seedLegacy(api, { hash: OTHER_HASH })), status: TxStatus.Proposed }
		await api.storage.local.remove(`${TRANSACTION_STORAGE_ROOT}@${OTHER_HASH}`)

		await worker.profiles.unlockProfile(p.id, PW)
		expect((await worker.txs.restore([backup], p.id))[0]).not.toHaveProperty("restoreError")
		expect((await worker.txs.restore([backup], p.id))[0]).toHaveProperty("restoreError")
		await toLegacy(api, worker)
		expect((await worker.txs.restore([backup], p.id))[0]).toHaveProperty("restoreError")

		expect((await worker.txs.restore([backup], q.id))[0]).not.toHaveProperty("restoreError")
		expect((await worker.txs.transactionsOf(ADDR, p.id)).map((tx) => tx.profileId)).toEqual([p.id])
		expect((await worker.txs.transactionsOf(ADDR, q.id)).map((tx) => tx.profileId)).toEqual([q.id])
		expect(Object.keys(await txRows(api))).toHaveLength(2)
	}, 60_000)

	test("one hash pending in two profiles: two rows, two watches, and `waitForTx` follows its own profile's across a switch", async () => {
		const api = freshApi()
		const worker = await boot(api)
		const p = await worker.profiles.createProfile("P", PW)
		await seedAccount(api, p.id)
		await send(worker, HASH, NODE_P)
		const q = await worker.profiles.createProfile("Q", PW)
		await seedAccount(api, q.id)
		await send(worker, HASH, NODE_Q)
		expect(Object.keys(await txRows(api))).toHaveLength(2)
		expect(
			worker.txs
				.getPendingForAccount(ADDR)
				.map((tx) => tx.profileId)
				.sort(),
		).toEqual([p.id, q.id].sort())

		const waitP = worker.txs.waitForTx(HASH, p.id, undefined, 10_000)
		worker.chain.answers.set(NODE_P, minedReceipt)
		await waitP
		expect(worker.txs.getPendingForAccount(ADDR).map((tx) => tx.profileId)).toEqual([q.id])
		await expect(worker.txs.waitForTx(HASH, q.id, undefined, 1_500)).rejects.toThrow(/not confirmed/)
		expect((await worker.txs.transactionsOf(ADDR, q.id))[0]?.status).toBe(TxStatus.Pending)
	}, 60_000)

	test("an arming or adoption that a deletion overtakes inserts no watch, and nothing is read for it", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		await seedAccount(api, p.id)
		await send(first)
		await toLegacy(api, first)
		const ownerless = await seedLegacy(api, { hash: OTHER_HASH, status: TxStatus.Pending })

		const restarted = await boot(api)
		const area = api.storage.local
		const write = area.set.bind(area)
		let release = () => {}
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		let parked = false
		vi.spyOn(area, "set").mockImplementation(async (entries) => {
			if (!parked && Object.keys(entries).some((key) => key.startsWith(`${TRANSACTION_STORAGE_ROOT}@`))) {
				parked = true
				await gate
			}
			return write(entries)
		})
		await restarted.profiles.unlockProfile(p.id, PW)
		await expect.poll(() => parked).toBe(true)
		restarted.profiles.getDeletionState().beginDeletion(p.id)
		release()
		await settle(1_500)
		// The ownerless row stays ownerless and keeps the watch every profile reads it under.
		expect(restarted.txs.getPendingForAccount(ADDR).map((tx) => [tx.hash, tx.profileId])).toEqual([[OTHER_HASH, undefined]])
		expect((await area.get(`${TRANSACTION_STORAGE_ROOT}@${OTHER_HASH}`))[`${TRANSACTION_STORAGE_ROOT}@${OTHER_HASH}`]).toBe(
			JSON.stringify(ownerless),
		)
		expect(askedFor(restarted.chain, HASH)).toBe(0)
	}, 60_000)

	test("deleting a profile with a watched pending send leaves no watch and no row", async () => {
		const api = freshApi()
		const worker = await boot(api)
		const p = await worker.profiles.createProfile("P", PW)
		await seedAccount(api, p.id)
		await send(worker)
		await expect.poll(() => askedFor(worker.chain, HASH), { timeout: 5_000 }).toBeGreaterThan(0)
		const q = await worker.profiles.createProfile("Q", PW)

		await worker.profiles.deleteProfile(p.id)
		expect(worker.txs.getPendingForAccount(ADDR)).toEqual([])
		expect(await txRows(api)).toEqual({})
		const reads = askedFor(worker.chain, HASH)
		await settle(1_500)
		expect(askedFor(worker.chain, HASH)).toBe(reads)
		expect((await worker.profiles.getActiveProfile())?.id).toBe(q.id)
	}, 60_000)
})
