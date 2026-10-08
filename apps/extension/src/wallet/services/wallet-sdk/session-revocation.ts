/**
 * End every live channel of one app on one network. Each match loses its profile stamp before it
 * is terminated, so a termination that throws leaves a listed channel the dispatch guard refuses;
 * each match runs alone, so one failure never shields the rest.
 */
import type { ILogger } from "@/wallet/logger"
import { LogLevel } from "@nulo/wallet-core/logger"
import { describeExternalId } from "@nulo/wallet-bridge"
import { chainInfoToChainId } from "./session-established"

type LiveSession = { sessionId: string; origin: string } & Parameters<typeof chainInfoToChainId>[0]

export interface LiveSessionRevocationDeps {
	getActiveSessions: () => LiveSession[]
	sessionProfiles: Map<string, string>
	terminateSession: (sessionId: string) => void
	logger: ILogger
}

export function revokeLiveSessions(deps: LiveSessionRevocationDeps, origin: string, chainId: string): void {
	for (const session of deps.getActiveSessions()) {
		if (session.origin !== origin || !isOnChain(session, chainId)) continue
		deps.sessionProfiles.delete(session.sessionId)
		deps.logger.log(
			"wallet-sdk-bg",
			LogLevel.Info,
			`Terminating live session ${describeExternalId(session.sessionId)} on chain ${chainId}: dApp access revoked`,
		)
		try {
			deps.terminateSession(session.sessionId)
		} catch (err) {
			deps.logger.log("wallet-sdk-bg", LogLevel.Warn, `Failed to terminate session ${describeExternalId(session.sessionId)}`, err)
		}
	}
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
