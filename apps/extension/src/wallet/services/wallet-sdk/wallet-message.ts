/**
 * The pipeline a connected dApp's wallet message runs: the pending cap and the session's FIFO on
 * arrival, the queued journal row, then the establishment, check, profile, reset and Terms gates
 * before the dispatcher, and the response.
 */

import type { ActiveSession, BackgroundConnectionHandler } from "@aztec-labs/wallet-sdk/extension/handlers"
import type { WalletMessage, WalletResponse } from "@aztec-labs/wallet-sdk/types"
import {
	describeExternalId,
	describeWireMethod,
	type DispatchHooks,
	type SessionContext,
	type WalletSdkDispatcher,
} from "@nulo/wallet-bridge"
import {
	ChainNotSupportedError,
	InvalidWalletArgumentsError,
	ScopeViolationError,
	TermsAcceptanceRequiredError,
	TooManyPendingError,
	UnsupportedMethodError,
} from "@nulo/extension-messaging/errors"
import type { KeyedLock } from "@nulo/wallet-core/utils"
import type { AccountService } from "@/wallet/services/account/service"
import type { DappSessionService } from "@/wallet/services/dapp-session/service"
import type { ExecutionService } from "@/wallet/services/execution/service"
import type { LegalAdmission } from "@/wallet/services/legal/service"
import type { NetworkService } from "@/wallet/services/network/service"
import type { ResetRunGate } from "@/wallet/services/network-reset/spec"
import type { OperationJournalService } from "@/wallet/services/operation-journal/service"
import type { ProfileService } from "@/wallet/services/profile/service"
import type { ILogger } from "@/wallet/logger"
import { type RequestLog, traceTag } from "@/wallet/logger/request-log"
import { randomIdNotIn } from "@/wallet/services/id-allocators"
import { LogLevel } from "@/wallet/logger"
import { SESSION_INVALID_ERROR, toWalletResponseError } from "./error-envelope"
import { enforceSessionProfileBinding, type ProfileSwitchEpoch } from "./profile-switch-teardown"
import { failQueuedForError, failQueuedIfUnclaimed, type QueuedFailureKind, tryCreateQueuedJournal } from "./queued-journal"
import { chainSendTxWithVouching } from "./queued-wait-vouching"
import { createSessionBaton } from "./session-baton"
import { chainInfoToChainId } from "./session-established"
import type { SessionHolders } from "./session-holders"
import { bindLiveSession, type LiveSession, traceAnswers } from "./live-session"
import { toJsonSafe } from "./to-json-safe"
import type { VerificationHold } from "./verification-hold"

/** What the pipeline reads, projected per message from the handler's deps and state. */
export type MessagePipelineDeps = {
	handler: BackgroundConnectionHandler
	sessions: SessionHolders
	switchEpoch: ProfileSwitchEpoch
	dispatcher: WalletSdkDispatcher
	profileService: ProfileService
	accountService: AccountService
	networkService: NetworkService
	dappSessionService: DappSessionService
	executionService: ExecutionService
	operationJournal: OperationJournalService
	legal: LegalAdmission
	resetRun: ResetRunGate
	logger: ILogger
	/** Each request's capture; absent, nothing is recorded. */
	requests?: RequestLog
}

/** A queued row's developer line when its call's session ended before the call ran. */
const SESSION_NO_LONGER_VALID = "Session no longer valid — reconnect"

export function onWalletMessage(session: ActiveSession, message: WalletMessage, deps: MessagePipelineDeps): void {
	const key = session.sessionId
	// Upstream passes whatever the ciphertext's JSON decoded to. A non-object has no id to answer, and
	// reading one past the admission below would throw before its slot could be released.
	if (typeof message !== "object" || message === null) {
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Debug,
			`Dropping a decrypted message that is not an object, session ${describeExternalId(key)}`,
		)
		return
	}
	const bound = bindLiveSession(deps.handler, session)
	// Captured once, on arrival. Upstream reads the session before it awaits the decrypt, so a message
	// whose session ended meanwhile arrives with the old object: it must not capture a successor's
	// hold under the same id, and it has nowhere to be answered.
	const hold = bound.isLive() ? deps.sessions.holds.get(key) : undefined
	if (hold === undefined) {
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Debug,
			`Dropping ${describeWireMethod(message.type)}: its session ${describeExternalId(key)} ended`,
		)
		return
	}
	const live = beginRequest(bound, session, message, deps.requests)
	const { walletTraceId } = live
	const admitted = hold.admit()
	if (admitted === undefined) {
		refuseOverPendingCap(live, key, message, deps.sessions.decryptLocks, deps.logger)
		return
	}
	// A request never answered (dropped, suppressed, or its session gone) ends here; an answered one ended first.
	const release = () => {
		admitted()
		deps.requests?.end(walletTraceId, "dropped")
	}
	const prev = deps.sessions.sessionQueues.get(key) ?? Promise.resolve()

	// Baton-based FIFO (see `session-baton.ts` for mechanics).
	// Resolves when the sendTx handler enqueues on the execution mutex
	// (via `onExecutionEnqueued`) OR when the handler completes
	// (safety-net `.finally(releaseFifo)`), whichever fires first.
	const { baton, releaseFifo } = createSessionBaton()

	// Gate on establishment validation. Between the SDK's
	// key-exchange response and onSessionEstablished's async validation, a
	// message must not ride a session being terminated as unverified — and
	// must not persist a durable journal record for it. Capture the
	// per-session validation promise and re-check its identity after the
	// await: a termination during the wait deletes (or replaces) the entry,
	// so an already-waiting handler drops. This gate is computed on message
	// ARRIVAL, NOT behind the FIFO baton — so a queued sibling still gets its
	// durable queued-journal record immediately. Two concurrent `sendTx`
	// requests must BOTH show as `queued` before either is approved (the
	// anti-lost-tx invariant `concurrent-sendtx.test.ts` pins); serializing
	// only execution — never record creation — behind the baton preserves it.
	const validation = deps.sessions.establishmentStatus.get(key)
	const establishedPromise = (validation ?? Promise.resolve(false)).then(
		(established) => established && deps.sessions.establishmentStatus.get(key) === validation,
	)

	// Queued journal is created on arrival (concurrent across siblings),
	// gated on establishment. Only a top-level `sendTx` gets one: the
	// dispatcher refuses a batch holding a `sendTx` leg before any leg runs,
	// so no batched send ever waits to be shown.
	const queuedJournalIdPromise: Promise<string | undefined> =
		message.type === "sendTx"
			? establishedPromise.then((ok) => createQueuedJournalIfStamped(ok, message, session, deps))
			: Promise.resolve(undefined)
	// Registered before the run's own continuation, so the row is aliased before the call runs.
	queuedJournalIdPromise.then(
		(journalId) => journalId && deps.requests?.alias(walletTraceId, { journalId }),
		() => {},
	)

	// Pre-claim liveness: the record ages in `queued` through the whole
	// session-FIFO wait + its own approval popup — a legitimate wait
	// the reaper's grace cannot distinguish from a lost handler. The
	// begin/end PLACEMENT invariants live (unit-pinned) in
	// `queued-wait-vouching.ts`.
	// The slot frees when the call's handling settles, not at the FIFO release: a send past its
	// baton still holds its arguments until it is answered.
	chainSendTxWithVouching({
		queuedJournalIdPromise,
		prev,
		vouch: deps.executionService,
		releaseFifo,
		run: (queuedJournalId) =>
			runEstablishedMessage(queuedJournalId, establishedPromise, releaseFifo, { session, live, hold }, message, deps),
	}).then(release, release)
	deps.sessions.sessionQueues.set(
		key,
		baton.catch(() => {}),
	)
}

/** The call's session, answering every error with `walletTraceId`, which is minted whatever the developer
 *  mode: a field present only with it would tell every dApp the setting. */
type TracedSession = LiveSession & { walletTraceId: string }

function beginRequest(bound: LiveSession, session: ActiveSession, message: WalletMessage, requests: RequestLog | undefined): TracedSession {
	const walletTraceId = randomIdNotIn((id) => requests?.has(id) === true, 8)
	requests?.begin(walletTraceId, {
		method: describeWireMethod(message.type),
		originHost: hostOf(session.origin),
		chainId: chainIdOf(session),
	})
	const live = traceAnswers(bound, walletTraceId, (envelope) => requests?.end(walletTraceId, { envelope }))
	return { ...live, walletTraceId }
}

/** The capture's chain, `-1` for a malformed `chainInfo`: the handler refuses that call itself, typed. */
function chainIdOf(session: ActiveSession): number {
	try {
		return chainInfoToChainId(session)
	} catch {
		return -1
	}
}

function hostOf(origin: string): string {
	try {
		return new URL(origin).host
	} catch {
		return "[unknown]"
	}
}

/** The stamp guard runs BEFORE the durable journal write: this path
 *  independently resolves profile/session/account/network, so without the
 *  anchor an A-era message racing a switch could persist a B-profile
 *  operation. Establishment stamps before its validation promise resolves, so
 *  a missing stamp here means a superseded/foreign session — skip the record
 *  (the handler's own guard rejects the message itself). */
function createQueuedJournalIfStamped(
	ok: boolean,
	message: WalletMessage,
	session: ActiveSession,
	deps: MessagePipelineDeps,
): ReturnType<typeof tryCreateQueuedJournal> | undefined {
	const stampedProfileId = deps.sessions.sessionProfiles.get(session.sessionId)
	return ok && stampedProfileId !== undefined
		? tryCreateQueuedJournal(message, session, {
				journal: deps.operationJournal,
				profile: deps.profileService,
				dappSession: deps.dappSessionService,
				networkSvc: deps.networkService,
				account: deps.accountService,
				stampedProfileId,
				logger: deps.logger,
			})
		: undefined
}

/** Refused at arrival, before any row or FIFO slot: `MAX_PENDING_PER_SESSION` of the session's
 *  calls already wait or run. The reply rides the session's decrypt lane, so the lane's depth bounds
 *  owed replies with its decrypts; it is enqueued and never awaited, since this runs inside the lane. */
function refuseOverPendingCap(
	live: LiveSession,
	sessionId: string,
	message: WalletMessage,
	decryptLocks: KeyedLock,
	logger: ILogger,
): void {
	logger.log("wallet-sdk", LogLevel.Debug, `Refusing ${describeWireMethod(message.type)}: too many of the session's calls are pending`)
	const response: WalletResponse = {
		messageId: message.messageId,
		walletId: "nulo",
		error: toWalletResponseError(new TooManyPendingError()),
	}
	decryptLocks
		.withLock(sessionId, () => live.respond(response))
		.catch((error: unknown) => {
			logger.log("wallet-sdk", LogLevel.Error, `Failed to send response for ${describeWireMethod(message.type)}`, { error })
		})
}

/** A call whose session ended before it ran: nothing is sent, and its queued row fails as `kind`. */
async function dropUnrunMessage(
	message: WalletMessage,
	sessionId: string,
	queuedJournalId: string | undefined,
	kind: QueuedFailureKind,
	operationJournal: OperationJournalService,
	logger: ILogger,
	walletTraceId?: string,
): Promise<void> {
	logger.log(
		"wallet-sdk",
		LogLevel.Debug,
		`Dropping ${describeWireMethod(message.type)} for session ${describeExternalId(sessionId)}: the session ended before it ran`,
		...traceTag(walletTraceId),
	)
	if (queuedJournalId) await failQueuedIfUnclaimed(operationJournal, queuedJournalId, SESSION_NO_LONGER_VALID, logger, kind)
}

async function runEstablishedMessage(
	queuedJournalId: string | undefined,
	establishedPromise: Promise<boolean>,
	releaseFifo: ReturnType<typeof createSessionBaton>["releaseFifo"],
	call: { session: ActiveSession; live: TracedSession; hold: VerificationHold },
	message: WalletMessage,
	deps: MessagePipelineDeps,
): Promise<void> {
	const { session, live } = call
	const tag = traceTag(live.walletTraceId)
	// Re-gate execution behind the baton. A session that
	// failed/lost establishment must not execute either — not just skip
	// its journal. Same promise as the journal gate, so it resolves once.
	if (!(await establishedPromise)) {
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Warn,
			`Dropping message for session ${describeExternalId(session.sessionId)}: failed/lost establishment validation`,
			...tag,
		)
		return
	}
	// Behind the FIFO, so the calls a check held run in arrival order once it is confirmed. A call
	// parked here keeps its settled gates: a session that ended meanwhile, whatever now holds its id,
	// runs nothing of it.
	const outcome = await call.hold.outcome
	if (outcome !== "released" || !live.isLive()) {
		const kind = outcome === "released" ? "wallet_refused" : outcome
		return dropUnrunMessage(message, session.sessionId, queuedJournalId, kind, deps.operationJournal, deps.logger, live.walletTraceId)
	}
	return handleWalletMessage(
		{
			session,
			message,
			live,
			walletTraceId: live.walletTraceId,
			hooks: {
				// The FIFO releases once ExecutionService enqueues the approved request on the execution
				// mutex, which keeps the session's sends in arrival order.
				onExecutionEnqueued: releaseFifo,
				queuedJournalId,
				onJournalCreated: (journalId) => deps.requests?.alias(live.walletTraceId, { journalId }),
			},
		},
		{
			dispatcher: deps.dispatcher,
			profileService: deps.profileService,
			operationJournal: deps.operationJournal,
			sessionProfiles: deps.sessions.sessionProfiles,
			switchEpoch: deps.switchEpoch,
			logger: deps.logger,
			legal: deps.legal,
			resetRun: deps.resetRun,
		},
	)
}

export type WalletMessageDeps = {
	dispatcher: WalletSdkDispatcher
	profileService: ProfileService
	operationJournal: OperationJournalService
	sessionProfiles: Map<string, string>
	switchEpoch: ProfileSwitchEpoch
	logger: ILogger
	legal: LegalAdmission
	resetRun?: ResetRunGate
}

/**
 * Handle an incoming wallet message from a connected dApp.
 *
 * Dispatches the method call to the WalletSdkDispatcher, then encrypts
 * and sends the response back through the BackgroundConnectionHandler.
 * Every send and termination goes through `live`, so a call whose session
 * ended mid-flight never reaches a successor under the same id.
 *
 * `hooks` is the wallet-bridge `DispatchHooks` contract, imported rather than mirrored, so the
 * `onExecutionEnqueued` wiring is type-checked against the dispatcher end to end. Its
 * `queuedJournalId` decides, on the identity-guard and catch paths, whether an unclaimed `queued`
 * record is failed.
 */
export async function handleWalletMessage(
	request: { session: ActiveSession; message: WalletMessage; live: LiveSession; hooks?: DispatchHooks; walletTraceId?: string },
	deps: WalletMessageDeps,
): Promise<void> {
	const { session, message, live, hooks, walletTraceId } = request
	const { dispatcher, profileService, operationJournal, sessionProfiles, switchEpoch, logger, legal, resetRun } = deps
	const response: WalletResponse = {
		messageId: message.messageId,
		walletId: "nulo",
	}
	// The switch epoch the response is composed under — gates delivery at the
	// tail. Captured BEFORE the awaited profile read: a switch landing inside
	// that await must register as a bump AFTER this baseline, or the stale
	// `profile` would pass the entry guard and the tail would see no change.
	const preEntryEpoch = switchEpoch.current()
	let entryEpoch: number | undefined

	try {
		// The admission moment: capture the execution fence (profile + deletion epoch +
		// live session serial) that every fenced op this message dispatches runs under, in
		// place of a bare active-profile read. Throws when locked, same as before.
		const fence = await profileService.captureExecutionFence()
		entryEpoch = preEntryEpoch

		// Identity guard: the channel serves ONLY the profile that established
		// it (map-miss = fail closed). The dApp gets the error envelope, then
		// the standard disconnect. `ctx.profileId` below is therefore always
		// the session's OWN profile, and the dispatcher's session lookup
		// anchors on it — an in-flight message that outlives a later switch
		// stays A-consistent or fails closed; it can never observe the new
		// profile.
		const mayProceed = await enforceSessionProfileBinding({
			sessionId: session.sessionId,
			origin: session.origin,
			activeProfileId: fence.profileId,
			sessionProfiles,
			respond: () => {
				response.error = SESSION_INVALID_ERROR
				return live.respond(response)
			},
			terminateSession: () => live.terminate(),
			logger,
		})
		if (!mayProceed) {
			// The guard's early return bypasses the catch below — close a
			// pre-created queued record here too, or it sits at "Queued..."
			// until the reaper's stuck sweep.
			if (hooks?.queuedJournalId) {
				await failQueuedIfUnclaimed(operationJournal, hooks.queuedJournalId, SESSION_NO_LONGER_VALID, logger, "wallet_refused")
			}
			return
		}

		const ctx: SessionContext = {
			chainId: chainInfoToChainId(session),
			profileId: fence.profileId,
			origin: session.origin,
			sessionId: session.sessionId,
			fence,
			walletTraceId,
		}

		// Once per top-level request, before the dispatcher sees a method name: no dApp request is
		// served without a current Terms acceptance. The catch below answers with the typed envelope
		// and closes any queued journal row, exactly as for every other refusal.
		// A request that arrives while a network reset runs waits for it, at most a bounded time;
		// the per-chain guards still decide what it may do once admitted.
		await resetRun?.waitForRunEnd()
		await legal.assertCurrent()
		// The last await before the dispatch: the session can end, and its id re-key, inside any of
		// the reads above.
		if (!live.isLive()) {
			return dropUnrunMessage(
				message,
				session.sessionId,
				hooks?.queuedJournalId,
				"wallet_refused",
				operationJournal,
				logger,
				walletTraceId,
			)
		}

		// Hooks ride as an internal 4th arg — deliberately NOT on `ctx` so
		// `dispatch("batch", ...)`'s recursive ctx forwarding can't leak them
		// into batch legs (would let an inner sendTx release the top-level
		// baton before the batch finishes).
		const raw = await dispatcher.dispatch(message.type, message.args, ctx, hooks)
		response.result = toJsonSafe(raw)
	} catch (error) {
		// Structured EIP-1193-aligned envelope for recognised WalletError subclasses
		// (JobCancelledError → 4001, CapabilityNotGrantedError → 4100). Upstream
		// `@aztec-labs/wallet-sdk` collapses `response.error` to
		// `new Error(JSON.stringify(error))` at `extension_wallet.ts:181`, so dApps
		// that want to discriminate parse the message — see the wallet-bridge
		// README for the recipe. Mapping lives in `error-envelope.ts` so it can be
		// unit-tested in isolation; everything not recognised collapses to one
		// constant -32603 object.
		response.error = toWalletResponseError(error)
		// Pass the error as an OBJECT, never pre-stringified: a finished string is opaque to the
		// logger's redaction, so interpolating it here would smuggle whatever the error carries
		// (endpoint URLs, argument values) straight into the log store.
		logger.log(
			"wallet-sdk",
			isExpectedRefusal(error) ? LogLevel.Debug : LogLevel.Error,
			`Method ${describeWireMethod(message.type)} failed for session ${describeExternalId(session.sessionId)}`,
			response.error,
			...traceTag(walletTraceId),
		)

		if (hooks?.queuedJournalId) {
			await failQueuedForError(operationJournal, hooks.queuedJournalId, error, logger)
		}
	}

	// The entry guard is one-shot: a switch landing mid-dispatch normally tears
	// the session down (upstream sendResponse then no-ops), but a teardown
	// hiccup can leave the channel live — and a response composed with the NEW
	// profile's reads must never reach the old channel. The EPOCH comparison
	// (not an active-identity check) also catches switch-then-lock, where the
	// active profile reads `undefined` and an identity check would wave the
	// response through. Pure lock/unlock-to-same bumps nothing, so those
	// pinned flows still deliver.
	if (entryEpoch !== undefined && switchEpoch.current() !== entryEpoch) {
		logger.log(
			"wallet-sdk",
			LogLevel.Warn,
			`Suppressing ${describeWireMethod(message.type)} response for session ${describeExternalId(session.sessionId)}: profile switched mid-dispatch`,
			...traceTag(walletTraceId),
		)
		return
	}

	try {
		await live.respond(response)
	} catch (sendError) {
		// The error goes as an OBJECT, not interpolated: this is an internal transport failure worth
		// diagnosing, and passing it whole lets the logger's projection scrub and cap it.
		logger.log("wallet-sdk", LogLevel.Error, `Failed to send response for ${describeWireMethod(message.type)}`, sendError)
	}
}

/** A refusal a connected dApp can repeat on every poll, or with silent sends over the waiting-sends
 *  cap, so it logs at `debug`: an `error` line lands in every user's log buffer. */
function isExpectedRefusal(error: unknown): boolean {
	return (
		error instanceof TermsAcceptanceRequiredError ||
		error instanceof ScopeViolationError ||
		error instanceof ChainNotSupportedError ||
		error instanceof InvalidWalletArgumentsError ||
		error instanceof UnsupportedMethodError ||
		error instanceof TooManyPendingError
	)
}
