/**
 * Ending an app's live channels: an unstamped channel is refused by the dispatch guard whatever the
 * method, so a revocation unstamps each match before it terminates it, and one failed termination
 * neither keeps that channel usable nor skips the rest.
 */
import { describe, expect, test, vi } from "vitest"
import { SESSION_INVALID_ERROR } from "./error-envelope"
import { PENDING_VERIFICATION_STALE_MS, type PendingVerificationEntry } from "./pending-verification"
import { revokeLiveSessions } from "./session-revocation"

vi.mock("@aztec-labs/wallet-sdk/extension/handlers", () => ({ BackgroundConnectionHandler: class {} }))
vi.mock("./content-message-relay", () => ({ attachContentListener: () => {} }))
vi.mock("./tab-lifecycle", () => ({ wireTabLifecycle: () => {} }))
vi.mock("@nulo/wallet-sdk-schema-patch/register", () => ({}))

import { handleWalletMessage } from "./background"

const ORIGIN = "https://dapp.example"
/** `{ chainId: 1, version: 1 }` is wallet chain 0, as every handshake test discovers with. */
const CHAIN_0 = { chainId: "0x01", version: "0x01" }
const CHAIN_OTHER = { chainId: "0x01", version: "0x02" }
const TAB = 7
const live = (sessionId: string, origin = ORIGIN, chainInfo = CHAIN_0) => ({ sessionId, origin, tabId: TAB, chainInfo })
const noopLogger = { log: () => {} } as never

/** Drives one dApp call through the real ingress with `sessionProfiles` as the stamps. */
async function callFrom(sessionId: string, sessionProfiles: Map<string, string>) {
	const dispatch = vi.fn(async () => "ok")
	const sendResponse = vi.fn(async (_sessionId: string, _response: unknown) => {})
	const terminateSession = vi.fn()
	await handleWalletMessage(
		live(sessionId) as never,
		{ messageId: "m1", type: "getChainInfo", args: [] } as never,
		{ sendResponse, terminateSession } as never,
		{ dispatch } as never,
		{ captureExecutionFence: async () => ({ profileId: "p1" }) } as never,
		{} as never,
		sessionProfiles,
		{ current: () => 0 } as never,
		noopLogger,
		{ assertCurrent: async () => undefined },
	)
	return { dispatch, response: sendResponse.mock.calls[0]?.[1], terminateSession }
}

describe("the dispatch guard refuses an unstamped channel", () => {
	test("a capability-exempt call from an unstamped live channel never reaches the dispatcher; a stamped one does", async () => {
		const refused = await callFrom("s1", new Map())
		expect(refused.dispatch).not.toHaveBeenCalled()
		expect(refused.response).toMatchObject({ error: SESSION_INVALID_ERROR })
		expect(refused.terminateSession).toHaveBeenCalledWith("s1")

		const served = await callFrom("s1", new Map([["s1", "p1"]]))
		expect(served.dispatch).toHaveBeenCalledTimes(1)
		expect(served.response).toMatchObject({ result: "ok" })
	})
})

describe("revokeLiveSessions", () => {
	const APP = { origin: ORIGIN, chainId: "0", profileId: "p1" }
	const revoke = (
		sessions: ReturnType<typeof live>[],
		sessionProfiles: Map<string, string>,
		terminateSession = vi.fn(),
		pendingVerification = new Map<string, PendingVerificationEntry>(),
	) => {
		revokeLiveSessions(
			{ getActiveSessions: () => sessions, sessionProfiles, pendingVerification, terminateSession, logger: noopLogger },
			APP,
		)
		return terminateSession
	}

	test("a throwing termination leaves its channel unstamped and refused, and the next match still ends", async () => {
		const sessionProfiles = new Map([
			["s1", "p1"],
			["s2", "p1"],
			["other-chain", "p1"],
			["other-app", "p1"],
		])
		const terminateSession = vi.fn((sessionId: string) => {
			if (sessionId === "s1") throw new Error("port gone")
		})
		const sessions = [live("s1"), live("s2"), live("other-chain", ORIGIN, CHAIN_OTHER), live("other-app", "https://other.example")]

		revoke(sessions, sessionProfiles, terminateSession)

		expect(terminateSession.mock.calls).toEqual([["s1"], ["s2"]])
		expect([...sessionProfiles.keys()]).toEqual(["other-chain", "other-app"])
		expect((await callFrom("s1", sessionProfiles)).dispatch).not.toHaveBeenCalled()
		expect((await callFrom("other-chain", sessionProfiles)).dispatch).toHaveBeenCalledTimes(1)
	})

	const approval = (profileId: string, over: Partial<PendingVerificationEntry> = {}): PendingVerificationEntry => ({
		at: Date.now(),
		profileId,
		tabId: TAB,
		...over,
	})
	const stale = { at: Date.now() - PENDING_VERIFICATION_STALE_MS - 1 }

	test.each<[string, string | undefined, PendingVerificationEntry | undefined, boolean, boolean | undefined]>([
		["stamped to another profile is kept", "p2", undefined, false, undefined],
		["unstamped, approved under another profile from its own tab, is kept", undefined, approval("p2"), false, undefined],
		["stamped to this profile ends", "p1", undefined, true, undefined],
		["unstamped, approved under this profile, ends and its marker dies", undefined, approval("p1"), true, true],
		["unstamped with no approval (a reconnect or debris) ends", undefined, undefined, true, undefined],
		["unstamped on a stale approval of another profile ends", undefined, approval("p2", stale), true, true],
		[
			"unstamped on another profile's approval from another tab ends, leaving that marker",
			undefined,
			approval("p2", { tabId: TAB + 1 }),
			true,
			undefined,
		],
	])("a channel %s", (_name, stamp, marker, ended, tombstoned) => {
		const sessionProfiles = new Map(stamp === undefined ? [] : [["s1", stamp]])
		const pendingVerification = new Map(marker === undefined ? [] : [["s1", marker]])

		const terminateSession = revoke([live("s1")], sessionProfiles, vi.fn(), pendingVerification)

		expect(terminateSession.mock.calls).toEqual(ended ? [["s1"]] : [])
		expect(sessionProfiles.has("s1")).toBe(stamp !== undefined && !ended)
		// Another tab's marker holds an id the page chose and is never abandoned on this channel's behalf.
		expect(pendingVerification.get("s1")?.cancelled).toBe(tombstoned)
	})

	test("a session whose chain info does not decode is skipped, and the matches after it still end", () => {
		const terminateSession = revoke([live("garbled", ORIGIN, { chainId: "not hex", version: "0x01" }), live("s1")], new Map())

		expect(terminateSession.mock.calls).toEqual([["s1"]])
	})
})
