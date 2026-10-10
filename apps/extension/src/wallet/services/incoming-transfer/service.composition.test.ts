/**
 * Composition test: the real IncomingTransferService, its real repository and the lock on
 * FakeBrowserApi storage, every other service a canned stub. The Allow touches trust, records and
 * the lock only (no PXE, no bb, no simulate or prove), so its stored rows are the oracle. See
 * `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ConfigStore } from "@/wallet/config"
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
	getScanTips: async () => ({ checkpointedBlockNumber: TIP, checkpointedBlockHash: "0xcheckpoint", finalizedBlockNumber: TIP }),
	getTokenClassStatus: async () => "standard",
	getLatestBlockNumber: async () => TIP,
}

function hiddenReceipt(n: number, accountAddress: string, l2BlockNumber: number): IncomingNoteRecord {
	const siloedNullifier = `0x${n.toString(16).padStart(64, "0")}`
	return {
		kind: "note",
		id: noteRecordId("p1", "n1", siloedNullifier),
		siloedNullifier,
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

async function makeHarness() {
	const api = new FakeBrowserApi()
	api.reset()
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
	collection.add(svc(NoteService.name, { getNotesRaw: async () => [], getBlockTimestamp: async () => undefined }))
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
	collection.add(svc(PriceService.name, { getQuotes: async () => ({}) }))
	const service = new IncomingTransferService(new LoggerStore(new ConfigStore()), api, 1_000_000, reader)
	collection.add(service)
	await collection.start()

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
