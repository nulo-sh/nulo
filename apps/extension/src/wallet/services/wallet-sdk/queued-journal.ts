/**
 * Best-effort "queued" journal-record creation at wallet-sdk message arrival.
 *
 * Extracted from `background.ts` so the cap + pre-auth + parsing logic is
 * unit-testable without spinning up the full BackgroundConnectionHandler.
 *
 * Behaviour:
 *   - Skip queued visibility when:
 *       - no active profile
 *       - no matching dapp session
 *       - no `transaction` capability grant
 *       - per-session cap reached (MAX_QUEUED_PER_SESSION)
 *       - global cap reached (MAX_QUEUED_GLOBAL)
 *   - Skip ONLY for `sendTx` messages — caller is responsible for routing.
 *   - Cap enforcement is atomic via `queuedCreationLock` — without this,
 *     concurrent arrivals all see a stale count and the cap is advisory
 *     rather than protective.
 */
import type { WalletMessage } from "@aztec-labs/wallet-sdk/types"
import type { ActiveSession } from "@aztec-labs/wallet-sdk/extension/handlers"
import type { ILogger } from "@/wallet/logger"
import { LogLevel } from "@/wallet/logger"
import {
	AuthRegistryRefusalError,
	CapabilityNotGrantedError,
	ChainNotSupportedError,
	InvalidWalletArgumentsError,
	ScopeViolationError,
	SessionEndedError,
	TermsAcceptanceRequiredError,
	ValidationError,
} from "@nulo/extension-messaging/errors"
import type { KnownJobErrorKind } from "@nulo/wallet-core/jobs"
import { getErrorMessage, Lock } from "@nulo/wallet-core/utils"
import type { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { type JournalCallCarrier, type JournalRetitle, journalCallOf } from "@/wallet/services/operation-journal/spec"
import type { ProfileService } from "@/wallet/services/profile/service"
import { WalletLockedError } from "@/wallet/services/profile/wallet-locked-error"
import { refusalOf } from "@/wallet/services/execution/contract-resolver"
import type { DappSessionService } from "@/wallet/services/dapp-session/service"
import type { NetworkService } from "@/wallet/services/network/service"
import type { AccountService } from "@/wallet/services/account/service"
import { NoUsableAccountError, projectStoredGrants, requestedSenderOf, resolveAuthorizedSessionAccount } from "@nulo/wallet-bridge"
import { parseCaipAccount } from "@/wallet/utils/caip"
import type { CaipAccount } from "@/wallet/services/dapp-interaction/spec"
import { type WindowEnd, WindowEndedError } from "@/wallet/services/dapp-interaction/window-end"
import { WINDOW_CLOSED_BY_USER } from "@/wallet/services/window-manager/window-manager"
import { pickPrimaryWireCall } from "@/utils/primary-method"
import { chainInfoToChainId } from "./session-established"

/** Per-session queued-record cap. Bounds the activity feed under burst flood. */
export const MAX_QUEUED_PER_SESSION = 8
/** Global queued-record cap across all sessions. Coarser DoS backstop. */
export const MAX_QUEUED_GLOBAL = 32

/** Held around count + create, so concurrent arrivals cannot all read a count below the cap. */
export const queuedCreationLock = new Lock("wallet-sdk-bg:queued-creation")

export interface TryCreateQueuedJournalDeps {
	journal: OperationJournalService
	profile: ProfileService
	dappSession: DappSessionService
	networkSvc: NetworkService
	/** Supplies wallet-ordered accounts, so the record is filed under the same
	 *  account the dispatcher will send from. */
	account: AccountService
	/** The session's establishment-stamped profile. Every profile-scoped read
	 *  below anchors on it (session row, network) and the active profile must
	 *  still MATCH it — this path runs before the dispatch guard and would
	 *  otherwise let an A-era message racing a profile switch persist a
	 *  B-profile record. */
	stampedProfileId: string
	logger: ILogger
}

/**
 * Create a journal record at `queued` stage so the activity feed surfaces
 * an incoming sendTx the moment it arrives — BEFORE the per-session FIFO
 * lets the handler open the approval popup.
 *
 * Returns the new record's id, or `undefined` on any failure. Best-effort
 * visibility: a failure here NEVER blocks the actual handler from running
 * (the handler falls back to creating its own in-flight record via
 * `beginDappExecuteJournal`).
 *
 * Cheap pre-auth gates: skip queued visibility when there's no active
 * profile, no dapp session, or no sendTx capability grant. Avoids
 * surfacing requests that the handler will reject anyway.
 *
 * Cap enforcement is atomic: the count-then-create section runs under
 * `queuedCreationLock` so concurrent arrivals can't all see a stale
 * "below cap" count and over-create.
 */
export async function tryCreateQueuedJournal(
	message: WalletMessage,
	session: ActiveSession,
	deps: TryCreateQueuedJournalDeps,
): Promise<string | undefined> {
	const { journal, profile, dappSession, networkSvc, account: accountSvc, stampedProfileId, logger } = deps
	try {
		const activeProfile = await profile.getActiveProfile()
		if (!activeProfile) return undefined
		// Stamp-vs-active check: a switch racing this message must not produce a
		// record under the NEW profile (the dispatch guard will reject the
		// message itself; the record must not exist either).
		if (activeProfile.id !== stampedProfileId) return undefined
		// Captured WITH the profile, asserted by the journal at persist time: if
		// this profile is deleted (even deleted-and-reimported under the same id)
		// while we resolve session/account/network below, the create is refused
		// instead of writing stale dApp metadata into the successor incarnation.
		const profileEpoch = profile.getDeletionState().capture(activeProfile.id)

		const chainId = chainInfoToChainId(session)
		// Anchored to the STAMPED profile — not a live re-read.
		const dapp = await dappSession.tryGetDappSessionByOriginAndChain(session.origin, String(chainId), stampedProfileId)
		if (!dapp?.accounts?.length) return undefined

		// sendTx requires the `transaction` capability (the capability type
		// scoped to send-like operations). Pre-auth-gate skip when missing.
		if (!holdsTransactionGrant(dapp.capabilityGrants, logger)) return undefined

		// The record must name the account this send will actually go out as, so it
		// resolves through the SAME rule the dispatcher uses — session-authorized
		// explicit sender, else the first wallet-ordered session account. Taking
		// `accounts[0]` instead would file a multi-account session's operation
		// under whichever address the session happened to list first.
		const sessionAddresses = new Set(dapp.accounts.map((caip: string) => parseCaipAccount(caip as CaipAccount).address))
		// Visible accounts only — the SAME set the dispatcher resolves against
		// (`resolveNetworkAndAccount`). Including hidden accounts here would let a
		// hidden lower-index account win the default on this side but not on the
		// dispatcher's, which is precisely the divergence this shared rule exists
		// to prevent.
		const walletAccounts = await accountSvc.getAccounts(activeProfile.id, chainId)
		const resolved = resolveAuthorizedSessionAccount({
			walletAccounts,
			sessionAddresses,
			requestedFrom: requestedSenderOf((message as { args?: unknown[] }).args?.[1]),
		})
		// An unauthorized or unresolvable sender is left un-journaled: the dispatch
		// itself will refuse it, and a record naming the wrong account is worse
		// than no record.
		if (!resolved.ok) return undefined
		const accountAddress = resolved.account.address

		// `networkId` for activity-feed scoping must be the INTERNAL network row id
		// (RecentActivityView.journalRecordInScope filters on `network.id`), NOT
		// `String(chainId)`. Without this resolution the queued card never renders.
		// Anchored network read (getNetworksRaw takes the profile explicitly —
		// resolveNetworkByChainId would live-read the active profile).
		const networks = await networkSvc.getNetworksRaw(stampedProfileId, chainId)
		const network = networks[0]
		if (!network) return undefined

		// Critical section: cap check + record create must be atomic.
		return await queuedCreationLock.withLock(async () => {
			// Pre-persist stamp revalidation (belt over the anchored reads above):
			// the awaits since the first check are exactly where a switch lands.
			const nowActive = await profile.getActiveProfile()
			if (nowActive?.id !== stampedProfileId) return undefined
			const sessionQueuedCount = await journal.countOperations({
				sessionId: session.sessionId,
				stage: "queued",
			})
			if (sessionQueuedCount >= MAX_QUEUED_PER_SESSION) {
				logger.log(
					"wallet-sdk",
					LogLevel.Debug,
					`Per-session queued cap reached for ${session.sessionId}; skipping queued visibility`,
				)
				return undefined
			}
			const globalQueuedCount = await journal.countOperations({ stage: "queued" })
			if (globalQueuedCount >= MAX_QUEUED_GLOBAL) {
				logger.log("wallet-sdk", LogLevel.Warn, `Global queued cap reached (${MAX_QUEUED_GLOBAL}); skipping queued visibility`)
				return undefined
			}

			const primary = extractPrimaryCallFromSendTx(message)
			// Chip label: prefer the dApp's display name from its stored
			// session metadata (DappSession.dappMetadata.name, set at
			// discover/verify time). Falls back to "Unknown dapp" to match
			// the pre-existing execution path (`dapp-interaction/service.ts:309`)
			// so the queued record's subtitle equals what the live-claim record
			// would have gotten — keeps the chip text identical across queued
			// vs first-tx paths. NOTE: dappMetadata lives on DappSession (our
			// stored session), NOT on ActiveSession (the wallet-sdk transport
			// session) — those are two different types that both happen to be
			// in scope here. Previously this used `session.origin` (the full
			// URL on the transport session), which surfaced raw URLs in the
			// activity-card chip.
			const dappName = dapp.dappMetadata?.name ?? "Unknown dapp"
			const record = await journal.createOperation({
				kind: "dapp_execute",
				origin: "dapp",
				profileId: activeProfile.id,
				profileEpoch,
				sessionId: session.sessionId,
				accountAddress,
				networkId: network.id,
				title: primary?.method ?? "Transaction",
				subtitle: dappName,
				call: primary?.call,
				initialStage: { stage: "queued" },
			})
			return record.id
		})
	} catch (error) {
		logger.log("wallet-sdk", LogLevel.Warn, "tryCreateQueuedJournal failed", error)
		return undefined
	}
}

/** A malformed stored grant skips the row as a missing one does, and enforcement refuses the send
 *  itself; at `debug`, since every message of the session repeats it. */
function holdsTransactionGrant(records: readonly unknown[] | undefined, logger: ILogger): boolean {
	try {
		return projectStoredGrants(records).some((g) => g.capability.type === "transaction")
	} catch (error) {
		if (!(error instanceof ValidationError)) throw error
		logger.log("wallet-sdk", LogLevel.Debug, "Stored grant is malformed; skipping queued visibility")
		return false
	}
}

/**
 * Best-effort primary-call extraction from a sendTx wallet message, unparsed: a `to` or `args` the
 * journal would refuse leaves the call out, never the record. Mirrors what `executeAztecSendTx`
 * records at journal creation, so the queued and post-claim in-flight surfaces read the same.
 */
export function extractPrimaryCallFromSendTx(message: WalletMessage): JournalCallCarrier | undefined {
	if (message.type !== "sendTx") return undefined
	const args = message.args as unknown[] | undefined
	if (!Array.isArray(args)) return undefined
	const exec = args[0] as { calls?: unknown } | undefined
	const primary = pickPrimaryWireCall(exec?.calls)
	return primary && { method: primary.name, call: journalCallOf(primary.call.to, primary.call.args) }
}

/**
 * Transition a still-`queued` journal record to `failed`. The record is the
 * source of truth (not a mutable flag): "handler claimed then failed" already
 * carries its terminal state; "failed before claim" is ours to close so the
 * UI doesn't show a permanently-stuck "Queued..." card. The stage check MUST
 * ride `transitionIfStage`'s lock-held re-read — a separate read-then-
 * transition legally turned a mid-flight `queued → pending` claim into
 * `pending → failed`, failing an op the user had just approved.
 *
 * A classified refusal is retitled in that same write: with `retitle`, to the function a call-binding
 * refusal resolved its selector to and the refused call, else "Transaction", since the name the dApp
 * claimed is unverified. A row its window ended without a refusal (`user_rejected`, or `popup_bound`
 * for a profile switch or an unclassified failure) keeps the title it had while it waited.
 */
export async function failQueuedIfUnclaimed(
	operationJournal: OperationJournalService,
	journalId: string,
	message: string,
	logger: ILogger,
	kind: QueuedFailureKind = "popup_bound",
	retitle?: JournalRetitle,
): Promise<void> {
	try {
		await operationJournal.transitionIfStage(
			journalId,
			["queued"],
			{ stage: "failed" },
			{ kind, message, normalizedRaw: null },
			TITLE_KEEPING_KINDS.has(kind) ? undefined : { retitle: retitle ?? { title: "Transaction" } },
		)
	} catch (transitionError) {
		logger.log("wallet-sdk", LogLevel.Warn, `Failed to mark queued record ${journalId} as failed`, transitionError)
	}
}

/** The kinds a row failed before any claim can carry. */
export type QueuedFailureKind = Extract<
	KnownJobErrorKind,
	| "popup_bound"
	| "user_rejected"
	| "scope_refused"
	| "registry_refused"
	| "malformed_request"
	| "terms_refused"
	| "session_ended"
	| "wallet_refused"
>

const TITLE_KEEPING_KINDS: ReadonlySet<QueuedFailureKind> = new Set(["popup_bound", "user_rejected"])

/** A lock reads as the wallet's other lock refusals do; a profile switch is not the person refusing
 *  this send, so it does not read as one; a disconnect reads as the app's calls it ended before they
 *  ran. */
const WINDOW_END_KINDS: Readonly<Record<WindowEnd, QueuedFailureKind>> = {
	reject: "user_rejected",
	close: "user_rejected",
	lock: "session_ended",
	switch: "popup_bound",
	disconnect: "wallet_refused",
}

/** Fails a still-queued row with the error that ended its message before any claim, classified by
 *  the error's class, never its text: a Terms, grant, schema, session or lock refusal gets its own
 *  kind, a chain or account the wallet cannot serve `wallet_refused`, the window's named end its own,
 *  a close that reached the wallet before any end as the person's X, anything else `popup_bound`. */
export async function failQueuedForError(
	operationJournal: OperationJournalService,
	journalId: string,
	error: unknown,
	logger: ILogger,
): Promise<void> {
	await failQueuedIfUnclaimed(operationJournal, journalId, getErrorMessage(error), logger, queuedFailureKind(error), refusalOf(error))
}

function queuedFailureKind(error: unknown): QueuedFailureKind {
	if (error instanceof TermsAcceptanceRequiredError) return "terms_refused"
	if (error instanceof AuthRegistryRefusalError) return "registry_refused"
	if (error instanceof ScopeViolationError || error instanceof CapabilityNotGrantedError) return "scope_refused"
	if (error instanceof InvalidWalletArgumentsError) return "malformed_request"
	if (error instanceof SessionEndedError || error instanceof WalletLockedError) return "session_ended"
	if (error instanceof ChainNotSupportedError || error instanceof NoUsableAccountError) return "wallet_refused"
	if (error instanceof WindowEndedError) return WINDOW_END_KINDS[error.end]
	if (error === WINDOW_CLOSED_BY_USER) return "user_rejected"
	return "popup_bound"
}
