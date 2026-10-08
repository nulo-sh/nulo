/**
 * Ending an app's live channels: an unstamped channel is refused by the dispatch guard whatever the
 * method, so a revocation unstamps each match before it terminates it, and one failed termination
 * neither keeps that channel usable nor skips the rest.
 */
import { describe, expect, test, vi } from "vitest"
import { SESSION_INVALID_ERROR } from "./error-envelope"
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
const live = (sessionId: string, origin = ORIGIN, chainInfo = CHAIN_0) => ({ sessionId, origin, chainInfo })
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

		revokeLiveSessions({ getActiveSessions: () => sessions, sessionProfiles, terminateSession, logger: noopLogger }, ORIGIN, "0")

		expect(terminateSession.mock.calls).toEqual([["s1"], ["s2"]])
		expect([...sessionProfiles.keys()]).toEqual(["other-chain", "other-app"])
		expect((await callFrom("s1", sessionProfiles)).dispatch).not.toHaveBeenCalled()
		expect((await callFrom("other-chain", sessionProfiles)).dispatch).toHaveBeenCalledTimes(1)
	})

	test("a session whose chain info does not decode is skipped, and the matches after it still end", () => {
		const terminateSession = vi.fn()
		const sessions = [live("garbled", ORIGIN, { chainId: "not hex", version: "0x01" }), live("s1")]

		revokeLiveSessions(
			{ getActiveSessions: () => sessions, sessionProfiles: new Map(), terminateSession, logger: noopLogger },
			ORIGIN,
			"0",
		)

		expect(terminateSession.mock.calls).toEqual([["s1"]])
	})
})
