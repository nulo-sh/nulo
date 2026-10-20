/**
 * The wallet-sdk's part of the turn in which the wallet restarts itself after a lock it could not
 * save. Every live session ends, so each app hears `disconnect` while this background can still
 * reach its page (on Chrome the next background reaches no content script already in a page). Then
 * every connect, capabilities and check window is removed: the restart ends their requests, and
 * Chrome would leave each one as a New Tab window. Sessions end first, so no window's removal
 * answers an app before its disconnect. Everything is fired, nothing awaited: the restart follows
 * in the same turn.
 */
import { describeExternalId } from "@nulo/wallet-bridge"
import { LogLevel, type ILogger } from "@/wallet/logger"
import type { ProfileService } from "@/wallet/services/profile/service"
import type { TrackedWindowPort } from "@/wallet/services/window-manager/restart-ended-windows"

export function wireRestartPreparation(deps: {
	profileService: Pick<ProfileService, "setRestartPreparation">
	handler: { getActiveSessions(): Array<{ sessionId: string }> }
	endSession: (sessionId: string) => void
	windows: Pick<TrackedWindowPort, "closeRestartEnded">
	logger: ILogger
}): void {
	deps.profileService.setRestartPreparation(() => {
		for (const { sessionId } of deps.handler.getActiveSessions()) {
			try {
				deps.endSession(sessionId)
			} catch (error) {
				deps.logger.log("wallet-sdk", LogLevel.Warn, `Restart: failed to end session ${describeExternalId(sessionId)}`, { error })
			}
		}
		deps.windows.closeRestartEnded()
	})
}
