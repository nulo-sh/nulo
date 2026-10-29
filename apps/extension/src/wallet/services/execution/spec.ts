// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { TransferType, LocalTxOrigin } from "@/wallet/services/transaction/spec"
import type {
	DecodedCall,
	DecodedGrant,
	DisplayCallInput,
	FeeSettings,
	GasBalances,
	LastProveOutcome,
	OperationAuthwitPreview,
	TransferFeeEstimate,
	Operation,
	OperationResult,
} from "./models"

export const EXECUTION_SERVICE_NAME = "execution"

/** How long an estimate may run: the registry reaps a runner still unsettled past it as dead, and
 *  the popup's estimate calls end at it. MUST stay comfortably above the worst-case estimate
 *  transport chain (~5 sequential PXE RPCs × their 90 s timeouts). It is a dead-man bound, not a
 *  ceiling on the work: a held entry whose simulation still waits offscreen behind queued proofs is
 *  reaped too, and its place admits the next estimate. */
export const ESTIMATE_JOB_TTL_MS = 15 * 60 * 1000

/** An estimate that did not run: a send sharing its chain state, or holding the slot it needs, is in flight. A spent token was
 *  admitted and cannot be sent again. `cap` holds the last fee of this token's like sends and the cap a
 *  send may be queued against above it (`queued-fee-cap.ts`); absent when there is none. */
export type TransferFeeQueued = {
	readonly queued: true
	readonly tokenSpent: boolean
	readonly cap?: { readonly basis: string; readonly cap: string }
}

export * from "./models"

export type Methods = {
	/**
	 * Executes batch request and returns transaction hash.
	 * @param network Network id.
	 * @param account Sender account address.
	 * @param token Token id.
	 * @param tokenContract The contract of the token the person approved; the send is refused when
	 *   the row `tokenId` names holds another.
	 * @param transferType Transfer type.
	 * @param recipient Recipient address.
	 * @param amount Amount.
	 * @param feeCap With it, the send is queued against this fee in base units: a build above it is
	 *   never proved, and the send asks again through its record (`acceptQueuedFee`).
	 * @param shownFee The estimate the page showed, in base units, for a send not queued: a build more
	 *   than `FEE_RISE_ASKS` above it is never proved, and the send asks again the same way. A send
	 *   carries at most one of `feeCap` and `shownFee`, and one the account pays carries one.
	 */
	executeTransfer(
		networkId: string,
		accountAddress: string,
		tokenId: number,
		tokenContract: string,
		transferType: TransferType,
		recipientAddress: string,
		amount: bigint,
		feeSettings: FeeSettings,
		precomputedEstimateId?: string,
		feeCap?: string,
		shownFee?: string,
	): string
	/**
	 * Executes batch of operations.
	 * @param operations Operations to execute.
	 * @param origin Origin.
	 */
	executeOperations(operations: Operation[], origin: LocalTxOrigin): OperationResult[]

	/**
	 * Returns public FeeJuice balance and private FeeJuice balance (via PrivateFPC).
	 * Cached for 5 minutes in the service worker; pass forceRefresh to bypass.
	 * @param networkId Network id.
	 * @param accountAddress Account address.
	 * @param forceRefresh Bypass cache and fetch fresh values.
	 */
	getGasBalances(networkId: string, accountAddress: string, forceRefresh?: boolean): GasBalances

	/**
	 * Cache-only peek at the last-known FeeJuice balances — instant, never
	 * triggers a fetch. `stale: true` marks an entry past the TTL or
	 * invalidated (settled tx / PrivateFPC change); callers render it dimmed
	 * while a real `getGasBalances` refresh runs. `null` means this key was
	 * never fetched in the current service-worker lifetime.
	 */
	peekGasBalances(networkId: string, accountAddress: string): { balances: GasBalances; stale: boolean } | null

	/**
	 * Estimates the fee for a transfer without executing it.
	 * Runs simulation in the background and returns fee breakdown.
	 */
	estimateTransferFee(
		networkId: string,
		accountAddress: string,
		tokenId: number,
		tokenContract: string,
		transferType: TransferType,
		recipientAddress: string,
		amount: bigint,
		feeSettings: FeeSettings,
		estimateToken?: string,
	): TransferFeeEstimate | TransferFeeQueued

	/**
	 * Estimates the fee for one send-like operation of a stored dApp interaction,
	 * by reference: the SW re-materializes the request at `(interactionId,
	 * index)` and applies `feeSettings` after validating its fee path. The
	 * result's `previewId` names the snapshot of discovered authorizations the
	 * confirm of that operation is held to. Answers queued, its token free to ask
	 * again, while a send holds or awaits the slot of the request's chain.
	 */
	estimateOperationFee(
		interactionId: string,
		index: number,
		feeSettings: FeeSettings,
		estimateToken?: string,
		flowKey?: string,
	): TransferFeeEstimate | TransferFeeQueued

	/**
	 * Discovers, without signing, the private authorizations a stored
	 * `default_entrypoint` operation would need at send. Same by-reference,
	 * token and flow-key contract as {@link estimateOperationFee}; its
	 * `previewId` participates in {@link cancelEstimate} the same way.
	 */
	previewOperationAuthwits(
		interactionId: string,
		index: number,
		estimateToken?: string,
		flowKey?: string,
	): OperationAuthwitPreview | TransferFeeQueued

	/**
	 * Decodes calls for the approval card against the artifacts the PXE holds on
	 * `networkId`, index-aligned with `calls`. Display only: the result names
	 * parameters and values for the user to read and never feeds execution, so
	 * the popup may hand over its own copy of the calls. A call the wallet cannot
	 * decode says why instead of guessing.
	 */
	decodeCallsForDisplay(networkId: string, calls: DisplayCallInput[]): DecodedCall[]

	/**
	 * Decodes the public grants of the stored operation at `(interactionId, index)` for the approval
	 * card, in action order: each from the fields its message hash commits to, encoded as signing
	 * encodes them, under the checks and bound of {@link decodeCallsForDisplay}. By reference, as
	 * {@link estimateOperationFee}, so the card reads the request approval executes. A grant that
	 * does not encode, decode, or decode back to its fields says why.
	 */
	decodeGrantsForDisplay(interactionId: string, index: number): DecodedGrant[]

	/** {@link decodeGrantsForDisplay} for a held send: the stored request the fee question
	 *  `interactionId` shows. */
	decodeQuestionGrantsForDisplay(interactionId: string): DecodedGrant[]

	/**
	 * Cancel an in-flight fee estimate by its caller-minted token.
	 *
	 * Estimates have no journal record, so this is the estimate-side sibling
	 * of {@link cancelJob}, backed by the SW's EstimateCancelRegistry:
	 * abort-if-running (the pipeline stops at its next stage boundary — an
	 * ACVM simulation already in flight cannot be preempted) AND
	 * evict-if-stashed (a completed estimate's cached reuse entry is dropped,
	 * so a cancelled estimate can never be consumed at confirm). Unknown or
	 * foreign-profile tokens no-op silently.
	 */
	cancelEstimate(estimateToken: string): void

	/**
	 * Cancel an in-flight job by its operation-journal id.
	 *
	 * Lossy-cancel semantics: the journal is transitioned to
	 * `cancelled` synchronously and the SW-side AbortSignal for that job
	 * is fired. The underlying prove call may still be running in the
	 * offscreen document (BB.wasm can't be preempted); its result is
	 * dropped silently when it eventually resolves.
	 *
	 * Submission is blocked: the SW pipeline checks `signal.aborted` at
	 * each stage boundary and short-circuits before `sendTxTask`. If the
	 * cancel arrives once the journal has already transitioned to
	 * `submitting` (the broadcast is in flight), the FSM rejects the
	 * `submitting → cancelled` transition and `cancelJob` drops the
	 * abort signal silently — the flow proceeds to its natural
	 * `succeeded` / `failed` terminal. Honouring the cancel there would
	 * flip the journal to cancelled while the tx still landed on chain,
	 * producing a contradictory record.
	 *
	 * No-op for unknown jobIds or jobs that already terminated.
	 */
	cancelJob(jobId: string): void

	/**
	 * Resumes a queued send of the active profile that asked again, at exactly the `fee` its record
	 * shows. False, with nothing resumed, for any other record, a changed fee or a second accept.
	 */
	acceptQueuedFee(jobId: string, fee: string): boolean

	/** The SW's memory of the latest prove attempt (`outcome`) and of a Presto
	 *  approval denial (`denial`, cleared by the next native proof). Hints only:
	 *  both reset on SW restart; the journal is the record. */
	getLastProveOutcome(): LastProveOutcome
}
