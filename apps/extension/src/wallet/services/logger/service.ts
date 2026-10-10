// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { DummyLogger, type LogLevel, type LoggerStore } from "@/wallet/logger"
import { EventHandler } from "@nulo/wallet-core/utils"
import { type Events, LOGGER_SERVICE_NAME, type Methods } from "./spec"

export * from "./spec"

/** LoggerService implements the RPC surface only (wider signature with `context`).
 *  Callers that want the pure `ILogger` port (narrow `(source, level, ...data) => void`)
 *  use `documentLogger(context)`, a view over the document's one logger client. */
export class LoggerService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()("log")
	public static name = LOGGER_SERVICE_NAME

	public readonly onLevel = new EventHandler<LogLevel>()

	private readonly _logger: LoggerStore

	public constructor(logger: LoggerStore) {
		super(LOGGER_SERVICE_NAME, new DummyLogger())
		this._logger = logger
		this._logger.onLevel.add(this.onStoreLevel)
	}

	/** Reads the level with no await before it, so the answer leaves in the same task and a level
	 *  change that lands later always reaches the port after it, as an `onLevel` event. */
	public async log(context: string | undefined, source: string, level: LogLevel, ...data: unknown[]) {
		this._logger.logWithContext(context, source, level, ...data)
		return this._logger.level
	}

	private readonly onStoreLevel = (level: LogLevel) => {
		this.emit("onLevel", level)
	}
}
