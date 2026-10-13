import { describe, expect, test, vi } from "vitest"
import { bindLiveSession } from "./live-session"

const session = (sessionId = "s1") => ({ sessionId, origin: "https://dapp.example", tabId: 7 }) as never

function handlerOver(sessions: Map<string, unknown>) {
	return {
		getSession: (id: string) => sessions.get(id) as never,
		sendResponse: vi.fn(async (_id: string, _response: unknown) => {}),
		terminateSession: vi.fn((id: string) => void sessions.delete(id)),
	}
}

describe("bindLiveSession", () => {
	test("acts while the handler holds the bound session object", async () => {
		const bound = session()
		const handler = handlerOver(new Map([["s1", bound]]))
		const live = bindLiveSession(handler, bound)
		expect(live.isLive()).toBe(true)
		await live.respond({ messageId: "m1", walletId: "nulo", result: 1 })
		expect(handler.sendResponse.mock.calls).toEqual([["s1", { messageId: "m1", walletId: "nulo", result: 1 }]])
		live.terminate()
		expect(handler.terminateSession.mock.calls).toEqual([["s1"]])
	})

	test.each([
		["the id re-keyed to another session object", (sessions: Map<string, unknown>) => sessions.set("s1", session())],
		["the session ended", (sessions: Map<string, unknown>) => sessions.delete("s1")],
	])("once %s, it neither answers nor ends anything", async (_, move) => {
		const bound = session()
		const sessions = new Map<string, unknown>([["s1", bound]])
		const handler = handlerOver(sessions)
		const live = bindLiveSession(handler, bound)
		move(sessions)
		expect(live.isLive()).toBe(false)
		await live.respond({ messageId: "m1", walletId: "nulo", result: 1 })
		live.terminate()
		expect(handler.sendResponse).not.toHaveBeenCalled()
		expect(handler.terminateSession).not.toHaveBeenCalled()
	})
})
