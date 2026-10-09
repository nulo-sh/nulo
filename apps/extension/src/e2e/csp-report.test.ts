import { describe, expect, test } from "vitest"
import {
	CSP_FLUSH_MESSAGE,
	CSP_VIOLATION_MESSAGE,
	CSP_VIOLATIONS_KEY,
	type CspViolation,
	installBackgroundRecorder,
	installPageRecorder,
	type SessionArea,
} from "./csp-report"

const ORIGIN = "chrome-extension://abc/"

/** Each call yields to the event loop first, so two unserialized read-modify-writes interleave and lose one. */
function slowStorage(): SessionArea & { data: Record<string, unknown> } {
	const data: Record<string, unknown> = {}
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
	return {
		data,
		get: async (key) => {
			await tick()
			return key in data ? { [key]: structuredClone(data[key]) } : {}
		},
		set: async (items) => {
			await tick()
			Object.assign(data, structuredClone(items))
		},
	}
}

function violationEvent(fields: Partial<SecurityPolicyViolationEvent>): Event {
	return Object.assign(new Event("securitypolicyviolation"), {
		effectiveDirective: "",
		blockedURI: "",
		sourceFile: "",
		lineNumber: 0,
		...fields,
	})
}

type Listener = Parameters<Parameters<typeof installBackgroundRecorder>[0]["addMessageListener"]>[0]

function background(storage: SessionArea) {
	const scope = new EventTarget()
	let listener: Listener | undefined
	installBackgroundRecorder({ scope, storage, extensionOrigin: ORIGIN, addMessageListener: (l) => (listener = l) })
	const deliver = (message: unknown, url: string) =>
		new Promise<unknown>((resolve) => {
			if (!listener?.(message, { url }, resolve)) resolve(undefined)
		})
	return { scope, deliver, flush: () => deliver({ type: CSP_FLUSH_MESSAGE }, `${ORIGIN}src/setup/index.html`) }
}

const forwarded = (context: string): CspViolation => ({ context, directive: "connect-src", blocked: "http://example.com", source: "" })

describe("background recorder", () => {
	test("an entry recorded before a successor background loads survives that load", async () => {
		const storage = slowStorage()
		const first = background(storage)
		await first.flush()
		expect(storage.data[CSP_VIOLATIONS_KEY]).toEqual([])

		first.scope.dispatchEvent(
			violationEvent({
				effectiveDirective: "connect-src",
				blockedURI: "https://node.example/rpc/secret-key?x=1",
				sourceFile: `${ORIGIN}assets/pxe.js`,
				lineNumber: 7,
			}),
		)
		await first.flush()
		await background(storage).flush()

		expect(storage.data[CSP_VIOLATIONS_KEY]).toEqual([
			{ context: "background", directive: "connect-src", blocked: "https://node.example", source: `${ORIGIN}assets/pxe.js:7` },
		])
	})

	test("appends from several documents are serialized, and the flush answers after them", async () => {
		const storage = slowStorage()
		const { scope, deliver, flush } = background(storage)
		scope.dispatchEvent(violationEvent({ effectiveDirective: "style-src-elem", blockedURI: "inline" }))
		void deliver(
			{ type: CSP_VIOLATION_MESSAGE, violation: forwarded("/src/offscreen/index.html") },
			`${ORIGIN}src/offscreen/index.html`,
		)
		void deliver({ type: CSP_VIOLATION_MESSAGE, violation: forwarded("/src/popup/index.html") }, `${ORIGIN}src/popup/index.html`)

		await expect(flush()).resolves.toBe(true)
		expect((storage.data[CSP_VIOLATIONS_KEY] as CspViolation[]).map((v) => v.context)).toEqual([
			"background",
			"/src/offscreen/index.html",
			"/src/popup/index.html",
		])
	})

	test("a write that fails makes every later flush say so", async () => {
		const storage = slowStorage()
		const { scope, flush } = background(storage)
		await expect(flush()).resolves.toBe(true)
		storage.set = async () => {
			throw new Error("quota")
		}
		scope.dispatchEvent(violationEvent({ effectiveDirective: "connect-src", blockedURI: "https://node.example" }))
		await expect(flush()).resolves.toBe("a violation was not recorded: quota")
		await expect(flush()).resolves.toBe("a violation was not recorded: quota")
	})

	test("a report from outside the extension, or of the wrong shape, is not recorded", async () => {
		const storage = slowStorage()
		const { deliver, flush } = background(storage)
		await expect(deliver({ type: CSP_FLUSH_MESSAGE }, "https://dapp.example/")).resolves.toBeUndefined()
		void deliver({ type: CSP_VIOLATION_MESSAGE, violation: forwarded("content script") }, "https://dapp.example/")
		void deliver({ type: CSP_VIOLATION_MESSAGE, violation: { context: 1 } }, `${ORIGIN}src/popup/index.html`)
		void deliver({ type: CSP_VIOLATION_MESSAGE, violation: forwarded("/src/popup/index.html") }, `${ORIGIN}src/popup/index.html`)

		await flush()
		expect(storage.data[CSP_VIOLATIONS_KEY]).toEqual([forwarded("/src/popup/index.html")])
	})
})

describe("page recorder", () => {
	test("forwards each violation with its document's context", () => {
		const scope = new EventTarget()
		const sent: unknown[] = []
		installPageRecorder({ scope, context: "/src/popup/index.html", send: async (message) => sent.push(message) })
		scope.dispatchEvent(violationEvent({ effectiveDirective: "font-src", blockedURI: "data" }))

		expect(sent).toEqual([
			{
				type: CSP_VIOLATION_MESSAGE,
				violation: { context: "/src/popup/index.html", directive: "font-src", blocked: "data", source: "" },
			},
		])
	})
})
