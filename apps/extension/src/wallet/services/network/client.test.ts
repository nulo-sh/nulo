import { ValidationError } from "@nulo/extension-messaging/errors"
import { MessageType, type ResponseMessage } from "@nulo/extension-messaging/messages"
import { describe, expect, test } from "vitest"
import { capturePortMessage, emitPortMessage } from "../../../../tests/vitest.setup"
import { NetworkServiceClient } from "./client"
import { NETWORK_SERVICE_NAME } from "./spec"

const drain = async () => {
	for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe("NetworkServiceClient — schema validation on both directions", () => {
	test("invalid params throw before any request leaves the client", async () => {
		const client = new NetworkServiceClient()
		client.connect()
		await drain()
		const sent = capturePortMessage(NETWORK_SERVICE_NAME)
		const before = sent.mock.calls.length
		await expect(client.getNetwork(123 as never)).rejects.toBeInstanceOf(ValidationError)
		expect(sent.mock.calls.length).toBe(before)
	})

	test("an invalid result rejects with ValidationError", async () => {
		const client = new NetworkServiceClient()
		const promise = client.getNetworks()
		await drain()
		const calls = capturePortMessage(NETWORK_SERVICE_NAME).mock.calls
		const requestId = (calls[calls.length - 1][0] as { content: { requestId: number } }).content.requestId
		emitPortMessage(NETWORK_SERVICE_NAME, {
			type: MessageType.Response,
			content: { requestId, result: { not: "an array" } },
		} as ResponseMessage<{ [k: string]: () => unknown }>)
		await expect(promise).rejects.toBeInstanceOf(ValidationError)
	})
})

describe("NetworkServiceClient — a stored URL a later rule refuses still reads", () => {
	const endpoint = { id: "e1", rpcUrl: "http://[::1]:8080" }
	const network = { id: "n1", profileId: "p1", chainId: 42, l1ChainId: 0, name: "V6", primaryEndpointId: "e1", endpoints: [endpoint] }

	async function answer(promise: Promise<unknown>, result: unknown): Promise<unknown> {
		await drain()
		const calls = capturePortMessage(NETWORK_SERVICE_NAME).mock.calls
		const requestId = (calls[calls.length - 1][0] as { content: { requestId: number } }).content.requestId
		emitPortMessage(NETWORK_SERVICE_NAME, {
			type: MessageType.Response,
			content: { requestId, result },
		} as ResponseMessage<{ [k: string]: () => unknown }>)
		return promise
	}

	test.each([
		["getOrInitNetworks", (c: NetworkServiceClient) => c.getOrInitNetworks(), [network]],
		["setActiveNetwork", (c: NetworkServiceClient) => c.setActiveNetwork("n1"), network],
		["deleteEndpoint", (c: NetworkServiceClient) => c.deleteEndpoint("n1", "e1"), endpoint],
	] as const)("%s", async (_, call, result) => {
		await expect(answer(call(new NetworkServiceClient()), result)).resolves.toEqual(result)
	})

	test("the rest of the network's shape is still checked", async () => {
		const client = new NetworkServiceClient()
		await expect(answer(client.setActiveNetwork("n1"), { ...network, l1ChainId: -1 })).rejects.toBeInstanceOf(ValidationError)
	})
})
