// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { ServiceClient } from "@nulo/extension-messaging/background"
import { DummyLogger, type ILogger, LogLevel, trim } from "@/wallet/logger"
import { EventHandler } from "@nulo/wallet-core/utils"
import { type Events, LOGGER_SERVICE_NAME, type Methods } from "./spec"

export * from "./spec"

/** The `context` tags extension documents put on their log lines. */
export type DocumentLogContext = "popup" | "onboarding" | "offscreen"

/** The document's one port to the logger service. Not exported: a client that built its own
 *  would hold a port nothing closes (`ServiceClient.disconnect()` closes the client's port and
 *  then logs through the logger), one per client for the document's life. We intentionally
 *  don't declare `implements ServiceSpec<Methods>`: `log` here takes the context per call. */
class LoggerServiceClient extends ServiceClient<Methods, Events> {
	public readonly onLevel = new EventHandler<LogLevel>()

	/** The worker's minimum level as this port last heard it; unknown until the first answer and
	 *  again after the port drops, and while unknown every line is sent. */
	private minLevel: LogLevel | undefined

	public constructor() {
		super(LOGGER_SERVICE_NAME, new DummyLogger())
		this.onLevel.add(this.adoptLevel)
		this.onDisconnected.add(() => {
			this.minLevel = undefined
		})
	}

	/** Whether the worker is known to drop a line at `level`. Only Debug or Info is ever adopted as
	 *  the minimum, so a Warn or Error line is never dropped here, whatever the worker answers. */
	public drops(level: LogLevel): boolean {
		return this.minLevel !== undefined && level < this.minLevel
	}

	public log(context: DocumentLogContext | undefined, source: string, level: LogLevel, ...data: unknown[]) {
		// Redact HERE, before the RPC serializes.
		//
		// `request()` runs `jsonSanitize` over its params, which flattens an Error to a plain
		// `{name, message, stack}`, expands a typed array into a numeric object, and turns Map/Set
		// into arrays. By the time `LoggerStore.trim()` sees this data in the service worker, every
		// shape it knows how to collapse is already gone — so a stack, or raw key bytes, survive.
		// Popup, onboarding and offscreen all log through this client, which is three of the four
		// contexts: without this, most of the redaction below is bypassed.
		//
		// Deliberately NOT in `BaseServiceClient.request()`: that is the generic path for EVERY
		// client, and redacting there would rewrite live `RestoreSecret` params and break profile
		// restore. The SW re-trims on arrival, which is harmless — trim is stable over its own
		// output.
		const line = this.request("log", context, source, level, ...(trim(data) as unknown[]))
		line.then(this.adoptLevel, () => {})
		return line
	}

	private readonly adoptLevel = (level: unknown) => {
		this.minLevel = level === LogLevel.Debug || level === LogLevel.Info ? level : undefined
	}
}

let shared: LoggerServiceClient | undefined

/**
 * This document's logger, tagging its lines `context`. Every view shares one client whose port
 * the first line opens and Chrome closes with the document; callers never disconnect it.
 *
 * A failed line never becomes an unhandled rejection: the pages' rejection handlers log through
 * this same logger, so on a page whose port cannot open each failure would log the next one, for
 * the life of the page. The request promise itself is returned, so a caller that awaits a line
 * still sees it reject. A line below the worker's known minimum never leaves the document and
 * resolves at once.
 */
export function documentLogger(context?: DocumentLogContext): ILogger {
	return {
		log(source, level, ...data) {
			shared ??= new LoggerServiceClient()
			if (shared.drops(level)) return Promise.resolve(undefined)
			const line = shared.log(context, source, level, ...data)
			line.catch(() => {})
			return line
		},
	}
}

/** Forgets the shared client without disconnecting it, for tests that assert on logger traffic. */
export function _resetDocumentLoggerForTests(): void {
	shared = undefined
}
