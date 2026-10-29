/**
 * Send ordering after a worker restart: a freshly started ExecutionService (its lane, sequencer and
 * transfer executor keep nothing across one) and the real journal, against a pending row that names
 * fee contract F. Every case stops before the build: no PXE call, no simulation, no proof; a dApp
 * send names no `opts.from`, so it fails right after its claim.
 */
import { describe, expect, test, vi } from "vitest"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { JobCancelledError, SessionEndedError } from "@nulo/extension-messaging/errors"
import { EventHandler } from "@nulo/wallet-core/utils"
import { type ExecutionFence, ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { FpcType } from "@/wallet/services/fpc/spec"
import { TransferType, TxStatus } from "@/wallet/services/transaction/service"
import { OriginType, TxExecutionResult } from "@/wallet/services/transaction/spec"
import type { PxeServiceClient } from "@/wallet/services/pxe/client"
import { NOOP_PROOF_GATE } from "@/e2e/proof-gate"
import { startExecutionGraph, waitFor } from "../../../../tests/helpers/execution-graph"
import type { ExecutionLane } from "./execution-lane"
import type { ExecutionMutex } from "./execution-mutex"
import type { FeeSettings } from "./models"
import type { SendSequencer } from "./send-sequencer"
import type { TransferExecutor } from "./transfer-executor"

const NETWORK = { id: "net1", chainId: 1, l1ChainId: 5, primaryEndpointId: "ep1", endpoints: [{ id: "ep1", rpcUrl: "http://fake" }] }
const ACCOUNT = AztecAddress.fromNumberUnsafe(0x1234).toString()
const F = AztecAddress.fromNumberUnsafe(0xf).toString()
const G = AztecAddress.fromNumberUnsafe(0x6).toString()
/** Hand-added sponsors: neither is the protocol one, so each may spend the payer's notes. */
const SPONSORS: Record<string, string> = { "fpc-f": F, "fpc-g": G }
const FENCE_SESSION = 1
const SLOT = `p1:${NETWORK.chainId}`
const ORIGIN_KEY = "https://dapp.example"
const DAPP = { type: OriginType.DAPP, name: "dapp" } as never
const ACCOUNT_2 = AztecAddress.fromNumberUnsafe(0x2222).toString()
const TOKEN_CONTRACT = AztecAddress.fromNumberUnsafe(0x7070).toString()

async function makeHarness() {
	const deletionState = new ProfileDeletionState()
	const session = { live: true, serial: FENCE_SESSION }
	const fenceLive = (fence: ExecutionFence) => session.live && fence.profileId === "p1" && fence.session === FENCE_SESSION
	const captureExecutionFence = async (): Promise<ExecutionFence> => ({
		profileId: "p1",
		epoch: deletionState.capture("p1"),
		session: FENCE_SESSION,
	})
	const getPXE = vi.fn()
	const pxeClient = { getPXE, onProvePhase: { add: () => {} } } as unknown as PxeServiceClient
	// Submitted before the restart, still unmined: it spends another token, through F.
	const pendingRow = {
		hash: "0xprev",
		chainId: NETWORK.chainId,
		account: ACCOUNT,
		calls: [
			{
				contract: "0xother",
				method: "transfer_public_to_public",
				args: [],
				transfers: [{ type: TransferType.Public, from: ACCOUNT, to: "0xbob" }],
			},
		],
		createdAt: Date.now(),
		status: TxStatus.Pending,
		feeSpender: F,
	}
	const pending = [pendingRow]

	const { service, journal } = await startExecutionGraph(
		{
			profile: {
				getActiveProfile: async () => ({ id: "p1" }),
				getProfiles: async () => [{ id: "p1" }],
				getDeletionState: () => deletionState,
				captureExecutionFence,
				assertFence: async () => {
					if (!session.live) throw new SessionEndedError()
				},
				isFenceLive: fenceLive,
				peekLiveSerial: () => session.serial,
				setExpiryDeferral: () => {},
				onActiveProfileChanged: new EventHandler<unknown>(),
			},
			network: { getNetwork: async () => NETWORK, getNode: async () => ({}) },
			transactions: {
				getPendingForAccount: (account: string) => pending.filter((row) => row.account.toLowerCase() === account.toLowerCase()),
				// One mined tx: the account is initialized, so a public send here holds only its fee contract.
				transactionsOf: async () => [
					{ chainId: NETWORK.chainId, status: TxStatus.Proposed, executionResult: TxExecutionResult.Success, calls: [] },
					pendingRow,
				],
				addTransaction: vi.fn(),
				onTransactionUpdated: { add: () => {} },
			},
			token: { getTokenRaw: async () => ({ contract: TOKEN_CONTRACT }) },
			fpc: {
				onFpcUpdated: { add: () => {} },
				onFpcDeleted: { add: () => {} },
				getFpcImpl: async (id: string) => ({
					infoData: {
						id,
						profileId: "p1",
						chainId: NETWORK.chainId,
						type: FpcType.DefaultSponsoredFpc,
						address: SPONSORS[id],
						isProtocol: false,
					},
				}),
			},
			task: { startNewTask: () => ({ complete: vi.fn(), fail: vi.fn(), cancel: vi.fn() }) },
		},
		NOOP_PROOF_GATE,
		pxeClient,
	)
	const stages: string[] = []
	journal.onOperationUpdated.add((rec) => stages.push(rec.progress.stage))
	// Stage changes only: a waiting record's heartbeat touch re-emits its stage.
	const byId: [string, string][] = []
	const lastStage = new Map<string, string>()
	journal.onOperationUpdated.add((rec) => {
		if (lastStage.get(rec.id) === rec.progress.stage) return
		lastStage.set(rec.id, rec.progress.stage)
		byId.push([rec.id, rec.progress.stage])
	})

	const internals = service as unknown as { transferExecutor: TransferExecutor; sendSequencer: SendSequencer; lane: ExecutionLane }
	const lane = internals.lane
	const mutex = (lane as unknown as { executionMutex: ExecutionMutex }).executionMutex as unknown as {
		tails: Map<string, Promise<void>>
		laneDepth: Map<string, number>
		originDepth: Map<string, number>
	}
	const fence = await captureExecutionFence()
	return {
		service,
		journal,
		stages,
		byId,
		lastStage,
		getPXE,
		internals,
		lane,
		pending,
		pendingRow,
		session,
		fence,
		takeSlot: () => lane.acquireSlot(NETWORK.id, undefined, fence),
		tail: () => mutex.tails.get(SLOT),
		depth: (originKey = ORIGIN_KEY) => ({
			lane: mutex.laneDepth.get(SLOT) ?? 0,
			origin: mutex.originDepth.get(`${SLOT}|${originKey}`) ?? 0,
		}),
		controllers: () => (lane as unknown as { activeControllers: Map<string, unknown> }).activeControllers,
	}
}

const request = (fpcId: string) => {
	const feeSettings: FeeSettings = { paymentMethod: { kind: "fpc", fpcId } }
	return {
		networkId: NETWORK.id,
		accountAddress: ACCOUNT,
		tokenId: 1,
		tokenContract: TOKEN_CONTRACT,
		transferType: TransferType.Public,
		recipientAddress: AztecAddress.fromNumberUnsafe(0x5678).toString(),
		amount: 10n,
		feeSettings,
	}
}

describe("send ordering composition: a restarted worker still orders by the recorded fee spender", () => {
	test("a transfer through the pending row's fee contract starts queued, is never claimed while that row is pending, and a cancel ends it without the PXE", async () => {
		const h = await makeHarness()
		const r = request("fpc-f")
		const run = h.service
			.executeTransfer(
				r.networkId,
				r.accountAddress,
				r.tokenId,
				r.tokenContract,
				r.transferType,
				r.recipientAddress,
				r.amount,
				r.feeSettings,
			)
			.catch((e: unknown) => e)
		let id = ""
		await waitFor(async () => {
			id = (await h.journal.getOperations({ profileId: "p1" }))[0]?.id ?? ""
			return id !== ""
		})
		expect((await h.journal.getOperation(id))?.progress.stage).toBe("queued")
		// Past two of the sequencer's polls: the row is still pending, so the send is still waiting.
		await new Promise((r) => setTimeout(r, 1_200))
		expect((await h.journal.getOperation(id))?.progress.stage).toBe("queued")

		await h.service.cancelJob(id)
		expect(await run).toBeInstanceOf(JobCancelledError)
		expect((await h.journal.getOperation(id))?.progress.stage).toBe("cancelled")
		expect(h.stages).not.toContain("pending")
		expect(h.stages).not.toContain("simulating")
		expect(h.getPXE).not.toHaveBeenCalled()
	})

	test("the same graph answers an estimate through F as queued, and holds nothing against a send through G", async () => {
		const h = await makeHarness()
		const f = request("fpc-f")
		expect(
			await h.service.estimateTransferFee(
				f.networkId,
				f.accountAddress,
				f.tokenId,
				f.tokenContract,
				f.transferType,
				f.recipientAddress,
				f.amount,
				f.feeSettings,
			),
		).toEqual({ queued: true, tokenSpent: false })
		const onG = await h.internals.transferExecutor.sequence(request("fpc-g"), "p1")
		expect([...onG.keys]).toEqual([`fpc:${G.toLowerCase()}`])
		expect(h.internals.sendSequencer.isBlocked(onG.scope, onG.keys)).toBe(false)
		expect(h.getPXE).not.toHaveBeenCalled()
	})
})

type Harness = Awaited<ReturnType<typeof makeHarness>>

const queuedRecord = async (h: Harness, initial: "queued" | "pending" = "queued") => {
	const { id } = await h.journal.createOperation({
		kind: "dapp_execute",
		origin: "dapp",
		profileId: "p1",
		sessionId: "sess-1",
		initialStage: { stage: "queued" },
	})
	h.lastStage.set(id, "queued")
	if (initial === "pending") await h.journal.transitionOperation(id, { stage: "pending" })
	return id
}

const dappSend = (h: Harness, queuedJournalId: string, account = ACCOUNT, originKey = ORIGIN_KEY) =>
	h.service.executeOperations(
		[
			{
				kind: "aztec_sendTx",
				networkId: NETWORK.id,
				accountAddress: account,
				feeSettings: { paymentMethod: { kind: "fpc" } },
			} as never,
		],
		DAPP,
		undefined,
		{ queuedJournalId, originKey },
		undefined,
		h.fence,
	)

const stagesOf = (h: Harness, id: string) => h.byId.filter(([rid]) => rid === id).map(([, stage]) => stage)
const claimOrder = (h: Harness) => h.byId.filter(([, stage]) => stage === "pending").map(([id]) => id)
const CLAIMED_THEN_FAILED = [expect.objectContaining({ status: "failed" })]

/** Starts a dApp send behind the pending row and resolves once it has given the slot back. */
async function parkedSend(h: Harness, initial: "queued" | "pending" = "queued") {
	const id = await queuedRecord(h, initial)
	const run = dappSend(h, id)
	// Admitted, so the holder below enqueues behind it and is granted only once the send has parked.
	await waitFor(() => h.depth().origin === 1)
	;(await h.takeSlot()).release()
	return { id, run }
}

describe("send ordering composition: a dApp send waits outside the slot for the account's earlier sends", () => {
	test("its record stays queued while the row is pending, a second park keeps its one place, and it is claimed once", async () => {
		const h = await makeHarness()
		const id = await queuedRecord(h)
		const run = dappSend(h, id)
		await waitFor(() => h.depth().origin === 1)
		let holder = await h.takeSlot()
		expect(h.depth()).toEqual({ lane: 2, origin: 1 })
		await new Promise((r) => setTimeout(r, 1_200))
		expect(stagesOf(h, id)).toEqual([])

		// The row settles while the slot is held: the send's wait ends and it re-enters behind the holder.
		const behindHolder = h.tail()
		h.pending.length = 0
		await waitFor(() => h.tail() !== behindHolder)
		// Another send of the account goes out before the holder lets go: back under the slot, it parks again.
		h.pending.push({ ...h.pendingRow, hash: "0xnext" })
		holder.release()
		holder = await h.takeSlot()
		expect(h.depth()).toEqual({ lane: 2, origin: 1 })
		expect(stagesOf(h, id)).toEqual([])

		h.pending.length = 0
		holder.release()
		expect(await run).toEqual(CLAIMED_THEN_FAILED)
		expect(stagesOf(h, id)).toEqual(["pending", "failed"])
		expect(h.depth()).toEqual({ lane: 0, origin: 0 })
		expect(h.getPXE).not.toHaveBeenCalled()
	}, 15_000)

	test("a silent-path record reads queued while it waits, and its claim takes it back", async () => {
		const h = await makeHarness()
		const { id, run } = await parkedSend(h, "pending")
		// Nothing orders the record's `queued` write before the slot's hand-on.
		await waitFor(async () => (await h.journal.getOperation(id))?.progress.stage === "queued")
		h.pending.length = 0
		expect(await run).toEqual(CLAIMED_THEN_FAILED)
		expect(stagesOf(h, id)).toEqual(["pending", "queued", "pending", "failed"])
	}, 15_000)

	test("a cancel while parked ends it cancelled, with its controller gone and its place given back", async () => {
		const h = await makeHarness()
		const { id, run } = await parkedSend(h)
		await h.service.cancelJob(id)
		expect(await run).toEqual([expect.objectContaining({ status: "cancelled" })])
		expect(stagesOf(h, id)).toEqual(["cancelled"])
		expect(h.controllers().has(id)).toBe(false)
		expect(h.depth()).toEqual({ lane: 0, origin: 0 })
	}, 15_000)

	test("a session end while parked ends it once: cancelled by the sweep, or session_ended at the fence", async () => {
		const swept = await makeHarness()
		const first = await parkedSend(swept)
		swept.session.live = false
		swept.session.serial += 1
		await swept.lane.abandonDeadSessions()
		expect(await first.run).toEqual([expect.objectContaining({ status: "cancelled" })])
		expect(stagesOf(swept, first.id)).toEqual(["cancelled"])
		expect(swept.depth()).toEqual({ lane: 0, origin: 0 })

		const fenced = await makeHarness()
		const second = await parkedSend(fenced)
		fenced.session.live = false
		fenced.pending.length = 0
		expect(await second.run).toEqual([expect.objectContaining({ status: "failed", code: "SESSION_ENDED" })])
		fenced.session.serial += 1
		await fenced.lane.abandonDeadSessions()
		const record = await fenced.journal.getOperation(second.id)
		expect({ stages: stagesOf(fenced, second.id), kind: record?.error?.kind }).toEqual({ stages: ["failed"], kind: "session_ended" })
		expect(fenced.depth()).toEqual({ lane: 0, origin: 0 })
	}, 15_000)

	test("eight parked sends and a holder refuse an origin's ninth; the eight are then claimed once each, in order", async () => {
		const h = await makeHarness()
		const ids: string[] = []
		const runs: ReturnType<typeof dappSend>[] = []
		for (let i = 0; i < 8; i++) {
			ids.push(await queuedRecord(h))
			runs.push(dappSend(h, ids[i]))
		}
		await waitFor(() => h.depth().origin === 8)
		const holder = await h.takeSlot()
		const ninth = await queuedRecord(h)
		expect(await dappSend(h, ninth)).toEqual([expect.objectContaining({ status: "failed", code: "TOO_MANY_PENDING" })])
		expect(stagesOf(h, ninth)).toEqual(["failed"])

		h.pending.length = 0
		holder.release()
		for (const run of runs) expect(await run).toEqual(CLAIMED_THEN_FAILED)
		expect(claimOrder(h)).toEqual(ids)
		expect(h.depth()).toEqual({ lane: 0, origin: 0 })
	}, 15_000)

	test("an origin's later send of another account waits for its earlier one; another origin's does not", async () => {
		const h = await makeHarness()
		const { id: first, run: firstRun } = await parkedSend(h)
		const later = await queuedRecord(h)
		const laterRun = dappSend(h, later, ACCOUNT_2)
		const elsewhere = await queuedRecord(h)
		expect(await dappSend(h, elsewhere, ACCOUNT_2, "https://other.example")).toEqual(CLAIMED_THEN_FAILED)
		expect(stagesOf(h, later)).toEqual([])

		h.pending.length = 0
		expect(await firstRun).toEqual(CLAIMED_THEN_FAILED)
		expect(await laterRun).toEqual(CLAIMED_THEN_FAILED)
		expect(claimOrder(h)).toEqual([elsewhere, first, later])
	}, 15_000)
})
