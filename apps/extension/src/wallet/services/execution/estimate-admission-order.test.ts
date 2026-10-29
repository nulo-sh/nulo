/**
 * A dApp window's estimate and preview are admitted before the stored request is read, so the cancel
 * an approval sends either finds the estimate or follows the approval that deleted the request.
 * Driven on the real registry.
 */
import { describe, expect, test, vi } from "vitest"
import { EstimateCancelRegistry } from "./estimate-cancel-registry"
import { ExecutionService } from "./service"

const ENTRIES = ["estimateOperationFee", "previewOperationAuthwits"] as const

function harness(entry: (typeof ENTRIES)[number]) {
	const registry = new EstimateCancelRegistry({ evictStash: () => {}, logDebug: () => {} })
	let stored = true
	let finishRead: () => void = () => {}
	const read = new Promise<void>((resolve) => {
		finishRead = resolve
	})
	const signals: AbortSignal[] = []
	const executor = vi.fn(async (...args: unknown[]) => {
		signals.push(args.find((arg): arg is AbortSignal => arg instanceof AbortSignal)!)
		return { maxFee: "1" }
	})
	const service = Object.assign(Object.create(ExecutionService.prototype), {
		ensureInitialized: async () => {},
		services: {
			get: () => ({
				materializeStoredOperation: async () => {
					await read
					if (!stored) throw new Error("Invalid id")
					return {}
				},
				refusalOf: () => undefined,
				recordRefusal: () => {},
			}),
		},
		profileService: { getActiveProfile: async () => ({ id: "p1" }) },
		lane: { tryTakeSlot: () => Promise.resolve(() => {}) },
		networkService: { getNetwork: async () => ({ chainId: 7 }) },
		pxeService: { offscreenSettled: () => undefined },
		emit: () => {},
		estimateCancel: registry,
		dappSendExecutor: { estimateOperationFee: executor, previewOperationAuthwits: executor },
		logDebug: () => {},
	}) as ExecutionService
	/** The estimate's outcome: "ok" or the error it rejected with. */
	const estimate = (token: string): Promise<unknown> =>
		(entry === "estimateOperationFee"
			? service.estimateOperationFee("i-1", 0, {} as never, token, "op")
			: service.previewOperationAuthwits("i-1", 0, token, "op")
		).then(
			() => "ok",
			(error: unknown) => error,
		)
	return { service, registry, executor, signals, estimate, finishRead, deleteRequest: () => (stored = false) }
}

/** Lets every microtask of a started call run, as a message sent earlier would have. */
const settleQueue = () => new Promise((resolve) => setTimeout(resolve, 0))

describe.each(ENTRIES)("%s", (entry) => {
	test("a cancel handled while the stored request is still being read reaches the work as an aborted signal", async () => {
		const h = harness(entry)
		const outcome = h.estimate("t1")
		await settleQueue()
		await h.service.cancelEstimate("t1")
		h.finishRead()
		await outcome
		expect(h.executor).toHaveBeenCalledTimes(1)
		expect(h.signals[0]?.aborted).toBe(true)
	})

	test("control: with no cancel, the work runs on a live signal", async () => {
		const h = harness(entry)
		const outcome = h.estimate("t1")
		await settleQueue()
		h.finishRead()
		expect(await outcome).toBe("ok")
		expect(h.signals[0]?.aborted).toBe(false)
	})

	test("a cancel handled before admission, after the approval deleted the request: the read refuses and nothing stays admitted", async () => {
		const h = harness(entry)
		h.deleteRequest()
		await h.service.cancelEstimate("t1")
		h.finishRead()
		const outcome = await h.estimate("t1")
		expect(outcome).toBeInstanceOf(Error)
		expect((outcome as Error).message).toBe("Invalid id")
		expect(h.executor).not.toHaveBeenCalled()
		expect(h.registry.unsettledCount("p1")).toBe(0)
	})
})
