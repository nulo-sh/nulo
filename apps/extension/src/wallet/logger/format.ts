// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/** How a log line's data renders as text: the log viewer, its CSV export and the request report. */
import { LogLevel } from "@nulo/wallet-core/logger"

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
