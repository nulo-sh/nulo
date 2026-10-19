/**
 * `handleDiscovery` through the origin's admission gate, driven end to end through the SDK
 * handler's callbacks with a fake clock: a remembered origin's reload loop spends a reconnect token
 * and a verify-window slot per handshake, a fresh connection reserves its window after the popup
 * and gives it back on a rolled-back approval, and the number of handshakes parked behind one
 * popup is bounded.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DISCOVERY_STALE_MS } from "@nulo/wallet-bridge"
import { type Deferred, deferred } from "@nulo/wallet-core/utils"
import { LogLevel } from "@/wallet/logger"

type Callbacks = {
	onPendingDiscovery: (d: unknown) => void
	onSessionEstablished: (s: unknown) => Promise<void> | void
	onSessionTerminated: (id: string) => void
}
let captured: Callbacks | undefined
const handlerCalls: string[] = []
/** The SDK's active sessions by id, each the object it handed to establishment. */
const live = new Map<string, { sessionId: string }>()
let approveReturns = true
/** Per request id, armed by the test and resolved when the handler is asked to approve it. */
const approvals = new Map<string, Deferred<void>>()

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
			approvals.get(id)?.resolve()
			return approveReturns
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

const noopLogger = { log: () => {} } as never

/** Boot the handler, over a remembered session when `remembered` is set. */
function boot(
	opts: {
		remembered?: boolean
		popup?: () => Promise<{ approved: boolean }>
		legal?: () => Promise<void>
		logger?: { log: (...args: unknown[]) => void }
	} = {},
) {
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
	const asking = new Map<string, Deferred<void>>()
	const popup = opts.popup
	const { services, rows } = fakeSdkServices({
		...opts,
		popup:
			popup &&
			((_params: unknown, requestId: string) => {
				const answer = popup()
				asking.get(requestId)?.resolve()
				return answer
			}),
	})
	initWalletSdkHandler(services, (opts.logger ?? noopLogger) as never, ports)
	const discover = (requestId: string, over: Record<string, unknown> = {}) => {
		asking.set(requestId, deferred<void>())
		captured?.onPendingDiscovery({
			requestId,
			origin: ORIGIN,
			appId: "app",
			appName: "App",
			chainInfo: { chainId: "1", version: "1" },
			timestamp: Date.now(),
			tabId: 7,
			...over,
		})
	}
	/** Resolves once `requestId`'s latest discovery has asked for its connect window. */
	const prompted = (requestId: string) => asking.get(requestId)!.promise
	/** The SDK finished key exchange for an approved request: establish it (opens the verify window if due). */
	const establish = async (requestId: string, over: Record<string, unknown> = {}) => {
		const session = {
			origin: ORIGIN,
			sessionId: requestId,
			verificationHash: "HASH",
			chainInfo: { chainId: "1", version: "1" },
			...over,
		}
		live.set(requestId, session)
		await captured?.onSessionEstablished(session)
	}
	const closeWindow = (id: number) => {
		for (const l of onRemoved) l(id)
	}
	return { discover, prompted, establish, closeWindow, windowsCreated: () => created, rows }
}

/** Turns for discoveries to reach a park point no fake observes; no awaited cause covers a "not yet" there. */
const flush = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve()
}
/** Resolves when the handler is asked to approve `requestId`; armed before the step that approves it. */
const approval = (requestId: string) => {
	const asked = deferred<void>()
	approvals.set(requestId, asked)
	return asked.promise
}
const approved = () => handlerCalls.filter((c) => c.startsWith("approve:")).map((c) => c.slice(8))
const rejected = () => handlerCalls.filter((c) => c.startsWith("reject:")).map((c) => c.slice(7))

beforeEach(() => {
	vi.useFakeTimers()
	handlerCalls.length = 0
	live.clear()
	approveReturns = true
	approvals.clear()
	captured = undefined
	vi.mocked(handleDiscovery).mockClear()
	// biome-ignore lint/suspicious/noExplicitAny: chrome stub
	;(globalThis as any).chrome = {
		runtime: { getURL: (p: string) => p },
		tabs: { sendMessage: () => {} },
		action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
	}
	// biome-ignore lint/suspicious/noExplicitAny: vite define-injected global
	;(globalThis as any).__VERSION__ = "test"
})
afterEach(() => vi.useRealTimers())

describe("handleDiscovery — remembered origin (token + verify-window budget)", () => {
	test("2 approved, 4 queued, 6 rejected; a refill admits nothing while both windows stay open", async () => {
		const { discover, establish } = boot({ remembered: true })
		for (let i = 1; i <= 12; i++) discover(`r${i}`)
		await Promise.all(Array.from({ length: 12 }, (_, i) => discoveryRun(`r${i + 1}`)))
		expect(approved()).toEqual(["r1", "r2"])
		expect(rejected()).toEqual(["r7", "r8", "r9", "r10", "r11", "r12"])
		await establish("r1")
		await establish("r2")
		await vi.advanceTimersByTimeAsync(RECONNECT_REFILL_MS)
		expect(approved()).toEqual(["r1", "r2"])
	})

	test("closing both windows serves the 3rd at once; the 4th waits for the token refill", async () => {
		const { discover, establish, closeWindow } = boot({ remembered: true })
		for (let i = 1; i <= 4; i++) discover(`r${i}`)
		await Promise.all(["r1", "r2", "r3", "r4"].map(discoveryRun))
		await establish("r1")
		await establish("r2")
		await vi.advanceTimersByTimeAsync(5_000)
		const r3Approved = approval("r3")
		closeWindow(1)
		closeWindow(2)
		await r3Approved
		expect(approved()).toEqual(["r1", "r2", "r3"])
		await vi.advanceTimersByTimeAsync(RECONNECT_REFILL_MS - 5_000 - 1)
		expect(approved()).toEqual(["r1", "r2", "r3"])
		await vi.advanceTimersByTimeAsync(2)
		expect(approved()).toEqual(["r1", "r2", "r3", "r4"])
	})

	test("a returning approval that does not land releases the reserved slot", async () => {
		const { discover } = boot({ remembered: true })
		approveReturns = false
		discover("r1")
		await discoveryRun("r1")
		// The reservation was acquired, then approveDiscovery returned false: the slot must come back.
		approveReturns = true
		discover("r2")
		discover("r3")
		await Promise.all([discoveryRun("r2"), discoveryRun("r3")])
		// r1's approve was called and returned false, releasing its slot. Both windows are free, so
		// r2 AND r3 each open one; a leaked r1 slot would leave only one free and queue r3.
		expect(approved()).toEqual(["r1", "r2", "r3"])
	})

	test("a terminated transport keeps its open window's slot: the reconnect waits until the window closes", async () => {
		const { discover, establish, closeWindow } = boot({ remembered: true })
		discover("r1")
		discover("r2")
		await Promise.all([discoveryRun("r1"), discoveryRun("r2")])
		await establish("r1")
		await establish("r2")
		captured?.onSessionTerminated("r1")
		discover("r3")
		await discoveryRun("r3")
		expect(approved()).toEqual(["r1", "r2"])
		const r3Approved = approval("r3")
		closeWindow(1)
		await r3Approved
		expect(approved()).toEqual(["r1", "r2", "r3"])
	})
})

describe("handleDiscovery — fresh connection and dedupe waiters", () => {
	const chain = (n: number) => ({ chainInfo: { chainId: String(n), version: "0" } })

	test("the fresh branch reserves after its popup, keeps its duplicate pending through creation, and a waiter with occupied capacity queues", async () => {
		const popups = new Map<number, ReturnType<typeof deferred<{ approved: boolean }>>>()
		let opened = 0
		const { discover, prompted, establish, closeWindow } = boot({
			popup: () => {
				const d = deferred<{ approved: boolean }>()
				popups.set(++opened, d)
				return d.promise
			},
		})
		discover("f1", chain(1))
		discover("f2", chain(2))
		await Promise.all([prompted("f1"), prompted("f2")])
		popups.get(1)!.resolve({ approved: true })
		popups.get(2)!.resolve({ approved: true })
		await Promise.all([discoveryRun("f1"), discoveryRun("f2")])
		expect(approved()).toEqual(["f1", "f2"])
		await establish("f1", chain(1))
		await establish("f2", chain(2))

		// A third fresh handshake and its duplicate: the popup approves, but both window slots are held.
		discover("f3", chain(3))
		await prompted("f3")
		discover("f3dup", chain(3))
		await flush()
		popups.get(3)!.resolve({ approved: true })
		await flush()
		expect(approved()).toEqual(["f1", "f2"])
		expect(rejected()).toEqual([])
		closeWindow(1)
		await flush()
		// f3 got the slot and its session; its duplicate now waits for the next slot.
		expect(approved()).toEqual(["f1", "f2", "f3"])
		expect(rejected()).toEqual([])
		await establish("f3", chain(3))
		closeWindow(2)
		await discoveryRun("f3dup")
		expect(approved()).toEqual(["f1", "f2", "f3", "f3dup"])
	})

	test("a fresh approval that does not land after acquisition releases the reservation", async () => {
		const popup = deferred<{ approved: boolean }>()
		const { discover, prompted, windowsCreated } = boot({ popup: () => popup.promise })
		approveReturns = false
		discover("f1", chain(1))
		await prompted("f1")
		popup.resolve({ approved: true })
		await discoveryRun("f1")
		// The popup approved and the session was written, but approveDiscovery returned false — the
		// reserved slot must come back, not linger until the worker dies.
		expect(windowsCreated()).toBe(0)
		approveReturns = true
		discover("f2", chain(5))
		discover("f3", chain(6))
		await Promise.all([discoveryRun("f2"), discoveryRun("f3")])
		// f1's approve was called and returned false, releasing its slot. Both verify-window slots
		// are free, so f2 AND f3 each acquire one; a leaked f1 slot would leave only one free and
		// queue f3 behind the cap.
		expect(approved()).toEqual(["f1", "f2", "f3"])
	})

	test("a rolled-back approval releases the reservation", async () => {
		const popup = deferred<{ approved: boolean }>()
		const { discover, prompted, windowsCreated } = boot({ popup: () => popup.promise })
		discover("f1", { timestamp: Date.now() - DISCOVERY_STALE_MS + 1_000 })
		await prompted("f1")
		await vi.advanceTimersByTimeAsync(2_000)
		popup.resolve({ approved: true })
		await discoveryRun("f1")
		expect(rejected()).toEqual(["f1"])
		expect(windowsCreated()).toBe(0)
		// The slot came back: two more window-needing handshakes are admitted at once.
		discover("f2", chain(5))
		discover("f3", chain(6))
		await Promise.all([discoveryRun("f2"), discoveryRun("f3")])
		expect(approved()).toEqual(["f2", "f3"])
	})

	test("the 9th handshake waiting on one popup is rejected; the first 8 all settle with the popup", async () => {
		const popup = deferred<{ approved: boolean }>()
		const { discover } = boot({ popup: () => popup.promise })
		for (let i = 0; i <= 9; i++) discover(`d${i}`)
		await flush()
		expect(rejected()).toEqual(["d9"])
		expect(handlerCalls).toHaveLength(1)
		popup.resolve({ approved: true })
		await discoveryRun("d0")
		await vi.advanceTimersByTimeAsync(DISCOVERY_STALE_MS + 20_000)
		const settled = new Set(handlerCalls.map((c) => c.split(":")[1]))
		for (let i = 0; i <= 9; i++) expect(settled.has(`d${i}`)).toBe(true)
	})
})

describe("discovery with a chainInfo that does not decode", () => {
	test("is rejected before any approval popup opens and logged at debug", async () => {
		const log = vi.fn()
		const popup = vi.fn(async () => ({ approved: true }))
		const { discover } = boot({ popup, logger: { log } })

		discover("bad-chain-1", { chainInfo: { chainId: "", version: "0x1" } })
		await discoveryRun("bad-chain-1")

		expect(rejected()).toEqual(["bad-chain-1"])
		expect(popup).not.toHaveBeenCalled()
		const discoveryLines = log.mock.calls.filter(([, , text]) => String(text).startsWith("Discovery rejected"))
		expect(discoveryLines.map(([, level]) => level)).toEqual([LogLevel.Debug])
	})

	test("a popup that fails still logs its rejection at warn (control)", async () => {
		const log = vi.fn()
		const popup = async (): Promise<{ approved: boolean }> => {
			throw new Error("closed")
		}
		const { discover } = boot({ popup, logger: { log } })

		discover("closed-1")
		await discoveryRun("closed-1")

		expect(rejected()).toEqual(["closed-1"])
		const discoveryLines = log.mock.calls.filter(([, , text]) => String(text).startsWith("Discovery rejected"))
		expect(discoveryLines.map(([, level]) => level)).toEqual([LogLevel.Warn])
	})
})

describe("discovery without a current Terms acceptance", () => {
	const refuse = async () => {
		throw new Error("terms")
	}

	test("a new origin is rejected before any approval popup opens, leaving no row and no approval", async () => {
		const popup = vi.fn(async () => ({ approved: true }))
		const { discover, establish, rows, windowsCreated } = boot({ popup, legal: refuse })

		discover("fresh-1")
		await discoveryRun("fresh-1")

		expect(rejected()).toEqual(["fresh-1"])
		expect(approved()).toEqual([])
		expect(popup).not.toHaveBeenCalled()
		expect(rows.size).toBe(0)
		// The discovery protocol has no rejection reply, so nothing typed reaches the app; a key
		// exchange that completed anyway finds no approval to ride and is ended with no window.
		await establish("fresh-1")
		expect(live.has("fresh-1")).toBe(false)
		expect(windowsCreated()).toBe(0)
	})

	test("a remembered origin still reconnects: its requests are what get refused, not its channel", async () => {
		const { discover } = boot({ remembered: true, legal: refuse })

		discover("again-1")
		await discoveryRun("again-1")

		expect(approved()).toEqual(["again-1"])
	})
})
