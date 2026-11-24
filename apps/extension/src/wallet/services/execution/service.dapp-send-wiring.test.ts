/** The facade wires the estimate's half with only the reads it names, nothing a send uses, and hands
 *  the executor the same objects, so a confirm builds, stashes and observes as its estimate did. */

import { describe, expect, test } from "vitest"
import type { DappSendEstimationDeps } from "./dapp-send-estimation"
import type { DappSendExecutorDeps } from "./dapp-send-executor"
import { ExecutionService } from "./service"

describe("ExecutionService: the dApp send's estimate and confirm halves", () => {
	test("the estimation takes exactly its own dependencies, and the executor shares its objects", () => {
		const fields = {
			planner: { name: "planner" },
			txBuilder: { name: "txBuilder" },
			operationEstimateReuse: { name: "reuse" },
			previewSnapshots: { name: "snapshots" },
			chainTipGate: { name: "chainTip" },
		}
		const self = Object.assign(Object.create(ExecutionService.prototype), fields) as {
			wireDappSendAndViewExecutors: (shared: unknown) => void
			dappSendEstimation: { deps: DappSendEstimationDeps }
			dappSendExecutor: { deps: DappSendExecutorDeps }
		}
		self.wireDappSendAndViewExecutors({})
		const estimation = self.dappSendEstimation.deps
		const executor = self.dappSendExecutor.deps

		expect(Object.keys(estimation).sort()).toEqual([
			"buildAndEstimateValidated",
			"captureExecutionFence",
			"chainTip",
			"estimateWithDiscovery",
			"getActiveProfile",
			"getNetwork",
			"getPendingForAccount",
			"logDebug",
			"operationEstimateReuse",
			"peekPublicFeeJuice",
			"planner",
			"previewSnapshots",
			"readPublicStorageOnce",
			"rereadPublicFeeJuice",
			"sequenceEpoch",
			"txBuilder",
		])
		expect(estimation.planner).toBe(fields.planner)
		expect(estimation.txBuilder).toBe(fields.txBuilder)
		expect(estimation.operationEstimateReuse).toBe(fields.operationEstimateReuse)
		expect(estimation.previewSnapshots).toBe(fields.previewSnapshots)
		expect(estimation.chainTip).toBe(fields.chainTipGate)
		expect(executor.estimation).toBe(self.dappSendEstimation)
		expect(executor.estimateWithDiscovery).toBe(estimation.estimateWithDiscovery)
		expect(executor.buildAndEstimateValidated).toBe(estimation.buildAndEstimateValidated)
	})
})
