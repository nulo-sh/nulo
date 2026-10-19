/**
 * `handleDiscovery` for a chain the profile has no network for, driven through the SDK handler's
 * callbacks: the dApp is refused (silence), the user gets the network-unavailable notice in place
 * of the connect window, no session is written, and a remembered row for the pair is dropped
 * instead of reconnecting. The notice shares the connect window's dedupe and caps, the unlock drain
 * reaches the same gate, and a served chain still connects.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DiscoveryQueue } from "@nulo/wallet-bridge"
import { type Deferred, deferred } from "@nulo/wallet-core/utils"

type Callbacks = {
	onPendingDiscovery: (d: unknown) => void
	onSessionEstablished: (s: unknown) => Promise<void> | void
	onSessionTerminated: (id: string) => void
}
let captured: Callbacks | undefined
const handlerCalls: string[] = []
const pending = new Map<string, Record<string, unknown>>()
/** Per request id, armed by the test and resolved when the handler is asked to reject it. */
const rejections = new Map<string, Deferred<void>>()

vi.mock("@aztec-labs/wallet-sdk/extension/handlers", () => ({
	BackgroundConnectionHandler: class {
		constructor(_meta: unknown, _transport: unknown, callbacks: Callbacks) {
			captured = callbacks
		}
		handleEncryptedMessage() {
			return Promise.resolve()
		}
		getActiveSessions() {
			return []
		}
		getPendingDiscovery(id: string) {
			return pending.get(id)
		}
		approveDiscovery(id: string) {
			handlerCalls.push(`approve:${id}`)
			return true
		}
		rejectDiscovery(id: string) {
			handlerCalls.push(`reject:${id}`)
			rejections.get(id)?.resolve()
		}
		terminateSession() {}
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

import { dispatcherNetworks, initWalletSdkHandler } from "./background"
import { handleDiscovery } from "./discovery-flow"
import { discoveryRun } from "./discovery-run.harness"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN as ORIGIN, fakeSdkServices } from "./test-services"
import { VerifyAdmissionGate } from "./verify-admission"

const noopLogger = { log: () => {} } as never

type NoticeParams = { dappMetadata: { name: string; url: string } }

function boot(opts: Parameters<typeof fakeSdkServices>[0] = {}) {
	const asking = new Map<string, Deferred<void>>()
	const popup = opts.popup
	const fake = fakeSdkServices({
		...opts,
		popup:
			popup &&
			((params, requestId) => {
				const answer = popup(params, requestId)
				asking.get(requestId)?.resolve()
				return answer
			}),
	})
	initWalletSdkHandler(fake.services, noopLogger, fakeSdkPorts())
	/** `chain` is the wallet chain id: `chainInfo` `{ chainId: n, version: 0 }` derives to `n`. */
	const discover = (requestId: string, chain = 0) => {
		const discovery = {
			requestId,
			origin: ORIGIN,
			appId: "app",
			appName: "App",
			chainInfo: { chainId: String(chain), version: "0" },
			timestamp: Date.now(),
			tabId: 7,
			status: "pending",
		}
		pending.set(requestId, discovery)
		asking.set(requestId, deferred<void>())
		captured?.onPendingDiscovery(discovery)
	}
	/** Resolves once `requestId`'s latest discovery has asked for its connect window. */
	const prompted = (requestId: string) => asking.get(requestId)!.promise
	return { discover, prompted, rows: fake.rows, onActiveProfileChanged: fake.onActiveProfileChanged }
}

/** Turns before a "not yet", "never" or exact-list read: a park point, or a decision whose run settles
 *  with it, so an effect a regression defers past it lands inside them. */
const flush = async () => {
	for (let i = 0; i < 30; i++) await Promise.resolve()
}
/** Resolves when the handler is asked to reject `requestId`; armed before the step that rejects it. */
const rejection = (requestId: string) => {
	const asked = deferred<void>()
	rejections.set(requestId, asked)
	return asked.promise
}
const approved = () => handlerCalls.filter((c) => c.startsWith("approve:")).map((c) => c.slice(8))
const rejected = () => handlerCalls.filter((c) => c.startsWith("reject:")).map((c) => c.slice(7))

beforeEach(() => {
	handlerCalls.length = 0
	pending.clear()
	rejections.clear()
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
afterEach(() => vi.restoreAllMocks())

describe("discovery for a chain the profile has no network for", () => {
	test("a new origin is refused, sees the notice instead of the connect window, and gets no session", async () => {
		const popup = vi.fn(async () => ({ approved: true }))
		const notice = vi.fn(async (_p: NoticeParams) => {})
		const { discover, rows } = boot({ popup, notice, served: () => false })

		discover("u1", 1816023401)
		await discoveryRun("u1")
		await flush()

		expect(rejected()).toEqual(["u1"])
		expect(approved()).toEqual([])
		expect(popup).not.toHaveBeenCalled()
		expect(notice).toHaveBeenCalledTimes(1)
		expect(notice.mock.calls[0]?.[0]).toEqual({ dappMetadata: { name: "App", url: ORIGIN } })
		expect(rows.size).toBe(0)
	})

	test("the dApp is refused before the notice opens, so no answer from the window can approve it", async () => {
		const window = deferred()
		const { discover } = boot({ notice: () => window.promise, served: () => false })

		const refused = rejection("u1")
		discover("u1", 5)
		await refused

		expect(rejected()).toEqual(["u1"])
		window.resolve()
		await discoveryRun("u1")
		await flush()
		expect(approved()).toEqual([])
	})

	test("a remembered row does not reconnect: it is dropped and the notice opens", async () => {
		const notice = vi.fn(async (_p: NoticeParams) => {})
		const { discover, rows } = boot({ remembered: true, notice, served: () => false })
		expect(rows.has(`${ORIGIN}|0`)).toBe(true)

		discover("s1", 0)
		await discoveryRun("s1")
		await flush()

		expect(approved()).toEqual([])
		expect(rejected()).toEqual(["s1"])
		expect(notice).toHaveBeenCalledTimes(1)
		expect(rows.has(`${ORIGIN}|0`)).toBe(false)
	})

	test("a duplicate while the notice is open is refused without a second notice; the next try after it closes gets one", async () => {
		const window = deferred()
		const opened = deferred()
		const notice = vi.fn((_p: NoticeParams) => {
			opened.resolve()
			return window.promise
		})
		const { discover } = boot({ notice, served: () => false })

		discover("d1", 9)
		await opened.promise
		discover("d2", 9)
		await discoveryRun("d2")
		await flush()
		expect(rejected()).toEqual(["d1", "d2"])
		expect(notice).toHaveBeenCalledTimes(1)

		window.resolve()
		await discoveryRun("d1")
		discover("d3", 9)
		await discoveryRun("d3")
		await flush()
		expect(notice).toHaveBeenCalledTimes(2)
		expect(approved()).toEqual([])
	})

	test("notices count against the connect window's per-origin cap", async () => {
		const window = deferred()
		const fourthOpened = deferred()
		let opened = 0
		const notice = vi.fn((_p: NoticeParams) => {
			if (++opened === 4) fourthOpened.resolve()
			return window.promise
		})
		const { discover } = boot({ notice, served: () => false })

		for (let chain = 1; chain <= 5; chain++) discover(`c${chain}`, chain)
		await Promise.all([fourthOpened.promise, discoveryRun("c5")])
		await flush()

		expect(notice).toHaveBeenCalledTimes(4)
		expect(rejected()).toEqual(["c1", "c2", "c3", "c4", "c5"])
		window.resolve()
	})

	test("a profile switch during the reads refuses the discovery: no notice, and the remembered row is kept", async () => {
		const reads = deferred()
		const reading = deferred()
		const notice = vi.fn(async (_p: NoticeParams) => {})
		const { discover, rows, onActiveProfileChanged } = boot({
			remembered: true,
			notice,
			served: () => {
				reading.resolve()
				return reads.promise.then(() => false)
			},
		})

		discover("sw1", 0)
		await reading.promise
		onActiveProfileChanged.invoke({ id: "p2" })
		reads.resolve()
		await discoveryRun("sw1")
		await flush()

		expect(rejected()).toEqual(["sw1"])
		expect(notice).not.toHaveBeenCalled()
		expect(rows.has(`${ORIGIN}|0`)).toBe(true)
	})

	test("the drop re-reads the row's own chain: a network added back meanwhile keeps the row", async () => {
		let reads = 0
		const notice = vi.fn(async (_p: NoticeParams) => {})
		const { discover, rows } = boot({ remembered: true, notice, served: () => reads++ > 0 })

		discover("back1", 0)
		await discoveryRun("back1")
		await flush()

		expect(rejected()).toEqual(["back1"])
		expect(notice).toHaveBeenCalledTimes(1)
		expect(rows.has(`${ORIGIN}|0`)).toBe(true)
	})

	test("a remembered row whose network is back while the notice is open reconnects at once, spending a reconnect token", async () => {
		const admit = vi.spyOn(VerifyAdmissionGate.prototype, "admit")
		const window = deferred()
		let reads = 0
		const notice = vi.fn((_p: NoticeParams) => window.promise)
		const { discover, rows } = boot({ remembered: true, notice, served: () => reads++ > 0 })

		discover("back1", 0)
		await flush()
		expect(rows.has(`${ORIGIN}|0`)).toBe(true)
		discover("back2", 0)
		await discoveryRun("back2")
		await flush()

		expect(approved()).toEqual(["back2"])
		expect(admit.mock.calls.map(([request]) => request.consumesToken)).toEqual([true])
		window.resolve()
	})

	test("a discovery queued while locked reaches the same gate on unlock", async () => {
		const drain = vi.spyOn(DiscoveryQueue.prototype, "drain")
		let unlocked = false
		const notice = vi.fn(async (_p: NoticeParams) => {})
		const { discover, rows, onActiveProfileChanged } = boot({
			notice,
			served: () => false,
			activeProfile: async () => (unlocked ? { id: "p1" } : undefined),
		})

		discover("q1", 1816023401)
		await discoveryRun("q1")
		await flush()
		expect(rejected()).toEqual([])
		expect(notice).not.toHaveBeenCalled()

		unlocked = true
		onActiveProfileChanged.invoke({ id: "p1" })
		// The unlock's one drain of the locked queue, which runs each queued discovery to its end.
		await drain.mock.results[0]?.value
		await flush()

		expect(rejected()).toEqual(["q1"])
		expect(notice).toHaveBeenCalledTimes(1)
		expect(rows.size).toBe(0)
	})
})

describe("discovery for a chain the profile serves", () => {
	test("opens the connect window and approves on Allow, with no notice", async () => {
		const popup = vi.fn(async () => ({ approved: true }))
		const notice = vi.fn(async (_p: NoticeParams) => {})
		const { discover, rows } = boot({ popup, notice, served: (chain) => chain === 0 })

		discover("ok1", 0)
		await discoveryRun("ok1")
		await flush()

		expect(popup).toHaveBeenCalledTimes(1)
		expect(notice).not.toHaveBeenCalled()
		expect(approved()).toEqual(["ok1"])
		expect(rows.has(`${ORIGIN}|0`)).toBe(true)
	})

	test("a network removed while its connect window is open: Allow writes no row and the dApp is refused", async () => {
		const window = deferred()
		let servedNow = true
		const popup = vi.fn(() => window.promise.then(() => ({ approved: true })))
		const { discover, prompted, rows } = boot({ popup, served: () => servedNow })

		discover("gone1", 0)
		await prompted("gone1")
		await flush()
		expect(popup).toHaveBeenCalledTimes(1)
		servedNow = false
		window.resolve()
		await discoveryRun("gone1")
		await flush()

		expect(approved()).toEqual([])
		expect(rejected()).toEqual(["gone1"])
		expect(rows.size).toBe(0)
	})

	test("a profile switch during the re-read before the write refuses the Allow: no row for either profile", async () => {
		const reread = deferred()
		const rereading = deferred()
		let active = "p1"
		let reads = 0
		const { discover, rows } = boot({
			served: () => {
				if (reads++ === 0) return true
				rereading.resolve()
				return reread.promise.then(() => true)
			},
			activeProfile: async () => ({ id: active }),
		})

		discover("sw2", 0)
		await rereading.promise
		expect(reads).toBe(2)
		active = "p2"
		reread.resolve()
		await discoveryRun("sw2")
		await flush()

		expect(approved()).toEqual([])
		expect(rejected()).toEqual(["sw2"])
		expect(rows.size).toBe(0)
	})

	test("a remembered row on a served chain still reconnects without a connect window", async () => {
		const popup = vi.fn(async () => ({ approved: true }))
		const { discover } = boot({ remembered: true, popup, served: () => true })

		discover("again-1", 0)
		await discoveryRun("again-1")
		await flush()

		expect(approved()).toEqual(["again-1"])
		expect(popup).not.toHaveBeenCalled()
	})
})

describe("a quarantined chain keeps its network row but serves no dApp", () => {
	test("a remembered row neither reconnects nor is dropped; the notice opens and no session is written", async () => {
		const popup = vi.fn(async () => ({ approved: true }))
		const notice = vi.fn(async (_p: NoticeParams) => {})
		const { discover, rows } = boot({ remembered: true, popup, notice, quarantined: (chain) => chain === 0 })

		discover("q1", 0)
		await discoveryRun("q1")
		await flush()

		expect(rejected()).toEqual(["q1"])
		expect(approved()).toEqual([])
		expect(popup).not.toHaveBeenCalled()
		expect(notice).toHaveBeenCalledTimes(1)
		expect([...rows.keys()]).toEqual([`${ORIGIN}|0`])
	})

	test("a chain quarantined while its connect window is open: Allow writes no row and the dApp is refused", async () => {
		const window = deferred()
		let quarantinedNow = false
		const popup = vi.fn(() => window.promise.then(() => ({ approved: true })))
		const { discover, prompted, rows } = boot({ popup, quarantined: () => quarantinedNow })

		discover("q2", 0)
		await prompted("q2")
		await flush()
		expect(popup).toHaveBeenCalledTimes(1)
		quarantinedNow = true
		window.resolve()
		await discoveryRun("q2")
		await flush()

		expect(approved()).toEqual([])
		expect(rejected()).toEqual(["q2"])
		expect(rows.size).toBe(0)
	})

	test("the dispatcher's network read resolves no network on a quarantined chain and passes every other read through", async () => {
		const reads: Array<[string, number | undefined]> = []
		const networks = dispatcherNetworks({
			isChainQuarantined: async (_p, chainId) => chainId === 5,
			getNetworksRaw: async (profileId, chainId) => {
				reads.push([profileId, chainId])
				return [{ id: `net-${chainId}` }] as never
			},
		})
		expect(await networks.getNetworksRaw("p1", 5)).toEqual([])
		expect(await networks.getNetworksRaw("p1", 6)).toEqual([{ id: "net-6" }])
		expect(reads).toEqual([["p1", 6]])
	})
})
