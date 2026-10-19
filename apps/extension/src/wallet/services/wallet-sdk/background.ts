/**
 * Wallet-SDK Background Integration
 *
 * Sets up the `BackgroundConnectionHandler` from `@aztec-labs/wallet-sdk` in the
 * extension's service worker. This replaces the old `RpcService` + content
 * script proxy system with the standardized wallet-sdk discovery / key-exchange
 * / encrypted-channel protocol.
 *
 * ## How it works
 *
 * 1. **Discovery**: A dApp broadcasts a discovery request via postMessage.
 *    The content script forwards it to the background. We receive it via
 *    `onPendingDiscovery` and either auto-approve (returning user with valid
 *    session) or show a popup for user approval via `DappInteractionService`.
 *
 * 2. **Key Exchange**: After approval, the wallet-sdk performs ECDH P-256 key
 *    exchange to establish an AES-256-GCM encrypted channel.
 *
 * 3. **Wallet Messages**: Once connected, the dApp sends method calls (e.g.
 *    `sendTx`, `simulateTx`) encrypted over the channel. We decrypt them
 *    and route to `WalletSdkDispatcher` which delegates to `ExecutionService`.
 *
 * 4. **Responses**: Results are encrypted and sent back through the channel.
 */

// Patch WalletSchema before wallet-sdk reads it (Nulo-custom `registerToken`).
// Must be the first import in this module — see @nulo/wallet-sdk-schema-patch.
import "@nulo/wallet-sdk-schema-patch/register"

import logoDataUri from "@/assets/logo.png?inline"
import {
	BackgroundConnectionHandler,
	type BackgroundTransport,
	type PendingDiscovery,
	type ActiveSession,
} from "@aztec-labs/wallet-sdk/extension/handlers"
import { NOOP_LOGGER, type WalletMessage, type WalletResponse } from "@aztec-labs/wallet-sdk/types"
import { attachContentListener } from "./content-message-relay"
import { type ContentScriptMessageEnvelope, isSubframeSender, validateContentScriptMessage } from "./content-script-validator"
import { sessionDisconnectedMessage, sessionKnownTo, staleSessionVerdict } from "./stale-session"
import { SESSION_INVALID_ERROR, toWalletResponseError } from "./error-envelope"
import { toJsonSafe } from "./to-json-safe"
import { cancelPendingVerification, deletePendingVerificationForTab, type PendingVerificationEntry } from "./pending-verification"
import {
	enforceSessionProfileBinding,
	type ProfileSwitchEpoch,
	stampSessionProfileGuarded,
	trackProfileSwitchEpoch,
	wireProfileSwitchTeardown,
} from "./profile-switch-teardown"

import type { IService, ServiceCollection } from "@/wallet/base"
import { NetworkService } from "@/wallet/services/network/service"
import { AccountService } from "@/wallet/services/account/service"
import { ExecutionService } from "@/wallet/services/execution/service"
import { ProfileService } from "@/wallet/services/profile/service"
import { DappInteractionService } from "@/wallet/services/dapp-interaction/service"
import { TokenService } from "@/wallet/services/token/service"
import { LegalAcceptanceService, type LegalAdmission } from "@/wallet/services/legal/service"
import { NETWORK_RESET_SERVICE_NAME, type ResetRunGate } from "@/wallet/services/network-reset/spec"
import { DappSessionService } from "@/wallet/services/dapp-session/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import {
	describeExternalId,
	describeWireMethod,
	type DispatchHooks,
	DiscoveryQueue,
	type INetworkReader,
	type SessionContext,
	WalletSdkDispatcher,
} from "@nulo/wallet-bridge"
import type { ClockPort, WindowPort } from "@nulo/wallet-core/ports"
import {
	ChainNotSupportedError,
	InvalidWalletArgumentsError,
	ScopeViolationError,
	TermsAcceptanceRequiredError,
	TooManyPendingError,
	UnsupportedMethodError,
	isReceiverGoneRejection,
} from "@nulo/extension-messaging/errors"
import type { KeyedLock } from "@nulo/wallet-core/utils"
import { VerifyAdmissionGate } from "./verify-admission"
import { ConnectBridge } from "./connect-bridge"
import { type DiscoveryDeps, handleDiscovery, type PendingWindow } from "./discovery-flow"
import { failQueuedForError, failQueuedIfUnclaimed, type QueuedFailureKind, tryCreateQueuedJournal } from "./queued-journal"
import { chainSendTxWithVouching } from "./queued-wait-vouching"
import { createSessionBaton } from "./session-baton"
import { chainInfoToChainId, handleSessionEstablished } from "./session-established"
import { wireSessionTeardown } from "./session-revocation"
import { wireTabLifecycle } from "./tab-lifecycle"
import { bindLiveSession, type LiveSession } from "./live-session"
import { MAX_PENDING_PER_SESSION, type VerificationHold, wireVerificationHold } from "./verification-hold"
import { SessionHolders } from "./session-holders"
import type { ILogger } from "@/wallet/logger"
import { LogLevel } from "@/wallet/logger"

declare const __VERSION__: string

/**
 * Feature flag to allow iframe (subframe) dApps to talk to
 * the wallet. Default `false` — Nulo's wrapper rejects content-script
 * messages from subframes. Override by setting
 * `VITE_NULO_ALLOW_IFRAME_DAPPS=1` at build time (rare; research found no
 * legitimate iframe-dApp use cases in the Nulo ecosystem). Even with it on,
 * a key exchange completes only from a frame of the origin the session is
 * credited to, the top frame's: a cross-origin subframe cannot connect.
 *
 * Why a build-time env flag (not a runtime config) — runtime config opens a
 * widening primitive that an attacker could try to flip via storage poisoning
 * or popup compromise. Build-time keeps the policy immutable per release.
 */
const NULO_ALLOW_IFRAME_DAPPS: boolean = import.meta.env?.VITE_NULO_ALLOW_IFRAME_DAPPS === "1"

/** A queued row's developer line when its call's session ended before the call ran. */
const SESSION_NO_LONGER_VALID = "Session no longer valid — reconnect"

/**
 * Initialize the wallet-sdk BackgroundConnectionHandler and wire it
 * to the extension's service layer.
 *
 * Call this after `services.start()` in the service worker entry point.
 */
export function initWalletSdkHandler(
	services: ServiceCollection,
	logger: ILogger,
	ports: { windows: WindowPort; clock: ClockPort },
): BackgroundConnectionHandler {
	const deps = resolveSdkDeps(services, logger)
	const state = createSdkHandlerState(ports)

	const handler = new BackgroundConnectionHandler(
		{
			walletId: "nulo",
			walletName: "Nulo",
			walletVersion: __VERSION__,
			// Inline so no resource has to be web-accessible: a URL would let every origin probe
			// for the extension. The SDK forwards the string verbatim.
			walletIcon: logoDataUri,
			// 5.0 added a required `logger`; NOOP preserves the prior no-SDK-logging behavior.
			// (Follow-up: route to the @nulo logger to surface channel/heartbeat diagnostics.)
			logger: NOOP_LOGGER,
		},
		buildContentTransport(logger, {
			sessionKnown: (sessionId, tabId) => sessionKnownTo(state.late.handler, sessionId, tabId),
			discoveryCredit: (sessionId) => state.late.handler?.getPendingDiscovery(sessionId),
		}),
		buildHandlerCallbacks(deps, state, ports.windows),
	)
	state.late.handler = handler
	state.late.discoveryQueue = new DiscoveryQueue(handler, logger)
	// A verify window's slot is freed only when the window itself is gone.
	ports.windows.onRemoved((windowId) => {
		state.admission.windowRemoved(windowId)
		state.bridge.windowRemoved(windowId)
	})

	serializeDecryption(handler, state.sessions.decryptLocks, logger)
	// The wallet's decision to end a session drops its held calls before the transport is told: a
	// termination that throws leaves the session live, and its calls must not wait on it.
	const endSession = (sessionId: string) => {
		state.sessions.holds.get(sessionId)?.drop("wallet_refused")
		handler.terminateSession(sessionId)
	}
	wireSessionTeardown(
		{ getActiveSessions: () => handler.getActiveSessions(), terminateSession: endSession },
		deps.dappSessionService,
		{ sessionProfiles: state.sessions.sessionProfiles, pendingVerification: state.pendingVerification },
		logger,
	)

	// Profile-bound channel teardown: a switch disconnects every live session
	// stamped to another profile (and unstamped debris) BEFORE the discovery
	// drain below can serve the new profile. The epoch tracker feeds the
	// response-delivery gate in handleWalletMessage.
	state.late.switchEpoch = trackProfileSwitchEpoch(deps.profileService.onActiveProfileChanged)
	wireProfileSwitchTeardown({
		onActiveProfileChanged: deps.profileService.onActiveProfileChanged,
		getActiveSessions: () => handler.getActiveSessions(),
		sessionProfiles: state.sessions.sessionProfiles,
		terminateSession: endSession,
		logger,
	})
	wireVerificationHold({
		holds: state.sessions.holds,
		onActiveProfileChanged: deps.profileService.onActiveProfileChanged,
		onVerificationConfirmed: deps.dappSessionService.onVerificationConfirmed,
		terminateSession: (sessionId) => handler.terminateSession(sessionId),
		logger,
	})
	wireDiscoveryDrain(deps, state)

	// Tab lifecycle (close + cross-origin navigation → session termination)
	// lives in `tab-lifecycle.ts`; it MUST stay registered before
	// `handler.initialize()`. Handler methods are arrow-wrapped to keep `this`.
	wireTabLifecycle({
		onTabTeardown: (tabId) => tearDownTabAttempts(state, tabId),
		terminateForTab: (tabId) => handler.terminateForTab(tabId),
		terminateSession: endSession,
		getActiveSessions: () => handler.getActiveSessions(),
		logger,
	})

	handler.initialize()
	logger.log("wallet-sdk", LogLevel.Info, "BackgroundConnectionHandler initialized")

	return handler
}

type SdkDeps = {
	networkService: NetworkService
	accountService: AccountService
	executionService: ExecutionService
	profileService: ProfileService
	dappInteractionService: DappInteractionService
	dappSessionService: DappSessionService
	operationJournal: OperationJournalService
	tokenService: TokenService
	legal: LegalAdmission
	resetRun: ResetRunGate
	dispatcher: WalletSdkDispatcher
	logger: ILogger
}

/** The dispatcher's one network read. A quarantined chain resolves to no network, so every dApp
 *  call on it gets `CHAIN_NOT_SUPPORTED` and the dApp learns nothing of the stale chain. */
export function dispatcherNetworks(networkService: Pick<NetworkService, "getNetworksRaw" | "isChainQuarantined">): INetworkReader {
	return {
		getNetworksRaw: async (profileId, chainId) => {
			if (chainId !== undefined && (await networkService.isChainQuarantined(profileId, chainId))) return []
			return networkService.getNetworksRaw(profileId, chainId)
		},
	}
}

function resolveSdkDeps(services: ServiceCollection, logger: ILogger): SdkDeps {
	const networkService: NetworkService = services.get(NetworkService.name)
	const accountService: AccountService = services.get(AccountService.name)
	const executionService: ExecutionService = services.get(ExecutionService.name)
	const profileService: ProfileService = services.get(ProfileService.name)
	const dappInteractionService: DappInteractionService = services.get(DappInteractionService.name)
	const dappSessionService: DappSessionService = services.get(DappSessionService.name)
	const operationJournal: OperationJournalService = services.get(OperationJournalService.name)
	const tokenService: TokenService = services.get(TokenService.name)
	const legal: LegalAcceptanceService = services.get(LegalAcceptanceService.name)
	const resetRun = services.get<IService & ResetRunGate>(NETWORK_RESET_SERVICE_NAME)

	const dispatcher = new WalletSdkDispatcher(
		dispatcherNetworks(networkService),
		accountService,
		executionService,
		dappInteractionService,
		dappSessionService,
		logger,
		{
			// The isTokenRegistered custom RPC: a wallet-local registry read, scope-gated upstream.
			isTokenRegistered: async (address, profileId, chainId) => {
				const tokens = await tokenService.getTokens(profileId, chainId)
				const target = address.toLowerCase()
				return tokens.some((t) => t.contract.toLowerCase() === target)
			},
		},
	)
	return {
		networkService,
		accountService,
		executionService,
		profileService,
		dappInteractionService,
		dappSessionService,
		operationJournal,
		tokenService,
		legal,
		resetRun,
		dispatcher,
		logger,
	}
}

/** SW-lifetime state shared by the handler callbacks and the wiring around them. */
type SdkHandlerState = {
	/**
	 * Track new connections (user-approved via popup) keyed by the discovery
	 * REQUEST id — which upstream reuses verbatim as the sessionId — so
	 * establishment can only ever read its OWN approval's marker: concurrent
	 * same-`(origin, chainId)` handshakes and reconnects can't cross-consume,
	 * and the entry's `profileId` pins WHO approved for the skew check.
	 */
	pendingVerification: Map<string, PendingVerificationEntry>
	/** What each live channel owns, ended together when its session terminates (see `session-holders.ts`). */
	sessions: SessionHolders
	/**
	 * Guard against concurrent discoveries for the same `(origin, chainId)`
	 * pair (prevents duplicate connect popups). Holds the open window's kind and
	 * a promise that resolves when it completes, so duplicate discoveries
	 * wait for the session to exist before being approved. Keying on the
	 * `(origin, chainId)` tuple lets a dApp open a connect popup for chain A
	 * and chain B concurrently without one waiting on the other (and without
	 * the chain-B discovery being auto-approved against a chain-A session).
	 */
	pendingDiscoveryPromises: Map<string, PendingWindow>
	/** Per-origin reconnect throttle and verify-window budget (see `verify-admission.ts`). */
	admission: VerifyAdmissionGate
	/** Handshakes currently waiting on another popup for the same `(origin, chainId)`, bounded. */
	dedupeWaiters: Map<string, number>
	/** The connect windows Allows handed over, each kept until its check opens (see `connect-bridge.ts`). */
	bridge: ConnectBridge
	/**
	 * Bound right after the handler is constructed, before `initialize()`
	 * attaches any listener; callbacks read these at call time, never earlier.
	 */
	late: { handler?: BackgroundConnectionHandler; discoveryQueue?: DiscoveryQueue; switchEpoch?: ProfileSwitchEpoch }
}

export function createSdkHandlerState(ports: { windows: WindowPort; clock: ClockPort }): SdkHandlerState {
	const pendingVerification = new Map<string, PendingVerificationEntry>()
	return {
		pendingVerification,
		sessions: new SessionHolders(),
		pendingDiscoveryPromises: new Map(),
		admission: new VerifyAdmissionGate(ports.clock, {
			// A marker still waiting when its slot is given back is tombstoned: that id can no longer establish.
			released: (id) => cancelPendingVerification(pendingVerification, id),
		}),
		dedupeWaiters: new Map(),
		// Best effort: a window already gone rejects, and the bridge has dropped it either way.
		bridge: new ConnectBridge(ports.clock, (windowId) => void ports.windows.remove(windowId).catch(() => undefined)),
		late: {},
	}
}

/** The markers go last: they are how the tab's reservations are found. Deleting its tombstones is
 *  safe because the SDK has already dropped the tab's discoveries, so none of their ids can
 *  establish. */
function tearDownTabAttempts(state: SdkHandlerState, tabId: number): void {
	state.bridge.endForTab(tabId)
	for (const [id, marker] of state.pendingVerification) if (marker.tabId === tabId) state.admission.onSessionGone(id)
	deletePendingVerificationForTab(state.pendingVerification, tabId)
}

type DiscoveryCredit = Pick<PendingDiscovery, "origin" | "tabId">

/** What the content wrapper needs besides the SDK's listener. */
type ContentWrapperDeps = {
	logger: ILogger
	/** Whether the sender's tab holds the session, per the handler that exists right now; asked only for a session-bound message. */
	sessionKnown: (sessionId: string, tabId: number) => boolean
	/** The tab and origin the pending discovery under this id is credited to, if one is pending. */
	discoveryCredit: (sessionId: string) => DiscoveryCredit | undefined
	sendToTab: BackgroundTransport["sendToTab"]
}

function buildContentTransport(
	logger: ILogger,
	{ sessionKnown, discoveryCredit }: Pick<ContentWrapperDeps, "sessionKnown" | "discoveryCredit">,
): BackgroundTransport {
	// The handler's `sendToTab` returns void, so the send's rejection is nobody's to observe. A
	// tab that navigated away (or lost its content script) has nowhere to deliver to; every
	// other failure still surfaces as an unhandled rejection.
	const sendToTab: BackgroundTransport["sendToTab"] = (tabId, message) => {
		chrome.tabs.sendMessage(tabId, message).catch((err: unknown) => {
			if (!isReceiverGoneRejection(err)) throw err
		})
	}
	return {
		sendToTab,
		addContentListener: (listener) => {
			// The chrome.runtime.onMessage registration lives in the module-scope
			// content-message-relay (cold-wake fix): registering a SECOND chrome
			// listener here would double-deliver — a duplicate discovery's
			// coalesce→reject path deletes the entry its twin queued, and a
			// duplicate secure-message double-journals a sendTx. Attach to the
			// relay instead; buffered cold-wake messages flush through this same
			// validated wrapper.
			attachContentListener(admitContentMessage(listener, { logger, sessionKnown, discoveryCredit, sendToTab }))
		},
	}
}

/**
 * The checks every content-script message passes before the SDK handler sees it, in this order:
 * top frame, envelope schema, a key exchange from its discovery's document, then a session this
 * background knows.
 */
function admitContentMessage(
	listener: Parameters<BackgroundTransport["addContentListener"]>[0],
	deps: ContentWrapperDeps,
): (message: unknown, sender: chrome.runtime.MessageSender) => undefined {
	const { logger } = deps
	return (message, sender) => {
		// Subframe rejection. Upstream `BackgroundConnectionHandler`
		// attributes origin via `sender.tab?.url` (top-frame URL), so an
		// iframe at https://evil.com/x.html embedded in https://app.example.com
		// would be credited to https://app.example.com — inheriting any
		// grants the user gave to the parent page.
		//
		// Nulo-side defense-in-depth: reject content-script messages
		// from subframes at the wrapper layer. `sender.frameId === 0`
		// is the top frame; any other value (or undefined for
		// non-tab senders) is a subframe.
		//
		// Feature flag: `NULO_ALLOW_IFRAME_DAPPS` (env / build-time)
		// disables this check. Default is "reject subframes" because
		// research found NO legitimate iframe-dApp use cases in the
		// Nulo ecosystem. If a counterexample surfaces, set the env
		// var rather than removing this check.
		//
		// Frame-targeted send replies (the full fix) require upstream
		// `chrome.tabs.sendMessage(tabId, msg, { frameId })` support
		// in `BackgroundConnectionHandler`'s sendToTab signature —
		// upstream's `(tabId, msg)` interface doesn't pass frameId
		// through, so this remains an upstream coordination item.
		if (NULO_ALLOW_IFRAME_DAPPS !== true && isSubframeSender(sender)) {
			logger.log(
				"wallet-sdk",
				LogLevel.Debug,
				// The tab and sender URLs are the user's browsing history, and any subframe on any
				// page can trigger this line. The frame identity is what diagnoses the rejection.
				`Rejected content-script message from subframe (frameId=${sender.frameId}, tabId=${sender.tab?.id}) — subframe defense-in-depth`,
			)
			return undefined
		}

		// Zod-validate content-script-originated envelopes before
		// forwarding to the upstream handler. `passthrough` lets
		// non-content-script messages through (ServiceClient
		// responses, offscreen pings, etc.) — the upstream handler
		// filters those by `origin`. `invalid` drops adversarial /
		// malformed envelopes early with a structured debug log.
		const verdict = validateContentScriptMessage(message)
		if (verdict.kind === "invalid") {
			logger.log("wallet-sdk", LogLevel.Debug, "Dropping malformed content-script envelope", verdict.reason)
			return undefined
		}
		if (verdict.kind === "valid" && !keyExchangeFromItsDiscovery(verdict.message, sender, deps.discoveryCredit)) {
			logger.log("wallet-sdk", LogLevel.Debug, "Dropping a key exchange from outside its discovery's document")
			return undefined
		}
		if (verdict.kind === "valid" && replyIfStale(verdict.message, sender.tab?.id, deps)) return undefined
		listener(message, sender)
		return undefined
	}
}

/**
 * Upstream credits a session to the pending discovery its key exchange names, so the exchange must come
 * from that discovery's tab and document origin; one naming no pending discovery is upstream's to drop.
 */
function keyExchangeFromItsDiscovery(
	envelope: ContentScriptMessageEnvelope,
	sender: chrome.runtime.MessageSender,
	discoveryCredit: ContentWrapperDeps["discoveryCredit"],
): boolean {
	if (envelope.type !== "key-exchange-request" || envelope.sessionId === undefined) return true
	const credit = discoveryCredit(envelope.sessionId)
	if (credit === undefined) return true
	return sender.tab?.id === credit.tabId && credit.origin !== "unknown" && senderDocumentOrigin(sender) === credit.origin
}

/** The sending document's own origin: Chrome sets `sender.origin` (an opaque document's is `"null"`),
 *  Firefox only `sender.url`. */
function senderDocumentOrigin(sender: chrome.runtime.MessageSender): string | undefined {
	if (sender.origin !== undefined) return sender.origin
	if (sender.url === undefined) return undefined
	try {
		return new URL(sender.url).origin
	} catch {
		return undefined
	}
}

/**
 * A validated message for a session the sender's tab does not hold is answered with the SDK's
 * own disconnect instead of being forwarded: the handler would drop it in silence, and the page
 * would wait out its 300 s ceiling for a background that forgot it (see `stale-session.ts`).
 * Returns whether the message was answered here.
 */
function replyIfStale(envelope: ContentScriptMessageEnvelope, tabId: number | undefined, deps: ContentWrapperDeps): boolean {
	const stale = staleSessionVerdict(envelope, tabId, deps.sessionKnown)
	if (stale === "forward") return false
	// A connected page repeats this every heartbeat until it reconnects; debug keeps it out of
	// every user's log buffer.
	deps.logger.log("wallet-sdk", LogLevel.Debug, "Answering a message for a session the sender's tab does not hold", {
		type: envelope.type,
		session: describeExternalId(stale.sessionId),
	})
	deps.sendToTab(stale.disconnectTab, sessionDisconnectedMessage(stale.sessionId))
	return true
}

function buildHandlerCallbacks(
	deps: SdkDeps,
	state: SdkHandlerState,
	windows: WindowPort,
): ConstructorParameters<typeof BackgroundConnectionHandler>[2] {
	return {
		onPendingDiscovery: (discovery) => {
			handleDiscovery(discovery, discoveryDeps(deps, state))
		},

		onSessionEstablished: (session) => {
			const handler = state.late.handler!
			// Upstream calls this synchronously after posting the key-exchange response, and a message
			// needs a round trip and a decrypt to arrive, so the hold exists before any message does.
			const hold = state.sessions.holds.open(session.sessionId, session.verificationHash)
			// The connect window stays until this establishment's check window exists or it fails.
			const bridged = state.bridge.pin(session.sessionId)
			const endBridge = () => bridged && state.bridge.end(bridged)
			// Liveness and termination read this session object, not its id: an establishment paused
			// across its own end and a same-id re-key must neither proceed on nor end the successor.
			const live = bindLiveSession(handler, session)
			// Record the validation promise SYNCHRONOUSLY (before its first await)
			// so onWalletMessage can gate on it even if a message arrives in the
			// gap between the SDK's key-exchange response and this validation.
			const validated = handleSessionEstablished(session, {
				dappSessionService: deps.dappSessionService,
				terminateSession: () => live.terminate(),
				pendingVerification: state.pendingVerification,
				stampSessionProfile: (sessionId, profileId) =>
					stampSessionProfileGuarded(state.sessions.sessionProfiles, sessionId, profileId, (id) =>
						handler.getActiveSessions().some((s) => s.sessionId === id),
					),
				isSessionLive: () => live.isLive(),
				windows,
				reservations: state.admission,
				logger: deps.logger,
			})
			// A failed establishment ends without a termination when its id was taken over meanwhile.
			void validated.then(
				(ok) => ok || hold.drop("wallet_refused"),
				() => hold.drop("wallet_refused"),
			)
			void validated.then(endBridge, endBridge)
			state.sessions.establishmentStatus.set(session.sessionId, validated)
			return validated.then(() => undefined)
		},

		onSessionTerminated: (sessionId) => {
			state.admission.onSessionGone(sessionId)
			state.sessions.end(sessionId)
		},

		onWalletMessage: (session, message) => onWalletMessage(session, message, deps, state),
	}
}

function onWalletMessage(session: ActiveSession, message: WalletMessage, deps: SdkDeps, state: SdkHandlerState): void {
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
	const live = bindLiveSession(state.late.handler!, session)
	// Captured once, on arrival. Upstream reads the session before it awaits the decrypt, so a message
	// whose session ended meanwhile arrives with the old object: it must not capture a successor's
	// hold under the same id, and it has nowhere to be answered.
	const hold = live.isLive() ? state.sessions.holds.get(key) : undefined
	if (hold === undefined) {
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Debug,
			`Dropping ${describeWireMethod(message.type)}: its session ${describeExternalId(key)} ended`,
		)
		return
	}
	const release = hold.admit()
	if (release === undefined) {
		refuseOverPendingCap(live, key, message, state.sessions.decryptLocks, deps.logger)
		return
	}
	const prev = state.sessions.sessionQueues.get(key) ?? Promise.resolve()

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
	const validation = state.sessions.establishmentStatus.get(key)
	const establishedPromise = (validation ?? Promise.resolve(false)).then(
		(established) => established && state.sessions.establishmentStatus.get(key) === validation,
	)

	// Queued journal is created on arrival (concurrent across siblings),
	// gated on establishment. Only a top-level `sendTx` gets one: the
	// dispatcher refuses a batch holding a `sendTx` leg before any leg runs,
	// so no batched send ever waits to be shown.
	const queuedJournalIdPromise: Promise<string | undefined> =
		message.type === "sendTx"
			? establishedPromise.then((ok) => createQueuedJournalIfStamped(ok, message, session, deps, state))
			: Promise.resolve(undefined)

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
			runEstablishedMessage(queuedJournalId, establishedPromise, releaseFifo, { session, live, hold }, message, deps, state),
	}).then(release, release)
	state.sessions.sessionQueues.set(
		key,
		baton.catch(() => {}),
	)
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
	deps: SdkDeps,
	state: SdkHandlerState,
): ReturnType<typeof tryCreateQueuedJournal> | undefined {
	const stampedProfileId = state.sessions.sessionProfiles.get(session.sessionId)
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
): Promise<void> {
	logger.log(
		"wallet-sdk",
		LogLevel.Debug,
		`Dropping ${describeWireMethod(message.type)} for session ${describeExternalId(sessionId)}: the session ended before it ran`,
	)
	if (queuedJournalId) await failQueuedIfUnclaimed(operationJournal, queuedJournalId, SESSION_NO_LONGER_VALID, logger, kind)
}

async function runEstablishedMessage(
	queuedJournalId: string | undefined,
	establishedPromise: Promise<boolean>,
	releaseFifo: ReturnType<typeof createSessionBaton>["releaseFifo"],
	call: { session: ActiveSession; live: LiveSession; hold: VerificationHold },
	message: WalletMessage,
	deps: SdkDeps,
	state: SdkHandlerState,
): Promise<void> {
	const { session, live } = call
	// Re-gate execution behind the baton. A session that
	// failed/lost establishment must not execute either — not just skip
	// its journal. Same promise as the journal gate, so it resolves once.
	if (!(await establishedPromise)) {
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Warn,
			`Dropping message for session ${describeExternalId(session.sessionId)}: failed/lost establishment validation`,
		)
		return
	}
	// Behind the FIFO, so the calls a check held run in arrival order once it is confirmed. A call
	// parked here keeps its settled gates: a session that ended meanwhile, whatever now holds its id,
	// runs nothing of it.
	const outcome = await call.hold.outcome
	if (outcome !== "released" || !live.isLive()) {
		const kind = outcome === "released" ? "wallet_refused" : outcome
		return dropUnrunMessage(message, session.sessionId, queuedJournalId, kind, deps.operationJournal, deps.logger)
	}
	return handleWalletMessage(
		{
			session,
			message,
			live,
			hooks: {
				// The FIFO releases once ExecutionService enqueues the approved request on the execution
				// mutex, which keeps the session's sends in arrival order.
				onExecutionEnqueued: releaseFifo,
				queuedJournalId,
			},
		},
		{
			dispatcher: deps.dispatcher,
			profileService: deps.profileService,
			operationJournal: deps.operationJournal,
			sessionProfiles: state.sessions.sessionProfiles,
			switchEpoch: state.late.switchEpoch!,
			logger: deps.logger,
			legal: deps.legal,
			resetRun: deps.resetRun,
		},
	)
}

/**
 * Serialize decryption per-session to prevent message reordering.
 * The wallet-sdk uses `void this.handleEncryptedMessage(...)` (fire-and-forget),
 * so two messages can have their decryptions race.
 * A message that finds `MAX_PENDING_PER_SESSION` operations queued in its session's lane is dropped
 * unanswered: its id is inside the ciphertext, so nothing can be refused before the decrypt.
 * TODO: Remove this monkey-patch if wallet-sdk adds a proper serialization API.
 */
function serializeDecryption(handler: BackgroundConnectionHandler, decryptLocks: KeyedLock, logger: ILogger): void {
	// biome-ignore lint/suspicious/noExplicitAny: monkey-patching private method on BackgroundConnectionHandler to serialize decryption
	const origDecrypt = (handler as any).handleEncryptedMessage.bind(handler)
	// biome-ignore lint/suspicious/noExplicitAny: monkey-patching private method on BackgroundConnectionHandler to serialize decryption
	;(handler as any).handleEncryptedMessage = (sessionId: string, encrypted: unknown) => {
		if (decryptLocks.waiting(sessionId) >= MAX_PENDING_PER_SESSION) {
			logger.log(
				"wallet-sdk",
				LogLevel.Debug,
				`Dropping a secure message for session ${describeExternalId(sessionId)}: its lane is full`,
			)
			return Promise.resolve()
		}
		return decryptLocks.withLock(sessionId, () => origDecrypt(sessionId, encrypted))
	}
}

/** On unlock, drain any queued discovery requests */
function wireDiscoveryDrain(deps: SdkDeps, state: SdkHandlerState): void {
	const { profileService, logger } = deps
	profileService.onActiveProfileChanged.add((profile) => {
		const discoveryQueue = state.late.discoveryQueue!
		if (profile) {
			logger.log("wallet-sdk", LogLevel.Info, `Profile unlocked, draining discovery queue (${discoveryQueue.size} queued)`)
			discoveryQueue.drain((discovery) => drainQueuedDiscovery(discovery, deps, state))
		} else {
			logger.log("wallet-sdk", LogLevel.Info, `Profile locked (${discoveryQueue.size} in queue)`)
		}
	})
}

async function drainQueuedDiscovery(discovery: PendingDiscovery, deps: SdkDeps, state: SdkHandlerState): Promise<boolean> {
	const { profileService, logger } = deps
	const p = await profileService.getActiveProfile()
	if (!p) {
		logger.log("wallet-sdk", LogLevel.Warn, "Wallet locked mid-drain, stopping")
		return false
	}
	logger.log("wallet-sdk", LogLevel.Info, `Processing queued discovery: request ${describeExternalId(discovery.requestId)}`)
	await handleDiscovery(discovery, discoveryDeps(deps, state))
	logger.log("wallet-sdk", LogLevel.Info, `Queued discovery processed: request ${describeExternalId(discovery.requestId)}`)
	return true
}

function discoveryDeps(deps: SdkDeps, state: SdkHandlerState): DiscoveryDeps {
	return {
		handler: state.late.handler!,
		profileService: deps.profileService,
		networkService: deps.networkService,
		dappInteractionService: deps.dappInteractionService,
		dappSessionService: deps.dappSessionService,
		pendingVerification: state.pendingVerification,
		pendingDiscoveryPromises: state.pendingDiscoveryPromises,
		discoveryQueue: state.late.discoveryQueue!,
		legal: deps.legal,
		resetRun: deps.resetRun,
		admission: state.admission,
		dedupeWaiters: state.dedupeWaiters,
		bridge: state.bridge,
		switchEpoch: state.late.switchEpoch!,
		logger: deps.logger,
	}
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
	request: { session: ActiveSession; message: WalletMessage; live: LiveSession; hooks?: DispatchHooks },
	deps: WalletMessageDeps,
): Promise<void> {
	const { session, message, live, hooks } = request
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
			return dropUnrunMessage(message, session.sessionId, hooks?.queuedJournalId, "wallet_refused", operationJournal, logger)
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
		// unit-tested in isolation; everything not recognised collapses to a
		// string, preserving the original wire contract.
		response.error = toWalletResponseError(error)
		// Pass the error as an OBJECT, never pre-stringified: a finished string is opaque to the
		// logger's redaction, so interpolating it here would smuggle whatever the error carries
		// (endpoint URLs, argument values) straight into the log store.
		logger.log(
			"wallet-sdk",
			isExpectedRefusal(error) ? LogLevel.Debug : LogLevel.Error,
			`Method ${describeWireMethod(message.type)} failed for session ${describeExternalId(session.sessionId)}`,
			response.error,
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
