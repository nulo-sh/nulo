/**
 * The real offscreen lifecycle and the real PXE client against a fake offscreen document that can
 * be busy (it queues every message and answers none until freed), drop a request, or vanish.
 */
import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from "vitest"
import { MessageType } from "@nulo/extension-messaging/messages"
import { OFFSCREEN_PING, OFFSCREEN_PONG, OFFSCREEN_READY_MESSAGE } from "@/wallet/utils/offscreen"
import { PxeServiceClient } from "./client"

const DOCUMENT = { id: "ext", url: "chrome-extension://ext/src/offscreen/index.html" } as chrome.runtime.MessageSender
const BOOT_MS = 10

type Envelope = { type: string; content: { requestId: number; method: string }; from: string; to: string }
type Listener = (message: unknown, sender: chrome.runtime.MessageSender) => boolean | undefined

class FakeDocument {
	public busy = false
	public readonly queue: Array<typeof OFFSCREEN_PING | Envelope> = []
}

let listeners: Listener[]
let doc: FakeDocument | undefined
let wire: Envelope[]
let createDocument: Mock<() => Promise<void>>
let closeDocument: Mock<() => Promise<void>>

const deliver = (message: unknown, sender: chrome.runtime.MessageSender = DOCUMENT) => {
	for (const l of [...listeners]) l(message, sender)
}

/** The document answers what it queued, in order, unless it is busy or gone. */
function pump(): void {
	const current = doc
	if (!current || current.busy) return
	for (const item of current.queue.splice(0)) {
		if (item === OFFSCREEN_PING) deliver(OFFSCREEN_PONG)
		else deliver({ type: MessageType.Response, from: "pxe", to: item.from, content: { requestId: item.content.requestId, result: {} } })
	}
}

function free(): void {
	if (doc) doc.busy = false
	pump()
}

const isEnvelope = (message: unknown): message is Envelope =>
	typeof message === "object" && message !== null && (message as { type?: unknown }).type === MessageType.Request

/** A caller's outcome, observed from the moment of the call so no rejection goes unhandled. */
const outcome = <T>(call: Promise<T>): Promise<{ ok: T } | { error: unknown }> =>
	call.then(
		(ok) => ({ ok }),
		(error: unknown) => ({ error }),
	)

const sentOf = (method: string) => wire.filter((envelope) => envelope.content.method === method)

beforeEach(() => {
	vi.useFakeTimers()
	listeners = []
	doc = undefined
	wire = []
	createDocument = vi.fn(async () => {
		const created = new FakeDocument()
		doc = created
		setTimeout(() => {
			if (doc === created) deliver(OFFSCREEN_READY_MESSAGE)
		}, BOOT_MS)
	})
	closeDocument = vi.fn(async () => {
		if (!doc) throw new Error("No current offscreen document")
		doc = undefined
	})
	vi.stubGlobal("self", globalThis)
	vi.stubGlobal("chrome", {
		runtime: {
			id: "ext",
			getURL: (path: string) => `chrome-extension://ext/${path}`,
			getContexts: vi.fn(async () => (doc ? [{}] : [])),
			onMessage: {
				addListener: (l: Listener) => listeners.push(l),
				removeListener: (l: Listener) => {
					const i = listeners.indexOf(l)
					if (i >= 0) listeners.splice(i, 1)
				},
			},
			sendMessage: async (message: unknown) => {
				if (!doc) throw new Error("Could not establish connection. Receiving end does not exist.")
				if (isEnvelope(message)) wire.push(message)
				if (message === OFFSCREEN_PING || isEnvelope(message)) doc.queue.push(message)
				queueMicrotask(pump)
			},
		},
		offscreen: { createDocument, closeDocument },
	})
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

/** A client whose first call has created the document; the worker heard its READY. */
async function clientWithDocument(): Promise<PxeServiceClient> {
	const c = new PxeServiceClient({ log: () => {} })
	const first = outcome(c.getNoteSchemas())
	await vi.advanceTimersByTimeAsync(BOOT_MS)
	expect(await first).toEqual({ ok: {} })
	return c
}

describe("a busy offscreen document", () => {
	test("a busy document finishes the call it runs and the next one", async () => {
		const c = await clientWithDocument()
		;(doc as FakeDocument).busy = true

		const a = outcome(c.getNoteSchemas())
		await vi.advanceTimersByTimeAsync(1_000)
		const b = outcome(c.getNoteSchemas())
		await vi.advanceTimersByTimeAsync(3_100)
		expect(closeDocument).not.toHaveBeenCalled()

		free()
		await vi.advanceTimersByTimeAsync(0)
		expect(await a).toEqual({ ok: {} })
		expect(await b).toEqual({ ok: {} })
		expect(createDocument).toHaveBeenCalledTimes(1)
		expect(sentOf("getNoteSchemas")).toHaveLength(3)
	})
})
