/**
 * A fee estimate whose simulation timed out keeps its admission place until that simulation ends
 * offscreen, so the PXE's queue never holds more estimate work than admission allows. Driven through
 * `estimateOperationFee` on the real registry and the real PXE client over a fake `chrome.runtime`.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { PxeServiceClientBase } from "@nulo/aztec-runtime/pxe"
import type { NetworkInfo } from "@nulo/aztec-runtime/pxe"
import { JobCancelledError, RpcTimeoutError } from "@nulo/extension-messaging/errors"
import { MessageType } from "@nulo/extension-messaging/messages"
import { ESTIMATE_JOB_TTL_MS, EstimateCancelRegistry } from "./estimate-cancel-registry"
import { ExecutionService } from "./service"

const net: NetworkInfo = { profileId: "p1", chainId: 31337, rpcUrl: "http://n/1" }
const SIM_TIMEOUT_MS = 90_000
const FIRST_FOUR = ["t1", "t2", "t3", "t4"]

type Sent = { content: { requestId: number; method: string }; from: string }

let sent: Sent[]
let listeners: Array<(message: unknown, sender: chrome.runtime.MessageSender) => boolean>

beforeEach(() => {
	vi.useFakeTimers()
	sent = []
	listeners = []
	vi.stubGlobal("chrome", {
		runtime: {
			id: "ext",
			getURL: (p: string) => `chrome-extension://ext/${p}`,
			onMessage: { addListener: (l: (typeof listeners)[number]) => listeners.push(l), removeListener: () => {} },
			sendMessage: (message: Sent) =>
				new Promise<void>(() => {
					sent.push(message)
				}),
		},
	})
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

function harness() {
	const pxe = new PxeServiceClientBase({ log: () => {} })
	pxe.setDocumentEpochProvider(() => 0, ESTIMATE_JOB_TTL_MS)
	const registry = new EstimateCancelRegistry({ evictStash: () => {}, logDebug: () => {} })
	const service = Object.assign(Object.create(ExecutionService.prototype), {
		ensureInitialized: async () => {},
		services: { get: () => ({ materializeStoredOperation: async () => ({}) }) },
		profileService: { getActiveProfile: async () => ({ id: "p1" }) },
		pxeService: pxe,
		estimateCancel: registry,
		dappSendExecutor: {
			estimateOperationFee: async () => {
				await pxe.simulateTx(net, {} as never, {} as never)
				return { maxFee: "1" }
			},
		},
		logDebug: () => {},
	}) as ExecutionService
	/** The estimate's outcome: "ok" or the error it rejected with. */
	const estimate = (token: string): Promise<unknown> =>
		service.estimateOperationFee("i-1", 0, {} as never, token, `op-${token}`).then(
			() => "ok",
			(error: unknown) => error,
		)
	return { pxe, registry, estimate }
}

/** Four estimates whose simulations time out, and a fifth parked behind them. */
async function fourTimedOutAndOneParked(h: ReturnType<typeof harness>) {
	const first = FIRST_FOUR.map(h.estimate)
	await vi.advanceTimersByTimeAsync(0)
	const fifth = h.estimate("t5")
	await vi.advanceTimersByTimeAsync(SIM_TIMEOUT_MS)
	return { outcomes: await Promise.all(first), fifth }
}

function answerLate(requestId: number) {
	const request = sent.find((s) => s.content.requestId === requestId) as Sent
	for (const l of [...listeners]) {
		l({ type: MessageType.Response, from: "pxe", to: request.from, content: { requestId, result: "late" } }, { id: "ext" })
	}
}

describe("an estimate whose simulation timed out", () => {
	test("fails as before but keeps its place until the late answer; then the parked estimate runs", async () => {
		const h = harness()
		const { outcomes } = await fourTimedOutAndOneParked(h)
		for (const outcome of outcomes) expect(outcome).toBeInstanceOf(RpcTimeoutError)
		expect(h.registry.unsettledCount("p1")).toBe(4)
		expect(sent).toHaveLength(4)

		answerLate(1)
		await vi.advanceTimersByTimeAsync(0)
		expect(sent.map((s) => s.content.method)).toEqual(Array(5).fill("simulateTx"))
		expect(h.registry.unsettledCount("p1")).toBe(4)
	})

	test("retiring the document that ran them ends every hold at once", async () => {
		const h = harness()
		await fourTimedOutAndOneParked(h)
		h.pxe.retireEpochsThrough(0)
		await vi.advanceTimersByTimeAsync(0)
		expect(sent).toHaveLength(5)
		expect(h.registry.unsettledCount("p1")).toBe(1)
	})

	test("an unanswered hold lasts past the TTL, and the estimate parked all along is then cancelled", async () => {
		const h = harness()
		const { fifth } = await fourTimedOutAndOneParked(h)
		await vi.advanceTimersByTimeAsync(ESTIMATE_JOB_TTL_MS - 1)
		expect(h.registry.unsettledCount("p1")).toBe(4)
		expect(sent).toHaveLength(4)

		await vi.advanceTimersByTimeAsync(1)
		expect(await fifth).toBeInstanceOf(JobCancelledError)
		expect(h.registry.unsettledCount("p1")).toBe(0)
		expect(sent).toHaveLength(4)
	})

	test("the TTL reaps a hold nobody answers, admitting a new estimate; the record's later end frees nothing", async () => {
		const h = harness()
		for (const token of FIRST_FOUR) void h.estimate(token)
		await vi.advanceTimersByTimeAsync(SIM_TIMEOUT_MS)
		await vi.advanceTimersByTimeAsync(ESTIMATE_JOB_TTL_MS - SIM_TIMEOUT_MS + 1)
		void h.estimate("n1")
		await vi.advanceTimersByTimeAsync(0)
		expect(sent).toHaveLength(5)
		expect(h.registry.unsettledCount("p1")).toBe(1)

		await vi.advanceTimersByTimeAsync(SIM_TIMEOUT_MS - 1)
		expect(h.registry.unsettledCount("p1")).toBe(1)
	})
})
