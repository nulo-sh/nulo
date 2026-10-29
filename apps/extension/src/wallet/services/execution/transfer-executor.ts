// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * `TransferExecutor` — the popup-initiated transfer flow (execute + estimate).
 *
 * Owns journal creation for `transfer`-kind records, the cancel controller surface (through
 * `deps.lane`), the estimate-reuse fast path, and the activity-record shape (always transfer-only,
 * never the FPC-mutated calls: the card title stays the token symbol whatever pays the fee).
 *
 * A send takes the dApp sends' execution slot from build to submit, and waits for the earlier sends
 * it depends on BEFORE taking it, never while holding it: an unmined tx must not stall unrelated sends.
 */

import type { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import type { TxExecutionRequest } from "@aztec-labs/stdlib/tx"
import { type JobError, type JobProgress, JobCancelledSentinel, normalizeError, type QueuedFeePayer } from "@nulo/wallet-core/jobs"
import { JournaledRejection, OperationNotRecordedError, SessionEndedError, WalletError } from "@nulo/extension-messaging/errors"
import type { IAccountContract } from "@nulo/aztec-runtime/account"
import type { Network } from "@/wallet/services/network/service"
import { findPrimaryEndpoint, primaryEndpointUrl } from "@/wallet/services/network/spec"
import type { NewOperationInput, OperationRecord } from "@/wallet/services/operation-journal/spec"
import type { ProfileInfo } from "@/wallet/services/profile/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { type TaskService, type WrappedTask, TransferContent } from "@/wallet/services/task/service"
import { OriginType, type LocalTxOrigin, type TransactionService, type Tx } from "@/wallet/services/transaction/service"
import type { Fpc } from "@/wallet/services/fpc/fpc"
import { FpcType, type FpcIdentitySnapshot } from "@/wallet/services/fpc/spec"
import type { IPXE } from "@/wallet/services/pxe/client"
import type { PublicStorageReader } from "@/wallet/utils/fee-juice-balance"
import { type ExecutionCoordinator, fenceChecks } from "./execution-coordinator"
import type { ExecutionMutexRelease } from "./execution-mutex"
import type { FeeEstimate } from "./fee/fee-strategy"
import { builtCapOf, type ChainIdentity } from "./estimate-reuse-shared"
import { askFeeAgain, figureAsks, personalPayerOf, type SendFeeFigure } from "./fee-reask"
import { failureKind } from "./mark-failed-unless-cancelled"
import type { OperationPlanner, TransferRequest } from "./operation-planner"
import { type QueuedFeeAnswers, queuedFeePayer, speedOf } from "./queued-fee-cap"
import { maybeRethrowAsRpcCancel, throwIfAborted } from "./rpc-cancel"
import type { ChainTipGate } from "./chain-tip-gate"
import type { SendSequencer, SequenceScope, SequenceTicket } from "./send-sequencer"
import type { Action, FeeOptions, FeeSettings, TransferFeeEstimate, TransferFeeQueued } from "./spec"
import { probeOwnFeeJuice, probeSponsorFunding } from "./sponsor-funding"
import { fingerprintFeeSettings, type TransferEstimateReuse, type TransferEstimateReuseEntry } from "./transfer-estimate-reuse"
import { minedSuccessfully, type SequenceKey, transferSequenceKeys, usedSequences } from "./transfer-sequence-keys"
import { getEstimatedFee, getGasDetails } from "./tx-fee-details"

/** The resolved inputs the prove-and-send tail consumes, produced by either
 *  the reused-estimate arm or the fresh-build arm. */
type TransferBuildInputs = {
	txRequest: TxExecutionRequest
	node: AztecNode
	pxe: IPXE
	account: IAccountContract
	network: Network
	nonce: { toString(): string }
	feePaymentMethod: AccountFeePaymentMethodOptions
	initializesAccount: boolean | undefined
	activity: {
		token: { contract: string; name: string; symbol: string; decimals: number }
		fnName: string
		args: readonly unknown[]
	}
	/** What a stash of this build is bound to: the entry it was consumed from, or a fresh build's snapshot. */
	provenance: { entry: TransferEstimateReuseEntry } | BuildSnapshot
}

/** A fresh build's snapshot of the chain, the sponsor row and the account's line. */
type BuildSnapshot = {
	chainIdentity: ChainIdentity
	fpcIdentity?: FpcIdentitySnapshot
	sequenceEpoch: number | undefined
	builtAt: number
}

/** Controller-registry and slot subset of the execution lane. */
export interface TransferExecutorLane {
	registerInFlight(journalId: string, serial: number, controller: AbortController): { live: boolean }
	deleteController(journalId: string): void
	/** Heartbeats the row so the reaper does not fail it while it waits its turn. */
	beginQueuedWait(journalId: string): void
	endQueuedWait(journalId: string): void
	isSlotBusy(profileId: string, chainId: number): boolean
	/** The slot, only if nobody holds or waits for it; `undefined` otherwise. */
	tryTakeSlot(profileId: string, chainId: number): Promise<ExecutionMutexRelease> | undefined
	acquireTransferSlot(
		networkId: string,
		journalId: string,
		fence: ExecutionFence,
		signal: AbortSignal,
		onWait?: () => void,
	): Promise<ExecutionMutexRelease>
}

/** Where a transfer stands in its account's line, and what it holds there; `feeSpender` is the fee
 *  contract its `fpc:` key names, and `sponsored` whether Nulo's own sponsor pays. */
export type TransferSequence = { scope: SequenceScope; keys: ReadonlySet<SequenceKey>; feeSpender?: string; sponsored: boolean }

/** Mutated in place on re-entry, so the submit callback and the cleanup see the current ticket. */
type TransferLine = { sequence: TransferSequence; ticket: SequenceTicket }

/** One `execute` call as its build passes share it. Each pass replaces `release` and `stashId`, so
 *  the call's cleanup releases the slot and evicts the build it holds now, whichever pass threw. */
type TransferRun = {
	readonly req: TransferRequest
	readonly fence: ExecutionFence
	readonly journalId: string
	readonly controller: AbortController
	readonly line: TransferLine
	/** Nulo's own sponsor paid when the send entered; a re-entry's sequence does not change it. */
	readonly sponsored: boolean
	readonly task: WrappedTask
	markJournal(progress: JobProgress): Promise<boolean>
	checkCancelled(): void
	release?: ExecutionMutexRelease
	stashId?: string
}

/** A build above its figure, as the question needs it: the build itself is only in the stash. */
type OverCap = { stashId: string | undefined; fee: string; figure: SendFeeFigure; payer: QueuedFeePayer }

export interface TransferExecutorDeps {
	tasks: TaskService
	planner: OperationPlanner
	estimateReuse: TransferEstimateReuse
	coordinator: ExecutionCoordinator
	lane: TransferExecutorLane
	sequencer: SendSequencer
	chainTip: Pick<ChainTipGate, "unconfirmed" | "wait">
	/** The validated row a build pays with: owned, with its protocol addresses derived even on a cold worker. */
	getFpcImpl(fpcId: string): Promise<Fpc>
	transactionsOf(account: string, profileId: string): Promise<Tx[]>
	getActiveProfile(): Promise<ProfileInfo | undefined>
	captureExecutionFence(): Promise<ExecutionFence>
	assertFence(fence: ExecutionFence): Promise<void>
	isFenceLive(fence: ExecutionFence): boolean
	getNetwork(networkId: string): Promise<Network>
	getNode(chainId: number): Promise<AztecNode>
	/** The sponsor probe's read: bounded and silent, unlike the build's retrying `node`. */
	readPublicStorageOnce: PublicStorageReader
	getPXE(network: Network): IPXE
	getAccountContract(profileId: string, chainId: number, accountAddress: string): Promise<IAccountContract>
	getPendingForAccount(account: string): Tx[]
	/** Mirrors `TransactionService.addTransaction` — indexed type keeps the
	 *  seam in sync with the source signature. */
	addTransaction: TransactionService["addTransaction"]
	buildAndEstimate(
		inputOp: { networkId: string; accountAddress: string; actions: Action[]; fee?: FeeOptions },
		feeSettings: FeeSettings,
		fence: ExecutionFence,
		parentTask?: WrappedTask,
		signal?: AbortSignal,
		fpc?: Fpc,
	): Promise<FeeEstimate>
	createJournalOperation(input: NewOperationInput): Promise<OperationRecord>
	transitionJournal(journalId: string, progress: JobProgress, error?: JobError | null): Promise<unknown>
	/** The person's answers to queued sends whose fee came out above their cap. */
	answers: QueuedFeeAnswers
	logDebug(msg: string, ...rest: unknown[]): void
	logError(msg: string, ...rest: unknown[]): void
}

const QUEUED_SPENT: TransferFeeQueued = { queued: true, tokenSpent: true }

/** Nulo's own sponsor on this chain: the one FPC that never spends the payer's notes. */
function isProtocolSponsor(fpc: Fpc | undefined, chainId: number): boolean {
	const info = fpc?.infoData
	return info?.type === FpcType.DefaultSponsoredFpc && info.isProtocol === true && info.chainId === chainId
}

/** An FPC that may spend the payer's notes: any but the protocol sponsor on this chain. */
function feeSpenderOf(fpc: Fpc | undefined, chainId: number): string | undefined {
	const info = fpc?.infoData
	if (!info) return undefined
	return isProtocolSponsor(fpc, chainId) ? undefined : info.address
}
/** The failure once a send has waited its whole `MAX_WAIT_MS` for earlier sends and the slot. */
const WAIT_LIMIT_MESSAGE = "An earlier send of this account is still in flight"
/** The failure of a send that entered with Nulo's sponsor whose row is no longer it at its turn. */
const SPONSOR_MOVED_MESSAGE = "Nulo's sponsor row changed while this send waited"
/** A Send-page send the person pays carries the figure the page showed. */
const MISSING_FEE_FIGURE = "The send carries no fee figure for a fee the account pays"

/** Embedded fee payments take a divergent execution path, and Fee Juice with a claim mutates its
 *  actions during the build, so neither leaves a build to reuse. */
const reusable = (feeSettings: FeeSettings): boolean => feeSettings.paymentMethod.kind === "fj" || feeSettings.paymentMethod.kind === "fpc"

export class TransferExecutor {
	public constructor(private readonly deps: TransferExecutorDeps) {}

	/** The account's line this transfer joins, and the keys it holds there (`transfer-sequence-keys.ts`),
	 *  read from the history of the profile it is sent from. */
	public async sequence(req: TransferRequest, profileId: string): Promise<TransferSequence> {
		const { chainId } = await this.deps.getNetwork(req.networkId)
		const [fpc, history] = await Promise.all([
			this.payingFpc(req.feeSettings),
			this.deps.transactionsOf(req.accountAddress, profileId).then((txs) => txs.filter((tx) => tx.chainId === chainId)),
		])
		const feeSpender = feeSpenderOf(fpc, chainId)
		const keys = transferSequenceKeys({
			me: req.accountAddress,
			token: req.tokenContract,
			type: req.transferType,
			recipient: req.recipientAddress,
			feeSpender,
			// The first tx initializes the account; until one is mined here, any two sends may both try.
			initializing: !history.some(minedSuccessfully),
			used: usedSequences(history, req.accountAddress),
		})
		return { scope: { chainId, account: req.accountAddress }, keys, feeSpender, sponsored: isProtocolSponsor(fpc, chainId) }
	}

	/** The validated fee contract a transfer pays through; `undefined` when it pays without an FPC. */
	private async payingFpc(feeSettings: FeeSettings): Promise<Fpc | undefined> {
		return feeSettings.paymentMethod.kind === "fpc" ? this.deps.getFpcImpl(feeSettings.paymentMethod.fpcId) : undefined
	}

	/** A build that `figure` asks about is never proved: the send keeps its place and asks the person
	 *  again (`buildWithinCap`). A build the person pays with no `figure` is refused. */
	public async execute(
		req: TransferRequest,
		precomputedEstimateId: string | undefined,
		fence: ExecutionFence,
		figure?: SendFeeFigure,
	): Promise<string> {
		const { networkId, accountAddress, tokenId, transferType, recipientAddress, amount } = req
		const origin: LocalTxOrigin = { type: OriginType.UI }
		const transferContent = new TransferContent(tokenId, transferType, accountAddress, recipientAddress, amount, networkId)
		const transferTask = this.deps.tasks.startNewTask(transferContent, undefined, origin)

		// Hoisted so catch (mark failed) + finally (controller cleanup) see them even when the
		// journal-create refusal below throws before they are assigned.
		let journalId: string | undefined
		let controller: AbortController | undefined
		let line: TransferLine | undefined
		let run: TransferRun | undefined
		const markJournal = async (progress: JobProgress, error?: JobError | null): Promise<boolean> => {
			if (!journalId) return false
			try {
				await this.deps.transitionJournal(journalId, progress, error)
				return true
			} catch (err) {
				this.deps.logError("Failed to update journal operation", err)
				return false
			}
		}

		// checkCancelled reads the controller's signal at each stage boundary
		// and short-circuits with JobCancelledSentinel so the catch handler can
		// skip the failure path.
		const checkCancelled = (): void => {
			if (controller?.signal.aborted) throw new JobCancelledSentinel(journalId ?? "")
		}

		try {
			// The ticket's place in line is taken before the row exists, so the row's first stage says
			// whether it waits. Fail closed here, inside the try: a transfer with no durable record never runs.
			const sequence = await this.sequence(req, fence.profileId)
			const held: TransferLine = { sequence, ticket: this.deps.sequencer.enter(sequence.scope, sequence.keys) }
			line = held
			const queued =
				held.ticket.blocked() ||
				this.deps.lane.isSlotBusy(fence.profileId, sequence.scope.chainId) ||
				this.deps.chainTip.unconfirmed(sequence.scope, sequence.keys, req.networkId)
			const created = await this.createTransferJournal(req, fence, queued)
			journalId = created.journalId
			controller = created.controller
			if (!created.live) throw new SessionEndedError()
			const journal = { journalId: created.journalId, controller: controller as AbortController }
			run = { ...journal, req, fence, line: held, sponsored: sequence.sponsored, task: transferTask, markJournal, checkCancelled }
			const built = await this.buildWithinCap(run, queued, precomputedEstimateId, figure)
			const { txRequest, node, pxe, account, initializesAccount } = built
			const { txHash } = await this.deps.coordinator.proveAndSend({
				pxe,
				node,
				txRequest,
				initializesAccount,
				scopes: [account.address],
				parentTask: transferTask,
				journalId,
				checkCancelled,
				...fenceChecks(this.deps, fence),
				markJournal: (patch) => markJournal(patch),
				commitSubmitting: async (patch) => {
					await this.deps.transitionJournal(created.journalId, { stage: "submitting", ...patch })
				},
				submittedEndpointUrl: primaryEndpointUrl(built.network),
				onSent: (hash) => held.ticket.sent(hash),
				recordTransaction: (hash) => this.recordTransfer(hash, req, built, origin, fence, held.sequence.feeSpender),
			})
			// Released at submit, as a dApp send's: the ticket, not the slot, holds until inclusion.
			run.release?.()
			transferTask.completeIfTracked()
			return txHash.toString()
		} catch (error) {
			// Journal already in `cancelled` (cancelJob did it); convert the
			// internal sentinel to the structured RPC-boundary error here.
			maybeRethrowAsRpcCancel(error, transferTask)
			// Classified failures keep their own kind on the transfer path too, so a
			// popup transfer reads the same as a dApp send.
			const recorded = await markJournal({ stage: "failed" }, normalizeError(error, failureKind(error, "transfer")))
			transferTask.fail(error)
			// Named only once the record holds this failure: the popup offers it as the failure's details.
			throw recorded && journalId ? new JournaledRejection(error, journalId) : error
		} finally {
			run?.release?.()
			if (run?.stashId) this.deps.estimateReuse.evict(run.stashId)
			line?.ticket.release()
			if (journalId) this.deps.lane.deleteController(journalId)
		}
	}

	/**
	 * Takes the turn and builds until a build comes out within `figure`. One above it is not proved:
	 * it gives the slot back, keeps the ticket so no later send that shares its keys overtakes it,
	 * and asks the person. An accepted fee is the next pass's figure under the same rule, and its
	 * build is reused while nothing it was built on has moved.
	 */
	private async buildWithinCap(
		run: TransferRun,
		createdQueued: boolean,
		estimateId: string | undefined,
		figure: SendFeeFigure | undefined,
	): Promise<TransferBuildInputs> {
		let queued = createdQueued
		let heldId = estimateId
		let limit = figure
		for (;;) {
			const pass = await this.buildPass(run, queued, heldId, limit)
			if ("built" in pass) return pass.built
			await this.askAgain(run, pass.over)
			heldId = pass.over.stashId
			limit = { ...pass.over.figure, fee: pass.over.fee }
			// The accept claimed the row back to `pending`.
			queued = false
		}
	}

	/** One turn and one build. Above `figure` the slot is already given back and the build stashed,
	 *  and only what the question needs leaves this frame. */
	private async buildPass(
		run: TransferRun,
		queued: boolean,
		estimateId: string | undefined,
		figure: SendFeeFigure | undefined,
	): Promise<{ built: TransferBuildInputs } | { over: OverCap }> {
		const { req, fence, line } = run
		const turn = await this.takeTurn(req, run.journalId, run.controller, line, fence, queued)
		run.release = turn.release
		// A send that entered with Nulo's sponsor goes out with no figure, so a row edited while it waited
		// must not pay for it: that contract could spend an authorization the account granted it.
		if (run.sponsored && !isProtocolSponsor(turn.fpc, line.sequence.scope.chainId)) throw new Error(SPONSOR_MOVED_MESSAGE)
		// The cached estimate first; any drift from its snapshot (`tryConsume`'s ladder) rebuilds.
		const reused = estimateId ? await this.deps.estimateReuse.tryConsume(estimateId, req, fence, turn.fpc) : undefined

		// `simulating` before the build: its fee strategies simulate for seconds, which `pending`
		// would hide from the popup. The reused path enters it too, so the FSM stays uniform.
		await run.markJournal({ stage: "simulating" })
		run.checkCancelled()

		// Read before the build: a send that reaches the node during it may hold this build's index.
		const sequenceEpoch = this.deps.sequencer.epoch(line.sequence.scope)
		const built = reused
			? await this.fromReusedEstimate(reused, req, estimateId, fence)
			: await this.buildFresh(req, fence, run.task, turn.fpc, sequenceEpoch)
		if (figure === undefined) {
			// Classified by the route the build took, as the dApp path classifies its approvals.
			const { provenance } = built
			const fpcIdentity = "entry" in provenance ? provenance.entry.fpcIdentity : provenance.fpcIdentity
			if (personalPayerOf({ feePaymentMethod: built.feePaymentMethod, fpcIdentity })) throw new Error(MISSING_FEE_FIGURE)
			return { built }
		}
		const fee = getEstimatedFee(built.txRequest)
		if (!figureAsks(fee, figure)) return { built }
		run.release()
		run.release = undefined
		run.stashId = this.stashBuild(req, fence.profileId, built)
		return { over: { stashId: run.stashId, fee, figure, payer: queuedFeePayer(turn.fpc) } }
	}

	/** Asks the person about a fee above the figure; the send's own line deadline bounds the question. */
	private askAgain(run: TransferRun, over: OverCap): Promise<void> {
		const { journalId, controller } = run
		return askFeeAgain(
			{
				answers: this.deps.answers,
				transitionJournal: (id, progress) => this.deps.transitionJournal(id, progress),
				beginQueuedWait: (id) => this.deps.lane.beginQueuedWait(id),
				endQueuedWait: (id) => this.deps.lane.endQueuedWait(id),
				logDebug: (msg) => this.deps.logDebug(msg),
			},
			{ journalId, controller, reask: { fee: over.fee, cap: over.figure.fee, payer: over.payer }, ms: run.line.ticket.remainingMs() },
		)
	}

	/** Stashes a build for the accept to reuse. A consumed entry goes back as it was, so its
	 *  `builtAt` still bounds how long the signed request stays in memory. */
	private stashBuild(req: TransferRequest, profileId: string, built: TransferBuildInputs): string | undefined {
		if (!reusable(req.feeSettings)) return undefined
		const { provenance } = built
		const entry = "entry" in provenance ? provenance.entry : this.reuseEntry(req, profileId, built, provenance)
		if (!entry) return undefined
		const stashId = crypto.randomUUID()
		this.deps.estimateReuse.stash(stashId, entry)
		return stashId
	}

	/** The reuse entry of a fresh build; none when its network has no primary endpoint to bind it to. */
	private reuseEntry(
		req: TransferRequest,
		profileId: string,
		built: Pick<TransferBuildInputs, "txRequest" | "network" | "nonce" | "feePaymentMethod" | "initializesAccount" | "activity">,
		snapshot: BuildSnapshot,
	): TransferEstimateReuseEntry | undefined {
		const primary = findPrimaryEndpoint(built.network)
		if (!primary) return undefined
		const { networkId, accountAddress, tokenId, transferType, recipientAddress, amount } = req
		return {
			networkId,
			accountAddress,
			tokenId,
			transferType,
			recipientAddress,
			amount,
			feeSettingsHash: fingerprintFeeSettings(req.feeSettings),
			profileId,
			...snapshot,
			builtCap: builtCapOf(built.txRequest),
			primaryEndpointId: primary.id,
			primaryEndpointUrl: primary.rpcUrl,
			pendingHashes: this.deps.getPendingForAccount(accountAddress).map((tx) => tx.hash),
			txRequest: built.txRequest,
			initializesAccount: built.initializesAccount === true,
			nonce: built.nonce,
			feePaymentMethod: built.feePaymentMethod,
			token: built.activity.token,
			fnName: built.activity.fnName,
			args: [...built.activity.args],
		}
	}

	/**
	 * Activity-feed shape is always transfer-only (no FPC fee payload). The build's calls carry the
	 * FPC mutation (`pay_fee` for Private FPC, `fee_entrypoint_*` for Default FPC), which would
	 * surface as the card title via `getPrimaryCall`; the card shows the token symbol and transfer
	 * type whatever the fee payment method.
	 */
	private recordTransfer(
		hash: string,
		req: TransferRequest,
		built: TransferBuildInputs,
		origin: LocalTxOrigin,
		fence: ExecutionFence,
		feeSpender: string | undefined,
	) {
		const { txRequest, network, nonce, feePaymentMethod, activity } = built
		return this.deps.addTransaction({
			origin,
			chainId: network.chainId,
			account: req.accountAddress,
			calls: [
				{
					contract: activity.token.contract,
					method: activity.fnName,
					args: activity.args.map((x) => String(x)),
					transfers: [
						{
							token: { name: activity.token.name, symbol: activity.token.symbol, decimals: activity.token.decimals },
							type: req.transferType,
							from: req.accountAddress,
							to: req.recipientAddress,
							amount: req.amount.toString(),
						},
					],
				},
			],
			nonce: nonce.toString(),
			feePaymentMethod,
			hash,
			submittedEndpointUrl: primaryEndpointUrl(network),
			estimatedFee: getEstimatedFee(txRequest),
			gasDetails: getGasDetails(txRequest),
			fence,
			networkId: network.id,
			feeSpender,
			priorityLevel: speedOf(req.feeSettings),
			feeChoice: "wallet",
		})
	}

	/**
	 * Waits for the sends this one depends on and for the PXE's node to hold their blocks, then takes
	 * the slot and re-checks under it, with nothing awaited on the network: a dApp tx proving when the
	 * wait ended is pending by now, a predecessor may have settled since, and an edited fee contract
	 * moves this send's key, so any of them gives the slot back (an edit re-enters the line). A send
	 * whose row is `pending` when it has to wait moves it back to `queued` for the wait. Returns the
	 * fee contract row the build pays with, the one this send was ordered against.
	 */
	private async takeTurn(
		req: TransferRequest,
		journalId: string,
		controller: AbortController,
		line: TransferLine,
		fence: ExecutionFence,
		createdQueued: boolean,
	): Promise<{ release: ExecutionMutexRelease; fpc: Fpc | undefined }> {
		let queued = createdQueued
		let requeued: Promise<unknown> | undefined
		const waiting = () => {
			if (queued) return
			queued = true
			requeued = this.deps.transitionJournal(journalId, { stage: "queued" })
			// Handled at once, so a run that ends before its claim raises no unhandled rejection; the
			// claim awaits the transition itself and fails with its error.
			requeued.catch(() => undefined)
		}
		const held = () => line.ticket.blocked() || this.deps.chainTip.unconfirmed(line.sequence.scope, line.sequence.keys, req.networkId)
		for (;;) {
			// `waitTurn` checks first in this same task, so this is the wait as it starts.
			if (held()) waiting()
			await this.waitForDependencies(req.networkId, journalId, controller, line)
			const release = await this.acquireSlotWithin(req.networkId, journalId, fence, controller, line.ticket, waiting)
			// The caller holds no release until this returns, so every throw past the grant gives it back.
			try {
				if (held()) {
					release()
					continue
				}
				const fpc = await this.payingFpc(req.feeSettings)
				if (feeSpenderOf(fpc, line.sequence.scope.chainId) !== line.sequence.feeSpender) {
					release()
					await this.reenter(req, line, fence.profileId)
					continue
				}
				if (queued) await this.claim(journalId, controller, requeued)
				return { release, fpc }
			} catch (err) {
				release()
				throw err
			}
		}
	}

	/** Takes a new place in line under the keys the request gives now, within the first ticket's deadline. */
	private async reenter(req: TransferRequest, line: TransferLine, profileId: string): Promise<void> {
		const next = await this.sequence(req, profileId)
		const { deadline } = line.ticket
		line.ticket.release()
		line.sequence = next
		line.ticket = this.deps.sequencer.enter(next.scope, next.keys, deadline)
	}

	/** The ticket's turn, then the tip; a tip wait that outlasts the ticket is reported by the slot wait. */
	private async waitForDependencies(
		networkId: string,
		journalId: string,
		controller: AbortController,
		line: TransferLine,
	): Promise<void> {
		this.deps.lane.beginQueuedWait(journalId)
		try {
			const turn = await line.ticket.waitTurn(controller.signal)
			if (turn === "aborted") throw new JobCancelledSentinel(journalId)
			if (turn === "expired") throw new Error(WAIT_LIMIT_MESSAGE)
			const { scope, keys } = line.sequence
			const tip = await this.deps.chainTip.wait(scope, keys, networkId, controller.signal, line.ticket.remainingMs())
			if (tip === "aborted") throw new JobCancelledSentinel(journalId)
		} finally {
			this.deps.lane.endQueuedWait(journalId)
		}
	}

	/** The slot, given up when the ticket's wait runs out, with the wait-limit failure. */
	private async acquireSlotWithin(
		networkId: string,
		journalId: string,
		fence: ExecutionFence,
		controller: AbortController,
		ticket: SequenceTicket,
		onWait: () => void,
	): Promise<ExecutionMutexRelease> {
		const remainingMs = ticket.remainingMs()
		if (remainingMs <= 0) throw new Error(WAIT_LIMIT_MESSAGE)
		const limit = new AbortController()
		const timer = setTimeout(() => limit.abort(), remainingMs)
		try {
			const release = await this.deps.lane.acquireTransferSlot(
				networkId,
				journalId,
				fence,
				AbortSignal.any([controller.signal, limit.signal]),
				onWait,
			)
			if (!limit.signal.aborted && ticket.remainingMs() > 0) return release
			release()
			throw new Error(WAIT_LIMIT_MESSAGE)
		} catch (err) {
			if (err instanceof JobCancelledSentinel && !controller.signal.aborted) throw new Error(WAIT_LIMIT_MESSAGE)
			throw err
		} finally {
			clearTimeout(timer)
		}
	}

	/** `queued → pending`, once a move back to `queued` has landed; a cancel that landed first leaves
	 *  either transition illegal. */
	private async claim(journalId: string, controller: AbortController, requeued: Promise<unknown> | undefined): Promise<void> {
		try {
			await requeued
			await this.deps.transitionJournal(journalId, { stage: "pending" })
		} catch (err) {
			if (controller.signal.aborted) throw new JobCancelledSentinel(journalId)
			throw err
		}
	}

	/** Durable record of the in-flight operation. Survives SW restart and popup
	 *  close/reopen so consumers can recover a consistent view of "what is this
	 *  tx doing right now". FSM: [queued →] pending → simulating → proving →
	 *  submitting → succeeded | failed | cancelled. Creation fails closed — a create error or
	 *  a record with no id throws, so an unrecorded transfer never runs (its
	 *  cancel path and activity trail would both be lost). Called inside the
	 *  build's try, so the throw fails the header task like any build error.
	 *  This helper OWNS the full `await create → new AbortController →
	 *  registerInFlight` span: the controller must be registered in the SAME
	 *  continuation that sees the durable row, so `cancelJob(journalId)` can
	 *  never land in a settlement hop between the row becoming visible and the
	 *  controller existing (it would transition the row terminal, find nothing
	 *  to abort, and a later-installed controller would let proving continue).
	 *  `live: false` means the fence's session ended before the registration:
	 *  nothing is registered and the caller fails the row. */
	private async createTransferJournal(
		req: TransferRequest,
		fence: ExecutionFence,
		queued: boolean,
	): Promise<{ journalId: string; controller: AbortController | undefined; live: boolean }> {
		// Inline, not a helper: an awaited wrapper would add a settlement hop between the row
		// becoming visible and the controller registering. A storage fault becomes the typed
		// refusal the Send screen words; a typed wallet error (a session end) keeps its class.
		let journalOp: OperationRecord | undefined
		try {
			journalOp = await this.deps.createJournalOperation({
				kind: "transfer",
				origin: "popup",
				profileId: fence.profileId,
				profileEpoch: fence.epoch,
				accountAddress: req.accountAddress,
				networkId: req.networkId,
				tokenId: req.tokenId,
				// Persist amount + recipient so terminal cards can render
				// the same info as awaiting/settled cards. amount is bigint
				// → string for JSON safety; field name matches
				// `balanceFormatted(rawAmount, decimals, length)`.
				amountRaw: req.amount.toString(),
				recipientAddress: req.recipientAddress,
				// Persist the privacy direction so the in-flight awaiting
				// card can render the Private/Public chip the settled card
				// shows. Resolved via `formatTransferType()` consumer-side.
				transferType: req.transferType,
				initialStage: { stage: queued ? "queued" : "pending" },
			})
		} catch (error) {
			if (error instanceof WalletError) throw error
			this.deps.logError("Failed to create journal operation", error)
			throw new OperationNotRecordedError()
		}
		const journalId = journalOp?.id
		if (!journalId) throw new OperationNotRecordedError()
		const controller = new AbortController()
		if (!this.deps.lane.registerInFlight(journalId, fence.session, controller).live) {
			return { journalId, controller: undefined, live: false }
		}
		return { journalId, controller, live: true }
	}

	/** Reused-estimate arm: the entry retains the exact build — its provenance
	 *  rides along; only the live handles (network/node/pxe/account) resolve. */
	private async fromReusedEstimate(
		reused: NonNullable<Awaited<ReturnType<TransferEstimateReuse["tryConsume"]>>>,
		req: TransferRequest,
		precomputedEstimateId: string | undefined,
		fence: ExecutionFence,
	): Promise<TransferBuildInputs> {
		this.deps.logDebug(`executeTransfer: reusing precomputed estimate ${precomputedEstimateId}`)
		const network = await this.deps.getNetwork(req.networkId)
		const node = await this.deps.getNode(network.chainId)
		const pxe = this.deps.getPXE(network)
		await this.deps.assertFence(fence)
		const account = await this.deps.getAccountContract(fence.profileId, network.chainId, req.accountAddress)
		// The lookup reads whichever session is live: re-check the fence before its keys are used.
		fenceChecks(this.deps, fence).assertLive()
		return {
			txRequest: reused.txRequest,
			node,
			pxe,
			account,
			network,
			nonce: reused.nonce,
			feePaymentMethod: reused.feePaymentMethod,
			initializesAccount: reused.initializesAccount,
			activity: { token: reused.token, fnName: reused.fnName, args: reused.args },
			provenance: { entry: reused },
		}
	}

	/** Fresh-build arm: plan the transfer, then build + estimate. The activity
	 *  inputs are captured from the PLAN, separately from the FPC-mutated
	 *  `buildAndEstimate` txCalls, so the persisted record stays just the
	 *  user-intent transfer (no `pay_fee` / `fee_entrypoint_*` fee-payload
	 *  pollution leaking into the activity card title). */
	private async buildFresh(
		req: TransferRequest,
		fence: ExecutionFence,
		transferTask: WrappedTask,
		fpc: Fpc | undefined,
		sequenceEpoch: number,
	): Promise<TransferBuildInputs> {
		const { op, token, fn, args } = await this.deps.planner.buildTransferOperation(req)
		const built = await this.deps.buildAndEstimate(op, op.feeSettings, fence, transferTask, undefined, fpc)
		const { chainIdentity, fpcIdentity } = built
		return {
			txRequest: built.txRequest,
			node: built.node,
			pxe: built.pxe,
			account: built.account,
			network: built.network,
			nonce: built.nonce,
			feePaymentMethod: built.feePaymentMethod,
			initializesAccount: built.initializesAccount,
			activity: {
				token: { contract: token.contract, name: token.name, symbol: token.symbol, decimals: token.decimals },
				fnName: fn.name,
				args,
			},
			provenance: { chainIdentity, fpcIdentity, sequenceEpoch, builtAt: Date.now() },
		}
	}

	/**
	 * With `sequence`, answers {@link TransferFeeQueued} instead of running while a send sharing its
	 * keys is in flight or the slot is taken. Otherwise it holds both while it runs: the PXE runs one
	 * operation at a time, so a proof started between two of its simulations would outlast its deadline.
	 * `onStarted` runs once both are held, before the run.
	 */
	public async estimateFee(
		req: TransferRequest,
		signal?: AbortSignal,
		sequence?: TransferSequence,
		onStarted?: () => void,
	): Promise<TransferFeeEstimate | TransferFeeQueued> {
		if (!sequence) return this.runEstimate(req, signal, undefined)
		const { profileId } = await this.deps.captureExecutionFence()
		const hold = this.deps.sequencer.beginEstimate(sequence.scope, sequence.keys)
		if (!hold) return QUEUED_SPENT
		const slot = this.deps.lane.tryTakeSlot(profileId, sequence.scope.chainId)
		if (!slot) {
			hold.end()
			return QUEUED_SPENT
		}
		const release = await slot
		try {
			onStarted?.()
			return await this.runEstimate(req, signal, sequence)
		} finally {
			release()
			hold.end()
		}
	}

	private async runEstimate(
		req: TransferRequest,
		signal: AbortSignal | undefined,
		sequence: TransferSequence | undefined,
	): Promise<TransferFeeEstimate> {
		// Stage-boundary cancellation: an in-flight sim can't be preempted, but
		// each next stage — and critically the stash — must not run after a
		// cancel. A cancelled estimate never leaves a signed request cached.
		throwIfAborted(signal)
		const fence = await this.deps.captureExecutionFence()
		const { op, token, fn, args } = await this.deps.planner.buildTransferOperation(req)
		throwIfAborted(signal)

		// Read before the build: a send that reaches the node during it may hold this build's index.
		const sequenceEpoch = sequence ? this.deps.sequencer.epoch(sequence.scope) : undefined
		const built = await this.deps.buildAndEstimate(op, op.feeSettings, fence, undefined, signal)
		const { txRequest, network, nonce, feePaymentMethod, initializesAccount: builtInitializes } = built
		throwIfAborted(signal)
		const log = (msg: string, data: object) => this.deps.logDebug(msg, data)
		const sponsorFunding = await probeSponsorFunding(built, this.deps.readPublicStorageOnce, log)
		const feeJuiceShortfall = await probeOwnFeeJuice(built, this.deps.readPublicStorageOnce, log)
		throwIfAborted(signal)

		const maxFeeRaw = BigInt(getEstimatedFee(txRequest))

		// Stash the post-strategy build result for one-shot reuse on Confirm. A build with no reuse
		// path leaves the popup no `estimateId`, and `executeTransfer` rebuilds.
		let estimateId: string | undefined
		if (reusable(op.feeSettings)) {
			try {
				const profile = await requireActiveProfile(this.deps, "Wallet locked")
				const activity = {
					token: { contract: token.contract, name: token.name, symbol: token.symbol, decimals: token.decimals },
					fnName: fn.name,
					args,
				}
				const entry = this.reuseEntry(
					req,
					profile.id,
					{ txRequest, network, nonce, feePaymentMethod, initializesAccount: builtInitializes, activity },
					{ chainIdentity: built.chainIdentity, fpcIdentity: built.fpcIdentity, sequenceEpoch, builtAt: Date.now() },
				)
				if (entry) {
					estimateId = crypto.randomUUID()
					this.deps.estimateReuse.stash(estimateId, entry)
				}
			} catch (error) {
				// Cache write is best-effort. The estimate result still goes
				// out — the popup just won't get a reuse token.
				this.deps.logDebug("estimateTransferFee: cache write skipped", error)
				estimateId = undefined
			}
		}

		return {
			maxFee: maxFeeRaw.toString(),
			gasDetails: getGasDetails(txRequest),
			estimateId,
			...(sponsorFunding ? { sponsorFunding } : {}),
			...(feeJuiceShortfall ? { feeJuiceShortfall } : {}),
		}
	}
}
