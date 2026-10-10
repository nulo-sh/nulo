/**
 * What reaches a subclass after a request ended: a response with no pending request, a wire send
 * that fails after the timeout, and the tag kept from the send to the terminal record.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { silentLogger } from "../testing/transport-harness"
import { BaseServiceClient, type ResponseContentLike, type TerminalRecord } from "./base-client"

type Methods = { ping: (n: number) => Promise<string> }

class HookedClient extends BaseServiceClient<Methods> {
	public readonly terminals: Array<{ record: TerminalRecord; tag: unknown }> = []
	public readonly unmatched: ResponseContentLike[] = []
	public readonly lateSendFailures: number[] = []
	public send: () => void | Promise<void> = () => {}
	public tagOf: (method: string, params: readonly unknown[]) => unknown = () => undefined
	public overrideUnmatched = true

	constructor(logger = silentLogger) {
		super("test", logger, "test-client", { defaultTimeoutMs: 500 })
	}
	protected ensureTransportReady(): void {}
	protected sendEnvelope(): void | Promise<void> {
		return this.send()
	}
	protected timeoutMessage(): string {
		return "request timed out"
	}
	protected sendFailureMessage(): string {
		return "send failed"
	}
	protected override requestTag(method: string, params: readonly unknown[]): unknown {
		return this.tagOf(method, params)
	}
	protected override onTerminal(record: TerminalRecord, tag?: unknown): void {
		this.terminals.push({ record, tag })
	}
	protected override onUnmatchedResponse(content: ResponseContentLike): void {
		if (this.overrideUnmatched) this.unmatched.push(content)
		else super.onUnmatchedResponse(content)
	}
	protected override onLateSendFailure(requestId: number): void {
		this.lateSendFailures.push(requestId)
	}
	public ping(n: number): Promise<string> {
		return this.request("ping", n)
	}
	public respond(content: ResponseContentLike): void {
		this.handleResponse(content)
	}
}

afterEach(() => {
	vi.useRealTimers()
})

describe("BaseServiceClient hooks after a request ends", () => {
	test("a response for a request no longer pending goes to the hook, and by default warns as before", async () => {
		const client = new HookedClient()
		const answered = client.ping(1)
		client.respond({ requestId: 1, result: "pong" })
		expect(await answered).toBe("pong")
		client.respond({ requestId: 1, result: "again" })
		expect(client.unmatched).toEqual([{ requestId: 1, result: "again" }])

		const log = vi.fn()
		const plain = new HookedClient({ log })
		plain.overrideUnmatched = false
		plain.respond({ requestId: 9, result: "stray" })
		expect(log.mock.calls.map((c) => [c[1], c[2]])).toEqual([[2, "Invalid response received"]])
	})

	test("a send that fails after the timeout reaches onLateSendFailure; one before it settles as a send failure", async () => {
		vi.useFakeTimers()
		const client = new HookedClient()
		let failLate: (cause: unknown) => void = () => {}
		client.send = () =>
			new Promise<void>((_resolve, reject) => {
				failLate = reject
			})
		const timedOut = client.ping(1).catch((e: Error) => e.message)
		await vi.advanceTimersByTimeAsync(500)
		expect(await timedOut).toBe("request timed out")
		failLate(new Error("no receiver"))
		await vi.advanceTimersByTimeAsync(0)
		expect(client.lateSendFailures).toEqual([1])

		client.send = () => Promise.reject(new Error("no receiver"))
		expect(await client.ping(2).catch((e: Error) => e.message)).toBe("send failed")
		expect(client.lateSendFailures).toEqual([1])
		expect(client.terminals.map((t) => t.record.status)).toEqual(["timeout", "send_failed"])
	})

	test("the tag taken at the send reaches onTerminal beside an unchanged record, before the caller's handler", async () => {
		vi.useFakeTimers()
		const client = new HookedClient()
		client.tagOf = (method, params) => `${method}:${params[0]}`
		const rejected = client.ping(7).catch(() => {
			expect(client.terminals).toHaveLength(1)
		})
		await vi.advanceTimersByTimeAsync(500)
		await rejected
		const [terminal] = client.terminals
		expect(terminal?.tag).toBe("ping:7")
		expect(Object.keys(terminal?.record ?? {}).sort()).toEqual(["detail", "endedAtMs", "method", "requestId", "startedAtMs", "status"])
		expect(terminal?.record).toMatchObject({ requestId: 1, method: "ping", status: "timeout", detail: "timeout_fired" })
	})
})
