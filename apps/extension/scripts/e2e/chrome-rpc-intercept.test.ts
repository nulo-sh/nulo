// @vitest-environment node
import { ProtocolError } from "puppeteer"
import { expect, test } from "vitest"
import { cdpInterceptRpc } from "../../tests/e2e/fixtures/browser/chrome-rpc-intercept"

type Sent = { method: string; params?: Record<string, unknown> }

/** A browser whose root session records each command and, as Chrome does, reports the existing
 *  extension worker before it answers the auto-attach that asked for it. The worker's session
 *  records its commands and rejects every reply to a paused request with `replyError`, if given. */
function fakeBrowser(replyError?: Error) {
	const sent: Sent[] = []
	const replies: Sent[] = []
	let onAttached: ((event: unknown) => void) | undefined
	let onPaused: ((event: unknown) => void) | undefined
	const child = {
		send: async (method: string, params?: Record<string, unknown>) => {
			if (method === "Fetch.enable" || method === "Runtime.runIfWaitingForDebugger") return
			replies.push({ method, params })
			if (replyError) throw replyError
		},
		on: (event: string, listener: (event: unknown) => void) => {
			if (event === "Fetch.requestPaused") onPaused = listener
		},
		detach: async () => {},
	}
	const root = {
		send: async (method: string, params?: Record<string, unknown>) => {
			sent.push({ method, params })
			if (method === "Target.setAutoAttach" && params?.autoAttach) {
				onAttached?.({
					sessionId: "worker",
					targetInfo: { type: "service_worker", url: "chrome-extension://x/sw.js" },
					waitingForDebugger: false,
				})
			}
		},
		on: (_event: string, listener: (event: unknown) => void) => {
			onAttached = listener
		},
		connection: () => ({ session: () => child }),
		detach: async () => {},
	}
	const pause = (requestId: string, url: string) => onPaused?.({ requestId, request: { url } })
	return { browser: { target: () => ({ createCDPSession: async () => root }) }, sent, replies, pause }
}

/** Target.pdl's `TargetFilter`: the first entry with no `type` or the target's own decides. */
function attaches(filter: unknown, type: string): boolean {
	const entry = (filter as { type?: string; exclude?: boolean }[]).find((e) => e.type === undefined || e.type === type)
	return entry !== undefined && !entry.exclude
}

// Detaching any session from a page clears that page's WebAuthn virtual authenticators, so a page
// that holds a passkey spec's credential must never take one of this interception's sessions.
test("auto-attaches every node caller, under any type name, and never a page", async () => {
	const { browser, sent } = fakeBrowser()
	const armed = await cdpInterceptRpc(browser as never, "chrome-extension://x/", "https://node.example", { kind: "refuse" })
	await armed.stop()
	const { filter } = sent.find(({ method, params }) => method === "Target.setAutoAttach" && params?.autoAttach)?.params ?? {}
	for (const type of ["page", "tab", "browser"]) expect(attaches(filter, type), type).toBe(false)
	for (const type of ["service_worker", "background_page", "other", "offscreen_document"]) expect(attaches(filter, type), type).toBe(true)
})

const NODE = "https://node.example"
const STUB = "http://127.0.0.1:4100"
const PAUSED = { requestId: "interception-job-7.0", url: `${NODE}/aztec-testnet/key?n=3` }
const MODES = { redirect: { kind: "redirect", to: STUB }, refuse: { kind: "refuse" } } as const
/** The one reply each mode owes `PAUSED`. A reply under a wrong id would now read as gone at run
 *  time and leave the request paused, so these pin the id at the source. */
const REPLIES = {
	redirect: { method: "Fetch.continueRequest", params: { requestId: PAUSED.requestId, url: `${STUB}/aztec-testnet/key?n=3` } },
	refuse: { method: "Fetch.failRequest", params: { requestId: PAUSED.requestId, errorReason: "ConnectionRefused" } },
}

/** Pauses `PAUSED` on the armed worker, the way a live run meets it, and has Chrome refuse the reply. */
async function replyRefused(mode: keyof typeof MODES, message: string) {
	const { browser, replies, pause } = fakeBrowser(new ProtocolError(message))
	const armed = await cdpInterceptRpc(browser as never, "chrome-extension://x/", NODE, MODES[mode])
	pause(PAUSED.requestId, PAUSED.url)
	await new Promise((resolve) => setTimeout(resolve, 0))
	const failures = await armed.failures()
	await armed.stop()
	return { failures, replies }
}

// Chrome 152's answer, probed, to a reply sent after the worker was stopped with this session still
// attached; a caller's abort of the paused fetch gets the same.
test.each(["redirect", "refuse"] as const)("%s: a reply to a request Chrome no longer holds paused is no failure", async (mode) => {
	const { method } = REPLIES[mode]
	const { failures, replies } = await replyRefused(mode, `Protocol error (${method}): Invalid InterceptionId.`)
	expect(replies).toEqual([REPLIES[mode]])
	expect(failures).toEqual([])
})

// Chrome 152's answer, probed, to a second reply to one paused request.
test("a reply Chrome refuses for any other reason is a failure", async () => {
	const refusal = "Protocol error (Fetch.continueRequest): Invalid state for continueInterceptedRequest"
	const { failures, replies } = await replyRefused("redirect", refusal)
	expect(replies).toEqual([REPLIES.redirect])
	expect(failures).toEqual([`service_worker:x/sw.js: reply to /aztec-testnet/key failed: ProtocolError: ${refusal}`])
})
