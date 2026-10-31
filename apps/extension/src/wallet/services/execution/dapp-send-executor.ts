// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * `DappSendExecutor` — the dApp-initiated send flows (standard,
 * aztec.js, NO_FROM/DefaultEntrypoint) plus dApp fee estimation, moved
 * verbatim off the execution facade.
 *
 * ## Lane-shaped deps
 *
 * Unlike the transfer flow, dApp sends DO take an execution slot: the
 * per-(profileId, chainId) FIFO mutex that keeps two approved sendTx
 * from interleaving their simulate/prove against shared private-note
 * state. The slot, the queued-record claim, the journal helpers, and
 * the controller registry all live behind `deps.lane` — the facade owns
 * the implementations today; the execution-lane seam swaps the wiring,
 * not this module's control flow.
 *
 * Frozen ordering invariants (do not reorder):
 *   - `acquireSlot` BEFORE the journal claim and any PXE-touching work.
 *     The session-FIFO baton releases inside the slot acquisition (via
 *     `onExecutionEnqueued`) the instant we're enqueued.
 *   - Between the grant and the claim, a send whose origin has an earlier
 *     send still waiting, or whose account has an earlier send unmined (its
 *     spends are unknown before the build), parks outside the slot and comes
 *     back; nothing is claimed, built or awaited on the network under the
 *     slot before that check passes.
 *   - `journalId` hoisted outside the try so catch (mark failed) +
 *     finally (controller cleanup + slot release) run even if the claim
 *     or the post-claim cancel-check throws on a raced cancel —
 *     otherwise the slot leaks and the lane wedges until SW restart.
 *   - `simulating` marked BEFORE authwit discovery / the build, which
 *     run real `simulateTx` calls; `pending`'s short reaper grace is
 *     not a defensible ceiling for simulation time.
 */

import { type InteractionWaitOptions, type SendReturn, extractOffchainOutput } from "@aztec-labs/aztec.js/contracts"
import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { FunctionCall } from "@aztec-labs/stdlib/abi"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { collectOffchainEffects, type TxProvingResult } from "@aztec-labs/stdlib/tx"
import { liveChainInfo } from "@nulo/aztec-runtime/utils"
import { type JobError, type JobProgress, JobCancelledSentinel, type QueuedFeeReask } from "@nulo/wallet-core/jobs"
import { markFailedUnlessCancelled } from "./mark-failed-unless-cancelled"
import { feeDisplay } from "@/utils/fee-estimation"
import { pickPrimaryIndex, pickPrimaryWireCall } from "@/utils/primary-method"
import { type JournalCallCarrier, type JournalRetitle, journalCallOf } from "@/wallet/services/operation-journal/spec"
import { findPrimaryEndpoint, primaryEndpointUrl } from "@/wallet/services/network/spec"
import type { ExecutionHooks } from "@/wallet/services/dapp-interaction/spec"
import type { WrappedTask } from "@/wallet/services/task/service"
import type { AddTransactionInput, LocalTxOrigin, TransactionService, Tx } from "@/wallet/services/transaction/service"
import { type FeeChoice, OriginType } from "@/wallet/services/transaction/spec"
import type { AuthRegistryService } from "@/wallet/services/auth-registry/service"
import type { Network } from "@/wallet/services/network/service"
import type { PublicStorageReader } from "@/wallet/utils/fee-juice-balance"
import type { DiscoveryAwareEstimator } from "./discovery-aware-estimator"
import { type ExecutionCoordinator, type ProveAndSendContext, fenceChecks } from "./execution-coordinator"
import { builtCapOf } from "./estimate-reuse-shared"
import type { ChainTipGate } from "./chain-tip-gate"
import type { OriginTurn } from "./execution-lane"
import type { ExecutionMutexRelease } from "./execution-mutex"
import type { OperationEstimateReuse, OperationEstimateReuseEntry } from "./operation-estimate-reuse"
import { fingerprintNoFromInputs, fingerprintOperation, type OperationFingerprintInput } from "./operation-fingerprint"
import { PREVIEW_FOREIGN_MESSAGE, type PreviewLookup, type PreviewSnapshots, assertWithinPreview } from "./preview-snapshots"
import { decodeAuthwitEffects } from "./decode-authwit-effects"
import { throwIfAborted } from "./rpc-cancel"
import { askFeeAgain, feeRiseAsks, personalPayerOf } from "./fee-reask"
import type { QueuedFeeAnswers } from "./queued-fee-cap"
import { MAX_WAIT_MS, type SendSequencer, type SequenceScope, type SequenceTicket } from "./send-sequencer"
import { probeAppPayerFunding, probeOwnFeeJuice, probeSponsorFunding } from "./sponsor-funding"
import { applyEmbeddedFpcGasCap } from "./fee/embedded-fpc-cap"
import { type FeeEstimate, finalizeGasLimits, type OnBuilt, suggestGasLimits } from "./fee/fee-strategy"
import type { OperationPlanner } from "./operation-planner"
import type {
	Action,
	AztecSendTxOperation,
	DiscoveredAuthwit,
	FeeOptions,
	FeeQuestion,
	FeeSettings,
	Operation,
	OperationApprovalEnvelope,
	OperationAuthwitPreview,
	PreviewContext,
	SendTransactionOperation,
	TransferFeeEstimate,
} from "./spec"
import type { TxRequestBuilder } from "./tx-request-builder"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import { getEstimatedFee, getGasDetails, priorityFeeOf } from "./tx-fee-details"
import { detectEmbeddedFeePayment } from "./utils/fee-detection"
import { type FeeChooser, feeChoiceOf, feeChooserOf } from "./fee-choice"

/** The primary call of an `Action[]` (a discriminated union with non-call variants like
 *  `AddCapsuleAction`), as the journal records it. Inlined here rather than in `primary-method.ts`
 *  because that helper is layer-agnostic — importing `Action` from the execution spec would invert
 *  the dependency direction. */
function primaryActionCalls(actions: readonly Action[] | undefined): JournalCallCarrier[] | undefined {
	const calls = (actions ?? []).filter((a) => a.kind === "call" || a.kind === "encoded_call")
	const index = pickPrimaryIndex(calls.map((a) => ({ method: a.kind === "call" ? a.method : (a.name ?? a.selector) })))
	const primary = index === undefined ? undefined : calls[index]
	if (primary?.kind === "call") return [{ method: primary.method, call: journalCallOf(primary.contract, primary.args) }]
	if (primary?.kind === "encoded_call")
		return [{ method: primary.name ?? primary.selector, call: journalCallOf(primary.to, primary.args) }]
	return undefined
}

/** Execution-lane subset the dApp-send flows depend on: the FIFO slot,
 *  the queued-record claim, the journal helpers, and the controller
 *  registry. Implementations live on the facade today. */
export interface DappSendExecutorLane {
	deleteController(journalId: string): void
	acquireSlot(
		networkId: string,
		queuedJournalId: string | undefined,
		fence: ExecutionFence,
		onEnqueued?: () => void,
		originKey?: string,
	): Promise<{ release: ExecutionMutexRelease; preController: AbortController | undefined }>
	claimOrCreateJournal(
		networkId: string,
		accountAddress: string,
		origin: LocalTxOrigin,
		calls: JournalCallCarrier[] | undefined,
		hooks: ExecutionHooks | undefined,
		reuseController: AbortController | undefined,
		fence: ExecutionFence,
	): Promise<{ journalId: string | undefined; controller: AbortController | undefined }>
	beginJournal(
		networkId: string,
		accountAddress: string,
		origin: LocalTxOrigin,
		calls?: JournalCallCarrier[],
		fence?: ExecutionFence,
	): Promise<string | undefined>
	recordBuiltCall(journalId: string | undefined, txCalls: Tx["calls"]): Promise<void>
	markJournal(journalId: string | undefined, progress: JobProgress, error?: JobError | null, retitle?: JournalRetitle): Promise<void>
	commitJournal(journalId: string | undefined, progress: JobProgress): Promise<void>
	parkSlot(
		release: ExecutionMutexRelease,
		networkId: string,
		queuedJournalId: string | undefined,
		fence: ExecutionFence,
		preController: AbortController | undefined,
		originKey: string | undefined,
		wait: () => Promise<void>,
	): Promise<ExecutionMutexRelease>
	joinOriginLine(fence: ExecutionFence, chainId: number, originKey: string | undefined): OriginTurn
	failUnclaimed(journalId: string | undefined, error: unknown): Promise<void>
	/** `queued → pending` after a park; a row still `pending` stays, any other stage ends the send. */
	reclaimParked(journalId: string): Promise<void>
	beginQueuedWait(journalId: string): void
	endQueuedWait(journalId: string): void
}

/** Where a granted dApp send stands until it starts: its origin's line, and a waiter in the line of
 *  each account it may spend from. */
interface DappSendLine {
	turn: OriginTurn
	scopes: SequenceScope[]
	waiters: SequenceTicket[]
}

/** What the post-send record needs from a built send, whichever arm built it. */
interface SentTx {
	origin: AddTransactionInput["origin"]
	network: Network
	account: { address: { toString(): string } }
	txCalls: AddTransactionInput["calls"]
	nonce: { toString(): string }
	feePaymentMethod: AddTransactionInput["feePaymentMethod"]
	txRequest: Parameters<typeof getEstimatedFee>[0]
	fence: ExecutionFence
	networkId: AddTransactionInput["networkId"]
	pendingPublicAuthwits: Parameters<DappSendExecutorDeps["recordPendingAuthwits"]>[1]
	feeChosenBy: FeeChooser
}

export interface DappSendExecutorDeps {
	planner: OperationPlanner
	txBuilder: TxRequestBuilder
	coordinator: ExecutionCoordinator
	lane: DappSendExecutorLane
	/** Discover-then-estimate pipeline — the ONLY route to probed/folded
	 *  strategy instances. Distinctly typed from the validated dep so
	 *  probe-forbidden paths (executeSendTransaction, embedded, NO_FROM)
	 *  cannot reach it by construction. */
	estimateWithDiscovery: DiscoveryAwareEstimator
	/** Estimate→confirm reuse for standard-mode aztec_sendTx (fj/fpc). */
	operationEstimateReuse: OperationEstimateReuse
	/** What the approval card showed per `(interactionId, index)` — confirm
	 *  refuses to sign an authorization outside it. */
	previewSnapshots: PreviewSnapshots
	getActiveProfile(): Promise<{ id: string } | undefined>
	captureExecutionFence(): Promise<ExecutionFence>
	assertFence(fence: ExecutionFence): Promise<void>
	isFenceLive(fence: ExecutionFence): boolean
	getNetwork(networkId: string): Promise<Network>
	getNode(chainId: number): Promise<FeeEstimate["node"]>
	/** The sponsor probe's read: bounded and silent, unlike the build's retrying `node`. */
	readPublicStorageOnce: PublicStorageReader
	getPXE(network: Network): FeeEstimate["pxe"]
	getAccountContract(profileId: string, chainId: number, accountAddress: string): Promise<FeeEstimate["account"]>
	getPendingForAccount(account: string): { hash: string }[]
	/** The account's send epoch (`SendSequencer.epoch`). */
	sequenceEpoch(chainId: number, account: string): number
	/** The probe-free validated pipeline (the service's strategy map). */
	buildAndEstimateValidated(
		inputOp: { networkId: string; accountAddress: string; actions: Action[]; fee?: FeeOptions },
		feeSettings: FeeSettings,
		fence: ExecutionFence,
		parentTask?: WrappedTask,
		signal?: AbortSignal,
		onBuilt?: OnBuilt,
	): Promise<FeeEstimate>
	/** Mirrors `TransactionService.addTransaction` — indexed type keeps the
	 *  seam in sync with the source signature. */
	addTransaction: TransactionService["addTransaction"]
	/** The canonical SponsoredFPC's address on `chainId`, derived by the wallet, never read from a
	 *  row; `undefined` when there is none to compare against. */
	protocolSponsorAddress(chainId: number): Promise<string | undefined>
	/** Mirrors `AuthRegistryService.recordPendingAuthwits` — records the build's
	 *  public authwits at the post-send tail as pending, tx-linked rows. */
	recordPendingAuthwits: AuthRegistryService["recordPendingAuthwits"]
	/** The account's tx reached the node: Send-page sends sharing its calls' state wait for its
	 *  receipt, and a transfer estimate built before it is stale. */
	noteSent(chainId: number, account: string, txHash: string, calls: Tx["calls"]): void
	sequencer: Pick<SendSequencer, "enterWaiter">
	chainTip: Pick<ChainTipGate, "unconfirmed" | "wait">
	/** The person's answers to held sends whose fee came out above the approved figure. */
	answers: QueuedFeeAnswers
	/** Opens the window that asks `question`; its answer reaches `answers`, a refusal cancels the send. */
	askInWindow(question: FeeQuestion): void
	logDebug(msg: string, ...rest: unknown[]): void
}

/** The scaffold's hold on a granted send, as its body uses it. */
interface SlotRun {
	journalId: string | undefined
	controller: AbortController | undefined
	checkCancelled: () => void
	markJournal: (patch: JobProgress) => Promise<void>
	/** Names the record by the build's primary call; called after every build. */
	recordCall: (txCalls: Tx["calls"]) => Promise<void>
	commitSubmitting: ProveAndSendContext["commitSubmitting"]
	/** Gives the slot back while `wait` runs, then takes it again behind the account's earlier sends,
	 *  the record claimed back to `pending`. */
	park: (wait: () => Promise<void>) => Promise<void>
	/** Leaves the origin's line: the send keeps the slot from here to its submission, so the origin's
	 *  later sends can no longer overtake it. */
	leaveLine: () => void
}

/** A build above the approved figure, as its question needs it: never the build itself. `shown` is
 *  the authorization rows the approval window listed, which the question shows again. */
type OverCeiling = { reask: QueuedFeeReask; stashId?: string; shown?: readonly DiscoveredAuthwit[] }

/** A standard build, whichever arm made it, with what a stash of it is bound to. */
type StandardBuild = Pick<
	FeeEstimate,
	| "txRequest"
	| "node"
	| "pxe"
	| "account"
	| "txCalls"
	| "feePaymentMethod"
	| "pendingPublicAuthwits"
	| "chainIdentity"
	| "fpcIdentity"
	| "initializesAccount"
	| "appPayer"
> & {
	network: Network
	nonce: { toString(): string }
	/** Message hashes of the private authwits this build signs. */
	discoveredHashes: readonly string[]
	/** The entry a reuse hit consumed. */
	reused?: OperationEstimateReuseEntry
}

/** What every build of one standard dApp send answers to. */
type StandardRun = {
	op: AztecSendTxOperation
	identity: OperationFingerprintInput
	fence: ExecutionFence
	parentTask: WrappedTask | undefined
	checkCancelled: () => void
	recordCall: SlotRun["recordCall"]
	preview: PreviewLookup | undefined
	approval: OperationApprovalEnvelope | undefined
}

/** What a build's reuse entry is bound to, read before the build. */
type ReuseSnapshot = { sequenceEpoch: number; pendingHashes: readonly string[]; lagging: boolean }

/** A popup approval of a send the person pays carries the figure its window showed. */
const MISSING_FEE_FIGURE = "The approval carries no fee figure for a fee the account pays"

export class DappSendExecutor {
	public constructor(private readonly deps: DappSendExecutorDeps) {}

	/**
	 * Shared execution-slot scaffold for the two slot-taking dApp-send paths
	 * (standard `aztec_sendTx` + NO_FROM). Owns ONLY the invariant-critical
	 * choreography; each caller's `run` closure owns its own `simulating`
	 * checkpoint and body.
	 *
	 * Frozen ordering (do not reorder — see execution-lane.ts header):
	 *   - `acquireSlot` BEFORE the journal claim and any PXE work (the
	 *     session-FIFO baton releases inside acquisition via `onEnqueued`).
	 *   - the earlier-sends wait between the grant and the claim; whichever
	 *     slot it holds last is the one `finally` releases.
	 *   - `journalId` hoisted OUTSIDE the try so catch (mark failed) +
	 *     finally (controller cleanup + slot release) run even if the claim
	 *     or the post-claim cancel-check throws on a raced cancel — otherwise
	 *     the slot leaks and the (profileId, chainId) lane wedges until SW
	 *     restart.
	 *   - the post-claim `checkCancelled()` surfaces a cancel that landed
	 *     during the claim's await-chain BEFORE any side-effecting work; the
	 *     `simulating` transition is deliberately NOT here — a fixed point
	 *     would change the standard path's invalid-from / payload-parse
	 *     failure FSM and add a NO_FROM checkpoint that does not exist today.
	 */
	private async runInSlot<T>(
		params: {
			networkId: string
			accountAddress: string
			origin: LocalTxOrigin
			hooks: ExecutionHooks | undefined
			// The AUTHORIZATION-time fence. The slot, the journal create and the
			// build all answer to THIS capture, never one taken after the FIFO
			// wait: a lock, a switch or a delete + same-id reimport while the
			// operation queued would otherwise pass for the authorizing session.
			fence: ExecutionFence
			// A THUNK, not a value: the primary-method extraction reads the
			// (potentially large / adversarial) `op.exec.calls`, and must run
			// AFTER `acquireSlot` — computing it earlier would delay our FIFO
			// enqueue (letting a later request overtake) and move any throw out
			// of the acquire-protected try. Evaluated below, inside the try.
			getCalls: () => JournalCallCarrier[] | undefined
			/** The dApp's `additionalScopes`, a thunk for the same reason as `getCalls`. */
			getAdditionalScopes: () => unknown
		},
		run: (ctx: SlotRun) => Promise<T>,
	): Promise<T> {
		const { release, preController } = await this.deps.lane.acquireSlot(
			params.networkId,
			params.hooks?.queuedJournalId,
			params.fence,
			params.hooks?.onExecutionEnqueued,
			params.hooks?.originKey,
		)
		const slot = { release }
		let line: DappSendLine | undefined
		let journalId: string | undefined
		try {
			// A wallet send (Settings) has no record before its claim, so a wait would show nothing.
			line = params.origin.type === OriginType.DAPP ? await this.joinLines(params) : undefined
			if (line) await this.waitForEarlierSends(params, params.hooks?.queuedJournalId, preController, line, slot)
			const claimed = await this.deps.lane.claimOrCreateJournal(
				params.networkId,
				params.accountAddress,
				params.origin,
				params.getCalls(),
				params.hooks,
				preController,
				params.fence,
			)
			journalId = claimed.journalId
			if (journalId) params.hooks?.onJournalCreated?.(journalId)
			const controller = claimed.controller
			const checkCancelled = (): void => {
				if (controller?.signal.aborted) throw new JobCancelledSentinel(journalId ?? "")
			}
			checkCancelled()

			return await run({
				journalId,
				controller,
				checkCancelled,
				markJournal: (patch) => this.deps.lane.markJournal(journalId, patch),
				recordCall: (txCalls) => this.deps.lane.recordBuiltCall(journalId, txCalls),
				commitSubmitting: (patch) => this.deps.lane.commitJournal(journalId, { stage: "submitting", ...patch }),
				park: async (wait) => {
					const own = journalId
					if (!own) throw new Error("A send with no record cannot wait")
					slot.release = await this.deps.lane.parkSlot(
						slot.release,
						params.networkId,
						own,
						params.fence,
						controller,
						params.hooks?.originKey,
						wait,
					)
					// Under the slot again, as at the first grant: a send of the account may have reached the
					// node while this one was parked, and the rebuild must not spend what it spends.
					if (line) await this.waitForEarlierSends(params, own, controller, line, slot)
					await this.deps.lane.reclaimParked(own)
				},
				leaveLine: () => line?.turn.leave(),
			})
		} catch (error) {
			await markFailedUnlessCancelled(error, journalId, this.deps.lane)
			// Nothing names the record before the claim; left `queued` or `pending`, it would wait for the reaper.
			if (!journalId) await this.deps.lane.failUnclaimed(params.hooks?.queuedJournalId, error)
			throw error
		} finally {
			line?.turn.leave()
			for (const waiter of line?.waiters ?? []) waiter.release()
			if (journalId) this.deps.lane.deleteController(journalId)
			// A pre-claim throw leaves `journalId` unset while `acquireSlot`
			// already registered the pre-controller under `queuedJournalId`;
			// the fresh-id fallbacks also make the two keys DIFFER after a
			// successful claim. Delete under both (idempotent) — always before
			// the slot release, matching the slot-scaffold ordering contract.
			const queuedKey = params.hooks?.queuedJournalId
			if (queuedKey && queuedKey !== journalId) this.deps.lane.deleteController(queuedKey)
			slot.release()
		}
	}

	/** Joins its origin's line and, with a waiter, the line of every account the send may spend from.
	 *  Called holding the slot, so both places are the grant order. */
	private async joinLines(params: {
		networkId: string
		accountAddress: string
		hooks: ExecutionHooks | undefined
		fence: ExecutionFence
		getAdditionalScopes: () => unknown
	}): Promise<DappSendLine> {
		const { chainId } = await this.deps.getNetwork(params.networkId)
		const scopes = spendAccounts(params.accountAddress, params.getAdditionalScopes()).map((account) => ({ chainId, account }))
		const waiters = scopes.map((scope) => this.deps.sequencer.enterWaiter(scope))
		// Last: a throw after it would leave a place in the origin's line that no `finally` frees.
		return { turn: this.deps.lane.joinOriginLine(params.fence, chainId, params.hooks?.originKey), scopes, waiters }
	}

	/**
	 * Parks outside the slot while an earlier send of the origin has not started, a waiter is
	 * blocked, or the PXE's node lacks a settled predecessor's block in one of its accounts, and
	 * re-checks under the slot, synchronously, each time it comes back. Past the waiters' 60 minutes
	 * the send runs unordered, the sequencer's degraded mode: the chain still refuses a real conflict.
	 */
	private async waitForEarlierSends(
		params: { networkId: string; hooks: ExecutionHooks | undefined; fence: ExecutionFence },
		journalId: string | undefined,
		preController: AbortController | undefined,
		line: DappSendLine,
		slot: { release: ExecutionMutexRelease },
	): Promise<void> {
		// A send with no record has no cancel to answer while it waits.
		const signal = preController?.signal ?? new AbortController().signal
		let unordered = false
		const held = () =>
			!unordered &&
			(line.waiters.some((w) => w.blocked()) ||
				line.scopes.some((s) => this.deps.chainTip.unconfirmed(s, undefined, params.networkId)))
		while (line.turn.behind() || held()) {
			slot.release = await this.deps.lane.parkSlot(
				slot.release,
				params.networkId,
				journalId,
				params.fence,
				preController,
				params.hooks?.originKey,
				async () => {
					if (!(await line.turn.earlierDone(signal))) throw new JobCancelledSentinel(journalId ?? "")
					unordered ||= await this.waitForEarlier(line, params.networkId, signal, journalId)
				},
			)
		}
	}

	/** The waiters' turns, then the tip in each account; `true` once their deadline has passed. */
	private async waitForEarlier(
		line: DappSendLine,
		networkId: string,
		signal: AbortSignal,
		journalId: string | undefined,
	): Promise<boolean> {
		for (const waiter of line.waiters) {
			const turn = await waiter.waitTurn(signal)
			if (turn === "aborted") throw new JobCancelledSentinel(journalId ?? "")
			if (turn === "expired") {
				this.deps.logDebug("dApp send reached its wait limit for earlier sends; running unordered")
				return true
			}
		}
		for (const scope of line.scopes) {
			const tip = await this.deps.chainTip.wait(scope, undefined, networkId, signal, line.waiters[0].remainingMs())
			if (tip === "aborted") throw new JobCancelledSentinel(journalId ?? "")
		}
		return false
	}

	/** `preview` names the popup interaction this estimate belongs to; when set,
	 *  the discovered authorizations are snapshotted under the returned
	 *  `previewId` so the confirm of THAT operation can be held to them. */
	public async estimateOperationFee(
		operation: Operation,
		feeSettings: FeeSettings,
		signal?: AbortSignal,
		preview?: PreviewContext,
	): Promise<TransferFeeEstimate> {
		if (operation.kind !== "send_transaction" && operation.kind !== "aztec_sendTx") {
			throw new Error("Only send_transaction and aztec_sendTx operations support fee estimation")
		}
		// Stage-boundary cancellation — see TransferExecutor.estimateFee.
		throwIfAborted(signal)
		const fence = await this.deps.captureExecutionFence()

		// Build actions array — clone to prevent mutation side effects
		let actions: Action[]
		let detectedFee: FeeOptions | undefined
		if (operation.kind === "aztec_sendTx") {
			const { actions: processedActions, feeOptions: fee } = await this.deps.planner.processAztecJsPayload(
				(operation as AztecSendTxOperation).exec,
				(operation as AztecSendTxOperation).opts ?? {},
			)
			actions = [...processedActions]
			detectedFee = fee
		} else {
			actions = [...(operation as SendTransactionOperation).actions]
		}
		// Reuse fingerprints bind the POST-PLANNER, PRE-DISCOVERY action set —
		// the consume side re-derives the same normalization point.
		const preDiscoveryActions = [...actions]
		const { sequenceEpoch, pendingHashes, lagging } = await this.reuseSnapshot(operation.networkId, operation.accountAddress)

		// Discover-then-estimate via the decorator (the single owner of that
		// choreography for dApp sends; stage-boundary cancellation preserved
		// inside it).
		throwIfAborted(signal)
		const { built, discovered } = await this.buildForEstimate(operation, actions, detectedFee, feeSettings, fence, signal)
		const { txRequest } = built
		throwIfAborted(signal)
		const log = (msg: string, data: object) => this.deps.logDebug(msg, data)
		const sponsorFunding = await probeSponsorFunding(built, this.deps.readPublicStorageOnce, log)
		const appPayerFunding = await probeAppPayerFunding(built, this.deps.readPublicStorageOnce, log)
		const feeJuiceShortfall = await probeOwnFeeJuice(built, this.deps.readPublicStorageOnce, log)
		throwIfAborted(signal)

		const identity = fingerprintInputFor(operation, feeSettings, detectedFee, preDiscoveryActions)
		const discoveredHashes = discovered.map((d) => d.messageHash)
		const estimateId = lagging
			? undefined
			: await this.stashOperationEstimate(operation, identity, detectedFee, built, discoveredHashes, { sequenceEpoch, pendingHashes })
		// `send_transaction`'s confirm skips discovery, so listing what THIS estimate
		// found would show authorizations confirm never adds.
		const bound = operation.kind === "aztec_sendTx"
		const previewId =
			bound && preview
				? this.writePreview(preview, fingerprintOperation(identity), discoveredHashes, estimateId, discovered)
				: undefined

		const maxFeeRaw = BigInt(getEstimatedFee(txRequest))
		const priorityFee = priorityFeeOf(txRequest)
		return {
			maxFee: maxFeeRaw.toString(),
			...(feeDisplay(priorityFee, undefined).amount !== "0" ? { priorityFee: priorityFee.toString() } : {}),
			gasDetails: getGasDetails(txRequest),
			estimateId,
			previewId,
			...(bound ? { discoveredAuthwits: discovered } : {}),
			...(sponsorFunding ? { sponsorFunding } : {}),
			...(appPayerFunding ? { appPayerFunding } : {}),
			...(feeJuiceShortfall ? { feeJuiceShortfall } : {}),
		}
	}

	/** Read before a build: a send that reaches the node, or settles, during it may hold this build's
	 *  notes. A settled predecessor's block the node lacks changes neither the epoch nor the pending
	 *  set once it lands, so a build simulated while it `lagging` must not be reused. */
	private async reuseSnapshot(networkId: string, account: string): Promise<ReuseSnapshot> {
		const { chainId } = await this.deps.getNetwork(networkId)
		return {
			sequenceEpoch: this.deps.sequenceEpoch(chainId, account),
			pendingHashes: this.deps.getPendingForAccount(account).map((tx) => tx.hash),
			lagging: this.deps.chainTip.unconfirmed({ chainId, account }, undefined, networkId),
		}
	}

	/** An embedded fee payment skips discovery, as its confirm does: the app's own fee calls conflict
	 *  with the discovery simulation's dummy fee method. */
	private async buildForEstimate(
		operation: Operation,
		actions: Action[],
		detectedFee: FeeOptions | undefined,
		feeSettings: FeeSettings,
		fence: ExecutionFence,
		signal?: AbortSignal,
	): Promise<{ built: FeeEstimate; discovered: readonly DiscoveredAuthwit[] }> {
		const fee = detectedFee ?? (operation as SendTransactionOperation).fee
		if (!fee?.embeddedFeePayment) {
			return this.deps.estimateWithDiscovery.estimate(operation, actions, detectedFee, feeSettings, fence, undefined, signal)
		}
		const op = { ...(operation as SendTransactionOperation), actions: [...actions], fee }
		return { built: await this.deps.buildAndEstimateValidated(op, feeSettings, fence, undefined, signal), discovered: [] }
	}

	/**
	 * Discover, without signing, the private authorizations a NO_FROM
	 * (`default_entrypoint`) operation would need — the confirm path signs at
	 * send and has no estimate, so this is the only preview it gets. Built from
	 * the same canonical inputs and pre-discovery preparation confirm uses.
	 */
	public async previewOperationAuthwits(op: Operation, preview: PreviewContext, signal?: AbortSignal): Promise<OperationAuthwitPreview> {
		if (op.kind !== "aztec_sendTx" || op.executionMode !== "default_entrypoint") {
			throw new Error("Only default_entrypoint aztec_sendTx operations support an authorization preview")
		}
		throwIfAborted(signal)
		const fence = await this.deps.captureExecutionFence()
		const prepared = await this.prepareNoFrom(op, fence)
		throwIfAborted(signal)
		const discovered = await this.discoverNoFromAuthwits(prepared)
		throwIfAborted(signal)
		const records = discovered.map((d) => d.record)
		const previewId = this.writePreview(
			preview,
			noFromFingerprint(op),
			records.map((r) => r.messageHash),
			undefined,
		)
		return { previewId, discoveredAuthwits: records }
	}

	private writePreview(
		preview: PreviewContext,
		fingerprint: string | null,
		discoveredHashes: readonly string[],
		estimateId: string | undefined,
		discoveredAuthwits?: readonly DiscoveredAuthwit[],
	): string {
		const previewId = estimateId ?? crypto.randomUUID()
		this.deps.previewSnapshots.stash(previewId, { ...preview, fingerprint, discoveredHashes, discoveredAuthwits })
		return previewId
	}

	/** The producer mints `previewId = estimateId` for a standard bound estimate, so a popup that
	 *  carries an `estimateId` must carry the equal `previewId`. Anything else is a forged
	 *  cross-request approval (interaction A's reuse id with interaction B's snapshot id) and is
	 *  refused BEFORE the reuse cache is consumed, so a foreign id never even pops an entry. */
	private assertEstimateBinding(approval: OperationApprovalEnvelope | undefined): void {
		if (!approval || approval.estimateId === undefined) return
		if (approval.previewId !== approval.estimateId) throw new Error(PREVIEW_FOREIGN_MESSAGE)
	}

	/** Pop the preview snapshot the popup owns, up front — BEFORE the reuse cache is consumed, so a
	 *  `found` result is what licenses reuse. A `foreign` id (naming another interaction / index /
	 *  fingerprint) is refused here; `missing` (no owned snapshot) forces a fresh rebuild rather than
	 *  reusing a fingerprint-identical build the popup never previewed. The silent path carries no
	 *  envelope, is never reuse-eligible, and is not held — the caller passes `undefined` then. */
	private takeStandardPreview(approval: OperationApprovalEnvelope, fingerprint: string | null): PreviewLookup {
		const lookup = this.deps.previewSnapshots.take(approval.previewId, {
			interactionId: approval.interactionId,
			index: approval.index,
			fingerprint,
		})
		if (lookup.kind === "foreign") throw new Error(PREVIEW_FOREIGN_MESSAGE)
		return lookup
	}

	/** Popup approvals only: hold what confirm is about to sign to the snapshot
	 *  the card showed. A silent execution carries no envelope and is not held. */
	private enforcePreview(
		approval: OperationApprovalEnvelope | undefined,
		fingerprint: string | null,
		recomputedHashes: readonly string[],
	): void {
		if (!approval) return
		this.assertEstimateBinding(approval)
		const lookup = this.deps.previewSnapshots.take(approval.previewId, {
			interactionId: approval.interactionId,
			index: approval.index,
			fingerprint,
		})
		assertWithinPreview(lookup, recomputedHashes)
	}

	/** Best-effort reuse stash. Eligibility mirrors the Send-page cache's
	 *  fj/fpc rule, narrowed to standard-mode `aztec_sendTx`:
	 *  `send_transaction`'s confirm path skips authwit discovery today, so
	 *  reusing a discovery-inclusive estimate there would CHANGE its
	 *  behavior — it stays carve-out. Embedded fee payments keep their
	 *  divergent-path exclusion. A non-fingerprintable op (exotic arg
	 *  values) is silently ineligible — the estimate itself still returns. */
	private async stashOperationEstimate(
		operation: Operation,
		identity: OperationFingerprintInput,
		detectedFee: FeeOptions | undefined,
		built: Pick<
			FeeEstimate,
			| "network"
			| "txRequest"
			| "chainIdentity"
			| "fpcIdentity"
			| "initializesAccount"
			| "feePaymentMethod"
			| "txCalls"
			| "pendingPublicAuthwits"
		> & { nonce: { toString(): string } },
		discoveredHashes: readonly string[],
		before: { sequenceEpoch: number; pendingHashes: readonly string[] },
		/** The profile the build answered to; the active one when absent. */
		profileId?: string,
	): Promise<string | undefined> {
		const { feeSettings } = identity
		const kind = feeSettings.paymentMethod.kind
		const eligible =
			operation.kind === "aztec_sendTx" &&
			((operation as AztecSendTxOperation).executionMode ?? "standard") !== "default_entrypoint" &&
			!detectedFee?.embeddedFeePayment &&
			// A dApp-supplied fee cap or priority fee makes the built request's
			// maxFees diverge from the predicted-worst basis the consume ladder
			// re-derives, which carries neither.
			!detectedFee?.maxFeesPerGas &&
			!detectedFee?.maxPriorityFeesPerGas &&
			(kind === "fj" || kind === "fpc")
		if (!eligible) return undefined
		try {
			const fingerprint = fingerprintOperation(identity)
			if (fingerprint === null) return undefined
			const primary = findPrimaryEndpoint(built.network)
			if (!primary) return undefined
			const owner = profileId ?? (await this.deps.getActiveProfile())?.id
			if (!owner) return undefined
			const builtCap = builtCapOf(built.txRequest)
			const estimateId = crypto.randomUUID()
			this.deps.operationEstimateReuse.stash(estimateId, {
				fingerprint,
				accountAddress: operation.accountAddress,
				networkId: operation.networkId,
				feeSettings,
				profileId: owner,
				// The BUILDER's asserted pair, never a refetch — a refetch after
				// an endpoint flip would snapshot a chain this request was not
				// signed under (consume would then compare live-vs-live).
				chainIdentity: built.chainIdentity,
				builtCap,
				primaryEndpointId: primary.id,
				primaryEndpointUrl: primary.rpcUrl,
				sequenceEpoch: before.sequenceEpoch,
				pendingHashes: before.pendingHashes,
				fpcIdentity: built.fpcIdentity,
				txRequest: built.txRequest,
				initializesAccount: built.initializesAccount,
				nonce: built.nonce,
				feePaymentMethod: built.feePaymentMethod,
				txCalls: built.txCalls,
				pendingPublicAuthwits: built.pendingPublicAuthwits,
				discoveredHashes,
				builtAt: Date.now(),
			})
			return estimateId
		} catch (error) {
			// Cache write is best-effort — the estimate result still goes out.
			this.deps.logDebug("estimateOperationFee: cache write skipped", error)
			return undefined
		}
	}

	/** One post-send closure owns BOTH the activity record AND the public-authwit index write, so the
	 *  ordering is explicit. Recording here (not at build) is what keeps estimate/reject from leaking a
	 *  grant; the rows land `pending` and are reconciled by the tx's on-chain outcome. The node has
	 *  accepted the tx, so its grants can land: the index write runs once the activity record settles,
	 *  whatever its outcome, and the record's error, when there is one, is the one the caller sees. */
	private sentTxRecorder(sent: SentTx): (hash: string) => Promise<void> {
		const feeChoice = this.feeChoiceFor(sent.feeChosenBy, sent.network.chainId, sent.txCalls)
		return async (hash) => {
			const account = sent.account.address.toString()
			let recordFailed = false
			let recordError: unknown
			try {
				await this.deps.addTransaction({
					origin: sent.origin,
					chainId: sent.network.chainId,
					account,
					calls: sent.txCalls,
					nonce: sent.nonce.toString(),
					feePaymentMethod: sent.feePaymentMethod,
					hash,
					submittedEndpointUrl: primaryEndpointUrl(sent.network),
					estimatedFee: getEstimatedFee(sent.txRequest),
					gasDetails: getGasDetails(sent.txRequest),
					fence: sent.fence,
					networkId: sent.networkId,
					feeChoice: await feeChoice,
				})
			} catch (error) {
				recordFailed = true
				recordError = error
			}
			await this.indexGrants(sent, account, hash, recordFailed)
			if (recordFailed) throw recordError
		}
	}

	/** Scoped to the SENDING tx's (profileId, chainId, account); the profile and its deletion epoch are
	 *  the fence's. */
	private async indexGrants(sent: SentTx, account: string, hash: string, recordFailed: boolean): Promise<void> {
		if (sent.pendingPublicAuthwits.length === 0) return
		try {
			await this.deps.recordPendingAuthwits(
				{ profileId: sent.fence.profileId, chainId: sent.network.chainId, account },
				sent.pendingPublicAuthwits,
				hash,
				sent.fence.epoch,
			)
		} catch (error) {
			if (!recordFailed) throw error
			this.deps.logDebug("sent tx: the authwit index write failed after its activity record did", { error })
		}
	}

	/** Started before the prove to overlap the derivation. Never rejects: an address the wallet cannot
	 *  derive leaves the app's plain pick, which is never wrong. */
	private async feeChoiceFor(by: FeeChooser, chainId: number, calls: SentTx["txCalls"]): Promise<FeeChoice> {
		if (by === "wallet") return "wallet"
		let sponsor: string | undefined
		try {
			sponsor = await this.deps.protocolSponsorAddress(chainId)
		} catch (error) {
			this.deps.logDebug("fee chooser: the protocol sponsor's address is unavailable", { error })
		}
		return feeChoiceOf(by, calls, sponsor)
	}

	public async executeSendTransaction(
		op: SendTransactionOperation,
		origin: LocalTxOrigin,
		parentTask: WrappedTask | undefined,
		fence: ExecutionFence,
		hooks?: ExecutionHooks,
		approval?: OperationApprovalEnvelope,
	): Promise<string> {
		// The SW materializes every operation it executes, so a missing
		// feeSettings here is a materializer or fee-delta bug — fail before the
		// build dereferences it.
		if (!op.feeSettings) {
			throw new Error("send_transaction: feeSettings is required")
		}

		// Take the shared execution slot + journal scaffold (runInSlot) like
		// the other two dApp-send pipelines. Without it, two concurrent
		// send_transaction ops (e.g. a dApp calling grantPublicAuthwit twice, or one
		// racing an in-flight aztec_sendTx on the same account) run simulateTx/proveTx
		// concurrently against the same PXE + account → stale-private-note interleaving
		// → double-spent nullifier / on-chain-rejected tx. The journal record is
		// created inside claimOrCreateJournal (identical shape to the prior
		// beginJournal); the primary-method calls are a thunk so they read after
		// acquireSlot. hooks (esp. originKey) bucket the slot per-origin.
		return this.runInSlot(
			{
				networkId: op.networkId,
				accountAddress: op.accountAddress,
				origin,
				hooks,
				fence,
				getCalls: () => primaryActionCalls(op.actions),
				getAdditionalScopes: () => undefined,
			},
			async (ctx) => {
				// Enter `simulating` BEFORE the build/estimate work — fee
				// strategies inside the build run real simulateTx calls (can be
				// several seconds), and leaving the journal at `pending` would
				// hide that from the popup.
				await ctx.markJournal({ stage: "simulating" })
				ctx.checkCancelled()

				let ceiling = approval?.feeCeiling
				for (;;) {
					const pass = await this.sendTransactionPass(op, fence, parentTask, approval, ceiling, ctx)
					if ("built" in pass) return this.proveSendTransaction(op, origin, parentTask, fence, ctx, pass.built)
					ceiling = await this.askAboutFee(ctx, approval, pass.over)
				}
			},
		)
	}

	/** One build; above the approved figure only the question leaves this frame. */
	private async sendTransactionPass(
		op: SendTransactionOperation,
		fence: ExecutionFence,
		parentTask: WrappedTask | undefined,
		approval: OperationApprovalEnvelope | undefined,
		ceiling: string | undefined,
		ctx: SlotRun,
	): Promise<{ built: FeeEstimate } | { over: OverCeiling }> {
		const built = await this.deps.buildAndEstimateValidated(op, op.feeSettings, fence, parentTask, undefined, ctx.recordCall)
		const reask = overCeiling(approval, ceiling, built)
		return reask ? { over: { reask } } : { built }
	}

	private async proveSendTransaction(
		op: SendTransactionOperation,
		origin: LocalTxOrigin,
		parentTask: WrappedTask | undefined,
		fence: ExecutionFence,
		ctx: SlotRun,
		built: FeeEstimate,
	): Promise<string> {
		const { txRequest, node, pxe, account, network, nonce, txCalls, feePaymentMethod, pendingPublicAuthwits, initializesAccount } =
			built
		ctx.leaveLine()
		const { txHash } = await this.deps.coordinator.proveAndSend({
			pxe,
			node,
			txRequest,
			initializesAccount,
			scopes: [account.address],
			parentTask,
			journalId: ctx.journalId,
			checkCancelled: ctx.checkCancelled,
			...fenceChecks(this.deps, fence),
			markJournal: ctx.markJournal,
			commitSubmitting: ctx.commitSubmitting,
			submittedEndpointUrl: primaryEndpointUrl(network),
			onSent: (hash) => this.deps.noteSent(network.chainId, account.address.toString(), hash, txCalls),
			// grantPublicAuthwit routes here (kind: send_transaction), so this is where a granted
			// authwit is recorded.
			recordTransaction: this.sentTxRecorder({
				origin,
				network,
				account,
				txCalls,
				nonce,
				feePaymentMethod,
				txRequest,
				fence,
				networkId: op.networkId,
				pendingPublicAuthwits,
				feeChosenBy: feeChooserOf(op.feeSettings),
			}),
		})
		return txHash.toString()
	}

	/**
	 * Holds a send whose build came out above the approved figure outside the slot until the person
	 * answers, and returns the figure they accepted, the next build's ceiling. The question stays open
	 * for {@link MAX_WAIT_MS}; the window that asks it closes at the same moment.
	 */
	private async askAboutFee(ctx: SlotRun, approval: OperationApprovalEnvelope | undefined, over: OverCeiling): Promise<string> {
		const { journalId, controller } = ctx
		if (!approval || !journalId || !controller) throw new Error("A send with no record cannot be asked about its fee")
		const { reask, shown } = over
		const deadline = Date.now() + MAX_WAIT_MS
		const { interactionId, index } = approval
		await ctx.park(() =>
			askFeeAgain(
				{
					answers: this.deps.answers,
					transitionJournal: (id, progress) => this.deps.lane.commitJournal(id, progress),
					beginQueuedWait: (id) => this.deps.lane.beginQueuedWait(id),
					endQueuedWait: (id) => this.deps.lane.endQueuedWait(id),
					logDebug: (msg) => this.deps.logDebug(msg),
				},
				{
					journalId,
					controller,
					reask,
					ms: deadline - Date.now(),
					onAsked: () =>
						this.deps.askInWindow({
							interactionId,
							index,
							journalId,
							reask,
							deadline,
							...(shown && { discoveredAuthwits: shown }),
						}),
				},
			),
		)
		await ctx.markJournal({ stage: "simulating" })
		ctx.checkCancelled()
		return reask.fee
	}

	/** `approval` is present only for popup-approved executions; it carries the
	 *  reuse and preview ids the popup handed back and binds them to the
	 *  interaction the SW materialized this operation from. */
	public async executeAztecSendTx(
		op: AztecSendTxOperation,
		origin: LocalTxOrigin,
		parentTask: WrappedTask | undefined,
		hooks: ExecutionHooks | undefined,
		fence: ExecutionFence,
		approval?: OperationApprovalEnvelope,
	): Promise<SendReturn<InteractionWaitOptions>> {
		// `default_entrypoint` bypasses the standard tx-build pipeline and runs
		// its own kernelless discovery; hooks and the approval envelope travel
		// with it so the FIFO baton and the preview guard apply there too.
		if (op.executionMode === "default_entrypoint") {
			return this.executeNoFromSendTx(op, origin, parentTask, hooks, fence, approval)
		}

		// The SW materializes every operation it executes, so a missing
		// feeSettings here is a materializer or fee-delta bug — fail before the
		// build dereferences it. (NO_FROM tolerates missing feeSettings by
		// design — the dApp handles fee payment.)
		if (!op.feeSettings) {
			throw new Error("aztec_sendTx: feeSettings is required for the standard execution path")
		}

		// The standard path takes the shared execution slot + journal scaffold
		// (runInSlot); its `run` owns the opts.from guard, payload parse, its own
		// `simulating` checkpoint, authwit discovery, build, and prove/send. The
		// primary-method extraction is a thunk so it runs after acquireSlot.
		return this.runInSlot(
			{
				networkId: op.networkId,
				accountAddress: op.accountAddress,
				origin,
				hooks,
				fence,
				getCalls: () => primaryMethodCalls(op),
				getAdditionalScopes: () => op.opts?.additionalScopes,
			},
			async (ctx) => {
				if (op.accountAddress !== op.opts?.from?.toString()) {
					throw new Error("Invalid `opts.from`")
				}

				const { actions, feeOptions: fee } = await this.deps.planner.processAztecJsPayload(op.exec, op.opts)

				// Enter `simulating` BEFORE authwit discovery (which runs real
				// `pxe.simulateTx`). Keeps the holder out of the short-grace `pending`
				// window during a potentially-slow discovery + build. Marked HERE (not
				// in runInSlot) so it stays AFTER the opts.from guard + payload parse —
				// those failures must remain `pending → failed`, not go via simulating.
				await ctx.markJournal({ stage: "simulating" })
				ctx.checkCancelled()

				// Refuse a forged estimateId/previewId pairing before the reuse cache is touched.
				this.assertEstimateBinding(approval)
				const identity = fingerprintInputFor(op, op.feeSettings, fee, actions)
				// Pop the snapshot before any reuse, and keep that one lookup to reconcile every build after.
				const preview = approval ? this.takeStandardPreview(approval, fingerprintOperation(identity)) : undefined
				const run: StandardRun = {
					op,
					identity,
					fence,
					parentTask,
					checkCancelled: ctx.checkCancelled,
					recordCall: ctx.recordCall,
					preview,
					approval,
				}
				let reuseId = preview?.kind === "found" ? approval?.estimateId : undefined
				let ceiling = approval?.feeCeiling
				let stashId: string | undefined
				try {
					for (;;) {
						const pass = await this.standardPass(run, reuseId, ceiling)
						if ("built" in pass) return await this.proveStandardSend(op, origin, parentTask, fence, ctx, pass.built)
						stashId = pass.over.stashId
						reuseId = stashId
						ceiling = await this.askAboutFee(ctx, approval, pass.over)
					}
				} finally {
					if (stashId) this.deps.operationEstimateReuse.evict(stashId)
				}
			},
		)
	}

	/** One build held to the preview and the approved figure; above the figure the build is stashed
	 *  for the accept and only the question leaves this frame. */
	private async standardPass(
		run: StandardRun,
		reuseId: string | undefined,
		ceiling: string | undefined,
	): Promise<{ built: StandardBuild } | { over: OverCeiling }> {
		const { op, identity, fence, parentTask, checkCancelled, preview, approval } = run
		const before = await this.reuseSnapshot(op.networkId, op.accountAddress)
		const built = await this.resolveStandardBuild(op, identity, reuseId, fence, parentTask, checkCancelled, run.recordCall)
		if (preview) assertWithinPreview(preview, built.discoveredHashes)
		checkCancelled()
		const reask = overCeiling(approval, ceiling, built)
		if (!reask) return { built }
		const shown = preview?.kind === "found" ? preview.snapshot.discoveredAuthwits : undefined
		return { over: { reask, stashId: await this.restash(op, identity, built, before, fence.profileId), shown } }
	}

	/** A consumed entry goes back as it was, so its `builtAt` still bounds how long the signed request
	 *  stays in memory; a fresh build is stashed as an estimate's would be. */
	private async restash(
		op: AztecSendTxOperation,
		identity: OperationFingerprintInput,
		built: StandardBuild,
		before: ReuseSnapshot,
		profileId: string,
	): Promise<string | undefined> {
		if (built.reused) {
			const stashId = crypto.randomUUID()
			this.deps.operationEstimateReuse.stash(stashId, built.reused)
			return stashId
		}
		if (before.lagging) return undefined
		return this.stashOperationEstimate(op, identity, identity.fee, built, built.discoveredHashes, before, profileId)
	}

	private async proveStandardSend(
		op: AztecSendTxOperation,
		origin: LocalTxOrigin,
		parentTask: WrappedTask | undefined,
		fence: ExecutionFence,
		ctx: SlotRun,
		built: StandardBuild,
	): Promise<SendReturn<InteractionWaitOptions>> {
		const { txRequest, node, pxe, account, network, nonce, txCalls, feePaymentMethod, pendingPublicAuthwits, initializesAccount } =
			built
		const sendAdditionalScopes = Array.isArray(op.opts.additionalScopes) ? op.opts.additionalScopes : []
		ctx.leaveLine()
		const { txHash, offchainOutput } = await this.deps.coordinator.proveAndSend({
			pxe,
			node,
			txRequest,
			initializesAccount,
			scopes: [account.address, ...sendAdditionalScopes],
			parentTask,
			journalId: ctx.journalId,
			checkCancelled: ctx.checkCancelled,
			...fenceChecks(this.deps, fence),
			markJournal: ctx.markJournal,
			commitSubmitting: ctx.commitSubmitting,
			submittedEndpointUrl: primaryEndpointUrl(network),
			onSent: (hash) => this.deps.noteSent(network.chainId, account.address.toString(), hash, txCalls),
			wantOffchainOutput: offchainOutputOf,
			recordTransaction: this.sentTxRecorder({
				origin,
				network,
				account,
				txCalls,
				nonce,
				feePaymentMethod,
				txRequest,
				fence,
				networkId: op.networkId,
				pendingPublicAuthwits,
				feeChosenBy: feeChooserOf(op.feeSettings),
			}),
		})

		if (op.opts.wait === "NO_WAIT") {
			return { txHash, ...offchainOutput } as SendReturn<InteractionWaitOptions>
		}
		const receipt = await node.getTxReceipt(txHash)
		return { receipt, ...offchainOutput } as SendReturn<InteractionWaitOptions>
	}

	/**
	 * Resolve the standard path's build: consume a still-valid precomputed estimate
	 * (tryConsume validates the full drift ladder — fingerprint at the same
	 * pre-discovery normalization point, endpoint, pending set, sequencer epoch, chain identity,
	 * FPC identity, base fee — and refuses another profile's entry outright),
	 * else fall through to the full build —
	 * probe-free for embedded fee payments (the dApp's own fee calls conflict with
	 * the discovery simulation's dummy fee method), discovery-first otherwise.
	 */
	private async resolveStandardBuild(
		op: AztecSendTxOperation,
		identity: OperationFingerprintInput,
		estimateId: string | undefined,
		fence: ExecutionFence,
		parentTask: WrappedTask | undefined,
		checkCancelled: () => void,
		onBuilt: OnBuilt,
	): Promise<StandardBuild> {
		const { actions, fee } = identity
		const reused = estimateId ? await this.deps.operationEstimateReuse.tryConsume(estimateId, identity, fence) : undefined

		if (reused) {
			this.deps.logDebug(`[executeAztecSendTx] reusing precomputed estimate ${estimateId}`)
			// Live handles are re-resolved, never cached, for the fence's profile.
			const network = await this.deps.getNetwork(op.networkId)
			const node = await this.deps.getNode(network.chainId)
			const pxe = this.deps.getPXE(network)
			await this.deps.assertFence(fence)
			const account = await this.deps.getAccountContract(fence.profileId, network.chainId, op.accountAddress)
			// The lookup reads whichever session is live: re-check the fence before its keys are used.
			fenceChecks(this.deps, fence).assertLive()
			// The estimate's build ran outside this send, so its calls name the record only now.
			await onBuilt(reused.txCalls)
			return {
				txRequest: reused.txRequest,
				node,
				pxe,
				account,
				network,
				// The entry retains the exact build — its provenance rides along.
				initializesAccount: reused.initializesAccount,
				nonce: reused.nonce,
				txCalls: reused.txCalls,
				feePaymentMethod: reused.feePaymentMethod,
				pendingPublicAuthwits: [...reused.pendingPublicAuthwits],
				discoveredHashes: reused.discoveredHashes,
				chainIdentity: reused.chainIdentity,
				fpcIdentity: reused.fpcIdentity,
				reused,
			}
		}
		if (fee?.embeddedFeePayment) {
			// Embedded fee payments skip discovery entirely. Probe-free validated
			// pipeline, as always.
			checkCancelled()
			const built = await this.deps.buildAndEstimateValidated(
				{ ...op, actions: [...actions], fee },
				op.feeSettings,
				fence,
				parentTask,
				undefined,
				onBuilt,
			)
			return { ...built, discoveredHashes: [] }
		}
		const { built, discovered } = await this.deps.estimateWithDiscovery.estimate(
			op,
			actions,
			fee,
			op.feeSettings,
			fence,
			parentTask,
			undefined,
			onBuilt,
		)
		if (discovered.length) {
			this.deps.logDebug(`[executeAztecSendTx] Discovered ${discovered.length} auth witness(es) via offchain effects`)
		}
		checkCancelled()
		return { ...built, discoveredHashes: discovered.map((d) => d.messageHash) }
	}

	/**
	 * Execute a NO_FROM (DefaultEntrypoint) transaction.
	 * The dApp's ExecutionPayload is passed directly to DefaultEntrypoint — no account
	 * contract wrapping, no wallet auth witness discovery, no call mutation.
	 */
	private async executeNoFromSendTx(
		op: AztecSendTxOperation,
		origin: LocalTxOrigin,
		parentTask: WrappedTask | undefined,
		hooks: ExecutionHooks | undefined,
		fence: ExecutionFence,
		approval?: OperationApprovalEnvelope,
	): Promise<SendReturn<InteractionWaitOptions>> {
		this.deps.logDebug(
			`executeNoFromSendTx: starting, accountAddress=${op.accountAddress}, calls=${op.exec?.calls?.length}, additionalScopes=${JSON.stringify(op.opts?.additionalScopes)}`,
		)
		if (op.feeSettings?.paymentMethod?.kind && op.feeSettings.paymentMethod.kind !== "embedded") {
			throw new Error("DefaultEntrypoint transactions must use embedded fee payment")
		}

		// NO_FROM takes the SAME shared execution slot + journal scaffold
		// (runInSlot) as the standard path. It has no nonce at all (history
		// records Fr.ZERO), so the mutex is its ONLY protection against
		// concurrent build/simulate interleaving. Unlike the standard path it
		// does NOT re-check cancel after `simulating` — preserved verbatim. The
		// primary-method extraction is a thunk so it runs after acquireSlot.
		return this.runInSlot(
			{
				networkId: op.networkId,
				accountAddress: op.accountAddress,
				origin,
				hooks,
				fence,
				getCalls: () => primaryMethodCalls(op),
				getAdditionalScopes: () => op.opts?.additionalScopes,
			},
			async ({ checkCancelled, markJournal, recordCall, commitSubmitting, journalId, leaveLine }) => {
				await markJournal({ stage: "simulating" })

				const prepared = await this.prepareNoFrom(op, fence, parentTask)
				const { txRequest, node, pxe, account, network, txCalls, txsLimits, feeOpts, scopesWithAccount } = prepared
				await recordCall(txCalls)

				await this.addDiscoveredNoFromAuthwits(prepared, approval, noFromFingerprint(op))

				this.deps.logDebug(`executeNoFromSendTx: authwits added: ${txRequest.authWitnesses.length}, starting real simulation`)
				// Real simulation with actual auth witnesses and real account contract
				const simulatedTx = await this.deps.coordinator.simulateTxTask(
					pxe,
					txRequest,
					{ simulatePublic: true, skipFeeEnforcement: true, scopes: scopesWithAccount },
					parentTask,
				)
				await finalizeGasLimits(node, txRequest, simulatedTx, { gasPadding: 1, customLimits: feeOpts, feeMultiplier: 1, txsLimits })
				const submittedEndpointUrl = primaryEndpointUrl(network)
				// The request carries its own fee payment, so the choice is always the app's.
				const feeChoice = this.feeChoiceFor("app", network.chainId, txCalls)
				leaveLine()

				// Prove with account in scope
				const { txHash, offchainOutput } = await this.deps.coordinator.proveAndSend({
					pxe,
					node,
					txRequest,
					scopes: scopesWithAccount,
					parentTask,
					journalId,
					checkCancelled,
					...fenceChecks(this.deps, fence),
					markJournal,
					commitSubmitting,
					submittedEndpointUrl,
					onSent: (hash) => this.deps.noteSent(network.chainId, account.address.toString(), hash, txCalls),
					wantOffchainOutput: offchainOutputOf,
					recordTransaction: async (hash) =>
						this.deps.addTransaction({
							origin,
							chainId: network.chainId,
							account: account.address.toString(),
							calls: txCalls,
							nonce: Fr.ZERO.toString(),
							feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
							hash,
							submittedEndpointUrl,
							estimatedFee: getEstimatedFee(txRequest),
							gasDetails: getGasDetails(txRequest),
							fence,
							networkId: op.networkId,
							feeChoice: await feeChoice,
						}),
				})

				if (op.opts.wait === "NO_WAIT") {
					return { txHash, ...offchainOutput } as SendReturn<InteractionWaitOptions>
				}
				const receipt = await node.getTxReceipt(txHash)
				return { receipt, ...offchainOutput } as SendReturn<InteractionWaitOptions>
			},
		)
	}

	/**
	 * The pre-discovery NO_FROM build: the request, its fee options and the
	 * de-duplicated scope sets — shared by the authorization preview and the
	 * confirm so both discover against the same request.
	 */
	private async prepareNoFrom(op: AztecSendTxOperation, fence: ExecutionFence, parentTask?: WrappedTask): Promise<PreparedNoFrom> {
		const { txRequest, node, pxe, account, network, txCalls, txsLimits } = await this.deps.txBuilder.buildNoFrom(op, fence, parentTask)
		this.deps.logDebug(
			`executeNoFromSendTx: buildNoFromTxRequest completed, txCalls=${txCalls.length}, account=${account.address.toString()}`,
		)

		// NO_FROM is enforced to use embedded payment, so `embeddedFeePayment` is
		// set explicitly here (the planner-built path infers it) — that is what
		// gates `applyEmbeddedFpcGasCap`; see the helper's JSDoc for the cap rationale.
		const maxFeesUpstream = op.opts.fee?.gasSettings?.maxFeesPerGas
		const maxPriorityFeesUpstream = op.opts.fee?.gasSettings?.maxPriorityFeesPerGas
		const feeOpts: FeeOptions = {
			embeddedFeePayment: detectEmbeddedFeePayment(op.exec?.feePayer, op.opts.from, op.exec?.calls) ?? "fpc",
			gasLimits: op.opts.fee?.gasSettings?.gasLimits,
			teardownGasLimits: op.opts.fee?.gasSettings?.teardownGasLimits,
			maxFeesPerGas: maxFeesUpstream
				? { feePerDaGas: maxFeesUpstream.feePerDaGas.toString(), feePerL2Gas: maxFeesUpstream.feePerL2Gas.toString() }
				: undefined,
			maxPriorityFeesPerGas: maxPriorityFeesUpstream
				? {
						feePerDaGas: maxPriorityFeesUpstream.feePerDaGas.toString(),
						feePerL2Gas: maxPriorityFeesUpstream.feePerL2Gas.toString(),
					}
				: undefined,
			gasPadding: 1,
		}
		suggestGasLimits(txRequest, feeOpts)
		await applyEmbeddedFpcGasCap(txRequest, feeOpts, node)

		const { dappScopesCount, additionalScopes, scopesWithAccount } = dedupNoFromScopes(op.opts.additionalScopes, account.address)
		// Counts, not the arrays: these are viewing-key scopes — the set of addresses whose
		// private state this dApp can see — and pre-stringifying them would put them beyond
		// the logger's reach.
		this.deps.logDebug(
			`executeNoFromSendTx: dappScopes=${dappScopesCount}, additionalScopes=${additionalScopes.length}, scopesWithAccount=${scopesWithAccount.length}`,
		)
		return { txRequest, node, pxe, account, network, txCalls, txsLimits, feeOpts, additionalScopes, scopesWithAccount }
	}

	/**
	 * Kernelless auth witness discovery for the NO_FROM path: stub the user's account so
	 * verify_private_authwit doesn't fail on missing witnesses (the stub accepts any
	 * authwit during simulation) and decode each CallAuthorizationRequest the run
	 * emitted. The discovery result is ONLY used to read offchain effects — never for
	 * proving or gas estimation. `chainInfo` derives from the LIVE
	 * node, rebound to the selected network, before constructing the authwit message hash.
	 */
	private async discoverNoFromAuthwits(
		d: Pick<PreparedNoFrom, "pxe" | "node" | "network" | "account" | "txRequest" | "additionalScopes">,
	): Promise<{ record: DiscoveredAuthwit; messageHash: Fr }[]> {
		this.deps.logDebug(`executeNoFromSendTx: starting kernelless discovery simulation`)
		const discoveryResult = await d.pxe.simulateTx(
			d.txRequest,
			{ simulatePublic: true, skipTxValidation: true, skipFeeEnforcement: true, scopes: d.additionalScopes },
			[d.account.address.toString()],
		)

		this.deps.logDebug(`executeNoFromSendTx: kernelless discovery completed`)
		const effects = collectOffchainEffects(discoveryResult.privateExecutionResult)
		this.deps.logDebug(`executeNoFromSendTx: offchain effects found: ${effects.length}`)
		if (!effects.length) return []
		const nodeInfo2 = await d.node.getNodeInfo()
		return decodeAuthwitEffects(effects, liveChainInfo(d.network, nodeInfo2))
	}

	/** Sign every discovered authorization into `txRequest.authWitnesses` — after
	 *  the whole set has been held to the preview, so no witness is created for
	 *  a request the user never saw. */
	private async addDiscoveredNoFromAuthwits(
		d: PreparedNoFrom,
		approval: OperationApprovalEnvelope | undefined,
		fingerprint: string | null,
	): Promise<void> {
		const discovered = await this.discoverNoFromAuthwits(d)
		this.enforcePreview(
			approval,
			fingerprint,
			discovered.map((x) => x.record.messageHash),
		)
		for (const { messageHash } of discovered) {
			d.txRequest.authWitnesses.push(await d.account.createAuthWit(messageHash))
		}
	}
}

/** The send's account, then each additional scope the build reads notes for, once each. */
function spendAccounts(account: string, additionalScopes: unknown): string[] {
	const accounts = new Map<string, string>()
	for (const address of [account, ...(Array.isArray(additionalScopes) ? additionalScopes.map(String) : [])]) {
		if (!accounts.has(address.toLowerCase())) accounts.set(address.toLowerCase(), address)
	}
	return [...accounts.values()]
}

/** The shared picker, not the raw first call: it skips a leading self-pay fee payload, so the proving
 *  title and the settled record's agree. */
function primaryMethodCalls(op: AztecSendTxOperation): JournalCallCarrier[] | undefined {
	const primary = pickPrimaryWireCall(op.exec?.calls)
	if (!primary) return undefined
	const { to, args } = primary.call as Partial<Pick<FunctionCall, "to" | "args">>
	return [{ method: primary.name, call: journalCallOf(to?.toString(), args) }]
}

function offchainOutputOf(provedTx: TxProvingResult) {
	const timestamp = provedTx.publicInputs.constants.anchorBlockHeader.globalVariables.timestamp
	return extractOffchainOutput(provedTx.getOffchainEffects(), BigInt(timestamp))
}

/** Everything the NO_FROM path holds between its build and its discovery. */
interface PreparedNoFrom {
	txRequest: FeeEstimate["txRequest"]
	node: FeeEstimate["node"]
	pxe: FeeEstimate["pxe"]
	account: FeeEstimate["account"]
	network: Network
	txCalls: FeeEstimate["txCalls"]
	txsLimits: Awaited<ReturnType<TxRequestBuilder["buildNoFrom"]>>["txsLimits"]
	feeOpts: FeeOptions
	additionalScopes: AztecAddress[]
	scopesWithAccount: AztecAddress[]
}

/**
 * The question a popup-approved build asks when the person pays its fee and it rose past the approved
 * figure by more than the tolerance; `undefined` lets it prove. A silent or wallet send carries no
 * approval and is never held. A person-paid approval without a figure is refused, never sent unbound.
 */
function overCeiling(
	approval: OperationApprovalEnvelope | undefined,
	ceiling: string | undefined,
	built: Pick<FeeEstimate, "txRequest" | "feePaymentMethod" | "fpcIdentity" | "appPayer">,
): QueuedFeeReask | undefined {
	if (!approval) return undefined
	const payer = personalPayerOf(built)
	if (!payer) return undefined
	if (ceiling === undefined) throw new Error(MISSING_FEE_FIGURE)
	const fee = getEstimatedFee(built.txRequest)
	return feeRiseAsks(fee, ceiling) ? { fee, cap: ceiling, payer } : undefined
}

/** The reuse-fingerprint identity of a standard-mode dApp send: post-planner,
 *  pre-discovery actions with the wallet fee settings. Stash and consume MUST
 *  derive it at this same normalization point. */
function fingerprintInputFor(
	operation: SendTransactionOperation | AztecSendTxOperation,
	feeSettings: FeeSettings,
	detectedFee: FeeOptions | undefined,
	preDiscoveryActions: readonly Action[],
): OperationFingerprintInput {
	return {
		networkId: operation.networkId,
		accountAddress: operation.accountAddress,
		executionMode: (operation as AztecSendTxOperation).executionMode ?? "standard",
		from: (operation as AztecSendTxOperation).opts?.from?.toString() ?? "",
		actions: preDiscoveryActions,
		fee: detectedFee,
		feeSettings,
	}
}

function noFromFingerprint(op: AztecSendTxOperation): string | null {
	return fingerprintNoFromInputs({
		networkId: op.networkId,
		accountAddress: op.accountAddress,
		from: op.opts?.from?.toString() ?? "",
		calls: op.exec?.calls ?? [],
		authWitnesses: [...(op.exec?.authWitnesses ?? []), ...(op.opts?.authWitnesses ?? [])],
		capsules: [...(op.exec?.capsules ?? []), ...(op.opts?.capsules ?? [])],
		extraHashedArgs: op.exec?.extraHashedArgs ?? [],
		gasSettings: op.opts?.fee?.gasSettings,
		additionalScopes: op.opts?.additionalScopes ?? [],
	})
}

/** Viewing-key scope sets for the NO_FROM path, de-duped by hex (AztecAddress is a
 *  class — Set de-dups by ref, not value). */
function dedupNoFromScopes(
	rawScopes: unknown,
	accountAddress: AztecAddress,
): { dappScopesCount: number; additionalScopes: AztecAddress[]; scopesWithAccount: AztecAddress[] } {
	const dappScopes: AztecAddress[] = Array.isArray(rawScopes) ? rawScopes : []
	const scopeByHex = new Map<string, AztecAddress>()
	for (const s of dappScopes) scopeByHex.set(s.toString(), s)
	const scopeWithAccountByHex = new Map<string, AztecAddress>()
	scopeWithAccountByHex.set(accountAddress.toString(), accountAddress)
	for (const s of dappScopes) scopeWithAccountByHex.set(s.toString(), s)
	return {
		dappScopesCount: dappScopes.length,
		additionalScopes: [...scopeByHex.values()],
		scopesWithAccount: [...scopeWithAccountByHex.values()],
	}
}
