// @vitest-environment node
import { expect, test } from "vitest"
import { cdpInterceptRpc } from "../../tests/e2e/fixtures/browser/chrome-rpc-intercept"

/** A browser whose root session records each command and, as Chrome does, reports the existing
 *  extension worker before it answers the auto-attach that asked for it. */
function fakeBrowser() {
	const sent: { method: string; params?: Record<string, unknown> }[] = []
	let onAttached: ((event: unknown) => void) | undefined
	const child = { send: async () => {}, on: () => {}, detach: async () => {} }
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
	return { browser: { target: () => ({ createCDPSession: async () => root }) }, sent }
}

// Detaching any session from a page clears that page's WebAuthn virtual authenticators, so a page
// that holds a passkey spec's credential must never take one of this interception's sessions.
test("auto-attaches service workers and background pages only, never a page", async () => {
	const { browser, sent } = fakeBrowser()
	const armed = await cdpInterceptRpc(browser as never, "chrome-extension://x/", "https://node.example", { kind: "refuse" })
	await armed.stop()
	const attach = sent.find(({ method, params }) => method === "Target.setAutoAttach" && params?.autoAttach)
	expect(attach?.params?.filter).toEqual([{ type: "service_worker" }, { type: "background_page" }, { exclude: true }])
})
