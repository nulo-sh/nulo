/**
 * One pending discovery, from admission to the session write: the origin and Terms checks, the
 * locked queue, the popup caps and the `(origin, chainId)` dedupe, a remembered session's
 * auto-approval, the connect window and the network-unavailable notice.
 */
import type { BackgroundConnectionHandler, PendingDiscovery } from "@aztec-labs/wallet-sdk/extension/handlers"
import type { NetworkService } from "@/wallet/services/network/service"
import type { ProfileService } from "@/wallet/services/profile/service"
import type { DappInteractionService } from "@/wallet/services/dapp-interaction/service"
import type { LegalAdmission } from "@/wallet/services/legal/service"
import type { ResetRunGate } from "@/wallet/services/network-reset/spec"
import type { DiscoveryParams } from "@/wallet/services/dapp-interaction/spec"
import { AccessLevel, type DappMetadata, type DappSession, type DappSessionService } from "@/wallet/services/dapp-session/service"
import { sanitizeWireString } from "@/wallet/services/dapp-session/capability-meta"
import { describeExternalId, DISCOVERY_STALE_MS, type DiscoveryQueue, isDiscoveryExpired } from "@nulo/wallet-bridge"
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import { deferred } from "@nulo/wallet-core/utils"
import { admitAsync, type VerifyAdmissionGate, type WindowReservation } from "./verify-admission"
import { approveOrRollbackDiscoverySession, rollBackDiscoverySession } from "./discovery-approval"
import { isSecureDappOrigin } from "./dapp-origin"
import type { PendingVerificationEntry } from "./pending-verification"
import type { ProfileSwitchEpoch } from "./profile-switch-teardown"
import { chainInfoToChainId } from "./session-established"
import type { ILogger } from "@/wallet/logger"
import { LogLevel } from "@/wallet/logger"

/** A connect window, with the profile it opened under, or the network-unavailable notice, open for
 *  one `(origin, chainId)` pair. */
export type PendingWindow = { kind: "connect"; profileId: string; settled: Promise<void> } | { kind: "notice"; settled: Promise<void> }

export function dedupeKeyOf(origin: string, chainId: string): string {
	return `${origin}|${chainId}`
}

/** The separator is part of the prefix: an origin that extends another names a different app. */
export function isOriginKey(key: string, origin: string): boolean {
	return key.startsWith(`${origin}|`)
}

/** A row of `profileId` found while its connect window for the pair is open is the one that window
 *  is writing, not a remembered app. */
function isRowInFlight(pendingWindow: PendingWindow | undefined, profileId: string): boolean {
	return pendingWindow?.kind === "connect" && pendingWindow.profileId === profileId
}

export type DiscoveryDeps = {
	handler: BackgroundConnectionHandler
	profileService: ProfileService
	networkService: Pick<NetworkService, "servesChain" | "servesLiveChain">
	dappInteractionService: DappInteractionService
	dappSessionService: DappSessionService
	pendingVerification: Map<string, PendingVerificationEntry>
	pendingDiscoveryPromises: Map<string, PendingWindow>
	discoveryQueue: DiscoveryQueue
	legal: LegalAdmission
	resetRun: ResetRunGate
	admission: VerifyAdmissionGate
	dedupeWaiters: Map<string, number>
	handedOver: Map<string, { tabId: number; windowId: number }>
	closeWindow: (windowId: number) => void
	switchEpoch: ProfileSwitchEpoch
	logger: ILogger
}

// Caps on concurrent connect popups — the unlocked-path analog of the
// locked-queue caps in `DiscoveryQueue`. Same values: a legitimate dApp needs
// at most a handful of concurrent discoveries; past this, a flooding dApp's
// requests are rejected before any popup work.
const DISCOVERY_PENDING_GLOBAL_CAP = 32
const DISCOVERY_PENDING_PER_ORIGIN_CAP = 4
/** Handshakes allowed to wait on one connect popup: past this a same-tuple flood is rejected, never parked. */
const DEDUPE_WAITERS_CAP = 8

const discoveryDeadline = (discovery: PendingDiscovery): number => discovery.timestamp + DISCOVERY_STALE_MS

/** Fail closed: an answer that cannot be read is "no". */
async function isLegalCurrent(legal: LegalAdmission): Promise<boolean> {
	return legal.assertCurrent().then(
		() => true,
		() => false,
	)
}

export async function handleDiscovery(discovery: PendingDiscovery, deps: DiscoveryDeps): Promise<void> {
	// Before the first await: upstream recorded the discovery just before this call, so a refusal
	// here leaves nothing the locked queue, a stored session or a window could act on.
	if (!isSecureDappOrigin(discovery.origin)) {
		deps.handler.rejectDiscovery(discovery.requestId)
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Debug,
			`Discovery refused (origin not secure): request ${describeExternalId(discovery.requestId)}`,
		)
		return
	}
	await handleSecureDiscovery(discovery, deps)
}

async function handleSecureDiscovery(discovery: PendingDiscovery, deps: DiscoveryDeps): Promise<void> {
	const { handler, logger } = deps
	try {
		// Resolve chainId up-front — the locked-queue coalesce/cap and the
		// popup caps below all key on `(origin,chainId)`, not just the
		// auto-approve lookup and new-session creation.
		const chainId = String(chainInfoToChainId(discovery))
		// While a reset runs, a discovery waits for it before any read below, so the profile, the
		// Terms and the session it then reads are the ones the reset left.
		await deps.resetRun.waitForRunEnd()

		// Captured BEFORE the profile read, as `handleWalletMessage` does: a switch landing inside any
		// read below registers as a bump after this baseline.
		const entryEpoch = deps.switchEpoch.current()
		const profile = await deps.profileService.getActiveProfile()
		if (!profile) {
			// `enqueue` returns false when it coalesces a duplicate or hits a
			// cap. The upstream `pendingDiscoveries` map (keyed by the dApp-controlled
			// requestId) is NOT bounded, so a dropped request must be rejected there
			// or it leaks one pending entry per requestId — a flood of distinct
			// requestIds under a single (origin,chainId) would grow it without limit,
			// defeating the queue cap. The still-queued first entry has a different
			// requestId and is untouched; it drains on unlock.
			if (!deps.discoveryQueue.enqueue(discovery.requestId, discovery.origin, chainId)) {
				handler.rejectDiscovery(discovery.requestId)
			}
			return
		}

		// Both read BEFORE the session lookup, never after it: the lookup must stay the last yield
		// ahead of the popup-promise registration below.
		const legalCurrent = await isLegalCurrent(deps.legal)
		const served = await deps.networkService.servesLiveChain(profile.id, Number(chainId))

		// Check for existing valid session (returning user on this chain → auto-approve).
		// Lookup is by `(origin, chainId)` so a session remembered on testnet does
		// NOT silently auto-approve on mainnet. The lookup is awaited
		// HERE: from its resolution to the popup-promise registration below there is
		// no yield, so two same-key discoveries can never both miss the dedupe map.
		// A row for a chain the profile has no network for reopens nothing: every call on it would
		// be refused, so it takes the new-connection path to the notice, which drops it.
		const existingSession = await deps.dappSessionService.tryGetDappSessionByOriginAndChain(discovery.origin, chainId)
		// `served` is the captured profile's answer and the lookup reads the active profile's rows: after
		// a switch, one profile's networks would decide over another's session (and could drop it).
		if (deps.switchEpoch.current() !== entryEpoch) {
			handler.rejectDiscovery(discovery.requestId)
			logger.log(
				"wallet-sdk",
				LogLevel.Info,
				`Discovery rejected (profile switched): request ${describeExternalId(discovery.requestId)}`,
			)
			return
		}
		// Read with no yield since the lookup; a row in flight waits on its window like any duplicate.
		const dedupeKey = dedupeKeyOf(discovery.origin, chainId)
		const pendingWindow = deps.pendingDiscoveryPromises.get(dedupeKey)
		if (existingSession && served && !isRowInFlight(pendingWindow, profile.id)) {
			autoApproveExistingSession(discovery, chainId, deps)
			return
		}

		// A NEW connection is an app request like any other: none without a current Terms
		// acceptance. An existing session keeps its transport above, which moves nothing and is
		// what lets that dApp receive the typed refusal for its next call.
		if (!legalCurrent) {
			handler.rejectDiscovery(discovery.requestId)
			return
		}

		// Deduplicate: if a connect popup is already showing for this
		// `(origin, chainId)` pair, wait for it to complete (so the
		// DappSession exists) then approve. Without the wait, key exchange
		// completes before the user approves and the dApp sends messages
		// (e.g. requestCapabilities) before the DappSession is persisted.
		// Keying on the tuple lets a dApp connect to chain A and chain B
		// concurrently without one waiting on the other, and prevents a
		// chain-B discovery from being auto-approved against the popup
		// outcome of a chain-A discovery (which is what would happen with
		// origin-only keying).
		if (pendingWindow) {
			if (served) await awaitPendingPopupDedupe(pendingWindow.settled, discovery, chainId, dedupeKey, deps)
			else rejectBehindNotice(discovery, chainId, deps)
			return
		}

		if (checkDiscoveryPopupCaps(discovery, deps)) return

		if (served) await runDiscoveryPopup(discovery, chainId, dedupeKey, profile.id, deps)
		else await runNetworkUnavailableNotice(discovery, chainId, dedupeKey, { staleSession: existingSession, entryEpoch }, deps)
	} catch (error) {
		rejectFailedDiscovery(discovery, error, deps)
	}
}

/** The person declined or closed the window, or the app sent a `chainInfo` that does not decode,
 *  which it can repeat at will and so logs at `debug`. */
function rejectFailedDiscovery(discovery: PendingDiscovery, error: unknown, deps: DiscoveryDeps): void {
	deps.handler.rejectDiscovery(discovery.requestId)
	const level = error instanceof InvalidWalletArgumentsError ? LogLevel.Debug : LogLevel.Warn
	deps.logger.log("wallet-sdk", level, `Discovery rejected for request ${describeExternalId(discovery.requestId)}`)
}

/** Reject an approval the dApp can no longer receive. The drain-gate
 *  staleness check is not enough — an interactive Allow/Deny popup (or a wait
 *  on a concurrent popup for the same (origin, chainId)) can resolve after the
 *  dApp's 60s discovery window closes. Re-check immediately before EVERY
 *  approval, and before the durable DappSession write, so a slow approval
 *  doesn't strand a half-open handshake or persist a session the dApp never
 *  learns about. */
function rejectIfExpired(discovery: PendingDiscovery, deps: DiscoveryDeps): boolean {
	if (isDiscoveryExpired(discovery)) {
		deps.handler.rejectDiscovery(discovery.requestId)
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Warn,
			`Discovery rejected (past Nulo's 55s freshness cutoff): request ${describeExternalId(discovery.requestId)}`,
		)
		return true
	}
	return false
}

/** Approve an admitted handshake, or give its window slot back when the approval cannot land. */
function approveAdmitted(
	discovery: PendingDiscovery,
	chainId: string,
	deps: DiscoveryDeps,
	reservation: WindowReservation,
	why: string,
): void {
	if (rejectIfExpired(discovery, deps)) {
		reservation.releaseIfUnstarted()
		return
	}
	if (!deps.handler.approveDiscovery(discovery.requestId)) {
		reservation.releaseIfUnstarted()
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Warn,
			`Discovery approve did not land (already gone): request ${describeExternalId(discovery.requestId)}`,
		)
		return
	}
	deps.logger.log(
		"wallet-sdk",
		LogLevel.Info,
		`Discovery auto-approved (${why}): request ${describeExternalId(discovery.requestId)} chain=${chainId}`,
	)
}

function rejectThrottled(discovery: PendingDiscovery, deps: DiscoveryDeps, why: string): void {
	deps.handler.rejectDiscovery(discovery.requestId)
	deps.logger.log("wallet-sdk", LogLevel.Warn, `Discovery rejected (${why}): request ${describeExternalId(discovery.requestId)}`)
}

/** A verify-window slot for a user-approved connection, which spends no reconnect token. Returns
 *  `admitAsync`'s Promise unchanged (no `async`, no `await`), so each caller's one await keeps its tick. */
function admitVerifyWindow(discovery: PendingDiscovery, deps: DiscoveryDeps) {
	return admitAsync(deps.admission, {
		id: discovery.requestId,
		origin: discovery.origin,
		deadline: discoveryDeadline(discovery),
		consumesToken: false,
	})
}

function rejectIfNotAdmitted(
	discovery: PendingDiscovery,
	deps: DiscoveryDeps,
	admitted: Awaited<ReturnType<typeof admitAsync>>,
): admitted is "rejected" | "expired" {
	if (admitted !== "rejected" && admitted !== "expired") return false
	rejectThrottled(discovery, deps, admitted === "expired" ? "expired while queued" : "verify-window queue full")
	return true
}

/** Returning user on this chain: approve through the origin's reconnect budget. A remembered
 *  handshake is the one a reload loop repeats, so it spends a token as well as the slot of the check
 *  it will show. Synchronous when admitted at once. */
function autoApproveExistingSession(discovery: PendingDiscovery, chainId: string, deps: DiscoveryDeps): void {
	const outcome = deps.admission.admit(
		{
			id: discovery.requestId,
			origin: discovery.origin,
			deadline: discoveryDeadline(discovery),
			consumesToken: true,
		},
		(reservation) => approveAdmitted(discovery, chainId, deps, reservation, "existing session"),
		() => rejectThrottled(discovery, deps, "expired while queued"),
	)
	if (outcome === "rejected") rejectThrottled(discovery, deps, "reconnect queue full")
	else if (outcome === "queued") {
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Info,
			`Discovery queued behind the origin's reconnect budget: request ${describeExternalId(discovery.requestId)}`,
		)
	}
}

async function awaitPendingPopupDedupe(
	pendingPopup: Promise<void>,
	discovery: PendingDiscovery,
	chainId: string,
	dedupeKey: string,
	deps: DiscoveryDeps,
): Promise<void> {
	const waiting = deps.dedupeWaiters.get(dedupeKey) ?? 0
	if (waiting >= DEDUPE_WAITERS_CAP) {
		rejectThrottled(discovery, deps, "too many handshakes waiting on one popup")
		return
	}
	deps.dedupeWaiters.set(dedupeKey, waiting + 1)
	try {
		await pendingPopup
		await approveAfterPopup(discovery, chainId, deps)
	} finally {
		const left = (deps.dedupeWaiters.get(dedupeKey) ?? 1) - 1
		if (left > 0) deps.dedupeWaiters.set(dedupeKey, left)
		else deps.dedupeWaiters.delete(dedupeKey)
	}
}

async function approveAfterPopup(discovery: PendingDiscovery, chainId: string, deps: DiscoveryDeps): Promise<void> {
	// The popup may have resolved with rejection (or with approval
	// for a different chain — impossible under tuple keying, but
	// defense in depth): re-check the session exists for THIS
	// `(origin, chainId)` before auto-approving. If the user
	// declined, reject this duplicate too instead of inheriting an
	// approval the user never gave.
	const settledSession = await deps.dappSessionService.tryGetDappSessionByOriginAndChain(discovery.origin, chainId)
	if (!settledSession) {
		deps.handler.rejectDiscovery(discovery.requestId)
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Info,
			`Discovery rejected (pending popup resolved without session): request ${describeExternalId(discovery.requestId)} chain=${chainId}`,
		)
		return
	}
	// A duplicate of a fresh connection verifies like one: it needs a window slot, but the
	// user's Allow on the twin popup covers it, so it spends no reconnect token.
	const admitted = await admitVerifyWindow(discovery, deps)
	if (rejectIfNotAdmitted(discovery, deps, admitted)) return
	approveAdmitted(discovery, chainId, deps, admitted, "pending popup resolved")
}

/** Cap concurrent connect popups per-origin and globally. The
 *  `(origin,chainId)` dedupe collapses exact duplicates; this bounds the
 *  distinct-key fan-out so a dApp can't spawn unbounded popup work via many
 *  chainIds (or a botnet of origins). Returns true when rejected at the cap. */
function checkDiscoveryPopupCaps(discovery: PendingDiscovery, deps: DiscoveryDeps): boolean {
	const { pendingDiscoveryPromises } = deps
	const originPopups = [...pendingDiscoveryPromises.keys()].filter((k) => isOriginKey(k, discovery.origin)).length
	if (originPopups >= DISCOVERY_PENDING_PER_ORIGIN_CAP || pendingDiscoveryPromises.size >= DISCOVERY_PENDING_GLOBAL_CAP) {
		deps.handler.rejectDiscovery(discovery.requestId)
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Warn,
			`Discovery rejected (popup cap) [origin=${originPopups}, global=${pendingDiscoveryPromises.size}]`,
		)
		return true
	}
	return false
}

/** New dApp → show discovery popup (Allow/Deny), then persist + approve. The
 *  dedupe registration, the durable writes and the `finally` release are one
 *  unit: no await separates registering the popup promise from creating it.
 *  An Allow hands its connect window over to show the emoji check: this function
 *  closes it on every exit until a verify-window reservation takes it. */
async function runDiscoveryPopup(
	discovery: PendingDiscovery,
	chainId: string,
	dedupeKey: string,
	profileId: string,
	deps: DiscoveryDeps,
): Promise<void> {
	const { handler, pendingDiscoveryPromises, logger } = deps
	const params: DiscoveryParams = { dappMetadata: discoveryDappMetadata(discovery), chainId }

	// Store a promise that resolves when the popup completes so duplicate
	// discoveries can await it.
	const { promise: popupPromise, resolve: resolvePopup } = deferred()
	pendingDiscoveryPromises.set(dedupeKey, { kind: "connect", profileId, settled: popupPromise })
	let waitingWindow: number | undefined

	try {
		const result = await deps.dappInteractionService.discover(params, discovery.requestId)
		if (!result.approved) {
			handler.rejectDiscovery(discovery.requestId)
			logger.log("wallet-sdk", LogLevel.Info, `Discovery denied: request ${describeExternalId(discovery.requestId)}`)
			return
		}
		waitingWindow = result.windowId
		if (waitingWindow !== undefined) {
			deps.handedOver.set(discovery.requestId, { tabId: discovery.tabId, windowId: waitingWindow })
		}

		// The user may have taken longer than the dApp's 60s window to
		// click Allow. Reject BEFORE the durable DappSession write so we never
		// persist a session the dApp has already stopped waiting for.
		if (rejectIfExpired(discovery, deps)) return

		// The verify window this connection will open is reserved BEFORE the session is written,
		// while the dedupe promise stays pending, so waiters cannot be released against a session
		// that is still queued for its slot.
		const admitted = await admitVerifyWindow(discovery, deps)
		if (rejectIfNotAdmitted(discovery, deps, admitted)) return
		if (waitingWindow !== undefined) {
			// A window closed while its Allow was queued fails the attach: its removal was buffered.
			if (!admitted.attach(waitingWindow, result.expiredUrl)) {
				rejectThrottled(discovery, deps, "its connect window closed while waiting for a verify-window slot")
				return
			}
			waitingWindow = undefined
		}
		await persistAndApprove(discovery, chainId, params, profileId, admitted, deps)
	} finally {
		deps.handedOver.delete(discovery.requestId)
		if (waitingWindow !== undefined) deps.closeWindow(waitingWindow)
		resolvePopup()
		pendingDiscoveryPromises.delete(dedupeKey)
	}
}

/** The dApp as a window shows it. Its dApp-controlled name is sanitized here, at the persistence
 *  boundary, so no render site sees raw bidi, zero-width or mixed-direction payloads;
 *  the url is the content script's origin, which the dApp cannot set. */
function discoveryDappMetadata(discovery: PendingDiscovery): DappMetadata {
	return { name: sanitizeWireString(discovery.appName ?? discovery.appId, 64), url: discovery.origin }
}

/** A duplicate for a chain with no network while a window for its pair is open (the notice, or a
 *  connect window whose network went away): silence, and no second window. Debug: a dApp retrying
 *  its discovery would otherwise fill every user's log. */
function rejectBehindNotice(discovery: PendingDiscovery, chainId: string, deps: DiscoveryDeps): void {
	deps.handler.rejectDiscovery(discovery.requestId)
	deps.logger.log(
		"wallet-sdk",
		LogLevel.Debug,
		`Discovery rejected (no network for this chain, a window for it is open): request ${describeExternalId(discovery.requestId)} chain=${chainId}`,
	)
}

/** A discovery for a chain the profile has no network for: the dApp gets silence and the user a
 *  notice. The dedupe promise is registered before the first await, as in `runDiscoveryPopup`, and
 *  the discovery is refused before anything opens, so no answer from the window can approve it and
 *  no session is written. A row remembered for the pair is dropped: it could only serve refusals. */
async function runNetworkUnavailableNotice(
	discovery: PendingDiscovery,
	chainId: string,
	dedupeKey: string,
	stale: { staleSession: DappSession | undefined; entryEpoch: number },
	deps: DiscoveryDeps,
): Promise<void> {
	const { promise: noticePromise, resolve: resolveNotice } = deferred()
	deps.pendingDiscoveryPromises.set(dedupeKey, { kind: "notice", settled: noticePromise })
	try {
		deps.handler.rejectDiscovery(discovery.requestId)
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Info,
			`Discovery for a chain with no network, showing the notice: request ${describeExternalId(discovery.requestId)} chain=${chainId}`,
		)
		if (stale.staleSession) await dropStaleSession(stale.staleSession, stale.entryEpoch, deps)
		await deps.dappInteractionService.notifyNetworkUnavailable({ dappMetadata: discoveryDappMetadata(discovery) })
	} finally {
		resolveNotice()
		deps.pendingDiscoveryPromises.delete(dedupeKey)
	}
}

/** Kept when its own profile serves its chain again, or after a profile switch: the deletion's
 *  teardown matches live channels by `(origin, chain)` alone, so it could reach the new profile's. */
async function dropStaleSession(session: DappSession, entryEpoch: number, deps: DiscoveryDeps): Promise<void> {
	if (await deps.networkService.servesChain(session.profileId, Number(session.chainId))) return
	if (deps.switchEpoch.current() !== entryEpoch) return
	try {
		await deps.dappSessionService.deleteDappSession(session.id)
		deps.logger.log(
			"wallet-sdk",
			LogLevel.Info,
			`Dropped a remembered dApp session on a chain with no network: chain=${session.chainId}`,
		)
	} catch {
		// Already gone (expired or revoked meanwhile): nothing is left to reopen, which is the point.
		deps.logger.log("wallet-sdk", LogLevel.Debug, `Remembered dApp session already gone: chain=${session.chainId}`)
	}
}

/** Write the approved session and approve the discovery. The window reservation is owned by the
 *  session only once the approval lands; every other exit gives it back. */
async function persistAndApprove(
	discovery: PendingDiscovery,
	chainId: string,
	params: DiscoveryParams,
	profileId: string,
	reservation: WindowReservation,
	deps: DiscoveryDeps,
): Promise<void> {
	const { handler, dappSessionService, logger } = deps
	const deleteSession = (id: string) => dappSessionService.deleteDappSession(id)
	let approved = false
	try {
		// The connect window opened on a served chain, and its network can be removed while it is up:
		// a row written then could only serve refusals. Removal after the write is the 4901 case.
		// Read before the profile check, which must stay the last await ahead of the write.
		if (!(await deps.networkService.servesLiveChain(profileId, Number(chainId)))) {
			rejectThrottled(discovery, deps, "its chain lost its network while the connect window was open")
			return
		}
		// The Allow was given under `profileId`. A switch during the admission wait is refused here,
		// before any write; one landing between this read and `addDappSession`'s fence capture is
		// refused there, which writes the row under `profileId` or not at all.
		const active = await deps.profileService.getActiveProfile()
		if (active?.id !== profileId) {
			rejectThrottled(discovery, deps, "profile changed while waiting for a verify-window slot")
			return
		}
		if (rejectIfExpired(discovery, deps)) return

		// User approved — create a DappSession with empty accounts.
		// Accounts will be shared later via the getAccounts authorization
		// popup. Sessions are per-`(origin, chainId, profileId)`; the
		// `chainId` is required and scopes the entire session. No
		// `chains` field on `DappPermissions` — it would duplicate the
		// parent session's `chainId`.
		const newSession = await dappSessionService.addDappSession(
			params.dappMetadata,
			[{ methods: [] }],
			[], // empty accounts — populated via requestCapabilities() (or the dApp falls back when getAccounts() throws CAPABILITY_NOT_GRANTED)
			AccessLevel.Transactions,
			chainId,
			profileId,
		)

		// Initialize with empty capability grants so enforceCapability()
		// blocks non-exempt methods until requestCapabilities() is called.
		try {
			await dappSessionService.setCapabilityGrants(newSession.id, [])
		} catch (error) {
			await rollBackDiscoverySession(deleteSession, newSession.id, "ungranted", logger)
			throw error
		}

		// Re-check freshness AFTER the durable writes (which can
		// themselves cross the deadline) and approve, or roll back + reject.
		approved = await approveOrRollbackDiscoverySession({
			discovery,
			sessionId: newSession.id,
			approverProfileId: newSession.profileId,
			attemptOpen: () => !reservation.abandoned,
			rowAwaited: () => (deps.dedupeWaiters.get(dedupeKeyOf(discovery.origin, chainId)) ?? 0) > 0,
			approveDiscovery: (id) => handler.approveDiscovery(id),
			rejectDiscovery: (id) => handler.rejectDiscovery(id),
			deleteSession,
			pendingVerification: deps.pendingVerification,
			logger,
		})
		if (approved) {
			logger.log(
				"wallet-sdk",
				LogLevel.Info,
				`Discovery approved: request ${describeExternalId(discovery.requestId)} chain=${chainId}`,
			)
		}
	} finally {
		if (!approved) reservation.releaseIfUnstarted()
	}
}
