// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { Log } from "@/wallet/logger"

export const LOG_VIEWER_SERVICE_NAME = "log-viewer"

export type Methods = {
	getLogs(count: number, fromId?: number): Log[]
	clearLogs(): void
}

export type Events = {
	onLog: Log
}
