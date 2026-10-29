// @vitest-environment node
/**
 * A scope refusal met by an estimate or preview of a stored request belongs to the request: the
 * interaction service keeps it, and every later estimate or preview of that request answers it
 * before running. The execution side is prototype-called with a minimal `this`; the stored request
 * lives in a real interaction service.
 */
import { describe, expect, test, vi } from "vitest"
import { AuthRegistryRefusalError, JobCancelledError, ScopeViolationError } from "@nulo/extension-messaging/errors"
import type { FeeSettings } from "@nulo/wallet-bridge"
import type { WindowManager } from "@/wallet/services/window-manager/window-manager"
import { DappInteractionService } from "@/wallet/services/dapp-interaction/service"
import { ExecutionService } from "./service"

const FEE = { paymentMethod: { kind: "sponsored" } } as unknown as FeeSettings
const REGISTRY = "Scope violation: a transaction's authorization request targets the authorization registry" as const

function makeSelf() {
	const interactions = new DappInteractionService({ log: () => {} }, {} as WindowManager)
	;(interactions as unknown as { storage: Map<string, unknown> }).storage.set("req-1", {
		id: "req-1",
		payload: { params: { operations: [] }, session: { id: "s1", profileId: "pA" } },
		handleId: "h-1",
		cancellationToken: "req-1",
	})
	const materializeStoredOperation = vi.fn(async () => ({}))
	Object.assign(interactions, { materializeStoredOperation })
	const dappSendExecutor = {
		estimateOperationFee: vi.fn(async (): Promise<unknown> => ({ estimateId: "e-1" })),
		previewOperationAuthwits: vi.fn(async (): Promise<unknown> => ({ previewId: "p-1" })),
	}
	const self = Object.assign(Object.create(ExecutionService.prototype), {
		ensureInitialized: async () => {},
		services: { get: () => interactions },
		profileService: { getActiveProfile: async () => ({ id: "p1" }) },
		lane: { takeEstimateSlot: () => Promise.resolve(() => {}) },
		networkService: { getNetwork: async () => ({ chainId: 7 }) },
		dappSendExecutor,
	}) as ExecutionService
	return { self, interactions, dappSendExecutor, materializeStoredOperation }
}

describe("a refusal an estimate or preview meets is the request's", () => {
	test.each([
		["estimate", "registry", new AuthRegistryRefusalError(REGISTRY)],
		["preview", "call binding", new ScopeViolationError("Scope violation: call name does not match selector's function")],
	] as const)(
		"the %s that meets a %s refusal records it, and every later attempt answers it without running",
		async (first, _, refusal) => {
			const { self, interactions, dappSendExecutor, materializeStoredOperation } = makeSelf()
			const attempt = first === "estimate" ? dappSendExecutor.estimateOperationFee : dappSendExecutor.previewOperationAuthwits
			attempt.mockRejectedValueOnce(refusal)

			const run = first === "estimate" ? self.estimateOperationFee("req-1", 0, FEE) : self.previewOperationAuthwits("req-1", 0)
			await expect(run).rejects.toBe(refusal)
			expect(interactions.refusalOf("req-1")).toBe(refusal)

			await expect(self.estimateOperationFee("req-1", 0, FEE)).rejects.toBe(refusal)
			await expect(self.previewOperationAuthwits("req-1", 0)).rejects.toBe(refusal)
			expect(materializeStoredOperation).toHaveBeenCalledTimes(1)
			expect(
				dappSendExecutor.estimateOperationFee.mock.calls.length + dappSendExecutor.previewOperationAuthwits.mock.calls.length,
			).toBe(1)
		},
	)

	test("an attempt that started before another recorded its refusal answers the recorded one", async () => {
		const { self, interactions, dappSendExecutor } = makeSelf()
		const [first, second] = [
			new AuthRegistryRefusalError(REGISTRY),
			new ScopeViolationError("Scope violation: authwit call name does not match selector's function"),
		]
		dappSendExecutor.estimateOperationFee.mockImplementationOnce(async () => {
			interactions.recordRefusal("req-1", first)
			throw second
		})
		await expect(self.estimateOperationFee("req-1", 0, FEE)).rejects.toBe(first)
		expect(interactions.refusalOf("req-1")).toBe(first)
	})

	test("a failure that is not a scope refusal records nothing, and the next estimate runs", async () => {
		const { self, interactions, dappSendExecutor } = makeSelf()
		dappSendExecutor.estimateOperationFee.mockRejectedValueOnce(new Error("node unreachable"))
		dappSendExecutor.previewOperationAuthwits.mockRejectedValueOnce(new JobCancelledError(undefined, { jobId: "t-1" }))

		await expect(self.estimateOperationFee("req-1", 0, FEE)).rejects.toThrow("node unreachable")
		await expect(self.previewOperationAuthwits("req-1", 0)).rejects.toBeInstanceOf(JobCancelledError)
		expect(interactions.refusalOf("req-1")).toBeUndefined()
		await expect(self.estimateOperationFee("req-1", 0, FEE)).resolves.toEqual({ estimateId: "e-1" })
	})
})
