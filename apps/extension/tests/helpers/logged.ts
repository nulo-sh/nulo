import type { LoggerStore } from "@/wallet/logger"

/** The argument after `message` on each buffered line logged with that message. */
export const loggedAfter = (logger: LoggerStore, message: string): unknown[] =>
	logger
		.get(Number.MAX_SAFE_INTEGER)
		.filter((line) => line.data[0] === message)
		.map((line) => line.data[1])
