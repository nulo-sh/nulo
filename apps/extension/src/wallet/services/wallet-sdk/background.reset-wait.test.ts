/**
 * While a network reset runs, a new dApp request and a new discovery each wait for it before any
 * read, at most the run lock's cap, and are then admitted under the usual guards. The cap is the
 * reset service's own `waitForRunEnd`, driven here with fake timers.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type Callbacks = { onPendingDiscovery: (d: unknown) => void }
let captured: Callbacks | undefined
const handlerCalls: string[] = []
const pending = new Map<string, Record<string, unknown>>()

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

import { DISCOVERY_STALE_MS } from "@nulo/wallet-bridge"
import { deferred } from "@nulo/wallet-core/utils"
import { NetworkResetService } from "@/wallet/services/network-reset/service"
import { RESET_INGRESS_WAIT_MS, type ResetRunGate } from "@/wallet/services/network-reset/spec"
import { handleWalletMessage, initWalletSdkHandler } from "./background"
import { handleDiscovery } from "./discovery-flow"
import { discoveryRun } from "./discovery-run.harness"
import { bindLiveSession } from "./live-session"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN as ORIGIN, fakeSdkServices } from "./test-services"

const SESSION = { sessionId: "s1", origin: ORIGIN, chainInfo: { chainId: "1", version: "1" } } as never

/** The reset service's real wait over a run that ends when `end` is called. */
function runningReset(): { gate: ResetRunGate; end: () => void } {
	const ended = deferred()
	const gate = { flight: { ended: ended.promise }, waitForRunEnd: NetworkResetService.prototype.waitForRunEnd }
	return { gate: gate as unknown as ResetRunGate, end: () => ended.resolve() }
}

/** Turns before a "not yet" or exact-list read: the reset wait settles nothing before the run ends, and
 *  a discovery's run settles with its decision. */
const flush = async () => {
	for (let i = 0; i < 30; i++) await Promise.resolve()
}

beforeEach(() => {
	handlerCalls.length = 0
	pending.clear()
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

describe("a running reset holds dApp requests", () => {
	function message(gate: ResetRunGate) {
		const dispatch = vi.fn(async () => "ok")
		const assertCurrent = vi.fn(async () => {})
		const sendResponse = vi.fn(async () => {})
		const done = handleWalletMessage(
			{
				session: SESSION,
				message: { messageId: "m1", type: "getAccounts", args: [] } as never,
				live: bindLiveSession({ sendResponse, terminateSession: vi.fn(), getSession: () => SESSION }, SESSION),
			},
			{
				dispatcher: { dispatch } as never,
				profileService: { captureExecutionFence: async () => ({ profileId: "p1" }) } as never,
				operationJournal: {} as never,
				sessionProfiles: new Map([["s1", "p1"]]),
				switchEpoch: { current: () => 0 } as never,
				logger: { log: vi.fn() } as never,
				legal: { assertCurrent },
				resetRun: gate,
			},
		)
		return { done, dispatch, assertCurrent, sendResponse }
	}

	test("a request waits, Terms check included, until the run ends, then is served", async () => {
		const run = runningReset()
		const m = message(run.gate)
		await flush()
		expect(m.assertCurrent).not.toHaveBeenCalled()
		expect(m.dispatch).not.toHaveBeenCalled()
		run.end()
		await m.done
		expect(m.assertCurrent).toHaveBeenCalledTimes(1)
		expect(m.sendResponse).toHaveBeenCalledWith("s1", expect.objectContaining({ result: "ok" }))
	})

	test("a run that outlasts the cap admits the request at the cap", async () => {
		vi.useFakeTimers()
		const m = message(runningReset().gate)
		await vi.advanceTimersByTimeAsync(RESET_INGRESS_WAIT_MS - 1)
		expect(m.dispatch).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		await m.done
		expect(m.dispatch).toHaveBeenCalledTimes(1)
	})
})

describe("a running reset holds discoveries", () => {
	function boot(gate: ResetRunGate) {
		const fake = fakeSdkServices({ remembered: true, resetRun: () => gate.waitForRunEnd() })
		initWalletSdkHandler(fake.services, { log: () => {} } as never, fakeSdkPorts())
		const discovery = {
			requestId: "d1",
			origin: ORIGIN,
			appId: "app",
			appName: "App",
			chainInfo: { chainId: "0", version: "0" },
			timestamp: Date.now(),
			tabId: 7,
			status: "pending",
		}
		pending.set("d1", discovery)
		captured?.onPendingDiscovery(discovery)
	}

	test("a returning dApp's discovery waits until the run ends, then reconnects", async () => {
		const run = runningReset()
		boot(run.gate)
		await flush()
		expect(handlerCalls).toEqual([])
		run.end()
		await discoveryRun("d1")
		await flush()
		expect(handlerCalls).toEqual(["approve:d1"])
	})

	test("a run that outlasts the cap releases the discovery to the usual guards, which refuse it as expired", async () => {
		vi.useFakeTimers()
		boot(runningReset().gate)
		await vi.advanceTimersByTimeAsync(RESET_INGRESS_WAIT_MS - 1)
		expect(handlerCalls).toEqual([])
		await vi.advanceTimersByTimeAsync(1)
		await discoveryRun("d1")
		await flush()
		// The SDK gives a discovery 60 s and the wallet answers it within 55 s, so one held for the
		// whole cap is already past its deadline.
		expect(RESET_INGRESS_WAIT_MS).toBeGreaterThan(DISCOVERY_STALE_MS)
		expect(handlerCalls).toEqual(["reject:d1"])
	})
})
