/**
 * Behavioral coverage for IncomingTransferService.
 *
 * Pairs with the orderByBlockIndex pin in service.test.ts. This file
 * carries the broader-scope tests:
 *   - PopupManager/RecentActivityView mount wiring is covered in
 *     PopupManager.test.ts (the .vue file mounts already exercise the
 *     ServiceClient.connect path).
 *   - visibility gate matrix on scanContract.onIncomingTransferPending
 *     + replayPendingPrompts.
 *   - account lifecycle (onAccountAdded → hydrateSchedulers;
 *     onAccountDeleted → tear down per-network scheduler).
 *   - dedup + late-delete + trust transitions (this file's headline).
 *
 * The suite runs the real IncomingTransferRepository over the process-wide fake browser storage.
 * The other declared dependencies are plain-object stubs with the surface scanContract /
 * replayPendingPrompts / lifecycle handlers actually touch. The real ServiceCollection.start() flow
 * is used so init() runs end-to-end.
 */

import { deferred, EventHandler } from "@nulo/wallet-core/utils"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { LoggerStore } from "@/wallet/logger"
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Static (module-scope) import: pays Vite's cold transform of this service +
// its inlined @nulo/* graph during the file's import phase, NOT inside the first
// test's 5s budget. Under Vite 8 that cold transform can exceed 5s on CI's
// shared runner, which timed out the first `bootService()` when the import was
// dynamic.
import { IncomingTransferService } from "./service"
import { IncomingTransferRepository } from "./repository"
import type { BalanceRefreshOutbox } from "./balance-outbox"
import { PublicScanCursorSchema, noteRecordId } from "./spec"
import type { IncomingNoteRecord, IncomingPublicEventRecord, IncomingTransferRecord, IncomingTrustRecord, PublicScanCursor } from "./spec"
import { TaskStatus } from "@/wallet/services/task/spec"
import type { SyncedBlock } from "@/wallet/services/note/spec"
import { type ExecutionFence, ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { type PublicEventReader, comparePublicPositions } from "./public-event-indexer"
import { SCAN_EPISODES_KEY, scanEpisodeNetworkPrefix } from "./scan-episodes"
import { type ArrivalRow, isArrivalEligible } from "./arrival-state"
import type { ScanOutcome } from "./scan-health"
import type {
	PublicScanTips,
	PublicTokenClassStatus,
	PublicTransferEvent,
	PublicTransferFetchArgs,
	PublicTransferPage,
} from "@nulo/aztec-runtime/pxe/public-events"
import { TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"
import { rowKeysForEveryProfile, trackSubtleCrypto } from "@/wallet/storage/sealed-entity-storage.testing"
import { parseEnvelope } from "@/wallet/storage/sealed-entity-storage"

// ── Storage ─────────────────────────────────────────────────────────────

// Every `FakeBrowserApi` in this file shares `@webext-core/fake-browser`'s one store, so this
// repository reads and writes the rows of every service the suite boots.
const suiteBrowser = new FakeBrowserApi()
/** One key for every profile, as the profile stub holds it. */
const { rowKeys: ROW_KEYS } = await rowKeysForEveryProfile()
const repo = new IncomingTransferRepository(suiteBrowser, ROW_KEYS)
// Every row is sealed, so a flush waits for the crypto behind the writes it lets run.
const subtleCalls = trackSubtleCrypto()
afterAll(() => subtleCalls.restore())
const flushPromises = () => subtleCalls.settled()
/** Advances the fake clock, then lets the sealed writes the timers started settle. */
const advance = async (ms: number) => {
	await vi.advanceTimersByTimeAsync(ms)
	await subtleCalls.settled()
}

/** Writes `row` as given, `updatedAt` included, where `setTrust` would stamp the clock. */
async function seedTrustRow(row: IncomingTrustRecord): Promise<void> {
	await repo.setArrivalFloor(row, { arrivalFloor: row.arrivalFloor, pending: row.arrivalFloorPending === true })
}

// Pass-through, so a test can observe when a clear builds its episode prefix.
vi.mock("./scan-episodes", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./scan-episodes")>()
	return { ...actual, scanEpisodeNetworkPrefix: vi.fn(actual.scanEpisodeNetworkPrefix) }
})

// ── Stub services ───────────────────────────────────────────────────────
//
// Each stub matches the IService shape (name + dependencies? + start) and
// exposes the surface IncomingTransferService.init touches.

function eh<T>(): EventHandler<T> {
	return new EventHandler<T>()
}

/** The session model mirrors ProfileService's fence: a lock ends the session, every unlock (a switch
 *  included) opens a new serial, and a deletion bumps the profile's epoch and closes its session. */
function makeProfileStub(activeProfile: { id: string } | null = { id: "p1" }) {
	const deletion = new ProfileDeletionState()
	let serial = 1
	let session = activeProfile ? { profileId: activeProfile.id, serial } : undefined
	const live = () => (session && !deletion.isReserved(session.profileId) ? session : undefined)
	return {
		name: "profile",
		dependencies: [],
		onActiveProfileChanged: eh<void>(),
		onProfileDeleted: eh<{ id: string }>(),
		onRowKeysReady: eh<string>(),
		rowKeys: ROW_KEYS,
		getActiveProfile: vi.fn().mockImplementation(async () => {
			const current = live()
			return current ? { id: current.profileId } : null
		}),
		getProfiles: vi.fn().mockResolvedValue(activeProfile ? [activeProfile] : []),
		captureExecutionFence: vi.fn(async (): Promise<ExecutionFence> => {
			const current = live()
			if (!current) throw new Error("Wallet locked")
			return { profileId: current.profileId, epoch: deletion.capture(current.profileId), session: current.serial }
		}),
		isFenceLive: (fence: ExecutionFence) =>
			session?.serial === fence.session && session.profileId === fence.profileId && deletion.isCurrent(fence.profileId, fence.epoch),
		getDeletionState: () => deletion,
		lock() {
			session = undefined
		},
		unlock(profileId: string) {
			serial += 1
			session = { profileId, serial }
		},
		beginDeletion(profileId: string) {
			deletion.beginDeletion(profileId)
			if (session?.profileId === profileId) session = undefined
		},
		releaseDeletion(profileId: string) {
			deletion.release(profileId)
		},
		async start() {},
	}
}

function makeNetworkStub(
	networks: {
		id: string
		profileId?: string
		chainId: number
		endpoints?: { id: string; rpcUrl: string }[]
		primaryEndpointId?: string
	}[] = [{ id: "n1", chainId: 1, endpoints: [{ id: "e1", rpcUrl: "http://n1" }], primaryEndpointId: "e1" }],
) {
	let purgeSub: ((profileId: string, chainId: number, networkId: string) => Promise<void>) | null = null
	// getReceiptFee reaches through getNodeForUrl(endpoint).getTxReceipt(txHash) (or getNode(chainId) as a
	// fallback); tests inject the receipt via setReceiptImpl. Unset → the node throws (unreachable), which
	// getReceiptFee swallows to null. The receipt's blockHash gates caching (reorg-safety).
	type FakeReceipt = { transactionFee?: bigint; blockHash?: { toString(): string } }
	let receiptImpl: ((txHashStr: string) => Promise<FakeReceipt>) | null = null
	const fakeNode = {
		getTxReceipt: async (txHash: { toString(): string }) => {
			if (!receiptImpl) throw new Error("no node receipt configured")
			return receiptImpl(txHash.toString())
		},
	}
	return {
		name: "network",
		dependencies: [],
		networks,
		// Real networks carry endpoints; getReceiptFee pins the fetch to the primary endpoint's URL.
		getNode: vi.fn().mockImplementation(async (_chainId: number) => fakeNode),
		getNodeForUrl: vi.fn().mockImplementation(async (_url: string) => fakeNode),
		setReceiptImpl(fn: ((txHashStr: string) => Promise<FakeReceipt>) | null) {
			receiptImpl = fn
		},
		getNetworks: vi.fn().mockImplementation(async (chainId?: number) => {
			if (chainId === undefined) return networks
			return networks.filter((n) => n.chainId === chainId)
		}),
		// Profile-scoped read — the stub networks belong to the test
		// profile, so filter by chainId only (profileId is accepted + ignored).
		getNetworksRaw: vi.fn().mockImplementation(async (_profileId: string, chainId?: number) => {
			if (chainId === undefined) return networks
			return networks.filter((n) => n.chainId === chainId)
		}),
		getNetwork: vi.fn().mockImplementation(async (id: string) => networks.find((n) => n.id === id)),
		isChainQuarantined: async () => false,
		registerChainPurgeSubscriber(sub: typeof purgeSub) {
			purgeSub = sub
		},
		async firePurge(profileId: string, chainId: number, networkId: string) {
			await purgeSub?.(profileId, chainId, networkId)
		},
		async start() {},
	}
}

function makeAccountStub(accounts: { profileId: string; chainId: number; address: string }[] = []) {
	return {
		name: "account",
		dependencies: [],
		onAccountAdded: eh<{ profileId: string; chainId: number; address: string }>(),
		onAccountUpdated: eh<{ profileId: string; chainId: number; address: string }>(),
		onAccountDeleted: eh<{ profileId: string; chainId: number; address: string }>(),
		getAccounts: vi.fn().mockImplementation(async (_p: string, chainId: number) => {
			return accounts.filter((a) => a.chainId === chainId)
		}),
		getAccount: vi.fn().mockImplementation(async (p: string, chainId: number, address: string) => {
			return accounts.find((a) => a.profileId === p && a.chainId === chainId && a.address === address)
		}),
		async start() {},
	}
}

function makeTokenStub(tokens: { id: number; chainId: number; contract: string; symbol: string; decimals: number }[] = []) {
	return {
		name: "token",
		dependencies: [],
		onTokenAdded: eh<unknown>(),
		onTokenDeleted: eh<unknown>(),
		onTokenUpdated: eh<unknown>(),
		getTokensRaw: vi.fn().mockResolvedValue(tokens),
		async start() {},
	}
}

function makeTransactionStub(txs: { hash: string; account: string; chainId: number; profileId?: string; networkId?: string }[] = []) {
	return {
		name: "transaction",
		dependencies: [],
		onTransactionAdded: eh<{ hash: string; account: string; chainId: number; calls: unknown[] }>(),
		// Real surface: `transactionsOf(accountAddress, profileId)` returns the
		// profile's txs for the address across networks, plus any row naming no
		// profile; the service must filter to the scanned scope locally. Pinning the argspec here keeps the test
		// honest with what scanContract calls.
		transactionsOf: vi.fn().mockImplementation(async (account: string) => {
			return txs.filter((t) => t.account === account)
		}),
		async start() {},
	}
}

function makeJournalStub(
	operations: { accountAddress?: string; networkId?: string; progress?: { stage?: string; txHash?: string } }[] = [],
) {
	return {
		name: "operation-journal",
		dependencies: [],
		getOperations: vi.fn().mockResolvedValue(operations),
		async start() {},
	}
}

function makeNoteStub(notesByContract: Record<string, unknown[]> = {}, blockTimestampsByNumber: Record<number, number | undefined> = {}) {
	return {
		name: "note",
		dependencies: [],
		getNotesRaw: vi.fn().mockImplementation(async (_n: string, _a: string, contract: string) => {
			return notesByContract[contract] ?? []
		}),
		getBlockTimestamp: vi.fn().mockImplementation(async (_n: string, blockNumber: number) => {
			return blockTimestampsByNumber[blockNumber]
		}),
		getSyncedBlock: vi.fn(async (_n: string): Promise<SyncedBlock> => ({ number: 0, hash: "0xunsynced" })),
		async start() {},
	}
}

function makeConfigStub(initialVisibility: boolean = true) {
	let visibility = initialVisibility
	let dustThreshold = 0
	return {
		name: "config",
		dependencies: [],
		getValue: vi.fn().mockImplementation(async (key: string) => {
			if (key === "incomingTransfersVisible") return visibility
			if (key === "incomingDustUsdThreshold") return dustThreshold
			return undefined
		}),
		setVisibility(v: boolean) {
			visibility = v
		},
		setDustThreshold(t: number) {
			dustThreshold = t
		},
		async start() {},
	}
}

/** TokenBalanceService stub with a configurable `requestBalanceRefresh` result. `setResult` can
 *  return `{missing:true}` (the balance pair is positively gone → drain deletes the row); `setThrow`
 *  simulates a TRANSIENT storage/task failure (a real throw → drain KEEPS the row). */
function makeTokenBalanceStub() {
	const state = { result: { busy: true } as { taskId: string } | { busy: true } | { missing: true }, throwOnRequest: false }
	const requestBalanceRefresh = vi.fn(async (_tokenId: number, _account: string) => {
		if (state.throwOnRequest) throw new Error("transient storage failure")
		return state.result
	})
	return {
		name: "token-balance",
		dependencies: [],
		requestBalanceRefresh,
		setResult(r: { taskId: string } | { busy: true } | { missing: true }) {
			state.result = r
		},
		setThrow(t: boolean) {
			state.throwOnRequest = t
		},
		async start() {},
	}
}

/** PriceService stub — `getQuotes` returns a settable `coingeckoId → {usd}` map (dust filter), with the
 *  Testnet tokens' mapping. */
function makePriceStub() {
	const state = { quotes: {} as Record<string, { usd: number }> }
	return {
		name: "price",
		dependencies: [],
		getQuotes: vi.fn(async () => ({ quotes: state.quotes, pricedTokens: TEST_PRICED_TOKENS })),
		setQuotes(q: Record<string, { usd: number }>) {
			state.quotes = q
		},
		async start() {},
	}
}

/** TaskService stub — `getTaskSync` reads from a settable in-memory ledger (causal ack). */
function makeTaskStub() {
	const tasks = new Map<string, { status: number; finishedAt?: number }>()
	return {
		name: "task",
		dependencies: [],
		getTaskSync: vi.fn((id: string) => {
			const t = tasks.get(id)
			if (!t) throw new Error("Invalid task id")
			return { id, status: t.status, finishedAt: t.finishedAt }
		}),
		setTask(id: string, status: number, finishedAt?: number) {
			tasks.set(id, { status, finishedAt })
		},
		async start() {},
	}
}

// ── Service bootstrap ───────────────────────────────────────────────────

async function bootService(
	stubs: {
		profile?: ReturnType<typeof makeProfileStub>
		network?: ReturnType<typeof makeNetworkStub>
		account?: ReturnType<typeof makeAccountStub>
		token?: ReturnType<typeof makeTokenStub>
		transaction?: ReturnType<typeof makeTransactionStub>
		journal?: ReturnType<typeof makeJournalStub>
		note?: ReturnType<typeof makeNoteStub>
		config?: ReturnType<typeof makeConfigStub>
		tokenBalance?: ReturnType<typeof makeTokenBalanceStub>
		task?: ReturnType<typeof makeTaskStub>
		price?: ReturnType<typeof makePriceStub>
		publicReader?: PublicEventReader
	} = {},
	opts: { pollIntervalMs?: number } = {},
) {
	const fixture = {
		profile: stubs.profile ?? makeProfileStub(),
		network: stubs.network ?? makeNetworkStub(),
		account: stubs.account ?? makeAccountStub(),
		token: stubs.token ?? makeTokenStub(),
		transaction: stubs.transaction ?? makeTransactionStub(),
		journal: stubs.journal ?? makeJournalStub(),
		note: stubs.note ?? makeNoteStub(),
		config: stubs.config ?? makeConfigStub(),
		tokenBalance: stubs.tokenBalance ?? makeTokenBalanceStub(),
		task: stubs.task ?? makeTaskStub(),
		price: stubs.price ?? makePriceStub(),
	}
	const logger = new LoggerStore(new ConfigStore())
	// Huge poll interval so scheduler doesn't fire during tests; we exercise
	// the scan path via the public surface or via direct method calls. An explicit `undefined` boots
	// the constructor's own default, the production cadence.
	// Every boot shares the suite's storage, so a second boot in a test models a service-worker restart.
	const browserApi = new FakeBrowserApi()
	const pollIntervalMs = "pollIntervalMs" in opts ? opts.pollIntervalMs : 1_000_000
	const service = new IncomingTransferService(logger, browserApi, pollIntervalMs, stubs.publicReader)
	const collection = new ServiceCollection()
	for (const stub of Object.values(fixture)) collection.add(stub as never)
	collection.add(service)
	await collection.start()
	return { service, ...fixture }
}

beforeEach(() => {
	suiteBrowser.reset()
})

/** A record's fields plus the note's `uniqueNoteHash`, which the record keeps only in its id. */
type NoteSeed = Partial<IncomingNoteRecord> & { uniqueNoteHash?: string }

/** Build a valid note-kind record with the `id` ALWAYS derived from the final
 *  (profileId, networkId, uniqueNoteHash) — so a `{ ...other }` spread can't carry a stale id. */
function noteRecord({ uniqueNoteHash = validNoteHash(1), ...overrides }: NoteSeed = {}): IncomingNoteRecord {
	const merged = {
		kind: "note" as const,
		profileId: "p1",
		networkId: "n1",
		accountAddress: "0xa",
		contract: "0xc",
		tokenId: 1,
		owner: "0xa",
		amountRaw: "100",
		noteHash: "0xnh",
		txHash: "0xtx1",
		l2BlockNumber: 1,
		txIndexInBlock: 0,
		indexInTx: 0,
		hidden: false,
		discoveredAt: 0,
		...overrides,
	}
	return { ...merged, id: noteRecordId(merged.profileId, merged.networkId, uniqueNoteHash) }
}

/** Seed a note record keyed by its `id` (matches the repo's real keying). Returns the record. */
async function seedNote(overrides: NoteSeed = {}): Promise<IncomingNoteRecord> {
	const r = noteRecord(overrides)
	await repo.upsertRecord(r)
	return r
}

// ── Tests ───────────────────────────────────────────────────────────────

const validNoteHash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`
const tokenA = { id: 1, profileId: "p1", chainId: 1, contract: "0xtokenA", symbol: "TKA", decimals: 18 }
const tokenB = { id: 2, chainId: 1, contract: "0xtokenB", symbol: "TKB", decimals: 18 }

function note(
	overrides: Partial<{
		uniqueNoteHash: string
		noteHash: string
		l2BlockNumber: number
		txIndexInBlock: number
		noteIndexInTx: number
		contract: string
		storageSlot: string
		txHash: string
		rawContent: string[]
		content: Record<string, string>
	}> = {},
) {
	return {
		uniqueNoteHash: validNoteHash(1),
		noteHash: "0xnh1",
		l2BlockNumber: 100,
		txIndexInBlock: 0,
		noteIndexInTx: 0,
		contract: tokenA.contract,
		storageSlot: "0xslot",
		txHash: "0xtx1",
		rawContent: [],
		content: { value: "1000" },
		...overrides,
	}
}

async function scan(service: unknown, contract: string = tokenA.contract) {
	const s = service as {
		serviceEpoch: number
		scanContract: (p: string, n: string, a: string, c: string, epoch: number) => Promise<boolean>
	}
	await s.scanContract("p1", "n1", "0xa", contract, s.serviceEpoch)
}

describe("IncomingTransferService — public surface gating (visibility)", () => {
	test("getIncomingTransfers returns [] when incomingTransfersVisible=false", async () => {
		const config = makeConfigStub(false)
		const { service } = await bootService({ config })
		await seedNote({
			uniqueNoteHash: "k",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: "0xc",
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		const out = await service.getIncomingTransfers("p1", "n1", "0xa")
		expect(out).toEqual([])
	})

	test("getIncomingTransfers returns visible records when visibility=true", async () => {
		const { service } = await bootService()
		await seedNote({
			uniqueNoteHash: "k",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: "0xc",
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		const out = await service.getIncomingTransfers("p1", "n1", "0xa")
		expect(out).toHaveLength(1)
	})

	test("getIncomingTransfers fails CLOSED on a config error (returns [], record stays persisted)", async () => {
		const config = makeConfigStub()
		const { service } = await bootService({ config })
		await repo.upsertRecord({
			kind: "note",
			id: "note:p1|n1|k",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: "0xc",
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		// Config port hiccup for the visibility key → the READ path must not expose records.
		config.getValue.mockImplementation(async (key: string) => {
			if (key === "incomingTransfersVisible") throw new Error("config down")
			return undefined
		})
		const out = await service.getIncomingTransfers("p1", "n1", "0xa")
		expect(out).toEqual([])
		// Still persisted — reappears once visibility can be read again.
		expect((await repo.listRecords()).length).toBe(1)
	})

	test("getIncomingTransfers filters hidden records", async () => {
		const { service } = await bootService()
		await seedNote({
			uniqueNoteHash: "v",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: "0xc",
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx1",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		await seedNote({
			uniqueNoteHash: "h",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: "0xc",
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx2",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: true,
			discoveredAt: 0,
		})
		const out = await service.getIncomingTransfers("p1", "n1", "0xa")
		expect(out).toHaveLength(1)
		expect(out[0].id).toBe(noteRecordId("p1", "n1", "v"))
	})

	test("replayPendingPrompts is a no-op when visibility=false (regression pin)", async () => {
		const config = makeConfigStub(false)
		const { service } = await bootService({ config })
		const seen = vi.fn()
		service.onIncomingTransferPending.add(seen)
		// Pre-seed a pending trust record so the method has something to emit.
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: "0xtokenA",
			state: "pending",
			updatedAt: 0,
		})
		await seedNote({
			uniqueNoteHash: validNoteHash(7),
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: "0xtokenA",
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: true,
			discoveredAt: 0,
		})
		await service.replayPendingPrompts("p1", "n1", "0xa")
		expect(seen).not.toHaveBeenCalled()
	})

	test("replayPendingPrompts emits for each pending contract when visibility=true", async () => {
		const token = makeTokenStub([tokenA, tokenB])
		const { service } = await bootService({ token })
		const seen = vi.fn()
		service.onIncomingTransferPending.add(seen)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "pending",
			updatedAt: 0,
		})
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenB.contract,
			state: "pending",
			updatedAt: 0,
		})
		await seedNote({
			uniqueNoteHash: "ka",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx1",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: true,
			discoveredAt: 0,
		})
		await seedNote({
			uniqueNoteHash: "kb",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenB.contract,
			tokenId: 2,
			owner: "0xa",
			amountRaw: "200",
			noteHash: "0xnh",
			txHash: "0xtx2",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: true,
			discoveredAt: 0,
		})
		await service.replayPendingPrompts("p1", "n1", "0xa")
		expect(seen).toHaveBeenCalledTimes(2)
	})
})

describe("IncomingTransferService — trust transitions", () => {
	test("setTrustAllow flips hidden records visible + emits onIncomingTransferAdded", async () => {
		const token = makeTokenStub([tokenA])
		const { service } = await bootService({ token })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "pending",
			updatedAt: 0,
		})
		await seedNote({
			uniqueNoteHash: "k",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: true,
			discoveredAt: 0,
		})
		const added = vi.fn()
		service.onIncomingTransferAdded.add(added)
		await service.setTrustAllow("p1", "n1", tokenA.contract)
		expect((await repo.getRecord("note:p1|n1|k"))?.hidden).toBe(false)
		expect(added).toHaveBeenCalledTimes(1)
	})

	test("setTrustAllow with visibility=false flips records visible but does NOT emit", async () => {
		const config = makeConfigStub(false)
		const { service } = await bootService({ config, token: makeTokenStub([tokenA]) })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "pending",
			updatedAt: 0,
		})
		await seedNote({
			uniqueNoteHash: "k",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: true,
			discoveredAt: 0,
		})
		const added = vi.fn()
		service.onIncomingTransferAdded.add(added)
		await service.setTrustAllow("p1", "n1", tokenA.contract)
		// Records flipped (so a future toggle-on shows them) but no live event.
		expect((await repo.getRecord("note:p1|n1|k"))?.hidden).toBe(false)
		expect(added).not.toHaveBeenCalled()
	})

	test("setTrustReject sets state=blocked and deletes the hidden records", async () => {
		const { service } = await bootService({ token: makeTokenStub([tokenA]) })
		await seedNote({
			uniqueNoteHash: "k",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: true,
			discoveredAt: 0,
		})
		await service.setTrustReject("p1", "n1", tokenA.contract)
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("blocked")
		expect(await repo.hasRecord("note:p1|n1|k")).toBe(false)
	})
})

describe("IncomingTransferService — trust after a full-backup import", () => {
	/** A locked wallet whose restored profile holds tokenA and one note for it, as a full-backup import
	 *  leaves it just before `finalizeRestore` opens the profile. */
	async function bootRestored() {
		const profile = makeProfileStub()
		profile.lock()
		const token = makeTokenStub([tokenA])
		const booted = await bootService({
			profile,
			account: makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }]),
			token,
			note: makeNoteStub({ [tokenA.contract]: [note({ l2BlockNumber: 7 })] }, { 7: 1_700_000_007 }),
		})
		await flushPromises()
		const pending = vi.fn()
		booted.service.onIncomingTransferPending.add(pending)
		const open = async () => {
			profile.unlock("p1")
			await profile.onActiveProfileChanged.invoke()
			await flushPromises()
		}
		return { ...booted, pending, open, token }
	}

	test("a restored token's first note asks: the backup carries no trust rows and the restore trusts nothing", async () => {
		const { pending, open } = await bootRestored()
		await open()
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("pending")
		expect(pending).toHaveBeenCalledTimes(1)
	})

	test("the chain re-read's update event trusts nothing (control: an added token is trusted on its add)", async () => {
		const { pending, open, token } = await bootRestored()
		await open()
		await token.onTokenUpdated.invoke({ ...tokenA, profileId: "p1", name: "Token A" } as never)
		await flushPromises()
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("pending")
		expect(pending).toHaveBeenCalledTimes(1)
	})
})

describe("IncomingTransferService — account lifecycle", () => {
	test("onAccountDeleted clears scheduler entries for that account across networks", async () => {
		const network = makeNetworkStub([
			{ id: "n1", chainId: 1 },
			{ id: "n2", chainId: 1 },
		])
		const account = makeAccountStub([
			{ profileId: "p1", chainId: 1, address: "0xa" },
			{ profileId: "p1", chainId: 1, address: "0xb" },
		])
		const token = makeTokenStub([tokenA])
		const { service } = await bootService({ network, account, token })

		// Hydrate populates schedulers for both accounts on both networks.
		const schedulers = (service as never as { schedulers: Map<string, unknown> }).schedulers
		expect(schedulers.has("n1|0xa")).toBe(true)
		expect(schedulers.has("n2|0xa")).toBe(true)
		expect(schedulers.has("n1|0xb")).toBe(true)

		// Fire delete for 0xa — the real service removes the row before it emits.
		account.getAccounts.mockResolvedValue([{ profileId: "p1", chainId: 1, address: "0xb" }])
		account.onAccountDeleted.invoke({ profileId: "p1", chainId: 1, address: "0xa" })
		await flushPromises()

		// Both 0xa entries gone; 0xb stays.
		expect(schedulers.has("n1|0xa")).toBe(false)
		expect(schedulers.has("n2|0xa")).toBe(false)
		expect(schedulers.has("n1|0xb")).toBe(true)
	})

	test("onAccountDeleted with networkService throw: no crash, no state change", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const account = makeAccountStub()
		const { service } = await bootService({ network, account })
		// Failure mode applies only to the post-init delete handler — hydrate
		// has already finished.
		network.getNetworks.mockRejectedValueOnce(new Error("transport"))
		const schedulersBefore = new Map((service as never as { schedulers: Map<string, unknown> }).schedulers)

		account.onAccountDeleted.invoke({ profileId: "p1", chainId: 1, address: "0xa" })
		await flushPromises()

		const schedulersAfter = (service as never as { schedulers: Map<string, unknown> }).schedulers
		expect(schedulersAfter.size).toBe(schedulersBefore.size)
	})

	test("onAccountAdded → hydrateSchedulers populates a scheduler entry for the new account", async () => {
		// Symmetric to onAccountDeleted. Without this pin, a future refactor that drops the
		// `accountService.onAccountAdded.add(...)` subscription would silently
		// regress the "new account starts scanning immediately" behavior.
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		// Start with no accounts; we'll inject one via the event below.
		const account = makeAccountStub([])
		const { service } = await bootService({ network, account, token })

		const schedulers = (service as never as { schedulers: Map<string, unknown> }).schedulers
		expect(schedulers.has("n1|0xnewAccount")).toBe(false)

		// Mutate the account stub's backing list BEFORE firing the event —
		// hydrateSchedulers reads via getAccounts which the stub filters
		// against the list.
		account.getAccounts.mockImplementation(async (_p: string, chainId: number) => {
			if (chainId !== 1) return []
			return [{ profileId: "p1", chainId: 1, address: "0xnewAccount" }]
		})
		account.onAccountAdded.invoke({ profileId: "p1", chainId: 1, address: "0xnewAccount" })
		await flushPromises()

		expect(schedulers.has("n1|0xnewAccount")).toBe(true)
	})
})

describe("IncomingTransferService — scanContract dedup + emit semantics", () => {
	test("a watchdog handoff mid-park lets onTokenDeleted wipe — the revoked CS writes nothing", async () => {
		// Trust is pre-seeded `trusted` so nothing is written before the park: an unknown-trust
		// write would land before it and could never discriminate the post-handoff re-check.
		vi.useFakeTimers()
		try {
			const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
			const token = makeTokenStub([tokenA])
			const noteSvc = makeNoteStub({ [tokenA.contract]: [note()] }, { 100: 1_234 })
			const { service } = await bootService({ network, token, note: noteSvc })
			const trustRead = holdCall(internals(service).repo, "getTrust", 1, "after")
			await seedTrustRow({
				profileId: "p1",
				networkId: "n1",
				contract: tokenA.contract,
				state: "trusted",
				updatedAt: 0,
			})
			const added = vi.fn()
			service.onIncomingTransferAdded.add(added)

			const scanP = scan(service)
			await untilReached(trustRead.held)
			// The deletion queues BEHIND the parked CS (its epoch bump is inside
			// the same lock) — nothing has been wiped or written yet.
			token.onTokenDeleted.invoke({ ...tokenA, profileId: "p1" })
			await advance(0)
			expect((await repo.listRecords()).length).toBe(0)

			// The serviceLock watchdog fires → handoff → the deletion bumps the
			// epoch and wipes the token's rows.
			await advance(5 * 60_000 + 1)

			// The revoked CS resumes — its post-park re-check must stand down.
			trustRead.release()
			await scanP
			await advance(0)

			expect((await repo.listRecords()).length).toBe(0) // no resurrection
			expect((await repo.listOutbox()).length).toBe(0) // no post-park outbox write
			expect(added).not.toHaveBeenCalled() // no post-park emit
		} finally {
			vi.useRealTimers()
		}
	})

	test("a handoff mid-park cannot resurrect an existing record via the timestamp backfill", async () => {
		// Same watchdog-handoff composition as the new-record pin, driven down
		// the EXISTING-record branch: the CS parks on its record read; the
		// queued deletion wipes the record; the revoked CS's backfill upsert
		// must stand down (its re-check), never re-add the wiped record.
		vi.useFakeTimers()
		try {
			const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
			const token = makeTokenStub([tokenA])
			const n = note()
			const noteSvc = makeNoteStub({ [tokenA.contract]: [n] }, { 100: 1_234 })
			const { service } = await bootService({ network, token, note: noteSvc })
			// The first record read is the one before the lock.
			const recordRead = holdCall(internals(service).repo, "getRecord", 2, "after")
			// Existing record for the SAME note, timestamp missing → the
			// scan takes the backfill branch and parks.
			await seedNote({
				uniqueNoteHash: n.uniqueNoteHash,
				contract: tokenA.contract,
				tokenId: tokenA.id,
				blockTimestamp: undefined,
			})

			const scanP = scan(service)
			await untilReached(recordRead.held)
			token.onTokenDeleted.invoke({ ...tokenA, profileId: "p1" })
			await advance(0)

			await advance(5 * 60_000 + 1) // handoff → wipe
			expect((await repo.listRecords()).length).toBe(0)

			recordRead.release()
			await scanP
			await advance(0)

			expect((await repo.listRecords()).length).toBe(0) // the backfill did not resurrect it
		} finally {
			vi.useRealTimers()
		}
	})

	test("first note from unknown contract → pending state + Pending emit (visibility=true)", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note()] })
		const { service } = await bootService({ network, token, note: noteSvc })

		const pending = vi.fn()
		const added = vi.fn()
		service.onIncomingTransferPending.add(pending)
		service.onIncomingTransferAdded.add(added)

		await scan(service)

		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("pending")
		expect(pending).toHaveBeenCalledTimes(1)
		// Pending state → record is hidden → no Added emit.
		expect(added).not.toHaveBeenCalled()
		// Record is persisted (hidden) for the future toggle-on / Allow path.
		const persisted = await repo.listRecords()
		expect(persisted).toHaveLength(1)
		expect(persisted[0].hidden).toBe(true)
	})

	test("scanContract pending emit gated on visibility=false — record persisted, no emit", async () => {
		const config = makeConfigStub(false)
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note()] })
		const { service } = await bootService({ config, network, token, note: noteSvc })

		const pending = vi.fn()
		service.onIncomingTransferPending.add(pending)

		await scan(service)

		// Trust transition still happens (so toggle-on can replay) — only the
		// emit is silenced.
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("pending")
		expect(pending).not.toHaveBeenCalled()
		expect(await repo.listRecords()).toHaveLength(1)
	})

	test("trusted contract: scanContract emits Added per note + persists visible", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note()] })
		const { service } = await bootService({ network, token, note: noteSvc })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})

		const added = vi.fn()
		service.onIncomingTransferAdded.add(added)

		await scan(service)

		expect(added).toHaveBeenCalledTimes(1)
		expect((await repo.listRecords())[0].hidden).toBe(false)
	})

	test("visibility fails CLOSED: a config error suppresses the Added emit but persists the record hidden", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note()] })
		const config = makeConfigStub()
		const { service } = await bootService({ network, token, note: noteSvc, config })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		// Config port hiccup ONLY for the visibility key (boot stays clean).
		config.getValue.mockImplementation(async (key: string) => {
			if (key === "incomingTransfersVisible") throw new Error("config port down")
			return undefined
		})
		const added = vi.fn()
		service.onIncomingTransferAdded.add(added)

		await scan(service)

		// Privacy control fails closed: no emit when visibility can't be confirmed…
		expect(added).not.toHaveBeenCalled()
		// …but the record is persisted (hidden), so it reappears once visibility resolves.
		expect((await repo.listRecords()).length).toBe(1)
	})

	test("dedupe source 1 (prior records): existing uniqueNoteHash → skip", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const n = note()
		const noteSvc = makeNoteStub({ [tokenA.contract]: [n] })
		const { service } = await bootService({ network, token, note: noteSvc })
		await seedNote({
			uniqueNoteHash: n.uniqueNoteHash,
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: 1,
			owner: "0xa",
			amountRaw: "1000",
			noteHash: "x",
			txHash: n.txHash,
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})

		const pending = vi.fn()
		const added = vi.fn()
		service.onIncomingTransferPending.add(pending)
		service.onIncomingTransferAdded.add(added)

		await scan(service)

		expect(pending).not.toHaveBeenCalled()
		expect(added).not.toHaveBeenCalled()
	})

	test("dedupe source 2 (outgoing tx hash): note with matching outgoing hash → skip", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const transaction = makeTransactionStub([{ hash: "0xtx1", account: "0xa", chainId: 1, profileId: "p1", networkId: "n1" }])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ txHash: "0xtx1" })] })
		const { service } = await bootService({ network, token, transaction, note: noteSvc })

		const pending = vi.fn()
		service.onIncomingTransferPending.add(pending)

		await scan(service)

		// Skipped → no trust transition either; nothing to prompt about.
		expect(pending).not.toHaveBeenCalled()
		expect(await repo.listTrust()).toHaveLength(0)
	})

	test("a FOREIGN profile's outgoing tx does not suppress this scope's note", async () => {
		// p2 shares address 0xa (same seed) and sent 0xtx1 on the same chain.
		// From p1's silo that send is someone else's activity — the note must
		// surface as incoming, exactly like another device's outgoing does.
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const transaction = makeTransactionStub([{ hash: "0xtx1", account: "0xa", chainId: 1, profileId: "p2", networkId: "n9" }])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ txHash: "0xtx1" })] })
		const { service } = await bootService({ network, token, transaction, note: noteSvc })

		const pending = vi.fn()
		service.onIncomingTransferPending.add(pending)

		await scan(service)

		expect(pending).toHaveBeenCalledTimes(1)
	})

	test("dedupe source 3 (in-flight journal txHash): note with matching journal txHash → skip", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const journal = makeJournalStub([{ accountAddress: "0xa", networkId: "n1", progress: { stage: "submitting", txHash: "0xtx1" } }])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ txHash: "0xtx1" })] })
		const { service } = await bootService({ network, token, journal, note: noteSvc })

		const pending = vi.fn()
		service.onIncomingTransferPending.add(pending)

		await scan(service)

		expect(pending).not.toHaveBeenCalled()
		expect(await repo.listTrust()).toHaveLength(0)
	})

	test("a failed send's own note: a note whose hash matches a failed row of this scope → skip", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const failed = {
			profileId: "p1",
			accountAddress: "0xa",
			networkId: "n1",
			terminalAt: 1_000,
			progress: { stage: "failed", from: "submitting", txHash: "0xtx1", check: "sent" },
		}
		// Filters as the journal does, so a query for non-terminal rows cannot see the failed one.
		const journal = {
			...makeJournalStub(),
			getOperations: vi.fn(async (filter: { profileId?: string; isTerminal?: boolean; stage?: string } = {}) =>
				[failed].filter(
					(op) =>
						(filter.profileId === undefined || op.profileId === filter.profileId) &&
						(filter.isTerminal === undefined || (op.terminalAt !== null) === filter.isTerminal) &&
						(filter.stage === undefined || op.progress.stage === filter.stage),
				),
			),
		}
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ txHash: "0xtx1" })] })
		const { service } = await bootService({ network, token, journal, note: noteSvc })

		const pending = vi.fn()
		service.onIncomingTransferPending.add(pending)

		await scan(service)

		expect(pending).not.toHaveBeenCalled()
		expect(await repo.listRecords()).toHaveLength(0)
	})

	test("token-removed (no matching tokens for contract) → scanContract no-ops", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([]) // No tokens registered.
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note()] })
		const { service } = await bootService({ network, token, note: noteSvc })

		const pending = vi.fn()
		service.onIncomingTransferPending.add(pending)

		await scan(service)

		expect(pending).not.toHaveBeenCalled()
		expect(await repo.listRecords()).toHaveLength(0)
	})
})

describe("IncomingTransferService — late-delete on onTransactionAdded", () => {
	test("pre-existing record whose txHash matches the new outgoing tx → deleted + Deleted emit", async () => {
		const transaction = makeTransactionStub()
		const { service } = await bootService({ transaction })

		const pre = noteRecord({
			uniqueNoteHash: validNoteHash(7),
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xpending",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		await repo.upsertRecord(pre)

		const deleted = vi.fn()
		service.onIncomingTransferDeleted.add(deleted)

		transaction.onTransactionAdded.invoke({ hash: "0xpending", account: "0xa", chainId: 1, calls: [] } as never)
		await flushPromises()

		expect(await repo.hasRecord(pre.id)).toBe(false)
		expect(deleted).toHaveBeenCalledTimes(1)
	})

	test("unrelated txHash: no delete, no emit", async () => {
		const transaction = makeTransactionStub()
		const { service } = await bootService({ transaction })

		const pre = noteRecord({
			uniqueNoteHash: validNoteHash(8),
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xstayedA",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		await repo.upsertRecord(pre)

		const deleted = vi.fn()
		service.onIncomingTransferDeleted.add(deleted)

		transaction.onTransactionAdded.invoke({ hash: "0xdifferent", account: "0xa", chainId: 1, calls: [] } as never)
		await flushPromises()

		expect(await repo.hasRecord(pre.id)).toBe(true)
		expect(deleted).not.toHaveBeenCalled()
	})

	test("per-hash reentrancy guard: two same-hash events → exactly one Delete emit", async () => {
		const transaction = makeTransactionStub()
		const { service } = await bootService({ transaction })

		const pre = noteRecord({
			uniqueNoteHash: validNoteHash(9),
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xreentrant",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		await repo.upsertRecord(pre)

		const deleted = vi.fn()
		service.onIncomingTransferDeleted.add(deleted)

		// Fire twice back-to-back — two listeners observing the same
		// listByTxHash result before either delete completes would have
		// emitted Deleted twice without the guard.
		transaction.onTransactionAdded.invoke({ hash: "0xreentrant", account: "0xa", chainId: 1, calls: [] } as never)
		transaction.onTransactionAdded.invoke({ hash: "0xreentrant", account: "0xa", chainId: 1, calls: [] } as never)
		await flushPromises()

		expect(await repo.hasRecord(pre.id)).toBe(false)
		expect(deleted).toHaveBeenCalledTimes(1)
	})

	test("account filter: same hash across accounts → only the originating account's record deleted", async () => {
		const transaction = makeTransactionStub()
		const { service } = await bootService({ transaction })

		// Two accounts with the same incoming txHash (legal under split-fee
		// / sponsored flows where account A's outgoing tx can deliver a
		// note to account B in the same hash).
		const recordA = noteRecord({
			uniqueNoteHash: validNoteHash(10),
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xA",
			contract: tokenA.contract,
			tokenId: 1,
			owner: "0xA",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xshared",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		const recordB = noteRecord({ ...recordA, uniqueNoteHash: validNoteHash(11), accountAddress: "0xB", owner: "0xB" })
		await repo.upsertRecord(recordA)
		await repo.upsertRecord(recordB)

		const deleted = vi.fn()
		service.onIncomingTransferDeleted.add(deleted)

		transaction.onTransactionAdded.invoke({ hash: "0xshared", account: "0xA", chainId: 1, calls: [] } as never)
		await flushPromises()

		// Only account A's record gone; B's stays grounding.
		expect(await repo.hasRecord(recordA.id)).toBe(false)
		expect(await repo.hasRecord(recordB.id)).toBe(true)
		expect(deleted).toHaveBeenCalledTimes(1)
	})
})

describe("IncomingTransferService — cleanup wiring", () => {
	test("clearProfile wipes records + trust for that profileId", async () => {
		const { service } = await bootService()
		await seedNote({
			uniqueNoteHash: "k1",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: "0xc",
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		await seedNote({
			uniqueNoteHash: "k2",
			profileId: "p2",
			networkId: "n1",
			accountAddress: "0xb",
			contract: "0xc",
			tokenId: 1,
			owner: "0xb",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		await seedTrustRow({ profileId: "p1", networkId: "n1", contract: "0xc", state: "trusted", updatedAt: 0 })
		await seedTrustRow({ profileId: "p2", networkId: "n1", contract: "0xc", state: "trusted", updatedAt: 0 })

		await service.clearProfile("p1")

		expect(await repo.hasRecord("note:p1|n1|k1")).toBe(false)
		expect(await repo.hasRecord("note:p2|n1|k2")).toBe(true)
		expect(await repo.getTrust("p1", "n1", "0xc")).toBeUndefined()
		expect(await repo.getTrust("p2", "n1", "0xc")).toBeDefined()
	})

	test("clearChain wipes only records + trust matching (profileId, networkId)", async () => {
		const { service } = await bootService()
		await seedNote({
			uniqueNoteHash: "k1",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: "0xc",
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		await seedNote({
			uniqueNoteHash: "k2",
			profileId: "p1",
			networkId: "n2",
			accountAddress: "0xa",
			contract: "0xc",
			tokenId: 1,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		await seedTrustRow({ profileId: "p1", networkId: "n1", contract: "0xc", state: "trusted", updatedAt: 0 })
		await seedTrustRow({ profileId: "p1", networkId: "n2", contract: "0xc", state: "trusted", updatedAt: 0 })

		await service.clearChain("p1", "n1")

		expect(await repo.hasRecord("note:p1|n1|k1")).toBe(false)
		expect(await repo.hasRecord("note:p1|n2|k2")).toBe(true)
		expect(await repo.getTrust("p1", "n1", "0xc")).toBeUndefined()
		expect(await repo.getTrust("p1", "n2", "0xc")).toBeDefined()
	})
})

describe("IncomingTransferService — Path 2 block-timestamp + token-delete wipe", () => {
	const network = () => makeNetworkStub([{ id: "n1", chainId: 1 }])
	const token = () => makeTokenStub([tokenA])

	test("(Path 2) scanContract populates blockTimestamp on insert", async () => {
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ l2BlockNumber: 42 })] }, { 42: 1_700_000_000 })
		const { service } = await bootService({ network: network(), token: token(), note: noteSvc })
		// Trust = trusted so the record persists visible immediately.
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})

		await scan(service)

		const persisted = (await repo.listRecords())[0]
		expect(persisted.blockTimestamp).toBe(1_700_000_000)
		expect(persisted.l2BlockNumber).toBe(42)
	})

	test("(Path 2) blockTimestamp lookup is memoized per scan (1 PXE call per unique block)", async () => {
		// 3 notes, 2 unique blocks → 2 PXE calls.
		const notes = [
			note({ uniqueNoteHash: validNoteHash(10), txHash: "0xt1", l2BlockNumber: 10, noteIndexInTx: 0 }),
			note({ uniqueNoteHash: validNoteHash(11), txHash: "0xt2", l2BlockNumber: 10, noteIndexInTx: 1 }),
			note({ uniqueNoteHash: validNoteHash(12), txHash: "0xt3", l2BlockNumber: 11, noteIndexInTx: 0 }),
		]
		const noteSvc = makeNoteStub({ [tokenA.contract]: notes }, { 10: 1_700_000_000, 11: 1_700_000_036 })
		const { service } = await bootService({ network: network(), token: token(), note: noteSvc })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})

		await scan(service)

		// Exactly 2 lookups (block 10 fetched once, reused; block 11 once).
		expect(noteSvc.getBlockTimestamp).toHaveBeenCalledTimes(2)
		const persisted = await repo.listRecords()
		expect(persisted.find((r) => r.l2BlockNumber === 10)?.blockTimestamp).toBe(1_700_000_000)
		expect(persisted.find((r) => r.l2BlockNumber === 11)?.blockTimestamp).toBe(1_700_000_036)
	})

	test("(Path 2) PXE failure → record still persists, blockTimestamp left undefined", async () => {
		// Mocked PXE returns undefined for the block — record persists with
		// blockTimestamp=undefined; sort path falls back to discoveredAt.
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ l2BlockNumber: 99 })] }, { 99: undefined })
		const { service } = await bootService({ network: network(), token: token(), note: noteSvc })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})

		await scan(service)

		const persisted = (await repo.listRecords())[0]
		expect(persisted.blockTimestamp).toBeUndefined()
		expect(persisted.id).toBe(noteRecordId("p1", "n1", validNoteHash(1)))
	})

	test("(token-delete wipe) onTokenDeleted purges records + resets trust to unknown", async () => {
		// Pre-seed records + trust=trusted for tokenA. Token delete should
		// wipe both, so a remove+re-add starts clean.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const { service } = await bootService({ network: network(), account: accountStub, token: tokenStub })

		await seedNote({
			uniqueNoteHash: "k1",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: tokenA.id,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx1",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
			blockTimestamp: 1_700_000_000,
		})
		await seedNote({
			uniqueNoteHash: "k2",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: tokenA.id,
			owner: "0xa",
			amountRaw: "200",
			noteHash: "0xnh2",
			txHash: "0xtx2",
			l2BlockNumber: 2,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
			blockTimestamp: 1_700_000_036,
		})
		// Unrelated contract's records must survive.
		await seedNote({
			uniqueNoteHash: "kOther",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenB.contract,
			tokenId: tokenB.id,
			owner: "0xa",
			amountRaw: "50",
			noteHash: "0xnh3",
			txHash: "0xtx3",
			l2BlockNumber: 3,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})

		const deleted = vi.fn()
		const trustChanged = vi.fn()
		service.onIncomingTransferDeleted.add(deleted)
		service.onIncomingTrustChanged.add(trustChanged)

		// Fire the token-delete event.
		tokenStub.onTokenDeleted.invoke(tokenA as never)
		await flushPromises()

		// tokenA's records wiped; tokenB's record untouched.
		expect(await repo.hasRecord("note:p1|n1|k1")).toBe(false)
		expect(await repo.hasRecord("note:p1|n1|k2")).toBe(false)
		expect(await repo.hasRecord("note:p1|n1|kOther")).toBe(true)
		expect(deleted).toHaveBeenCalledTimes(2)
		// Trust row for tokenA flipped to unknown.
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("unknown")
		expect(trustChanged).toHaveBeenCalled()
	})

	test("(token-delete wipe) trust row absent → no trustChanged emit but records still wiped", async () => {
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const { service } = await bootService({ network: network(), account: accountStub, token: tokenStub })

		await seedNote({
			uniqueNoteHash: "k1",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: tokenA.id,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx1",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		// NO trust row pre-seeded.

		const trustChanged = vi.fn()
		service.onIncomingTrustChanged.add(trustChanged)

		tokenStub.onTokenDeleted.invoke(tokenA as never)
		await flushPromises()

		expect(await repo.hasRecord("note:p1|n1|k1")).toBe(false)
		// No trust row to reset → no emit.
		expect(trustChanged).not.toHaveBeenCalled()
	})

	test("(remove + re-add) records re-index from PXE with original blockTimestamp preserved", async () => {
		// Pre-seed PXE state: note for tokenA at block 42, timestamp 1.7B.
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ l2BlockNumber: 42 })] }, { 42: 1_700_000_000 })
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const { service } = await bootService({
			network: network(),
			account: accountStub,
			token: tokenStub,
			note: noteSvc,
		})
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})

		// First scan: record persists with blockTimestamp=1.7B.
		await scan(service)
		const firstPersist = (await repo.listRecords())[0]
		expect(firstPersist.blockTimestamp).toBe(1_700_000_000)

		// Delete the token → records + trust wiped.
		tokenStub.getTokensRaw.mockResolvedValue([])
		tokenStub.onTokenDeleted.invoke(tokenA as never)
		await flushPromises()
		expect((await repo.listRecords()).length).toBe(0)

		// Simulate re-add: setTrust back to trusted (mimics the popup-add
		// auto-trust path), then re-scan.
		tokenStub.getTokensRaw.mockResolvedValue([tokenA])
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		await scan(service)

		// Re-indexed record has the ORIGINAL chain timestamp, not Date.now().
		const reindexed = (await repo.listRecords())[0]
		expect(reindexed.blockTimestamp).toBe(1_700_000_000)
		expect(reindexed.l2BlockNumber).toBe(42)
		// The id is the original's: a note's unique note hash is stable across delete + re-discover.
		expect(reindexed.id).toBe(noteRecordId("p1", "n1", validNoteHash(1)))
	})
})

describe("IncomingTransferService — deletion races and timestamp backfill", () => {
	const network = () => makeNetworkStub([{ id: "n1", chainId: 1 }])

	test("scan started BEFORE delete bails via the !token guard on token-snapshot lookup", async () => {
		// Sanity: when the delete fires before the scan begins, the
		// existing `if (!token) return` guard catches it. The generation
		// counter is for the harder mid-flight case (next test).
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA, tokenB])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ l2BlockNumber: 7 })] }, { 7: 1_700_000_007 })
		const { service } = await bootService({
			network: network(),
			account: accountStub,
			token: tokenStub,
			note: noteSvc,
		})
		tokenStub.getTokensRaw = vi.fn().mockResolvedValue([tokenB])
		tokenStub.onTokenDeleted.invoke(tokenA as never)
		await flushPromises()

		const upsertSpy = vi.spyOn((service as never as { repo: { upsertRecord: () => Promise<void> } }).repo, "upsertRecord")
		await scan(service)

		expect(upsertSpy).not.toHaveBeenCalled()
	})

	test("(legacy pin, post-lock) scan whose epoch snapshot predates a delete bails before mutating", async () => {
		// Hold getNotesRaw in flight: capture the resolver, return a pending
		// promise. The scan calls genKey-snapshot BEFORE this await, so
		// startGen=0 (no bumps yet). While the scan is parked, fire
		// onTokenDeleted (bumps to 1). Resolve getNotesRaw → scan continues,
		// per-note loop's isStale() check observes 1 !== 0 → bail.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA, tokenB])
		let resolveNotes: ((value: unknown[]) => void) | null = null
		const noteSvc = makeNoteStub({}, { 7: 1_700_000_007 })
		noteSvc.getNotesRaw = vi.fn().mockImplementation(() => {
			return new Promise<unknown[]>((resolve) => {
				resolveNotes = resolve
			})
		})
		const { service } = await bootService({
			network: network(),
			account: accountStub,
			token: tokenStub,
			note: noteSvc,
		})
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		const upsertSpy = vi.spyOn((service as never as { repo: { upsertRecord: () => Promise<void> } }).repo, "upsertRecord")

		// Start the scan but don't await — it's parked on getNotesRaw.
		const scanPromise = scan(service)
		await flushPromises()
		expect(resolveNotes).not.toBeNull()

		// Fire delete while scan is parked. This bumps the generation.
		tokenStub.getTokensRaw = vi.fn().mockResolvedValue([tokenB])
		tokenStub.onTokenDeleted.invoke(tokenA as never)
		await flushPromises()

		// Release getNotesRaw with one matching note. Scan resumes; the
		// per-note loop should immediately bail on the staleness check.
		if (resolveNotes !== null) (resolveNotes as (value: unknown[]) => void)([note({ l2BlockNumber: 7 })])
		await scanPromise

		expect(upsertSpy).not.toHaveBeenCalled()
	})

	// REMOVED: "backfill upsert ALSO bails when delete lands during PXE backfill await"
	// Pinned the old scanGenerations isStale() re-check during the backfill PXE await.
	// Under the global serviceLock, the race is structurally impossible:
	// onTokenDeleted's invoke is async but its handler acquires the lock —
	// while scan holds it across the parked PXE call, the delete handler is
	// queued. After scan completes its CS (including the backfill upsert),
	// the lock releases and the delete handler runs. End-state-correct.
	// Lock-based equivalent: LR12 in the lock-races describe block below.

	test("setTrustAllow returns false when token is no longer registered", async () => {
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([])
		const { service } = await bootService({ network: network(), account: accountStub, token: tokenStub })

		const result = await service.setTrustAllow("p1", "n1", tokenA.contract)
		expect(result).toBe(false)
	})

	test("setTrustAllow returns true on a successful flip", async () => {
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const { service } = await bootService({ network: network(), account: accountStub, token: tokenStub })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "pending",
			updatedAt: 0,
		})

		const result = await service.setTrustAllow("p1", "n1", tokenA.contract)
		expect(result).toBe(true)
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("trusted")
	})

	test("pending transition bails when delete lands during the unknown→pending window", async () => {
		// First-receive race: trust is `unknown` (no prior row), scan
		// discovers a new note for a contract, then mid-await between the
		// top-of-loop isStale check and the `setTrust("pending")` call,
		// the user removes the token. Without the new pre-flight + post-
		// await isStale checks, the scan would create a pending trust row
		// AND open a first-receive prompt for a deleted contract.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA, tokenB])
		let resolveBlockTs: ((value: number | undefined) => void) | null = null
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ l2BlockNumber: 88 })] })
		// Block the SECOND PXE call (used by the per-note loop after the
		// pending transition), but resolve the first quickly. To make this
		// surface, we use getBlockTimestamp itself as the await window —
		// it's called BEFORE upsertRecord and AFTER the pending transition.
		// Actually the simplest reproduction: block getNotesRaw, fire
		// delete BEFORE notes resolve, then check no setTrust(pending) fires.
		let resolveNotes: ((value: unknown[]) => void) | null = null
		noteSvc.getNotesRaw = vi.fn().mockImplementation(() => {
			return new Promise<unknown[]>((resolve) => {
				resolveNotes = resolve
			})
		})
		noteSvc.getBlockTimestamp = vi.fn().mockImplementation(() => {
			return new Promise<number | undefined>((resolve) => {
				resolveBlockTs = resolve
			})
		})
		const { service } = await bootService({
			network: network(),
			account: accountStub,
			token: tokenStub,
			note: noteSvc,
		})
		// NO trust row — exercises the "no prior trust row" failure mode.

		const trustChanged = vi.fn()
		const transferPending = vi.fn()
		service.onIncomingTrustChanged.add(trustChanged)
		service.onIncomingTransferPending.add(transferPending)

		const scanPromise = scan(service)
		await flushPromises()
		expect(resolveNotes).not.toBeNull()

		// Delete fires while scan is parked on getNotesRaw. Generation bumps.
		tokenStub.getTokensRaw = vi.fn().mockResolvedValue([tokenB])
		tokenStub.onTokenDeleted.invoke(tokenA as never)
		await flushPromises()

		// Resolve notes → scan resumes. Per-note loop's top-of-iteration
		// isStale() catches the race FIRST (before the pending transition).
		if (resolveNotes !== null) (resolveNotes as (value: unknown[]) => void)([note({ l2BlockNumber: 88 })])
		// resolveBlockTs may never get called if isStale bails first; that's
		// the desired outcome. We resolve it defensively to drain the test.
		if (resolveBlockTs !== null) (resolveBlockTs as (value: number | undefined) => void)(1_700_000_088)
		await scanPromise

		// Critical: NO `pending` trust row created, NO Pending event emitted.
		expect(await repo.getTrust("p1", "n1", tokenA.contract)).toBeUndefined()
		expect(transferPending).not.toHaveBeenCalled()
		// onIncomingTrustChanged should not fire from the scan path. (It
		// would normally fire from onTokenDeleted's trust-reset, but that
		// only fires when a trust row exists — and there is none here.)
		expect(trustChanged).not.toHaveBeenCalled()
	})

	test("setTrustReject returns false/true symmetrically", async () => {
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const stale = await bootService({ network: network(), account: accountStub, token: makeTokenStub([]) })
		expect(await stale.service.setTrustReject("p1", "n1", tokenA.contract)).toBe(false)

		await repo.clearProfile("p1")

		const live = await bootService({ network: network(), account: accountStub, token: makeTokenStub([tokenA]) })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "pending",
			updatedAt: 0,
		})
		expect(await live.service.setTrustReject("p1", "n1", tokenA.contract)).toBe(true)
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("blocked")
	})

	test("setTrustAllow on deleted token is a no-op", async () => {
		// Boot with NO tokens (simulates a token whose delete already ran but
		// the popup's allow closure was still queued/open).
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([])
		const { service } = await bootService({ network: network(), account: accountStub, token: tokenStub })
		// Pre-seed trust=unknown (the post-delete state).
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "unknown",
			updatedAt: 0,
		})
		const trustChanged = vi.fn()
		service.onIncomingTrustChanged.add(trustChanged)

		await service.setTrustAllow("p1", "n1", tokenA.contract)

		// Stale-popup guard: tokenService.getTokensRaw returns [] → no flip.
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("unknown")
		expect(trustChanged).not.toHaveBeenCalled()
	})

	test("setTrustReject on deleted token is a no-op", async () => {
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([])
		const { service } = await bootService({ network: network(), account: accountStub, token: tokenStub })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "unknown",
			updatedAt: 0,
		})
		const trustChanged = vi.fn()
		service.onIncomingTrustChanged.add(trustChanged)

		await service.setTrustReject("p1", "n1", tokenA.contract)

		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("unknown")
		expect(trustChanged).not.toHaveBeenCalled()
	})

	test("setTrustAllow on a still-registered token works normally", async () => {
		// Sanity: the guard MUST NOT block legitimate Allow flows.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const { service } = await bootService({ network: network(), account: accountStub, token: tokenStub })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "pending",
			updatedAt: 0,
		})

		await service.setTrustAllow("p1", "n1", tokenA.contract)

		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("trusted")
	})

	test("second scan backfills blockTimestamp after a first-scan PXE miss", async () => {
		// First-scan PXE returns undefined for block 50 → record persists
		// with blockTimestamp=undefined. On second scan, PXE is now healthy
		// for that block. The existing-record branch should detect the
		// missing field, re-call PXE, and patch via upsertRecord.
		const blockMap: Record<number, number | undefined> = { 50: undefined }
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ l2BlockNumber: 50 })] }, blockMap)
		const tokenStub = makeTokenStub([tokenA])
		const { service } = await bootService({ network: network(), token: tokenStub, note: noteSvc })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})

		await scan(service)
		const first = (await repo.listRecords())[0]
		expect(first.blockTimestamp).toBeUndefined()

		// PXE recovers: block 50 timestamp is now resolvable.
		blockMap[50] = 1_700_000_050

		await scan(service)
		const second = (await repo.listRecords())[0]
		expect(second.blockTimestamp).toBe(1_700_000_050)
		// Other fields untouched — backfill preserves the original record.
		expect(second.id).toBe(noteRecordId("p1", "n1", validNoteHash(1)))
		expect(second.l2BlockNumber).toBe(50)
	})

	test("backfill is skipped when blockTimestamp is already populated", async () => {
		// If the existing record already has blockTimestamp, the per-scan
		// branch must NOT re-call PXE (wasted RPC).
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ l2BlockNumber: 60 })] }, { 60: 1_700_000_060 })
		const tokenStub = makeTokenStub([tokenA])
		const { service } = await bootService({ network: network(), token: tokenStub, note: noteSvc })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})

		await scan(service)
		// Pre-condition: first scan persisted with timestamp.
		expect((await repo.listRecords())[0].blockTimestamp).toBe(1_700_000_060)
		const callsBeforeSecondScan = (noteSvc.getBlockTimestamp as ReturnType<typeof vi.fn>).mock.calls.length

		await scan(service)
		const callsAfterSecondScan = (noteSvc.getBlockTimestamp as ReturnType<typeof vi.fn>).mock.calls.length
		expect(callsAfterSecondScan).toBe(callsBeforeSecondScan)
	})

	test("replayPendingPrompts skips a row whose token was deleted after the snapshot", async () => {
		// replayPendingPrompts snapshots
		// `tokens = getTokensRaw(...)` before the per-row loop. If the
		// token gets deleted between that snapshot and a later iteration,
		// the snapshot still names it AND the per-row find succeeds — so
		// without a live re-check, the emit would resurrect an orphan
		// prompt. Verify the new live-token + live-trust re-checks suppress
		// the emit.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		// Stale snapshot: first getTokensRaw call (the outer snapshot)
		// returns the token; second call (the per-row live re-check)
		// returns empty. Simulates a delete landing between.
		const tokenStub = makeTokenStub([tokenA])
		let getTokensCalls = 0
		tokenStub.getTokensRaw = vi.fn().mockImplementation(async () => {
			getTokensCalls++
			return getTokensCalls === 1 ? [tokenA] : []
		})
		const { service } = await bootService({ network: network(), account: accountStub, token: tokenStub })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "pending",
			updatedAt: 0,
		})
		await seedNote({
			uniqueNoteHash: "k1",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: tokenA.id,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: true,
			discoveredAt: 0,
		})

		const seen = vi.fn()
		service.onIncomingTransferPending.add(seen)

		await service.replayPendingPrompts("p1", "n1", "0xa")

		// Live re-check fires: second getTokensRaw call returns [], the
		// `liveTokens.some(...)` check is false, the emit is suppressed.
		expect(seen).not.toHaveBeenCalled()
	})

	// Compensating-revert tests were removed. The behavior they pinned
	// (revert trust to "unknown" after detecting a stale token mid-flow) no
	// longer exists — the global service Lock (see
	// implementations-plan/archive/incoming-trust-state-machine-refactor/plan.md)
	// prevents the race those reverts recovered from. Race-ordering pins for the new lock-based
	// behavior live in the lock-races describe block below.

	test("replayPendingPrompts skips a row whose trust was reset to unknown after the snapshot", async () => {
		// Parallel case: token registration is still live, but the trust
		// row got reset to `unknown` between the listTrust snapshot and the
		// per-row emit. The live trust re-check must catch this.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const { service } = await bootService({ network: network(), account: accountStub, token: tokenStub })
		// Snapshot state: trust is `pending`.
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "pending",
			updatedAt: 0,
		})
		await seedNote({
			uniqueNoteHash: "k1",
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: tokenA.id,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh",
			txHash: "0xtx",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: true,
			discoveredAt: 0,
		})

		// Intercept repo.getTrust: snapshot listTrust returns the pending
		// row, but the per-row live getTrust returns `unknown` (simulating
		// a reset that landed after the snapshot).
		const realRepo = (service as never as { repo: { getTrust: (...args: unknown[]) => unknown } }).repo
		realRepo.getTrust = vi.fn().mockResolvedValue({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "unknown",
			updatedAt: 0,
		})

		const seen = vi.fn()
		service.onIncomingTransferPending.add(seen)

		await service.replayPendingPrompts("p1", "n1", "0xa")

		expect(seen).not.toHaveBeenCalled()
	})
})

describe("IncomingTransferService — lock-races (pins for the global serviceLock)", () => {
	const network = () => makeNetworkStub([{ id: "n1", chainId: 1 }])

	test("(LR9 reentrancy) setTrustAllow public wrapper does NOT deadlock against its own locked helper", async () => {
		// Regression pin: the public setTrustAllow acquires the serviceLock
		// once and the body uses _setTrustStateLocked (no re-acquire). If a
		// future refactor accidentally chained the public method through
		// another lock-acquiring method, the Lock primitive's non-reentrant
		// semantics would deadlock until the 5-min force-release timer fires.
		// A successful resolution under the vitest default timeout proves
		// the wrappers are split correctly.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const { service } = await bootService({ network: network(), account: accountStub, token: tokenStub })
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "pending",
			updatedAt: 0,
		})

		const ok = await service.setTrustAllow("p1", "n1", tokenA.contract)
		expect(ok).toBe(true)
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("trusted")
	})

	test("(LR12 lifecycle epoch) clearChain during in-flight scan: no records persisted post-clear", async () => {
		// Pre-seed: token + trusted trust row so scanContract would persist
		// the records it discovers. Park getNotesRaw so we can fire
		// clearChain between getNotesRaw + the per-note critical section.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		let resolveNotes: ((value: unknown[]) => void) | null = null
		const noteSvc = makeNoteStub({}, { 7: 1_700_000_007 })
		noteSvc.getNotesRaw = vi.fn().mockImplementation(() => {
			return new Promise<unknown[]>((resolve) => {
				resolveNotes = resolve
			})
		})
		const { service } = await bootService({
			network: network(),
			account: accountStub,
			token: tokenStub,
			note: noteSvc,
		})
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		const upsertSpy = vi.spyOn((service as never as { repo: { upsertRecord: () => Promise<void> } }).repo, "upsertRecord")

		// Start scan; it captures `epochAtStart = this.serviceEpoch` BEFORE
		// any await (including getNotesRaw), then parks on getNotesRaw. A
		// clearChain firing during the park acquires the lock, bumps the
		// epoch via hydrateSchedulers, and releases. When scan resumes and
		// reaches its per-note CS, `this.serviceEpoch !== epochAtStart` →
		// bail before persisting.
		const scanPromise = scan(service)
		await flushPromises()
		expect(resolveNotes).not.toBeNull()

		// Fire clearChain while scan is parked. clearChain acquires the
		// lock (no contention — scan doesn't hold the lock yet), wipes
		// trust + records, bumps serviceEpoch.
		await service.clearChain("p1", "n1")
		await flushPromises()

		// Release notes. Scan resumes; epochAtStart was captured before
		// clearChain bumped, so scan's per-note CS check observes the
		// mismatch and bails before any upsertRecord call.
		if (resolveNotes !== null) (resolveNotes as (value: unknown[]) => void)([note({ l2BlockNumber: 7 })])
		await scanPromise

		// Storage is empty + no upserts happened.
		expect((await repo.listRecords()).length).toBe(0)
		expect(upsertSpy).not.toHaveBeenCalled()
	})

	test("(LR13 profile switch invalidates in-flight scan) → no records persisted post-switch", async () => {
		// An A→B profile switch must bump
		// serviceEpoch so a scan for profile A parked on getNotesRaw can't
		// resume and emit Added events for A under B's identity. The fix
		// moves bumpServiceEpoch() into hydrateSchedulers() so every caller
		// (including onActiveProfileChanged) invalidates in-flight scans.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const profileStub = makeProfileStub({ id: "p1" })
		let resolveNotes: ((value: unknown[]) => void) | null = null
		const noteSvc = makeNoteStub({}, { 7: 1_700_000_007 })
		noteSvc.getNotesRaw = vi.fn().mockImplementation(() => {
			return new Promise<unknown[]>((resolve) => {
				resolveNotes = resolve
			})
		})
		const { service } = await bootService({
			profile: profileStub,
			network: network(),
			account: accountStub,
			token: tokenStub,
			note: noteSvc,
		})
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		const upsertSpy = vi.spyOn((service as never as { repo: { upsertRecord: () => Promise<void> } }).repo, "upsertRecord")

		// Start scan; parks on getNotesRaw.
		const scanPromise = scan(service)
		await flushPromises()
		expect(resolveNotes).not.toBeNull()

		// Profile switch fires → onActiveProfileChanged → hydrateSchedulers
		// → bumpServiceEpoch. The in-flight scan's epochAtStart is now stale.
		profileStub.onActiveProfileChanged.invoke()
		await flushPromises()

		// Release notes. Scan's per-note CS observes epoch mismatch and bails.
		if (resolveNotes !== null) (resolveNotes as (value: unknown[]) => void)([note({ l2BlockNumber: 7 })])
		await scanPromise

		expect(upsertSpy).not.toHaveBeenCalled()
	})

	test("a profile switch during onTokenAdded fences out its stale scheduler install", async () => {
		// onTokenAdded resolves the active profile, network, trust, and accounts across
		// several awaits before installing per-account note schedulers + watching the new
		// contract. A profile switch mid-flight bumps serviceEpoch (via hydrateSchedulers);
		// the resumed add must NOT graft its contract onto the now-current scheduler set.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const profileStub = makeProfileStub({ id: "p1" })
		const { service } = await bootService({ profile: profileStub, network: network(), account: accountStub, token: tokenStub })
		await flushPromises()

		const key = "n1|0xa"
		const watched = (service as never as { watchedContracts: Map<string, Set<string>> }).watchedContracts
		expect([...(watched.get(key) ?? [])]).toEqual([tokenA.contract]) // bootstrap hydrate

		// Defer the add's trust read so it parks (holding the service lock, which the
		// lock-free hydrate path does not contend) right before the scheduler install.
		const repo = (service as never as { repo: { getTrust: (...a: unknown[]) => Promise<unknown> } }).repo
		let resolveTrust!: (v: unknown) => void
		const getTrustSpy = vi.spyOn(repo, "getTrust").mockImplementation(() => new Promise((r) => (resolveTrust = r as never)))

		const addPromise = tokenStub.onTokenAdded.invoke({
			id: tokenB.id,
			profileId: "p1",
			chainId: tokenB.chainId,
			contract: tokenB.contract,
			symbol: tokenB.symbol,
			decimals: tokenB.decimals,
			name: "Token B",
		} as never)
		await flushPromises()
		expect(getTrustSpy).toHaveBeenCalled() // parked on the trust read

		// Profile switch fires → hydrateSchedulers bumps the epoch (invalidating the
		// in-flight add) and re-installs from current tokens only (tokenA).
		await profileStub.onActiveProfileChanged.invoke()
		await flushPromises()

		resolveTrust(undefined) // release the trust read; the add resumes
		await addPromise
		await flushPromises()

		// The stale add must not have watched tokenB's contract on the live scheduler.
		expect([...(watched.get(key) ?? [])]).not.toContain(tokenB.contract)
		expect([...(watched.get(key) ?? [])]).toEqual([tokenA.contract])
	})

	test("a slow hydration can't overwrite a concurrent token-add's install", async () => {
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const profileStub = makeProfileStub({ id: "p1" })
		const { service } = await bootService({ profile: profileStub, network: network(), account: accountStub, token: tokenStub })
		await flushPromises()

		const key = "n1|0xa"
		const watched = (service as never as { watchedContracts: Map<string, Set<string>> }).watchedContracts
		expect([...(watched.get(key) ?? [])]).toEqual([tokenA.contract]) // bootstrap hydrate

		// Make getAccounts deferrable via a resolver queue so hydration and the
		// token-add each park in it independently.
		const accountResolvers: ((v: unknown) => void)[] = []
		accountStub.getAccounts.mockImplementation(() => new Promise((r) => accountResolvers.push(r as never)))

		// Re-hydration starts (bumps epoch, snapshots tokens [A]) and parks in getAccounts.
		void profileStub.onActiveProfileChanged.invoke()
		await flushPromises()
		expect(accountResolvers).toHaveLength(1)

		// A token-add for a NEW contract fires while hydration is parked mid-fan-out.
		tokenStub.getTokensRaw.mockResolvedValue([tokenA, tokenB])
		void tokenStub.onTokenAdded.invoke({
			id: tokenB.id,
			profileId: "p1",
			chainId: tokenB.chainId,
			contract: tokenB.contract,
			symbol: tokenB.symbol,
			decimals: tokenB.decimals,
			name: "Token B",
		} as never)
		await flushPromises()
		expect(accountResolvers.length).toBeGreaterThanOrEqual(2)

		// Let the token-add finish first: it installs tokenB's contract on the account.
		accountResolvers[1]([{ profileId: "p1", chainId: 1, address: "0xa" }])
		await flushPromises()

		// Then let the SLOW hydration resume; its descriptor set predates the add.
		accountResolvers[0]([{ profileId: "p1", chainId: 1, address: "0xa" }])
		await flushPromises()

		// Both must survive: the token-add rebuilds from the CURRENT set (A+B), and the
		// bumped-behind slow hydration bails without clearing. Neither token is lost —
		// an epoch-bump-then-incremental-install would have kept only B (A cleared).
		expect([...(watched.get(key) ?? [])].sort()).toEqual([tokenA.contract, tokenB.contract].sort())
	})

	test("both scheduler arms register their interval BEFORE the immediate first poll", async () => {
		vi.useFakeTimers()
		try {
			const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
			const { service } = await bootService({
				profile: makeProfileStub({ id: "p1" }),
				network: makeNetworkStub(),
				account: accountStub,
				token: makeTokenStub([tokenA]),
			})
			await advance(0)
			const s = service as never as {
				schedulers: Map<string, unknown>
				publicSchedulers: Map<string, unknown>
				startScheduler(profileId: string, networkId: string, account: string): void
				startPublicScheduler(profileId: string, networkId: string, contract: string): void
				schedulerKey(networkId: string, account: string): string
				publicSchedulerKey(networkId: string, contract: string): string
				poll(...a: unknown[]): Promise<void>
				pollPublic(key: string): Promise<void>
			}
			const noteKey = s.schedulerKey("n1", "0xfresh")
			const publicKey = s.publicSchedulerKey("n1", "0xfreshcontract")
			let noteMapAtKick: boolean | undefined
			let publicMapAtKick: boolean | undefined
			vi.spyOn(s, "poll").mockImplementation(async () => {
				noteMapAtKick = s.schedulers.has(noteKey)
			})
			vi.spyOn(s, "pollPublic").mockImplementation(async () => {
				publicMapAtKick = s.publicSchedulers.has(publicKey)
			})

			s.startScheduler("p1", "n1", "0xfresh")
			s.startPublicScheduler("p1", "n1", "0xfreshcontract")

			expect(noteMapAtKick).toBe(true)
			expect(publicMapAtKick).toBe(true)
		} finally {
			vi.useRealTimers()
		}
	})

	test("an old scheduler ticking during a hydration's construction window does not scan", async () => {
		vi.useFakeTimers()
		try {
			const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
			const tokenStub = makeTokenStub([tokenA])
			const profileStub = makeProfileStub({ id: "p1" })
			const { service } = await bootService({ profile: profileStub, network: network(), account: accountStub, token: tokenStub })
			await advance(0) // drain the bootstrap hydrate

			// Poll is what a scheduler tick calls; spy AFTER boot so only later ticks count.
			const pollSpy = vi.spyOn(service as never as { poll: (...a: unknown[]) => Promise<void> }, "poll").mockResolvedValue(undefined)

			// A re-hydration bumps the epoch and PARKS in construction (deferred getAccounts),
			// so it hasn't committed (the old scheduler is not yet torn down).
			accountStub.getAccounts.mockImplementation(() => new Promise(() => {}))
			void profileStub.onActiveProfileChanged.invoke()
			await advance(0)

			// Fire the OLD scheduler's periodic tick (installed at the pre-bump epoch).
			await advance(1_000_000)

			// Its tick must bail on the creation-epoch guard: no scan under the bumped epoch.
			expect(pollSpy).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})

	test("(LR4 concurrent onTransactionAdded same hash) → exactly one Delete emit", async () => {
		// Two onTransactionAdded events for the same tx hash. The serviceLock
		// serializes them: the first runs to completion (deletes record,
		// emits Deleted), the second finds the record gone, no-ops.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const txStub = makeTransactionStub()
		const { service } = await bootService({
			network: network(),
			account: accountStub,
			token: tokenStub,
			transaction: txStub,
		})
		await seedNote({
			uniqueNoteHash: validNoteHash(1),
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: tokenA.contract,
			tokenId: tokenA.id,
			owner: "0xa",
			amountRaw: "100",
			noteHash: "0xnh1",
			txHash: "0xtx-shared",
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
		const deletedSpy = vi.fn()
		service.onIncomingTransferDeleted.add(deletedSpy)

		const tx = { hash: "0xtx-shared", chainId: 1, account: "0xa" }
		// Fire twice in the same microtask; both queue on the lock.
		const a = txStub.onTransactionAdded.invoke(tx as never)
		const b = txStub.onTransactionAdded.invoke(tx as never)
		await Promise.all([a, b])
		await flushPromises()

		expect(deletedSpy).toHaveBeenCalledTimes(1)
		expect((await repo.listRecords()).length).toBe(0)
	})

	test("(LR14 onTokenAdded auto-trusts before any scan can read unknown) → no Pending emit", async () => {
		// Manual QA pin: a user-explicit add via TokenService.addToken
		// (popup form OR dApp register_token) must NOT produce a redundant
		// trust popup moments later. The handler's first step — locked
		// trust→trusted — runs BEFORE the for-loop kicks per-account
		// schedulers, so the first per-note CS in any scan reads "trusted"
		// and persists records visible (not hidden+pending). Without this
		// pre-trust step, the user sees both the add-token approval AND
		// the subsequent first-receive popup for the same contract.
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		// Start with no tokens so bootstrap hydrateSchedulers is a no-op —
		// the test simulates a fresh first-add, not a re-hydration. Mutable
		// array so we can register tokenA after the spy is wired.
		const tokenList: (typeof tokenA)[] = []
		const tokenStub = makeTokenStub(tokenList)
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note({ l2BlockNumber: 7 })] }, { 7: 1_700_000_007 })
		const { service } = await bootService({
			network: network(),
			account: accountStub,
			token: tokenStub,
			note: noteSvc,
		})

		// Drain anything bootstrap queued before wiring spies.
		await flushPromises()

		const trustChangedSpy = vi.fn()
		const pendingSpy = vi.fn()
		service.onIncomingTrustChanged.add(trustChangedSpy)
		service.onIncomingTransferPending.add(pendingSpy)

		// Mirror TokenService.addToken: storage carries the new token
		// before onTokenAdded fires.
		tokenList.push(tokenA)

		await tokenStub.onTokenAdded.invoke({
			id: tokenA.id,
			profileId: "p1",
			chainId: tokenA.chainId,
			contract: tokenA.contract,
			symbol: tokenA.symbol,
			decimals: tokenA.decimals,
			name: "Token A",
		} as never)
		await flushPromises()

		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("trusted")
		expect(trustChangedSpy).toHaveBeenCalledTimes(1)
		expect(trustChangedSpy).toHaveBeenCalledWith(expect.objectContaining({ state: "trusted" }))
		// The immediate poll kicked by startScheduler runs scanContract for
		// the new contract. With auto-trust already set, the scan persists
		// records visible — Pending must never fire for this contract.
		expect(pendingSpy).not.toHaveBeenCalled()
	})

	test("(LR14 idempotent) onTokenAdded for already-trusted contract → no duplicate trustChanged emit", async () => {
		// If the user re-adds a contract that's already trusted (e.g., a
		// previously-imported token re-imported through a dApp's
		// register_token), the handler must not re-emit trustChanged. The
		// short-circuit reads getTrust first; only writes when state ≠
		// "trusted".
		const accountStub = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const tokenStub = makeTokenStub([tokenA])
		const { service } = await bootService({
			network: network(),
			account: accountStub,
			token: tokenStub,
		})
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})

		const trustChangedSpy = vi.fn()
		service.onIncomingTrustChanged.add(trustChangedSpy)

		await tokenStub.onTokenAdded.invoke({
			id: tokenA.id,
			profileId: "p1",
			chainId: tokenA.chainId,
			contract: tokenA.contract,
			symbol: tokenA.symbol,
			decimals: tokenA.decimals,
			name: "Token A",
		} as never)
		await flushPromises()

		expect(trustChangedSpy).not.toHaveBeenCalled()
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("trusted")
	})
})

// ── Public-event scan arm ───────────────────────────────────────────────────

function pubEvent(overrides: Partial<PublicTransferEvent> = {}): PublicTransferEvent {
	return {
		from: "0xfrom",
		to: "0xa",
		amountRaw: "100",
		txHash: "0xptx",
		l2BlockNumber: 5,
		blockHash: "0xbh5",
		blockTimestamp: 1_700_000_000,
		txIndexWithinBlock: 0,
		logIndexWithinTx: 0,
		...overrides,
	}
}

/** A receipt at `block`, its tx hash unique per block and tx index. */
const pubReceipt = (block: number, overrides: Partial<PublicTransferEvent> = {}) =>
	pubEvent({ txHash: `0x${block}-${overrides.txIndexWithinBlock ?? 0}`, l2BlockNumber: block, blockHash: `0xbh${block}`, ...overrides })
const pubRecordKey = (e: PublicTransferEvent) => `pub:p1|n1|${e.txHash}|${e.logIndexWithinTx}`
const storedBlockHash = async (e: PublicTransferEvent) => {
	const record = await repo.getRecord(pubRecordKey(e))
	return record?.kind === "public-event" ? record.blockHash : undefined
}

/** A page whose `scannedThrough` is the last event's position (or null when empty). */
function pubPage(events: PublicTransferEvent[], hasMore = false): PublicTransferPage {
	const last = events[events.length - 1]
	return {
		events,
		scannedThrough: last
			? { blockNumber: last.l2BlockNumber, txIndexWithinBlock: last.txIndexWithinBlock, logIndexWithinTx: last.logIndexWithinTx }
			: null,
		hasMore,
		dropped: false,
	}
}

/** A validator-DROPPED page (non-monotonic / beyond pinned bound): empty, `dropped:true`. */
function pubDroppedPage(): PublicTransferPage {
	return { events: [], scannedThrough: null, hasMore: false, dropped: true }
}

type ReaderResponse = PublicTransferPage | Error | ((args: PublicTransferFetchArgs) => PublicTransferPage)

const LOG_PAGE = 20
const positionOf = (e: PublicTransferEvent) => ({
	blockNumber: e.l2BlockNumber,
	txIndexWithinBlock: e.txIndexWithinBlock,
	logIndexWithinTx: e.logIndexWithinTx,
})

/** Serves `logs` as the node pages them: inside `[fromBlock, toBlock]`, after `afterCursor`, in log
 *  order, 20 a page. An ancestry probe reads no logs. */
function chainPage(logs: PublicTransferEvent[], args: PublicTransferFetchArgs): PublicTransferPage {
	if (args.verifyAncestorHash !== undefined) return pubPage([])
	const { fromBlock = 0, toBlock = Number.MAX_SAFE_INTEGER, afterCursor } = args
	const page = logs
		.filter((e) => e.l2BlockNumber >= fromBlock && e.l2BlockNumber <= toBlock)
		.filter((e) => !afterCursor || comparePublicPositions(positionOf(e), afterCursor) > 0)
		.sort((x, y) => comparePublicPositions(positionOf(x), positionOf(y)))
		.slice(0, LOG_PAGE)
	return pubPage(page, page.length === LOG_PAGE)
}

/** A queue-driven fake public-event reader. `responses` is consumed FIFO; an exhausted queue
 *  serves `chain` when set, else an empty page. A response may be an Error (thrown — reorg simulation). */
function makePublicReader(init?: { tips?: Partial<PublicScanTips>; classStatus?: PublicTokenClassStatus }) {
	const state = {
		tips: {
			checkpointedBlockNumber: 100,
			checkpointedBlockHash: "0xcheckpoint",
			finalizedBlockNumber: 50,
			proposedBlockHash: "0xproposed",
			...init?.tips,
		} as PublicScanTips,
		classStatus: (init?.classStatus ?? "standard") as PublicTokenClassStatus,
		responses: [] as ReaderResponse[],
		chain: undefined as PublicTransferEvent[] | undefined,
		fetchArgs: [] as PublicTransferFetchArgs[],
		tipsCalls: 0,
		classCalls: 0,
		reset() {
			state.responses.length = 0
			state.fetchArgs.length = 0
			state.tipsCalls = 0
			state.classCalls = 0
		},
	}
	const reader: PublicEventReader = {
		fetchTransferPage: async (_n, _c, args) => {
			state.fetchArgs.push(args)
			const next = state.responses.shift()
			if (next === undefined) return state.chain ? chainPage(state.chain, args) : pubPage([])
			if (next instanceof Error) throw next
			if (typeof next === "function") return next(args)
			return next
		},
		getScanTips: async () => {
			state.tipsCalls++
			return state.tips
		},
		getTokenClassStatus: async () => {
			state.classCalls++
			return state.classStatus
		},
		getLatestBlockNumber: async () => 0,
		getChainTipOnce: async () => 0,
	}
	return { reader, state }
}

/** One public tick on tips read through the service's own indexer, as a scheduler tick reads them. */
async function scanPublic(service: unknown, contract: string = tokenA.contract, networkId = "n1", profileId = "p1"): Promise<ScanOutcome> {
	const s = service as {
		serviceEpoch: number
		indexer: { getTips: (n: string) => Promise<PublicScanTips> }
		scanPublicContract: (p: string, n: string, c: string, tips: PublicScanTips, epoch: number) => Promise<{ outcome: ScanOutcome }>
	}
	const epoch = s.serviceEpoch
	return (await s.scanPublicContract(profileId, networkId, contract, await s.indexer.getTips(networkId), epoch)).outcome
}

/** Account stub owning `0xa` on chainId 1 — the recipient the pre-lock filter matches. */
function publicAccountStub() {
	return makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
}

/**
 * Boot the service and DRAIN the scheduler's initial public kick (which runs on an empty reader
 * queue as a no-op), then wipe the cursor/outbox rows + reset the reader counters it touched — so a
 * test drives `scanPublicContract` from a clean, controlled state.
 */
async function bootPublic(
	reader: PublicEventReader,
	state: ReturnType<typeof makePublicReader>["state"],
	stubs: Parameters<typeof bootService>[0] = {},
	opts: Parameters<typeof bootService>[1] = {},
) {
	const booted = await bootService({ account: publicAccountStub(), token: makeTokenStub([tokenA]), ...stubs, publicReader: reader }, opts)
	await flushPromises()
	await clearPublicProgress()
	// The initial kick warmed the class-gate cache, the shared tips read and the targets' marks; clear
	// them so each test starts cold.
	const warmed = booted.service as unknown as Record<
		"classGateCache" | "tipsReads" | "noteScannedAt" | "publicScannedAt",
		Map<string, unknown>
	>
	for (const cache of [warmed.classGateCache, warmed.tipsReads, warmed.noteScannedAt, warmed.publicScannedAt]) cache.clear()
	state.reset()
	return booted
}

/** Deletes every cursor and outbox row, each by the scope its key names. */
async function clearPublicProgress(): Promise<void> {
	for (const [key] of await repo.listCursors()) {
		const [profileId, networkId, contract] = key.split("|")
		await repo.deleteCursor(profileId, networkId, contract)
	}
	for (const [key] of await repo.listOutbox()) {
		const [profileId, networkId, account, tokenId] = key.split("|")
		await repo.deleteOutbox(profileId, networkId, account, Number(tokenId))
	}
}

const cursorFor = (c: string = tokenA.contract) => repo.getCursor("p1", "n1", c)
const outboxFor = (account = "0xa", tokenId = tokenA.id) => repo.getOutbox("p1", "n1", account, tokenId)

describe("IncomingTransferService — public-event scan arm", () => {
	test("public first-receive: creates a hidden record, trust unknown→pending, emits Pending, writes outbox", async () => {
		const { reader, state } = makePublicReader()
		const pending = vi.fn()
		const { service } = await bootPublic(reader, state)
		service.onIncomingTransferPending.add(pending)
		state.responses.push(pubPage([pubEvent({ txHash: "0xp1", amountRaw: "777" })]))

		await scanPublic(service)

		const rec = await repo.getRecord("pub:p1|n1|0xp1|0")
		expect(rec?.kind).toBe("public-event")
		expect(rec?.hidden).toBe(true)
		expect(rec?.amountRaw).toBe("777")
		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("pending")
		expect(pending).toHaveBeenCalledTimes(1)
		expect(await outboxFor()).toBeDefined()
	})

	test("auto-trusted token: public receipt inserts VISIBLE + emits Added", async () => {
		const { reader, state } = makePublicReader()
		const added = vi.fn()
		const { service } = await bootPublic(reader, state)
		service.onIncomingTransferAdded.add(added)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		state.responses.push(pubPage([pubEvent({ txHash: "0xp2" })]))

		await scanPublic(service)

		expect((await repo.getRecord("pub:p1|n1|0xp2|0"))?.hidden).toBe(false)
		expect(added).toHaveBeenCalledTimes(1)
	})

	test("dedupe vs own outgoing public tx: matching txHash → no record, no outbox", async () => {
		const { reader, state } = makePublicReader()
		const txStub = makeTransactionStub([{ hash: "0xmine", account: "0xa", chainId: 1, profileId: "p1", networkId: "n1" }])
		const { service } = await bootPublic(reader, state, { transaction: txStub })
		state.responses.push(pubPage([pubEvent({ txHash: "0xmine" })]))

		await scanPublic(service)

		expect(await repo.getRecord("pub:p1|n1|0xmine|0")).toBeUndefined()
		expect(await outboxFor()).toBeUndefined()
	})

	test("a FOREIGN profile's outgoing tx does not suppress this scope's public event", async () => {
		// p2 shares address 0xa (same seed) and sent 0xtheirs on the same chain.
		// From p1's silo that send is someone else's activity — the event must
		// surface as incoming, exactly like another device's outgoing does.
		const { reader, state } = makePublicReader()
		const txStub = makeTransactionStub([{ hash: "0xtheirs", account: "0xa", chainId: 1, profileId: "p2", networkId: "n9" }])
		const { service } = await bootPublic(reader, state, { transaction: txStub })
		state.responses.push(pubPage([pubEvent({ txHash: "0xtheirs" })]))

		await scanPublic(service)

		expect(await repo.getRecord("pub:p1|n1|0xtheirs|0")).toBeDefined()
	})

	test("MAGIC (from-private) and zero (mint) senders stored raw; both create records", async () => {
		const MAGIC = "0x0000000000000000000000000000000000000000000000000000000000001111"
		const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000"
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		state.responses.push(
			pubPage([pubEvent({ txHash: "0xfromPriv", from: MAGIC }), pubEvent({ txHash: "0xmint", from: ZERO, txIndexWithinBlock: 1 })]),
		)

		await scanPublic(service)

		const priv = await repo.getRecord("pub:p1|n1|0xfromPriv|0")
		const mint = await repo.getRecord("pub:p1|n1|0xmint|0")
		expect(priv?.kind === "public-event" && priv.from).toBe(MAGIC)
		expect(mint?.kind === "public-event" && mint.from).toBe(ZERO)
	})

	test("non-recipient events advance the cursor but create NO record (pre-lock filter)", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		state.responses.push(pubPage([pubEvent({ txHash: "0xother", to: "0xNOTME" })]))

		await scanPublic(service)

		expect((await repo.listRecords()).map((r) => r.id).filter((k) => k.startsWith("pub:"))).toHaveLength(0)
		expect((await cursorFor())?.cursor).toEqual({ blockNumber: 5, txIndexWithinBlock: 0, logIndexWithinTx: 0 })
	})

	test("non-standard class → NO scan (fail closed): no fetch, no records", async () => {
		const { reader, state } = makePublicReader({ classStatus: "non-standard" })
		const { service } = await bootPublic(reader, state)
		state.responses.push(pubPage([pubEvent({ txHash: "0xnope" })]))

		await scanPublic(service)

		expect(await repo.getRecord("pub:p1|n1|0xnope|0")).toBeUndefined()
		expect(state.fetchArgs).toHaveLength(0)
	})

	test("unresolved class → fail closed AND not cached (re-probes next tick)", async () => {
		const { reader, state } = makePublicReader({ classStatus: "unresolved" })
		const { service } = await bootPublic(reader, state)

		await scanPublic(service)
		await scanPublic(service)

		expect(state.classCalls).toBe(2)
	})

	test("class gate cached by BOTH tips: re-resolves on a finalized OR a checkpointed advance", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)

		await scanPublic(service)
		await scanPublic(service)
		expect(state.classCalls).toBe(1) // same tips across both ticks → cached

		state.tips = { ...state.tips, finalizedBlockNumber: 60 }
		await scanPublic(service)
		expect(state.classCalls).toBe(2) // finalized advanced → re-resolve

		// A checkpoint HASH change ALSO re-resolves — including a SAME-HEIGHT reorg (a number-keyed
		// cache would miss it) — else a mid-cache malicious upgrade at checkpointed would be served a
		// stale "standard".
		state.tips = { ...state.tips, checkpointedBlockHash: "0xcheckpoint-reorged" }
		await scanPublic(service)
		expect(state.classCalls).toBe(3)
	})

	test("partial-page cursor advance: next tick resumes afterCursor", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		state.responses.push(pubPage([pubEvent({ txHash: "0xa1", l2BlockNumber: 7, logIndexWithinTx: 3 })], false))

		await scanPublic(service)
		expect((await cursorFor())?.cursor).toEqual({ blockNumber: 7, txIndexWithinBlock: 0, logIndexWithinTx: 3 })
		expect(await repo.getRecord("pub:p1|n1|0xa1|3")).toBeDefined()

		await scanPublic(service) // empty page
		expect(state.fetchArgs[state.fetchArgs.length - 1].afterCursor).toEqual({
			blockNumber: 7,
			txIndexWithinBlock: 0,
			logIndexWithinTx: 3,
		})
	})

	test("page-budget: all 5 budgeted pages fetched; cursor at the last page; every page pins the checkpoint hash", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		for (let i = 0; i < 5; i++) state.responses.push(pubPage([pubEvent({ txHash: `0xb${i}`, l2BlockNumber: 10 + i })], true))

		await scanPublic(service)

		// Fresh cursor (no boundary probe) → exactly 5 page fetches, each pinned to the checkpoint FORK
		// HASH so a mid-scan reorg throws on the offending page.
		expect(state.fetchArgs).toHaveLength(5)
		expect(state.fetchArgs.every((a) => a.referenceBlock === "0xcheckpoint")).toBe(true)
		expect(state.fetchArgs[0].toBlock).toBe(100) // pinned to tips.checkpointedBlockNumber
		expect((await cursorFor())?.cursor).toEqual({ blockNumber: 14, txIndexWithinBlock: 0, logIndexWithinTx: 0 })
	})

	test("same-tx note + public event yield TWO records under disjoint PKs", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedNote({
			uniqueNoteHash: "sn-shared",
			txHash: "0xshared",
			contract: tokenA.contract,
			tokenId: tokenA.id,
			accountAddress: "0xa",
		})
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		state.responses.push(pubPage([pubEvent({ txHash: "0xshared" })]))

		await scanPublic(service)

		expect(await repo.getRecord("note:p1|n1|sn-shared")).toBeDefined()
		expect(await repo.getRecord("pub:p1|n1|0xshared|0")).toBeDefined()
	})

	test("chain-purge mid-scan (epoch bump via clearChain) → the page's record is NOT persisted", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		state.responses.push(pubPage([pubEvent({ txHash: "0xrace" })]))

		const scanP = scanPublic(service)
		await service.clearChain("p1", "n1") // bumps serviceEpoch mid-flight
		await scanP

		expect(await repo.getRecord("pub:p1|n1|0xrace|0")).toBeUndefined()
	})
})

// ── Public-event reorg reconciliation ───────────────────────────────────────

async function seedPublic(overrides: Partial<IncomingPublicEventRecord> = {}): Promise<IncomingPublicEventRecord> {
	const merged = {
		kind: "public-event" as const,
		from: "0xfrom",
		blockHash: "0xbh",
		profileId: "p1",
		networkId: "n1",
		accountAddress: "0xa",
		contract: tokenA.contract,
		tokenId: tokenA.id,
		amountRaw: "100",
		txHash: "0xptx",
		l2BlockNumber: 5,
		txIndexInBlock: 0,
		indexInTx: 0,
		hidden: false,
		discoveredAt: 0,
		...overrides,
	}
	const rec: IncomingPublicEventRecord = {
		...merged,
		id: `pub:${merged.profileId}|${merged.networkId}|${merged.txHash}|${merged.indexInTx}`,
	}
	await repo.upsertRecord(rec)
	return rec
}

async function seedCursor(overrides: Partial<PublicScanCursor> = {}, contract = tokenA.contract): Promise<void> {
	await repo.setCursor("p1", "n1", contract, {
		cursor: null,
		lastSyncedBlockHash: null,
		lastScanFinalized: null,
		startBlock: 0,
		...overrides,
	})
}

describe("IncomingTransferService — public-event reorg reconciliation", () => {
	test("referenceBlock throw → reconcile: orphan (blockHash ≠ canonical) deleted, balance refresh enqueued BEFORE delete, rewind to lastScanFinalized", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		const orphan = await seedPublic({ txHash: "0xorphan", l2BlockNumber: 8, blockHash: "0xoldfork" })
		await seedCursor({
			cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xoldfork",
			lastScanFinalized: 5,
		})
		state.responses.push(new Error("referenceBlock reorged out")) // forward scan detects the reorg
		state.responses.push(pubPage([])) // reconcile window has NO canonical event at block 8

		const deleted = vi.fn()
		service.onIncomingTransferDeleted.add(deleted)

		await scanPublic(service)

		expect(await repo.getRecord(orphan.id)).toBeUndefined()
		expect(deleted).toHaveBeenCalledTimes(1)
		expect(await outboxFor()).toBeDefined()
		expect(state.fetchArgs[1].fromBlock).toBe(6) // lastScanFinalized(5)+1, NOT current finalized(50)
		expect(state.fetchArgs[1].referenceBlock).toBe("0xcheckpoint")
		expect((await cursorFor())?.reconciling).toBeUndefined()
	})

	test("still-canonical record (blockHash matches) is KEPT across reconciliation", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		const rec = await seedPublic({ txHash: "0xkeep", l2BlockNumber: 8, blockHash: "0xcanon8" })
		await seedCursor({
			cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xanchor",
			lastScanFinalized: 5,
		})
		state.responses.push(new Error("reorg"))
		state.responses.push(pubPage([pubEvent({ txHash: "0xkeep", l2BlockNumber: 8, blockHash: "0xcanon8" })]))

		await scanPublic(service)

		expect(await repo.getRecord(rec.id)).toBeDefined()
	})

	test("deletion driven ONLY by blockHash canonicality — a different-recipient orphan-height still deletes our record", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		const orphan = await seedPublic({ txHash: "0xorph2", l2BlockNumber: 8, blockHash: "0xoldfork" })
		await seedCursor({
			cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xoldfork",
			lastScanFinalized: 5,
		})
		state.responses.push(new Error("reorg"))
		state.responses.push(pubPage([pubEvent({ txHash: "0xelse", to: "0xNOTME", l2BlockNumber: 8, blockHash: "0xnewfork" })]))

		await scanPublic(service)

		expect(await repo.getRecord(orphan.id)).toBeUndefined() // deleted on hash mismatch (0xoldfork ≠ 0xnewfork)
	})

	test("mid-reconcile reorg (upperBoundHash gone) → discard + restart (no cross-fork seen mixing)", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedCursor({
			cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xoldfork",
			lastScanFinalized: 5,
		})
		state.responses.push(new Error("reorg")) // forward scan detects reorg
		state.responses.push(new Error("upperBoundHash reorged mid-reconcile")) // reconcile throws → restart
		state.responses.push(pubPage([])) // restarted reconcile completes

		await scanPublic(service)

		expect(state.fetchArgs.length).toBeGreaterThanOrEqual(3)
		expect((await cursorFor())?.reconciling).toBeUndefined()
	})

	test("a budget-incomplete forward scan CAPS the finalized watermark at the scanned block (no reconcile-gap)", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		state.tips = {
			checkpointedBlockNumber: 100,
			checkpointedBlockHash: "0xcheckpoint",
			finalizedBlockNumber: 90,
			proposedBlockHash: "0xproposed",
		}
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		await seedCursor({ cursor: null, lastSyncedBlockHash: null, lastScanFinalized: 0, startBlock: 0 })
		// 5 FULL pages (budget exhausted → hasMore) whose last log sits at block 10, far below finality
		// (90): the scan is BEHIND. Non-recipient events so they only advance the cursor.
		for (let i = 0; i < 5; i++) {
			state.responses.push(pubPage([pubEvent({ txHash: `0x${i}`, to: "0xNOTME", l2BlockNumber: 6 + i, logIndexWithinTx: i })], true))
		}

		await scanPublic(service)

		// The watermark must NOT jump to finalized(90) — that would let a later reconcile skip the
		// unscanned logs in (9, 90]. It is capped at the last FULLY-scanned block: block 10 is only
		// PARTIALLY scanned (the budget stopped mid-block), so the floor is block 10 − 1 = 9.
		expect((await cursorFor())?.cursor).toEqual({ blockNumber: 10, txIndexWithinBlock: 0, logIndexWithinTx: 4 })
		expect((await cursorFor())?.lastScanFinalized).toBe(9)
	})

	test("checkpoint ROLLBACK: records above the new (rolled-back) tip are deleted + cursor rewinds", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		// Records committed when the checkpoint was 100 — now stranded above a rolled-back tip of 90.
		const above1 = await seedPublic({ txHash: "0xrb1", l2BlockNumber: 95, blockHash: "0xh95" })
		const above2 = await seedPublic({ txHash: "0xrb2", l2BlockNumber: 100, blockHash: "0xh100" })
		const belowFloor = await seedPublic({ txHash: "0xfin", l2BlockNumber: 50, blockHash: "0xh50" }) // finalized — kept
		await seedCursor({
			cursor: { blockNumber: 100, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xoldcheckpoint",
			lastScanFinalized: 60,
		})
		// The node has rolled the checkpoint back to 90 (proven tip). The boundary ancestry probe fails
		// (old anchor not in the new archive) → reconcile over [61..90], which is empty.
		state.tips = {
			checkpointedBlockNumber: 90,
			checkpointedBlockHash: "0xnewcheckpoint",
			finalizedBlockNumber: 60,
			proposedBlockHash: "0xnewproposed",
		}
		state.responses.push(new Error("old checkpoint not an ancestor")) // boundary ancestry throws
		state.responses.push(pubPage([])) // reconcile window [61..90] empty

		const deleted = vi.fn()
		service.onIncomingTransferDeleted.add(deleted)

		await scanPublic(service)

		// Stranded rows above the new tip (90) are deleted; the finalized row (≤ floor) is kept.
		expect(await repo.getRecord(above1.id)).toBeUndefined()
		expect(await repo.getRecord(above2.id)).toBeUndefined()
		expect(await repo.getRecord(belowFloor.id)).toBeDefined()
		// The cursor (was 100, above the new tip) is rewound to null so a re-advancing checkpoint re-indexes.
		expect((await cursorFor())?.cursor).toBeNull()
		expect((await cursorFor())?.reconciling).toBeUndefined()
	})

	test("pendingPage crash window: a set pendingPage whose fork is gone triggers reconciliation", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		const orphan = await seedPublic({ txHash: "0xpp", l2BlockNumber: 8, blockHash: "0xoldfork" })
		await seedCursor({
			cursor: { blockNumber: 7, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xanchor",
			lastScanFinalized: 5,
			pendingPage: {
				fromCursor: { blockNumber: 7, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
				toScannedThrough: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
				upperHash: "0xoldfork",
			},
		})
		state.responses.push(new Error("pendingPage upperHash not an ancestor")) // ancestry probe throws → reconcile
		state.responses.push(pubPage([])) // reconcile window empty → orphan deleted

		await scanPublic(service)

		// The pendingPage recovery is an ATOMIC ancestry probe rooted at the CURRENT checkpoint hash
		// (not a standalone canonicity fetch of the stale upperHash).
		expect(state.fetchArgs[0].referenceBlock).toBe("0xcheckpoint")
		expect(state.fetchArgs[0].verifyAncestorHash).toBe("0xoldfork")
		expect(await repo.getRecord(orphan.id)).toBeUndefined()
		expect((await cursorFor())?.pendingPage).toBeUndefined()
	})

	test("clean pendingPage is cleared; forward scan proceeds", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedCursor({
			cursor: { blockNumber: 7, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xanchor",
			lastScanFinalized: 5,
			pendingPage: {
				fromCursor: null,
				toScannedThrough: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
				upperHash: "0xgoodfork",
			},
		})
		state.responses.push(pubPage([])) // probe succeeds
		state.responses.push(pubPage([])) // forward scan: nothing new

		await scanPublic(service)

		expect((await cursorFor())?.pendingPage).toBeUndefined()
	})

	test("intra-scan reorg: a page read off the wrong fork throws on the pinned checkpoint hash → reconcile, mixed-fork batch NEVER committed", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		await seedCursor({
			cursor: { blockNumber: 4, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xboundary",
			lastScanFinalized: 3,
		})
		// (0) boundary probe: the low anchor is still canonical. (1) page 1 fetched OK against the
		// pinned checkpoint hash. (2) page 2 THROWS — the checkpoint fork was rewritten mid-scan, so the
		// second page can't validate against H_checkpoint. (3) restarted reconcile window is empty.
		state.responses.push(pubPage([])) // boundary probe OK
		state.responses.push(pubPage([pubEvent({ txHash: "0xp1e", l2BlockNumber: 6 })], true))
		state.responses.push(new Error("checkpoint hash reorged mid-scan")) // page 2 pinned-anchor throw
		state.responses.push(pubPage([])) // reconcile window

		await scanPublic(service)

		// page 1's event was NEVER committed (the scan threw before the commit loop)…
		expect(await repo.getRecord("pub:p1|n1|0xp1e|0")).toBeUndefined()
		// …every forward page pinned the checkpoint hash…
		expect(state.fetchArgs[1].referenceBlock).toBe("0xcheckpoint")
		// …and reconciliation ran to completion (marker cleared).
		expect((await cursorFor())?.reconciling).toBeUndefined()
	})

	test("forward scan runs an ATOMIC boundary-ancestry probe first; a non-ancestor → reconcile", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		const orphan = await seedPublic({ txHash: "0xbnd", l2BlockNumber: 8, blockHash: "0xoldfork" })
		await seedCursor({
			cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xoldfork",
			lastScanFinalized: 5,
		})
		state.responses.push(new Error("boundary is not an ancestor of the checkpoint")) // the ancestry probe throws
		state.responses.push(pubPage([])) // reconcile window empty → orphan deleted

		await scanPublic(service)

		// The boundary probe is anchored to the CHECKPOINT hash and proves the boundary is its ancestor
		// (one atomic membership query — not two independent "canonical now" probes).
		expect(state.fetchArgs[0].referenceBlock).toBe("0xcheckpoint")
		expect(state.fetchArgs[0].verifyAncestorHash).toBe("0xoldfork")
		expect(await repo.getRecord(orphan.id)).toBeUndefined()
	})

	test("a DROPPED reconcile page does NOT finish reconciliation (no deletion) — retries next tick", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		const rec = await seedPublic({ txHash: "0xkeepme", l2BlockNumber: 7, blockHash: "0xcanon7" })
		// A reconciliation already staged over [6..8].
		await seedCursor({
			cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xanchor",
			lastScanFinalized: 5,
			reconciling: { lowerBound: 6, upperBound: 8, upperBoundHash: "0xcheckpoint", progress: null, seen: [] },
		})
		// The reconcile scan returns a validator-DROPPED page (hostile/glitched node), NOT a genuine EOF.
		state.responses.push(pubDroppedPage())

		const deleted = vi.fn()
		service.onIncomingTransferDeleted.add(deleted)

		await scanPublic(service)

		// A dropped page is NOT "window complete": the record must survive and the marker must remain.
		expect(await repo.getRecord(rec.id)).toBeDefined()
		expect(deleted).not.toHaveBeenCalled()
		expect((await cursorFor())?.reconciling).toBeDefined()
	})
})

describe("IncomingTransferService — public-arm lifecycle", () => {
	test("onAccountAdded resets public cursors to null (rescan the new account's history)", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedCursor({
			cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xh",
			lastScanFinalized: 5,
		})

		await (service as unknown as { onAccountAdded: (a: unknown) => Promise<void> }).onAccountAdded({ chainId: 1, address: "0xnew" })

		expect((await cursorFor())?.cursor).toBeNull()
		expect((await cursorFor())?.lastSyncedBlockHash).toBeNull()
	})

	test("onAccountAdded bumps the epoch DURING the reset — a pre-reset persist is rejected", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedCursor({
			cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastSyncedBlockHash: "0xh",
			lastScanFinalized: 5,
		})
		const svc = service as unknown as {
			serviceEpoch: number
			onAccountAdded: (a: unknown) => Promise<void>
			persistCursorLocked: (p: string, n: string, c: string, cur: unknown, e: number) => Promise<boolean>
		}
		const epochBefore = svc.serviceEpoch

		await svc.onAccountAdded({ chainId: 1, address: "0xnew" })

		// The reset ran under a bumped epoch, so a persist carrying the PRE-reset epoch (an in-flight
		// scan) is now rejected — closing the window where it could overwrite the cursor reset.
		expect(svc.serviceEpoch).toBeGreaterThan(epochBefore)
		const persisted = await svc.persistCursorLocked(
			"p1",
			"n1",
			tokenA.contract,
			{
				cursor: { blockNumber: 99, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
				lastSyncedBlockHash: "0xstale",
				lastScanFinalized: 5,
				startBlock: 0,
			},
			epochBefore,
		)
		expect(persisted).toBe(false)
		expect((await cursorFor())?.cursor).toBeNull() // still the reset value, not the stale 99
	})

	test("onTokenDeleted deletes the cursor row (re-add re-indexes from startBlock)", async () => {
		const { reader, state } = makePublicReader()
		const tokens = makeTokenStub([tokenA])
		const { service } = await bootPublic(reader, state, { token: tokens })
		await seedCursor({ cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 } })
		await seedPublic({ txHash: "0xtok", l2BlockNumber: 8 })

		// The token service deletes the row before it emits, so the rebuild ending the handler no longer
		// lists the token; a stub still listing it re-installs the scan, whose first tick writes a cursor.
		tokens.getTokensRaw.mockResolvedValue([])
		await (service as unknown as { onTokenDeleted: (t: unknown) => Promise<void> }).onTokenDeleted({
			id: tokenA.id,
			profileId: "p1",
			chainId: 1,
			contract: tokenA.contract,
		})
		await flushPromises()

		expect(await cursorFor()).toBeUndefined()
	})

	test("clearChain wipes the public cursor + outbox rows too", async () => {
		const { reader, state } = makePublicReader()
		const tokens = makeTokenStub([tokenA])
		const { service } = await bootPublic(reader, state, { token: tokens })
		await seedCursor({ cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 } })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 1 })
		expect(await cursorFor()).toBeDefined()
		expect(await outboxFor()).toBeDefined()

		// A chain purge runs the token service's subscriber first, so the rebuild ending the clear lists
		// no token on the chain; a stub still listing one re-installs the scan, whose first tick writes a cursor.
		tokens.getTokensRaw.mockResolvedValue([])
		await service.clearChain("p1", "n1")
		await flushPromises()

		expect(await cursorFor()).toBeUndefined()
		expect(await outboxFor()).toBeUndefined()
	})
})

// ── Balance-refresh outbox drain (causal task-anchored ack) ─────────────────

async function drain(service: unknown): Promise<void> {
	await (service as { outbox: BalanceRefreshOutbox }).outbox.drain()
}

describe("IncomingTransferService — balance-refresh outbox (write-side)", () => {
	test("a public receipt of a blocked contract stores no record and marks no balance dirty", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "blocked",
			updatedAt: 0,
		})
		state.responses.push(pubPage([pubEvent({ txHash: "0xblocked" })]))

		const setOutbox = vi.spyOn((service as never as { repo: IncomingTransferRepository }).repo, "setOutbox")
		await scanPublic(service)

		expect(await repo.hasRecord("pub:p1|n1|0xblocked|0")).toBe(false)
		expect(setOutbox).not.toHaveBeenCalled()
		expect(await outboxFor()).toBeUndefined()
	})

	test("coalescing: N receipts for one (account, token) → ONE outbox row", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
		state.responses.push(pubPage([pubEvent({ txHash: "0xr1" }), pubEvent({ txHash: "0xr2", txIndexWithinBlock: 1 })]))

		await scanPublic(service)

		expect((await repo.listOutbox()).filter(([k]) => k.startsWith("p1|n1|0xa|"))).toHaveLength(1)
	})

	test("private-arm parity: a discovered NOTE marks the balance dirty too", async () => {
		const noteStub = makeNoteStub({ [tokenA.contract]: [note({ content: { value: "1000" } })] })
		const { service } = await bootService({
			account: publicAccountStub(),
			token: makeTokenStub([tokenA]),
			note: noteStub,
		})
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})

		await scan(service, tokenA.contract)

		expect(await repo.getOutbox("p1", "n1", "0xa", 1)).toBeDefined()
	})
})

describe("IncomingTransferService — balance-refresh drain (causal ack)", () => {
	test("row deleted ONLY on its pendingTaskId's terminal-SUCCESS, NOT on the enqueue return", async () => {
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const task = makeTaskStub()
		const { service } = await bootPublic(reader, state, { tokenBalance, task })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		tokenBalance.setResult({ taskId: "T1" })

		await drain(service) // requests refresh, anchors T1 — row REMAINS
		expect((await outboxFor())?.pendingTaskId).toBe("T1")

		task.setTask("T1", TaskStatus.Processing) // not terminal
		await drain(service)
		expect(await outboxFor()).toBeDefined() // still there

		task.setTask("T1", TaskStatus.Completed, Date.now()) // terminal-success
		await drain(service)
		expect(await outboxFor()).toBeUndefined() // NOW deleted
	})

	test("in-flight-coalescing interleave: T1 succeeds while B is busy → B's row survives until a FRESH T2 succeeds", async () => {
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const task = makeTaskStub()
		const { service } = await bootPublic(reader, state, { tokenBalance, task })

		// Receipt A: drain anchors a fresh T1.
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		tokenBalance.setResult({ taskId: "T1" })
		await drain(service)
		expect((await outboxFor())?.pendingTaskId).toBe("T1")

		// Receipt B arrives (clears the anchor, newer dirtyAt); the drain finds T1 still pending → busy.
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 200 })
		tokenBalance.setResult({ busy: true })
		await drain(service)
		expect(await outboxFor()).toEqual({ dirtyAt: 200 }) // unanchored

		// T1 completes on pre-B chain state — but B's row has NO anchor, so it is NOT deleted.
		task.setTask("T1", TaskStatus.Completed, Date.now())
		await drain(service)
		expect(await outboxFor()).toBeDefined()

		// A later drain (T1 drained) mints a FRESH T2 (created after dirtyAt=200) and anchors it.
		tokenBalance.setResult({ taskId: "T2" })
		await drain(service)
		expect((await outboxFor())?.pendingTaskId).toBe("T2")

		// T2 succeeds → its projection saw receipt B → row deletes.
		task.setTask("T2", TaskStatus.Completed, Date.now())
		await drain(service)
		expect(await outboxFor()).toBeUndefined()
	})

	test("a new receipt CLEARS the prior anchor + OVERWRITES dirtyAt", async () => {
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const { service } = await bootPublic(reader, state, { tokenBalance })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		tokenBalance.setResult({ taskId: "T1" })
		await drain(service)
		expect((await outboxFor())?.pendingTaskId).toBe("T1")

		// markDirty (via a fresh receipt) overwrites the whole row.
		await (service as unknown as { outbox: BalanceRefreshOutbox }).outbox.markDirty("p1", "n1", "0xa", 1)
		expect((await outboxFor())?.pendingTaskId).toBeUndefined()
		expect((await outboxFor())?.dirtyAt).toBeGreaterThan(100)
	})

	test("task terminal-FAILURE → clear anchor + re-request next drain", async () => {
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const task = makeTaskStub()
		const { service } = await bootPublic(reader, state, { tokenBalance, task })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		tokenBalance.setResult({ taskId: "T1" })
		await drain(service)

		task.setTask("T1", TaskStatus.Failed, Date.now())
		await drain(service)
		expect((await outboxFor())?.pendingTaskId).toBeUndefined() // anchor cleared

		tokenBalance.setResult({ taskId: "T2" })
		await drain(service)
		expect((await outboxFor())?.pendingTaskId).toBe("T2") // re-requested
	})

	test("task MISSING (expired / never existed) → clear anchor + re-request", async () => {
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const task = makeTaskStub()
		const { service } = await bootPublic(reader, state, { tokenBalance, task })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100, pendingTaskId: "GONE" }) // anchor to a task the ledger doesn't have
		tokenBalance.setResult({ taskId: "T2" })

		await drain(service) // GONE is missing → clear anchor
		expect((await outboxFor())?.pendingTaskId).toBeUndefined()
		await drain(service) // re-request
		expect((await outboxFor())?.pendingTaskId).toBe("T2")
	})

	test("active-profile-scoped: a BACKGROUND profile's outbox row is NOT drained", async () => {
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const { service } = await bootPublic(reader, state, { tokenBalance })
		await repo.setOutbox("p2", "n1", "0xa", 1, { dirtyAt: 100 }) // p2 is NOT the active profile (p1)

		await drain(service)

		expect(tokenBalance.requestBalanceRefresh).not.toHaveBeenCalled()
		expect(await repo.getOutbox("p2", "n1", "0xa", 1)).toBeDefined() // untouched
	})

	test("stale-row tolerance: a POSITIVELY-missing balance ({missing:true}) → row deleted, never throws", async () => {
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const { service } = await bootPublic(reader, state, { tokenBalance })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		tokenBalance.setResult({ missing: true })

		await drain(service)

		expect(await outboxFor()).toBeUndefined()
	})

	test("a TRANSIENT refresh throw KEEPS the row (never discards the durable marker)", async () => {
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const { service } = await bootPublic(reader, state, { tokenBalance })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		tokenBalance.setThrow(true) // a transient storage/task failure, NOT a missing pair

		await drain(service) // must not throw

		expect(await outboxFor()).toBeDefined() // row preserved for the next drain
		expect((await outboxFor())?.pendingTaskId).toBeUndefined() // and left unanchored
	})

	test("drain-on-init after simulated SW death: the row survives + a refresh is re-requested", async () => {
		// Seed a persisted outbox row BEFORE boot (as if the SW died with a pending refresh).
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		const tokenBalance = makeTokenBalanceStub()
		tokenBalance.setResult({ taskId: "T1" })
		await bootService({ account: publicAccountStub(), token: makeTokenStub([tokenA]), tokenBalance })
		await flushPromises()

		expect(tokenBalance.requestBalanceRefresh).toHaveBeenCalledWith(1, "0xa")
		expect((await outboxFor())?.pendingTaskId).toBe("T1")
	})
})

// ── USD-value dust filter in getIncomingTransfers ───────────────────────────

// A (chainId, contract) the price map recognizes: CHAIN_IDS.TESTNET + Test USDC → USDC.
const MAPPED_CHAIN = CHAIN_IDS.TESTNET
const MAPPED_CONTRACT = TEST_TOKENS.USDC
const mappedToken = { id: 9, profileId: "p1", chainId: MAPPED_CHAIN, contract: MAPPED_CONTRACT, symbol: "cUSD", decimals: 6 }

async function bootDust(overrides: { threshold?: number; quotes?: Record<string, { usd: number }>; visibility?: boolean } = {}) {
	const config = makeConfigStub(overrides.visibility ?? true)
	const price = makePriceStub()
	const booted = await bootService({
		network: makeNetworkStub([{ id: "nMain", chainId: MAPPED_CHAIN }]),
		account: makeAccountStub([{ profileId: "p1", chainId: MAPPED_CHAIN, address: "0xa" }]),
		token: makeTokenStub([mappedToken]),
		config,
		price,
	})
	await flushPromises()
	if (overrides.quotes) price.setQuotes(overrides.quotes)
	if (overrides.threshold !== undefined) config.setDustThreshold(overrides.threshold)
	return booted.service
}

const dustSeed = (uniqueNoteHash: string, amountRaw: string) =>
	seedNote({
		uniqueNoteHash,
		networkId: "nMain",
		accountAddress: "0xa",
		contract: MAPPED_CONTRACT,
		tokenId: 9,
		amountRaw,
		hidden: false,
	})

describe("IncomingTransferService — dust filter (getIncomingTransfers)", () => {
	test("hides sub-threshold receipts; keeps at/above (RAISING hides MORE, LOWERING re-reveals)", async () => {
		const service = await bootDust({ threshold: 0.01, quotes: { "usd-coin": { usd: 1 } } })
		await dustSeed("big", "20000") // 0.02 cUSD @ $1 = $0.02
		await dustSeed("dust", "5000") // 0.005 cUSD @ $1 = $0.005 < $0.01

		let out = await service.getIncomingTransfers("p1", "nMain", "0xa")
		expect(out.map((r) => r.id)).toEqual(["note:p1|nMain|big"])

		// RAISE the threshold above the big one → it hides too.
		;(service as unknown as { configService: { setDustThreshold: (t: number) => void } }).configService.setDustThreshold(0.05)
		out = await service.getIncomingTransfers("p1", "nMain", "0xa")
		expect(out).toHaveLength(0)

		// LOWER back → both re-revealed.
		;(service as unknown as { configService: { setDustThreshold: (t: number) => void } }).configService.setDustThreshold(0.001)
		out = await service.getIncomingTransfers("p1", "nMain", "0xa")
		expect(out.map((r) => r.id).sort()).toEqual(["note:p1|nMain|big", "note:p1|nMain|dust"])
	})

	test("fails OPEN when the token has NO CoinGecko mapping (shown regardless of threshold)", async () => {
		const config = makeConfigStub()
		const price = makePriceStub()
		const unmappedToken = { id: 3, profileId: "p1", chainId: 1, contract: "0xunmapped", symbol: "UNK", decimals: 18 }
		const { service } = await bootService({ account: publicAccountStub(), token: makeTokenStub([unmappedToken]), config, price })
		await flushPromises()
		config.setDustThreshold(1000) // huge threshold
		price.setQuotes({ "usd-coin": { usd: 1 } })
		await seedNote({
			uniqueNoteHash: "unk",
			networkId: "n1",
			accountAddress: "0xa",
			contract: "0xunmapped",
			tokenId: 3,
			amountRaw: "1",
			hidden: false,
		})

		const out = await service.getIncomingTransfers("p1", "n1", "0xa")
		expect(out.map((r) => r.id)).toEqual(["note:p1|n1|unk"]) // no mapping → fail open
	})

	test("fails OPEN when the quote is stale/absent (getQuotes returns FRESH only)", async () => {
		const service = await bootDust({ threshold: 1000, quotes: {} }) // mapped token, but NO quote present
		await dustSeed("noquote", "1")

		const out = await service.getIncomingTransfers("p1", "nMain", "0xa")
		expect(out.map((r) => r.id)).toEqual(["note:p1|nMain|noquote"])
	})

	test("NEVER bypasses the visible/hidden gates: incomingTransfersVisible=false → [] even with priced records", async () => {
		const service = await bootDust({ threshold: 0.01, quotes: { "usd-coin": { usd: 1 } }, visibility: false })
		await dustSeed("big", "20000")

		expect(await service.getIncomingTransfers("p1", "nMain", "0xa")).toEqual([])
	})

	test("NEVER bypasses hidden: a hidden (pending) record stays hidden regardless of dust value", async () => {
		const service = await bootDust({ threshold: 0.01, quotes: { "usd-coin": { usd: 1 } } })
		await seedNote({
			uniqueNoteHash: "hid",
			networkId: "nMain",
			accountAddress: "0xa",
			contract: MAPPED_CONTRACT,
			tokenId: 9,
			amountRaw: "20000",
			hidden: true,
		})

		expect(await service.getIncomingTransfers("p1", "nMain", "0xa")).toHaveLength(0)
	})

	test("getIncomingTransferById is UNFILTERED — returns a dust record the feed hides", async () => {
		const service = await bootDust({ threshold: 100, quotes: { "usd-coin": { usd: 1 } } })
		const rec = await dustSeed("tiny", "1") // way below $100

		expect(await service.getIncomingTransfers("p1", "nMain", "0xa")).toHaveLength(0) // dust-hidden in the feed
		const byId = await service.getIncomingTransferById(rec.id)
		expect(byId?.id).toBe(rec.id) // but reachable by id for the detail page
	})

	test("(code-review) getIncomingTransferById is SCOPED to the active profile — a foreign-profile id → undefined", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state) // active profile = "p1"
		// The record exists in the shared store but belongs to ANOTHER profile. The `id` is a URL route
		// param, so a stale/crafted foreign id must not surface another profile's receipt.
		const foreign = await seedPublic({ profileId: "pOTHER", txHash: "0xforeign", l2BlockNumber: 5 })
		expect(await service.getIncomingTransferById(foreign.id)).toBeUndefined()
		const own = await seedPublic({ txHash: "0xown", l2BlockNumber: 5 }) // profileId defaults to "p1"
		expect((await service.getIncomingTransferById(own.id))?.id).toBe(own.id)
	})

	const hash = (s: string) => ({ toString: () => s })
	// TxHash.fromString field-validates (BN254), so test tx hashes MUST be in-range — validNoteHash
	// zero-pads to a tiny value that always parses. A high-nibble hash (0x55…) would throw in fromString
	// and mask the behaviour under test.
	const txh = (n: number) => validNoteHash(n)

	test("getReceiptFee returns the sender-paid fee juice for a public receipt + caches it (one node call)", async () => {
		const network = makeNetworkStub()
		const { service } = await bootService({ network })
		const rec = await seedPublic({ txHash: txh(0x1001), blockHash: "0xbh" })
		let calls = 0
		network.setReceiptImpl(async () => {
			calls++
			return { transactionFee: 12345n, blockHash: hash("0xbh") }
		})

		expect(await service.getReceiptFee(rec.id)).toEqual({ feeJuice: "12345" })
		// A mined tx's fee is immutable (block matches) → the second call is served from the cache, no node hit.
		expect(await service.getReceiptFee(rec.id)).toEqual({ feeJuice: "12345" })
		expect(calls).toBe(1)
	})

	test("getReceiptFee → null (uncached) when the receipt has no fee, and null (soft) when the node throws", async () => {
		const network = makeNetworkStub()
		const { service } = await bootService({ network })

		const noFee = await seedPublic({ txHash: txh(0x1002), blockHash: "0xbh" })
		network.setReceiptImpl(async () => ({ transactionFee: undefined, blockHash: hash("0xbh") }))
		expect(await service.getReceiptFee(noFee.id)).toBeNull()
		// Not cached: a later retry that DOES find a fee must not be shadowed by the null.
		network.setReceiptImpl(async () => ({ transactionFee: 7n, blockHash: hash("0xbh") }))
		expect(await service.getReceiptFee(noFee.id)).toEqual({ feeJuice: "7" })

		const throws = await seedPublic({ txHash: txh(0x1003), blockHash: "0xbh" })
		let called = false
		network.setReceiptImpl(async () => {
			called = true
			throw new Error("node down")
		})
		expect(await service.getReceiptFee(throws.id)).toBeNull()
		expect(called).toBe(true) // the null came from the NODE throwing, not a fromString parse error
	})

	test("getCachedReceiptFee answers only from what getReceiptFee fetched, and never reaches the network", async () => {
		const network = makeNetworkStub()
		const { service } = await bootService({ network })
		const rec = await seedPublic({ txHash: txh(0x1010), blockHash: "0xbh" })
		network.setReceiptImpl(async () => ({ transactionFee: 321n, blockHash: hash("0xbh") }))

		expect(await service.getCachedReceiptFee(rec.id)).toBeNull()
		expect(network.getNodeForUrl).not.toHaveBeenCalled()
		expect(network.getNetwork).not.toHaveBeenCalled()

		expect(await service.getReceiptFee(rec.id)).toEqual({ feeJuice: "321" })
		expect(network.getNodeForUrl).toHaveBeenCalledTimes(1)
		expect(await service.getCachedReceiptFee(rec.id)).toEqual({ feeJuice: "321" })
		expect(network.getNodeForUrl).toHaveBeenCalledTimes(1)

		await seedPublic({ txHash: txh(0x1010), blockHash: "0xremined" })
		expect(await service.getCachedReceiptFee(rec.id)).toBeNull()
	})

	test("a failed fee lookup logs the error's class, never the hash or the node's message", async () => {
		const network = makeNetworkStub()
		const { service } = await bootService({ network })
		const rec = await seedPublic({ txHash: txh(0x1011), blockHash: "0xbh" })
		network.setReceiptImpl(async (txHash) => {
			throw new TypeError(`tx ${txHash} not found on node`)
		})
		const logDebug = vi.spyOn(service as unknown as { logDebug: (...args: unknown[]) => void }, "logDebug")
		expect(await service.getReceiptFee(rec.id)).toBeNull()
		const line = logDebug.mock.calls.find(([message]) => message === "receipt fee lookup failed")
		expect(line).toEqual(["receipt fee lookup failed", { errorName: "TypeError" }])
		const logged = JSON.stringify(logDebug.mock.calls)
		expect(logged).not.toContain(txh(0x1011))
		expect(logged).not.toContain(txh(0x1011).slice(0, 10))
		expect(logged).not.toContain("not found on node")
	})

	test("getReceiptFee is reorg-safe — a receipt/record blockHash MISMATCH returns null (never a wrong-block fee)", async () => {
		const network = makeNetworkStub()
		const { service } = await bootService({ network })
		const rec = await seedPublic({ txHash: txh(0x1005), blockHash: "0xblockA" })
		let calls = 0
		// The node reports the tx in a DIFFERENT block than the record currently names (reconciler lagging).
		network.setReceiptImpl(async () => {
			calls++
			return { transactionFee: 100n, blockHash: hash("0xblockB") }
		})
		// Mismatch → null: the page shows the record's block, so a fee from another block must not appear.
		expect(await service.getReceiptFee(rec.id)).toBeNull()
		expect(await service.getReceiptFee(rec.id)).toBeNull()
		expect(calls).toBe(2) // never cached → refetched every time

		// The reconciler catches up: the record's blockHash becomes the node's block → now it matches → fee + cache.
		await seedPublic({ txHash: txh(0x1005), blockHash: "0xblockB" }) // same id (indexInTx 0), new blockHash
		expect(await service.getReceiptFee(rec.id)).toEqual({ feeJuice: "100" })
		const after = calls
		expect(await service.getReceiptFee(rec.id)).toEqual({ feeJuice: "100" })
		expect(calls).toBe(after) // cached now that receipt.blockHash === record.blockHash
	})

	test.each([
		[
			"a dangling primaryEndpointId",
			{ id: "n1", chainId: 1, endpoints: [{ id: "e1", rpcUrl: "http://n1" }], primaryEndpointId: "gone" },
		],
		["no endpoints at all", { id: "n1", chainId: 1, primaryEndpointId: "e1" }],
	])("getReceiptFee → null for a network with %s, reaching neither the record's endpoint nor the chain node", async (_name, net) => {
		const network = makeNetworkStub([net])
		const { service } = await bootService({ network })
		const rec = await seedPublic({ txHash: txh(0x1006), blockHash: "0xbh" })
		network.setReceiptImpl(async () => ({ transactionFee: 1n, blockHash: hash("0xbh") }))
		expect(await service.getReceiptFee(rec.id)).toBeNull()
		expect(network.getNodeForUrl).not.toHaveBeenCalled()
		expect(network.getNode).not.toHaveBeenCalled()
	})

	test("getReceiptFee skips the cache write when a purge bumped the epoch mid-fetch (no stale repopulation)", async () => {
		const network = makeNetworkStub()
		const { service } = await bootService({ network })
		await seedPublic({ txHash: txh(0x1006), blockHash: "0xbh" })
		const id = `pub:p1|n1|${txh(0x1006)}|0`
		let calls = 0
		network.setReceiptImpl(async () => {
			calls++
			// A concurrent purge lands while we're off-lock fetching: clearChain bumps the epoch (+ wipes the chain).
			await service.clearChain("p1", "n1")
			return { transactionFee: 50n, blockHash: hash("0xbh") }
		})
		expect(await service.getReceiptFee(id)).toEqual({ feeJuice: "50" }) // fee still shown for THIS open

		// Re-seed (the purge wiped it) + swap in a non-clearing impl. Had the first fetch poisoned the cache,
		// this would be served from it (calls stays 1); the epoch guard forces a real refetch instead.
		await seedPublic({ txHash: txh(0x1006), blockHash: "0xbh" })
		network.setReceiptImpl(async () => {
			calls++
			return { transactionFee: 50n, blockHash: hash("0xbh") }
		})
		expect(await service.getReceiptFee(id)).toEqual({ feeJuice: "50" })
		expect(calls).toBe(2)
	})

	test("getReceiptFee is GATED to public receipts — a note id (or bogus/foreign id) → null with NO node call", async () => {
		const network = makeNetworkStub()
		const { service } = await bootService({ network })
		let calls = 0
		network.setReceiptImpl(async () => {
			calls++
			return { transactionFee: 999n }
		})

		// A private (note) receipt must never hand its tx hash to the node — the server-side kind gate
		// short-circuits BEFORE any getNode/getTxReceipt.
		const noteRec = await seedNote({ txHash: txh(0x1004) })
		expect(await service.getReceiptFee(noteRec.id)).toBeNull()
		// A bogus / foreign id also yields null (getIncomingTransferById returns undefined) — no node call.
		expect(await service.getReceiptFee("pub:pX|nX|0xdead|0")).toBeNull()
		expect(calls).toBe(0)
	})
})

describe("IncomingTransferService — public-scan tick outcomes", () => {
	const at = (blockNumber: number, txIndexWithinBlock = 0) => ({ blockNumber, txIndexWithinBlock, logIndexWithinTx: 0 })
	// A budget-exhausting pass: maxPages(5) full, strictly-advancing pages → the indexer reports hasMore.
	const partialPass = (positions: Array<[number, number]>) =>
		positions.map(([blockNumber, txIndexWithinBlock]) => ({
			events: [],
			scannedThrough: at(blockNumber, txIndexWithinBlock),
			hasMore: true,
			dropped: false,
		}))
	// An anchored cursor runs a boundary-ancestry probe that consumes ONE reader response before the pages.
	const probeAck = () => ({ events: [], scannedThrough: null, hasMore: false, dropped: false })
	const anchored = { cursor: at(10), lastSyncedBlockHash: "0xanchor", lastScanFinalized: 5 }

	test("tips unavailable → failed, and the cursor row (pending page included) is untouched", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const pendingPage = { fromCursor: null, toScannedThrough: at(10), upperHash: "0xcheckpoint" }
		await seedCursor({ pendingPage })
		reader.getScanTips = async () => {
			throw new Error("node down")
		}
		const record = vi.spyOn((service as unknown as { episodes: { record: (k: string, o: ScanOutcome) => void } }).episodes, "record")

		await (service as unknown as { pollPublic: (key: string, force: boolean) => Promise<void> }).pollPublic(
			`n1|${tokenA.contract}`,
			true,
		)

		expect(record).toHaveBeenCalledWith(`p1|n1|${tokenA.contract}`, "failed", expect.any(Number))
		expect(await cursorFor()).toEqual({ cursor: null, lastSyncedBlockHash: null, lastScanFinalized: null, startBlock: 0, pendingPage })
		expect(state.fetchArgs).toEqual([])
	})

	test.each<[PublicTokenClassStatus, string]>([
		["unresolved", "failed"],
		["non-standard", "ineligible"],
	])("class gate %s → %s, nothing fetched", async (classStatus, outcome) => {
		const { reader, state } = makePublicReader({ classStatus })
		const { service } = await bootPublic(reader, state)

		expect(await scanPublic(service)).toBe(outcome)
		expect(state.fetchArgs).toEqual([])
	})

	test("a quiet token whose last event is far behind the tip reads a validated empty page → idle-at-tip", async () => {
		// The cursor of a quiet token sits at its last event forever; judging the tick on the distance
		// between cursor and tip would report it as permanently behind.
		const { reader, state } = makePublicReader({ tips: { checkpointedBlockNumber: 100 } })
		const { service } = await bootPublic(reader, state)
		await seedCursor({ cursor: at(10) })

		expect(await scanPublic(service)).toBe("idle-at-tip")
	})

	test("a dropped page → no-progress, and the finalized floor does not move", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedCursor({ cursor: at(10), lastScanFinalized: 5 })
		state.responses.push(pubDroppedPage())

		expect(await scanPublic(service)).toBe("no-progress")
		expect(await cursorFor()).toMatchObject({ cursor: at(10), lastScanFinalized: 5 })
	})

	test("a valid page followed by a dropped one → no-progress, though the valid prefix is committed", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		state.responses.push({ events: [], scannedThrough: at(20), hasMore: true, dropped: false }, pubDroppedPage())

		expect(await scanPublic(service)).toBe("no-progress")
		expect((await cursorFor())?.cursor).toEqual(at(20))
	})

	test("a commit the epoch fence rejects is never a success: EOF → no-progress, reconciliation end → no-progress", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const eofAfterBump = () => {
			;(service as unknown as { bumpServiceEpoch: () => void }).bumpServiceEpoch()
			return probeAck()
		}

		await seedCursor({ cursor: at(10) })
		state.responses.push(eofAfterBump)
		expect(await scanPublic(service)).toBe("no-progress")

		const reconciling = { lowerBound: 60, upperBound: 90, upperBoundHash: "0xfork", progress: null, seen: [] }
		await seedCursor({ ...anchored, reconciling })
		state.responses.push(eofAfterBump)
		expect(await scanPublic(service)).toBe("no-progress")
		expect((await cursorFor())?.reconciling).toEqual(reconciling)
	})

	test("a non-advancing (hostile) page → no-progress, never a false idle-at-tip", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedCursor({ cursor: at(50) })
		state.responses.push({ events: [], scannedThrough: at(50), hasMore: true, dropped: false })

		expect(await scanPublic(service)).toBe("no-progress")
		expect((await cursorFor())?.cursor).toEqual(at(50))
	})

	test("many pages inside ONE busy block → progress every tick, though no new block is covered", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const inBlock = (from: number) => partialPass([0, 1, 2, 3, 4].map((i) => [70, from + i] as [number, number]))

		state.responses.push(...inBlock(0))
		expect(await scanPublic(service)).toBe("progress")
		state.responses.push(probeAck(), ...inBlock(5))
		expect(await scanPublic(service)).toBe("progress")
		expect((await cursorFor())?.cursor).toEqual(at(70, 9))
	})

	test("a multi-tick reconciliation → progress per step, then the forward scan settles at idle-at-tip", async () => {
		const { reader, state } = makePublicReader({ tips: { checkpointedBlockNumber: 100 } })
		const { service } = await bootPublic(reader, state)
		await seedCursor({
			...anchored,
			cursor: at(90),
			reconciling: { lowerBound: 60, upperBound: 90, upperBoundHash: "0xfork", progress: null, seen: [] },
		})

		state.responses.push(
			...partialPass([
				[61, 0],
				[62, 0],
				[63, 0],
				[64, 0],
				[65, 0],
			]),
		)
		expect(await scanPublic(service)).toBe("progress")
		expect((await cursorFor())?.reconciling).toMatchObject({ progress: at(65) })

		expect(await scanPublic(service)).toBe("progress") // empty EOF → the window is exhausted → finished
		expect((await cursorFor())?.reconciling).toBeUndefined()

		state.responses.push(probeAck())
		expect(await scanPublic(service)).toBe("idle-at-tip")
	})

	test("a dropped reconciliation page → no-progress and the marker is kept", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const reconciling = { lowerBound: 60, upperBound: 90, upperBoundHash: "0xfork", progress: null, seen: [] }
		await seedCursor({ ...anchored, reconciling })
		state.responses.push(pubDroppedPage())

		expect(await scanPublic(service)).toBe("no-progress")
		expect((await cursorFor())?.reconciling).toEqual(reconciling)
	})

	test("an anchored throw → failed AND a reconciliation begins; a transient one recovers to idle-at-tip", async () => {
		const { reader, state } = makePublicReader({ tips: { checkpointedBlockNumber: 100 } })
		const { service } = await bootPublic(reader, state)
		await seedCursor(anchored)
		state.responses.push(new Error("transient node error")) // the boundary-ancestry probe throws

		expect(await scanPublic(service)).toBe("failed")
		// The reconcile scan ran over the rewind window, pinned to the checkpoint it was staged against.
		expect(state.fetchArgs.at(-1)).toMatchObject({ fromBlock: 6, toBlock: 100, referenceBlock: "0xcheckpoint" })
		expect(await cursorFor()).toMatchObject({ cursor: at(10), lastSyncedBlockHash: "0xcheckpoint" })

		state.responses.push(probeAck())
		expect(await scanPublic(service)).toBe("idle-at-tip")
	})

	test("an unanchored throw (first scan) → failed, nothing to reconcile, the cursor does not move", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		state.responses.push(new Error("node error"))

		expect(await scanPublic(service)).toBe("failed")
		expect(await cursorFor()).toBeUndefined()
	})

	test("a reorged pending page → failed, and the marker hands over to a reconciliation", async () => {
		const { reader, state } = makePublicReader({ tips: { checkpointedBlockNumber: 100 } })
		const { service } = await bootPublic(reader, state)
		await seedCursor({ ...anchored, pendingPage: { fromCursor: at(10), toScannedThrough: at(20), upperHash: "0xgone" } })
		state.responses.push(new Error("upperHash is not an ancestor"))

		expect(await scanPublic(service)).toBe("failed")
		expect(state.fetchArgs.at(-1)).toMatchObject({ fromBlock: 6, referenceBlock: "0xcheckpoint" })
		expect((await cursorFor())?.pendingPage).toBeUndefined()
	})

	test.each([
		["reconciling", { reconciling: { lowerBound: 60, upperBound: 90, upperBoundHash: "0xfork", progress: null, seen: [] } }],
		["back-filling", { backfill: { low: 1, high: 50, position: { blockNumber: 7, txIndexWithinBlock: 2, logIndexWithinTx: 0 } } }],
	])("PublicScanCursorSchema round-trips a %s cursor (the repository parses every read through it)", (_case, extra) => {
		const cursor = {
			cursor: { blockNumber: 90, txIndexWithinBlock: 1, logIndexWithinTx: 2 },
			lastSyncedBlockHash: "0xanchor",
			lastScanFinalized: 50,
			startBlock: 0,
			...extra,
		}
		expect(PublicScanCursorSchema.parse(cursor)).toEqual(cursor)
	})
})

describe("IncomingTransferService — public-scan cursor resume (SW-restart, case 4 unit proof)", () => {
	test("a fresh service instance resumes its scan from the PERSISTED cursor, not block 0", async () => {
		const { reader, state } = makePublicReader({ tips: { checkpointedBlockNumber: 100 } })
		// Simulate a PRIOR instance that scanned up to block 50 (cursor persisted; no anchor → no boundary
		// probe, so the first reader call IS the forward scan).
		const persisted = { blockNumber: 50, txIndexWithinBlock: 3, logIndexWithinTx: 1 }
		await seedCursor({ cursor: persisted, lastSyncedBlockHash: null })

		// Boot a FRESH service over the SAME persisted storage (bootService does NOT clear cursors — only
		// bootPublic does). This is the SW restart: a new instance re-hydrating from chrome.storage.local.
		const { service } = await bootService({ account: publicAccountStub(), token: makeTokenStub([tokenA]), publicReader: reader })
		await flushPromises() // let the scheduler's immediate kick run its forward scan
		void service

		// The resumed scan's FIRST fetch must page from the persisted cursor — NOT null / startBlock 0. A
		// buggy restart that dropped the cursor would fetch with afterCursor undefined + fromBlock 0, then
		// re-index everything from scratch. This is the "cursor-aware resume, no re-processing" property the
		// SW-restart e2e cannot prove on its own (a from-0 rescan + PK-dedup would look identical there).
		expect(state.fetchArgs.length).toBeGreaterThan(0)
		expect(state.fetchArgs[0].afterCursor).toEqual(persisted)
		expect(state.fetchArgs[0].fromBlock).toBeUndefined()
	})

	test("with a persisted anchor (the production post-scan state), the forward scan still pages from the cursor", async () => {
		const { reader, state } = makePublicReader({ tips: { checkpointedBlockNumber: 100 } })
		// Production fidelity: a real prior instance that scanned to block 50 ALSO recorded the anchor hash. On
		// resume that anchor triggers a boundary ancestry probe (a distinct reader call) BEFORE the forward
		// scan — so this exercises the probe-present branch the no-anchor case above skips.
		const persisted = { blockNumber: 50, txIndexWithinBlock: 3, logIndexWithinTx: 1 }
		await seedCursor({ cursor: persisted, lastSyncedBlockHash: "0xanchor" })

		const { service } = await bootService({ account: publicAccountStub(), token: makeTokenStub([tokenA]), publicReader: reader })
		await flushPromises()
		void service

		// SOME reader call must resume from the exact persisted cursor with no block-0 fallback. A dropped
		// cursor would instead page from block 0 (fromBlock set, afterCursor undefined) — no such call exists.
		const resumed = state.fetchArgs.find(
			(a) =>
				a.afterCursor?.blockNumber === persisted.blockNumber &&
				a.afterCursor?.txIndexWithinBlock === persisted.txIndexWithinBlock &&
				a.afterCursor?.logIndexWithinTx === persisted.logIndexWithinTx,
		)
		expect(resumed).toBeDefined()
		expect(resumed?.fromBlock).toBeUndefined()
	})
})

describe("IncomingTransferService — newest-first public scan", () => {
	const receipt = pubReceipt
	const recordedBlocks = async (account = "0xa") =>
		(await repo.listRecords())
			.filter((r) => r.kind === "public-event" && r.accountAddress === account)
			.map((r) => r.l2BlockNumber)
			.sort((x, y) => x - y)
	const backfillOf = async () => (await cursorFor())?.backfill
	const backfillReads = (fetchArgs: PublicTransferFetchArgs[]) =>
		fetchArgs.filter((a) => a.referenceBlock === undefined).map((a) => [a.fromBlock, a.toBlock])
	const trustTokenA = () =>
		seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
	const bootChain = async (
		tips: Partial<PublicScanTips>,
		chain: PublicTransferEvent[],
		stubs: Parameters<typeof bootService>[0] = {},
	) => {
		const { reader, state } = makePublicReader({ tips })
		const booted = await bootPublic(reader, state, stubs)
		state.chain = chain
		return { ...booted, state }
	}

	test("the newest receipts land on the first tick, and older ones fill in below, newest to oldest", async () => {
		const { service } = await bootChain({ finalizedBlockNumber: 1000, checkpointedBlockNumber: 1010 }, [
			receipt(50),
			receipt(500),
			receipt(950),
			receipt(1005),
		])

		const landed: number[][] = []
		for (let i = 0; i < 3; i++) {
			expect(await scanPublic(service)).toBe("progress")
			landed.push(await recordedBlocks())
		}

		expect(landed).toEqual([
			[950, 1005],
			[500, 950, 1005],
			[50, 500, 950, 1005],
		])
		expect(await backfillOf()).toBeUndefined()
	})

	test("on a quiet chain with finalized = checkpointed, a receipt at the floor lands on the first tick, history still unread", async () => {
		const { service, state } = await bootChain({ finalizedBlockNumber: 1000, checkpointedBlockNumber: 1000 }, [
			receipt(10),
			receipt(1000),
		])

		await scanPublic(service)

		expect(state.fetchArgs[0].fromBlock).toBe(1001)
		expect(await recordedBlocks()).toEqual([1000])
		expect(await backfillOf()).toMatchObject({ high: 600 })
	})

	test("an empty window ends and the next one starts, as many as the tick's page budget allows", async () => {
		const { service, state } = await bootChain({ finalizedBlockNumber: 1000, checkpointedBlockNumber: 1010 }, [])

		expect(await scanPublic(service)).toBe("progress")

		expect(backfillReads(state.fetchArgs)).toEqual([
			[901, 1000],
			[801, 900],
			[701, 800],
			[601, 700],
		])
		expect(await backfillOf()).toEqual({ low: 501, high: 600, position: null })
	})

	test("a block with more logs than one tick's budget resumes at the next log, with no duplicate and no gap", async () => {
		const logs = Array.from({ length: 150 }, (_, i) => receipt(1000, { txIndexWithinBlock: i, to: i % 7 === 0 ? "0xa" : "0xother" }))
		const { service, state } = await bootChain({ finalizedBlockNumber: 1000, checkpointedBlockNumber: 1000 }, logs)
		await trustTokenA()
		const added = vi.fn()
		service.onIncomingTransferAdded.add(added)

		await scanPublic(service)
		expect(await backfillOf()).toEqual({
			low: 901,
			high: 1000,
			position: { blockNumber: 1000, txIndexWithinBlock: 79, logIndexWithinTx: 0 },
		})
		state.fetchArgs.length = 0

		await scanPublic(service)

		expect(state.fetchArgs.find((a) => a.referenceBlock === undefined)?.afterCursor).toEqual(positionOf(logs[79]))
		const ours = logs.filter((e) => e.to === "0xa").map(pubRecordKey)
		expect(
			(await repo.listRecords())
				.map((r) => r.id)
				.filter((k) => k.startsWith("pub:"))
				.sort(),
		).toEqual(ours.sort())
		expect(added).toHaveBeenCalledTimes(ours.length)
		expect(await backfillOf()).toEqual({ low: 801, high: 900, position: null })
	})

	test("a restart between a back-fill record and its cursor write replays the page without a duplicate", async () => {
		const { service } = await bootChain({ finalizedBlockNumber: 1000, checkpointedBlockNumber: 1010 }, [receipt(950)])
		await trustTokenA()
		const added = vi.fn()
		service.onIncomingTransferAdded.add(added)
		await scanPublic(service)
		expect(await recordedBlocks()).toEqual([950])
		// The record write landed and the cursor write that followed it did not.
		await seedCursor({ ...(await cursorFor()), backfill: { low: 901, high: 1000, position: null } })

		expect(await scanPublic(service)).toBe("progress")

		expect(await recordedBlocks()).toEqual([950])
		expect(added).toHaveBeenCalledTimes(1)
		expect(await backfillOf()).toEqual({ low: 501, high: 600, position: null })
	})

	test("a revoked back-fill commit leaves the window's position where it was", async () => {
		const { service } = await bootChain({ finalizedBlockNumber: 1000, checkpointedBlockNumber: 1010 }, [receipt(950)])
		;(service as unknown as { deletersRunning: number }).deletersRunning = 1

		expect(await scanPublic(service)).toBe("no-progress")
		expect(await recordedBlocks()).toEqual([])
		expect(await backfillOf()).toEqual({ low: 901, high: 1000, position: null })
		;(service as unknown as { deletersRunning: number }).deletersRunning = 0

		await scanPublic(service)
		expect(await recordedBlocks()).toEqual([950])
	})

	test("a reconciliation deletes a forward orphan and never reaches a back-filled record", async () => {
		const { service, state } = await bootChain({ finalizedBlockNumber: 1000, checkpointedBlockNumber: 1010 }, [
			receipt(990),
			receipt(1005),
		])
		await scanPublic(service)
		expect(await recordedBlocks()).toEqual([990, 1005])

		// The block holding 1005's receipt is reorged out: the boundary probe fails and the node serves
		// no receipt at all, so only the reconciliation's reach decides which rows it deletes.
		state.chain = []
		state.tips = { ...state.tips, checkpointedBlockHash: "0xcheckpoint2" }
		state.responses.push(new Error("not an ancestor"))
		await scanPublic(service)

		expect(await recordedBlocks()).toEqual([990])
		expect((await cursorFor())?.reconciling).toBeUndefined()
	})

	test("an account added during back-fill restarts both halves and finds the account's history", async () => {
		const accounts = [{ profileId: "p1", chainId: 1, address: "0xa" }]
		const account = makeAccountStub(accounts)
		const { service, state } = await bootChain(
			{ finalizedBlockNumber: 1000, checkpointedBlockNumber: 1010 },
			[receipt(50, { to: "0xnew" }), receipt(950, { to: "0xnew" }), receipt(960), receipt(1005, { to: "0xnew" })],
			{ account },
		)
		await scanPublic(service)
		expect(await recordedBlocks()).toEqual([960])
		expect(await backfillOf()).toMatchObject({ high: 600 })

		accounts.push({ profileId: "p1", chainId: 1, address: "0xnew" })
		state.fetchArgs.length = 0
		await (service as unknown as { onAccountAdded: (a: unknown) => Promise<void> }).onAccountAdded({ chainId: 1, address: "0xnew" })
		await flushPromises()
		for (let i = 0; i < 3 && (await backfillOf()) !== undefined; i++) await scanPublic(service)

		expect(state.fetchArgs[0]).toMatchObject({ fromBlock: 1001, afterCursor: undefined })
		expect(backfillReads(state.fetchArgs)[0]).toEqual([901, 1000])
		expect(await recordedBlocks("0xnew")).toEqual([50, 950, 1005])
		expect(await recordedBlocks()).toEqual([960])
	})
})

describe("IncomingTransferService — public arm post-park epoch discipline", () => {
	// The note arm re-checks the service epoch only at its section's entry and after
	// each timestamp read (the composed-pin tests above drive the real watchdog there); the
	// public arm re-checks after each read block before any write. These pins
	// manufacture the post-handoff state directly — a bump from inside the CS's own
	// awaited read, exactly where a handoff-admitted wipe would leave it.

	test("commitPublicEvent: an epoch bump inside the in-CS token read suppresses record/trust/outbox writes", async () => {
		const { reader, state } = makePublicReader()
		const pending = vi.fn()
		const { service } = await bootPublic(reader, state)
		service.onIncomingTransferPending.add(pending)
		const svc = service as unknown as { serviceEpoch: number; tokenService: { getTokensRaw: (p: string) => Promise<unknown[]> } }
		const realGetTokensRaw = svc.tokenService.getTokensRaw.bind(svc.tokenService)
		let bumped = false
		svc.tokenService.getTokensRaw = async (p: string) => {
			const tokens = await realGetTokensRaw(p)
			if (!bumped) {
				bumped = true
				svc.serviceEpoch += 1
			}
			return tokens
		}
		state.responses.push(pubPage([pubEvent({ txHash: "0xparked" })]))

		await scanPublic(service)

		expect(await repo.getRecord("pub:p1|n1|0xparked|0")).toBeUndefined()
		expect(await repo.getTrust("p1", "n1", tokenA.contract)).toBeUndefined()
		expect(await outboxFor()).toBeUndefined()
		expect(pending).not.toHaveBeenCalled()
	})

	test("resolvePublicClassGate: an epoch bump during the class fetch leaves the wiped cache empty", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const svc = service as unknown as { serviceEpoch: number; classGateCache: Map<string, unknown> }
		const realClassStatus = reader.getTokenClassStatus.bind(reader)
		reader.getTokenClassStatus = async (...args: Parameters<typeof realClassStatus>) => {
			svc.serviceEpoch += 1
			return realClassStatus(...args)
		}
		state.responses.push(pubPage([pubEvent({ txHash: "0xgate" })]))

		await scanPublic(service)

		expect(svc.classGateCache.size).toBe(0)
	})

	test("drain: a fresh dirtyAt bump during the refresh request is not reverted by the anchor write", async () => {
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const { service } = await bootPublic(reader, state, { tokenBalance })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		tokenBalance.requestBalanceRefresh.mockImplementationOnce(async () => {
			// A receipt lands while the request is in flight: fresh dirt, anchor cleared.
			await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 999 })
			return { taskId: "T1" }
		})

		await drain(service)

		expect(await outboxFor()).toEqual({ dirtyAt: 999 })
	})

	test("drain: a DISPLACED holder (watchdog handoff) cannot land its anchor over a successor's receipt", async () => {
		// The re-read CAS is blind when the successor's receipt carries the SAME
		// dirtyAt (same-ms receipt — realistic under a frozen/coarse clock): only
		// the lock-ownership probe stops the stale anchor write. The successor
		// interleaves by ACQUIRING the service lock after the watchdog displaces
		// the parked drain, which permanently flips the ticket.
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const { service } = await bootPublic(reader, state, { tokenBalance })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		vi.useFakeTimers()
		try {
			tokenBalance.requestBalanceRefresh.mockImplementationOnce(async () => {
				// Drain is parked here holding the lock. Fire its watchdog, then run
				// the receipt writer under a REAL lock acquisition (ticket flips).
				await advance(5 * 60_000 + 1)
				await (service as unknown as { withServiceLock: (fn: () => Promise<void>) => Promise<void> }).withServiceLock(async () => {
					await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
				})
				return { taskId: "T1" }
			})

			await drain(service)

			// The displaced drain must NOT have anchored: the row keeps the
			// receipt's shape (no pendingTaskId), so the next drain re-requests.
			expect(await outboxFor()).toEqual({ dirtyAt: 100 })
		} finally {
			vi.useRealTimers()
		}
	})

	test("drain: a row wiped during the refresh request is not resurrected by the anchor write", async () => {
		const { reader, state } = makePublicReader()
		const tokenBalance = makeTokenBalanceStub()
		const { service } = await bootPublic(reader, state, { tokenBalance })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		tokenBalance.requestBalanceRefresh.mockImplementationOnce(async () => {
			await repo.deleteOutbox("p1", "n1", "0xa", 1)
			return { taskId: "T1" }
		})

		await drain(service)

		expect(await outboxFor()).toBeUndefined()
	})
})

// ── Seam pins — they fence the register-immediately spans the
//    decomposition must not split: outbox-before-record in both arms, trust
//    write-before-emit, and the ticket `isCurrent()` read fresh at write time. ──

describe("IncomingTransferService — seam pins (outbox order, trust order, fresh isCurrent)", () => {
	function seedTrusted() {
		return seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "trusted",
			updatedAt: 0,
		})
	}

	test("the outbox row is written BEFORE the record", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note()] })
		const { service } = await bootService({ network, token, note: noteSvc })
		await seedTrusted()
		const outboxSet = vi.spyOn(internals(service).repo, "setOutbox")
		const recordSet = vi.spyOn(internals(service).repo, "upsertRecord")
		try {
			await scan(service)
			expect(outboxSet).toHaveBeenCalledTimes(1)
			expect(recordSet).toHaveBeenCalledTimes(1)
			expect(outboxSet.mock.invocationCallOrder[0]).toBeLessThan(recordSet.mock.invocationCallOrder[0])
		} finally {
			outboxSet.mockRestore()
			recordSet.mockRestore()
		}
	})

	test("the outbox row is written BEFORE the record", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		await seedTrusted()
		state.responses.push(pubPage([pubEvent({ txHash: "0xorder" })]))
		const outboxSet = vi.spyOn(internals(service).repo, "setOutbox")
		const recordSet = vi.spyOn(internals(service).repo, "upsertRecord")
		try {
			await scanPublic(service)
			expect(outboxSet).toHaveBeenCalledTimes(1)
			expect(recordSet).toHaveBeenCalledTimes(1)
			expect(outboxSet.mock.invocationCallOrder[0]).toBeLessThan(recordSet.mock.invocationCallOrder[0])
		} finally {
			outboxSet.mockRestore()
			recordSet.mockRestore()
		}
	})

	test("(TRUST ORDER) unknown→pending persists the trust row BEFORE onIncomingTrustChanged fires", async () => {
		const network = makeNetworkStub([{ id: "n1", chainId: 1 }])
		const token = makeTokenStub([tokenA])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [note()] })
		const { service } = await bootService({ network, token, note: noteSvc })
		// A read answers with the rows stored when it is called, so each entry is the row at the emit.
		const seenAtEmit: Promise<string>[] = []
		const changed = vi.fn(() => {
			seenAtEmit.push(repo.getTrust("p1", "n1", tokenA.contract).then((row) => row?.state ?? "absent"))
		})
		service.onIncomingTrustChanged.add(changed)
		const trustSet = vi.spyOn(internals(service).repo, "setTrust")
		try {
			await scan(service)
			expect(trustSet).toHaveBeenCalledTimes(1)
			expect(changed).toHaveBeenCalledTimes(1)
			expect(trustSet.mock.invocationCallOrder[0]).toBeLessThan(changed.mock.invocationCallOrder[0])
			expect(await Promise.all(seenAtEmit)).toEqual(["pending"])
		} finally {
			trustSet.mockRestore()
		}
	})

	test("(FRESH isCurrent) an anchored terminal-success row displaced while getOutbox awaits is NOT deleted", async () => {
		// The drain's per-row critical section parks on `await repo.getOutbox`
		// while HOLDING the serviceLock; the lock's watchdog hands the ticket
		// over; the revoked CS resumes with a terminal-success anchor and must
		// re-read `isCurrent()` at the write — a helper that cached the ticket
		// verdict before the await would delete the row here.
		vi.useFakeTimers()
		try {
			const { reader, state } = makePublicReader()
			const tokenBalance = makeTokenBalanceStub()
			const task = makeTaskStub()
			const { service } = await bootPublic(reader, state, { tokenBalance, task })
			await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100, pendingTaskId: "T1" })
			task.setTask("T1", TaskStatus.Completed, Date.now())
			let releaseRow!: () => void
			const parked = new Promise<unknown>((resolve) => {
				releaseRow = () => resolve({ dirtyAt: 100, pendingTaskId: "T1" })
			})
			const getSpy = vi.spyOn(internals(service).repo, "getOutbox").mockImplementationOnce(() => parked as never)
			try {
				const drainP = drain(service) // parks inside getOutbox, serviceLock held
				await advance(0)
				// Watchdog handoff → the parked CS's ticket is revoked.
				await advance(5 * 60_000 + 1)
				releaseRow()
				await drainP
			} finally {
				getSpy.mockRestore()
			}
			expect((await outboxFor())?.pendingTaskId).toBe("T1") // the revoked CS wrote nothing
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("IncomingTransferService — public-scan health (episodes, backoff, retry)", () => {
	const MIN = 60_000
	const T0 = 50_000 * MIN
	const KEY = `p1|n1|${tokenA.contract}`
	type Health = { stalled: boolean; since: number | null }
	type HealthSurface = {
		pollPublic: (key: string) => Promise<void>
		hydrateSchedulers: () => Promise<void>
		getIncomingSyncHealth: (networkId: string) => Promise<Health>
		retryIncomingScan: (networkId: string) => Promise<void>
		onIncomingSyncHealthChanged: { add: (h: (e: { profileId: string; networkId: string }) => void) => void }
		episodes: { settled: () => Promise<void>; has: (key: string) => boolean }
	}
	const surface = (service: unknown) => service as HealthSurface
	const poll = (service: unknown) => surface(service).pollPublic(`n1|${tokenA.contract}`)
	const storedEpisodes = async (service: unknown) => {
		await surface(service).episodes.settled()
		return (
			(await new FakeBrowserApi().storage.session.get(SCAN_EPISODES_KEY))[SCAN_EPISODES_KEY] as
				| { episodes: Record<string, { failures: number; failingSince: number; nextAttemptAt: number }> }
				| undefined
		)?.episodes
	}
	const seedEpisodes = (episodes: Record<string, unknown>, announced: string[] = []) =>
		new FakeBrowserApi().storage.session.set({ [SCAN_EPISODES_KEY]: { episodes, announced } })
	const nodeDown = (reader: PublicEventReader) => {
		reader.getScanTips = async () => {
			throw new Error("node down")
		}
	}
	const captureHealthEvents = (service: unknown) => {
		const events: { profileId: string; networkId: string }[] = []
		surface(service).onIncomingSyncHealthChanged.add((e) => events.push(e))
		return events
	}
	/** Two failed ticks, the second one past the first backoff gate. Leaves the clock at `T0 + 31 s`. */
	const failTwice = async (service: unknown) => {
		await poll(service)
		vi.setSystemTime(T0 + 31_000)
		await poll(service)
	}

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] })
		vi.setSystemTime(T0)
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	test("node down for an hour, wallet unlocked → stalled after ten minutes, announced once; recovery clears and announces once", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const events = captureHealthEvents(service)
		const healthyTips = reader.getScanTips
		nodeDown(reader)

		await failTwice(service)
		expect(await surface(service).getIncomingSyncHealth("n1")).toEqual({ stalled: false, since: null })

		for (let minute = 2; minute <= 60; minute++) {
			vi.setSystemTime(T0 + minute * MIN)
			await poll(service)
			if (minute === 10) expect(events).toEqual([])
		}
		expect(events).toEqual([{ profileId: "p1", networkId: "n1" }])
		expect(await surface(service).getIncomingSyncHealth("n1")).toEqual({ stalled: true, since: T0 })

		reader.getScanTips = healthyTips
		vi.setSystemTime(T0 + 66 * MIN) // past the 5 min backoff cap
		await poll(service)
		await poll(service)
		expect(events).toHaveLength(2)
		expect(await surface(service).getIncomingSyncHealth("n1")).toEqual({ stalled: false, since: null })
		expect(await storedEpisodes(service)).toBeUndefined()
	})

	test("a tick inside the backoff window does not touch the node", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const tips = vi.fn().mockRejectedValue(new Error("node down"))
		reader.getScanTips = tips

		await poll(service) // failure 1 → gate at T0 + 30 s
		vi.setSystemTime(T0 + 29_000)
		await poll(service)
		expect(tips).toHaveBeenCalledTimes(1)

		vi.setSystemTime(T0 + 30_000)
		await poll(service)
		expect(tips).toHaveBeenCalledTimes(2)
	})

	test("unlock after eight hours, then two failures → NOT stalled: a lock ends every episode", async () => {
		const { reader, state } = makePublicReader()
		const profile = makeProfileStub()
		const { service } = await bootPublic(reader, state, { profile })
		nodeDown(reader)
		await failTwice(service)

		profile.getActiveProfile.mockResolvedValue(null)
		await profile.onActiveProfileChanged.invoke()
		await flushPromises()
		expect(await storedEpisodes(service)).toBeUndefined()

		vi.setSystemTime(T0 + 8 * 60 * MIN)
		profile.getActiveProfile.mockResolvedValue({ id: "p1" })
		await profile.onActiveProfileChanged.invoke()
		await flushPromises() // the rebuilt scheduler's immediate poll is failure 1
		vi.setSystemTime(T0 + 8 * 60 * MIN + 31_000)
		await poll(service)

		expect(await storedEpisodes(service)).toMatchObject({ [KEY]: { failures: 2, failingSince: T0 + 8 * 60 * MIN } })
		expect(await surface(service).getIncomingSyncHealth("n1")).toEqual({ stalled: false, since: null })
	})

	test("a worker restart mid-episode keeps failingSince, hydrated before the first poll", async () => {
		const first = makePublicReader()
		const { service } = await bootPublic(first.reader, first.state)
		nodeDown(first.reader)
		await failTwice(service)
		await surface(service).episodes.settled()

		vi.setSystemTime(T0 + 11 * MIN)
		const second = makePublicReader()
		nodeDown(second.reader)
		const restarted = await bootService({ account: publicAccountStub(), token: makeTokenStub([tokenA]), publicReader: second.reader })
		await flushPromises()

		expect(await surface(restarted.service).getIncomingSyncHealth("n1")).toEqual({ stalled: true, since: T0 })
		expect(await storedEpisodes(restarted.service)).toMatchObject({ [KEY]: { failures: 3, failingSince: T0 } })
	})

	test("a restart during an active backoff keeps the gate: the boot poll does not touch the node", async () => {
		const gate = T0 + 100_000
		await seedEpisodes({ [KEY]: { failures: 3, failingSince: T0 - 5 * MIN, nextAttemptAt: gate } })
		const { reader, state } = makePublicReader()
		const tips = vi.fn().mockRejectedValue(new Error("node down"))
		reader.getScanTips = tips
		// No account, so no note target reads tips: the public target is the only scheduler.
		const { service } = await bootService({ account: makeAccountStub([]), token: makeTokenStub([tokenA]), publicReader: reader })
		await flushPromises()

		expect(tips).not.toHaveBeenCalled()
		expect(state.classCalls).toBe(0)
		expect(state.fetchArgs).toEqual([])
		expect(await storedEpisodes(service)).toEqual({ [KEY]: { failures: 3, failingSince: T0 - 5 * MIN, nextAttemptAt: gate } })
	})

	test("a same-profile scheduler rebuild keeps the episode; a profile switch ends it", async () => {
		const { reader, state } = makePublicReader()
		const profile = makeProfileStub()
		const { service } = await bootPublic(reader, state, { profile })
		nodeDown(reader)
		await failTwice(service)

		await surface(service).hydrateSchedulers()
		await flushPromises()
		expect(await storedEpisodes(service)).toMatchObject({ [KEY]: { failingSince: T0 } })

		profile.getActiveProfile.mockResolvedValue({ id: "p2" })
		await profile.onActiveProfileChanged.invoke()
		await flushPromises()
		expect(surface(service).episodes.has(KEY)).toBe(false)
	})

	test("an outcome that lands after a lock cannot recreate the episode the lock ended", async () => {
		const { reader, state } = makePublicReader()
		const profile = makeProfileStub()
		const { service } = await bootPublic(reader, state, { profile })
		let failTips: (error: Error) => void = () => {}
		reader.getScanTips = () =>
			new Promise((_resolve, reject) => {
				failTips = reject
			})

		const inFlight = poll(service)
		await flushPromises()
		profile.getActiveProfile.mockResolvedValue(null)
		await profile.onActiveProfileChanged.invoke()
		await flushPromises()
		failTips(new Error("node down"))
		await inFlight

		expect(surface(service).episodes.has(KEY)).toBe(false)
		expect(await storedEpisodes(service)).toBeUndefined()
	})

	test.each([
		["clearProfile", (service: IncomingTransferService) => service.clearProfile("p1")],
		["clearChain", (service: IncomingTransferService) => service.clearChain("p1", "n1")],
	])("%s ends the scope's episodes even though the token set still lists the contract", async (_label, clear) => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const tips = vi.fn().mockRejectedValue(new Error("node down"))
		reader.getScanTips = tips
		await failTwice(service)

		tips.mockClear()
		await clear(service)
		await flushPromises()

		// The rebuild's immediate poll ran (the old gate is gone) and opened a FRESH one-failure episode.
		expect(tips).toHaveBeenCalledTimes(1)
		expect(await storedEpisodes(service)).toMatchObject({ [KEY]: { failures: 1, failingSince: T0 + 31_000 } })
	})

	test("deleting the token ends its episode", async () => {
		const { reader, state } = makePublicReader()
		const token = makeTokenStub([tokenA])
		const { service } = await bootPublic(reader, state, { token })
		nodeDown(reader)
		await failTwice(service)

		token.getTokensRaw.mockResolvedValue([])
		await token.onTokenDeleted.invoke({ ...tokenA, profileId: "p1" } as never)
		await flushPromises()

		expect(await storedEpisodes(service)).toBeUndefined()
	})

	test("Retry runs the backed-off scan now and keeps the streak", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const tips = vi.fn().mockRejectedValue(new Error("node down"))
		reader.getScanTips = tips
		await failTwice(service) // gate now at T0 + 31 s + 60 s

		await surface(service).retryIncomingScan("n1")

		expect(tips).toHaveBeenCalledTimes(3)
		expect(await storedEpisodes(service)).toMatchObject({ [KEY]: { failures: 3, failingSince: T0 } })
	})

	test("Retry and the health read ignore a network that is not the active profile's, and a non-string id", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const tips = vi.fn().mockRejectedValue(new Error("node down"))
		reader.getScanTips = tips
		await failTwice(service)

		await surface(service).retryIncomingScan("n2")
		await surface(service).retryIncomingScan(7 as never)

		expect(tips).toHaveBeenCalledTimes(2)
		expect(await surface(service).getIncomingSyncHealth(7 as never)).toEqual({ stalled: false, since: null })
	})

	test("a Retry that lands between a profile switch's epoch bump and its commit scans nothing", async () => {
		const { reader, state } = makePublicReader()
		const profile = makeProfileStub()
		const token = makeTokenStub([tokenA])
		const { service } = await bootPublic(reader, state, { profile, token })
		const tips = vi.fn().mockRejectedValue(new Error("node down"))
		reader.getScanTips = tips
		await failTwice(service)
		tips.mockClear()

		// The rebuild parks on its descriptors: epoch already bumped, p1's targets still installed.
		let releaseTokens: () => void = () => {}
		token.getTokensRaw.mockImplementationOnce(() => new Promise((resolve) => (releaseTokens = () => resolve([]))))
		profile.getActiveProfile.mockResolvedValueOnce({ id: "p2" })
		const switching = profile.onActiveProfileChanged.invoke()
		await flushPromises()

		await surface(service).retryIncomingScan("n1") // still reads p1: it captured its profile before the switch
		expect(tips).not.toHaveBeenCalled()

		releaseTokens()
		await switching
		await flushPromises()
		expect(surface(service).episodes.has(KEY)).toBe(false)
		expect(await storedEpisodes(service)).toBeUndefined()
	})

	test("a Retry during a parked token teardown cannot scan the token being deleted; nothing of it reappears", async () => {
		const { reader, state } = makePublicReader()
		const token = makeTokenStub([tokenA])
		const account = publicAccountStub()
		const { service } = await bootPublic(reader, state, { token, account })
		const tips = vi.fn().mockRejectedValue(new Error("node down"))
		reader.getScanTips = tips
		await failTwice(service)
		tips.mockClear()

		// The teardown parks inside the lock, after its epoch bump, with the doomed target still installed.
		let releaseTeardown: () => void = () => {}
		account.getAccounts.mockImplementationOnce(() => new Promise((resolve) => (releaseTeardown = () => resolve([]))))
		token.getTokensRaw.mockResolvedValue([])
		const deleting = token.onTokenDeleted.invoke({ ...tokenA, profileId: "p1" } as never)
		await flushPromises()

		await surface(service).retryIncomingScan("n1")
		expect(tips).not.toHaveBeenCalled()

		releaseTeardown()
		await deleting
		await flushPromises()
		expect(await cursorFor()).toBeUndefined()
		expect(await storedEpisodes(service)).toBeUndefined()
	})

	test("deleting one token rebuilds the schedulers: the tokens that stay keep polling, and Retry reaches them", async () => {
		const { reader, state } = makePublicReader()
		const token = makeTokenStub([tokenA, tokenB])
		const { service } = await bootPublic(reader, state, { token })
		const tips = vi.fn().mockRejectedValue(new Error("node down"))
		reader.getScanTips = tips
		await failTwice(service)

		token.getTokensRaw.mockResolvedValue([tokenA])
		await token.onTokenDeleted.invoke({ ...tokenB, profileId: "p1" } as never)
		await flushPromises()
		tips.mockClear()
		await surface(service).retryIncomingScan("n1")

		expect(tips).toHaveBeenCalledTimes(1)
		expect(await storedEpisodes(service)).toMatchObject({ [KEY]: { failures: 3, failingSince: T0 } })
	})

	test("a health read is ONE snapshot: clock reads that straddle the threshold cannot split the answer from the baseline", async () => {
		const { reader, state } = makePublicReader()
		const { service } = await bootPublic(reader, state)
		const events = captureHealthEvents(service)
		nodeDown(reader)
		await failTwice(service)

		// First read lands exactly on the threshold (not yet stalled); any later read would be past it.
		const now = vi
			.spyOn(Date, "now")
			.mockReturnValueOnce(T0 + 10 * MIN)
			.mockReturnValue(T0 + 10 * MIN + 1)
		const first = await surface(service).getIncomingSyncHealth("n1")
		now.mockRestore()

		expect(first).toEqual({ stalled: false, since: null })
		expect(events).toEqual([])

		vi.setSystemTime(T0 + 11 * MIN)
		expect(await surface(service).getIncomingSyncHealth("n1")).toEqual({ stalled: true, since: T0 })
		expect(events).toHaveLength(1)
	})

	test("a stall a reader saw while the recovering scan was still running is taken back with an event", async () => {
		await seedEpisodes({ [KEY]: { failures: 3, failingSince: T0 - 25 * MIN, nextAttemptAt: 0 } })
		const { reader } = makePublicReader()
		const healthyTips = reader.getScanTips
		let releaseTips: () => void = () => {}
		reader.getScanTips = async (networkId) => {
			await new Promise<void>((resolve) => {
				releaseTips = resolve
			})
			return healthyTips(networkId)
		}
		const { service } = await bootService({ account: publicAccountStub(), token: makeTokenStub([tokenA]), publicReader: reader })
		await flushPromises()
		const events = captureHealthEvents(service)

		expect(await surface(service).getIncomingSyncHealth("n1")).toEqual({ stalled: true, since: T0 - 25 * MIN })
		releaseTips()
		await flushPromises()

		expect(events).toEqual([{ profileId: "p1", networkId: "n1" }])
		expect(await surface(service).getIncomingSyncHealth("n1")).toEqual({ stalled: false, since: null })
	})

	test("one stall warns once, however many times the worker restarts during it", async () => {
		const warn = vi.spyOn(IncomingTransferService.prototype as unknown as { logWarn: (message: string) => void }, "logWarn")
		await seedEpisodes({ [KEY]: { failures: 6, failingSince: T0 - 25 * MIN, nextAttemptAt: T0 + 4 * MIN } })

		for (let wake = 0; wake < 3; wake++) {
			vi.setSystemTime(T0 + wake * 30_000)
			const { reader } = makePublicReader()
			const { service } = await bootService({ account: publicAccountStub(), token: makeTokenStub([tokenA]), publicReader: reader })
			await flushPromises()
			await surface(service).episodes.settled()
		}

		expect(warn.mock.calls.filter(([message]) => message === "incoming public scan stalled")).toHaveLength(1)
		warn.mockRestore()
	})

	test("an ineligible (non-standard) token is never counted", async () => {
		const { reader, state } = makePublicReader({ classStatus: "non-standard" })
		const { service } = await bootPublic(reader, state)
		for (let minute = 0; minute <= 30; minute += 5) {
			vi.setSystemTime(T0 + minute * MIN)
			await poll(service)
		}
		expect(await storedEpisodes(service)).toBeUndefined()
	})
})

// ── Arrivals ─────────────────────────────────────────────────────────────

/** A chain tip the test steers: each read, through either transport, takes the next queued answer
 *  (a number, an Error, or a promise the test settles), then the standing one. `once` counts the
 *  one-attempt reads. */
function steeredTip(standing: number | Error) {
	const { reader } = makePublicReader()
	const tip = { standing, queue: [] as Array<number | Error | Promise<number>>, calls: 0, once: 0 }
	reader.getLatestBlockNumber = async () => {
		tip.calls++
		const value = await (tip.queue.shift() ?? tip.standing)
		if (value instanceof Error) throw value
		return value
	}
	reader.getChainTipOnce = async (networkId) => {
		tip.once++
		return reader.getLatestBlockNumber(networkId)
	}
	return { reader, tip }
}

type ArrivalInternals = {
	onTokenAdded: (token: unknown) => Promise<void>
	onAccountAdded: (account: { chainId: number; address: string }) => Promise<void>
	onAccountDeleted: (account: { profileId: string; chainId: number; address: string }) => Promise<void>
	repo: IncomingTransferRepository
}
const internals = (service: unknown) => service as ArrivalInternals

async function bootArrivals(tipValue: number | Error, stubs: Parameters<typeof bootService>[0] = {}) {
	const { reader, tip } = steeredTip(tipValue)
	const fixture = await bootService({
		network: makeNetworkStub([
			{ id: "n1", chainId: 1 },
			{ id: "n2", chainId: 1 },
		]),
		account: makeAccountStub([
			{ profileId: "p1", chainId: 1, address: "0xa" },
			{ profileId: "p1", chainId: 1, address: "0xb" },
		]),
		token: makeTokenStub([tokenA]),
		publicReader: reader,
		...stubs,
	})
	await flushPromises()
	return { ...fixture, tip }
}

function seedTrust(contract: string, over: Partial<IncomingTrustRecord> = {}) {
	return seedTrustRow({ profileId: "p1", networkId: "n1", contract, state: "trusted", updatedAt: 0, ...over })
}

/** A receipt in `block` for `account`, on tokenA unless `contract` says otherwise. */
function receipt(n: number, block: number, over: NoteSeed = {}) {
	return seedNote({ uniqueNoteHash: validNoteHash(1_000 + n), contract: tokenA.contract, l2BlockNumber: block, ...over })
}

const tokenAdd = (token: typeof tokenB) => ({ ...token, profileId: "p1", name: `${token.symbol} Token` })

/** Every account scope `bootArrivals` installs, as `profileId|networkId|accountAddress`. */
const BOOTED_SCOPES = ["p1|n1|0xa", "p1|n1|0xb", "p1|n2|0xa", "p1|n2|0xb"]

/** The scopes among `scopes` that hold an arrival row; the repository lists no arrival rows. */
async function arrivalRowsAt(scopes: string[]): Promise<string[]> {
	const present: string[] = []
	for (const scope of scopes) {
		const [profileId, networkId, accountAddress] = scope.split("|")
		if (await repo.getArrivalRow(profileId, networkId, accountAddress)) present.push(scope)
	}
	return present
}

describe("IncomingTransferService — arrival state", () => {
	test("a missing row is baselined to the tip, so a receipt in the tip's block is history", async () => {
		const { service } = await bootArrivals(120)
		const state = await service.getArrivalState("p1", "n1", "0xa")

		expect(await repo.getArrivalRow("p1", "n1", "0xa")).toEqual({ sinceBlock: 120, played: [] })
		expect(isArrivalEligible(noteRecord({ contract: tokenA.contract, l2BlockNumber: 120 }), state)).toBe(false)
		expect(isArrivalEligible(noteRecord({ contract: tokenA.contract, l2BlockNumber: 121 }), state)).toBe(true)
	})

	test("a stored row and a stored floor stay above a lower tip; only the pending floor moves", async () => {
		const { service, tip } = await bootArrivals(50)
		await repo.setArrivalRow("p1", "n1", "0xa", { sinceBlock: 300, played: [] })
		await seedTrust(tokenA.contract, { arrivalFloor: 400 })
		await seedTrust(tokenB.contract, { arrivalFloor: 20, arrivalFloorPending: true })

		const state = await service.getArrivalState("p1", "n1", "0xa")

		expect(tip.calls).toBe(1)
		expect(state).toMatchObject({ sinceBlock: 300, floors: { [tokenA.contract]: 400, [tokenB.contract]: 50 } })
		expect((await repo.getArrivalRow("p1", "n1", "0xa"))?.sinceBlock).toBe(300)
	})

	test("an account floor raised by eviction stays when the tip later reads lower", async () => {
		const { service, tip } = await bootArrivals(0)
		await repo.setArrivalRow("p1", "n1", "0xa", { sinceBlock: 300, played: [] })
		const ids: string[] = []
		for (let i = 0; i < 501; i++) ids.push((await receipt(i, 301 + i, { contract: "0xtokenC" })).id)
		await service.claimArrivals("p1", "n1", "0xa", ids.slice(0, 500))
		await service.claimArrivals("p1", "n1", "0xa", ids.slice(500))
		expect((await repo.getArrivalRow("p1", "n1", "0xa"))?.sinceBlock).toBe(301)

		await seedTrust(tokenA.contract, { arrivalFloorPending: true })
		tip.standing = 50
		expect((await service.getArrivalState("p1", "n1", "0xa")).sinceBlock).toBe(301)
	})

	test("the arrival state reads its tip in one attempt; an account add reads it through the PXE", async () => {
		const { service, tip } = await bootArrivals(120)
		await service.getArrivalState("p1", "n1", "0xa")
		expect(tip).toMatchObject({ calls: 1, once: 1 })
		await internals(service).onAccountAdded({ chainId: 1, address: "0xc" })
		expect(tip).toMatchObject({ calls: 3, once: 1 })
	})

	test.each([
		["refuses a quarantined chain before any request, so nothing is baselined or floored", true],
		["reads a live chain's tip and baselines the scope", false],
	])("the one-attempt tip %s", async (_, quarantined) => {
		const network = makeNetworkStub([
			{ id: "n1", profileId: "p1", chainId: 1, endpoints: [{ id: "e1", rpcUrl: "http://n1" }], primaryEndpointId: "e1" },
		])
		const readChainTip = vi.fn(async () => 120)
		const isChainQuarantined = vi.fn(async () => quarantined)
		const { service } = await bootService({
			network: Object.assign(network, { readChainTip, isChainQuarantined }),
			account: makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }]),
			token: makeTokenStub([tokenA]),
		})
		await flushPromises()
		await seedTrust(tokenA.contract, { arrivalFloor: 5, arrivalFloorPending: true })

		await service.getArrivalState("p1", "n1", "0xa")

		expect(isChainQuarantined).toHaveBeenCalledWith("p1", 1)
		expect(readChainTip.mock.calls).toEqual(quarantined ? [] : [["n1"]])
		expect(await repo.getArrivalRow("p1", "n1", "0xa")).toEqual(quarantined ? undefined : { sinceBlock: 120, played: [] })
		expect(await repo.getTrust("p1", "n1", tokenA.contract)).toMatchObject(
			quarantined ? { arrivalFloor: 5, arrivalFloorPending: true } : { arrivalFloor: 120 },
		)
	})

	test("a row with no pending floor reads no tip", async () => {
		const { service, tip } = await bootArrivals(50)
		await repo.setArrivalRow("p1", "n1", "0xa", { sinceBlock: 10, played: [] })
		await seedTrust(tokenA.contract, { arrivalFloor: 5 })

		await service.getArrivalState("p1", "n1", "0xa")
		expect(tip.calls).toBe(0)
	})

	test("a failed tip read answers sinceBlock null and writes nothing", async () => {
		const { service } = await bootArrivals(new Error("node down"))
		const arrivalWrites = vi.spyOn(internals(service).repo, "setArrivalRow")
		expect((await service.getArrivalState("p1", "n1", "0xa")).sinceBlock).toBeNull()
		expect(await arrivalRowsAt(BOOTED_SCOPES)).toEqual([])
		expect(arrivalWrites).not.toHaveBeenCalled()
	})

	test.each([
		["the profile is tombstoned", (f: Awaited<ReturnType<typeof bootArrivals>>) => f.profile.getProfiles.mockResolvedValue([])],
		["the network is gone", (f: Awaited<ReturnType<typeof bootArrivals>>) => f.network.getNetworksRaw.mockResolvedValue([])],
		["the account is gone", (f: Awaited<ReturnType<typeof bootArrivals>>) => f.account.getAccount.mockResolvedValue(undefined)],
	])("nothing is baselined when %s", async (_name, remove) => {
		const fixture = await bootArrivals(120)
		remove(fixture)
		const arrivalWrites = vi.spyOn(internals(fixture.service).repo, "setArrivalRow")
		expect((await fixture.service.getArrivalState("p1", "n1", "0xa")).sinceBlock).toBeNull()
		expect(await arrivalRowsAt(BOOTED_SCOPES)).toEqual([])
		expect(arrivalWrites).not.toHaveBeenCalled()
	})
})

describe("IncomingTransferService — arrival floors", () => {
	test("a token floor written at N + 1 after a read that saw N stays N + 1", async () => {
		const { service, tip, token } = await bootArrivals(100)
		token.getTokensRaw.mockResolvedValue([tokenA, tokenB])
		await service.getArrivalState("p1", "n1", "0xa")
		tip.standing = 101
		await internals(service).onTokenAdded(tokenAdd(tokenB))
		tip.standing = 102

		expect((await service.getArrivalState("p1", "n1", "0xa")).floors[tokenB.contract]).toBe(101)
	})

	test("an add that read N and enters after an Allow that read N + k keeps N + k", async () => {
		const { service, tip } = await bootArrivals(0)
		await seedTrust(tokenA.contract, { state: "pending" })
		await receipt(1, 5, { hidden: true })
		const addTip = deferred<number>()
		tip.queue.push(addTip.promise)

		const add = internals(service).onTokenAdded(tokenAdd(tokenA))
		await flushPromises()
		tip.standing = 130
		expect(await service.setTrustAllow("p1", "n1", tokenA.contract)).toBe(true)
		addTip.resolve(100)
		await add

		const row = await repo.getTrust("p1", "n1", tokenA.contract)
		expect(row?.arrivalFloor).toBe(130)
		expect(row?.arrivalFloorPending).toBeUndefined()
	})

	test("a token deleted while its add reads the tip gets neither trust nor a floor back", async () => {
		const { service, tip, token } = await bootArrivals(0)
		token.getTokensRaw.mockResolvedValue([tokenA, tokenB])
		const addTip = deferred<number>()
		tip.queue.push(addTip.promise)

		const add = internals(service).onTokenAdded(tokenAdd(tokenB))
		await flushPromises()
		token.getTokensRaw.mockResolvedValue([tokenA])
		await token.onTokenDeleted.invoke({ ...tokenB, profileId: "p1" } as never)
		await flushPromises()
		addTip.resolve(100)
		await add

		expect(await repo.getTrust("p1", "n1", tokenB.contract)).toBeUndefined()
	})

	test("a floor kept through a failed tip read resolves to the higher of its number and the tip", async () => {
		const { service, tip } = await bootArrivals(new Error("node down"))
		await repo.setArrivalRow("p1", "n1", "0xa", { sinceBlock: 0, played: [] })
		await seedTrust(tokenA.contract, { arrivalFloor: 200 })
		await internals(service).onTokenAdded(tokenAdd(tokenA))
		expect((await service.getArrivalState("p1", "n1", "0xa")).floors[tokenA.contract]).toBe("pending")

		tip.standing = 150
		const state = await service.getArrivalState("p1", "n1", "0xa")

		expect(state.floors[tokenA.contract]).toBe(200)
		expect(isArrivalEligible(noteRecord({ contract: tokenA.contract, l2BlockNumber: 180 }), state)).toBe(false)
	})

	test("a pending floor with no number resolves to the tip", async () => {
		const { service, tip, token } = await bootArrivals(new Error("node down"))
		token.getTokensRaw.mockResolvedValue([tokenA, tokenB])
		await repo.setArrivalRow("p1", "n1", "0xa", { sinceBlock: 0, played: [] })
		await internals(service).onTokenAdded(tokenAdd(tokenB))
		tip.standing = 150
		expect((await service.getArrivalState("p1", "n1", "0xa")).floors[tokenB.contract]).toBe(150)
	})

	test("a numeric write that lands while a resolution waits for its tip is not overwritten", async () => {
		const { service, tip } = await bootArrivals(0)
		await repo.setArrivalRow("p1", "n1", "0xa", { sinceBlock: 0, played: [] })
		await seedTrust(tokenA.contract, { arrivalFloor: 100, arrivalFloorPending: true })
		const resolutionTip = deferred<number>()
		tip.queue.push(resolutionTip.promise)

		const read = service.getArrivalState("p1", "n1", "0xa")
		await flushPromises()
		tip.standing = 300
		await service.setTrustAllow("p1", "n1", tokenA.contract)
		resolutionTip.resolve(500)

		expect((await read).floors[tokenA.contract]).toBe(300)
	})

	test("adding a token floors its history before the scan commits it", async () => {
		const noteSvc = makeNoteStub()
		// Only 0xa is handed the note. A record id names no account and the first commit keeps it, so
		// a note handed to both accounts would land on whichever account's scan committed first.
		noteSvc.getNotesRaw.mockImplementation(async (_n: string, account: string, contract: string) =>
			account === "0xa" && contract === tokenB.contract ? [note({ contract: tokenB.contract, l2BlockNumber: 50 })] : [],
		)
		const { service, token } = await bootArrivals(60, { note: noteSvc })
		await repo.setArrivalRow("p1", "n1", "0xa", { sinceBlock: 10, played: [] })
		token.getTokensRaw.mockResolvedValue([tokenA, tokenB])

		await internals(service).onTokenAdded(tokenAdd(tokenB))
		await flushPromises()

		const history = (await repo.listRecords()).filter((r) => r.contract === tokenB.contract && r.networkId === "n1")
		expect(history.map((r) => r.accountAddress)).toEqual(["0xa"])
		const state = await service.getArrivalState("p1", "n1", "0xa")
		expect(history.filter((r) => isArrivalEligible(r, state))).toEqual([])
	})

	test("adding an account floors its history before its cursors reset", async () => {
		const { service } = await bootArrivals(70)
		// A read answers with the rows stored when it is called, so each entry is the row at the reset.
		const atReset: Array<Promise<ArrivalRow | undefined>> = []
		vi.spyOn(internals(service).repo, "setCursor").mockImplementation(async () => {
			atReset.push(repo.getArrivalRow("p1", "n1", "0xnew"))
			return true
		})

		await internals(service).onAccountAdded({ chainId: 1, address: "0xnew" })

		expect(await atReset[0]).toEqual({ sinceBlock: 70, played: [] })
	})

	test("Allow floors the receipts it un-hides on every account; a later receipt plays on both", async () => {
		const { service } = await bootArrivals(44)
		await repo.setArrivalRow("p1", "n1", "0xa", { sinceBlock: 10, played: [] })
		await repo.setArrivalRow("p1", "n1", "0xb", { sinceBlock: 10, played: [] })
		await seedTrust(tokenA.contract, { state: "pending" })
		const onA = await receipt(1, 40, { hidden: true })
		const onB = await receipt(2, 45, { hidden: true, accountAddress: "0xb", owner: "0xb" })

		expect(await service.setTrustAllow("p1", "n1", tokenA.contract)).toBe(true)

		const stateA = await service.getArrivalState("p1", "n1", "0xa")
		const stateB = await service.getArrivalState("p1", "n1", "0xb")
		expect(isArrivalEligible(onA, stateA)).toBe(false)
		expect(isArrivalEligible(onB, stateB)).toBe(false)
		expect(isArrivalEligible(noteRecord({ contract: tokenA.contract, l2BlockNumber: 46 }), stateA)).toBe(true)
		expect(isArrivalEligible(noteRecord({ contract: tokenA.contract, l2BlockNumber: 46, accountAddress: "0xb" }), stateB)).toBe(true)
	})
})

/** Holds the `nth` call of `obj[method]` until `release`: a read computes its answer first, so the
 *  held caller resumes with what it saw; a write is held before it runs. */
function holdCall(obj: object, method: string, nth: number, when: "after" | "before") {
	const target = obj as Record<string, (...args: unknown[]) => Promise<unknown>>
	const current = target[method]
	const real = vi.isMockFunction(current)
		? (current.getMockImplementation() as (...args: unknown[]) => Promise<unknown>)
		: current.bind(obj)
	const spy = vi.isMockFunction(current) ? current : vi.spyOn(target, method)
	let calls = 0
	let release!: () => void
	const gate = new Promise<void>((resolve) => {
		release = resolve
	})
	const held = { reached: false }
	spy.mockImplementation(async (...args: unknown[]) => {
		if (++calls !== nth) return real(...args)
		held.reached = true
		if (when === "before") {
			await gate
			return real(...args)
		}
		const out = await real(...args)
		await gate
		return out
	})
	return { release: () => release(), held }
}

/** Holds an acceptance after its one write has landed, until `release`. */
function holdAfterAcceptance(repo: object) {
	const target = repo as IncomingTransferRepository
	const prepare = target.prepareAcceptance.bind(target)
	let release!: () => void
	const gate = new Promise<void>((resolve) => {
		release = resolve
	})
	const held = { reached: false }
	vi.spyOn(target, "prepareAcceptance").mockImplementation(async (...args) => {
		const commit = await prepare(...args)
		return async () => {
			await commit()
			held.reached = true
			await gate
		}
	})
	return { release: () => release(), held }
}

type Booted = Awaited<ReturnType<typeof bootArrivals>>

describe("IncomingTransferService — a token add displaced by the watchdog while its token is deleted", () => {
	test.each([
		["the section's trust read", (f: Booted) => holdCall(internals(f.service).repo, "getTrust", 1, "after")],
		["the registration's network read", (f: Booted) => holdCall(f.network, "getNetwork", 1, "after")],
		["the registration's token read", (f: Booted) => holdCall(f.token, "getTokensRaw", 1, "after")],
		["the trust write's own read", (f: Booted) => holdCall(internals(f.service).repo, "setTrust", 1, "before")],
		["the floor's trust read", (f: Booted) => holdCall(internals(f.service).repo, "getTrust", 3, "after")],
	])("a pause at %s writes neither trust nor a floor after the delete", async (_name, pause) => {
		const fixture = await bootArrivals(100)
		let registered = [tokenA, tokenB]
		fixture.token.getTokensRaw.mockImplementation(async () => registered)
		const { release, held } = pause(fixture)
		vi.useFakeTimers()
		try {
			const add = internals(fixture.service).onTokenAdded(tokenAdd(tokenB))
			await advance(0)
			expect(held.reached).toBe(true)

			registered = [tokenA]
			void fixture.token.onTokenDeleted.invoke({ ...tokenB, profileId: "p1" } as never)
			await advance(5 * 60_000 + 1)
			release()
			await add
			await advance(0)
		} finally {
			vi.useRealTimers()
		}

		const row = await repo.getTrust("p1", "n1", tokenB.contract)
		expect(row?.state).not.toBe("trusted")
		expect(row?.arrivalFloor).toBeUndefined()
		expect(row?.arrivalFloorPending).toBeUndefined()
	})
})

describe("IncomingTransferService — a trust write lands only in its session and incarnation", () => {
	const trustOf = (profileId = "p1") => repo.getTrust(profileId, "n1", tokenA.contract)
	const seedPending = (profileId = "p1") =>
		seedTrustRow({ profileId, networkId: "n1", contract: tokenA.contract, state: "pending", updatedAt: 0 })
	const allow = (f: Booted) => f.service.setTrustAllow("p1", "n1", tokenA.contract)
	const reject = (f: Booted) => f.service.setTrustReject("p1", "n1", tokenA.contract)
	const setters = [
		["Allow", allow],
		["Reject", reject],
	] as const
	const sessionMoves = [
		["a profile switch", (f: Booted) => f.profile.unlock("p2")],
		["a lock", (f: Booted) => f.profile.lock()],
	] as const
	const hiddenOf = (receipts: IncomingTransferRecord[]) => Promise.all(receipts.map(async (r) => (await repo.getRecord(r.id))?.hidden))

	/** Parks the next chain-tip read until the returned `resolve`. */
	function parkTip(f: Booted) {
		const read = deferred<number>()
		f.tip.queue.push(read.promise)
		return read
	}

	test("setters queued behind the cascade's clear write nothing once their profile's deletion began", async () => {
		const f = await bootArrivals(100)
		await seedPending()
		const wipe = holdCall(internals(f.service).repo, "clearProfile", 1, "before")
		const clear = f.service.clearProfile("p1")
		await flushPromises()
		expect(wipe.held.reached).toBe(true)

		const queued = [allow(f), reject(f)]
		await flushPromises()
		f.profile.beginDeletion("p1")
		wipe.release()
		await clear

		expect(await Promise.all(queued)).toEqual([false, false])
		expect(await trustOf()).toBeUndefined()
	})

	test("a setter called after its profile's deletion began is refused at the capture", async () => {
		const f = await bootArrivals(100)
		await seedPending()
		f.profile.beginDeletion("p1")
		const tipReads = f.tip.calls
		f.token.getTokensRaw.mockClear()

		expect(await allow(f)).toBe(false)
		expect(await reject(f)).toBe(false)
		expect(f.tip.calls).toBe(tipReads)
		expect(f.token.getTokensRaw).not.toHaveBeenCalled()
		expect((await trustOf())?.state).toBe("pending")
	})

	test.each([
		["deleted", (_f: Booted) => {}],
		[
			"deleted, re-imported under the same id and unlocked",
			(f: Booted) => {
				f.profile.releaseDeletion("p1")
				f.profile.unlock("p1")
			},
		],
	])("an Allow whose tip read spans its profile being %s writes nothing", async (_name, after) => {
		const f = await bootArrivals(100)
		await seedPending()
		const tip = parkTip(f)
		const call = allow(f)
		await flushPromises()
		expect(f.tip.queue).toHaveLength(0)

		f.profile.beginDeletion("p1")
		await f.service.clearProfile("p1")
		after(f)
		tip.resolve(100)

		expect(await call).toBe(false)
		expect(await trustOf()).toBeUndefined()
	})

	test.each(sessionMoves)("%s while an Allow reads the tip leaves the contract pending", async (_name, move) => {
		const f = await bootArrivals(100)
		await seedPending()
		const tip = parkTip(f)
		const call = allow(f)
		await flushPromises()
		expect(f.tip.queue).toHaveLength(0)

		move(f)
		tip.resolve(100)

		expect(await call).toBe(false)
		expect((await trustOf())?.state).toBe("pending")
	})

	test.each(setters.flatMap(([setter, run]) => sessionMoves.map(([name, move]) => [setter, name, run, move] as const)))(
		"%s waiting in its registration read through %s leaves the contract pending",
		async (_setter, _name, run, move) => {
			const f = await bootArrivals(100)
			await seedPending()
			const registration = holdCall(f.token, "getTokensRaw", 1, "after")
			const call = run(f)
			await flushPromises()
			expect(registration.held.reached).toBe(true)

			move(f)
			registration.release()

			expect(await call).toBe(false)
			expect((await trustOf())?.state).toBe("pending")
		},
	)

	test.each(setters)(
		"%s displaced by the watchdog in its registration read writes nothing after a successor's clear",
		async (_setter, run) => {
			const f = await bootArrivals(100)
			await seedPending()
			const registration = holdCall(f.token, "getTokensRaw", 1, "after")
			vi.useFakeTimers()
			try {
				const call = run(f)
				await advance(0)
				expect(registration.held.reached).toBe(true)

				const successor = f.service.clearProfile("p1")
				await advance(5 * 60_000 + 1)
				await successor
				registration.release()

				expect(await call).toBe(false)
			} finally {
				vi.useRealTimers()
			}
			expect(await trustOf()).toBeUndefined()
		},
	)

	test("an Allow displaced in its visibility read leaves a successor Reject's block, which deleted the receipts", async () => {
		const f = await bootArrivals(100)
		await seedPending()
		const receipts = [await receipt(1, 40, { hidden: true }), await receipt(2, 41, { hidden: true })]
		const read = holdCall(f.service, "isVisibilityEnabled", 1, "after")
		vi.useFakeTimers()
		try {
			const call = allow(f)
			await advance(0)
			expect(read.held.reached).toBe(true)

			const successor = reject(f)
			await advance(5 * 60_000 + 1)
			expect(await successor).toBe(true)
			read.release()

			expect(await call).toBe(false)
		} finally {
			vi.useRealTimers()
		}
		expect((await trustOf())?.state).toBe("blocked")
		expect(await Promise.all(receipts.map((r) => repo.hasRecord(r.id)))).toEqual([false, false])
	})

	test("an Allow the watchdog displaced writes nothing, and the next popup open prompts again", async () => {
		const f = await bootArrivals(100)
		await seedPending()
		const receipts = [
			await receipt(1, 40, { hidden: true }),
			await receipt(2, 41, { hidden: true }),
			await receipt(3, 42, { hidden: true }),
		]
		const read = holdCall(f.service, "isVisibilityEnabled", 1, "after")
		vi.useFakeTimers()
		try {
			const call = allow(f)
			await advance(0)
			expect(read.held.reached).toBe(true)

			await advance(5 * 60_000 + 1)
			read.release()

			expect(await call).toBe(false)
		} finally {
			vi.useRealTimers()
		}
		expect(await trustOf()).toMatchObject({ state: "pending" })
		expect((await trustOf())?.arrivalFloor).toBeUndefined()
		expect(await hiddenOf(receipts)).toEqual([true, true, true])
		const prompts = vi.fn()
		f.service.onIncomingTransferPending.add(prompts)
		await f.service.replayPendingPrompts("p1", "n1", "0xa")
		expect(prompts).toHaveBeenCalledTimes(1)
	})

	test("a lock before an Allow's write refuses it and writes nothing", async () => {
		const f = await bootArrivals(100)
		await seedPending()
		const receipts = [await receipt(1, 40, { hidden: true }), await receipt(2, 41, { hidden: true })]
		const read = holdCall(f.service, "isVisibilityEnabled", 1, "after")
		const call = allow(f)
		await flushPromises()
		expect(read.held.reached).toBe(true)

		f.profile.lock()
		read.release()

		expect(await call).toBe(false)
		expect(await trustOf()).toMatchObject({ state: "pending" })
		expect(await hiddenOf(receipts)).toEqual([true, true])
	})

	test("a lock after an Allow's write keeps its floor and every un-hide", async () => {
		const f = await bootArrivals(100)
		await seedPending()
		const receipts = [await receipt(1, 40, { hidden: true }), await receipt(2, 41, { hidden: true })]
		const write = holdAfterAcceptance(internals(f.service).repo)
		const call = allow(f)
		await flushPromises()
		expect(write.held.reached).toBe(true)

		f.profile.lock()
		write.release()

		expect(await call).toBe(true)
		expect(await trustOf()).toMatchObject({ state: "trusted", arrivalFloor: 100 })
		expect(await hiddenOf(receipts)).toEqual([false, false])
	})

	test("an accepted Allow commits the trusted row, its floor and every un-hide in one write", async () => {
		const f = await bootArrivals(100)
		await seedPending()
		const receipts = [
			await receipt(1, 40, { hidden: true }),
			await receipt(2, 141, { hidden: true, accountAddress: "0xb", owner: "0xb" }),
		]
		const repo = internals(f.service).repo as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
		const prepare = vi.spyOn(repo, "prepareAcceptance")
		const others = ["setTrust", "setArrivalFloor", "upsertRecord"].map((method) => vi.spyOn(repo, method))

		expect(await allow(f)).toBe(true)

		expect(prepare).toHaveBeenCalledTimes(1)
		expect(prepare.mock.calls[0][0]).toMatchObject({ state: "trusted", arrivalFloor: 141 })
		expect((prepare.mock.calls[0][1] as IncomingTransferRecord[]).map((r) => [r.id, r.hidden])).toEqual(
			receipts.map((r) => [r.id, false]),
		)
		for (const other of others) expect(other).not.toHaveBeenCalled()
		expect(await hiddenOf(receipts)).toEqual([false, false])
	})

	test.each([
		// The repository deletes no single trust row, so a missing row is one never seeded.
		["a missing trust row", () => Promise.resolve()],
		[
			"a trust row reset to unknown",
			() => seedTrustRow({ profileId: "p1", networkId: "n1", contract: tokenA.contract, state: "unknown", updatedAt: 0 }),
		],
	])("an Allow over %s writes nothing", async (_name, arrange) => {
		const f = await bootArrivals(100)
		const receipts = [await receipt(1, 40, { hidden: true })]
		await arrange()
		const before = await trustOf()

		expect(await allow(f)).toBe(false)
		expect(await trustOf()).toEqual(before)
		expect(await hiddenOf(receipts)).toEqual([true])
	})

	test("a displaced late-delete that finishes during an Allow's reads does not get its record back", async () => {
		const f = await bootArrivals(100)
		await seedPending()
		const own = await receipt(1, 40, { hidden: true, txHash: "0xown" })
		const other = await receipt(2, 41, { hidden: true })
		const read = holdCall(f.service, "isVisibilityEnabled", 1, "after")
		vi.useFakeTimers()
		try {
			const deleter = await displacedDeleter(f, "0xown")
			const call = allow(f)
			await advance(0)
			await deleter.finish()
			read.release()
			await advance(0)
			expect(await call).toBe(false)
		} finally {
			vi.useRealTimers()
		}
		expect(await repo.hasRecord(own.id)).toBe(false)
		expect((await trustOf())?.state).toBe("pending")
		expect(await hiddenOf([other])).toEqual([true])
	})

	test("a token add emitted after a switch away from its profile changes neither profile's trust", async () => {
		const f = await bootArrivals(100)
		f.token.getTokensRaw.mockImplementation(async (profileId: string) => [{ ...tokenA, profileId }])
		await seedPending("p1")
		await seedPending("p2")
		f.profile.unlock("p2")

		await internals(f.service).onTokenAdded(tokenAdd(tokenA))

		expect([(await trustOf("p1"))?.state, (await trustOf("p2"))?.state]).toEqual(["pending", "pending"])
	})

	test("a token add whose tip read spans its profile's deletion writes neither trust nor a floor", async () => {
		const f = await bootArrivals(100)
		const tip = parkTip(f)
		const add = internals(f.service).onTokenAdded(tokenAdd(tokenA))
		await flushPromises()
		expect(f.tip.queue).toHaveLength(0)

		f.profile.beginDeletion("p1")
		await f.service.clearProfile("p1")
		tip.resolve(100)
		await add

		expect(await trustOf()).toBeUndefined()
	})

	test("an already-trusted token add whose session moves during its registration read leaves the floor", async () => {
		const f = await bootArrivals(100)
		await seedTrust(tokenA.contract, { arrivalFloor: 40 })
		const registration = holdCall(f.token, "getTokensRaw", 1, "after")
		const add = internals(f.service).onTokenAdded(tokenAdd(tokenA))
		await flushPromises()
		expect(registration.held.reached).toBe(true)

		f.profile.unlock("p2")
		registration.release()
		await add

		const row = await trustOf()
		expect(row).toMatchObject({ state: "trusted", arrivalFloor: 40 })
		expect(row?.arrivalFloorPending).toBeUndefined()
	})
})

describe("IncomingTransferService — claimArrivals", () => {
	test("claims an eligible receipt once", async () => {
		const { service } = await bootArrivals(10)
		await service.getArrivalState("p1", "n1", "0xa")
		const r = await receipt(1, 11)

		expect(await service.claimArrivals("p1", "n1", "0xa", [r.id])).toEqual([r.id])
		expect(await service.claimArrivals("p1", "n1", "0xa", [r.id])).toEqual([])
	})

	test("ignores another profile's, network's and account's ids, played ids and unknown ids", async () => {
		const { service } = await bootArrivals(10)
		await service.getArrivalState("p1", "n1", "0xa")
		const mine = await receipt(1, 11)
		const played = await receipt(2, 12)
		await service.claimArrivals("p1", "n1", "0xa", [played.id])
		const foreign = [
			(await receipt(3, 11, { accountAddress: "0xb", owner: "0xb" })).id,
			(await receipt(4, 11, { networkId: "n2" })).id,
			(await receipt(5, 11, { profileId: "p2" })).id,
		]

		expect(await service.claimArrivals("p1", "n1", "0xa", [...foreign, played.id, "note:p1|n1|0xunknown", mine.id])).toEqual([mine.id])
	})

	test("a claim that captured its epoch before a profile clear writes nothing", async () => {
		const { service } = await bootArrivals(10)
		await service.getArrivalState("p1", "n1", "0xa")
		await service.getArrivalState("p1", "n1", "0xb")
		const onA = await receipt(1, 11)
		const onB = await receipt(2, 11, { accountAddress: "0xb", owner: "0xb" })
		const repo = internals(service).repo
		const hold = deferred<void>()
		const realGet = repo.getArrivalRow.bind(repo)
		vi.spyOn(repo, "getArrivalRow").mockImplementationOnce(async (...args) => {
			await hold.promise
			return realGet(...args)
		})

		const holder = service.claimArrivals("p1", "n1", "0xb", [onB.id])
		await flushPromises()
		const clear = service.clearProfile("p1")
		const claim = service.claimArrivals("p1", "n1", "0xa", [onA.id])
		hold.resolve()
		await Promise.all([holder, clear])

		expect(await claim).toEqual([])
		expect(await repo.getArrivalRow("p1", "n1", "0xa")).toBeUndefined()
	})

	test("a claim the watchdog displaced writes nothing after it resumes", async () => {
		const { service } = await bootArrivals(10)
		await service.getArrivalState("p1", "n1", "0xa")
		const first = await receipt(1, 11)
		const second = await receipt(2, 12)
		const repo = internals(service).repo
		const parked = deferred<void>()
		const realGetRecord = repo.getRecord.bind(repo)
		vi.spyOn(repo, "getRecord").mockImplementation(async (id) => {
			if (id === first.id) await parked.promise
			return realGetRecord(id)
		})
		vi.useFakeTimers()
		try {
			const displaced = service.claimArrivals("p1", "n1", "0xa", [first.id])
			await advance(0)
			const successor = service.claimArrivals("p1", "n1", "0xa", [second.id])
			await advance(5 * 60_000 + 1)
			expect(await successor).toEqual([second.id])

			parked.resolve()
			expect(await displaced).toEqual([])
			expect((await repo.getArrivalRow("p1", "n1", "0xa"))?.played.map(([id]) => id)).toEqual([second.id])
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("IncomingTransferService — arrival purges", () => {
	test("an account purge, clearChain and clearProfile delete only their scope's rows", async () => {
		const { service } = await bootArrivals(10)
		const row = { sinceBlock: 1, played: [] }
		const seeded = [...BOOTED_SCOPES, "p2|n1|0xa"]
		for (const scope of seeded) {
			const [profileId, networkId, accountAddress] = scope.split("|")
			await repo.setArrivalRow(profileId, networkId, accountAddress, row)
		}
		const arrivalWrites = vi.spyOn(internals(service).repo, "setArrivalRow")

		await internals(service).onAccountDeleted({ profileId: "p1", chainId: 1, address: "0xa" })
		expect((await arrivalRowsAt(seeded)).sort()).toEqual(["p1|n1|0xb", "p1|n2|0xb", "p2|n1|0xa"])

		await service.clearChain("p1", "n1")
		expect((await arrivalRowsAt(seeded)).sort()).toEqual(["p1|n2|0xb", "p2|n1|0xa"])

		await service.clearProfile("p1")
		expect(await arrivalRowsAt(seeded)).toEqual(["p2|n1|0xa"])
		expect(arrivalWrites).not.toHaveBeenCalled()
	})
})

// ── Receipt critical sections: the epoch re-check matrix ─────────────────────
//
// Each row parks one await of a receipt critical section, bumps the service epoch while it is
// parked (where an off-lock hydrate or a watchdog-admitted wipe would land) and releases it. The
// ordered call log is the oracle: a removed check that a later check masks still changes which
// collaborators run. A parked collaborator has already run, so its effect on the fake storage precedes
// `BUMP`; that order says nothing about when production storage commits. The real `setTrust` reads the
// stored row through `getTrust`, so a trust write logs `setTrust` then a second `getTrust`.

type ReceiptFixture = Awaited<ReturnType<typeof bootService>>
type CollaboratorMap = Record<string, (...args: unknown[]) => Promise<unknown>>

const RECEIPT_COLLABORATORS: Array<[keyof ReceiptFixture | "repo", string, string]> = [
	["note", "getNotesRaw", "notes"],
	["token", "getTokensRaw", "tokens"],
	["transaction", "transactionsOf", "outgoing"],
	["journal", "getOperations", "inflight"],
	["repo", "getRecord", "getRecord"],
	["repo", "getTrust", "getTrust"],
	["repo", "setTrust", "setTrust"],
	["config", "getValue", "visibility"],
	["note", "getBlockTimestamp", "timestamp"],
	["repo", "setOutbox", "setOutbox"],
	["repo", "upsertRecord", "upsert"],
]

function collaboratorTarget(f: ReceiptFixture, owner: keyof ReceiptFixture | "repo"): CollaboratorMap {
	if (owner === "repo") return (f.service as unknown as { repo: CollaboratorMap }).repo
	return f[owner] as unknown as CollaboratorMap
}

/** Logs every receipt collaborator call and emit; the `hold` call parks after it returns. `hold` is
 *  a label, or `label#n` for its n-th call. */
function instrumentReceipt(f: ReceiptFixture, hold?: string) {
	const [holdLabel, holdNth = "1"] = (hold ?? "").split("#")
	const calls = new Map<string, number>()
	const log: string[] = []
	let release!: () => void
	const gate = new Promise<void>((resolve) => {
		release = resolve
	})
	const parked = { reached: false }
	for (const [owner, method, label] of RECEIPT_COLLABORATORS) {
		const target = collaboratorTarget(f, owner)
		const real = target[method].bind(target)
		target[method] = async (...args: unknown[]) => {
			if (label === "visibility" && args[0] !== "incomingTransfersVisible") return real(...args)
			log.push(label)
			calls.set(label, (calls.get(label) ?? 0) + 1)
			const nth = calls.get(label)
			const out = await real(...args)
			if (label === holdLabel && nth === Number(holdNth) && !parked.reached) {
				parked.reached = true
				await gate
			}
			return out
		}
	}
	f.service.onIncomingTrustChanged.add(() => log.push("trustChanged"))
	f.service.onIncomingTransferPending.add(() => log.push("pending"))
	f.service.onIncomingTransferAdded.add(() => log.push("added"))
	f.service.onIncomingTransferUpdated.add(() => log.push("updated"))
	const svc = f.service as unknown as { serviceEpoch: number }
	const bump = () => {
		log.push("BUMP")
		svc.serviceEpoch += 1
	}
	return { log, parked, bump, release: () => release() }
}

/** Run `op`; when `hold` names a collaborator, bump while it is parked; `stale` bumps before the
 *  critical section's lock is granted. */
async function runReceipt(inst: ReturnType<typeof instrumentReceipt>, hold: string, op: () => Promise<unknown>) {
	const done = op()
	if (hold === "stale") inst.bump()
	if (hold !== "none" && hold !== "stale") {
		await vi.waitFor(() => expect(inst.parked.reached).toBe(true), { interval: 1 })
		inst.bump()
		inst.release()
	}
	await done
}

const WATCHDOG_MS = 5 * 60_000 + 1

/** Advance fake time in zero steps until `reached` holds: each step drains the microtasks queued by
 *  the last. */
async function untilReached(held: { reached: boolean }) {
	for (let i = 0; i < 20 && !held.reached; i++) await advance(0)
	expect(held.reached).toBe(true)
}

/** Run `op` and, while `hold` is parked, let the lock watchdog hand the lock over: the section's
 *  ticket goes stale and the epoch stays where it was. */
async function runHandoff<T>(inst: ReturnType<typeof instrumentReceipt>, op: () => Promise<T>): Promise<T> {
	vi.useFakeTimers()
	try {
		const done = op()
		await untilReached(inst.parked)
		inst.log.push("HANDOFF")
		await advance(WATCHDOG_MS)
		inst.release()
		await advance(0)
		return await done
	} finally {
		vi.useRealTimers()
	}
}

const flagString = (flags: boolean[]) => flags.map((f) => (f ? "1" : "0")).join("")

const NOTE_ID = noteRecordId("p1", "n1", validNoteHash(1))
const PUB_TX = "0xptx"
const PUB_ID = `pub:p1|n1|${PUB_TX}|0`
const trustedRow = () =>
	seedTrustRow({
		profileId: "p1",
		networkId: "n1",
		contract: tokenA.contract,
		state: "trusted",
		updatedAt: 0,
	})
const ownTx = (hash: string) => makeTransactionStub([{ hash, account: "0xa", chainId: 1, profileId: "p1", networkId: "n1" }])

type NoteFixture = "unknown" | "trusted" | "existing" | "outgoing-hit"

async function bootNoteReceipt(fixture: NoteFixture) {
	const booted = await bootService({
		network: makeNetworkStub([{ id: "n1", chainId: 1 }]),
		token: makeTokenStub([tokenA]),
		note: makeNoteStub({ [tokenA.contract]: [note()] }, { 100: 1_234 }),
		transaction: fixture === "outgoing-hit" ? ownTx("0xtx1") : makeTransactionStub(),
	})
	if (fixture === "trusted") await trustedRow()
	if (fixture === "existing")
		await seedNote({
			uniqueNoteHash: validNoteHash(1),
			contract: tokenA.contract,
			tokenId: tokenA.id,
			l2BlockNumber: 100,
			blockTimestamp: undefined,
		})
	return booted
}

/** [trust written, trustChanged, pending, outbox written, record written, added], from state + emits. */
async function receiptFlags(log: string[], recordId: string, fixture: string): Promise<string> {
	const record = await repo.getRecord(recordId)
	const recordWritten =
		fixture === "existing"
			? record?.blockTimestamp === 1_234
			: fixture === "reconcile"
				? record?.kind === "public-event" && record.blockHash === "0xbh5"
				: record !== undefined
	return flagString([
		(await repo.getTrust("p1", "n1", tokenA.contract))?.state === "pending",
		log.includes("trustChanged"),
		log.includes("pending"),
		(await repo.getOutbox("p1", "n1", "0xa", tokenA.id)) !== undefined,
		recordWritten,
		log.includes("added"),
	])
}

/** Both arms' locked head: one order, pinned for both by the matrices below. */
const RECEIPT_HEAD = ["tokens", "getRecord", "outgoing", "inflight"]
/** A new note's block time is read before the lock, behind the head's own local reads. */
const NOTE_TIME_READ = ["getRecord", "outgoing", "inflight", "timestamp"]
const NOTE_PROMOTION = ["getTrust", "setTrust", "getTrust", "trustChanged", "visibility", "pending"]
const NOTE_UNKNOWN = ["notes", ...NOTE_TIME_READ, ...RECEIPT_HEAD, ...NOTE_PROMOTION, "setOutbox", "upsert"]
const NOTE_TRUSTED = ["notes", ...NOTE_TIME_READ, ...RECEIPT_HEAD, "getTrust", "setOutbox", "upsert", "visibility", "added"]
/** Index of `label` in `log`, or of its n-th occurrence for `label#n`. */
const nthIndex = (log: string[], label: string) => {
	const [name, nth = "1"] = label.split("#")
	let seen = 0
	return log.findIndex((entry) => entry === name && ++seen === Number(nth))
}
/** `log` with `marker` after `label` and everything past `stop` dropped; both take `label#n`. */
const bumpedAfter = (
	log: string[],
	label: string,
	stop = `${log[log.length - 1]}#${log.filter((e) => e === log[log.length - 1]).length}`,
	marker = "BUMP",
) => {
	const cut = log.slice(0, nthIndex(log, stop) + 1)
	const at = nthIndex(cut, label) + 1
	return [...cut.slice(0, at), marker, ...cut.slice(at)]
}
/** `log` cut after `label`, where the watchdog handed the lock over. */
const handedOffAfter = (log: string[], label: string) => bumpedAfter(log, label, label, "HANDOFF")

describe("IncomingTransferService — note receipt epoch re-check matrix", () => {
	test.each<[string, NoteFixture, string, string[], string]>([
		["control, unknown trust", "unknown", "none", NOTE_UNKNOWN, "111110"],
		["N0 stale entry: nothing inside the section runs", "unknown", "notes", ["notes", "BUMP"], "000000"],
		["N1 token read", "unknown", "tokens", bumpedAfter(NOTE_UNKNOWN, "tokens", "tokens"), "000000"],
		["N2 record read", "unknown", "getRecord#2", bumpedAfter(NOTE_UNKNOWN, "getRecord#2", "getRecord#2"), "000000"],
		[
			"N3 outgoing read (miss): the journal is still read, then the note stands down",
			"unknown",
			"outgoing#2",
			bumpedAfter(NOTE_UNKNOWN, "outgoing#2", "inflight#2"),
			"000000",
		],
		["N4 in-flight read", "unknown", "inflight#2", bumpedAfter(NOTE_UNKNOWN, "inflight#2", "inflight#2"), "000000"],
		["N5 trust read", "unknown", "getTrust", bumpedAfter(NOTE_UNKNOWN, "getTrust", "getTrust"), "000000"],
		[
			"N6 bare bump after the trust write: the prompt still emits",
			"unknown",
			"setTrust",
			bumpedAfter(NOTE_UNKNOWN, "getTrust#2", "pending"),
			"111000",
		],
		[
			"N7 bare bump in the prompt's visibility read: the prompt still emits",
			"unknown",
			"visibility",
			bumpedAfter(NOTE_UNKNOWN, "visibility", "pending"),
			"111000",
		],
		[
			"N8 timestamp read, before the lock: nothing inside the section runs",
			"unknown",
			"timestamp",
			bumpedAfter(NOTE_UNKNOWN, "timestamp", "timestamp"),
			"000000",
		],
		["N9 outbox write: the record stands down", "unknown", "setOutbox", bumpedAfter(NOTE_UNKNOWN, "setOutbox", "setOutbox"), "111100"],
		["N10 record write", "unknown", "upsert", bumpedAfter(NOTE_UNKNOWN, "upsert"), "111110"],
		["control, trusted", "trusted", "none", NOTE_TRUSTED, "000111"],
		["N9 outbox write, trusted", "trusted", "setOutbox", bumpedAfter(NOTE_TRUSTED, "setOutbox", "setOutbox"), "000100"],
		["N10 record write, trusted: Added stands down", "trusted", "upsert", bumpedAfter(NOTE_TRUSTED, "upsert", "visibility"), "000110"],
		["N11 Added visibility read", "trusted", "visibility", bumpedAfter(NOTE_TRUSTED, "visibility", "visibility"), "000110"],
		[
			"control, existing record without a timestamp",
			"existing",
			"none",
			["notes", "getRecord", "timestamp", "tokens", "getRecord", "upsert"],
			"000010",
		],
		[
			"N2 record read, existing: the backfill stands down",
			"existing",
			"getRecord#2",
			["notes", "getRecord", "timestamp", "tokens", "getRecord", "BUMP"],
			"000000",
		],
		[
			"N4b backfill timestamp read, before the lock: nothing inside the section runs",
			"existing",
			"timestamp",
			["notes", "getRecord", "timestamp", "BUMP"],
			"000000",
		],
	])("%s", async (_name, fixture, hold, expectedLog, expectedFlags) => {
		const f = await bootNoteReceipt(fixture)
		const inst = instrumentReceipt(f, hold)
		await runReceipt(inst, hold, () => scan(f.service))
		expect(inst.log).toEqual(expectedLog)
		expect(await receiptFlags(inst.log, NOTE_ID, fixture)).toBe(expectedFlags)
	})

	test.each<[string, string, string[], string]>([
		[
			"N5b handoff in the trust write's stored read: no row is written",
			"getTrust#2",
			handedOffAfter(NOTE_UNKNOWN, "getTrust#2"),
			"000000",
		],
		["N6h handoff after the trust write: neither prompt emits", "setTrust", handedOffAfter(NOTE_UNKNOWN, "getTrust#2"), "100000"],
		[
			"N7h handoff in the prompt's visibility read: the trust event emits, the prompt does not",
			"visibility",
			handedOffAfter(NOTE_UNKNOWN, "visibility"),
			"110000",
		],
		[
			"N8h a watchdog interval in the timestamp read hands nothing over: the lock is not held there",
			"timestamp",
			bumpedAfter(NOTE_UNKNOWN, "timestamp", undefined, "HANDOFF"),
			"111110",
		],
	])("%s", async (_name, hold, expectedLog, expectedFlags) => {
		const f = await bootNoteReceipt("unknown")
		const inst = instrumentReceipt(f, hold)
		await runHandoff(inst, () => scan(f.service))
		expect(inst.log).toEqual(expectedLog)
		expect(await receiptFlags(inst.log, NOTE_ID, "unknown")).toBe(expectedFlags)
	})

	test("an own outgoing hash: the record is read first, the journal and the block time never", async () => {
		const f = await bootNoteReceipt("outgoing-hit")
		const inst = instrumentReceipt(f)
		await scan(f.service)
		expect(inst.log).toEqual(["notes", "getRecord", "outgoing", "tokens", "getRecord", "outgoing"])
	})

	test("an already-recorded note costs a record read before the lock, then the token and record reads", async () => {
		const f = await bootNoteReceipt("existing")
		await repo.upsertRecord({ ...((await repo.getRecord(NOTE_ID)) as IncomingNoteRecord), blockTimestamp: 1_234 })
		const inst = instrumentReceipt(f)
		await scan(f.service)
		expect(inst.log).toEqual(["notes", "getRecord", "tokens", "getRecord"])
	})
})

describe("IncomingTransferService — a note's block time is read outside the service lock", () => {
	test("clearProfile settles while a scan's block-time read is pending; released, the read recreates nothing", async () => {
		const f = await bootNoteReceipt("trusted")
		const timestamp = holdCall(f.note, "getBlockTimestamp", 1, "before")
		const receipt = scan(f.service)
		await vi.waitFor(() => expect(timestamp.held.reached).toBe(true), { interval: 1 })

		let cleared = false
		void f.service.clearProfile("p1").then(() => {
			cleared = true
		})
		await vi.waitFor(() => expect(cleared).toBe(true), { interval: 1 })

		timestamp.release()
		await receipt
		expect(await repo.hasRecord(NOTE_ID)).toBe(false)
		expect((await repo.listOutbox()).length).toBe(0)
	})

	test("a locked commit whose own-send read disagrees with the one before the lock reads no block time", async () => {
		const f = await bootNoteReceipt("trusted")
		f.transaction.transactionsOf
			.mockResolvedValueOnce([{ hash: "0xtx1", account: "0xa", chainId: 1, profileId: "p1", networkId: "n1" }])
			.mockRejectedValueOnce(new Error("transactions unavailable"))
		await scan(f.service)
		expect(f.note.getBlockTimestamp).not.toHaveBeenCalled()
		// A stored row is JSON, so an unset time is an absent key.
		const stored = await repo.getRecord(NOTE_ID)
		expect(stored).toBeDefined()
		expect(stored?.blockTimestamp).toBeUndefined()
	})

	test("a new note without an amount, which the commit never records, costs no block-time read", async () => {
		const f = await bootService({
			network: makeNetworkStub([{ id: "n1", chainId: 1 }]),
			token: makeTokenStub([tokenA]),
			note: makeNoteStub({ [tokenA.contract]: [note({ content: {} })] }, { 100: 1_234 }),
		})
		await trustedRow()
		await scan(f.service)
		expect(f.note.getBlockTimestamp).not.toHaveBeenCalled()
		expect((await repo.listRecords()).length).toBe(0)
	})

	test("a failed block-time read is made once per block per scan, and again by the next scan", async () => {
		const notes = [note(), note({ uniqueNoteHash: validNoteHash(2), txHash: "0xtx2" })]
		const f = await bootService({
			network: makeNetworkStub([{ id: "n1", chainId: 1 }]),
			token: makeTokenStub([tokenA]),
			note: makeNoteStub({ [tokenA.contract]: notes }),
		})
		await trustedRow()
		await scan(f.service)
		expect(f.note.getBlockTimestamp).toHaveBeenCalledTimes(1)
		expect((await repo.listRecords()).length).toBe(2)
		await scan(f.service)
		expect(f.note.getBlockTimestamp).toHaveBeenCalledTimes(2)
	})
})

type PublicFixture = "unknown" | "trusted" | "reconcile" | "outgoing-hit"

async function bootPublicReceipt(fixture: PublicFixture) {
	const { reader, state } = makePublicReader()
	const booted = await bootPublic(reader, state, fixture === "outgoing-hit" ? { transaction: ownTx(PUB_TX) } : {})
	if (fixture === "trusted") await trustedRow()
	if (fixture === "reconcile") await seedPublic({ txHash: PUB_TX, blockHash: "0xold" })
	return booted
}

type PublicCommit = (
	p: string,
	n: string,
	c: string,
	chainId: number,
	account: string,
	ev: PublicTransferEvent,
	epochAtStart: number,
	opts?: { reconcile?: boolean },
) => Promise<"revoked" | "processed">

function commitPublic(service: unknown, opts?: { reconcile?: boolean }, ev: PublicTransferEvent = pubEvent({ txHash: PUB_TX })) {
	const svc = service as { serviceEpoch: number; commitPublicEvent: PublicCommit }
	return svc.commitPublicEvent("p1", "n1", tokenA.contract, 1, "0xa", ev, svc.serviceEpoch, opts)
}

const PUB_UNKNOWN = [...RECEIPT_HEAD, "getTrust", "setTrust", "getTrust", "trustChanged", "visibility", "pending", "setOutbox", "upsert"]
const PUB_TRUSTED = [...RECEIPT_HEAD, "getTrust", "setOutbox", "upsert", "visibility", "added"]
const PUB_RECONCILE = ["tokens", "getRecord", "upsert", "visibility", "updated"]

describe("IncomingTransferService — public receipt epoch re-check matrix", () => {
	test.each<[string, PublicFixture, string, string[], string]>([
		["control, unknown trust", "unknown", "none", PUB_UNKNOWN, "111110"],
		["P0 stale entry: nothing inside the section runs", "unknown", "stale", ["BUMP"], "000000"],
		["P1 token read", "unknown", "tokens", bumpedAfter(PUB_UNKNOWN, "tokens", "tokens"), "000000"],
		["P2 record read", "unknown", "getRecord", bumpedAfter(PUB_UNKNOWN, "getRecord", "getRecord"), "000000"],
		[
			"P3 outgoing read (miss): the journal is still read, then the event stands down",
			"unknown",
			"outgoing",
			bumpedAfter(PUB_UNKNOWN, "outgoing", "inflight"),
			"000000",
		],
		["P4 in-flight read", "unknown", "inflight", bumpedAfter(PUB_UNKNOWN, "inflight", "inflight"), "000000"],
		["P5 trust read: the promotion stands down", "unknown", "getTrust", bumpedAfter(PUB_UNKNOWN, "getTrust", "getTrust"), "000000"],
		[
			"P6 bare bump after the trust write: the prompt still emits",
			"unknown",
			"setTrust",
			bumpedAfter(PUB_UNKNOWN, "getTrust#2", "pending"),
			"111000",
		],
		[
			"P7 bare bump in the prompt's visibility read: the prompt still emits",
			"unknown",
			"visibility",
			bumpedAfter(PUB_UNKNOWN, "visibility", "pending"),
			"111000",
		],
		["P8 outbox write: the record stands down", "unknown", "setOutbox", bumpedAfter(PUB_UNKNOWN, "setOutbox", "setOutbox"), "111100"],
		["P9 record write", "unknown", "upsert", bumpedAfter(PUB_UNKNOWN, "upsert"), "111110"],
		["control, trusted", "trusted", "none", PUB_TRUSTED, "000111"],
		["P8 outbox write, trusted", "trusted", "setOutbox", bumpedAfter(PUB_TRUSTED, "setOutbox", "setOutbox"), "000100"],
		["P9 record write, trusted: Added stands down", "trusted", "upsert", bumpedAfter(PUB_TRUSTED, "upsert", "visibility"), "000110"],
		["P10 Added visibility read", "trusted", "visibility", bumpedAfter(PUB_TRUSTED, "visibility", "visibility"), "000110"],
		["control, reconcile of a moved block", "reconcile", "none", PUB_RECONCILE, "000010"],
		["P2 record read, reconcile: the update stands down", "reconcile", "getRecord", ["tokens", "getRecord", "BUMP"], "000000"],
		[
			"P11 Updated visibility read, reconcile: Updated stands down",
			"reconcile",
			"visibility",
			bumpedAfter(PUB_RECONCILE, "visibility", "visibility"),
			"000010",
		],
	])("%s", async (_name, fixture, hold, expectedLog, expectedFlags) => {
		const f = await bootPublicReceipt(fixture)
		const inst = instrumentReceipt(f, hold)
		await runReceipt(inst, hold, () => commitPublic(f.service, fixture === "reconcile" ? { reconcile: true } : undefined))
		expect(inst.log).toEqual(expectedLog)
		expect(await receiptFlags(inst.log, PUB_ID, fixture)).toBe(expectedFlags)
	})

	test.each<[string, string, string[], string]>([
		[
			"P5b handoff in the trust write's stored read: no row is written",
			"getTrust#2",
			handedOffAfter(PUB_UNKNOWN, "getTrust#2"),
			"000000",
		],
		["P6h handoff after the trust write: neither prompt emits", "setTrust", handedOffAfter(PUB_UNKNOWN, "getTrust#2"), "100000"],
		[
			"P7h handoff in the prompt's visibility read: the trust event emits, the prompt does not",
			"visibility",
			handedOffAfter(PUB_UNKNOWN, "visibility"),
			"110000",
		],
		["P8h handoff in the outbox write: no record", "setOutbox", handedOffAfter(PUB_UNKNOWN, "setOutbox"), "111100"],
	])("%s; the commit is revoked", async (_name, hold, expectedLog, expectedFlags) => {
		const f = await bootPublicReceipt("unknown")
		const inst = instrumentReceipt(f, hold)
		expect(await runHandoff(inst, () => commitPublic(f.service))).toBe("revoked")
		expect(inst.log).toEqual(expectedLog)
		expect(await receiptFlags(inst.log, PUB_ID, "unknown")).toBe(expectedFlags)
	})

	test("an own outgoing hash: the record is read first and the journal is never read", async () => {
		const f = await bootPublicReceipt("outgoing-hit")
		const inst = instrumentReceipt(f)
		await commitPublic(f.service)
		expect(inst.log).toEqual(["tokens", "getRecord", "outgoing"])
	})
})

describe("IncomingTransferService — Updated on a re-mine", () => {
	const updatesOf = (service: IncomingTransferService) => {
		const updated: IncomingTransferRecord[] = []
		service.onIncomingTransferUpdated.add((r) => updated.push(r))
		return updated
	}

	test("a visible rewrite emits one Updated carrying the new block; an unmoved record emits none", async () => {
		const f = await bootPublicReceipt("reconcile")
		const updated = updatesOf(f.service)
		await commitPublic(f.service, { reconcile: true })
		await commitPublic(f.service, { reconcile: true })
		expect(updated).toHaveLength(1)
		expect(updated[0]).toMatchObject({ id: PUB_ID, blockHash: "0xbh5", l2BlockNumber: 5 })
	})

	test.each<[string, (f: Awaited<ReturnType<typeof bootPublicReceipt>>) => unknown]>([
		["a hidden record", () => seedPublic({ txHash: PUB_TX, blockHash: "0xold", hidden: true })],
		["visibility off", (f) => f.config.setVisibility(false)],
	])("%s is rewritten without an Updated", async (_name, arrange) => {
		const f = await bootPublicReceipt("reconcile")
		await arrange(f)
		const updated = updatesOf(f.service)
		await commitPublic(f.service, { reconcile: true })
		expect(await repo.getRecord(PUB_ID)).toMatchObject({ blockHash: "0xbh5" })
		expect(updated).toEqual([])
	})

	test("a handoff during Updated's visibility read rewrites the record and emits nothing", async () => {
		const f = await bootPublicReceipt("reconcile")
		const inst = instrumentReceipt(f, "visibility")
		await runHandoff(inst, () => commitPublic(f.service, { reconcile: true }))
		expect(inst.log).toEqual(handedOffAfter(PUB_RECONCILE, "visibility"))
		expect(await repo.getRecord(PUB_ID)).toMatchObject({ blockHash: "0xbh5" })
	})
})

// ── Receipt sections beside a watchdog handoff or a displaced deleter ─────────

type DeleterInternals = {
	onTransactionAdded: (tx: { hash: string; account: string; chainId: number; calls: unknown[] }) => Promise<void>
}
const ownTxAdded = (service: unknown, hash: string) =>
	(service as DeleterInternals).onTransactionAdded({ hash, account: "0xa", chainId: 1, calls: [] })

/** Starts a late-delete for `hash`, parks it in its record listing and lets the watchdog hand the lock
 *  over, so it is still running, displaced, when the caller's next section enters. Fake timers. */
async function displacedDeleter(f: ReceiptFixture, hash: string) {
	const listing = holdCall(internals(f.service).repo, "listByTxHash", 1, "after")
	const done = ownTxAdded(f.service, hash)
	await untilReached(listing.held)
	await advance(WATCHDOG_MS)
	return {
		finish: async () => {
			listing.release()
			await advance(0)
			await done
		},
	}
}

describe("IncomingTransferService — receipt sections beside a handoff or a displaced deleter", () => {
	test.each<[string, () => Promise<ReceiptFixture>, (f: ReceiptFixture) => Promise<unknown>, string]>([
		["note", () => bootNoteReceipt("unknown"), (f) => scan(f.service), NOTE_ID],
		["public", () => bootPublicReceipt("unknown"), (f) => commitPublic(f.service), PUB_ID],
	])(
		"a %s prompt a handoff silenced comes back: the next tick stores the receipt hidden and the next popup open prompts",
		async (_arm, boot, commit, id) => {
			const f = await boot()
			const inst = instrumentReceipt(f, "setTrust")
			await runHandoff(inst, () => commit(f))
			expect(inst.log).not.toContain("pending")

			await commit(f)
			expect((await repo.getRecord(id))?.hidden).toBe(true)
			const prompts = vi.fn()
			f.service.onIncomingTransferPending.add(prompts)
			await f.service.replayPendingPrompts("p1", "n1", "0xa")
			expect(prompts).toHaveBeenCalledTimes(1)
		},
	)

	test("a successor Allow admitted by a handoff is not overwritten by the displaced receipt", async () => {
		const f = await bootService({
			network: makeNetworkStub([{ id: "n1", chainId: 1 }]),
			token: makeTokenStub([tokenA]),
			note: makeNoteStub({ [tokenA.contract]: [note({ uniqueNoteHash: validNoteHash(2), txHash: "0xtx2" })] }, { 100: 1_234 }),
			publicReader: steeredTip(100).reader,
		})
		await flushPromises()
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: tokenA.contract,
			state: "pending",
			updatedAt: 0,
		})
		const earlier = await seedNote({ uniqueNoteHash: validNoteHash(1), contract: tokenA.contract, hidden: true })
		const fresh = noteRecordId("p1", "n1", validNoteHash(2))
		const trustRead = holdCall(internals(f.service).repo, "getTrust", 1, "after")
		vi.useFakeTimers()
		try {
			const displaced = scan(f.service)
			await untilReached(trustRead.held)
			await advance(WATCHDOG_MS)
			expect(await f.service.setTrustAllow("p1", "n1", tokenA.contract)).toBe(true)
			trustRead.release()
			await advance(0)
			await displaced
		} finally {
			vi.useRealTimers()
		}

		expect((await repo.getTrust("p1", "n1", tokenA.contract))?.state).toBe("trusted")
		expect((await repo.getRecord(earlier.id))?.hidden).toBe(false)
		expect(await repo.hasRecord(fresh)).toBe(false)
		await scan(f.service)
		expect((await repo.getRecord(fresh))?.hidden).toBe(false)
	})

	test("a handoff in a public commit holds its page, and the next tick lands the receipt", async () => {
		const { reader, state } = makePublicReader()
		const f = await bootPublic(reader, state)
		await trustedRow()
		state.responses.push(pubPage([pubEvent({ txHash: PUB_TX })]))
		const trustRead = holdCall(internals(f.service).repo, "getTrust", 1, "after")
		let first: ScanOutcome | undefined
		vi.useFakeTimers()
		try {
			const tick = scanPublic(f.service)
			await untilReached(trustRead.held)
			await advance(WATCHDOG_MS)
			trustRead.release()
			await advance(0)
			first = await tick
		} finally {
			vi.useRealTimers()
		}
		expect(first).toBe("no-progress")
		expect(await repo.hasRecord(PUB_ID)).toBe(false)
		expect(await cursorFor()).toMatchObject({ cursor: null, pendingPage: expect.anything() })

		// The resume path's ancestry probe reads one page before the forward scan re-reads this one.
		state.responses.push(pubPage([]), pubPage([pubEvent({ txHash: PUB_TX })]))
		expect(await scanPublic(f.service)).toBe("progress")
		expect((await repo.getRecord(PUB_ID))?.hidden).toBe(false)
		expect((await cursorFor())?.pendingPage).toBeUndefined()
		expect((await cursorFor())?.cursor).toMatchObject({ blockNumber: 5 })
	})

	test("a handoff in a reconcile rewrite keeps the marker, so the moved receipt is rewritten, not deleted", async () => {
		const { reader, state } = makePublicReader()
		const f = await bootPublic(reader, state)
		await trustedRow()
		const moved = await seedPublic({ txHash: "0xmoved", l2BlockNumber: 7, blockHash: "0xold7" })
		const marker = { lowerBound: 6, upperBound: 8, upperBoundHash: "0xcheckpoint", progress: null, seen: [] }
		await seedCursor({
			cursor: { blockNumber: 8, txIndexWithinBlock: 0, logIndexWithinTx: 0 },
			lastScanFinalized: 5,
			reconciling: marker,
		})
		const remined = () => pubPage([pubEvent({ txHash: "0xmoved", l2BlockNumber: 7, blockHash: "0xnew7" })])
		state.responses.push(remined())
		const recordRead = holdCall(internals(f.service).repo, "getRecord", 1, "after")
		vi.useFakeTimers()
		try {
			const tick = scanPublic(f.service)
			await untilReached(recordRead.held)
			await advance(WATCHDOG_MS)
			recordRead.release()
			await advance(0)
			expect(await tick).toBe("no-progress")
		} finally {
			vi.useRealTimers()
		}
		expect((await cursorFor())?.reconciling).toEqual(marker)
		expect(await repo.getRecord(moved.id)).toMatchObject({ blockHash: "0xold7" })

		state.responses.push(remined())
		expect(await scanPublic(f.service)).toBe("progress")
		expect((await cursorFor())?.reconciling).toBeUndefined()
		expect(await repo.getRecord(moved.id)).toMatchObject({ blockHash: "0xnew7", l2BlockNumber: 7 })
	})

	test("an undisturbed page of an existing record, an own send and a new receipt advances the cursor", async () => {
		const { reader, state } = makePublicReader()
		const f = await bootPublic(reader, state, { transaction: ownTx("0xmine") })
		await trustedRow()
		await seedPublic({ txHash: "0xknown", blockHash: "0xbh5" })
		const events = [
			pubEvent({ txHash: "0xknown", txIndexWithinBlock: 0 }),
			pubEvent({ txHash: "0xmine", txIndexWithinBlock: 1 }),
			pubEvent({ txHash: "0xnew", txIndexWithinBlock: 2 }),
		]
		state.responses.push(pubPage(events))

		expect(await scanPublic(f.service)).toBe("progress")
		expect(await repo.hasRecord("pub:p1|n1|0xnew|0")).toBe(true)
		expect(await repo.hasRecord("pub:p1|n1|0xmine|0")).toBe(false)
		expect((await cursorFor())?.pendingPage).toBeUndefined()
		expect((await cursorFor())?.cursor).toEqual({ blockNumber: 5, txIndexWithinBlock: 2, logIndexWithinTx: 0 })
	})

	test.each([
		["with a displaced deleter still running, a receipt stands down and lands on the next tick", true],
		["with no deleter running, a receipt lands at once", false],
	])("%s", async (_name, displaced) => {
		const f = await bootNoteReceipt("trusted")
		vi.useFakeTimers()
		try {
			const deleter = displaced ? await displacedDeleter(f, "0xunrelated") : undefined
			await scan(f.service)
			expect(await repo.hasRecord(NOTE_ID)).toBe(!displaced)
			await deleter?.finish()
		} finally {
			vi.useRealTimers()
		}
		await scan(f.service)
		expect((await repo.getRecord(NOTE_ID))?.hidden).toBe(false)
	})

	test("a receipt section entered beside a displaced deleter reads nothing, and its row stays gone", async () => {
		const f = await bootNoteReceipt("existing")
		vi.useFakeTimers()
		try {
			const deleter = await displacedDeleter(f, ((await repo.getRecord(NOTE_ID)) as IncomingNoteRecord).txHash)
			const inst = instrumentReceipt(f)
			const receipt = scan(f.service)
			await advance(0)
			await receipt
			expect(inst.log).toEqual(["notes", "getRecord", "timestamp"])
			await deleter.finish()
		} finally {
			vi.useRealTimers()
		}
		expect(await repo.hasRecord(NOTE_ID)).toBe(false)
	})
})

// ── Block-gated ticks ─────────────────────────────────────────────────────────

/** The production tick, which these schedulers run on by the constructor's default. */
const TICK_MS = 30_000
const PUBLIC_KEY = `p1|n1|${tokenA.contract}`

/** Boots production-cadence schedulers on fake timers for two accounts and one token, after the
 *  install run has marked every target; the reader's counters and the notes reads start at zero. */
async function bootTicking(
	stubs: Parameters<typeof bootService>[0] = {},
	opts: { tips?: Partial<PublicScanTips>; chain?: PublicTransferEvent[] } = {},
) {
	const { reader, state } = makePublicReader({ tips: { proposedBlockHash: "0xproposed1", ...opts.tips } })
	state.chain = opts.chain
	const note = stubs.note ?? makeNoteStub()
	const accounts = [
		{ profileId: "p1", chainId: 1, address: "0xa" },
		{ profileId: "p1", chainId: 1, address: "0xb" },
	]
	const booted = await bootService(
		{ account: makeAccountStub(accounts), token: makeTokenStub([tokenA]), ...stubs, note, publicReader: reader },
		{ pollIntervalMs: undefined },
	)
	await advance(0)
	state.reset()
	note.getNotesRaw.mockClear()
	return { ...booted, reader, state, note }
}

const tick = () => advance(TICK_MS)
const episodesOf = (service: unknown) => (service as { episodes: { has: (key: string) => boolean } }).episodes

describe("IncomingTransferService — block-gated ticks", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	test("a default-built service ticks at the production 30 s, not before", async () => {
		const { state } = await bootTicking()

		await advance(29_999)
		expect(state.tipsCalls).toBe(0)
		await advance(1)
		expect(state.tipsCalls).toBe(1)
	})

	test("one tips read serves every target of a tick, and a tick with no new block scans nothing", async () => {
		const { state, note } = await bootTicking()

		await tick()

		expect(state.tipsCalls).toBe(1)
		expect(note.getNotesRaw).not.toHaveBeenCalled()
		expect(state.fetchArgs).toEqual([])
	})

	test("a new proposed block runs the note targets alone; a new checkpoint runs the public target alone", async () => {
		const { state, note } = await bootTicking()

		state.tips = { ...state.tips, proposedBlockHash: "0xproposed2" }
		await tick()
		expect(note.getNotesRaw).toHaveBeenCalledTimes(2)
		expect(state.fetchArgs).toEqual([])

		note.getNotesRaw.mockClear()
		state.tips = { ...state.tips, checkpointedBlockNumber: 101, checkpointedBlockHash: "0xcheckpoint2" }
		await tick()
		expect(note.getNotesRaw).not.toHaveBeenCalled()
		expect(state.fetchArgs).toHaveLength(1)
	})

	test("with the tips read failing, the note targets scan ungated and the public tick fails", async () => {
		const { service, reader, state, note } = await bootTicking()
		reader.getScanTips = async () => {
			throw new Error("node down")
		}

		await tick()

		expect(note.getNotesRaw).toHaveBeenCalledTimes(2)
		expect(state.fetchArgs).toEqual([])
		expect(episodesOf(service).has(PUBLIC_KEY)).toBe(true)
	})

	test.each<[string, (f: Awaited<ReturnType<typeof bootTicking>>) => void, (f: Awaited<ReturnType<typeof bootTicking>>) => number]>([
		[
			"a dropped public page",
			(f) => {
				f.state.tips = { ...f.state.tips, checkpointedBlockNumber: 101, checkpointedBlockHash: "0xcheckpoint2" }
				f.state.responses.push(pubDroppedPage())
			},
			(f) => f.state.fetchArgs.length,
		],
		[
			"a note commit that stood down beside a displaced deleter",
			(f) => {
				f.note.getNotesRaw.mockResolvedValue([note()])
				f.state.tips = { ...f.state.tips, proposedBlockHash: "0xproposed2" }
				;(f.service as unknown as { deletersRunning: number }).deletersRunning = 1
			},
			(f) => f.note.getNotesRaw.mock.calls.length,
		],
	])("a run that did not reach the tips runs again on the next tick with no new block: %s", async (_case, arrange, runs) => {
		const f = await bootTicking()
		arrange(f)
		await tick()
		const first = runs(f)
		expect(first).toBeGreaterThan(0)
		;(f.service as unknown as { deletersRunning: number }).deletersRunning = 0

		await tick()

		expect(runs(f)).toBeGreaterThan(first)
	})

	test("a public target with history left to back-fill runs on every tick until it is read, then waits for a block", async () => {
		// Eleven empty windows below the floor at four a tick: the install run and two ticks read them.
		const { state } = await bootTicking({}, { tips: { finalizedBlockNumber: 1000, checkpointedBlockNumber: 1010 }, chain: [] })

		const reads: number[] = []
		for (let i = 0; i < 3; i++) {
			state.fetchArgs.length = 0
			await tick()
			reads.push(state.fetchArgs.length)
		}

		expect(reads).toEqual([5, 4, 0])
	})

	test("a note target whose tips read outlives its account's deletion writes nothing for that account", async () => {
		const f = await bootTicking()
		f.note.getNotesRaw.mockImplementation(async (_n: string, account: string) => (account === "0xb" ? [note()] : []))
		const held = holdCall(f.reader, "getScanTips", 1, "before")
		f.state.tips = { ...f.state.tips, proposedBlockHash: "0xproposed2" }
		const ticking = tick()
		await untilReached(held.held)

		f.account.getAccounts.mockResolvedValue([{ profileId: "p1", chainId: 1, address: "0xa" }])
		await f.account.onAccountDeleted.invoke({ profileId: "p1", chainId: 1, address: "0xb" })
		await advance(0)
		held.release()
		await ticking
		await advance(0)

		expect((await repo.listRecords()).filter((r) => r.accountAddress === "0xb")).toEqual([])
	})

	test("a public target whose tips read outlives its token's deletion leaves no cursor behind", async () => {
		const f = await bootTicking()
		f.state.responses.push(pubPage([pubEvent({ txHash: "0xlate" })]))
		const held = holdCall(f.reader, "getScanTips", 1, "before")
		f.state.tips = { ...f.state.tips, checkpointedBlockNumber: 101, checkpointedBlockHash: "0xcheckpoint2" }
		const ticking = tick()
		await untilReached(held.held)

		f.token.getTokensRaw.mockResolvedValue([])
		await f.token.onTokenDeleted.invoke({ ...tokenA, profileId: "p1" } as never)
		await advance(0)
		held.release()
		await ticking
		await advance(0)

		expect(await cursorFor()).toBeUndefined()
	})

	test("a non-standard token counts as caught up: it is not scanned again until the checkpoint moves", async () => {
		const { state } = await bootTicking()
		state.classStatus = "non-standard"
		state.tips = { ...state.tips, checkpointedBlockNumber: 101, checkpointedBlockHash: "0xcheckpoint2" }
		await tick()
		expect(state.classCalls).toBe(1)

		await tick()
		expect(state.classCalls).toBe(1)

		state.tips = { ...state.tips, checkpointedBlockNumber: 102, checkpointedBlockHash: "0xcheckpoint3" }
		await tick()
		expect(state.classCalls).toBe(2)
	})
})

// ── Liveness on the real cadence ──────────────────────────────────────────────

/** Ticks until `landed` holds, at most twelve ticks, and returns the fake time since `since`. Every
 *  fourth tick runs every target, so a run the block rule missed would land on one 120 s or more
 *  after an event that came just after the previous one. */
async function landedAfter(landed: () => Promise<boolean>, since: number): Promise<number> {
	for (let i = 0; i < 12 && !(await landed()); i++) await tick()
	expect(await landed()).toBe(true)
	return Date.now() - since
}

/** Runs the install run's three plain ticks and the fourth, which runs every target. */
const pastFallback = async () => {
	for (let i = 0; i < 4; i++) await tick()
}

describe("IncomingTransferService — liveness on the real cadence", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	test("gap: after a tip jump the note lands on the first tick and the public receipt over budget-limited ticks", async () => {
		const f = await bootTicking({}, { chain: [] })
		await pastFallback()
		// 250 logs ahead of ours: three five-page passes, the tip still between them.
		const ahead = Array.from({ length: 250 }, (_, i) =>
			pubReceipt(101 + Math.floor(i / 2), { txIndexWithinBlock: i % 2, to: "0xother" }),
		)
		const ours = pubReceipt(399)
		f.state.chain = [...ahead, ours]
		f.state.tips = {
			checkpointedBlockNumber: 400,
			checkpointedBlockHash: "0xcp400",
			finalizedBlockNumber: 300,
			proposedBlockHash: "0xpp400",
		}
		f.note.getNotesRaw.mockImplementation(async (_n: string, account: string) => (account === "0xa" ? [note()] : []))
		const event = Date.now()

		await tick()
		expect(await repo.hasRecord(NOTE_ID)).toBe(true)
		expect(await repo.hasRecord(pubRecordKey(ours))).toBe(false)

		expect(await landedAfter(() => repo.hasRecord(pubRecordKey(ours)), event)).toBeLessThan(120_000)
	})

	test("reorg: a same-height hash change runs the target, reconciliation finishes, the re-mined receipt lands and the scan resumes", async () => {
		// 150 logs below ours, so the reconciliation takes two steps.
		const below = Array.from({ length: 150 }, (_, i) =>
			pubReceipt(51 + Math.floor(i / 3), { txIndexWithinBlock: i % 3, to: "0xother" }),
		)
		const f = await bootTicking({}, { chain: below })
		await trustedRow()
		await tick()
		f.state.chain = [...below, pubReceipt(101, { blockHash: "0xbh101a" })]
		f.state.tips = { ...f.state.tips, checkpointedBlockNumber: 101, checkpointedBlockHash: "0xcp101a", proposedBlockHash: "0xpp101a" }
		await tick()
		await tick()
		await tick()
		const remined = pubReceipt(101, { blockHash: "0xbh101b" })
		expect(await storedBlockHash(remined)).toBe("0xbh101a")

		f.state.chain = [...below, remined]
		f.state.tips = { ...f.state.tips, checkpointedBlockHash: "0xcp101b", proposedBlockHash: "0xpp101b" }
		f.state.responses.push(new Error("not an ancestor"))
		const event = Date.now()

		const updated: IncomingTransferRecord[] = []
		f.service.onIncomingTransferUpdated.add((r) => updated.push(r))
		expect(await landedAfter(async () => (await storedBlockHash(remined)) === "0xbh101b", event)).toBeLessThan(120_000)
		expect(updated.map((r) => r.kind === "public-event" && r.blockHash)).toEqual(["0xbh101b"])
		expect((await cursorFor())?.reconciling).toBeUndefined()
		f.state.fetchArgs.length = 0
		await tick()
		expect(f.state.fetchArgs.find((a) => a.verifyAncestorHash === undefined)).toMatchObject({
			referenceBlock: "0xcp101b",
			afterCursor: positionOf(remined),
		})
	})

	test("retry: after a failed scan the note lands on the next tick, the public receipt once its backoff ends", async () => {
		const f = await bootTicking({}, { chain: [] })
		for (let i = 0; i < 3; i++) await tick()
		// The checkpoint catches up with the proposed block, whose hash the note targets already
		// reached, and the PXE delivers a note late: only a failed run that forgets its mark is rerun.
		const ours = pubReceipt(101)
		f.state.chain = [ours]
		f.state.tips = { ...f.state.tips, checkpointedBlockNumber: 101, checkpointedBlockHash: "0xcp101" }
		let noteFailures = 1
		f.note.getNotesRaw.mockImplementation(async (_n: string, account: string) => {
			if (account !== "0xa") return []
			if (noteFailures-- > 0) throw new Error("PXE unavailable")
			return [note()]
		})
		const classStatus = f.reader.getTokenClassStatus
		let classFailures = 1
		f.reader.getTokenClassStatus = async (...args) => {
			if (classFailures-- > 0) {
				// A failing read takes time, so its backoff runs past the next tick, as on a live node.
				await new Promise((resolve) => setTimeout(resolve, 1_000))
				throw new Error("node unavailable")
			}
			return classStatus(...args)
		}
		const event = Date.now()

		await tick()
		expect((await repo.hasRecord(NOTE_ID)) || (await repo.hasRecord(pubRecordKey(ours)))).toBe(false)
		await tick()
		expect(await repo.hasRecord(NOTE_ID)).toBe(true)

		expect(await landedAfter(() => repo.hasRecord(pubRecordKey(ours)), event)).toBeLessThan(120_000)
	})

	test("quiet chain: ticks with no new block drain the outbox, and the fourth lands a note the PXE delivered late", async () => {
		const tokenBalance = makeTokenBalanceStub()
		const task = makeTaskStub()
		const f = await bootTicking({ tokenBalance, task })
		await repo.setOutbox("p1", "n1", "0xa", 1, { dirtyAt: 100 })
		tokenBalance.setResult({ taskId: "T1" })
		await tick()
		expect((await outboxFor())?.pendingTaskId).toBe("T1")
		task.setTask("T1", TaskStatus.Completed, Date.now())
		await tick()
		expect(await outboxFor()).toBeUndefined()

		f.note.getNotesRaw.mockImplementation(async (_n: string, account: string) => (account === "0xa" ? [note()] : []))
		const delivered = Date.now()
		await tick()
		expect(await repo.hasRecord(NOTE_ID)).toBe(false)

		expect(await landedAfter(() => repo.hasRecord(NOTE_ID), delivered)).toBeLessThan(120_000)
	})
})

// ── Prompt payloads (wire-shaped) ─────────────────────────────────────────────

const WIRE_ACCOUNT = `0x${"a1".repeat(32)}`
const WIRE_CONTRACT = `0x${"c3".repeat(32)}`
const WIRE_AMOUNT = "340282366920938463463374607431768211455"
const wireToken = { id: 7, chainId: 1, contract: WIRE_CONTRACT, symbol: "WIRE", decimals: 18 }
const WIRE_PROMPT = {
	profileId: "p1",
	networkId: "n1",
	accountAddress: WIRE_ACCOUNT,
	contract: WIRE_CONTRACT,
	tokenId: 7,
	tokenSymbol: "WIRE",
	tokenDecimals: 18,
	amountRaw: WIRE_AMOUNT,
}
const PROMPT_KEYS = ["profileId", "networkId", "accountAddress", "contract", "tokenId", "tokenSymbol", "tokenDecimals", "amountRaw"]

describe("IncomingTransferService — prompt payloads", () => {
	async function bootWire() {
		const f = await bootService({
			network: makeNetworkStub([{ id: "n1", chainId: 1 }]),
			token: makeTokenStub([wireToken]),
			note: makeNoteStub({ [WIRE_CONTRACT]: [note({ contract: WIRE_CONTRACT, content: { value: WIRE_AMOUNT } })] }, { 100: 1 }),
			publicReader: makePublicReader().reader,
		})
		await flushPromises()
		const prompts: unknown[] = []
		f.service.onIncomingTransferPending.add((payload) => prompts.push(payload))
		return { ...f, prompts }
	}

	function expectWirePrompt(prompts: unknown[]) {
		expect(prompts).toEqual([WIRE_PROMPT])
		expect(Object.keys(prompts[0] as object)).toEqual(PROMPT_KEYS)
	}

	test("the note arm's first-receive prompt", async () => {
		const f = await bootWire()
		const svc = f.service as unknown as {
			serviceEpoch: number
			scanContract: (p: string, n: string, a: string, c: string, e: number) => Promise<boolean>
		}
		await svc.scanContract("p1", "n1", WIRE_ACCOUNT, WIRE_CONTRACT, svc.serviceEpoch)
		expectWirePrompt(f.prompts)
	})

	test("the public arm's first-receive prompt", async () => {
		const f = await bootWire()
		const svc = f.service as unknown as { serviceEpoch: number; commitPublicEvent: PublicCommit }
		const ev = pubEvent({ to: WIRE_ACCOUNT, amountRaw: WIRE_AMOUNT, txHash: `0x${"7".repeat(64)}` })
		await svc.commitPublicEvent("p1", "n1", WIRE_CONTRACT, 1, WIRE_ACCOUNT, ev, svc.serviceEpoch)
		expectWirePrompt(f.prompts)
	})

	test("the replayed prompt", async () => {
		const f = await bootWire()
		await seedTrustRow({
			profileId: "p1",
			networkId: "n1",
			contract: WIRE_CONTRACT,
			state: "pending",
			updatedAt: 0,
		})
		await seedNote({ accountAddress: WIRE_ACCOUNT, contract: WIRE_CONTRACT, tokenId: 7, amountRaw: WIRE_AMOUNT })
		await f.service.replayPendingPrompts("p1", "n1", WIRE_ACCOUNT)
		expectWirePrompt(f.prompts)
	})
})

// ── Scope clears: order, the episode prefix and the throw path ─────────────────

type ClearInternals = {
	serviceEpoch: number
	feeCache: Map<string, string>
	episodes: { setAnnounced: (prefix: string, stalled: boolean) => boolean }
	repo: CollaboratorMap
}

/** Logs `<event>:<epoch delta>` for the clear's ordered steps. */
async function bootClear(method: "clearProfile" | "clearChain", wipeFails = false) {
	const f = await bootService({ network: makeNetworkStub([{ id: "n1", chainId: 1 }]) })
	await flushPromises()
	const svc = f.service as unknown as ClearInternals
	const start = svc.serviceEpoch
	const log: string[] = []
	const at = (event: string) => log.push(`${event}:${svc.serviceEpoch - start}`)
	svc.episodes.setAnnounced("p1|n1|", true)
	svc.feeCache.set("n1|0xtx|0xbh", "1")
	const realClear = svc.feeCache.clear.bind(svc.feeCache)
	const realDelete = svc.feeCache.delete.bind(svc.feeCache)
	svc.feeCache.clear = () => {
		at("evict")
		realClear()
	}
	svc.feeCache.delete = (key: string) => {
		at("evict")
		return realDelete(key)
	}
	f.service.onIncomingSyncHealthChanged.add(() => at("health"))
	const realWipe = svc.repo[method].bind(svc.repo)
	svc.repo[method] = async (...args: unknown[]) => {
		at("wipe")
		// A fee read that wrote after the first eviction: the final eviction must sweep it.
		svc.feeCache.set("n1|late|0xbh", "2")
		if (wipeFails) throw new Error("wipe failed")
		return realWipe(...args)
	}
	const realActive = f.profile.getActiveProfile.getMockImplementation() as () => Promise<unknown>
	f.profile.getActiveProfile.mockImplementation(() => {
		at("active")
		return realActive()
	})
	const prefixSpy = vi.mocked(scanEpisodeNetworkPrefix)
	prefixSpy.mockClear()
	return { f, svc, log, start, prefixCalls: prefixSpy, at }
}

describe("IncomingTransferService — scope clears", () => {
	test("clearProfile: bump, drop episodes, evict, wipe, hydrate, evict again", async () => {
		const { f, log } = await bootClear("clearProfile")
		await f.service.clearProfile("p1")
		expect(log).toEqual(["health:1", "evict:1", "wipe:1", "active:2", "evict:2"])
	})

	test("clearChain: the episode prefix is built after the bump", async () => {
		const { f, log, prefixCalls, at } = await bootClear("clearChain")
		const original = prefixCalls.getMockImplementation() as typeof scanEpisodeNetworkPrefix
		prefixCalls.mockImplementation((profileId: string, networkId: string) => {
			at("prefix")
			return original(profileId, networkId)
		})
		try {
			await f.service.clearChain("p1", "n1")
		} finally {
			prefixCalls.mockImplementation(original)
		}
		expect(log).toEqual(["prefix:1", "prefix:1", "health:1", "evict:1", "wipe:1", "active:2", "evict:2"])
	})

	test.each<["clearProfile" | "clearChain"]>([["clearProfile"], ["clearChain"]])(
		"%s: a failed wipe rejects after the final eviction, without a rebuild",
		async (method) => {
			const { f, svc, log, start } = await bootClear(method, true)
			const call = method === "clearProfile" ? f.service.clearProfile("p1") : f.service.clearChain("p1", "n1")
			await expect(call).rejects.toThrow("wipe failed")
			expect(log.filter((e) => !e.startsWith("health"))).toEqual(["evict:1", "wipe:1", "evict:1"])
			expect(svc.serviceEpoch - start).toBe(1)

			// The failed wipe no longer counts as a running deleter: a receipt after it lands.
			f.token.getTokensRaw.mockResolvedValue([tokenA])
			await trustedRow()
			expect(await commitPublic(f.service)).toBe("processed")
			expect(await repo.hasRecord(PUB_ID)).toBe(true)
		},
	)

	test.each<["clearProfile" | "clearChain"]>([["clearProfile"], ["clearChain"]])(
		"%s: success advances the epoch by two",
		async (method) => {
			const { f, svc, start } = await bootClear(method)
			await (method === "clearProfile" ? f.service.clearProfile("p1") : f.service.clearChain("p1", "n1"))
			expect(svc.serviceEpoch - start).toBe(2)
		},
	)
})

// ── Note-scheduler teardown ─────────────────────────────────────────────────

type TeardownInternals = {
	schedulers: Map<string, ReturnType<typeof setInterval>>
	watchedContracts: Map<string, Set<string>>
	purgeDeletedAccountOnNetworkLocked: (
		account: { profileId: string; chainId: number; address: string },
		networkId: string,
		active: string | undefined,
	) => Promise<void>
	detachTokenSchedulersLocked: (profileId: string, network: { id: string; chainId: number }, contract: string) => Promise<void>
}

describe("IncomingTransferService — note-scheduler teardown", () => {
	async function bootTeardown() {
		const f = await bootService({
			network: makeNetworkStub([{ id: "n1", chainId: 1 }]),
			account: makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }]),
			token: makeTokenStub([tokenA, tokenB]),
		})
		await flushPromises()
		const svc = f.service as unknown as TeardownInternals
		const interval = svc.schedulers.get("n1|0xa")
		expect(interval).toBeDefined()
		clearSpy = vi.spyOn(globalThis, "clearInterval")
		return { svc, interval, clear: clearSpy }
	}

	let clearSpy: ReturnType<typeof vi.spyOn> | undefined
	afterEach(() => {
		clearSpy?.mockRestore()
		clearSpy = undefined
	})

	test("an active-profile account delete stops its interval and drops both entries", async () => {
		const { svc, interval, clear } = await bootTeardown()
		await svc.purgeDeletedAccountOnNetworkLocked({ profileId: "p1", chainId: 1, address: "0xa" }, "n1", "p1")
		expect(clear).toHaveBeenCalledWith(interval)
		expect(svc.schedulers.has("n1|0xa")).toBe(false)
		expect(svc.watchedContracts.has("n1|0xa")).toBe(false)
	})

	test("an inactive profile's account delete leaves the scheduler", async () => {
		const { svc, clear } = await bootTeardown()
		await svc.purgeDeletedAccountOnNetworkLocked({ profileId: "p2", chainId: 1, address: "0xa" }, "n1", "p1")
		expect(clear).not.toHaveBeenCalled()
		expect(svc.schedulers.has("n1|0xa")).toBe(true)
		expect(svc.watchedContracts.get("n1|0xa")).toEqual(new Set([tokenA.contract, tokenB.contract]))
	})

	test("detaching one of two contracts keeps the scheduler; detaching the last stops it", async () => {
		const { svc, interval, clear } = await bootTeardown()
		await svc.detachTokenSchedulersLocked("p1", { id: "n1", chainId: 1 }, tokenA.contract)
		expect(clear).not.toHaveBeenCalled()
		expect(svc.watchedContracts.get("n1|0xa")).toEqual(new Set([tokenB.contract]))
		await svc.detachTokenSchedulersLocked("p1", { id: "n1", chainId: 1 }, tokenB.contract)
		expect(clear).toHaveBeenCalledWith(interval)
		expect(svc.schedulers.has("n1|0xa")).toBe(false)
		expect(svc.watchedContracts.has("n1|0xa")).toBe(false)
	})
})

// ── Note rows reconciled against the PXE ─────────────────────────────────────

const SYNCED_TIP = `0x${"11".repeat(32)}`
const LATER_TIP = `0x${"22".repeat(32)}`
const reconcileTips = (overrides: Partial<PublicScanTips> = {}): PublicScanTips => ({
	checkpointedBlockNumber: 120,
	checkpointedBlockHash: "0xcheckpoint",
	finalizedBlockNumber: 110,
	proposedBlockHash: SYNCED_TIP,
	...overrides,
})

type ReconcileInternals = {
	serviceEpoch: number
	deletersRunning: number
	scanContract: (p: string, n: string, a: string, c: string, epoch: number, tips?: PublicScanTips) => Promise<boolean>
}

/** A trusted token, a PXE whose unspent and spent notes and synced block each test sets, and the
 *  service's Updated and Deleted emits. */
async function bootReconcile() {
	const noteStub = makeNoteStub({}, { 40: 400, 100: 1_000, 101: 1_010, 115: 1_150, 116: 1_160 })
	const f = await bootService({
		network: makeNetworkStub([{ id: "n1", chainId: 1 }]),
		token: makeTokenStub([tokenA, tokenB]),
		note: noteStub,
	})
	await trustedRow()
	const pxe = {
		active: [] as ReturnType<typeof note>[],
		spent: [] as ReturnType<typeof note>[],
		synced: { number: 120, hash: SYNCED_TIP } as SyncedBlock,
	}
	noteStub.getNotesRaw.mockImplementation(async (_n: string, _a: string, contract: string, status?: string) =>
		[...pxe.active, ...(status === "active-or-nullified" ? pxe.spent : [])].filter((n) => n.contract === contract),
	)
	noteStub.getSyncedBlock.mockImplementation(async () => pxe.synced)
	const updated: IncomingTransferRecord[] = []
	const deleted: IncomingTransferRecord[] = []
	f.service.onIncomingTransferUpdated.add((r) => updated.push(r))
	f.service.onIncomingTransferDeleted.add((r) => deleted.push(r))
	const svc = f.service as unknown as ReconcileInternals
	const run = (tips: PublicScanTips | null = reconcileTips(), contract = tokenA.contract) =>
		svc.scanContract("p1", "n1", "0xa", contract, svc.serviceEpoch, tips ?? undefined)
	return { ...f, svc, pxe, updated, deleted, run }
}

/** A stored note row of tokenA for `0xa` at `block`, its PXE note at the same position. */
async function reconcileRow(n: number, block = 100, overrides: NoteSeed = {}) {
	const row = await seedNote({
		uniqueNoteHash: validNoteHash(n),
		contract: tokenA.contract,
		tokenId: tokenA.id,
		txHash: `0xtx${n}`,
		l2BlockNumber: block,
		blockTimestamp: 1_000,
		...overrides,
	})
	const pxeNote = note({ uniqueNoteHash: validNoteHash(n), l2BlockNumber: block, txHash: `0xtx${n}`, contract: row.contract })
	return { row, pxeNote }
}

describe("IncomingTransferService — note rows reconciled against the PXE", () => {
	test("a row missing from two verified scans past its block survives the first and is deleted on the second", async () => {
		const f = await bootReconcile()
		const { row } = await reconcileRow(1)

		expect(await f.run()).toBe(false)
		expect(await repo.hasRecord(row.id)).toBe(true)
		expect(await outboxFor()).toBeUndefined()
		expect(f.deleted).toEqual([])

		expect(await f.run()).toBe(true)
		expect(await repo.hasRecord(row.id)).toBe(false)
		expect(await outboxFor()).toBeDefined()
		expect(f.deleted.map((r) => r.id)).toEqual([row.id])
	})

	test.each<[string, (status?: string) => boolean]>([
		["every notes read", () => true],
		["the spent-or-unspent read", (status) => status === "active-or-nullified"],
	])("%s rejecting on two verified scans keeps the row", async (_name, rejects) => {
		const f = await bootReconcile()
		const { row } = await reconcileRow(1)
		f.note.getNotesRaw.mockImplementation(async (_n: string, _a: string, _c: string, status?: string) => {
			if (rejects(status)) throw new Error("identity unavailable")
			return []
		})
		expect(await f.run()).toBe(false)
		expect(await f.run()).toBe(false)
		expect(await repo.getRecord(row.id)).toEqual(row)
		expect(f.deleted).toEqual([])
	})

	test("a row missing once and then found keeps no strike: the next absence strikes it again", async () => {
		const f = await bootReconcile()
		const { row, pxeNote } = await reconcileRow(1, 115)
		expect(await f.run()).toBe(false)
		f.pxe.active = [pxeNote]
		expect(await f.run()).toBe(true)
		f.pxe.active = []
		expect(await f.run()).toBe(false)
		expect(await repo.hasRecord(row.id)).toBe(true)
		expect(f.deleted).toEqual([])
	})

	test("a spent note's row on a finalized block settles and is never deleted", async () => {
		const f = await bootReconcile()
		const { row, pxeNote } = await reconcileRow(1)
		f.pxe.spent = [pxeNote]
		expect(await f.run()).toBe(true)
		expect(await repo.getRecord(row.id)).toMatchObject({ settled: true, blockTimestamp: 1_000 })

		f.pxe.spent = []
		f.note.getSyncedBlock.mockClear()
		for (let i = 0; i < 3; i++) expect(await f.run()).toBe(true)
		expect(await repo.hasRecord(row.id)).toBe(true)
		expect(f.note.getSyncedBlock).not.toHaveBeenCalled()
	})

	test("a stale anchor settles, strikes and deletes nothing and is not reached; at the tip it decides both", async () => {
		const f = await bootReconcile()
		const missing = await reconcileRow(1)
		const final = await reconcileRow(2, 100, { txIndexInBlock: 1 })
		f.pxe.active = [{ ...final.pxeNote, txIndexInBlock: 1 }]
		f.pxe.synced = { number: 120, hash: LATER_TIP }
		for (let i = 0; i < 3; i++) expect(await f.run()).toBe(false)
		expect(await repo.getRecord(missing.row.id)).toEqual(missing.row)
		expect(await repo.getRecord(final.row.id)).toEqual(final.row)
		expect(f.deleted).toEqual([])

		f.pxe.synced = { number: 120, hash: SYNCED_TIP }
		expect(await f.run()).toBe(false)
		expect(await repo.getRecord(final.row.id)).toMatchObject({ settled: true })
		expect(await f.run()).toBe(true)
		expect(await repo.hasRecord(missing.row.id)).toBe(false)
	})

	test("a block landing mid-scan leaves a later contract unverified; the next quiet tick decides it", async () => {
		const f = await bootReconcile()
		const { row } = await reconcileRow(2, 100, { contract: tokenB.contract, tokenId: tokenB.id })
		await reconcileRow(1, 115)
		const tips = reconcileTips()
		let syncedReads = 0
		f.note.getSyncedBlock.mockImplementation(async () => ({ number: 121, hash: ++syncedReads <= 2 ? SYNCED_TIP : LATER_TIP }))
		expect(await f.run(tips, tokenA.contract)).toBe(false)
		expect(await f.run(tips, tokenB.contract)).toBe(false)
		expect(syncedReads).toBe(4)

		const quiet = reconcileTips({ proposedBlockHash: LATER_TIP })
		expect(await f.run(quiet, tokenB.contract)).toBe(false)
		expect(await f.run(quiet, tokenB.contract)).toBe(true)
		expect(await repo.hasRecord(row.id)).toBe(false)
	})

	test("a row missing above the synced block waits for a new block and the scan is reached", async () => {
		const f = await bootReconcile()
		const { row } = await reconcileRow(1, 121)
		expect(await f.run()).toBe(true)
		expect(await f.run()).toBe(true)
		expect(await repo.getRecord(row.id)).toEqual(row)
	})

	test.each<[string, (pxeNote: ReturnType<typeof note>) => ReturnType<typeof note>, Partial<IncomingNoteRecord>]>([
		["a new transaction index", (n) => ({ ...n, txIndexInBlock: 3 }), { txIndexInBlock: 3, blockTimestamp: 1_000 }],
		["a new block", (n) => ({ ...n, l2BlockNumber: 101 }), { l2BlockNumber: 101, blockTimestamp: 1_010 }],
		["a new transaction hash", (n) => ({ ...n, txHash: "0xtx-replacement" }), { txHash: "0xtx-replacement", blockTimestamp: 1_000 }],
	])("a re-mine at %s rewrites the row in place with one Updated and no second arrival", async (_name, remine, expected) => {
		const f = await bootReconcile()
		const { row, pxeNote } = await reconcileRow(1, 100, { discoveredAt: 7 })
		await repo.setArrivalRow("p1", "n1", "0xa", { sinceBlock: 50, played: [[row.id, 100]] })
		f.pxe.active = [remine(pxeNote)]
		expect(await f.run()).toBe(true)
		expect(await repo.getRecord(row.id)).toMatchObject({ ...expected, id: row.id, hidden: false, discoveredAt: 7 })
		expect(f.updated.map((r) => r.id)).toEqual([row.id])
		expect(await f.service.claimArrivals("p1", "n1", "0xa", [row.id])).toEqual([])
		expect((await repo.listRecords()).length).toBe(1)
	})

	test("a same-position re-mine with a new time is rewritten when the row settles, with one Updated", async () => {
		const f = await bootReconcile()
		const { row, pxeNote } = await reconcileRow(1)
		f.pxe.active = [pxeNote]
		f.note.getBlockTimestamp.mockResolvedValue(1_005)
		expect(await f.run()).toBe(true)
		expect(await repo.getRecord(row.id)).toMatchObject({ settled: true, blockTimestamp: 1_005 })
		expect(f.updated.map((r) => r.kind === "note" && r.blockTimestamp)).toEqual([1_005])
	})

	test("the steady state is one notes read; a hidden row's move emits no Updated", async () => {
		const f = await bootReconcile()
		const { pxeNote } = await reconcileRow(1, 115)
		const hidden = await reconcileRow(2, 116, { hidden: true })
		f.pxe.active = [pxeNote, { ...hidden.pxeNote, txIndexInBlock: 4 }]
		f.note.getNotesRaw.mockClear()
		expect(await f.run()).toBe(true)
		expect(f.note.getNotesRaw).toHaveBeenCalledTimes(1)
		expect(f.note.getSyncedBlock).not.toHaveBeenCalled()
		expect(await repo.getRecord(hidden.row.id)).toMatchObject({ txIndexInBlock: 4, hidden: true })
		expect(f.updated).toEqual([])
	})

	test("after a restart, a row whose unfinalized block was dropped meanwhile goes; a settled one at that height stays", async () => {
		const first = await bootReconcile()
		const settled = await reconcileRow(1)
		first.pxe.spent = [settled.pxeNote]
		expect(await first.run()).toBe(true)
		const dropped = await reconcileRow(2, 100, { txIndexInBlock: 1 })

		const f = await bootReconcile()
		f.pxe.synced = { number: 160, hash: SYNCED_TIP }
		const tips = reconcileTips({ finalizedBlockNumber: 150 })
		expect(await f.run(tips)).toBe(false)
		expect(await f.run(tips)).toBe(true)
		expect(await repo.hasRecord(dropped.row.id)).toBe(false)
		expect(await repo.getRecord(settled.row.id)).toMatchObject({ settled: true })
	})

	test("without tips nothing settles, strikes or deletes", async () => {
		const f = await bootReconcile()
		const missing = await reconcileRow(1)
		const final = await reconcileRow(2, 100, { txIndexInBlock: 1 })
		f.pxe.active = [{ ...final.pxeNote, txIndexInBlock: 1 }]
		for (let i = 0; i < 3; i++) expect(await f.run(null)).toBe(false)
		expect(await repo.getRecord(missing.row.id)).toEqual(missing.row)
		expect(await repo.getRecord(final.row.id)).toEqual(final.row)
		expect(f.note.getSyncedBlock).not.toHaveBeenCalled()
	})

	describe("a write that cannot be fenced stands down and the scan is not reached", () => {
		type Arrange = (f: Awaited<ReturnType<typeof bootReconcile>>) => Promise<{ id: string; before: IncomingTransferRecord }>
		const decisions: Array<[string, Arrange]> = [
			[
				"settle",
				async (f) => {
					const { row, pxeNote } = await reconcileRow(1)
					f.pxe.spent = [pxeNote]
					return { id: row.id, before: row }
				},
			],
			[
				"move",
				async (f) => {
					const { row, pxeNote } = await reconcileRow(1, 115)
					f.pxe.active = [{ ...pxeNote, txIndexInBlock: 2 }]
					return { id: row.id, before: row }
				},
			],
			[
				"delete",
				async (f) => {
					const { row } = await reconcileRow(1)
					expect(await f.run()).toBe(false)
					return { id: row.id, before: row }
				},
			],
		]

		test.each(decisions)("%s, beside a displaced deleter still running; the control decides", async (_name, arrange) => {
			const f = await bootReconcile()
			const { id, before } = await arrange(f)
			f.svc.deletersRunning += 1
			expect(await f.run()).toBe(false)
			expect(await repo.getRecord(id)).toEqual(before)
			f.svc.deletersRunning -= 1
			expect(await f.run()).toBe(true)
			expect(await repo.getRecord(id)).not.toEqual(before)
		})

		test.each(decisions)("%s, across a watchdog handoff during its row re-read", async (_name, arrange) => {
			const f = await bootReconcile()
			const { id, before } = await arrange(f)
			// Each active note's record is read twice, before its lock and inside it.
			const reads = 2 * f.pxe.active.length
			const reread = holdCall((f.service as unknown as { repo: object }).repo, "getRecord", reads + 1, "after")
			vi.useFakeTimers()
			try {
				const scan = f.run()
				await untilReached(reread.held)
				await advance(WATCHDOG_MS)
				reread.release()
				await advance(0)
				expect(await scan).toBe(false)
			} finally {
				vi.useRealTimers()
			}
			expect(await repo.getRecord(id)).toEqual(before)
			expect(f.updated).toEqual([])
			expect(f.deleted).toEqual([])
		})
	})
})

describe("IncomingTransferService — note reconciliation on the real cadence", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	test("a struck row leaves its target unmarked, so the very next unforced tick deletes it", async () => {
		const f = await bootTicking()
		const { row } = await reconcileRow(1, 40)
		f.note.getSyncedBlock.mockImplementation(async () => ({ number: 60, hash: f.state.tips.proposedBlockHash }))
		f.state.tips = { ...f.state.tips, proposedBlockHash: SYNCED_TIP }

		await tick()
		expect(await repo.hasRecord(row.id)).toBe(true)
		await tick()
		expect(await repo.hasRecord(row.id)).toBe(false)
	})
})

describe("IncomingTransferService — quarantined chain", () => {
	async function bootOn(quarantined: boolean) {
		const network = Object.assign(makeNetworkStub([{ id: "n1", chainId: 1 }]), {
			isChainQuarantined: async () => quarantined,
		})
		const account = makeAccountStub([{ profileId: "p1", chainId: 1, address: "0xa" }])
		const noteSvc = makeNoteStub({ [tokenA.contract]: [] })
		const warn = vi.spyOn(IncomingTransferService.prototype as unknown as { logWarn: (...a: unknown[]) => void }, "logWarn")
		const { service } = await bootService({ network, account, token: makeTokenStub([tokenA]), note: noteSvc })
		const poll = Reflect.get(service, "poll") as (p: string, n: string, a: string, f: boolean) => Promise<void>
		await poll.call(service, "p1", "n1", "0xa", true)
		await flushPromises()
		return { noteSvc, warn }
	}

	afterEach(() => vi.restoreAllMocks())

	test("a poll on a quarantined chain reads no notes and logs no warning", async () => {
		const { noteSvc, warn } = await bootOn(true)
		expect(noteSvc.getNotesRaw).not.toHaveBeenCalled()
		expect(warn).not.toHaveBeenCalled()
	})

	test("control: the same poll on a live chain reads its notes", async () => {
		const { noteSvc } = await bootOn(false)
		expect(noteSvc.getNotesRaw).toHaveBeenCalled()
	})

	test("a public poll on a quarantined chain reads no tips and no events; on a live chain it does", async () => {
		for (const quarantined of [true, false]) {
			const { reader, state } = makePublicReader()
			const network = Object.assign(makeNetworkStub([{ id: "n1", chainId: 1 }]), { isChainQuarantined: async () => quarantined })
			const { service } = await bootPublic(reader, state, { network })
			const pollPublic = Reflect.get(service, "pollPublic") as (key: string, force: boolean) => Promise<void>
			await pollPublic.call(service, `n1|${tokenA.contract}`, true)
			expect([quarantined, state.tipsCalls > 0, state.fetchArgs.length > 0]).toEqual([quarantined, !quarantined, !quarantined])
		}
	})
})

describe("IncomingTransferService — sealing at rest", () => {
	/** A trusted token and one received note, stored as plaintext rows the way an earlier build wrote them. */
	async function seedLegacy() {
		const record = noteRecord({ contract: tokenA.contract, tokenId: tokenA.id })
		const trust = { profileId: "p1", networkId: "n1", contract: tokenA.contract, state: "trusted", updatedAt: 1 }
		await suiteBrowser.storage.local.set({
			[`nulo:core:incoming-transfers@${record.id}`]: JSON.stringify(record),
			[`nulo:core:incoming-trust@p1|n1|${tokenA.contract}`]: JSON.stringify(trust),
		})
		return { record, trust }
	}
	const incomingRows = async () =>
		Object.entries(await suiteBrowser.storage.local.get()).filter(([key]) => key.startsWith("nulo:core:incoming-"))
	const sealedCount = async () => (await incomingRows()).filter(([, value]) => parseEnvelope(JSON.parse(value as string))).length

	test("the profile's row keys seal its plaintext rows, which read back unchanged", async () => {
		const { record, trust } = await seedLegacy()
		const { profile } = await bootService({ token: makeTokenStub([]) })
		await flushPromises()
		const before = (await incomingRows()).length

		profile.onRowKeysReady.invoke("p1")
		await flushPromises()

		expect(await sealedCount()).toBe(before)
		expect(await repo.getRecord(record.id)).toEqual(record)
		expect(await repo.getTrust("p1", "n1", tokenA.contract)).toEqual(trust)
	})

	test("a conversion while a scope wipe runs commits nothing; the next one seals", async () => {
		await seedLegacy()
		const { service, profile } = await bootService({ token: makeTokenStub([]) })
		await flushPromises()
		const deleters = service as unknown as { deletersRunning: number }

		deleters.deletersRunning += 1
		profile.onRowKeysReady.invoke("p1")
		await flushPromises()
		expect(await sealedCount()).toBe(0)

		deleters.deletersRunning -= 1
		profile.onRowKeysReady.invoke("p1")
		await flushPromises()
		expect(await sealedCount()).toBe((await incomingRows()).length)
	})
})
