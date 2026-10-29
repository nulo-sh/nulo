// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { MethodsSpec, ServiceSpec } from "@/wallet/base"
import { ServiceClient, definePassthroughsExhaustive } from "@nulo/extension-messaging/background"
import { documentLogger } from "@/wallet/services/logger/client"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ESTIMATE_JOB_TTL_MS, type EstimateStarted, type Events, EXECUTION_SERVICE_NAME, type Methods } from "./spec"

export * from "./spec"

/** A transport deadline for a send whose outcome the popup cannot know sooner: proving in the
 *  browser can take minutes. Past it the journal still holds the answer. */
export const EXECUTE_SEND_TIMEOUT_MS = 60 * 60_000

const ESTIMATE_METHODS: ReadonlySet<keyof Methods> = new Set(["estimateTransferFee", "estimateOperationFee", "previewOperationAuthwits"])

// Declaration-merge the passthrough signatures onto the class type. Bodies are
// installed at runtime by `definePassthroughs`; this is what satisfies
// `implements ServiceSpec` and gives consumers full inference.
export interface ExecutionServiceClient extends MethodsSpec<Methods> {}
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: the merged interface's methods ARE installed — at runtime by definePassthroughsExhaustive below, whose signature proves the name list covers every Methods key, so no advertised method is missing.
export class ExecutionServiceClient extends ServiceClient<Methods, Events> implements ServiceSpec<Methods, Events> {
	public readonly onEstimateStarted = new EventHandler<EstimateStarted>()

	public constructor(name?: string) {
		super(EXECUTION_SERVICE_NAME, documentLogger(), name)
	}

	protected override getRequestTimeoutMs(method: keyof Methods): number {
		if (method === "executeTransfer") return EXECUTE_SEND_TIMEOUT_MS
		// The worker answers an estimate when its run ends, and each of the run's requests ends at the
		// worker's own bound; this deadline only backs up a worker that stays connected and never answers.
		if (ESTIMATE_METHODS.has(method)) return ESTIMATE_JOB_TTL_MS
		return super.getRequestTimeoutMs(method)
	}
}
// Every client method is a pure request-passthrough; the installer's
// signature checks the name list in both directions against `Methods`.
definePassthroughsExhaustive<Methods>()(ExecutionServiceClient.prototype, [
	"executeTransfer",
	"executeOperations",
	"getGasBalances",
	"peekGasBalances",
	"estimateTransferFee",
	"estimateOperationFee",
	"previewOperationAuthwits",
	"decodeCallsForDisplay",
	"decodeGrantsForDisplay",
	"decodeQuestionGrantsForDisplay",
	"cancelJob",
	"acceptQueuedFee",
	"cancelEstimate",
	"getLastProveOutcome",
])
