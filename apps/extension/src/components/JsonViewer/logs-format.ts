// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { EditorState } from "@codemirror/state"
import { capitalize } from "@/utils"
import { formatLogData, getLogLevelName } from "@/wallet/logger/format"

export { formatArg, formatLogData, getLogLevelName } from "@/wallet/logger/format"

export interface LogEntry {
	id?: number
	timestamp: number
	source: string
	level: number
	data: unknown
}

export function formatSingleLog(log: LogEntry): string {
	const date = new Date(log.timestamp)
	const time = `${date.toTimeString().slice(0, 8)}.${date.getMilliseconds().toString().padStart(3, "0")}`
	return `[${time}] [${log.source}] ${getLogLevelName(log.level)}: ${formatLogData(log.data)}`
}

/** The editor document: every line ends with a newline, so a live line appended at the document's
 *  end starts a line of its own, and an empty list is an empty document, not one blank line. */
export function logsDocument(logs: LogEntry[]): string {
	return logs.map((log) => `${formatSingleLog(log)}\n`).join("")
}

/** How many characters at the document's start belong to `dropped`. The document lists a
 *  subsequence of the logs in their order, so what it holds of a dropped head sits at its start.
 *  The greedy match never takes a retained entry's text: equal text means equal source and level,
 *  so a dropped entry the document lacks was filtered out, and so was every later twin of it. */
export function droppedPrefixLength(state: EditorState, dropped: LogEntry[]): number {
	let end = 0
	for (const log of dropped) {
		// The editor stores every line break as "\n": compare the entry as the editor holds it.
		const text = state.toText(`${formatSingleLog(log)}\n`).toString()
		if (state.doc.sliceString(end, end + text.length) === text) end += text.length
	}
	return end
}

/**
 * Pretty-print a filter key (`source`, `level`) for the popover menu.
 * Source values like "wallet-sdk" become "Wallet Sdk", except for the
 * three protocol acronyms (FPC/PXE/RPC) which stay all-caps.
 */
export function getDisplayName(kind: "source" | "level", value: string): string {
	if (kind === "source") {
		if (value === "undefined") return `(${value})`
		return value
			.split("-")
			.map((v) => {
				if (v === "fpc" || v === "pxe" || v === "rpc") return v.toUpperCase()
				return capitalize(v)
			})
			.join(" ")
	}
	return capitalize(value.toLowerCase())
}
