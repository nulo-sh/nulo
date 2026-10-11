// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { EditorState } from "@codemirror/state"
import { LogLevel } from "@/wallet/logger"
import { capitalize } from "@/utils"

export interface LogEntry {
	id?: number
	timestamp: number
	source: string
	level: number
	data: unknown
}

export function getLogLevelName(level: number): string {
	switch (level) {
		case LogLevel.Debug:
			return "DEBUG"
		case LogLevel.Info:
			return "INFO"
		case LogLevel.Warn:
			return "WARN"
		case LogLevel.Error:
			return "ERROR"
		default:
			return String(level)
	}
}

/** One `seen` set spans the array recursion and the object branch, so a reference back into an
 *  enclosing array cannot recurse forever and a revisited object renders as `[circular]`. Never
 *  `String(obj)`: that is where "[object Object]" came from. */
export function formatArg(arg: unknown, seen = new WeakSet<object>()): unknown {
	if (Array.isArray(arg)) {
		if (!arg.length) return ""
		if (seen.has(arg)) return "[circular]"
		seen.add(arg)
		return arg.map((item) => formatArg(item, seen))
	}

	if (typeof arg === "object" && arg !== null) {
		if (seen.has(arg)) return "[circular]"
		try {
			return JSON.stringify(arg, (_key, value: unknown) => {
				if (typeof value === "bigint") return value.toString()
				if (typeof value === "object" && value !== null) {
					if (seen.has(value)) return "[circular]"
					seen.add(value)
				}
				return value
			})
		} catch {
			return `[unserializable ${(arg as object).constructor?.name ?? "object"}]`
		}
	}

	return arg
}

export function formatLogData(data: unknown): string {
	if (!data) return ""
	if (Array.isArray(data) && data.length) {
		return data
			.map((x) => formatArg(x))
			.filter((x) => x !== undefined)
			.join(" ")
	}
	return String(formatArg(data) ?? "")
}

export function formatSingleLog(log: LogEntry): string {
	const date = new Date(log.timestamp)
	const time = `${date.toTimeString().slice(0, 8)}.${date.getMilliseconds().toString().padStart(3, "0")}`
	return `[${time}] [${log.source}] ${getLogLevelName(log.level)}: ${formatLogData(log.data)}`
}

export function formatLogs(logs: LogEntry[]): string {
	return logs.map(formatSingleLog).join("\n")
}

/** The editor document: every line ends with a newline, so a live line appended at the document's
 *  end starts a line of its own, and an empty list is an empty document, not one blank line. */
export function logsDocument(logs: LogEntry[]): string {
	return logs.map((log) => `${formatSingleLog(log)}\n`).join("")
}

/** How many characters at the document's start belong to `dropped`. The document lists a
 *  subsequence of the logs in their order, so what it holds of a dropped head sits at its start. */
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
