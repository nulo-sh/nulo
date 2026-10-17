/**
 * The content wrapper on the REAL SDK handler: the order of its checks — subframe, then schema,
 * then the dead-session reply — and what each lets through. `background.admission.test.ts` and
 * `background.init-order.pins.test.ts` mock the handler and the relay away, so neither can see
 * the wrapper; here both are real, the relay is a stub that hands back the listener it was given,
 * the SDK's own listener is wrapped in a spy (so "forwarded" and "not forwarded" are observed on
 * it, not inferred from silence), and the live session is established through the real key
 * exchange, the way a page does it. (The "no handler yet" forward is a property of
 * `sessionKnownTo`, pinned in its own table test — `initWalletSdkHandler` binds the handler before
 * it attaches the listener, so the wrapper itself never runs without one.)
 */
import { exportPublicKey, generateKeyPair } from "@aztec-labs/wallet-sdk/crypto"
import { BackgroundConnectionHandler, type BackgroundTransport, type MessageSender } from "@aztec-labs/wallet-sdk/extension/handlers"
import { RECEIVER_GONE_MESSAGE } from "@nulo/extension-messaging/errors"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type Listener = (message: unknown, sender: MessageSender) => void
let attached: Listener | undefined
vi.mock("./content-message-relay", () => ({
	attachContentListener: (listener: Listener) => {
		attached = listener
	},
}))
vi.mock("./tab-lifecycle", () => ({ wireTabLifecycle: () => {} }))
vi.mock("@nulo/wallet-sdk-schema-patch/register", () => ({}))

import { initWalletSdkHandler } from "./background"
import { MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS } from "./content-script-validator"
import { SESSION_DISCONNECTED } from "./stale-session"
import { fakeSdkPorts } from "./test-ports"
import { FAKE_DAPP_ORIGIN, fakeSdkServices } from "./test-services"

const noopLogger = { log: () => {} } as never
const TAB = 7
const OTHER_TAB = 9
const sendMessage = vi.fn<(tabId: number, message: unknown) => Promise<void>>()
/** A frame of a tab showing the dApp, as Chrome describes it; `document` is the frame's own origin. */
const sender = (tab: number, frameId = 0, document = FAKE_DAPP_ORIGIN): MessageSender =>
	({ tab: { id: tab, url: `${FAKE_DAPP_ORIGIN}/` }, frameId, origin: document, url: `${document}/` }) as MessageSender
const disconnect = (sessionId: string) => ({ origin: "background", type: SESSION_DISCONNECTED, sessionId })
const disconnectsSent = () => sendMessage.mock.calls.filter(([, message]) => (message as { type?: string }).type === SESSION_DISCONNECTED)
const sentTo = (tab: number) => sendMessage.mock.calls.filter(([to]) => to === tab).map(([, message]) => message)
const ping = (sessionId: string) => ({ origin: "content-script", type: "ping", sessionId })
const secure = (sessionId: string) => ({ origin: "content-script", type: "secure-message", sessionId, content: { iv: "", ciphertext: "" } })
const discovery = (requestId: string) => ({
	origin: "content-script",
	type: "discovery-request",
	content: { type: "aztec-wallet-discovery", requestId, appId: "app", chainInfo: { chainId: "1", version: "1" } },
})

const keyExchange = async (sessionId: string) => ({
	origin: "content-script",
	type: "key-exchange-request",
	sessionId,
	content: {
		type: "aztec-wallet-key-exchange-request",
		requestId: sessionId,
		publicKey: await exportPublicKey((await generateKeyPair()).publicKey),
	},
})
const keyExchangeResponses = (sessionId: string) =>
	sendMessage.mock.calls.filter(
		([, m]) =>
			(m as { type?: string; sessionId?: string }).type === "key-exchange-response" &&
			(m as { sessionId?: string }).sessionId === sessionId,
	)

type Deliver = (message: unknown, from?: MessageSender) => void

/** The SDK's own listener, wrapped so forwarding is observed rather than inferred from silence. */
let sdkListener: ReturnType<typeof vi.fn<Listener>> | undefined

function boot(init: typeof initWalletSdkHandler = initWalletSdkHandler): { handler: BackgroundConnectionHandler; deliver: Deliver } {
	attached = undefined
	const handler = init(fakeSdkServices({ remembered: true }).services, noopLogger, fakeSdkPorts())
	// `init` assigned it through the mock; the control-flow analysis cannot see that.
	const wrapper = attached as Listener | undefined
	if (!wrapper) throw new Error("the wrapper was not attached to the relay")
	return { handler, deliver: (message, from = sender(TAB)) => wrapper(message, from) }
}

/**
 * Establish `sessionId` for `tab` as a page does: discovery, the wallet's approval of the remembered
 * app, then a real key exchange — and, like the page, nothing further until the response.
 */
async function establish(deliver: Deliver, sessionId: string, tab = TAB, from = sender(tab)): Promise<void> {
	await approve(deliver, sessionId, from)
	deliver(await keyExchange(sessionId), from)
	await vi.waitFor(() =>
		expect(sendMessage).toHaveBeenCalledWith(tab, expect.objectContaining({ type: "key-exchange-response", sessionId })),
	)
	sdkListener?.mockClear()
	sendMessage.mockClear()
}

/** A discovery from `from`, approved by the wallet (remembered, trusted). */
async function approve(deliver: Deliver, sessionId: string, from: MessageSender): Promise<void> {
	deliver(discovery(sessionId), from)
	await vi.waitFor(() =>
		expect(sendMessage).toHaveBeenCalledWith(from.tab?.id, expect.objectContaining({ type: "discovery-approved", sessionId })),
	)
}

/** Delivers a key exchange for an approved discovery and expects it dropped before the SDK: no session, no reply. */
async function expectKeyExchangeRefused(handler: BackgroundConnectionHandler, deliver: Deliver, sessionId: string, from: MessageSender) {
	sdkListener?.mockClear()
	deliver(await keyExchange(sessionId), from)
	await flush()
	expect(sdkListener).not.toHaveBeenCalled()
	expect(keyExchangeResponses(sessionId)).toEqual([])
	expect(handler.getSession(sessionId)).toBeUndefined()
}

const flush = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve()
}

let encrypted: ReturnType<typeof vi.spyOn>

beforeEach(() => {
	sendMessage.mockReset().mockResolvedValue(undefined)
	sdkListener = undefined
	encrypted = vi.spyOn(BackgroundConnectionHandler.prototype, "handleEncryptedMessage")
	// The SDK's `initialize` is one line — hand its listener to the transport; the same line, with
	// the listener wrapped, is what lets a test see whether the wrapper forwarded.
	vi.spyOn(BackgroundConnectionHandler.prototype, "initialize").mockImplementation(function (this: BackgroundConnectionHandler) {
		const self = this as unknown as { transport: BackgroundTransport; handleMessage: Listener }
		sdkListener = vi.fn<Listener>(self.handleMessage)
		self.transport.addContentListener(sdkListener)
	})
	vi.stubGlobal("chrome", {
		runtime: { getURL: (p: string) => p },
		tabs: { sendMessage },
		action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
	})
	vi.stubGlobal("__VERSION__", "test")
})
afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
})

describe("the wrapper's order of checks", () => {
	test("a subframe's message is dropped before anything else — not forwarded, its dead session gets no reply", async () => {
		const { deliver } = boot()
		deliver(ping("ghost"), sender(TAB, 3))
		deliver(secure("ghost"), sender(TAB, 3))
		await flush()
		expect(sdkListener).not.toHaveBeenCalled()
		expect(sendMessage).not.toHaveBeenCalled()
	})

	test("a malformed content-script envelope is dropped — even one the SDK would otherwise dispatch", async () => {
		const { deliver } = boot()
		const dispatched = vi.spyOn(BackgroundConnectionHandler.prototype, "handleDiscoveryRequest")
		deliver({ ...discovery("m1"), sessionId: 5 })
		await flush()
		expect(sdkListener).not.toHaveBeenCalled()
		expect(dispatched).not.toHaveBeenCalled()
		expect(sendMessage).not.toHaveBeenCalled()
	})

	test("a message that is not the content script's is forwarded untouched, and nothing is sent", async () => {
		const { deliver } = boot()
		const message = { origin: "background", type: "ping", sessionId: "ghost" }
		deliver(message)
		await flush()
		expect(sdkListener).toHaveBeenCalledWith(message, sender(TAB))
		expect(sendMessage).not.toHaveBeenCalled()
	})
})

describe("a session the sender's tab does not hold", () => {
	test.each([
		["ping", ping],
		["secure-message", secure],
	])("a %s naming it is answered with session-disconnected in the sender's tab and not forwarded", async (_type, make) => {
		const { deliver } = boot()
		deliver(make("ghost"))
		await flush()
		expect(sendMessage).toHaveBeenCalledTimes(1)
		expect(sendMessage).toHaveBeenCalledWith(TAB, disconnect("ghost"))
		expect(sdkListener).not.toHaveBeenCalled()
		expect(encrypted).not.toHaveBeenCalled()
	})

	test("the same message again is answered again — no state, no memory of the first", async () => {
		const { deliver } = boot()
		deliver(ping("ghost"))
		deliver(ping("ghost"))
		await flush()
		expect(disconnectsSent()).toEqual([
			[TAB, disconnect("ghost")],
			[TAB, disconnect("ghost")],
		])
	})

	test("a reply the tab can no longer receive is swallowed like any other reply", async () => {
		const { deliver } = boot()
		sendMessage.mockRejectedValueOnce(new Error(RECEIVER_GONE_MESSAGE))
		deliver(ping("ghost"))
		await flush()
		expect(sendMessage).toHaveBeenCalledWith(TAB, disconnect("ghost"))
	})
})

describe("a live session, established through the real key exchange", () => {
	test("its ping is forwarded and answered with pong to its tab, never disconnected", async () => {
		const { deliver } = boot()
		await establish(deliver, "s1")
		deliver(ping("s1"))
		await flush()
		expect(sdkListener).toHaveBeenCalledTimes(1)
		expect(sendMessage).toHaveBeenCalledWith(TAB, { origin: "background", type: "pong", sessionId: "s1" })
		expect(disconnectsSent()).toEqual([])
	})

	test("its first secure message after the key-exchange response reaches the handler", async () => {
		const { deliver } = boot()
		await establish(deliver, "s1")
		deliver(secure("s1"))
		await flush()
		expect(encrypted).toHaveBeenCalledWith("s1", expect.anything())
		expect(disconnectsSent()).toEqual([])
	})

	test("its secure message over the ciphertext budget is dropped before the SDK sees it", async () => {
		const { deliver } = boot()
		await establish(deliver, "s1")
		const ciphertext = "A".repeat(MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS + 1)
		deliver({ ...secure("s1"), content: { iv: "", ciphertext } })
		await flush()
		expect(sdkListener).not.toHaveBeenCalled()
		expect(encrypted).not.toHaveBeenCalled()
		expect(sendMessage).not.toHaveBeenCalled()
	})

	test("its id sent from another tab is answered in that tab only: not forwarded, the owning tab untouched and still live", async () => {
		const { deliver } = boot()
		await establish(deliver, "s1")
		deliver(ping("s1"), sender(OTHER_TAB))
		await flush()
		expect(sdkListener).not.toHaveBeenCalled()
		expect(sentTo(OTHER_TAB)).toEqual([disconnect("s1")])
		expect(sentTo(TAB)).toEqual([])
		deliver(ping("s1"))
		await flush()
		expect(sentTo(TAB)).toEqual([{ origin: "background", type: "pong", sessionId: "s1" }])
	})

	test("another tab's live id and an absent id are indistinguishable to the sender — no liveness oracle", async () => {
		const { deliver } = boot()
		await establish(deliver, "s1")
		deliver(ping("s1"), sender(OTHER_TAB))
		deliver(ping("never-issued"), sender(OTHER_TAB))
		await flush()
		expect(sentTo(OTHER_TAB)).toEqual([disconnect("s1"), disconnect("never-issued")])
		expect(sdkListener).not.toHaveBeenCalled()
	})

	test("after the wallet terminated it, a tab that missed that disconnect is told again on its next ping", async () => {
		const { handler, deliver } = boot()
		await establish(deliver, "s1")
		handler.terminateSession("s1")
		await flush()
		expect(disconnectsSent()).toEqual([[TAB, disconnect("s1")]])
		deliver(ping("s1"))
		await flush()
		expect(disconnectsSent()).toEqual([
			[TAB, disconnect("s1")],
			[TAB, disconnect("s1")],
		])
	})
})

describe("a key exchange, admitted only from its discovery's tab and document origin", () => {
	test("from the discovery's tab and origin it establishes the session (control)", async () => {
		const { handler, deliver } = boot()
		await establish(deliver, "k0")
		expect(handler.getSession("k0")?.tabId).toBe(TAB)
	})

	test("from the discovery's tab, a document of another origin is refused", async () => {
		const { handler, deliver } = boot()
		await approve(deliver, "k1", sender(TAB))
		await expectKeyExchangeRefused(handler, deliver, "k1", sender(TAB, 0, "https://other.example"))
	})

	test("from another tab of the same origin it is refused", async () => {
		const { handler, deliver } = boot()
		await approve(deliver, "k2", sender(TAB))
		await expectKeyExchangeRefused(handler, deliver, "k2", sender(OTHER_TAB))
	})

	test("from a sender with neither an origin nor a url it is refused", async () => {
		const { handler, deliver } = boot()
		await approve(deliver, "k3", sender(TAB))
		await expectKeyExchangeRefused(handler, deliver, "k3", {
			tab: { id: TAB, url: `${FAKE_DAPP_ORIGIN}/` },
			frameId: 0,
		} as MessageSender)
	})

	test("from a document reporting an opaque origin it is refused, whatever its url", async () => {
		const { handler, deliver } = boot()
		await approve(deliver, "k6", sender(TAB))
		await expectKeyExchangeRefused(handler, deliver, "k6", sender(TAB, 0, "null"))
		const sandboxed = { ...sender(TAB), origin: "null", url: `${FAKE_DAPP_ORIGIN}/` } as MessageSender
		await expectKeyExchangeRefused(handler, deliver, "k6", sandboxed)
	})

	test("from a sender with only a url of another origin it is refused", async () => {
		const { handler, deliver } = boot()
		await approve(deliver, "k7", sender(TAB))
		const elsewhere = { tab: { id: TAB, url: `${FAKE_DAPP_ORIGIN}/` }, frameId: 0, url: "https://other.example/app" } as MessageSender
		await expectKeyExchangeRefused(handler, deliver, "k7", elsewhere)
	})

	test("from a sender with only a url (as Firefox reports one), its url's origin decides (control)", async () => {
		const { handler, deliver } = boot()
		const firefox = { tab: { id: TAB, url: `${FAKE_DAPP_ORIGIN}/` }, frameId: 0, url: `${FAKE_DAPP_ORIGIN}/app` } as MessageSender
		await establish(deliver, "k4", TAB, firefox)
		expect(handler.getSession("k4")).toBeDefined()
	})

	test.each([
		[
			"credited to no origin (a tab with no url)",
			{ tab: { id: TAB }, frameId: 0, origin: FAKE_DAPP_ORIGIN, url: `${FAKE_DAPP_ORIGIN}/` },
		],
		[
			"from a plain-http tab",
			{ tab: { id: TAB, url: "http://dapp.example/" }, frameId: 0, origin: "http://dapp.example", url: "http://dapp.example/" },
		],
	])("for a discovery %s, the discovery is refused and no key exchange establishes it", async (_label, from) => {
		const { handler, deliver } = boot()
		deliver(discovery("k5"), from as MessageSender)
		await flush()
		expect(handler.getPendingDiscovery("k5")).toBeUndefined()
		deliver(await keyExchange("k5"), from as MessageSender)
		await flush()
		expect(handler.getSession("k5")).toBeUndefined()
		expect(sentTo(TAB)).toEqual([])
	})
})

describe("with VITE_NULO_ALLOW_IFRAME_DAPPS=1", () => {
	const withFlag = async () => {
		vi.stubEnv("VITE_NULO_ALLOW_IFRAME_DAPPS", "1")
		vi.resetModules()
		return boot((await import("./background")).initWalletSdkHandler)
	}

	test("a same-origin subframe completes a key exchange", async () => {
		const { handler, deliver } = await withFlag()
		await establish(deliver, "f1", TAB, sender(TAB, 3))
		expect(handler.getSession("f1")).toBeDefined()
	})

	test("a cross-origin subframe is refused, though its discovery is credited to the top frame's origin", async () => {
		const { handler, deliver } = await withFlag()
		const frame = sender(TAB, 3, "https://embedded.example")
		await approve(deliver, "f2", frame)
		expect(handler.getPendingDiscovery("f2")?.origin).toBe(FAKE_DAPP_ORIGIN)
		await expectKeyExchangeRefused(handler, deliver, "f2", frame)
	})

	test("a subframe's message is forwarded, and its dead session is answered in the sender's tab only", async () => {
		vi.stubEnv("VITE_NULO_ALLOW_IFRAME_DAPPS", "1")
		vi.resetModules()
		const { initWalletSdkHandler: init } = await import("./background")
		const { deliver } = boot(init)
		deliver(ping("ghost"), sender(TAB, 3))
		await flush()
		expect(sendMessage).toHaveBeenCalledTimes(1)
		expect(sendMessage).toHaveBeenCalledWith(TAB, disconnect("ghost"))
	})
})
