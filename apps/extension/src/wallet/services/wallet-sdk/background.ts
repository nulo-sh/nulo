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
import { BackgroundConnectionHandler, type PendingDiscovery } from "@aztec-labs/wallet-sdk/extension/handlers"
import { NOOP_LOGGER } from "@aztec-labs/wallet-sdk/types"
import { buildContentTransport } from "./content-admission"
import { sessionKnownTo } from "./stale-session"
import { cancelPendingVerification, deletePendingVerificationForTab, type PendingVerificationEntry } from "./pending-verification"
import {
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
import { describeExternalId, DiscoveryQueue, type INetworkReader, WalletSdkDispatcher } from "@nulo/wallet-bridge"
import type { ClockPort, WindowPort } from "@nulo/wallet-core/ports"
import type { KeyedLock } from "@nulo/wallet-core/utils"
import { VerifyAdmissionGate } from "./verify-admission"
import { type DiscoveryDeps, handleDiscovery, type PendingWindow } from "./discovery-flow"
import { handleSessionEstablished } from "./session-established"
import { wireSessionTeardown } from "./session-revocation"
import { wireTabLifecycle } from "./tab-lifecycle"
import { wireRestartPreparation } from "./restart-preparation"
import type { TrackedWindowPort } from "@/wallet/services/window-manager/restart-ended-windows"
import { bindLiveSession } from "./live-session"
import { MAX_PENDING_PER_SESSION, wireVerificationHold } from "./verification-hold"
import { type MessagePipelineDeps, onWalletMessage } from "./wallet-message"
import { SessionHolders } from "./session-holders"
import type { ILogger } from "@/wallet/logger"
import { LogLevel } from "@/wallet/logger"

declare const __VERSION__: string

/**
 * Initialize the wallet-sdk BackgroundConnectionHandler and wire it
 * to the extension's service layer.
 *
 * Call this after `services.start()` in the service worker entry point.
 */
export function initWalletSdkHandler(
	services: ServiceCollection,
	logger: ILogger,
	ports: { windows: TrackedWindowPort; clock: ClockPort },
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
	ports.windows.onRemoved((windowId) => state.admission.windowRemoved(windowId))

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
	wireRestartPreparation({ profileService: deps.profileService, handler, endSession, windows: ports.windows, logger })

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
		late: {},
	}
}

/** The markers go last: they are how the tab's reservations are found. Deleting its tombstones is
 *  safe because the SDK has already dropped the tab's discoveries, so none of their ids can
 *  establish. */
function tearDownTabAttempts(state: SdkHandlerState, tabId: number): void {
	for (const [id, marker] of state.pendingVerification) if (marker.tabId === tabId) state.admission.onSessionGone(id)
	deletePendingVerificationForTab(state.pendingVerification, tabId)
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
			state.sessions.establishmentStatus.set(session.sessionId, validated)
			return validated.then(() => undefined)
		},

		onSessionTerminated: (sessionId) => {
			state.admission.onSessionGone(sessionId)
			state.sessions.end(sessionId)
		},

		onWalletMessage: (session, message) => onWalletMessage(session, message, messagePipelineDeps(deps, state)),
	}
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
		switchEpoch: state.late.switchEpoch!,
		logger: deps.logger,
	}
}

/** `late` is bound before `handler.initialize()` and never rebound, so reading it on arrival equals
 *  reading it behind the session's FIFO. */
function messagePipelineDeps(deps: SdkDeps, state: SdkHandlerState): MessagePipelineDeps {
	return {
		handler: state.late.handler!,
		sessions: state.sessions,
		switchEpoch: state.late.switchEpoch!,
		dispatcher: deps.dispatcher,
		profileService: deps.profileService,
		accountService: deps.accountService,
		networkService: deps.networkService,
		dappSessionService: deps.dappSessionService,
		executionService: deps.executionService,
		operationJournal: deps.operationJournal,
		legal: deps.legal,
		resetRun: deps.resetRun,
		logger: deps.logger,
	}
}
