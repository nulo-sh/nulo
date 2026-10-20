/**
 * Composition test (integration-test rollout): drives the REAL DappSessionService
 * lifecycle FSM in-process against FakeBrowserApi storage + a Profile stub — NO
 * Aztec sandbox / PXE / bb / browser. DappSession is PXE-free AND bb-free (pure
 * storage + profile scoping), so this is the cleanest composition target — the
 * "second harness shape" (no shared PXE port). The capability negotiation runs the
 * real dispatcher over it, with stub network, account, execution and window services. See
 * `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { beforeAll, describe, expect, test, vi } from "vitest"
import { type IDappInteractionRunner, WalletSdkDispatcher } from "@nulo/wallet-bridge"
import { withHeader } from "@nulo/wallet-bridge/testing"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { ServiceCollection } from "@/wallet/base"
import { ProfileService, type ProfileInfo } from "@/wallet/services/profile/service"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { svc } from "@/wallet/services/composition-harness"
import { DappSessionService } from "./service"
import { AccessLevel, type GrantedCapabilityRecord } from "./spec"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"

const _waitFor = async (pred: () => Promise<boolean>, ms = 1000) => {
	const deadline = Date.now() + ms
	while (!(await pred())) {
		if (Date.now() > deadline) throw new Error("waitFor timeout")
		await new Promise((r) => setTimeout(r, 5))
	}
}

async function makeHarness() {
	const api = new FakeBrowserApi()
	api.reset()
	const logger = new LoggerStore(new ConfigStore())
	const onProfileDeleted = new EventHandler<ProfileInfo>()

	// DappSessionService signs/verifies rows with a per-profile MAC
	// key from ProfileService. Provide a stable HMAC key so persisted rows
	// verify on read-back.
	const macKey = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
	const deletionState = new ProfileDeletionState()

	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			getActiveProfile: async () => ({ id: "p1" }),
			onProfileDeleted,
			deriveDappSessionMacKey: async () => macKey,
			...(await rowKeysForEveryProfile()),
			getDeletionState: () => deletionState,
			captureExecutionFence: async () => ({ profileId: "p1", epoch: deletionState.capture("p1") }),
		}),
	)
	const service = new DappSessionService(logger, api)
	collection.add(service)
	await collection.start()
	return { service, onProfileDeleted }
}

const ORIGIN = "https://dapp.xyz"

describe("DappSessionService composition — in-process, no sandbox", () => {
	test("sessions are scoped per (origin, chainId) — no cross-network trust bleed", async () => {
		const { service } = await makeHarness()
		const added = await service.addDappSession({ url: ORIGIN }, [], ["0xacc"], AccessLevel.Transactions, "0xChainA", "p1")

		// Same origin, DIFFERENT chain → no session (the trust-bleed guard).
		expect(await service.tryGetDappSessionByOriginAndChain(ORIGIN, "0xChainB")).toBeUndefined()
		// Same origin + chain → the session.
		const found = await service.tryGetDappSessionByOriginAndChain(ORIGIN, "0xChainA")
		expect(found?.id).toBe(added.id)
	})

	test("reading an expired session evicts it (read-triggered FSM)", async () => {
		const { service } = await makeHarness()
		const added = await service.addDappSession({ url: ORIGIN }, [], [], AccessLevel.Transactions, "0xA", "p1")
		// Only the clock moves past the 7-day expiry: the lock's timers and the row MAC stay real.
		vi.useFakeTimers({ toFake: ["Date"] })
		try {
			vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000)
			await expect(service.getDappSession(added.id)).rejects.toThrow("Session expired")
		} finally {
			vi.useRealTimers()
		}
		// Back on the real clock the row would be live again, so its absence is the eviction.
		expect(await service.tryGetDappSession(added.id)).toBeUndefined()
	})

	test("setCapabilityGrants persists + round-trips through real storage", async () => {
		const { service } = await makeHarness()
		const added = await service.addDappSession({ url: ORIGIN }, [], [], AccessLevel.Transactions, "0xA", "p1")
		const grants = [{ capability: { type: "data", addressBook: true }, scopes: [] }] as unknown as GrantedCapabilityRecord[]

		await service.setCapabilityGrants(added.id, grants)
		expect(await service.getCapabilityGrants(added.id)).toEqual(grants)
	})

	test("onProfileDeleted cascades — all of the deleted profile's sessions are removed", async () => {
		const { service, onProfileDeleted } = await makeHarness()
		await service.addDappSession({ url: "https://a.xyz" }, [], [], AccessLevel.Transactions, "0xA", "p1")
		await service.addDappSession({ url: "https://b.xyz" }, [], [], AccessLevel.Transactions, "0xA", "p1")
		expect(await service.getDappSessions()).toHaveLength(2)

		// Profile-delete cleanup is now the coordinator's AWAITED call.
		void onProfileDeleted
		await service.purgeForProfile("p1")
		expect(await service.getDappSessions()).toHaveLength(0)
	})
})

describe("capability negotiation through the real dispatcher", () => {
	// __VERSION__ is a build-time define; the answer to requestCapabilities reads it.
	beforeAll(() => {
		;(globalThis as { __VERSION__?: string }).__VERSION__ = "test"
	})

	const CLASS_A = `0x${"0a".repeat(32)}`
	const CLASS_B = `0x${"0b".repeat(32)}`
	const classes = (...ids: string[]) => ({ type: "contractClasses", classes: ids, canGetMetadata: true })

	test("a contract-classes widening opens the window once and persists; a request inside it opens none", async () => {
		const { service } = await makeHarness()
		const row = await service.addDappSession({ url: ORIGIN }, [], [], AccessLevel.Transactions, "0", "p1")
		await service.setCapabilityGrants(row.id, [{ capability: classes(CLASS_A), grantedAt: 1 }] as GrantedCapabilityRecord[])
		const windows: unknown[][] = []
		const interaction = {
			execute: async () => {
				throw new Error("no send in this test")
			},
			requestCapabilities: async (params: { delta: unknown[] }) => {
				windows.push(params.delta)
				return { granted: params.delta }
			},
		} as unknown as IDappInteractionRunner
		const network = { getNetworksRaw: async () => [{ id: "net-0", chainId: 0 }] }
		const account = { provisionDefaultAccount: async () => {}, getAccounts: async () => [] }
		const execution = { executeOperations: async () => [] }
		const dispatcher = new WalletSdkDispatcher(
			network as never,
			account as never,
			execution,
			interaction,
			service,
			new LoggerStore(new ConfigStore()),
		)
		const ctx = {
			chainId: 0,
			profileId: "p1",
			origin: ORIGIN,
			sessionId: "wire-session",
			fence: { profileId: "p1", epoch: 0, session: 1 },
		}
		const request = (...ids: string[]) =>
			dispatcher.dispatch("requestCapabilities", [withHeader({ capabilities: [classes(...ids)] })], ctx)

		await request(CLASS_A, CLASS_B)
		expect(windows).toEqual([[classes(CLASS_A, CLASS_B)]])
		expect((await service.getCapabilityGrants(row.id)).map((g) => g.capability)).toEqual([classes(CLASS_A, CLASS_B)])

		await request(CLASS_B)
		expect(windows).toHaveLength(1)
	})
})
