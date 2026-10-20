/**
 * `TransactionService`'s finality watch: a row this worker saw mined below Finalized carries a
 * persisted marker and is read on the finality cadence until the finalized chain proves its block
 * final or pruned. Real service lifecycle over `svc()` stubs; fake timers drive the 1s worker.
 */
import { BlockNumber } from "@aztec-labs/foundation/branded-types"
import { BlockHash } from "@aztec-labs/stdlib/block"
import { BlockHeader, GlobalVariables } from "@aztec-labs/stdlib/tx"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { ACCOUNT_SERVICE_NAME } from "@/wallet/services/account/spec"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { svc } from "../composition-harness"
import { FINALITY_READ_INTERVAL_MS } from "./inclusion"
import { TRANSACTION_STORAGE_ROOT, TransactionService, TxExecutionResult, TxStatus, type Tx } from "./service"

const ACCOUNT = "0xacc"
const ENDPOINT = "https://rpc.example.test"
const HASH = `0x${"11".repeat(32)}`
const BLOCK = { number: 7, hash: `0x${"0b".repeat(32)}` }
const NEXT_BLOCK = { number: 8, hash: `0x${"0c".repeat(32)}` }

const minedIn = (block = BLOCK, executionResult = "success") => ({
	status: "proposed",
	executionResult,
	blockHash: BlockHash.fromString(block.hash),
	blockNumber: block.number,
	transactionFee: 123n,
})
const finalizedAt = (block: number) => ({
	header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(block) }) }),
	blockHash: BlockHash.fromString(`0x${"1f".repeat(32)}`),
})
/** The finalized archive's answer: the block's hash found at `index`, or absent. */
const archiveLeaf = (index?: number) => [
	index === undefined
		? undefined
		: { data: BigInt(index), l2BlockNumber: index, l2BlockHash: BlockHash.fromString(`0x${"1f".repeat(32)}`) },
]

/** A mined row as storage holds it. */
const storedRow = (overrides: Partial<Tx> = {}): Tx => ({
	chainId: 1,
	account: ACCOUNT,
	nonce: "0",
	feePaymentMethod: 0 as never,
	hash: HASH,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	status: TxStatus.Proposed,
	executionResult: TxExecutionResult.Success,
	block: BLOCK,
	fee: "123",
	origin: { type: 0 } as never,
	calls: [],
	submittedEndpointUrl: ENDPOINT,
	...overrides,
})

describe("TransactionService — a mined row until its block is final", () => {
	let api: FakeBrowserApi
	let service: TransactionService
	let getTxReceipt: ReturnType<typeof vi.fn>
	let getBlockData: ReturnType<typeof vi.fn>
	let findLeavesIndexes: ReturnType<typeof vi.fn>

	const buildService = async () => {
		const services = new ServiceCollection()
		services.add(
			svc(PROFILE_SERVICE_NAME, { getActiveProfile: async () => ({ id: "p1" }), getDeletionState: () => new ProfileDeletionState() }),
		)
		services.add(
			svc(ACCOUNT_SERVICE_NAME, {
				onAccountDeleted: new EventHandler(),
				getAccount: async () => undefined,
				getAccounts: async () => [{ address: ACCOUNT }],
				getAccountsRaw: async (profileId: string) => (profileId === "p1" ? [{ profileId, chainId: 1, address: ACCOUNT }] : []),
				getAccountsByAddress: async () => [
					{ profileId: "p1", address: ACCOUNT },
					{ profileId: "p2", address: ACCOUNT },
				],
			}),
		)
		const node = { getTxReceipt, getBlockData, findLeavesIndexes }
		services.add(
			svc(NETWORK_SERVICE_NAME, {
				getNodeForUrl: async () => node,
				getNode: async () => node,
				getSingleAttemptNodeForUrl: async () => node,
				getNetworks: async () => [{ chainId: 1 }],
				reportEndpointFailure: () => {},
			}),
		)
		const built = new TransactionService(new LoggerStore(new ConfigStore()), api)
		services.add(built)
		await services.start()
		return built
	}

	beforeEach(async () => {
		vi.useFakeTimers()
		api = new FakeBrowserApi()
		api.reset()
		getTxReceipt = vi.fn(async (): Promise<unknown> => minedIn())
		getBlockData = vi.fn(async (): Promise<unknown> => finalizedAt(BLOCK.number - 1))
		findLeavesIndexes = vi.fn(async (): Promise<unknown[]> => archiveLeaf(BLOCK.number))
		service = await buildService()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	const add = () =>
		service.addTransaction({
			origin: { type: 0 } as never,
			chainId: 1,
			account: ACCOUNT,
			calls: [],
			nonce: "0",
			feePaymentMethod: 0 as never,
			hash: HASH,
			submittedEndpointUrl: ENDPOINT,
		})
	const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)
	const minedAndMarked = async () => {
		await add()
		await tick(1_000)
		expect(await service.getTransaction(HASH)).toMatchObject({ status: TxStatus.Proposed, awaitingFinality: true })
	}

	test("is marked when this worker sees it mined, read until final, then written Finalized and unmarked", async () => {
		await minedAndMarked()
		await tick(FINALITY_READ_INTERVAL_MS)
		expect(getBlockData).toHaveBeenCalledTimes(1)
		expect((await service.getTransaction(HASH)).status).toBe(TxStatus.Proposed)

		getBlockData.mockResolvedValue(finalizedAt(BLOCK.number))
		await tick(FINALITY_READ_INTERVAL_MS)
		const final = await service.getTransaction(HASH)
		expect(final).toMatchObject({ status: TxStatus.Finalized, block: BLOCK, executionResult: TxExecutionResult.Success, fee: "123" })
		expect(final.awaitingFinality).toBeUndefined()
		await tick(FINALITY_READ_INTERVAL_MS * 3)
		expect(getBlockData).toHaveBeenCalledTimes(2)
	})

	test("a proven prune returns it to Pending, block, result and fee cleared; the pending poll takes it back", async () => {
		await minedAndMarked()
		getBlockData.mockResolvedValue(finalizedAt(BLOCK.number))
		findLeavesIndexes.mockResolvedValue(archiveLeaf())
		getTxReceipt.mockResolvedValue({ status: "pending" })
		await tick(FINALITY_READ_INTERVAL_MS)
		const pruned = await service.getTransaction(HASH)
		expect(pruned.status).toBe(TxStatus.Pending)
		expect([pruned.block, pruned.executionResult, pruned.fee, pruned.awaitingFinality]).toEqual([
			undefined,
			undefined,
			undefined,
			undefined,
		])
		expect(service.getPendingForAccount(ACCOUNT).map((tx) => tx.hash)).toEqual([HASH])

		getTxReceipt.mockResolvedValue(minedIn(NEXT_BLOCK, "reverted"))
		await tick(1_000)
		expect(await service.getTransaction(HASH)).toMatchObject({
			status: TxStatus.Proposed,
			block: NEXT_BLOCK,
			executionResult: TxExecutionResult.AppLogicReverted,
			awaitingFinality: true,
		})
	})

	test("a block found pruned with the tx mined elsewhere moves the row there and keeps watching", async () => {
		await minedAndMarked()
		getBlockData.mockResolvedValue(finalizedAt(BLOCK.number))
		findLeavesIndexes.mockResolvedValue(archiveLeaf())
		getTxReceipt.mockResolvedValue(minedIn(NEXT_BLOCK))
		await tick(FINALITY_READ_INTERVAL_MS)
		expect(await service.getTransaction(HASH)).toMatchObject({ status: TxStatus.Proposed, block: NEXT_BLOCK, awaitingFinality: true })

		getBlockData.mockResolvedValue(finalizedAt(NEXT_BLOCK.number))
		findLeavesIndexes.mockResolvedValue(archiveLeaf(NEXT_BLOCK.number))
		await tick(FINALITY_READ_INTERVAL_MS)
		expect((await service.getTransaction(HASH)).status).toBe(TxStatus.Finalized)
	})

	test("a lagging answer never moves a mined row: its receipt is not polled, and one still naming the recorded block is no answer", async () => {
		await minedAndMarked()
		const receiptsAfterMine = getTxReceipt.mock.calls.length
		getTxReceipt.mockResolvedValue({ status: "dropped" })
		await tick(FINALITY_READ_INTERVAL_MS - 1_000)
		expect(getTxReceipt).toHaveBeenCalledTimes(receiptsAfterMine)

		getBlockData.mockResolvedValue(finalizedAt(BLOCK.number))
		findLeavesIndexes.mockResolvedValue(archiveLeaf())
		getTxReceipt.mockResolvedValue(minedIn())
		await tick(FINALITY_READ_INTERVAL_MS * 3)
		expect(await service.getTransaction(HASH)).toMatchObject({ status: TxStatus.Proposed, block: BLOCK, awaitingFinality: true })
	})

	test("a marked row in storage is read again after a restart; one with the marker restored from a backup is stripped and never read", async () => {
		const restoredHash = `0x${"22".repeat(32)}`
		await service.restore([storedRow({ hash: restoredHash, awaitingFinality: true })], "p1")
		expect((await service.getTransaction(restoredHash)).awaitingFinality).toBeUndefined()
		await api.storage.local.set({ [`${TRANSACTION_STORAGE_ROOT}@${HASH}`]: JSON.stringify(storedRow({ awaitingFinality: true })) })

		await buildService()
		await tick(1_000)
		expect(getBlockData).toHaveBeenCalledTimes(1)
		expect(getTxReceipt).not.toHaveBeenCalled()
		await tick(FINALITY_READ_INTERVAL_MS * 2)
		expect(getBlockData).toHaveBeenCalledTimes(3)
	})

	test("a backup never carries the marker", async () => {
		await minedAndMarked()
		const exported = await service.backup()
		expect(exported?.map((tx) => tx.hash)).toEqual([HASH])
		expect(exported?.[0]).not.toHaveProperty("awaitingFinality")
	})

	test("a backup carries a row's fee chooser, so a restore of it reads the same label", async () => {
		const chosen = `0x${"33".repeat(32)}`
		await service.restore([storedRow({ hash: chosen, feeChoice: "app_protocol_sponsor" })], "p1")
		const exported = await service.backup()
		expect(exported?.find((tx) => tx.hash === chosen)?.feeChoice).toBe("app_protocol_sponsor")
	})

	test.each([
		["a purge", (s: TransactionService) => s.purgeForAccounts([ACCOUNT])],
		["the ambiguous marking", (s: TransactionService) => s.purgeForAccounts([ACCOUNT], "p1")],
	])("%s ends the watch", async (_label, purge) => {
		await minedAndMarked()
		await purge(service)
		getBlockData.mockResolvedValue(finalizedAt(BLOCK.number))
		await tick(FINALITY_READ_INTERVAL_MS * 2)
		expect(getBlockData).not.toHaveBeenCalled()
	})

	test("a purge while the finalized block is read: the block hash is never sent", async () => {
		await minedAndMarked()
		let answer: (value: unknown) => void = () => {}
		getBlockData.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
		await tick(FINALITY_READ_INTERVAL_MS)
		expect(getBlockData).toHaveBeenCalledTimes(1)
		await service.purgeForAccounts([ACCOUNT])
		answer(finalizedAt(BLOCK.number))
		await tick(FINALITY_READ_INTERVAL_MS * 2)
		expect(findLeavesIndexes).not.toHaveBeenCalled()
		expect(getBlockData).toHaveBeenCalledTimes(1)
	})
})
