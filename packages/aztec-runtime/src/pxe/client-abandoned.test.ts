/**
 * A `simulateTx` that times out after its send stays recorded until the offscreen document ends it:
 * its late answer, a wire send that failed after all, its document's retirement, or the record's
 * own lifetime. Driven through the real request path on a fake `chrome.runtime` transport.
 */
import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from "vitest"
import { RpcTimeoutError } from "@nulo/extension-messaging/errors"
import { MessageType } from "@nulo/extension-messaging/messages"
import { type ILogger, LogLevel } from "@nulo/wallet-core/logger"
import type { NetworkInfo } from "./chain-runtime"
import { PxeServiceClientBase } from "./client"

const net: NetworkInfo = { profileId: "p1", chainId: 31337, rpcUrl: "http://n/1" }
const SIM_TIMEOUT_MS = 90_000
const LIFETIME_MS = 15 * 60_000
const DOCUMENT = { id: "ext" } as chrome.runtime.MessageSender

type Sent = { content: { requestId: number; method: string }; from: string; fail: (cause: unknown) => void }

let sent: Sent[]
let listeners: Array<(message: unknown, sender: chrome.runtime.MessageSender) => boolean>
let epoch: number
let log: Mock<ILogger["log"]>

beforeEach(() => {
	vi.useFakeTimers()
	sent = []
	listeners = []
	epoch = 0
	log = vi.fn<ILogger["log"]>()
	vi.stubGlobal("chrome", {
		runtime: {
			id: "ext",
			getURL: (p: string) => `chrome-extension://ext/${p}`,
			onMessage: { addListener: (l: (typeof listeners)[number]) => listeners.push(l), removeListener: () => {} },
			sendMessage: (message: Omit<Sent, "fail">) =>
				new Promise<void>((_resolve, reject) => {
					sent.push({ ...message, fail: reject })
				}),
		},
	})
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

class NeverReadyClient extends PxeServiceClientBase {
	protected override onReady(): Promise<void> {
		return new Promise(() => {})
	}
}

function client(Client = PxeServiceClientBase) {
	const c = new Client({ log })
	c.setDocumentEpochProvider(() => epoch, LIFETIME_MS)
	return c
}

/** The rejection of a `simulateTx` (or another method) left to time out. */
async function timedOut(c: PxeServiceClientBase, method: "simulateTx" | "getSenders" = "simulateTx"): Promise<unknown> {
	const call = method === "simulateTx" ? c.simulateTx(net, {} as never, {} as never) : c.getSenders(net)
	const rejection = call.then(
		() => undefined,
		(error: unknown) => error,
	)
	await vi.advanceTimersByTimeAsync(SIM_TIMEOUT_MS)
	return rejection
}

function answerLate(requestId: number) {
	const request = sent.find((s) => s.content.requestId === requestId) as Sent
	for (const l of [...listeners]) {
		l({ type: MessageType.Response, from: "pxe", to: request.from, content: { requestId, result: "late" } }, DOCUMENT)
	}
}

async function isPending(promise: Promise<void> | undefined): Promise<boolean> {
	let done = false
	void promise?.then(() => {
		done = true
	})
	await vi.advanceTimersByTimeAsync(0)
	return promise !== undefined && !done
}

const records = (c: PxeServiceClientBase) => (c as unknown as { abandoned: Map<number, unknown> }).abandoned.size
const warned = () => log.mock.calls.filter((call) => call[1] >= LogLevel.Warn).map((call) => call[2])

describe("timed-out simulations", () => {
	test("a simulateTx that timed out after its send is held until its late answer, which logs at debug", async () => {
		const c = client()
		const error = await timedOut(c)
		expect(error).toBeInstanceOf(RpcTimeoutError)
		const settled = c.offscreenSettled(error)
		expect(await isPending(settled)).toBe(true)
		expect(c.offscreenSettled(new Error("wrapped", { cause: error }))).toBe(settled)

		answerLate(1)
		await expect(settled).resolves.toBeUndefined()
		expect(c.offscreenSettled(error)).toBeUndefined()
		expect(log.mock.calls.some((call) => call[1] === LogLevel.Debug && call[2] === "Late answer to a timed-out simulation")).toBe(true)
		expect(warned()).toEqual([])
	})

	test("nothing is held for a readiness timeout, another method, or a request sent to a retired document", async () => {
		const neverReady = client(NeverReadyClient)
		const readiness = await timedOut(neverReady)
		expect(readiness).toBeInstanceOf(RpcTimeoutError)
		expect(neverReady.offscreenSettled(readiness)).toBeUndefined()

		const c = client()
		expect(c.offscreenSettled(await timedOut(c, "getSenders"))).toBeUndefined()

		const call = c.simulateTx(net, {} as never, {} as never).catch((e: unknown) => e)
		await vi.advanceTimersByTimeAsync(0)
		epoch = 1
		await vi.advanceTimersByTimeAsync(SIM_TIMEOUT_MS)
		expect(c.offscreenSettled(await call)).toBeUndefined()
		expect(records(c)).toBe(0)
	})

	test("a late send failure ends the hold, and so does retiring the document it was sent to", async () => {
		const c = client()
		const first = await timedOut(c)
		sent[0]?.fail(new Error("no receiver"))
		await expect(c.offscreenSettled(first) ?? Promise.reject(new Error("not held"))).resolves.toBeUndefined()

		const second = c.offscreenSettled(await timedOut(c))
		c.retireEpochsThrough(epoch - 1)
		expect(await isPending(second)).toBe(true)
		c.retireEpochsThrough(epoch)
		await expect(second).resolves.toBeUndefined()
		expect(records(c)).toBe(0)
	})

	test("a response with an id this client never held still warns", async () => {
		const c = client()
		await timedOut(c, "getSenders")
		answerLate(1)
		expect(warned()).toEqual(["Invalid response received"])
	})

	test("unanswered records end at their lifetime, so repeated timeouts leave none behind", async () => {
		const c = client()
		const held = [c.offscreenSettled(await timedOut(c)), c.offscreenSettled(await timedOut(c))]
		expect(records(c)).toBe(2)
		await vi.advanceTimersByTimeAsync(LIFETIME_MS - 2 * SIM_TIMEOUT_MS)
		expect(await isPending(held[0])).toBe(true)
		await vi.advanceTimersByTimeAsync(2 * SIM_TIMEOUT_MS)
		await expect(Promise.all(held)).resolves.toEqual([undefined, undefined])
		expect(records(c)).toBe(0)
	})
})
