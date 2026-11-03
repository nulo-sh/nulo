/**
 * Pins the seam between the dApp-send executor and the fee strategies: the probe the executor hands
 * its validated build reaches the strategy's context, so an app-paid send's one validated simulation
 * is read for the authorizations it consumes. The executor and the strategies are each tested with
 * injected seams; only this test sees the production adapter between them.
 */

import { describe, expect, test, vi } from "vitest"
import type { DappSendExecutorDeps } from "./dapp-send-executor"
import type { FeeStrategyContext } from "./fee/fee-strategy"
import { ExecutionService } from "./service"

const FENCE = { profileId: "p1", epoch: 0, session: 1 }

describe("ExecutionService: the dApp-send executor's validated build", () => {
	test("hands the executor's probe and build hook to the strategy context", async () => {
		const contexts: FeeStrategyContext[] = []
		const strategy = {
			buildAndEstimate: vi.fn(async (ctx: FeeStrategyContext) => {
				contexts.push(ctx)
				return {}
			}),
		}
		const self = Object.assign(Object.create(ExecutionService.prototype), {
			feeStrategies: new Map([["embedded", strategy]]),
		}) as { wireDappSendAndViewExecutors: (shared: unknown) => void; dappSendExecutor: unknown }
		self.wireDappSendAndViewExecutors({})
		const { buildAndEstimateValidated } = (self.dappSendExecutor as { deps: DappSendExecutorDeps }).deps

		const probe = { extractEffects: vi.fn() }
		const onBuilt = vi.fn(async () => {})
		const op = { kind: "aztec_sendTx", actions: [], fee: { embeddedFeePayment: "fpc" } } as never
		await buildAndEstimateValidated(op, { paymentMethod: { kind: "embedded" } } as never, FENCE, undefined, undefined, onBuilt, probe)

		expect(contexts).toHaveLength(1)
		expect(contexts[0]?.probe).toBe(probe)
		expect(contexts[0]?.onBuilt).toBe(onBuilt)
	})
})
