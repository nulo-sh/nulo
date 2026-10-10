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
import { type JobError, type JobProgress, JobCancelledSentinel, normalizeError } from "@nulo/wallet-core/jobs"
import { JournaledRejection, OperationNotRecordedError, SessionEndedError, WalletError } from "@nulo/extension-messaging/errors"
import type { IAccountContract } from "@nulo/aztec-runtime/account"
import { formatFeeJuice } from "@/utils/fee-estimation"
import type { Network } from "@/wallet/services/network/service"
import { findPrimaryEndpoint, primaryEndpointUrl } from "@/wallet/services/network/spec"
import type { NewOperationInput, OperationRecord } from "@/wallet/services/operation-journal/spec"
import type { ProfileInfo } from "@/wallet/services/profile/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { type TaskService, type WrappedTask, TransferContent } from "@/wallet/services/task/service"
import { OriginType, type LocalTxOrigin, type TransactionService, type Tx } from "@/wallet/services/transaction/service"
import type { Fpc } from "@/wallet/services/fpc/fpc"
import { FpcType } from "@/wallet/services/fpc/spec"
import type { IPXE } from "@/wallet/services/pxe/client"
import type { PublicStorageReader } from "@/wallet/utils/fee-juice-balance"
import { type ExecutionCoordinator, fenceChecks } from "./execution-coordinator"
import type { ExecutionMutexRelease } from "./execution-mutex"
import type { FeeEstimate } from "./fee/fee-strategy"
import { fingerprintBaseFee } from "./estimate-reuse-shared"
import { failureKind } from "./mark-failed-unless-cancelled"
import type { OperationPlanner, TransferRequest } from "./operation-planner"
import { maybeRethrowAsRpcCancel, throwIfAborted } from "./rpc-cancel"
import type { SendSequencer, SequenceScope, SequenceTicket } from "./send-sequencer"
import type { Action, FeeOptions, FeeSettings, TransferFeeEstimate, TransferFeeQueued } from "./spec"
import { probeSponsorFunding } from "./sponsor-funding"
import { fingerprintFeeSettings, type TransferEstimateReuse } from "./transfer-estimate-reuse"
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
	acquireTransferSlot(networkId: string, journalId: string, fence: ExecutionFence, signal: AbortSignal): Promise<ExecutionMutexRelease>
}

/** Where a transfer stands in its account's line, and what it holds there; `feeSpender` is the fee
 *  contract its `fpc:` key names. */
export type TransferSequence = { scope: SequenceScope; keys: ReadonlySet<SequenceKey>; feeSpender?: string }

/** A send's place in line, replaced when its keys change while it waits. */
type TransferLine = { sequence: TransferSequence; ticket: SequenceTicket }

export interface TransferExecutorDeps {
	tasks: TaskService
	planner: OperationPlanner
	estimateReuse: TransferEstimateReuse
	coordinator: ExecutionCoordinator
	lane: TransferExecutorLane
	sequencer: SendSequencer
	getTokenContract(tokenId: number): Promise<string>
	/** The validated row a build pays with: owned, with its protocol addresses derived even on a cold worker. */
	getFpcImpl(fpcId: string): Promise<Fpc>
	getTransactions(account: string): Promise<Tx[]>
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
	logDebug(msg: string, ...rest: unknown[]): void
	logError(msg: string, ...rest: unknown[]): void
}

const QUEUED_SPENT: TransferFeeQueued = { queued: true, tokenSpent: true }

/** An FPC that may spend the payer's notes: any but the protocol sponsor on this chain. */
function feeSpenderOf(fpc: Fpc | undefined, chainId: number): string | undefined {
	const info = fpc?.infoData
	if (!info) return undefined
	const protocolSponsor = info.type === FpcType.DefaultSponsoredFpc && info.isProtocol === true && info.chainId === chainId
	return protocolSponsor ? undefined : info.address
}
/** The failure once a send has waited its whole `MAX_WAIT_MS` for earlier sends and the slot. */
const WAIT_LIMIT_MESSAGE = "An earlier send of this account is still in flight"

export class TransferExecutor {
	public constructor(private readonly deps: TransferExecutorDeps) {}

	/** The account's line this transfer joins, and the keys it holds there (`transfer-sequence-keys.ts`). */
	public async sequence(req: TransferRequest): Promise<TransferSequence> {
		const [token, network] = await Promise.all([this.deps.getTokenContract(req.tokenId), this.deps.getNetwork(req.networkId)])
		const chainId = network.chainId
		const [fpc, history] = await Promise.all([
			this.payingFpc(req.feeSettings),
			this.deps.getTransactions(req.accountAddress).then((txs) => txs.filter((tx) => tx.chainId === chainId)),
		])
		const feeSpender = feeSpenderOf(fpc, chainId)
		const keys = transferSequenceKeys({
			me: req.accountAddress,
			token,
			type: req.transferType,
			recipient: req.recipientAddress,
			feeSpender,
			// The first tx initializes the account; until one is mined here, any two sends may both try.
			initializing: !history.some(minedSuccessfully),
			used: usedSequences(history, req.accountAddress),
		})
		return { scope: { chainId, account: req.accountAddress }, keys, feeSpender }
	}

	/** The validated fee contract a transfer pays through; `undefined` for Fee Juice. */
	private async payingFpc(feeSettings: FeeSettings): Promise<Fpc | undefined> {
		return feeSettings.paymentMethod.kind === "fpc" ? this.deps.getFpcImpl(feeSettings.paymentMethod.fpcId) : undefined
	}

	public async execute(req: TransferRequest, precomputedEstimateId: string | undefined, fence: ExecutionFence): Promise<string> {
		const { networkId, accountAddress, tokenId, transferType, recipientAddress, amount } = req
		const origin: LocalTxOrigin = { type: OriginType.UI }
		const transferContent = new TransferContent(tokenId, transferType, accountAddress, recipientAddress, amount, networkId)
		const transferTask = this.deps.tasks.startNewTask(transferContent, undefined, origin)

		// Hoisted so catch (mark failed) + finally (controller cleanup) see them even when the
		// journal-create refusal below throws before they are assigned.
		let journalId: string | undefined
		let controller: AbortController | undefined
		let line: TransferLine | undefined
		let releaseSlot: ExecutionMutexRelease | undefined
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
			const sequence = await this.sequence(req)
			const held: TransferLine = { sequence, ticket: this.deps.sequencer.enter(sequence.scope, sequence.keys) }
			line = held
			const queued = held.ticket.blocked() || this.deps.lane.isSlotBusy(fence.profileId, sequence.scope.chainId)
			const created = await this.createTransferJournal(req, fence, queued)
			journalId = created.journalId
			controller = created.controller
			if (!created.live) throw new SessionEndedError()
			const turn = await this.takeTurn(req, created.journalId, controller as AbortController, held, fence, queued)
			releaseSlot = turn.release
			// The cached estimate first; any drift from its snapshot (`tryConsume`'s ladder) rebuilds.
			const reused = precomputedEstimateId
				? await this.deps.estimateReuse.tryConsume(precomputedEstimateId, req, fence, turn.fpc)
				: undefined

			// `simulating` before the build: its fee strategies simulate for seconds, which `pending`
			// would hide from the popup. The reused path enters it too, so the FSM stays uniform.
			await markJournal({ stage: "simulating" })
			checkCancelled()

			const built = reused
				? await this.fromReusedEstimate(reused, req, precomputedEstimateId, fence)
				: await this.buildFresh(req, fence, transferTask, turn.fpc)
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
			releaseSlot()
			transferTask.complete()
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
			releaseSlot?.()
			line?.ticket.release()
			if (journalId) this.deps.lane.deleteController(journalId)
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
		})
	}

	/**
	 * Waits for the earlier sends this one depends on, then takes the slot. A dApp tx that was proving
	 * when the wait ended is pending by the time it frees the slot, so a blocked re-check gives the
	 * slot straight back and waits again. A fee contract whose address moved during the wait gives it
	 * back too, and the send enters the line again under its new key. A row created `queued` is
	 * claimed only once all are clear. Returns the validated fee contract the build pays with, the
	 * one this send was ordered against.
	 */
	private async takeTurn(
		req: TransferRequest,
		journalId: string,
		controller: AbortController,
		line: TransferLine,
		fence: ExecutionFence,
		queued: boolean,
	): Promise<{ release: ExecutionMutexRelease; fpc: Fpc | undefined }> {
		for (;;) {
			await this.waitForDependencies(journalId, controller, line.ticket)
			const release = await this.acquireSlotWithin(req.networkId, journalId, fence, controller, line.ticket)
			// The caller holds no release until this returns, so every throw past the grant gives it back.
			try {
				if (line.ticket.blocked()) {
					release()
					continue
				}
				const fpc = await this.payingFpc(req.feeSettings)
				if (feeSpenderOf(fpc, line.sequence.scope.chainId) !== line.sequence.feeSpender) {
					release()
					await this.reenter(req, line)
					continue
				}
				if (queued) await this.claim(journalId, controller)
				return { release, fpc }
			} catch (err) {
				release()
				throw err
			}
		}
	}

	/** Takes a new place in line under the keys the request gives now, within the first ticket's deadline. */
	private async reenter(req: TransferRequest, line: TransferLine): Promise<void> {
		const next = await this.sequence(req)
		const { deadline } = line.ticket
		line.ticket.release()
		line.sequence = next
		line.ticket = this.deps.sequencer.enter(next.scope, next.keys, deadline)
	}

	private async waitForDependencies(journalId: string, controller: AbortController, ticket: SequenceTicket): Promise<void> {
		this.deps.lane.beginQueuedWait(journalId)
		const turn = await ticket.waitTurn(controller.signal).finally(() => this.deps.lane.endQueuedWait(journalId))
		if (turn === "turn") return
		if (turn === "aborted") throw new JobCancelledSentinel(journalId)
		throw new Error(WAIT_LIMIT_MESSAGE)
	}

	/** The slot, given up when the ticket's wait runs out, with the wait-limit failure. */
	private async acquireSlotWithin(
		networkId: string,
		journalId: string,
		fence: ExecutionFence,
		controller: AbortController,
		ticket: SequenceTicket,
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

	/** `queued → pending`; a cancel that landed first leaves the transition illegal. */
	private async claim(journalId: string, controller: AbortController): Promise<void> {
		try {
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
	): Promise<TransferBuildInputs> {
		const { op, token, fn, args } = await this.deps.planner.buildTransferOperation(req)
		const built = await this.deps.buildAndEstimate(op, op.feeSettings, fence, transferTask, undefined, fpc)
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
		}
	}

	/**
	 * With `sequence`, answers {@link TransferFeeQueued} instead of running while a send sharing its
	 * keys is in flight or the slot is taken. Otherwise it holds both while it runs: the PXE runs one
	 * operation at a time, so a proof started between two of its simulations would outlast its deadline.
	 */
	public async estimateFee(
		req: TransferRequest,
		signal?: AbortSignal,
		sequence?: TransferSequence,
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
		const { networkId, accountAddress, tokenId, transferType, recipientAddress, amount } = req

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
		const sponsorFunding = await probeSponsorFunding(built, this.deps.readPublicStorageOnce, (msg, data) =>
			this.deps.logDebug(msg, data),
		)
		throwIfAborted(signal)

		const maxFeeRaw = BigInt(getEstimatedFee(txRequest))

		// Stash the post-strategy build result for one-shot reuse on Confirm.
		// Embedded fee payments take a divergent execution path, so we don't
		// offer reuse for them — the popup will receive no `estimateId` and
		// `executeTransfer` falls through to the rebuild path. Same for
		// FeeJuiceWithClaim, which mutates actions during build.
		const reuseEligible = op.feeSettings.paymentMethod.kind === "fj" || op.feeSettings.paymentMethod.kind === "fpc"
		let estimateId: string | undefined
		if (reuseEligible) {
			try {
				const primary = findPrimaryEndpoint(network)
				if (primary) {
					// Fingerprint the EXACT fee the txRequest was built with —
					// not a fresh fetch after the fact. Both FJ and FPC strategies finalize
					// `maxFeesPerGas = predictedWorstMinFees * multiplier`, so
					// on consume we compare against the same live product.
					const builtFees = txRequest.txContext.gasSettings.maxFeesPerGas
					const baseFeeFingerprint = fingerprintBaseFee({
						feePerDaGas: builtFees.feePerDaGas,
						feePerL2Gas: builtFees.feePerL2Gas,
					})
					const profile = await requireActiveProfile(this.deps, "Wallet locked")
					const pendingHashes = this.deps.getPendingForAccount(accountAddress).map((tx) => tx.hash)
					estimateId = crypto.randomUUID()
					this.deps.estimateReuse.stash(estimateId, {
						networkId,
						accountAddress,
						tokenId,
						transferType,
						recipientAddress,
						amount,
						feeSettingsHash: fingerprintFeeSettings(op.feeSettings),
						profileId: profile.id,
						chainIdentity: built.chainIdentity,
						fpcIdentity: built.fpcIdentity,
						baseFeeFingerprint,
						primaryEndpointId: primary.id,
						primaryEndpointUrl: primary.rpcUrl,
						pendingHashes,
						sequenceEpoch,
						txRequest,
						initializesAccount: builtInitializes,
						nonce,
						feePaymentMethod,
						token: { contract: token.contract, name: token.name, symbol: token.symbol, decimals: token.decimals },
						fnName: fn.name,
						args: args.map((x) => x),
						builtAt: Date.now(),
					})
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
			maxFeeFormatted: formatFeeJuice(maxFeeRaw),
			gasDetails: getGasDetails(txRequest),
			estimateId,
			...(sponsorFunding ? { sponsorFunding } : {}),
		}
	}
}
