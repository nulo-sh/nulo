/**
 * The emoji check's refusal reaches the live channels through the booted wiring: the background
 * subscribes to the refusal event and matches channels by the stamp establishment wrote, so a
 * refusal under another profile leaves this profile's channel to the same app alone.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"

type Callbacks = { onSessionEstablished: (s: unknown) => Promise<void> | void; onSessionTerminated: (id: string) => void }
let captured: Callbacks | undefined
const live = new Set<string>()
const terminated: string[] = []
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
			return [...live].map((sessionId) => ({ sessionId, origin: FAKE_DAPP_ORIGIN, chainInfo: CHAIN_INFO }))
		}
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
		const fake = fakeSdkServices({ remembered: { trusted: true } })
		initWalletSdkHandler(fake.services, { log: () => {} } as never, fakeSdkPorts())
		live.add("s1")
		await captured?.onSessionEstablished({ origin: FAKE_DAPP_ORIGIN, sessionId: "s1", verificationHash: "HASH", chainInfo: CHAIN_INFO })

		fake.onVerificationRefused.invoke({ origin: FAKE_DAPP_ORIGIN, chainId: "0", profileId: "p2" })
		expect(terminated).toEqual([])

		fake.onVerificationRefused.invoke({ origin: FAKE_DAPP_ORIGIN, chainId: "0", profileId: "p1" })
		expect(terminated).toEqual(["s1"])
	})
})
