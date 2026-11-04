/** The executor's and the strategies' tests inject the seam between them; only this one runs the
 *  production adapter, which must hand the executor's observer over as an observer, never a probe. */

import { describe, expect, test, vi } from "vitest"
import type { DappSendExecutorDeps } from "./dapp-send-executor"
import type { FeeStrategyContext } from "./fee/fee-strategy"
import { ExecutionService } from "./service"

const FENCE = { profileId: "p1", epoch: 0, session: 1 }

describe("ExecutionService: the dApp-send executor's validated build", () => {
	test.each(["embedded", "fj", "fpc"])(
		"hands the executor's observer and build hook to the %s strategy, never as a probe",
		async (kind) => {
			const contexts: FeeStrategyContext[] = []
			const strategy = {
				buildAndEstimate: vi.fn(async (ctx: FeeStrategyContext) => {
					contexts.push(ctx)
					return {}
				}),
			}
			const self = Object.assign(Object.create(ExecutionService.prototype), {
				feeStrategies: new Map([[kind, strategy]]),
			}) as { wireDappSendAndViewExecutors: (shared: unknown) => void; dappSendExecutor: unknown }
			self.wireDappSendAndViewExecutors({})
			const { buildAndEstimateValidated } = (self.dappSendExecutor as { deps: DappSendExecutorDeps }).deps

			const observer = { extractEffects: vi.fn() }
			const onBuilt = vi.fn(async () => {})
			const op = { kind: "aztec_sendTx", actions: [], fee: { embeddedFeePayment: "fpc" } } as never
			await buildAndEstimateValidated(op, { paymentMethod: { kind } } as never, FENCE, undefined, undefined, onBuilt, observer)

			expect(contexts).toHaveLength(1)
			expect(contexts[0]?.observer).toBe(observer)
			expect(contexts[0]?.probe).toBeUndefined()
			expect(contexts[0]?.onBuilt).toBe(onBuilt)
		},
	)
})
