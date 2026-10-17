/**
 * The emoji check's refusal reaches the live channels through the booted wiring: the background
 * subscribes to the refusal event and matches channels by the stamp establishment wrote, so a
 * refusal under another profile leaves this profile's channel to the same app alone.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"

type Callbacks = {
	onPendingDiscovery: (d: unknown) => void
	onSessionEstablished: (s: unknown) => Promise<void> | void
	onSessionTerminated: (id: string) => void
}
let captured: Callbacks | undefined
/** The SDK's active sessions by id, each the object it handed to establishment. */
const live = new Map<string, { sessionId: string; origin: string; chainInfo: { chainId: string; version: string } }>()
const terminated: string[] = []
const approved: string[] = []
const CHAIN_INFO = { chainId: "1", version: "1" }

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
			approved.push(id)
			return true
		}
		rejectDiscovery() {}
		terminateSession(id: string) {
			terminated.push(id)
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

import { initWalletSdkHandler } from "./background"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN, fakeSdkServices } from "./test-services"

beforeEach(() => {
	live.clear()
	terminated.length = 0
	approved.length = 0
	// biome-ignore lint/suspicious/noExplicitAny: chrome stub
	;(globalThis as any).chrome = {
		runtime: { getURL: (p: string) => p },
		tabs: { sendMessage: () => {} },
		action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
	}
	// biome-ignore lint/suspicious/noExplicitAny: vite define-injected global
	;(globalThis as any).__VERSION__ = "test"
})

describe("the refusal event through the booted wiring", () => {
	test("another profile's refusal keeps the channel; its own profile's refusal ends it", async () => {
		const fake = fakeSdkServices({ remembered: true })
		initWalletSdkHandler(fake.services, { log: () => {} } as never, fakeSdkPorts())
		// The reconnect's discovery reserves the slot its check opens against.
		captured?.onPendingDiscovery({
			requestId: "s1",
			origin: FAKE_DAPP_ORIGIN,
			appId: "app",
			appName: "App",
			chainInfo: CHAIN_INFO,
			timestamp: Date.now(),
			tabId: 7,
		})
		await vi.waitFor(() => expect(approved).toEqual(["s1"]))
		const session = { origin: FAKE_DAPP_ORIGIN, sessionId: "s1", verificationHash: "HASH", chainInfo: CHAIN_INFO }
		live.set("s1", session)
		await captured?.onSessionEstablished(session)

		fake.onVerificationRefused.invoke({ origin: FAKE_DAPP_ORIGIN, chainId: "0", profileId: "p2" })
		expect(terminated).toEqual([])

		fake.onVerificationRefused.invoke({ origin: FAKE_DAPP_ORIGIN, chainId: "0", profileId: "p1" })
		expect(terminated).toEqual(["s1"])
	})
})
