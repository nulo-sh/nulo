/**
 * The popup's deadlines: `executeTransfer` waits as long as a proof in the browser can take, an
 * estimate as long as the worker keeps its run, a dropped port or a disposed page still ends either
 * at once, and every other method keeps the default deadline.
 */
import { isClientDisconnectRejection, RpcTimeoutError } from "@nulo/extension-messaging/errors"
import { MessageType } from "@nulo/extension-messaging/messages"
import { connectStub, PortRegistry } from "@nulo/extension-messaging/testing"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { TransferType } from "@/wallet/services/transaction/spec"
import { ExecutionServiceClient } from "./client"
import { ESTIMATE_JOB_TTL_MS, EXECUTION_SERVICE_NAME } from "./spec"

let registry: PortRegistry

beforeEach(() => {
	vi.useFakeTimers()
	registry = new PortRegistry({ answer: "manual" })
	;(chrome.runtime.connect as ReturnType<typeof vi.fn>).mockImplementation(connectStub(registry))
})

afterEach(() => {
	vi.useRealTimers()
})

const ARGS = [
	"net1",
	"0xacct",
	1,
	`0x${"1a".repeat(32)}`,
	TransferType.Public,
	"0xdest",
	10n,
	{ paymentMethod: { kind: "fpc" } } as never,
] as const

/** The promise's state, read without awaiting it. */
function track<T>(promise: Promise<T>): { readonly state: "pending" | "resolved" | "rejected"; readonly value: unknown } {
	const box: { state: "pending" | "resolved" | "rejected"; value: unknown } = { state: "pending", value: undefined }
	promise.then(
		(value) => Object.assign(box, { state: "resolved", value }),
		(value) => Object.assign(box, { state: "rejected", value }),
	)
	return box
}

/** The background's answer to the last request the client posted. */
function answer(result: unknown): void {
	const request = registry.posted.at(-1)
	if (!request) throw new Error("no request was posted")
	registry.deliver(EXECUTION_SERVICE_NAME, { type: MessageType.Response, content: { requestId: request.requestId, result } })
}

async function connected(): Promise<ExecutionServiceClient> {
	const client = new ExecutionServiceClient()
	await client.connect()
	return client
}

describe("ExecutionServiceClient: the executeTransfer deadline", () => {
	test("still pending at 61 s, and resolved by the background's answer at 90 s", async () => {
		const client = await connected()
		const transfer = track(client.executeTransfer(...ARGS))
		await vi.advanceTimersByTimeAsync(61_000)
		expect(transfer.state).toBe("pending")
		await vi.advanceTimersByTimeAsync(29_000)
		answer("0xhash")
		await vi.advanceTimersByTimeAsync(0)
		expect(transfer).toEqual({ state: "resolved", value: "0xhash" })
	})

	test("ends with RpcTimeoutError at sixty minutes", async () => {
		const client = await connected()
		const transfer = track(client.executeTransfer(...ARGS))
		await vi.advanceTimersByTimeAsync(60 * 60_000 - 1)
		expect(transfer.state).toBe("pending")
		await vi.advanceTimersByTimeAsync(1)
		expect(transfer.state).toBe("rejected")
		expect(transfer.value).toBeInstanceOf(RpcTimeoutError)
	})

	test("a client made after the first is disposed, as a reopened popup makes one, keeps the deadline", async () => {
		const first = await connected()
		first.disconnect()
		const second = await connected()
		const transfer = track(second.executeTransfer(...ARGS))
		await vi.advanceTimersByTimeAsync(90_000)
		expect(transfer.state).toBe("pending")
		answer("0xhash")
		await vi.advanceTimersByTimeAsync(0)
		expect(transfer).toEqual({ state: "resolved", value: "0xhash" })
	})

	test("(pin) a dropped port ends a pending transfer with the plain disconnect Error", async () => {
		const client = await connected()
		const transfer = track(client.executeTransfer(...ARGS))
		registry.closeAll(EXECUTION_SERVICE_NAME)
		await vi.advanceTimersByTimeAsync(0)
		expect(transfer.state).toBe("rejected")
		expect(isClientDisconnectRejection(transfer.value)).toBe(true)
	})

	test("(pin) disconnect() while a transfer is pending ends it and leaves no entry, timer or port listener", async () => {
		const client = await connected()
		const transfer = track(client.executeTransfer(...ARGS))
		const port = registry.opened.get(EXECUTION_SERVICE_NAME)?.[0]
		client.disconnect()
		await vi.advanceTimersByTimeAsync(0)
		expect(isClientDisconnectRejection(transfer.value)).toBe(true)
		expect((client as unknown as { pendingCount: number }).pendingCount).toBe(0)
		expect(vi.getTimerCount()).toBe(0)
		expect(port?.messageListeners.size).toBe(0)
		expect(port?.disconnectListeners.size).toBe(0)
	})

	test("(pin) every other method keeps the default: getGasBalances ends at 60 s", async () => {
		const client = await connected()
		const balances = track(client.getGasBalances("net1", "0xacct"))
		await vi.advanceTimersByTimeAsync(59_999)
		expect(balances.state).toBe("pending")
		await vi.advanceTimersByTimeAsync(1)
		expect(balances.value).toBeInstanceOf(RpcTimeoutError)
	})
})

const ESTIMATES: [string, (client: ExecutionServiceClient) => Promise<unknown>][] = [
	["estimateTransferFee", (client) => client.estimateTransferFee(...ARGS, "token")],
	["estimateOperationFee", (client) => client.estimateOperationFee("interaction", 0, ARGS[7], "token")],
	["previewOperationAuthwits", (client) => client.previewOperationAuthwits("interaction", 0, "token")],
]

describe("ExecutionServiceClient: an estimate's deadline is the worker's estimate lifetime", () => {
	test.each(ESTIMATES)("%s answered at 61 s resolves", async (_, call) => {
		const client = await connected()
		const estimate = track(call(client))
		await vi.advanceTimersByTimeAsync(61_000)
		expect(estimate.state).toBe("pending")
		answer({ maxFee: "1" })
		await vi.advanceTimersByTimeAsync(0)
		expect(estimate).toEqual({ state: "resolved", value: { maxFee: "1" } })
	})

	test.each(ESTIMATES)("%s unanswered ends with RpcTimeoutError at the estimate lifetime", async (_, call) => {
		const client = await connected()
		const estimate = track(call(client))
		await vi.advanceTimersByTimeAsync(ESTIMATE_JOB_TTL_MS - 1)
		expect(estimate.state).toBe("pending")
		await vi.advanceTimersByTimeAsync(1)
		expect(estimate.state).toBe("rejected")
		expect(estimate.value).toBeInstanceOf(RpcTimeoutError)
	})
})
