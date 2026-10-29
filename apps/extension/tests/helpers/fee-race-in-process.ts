/**
 * The fee-race catalog (`fee-race/model.ts`) driven in process, judged by four oracles.
 *
 * The popup side is the popup's own code: the estimate engine's two adapters, `estimateWhenClear`,
 * the window's `holdsConfirm` and approval deltas, and Send's fee gate. The worker side is the
 * execution graph (`execution-graph.ts`): the slot, the sequencer, the estimate registry, the reuse
 * caches, the preview snapshots and their claim, and the journal, with the proof gate and the node
 * faked. A simulation cannot run here, so the seams one sits behind answer canned values and
 * nothing asserts what one holds: the service's fee-strategy dispatch, the transfer's operation
 * builder (its selector derivation needs bb), and a default-entrypoint request's build, discovery
 * and sizing. The PXE fake is the cancel spike's, `proveTx` alone. Every estimate run parks at its
 * start until a step lands or fails it; it holds the slot of its chain meanwhile, as a simulation
 * does.
 *
 * - O1: a press the popup allowed names the snapshot of its operation's latest landed estimate (or
 *   none, after a failed one), meets that snapshot at its turn, and ends sent unless the person
 *   locked or cancelled since.
 * - O2: the popup never fails an estimate the worker answered queued, and once nothing holds the
 *   slot or the sequence every open surface's estimate has been granted.
 * - O3: the slot grants in arrival order; every journal row moves along the job table.
 * - O4: once every hold is released, the node's submissions, the journal's sent rows and the strip's
 *   transactions name the same hashes, and a send cancelled before its submit names none.
 */
import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { BlockNumber } from "@aztec-labs/foundation/branded-types"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { Gas, GasFees, GasSettings } from "@aztec-labs/stdlib/gas"
import { BlockHeader, GlobalVariables } from "@aztec-labs/stdlib/tx"
import { canTransition } from "@nulo/wallet-core/jobs"
import { EventHandler } from "@nulo/wallet-core/utils"
import { vi } from "vitest"
import { computed, effectScope, ref, shallowRef, watch } from "vue"
import { useFeeEstimation } from "@/composables/useFeeEstimation"
import { useFeeEstimationMap } from "@/composables/useFeeEstimationMap"
import { feePayerOf } from "@/popup/components/modules/send/fee-helpers"
import { feeAllowsSend, queueModeOf, type SendFeeState, sendFeeHandoff } from "@/popup/pages/send-fee-gate"
import { approvalDeltas } from "@/popup/windows/execute/approval-deltas"
import { type FeePayerPick, holdsConfirm } from "@/popup/windows/execute/fee-figure"
import type { DraftUIOperation } from "@/popup/windows/execute/types"
import { EstimateRequeue, estimateWhenClear } from "@/utils/estimate-when-clear"
import { applyFeeSelection } from "@/wallet/services/dapp-interaction/approval-delta"
import { feeMultiplierFor, reuseCapRule } from "@/wallet/services/execution/estimate-reuse-shared"
import { feeCapFor } from "@/wallet/services/execution/fee/fee-cap"
import type { FeeSettings, OperationAuthwitPreview, TransferFeeEstimate } from "@/wallet/services/execution/models"
import type { ExecutionService } from "@/wallet/services/execution/service"
import type { TransferFeeQueued } from "@/wallet/services/execution/spec"
import { PRIVATE_FPC_ADDRESS } from "@/wallet/services/fpc/private-fpc-address"
import { fpcIdentityOf, type FpcInfo } from "@/wallet/services/fpc/spec"
import type { OperationRecord } from "@/wallet/services/operation-journal/service"
import { type ExecutionFence, ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { SessionEndedError } from "@nulo/extension-messaging/errors"
import type { PxeServiceClient } from "@/wallet/services/pxe/client"
import { TransferType } from "@/wallet/services/transaction/service"
import { trackSubtleCrypto } from "@/wallet/storage/sealed-entity-storage.testing"
import { OriginType, TxExecutionResult, TxStatus } from "@/wallet/services/transaction/spec"
import type { ProofGate } from "@/e2e/proof-gate"
import { startExecutionGraph } from "./execution-graph"
import type { ActionName, ActionParams, Method, OpRef, Outcome, PickedMethod, Plan, PlannedStep, Surface, Timing } from "./fee-race/model"

export type OracleId = "O1" | "O2" | "O3" | "O4" | "catalog" | "driver"
export interface Violation {
	oracle: OracleId
	message: string
}

/** A fault a break fixture injects at one seam, to show the oracle that reads it can fail. */
export interface Faults {
	/** The window's rule reads an estimate in flight as settled. */
	ruleIgnoresInFlight?: boolean
	/** A snapshot is gone at its turn once older than the reuse bound, as a 120 s sweep would leave it. */
	snapshotSweepAt120s?: boolean
	/** The popup fails an estimate the worker answered queued. */
	popupFailsQueued?: boolean
	/** The first request that arrives behind a waiting one is granted at once. */
	laneSkipsLine?: boolean
	/** The first queued row is reported at `submitting`, a stage it never took. */
	journalSkipsStage?: boolean
	/** The strip loses the first transaction recorded. */
	stripDropsRow?: boolean
	/** The worker drops the person's cancel of their own send. */
	cancelIgnored?: boolean
}

/** A press as the oracles and the coverage read it. */
export interface PressFact {
	ref: OpRef
	surface: Surface
	method: Method
	timing: Timing
	/** The operation's latest estimate when the press went out. */
	estimate: "landed" | "running" | "queued" | "failed"
	/** Sends pressed earlier and still in flight. */
	ahead: number
	/** How the send ended, by the run's end: on the node, at a rebuild (outside this layer), by the
	 *  person's lock or cancel, or not at all. */
	end?: "sent" | "rebuild" | "ended" | "failed" | "open"
}

export interface StepReport {
	index: number
	action: ActionName
	params: unknown
	outcome?: Outcome
	violations: Violation[]
}

export interface RaceReport {
	steps: StepReport[]
	/** The first step with a violation, or the run's end when only the finale found one. */
	red?: StepReport
	presses: PressFact[]
}

export const ACCOUNT = AztecAddress.fromNumberUnsafe(0x1234)
const TOKEN_CONTRACT = AztecAddress.fromNumberUnsafe(0x7070).toString()
const RECIPIENT = AztecAddress.fromNumberUnsafe(0x5678).toString()
const APP_FPC = AztecAddress.fromNumberUnsafe(0x9999)
const DAPP_ORIGIN = "https://dapp.test"
const MIN_FEES = new GasFees(1n, 1n)
const NETWORK = {
	id: "net1",
	// The node's pair below: (5 ^ 4) >>> 0 === 1.
	chainId: 1,
	l1ChainId: 5,
	primaryEndpointId: "ep1",
	endpoints: [{ id: "ep1", rpcUrl: "http://fake" }],
}
const fpcRow = (id: string, type: number, address: string): FpcInfo =>
	({ id, type, isProtocol: true, chainId: NETWORK.chainId, address, profileId: "p1" }) as FpcInfo
const SPONSOR = fpcRow("fpc-1", 1, AztecAddress.fromNumberUnsafe(0x5050).toString())
const PRIVATE = fpcRow("fpc-2", 2, PRIVATE_FPC_ADDRESS)
const FPCS: Record<string, FpcInfo> = { [SPONSOR.id]: SPONSOR, [PRIVATE.id]: PRIVATE }

const FEE_SETTINGS: Record<Method, FeeSettings> = {
	sponsor: { paymentMethod: { kind: "fpc", fpcId: SPONSOR.id } },
	private_fpc: { paymentMethod: { kind: "fpc", fpcId: PRIVATE.id } },
	fee_juice: { paymentMethod: { kind: "fj" } },
	app: { paymentMethod: { kind: "embedded" } } as FeeSettings,
	no_from: { paymentMethod: { kind: "embedded" } } as FeeSettings,
}
const WINDOW_PAYER: Record<PickedMethod, FeePayerPick> = {
	sponsor: { type: "fpc" },
	fee_juice: { type: "fj" },
	private_fpc: { type: "private_fpc" },
}
const SEND_PAYER: Record<PickedMethod, { type: "fj" | "private_fpc" | "fpc"; isProtocol?: boolean }> = {
	sponsor: { type: "fpc", isProtocol: true },
	fee_juice: { type: "fj" },
	private_fpc: { type: "private_fpc" },
}

/** No event for this long and the run has settled; every poll the run makes is shorter. */
const QUIET_MS = 25
const SETTLE_MAX_MS = 5_000
const POLL_MS = 3
const STEP_PAST_REUSE_MS = 121_000
const STEP_PAST_WINDOW_MS = 10 * 60_000 + 1_000

class DriverError extends Error {}

/** A confirm that has to rebuild reached the layer's edge: a rebuild simulates. */
export class RebuildOutOfLayer extends Error {
	public constructor() {
		super("a rebuild needs a simulation, outside this layer")
		this.name = "RebuildOutOfLayer"
	}
}

/** Carried by the PXE fake as live data; the build's test-only marker check fails a bundle holding it. */
export const FEE_RACE_PXE_FAKE_BUNDLE_MARKER = "FEE_RACE_PXE_FAKE_BUNDLE_MARKER"

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const fastSleep = (_ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, 1)
		signal?.addEventListener("abort", () => {
			clearTimeout(timer)
			resolve()
		})
	})

/** A proof gate that holds every proof, releasing them oldest first. */
function proofQueue() {
	const waiting: Array<() => void> = []
	const gate: ProofGate = { wait: () => new Promise<void>((resolve) => waiting.push(resolve)) }
	return { gate, held: () => waiting.length, release: () => waiting.shift()?.() }
}

type Row = Record<string, unknown> & { hash: string; status: TxStatus; account: string; createdAt: number }

interface ParkedRun {
	decide: (verdict: "land" | "fail") => void
}

/** One estimate attempt as the popup made it. */
interface RunRecord {
	answers: Array<"queued" | "result" | "error">
	started: boolean
	state: "asking" | "landed" | "failed"
	ids?: { estimateId?: string; previewId?: string }
}

interface PressRecord {
	fact: PressFact
	/** The ids the press named; a Send queued behind another send names its cap, or nothing when
	 *  Nulo's sponsor pays, and is held to that. */
	named: { estimateId?: string; previewId?: string; feeCap?: string; queued?: boolean }
	/** A lock or a cancel of this send came after the press. */
	endedByPerson: boolean
	end?: { ok: true } | { ok: false; error: unknown }
	journalId?: string
	judged: boolean
}

interface SurfaceBase {
	ref: OpRef
	surface: Surface
	method: Method
	open: boolean
	runs: RunRecord[]
	/** The rule's answer right now: may the person press. */
	allows: () => boolean
	press: (timing: Timing) => Outcome
	close: () => void
	schedule: (method?: PickedMethod) => void
	press$?: PressRecord
}

type Race = Awaited<ReturnType<typeof startRace>>

async function startRace(faults: Faults, crypto: ReturnType<typeof trackSubtleCrypto>) {
	let activity = 0
	const bump = () => {
		activity++
	}
	const violations: Violation[] = []
	const red = (oracle: OracleId, message: string) => violations.push({ oracle, message })

	// The session: every unlock starts a new one, as a lock and re-unlock does.
	const deletion = new ProfileDeletionState()
	let serial = 1
	let live: { profileId: string; serial: number } | undefined = { profileId: "p1", serial }
	const profileChanged = new EventHandler<unknown>()
	const captureExecutionFence = async (): Promise<ExecutionFence> => {
		if (!live) throw new SessionEndedError()
		return { profileId: live.profileId, epoch: deletion.capture(live.profileId), session: live.serial }
	}
	const isFenceLive = (fence: ExecutionFence) =>
		live?.serial === fence.session && live.profileId === fence.profileId && deletion.isCurrent(fence.profileId, fence.epoch)

	// The node and the strip.
	let tip = 10
	let proofs = 0
	const submitted: string[] = []
	const anchorBlockHeader = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(5) }) })
	const provenTx = (hash: string) => ({
		getTxHash: () => ({ toString: (): string => hash }),
		data: { constants: { anchorBlockHeader }, expirationTimestamp: 1_750_003_600n, getNonEmptyNullifiers: () => [new Fr(2n)] },
	})
	const node = {
		getCurrentMinFees: async () => MIN_FEES,
		getNodeInfo: async () => ({ l1ChainId: 5, rollupVersion: 4 }),
		sendTx: async (tx: { getTxHash(): { toString(): string } }) => {
			submitted.push(tx.getTxHash().toString())
			bump()
		},
		getTxReceipt: async () => ({ status: "pending" }),
	}
	// As the cancel spike's: `proveTx` alone. Nothing asserts what a proof holds; O4 follows the hash
	// each one mints as an id.
	const pxe = {
		proveTx: async () => {
			const hash = `0x${(++proofs).toString(16).padStart(64, "0")}`
			return { publicInputs: { constants: { anchorBlockHeader } }, getOffchainEffects: () => [], toTx: async () => provenTx(hash) }
		},
	}
	const pxeClient = {
		marker: FEE_RACE_PXE_FAKE_BUNDLE_MARKER,
		getPXE: () => pxe,
		onProvePhase: { add: () => {} },
		offscreenSettled: async () => {},
	} as unknown as PxeServiceClient

	const rows: Row[] = []
	let dropped = false
	const txUpdated = new EventHandler<Row>()
	const baseline = {
		hash: "0xbase",
		chainId: NETWORK.chainId,
		status: TxStatus.Proposed,
		executionResult: TxExecutionResult.Success,
		calls: [],
	}

	// Stored requests the windows estimate and approve, by interaction id.
	const stored = new Map<string, { draft: Record<string, unknown>; open: boolean }>()
	const task = () => {
		const t = { complete: () => {}, completeIfTracked: () => {}, fail: () => {}, cancel: () => {}, startSubtask: () => t }
		return t
	}

	const proof = proofQueue()
	const graph = await startExecutionGraph(
		{
			profile: {
				getActiveProfile: async () => (live ? { id: live.profileId } : undefined),
				getProfiles: async () => [{ id: "p1" }],
				getDeletionState: () => deletion,
				captureExecutionFence,
				assertFence: async (fence: ExecutionFence) => {
					if (!isFenceLive(fence)) throw new SessionEndedError()
				},
				isFenceLive,
				peekLiveSerial: () => live?.serial,
				setExpiryDeferral: () => {},
				onActiveProfileChanged: profileChanged,
			},
			network: {
				getNetwork: async () => NETWORK,
				getNode: async () => node,
				readChainTip: async () => tip,
			},
			account: { getAccountContract: async () => ({ address: ACCOUNT }) },
			transactions: {
				getPendingForAccount: (account: string) =>
					rows.filter((r) => r.status === TxStatus.Pending && r.account.toLowerCase() === account.toLowerCase()),
				transactionsOf: async () => [baseline, ...rows],
				addTransaction: async (input: Record<string, unknown>) => {
					bump()
					if (faults.stripDropsRow && !dropped) {
						dropped = true
						return
					}
					rows.push({ ...input, status: TxStatus.Pending, createdAt: Date.now() } as Row)
				},
				onTransactionUpdated: txUpdated,
			},
			token: { getTokenRaw: async () => ({ contract: TOKEN_CONTRACT, name: "Tok", symbol: "TOK", decimals: 18 }) },
			fpc: {
				onFpcUpdated: { add: () => {} },
				onFpcDeleted: { add: () => {} },
				getFpc: async (id: string) => ({ ...FPCS[id] }),
				getFpcImpl: async (id: string) => ({ infoData: { ...FPCS[id] } }),
				getOrComputeProtocolAddresses: async () => ({ sponsored: SPONSOR.address, private: PRIVATE.address }),
			},
			authRegistry: { assertWithinCap: async () => {}, recordPendingAuthwits: async () => {} },
			task: { startNewTask: task },
			price: { getUsableQuote: async () => undefined },
			dappInteraction: {
				materializeStoredOperation: async (interactionId: string, _index: number, feeSettings: FeeSettings | undefined) => {
					const request = stored.get(interactionId)
					if (!request?.open) throw new Error("Interaction not found")
					return applyFeeSelection(request.draft as never, feeSettings)
				},
				refusalOf: () => undefined,
				recordRefusal: () => {},
				askFeeAgain: async () => false,
			},
		},
		proof.gate,
		pxeClient,
	)
	const { service, journal, internals } = graph
	const raw = service as unknown as Record<string, Record<string, unknown>>

	// The sequencer's and the chain tip's own waits poll; here they poll at once.
	;(raw.sendSequencer.deps as { sleep: unknown }).sleep = fastSleep
	;(raw.chainTipGate.deps as { sleep: unknown }).sleep = fastSleep
	if (faults.cancelIgnored) (service as unknown as { cancelJob: () => Promise<void> }).cancelJob = async () => {}

	// An estimate's run is the worker's own code from its admission to its stash; the one call in it
	// that simulates answers canned data: the fee strategy's build, the transfer's operation (its
	// selector derivation needs bb), a default-entrypoint request's build and discovery. Builds run
	// only under the slot, so one outside an estimate's run is a confirm rebuilding: that needs a real
	// simulation, so it stops there, past its snapshot lookup (a default-entrypoint confirm builds
	// before it looks its snapshot up, so it stops short of it).
	let inEstimateRun = 0
	const underRun =
		<A extends unknown[], R>(canned: (...args: A) => Promise<R> | R) =>
		async (...args: A): Promise<R> => {
			if (inEstimateRun === 0) throw new RebuildOutOfLayer()
			return canned(...args)
		}
	let nonce = 0
	const cannedBuild = async (feeSettings: FeeSettings) => {
		const method = feeSettings.paymentMethod
		const row = method.kind === "fpc" ? FPCS[method.fpcId] : undefined
		const identity = row ? fpcIdentityOf(row) : undefined
		const cap = await feeCapFor(node as never, reuseCapRule(method, identity, feeMultiplierFor(feeSettings.priorityLevel)))
		return {
			txRequest: {
				txContext: { gasSettings: new GasSettings(new Gas(100, 200), new Gas(10, 20), cap, GasFees.empty()) },
				authWitnesses: [],
			},
			node,
			pxe,
			account: { address: ACCOUNT },
			network: NETWORK,
			chainIdentity: { l1ChainId: 5, rollupVersion: 4 },
			nonce: new Fr(BigInt(++nonce)),
			// The fee strategy puts the paying contract's fee call first in the request's calls.
			txCalls: row ? [{ contract: row.address, method: "pay_fee", args: [] }] : [],
			pendingPublicAuthwits: [],
			txsLimits: new Gas(1_000_000, 1_000_000),
			initializesAccount: false,
			feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
			...(identity ? { fpcIdentity: identity } : {}),
		}
	}
	raw.buildAndEstimateTxRequest = underRun((_op: unknown, feeSettings: FeeSettings) => cannedBuild(feeSettings)) as never
	;(raw.planner as Record<string, unknown>).buildTransferOperation = underRun(
		(req: { networkId: string; accountAddress: string; feeSettings: FeeSettings }) => ({
			op: {
				kind: "send_transaction",
				networkId: req.networkId,
				accountAddress: req.accountAddress,
				feeSettings: req.feeSettings,
				actions: [],
			},
			token: { contract: TOKEN_CONTRACT, name: "Tok", symbol: "TOK", decimals: 18 },
			fn: { name: "transfer_in_public" },
			args: [],
		}),
	)
	;(raw.txBuilder as Record<string, unknown>).buildNoFrom = underRun(async () => ({
		...(await cannedBuild(FEE_SETTINGS.app)),
		txRequest: {
			txContext: { gasSettings: new GasSettings(new Gas(100, 200), new Gas(10, 20), new GasFees(2n, 2n), GasFees.empty()) },
			authWitnesses: [],
		},
	}))
	;(raw.dappSendExecutor as Record<string, unknown>).discoverNoFromAuthwits = underRun(() => [])

	// Every estimate run parks at its start, holding the slot it took, until a step decides it.
	const parked: ParkedRun[] = []
	const park = <A extends unknown[], R>(target: Record<string, unknown>, name: string) => {
		const original = (target[name] as (...args: A) => Promise<R>).bind(target)
		target[name] = async (...args: A): Promise<R> => {
			let decide: (verdict: "land" | "fail") => void = () => {}
			const verdict = new Promise<"land" | "fail">((resolve) => {
				decide = resolve
			})
			const run: ParkedRun = { decide }
			parked.push(run)
			bump()
			const v = await verdict
			parked.splice(parked.indexOf(run), 1)
			bump()
			if (v === "fail") throw new Error("simulation failed")
			inEstimateRun++
			try {
				return await original(...args)
			} finally {
				inEstimateRun--
			}
		}
	}
	park(raw.dappSendExecutor, "estimateOperationFee")
	park(raw.dappSendExecutor, "previewOperationAuthwits")
	park(raw.transferExecutor, "runEstimate")

	// O3: the slot grants in arrival order.
	type SlotEntry = { seq: number; granted: boolean; aborted: boolean }
	const slotLines = new Map<string, SlotEntry[]>()
	let slotSeq = 0
	let skipped = false
	const mutex = (raw.lane as Record<string, Record<string, unknown>>).executionMutex
	const acquire = (mutex.acquire as (...a: unknown[]) => Promise<unknown>).bind(mutex)
	mutex.acquire = async (key: string, ...rest: unknown[]) => {
		const line = slotLines.get(key) ?? []
		slotLines.set(key, line)
		const entry: SlotEntry = { seq: ++slotSeq, granted: false, aborted: false }
		line.push(entry)
		bump()
		const grant = () => {
			entry.granted = true
			bump()
			const passed = line.find((e) => e.seq < entry.seq && !e.granted && !e.aborted)
			if (passed) red("O3", `slot request ${entry.seq} was granted ahead of request ${passed.seq}`)
		}
		// The fault takes a real hold of a lane no one else waits in, so the send runs with a release
		// the mutex itself accepts.
		const skipping = faults.laneSkipsLine && !skipped && line.some((e) => e !== entry && !e.granted && !e.aborted)
		if (skipping) skipped = true
		try {
			const release = await acquire(skipping ? `${key}|skipped` : key, ...rest)
			grant()
			return release
		} catch (error) {
			entry.aborted = true
			bump()
			throw error
		}
	}

	// O3: journal rows move along the job table.
	const stages = new Map<string, string>()
	const records = new Map<string, OperationRecord>()
	let skippedStage = false
	const observe = (record: OperationRecord) => {
		bump()
		records.set(record.id, record)
		const before = stages.get(record.id)
		const after = record.progress.stage
		stages.set(record.id, after)
		if (before && before !== after && !canTransition(before as never, after as never))
			red("O3", `journal row ${record.id} moved ${before} → ${after}`)
		if (faults.journalSkipsStage && !skippedStage && after === "queued" && before === undefined) {
			skippedStage = true
			queueMicrotask(() => journal.onOperationUpdated.invoke({ ...record, progress: { stage: "submitting" } } as OperationRecord))
		}
	}
	journal.onOperationAdded.add(observe)
	journal.onOperationUpdated.add(observe)

	// O1: what each turn met for the snapshot it named.
	const takes = new Map<string, string>()
	const snapshots = internals.previewSnapshots as unknown as Record<string, unknown>
	const take = (snapshots.take as (id: string | undefined, identity: unknown) => { kind: string; snapshot?: { builtAt: number } }).bind(
		snapshots,
	)
	snapshots.take = (previewId: string | undefined, identity: unknown) => {
		let lookup = take(previewId, identity)
		if (faults.snapshotSweepAt120s && lookup.kind === "found" && Date.now() - (lookup.snapshot?.builtAt ?? 0) > 120_000)
			lookup = { kind: "missing" }
		if (previewId) takes.set(previewId, lookup.kind)
		bump()
		return lookup
	}

	return {
		service: service as ExecutionService,
		journal,
		captureExecutionFence,
		violations,
		red,
		bump,
		get activity() {
			return activity
		},
		faults,
		crypto,
		proof,
		parked,
		rows,
		submitted,
		records,
		takes,
		stored,
		txUpdated,
		surfaces: [] as SurfaceBase[],
		presses: [] as PressRecord[],
		/** Transfers pressed whose journal row has not appeared yet, oldest first. */
		awaitingRecord: [] as PressRecord[],
		session: {
			lock: () => {
				live = undefined
				profileChanged.invoke(undefined)
				bump()
			},
			unlock: () => {
				serial += 1
				live = { profileId: "p1", serial }
				profileChanged.invoke({ id: "p1" })
				bump()
			},
		},
		mine: () => {
			const pending = rows.filter((r) => r.status === TxStatus.Pending)
			for (const row of pending) {
				tip += 1
				Object.assign(row, {
					status: TxStatus.Proposed,
					executionResult: TxExecutionResult.Success,
					block: { number: tip, hash: `0x${tip.toString(16).padStart(64, "0")}` },
					networkId: NETWORK.id,
				})
				txUpdated.invoke(row)
			}
			bump()
			return pending.length
		},
	}
}

/** Quiet means no event and no WebCrypto call pending: a sealed journal write raises no event
 *  until its encryption resolves, which a loaded runner can delay past `QUIET_MS`. */
async function settle(race: Race): Promise<void> {
	const deadline = performance.now() + SETTLE_MAX_MS
	for (;;) {
		const seen = race.activity
		await race.crypto.settled()
		await realSleep(QUIET_MS)
		await race.crypto.settled()
		if (seen === race.activity) return
		if (performance.now() > deadline) throw new DriverError(`the run did not settle within ${SETTLE_MAX_MS} ms`)
	}
}

const isQueued = (answer: unknown): answer is TransferFeeQueued =>
	typeof answer === "object" && answer !== null && (answer as { queued?: unknown }).queued === true

/** The latest run's state as a press meets it. */
function runState(run: RunRecord | undefined): PressFact["estimate"] {
	if (!run) return "running"
	if (run.state !== "asking") return run.state
	return !run.started && run.answers.at(-1) === "queued" ? "queued" : "running"
}

/** One estimate attempt: the RPC as `estimateWhenClear` asks it, every answer recorded. */
function attempt<T extends object>(
	race: Race,
	s: SurfaceBase,
	token: string,
	signal: AbortSignal,
	rpc: () => Promise<T | TransferFeeQueued>,
	onQueued?: (answer: TransferFeeQueued) => void,
	onStarted?: () => void,
): Promise<T> {
	const run: RunRecord = { answers: [], started: false, state: "asking" }
	s.runs.push(run)
	race.bump()
	const ask = async () => {
		let answer: T | TransferFeeQueued
		try {
			answer = await rpc()
		} catch (error) {
			run.answers.push("error")
			race.bump()
			throw error
		}
		const kind = isQueued(answer) ? "queued" : "result"
		// A repeat of the same answer is no activity: a queued poll every few ms would never settle.
		if (run.answers.at(-1) !== kind) race.bump()
		run.answers.push(kind)
		if (kind === "queued" && race.faults.popupFailsQueued) throw new Error("the popup dropped a queued answer")
		return answer
	}
	const started = () => {
		run.started = true
		race.bump()
		onStarted?.()
	}
	return estimateWhenClear<T>(ask, signal, {
		onQueued,
		start: { events: race.service.onEstimateStarted, estimateToken: token, onStarted: started },
		pollMs: POLL_MS,
	}).then(
		(result) => {
			run.state = "landed"
			const ids = result as { estimateId?: string; previewId?: string }
			run.ids = { estimateId: ids.estimateId, previewId: ids.previewId }
			race.bump()
			return result
		},
		(error: unknown) => {
			run.state = "failed"
			race.bump()
			throw error
		},
	)
}

/** O2: the popup failed a run whose last answer from the worker was queued. */
function judgeFailure(race: Race, s: SurfaceBase): void {
	const run = s.runs.at(-1)
	if (run?.answers.at(-1) === "queued") race.red("O2", `${s.ref}'s estimate failed in the popup while the worker answered it queued`)
}

function recordPress(race: Race, s: SurfaceBase, timing: Timing, named: PressRecord["named"]): PressRecord {
	const fact: PressFact = {
		ref: s.ref,
		surface: s.surface,
		method: s.method,
		timing,
		estimate: runState(s.runs.at(-1)),
		ahead: race.presses.filter((p) => p.end === undefined).length,
	}
	const press: PressRecord = { fact, named, endedByPerson: false, judged: false }
	race.presses.push(press)
	s.press$ = press
	judgeNamed(race, s, press)
	race.bump()
	return press
}

/** O1: a press names its operation's latest landed estimate, or none after a failed one; a Send the
 *  worker answered queued names its cap, or nothing when Nulo's sponsor pays. */
function judgeNamed(race: Race, s: SurfaceBase, press: PressRecord): void {
	const { named, fact } = press
	const latest = s.runs.at(-1)
	if (latest?.state === "failed") {
		if (named.estimateId || named.previewId) race.red("O1", `${s.ref}'s press named ${JSON.stringify(named)} after its estimate failed`)
		return
	}
	if (named.queued && fact.estimate === "queued") return
	if (latest?.state !== "landed") race.red("O1", `${s.ref} was pressed while its estimate was ${fact.estimate}`)
	else if (named.estimateId !== latest.ids?.estimateId || named.previewId !== latest.ids?.previewId)
		race.red("O1", `${s.ref}'s press named ${JSON.stringify(named)}, not its landed estimate ${JSON.stringify(latest.ids)}`)
}

function openWindow(race: Race, opRef: OpRef, method: Method): SurfaceBase {
	const draft: Record<string, unknown> = {
		kind: "aztec_sendTx",
		networkId: NETWORK.id,
		accountAddress: ACCOUNT.toString(),
		exec: { calls: [], ...(method === "app" || method === "no_from" ? { feePayer: APP_FPC } : {}) },
		opts: { from: method === "no_from" ? AztecAddress.ZERO : ACCOUNT },
		...(method === "no_from" ? { executionMode: "default_entrypoint" } : {}),
		feeSettings: method === "app" || method === "no_from" ? FEE_SETTINGS.app : undefined,
	}
	race.stored.set(opRef, { draft, open: true })
	const queuedJournal = race.journal.createOperation({
		kind: "dapp_execute",
		origin: "dapp",
		profileId: "p1",
		sessionId: "session-1",
		accountAddress: ACCOUNT.toString(),
		networkId: NETWORK.id,
		initialStage: { stage: "queued" },
	})
	const scope = effectScope()
	const payer = ref<FeePayerPick | null>(method in WINDOW_PAYER ? WINDOW_PAYER[method as PickedMethod] : null)
	const uiOp = shallowRef({ ...draft } as unknown as DraftUIOperation)
	const surface = { ref: opRef, surface: "window", method, open: true, runs: [] } as unknown as SurfaceBase
	const engines = scope.run(() => {
		const fee = useFeeEstimationMap<number, { index: number; feeSettings: FeeSettings }, TransferFeeEstimate>({
			estimate: (params, token, flowKey, signal) =>
				attempt(race, surface, token, signal, () =>
					race.service.estimateOperationFee(opRef, params.index, params.feeSettings, token, flowKey),
				),
			cancelRemote: (token) => race.service.cancelEstimate(token).catch(() => {}),
			debounceMs: 0,
			onError: () => judgeFailure(race, surface),
		})
		const preview = useFeeEstimationMap<number, { index: number }, OperationAuthwitPreview>({
			estimate: ({ index }, token, flowKey, signal) =>
				attempt(race, surface, token, signal, () => race.service.previewOperationAuthwits(opRef, index, token, flowKey)),
			cancelRemote: (token) => race.service.cancelEstimate(token).catch(() => {}),
			debounceMs: 0,
			onError: () => judgeFailure(race, surface),
		})
		const holds = computed(() =>
			holdsConfirm(uiOp.value, payer.value, {
				landed: !!fee.results.value[0],
				inFlight: race.faults.ruleIgnoresInFlight
					? false
					: fee.estimating.value[0] === true || preview.estimating.value[0] === true,
			}),
		)
		return { fee, preview, holds }
	})
	if (!engines) throw new DriverError("the window's scope did not run")
	const { fee, preview, holds } = engines

	const execute = async (press: PressRecord, deltas: ReturnType<typeof approvalDeltas>) => {
		let releasePreviews = () => {}
		try {
			const journalId = (await queuedJournal).id
			press.journalId = journalId
			releasePreviews = race.service.claimPreviews(deltas.map((d) => d.previewId))
			const fence = await race.captureExecutionFence()
			const [result] = await race.service.executeOperations(
				[applyFeeSelection(draft as never, deltas[0]?.feeSettings)],
				{ type: OriginType.DAPP, name: "App" } as never,
				undefined,
				{ queuedJournalId: journalId, originKey: DAPP_ORIGIN },
				[{ interactionId: opRef, index: 0, ...deltas[0] }],
				fence,
			)
			press.end = result?.status === "ok" ? { ok: true } : { ok: false, error: result }
		} catch (error) {
			press.end = { ok: false, error }
		} finally {
			releasePreviews()
			race.bump()
		}
	}

	Object.assign(surface, {
		allows: () => !holds.value,
		schedule: (next?: PickedMethod) => {
			if (method === "no_from") return preview.estimate(0, { index: 0 })
			const feeSettings = FEE_SETTINGS[next ?? method]
			if (next) {
				surface.method = next
				payer.value = WINDOW_PAYER[next]
			}
			uiOp.value = { ...uiOp.value, feeSettings } as DraftUIOperation
			fee.estimate(0, { index: 0, feeSettings })
		},
		press: (timing: Timing): Outcome => {
			if (!surface.open) return "gone"
			if (holds.value) return "refused"
			fee.handoffAll()
			preview.handoffAll()
			const deltas = approvalDeltas([uiOp.value], fee.results.value, preview.results.value, new Map())
			const press = recordPress(race, surface, timing, { estimateId: deltas[0]?.estimateId, previewId: deltas[0]?.previewId })
			race.stored.get(opRef)!.open = false
			surface.open = false
			void execute(press, deltas)
			void fee.dispose()
			void preview.dispose()
			scope.stop()
			return "submitted"
		},
		close: () => {
			if (!surface.open) return
			surface.open = false
			race.stored.get(opRef)!.open = false
			scope.stop()
			void queuedJournal.then((r) => race.journal.transitionOperation(r.id, { stage: "cancelled" })).catch(() => {})
		},
	})
	surface.schedule()
	return surface
}

function openSend(race: Race, opRef: OpRef, method: PickedMethod, transfer: "public" | "private"): SurfaceBase {
	const amount = BigInt(Number(opRef.slice(2)))
	const scope = effectScope()
	const surface = { ref: opRef, surface: "send", method, open: true, runs: [] } as unknown as SurfaceBase
	const transferType = transfer === "private" ? TransferType.Private : TransferType.Public
	let feeSettings = FEE_SETTINGS[method]
	const engines = scope.run(() => {
		const payer = ref(SEND_PAYER[method])
		const queued = ref(false)
		const queuedCap = ref<TransferFeeQueued["cap"] | null>(null)
		const clearQueued = () => {
			queued.value = false
			queuedCap.value = null
		}
		let last: { feeSettings: FeeSettings } | undefined
		const est = useFeeEstimation<{ feeSettings: FeeSettings }, TransferFeeEstimate>({
			debounceMs: 0,
			estimate: (params, token, signal) => {
				last = params
				return attempt(
					race,
					surface,
					token,
					signal,
					() =>
						race.service.estimateTransferFee(
							NETWORK.id,
							ACCOUNT.toString(),
							1,
							TOKEN_CONTRACT,
							transferType,
							RECIPIENT,
							amount,
							params.feeSettings,
							token,
						),
					(answer) => {
						if (signal.aborted) return
						queued.value = true
						if (!answer.tokenSpent) queuedCap.value = answer.cap ?? null
					},
					clearQueued,
				)
			},
			cancelRemote: (token) => {
				race.service.cancelEstimate(token).catch(() => {})
			},
			onError: (error) => {
				if (error instanceof EstimateRequeue && last) return est.estimate(last)
				clearQueued()
				judgeFailure(race, surface)
			},
		})
		const state = computed<SendFeeState>(() => ({
			queued: queued.value,
			queuedCap: queuedCap.value,
			payer: feePayerOf(payer.value),
			estimate: est.result.value,
		}))
		return { est, state, payer, clearQueued }
	})
	if (!engines) throw new DriverError("the Send page's scope did not run")
	const { est, state, payer, clearQueued } = engines

	Object.assign(surface, {
		allows: () => feeAllowsSend(state.value),
		schedule: (next?: PickedMethod) => {
			if (next) {
				surface.method = next
				payer.value = SEND_PAYER[next]
				feeSettings = FEE_SETTINGS[next]
			}
			// As the page: new input is queued only once the wallet says so again.
			clearQueued()
			est.estimate({ feeSettings })
		},
		press: (timing: Timing): Outcome => {
			if (!surface.open) return "gone"
			if (!feeAllowsSend(state.value)) return "refused"
			const { feeCap, precomputedEstimateId, shownFee } = sendFeeHandoff(state.value)
			if (precomputedEstimateId) est.handoff()
			const queued = queueModeOf(state.value)
			const press = recordPress(race, surface, timing, { estimateId: precomputedEstimateId, feeCap, queued })
			race.awaitingRecord.push(press)
			surface.open = false
			race.service
				.executeTransfer(
					NETWORK.id,
					ACCOUNT.toString(),
					1,
					TOKEN_CONTRACT,
					transferType,
					RECIPIENT,
					amount,
					feeSettings,
					precomputedEstimateId,
					feeCap,
					shownFee,
				)
				.then(
					() => {
						press.end = { ok: true }
					},
					(error: unknown) => {
						press.end = { ok: false, error }
					},
				)
				.finally(race.bump)
			scope.stop()
			return "submitted"
		},
		close: () => {
			if (!surface.open) return
			surface.open = false
			scope.stop()
		},
	})
	surface.schedule()
	return surface
}

/** A first-offer press: fired in the tick the rule first allows it. */
function arm(s: SurfaceBase): Outcome {
	if (!s.open) return "gone"
	if (s.allows()) return s.press("first-offer")
	const scope = effectScope()
	scope.run(() =>
		watch(
			() => s.open && s.allows(),
			(allowed) => {
				if (!allowed) return
				s.press("first-offer")
				scope.stop()
			},
			{ flush: "sync" },
		),
	)
	return "armed"
}

const surfaceOf = (race: Race, ref: OpRef) => race.surfaces.find((s) => s.ref === ref)

type Drivers = { [N in ActionName]: (race: Race, p: ActionParams[N]) => Promise<Outcome> }

const latestOutcome = (s: SurfaceBase): Outcome => {
	const state = runState(s.runs.at(-1))
	return state === "queued" ? "queued" : state === "running" ? "estimating" : state
}

const DRIVERS: Drivers = {
	openWindow: async (race, p) => {
		const s = openWindow(race, `op${race.surfaces.length + 1}`, p.method)
		race.surfaces.push(s)
		await settle(race)
		return latestOutcome(s)
	},
	openSend: async (race, p) => {
		const s = openSend(race, `op${race.surfaces.length + 1}`, p.method, p.transfer)
		race.surfaces.push(s)
		await settle(race)
		return latestOutcome(s)
	},
	landEstimate: async (race) => decideParked(race, "land"),
	failEstimate: async (race) => decideParked(race, "fail"),
	askAgain: async (race, p) => {
		const s = surfaceOf(race, p.target)
		const run = s?.runs.at(-1)
		if (!s || !run) return "estimating"
		const before = runState(run)
		const asked = run.answers.length
		const deadline = performance.now() + 500
		while (run.answers.length === asked && runState(run) === before && performance.now() < deadline) await realSleep(POLL_MS)
		await settle(race)
		const after = latestOutcome(s)
		return before === "queued" && after === "estimating" ? "granted" : after
	},
	press: async (race, p) => {
		const s = surfaceOf(race, p.target)
		if (!s) return "gone"
		const outcome = p.timing === "first-offer" ? arm(s) : s.press(p.timing)
		await settle(race)
		return outcome
	},
	switchMethod: async (race, p) => {
		const s = surfaceOf(race, p.target)
		if (!s?.open) return "estimating"
		s.schedule(p.method)
		await settle(race)
		return latestOutcome(s)
	},
	cancel: async (race, p) => {
		const s = surfaceOf(race, p.target)
		if (!s) return "gone"
		if (s.open) {
			s.close()
			await settle(race)
			return "closed"
		}
		const press = s.press$
		if (!press) return "gone"
		press.endedByPerson = true
		if (!press.journalId) return "gone"
		const before = race.records.get(press.journalId)?.progress.stage
		await race.service.cancelJob(press.journalId).catch(() => {})
		await settle(race)
		const after = race.records.get(press.journalId)?.progress.stage
		if (after === "cancelled") return "cancelled"
		if (before && canTransition(before as never, "cancelled" as never))
			race.red("O4", `${s.ref}'s cancel at ${before} left its row ${after ?? "gone"}`)
		return "too-late"
	},
	lock: async (race) => {
		for (const press of race.presses) if (press.end === undefined) press.endedByPerson = true
		race.session.lock()
		for (const s of race.surfaces) s.close()
		await settle(race)
		race.session.unlock()
		await settle(race)
		return "locked"
	},
	finishProof: async (race) => {
		if (race.proof.held() === 0) return "idle"
		race.proof.release()
		await settle(race)
		return "released"
	},
	mineBlock: async (race) => {
		const mined = race.mine()
		await settle(race)
		return mined > 0 ? "mined" : "idle"
	},
	advanceClock: async (race, p) => {
		vi.setSystemTime(Date.now() + (p.by === "past-reuse" ? STEP_PAST_REUSE_MS : STEP_PAST_WINDOW_MS))
		if (p.by === "past-window") for (const s of race.surfaces) if (s.surface === "window") s.close()
		race.bump()
		await settle(race)
		return "advanced"
	},
}

async function decideParked(race: Race, verdict: "land" | "fail"): Promise<Outcome> {
	const run = race.parked[0]
	if (!run) return "idle"
	run.decide(verdict)
	await settle(race)
	return verdict === "land" ? "landed" : "failed"
}

/** Assigns each transfer's journal row to its press, in press order. */
function linkTransferRecords(race: Race): void {
	const linked = new Set(race.presses.map((p) => p.journalId).filter(Boolean))
	for (const record of race.records.values()) {
		if (record.kind !== "transfer" || linked.has(record.id)) continue
		const press = race.awaitingRecord.shift()
		if (!press) return
		press.journalId = record.id
		linked.add(record.id)
	}
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : JSON.stringify(error))
/** The error, or the one a rejection or a failed result wraps, is the layer's edge. */
function atRebuild(error: unknown, depth = 0): boolean {
	if (error instanceof RebuildOutOfLayer || error === new RebuildOutOfLayer().message) return true
	if (typeof error !== "object" || error === null || depth > 3) return false
	const { name, message, error: inner, cause } = error as { name?: unknown; message?: unknown; error?: unknown; cause?: unknown }
	if (name === "RebuildOutOfLayer" || message === new RebuildOutOfLayer().message) return true
	return atRebuild(inner, depth + 1) || atRebuild(cause, depth + 1)
}

function endOf(press: PressRecord): NonNullable<PressFact["end"]> {
	if (!press.end) return "open"
	if (press.end.ok) return "sent"
	if (atRebuild(press.end.error)) return "rebuild"
	return press.endedByPerson ? "ended" : "failed"
}

/** What a window's confirm met of the snapshot its press named: "found" when nothing was due. A
 *  default-entrypoint confirm stops at its build, before its lookup, and a lock or cancel may end a
 *  confirm before its turn. */
function snapshotAtTurn(race: Race, press: PressRecord): string {
	const { previewId } = press.named
	if (!previewId || press.endedByPerson) return "found"
	if (press.fact.surface !== "window" || press.fact.method === "no_from") return "found"
	return race.takes.get(previewId) ?? "never looked up"
}

/** O1: each ended press ended sent, at a rebuild, or by the person's lock or cancel; every snapshot
 *  it named was there at its turn. */
function judgeEnds(race: Race): void {
	for (const press of race.presses) {
		if (!press.end || press.judged) continue
		press.judged = true
		const met = snapshotAtTurn(race, press)
		if (met !== "found") race.red("O1", `${press.fact.ref}'s snapshot was ${met} at its turn`)
		if (endOf(press) === "failed")
			race.red(
				"O1",
				`${press.fact.ref}'s send failed with no lock or cancel since its press: ${press.end.ok ? "" : messageOf(press.end.error)}`,
			)
	}
}

/** Releases every hold, oldest first, until nothing changes: parked estimates land, proofs finish
 *  and pending rows are mined. */
async function drain(race: Race): Promise<void> {
	for (let round = 0; round < 40; round++) {
		if (race.parked.length > 0) await decideParked(race, "land")
		else if (race.proof.held() > 0) {
			race.proof.release()
			await settle(race)
		} else if (race.rows.some((r) => r.status === TxStatus.Pending)) {
			race.mine()
			await settle(race)
		} else return
	}
	throw new DriverError("the holds did not drain")
}

/** O2 and O4, once every hold is released. */
function judgeFinale(race: Race): void {
	for (const s of race.surfaces) {
		if (s.open && runState(s.runs.at(-1)) === "queued") race.red("O2", `${s.ref}'s estimate is still queued with nothing ahead of it`)
	}
	judgeSentHashes(race)
	for (const press of race.presses) {
		if (!press.end) race.red("O1", `${press.fact.ref}'s send never ended`)
		const record = press.journalId ? race.records.get(press.journalId) : undefined
		if (record?.progress.stage === "cancelled" && press.end?.ok) race.red("O4", `${press.fact.ref} was cancelled and still sent`)
	}
}

/** O4: the node, the journal and the strip name the same sent hashes. */
function judgeSentHashes(race: Race): void {
	const sent = new Set(race.submitted)
	const journaled = new Set<string>()
	for (const record of race.records.values()) {
		const hash = (record.progress as { txHash?: string }).txHash
		if (!hash) continue
		if (record.progress.stage === "cancelled") race.red("O4", `cancelled row ${record.id} names ${hash}`)
		else journaled.add(hash)
	}
	const stripped = new Set(race.rows.map((r) => r.hash))
	const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((h) => b.has(h))
	if (!same(sent, journaled)) race.red("O4", `the node took ${[...sent]}; the journal's sent rows name ${[...journaled]}`)
	if (!same(sent, stripped)) race.red("O4", `the node took ${[...sent]}; the strip shows ${[...stripped]}`)
}

const BASE_TIME = Date.UTC(2026, 9, 1, 12)

/** Runs `plan`, judging every step; the report's `red` is the first step any oracle failed on. */
export async function runPlan(plan: Plan, faults: Faults = {}): Promise<RaceReport> {
	vi.useFakeTimers({ toFake: ["Date"], now: BASE_TIME })
	const crypto = trackSubtleCrypto()
	const steps: StepReport[] = []
	let race: Race | undefined
	try {
		race = await startRace(faults, crypto)
		for (const step of plan.steps) {
			const report = await runStep(race, step)
			steps.push(report)
			if (report.violations.length > 0) return finish(race, steps, report)
		}
		const end: StepReport = { index: plan.steps.length, action: "mineBlock", params: { finale: true }, violations: [] }
		try {
			await drain(race)
			linkTransferRecords(race)
			judgeEnds(race)
			judgeFinale(race)
		} catch (error) {
			race.red("driver", error instanceof Error ? error.message : String(error))
		}
		end.violations = race.violations.splice(0)
		return finish(race, steps, end.violations.length > 0 ? end : undefined)
	} finally {
		if (race) await windDown(race)
		crypto.restore()
		vi.useRealTimers()
	}
}

/** Ends what a run left in flight, a red's early return included, so none of it writes into the
 *  next run's storage. */
async function windDown(race: Race): Promise<void> {
	race.session.lock()
	for (const s of race.surfaces) s.close()
	await drain(race).catch(() => {})
	await settle(race).catch(() => {})
}

async function runStep(race: Race, step: PlannedStep): Promise<StepReport> {
	const report: StepReport = { index: step.index, action: step.action, params: step.params, violations: [] }
	try {
		report.outcome = await (DRIVERS[step.action] as (race: Race, p: unknown) => Promise<Outcome>)(race, step.params)
		if (!step.outcomes.includes(report.outcome))
			race.red("catalog", `${step.action} ended ${report.outcome}, outside ${step.outcomes.join(", ")}`)
		linkTransferRecords(race)
		judgeEnds(race)
	} catch (error) {
		race.red("driver", error instanceof Error ? error.message : String(error))
	}
	report.violations = race.violations.splice(0)
	return report
}

function finish(race: Race, steps: StepReport[], red: StepReport | undefined): RaceReport {
	return { steps, red, presses: race.presses.map((p) => ({ ...p.fact, end: endOf(p) })) }
}

export function describeRed(report: RaceReport): string {
	if (!report.red) return "green"
	const lines = report.red.violations.map((v) => `${v.oracle}: ${v.message}`)
	const trail = report.steps.map((s) => `${s.index} ${s.action} ${JSON.stringify(s.params)} → ${s.outcome ?? "?"}`)
	return [`red at step ${report.red.index} (${report.red.action})`, ...lines, "steps:", ...trail].join("\n")
}
