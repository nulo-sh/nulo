/**
 * End every live channel of one app on one network under one profile. Each match loses its profile
 * stamp before it is terminated, so a termination that throws leaves a listed channel the dispatch
 * guard refuses; each match runs alone, so one failure never shields the rest.
 */
import type { ILogger } from "@/wallet/logger"
import { LogLevel } from "@nulo/wallet-core/logger"
import { describeExternalId } from "@nulo/wallet-bridge"
import type { DappSessionService } from "@/wallet/services/dapp-session/service"
import { cancelPendingVerification, isPendingVerificationDead, type PendingVerificationEntry } from "./pending-verification"
import { chainInfoToChainId } from "./session-established"

type LiveSession = { sessionId: string; origin: string; tabId: number } & Parameters<typeof chainInfoToChainId>[0]

export interface LiveSessionRevocationDeps {
	getActiveSessions: () => LiveSession[]
	sessionProfiles: Map<string, string>
	/** The approval markers that discovery writes: the only proof of who approved a channel that
	 *  establishment has not stamped yet. */
	pendingVerification: Map<string, PendingVerificationEntry>
	terminateSession: (sessionId: string) => void
	logger: ILogger
}

export function revokeLiveSessions(deps: LiveSessionRevocationDeps, app: { origin: string; chainId: string; profileId: string }): void {
	const { origin, chainId, profileId } = app
	for (const session of deps.getActiveSessions()) {
		if (session.origin !== origin || !isOnChain(session, chainId)) continue
		const stamp = deps.sessionProfiles.get(session.sessionId)
		const ownMarker = markerOfOwnTab(deps.pendingVerification, session)
		if (servedByAnotherProfile(stamp, ownMarker, profileId)) continue
		deps.sessionProfiles.delete(session.sessionId)
		// Dead before the termination, so an establishment past its row read cannot stamp this channel
		// if the termination throws. A stamped channel's establishment is past its stamp, and a marker
		// beside it may be a newer attempt that reused the id.
		if (stamp === undefined && ownMarker) cancelPendingVerification(deps.pendingVerification, session.sessionId)
		try {
			deps.logger.log(
				"wallet-sdk-bg",
				LogLevel.Info,
				`Terminating live session ${describeExternalId(session.sessionId)} on chain ${chainId}: dApp access revoked`,
			)
			deps.terminateSession(session.sessionId)
		} catch (err) {
			deps.logger.log("wallet-sdk-bg", LogLevel.Warn, `Failed to terminate session ${describeExternalId(session.sessionId)}`, err)
		}
	}
}

/** The page chooses the id a marker is keyed by, so only a marker written for this channel's own
 *  tab can speak for it. */
function markerOfOwnTab(markers: Map<string, PendingVerificationEntry>, session: LiveSession): PendingVerificationEntry | undefined {
	const marker = markers.get(session.sessionId)
	return marker?.tabId === session.tabId ? marker : undefined
}

/** A stamped channel belongs to its stamp; an unstamped one to the profile a live marker names.
 *  Any other unstamped channel is a reconnect or debris, and ending it fails closed. */
function servedByAnotherProfile(stamp: string | undefined, marker: PendingVerificationEntry | undefined, profileId: string): boolean {
	if (stamp !== undefined) return stamp !== profileId
	return marker !== undefined && !isPendingVerificationDead(marker) && marker.profileId !== profileId
}

/** Establishment decodes the dApp-supplied chain info before it stamps, so a session whose info
 *  does not decode holds no stamp and matches no app. */
function isOnChain(session: LiveSession, chainId: string): boolean {
	try {
		return String(chainInfoToChainId(session)) === chainId
	} catch {
		return false
	}
}

/** A deleted row (a Settings disconnect, an expiry, a profile purge, the emoji check's refusal) and
 *  a refusal itself end the live channels of that app on that network under the row's profile.
 *  Tuple-matched, since one row serves every tab's channel to the app. */
export function wireSessionTeardown(
	handler: { getActiveSessions: () => LiveSession[]; terminateSession: (sessionId: string) => void },
	dappSessionService: Pick<DappSessionService, "onDappSessionDeleted" | "onVerificationRefused">,
	state: { sessionProfiles: Map<string, string>; pendingVerification: Map<string, PendingVerificationEntry> },
	logger: ILogger,
): void {
	const revoke = (app: { origin: string; chainId: string; profileId: string }) =>
		revokeLiveSessions(
			{
				getActiveSessions: () => handler.getActiveSessions(),
				sessionProfiles: state.sessionProfiles,
				pendingVerification: state.pendingVerification,
				terminateSession: (sessionId) => handler.terminateSession(sessionId),
				logger,
			},
			app,
		)
	dappSessionService.onDappSessionDeleted.add((deleted) => {
		const origin = deleted.dappMetadata?.url
		const { chainId, profileId } = deleted
		if (!origin || !chainId || !profileId) {
			logger.log(
				"wallet-sdk-bg",
				LogLevel.Warn,
				`DappSession deleted with missing origin/chainId/profileId — cannot match active sessions; skipping teardown`,
			)
			return
		}
		revoke({ origin, chainId, profileId })
	})
	dappSessionService.onVerificationRefused.add(revoke)
}
