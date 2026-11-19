// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { validateParams } from "@nulo/extension-messaging/zod"
import { DummyLogger, type ILoggerStore, type Log } from "@/wallet/logger"
import type { RequestLog, RequestRef } from "@/wallet/logger/request-log"
import { browserOf, buildRequestReport, requestReportFileName } from "@/wallet/logger/request-report"
import { NetworkService } from "@/wallet/services/network/service"
import { EventHandler } from "@nulo/wallet-core/utils"
import { type Events, LOG_VIEWER_SERVICE_NAME, LogViewerMethodSchemas, type Methods, type RequestReport } from "./spec"

declare const __VERSION__: string

export * from "./spec"

export class LogViewerService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()("getLogs", "clearLogs", "findRequestTrace", "getRequestReport")
	public static name = LOG_VIEWER_SERVICE_NAME

	public readonly onLog = new EventHandler<Log>()

	private readonly loggerStore: ILoggerStore
	private networkService?: NetworkService

	public constructor(
		logger: ILoggerStore,
		/** Each dApp request's capture; absent, no request has a report. */
		private readonly requests?: RequestLog,
	) {
		super(LOG_VIEWER_SERVICE_NAME, new DummyLogger())
		this.loggerStore = logger
		this.loggerStore.onLog.add(this.onLogAdded)
	}

	protected async init(services: ServiceCollection) {
		this.networkService = services.get(NetworkService.name)
	}

	public async getLogs(count: number, fromId?: number): Promise<Log[]> {
		return this.loggerStore.get(count, fromId)
	}

	public async clearLogs() {
		// Awaited: the RPC must not resolve until the persisted copy is gone, or a worker restart
		// in the gap brings back logs the user was told were cleared.
		await this.loggerStore.clear()
	}

	public async findRequestTrace(ref: RequestRef): Promise<string | undefined> {
		const [valid] = validateParams(LogViewerMethodSchemas.findRequestTrace, [ref], "findRequestTrace")
		return this.requests?.enabled ? this.requests.find(valid) : undefined
	}

	public async getRequestReport(walletTraceId: string): Promise<RequestReport | undefined> {
		const [id] = validateParams(LogViewerMethodSchemas.getRequestReport, [walletTraceId], "getRequestReport")
		const chainId = this.requests?.enabled ? this.requests.get(id)?.chainId : undefined
		if (chainId === undefined) return undefined
		const networkName = await this.networkNameOf(chainId)
		// Read again after the await: developer mode off or Clear logs in the gap leaves nothing to report.
		const capture = this.requests?.enabled ? this.requests.get(id) : undefined
		if (!capture) return undefined
		const text = buildRequestReport(capture, {
			walletVersion: __VERSION__,
			browser: browserOf(globalThis.navigator?.userAgent ?? ""),
			networkName,
		})
		return { fileName: requestReportFileName(id), text }
	}

	/** Read when the report is built, so a renamed network shows its current name. */
	private async networkNameOf(chainId: number): Promise<string | undefined> {
		try {
			return (await this.networkService?.getNetworks(chainId))?.[0]?.name
		} catch {
			return undefined
		}
	}

	private readonly onLogAdded = (log: Log) => {
		this.emit("onLog", log)
	}
}
