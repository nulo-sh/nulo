import { MessageType } from "@nulo/extension-messaging/messages"
import { connectStub, PortRegistry } from "@nulo/extension-messaging/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ConfigProp, IConfig } from "@/wallet/config"
import { type ILogger, LoggerStore, LogLevel } from "@/wallet/logger"
import { _resetDocumentLoggerForTests, documentLogger } from "./client"
import { LoggerService } from "./service"
import { LOGGER_SERVICE_NAME } from "./spec"

vi.unmock("@/wallet/services/logger/client")

/**
 * The popup, onboarding and offscreen contexts all log through this client — three of the four.
 * Their data crosses an RPC boundary that runs `jsonSanitize` on the way, which destroys every
 * shape `LoggerStore.trim()` knows how to collapse: an Error becomes a plain object still carrying
 * its stack, a typed array becomes a numeric object, Map/Set become arrays. Redaction therefore has
 * to happen HERE, before the send, or it does not happen at all for those contexts.
 */

const SECRET = "correct-horse-battery-staple"

let registry: PortRegistry

beforeEach(() => {
	_resetDocumentLoggerForTests()
	registry = new PortRegistry({ answer: "microtask" })
	;(chrome.runtime.connect as ReturnType<typeof vi.fn>).mockImplementation(connectStub(registry))
})
afterEach(async () => {
	// Every line is answered on a microtask; wait for it so no request keeps a timer.
	await new Promise((resolve) => setTimeout(resolve, 0))
})

/**
 * What reaches the wire — `[method, context, source, level, ...data]` as posted after
 * `jsonSanitize`. The logger client is private to its module, so the transport is observed at
 * `chrome.runtime.connect`.
 */
function captureWire(context: "popup" | "offscreen"): { logger: ILogger; sent: () => unknown[] } {
	return { logger: documentLogger(context), sent: () => registry.posted.flatMap((p) => [p.method, ...p.params]) }
}

describe("documentLogger — redaction before the wire", () => {
	test("blanks a secret key before it crosses the RPC", () => {
		const { logger, sent } = captureWire("popup")

		logger.log("ui", LogLevel.Error, { password: SECRET })

		expect(JSON.stringify(sent())).not.toContain(SECRET)
	})

	test("projects an Error before jsonSanitize can flatten it into a stack-carrying object", () => {
		const { logger, sent } = captureWire("popup")

		logger.log("ui", LogLevel.Error, new Error(`failed for https://rpc.example.com/v2/${SECRET}`))

		expect(sent()[4]).toEqual({ name: "Error", message: "failed for https://rpc.example.com" })
		expect(sent()[4]).not.toBeInstanceOf(Error)
	})

	test("summarises a typed array instead of shipping its bytes", () => {
		const { logger, sent } = captureWire("popup")

		logger.log("ui", LogLevel.Error, { key: new Uint8Array([1, 2, 3, 4]) })

		const wire = JSON.stringify(sent())
		expect(wire).toContain("Uint8Array(4)")
		// The generic walk would have serialized it as {"0":1,"1":2,…}.
		expect(wire).not.toContain('"0":1')
	})

	test("collapses a real Note shape before it leaves the popup", () => {
		const { logger, sent } = captureWire("popup")

		// A COMPLETE Note — the collapse requires contract/txHash/storageSlot/rawContent, so a
		// partial fixture would prove nothing about the real type.
		logger.log("ui", LogLevel.Warn, {
			contract: "0xc",
			storageSlot: "0x1",
			txHash: "0xtx",
			rawContent: [SECRET],
			type: "UintNote",
			content: { amount: SECRET },
		})

		expect(JSON.stringify(sent())).not.toContain(SECRET)
		expect(sent()[4]).toMatchObject({ note: "UintNote", rawContentLen: 1, contentKeys: 1 })
	})

	test("still forwards the routing arguments unchanged", () => {
		const { logger, sent } = captureWire("offscreen")

		logger.log("pxe", LogLevel.Warn, "plain message")

		expect(sent()[0]).toBe("log")
		expect(sent()[1]).toBe("offscreen")
		expect(sent()[2]).toBe("pxe")
		expect(sent()[3]).toBe(LogLevel.Warn)
		expect(sent()[4]).toBe("plain message")
	})
})

describe("documentLogger — the worker's level gate", () => {
	let gate: PortRegistry
	const answered = new Set<unknown>()

	beforeEach(() => {
		gate = new PortRegistry({ answer: "manual" })
		answered.clear()
		;(chrome.runtime.connect as ReturnType<typeof vi.fn>).mockImplementation(connectStub(gate))
	})

	/** Answers every unanswered line with `level`, as the worker's `log` does. */
	function answerAll(level: unknown) {
		for (const entry of gate.posted) {
			if (answered.has(entry)) continue
			answered.add(entry)
			const response = { type: MessageType.Response, content: { requestId: entry.requestId, result: level } }
			for (const listener of [...entry.port.messageListeners]) listener(response)
		}
	}
	const levelEvent = (level: unknown) =>
		gate.deliver(LOGGER_SERVICE_NAME, { type: MessageType.Event, content: { event: "onLevel", payload: level } })
	const sentLevels = () => gate.posted.map((entry) => entry.params[2])
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

	async function knowing(level: unknown): Promise<ILogger> {
		const logger = documentLogger("popup")
		logger.log("ui", LogLevel.Info, "first")
		answerAll(level)
		await settle()
		return logger
	}

	function logEveryLevel(logger: ILogger) {
		for (const level of [LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error]) logger.log("ui", level, "line")
	}

	test("after an Info answer a Debug line stays in the document; Info, Warn and Error lines go", async () => {
		const logger = await knowing(LogLevel.Info)
		logEveryLevel(logger)
		expect(sentLevels()).toEqual([LogLevel.Info, LogLevel.Info, LogLevel.Warn, LogLevel.Error])
		answerAll(LogLevel.Info)
	})

	test.each([LogLevel.Warn, LogLevel.Error, 7, "x"])("an answer of %s is not adopted: every line still goes", async (level) => {
		const logger = await knowing(level)
		logEveryLevel(logger)
		expect(sentLevels()).toEqual([LogLevel.Info, LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error])
		answerAll(level)
	})

	test.each([LogLevel.Warn, LogLevel.Error, 7, "x"])("an onLevel of %s forgets a known Info: every line still goes", async (level) => {
		const logger = await knowing(LogLevel.Info)
		levelEvent(level)
		logEveryLevel(logger)
		expect(sentLevels()).toEqual([LogLevel.Info, LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error])
		answerAll(LogLevel.Info)
	})

	test("an onLevel of Debug lets the next Debug line go", async () => {
		const logger = await knowing(LogLevel.Info)
		levelEvent(LogLevel.Debug)
		logger.log("ui", LogLevel.Debug, "line")
		expect(sentLevels()).toEqual([LogLevel.Info, LogLevel.Debug])
		answerAll(LogLevel.Debug)
	})

	test("a remote close forgets the level: the next Debug line goes on the new port", async () => {
		const logger = await knowing(LogLevel.Info)
		gate.closeAll(LOGGER_SERVICE_NAME)
		logger.log("ui", LogLevel.Debug, "line")
		expect(sentLevels()).toEqual([LogLevel.Info, LogLevel.Debug])
		expect(gate.posted[1].port).not.toBe(gate.posted[0].port)
		answerAll(LogLevel.Info)
	})
})

describe("documentLogger — against a real LoggerService", () => {
	/** Joins the page's ports to the service's, delivering each message in a task of its own and
	 *  through a structured clone, as Chrome does. */
	function joinPorts() {
		let onConnect: (port: unknown) => void = () => {}
		;(chrome.runtime.onConnect.addListener as ReturnType<typeof vi.fn>).mockImplementation((listener: (port: unknown) => void) => {
			onConnect = listener
		})
		const end = () => {
			const message = new Set<(...args: unknown[]) => void>()
			return {
				message,
				onMessage: {
					addListener: (l: (...args: unknown[]) => void) => message.add(l),
					removeListener: (l: (...args: unknown[]) => void) => message.delete(l),
				},
				onDisconnect: { addListener: () => {}, removeListener: () => {} },
				disconnect: () => {},
			}
		}
		;(chrome.runtime.connect as ReturnType<typeof vi.fn>).mockImplementation((_id: unknown, { name }: { name: string }) => {
			const page = { name, ...end(), postMessage: (() => {}) as (m: unknown) => void }
			const worker = { name, sender: {}, ...end(), postMessage: (() => {}) as (m: unknown) => void }
			const deliver = (to: typeof page, from: unknown, m: unknown) =>
				setTimeout(() => {
					for (const l of [...to.message]) l(structuredClone(m), from)
				}, 0)
			page.postMessage = (m) => deliver(worker, worker, m)
			worker.postMessage = (m) => deliver(page, page, m)
			onConnect(worker)
			return page
		})
	}

	test("turning debugMode on lets the next Debug line reach the store", async () => {
		joinPorts()
		const config = { onUpdate: new EventHandler<ConfigProp>(), get: (() => false) as IConfig["get"] }
		const store = new LoggerStore(config)
		new LoggerService(store)
		const settle = () => new Promise((resolve) => setTimeout(resolve, 5))
		const stored = () => store.get(10).map((log) => log.data[0])
		const logger = documentLogger("popup")

		logger.log("ui", LogLevel.Info, "known")
		await settle()
		logger.log("ui", LogLevel.Debug, "below the minimum")
		await settle()
		expect(stored()).toEqual(["known"])

		config.onUpdate.invoke({ key: "debugMode", value: true })
		await settle()
		logger.log("ui", LogLevel.Debug, "kept")
		await settle()
		expect(stored()).toEqual(["known", "kept"])
	})
})
