// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { DappSession, DappMetadata } from "@/wallet/services/dapp-session/spec"
import type { OperationApprovalDelta } from "./approval-delta"
import type {
	CapabilityParams,
	CapabilityResult,
	DiscoveredAuthwit,
	ExecutionParams,
	ExecutionResult,
	FeeSettings,
	IExecutionHooks,
	OperationRequest,
} from "@nulo/wallet-bridge"
import type { QueuedFeePayer } from "@nulo/wallet-core/jobs"
import type { ScopeViolationError } from "@nulo/extension-messaging/errors"
import type { WindowEnd } from "./window-end"

/** Protocol-shape types (`ExecutionParams`, `ExecutionResult`,
 *  `CapabilityParams`, `CapabilityResult`, all `OperationRequest`
 *  variants, `CaipChain`, `CaipAccount`) live in `@nulo/wallet-bridge`.
 *  Re-exported here so extension consumers can keep importing them via
 *  this path. */
export type { OperationApprovalDelta, ShownTokenMetadata } from "./approval-delta"
export type { WindowEnd } from "./window-end"
export type {
	AztecCreateAuthWitRequest,
	AztecExecuteUtilityRequest,
	AztecGetAddressBookRequest,
	AztecGetChainInfoRequest,
	AztecGetContractClassMetadataRequest,
	AztecGetContractMetadataRequest,
	AztecGetPrivateEventsRequest,
	AztecProfileTxRequest,
	AztecRegisterContractRequest,
	AztecRegisterSenderRequest,
	AztecSendTxRequest,
	AztecSimulateTxRequest,
	CaipAccount,
	CaipChain,
	CapabilityParams,
	CapabilityResult,
	ExecutionParams,
	ExecutionResult,
	OperationRequest,
	RegisterContractRequest,
	RegisterSenderRequest,
	RegisterTokenRequest,
	SendTransactionRequest,
	SimulateTransactionRequest,
	SimulateUtilityRequest,
} from "@nulo/wallet-bridge"

export const DAPP_INTERACTION_SERVICE_NAME = "dapp-interaction"

/**
 * Hard timeout for an approval popup, counted from its opening. Bounds the worst case when neither
 * the user interacts nor `chrome.windows.onRemoved` fires (eg. extension reload, popup crash, MV3
 * suspension races). Longer than the longest realistic prove+approve flow so legitimate users
 * aren't surprised.
 */
export const INTERACTION_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Execution-side hooks carried across the popup handoff.
 *
 * The user-approval popup splits the request handling into two phases:
 *
 *   1) `interaction()` opens the popup, returns a `handle.promise` that
 *      resolves with the final ExecutionResult.
 *   2) After the user approves, the popup calls `approveInteraction(id, ...)`
 *      which then dispatches `executeAndResolve` to actually run the operation.
 *
 * The hooks must survive that gap — they're set on the interaction record at
 * step 1, picked up by `executeAndResolve` at step 2. Without this storage,
 * the hooks would die at step 1's return and the post-popup execution path
 * would never see them.
 *
 * Aliases wallet-bridge's `IExecutionHooks` (rather than re-declaring the same
 * optional shape) so the field set stays in lockstep with the dispatcher's
 * contract: a one-sided rename on either side is a build error, not a silent
 * runtime no-op. `onExecutionEnqueued` fires once the request has enqueued on
 * the execution mutex — see `ExecutionService.acquireExecutionSlot`.
 */
export type ExecutionHooks = IExecutionHooks

export type DappInteraction = {
	id: string
	payload: InteractionPayload
	handleId: string
	cancellationToken: string
	/** Set when the dApp cancelled the request. Durable on the record (not just
	 *  the broadcast) so a popup that subscribes late can replay the state, and
	 *  service-side approval can refuse — the record survives until the window
	 *  is dismissed so overlay + WindowManager cleanup keep working. */
	cancelledAt?: number
	/**
	 * Hooks bag carried across the popup handoff. `interaction()` sets it;
	 * `approveInteraction → executeAndResolve` reads it back via storage
	 * lookup. Undefined for popups that don't carry execution hooks (e.g.
	 * verify, discover).
	 */
	hooks?: ExecutionHooks
	/** The first refusal an estimate or preview of this request met. The request can no longer be
	 *  approved, and the window's own end of it (Reject, unload, close) answers this refusal. */
	refusal?: ScopeViolationError
}

export type ExecutionPayload = {
	params: ExecutionParams
	session: DappSession
}

export type CapabilityPayload = {
	params: CapabilityParams
	session: DappSession
}

export type DiscoveryPayload = {
	params: DiscoveryParams
}

export type DiscoveryParams = {
	dappMetadata: DappMetadata
	/** The chain the dApp asked to connect on, as the wallet decoded it from the discovery. */
	chainId: string
}

export type DiscoveryResult = {
	approved: boolean
}

/** A discovery for a chain the profile has no network for. Its window only informs: it can be
 *  dismissed, never resolved, so nothing it answers approves a connection. */
export type NetworkUnavailablePayload = {
	notice: "network-unavailable"
	params: NetworkUnavailableParams
}

export type NetworkUnavailableParams = {
	dappMetadata: DappMetadata
}

/** What a held send's question window shows: the one operation it holds, as the dApp asked for it,
 *  and the figures. It has no `params`, so no approval route ever reads it as a request to execute. */
export type FeeQuestionPayload = {
	feeQuestion: {
		/** The new fee and the one the person approved, in base units. */
		fee: string
		approved: string
		payer: QueuedFeePayer
		/** The fee settings the person approved the send with. */
		feeSettings?: FeeSettings
		/** The authorizations the approval window listed for the operation. */
		discoveredAuthwits?: readonly DiscoveredAuthwit[]
	}
	operation: OperationRequest
	session: DappSession
}

/** The window's answer: only `accepted: true` sends; anything else cancels the send. */
export type FeeQuestionResult = { accepted: boolean }

export type InteractionPayload = ExecutionPayload | CapabilityPayload | DiscoveryPayload | NetworkUnavailablePayload | FeeQuestionPayload

export type Methods = {
	getInteractionPayload(id: string): InteractionPayload
	/**
	 * Execute the stored request of a live execution interaction. The SW
	 * materializes every operation from the dApp's own payload; `deltas` is
	 * index-aligned with it and carries only the popup's fee choice and the
	 * SW-minted estimate/preview ids. Rejected with "Invalid id" before any
	 * claim when the interaction is not an executable one or the lengths differ.
	 */
	approveInteraction(id: string, deltas: OperationApprovalDelta[]): void
	resolveInteraction(id: string, result: ExecutionResult | CapabilityResult | DiscoveryResult | FeeQuestionResult): void
	/** Ends a live interaction before any approval. `end` names how its window ended; one this
	 *  service does not know rejects as an unnamed Reject. */
	rejectInteraction(id: string, reason: string, end: WindowEnd): void
	/** Replay read for popups that mount after the cancel broadcast fired. */
	isInteractionCancelled(id: string): boolean
	/** Bring the approval popup of the live interaction for `journalId` to the
	 *  front. `false` when there is none, or it belongs to another profile. */
	focusInteractionWindow(journalId: string): boolean
}

export type Events = {
	onInteractionCancelled: string
}
