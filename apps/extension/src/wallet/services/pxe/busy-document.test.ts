/**
 * The real offscreen lifecycle and the real PXE client against a fake offscreen document that can
 * be busy (it queues every message and answers none until freed), drop or refuse a request, or
 * vanish without a close.
 */
import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from "vitest"
import { RpcDisconnectedError, RpcTimeoutError } from "@nulo/extension-messaging/errors"
import { MessageType } from "@nulo/extension-messaging/messages"
import type { NetworkInfo } from "@nulo/aztec-runtime/pxe"
import {
	markOffscreenUnanswered,
	OFFSCREEN_PING,
	OFFSCREEN_PONG,
	OFFSCREEN_READY_MESSAGE,
	offscreenAnswer,
	offscreenEpoch,
} from "@/wallet/utils/offscreen"
import { PxeServiceClient, registerPxeGenerationProvider } from "./client"

const DOCUMENT = { id: "ext", url: "chrome-extension://ext/src/offscreen/index.html" } as chrome.runtime.MessageSender
const NET: NetworkInfo = { profileId: "p1", chainId: 31337, rpcUrl: "http://n/1" }
const BOOT_MS = 10
const REQUEST_DEADLINE_MS = 90_000
const PROVE_DEADLINE_MS = 30 * 60_000

type Envelope = { type: string; content: { requestId: number; method: string }; from: string; to: string }
type Listener = (message: unknown, sender: chrome.runtime.MessageSender) => boolean | undefined

class FakeDocument {
	public busy = false
	/** The next request starts work that holds the document's thread until `free()`. */
	public holdOnNext = false
	public dropNext = 0
	public refuseNext = 0
	public readonly queue: Array<typeof OFFSCREEN_PING | Envelope> = []
}

let listeners: Listener[]
let doc: FakeDocument | undefined
let wire: Envelope[]
let pings: number
let failNextSend: boolean
let heldContexts: Promise<unknown[]> | undefined
let createDocument: Mock<() => Promise<void>>
let closeDocument: Mock<() => Promise<void>>

const deliver = (message: unknown, sender: chrome.runtime.MessageSender = DOCUMENT) => {
	for (const l of [...listeners]) l(message, sender)
}

function answer(current: FakeDocument, envelope: Envelope): void {
	const { requestId } = envelope.content
	const refused = current.refuseNext > 0
	if (refused) current.refuseNext -= 1
	const content = refused ? { requestId, error: "refused" } : { requestId, result: {} }
	deliver({ type: MessageType.Response, from: "pxe", to: envelope.from, content })
}

function pump(): void {
	const current = doc
	if (!current || current.busy) return
	for (const item of current.queue.splice(0)) {
		if (item === OFFSCREEN_PING) deliver(OFFSCREEN_PONG)
		else answer(current, item)
	}
}

function free(): void {
	if (doc) doc.busy = false
	pump()
}

/** The browser drops the document without a `closeDocument`; what it queued is lost. */
function removeDocument(): void {
	doc = undefined
}

const isEnvelope = (message: unknown): message is Envelope =>
	typeof message === "object" && message !== null && (message as { type?: unknown }).type === MessageType.Request

function receive(current: FakeDocument, message: unknown): void {
	if (message === OFFSCREEN_PING) {
		pings += 1
		current.queue.push(OFFSCREEN_PING)
	} else if (isEnvelope(message)) {
		wire.push(message)
		if (current.dropNext > 0) current.dropNext -= 1
		else current.queue.push(message)
		if (current.holdOnNext) {
			current.holdOnNext = false
			current.busy = true
		}
	}
	queueMicrotask(pump)
}

/** A caller's outcome, observed from the moment of the call so no rejection goes unhandled. */
const outcome = <T>(call: Promise<T>): Promise<{ ok: T } | { error: unknown }> =>
	call.then(
		(ok) => ({ ok }),
		(error: unknown) => ({ error }),
	)

const timedOut = { error: expect.any(RpcTimeoutError) }
const sentOf = (method: string) => wire.filter((envelope) => envelope.content.method === method)

beforeEach(() => {
	vi.useFakeTimers()
	// No case inherits a document an earlier case trusted.
	markOffscreenUnanswered(offscreenAnswer())
	listeners = []
	doc = undefined
	wire = []
	pings = 0
	failNextSend = false
	heldContexts = undefined
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
			getContexts: () => heldContexts ?? Promise.resolve(doc ? [{}] : []),
			onMessage: {
				addListener: (l: Listener) => listeners.push(l),
				removeListener: (l: Listener) => {
					const i = listeners.indexOf(l)
					if (i >= 0) listeners.splice(i, 1)
				},
			},
			sendMessage: async (message: unknown) => {
				if (!doc) throw new Error("Could not establish connection. Receiving end does not exist.")
				if (failNextSend && isEnvelope(message)) {
					failNextSend = false
					throw new Error("Could not establish connection. Receiving end does not exist.")
				}
				receive(doc, message)
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
		;(doc as FakeDocument).holdOnNext = true

		const a = outcome(c.getNoteSchemas())
		await vi.advanceTimersByTimeAsync(1_000)
		expect(sentOf("getNoteSchemas")).toHaveLength(2)
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

	test("a document that stops answering is replaced after a request goes unanswered", async () => {
		registerPxeGenerationProvider(async () => "g1")
		const c = await clientWithDocument()
		;(doc as FakeDocument).busy = true

		const a = outcome(c.getNoteSchemas())
		const long = outcome(c.proveTx(NET, {} as never, []))
		await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS)
		expect(await a).toEqual(timedOut)
		expect(pings).toBe(0)

		const b = outcome(c.getNoteSchemas())
		await vi.advanceTimersByTimeAsync(3_000 + BOOT_MS)
		expect(await b).toEqual({ ok: {} })
		expect(pings).toBe(1)
		expect(closeDocument).toHaveBeenCalledTimes(1)
		expect(createDocument).toHaveBeenCalledTimes(2)
		// The warm-up call, A once and B: the replacement re-sent nothing.
		expect(sentOf("getNoteSchemas")).toHaveLength(3)

		await vi.advanceTimersByTimeAsync(PROVE_DEADLINE_MS)
		expect(await long).toEqual(timedOut)
		expect(sentOf("proveTx")).toHaveLength(1)
	})

	test("a timeout clears trust only under the token it was sent with", async () => {
		const c = await clientWithDocument()

		// A was sent to X; Y, created after X vanished, keeps its trust when A times out.
		;(doc as FakeDocument).busy = true
		const a = outcome(c.getNoteSchemas())
		await vi.advanceTimersByTimeAsync(0)
		removeDocument()
		const b = outcome(c.getNoteSchemas())
		await vi.advanceTimersByTimeAsync(BOOT_MS)
		expect(await b).toEqual({ ok: {} })
		await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS)
		expect(await a).toEqual(timedOut)
		expect(await outcome(c.getNoteSchemas())).toEqual({ ok: {} })
		expect(pings).toBe(0)

		// Control: D, sent to Y under its current token, times out, so the next request pings.
		;(doc as FakeDocument).dropNext = 2
		const d = outcome(c.getNoteSchemas())
		await vi.advanceTimersByTimeAsync(10_000)
		const f = outcome(c.getNoteSchemas())
		await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS - 10_000)
		expect(await d).toEqual(timedOut)
		expect(await outcome(c.getNoteSchemas())).toEqual({ ok: {} })
		expect(pings).toBe(1)

		// F was sent before that PONG issued a new token, so its timeout is no evidence.
		await vi.advanceTimersByTimeAsync(10_000)
		expect(await f).toEqual(timedOut)
		expect(await outcome(c.getNoteSchemas())).toEqual({ ok: {} })
		expect(pings).toBe(1)
		expect(closeDocument).not.toHaveBeenCalled()
	})

	test("a failed send marks the document; an answered error and a readiness-phase timeout do not", async () => {
		const c = await clientWithDocument()

		failNextSend = true
		expect(await outcome(c.getNoteSchemas())).toEqual({ error: expect.any(RpcDisconnectedError) })
		expect(await outcome(c.getNoteSchemas())).toEqual({ ok: {} })
		expect(pings).toBe(1)

		;(doc as FakeDocument).refuseNext = 1
		expect(await outcome(c.getNoteSchemas())).toEqual({ error: new Error("refused") })
		expect(await outcome(c.getNoteSchemas())).toEqual({ ok: {} })
		expect(pings).toBe(1)

		let release: () => void = () => {}
		heldContexts = new Promise((resolve) => {
			release = () => resolve([{}])
		})
		const held = outcome(c.getNoteSchemas())
		await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS)
		expect(await held).toEqual(timedOut)
		heldContexts = undefined
		release()
		await vi.advanceTimersByTimeAsync(0)
		expect(await outcome(c.getNoteSchemas())).toEqual({ ok: {} })
		expect(pings).toBe(1)
	})

	test("the override forwards the tag: a timed-out simulation stays tracked", async () => {
		registerPxeGenerationProvider(async () => "g1")
		const c = await clientWithDocument()
		c.setDocumentEpochProvider(offscreenEpoch, 15 * 60_000)

		;(doc as FakeDocument).dropNext = 1
		const simulation = outcome(c.simulateTx(NET, {} as never, {} as never))
		await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS)
		const result = await simulation
		expect(result).toEqual(timedOut)
		expect(c.offscreenSettled((result as { error: unknown }).error)).toBeInstanceOf(Promise)
	})
})
