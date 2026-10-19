/**
 * `handleDiscovery` refuses an origin that is neither `https:` nor plain `http:` on loopback
 * synchronously, inside the SDK's callback and before the reset wait that is its first await: no
 * connect window, no place in the locked queue, no reconnect from a session stored under that
 * origin, and no Terms, network or notice read. A secure origin still reaches each of them.
 */
import { DiscoveryQueue } from "@nulo/wallet-bridge"
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

import { initWalletSdkHandler } from "./background"
import { handleDiscovery } from "./discovery-flow"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN, fakeSdkServices } from "./test-services"

const PLAIN_HTTP_ORIGIN = "http://dapp.example"

/** Every read a discovery can reach, each a spy; `activeProfile` answering undefined is locked. */
function boot(activeProfile?: () => Promise<{ id: string } | undefined>) {
	const reads = {
		resetRun: vi.fn(async () => {}),
		legal: vi.fn(async () => {}),
		served: vi.fn(() => true),
		notice: vi.fn(async () => {}),
		popup: vi.fn(async () => ({ approved: true })),
	}
	const fake = fakeSdkServices({ ...reads, activeProfile })
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
	return { discover, reads, rows: fake.rows, onActiveProfileChanged: fake.onActiveProfileChanged }
}

/** The run of `requestId`'s latest discovery: it settles once that discovery is refused, queued while
 *  locked, auto-approved or through its connect window. */
const discoveryRun = (requestId: string) => {
	const { calls, results } = vi.mocked(handleDiscovery).mock
	return results[calls.findLastIndex(([discovery]) => discovery.requestId === requestId)].value as Promise<void>
}
const approved = () => handlerCalls.filter((c) => c.startsWith("approve:")).map((c) => c.slice(8))
const rejected = () => handlerCalls.filter((c) => c.startsWith("reject:")).map((c) => c.slice(7))

beforeEach(() => {
	handlerCalls.length = 0
	pending.clear()
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
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe("discovery admits secure origins only", () => {
	test("a plain-http origin is refused inside the callback and reads nothing", async () => {
		const { discover, reads, rows } = boot()

		discover("d1", PLAIN_HTTP_ORIGIN)
		expect(rejected()).toEqual(["d1"])
		await discoveryRun("d1")

		for (const read of Object.values(reads)) expect(read).not.toHaveBeenCalled()
		expect(approved()).toEqual([])
		expect(rows.size).toBe(0)
	})

	test("an https origin passes the reset wait, the Terms and network reads, and the window (control)", async () => {
		const { discover, reads } = boot()

		discover("d1", FAKE_DAPP_ORIGIN)
		expect(rejected()).toEqual([])
		await discoveryRun("d1")

		expect(reads.resetRun).toHaveBeenCalledTimes(1)
		expect(reads.legal).toHaveBeenCalledTimes(1)
		expect(reads.served).toHaveBeenCalled()
		expect(reads.popup).toHaveBeenCalledTimes(1)
		expect(approved()).toEqual(["d1"])
	})

	test.each([
		["a plain-http origin is refused while locked: never queued, nothing opens on unlock", PLAIN_HTTP_ORIGIN, false],
		["an https origin is queued while locked and opens the window on unlock (control)", FAKE_DAPP_ORIGIN, true],
	])("%s", async (_label, origin, admitted) => {
		const enqueue = vi.spyOn(DiscoveryQueue.prototype, "enqueue")
		const drain = vi.spyOn(DiscoveryQueue.prototype, "drain")
		let unlocked = false
		const { discover, reads, onActiveProfileChanged } = boot(async () => (unlocked ? { id: "p1" } : undefined))

		discover("d1", origin)
		expect(rejected()).toEqual(admitted ? [] : ["d1"])
		await discoveryRun("d1")
		expect(enqueue).toHaveBeenCalledTimes(admitted ? 1 : 0)

		unlocked = true
		onActiveProfileChanged.invoke({ id: "p1" })
		// The unlock's one drain of the locked queue, which runs each queued discovery to its end.
		await drain.mock.results[0]?.value
		expect(reads.popup).toHaveBeenCalledTimes(admitted ? 1 : 0)
		expect(approved()).toEqual(admitted ? ["d1"] : [])
	})

	test.each([
		["a session stored under a plain-http origin does not reconnect it", PLAIN_HTTP_ORIGIN, false],
		["a session stored under an https origin reconnects it with no window (control)", FAKE_DAPP_ORIGIN, true],
	])("%s", async (_label, origin, admitted) => {
		const { discover, reads, rows } = boot()
		rows.set(`${origin}|0`, { id: "row-1", profileId: "p1", chainId: "0" })

		discover("d1", origin)
		expect(rejected()).toEqual(admitted ? [] : ["d1"])
		await discoveryRun("d1")

		expect(approved()).toEqual(admitted ? ["d1"] : [])
		expect(reads.popup).not.toHaveBeenCalled()
	})
})
