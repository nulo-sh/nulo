/**
 * Composition test: the real IncomingTransferService, its real repository and the lock on
 * FakeBrowserApi storage, every other service a canned stub. The Allow touches trust, records and
 * the lock only, and a scan reads notes from a constant `NoteService` stub (no PXE, no bb, no
 * simulate or prove), so the stored rows and the log buffer are the oracle. See
 * `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
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
import { type IncomingNoteRecord, noteRecordId } from "./spec"

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

async function startService(api: FakeBrowserApi, notes: Record<string, unknown> = NO_NOTES) {
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
		}),
	)
	collection.add(
		svc(AccountService.name, {
			onAccountAdded: new EventHandler(),
			onAccountDeleted: new EventHandler(),
			getAccounts: async () => [],
		}),
	)
	collection.add(
		svc(TokenService.name, { onTokenAdded: new EventHandler(), onTokenDeleted: new EventHandler(), getTokensRaw: async () => [TOKEN] }),
	)
	collection.add(svc(TransactionService.name, { onTransactionAdded: new EventHandler(), getTransactions: async () => [] }))
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
	const service = new IncomingTransferService(logger, api, 1_000_000, reader)
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
