/**
 * `handleDiscovery` refuses an origin that is neither `https:` nor plain `http:` on loopback before
 * anything else reads it: no connect window, no place in the locked queue, no reconnect from a
 * session stored under that origin. A secure origin still reaches the window.
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

import { initWalletSdkHandler } from "./background"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN, fakeSdkServices } from "./test-services"

const PLAIN_HTTP_ORIGIN = "http://dapp.example"

function boot(opts: Parameters<typeof fakeSdkServices>[0] = {}) {
	const fake = fakeSdkServices(opts)
	initWalletSdkHandler(fake.services, { log: () => {} } as never, fakeSdkPorts())
	const discover = (requestId: string, origin: string) => {
		const discovery = {
			requestId,
			origin,
			appId: "app",
			appName: "App",
			chainInfo: { chainId: "0", version: "0" },
			timestamp: Date.now(),
			tabId: 7,
			status: "pending",
		}
		pending.set(requestId, discovery)
		captured?.onPendingDiscovery(discovery)
	}
	return { discover, rows: fake.rows, onActiveProfileChanged: fake.onActiveProfileChanged }
}

const flush = async () => {
	for (let i = 0; i < 30; i++) await Promise.resolve()
}
const approved = () => handlerCalls.filter((c) => c.startsWith("approve:")).map((c) => c.slice(8))
const rejected = () => handlerCalls.filter((c) => c.startsWith("reject:")).map((c) => c.slice(7))

beforeEach(() => {
	handlerCalls.length = 0
	pending.clear()
	captured = undefined
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

describe("discovery admits secure origins only", () => {
	test("a plain-http origin is refused with no connect window", async () => {
		const popup = vi.fn(async () => ({ approved: true }))
		const { discover, rows } = boot({ popup })

		discover("d1", PLAIN_HTTP_ORIGIN)
		await flush()

		expect(rejected()).toEqual(["d1"])
		expect(popup).not.toHaveBeenCalled()
		expect(rows.size).toBe(0)
	})

	test.each([
		["a plain-http origin is refused while locked and opens nothing on unlock", PLAIN_HTTP_ORIGIN, 0],
		["an https origin queued while locked opens the connect window on unlock", FAKE_DAPP_ORIGIN, 1],
	])("%s", async (_label, origin, windows) => {
		let unlocked = false
		const popup = vi.fn(async () => ({ approved: true }))
		const { discover, onActiveProfileChanged } = boot({ popup, activeProfile: async () => (unlocked ? { id: "p1" } : undefined) })

		discover("d1", origin)
		await flush()
		unlocked = true
		onActiveProfileChanged.invoke({ id: "p1" })
		await flush()

		expect(popup).toHaveBeenCalledTimes(windows)
		expect(approved()).toEqual(windows ? ["d1"] : [])
	})

	test("a session stored under a plain-http origin does not reconnect it", async () => {
		const popup = vi.fn(async () => ({ approved: true }))
		const { discover, rows } = boot({ popup })
		rows.set(`${PLAIN_HTTP_ORIGIN}|0`, { id: "row-http", profileId: "p1", chainId: "0" })

		discover("d1", PLAIN_HTTP_ORIGIN)
		await flush()

		expect(rejected()).toEqual(["d1"])
		expect(approved()).toEqual([])
		expect(popup).not.toHaveBeenCalled()
		expect(rows.has(`${PLAIN_HTTP_ORIGIN}|0`)).toBe(true)
	})

	test("an https origin opens the connect window and is approved on Allow", async () => {
		const popup = vi.fn(async () => ({ approved: true }))
		const { discover } = boot({ popup })

		discover("d1", FAKE_DAPP_ORIGIN)
		await flush()

		expect(popup).toHaveBeenCalledTimes(1)
		expect(approved()).toEqual(["d1"])
		expect(rejected()).toEqual([])
	})
})
