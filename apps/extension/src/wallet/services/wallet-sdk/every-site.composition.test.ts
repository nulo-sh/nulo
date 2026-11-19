/**
 * Composition test: the every-site switch through the booted discovery path over the REAL
 * DappSessionService and its sealed policy row on FakeBrowserApi storage. A site the switch let
 * through and the emoji check then refused gets the connect window on its next connection, which
 * proves the refusal is recorded before a discovery can read the switch. The SDK handler and the
 * profile are the faked boundaries. No PXE, no bb, no browser. See
 * `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"

type Callbacks = { onPendingDiscovery: (d: unknown) => void }
let captured: Callbacks | undefined
const handlerCalls: string[] = []

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

import { ServiceCollection } from "@/wallet/base"
import { svc } from "@/wallet/services/composition-harness"
import { DappSessionService } from "@/wallet/services/dapp-session/service"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { ProfileService } from "@/wallet/services/profile/service"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"
import { initWalletSdkHandler } from "./background"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN, fakeSdkServices } from "./test-services"

const noopLogger = { log: () => {} } as never
const POLICY_KEY = "nulo:core:discoveryPolicy@p1"

async function harness() {
	const api = new FakeBrowserApi()
	api.reset()
	const macKey = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
	const deletionState = new ProfileDeletionState()
	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			getActiveProfile: async () => ({ id: "p1" }),
			onProfileDeleted: new EventHandler(),
			deriveDappSessionMacKey: async () => macKey,
			...(await rowKeysForEveryProfile()),
			getDeletionState: () => deletionState,
			captureExecutionFence: async () => ({ profileId: "p1", epoch: deletionState.capture("p1") }),
		}),
	)
	const sessions = new DappSessionService(noopLogger, api)
	collection.add(sessions)
	await collection.start()
	const popup = vi.fn(async () => ({ approved: true }))
	const fake = fakeSdkServices({ activeProfile: async () => ({ id: "p1" }), dappSession: sessions, popup })
	initWalletSdkHandler(fake.services, noopLogger, fakeSdkPorts())
	return { api, sessions, popup }
}

function discover(requestId: string) {
	captured?.onPendingDiscovery({
		requestId,
		origin: FAKE_DAPP_ORIGIN,
		appId: "app",
		appName: "App",
		chainInfo: { chainId: "1", version: "1" },
		timestamp: Date.now(),
		tabId: 7,
	})
}

beforeEach(() => {
	handlerCalls.length = 0
	captured = undefined
	// biome-ignore lint/suspicious/noExplicitAny: chrome stub
	;(globalThis as any).chrome = {
		runtime: { getURL: (p: string) => p, onConnect: { addListener: () => {}, removeListener: () => {} } },
		tabs: { sendMessage: () => {} },
		action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
	}
	// biome-ignore lint/suspicious/noExplicitAny: vite define-injected global
	;(globalThis as any).__VERSION__ = "test"
})

describe("the every-site switch over the real session service", () => {
	test("a site refused at the emoji check gets the connect window on its next connection; another site does not", async () => {
		const { sessions, popup } = await harness()
		await sessions.setEverySite("p1", true)
		discover("r1")
		await vi.waitFor(() => expect(handlerCalls).toEqual(["approve:r1"]))
		expect(popup).not.toHaveBeenCalled()

		expect(await sessions.refuseVerification({ origin: FAKE_DAPP_ORIGIN, chainId: "0", profileId: "p1" })).toBe("revoked")
		discover("r2")
		await vi.waitFor(() => expect(handlerCalls).toEqual(["approve:r1", "approve:r2"]))
		expect(popup).toHaveBeenCalledTimes(1)
		expect(await sessions.allowsNewSite("p1", "https://other.example")).toBe(true)
	})

	test("a policy read that fails asks the connect window", async () => {
		const { api, sessions, popup } = await harness()
		await sessions.setEverySite("p1", true)
		const get = api.storage.local.get.bind(api.storage.local)
		api.storage.local.get = async (keys) => {
			if (keys === POLICY_KEY) throw new Error("storage gone")
			return get(keys)
		}
		discover("r1")
		await vi.waitFor(() => expect(handlerCalls).toEqual(["approve:r1"]))
		expect(popup).toHaveBeenCalledTimes(1)
	})
})
