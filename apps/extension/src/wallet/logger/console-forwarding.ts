import { isClientDisconnectRejection } from "@nulo/extension-messaging/errors"
import { consoleMethods, LogLevel } from "@/wallet/logger"
import { type DocumentLogContext, documentLogger } from "@/wallet/services/logger/client"

/**
 * Routes a page's console output and unhandled rejections into the log pipe under `client`'s tag. A
 * service-worker restart rejects every in-flight request with the disconnect error while the clients
 * reconnect, so those land at debug rather than one error line per request.
 */
export function installConsoleForwarding(client: Extract<DocumentLogContext, "popup" | "onboarding">): void {
	const logger = documentLogger(client)
	const hooks = self as unknown as Record<string, (...args: unknown[]) => void>
	for (const [method, level] of consoleMethods) {
		hooks[`nuloOn${method}`] = (...args: unknown[]) => logger.log("ui", level, ...args)
	}
	self.onunhandledrejection = (e: PromiseRejectionEvent) => {
		const disconnect = isClientDisconnectRejection(e.reason)
		// Only preventDefault() keeps DevTools from printing the rejection; the level sets the ring's.
		if (disconnect) e.preventDefault()
		logger.log("ui", disconnect ? LogLevel.Debug : LogLevel.Error, "unhandled rejection", { error: e.reason })
	}
}

/**
 * A page's `app.config.errorHandler`. Vue hands it each error it ties to a component instead of
 * printing it, so a disconnect that ends a torn-down page's call lands at debug, as above.
 */
export function forwardVueError(error: unknown, _instance: unknown, info: string): void {
	if (isClientDisconnectRejection(error)) console.debug("vue error", { error, info })
	else console.error("vue error", { error, info })
}
