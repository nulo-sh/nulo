import { ValidationError } from "@nulo/extension-messaging/errors"
import { MessageType, type ResponseMessage } from "@nulo/extension-messaging/messages"
import { describe, expect, test } from "vitest"
import { capturePortMessage, emitPortMessage, portRegistry } from "../../../../tests/vitest.setup"
import { NetworkServiceClient } from "./client"
import { NETWORK_SERVICE_NAME } from "./spec"

/** A client whose port has heard Ready, so a request posts before its call returns. */
function connectedClient(): NetworkServiceClient {
	const ports = portRegistry()
	ports.holdReady = true
	const client = new NetworkServiceClient()
	void client.connect()
	ports.ready(NETWORK_SERVICE_NAME)
	return client
}

describe("NetworkServiceClient — schema validation on both directions", () => {
	test("invalid params throw before any request leaves the client", async () => {
		const client = connectedClient()
		const sent = capturePortMessage(NETWORK_SERVICE_NAME)
		const before = sent.mock.calls.length
		await expect(client.getNetwork(123 as never)).rejects.toBeInstanceOf(ValidationError)
		expect(sent.mock.calls.length).toBe(before)

		// Control: the same client posts a valid request at once.
		const valid = client.getNetwork("n1").catch(() => undefined)
		expect(sent.mock.calls.length).toBe(before + 1)
		client.disconnect()
		await valid
	})

	test("an invalid result rejects with ValidationError", async () => {
		const promise = connectedClient().getNetworks()
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

	function answer(promise: Promise<unknown>, result: unknown): Promise<unknown> {
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
		await expect(answer(call(connectedClient()), result)).resolves.toEqual(result)
	})

	test("the rest of the network's shape is still checked", async () => {
		const client = connectedClient()
		await expect(answer(client.setActiveNetwork("n1"), { ...network, l1ChainId: -1 })).rejects.toBeInstanceOf(ValidationError)
	})
})
