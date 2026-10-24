/**
 * The restart preparation through the booted wiring: the handler registers it on the profile
 * service, and running it ends every live channel before the check window it opened is removed,
 * while every remembered app keeps its row.
 */
import { beforeEach, expect, test, vi } from "vitest"

type Callbacks = { onSessionTerminated: (id: string) => void }
let captured: Callbacks | undefined
const live = new Map<string, { sessionId: string; origin: string; chainInfo: { chainId: string; version: string } }>()
const order: string[] = []

vi.mock("@aztec-labs/wallet-sdk/extension/handlers", () => ({
	BackgroundConnectionHandler: class {
		constructor(_meta: unknown, _transport: unknown, callbacks: Callbacks) {
			captured = callbacks
		}
		handleEncryptedMessage() {
			return Promise.resolve()
		}
		getActiveSessions() {
			return [...live.values()]
		}
		getSession(id: string) {
			return live.get(id)
		}
		terminateSession(id: string) {
			order.push(`end:${id}`)
			live.delete(id)
			captured?.onSessionTerminated(id)
		}
		terminateForTab() {}
		initialize() {}
	},
}))
vi.mock("./content-message-relay", () => ({ attachContentListener: () => {} }))
vi.mock("./tab-lifecycle", () => ({ wireTabLifecycle: () => {} }))
vi.mock("@nulo/wallet-sdk-schema-patch/register", () => ({}))

import { initWalletSdkHandler } from "./background"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN, fakeSdkServices } from "./test-services"

const CHAIN_INFO = { chainId: "1", version: "1" }

beforeEach(() => {
	live.clear()
	order.length = 0
	// biome-ignore lint/suspicious/noExplicitAny: chrome stub
	;(globalThis as any).chrome = {
		runtime: { getURL: (p: string) => p },
		tabs: { sendMessage: () => {} },
		action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
	}
	// biome-ignore lint/suspicious/noExplicitAny: vite define-injected global
	;(globalThis as any).__VERSION__ = "test"
})

test("the registered preparation ends every live session, then removes the check window, and keeps every row", async () => {
	let prepare: (() => void) | undefined
	const fake = fakeSdkServices({
		remembered: true,
		setRestartPreparation: (fn) => {
			prepare = fn
		},
	})
	const ports = fakeSdkPorts({ remove: async (id) => void order.push(`remove:${id}`) })
	initWalletSdkHandler(fake.services, { log: () => {} } as never, ports)
	for (const sessionId of ["s1", "s2"]) live.set(sessionId, { sessionId, origin: FAKE_DAPP_ORIGIN, chainInfo: CHAIN_INFO })
	const check = await ports.windows.create({ url: "chrome-extension://test/src/popup/index.html#/windows/verify?sessionId=s1" })
	const rows = [...fake.rows.values()]

	prepare?.()
	expect(order).toEqual(["end:s1", "end:s2", `remove:${check.id}`])
	expect([...fake.rows.values()]).toEqual(rows)
})
