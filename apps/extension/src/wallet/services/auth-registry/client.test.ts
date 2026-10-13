/**
 * The authwit popups' deadline: the two RPCs that send a transaction wait as long as a proof in the
 * browser can take, and every read keeps the default deadline.
 */
import { RpcTimeoutError } from "@nulo/extension-messaging/errors"
import { connectStub, PortRegistry } from "@nulo/extension-messaging/testing"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AuthRegistryServiceClient } from "./client"

beforeEach(() => {
	vi.useFakeTimers()
	const registry = new PortRegistry({ answer: "manual" })
	;(chrome.runtime.connect as ReturnType<typeof vi.fn>).mockImplementation(connectStub(registry))
})

afterEach(() => {
	vi.useRealTimers()
})

/** The promise's state, read without awaiting it. */
function track<T>(promise: Promise<T>): { readonly state: "pending" | "resolved" | "rejected"; readonly value: unknown } {
	const box: { state: "pending" | "resolved" | "rejected"; value: unknown } = { state: "pending", value: undefined }
	promise.then(
		(value) => Object.assign(box, { state: "resolved", value }),
		(value) => Object.assign(box, { state: "rejected", value }),
	)
	return box
}

const FEE = { paymentMethod: { kind: "fpc", fpcId: "s1" } } as const

describe("AuthRegistryServiceClient deadlines", () => {
	test.each([
		["revokeAuthwits", (c: AuthRegistryServiceClient) => c.revokeAuthwits("net1", "0xacct", [1], FEE, "k")],
		["setRegistryEnabled", (c: AuthRegistryServiceClient) => c.setRegistryEnabled("net1", "0xacct", false, FEE, "k")],
	])("%s is still pending past the default 60 s and ends at sixty minutes", async (_name, send) => {
		const client = new AuthRegistryServiceClient()
		await client.connect()
		const call = track(send(client))
		await vi.advanceTimersByTimeAsync(61_000)
		expect(call.state).toBe("pending")
		await vi.advanceTimersByTimeAsync(60 * 60_000 - 61_001)
		expect(call.state).toBe("pending")
		await vi.advanceTimersByTimeAsync(1)
		expect(call.value).toBeInstanceOf(RpcTimeoutError)
	})

	test("a read keeps the default: getRegistryEnabled ends at 60 s", async () => {
		const client = new AuthRegistryServiceClient()
		await client.connect()
		const read = track(client.getRegistryEnabled(1, "0xacct"))
		await vi.advanceTimersByTimeAsync(59_999)
		expect(read.state).toBe("pending")
		await vi.advanceTimersByTimeAsync(1)
		expect(read.value).toBeInstanceOf(RpcTimeoutError)
	})
})
