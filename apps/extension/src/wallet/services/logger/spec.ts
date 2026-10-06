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
	 */
	log(context: string | undefined, source: string, level: LogLevel, ...data: unknown[]): void
}
