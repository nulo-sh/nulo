/**
 * Composition test: the real IncomingTransferService, its real repository and the lock on
 * FakeBrowserApi storage, every other service a canned stub. The Allow touches trust, records and
 * the lock only, and a scan reads notes from a constant `NoteService` stub (no PXE, no bb, no
 * simulate or prove), so the stored rows and the log buffer are the oracle. Block's tests run the
 * schedulers too and record each arm's reads by contract. See
 * `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { deferred, EventHandler } from "@nulo/wallet-core/utils"
import type { ConfigProp, IConfig } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { ServiceCollection } from "@/wallet/base"
import { svc } from "@/wallet/services/composition-harness"
import { ProfileService } from "@/wallet/services/profile/service"
import { type ExecutionFence, ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { NetworkService } from "@/wallet/services/network/service"
import { AccountService } from "@/wallet/services/account/service"
import { TokenService } from "@/wallet/services/token/service"
import { TransactionService } from "@/wallet/services/transaction/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { NoteService } from "@/wallet/services/note/service"
import { ConfigService } from "@/wallet/services/config/service"
import { TokenBalanceService } from "@/wallet/services/token-balance/service"
import { TaskService } from "@/wallet/services/task/service"
import { PriceService } from "@/wallet/services/price/service"
import type { RawNote } from "@/wallet/services/note/spec"
import type { PublicEventReader } from "./public-event-indexer"
import { IncomingTransferRepository } from "./repository"
import { IncomingTransferService } from "./service"
import { type IncomingNoteRecord, type IncomingPublicEventRecord, noteRecordId, publicRecordId } from "./spec"

const CONTRACT = `0x${"c3".repeat(32)}`
const TOKEN = { id: 7, profileId: "p1", chainId: 1, contract: CONTRACT, symbol: "TKA", decimals: 18 }
const NETWORK = { id: "n1", chainId: 1 }
const TIP = 100

const reader: PublicEventReader = {
	fetchTransferPage: async () => ({ events: [], scannedThrough: null, hasMore: false, dropped: false }),
	getScanTips: async () => ({
		checkpointedBlockNumber: TIP,
		checkpointedBlockHash: "0xcheckpoint",
		finalizedBlockNumber: TIP,
		proposedBlockHash: "0xproposed",
	}),
	getTokenClassStatus: async () => "standard",
	getLatestBlockNumber: async () => TIP,
	getChainTipOnce: async () => TIP,
}

function hiddenReceipt(n: number, accountAddress: string, l2BlockNumber: number): IncomingNoteRecord {
	return {
		kind: "note",
		id: noteRecordId("p1", "n1", `0x${n.toString(16).padStart(64, "0")}`),
		profileId: "p1",
		networkId: "n1",
		accountAddress,
		contract: CONTRACT,
		tokenId: TOKEN.id,
		owner: accountAddress,
		amountRaw: "100",
		noteHash: `0x${"ab".repeat(32)}`,
		txHash: `0x${n.toString(16).padStart(64, "f")}`,
		l2BlockNumber,
		txIndexInBlock: 0,
		indexInTx: 0,
		hidden: true,
		discoveredAt: 0,
	}
}

const NO_NOTES = { getNotesRaw: async () => [], getBlockTimestamp: async () => undefined }

/** Keeps debug lines too, so the buffer holds every line a scan writes. */
function debugLogger(): LoggerStore {
	const config: IConfig = {
		onUpdate: new EventHandler<ConfigProp>(),
		get: ((key: string) => key === "debugMode") as IConfig["get"],
	}
	return new LoggerStore(config)
}

/** What the service schedules from: its tokens, the accounts that scan them and the public reader. */
type Scope = { tokens?: (typeof TOKEN)[]; accounts?: { address: string }[]; reader?: PublicEventReader }

async function startService(api: FakeBrowserApi, notes: Record<string, unknown> = NO_NOTES, scope: Scope = {}) {
	const deletion = new ProfileDeletionState()
	const session = 1
	const visibility = { gate: undefined as Promise<void> | undefined, reached: false }

	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			onActiveProfileChanged: new EventHandler<void>(),
			getActiveProfile: async () => ({ id: "p1" }),
			getProfiles: async () => [{ id: "p1" }],
			captureExecutionFence: async (): Promise<ExecutionFence> => ({ profileId: "p1", epoch: deletion.capture("p1"), session }),
			isFenceLive: (fence: ExecutionFence) => fence.session === session && deletion.isCurrent(fence.profileId, fence.epoch),
			getDeletionState: () => deletion,
		}),
	)
	collection.add(
		svc(NetworkService.name, {
			getNetwork: async (id: string) => (id === NETWORK.id ? NETWORK : undefined),
			getNetworks: async () => [NETWORK],
			getNetworksRaw: async () => [NETWORK],
			registerChainPurgeSubscriber: () => {},
			isChainQuarantined: async () => false,
		}),
	)
	collection.add(
		svc(AccountService.name, {
			onAccountAdded: new EventHandler(),
			onAccountDeleted: new EventHandler(),
			getAccounts: async () => scope.accounts ?? [],
		}),
	)
	collection.add(
		svc(TokenService.name, {
			onTokenAdded: new EventHandler(),
			onTokenDeleted: new EventHandler(),
			getTokensRaw: async () => scope.tokens ?? [TOKEN],
		}),
	)
	collection.add(svc(TransactionService.name, { onTransactionAdded: new EventHandler(), transactionsOf: async () => [] }))
	collection.add(svc(OperationJournalService.name, { getOperations: async () => [] }))
	collection.add(svc(NoteService.name, notes))
	collection.add(
		svc(ConfigService.name, {
			getValue: async (key: string) => {
				if (key !== "incomingTransfersVisible") return undefined
				if (visibility.gate) {
					visibility.reached = true
					await visibility.gate
				}
				return true
			},
		}),
	)
	collection.add(svc(TokenBalanceService.name, { requestBalanceRefresh: async () => ({ busy: true }) }))
	collection.add(svc(TaskService.name, { getTaskSync: () => ({ status: 0 }) }))
	collection.add(svc(PriceService.name, { getQuotes: async () => ({ quotes: {}, pricedTokens: {} }) }))
	const logger = debugLogger()
	const service = new IncomingTransferService(logger, api, 1_000_000, scope.reader ?? reader)
	collection.add(service)
	await collection.start()
	return { service, logger, visibility }
}

async function makeHarness() {
	const api = new FakeBrowserApi()
	api.reset()
	const { service, visibility } = await startService(api)

	const repo = new IncomingTransferRepository(api)
	await repo.setTrust("p1", "n1", CONTRACT, "pending")
	const receipts = [hiddenReceipt(1, "0xa", 40), hiddenReceipt(2, "0xb", 141)]
	for (const r of receipts) await repo.upsertRecord(r)

	return {
		service,
		repo,
		receipts,
		/** Parks the next visibility read, the Allow's last read before its write, until `release`. */
		parkVisibility: () => {
			let release!: () => void
			visibility.gate = new Promise<void>((resolve) => {
				release = () => {
					visibility.gate = undefined
					resolve()
				}
			})
			return { release, held: visibility }
		},
	}
}

afterEach(() => {
	vi.useRealTimers()
})

describe("IncomingTransferService composition — the Allow, in-process", () => {
	test("an Allow stores the trusted row with its floor and every receipt visible", async () => {
		const { service, repo, receipts } = await makeHarness()
		const added: string[] = []
		service.onIncomingTransferAdded.add((r) => added.push(r.id))

		expect(await service.setTrustAllow("p1", "n1", CONTRACT)).toBe(true)

		const stored = await repo.getTrust("p1", "n1", CONTRACT)
		expect(stored).toMatchObject({ state: "trusted", arrivalFloor: 141 })
		expect(stored?.arrivalFloorPending).toBeUndefined()
		for (const r of receipts) expect((await repo.getRecord(r.id))?.hidden).toBe(false)
		expect(added.sort()).toEqual(receipts.map((r) => r.id).sort())
	})

	test("an Allow the watchdog displaced writes nothing, so the contract stays pending over hidden receipts", async () => {
		const { service, repo, receipts, parkVisibility } = await makeHarness()
		vi.useFakeTimers()
		const { release, held } = parkVisibility()
		const call = service.setTrustAllow("p1", "n1", CONTRACT)
		for (let i = 0; i < 20 && !held.reached; i++) await vi.advanceTimersByTimeAsync(0)
		expect(held.reached).toBe(true)

		await vi.advanceTimersByTimeAsync(5 * 60_000 + 1)
		release()
		await vi.advanceTimersByTimeAsync(0)

		expect(await call).toBe(false)
		expect(await repo.getTrust("p1", "n1", CONTRACT)).toMatchObject({ state: "pending" })
		for (const r of receipts) expect((await repo.getRecord(r.id))?.hidden).toBe(true)
	})
})

describe("IncomingTransferService composition — a received note, scanned in-process", () => {
	const ACCOUNT = `0x${"a1".repeat(32)}`
	const UNIQUE_NOTE_HASH = `0x${"1c".repeat(32)}`
	const NULLIFIER = `0x${"7e3d".repeat(16)}`
	/** Carries a nullifier, as the PXE's note does, so a copy of it into a row or a log line fails the check. */
	const wireNote = {
		contract: CONTRACT,
		storageSlot: "0x1",
		txHash: `0x${"7b".repeat(32)}`,
		rawContent: ["0x64"],
		content: { value: "100" },
		uniqueNoteHash: UNIQUE_NOTE_HASH,
		noteHash: `0x${"ab".repeat(32)}`,
		l2BlockNumber: TIP - 10,
		txIndexInBlock: 0,
		noteIndexInTx: 0,
		siloedNullifier: NULLIFIER,
	} as RawNote
	const notes = {
		getNotesRaw: async () => [wireNote],
		getBlockTimestamp: async () => 1_700_000_000,
		getSyncedBlock: async () => ({ number: TIP, hash: "0xproposed" }),
	}

	type Scannable = {
		serviceEpoch: number
		scanContract: (p: string, n: string, a: string, c: string, epoch: number, tips?: unknown) => Promise<boolean>
	}
	const scan = (service: IncomingTransferService, tips?: unknown) => {
		const s = service as unknown as Scannable
		return s.scanContract("p1", "n1", ACCOUNT, CONTRACT, s.serviceEpoch, tips)
	}

	test("no stored key, value or log line holds a note's nullifier, and discovery, settlement and a restart keep one settled row", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const repo = new IncomingTransferRepository(api)
		await repo.setTrust("p1", "n1", CONTRACT, "trusted")
		const loggers: LoggerStore[] = []
		const start = async () => {
			const started = await startService(api, notes)
			loggers.push(started.logger)
			return started.service
		}
		const noteRows = async () => (await repo.listByContract("p1", "n1", CONTRACT)).filter((r) => r.kind === "note")
		const surfaces = async () =>
			JSON.stringify([
				await api.storage.local.get(null),
				await api.storage.session.get(null),
				loggers.map((l) => l.get(10_000)),
			]).toLowerCase()
		const expectNoNullifier = async () => {
			const written = await surfaces()
			expect(written).toContain(UNIQUE_NOTE_HASH.slice(2))
			expect(written).not.toContain(NULLIFIER.slice(2))
		}
		const id = noteRecordId("p1", "n1", UNIQUE_NOTE_HASH)
		const first = await start()

		await scan(first)
		const discovered = await noteRows()
		expect(discovered.map((r) => r.id)).toEqual([id])
		expect(discovered[0]).not.toHaveProperty("settled", true)
		await expectNoNullifier()

		await scan(first, await reader.getScanTips("n1"))
		expect((await noteRows()).map((r) => [r.id, r.settled])).toEqual([[id, true]])
		await expectNoNullifier()

		await scan(await start(), await reader.getScanTips("n1"))
		expect((await noteRows()).map((r) => [r.id, r.settled])).toEqual([[id, true]])
		await expectNoNullifier()
	})
})

describe("IncomingTransferService composition — Block stops the token's scans", () => {
	const ACCOUNT = `0x${"a1".repeat(32)}`
	const OTHER = { ...TOKEN, id: 8, contract: `0x${"d4".repeat(32)}`, symbol: "TKB" }
	const wireNote = (contract: string) =>
		({
			contract,
			storageSlot: "0x1",
			txHash: `0x${"7b".repeat(32)}`,
			rawContent: ["0x64"],
			content: { value: "100" },
			uniqueNoteHash: `0x${"1c".repeat(32)}`,
			noteHash: `0x${"ab".repeat(32)}`,
			l2BlockNumber: TIP - 10,
			txIndexInBlock: 0,
			noteIndexInTx: 0,
		}) as RawNote

	type Internals = {
		serviceEpoch: number
		polling: Set<string>
		publicPolling: Set<string>
		accountService: { getAccounts: () => Promise<{ address: string }[]> }
		networkService: { getNetwork: (id: string) => Promise<unknown> }
		repo: IncomingTransferRepository
		hydrateSchedulers: () => Promise<void>
		finishReconciliation: (
			p: string,
			n: string,
			c: string,
			marker: { lowerBound: number; upperBound: number; upperBoundHash: string; progress: null; seen: [number, string][] },
			seen: [number, string][],
			reconciledThrough: null,
			epoch: number,
		) => Promise<boolean>
		scanContract: (p: string, n: string, a: string, c: string, epoch: number) => Promise<boolean>
		onTokenDeleted: (token: unknown) => Promise<void>
		onTokenAdded: (token: unknown) => Promise<void>
	}
	const internals = (service: IncomingTransferService) => service as unknown as Internals
	const scan = (service: IncomingTransferService, contract = CONTRACT) =>
		internals(service).scanContract("p1", "n1", ACCOUNT, contract, internals(service).serviceEpoch)

	async function fixture() {
		const api = new FakeBrowserApi()
		api.reset()
		const repo = new IncomingTransferRepository(api)
		await repo.setTrust("p1", "n1", CONTRACT, "pending")
		await repo.setTrust("p1", "n1", OTHER.contract, "trusted")
		return { api, repo }
	}

	/** Every read either arm makes, by contract. */
	function recordingReads() {
		const reads: string[] = []
		const notes = {
			getNotesRaw: async (_network: string, _account: string, contract: string) => {
				reads.push(`note ${contract}`)
				return []
			},
			getBlockTimestamp: async () => undefined,
		}
		const recorder: PublicEventReader = {
			...reader,
			getTokenClassStatus: async (_network, contract) => {
				reads.push(`public ${contract}`)
				return "standard"
			},
			fetchTransferPage: async (network, contract, args) => {
				reads.push(`public ${contract}`)
				return reader.fetchTransferPage(network, contract, args)
			},
		}
		return { reads, notes, recorder }
	}
	/** No poll of either arm is running: every read a scan makes has been made. */
	const idle = (service: IncomingTransferService) => internals(service).polling.size + internals(service).publicPolling.size === 0
	const readsOf = (reads: string[], contract: string) => [...new Set(reads.filter((r) => r.endsWith(contract)))].sort()
	const BOTH_ARMS = (contract: string) => [`note ${contract}`, `public ${contract}`]

	test("after Block neither arm reads the token, the allowed token reads on, and a delete and re-add resumes both", async () => {
		const { api } = await fixture()
		const { reads, notes, recorder } = recordingReads()
		const tokens = [TOKEN, OTHER]
		const { service } = await startService(api, notes, { tokens, accounts: [{ address: ACCOUNT }], reader: recorder })
		await vi.waitFor(() => expect(readsOf(reads, CONTRACT)).toEqual(BOTH_ARMS(CONTRACT)))
		await vi.waitFor(() => expect(idle(service)).toBe(true))

		reads.length = 0
		expect(await service.setTrustReject("p1", "n1", CONTRACT)).toBe(true)
		await vi.waitFor(() => expect(readsOf(reads, OTHER.contract)).toEqual(BOTH_ARMS(OTHER.contract)))
		await vi.waitFor(() => expect(idle(service)).toBe(true))
		expect(readsOf(reads, CONTRACT)).toEqual([])

		tokens.splice(0, 1)
		await internals(service).onTokenDeleted(TOKEN)
		tokens.unshift(TOKEN)
		await internals(service).onTokenAdded(TOKEN)
		await vi.waitFor(() => expect(readsOf(reads, CONTRACT)).toEqual(BOTH_ARMS(CONTRACT)))
	})

	test("a Block whose teardown throws still rebuilds the scans, and the allowed token reads on", async () => {
		const { api } = await fixture()
		const { reads, notes, recorder } = recordingReads()
		const { service } = await startService(api, notes, { tokens: [TOKEN, OTHER], accounts: [{ address: ACCOUNT }], reader: recorder })
		await vi.waitFor(() => expect(readsOf(reads, CONTRACT)).toEqual(BOTH_ARMS(CONTRACT)))
		await vi.waitFor(() => expect(idle(service)).toBe(true))
		vi.spyOn(internals(service).repo, "listByContract").mockRejectedValueOnce(new Error("storage unavailable"))

		reads.length = 0
		await expect(service.setTrustReject("p1", "n1", CONTRACT)).rejects.toThrow("storage unavailable")
		await vi.waitFor(() => expect(readsOf(reads, OTHER.contract)).toEqual(BOTH_ARMS(OTHER.contract)))
		await vi.waitFor(() => expect(idle(service)).toBe(true))
		expect(readsOf(reads, CONTRACT)).toEqual([])
	})

	test("a rebuild that read the trust before Block, and resumes during it, schedules no read of the token", async () => {
		const { api } = await fixture()
		const { reads, notes, recorder } = recordingReads()
		const { service } = await startService(api, notes, { tokens: [TOKEN, OTHER], accounts: [{ address: ACCOUNT }], reader: recorder })
		await vi.waitFor(() => expect(readsOf(reads, CONTRACT)).toEqual(BOTH_ARMS(CONTRACT)))
		await vi.waitFor(() => expect(idle(service)).toBe(true))
		const s = internals(service)
		const parked = deferred()
		const resume = deferred()
		vi.spyOn(s.accountService, "getAccounts").mockImplementationOnce(async () => {
			parked.resolve()
			await resume.promise
			return [{ address: ACCOUNT }]
		})
		const stale = s.hydrateSchedulers()
		await parked.promise
		const getNetwork = s.networkService.getNetwork.bind(s.networkService)
		const firstAwait = vi.spyOn(s.networkService, "getNetwork").mockImplementationOnce(async (id) => {
			resume.resolve()
			await stale
			return getNetwork(id)
		})

		reads.length = 0
		expect(await service.setTrustReject("p1", "n1", CONTRACT)).toBe(true)
		expect(firstAwait).toHaveBeenCalled()
		await stale
		await vi.waitFor(() => expect(readsOf(reads, OTHER.contract)).toEqual(BOTH_ARMS(OTHER.contract)))
		await vi.waitFor(() => expect(idle(service)).toBe(true))
		expect(readsOf(reads, CONTRACT)).toEqual([])
	})

	test("an add whose tip read outlasts a Block leaves the token blocked", async () => {
		const { api, repo } = await fixture()
		const tipRead = deferred()
		const tip = deferred<number>()
		let gated = false
		const slowTip: PublicEventReader = {
			...reader,
			getLatestBlockNumber: async (network) => {
				if (!gated) return reader.getLatestBlockNumber(network)
				tipRead.resolve()
				return tip.promise
			},
		}
		const { service } = await startService(api, NO_NOTES, { reader: slowTip })
		gated = true
		const adding = internals(service).onTokenAdded(TOKEN)
		await tipRead.promise

		expect(await service.setTrustReject("p1", "n1", CONTRACT)).toBe(true)
		tip.resolve(TIP)
		await adding

		expect(await repo.getTrust("p1", "n1", CONTRACT)).toMatchObject({ state: "blocked" })
	})

	test("a reconciliation the lock handed off to Block marks no balance and deletes nothing after it", async () => {
		const { api, repo } = await fixture()
		const orphan = {
			kind: "public-event",
			id: publicRecordId("p1", "n1", `0x${"0e".repeat(32)}`, 0),
			profileId: "p1",
			networkId: "n1",
			accountAddress: "0xa",
			contract: CONTRACT,
			tokenId: TOKEN.id,
			owner: "0xa",
			from: "0xb",
			amountRaw: "100",
			txHash: `0x${"0e".repeat(32)}`,
			blockHash: "0xold",
			l2BlockNumber: 50,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: true,
			discoveredAt: 0,
		} as IncomingPublicEventRecord
		await repo.upsertRecord(orphan)
		const { service } = await startService(api)
		await vi.waitFor(() => expect(idle(service)).toBe(true))
		const s = internals(service)
		const read = deferred()
		const release = deferred()
		const listByContract = s.repo.listByContract.bind(s.repo)
		vi.spyOn(s.repo, "listByContract").mockImplementationOnce(async (...args) => {
			const rows = await listByContract(...args)
			read.resolve()
			await release.promise
			return rows
		})
		const deleted: string[] = []
		service.onIncomingTransferDeleted.add((r) => deleted.push(r.id))
		const seen: [number, string][] = [[50, "0xnew"]]
		const marker = { lowerBound: 0, upperBound: 100, upperBoundHash: "0xup", progress: null, seen }

		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const finishing = s.finishReconciliation("p1", "n1", CONTRACT, marker, seen, null, s.serviceEpoch)
		await read.promise
		await vi.advanceTimersByTimeAsync(5 * 60_000 + 1)
		vi.useRealTimers()
		expect(await service.setTrustReject("p1", "n1", CONTRACT)).toBe(true)
		release.resolve()

		expect(await finishing).toBe(false)
		expect(deleted).toEqual([orphan.id])
		expect(await repo.listOutbox()).toEqual([])
	})

	test("Block deletes the token's hidden receipts on every account, keeps its trust, shown receipts and balance marks; another token's stay", async () => {
		const { api, repo } = await fixture()
		await repo.setTrust("p1", "n1", OTHER.contract, "pending")
		const blockedReceipts = [hiddenReceipt(1, "0xa", 40), hiddenReceipt(2, "0xb", 41)]
		const otherReceipt = { ...hiddenReceipt(3, "0xa", 42), contract: OTHER.contract, tokenId: OTHER.id }
		const shownReceipt = { ...hiddenReceipt(4, "0xa", 43), hidden: false }
		for (const r of [...blockedReceipts, otherReceipt, shownReceipt]) await repo.upsertRecord(r)
		await repo.setOutbox("p1", "n1", "0xa", TOKEN.id, { dirtyAt: 1 })
		const { service } = await startService(api, NO_NOTES, { tokens: [TOKEN, OTHER] })
		const deleted: string[] = []
		service.onIncomingTransferDeleted.add((r) => deleted.push(r.id))

		expect(await service.setTrustReject("p1", "n1", CONTRACT)).toBe(true)

		expect(await repo.listByContract("p1", "n1", CONTRACT)).toEqual([shownReceipt])
		expect(deleted.sort()).toEqual(blockedReceipts.map((r) => r.id).sort())
		expect(await repo.getRecord(otherReceipt.id)).toEqual(otherReceipt)
		expect(await repo.getOutbox("p1", "n1", "0xa", TOKEN.id)).toEqual({ dirtyAt: 1 })
		expect(await repo.getTrust("p1", "n1", CONTRACT)).toMatchObject({ state: "blocked" })
	})

	test("a note scan in flight when Block lands stores no receipt and marks no balance dirty", async () => {
		const { api, repo } = await fixture()
		const read = deferred()
		const release = deferred()
		const notes = {
			getNotesRaw: async () => {
				read.resolve()
				await release.promise
				return [wireNote(CONTRACT)]
			},
			getBlockTimestamp: async () => 1_700_000_000,
		}
		const { service } = await startService(api, notes)
		const scanning = scan(service)
		await read.promise

		expect(await service.setTrustReject("p1", "n1", CONTRACT)).toBe(true)
		release.resolve()
		await scanning

		expect(await repo.listByContract("p1", "n1", CONTRACT)).toEqual([])
		expect(await repo.listOutbox()).toEqual([])
	})

	test("a note scan of a blocked token stores no receipt and marks no balance dirty; an allowed token's does", async () => {
		const { api, repo } = await fixture()
		const notes = {
			getNotesRaw: async (_n: string, _a: string, contract: string) => [wireNote(contract)],
			getBlockTimestamp: async () => 1,
		}
		const { service } = await startService(api, notes, { tokens: [TOKEN, OTHER] })
		expect(await service.setTrustReject("p1", "n1", CONTRACT)).toBe(true)

		await scan(service, CONTRACT)
		await scan(service, OTHER.contract)

		expect(await repo.listByContract("p1", "n1", CONTRACT)).toEqual([])
		expect(await repo.listByContract("p1", "n1", OTHER.contract)).toHaveLength(1)
		expect((await repo.listOutbox()).map(([key]) => key.endsWith(`|${OTHER.id}`))).toEqual([true])
	})

	test("an Allow after Block is refused, and the token stays blocked", async () => {
		const { api, repo } = await fixture()
		const { service } = await startService(api)
		expect(await service.setTrustReject("p1", "n1", CONTRACT)).toBe(true)

		expect(await service.setTrustAllow("p1", "n1", CONTRACT)).toBe(false)
		expect(await repo.getTrust("p1", "n1", CONTRACT)).toMatchObject({ state: "blocked" })
	})
})
