/**
 * The check behind a failed send that may have reached the network: what it reads and where, when
 * it answers, and what it refuses to do once the row's profile is locked, the row is gone or the
 * check has stopped. Fakes only; receipts are shaped as `AztecNode.getTxReceipt` answers them.
 */
import { BlockNumber } from "@aztec-labs/foundation/branded-types"
import { BlockHash } from "@aztec-labs/stdlib/block"
import { BlockHeader, GlobalVariables } from "@aztec-labs/stdlib/tx"
import { describe, expect, test, vi } from "vitest"
import type { SendCheckOutcome } from "@nulo/wallet-core/jobs"
import { MockClock } from "@nulo/wallet-core/testing"
import { deferred, EventHandler } from "@nulo/wallet-core/utils"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import { DROPPED_RECHECK_INTERVAL_MS, DROPPED_RESURRECTION_WINDOW_MS } from "@/wallet/services/transaction/service"
import { SEND_CHECK_TICK_MS, SendCheck } from "./send-check"
import { type OperationFilter, type OperationRecord, type SendCheckState, isSendCheckMove } from "./service"

const T0 = 1_750_000_000_000
// Below the field modulus, so `TxHash.fromString` parses them.
const HASH = `0x${"1f".repeat(32)}`
const OTHER_HASH = `0x${"2e".repeat(32)}`
const URL = "https://rpc.submit.example"
const ACCOUNT = `0x${"0c".repeat(32)}`

function failedRow(overrides: Partial<OperationRecord> = {}): OperationRecord {
	return {
		id: "op-1",
		kind: "transfer",
		origin: "popup",
		profileId: "p1",
		progress: { stage: "failed", from: "submitting", txHash: HASH, submittedEndpointUrl: URL },
		error: { kind: "transfer", message: "fetch failed", normalizedRaw: null },
		terminalAt: T0,
		attempts: 0,
		createdAt: T0 - 90_000,
		updatedAt: T0,
		accountAddress: ACCOUNT,
		networkId: "net1",
		...overrides,
	}
}

const reaped = { kind: "stale_on_resume", message: "Job declared lost", normalizedRaw: null }

const BLOCK = { block: 42, hash: `0x${"1b".repeat(32)}` }
const OTHER_BLOCK = { block: 43, hash: `0x${"2c".repeat(32)}` }

const mined = (status: string, executionResult = "success", at = BLOCK) => ({
	txHash: HASH,
	status,
	executionResult,
	transactionFee: 1234n,
	blockHash: BlockHash.fromString(at.hash),
	blockNumber: at.block,
	slotNumber: at.block,
	txIndexInBlock: 0,
	epochNumber: 1,
})
const dropped = () => ({ txHash: HASH, status: "dropped", error: "Tx dropped by P2P node" })

/** Chain seconds one hour after `T0`. */
const EXPIRY = { timestamp: T0 / 1_000 + 3_600, nullifier: `0x${"0e".repeat(32)}` }
const EXPIRES_AT = EXPIRY.timestamp * 1_000

/** The finalized block as `getBlockData("finalized")` answers it, at chain time `seconds`. */
const finalizedAt = (seconds: number, block = 9) => ({
	header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(block), timestamp: BigInt(seconds) }) }),
	blockHash: BlockHash.fromString(`0x${"1f".repeat(32)}`),
})
/** The finalized archive's answer: the block's hash found at `index`, or absent. */
const archiveLeaf = (index?: number) => [
	index === undefined ? undefined : { data: BigInt(index), l2BlockNumber: index, l2BlockHash: finalizedAt(0).blockHash },
]

/** Answered `unconfirmed` with a recorded expiry, the window long over. */
const unconfirmedRow = (withExpiry = true) =>
	failedRow({
		terminalAt: T0 - 40 * 60_000,
		progress: {
			stage: "failed",
			from: "submitting",
			txHash: HASH,
			submittedEndpointUrl: URL,
			expiry: withExpiry ? EXPIRY : undefined,
			check: "unconfirmed",
		},
	})
const pending = () => ({ txHash: HASH, status: "pending" })

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** The journal surface the check uses, over a Map. `holdLock` models its transition lock held by
 *  another writer: `setSendCheck` waits for the release before it judges the row and `isLive`. */
class FakeJournal {
	public readonly onOperationUpdated = new EventHandler<OperationRecord>()
	public readonly onOperationDeleted = new EventHandler<OperationRecord>()
	public readonly writes: { id: string; check: SendCheckOutcome | undefined }[] = []
	private readonly rows = new Map<string, OperationRecord>()
	private lockHeld: Promise<void> | undefined

	public constructor(rows: OperationRecord[]) {
		for (const row of rows) this.rows.set(row.id, row)
	}

	public async getOperation(id: string): Promise<OperationRecord | undefined> {
		return this.rows.get(id)
	}

	public async getOperations(filter?: OperationFilter): Promise<OperationRecord[]> {
		return [...this.rows.values()].filter((op) => filter?.stage === undefined || op.progress.stage === filter.stage)
	}

	public async setSendCheck(
		id: string,
		txHash: string,
		expected: SendCheckState,
		next: SendCheckState,
		isLive: () => boolean,
	): Promise<boolean> {
		await this.lockHeld
		const row = this.rows.get(id)
		if (row?.progress.stage !== "failed" || row.progress.txHash !== txHash) return false
		if (row.progress.check !== expected.check || row.progress.inclusion?.hash !== expected.inclusion?.hash) return false
		if (!isSendCheckMove(row.progress, next) || !isLive()) return false
		const { check, inclusion, checkSince } = next
		const updated: OperationRecord = { ...row, progress: { ...row.progress, check, inclusion, checkSince } }
		this.rows.set(id, updated)
		this.writes.push({ id, check: next.check })
		this.onOperationUpdated.invoke(updated)
		return true
	}

	/** Another writer's transition, as the reaper's lands. */
	public put(row: OperationRecord): void {
		this.rows.set(row.id, row)
		this.onOperationUpdated.invoke(row)
	}

	public remove(id: string): void {
		const row = this.rows.get(id)
		if (!row) return
		this.rows.delete(id)
		this.onOperationDeleted.invoke(row)
	}

	public holdLock(): () => void {
		const held = deferred<void>()
		this.lockHeld = held.promise
		return () => {
			this.lockHeld = undefined
			held.resolve()
		}
	}
}

function makeHarness(rows: OperationRecord[] = [failedRow()]) {
	const clock = new MockClock(T0)
	const journal = new FakeJournal(rows)
	let serial = 1
	let session: { profileId: string; serial: number } | undefined = { profileId: "p1", serial }
	const profile = {
		captureExecutionFence: vi.fn(async (): Promise<ExecutionFence> => {
			if (!session) throw new Error("Wallet locked")
			return { profileId: session.profileId, epoch: 0, session: session.serial }
		}),
		isFenceLive: (fence: ExecutionFence) => session?.serial === fence.session && session.profileId === fence.profileId,
	}
	const getTxReceipt = vi.fn(async (_hash: { toString(): string }): Promise<unknown> => pending())
	const getBlockData = vi.fn(async (_tag: string): Promise<unknown> => finalizedAt(EXPIRY.timestamp + 1))
	const findLeavesIndexes = vi.fn(async (..._args: unknown[]): Promise<unknown[]> => [undefined])
	const network = {
		getSingleAttemptNodeForUrl: vi.fn(async (_url: string) => ({ getTxReceipt, getBlockData, findLeavesIndexes }) as never),
		getNodeForUrl: vi.fn(),
		getNode: vi.fn(),
	}
	const balances = { refreshAccountBalances: vi.fn(async (_account: string) => {}) }
	const logs: unknown[][] = []
	const logger = {
		log: (...args: unknown[]) => {
			logs.push(args)
		},
	}
	const check = new SendCheck({ journal, network, profile, balances, logger, clock })
	return {
		check,
		clock,
		journal,
		profile,
		network,
		getTxReceipt,
		getBlockData,
		findLeavesIndexes,
		balances,
		logs,
		lock: () => {
			session = undefined
		},
		unlock: (profileId = "p1") => {
			serial += 1
			session = { profileId, serial }
		},
		/** `count` firings of the check's timer, each followed by everything it settles. */
		tick: async (count = 1) => {
			for (let i = 0; i < count; i++) {
				clock.advance(SEND_CHECK_TICK_MS)
				await settle()
			}
		},
	}
}

const watched = (check: SendCheck) => (check as unknown as { watches: Map<string, unknown> }).watches.size

describe("SendCheck: the answer", () => {
	test.each(["proposed", "checkpointed", "proven", "finalized"])(
		"a %s receipt that succeeded writes sent once and refreshes the account",
		async (status) => {
			const h = makeHarness()
			h.getTxReceipt.mockResolvedValue(mined(status))
			await h.check.start()
			await h.tick()
			expect(h.journal.writes).toEqual([{ id: "op-1", check: "sent" }])
			expect(h.balances.refreshAccountBalances).toHaveBeenCalledWith(ACCOUNT)
			await h.tick(3)
			expect(h.getTxReceipt).toHaveBeenCalledTimes(1)
		},
	)

	test("a mined receipt that reverted writes reverted and refreshes the account", async () => {
		const h = makeHarness()
		h.getTxReceipt.mockResolvedValue(mined("checkpointed", "reverted"))
		await h.check.start()
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "reverted" }])
		expect(h.balances.refreshAccountBalances).toHaveBeenCalledWith(ACCOUNT)
	})

	test.each([
		["DROPPED", dropped],
		["Pending", pending],
	])("%s is never an answer: every tick for two minutes, then every 15 s", async (_label, receipt) => {
		const h = makeHarness()
		h.getTxReceipt.mockImplementation(async () => receipt())
		await h.check.start()
		await h.tick(24)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(24)
		await h.tick(12)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(28)
		expect(h.journal.writes).toEqual([])
		expect(h.balances.refreshAccountBalances).not.toHaveBeenCalled()
	})

	test("a receipt read that throws is no answer: the row is read again at the same cadence", async () => {
		const h = makeHarness()
		h.getTxReceipt.mockRejectedValue(new Error("fetch failed"))
		await h.check.start()
		await h.tick(36)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(28)
		expect(h.journal.writes).toEqual([])
	})
})

describe("SendCheck: the window's last read", () => {
	const nearTheEnd = () => failedRow({ terminalAt: T0 - DROPPED_RESURRECTION_WINDOW_MS + 20_000 })

	test.each([
		["DROPPED", async () => dropped()],
		["no answer", async () => Promise.reject(new Error("fetch failed"))],
	])("%s at the first read past thirty minutes writes unconfirmed, and the watch ends", async (_label, answer) => {
		const h = makeHarness([nearTheEnd()])
		h.getTxReceipt.mockImplementation(answer)
		await h.check.start()
		await h.tick(3)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(1)
		expect(h.journal.writes).toEqual([])
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "unconfirmed" }])
		expect(h.balances.refreshAccountBalances).not.toHaveBeenCalled()
		await h.tick(6)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(2)
	})

	test("a mined answer at the last read wins", async () => {
		const h = makeHarness([failedRow({ terminalAt: T0 - DROPPED_RESURRECTION_WINDOW_MS })])
		h.getTxReceipt.mockResolvedValue(mined("proven"))
		await h.check.start()
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "sent" }])
	})
})

describe("SendCheck: a refusal a later block rarely lifts", () => {
	const refusedBy = (message: string, kind = "transfer") => ({ kind, message, normalizedRaw: null })
	const EXISTING = refusedBy("Invalid tx: Existing nullifier")
	const nearTheEnd = T0 - DROPPED_RESURRECTION_WINDOW_MS + 20_000

	test("a Dropped first read writes refused, refreshes nothing, and the row is still read", async () => {
		const h = makeHarness([failedRow({ error: EXISTING })])
		h.getTxReceipt.mockResolvedValue(dropped())
		await h.check.start()
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "refused" }])
		expect(h.balances.refreshAccountBalances).not.toHaveBeenCalled()
		await h.tick()
		expect(h.getTxReceipt).toHaveBeenCalledTimes(2)
		expect(h.journal.writes).toHaveLength(1)
	})

	test("an expiry refusal is one too; a Pending read is not, and a later Dropped read is", async () => {
		const h = makeHarness([failedRow({ error: refusedBy("Invalid tx: Invalid expiration timestamp") })])
		h.getTxReceipt.mockResolvedValueOnce(pending()).mockResolvedValue(dropped())
		await h.check.start()
		await h.tick()
		expect(h.journal.writes).toEqual([])
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "refused" }])
	})

	test.each([
		["a read that throws", (h: ReturnType<typeof makeHarness>) => h.getTxReceipt.mockRejectedValue(new Error("fetch failed"))],
		["no node", (h: ReturnType<typeof makeHarness>) => h.network.getSingleAttemptNodeForUrl.mockRejectedValue(new Error("refused"))],
		[
			"a status that does not parse",
			(h: ReturnType<typeof makeHarness>) => h.getTxReceipt.mockResolvedValue({ txHash: HASH, status: "gone" }),
		],
	])("%s is never Dropped: nothing is written", async (_label, arrange) => {
		const h = makeHarness([failedRow({ error: EXISTING })])
		arrange(h)
		await h.check.start()
		await h.tick(6)
		expect(h.journal.writes).toEqual([])
	})

	test("a refused send that landed after all is written sent and refreshes the account", async () => {
		const h = makeHarness([failedRow({ error: EXISTING })])
		h.getTxReceipt.mockResolvedValueOnce(dropped()).mockResolvedValue(mined("proposed"))
		await h.check.start()
		await h.tick(2)
		expect(h.journal.writes).toEqual([
			{ id: "op-1", check: "refused" },
			{ id: "op-1", check: "sent" },
		])
		expect((await h.journal.getOperation("op-1"))?.progress).toMatchObject({ check: "sent", inclusion: BLOCK })
		expect(h.balances.refreshAccountBalances).toHaveBeenCalledWith(ACCOUNT)
	})

	test("past the window a refused row's watch ends unread, after a restart too", async () => {
		const progress = { stage: "failed", from: "submitting", txHash: HASH, submittedEndpointUrl: URL, check: "refused" } as const
		const h = makeHarness([failedRow({ error: EXISTING, terminalAt: T0 - DROPPED_RESURRECTION_WINDOW_MS, progress })])
		await h.check.start()
		await h.tick(3)
		expect(h.network.getSingleAttemptNodeForUrl).not.toHaveBeenCalled()
		expect(watched(h.check)).toBe(0)
	})

	test("a first read past the window writes unconfirmed, never refused", async () => {
		const h = makeHarness([failedRow({ error: EXISTING, terminalAt: T0 - DROPPED_RESURRECTION_WINDOW_MS })])
		h.getTxReceipt.mockResolvedValue(dropped())
		await h.check.start()
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "unconfirmed" }])
	})

	test("a Dropped read that settles past the window's end writes nothing; the next read writes unconfirmed", async () => {
		const h = makeHarness([failedRow({ error: EXISTING, terminalAt: T0 - DROPPED_RESURRECTION_WINDOW_MS + 6_000 })])
		h.getTxReceipt.mockImplementationOnce(async () => {
			h.clock.advance(2_000)
			return dropped()
		})
		h.getTxReceipt.mockResolvedValue(dropped())
		await h.check.start()
		await h.tick()
		expect(h.getTxReceipt).toHaveBeenCalledTimes(1)
		expect(h.journal.writes).toEqual([])
		await h.tick(3)
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "unconfirmed" }])
	})

	test.each([
		["a listed refusal (control)", "refused", failedRow({ error: EXISTING, terminalAt: nearTheEnd })],
		[
			"a row once mined, then pruned,",
			"unconfirmed",
			failedRow({
				error: EXISTING,
				progress: { stage: "failed", from: "submitting", txHash: HASH, submittedEndpointUrl: URL, checkSince: nearTheEnd },
			}),
		],
		[
			"a fee refusal",
			"unconfirmed",
			failedRow({ error: refusedBy("Invalid tx: Insufficient fee payer balance"), terminalAt: nearTheEnd }),
		],
		[
			"an account initialized elsewhere",
			"unconfirmed",
			failedRow({
				error: refusedBy("Another first transaction initialized this account", "duplicate_initialization"),
				terminalAt: nearTheEnd,
			}),
		],
	])("%s on Dropped reads ends %s", async (_label, outcome, row) => {
		const h = makeHarness([row])
		h.getTxReceipt.mockResolvedValue(dropped())
		await h.check.start()
		await h.tick(4)
		expect(h.journal.writes).toEqual([{ id: "op-1", check: outcome }])
		// Two reads each: a refusal the journal would refuse to record is never tried, so never re-read at once.
		expect(h.getTxReceipt).toHaveBeenCalledTimes(2)
	})
})

describe("SendCheck: where it dials", () => {
	test("the receipt is read on the row's recorded endpoint, for the row's hash, never the active node", async () => {
		const h = makeHarness()
		await h.check.start()
		await h.tick()
		expect(h.network.getSingleAttemptNodeForUrl).toHaveBeenCalledWith(URL)
		expect(h.getTxReceipt.mock.calls[0]?.[0].toString()).toBe(HASH)
		expect(h.network.getNodeForUrl).not.toHaveBeenCalled()
		expect(h.network.getNode).not.toHaveBeenCalled()
	})

	test("a row with no recorded endpoint is written unconfirmed without a dial", async () => {
		const h = makeHarness([failedRow({ progress: { stage: "failed", from: "submitting", txHash: HASH } })])
		await h.check.start()
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "unconfirmed" }])
		expect(h.network.getSingleAttemptNodeForUrl).not.toHaveBeenCalled()
	})

	test("a row of another profile waits, undialed, until that profile is the unlocked one", async () => {
		const h = makeHarness([failedRow({ profileId: "p2" })])
		await h.check.start()
		await h.tick(3)
		expect(h.network.getSingleAttemptNodeForUrl).not.toHaveBeenCalled()
		h.unlock("p2")
		await h.tick()
		expect(h.network.getSingleAttemptNodeForUrl).toHaveBeenCalledTimes(1)
	})

	test("restart, locked, unlock, resume: nothing is dialed while locked, then the row is read at once", async () => {
		const h = makeHarness([failedRow({ terminalAt: T0 - 3 * 60_000, error: reaped })])
		h.lock()
		await h.check.start()
		await h.tick(4)
		expect(h.profile.captureExecutionFence).toHaveBeenCalledTimes(4)
		expect(h.network.getSingleAttemptNodeForUrl).not.toHaveBeenCalled()
		h.unlock()
		await h.tick()
		expect(h.network.getSingleAttemptNodeForUrl).toHaveBeenCalledTimes(1)
	})
})

describe("SendCheck: one guard on every dial and write", () => {
	test("a lock while the node is looked up: no receipt read, no write, no refresh", async () => {
		const h = makeHarness()
		h.getTxReceipt.mockResolvedValue(mined("proven"))
		const node = deferred<never>()
		h.network.getSingleAttemptNodeForUrl.mockImplementationOnce(() => node.promise)
		await h.check.start()
		await h.tick()
		h.lock()
		node.resolve({ getTxReceipt: h.getTxReceipt } as never)
		await h.tick(3)
		expect(h.network.getSingleAttemptNodeForUrl).toHaveBeenCalledTimes(1)
		expect(h.getTxReceipt).not.toHaveBeenCalled()
		expect(h.journal.writes).toEqual([])
		expect(h.balances.refreshAccountBalances).not.toHaveBeenCalled()
	})

	test("a lock while the receipt is read: its answer is dropped, no write, no refresh", async () => {
		const h = makeHarness()
		const receipt = deferred<unknown>()
		h.getTxReceipt.mockImplementationOnce(() => receipt.promise)
		await h.check.start()
		await h.tick()
		h.lock()
		receipt.resolve(mined("proven"))
		await h.tick(3)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(1)
		expect(h.journal.writes).toEqual([])
		expect(h.balances.refreshAccountBalances).not.toHaveBeenCalled()
	})

	test("a lock while the finalized block is read: the nullifier is never sent, nothing written", async () => {
		const h = makeHarness([unconfirmedRow()])
		h.clock.setNow(EXPIRES_AT + 1_000)
		const finalized = deferred<unknown>()
		h.getBlockData.mockImplementationOnce(() => finalized.promise)
		await h.check.start()
		await h.tick()
		h.lock()
		finalized.resolve(finalizedAt(EXPIRY.timestamp + 1))
		await h.tick(3)
		expect(h.getBlockData).toHaveBeenCalledTimes(1)
		expect(h.findLeavesIndexes).not.toHaveBeenCalled()
		expect(h.journal.writes).toEqual([])
	})

	test("a lock and an unlock while the write waits for the journal: written once, on the next live tick", async () => {
		const h = makeHarness()
		h.getTxReceipt.mockResolvedValue(mined("proven"))
		const release = h.journal.holdLock()
		await h.check.start()
		await h.tick()
		h.lock()
		h.unlock()
		release()
		await settle()
		expect(h.journal.writes).toEqual([])
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "sent" }])
		expect(h.balances.refreshAccountBalances).toHaveBeenCalledTimes(1)
		await h.tick(3)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(2)
	})

	test("stop() while the write waits for the journal: nothing written, nothing left watched", async () => {
		const h = makeHarness()
		h.getTxReceipt.mockResolvedValue(mined("proven"))
		const release = h.journal.holdLock()
		await h.check.start()
		await h.tick()
		h.check.stop()
		release()
		await h.tick(3)
		expect(h.journal.writes).toEqual([])
		expect(h.balances.refreshAccountBalances).not.toHaveBeenCalled()
		expect(h.getTxReceipt).toHaveBeenCalledTimes(1)
		expect(h.clock.pendingCount).toBe(0)
		expect(watched(h.check)).toBe(0)
	})

	test("a read that settles after stop() writes nothing", async () => {
		const h = makeHarness()
		const receipt = deferred<unknown>()
		h.getTxReceipt.mockImplementationOnce(() => receipt.promise)
		await h.check.start()
		await h.tick()
		expect(h.getTxReceipt).toHaveBeenCalledTimes(1)
		h.check.stop()
		receipt.resolve(mined("proven"))
		await settle()
		expect(h.journal.writes).toEqual([])
		expect(h.balances.refreshAccountBalances).not.toHaveBeenCalled()
	})

	test("a row deleted between reads is never dialed again", async () => {
		const h = makeHarness()
		await h.check.start()
		await h.tick()
		h.journal.remove("op-1")
		await h.tick(6)
		expect(h.network.getSingleAttemptNodeForUrl).toHaveBeenCalledTimes(1)
	})

	test("a row deleted while its node is looked up is not read", async () => {
		const h = makeHarness()
		const node = deferred<never>()
		h.network.getSingleAttemptNodeForUrl.mockImplementationOnce(() => node.promise)
		await h.check.start()
		await h.tick()
		expect(h.network.getSingleAttemptNodeForUrl).toHaveBeenCalledTimes(1)
		h.journal.remove("op-1")
		node.resolve({ getTxReceipt: h.getTxReceipt } as never)
		await settle()
		expect(h.getTxReceipt).not.toHaveBeenCalled()
	})

	test("a read slower than two ticks is never overlapped", async () => {
		const h = makeHarness()
		const receipt = deferred<unknown>()
		h.getTxReceipt.mockImplementationOnce(() => receipt.promise)
		await h.check.start()
		await h.tick(3)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(1)
		receipt.resolve(pending())
		await settle()
		await h.tick()
		expect(h.getTxReceipt).toHaveBeenCalledTimes(2)
	})
})

describe("SendCheck: which rows it watches", () => {
	test("start() resumes the unanswered rows only: one inside its window, due at once, and one past it for its last read", async () => {
		const inside = failedRow({ id: "inside", terminalAt: T0 - 10 * 60_000, error: reaped })
		const past = failedRow({
			id: "past",
			terminalAt: T0 - 40 * 60_000,
			progress: { stage: "failed", from: "submitting", txHash: OTHER_HASH, submittedEndpointUrl: URL },
		})
		const answered = failedRow({
			id: "answered",
			progress: { stage: "failed", from: "submitting", txHash: HASH, submittedEndpointUrl: URL, check: "sent" },
		})
		const neverSent = failedRow({ id: "never-sent", progress: { stage: "failed", from: "proving" } })
		const h = makeHarness([inside, past, answered, neverSent])
		h.getTxReceipt.mockImplementation(async () => dropped())
		await h.check.start()
		await h.tick()
		expect(h.getTxReceipt.mock.calls.map(([hash]) => hash.toString()).sort()).toEqual([HASH, OTHER_HASH].sort())
		expect(h.journal.writes).toEqual([{ id: "past", check: "unconfirmed" }])
	})

	test("a row the reaper fails at submitting after start() is watched", async () => {
		const h = makeHarness([])
		await h.check.start()
		h.journal.put(failedRow({ error: reaped }))
		await h.tick()
		expect(h.network.getSingleAttemptNodeForUrl).toHaveBeenCalledWith(URL)
	})
})

describe("SendCheck: an expiry the finalized chain has passed", () => {
	test("an unconfirmed row is read only once the device clock passes its expiry, then waits out the chain's lag", async () => {
		const h = makeHarness([unconfirmedRow()])
		h.clock.setNow(EXPIRES_AT - 2 * SEND_CHECK_TICK_MS)
		h.getBlockData.mockResolvedValue(finalizedAt(EXPIRY.timestamp - 100))
		await h.check.start()
		await h.tick()
		expect(h.getBlockData).not.toHaveBeenCalled()
		await h.tick()
		expect(h.getBlockData).toHaveBeenCalledWith("finalized")
		expect(h.findLeavesIndexes).not.toHaveBeenCalled()
		await h.tick(19)
		expect(h.getBlockData).toHaveBeenCalledTimes(1)
		await h.tick()
		expect(h.getBlockData).toHaveBeenCalledTimes(2)
		expect(h.journal.writes).toEqual([])
		expect(h.getTxReceipt).not.toHaveBeenCalled()
	})

	test("past it, with the nullifier absent at the finalized block: written expired once, nothing refreshed", async () => {
		const h = makeHarness([unconfirmedRow()])
		h.clock.setNow(EXPIRES_AT + 1_000)
		await h.check.start()
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "expired" }])
		expect(h.balances.refreshAccountBalances).not.toHaveBeenCalled()
		await h.tick(3)
		expect(h.getBlockData).toHaveBeenCalledTimes(1)
		expect(watched(h.check)).toBe(0)
	})

	/** Past the expiry with its nullifier spent: only the row's own receipt can say it went through. */
	const presentHarness = () => {
		const h = makeHarness([unconfirmedRow()])
		h.clock.setNow(EXPIRES_AT + 1_000)
		h.findLeavesIndexes.mockResolvedValue([{ data: 3n, l2BlockNumber: 4, l2BlockHash: finalizedAt(0).blockHash }])
		return h
	}

	test.each([
		["no mined receipt", pending()],
		["a reverted receipt", mined("proven", "reverted")],
	])("the nullifier present with %s writes nothing and ends the watch for this run", async (_label, receipt) => {
		const h = presentHarness()
		h.getTxReceipt.mockResolvedValue(receipt)
		await h.check.start()
		await h.tick(4)
		expect(h.journal.writes).toEqual([])
		expect(h.findLeavesIndexes).toHaveBeenCalledTimes(1)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(1)
		expect(watched(h.check)).toBe(0)
	})

	test("the nullifier present with a mined success receipt writes sent with its block and refreshes the account", async () => {
		const h = presentHarness()
		h.getTxReceipt.mockResolvedValue(mined("proven"))
		await h.check.start()
		await h.tick()
		expect(h.getTxReceipt.mock.calls[0]?.[0]?.toString()).toBe(HASH)
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "sent" }])
		expect((await h.journal.getOperation("op-1"))?.progress).toMatchObject({ check: "sent", inclusion: BLOCK })
		expect(h.balances.refreshAccountBalances).toHaveBeenCalledWith(ACCOUNT)
		expect(watched(h.check)).toBe(1)
	})

	test("a receipt read that throws writes nothing and keeps the slow watch; the next read that answers writes sent", async () => {
		const h = presentHarness()
		h.getTxReceipt.mockRejectedValueOnce(new Error(`no answer from ${URL}`)).mockResolvedValue(mined("proven"))
		await h.check.start()
		await h.tick()
		expect(h.journal.writes).toEqual([])
		expect(watched(h.check)).toBe(1)
		expect(JSON.stringify(h.logs)).not.toContain(URL)
		await h.tick(DROPPED_RECHECK_INTERVAL_MS / SEND_CHECK_TICK_MS - 1)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(1)
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "sent" }])
	})

	test("a lock while the post-expiry receipt is read: its answer is dropped, no write, no refresh", async () => {
		const h = presentHarness()
		const receipt = deferred<unknown>()
		h.getTxReceipt.mockImplementationOnce(() => receipt.promise)
		await h.check.start()
		await h.tick()
		h.lock()
		receipt.resolve(mined("proven"))
		await h.tick(3)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(1)
		expect(h.journal.writes).toEqual([])
		expect(h.balances.refreshAccountBalances).not.toHaveBeenCalled()
	})

	test.each([
		["a failed read", (h: ReturnType<typeof makeHarness>) => h.getBlockData.mockRejectedValueOnce(new Error(`no answer from ${URL}`))],
		["a malformed answer", (h: ReturnType<typeof makeHarness>) => h.findLeavesIndexes.mockResolvedValueOnce([])],
	])("%s writes nothing, logs no endpoint, and is read again on the slow cadence", async (_label, arrange) => {
		const h = makeHarness([unconfirmedRow()])
		h.clock.setNow(EXPIRES_AT + 1_000)
		arrange(h)
		await h.check.start()
		await h.tick()
		expect(h.journal.writes).toEqual([])
		expect(JSON.stringify(h.logs)).not.toContain(URL)
		await h.tick(DROPPED_RECHECK_INTERVAL_MS / SEND_CHECK_TICK_MS)
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "expired" }])
	})

	test("a row with no recorded expiry is never read for one", async () => {
		const h = makeHarness([unconfirmedRow(false)])
		h.clock.setNow(EXPIRES_AT + 1_000)
		await h.check.start()
		await h.tick(4)
		expect(h.getBlockData).not.toHaveBeenCalled()
		expect(h.journal.writes).toEqual([])
		expect(watched(h.check)).toBe(0)
	})

	test("an unanswered row past its expiry reads Unconfirmed at its last read, then expired: the write that re-announces it keeps it watched", async () => {
		const row = failedRow({
			terminalAt: T0 - DROPPED_RESURRECTION_WINDOW_MS,
			progress: { stage: "failed", from: "submitting", txHash: HASH, submittedEndpointUrl: URL, expiry: EXPIRY },
		})
		const h = makeHarness([row])
		h.clock.setNow(EXPIRES_AT + 1_000)
		h.getTxReceipt.mockResolvedValue(dropped())
		await h.check.start()
		await h.tick()
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "unconfirmed" }])
		expect(h.getBlockData).not.toHaveBeenCalled()
		await h.tick()
		expect(h.journal.writes).toEqual([
			{ id: "op-1", check: "unconfirmed" },
			{ id: "op-1", check: "expired" },
		])
	})
})

describe("SendCheck: a mined answer's block, until it is final", () => {
	const minedRow = (check: "sent" | "reverted" = "sent") =>
		failedRow({ progress: { stage: "failed", from: "submitting", txHash: HASH, submittedEndpointUrl: URL, check, inclusion: BLOCK } })

	test("a mined answer keeps its block, read on the finality cadence until final; a final row is never read again", async () => {
		const h = makeHarness()
		h.getTxReceipt.mockResolvedValue(mined("proposed"))
		await h.check.start()
		await h.tick()
		expect((await h.journal.getOperation("op-1"))?.progress).toMatchObject({ check: "sent", inclusion: BLOCK })
		await h.tick()
		expect(h.getBlockData).toHaveBeenCalledTimes(1)
		h.getBlockData.mockResolvedValue(finalizedAt(0, BLOCK.block))
		h.findLeavesIndexes.mockResolvedValue(archiveLeaf(BLOCK.block))
		await h.tick(11)
		expect(h.getBlockData).toHaveBeenCalledTimes(1)
		await h.tick()
		expect(h.journal.writes).toEqual([
			{ id: "op-1", check: "sent" },
			{ id: "op-1", check: "sent" },
		])
		expect((await h.journal.getOperation("op-1"))?.progress).toMatchObject({ check: "sent", inclusion: undefined })
		await h.tick(30)
		expect(h.getBlockData).toHaveBeenCalledTimes(2)
		expect(watched(h.check)).toBe(0)
		expect(h.balances.refreshAccountBalances).toHaveBeenCalledTimes(1)
	})

	test.each([
		["sent", "success"],
		["reverted", "reverted"],
	] as const)("%s: pruned, back to checking, included in another block, then final", async (check, result) => {
		const h = makeHarness([minedRow(check)])
		let receipt: unknown = pending()
		h.getTxReceipt.mockImplementation(async () => receipt)
		h.getBlockData.mockResolvedValue(finalizedAt(0, BLOCK.block))
		h.findLeavesIndexes.mockResolvedValue(archiveLeaf())
		await h.check.start()
		await h.tick()
		expect((await h.journal.getOperation("op-1"))?.progress).toMatchObject({ checkSince: h.clock.now() })
		expect(h.balances.refreshAccountBalances).toHaveBeenCalledTimes(1)

		receipt = mined("proposed", result, OTHER_BLOCK)
		await h.tick()
		expect((await h.journal.getOperation("op-1"))?.progress).toMatchObject({ check, inclusion: OTHER_BLOCK })

		h.getBlockData.mockResolvedValue(finalizedAt(0, OTHER_BLOCK.block))
		h.findLeavesIndexes.mockResolvedValue(archiveLeaf(OTHER_BLOCK.block))
		await h.tick()
		expect(h.journal.writes.map((w) => w.check)).toEqual([undefined, check, check])
		expect((await h.journal.getOperation("op-1"))?.progress).toEqual({
			stage: "failed",
			from: "submitting",
			txHash: HASH,
			submittedEndpointUrl: URL,
			check,
		})
	})

	test("a pruned row's window restarts at the prune: it reads Unconfirmed thirty minutes later, not before", async () => {
		const row = minedRow()
		const h = makeHarness([{ ...row, terminalAt: T0 - 60 * 60_000 }])
		h.getBlockData.mockResolvedValue(finalizedAt(0, BLOCK.block))
		h.findLeavesIndexes.mockResolvedValue(archiveLeaf())
		h.getTxReceipt.mockResolvedValue(dropped())
		await h.check.start()
		await h.tick()
		await h.tick((DROPPED_RESURRECTION_WINDOW_MS - 2 * SEND_CHECK_TICK_MS) / SEND_CHECK_TICK_MS)
		expect(h.journal.writes.map((w) => w.check)).toEqual([undefined])
		await h.tick(4)
		expect(h.journal.writes.map((w) => w.check)).toEqual([undefined, "unconfirmed"])
	})

	test("a receipt that still names the recorded block, as an upstream behind the prune answers, writes nothing", async () => {
		const h = makeHarness([minedRow()])
		h.getBlockData.mockResolvedValue(finalizedAt(0, BLOCK.block))
		h.findLeavesIndexes.mockResolvedValue(archiveLeaf())
		h.getTxReceipt.mockResolvedValue(mined("proposed"))
		await h.check.start()
		await h.tick(13)
		expect(h.journal.writes).toEqual([])
		expect(h.getBlockData).toHaveBeenCalledTimes(2)
	})

	test("a restart resumes every open row from the journal, and no closed one", async () => {
		const row = (id: string, progress: Partial<Extract<OperationRecord["progress"], { stage: "failed" }>>) =>
			failedRow({
				id,
				terminalAt: EXPIRES_AT,
				progress: { stage: "failed", from: "submitting", txHash: HASH, submittedEndpointUrl: URL, ...progress },
			})
		const h = makeHarness([
			row("unanswered", {}),
			row("expiring", { check: "unconfirmed", expiry: EXPIRY }),
			row("including", { check: "reverted", inclusion: BLOCK }),
			row("final", { check: "sent" }),
			row("expired", { check: "expired", expiry: EXPIRY }),
			row("unconfirmed", { check: "unconfirmed" }),
		])
		h.clock.setNow(EXPIRES_AT + 1_000)
		h.getBlockData.mockResolvedValue(finalizedAt(EXPIRY.timestamp - 100))
		await h.check.start()
		await h.tick(2)
		expect(watched(h.check)).toBe(3)
		expect(h.getTxReceipt).toHaveBeenCalledTimes(2)
		expect(h.getBlockData).toHaveBeenCalledTimes(2)
	})
})

describe("SendCheck: logging", () => {
	test("no log line, at any level, carries the hash or the endpoint", async () => {
		const h = makeHarness()
		h.getTxReceipt.mockRejectedValueOnce(new Error(`receipt for ${HASH} from ${URL} failed`))
		h.getTxReceipt.mockResolvedValueOnce(mined("proven"))
		await h.check.start()
		await h.tick(2)
		expect(h.journal.writes).toEqual([{ id: "op-1", check: "sent" }])
		expect(h.logs.length).toBeGreaterThan(0)
		const text = JSON.stringify(h.logs, (_key, value: unknown) => {
			if (value instanceof Error) return { message: value.message, stack: value.stack }
			return typeof value === "bigint" ? value.toString() : value
		})
		expect(text).not.toContain(HASH.slice(0, 10))
		expect(text).not.toContain(URL)
	})
})
