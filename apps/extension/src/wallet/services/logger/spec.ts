// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { LogLevel } from "@/wallet/logger"

export const LOGGER_SERVICE_NAME = "logger"

export type Methods = {
	/**
	 * Proxies the data to the app logger
	 * @param context Execution context ("offscreen" | "popup" | etc.)
	 * @param source Log source (service name)
	 * @param level Log level
	 * @param data Data
	 * @returns The worker's minimum level when it took the line, so a document can stop sending
	 * lines the worker would drop.
	 */
	log(context: string | undefined, source: string, level: LogLevel, ...data: unknown[]): LogLevel
}

export type Events = {
	/** The worker's new minimum level, sent to every logger port after `debugMode` moves it. */
	onLevel: LogLevel
}
