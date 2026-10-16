import { type ILogger, scrubHex32, trim } from "@/wallet/logger"

/**
 * The PXE host frame's logger: no `0x` + 64-hex value it logs reaches the log, under any key.
 * `trim` runs first, so its projections, depth limit and redaction hold, and only its copy changes.
 */
export function frameLogger(inner: ILogger): ILogger {
	return {
		log: (source, level, ...data) => inner.log(source, level, ...(scrubHex32(trim(data)) as unknown[])),
	}
}
