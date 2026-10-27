import { CLIENT_DISCONNECTED_MESSAGE } from "@nulo/extension-messaging/errors"
import { consoleMethods, LogLevel } from "@nulo/wallet-core/logger"
import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from "vitest"
import { createApp, defineComponent, onMounted } from "vue"

const { log, documentLogger } = vi.hoisted(() => {
	const log = vi.fn()
	return { log, documentLogger: vi.fn(() => ({ log })) }
})
vi.mock("@/wallet/services/logger/client", () => ({ documentLogger }))

import { forwardVueError, installConsoleForwarding } from "./console-forwarding"

type Hooks = Record<string, (...args: unknown[]) => void>

const hookNames = [...consoleMethods.map(([method]) => `nuloOn${method}`), "onunhandledrejection", "onerror"]
let installed: Array<[string, unknown]> = []
beforeEach(() => {
	log.mockClear()
	installed = hookNames.map((name) => [name, (self as unknown as Hooks)[name]])
})
afterEach(() => {
	for (const [name, value] of installed) (self as unknown as Record<string, unknown>)[name] = value
})

describe("installConsoleForwarding", () => {
	test("hooks all six console methods to the ui source at their mapped levels, under the client tag", () => {
		installConsoleForwarding("popup")
		expect(documentLogger).toHaveBeenCalledWith("popup")
		const hooks = self as unknown as Hooks
		for (const [method, level] of consoleMethods) {
			log.mockClear()
			hooks[`nuloOn${method}`]?.(`via ${method}`, { n: 1 })
			expect(log).toHaveBeenCalledTimes(1)
			expect(log).toHaveBeenCalledWith("ui", level, `via ${method}`, { n: 1 })
		}
	})

	test("leaves window.onerror alone: console.error forwarding has its own sink", () => {
		const before = self.onerror
		installConsoleForwarding("popup")
		expect(self.onerror).toBe(before)
		expect(typeof (self as unknown as Hooks).nuloOnerror).toBe("function")
	})

	test("a client-disconnect rejection logs at debug and is prevented from reaching the console; anything else logs at error, unprevented", () => {
		installConsoleForwarding("onboarding")
		const disconnect = new Error(CLIENT_DISCONNECTED_MESSAGE)
		const other = new Error("boom")
		const disconnectEvent = { reason: disconnect, preventDefault: vi.fn() } as unknown as PromiseRejectionEvent
		const otherEvent = { reason: other, preventDefault: vi.fn() } as unknown as PromiseRejectionEvent
		self.onunhandledrejection?.(disconnectEvent)
		self.onunhandledrejection?.(otherEvent)
		expect(log).toHaveBeenNthCalledWith(1, "ui", LogLevel.Debug, "unhandled rejection", { error: disconnect })
		expect(log).toHaveBeenNthCalledWith(2, "ui", LogLevel.Error, "unhandled rejection", { error: other })
		expect(disconnectEvent.preventDefault).toHaveBeenCalledTimes(1)
		expect(otherEvent.preventDefault).not.toHaveBeenCalled()
	})
})

describe("forwardVueError", () => {
	let debug: MockInstance
	let error: MockInstance
	beforeEach(() => {
		debug = vi.spyOn(console, "debug").mockImplementation(() => undefined)
		error = vi.spyOn(console, "error").mockImplementation(() => undefined)
	})
	afterEach(() => {
		debug.mockRestore()
		error.mockRestore()
	})

	test("a client disconnect logs at debug, any other error at error, each with Vue's info", () => {
		const disconnect = new Error(CLIENT_DISCONNECTED_MESSAGE)
		const other = new Error("boom")
		forwardVueError(disconnect, null, "mounted hook")
		forwardVueError(other, null, "mounted hook")
		expect(debug).toHaveBeenCalledExactlyOnceWith("vue error", { error: disconnect, info: "mounted hook" })
		expect(error).toHaveBeenCalledExactlyOnceWith("vue error", { error: other, info: "mounted hook" })
	})

	test.each([
		["a client disconnect makes no console.error", new Error(CLIENT_DISCONNECTED_MESSAGE), 0],
		["control: another error makes one", new Error("boom"), 1],
	])("as the app's errorHandler, an async onMounted that rejects: %s", async (_name, reason, errors) => {
		const app = createApp(
			defineComponent({
				setup() {
					onMounted(async () => {
						throw reason
					})
					return () => null
				},
			}),
		)
		app.config.errorHandler = forwardVueError
		app.mount(document.createElement("div"))
		await new Promise((resolve) => setTimeout(resolve, 0))
		app.unmount()
		expect(error).toHaveBeenCalledTimes(errors)
		expect(debug).toHaveBeenCalledTimes(1 - errors)
	})
})
