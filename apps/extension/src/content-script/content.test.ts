import { beforeEach, expect, test, vi } from "vitest"

const discovery = { type: "aztec-wallet-discovery", requestId: "mine", appId: "app", chainInfo: { chainId: "1", version: "1" } }
const approval = (sessionId: string) => ({ origin: "background", type: "discovery-approved", sessionId, content: {} })

let deliver: (message: unknown) => void
let posted: ReturnType<typeof vi.spyOn<Window, "postMessage">>
const sent: unknown[] = []

beforeEach(async () => {
	sent.length = 0
	vi.stubGlobal("chrome", {
		runtime: {
			sendMessage: vi.fn(async (message: unknown) => {
				sent.push(message)
			}),
			onMessage: {
				addListener: (listener: (message: unknown) => void) => {
					deliver = listener
				},
			},
		},
	})
	vi.stubGlobal(
		"MessageChannel",
		class {
			port1 = { start() {}, postMessage() {}, onmessage: null }
			port2 = {}
		},
	)
	posted = vi.spyOn(window, "postMessage").mockImplementation(() => {})
	vi.resetModules()
	await import("./content")
})

test("the page is answered only for the discovery it sent through this content script", () => {
	window.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(discovery), source: window }))
	expect(sent).toEqual([{ origin: "content-script", type: "discovery-request", content: discovery }])

	deliver(approval("theirs"))
	expect(posted).not.toHaveBeenCalled()

	deliver(approval("mine"))
	expect(posted).toHaveBeenCalledTimes(1)
	expect(JSON.parse(posted.mock.calls[0][0] as string)).toMatchObject({ requestId: "mine" })
})
