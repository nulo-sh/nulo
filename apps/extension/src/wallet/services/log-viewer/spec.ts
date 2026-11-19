// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { z } from "zod"
import type { Log } from "@/wallet/logger"
import type { RequestRef } from "@/wallet/logger/request-log"

export const LOG_VIEWER_SERVICE_NAME = "log-viewer"

export type RequestReport = { fileName: string; text: string }

export type Methods = {
	getLogs(count: number, fromId?: number): Log[]
	clearLogs(): void
	/** The trace id of the request a journal row or an interaction belongs to; `undefined` without developer mode. */
	findRequestTrace(ref: RequestRef): string | undefined
	/** One request's downloadable report; `undefined` without developer mode or a capture. */
	getRequestReport(walletTraceId: string): RequestReport | undefined
}

const HEX16 = z.string().regex(/^[0-9a-f]{16}$/)

export const LogViewerMethodSchemas = {
	findRequestTrace: z.tuple([z.union([z.strictObject({ journalId: HEX16 }), z.strictObject({ interactionId: HEX16 })])]),
	getRequestReport: z.tuple([z.string().regex(/^[0-9a-f]{8}$/)]),
}

export type Events = {
	onLog: Log
}
