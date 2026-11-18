/**
 * A locked discovery's unlock window, through the SDK handler's callbacks: the worker opens it, moves
 * its cut-off, hands it to the site's connect window after an unlock, closes it after a remembered
 * site's drain, and refits it when a dApp tab closes. A real interaction service and window manager
 * run over a fake browser; the handler keeps the SDK's pending rows, which a tab's close drops.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"
import { FakeBrowserApi, MockClock } from "@nulo/wallet-core/testing"
import { DISCOVERY_STALE_MS } from "@nulo/wallet-bridge"
import { deferred } from "@nulo/wallet-core/utils"

type Row = { requestId: string; origin: string; status: string; timestamp: number; tabId: number; chainInfo: unknown }
let captured: { onPendingDiscovery: (d: unknown) => void } | undefined
const rows = new Map<string, Row>()
const handlerCalls: string[] = []
const tabRemoved: Array<(tabId: number) => void> = []

vi.mock("@aztec-labs/wallet-sdk/extension/handlers", () => ({
	BackgroundConnectionHandler: class {
		constructor(_meta: unknown, _transport: unknown, callbacks: typeof captured) {
			captured = callbacks
		}
		handleEncryptedMessage() {
			return Promise.resolve()
		}
		getActiveSessions() {
			return []
		}
		getPendingDiscovery(id: string) {
			return rows.get(id)
		}
		getPendingDiscoveries() {
			return [...rows.values()].filter((row) => row.status === "pending")
		}
		approveDiscovery(id: string) {
			const row = rows.get(id)
			if (row?.status !== "pending") return false
			row.status = "approved"
			handlerCalls.push(`approve:${id}`)
			return true
		}
		rejectDiscovery(id: string) {
			if (rows.get(id)?.status !== "pending") return false
			rows.delete(id)
			handlerCalls.push(`reject:${id}`)
			return true
		}
		terminateSession() {}
		/** The SDK drops the tab's discoveries and tells no one. */
		terminateForTab(tabId: number) {
			for (const [id, row] of rows) if (row.tabId === tabId) rows.delete(id)
		}
		initialize() {}
	},
}))
vi.mock("./content-message-relay", () => ({ attachContentListener: () => {} }))
vi.mock("@nulo/wallet-sdk-schema-patch/register", () => ({}))
vi.mock("./discovery-flow", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./discovery-flow")>()
	return { ...actual, handleDiscovery: vi.fn(actual.handleDiscovery) }
})

import { DappInteractionService } from "@/wallet/services/dapp-interaction/service"
import { WindowManager } from "@/wallet/services/window-manager/window-manager"
import { initWalletSdkHandler } from "./background"
import { handleDiscovery } from "./discovery-flow"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN as ORIGIN, fakeSdkServices } from "./test-services"

const noopLogger = { log: () => {} } as never
const UNLOCK_URL = `src/popup/index.html#/windows/unlock?origin=${encodeURIComponent(ORIGIN)}`
/** The chain a remembered row is on (`fakeSdkServices`). */
const REMEMBERED_CHAIN = { chainId: "1", version: "1" }
const FIRST_WINDOW = 1000

const rejected = () => handlerCalls.filter((c) => c.startsWith("reject:")).map((c) => c.slice(7))
const approved = () => handlerCalls.filter((c) => c.startsWith("approve:")).map((c) => c.slice(8))
/** The run a discovery's arrival started: its locked branch, not a later drain's. */
const arrival = (requestId: string) => {
	const { calls, results } = vi.mocked(handleDiscovery).mock
	return results[calls.findIndex(([d]) => d.requestId === requestId)].value as Promise<void>
}
const flush = async () => {
	for (let i = 0; i < 50; i++) await Promise.resolve()
}

function boot(opts: { profiles?: () => Promise<Array<{ id: string }>>; remembered?: boolean } = {}) {
	const api = new FakeBrowserApi()
	api.reset()
	const windowManager = new WindowManager(api.windows, new MockClock(), noopLogger)
	const opens = vi.spyOn(windowManager, "openAndAwait")
	const retimes = vi.spyOn(windowManager, "retime")
	let active: { id: string } | undefined
	const { services, onActiveProfileChanged } = fakeSdkServices({
		activeProfile: async () => active,
		profiles: opts.profiles ?? (async () => [{ id: "p1" }]),
		dappInteraction: new DappInteractionService(noopLogger, windowManager),
		remembered: opts.remembered,
	})
	initWalletSdkHandler(services, noopLogger, fakeSdkPorts())
	const fake = api.windows as unknown as {
		creates: Array<{ url: string }>
		navigates: Array<{ windowId: number; url: string }>
		closeByUser(id: number): void
	}
	const removed: number[] = []
	api.windows.onRemoved((id) => removed.push(id))
	const discover = (requestId: string, over: Partial<Row> & { appName?: string } = {}) => {
		const row = {
			requestId,
			origin: ORIGIN,
			appId: "app",
			appName: "App",
			chainInfo: REMEMBERED_CHAIN,
			timestamp: Date.now(),
			tabId: 7,
			status: "pending",
			...over,
		}
		rows.set(requestId, row)
		captured?.onPendingDiscovery(row)
	}
	const setActive = (profile: { id: string } | undefined) => {
		active = profile
		onActiveProfileChanged.invoke(profile)
	}
	const kinds = () => opens.mock.calls.map(([o]) => o.kind)
	return {
		fake,
		removed,
		opens,
		retimes,
		kinds,
		discover,
		unlock: () => setActive({ id: "p1" }),
		lock: () => setActive(undefined),
		closeTab: (tabId: number) => {
			for (const l of tabRemoved) l(tabId)
		},
	}
}

beforeEach(() => {
	rows.clear()
	handlerCalls.length = 0
	tabRemoved.length = 0
	captured = undefined
	vi.mocked(handleDiscovery).mockClear()
	const base = (globalThis as unknown as { chrome: { runtime: object } }).chrome
	vi.stubGlobal("chrome", {
		...base,
		runtime: { ...base.runtime, getURL: (p: string) => p },
		tabs: {
			sendMessage: () => {},
			onRemoved: { addListener: (fn: (tabId: number) => void) => tabRemoved.push(fn) },
			onUpdated: { addListener: () => {} },
		},
		action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
	})
	// biome-ignore lint/suspicious/noExplicitAny: vite define-injected global
	;(globalThis as any).__VERSION__ = "test"
})

describe("a discovery while the wallet is locked", () => {
	test("opens one window on the origin's route until the request's cut-off, never with the app's name in it", async () => {
		const h = boot()
		h.discover("r1", { appName: "https://evil.example", timestamp: Date.now() - 10_000 })
		await arrival("r1")

		expect(h.kinds()).toEqual(["unlock"])
		const [opened] = h.opens.mock.calls[0]
		expect(opened.url).toBe(UNLOCK_URL)
		expect(opened.timeoutMs).toBeGreaterThan(DISCOVERY_STALE_MS - 11_000)
		expect(opened.timeoutMs).toBeLessThanOrEqual(DISCOVERY_STALE_MS - 10_000)
		expect(rejected()).toEqual([])
	})

	test("a second discovery from the site opens no second window and moves the cut-off to its own", async () => {
		const h = boot()
		h.discover("r1", { timestamp: Date.now() - 10_000 })
		await arrival("r1")
		h.discover("r2", { chainInfo: { chainId: "2", version: "1" } })
		await arrival("r2")

		expect(h.kinds()).toEqual(["unlock"])
		expect(h.fake.creates).toHaveLength(1)
		expect(h.retimes.mock.calls).toHaveLength(1)
		expect(h.retimes.mock.calls[0][1]).toBeGreaterThan(DISCOVERY_STALE_MS - 1_000)
	})

	test("with no profile to unlock, no window opens and the request stays queued", async () => {
		const h = boot({ profiles: async () => [] })
		h.discover("r1")
		await arrival("r1")

		expect(h.opens).not.toHaveBeenCalled()
		expect(rejected()).toEqual([])
	})

	test("a profile list answered only after an unlock opens no unlock window", async () => {
		const held = deferred<Array<{ id: string }>>()
		const asked = deferred<void>()
		const h = boot({
			profiles: () => {
				asked.resolve()
				return held.promise
			},
		})
		h.discover("r1")
		await asked.promise
		h.unlock()
		held.resolve([{ id: "p1" }])
		await arrival("r1")
		await flush()

		expect(h.kinds()).toEqual(["discover"])
	})

	test("past the connect caps no window opens and the request stays queued; another site's opens", async () => {
		const h = boot()
		h.unlock()
		for (const chainId of ["1", "2", "3", "4"]) h.discover(`c${chainId}`, { chainInfo: { chainId, version: "1" } })
		await expect.poll(() => h.kinds().length).toBe(4)
		h.lock()

		h.discover("r5", { chainInfo: { chainId: "5", version: "1" } })
		await arrival("r5")
		expect(h.kinds()).not.toContain("unlock")
		expect(rejected()).toEqual([])

		h.discover("other", { origin: "https://other.example" })
		await arrival("other")
		expect(h.kinds().filter((k) => k === "unlock")).toHaveLength(1)
	})

	test("a person's close refuses nothing: an unlock still connects, in a window of its own", async () => {
		const h = boot()
		h.discover("r1")
		await arrival("r1")
		h.fake.closeByUser(FIRST_WINDOW)
		await flush()
		expect(rejected()).toEqual([])

		h.unlock()
		await expect.poll(() => h.kinds()).toEqual(["unlock", "discover"])
		expect(h.fake.navigates).toEqual([])
		expect(h.fake.creates).toHaveLength(2)
	})
})

describe("after the unlock", () => {
	test("the first site's connect window loads in its unlock window; a new site's discovery is refused while 31 others wait", async () => {
		const h = boot()
		for (let i = 0; i < 32; i++) h.discover(`r${i}`, { origin: `https://s${i}.example` })
		await Promise.all(Array.from({ length: 32 }, (_, i) => arrival(`r${i}`)))
		expect(h.kinds().filter((k) => k === "unlock")).toHaveLength(32)

		h.unlock()
		await expect.poll(() => h.fake.navigates.length).toBe(1)
		expect(h.fake.navigates[0].windowId).toBe(FIRST_WINDOW)
		expect(h.fake.navigates[0].url).toContain("#/windows/discover?requestId=")
		expect(h.fake.creates).toHaveLength(32)

		h.discover("late", { origin: "https://s32.example" })
		await arrival("late")
		expect(rejected()).toEqual(["late"])
	})

	test("a remembered site is approved and its unlock window closes", async () => {
		const h = boot({ remembered: true })
		h.discover("r1")
		await arrival("r1")

		h.unlock()
		await expect.poll(() => h.removed).toEqual([FIRST_WINDOW])
		expect(approved()).toEqual(["r1"])
		expect(h.fake.navigates).toEqual([])
	})

	test("a drain that ends after a re-lock leaves the window the site's new discovery opened", async () => {
		const h = boot()
		h.discover("r1")
		await arrival("r1")
		h.unlock()
		await expect.poll(() => h.fake.navigates.length).toBe(1)

		h.lock()
		h.discover("r2", { chainInfo: { chainId: "2", version: "1" } })
		await arrival("r2")
		expect(h.kinds()).toEqual(["unlock", "discover", "unlock"])

		h.fake.closeByUser(FIRST_WINDOW)
		await expect.poll(() => rejected()).toEqual(["r1"])
		await flush()
		expect(h.removed).toEqual([FIRST_WINDOW])
	})
})

describe("a dApp tab's close", () => {
	test("keeps the site's window while another tab's request lives, and closes it with the last", async () => {
		const h = boot()
		h.discover("r1", { tabId: 7 })
		h.discover("r2", { tabId: 8, chainInfo: { chainId: "2", version: "1" } })
		await Promise.all([arrival("r1"), arrival("r2")])

		h.closeTab(8)
		await flush()
		expect(h.removed).toEqual([])

		h.closeTab(7)
		await flush()
		expect(h.removed).toEqual([FIRST_WINDOW])
		expect(rejected()).toEqual([])
	})
})
