/**
 * Composition test: the REAL DappSessionService purges rows over FakeBrowserApi storage, and its
 * delete events reach the REAL teardown wiring; the SDK handler is the only boundary faked. No PXE,
 * no bb, no browser. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { describe, expect, test } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { svc } from "@/wallet/services/composition-harness"
import { DappSessionService } from "@/wallet/services/dapp-session/service"
import { AccessLevel } from "@/wallet/services/dapp-session/spec"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { ProfileService } from "@/wallet/services/profile/service"
import type { PendingVerificationEntry } from "./pending-verification"
import { wireSessionTeardown } from "./session-revocation"

const ORIGIN = "https://dapp.xyz"
const TAB = 7
/** Wallet chain 1, the chain id both rows are written under. */
const CHAIN_INFO = { chainId: "0x01", version: "0x00" }

async function harness() {
	const logger = new LoggerStore(new ConfigStore())
	const macKey = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
	const deletionState = new ProfileDeletionState()
	let active = "p2"
	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			getActiveProfile: async () => ({ id: active }),
			onProfileDeleted: new EventHandler(),
			deriveDappSessionMacKey: async () => macKey,
			getDeletionState: () => deletionState,
			captureExecutionFence: async () => ({ profileId: active, epoch: deletionState.capture(active) }),
		}),
	)
	const sessions = new DappSessionService(logger, new FakeBrowserApi())
	collection.add(sessions)
	await collection.start()
	for (const profileId of ["p2", "p1"]) {
		active = profileId
		await sessions.addDappSession({ url: ORIGIN }, [], [], AccessLevel.Transactions, "1")
	}

	const live = new Set(["approved-under-p1", "stamped-to-p2"])
	const terminated: string[] = []
	const state = {
		sessionProfiles: new Map([["stamped-to-p2", "p2"]]),
		pendingVerification: new Map<string, PendingVerificationEntry>([
			["approved-under-p1", { at: Date.now(), profileId: "p1", tabId: TAB }],
		]),
	}
	const handler = {
		getActiveSessions: () => [...live].map((sessionId) => ({ sessionId, origin: ORIGIN, tabId: TAB, chainInfo: CHAIN_INFO })),
		terminateSession: (sessionId: string) => {
			terminated.push(sessionId)
			live.delete(sessionId)
		},
	}
	wireSessionTeardown(handler, sessions, state, logger)
	return { sessions, state, terminated }
}

describe("a profile purge through the real teardown wiring", () => {
	test("purging p2 ends p2's channel and leaves the handshake p1 approved; purging p1 then ends it", async () => {
		const { sessions, state, terminated } = await harness()

		await sessions.purgeForProfile("p2")
		expect(terminated).toEqual(["stamped-to-p2"])
		expect([...state.sessionProfiles.keys()]).toEqual([])
		expect(state.pendingVerification.get("approved-under-p1")?.cancelled).toBeUndefined()

		await sessions.purgeForProfile("p1")
		expect(terminated).toEqual(["stamped-to-p2", "approved-under-p1"])
		expect(state.pendingVerification.get("approved-under-p1")?.cancelled).toBe(true)
	})
})
