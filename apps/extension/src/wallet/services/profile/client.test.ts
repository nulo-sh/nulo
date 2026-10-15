/**
 * Contract tests for `ProfileServiceClient.subscribeActiveProfile`.
 *
 * Exercises the snapshot-with-subscribe semantics:
 *  - On subscribe: handler fires once with the current active profile.
 *  - On subsequent `onActiveProfileChanged` events: handler fires again.
 *  - On `onConnected` (SW reconnect): handler re-fires with fresh snapshot.
 *  - Unsubscribe: detaches both the event handler and the reconnect hook.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { RpcTimeoutError } from "@nulo/extension-messaging/errors"
import { MessageType, type ResponseMessage } from "@nulo/extension-messaging/messages"
import { capturePortMessage, emitPortMessage } from "../../../../tests/vitest.setup"
import { DELETE_PROFILE_TIMEOUT_MS, ProfileServiceClient, deleteProfileClient } from "./client"
import { PROFILE_SERVICE_NAME, type Events, type ProfileInfo } from "./spec"

const profileA: ProfileInfo = { id: "a", name: "A", type: "password" }
const profileB: ProfileInfo = { id: "b", name: "B", type: "password" }

function newClient(): ProfileServiceClient {
	return new ProfileServiceClient()
}

function nextRequestId(): number {
	const calls = capturePortMessage(PROFILE_SERVICE_NAME).mock.calls
	const msg = calls[calls.length - 1][0] as { content: { requestId: number } }
	return msg.content.requestId
}

function respondWith<T>(requestId: number, result: T): void {
	const response: ResponseMessage<{ [k: string]: () => T }> = {
		type: MessageType.Response,
		content: { requestId, result },
	} as ResponseMessage<{ [k: string]: () => T }>
	emitPortMessage(PROFILE_SERVICE_NAME, response)
}

async function subscribeWithSnapshot(
	client: ProfileServiceClient,
	handler: (p: ProfileInfo | undefined) => void,
	snapshot: ProfileInfo | undefined,
): Promise<() => void> {
	const promise = client.subscribeActiveProfile(handler)
	// Drain the initial getActiveProfile request with the provided snapshot.
	await Promise.resolve()
	respondWith(nextRequestId(), snapshot)
	return promise
}

describe("ProfileServiceClient.subscribeActiveProfile", () => {
	let client: ProfileServiceClient

	beforeEach(async () => {
		client = newClient()
		await client.connect()
	})

	test("fires the handler once on subscribe with the current snapshot", async () => {
		const handler = vi.fn()
		await subscribeWithSnapshot(client, handler, profileA)
		expect(handler).toHaveBeenCalledTimes(1)
		expect(handler).toHaveBeenCalledWith(profileA)
	})

	test("snapshot is undefined when no profile is active", async () => {
		const handler = vi.fn()
		await subscribeWithSnapshot(client, handler, undefined)
		expect(handler).toHaveBeenCalledWith(undefined)
	})

	test("handler fires again on every onActiveProfileChanged event", async () => {
		const handler = vi.fn()
		await subscribeWithSnapshot(client, handler, profileA)
		handler.mockClear()

		const event: { type: MessageType.Event; content: { event: keyof Events; payload: Events[keyof Events] } } = {
			type: MessageType.Event,
			content: { event: "onActiveProfileChanged", payload: profileB },
		}
		emitPortMessage(PROFILE_SERVICE_NAME, event)

		expect(handler).toHaveBeenCalledTimes(1)
		expect(handler).toHaveBeenCalledWith(profileB)
	})

	test("reconnect re-fetches the snapshot and re-fires the handler", async () => {
		const handler = vi.fn()
		await subscribeWithSnapshot(client, handler, profileA)
		handler.mockClear()

		// Simulate a reconnect — fires `onConnected`. The subscription should
		// kick off another `getActiveProfile` call so the handler gets the
		// fresh state (in case events were missed during the disconnect).
		const callsBefore = capturePortMessage(PROFILE_SERVICE_NAME).mock.calls.length
		client.onConnected.invoke()

		// Wait until emitSnapshot has dispatched its getActiveProfile request.
		await vi.waitFor(() => {
			expect(capturePortMessage(PROFILE_SERVICE_NAME).mock.calls.length).toBeGreaterThan(callsBefore)
		})

		// Now respond and wait for the handler to be called.
		respondWith(nextRequestId(), profileB)
		await vi.waitFor(() => expect(handler).toHaveBeenCalledWith(profileB))

		expect(handler).toHaveBeenCalledTimes(1)
	})

	test("unsubscribe detaches both the event handler and the reconnect hook", async () => {
		const handler = vi.fn()
		const unsubscribe = await subscribeWithSnapshot(client, handler, profileA)
		handler.mockClear()

		unsubscribe()

		// No longer receives the event...
		emitPortMessage(PROFILE_SERVICE_NAME, {
			type: MessageType.Event,
			content: { event: "onActiveProfileChanged", payload: profileB },
		})
		expect(handler).not.toHaveBeenCalled()

		// ...and no longer re-snapshots on reconnect.
		client.onConnected.invoke()
		await Promise.resolve()
		// No new request fired for getActiveProfile — the mock call count stays.
		const callsBefore = capturePortMessage(PROFILE_SERVICE_NAME).mock.calls.length
		await Promise.resolve()
		expect(capturePortMessage(PROFILE_SERVICE_NAME).mock.calls.length).toBe(callsBefore)
	})
})

describe("Delete Profile's bound", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	test("a deletion answered after 10 minutes resolves on the Delete Profile client", async () => {
		vi.useFakeTimers()
		const client = deleteProfileClient()
		const call = client.deleteProfile("a")
		await vi.advanceTimersByTimeAsync(10 * 60_000)
		respondWith(nextRequestId(), profileA)
		await expect(call).resolves.toEqual(profileA)
		client.disconnect()
	})

	test("unanswered, it gives up at 30 minutes and 30 seconds, not before", async () => {
		vi.useFakeTimers()
		expect(DELETE_PROFILE_TIMEOUT_MS).toBe(30 * 60_000 + 30_000)
		const client = deleteProfileClient()
		const call = client.deleteProfile("a")
		const settled = vi.fn()
		call.then(settled, settled)
		await vi.advanceTimersByTimeAsync(DELETE_PROFILE_TIMEOUT_MS - 1)
		expect(settled).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		await expect(call).rejects.toBeInstanceOf(RpcTimeoutError)
		client.disconnect()
	})

	test("the shared client's deleteProfile and getProfiles still give up at 60 s", async () => {
		vi.useFakeTimers()
		const client = new ProfileServiceClient()
		const calls = [client.deleteProfile("a"), client.getProfiles()]
		const settled = vi.fn()
		for (const call of calls) call.then(settled, settled)
		await vi.advanceTimersByTimeAsync(60_000 - 1)
		expect(settled).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		for (const call of calls) await expect(call).rejects.toBeInstanceOf(RpcTimeoutError)
		client.disconnect()
	})
})
