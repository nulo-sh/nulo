/**
 * `handleDiscovery` with the every-site switch, through the SDK handler's callbacks with a fake
 * clock: a new site skips the connect window and still meets every other guard, spends a reconnect
 * token for itself and for a twin that waited on it, and is refused when the person turned the
 * switch off or switched profile before its session was written.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { type Deferred, deferred } from "@nulo/wallet-core/utils"

type Callbacks = {
	onPendingDiscovery: (d: unknown) => void
	onSessionEstablished: (s: unknown) => Promise<void> | void
	onSessionTerminated: (id: string) => void
}
let captured: Callbacks | undefined
const handlerCalls: string[] = []
const live = new Map<string, { sessionId: string }>()

vi.mock("@aztec-labs/wallet-sdk/extension/handlers", () => ({
	BackgroundConnectionHandler: class {
		constructor(_meta: unknown, _transport: unknown, callbacks: Callbacks) {
			captured = callbacks
		}
		handleEncryptedMessage() {
			return Promise.resolve()
		}
		getActiveSessions() {
			return [...live.values()]
		}
		getSession(id: string) {
			return live.get(id)
		}
		approveDiscovery(id: string) {
			handlerCalls.push(`approve:${id}`)
			return true
		}
		rejectDiscovery(id: string) {
			handlerCalls.push(`reject:${id}`)
		}
		terminateSession(id: string) {
			live.delete(id)
			captured?.onSessionTerminated(id)
		}
		terminateForTab() {}
		initialize() {}
	},
}))
vi.mock("./content-message-relay", () => ({ attachContentListener: () => {} }))
vi.mock("./tab-lifecycle", () => ({ wireTabLifecycle: () => {} }))
vi.mock("@nulo/wallet-sdk-schema-patch/register", () => ({}))
vi.mock("./discovery-flow", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./discovery-flow")>()
	return { ...actual, handleDiscovery: vi.fn(actual.handleDiscovery) }
})

import { initWalletSdkHandler } from "./background"
import { handleDiscovery } from "./discovery-flow"
import { discoveryRun } from "./discovery-run.harness"
import { RECONNECT_REFILL_MS } from "./verify-admission"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN as ORIGIN, fakeSdkServices } from "./test-services"

type Opts = Parameters<typeof fakeSdkServices>[0] & {}

/** The nth call resolves `reached(n)`, whenever a test starts waiting for it. */
function calls() {
	const signals = new Map<number, Deferred<void>>()
	const at = (n: number) => {
		const signal = signals.get(n) ?? deferred<void>()
		signals.set(n, signal)
		return signal
	}
	let count = 0
	return { hit: () => at(++count).resolve(), reached: (n: number) => at(n).promise }
}

function boot(opts: Opts & { everySite: (origin: string) => boolean | Promise<boolean> }) {
	let created = 0
	const onRemoved: Array<(id: number) => void> = []
	const ports = fakeSdkPorts({
		create: async () => ({ id: ++created }),
		onRemoved: (listener) => {
			onRemoved.push(listener)
			return () => {}
		},
	})
	ports.clock = {
		...ports.clock,
		now: () => Date.now(),
		setTimeout: (fn, ms) => setTimeout(fn, ms),
		clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
	}
	const reads = calls()
	const lookups = calls()
	const popup = vi.fn(opts.popup ?? (async () => ({ approved: true })))
	const notice = vi.fn(async () => undefined)
	const everySite = vi.fn((origin: string) => {
		reads.hit()
		return opts.everySite(origin)
	})
	const { services, rows } = fakeSdkServices({ ...opts, popup, notice, everySite })
	const sessions = (services as { get: (name: string) => Record<string, (...args: never[]) => unknown> }).get("dapp-session")
	const counted = {
		get: (name: string) => {
			const service = (services as { get: (name: string) => unknown }).get(name)
			if (name !== "dapp-session") return service
			return {
				...sessions,
				tryGetDappSessionByOriginAndChain: (origin: never, chainId: never) => {
					lookups.hit()
					return sessions.tryGetDappSessionByOriginAndChain(origin, chainId)
				},
			}
		},
	} as never
	initWalletSdkHandler(counted, { log: () => {} } as never, ports)
	const chainInfo = (chain: number) => ({ chainId: String(chain), version: "0" })
	const discover = (requestId: string, chain = 1) =>
		captured?.onPendingDiscovery({
			requestId,
			origin: ORIGIN,
			appId: "app",
			appName: "App",
			chainInfo: chainInfo(chain),
			timestamp: Date.now(),
			tabId: 7,
		})
	/** Key exchange done: the emoji check's window opens, and closing it gives its slot back. */
	const establishAndClose = async (requestId: string, chain = 1) => {
		const session = { origin: ORIGIN, sessionId: requestId, verificationHash: "HASH", chainInfo: chainInfo(chain) }
		live.set(requestId, session)
		await captured?.onSessionEstablished(session)
		for (const listener of onRemoved) listener(created)
	}
	return { discover, establishAndClose, popup, notice, everySite, reads, lookups, rows, windowsCreated: () => created }
}

/** Turns in which an effect a regression defers past a decision can surface. */
const flush = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve()
}
const approved = () => handlerCalls.filter((c) => c.startsWith("approve:")).map((c) => c.slice(8))
const rejected = () => handlerCalls.filter((c) => c.startsWith("reject:")).map((c) => c.slice(7))

beforeEach(() => {
	vi.useFakeTimers()
	handlerCalls.length = 0
	live.clear()
	captured = undefined
	vi.mocked(handleDiscovery).mockClear()
	vi.stubGlobal("chrome", {
		runtime: { getURL: (p: string) => p },
		tabs: { sendMessage: () => {} },
		action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
	})
	vi.stubGlobal("__VERSION__", "test")
})
afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

describe("a new site with the every-site switch", () => {
	test.each([
		["on: no connect window, a row, an approval, and the emoji check at establishment", true],
		["off: the connect window asks (control)", false],
	])("%s", async (_, on) => {
		const { discover, establishAndClose, popup, rows, windowsCreated } = boot({ everySite: () => on })
		discover("d1")
		await discoveryRun("d1")
		expect(popup).toHaveBeenCalledTimes(on ? 0 : 1)
		expect(approved()).toEqual(["d1"])
		expect(rows.size).toBe(1)
		await establishAndClose("d1")
		expect(windowsCreated()).toBe(1)
	})

	test("on, with the Terms not accepted: refused, with no row and no window", async () => {
		const { discover, popup, rows } = boot({ everySite: () => true, legal: async () => Promise.reject(new Error("terms")) })
		discover("d1")
		await discoveryRun("d1")
		expect(rejected()).toEqual(["d1"])
		expect(popup).not.toHaveBeenCalled()
		expect(rows.size).toBe(0)
	})

	test("on, for a chain with no network: the notice shows, and nothing is approved", async () => {
		const { discover, notice, popup, everySite, rows } = boot({ everySite: () => true, served: () => false })
		discover("d1")
		await discoveryRun("d1")
		expect(notice).toHaveBeenCalledTimes(1)
		expect(everySite).not.toHaveBeenCalled()
		expect(popup).not.toHaveBeenCalled()
		expect(rejected()).toEqual(["d1"])
		expect(rows.size).toBe(0)
	})

	test("a profile switch while the switch is read: refused, with no row", async () => {
		const read = deferred<boolean>()
		let active = "p1"
		const { discover, reads, rows } = boot({ everySite: () => read.promise, activeProfile: async () => ({ id: active }) })
		discover("d1")
		await reads.reached(1)
		active = "p2"
		read.resolve(true)
		await discoveryRun("d1")
		expect(rejected()).toEqual(["d1"])
		expect(rows.size).toBe(0)
	})

	test("turned off while the connection waits for its verify-window slot: refused, with no row", async () => {
		let on = true
		const { discover, establishAndClose, reads, rows } = boot({ everySite: () => on })
		// Two approved connections whose checks have not opened hold the origin's two window slots.
		for (const [id, chain] of [
			["d1", 1],
			["d2", 2],
		] as const) {
			discover(id, chain)
			await discoveryRun(id)
		}
		discover("d3", 3)
		// Each connection reads the switch before and after its admission and after its write: d3's
		// first read is the 7th.
		await reads.reached(7)
		on = false
		await flush()
		expect(approved()).toEqual(["d1", "d2"])
		await establishAndClose("d1", 1)
		await discoveryRun("d3")
		expect(rejected()).toEqual(["d3"])
		expect([...rows.keys()].map((key) => key.split("|")[1]).sort()).toEqual(["1", "2"])
	})

	test("turned off once its row is being written: refused, and the row rolled back", async () => {
		let read = 0
		const { discover, rows } = boot({ everySite: () => ++read <= 2 })
		discover("d1")
		await discoveryRun("d1")
		expect(read).toBe(3)
		expect(approved()).toEqual([])
		expect(rejected()).toEqual(["d1"])
		expect(rows.size).toBe(0)
	})

	test("a twin of a connection refused after its write, whose row stayed, is refused too", async () => {
		let read = 0
		const release = deferred<void>()
		const { discover, reads, lookups, rows } = boot({
			everySite: async () => {
				const n = ++read
				if (n === 1) await release.promise
				return n <= 2
			},
			beforeDelete: async () => Promise.reject(new Error("storage")),
		})
		discover("d1")
		await reads.reached(1)
		discover("twin")
		await lookups.reached(2)
		await flush()
		release.resolve()
		await discoveryRun("d1")
		await discoveryRun("twin")
		expect(approved()).toEqual([])
		expect(rejected().sort()).toEqual(["d1", "twin"])
		expect(rows.size).toBe(1)
	})

	test.each([
		["a twin of a connection the switch let through spends a token: with none left it queues", true],
		["a twin of an Allow spends none: with none left it is admitted at once (control)", false],
	])("%s", async (_, unpaced) => {
		let on = true
		let hold: Promise<void> | undefined
		const release = deferred<void>()
		const { discover, establishAndClose, reads, lookups } = boot({
			everySite: async () => {
				if (hold) await hold
				return on
			},
		})
		// The origin's three reconnect tokens: the switch-let connections before the last one spend
		// them, the last one spending the third when it is let through too.
		const spenders = unpaced ? ["s1", "s2"] : ["s1", "s2", "s3"]
		for (const [i, id] of spenders.entries()) {
			discover(id, i + 1)
			await discoveryRun(id)
			await establishAndClose(id, i + 1)
		}
		on = unpaced
		hold = release.promise
		discover("last", 9)
		await reads.reached(spenders.length * 3 + 1)
		discover("twin", 9)
		await lookups.reached(spenders.length + 2)
		await flush()
		release.resolve()
		await discoveryRun("last")
		await flush()
		expect(rejected()).toEqual([])
		expect(approved()).toEqual([...spenders, "last", ...(unpaced ? [] : ["twin"])])
		if (!unpaced) return
		await vi.advanceTimersByTimeAsync(RECONNECT_REFILL_MS)
		await discoveryRun("twin")
		expect(approved()).toEqual([...spenders, "last", "twin"])
	})
})
