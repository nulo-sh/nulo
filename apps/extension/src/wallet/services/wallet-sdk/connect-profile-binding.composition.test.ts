/**
 * Composition test: an Allow given under one profile, through the booted discovery path, writes
 * its session row under that profile or not at all. The REAL DappSessionService writes over
 * FakeBrowserApi storage; the SDK handler and the profile are the faked boundaries. The profile's
 * two answers model a switch queued between the Allow's profile read and the write's fence capture.
 * No PXE, no bb, no browser. See `apps/extension/tests/COMPOSITION-TESTS.md`.
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
import { recordWrites } from "@/wallet/services/storage-write-log"
import { initWalletSdkHandler } from "./background"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN, fakeSdkServices } from "./test-services"

const ROW_ROOT = "nulo:core:dappSessions@"
/** The connect window the Allow hands over to show the emoji check. */
const CONNECT_WINDOW = 9
const noopLogger = { log: () => {} } as never

/** The Allow is given under p1; `fenceProfile` is the profile the write's fence capture finds. */
async function harness(fenceProfile: string) {
	const api = new FakeBrowserApi()
	api.reset()
	const macKey = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
	const deletionState = new ProfileDeletionState()
	const getActiveProfile = async () => ({ id: "p1" })
	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			getActiveProfile,
			onProfileDeleted: new EventHandler(),
			deriveDappSessionMacKey: async () => macKey,
			getDeletionState: () => deletionState,
			captureExecutionFence: async () => ({ profileId: fenceProfile, epoch: deletionState.capture(fenceProfile) }),
		}),
	)
	const sessions = new DappSessionService(noopLogger, api)
	collection.add(sessions)
	await collection.start()
	const added: unknown[] = []
	sessions.onDappSessionAdded.add((row) => added.push(row))
	const writes = recordWrites(api.storage.local, ROW_ROOT)

	const fake = fakeSdkServices({
		activeProfile: getActiveProfile,
		dappSession: sessions,
		popup: async () => ({ approved: true, windowId: CONNECT_WINDOW }),
	})
	const closedWindows: number[] = []
	initWalletSdkHandler(
		fake.services,
		noopLogger,
		fakeSdkPorts({
			remove: async (windowId) => {
				closedWindows.push(windowId)
			},
		}),
	)
	const rowProfiles = async () =>
		Object.entries((await api.storage.local.get(null)) as Record<string, string>)
			.filter(([key]) => key.startsWith(ROW_ROOT))
			.map(([, row]) => JSON.parse(row).profileId)
	return { added, writes, rowProfiles, closedWindows }
}

function allow(requestId: string) {
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

describe("an Allow's session row and the profile it was given under", () => {
	test("a switch landing before the write's fence: no row under either profile, the discovery rejected", async () => {
		const h = await harness("p2")
		allow("r1")

		await vi.waitFor(() => expect(handlerCalls).toEqual(["reject:r1"]))
		expect(h.writes.log).toEqual([])
		expect(await h.rowProfiles()).toEqual([])
		expect(h.added).toEqual([])
		expect(h.closedWindows).toEqual([CONNECT_WINDOW])
	})

	test("no switch: one row under the Allow's profile, the discovery approved", async () => {
		const h = await harness("p1")
		allow("r1")

		await vi.waitFor(() => expect(handlerCalls).toEqual(["approve:r1"]))
		expect(await h.rowProfiles()).toEqual(["p1"])
		expect(h.added).toHaveLength(1)
		expect(h.closedWindows).toEqual([])
	})
})
