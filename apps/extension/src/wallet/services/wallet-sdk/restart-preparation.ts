/**
 * Runs in the turn the wallet restarts itself after a lock it could not save, so it awaits
 * nothing. Sessions end first, while this background can still reach each app's page (on
 * Chrome the next one reaches no content script already open), and before any window's removal
 * can answer an app. The windows go because Chrome would leave each as a New Tab window.
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
