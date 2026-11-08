/**
 * The request capture's ends at the ingress: an answered call ends with its answer, and a call
 * that is never answered (its establishment lost, its answer suppressed) ends as dropped, once.
 */
import { describe, expect, test, vi } from "vitest"
import { KeyedLock } from "@nulo/wallet-core/utils"
import { RequestLog } from "@/wallet/logger/request-log"
import { type MessagePipelineDeps, onWalletMessage } from "./wallet-message"

const SESSION = { sessionId: "s1", origin: "https://app.example", chainInfo: { chainId: "0x7a69", version: "0x1" } } as never

function harness(
	opts: {
		established?: boolean
		switchMidDispatch?: boolean
		dispatch?: () => Promise<unknown>
		session?: never
		overCap?: boolean
	} = {},
) {
	const session = opts.session ?? SESSION
	const sent: Array<{ error?: { data?: { walletTraceId?: string } } }> = []
	const settled = Promise.withResolvers<void>()
	let epoch = 0
	const requests = new RequestLog(() => true)
	const end = vi.spyOn(requests, "end")
	const begin = vi.spyOn(requests, "begin")
	const hold = { admit: () => (opts.overCap ? undefined : () => settled.resolve()), outcome: Promise.resolve("released" as const) }
	const deps = {
		handler: {
			getSession: () => session,
			sendResponse: async (_id: string, response: never) => void sent.push(response),
			terminateSession: () => {},
		},
		sessions: {
			holds: new Map([["s1", hold]]),
			sessionQueues: new Map(),
			establishmentStatus: new Map([["s1", Promise.resolve(opts.established ?? true)]]),
			decryptLocks: new KeyedLock({ maxHoldMs: null }),
			sessionProfiles: new Map([["s1", "p1"]]),
		},
		switchEpoch: { current: () => epoch },
		dispatcher: {
			dispatch: async () => {
				if (opts.switchMidDispatch) epoch++
				return (opts.dispatch ?? (async () => "ok"))()
			},
		},
		profileService: { captureExecutionFence: async () => ({ profileId: "p1", epoch: 0, session: 1 }) },
		legal: { assertCurrent: async () => {} },
		operationJournal: {},
		logger: { log: () => {} },
		requests,
	} as unknown as MessagePipelineDeps
	onWalletMessage(session, { type: "getChainInfo", args: [], messageId: "m1" } as never, deps)
	const walletTraceId = () => begin.mock.calls[0]?.[0]
	return { sent, begin, end, walletTraceId, done: settled.promise }
}

describe("onWalletMessage: the request capture ends once, with its own outcome", () => {
	test("a session with a malformed chainInfo still gets its typed refusal, carrying its id", async () => {
		const malformed = { ...(SESSION as object), chainInfo: { chainId: "nope" } } as never
		const h = harness({ session: malformed })
		await h.done
		expect(h.sent[0].error).toMatchObject({ code: -32602, data: { walletTraceId: h.walletTraceId() } })
	})

	test("an answered call ends with its answer first; the release's dropped end comes after and is ignored", async () => {
		const h = harness()
		await h.done
		expect(h.end.mock.calls).toEqual([
			[h.walletTraceId(), { envelope: undefined }],
			[h.walletTraceId(), "dropped"],
		])
		expect(h.sent).toHaveLength(1)
	})

	test("a failed call ends with the envelope it was answered, carrying the same id", async () => {
		const h = harness({ dispatch: async () => Promise.reject(new Error("boom")) })
		await h.done
		const [first] = h.end.mock.calls
		expect(first).toEqual([h.walletTraceId(), { envelope: expect.objectContaining({ code: -32603 }) }])
		expect(h.sent[0].error?.data?.walletTraceId).toBe(h.walletTraceId())
	})

	test("a call over the pending cap is answered with an id but never captured", async () => {
		const h = harness({ overCap: true })
		await vi.waitFor(() => expect(h.sent).toHaveLength(1))
		expect(h.sent[0].error?.data?.walletTraceId).toMatch(/^[0-9a-f]{8}$/)
		expect(h.begin).not.toHaveBeenCalled()
	})

	test.each([
		["its establishment lost", { established: false }],
		["its answer suppressed by a profile switch", { switchMidDispatch: true }],
	])("a call with %s is never answered and ends as dropped", async (_label, opts) => {
		const h = harness(opts)
		await h.done
		expect(h.end.mock.calls).toEqual([[h.walletTraceId(), "dropped"]])
		expect(h.sent).toEqual([])
	})
})
