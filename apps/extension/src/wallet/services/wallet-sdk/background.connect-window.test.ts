/**
 * The connect window through the SDK handler's callbacks: an Allow hands its window to the
 * connection, which shows the emoji check in it, and every exit before the check closes it. Tab
 * lifecycle runs for real over a `chrome.tabs` stub that captures its listeners. The handler keeps
 * one `ActiveSession` object per live session id, as upstream does: a re-key replaces it.
 */
import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { WindowPort } from "@nulo/wallet-core/ports"
import { DISCOVERY_STALE_MS, WalletSdkDispatcher } from "@nulo/wallet-bridge"

type Callbacks = {
	onPendingDiscovery: (d: unknown) => void
	onSessionEstablished: (s: unknown) => Promise<void> | void
	onSessionTerminated: (id: string) => void
	onWalletMessage: (session: unknown, message: unknown) => void
}
type Session = { sessionId: string; origin: string; tabId?: number; verificationHash: string; chainInfo: unknown }
let captured: Callbacks | undefined
const handlerCalls: string[] = []
/** The handler's live sessions by id, each the one object every callback for it receives. */
const sessions = new Map<string, Session>()
/** Every response the handler was asked to send, by session id. */
const responses: Array<{ sessionId: string; response: { messageId: string; error?: { code: number } } }> = []
/** Session ids whose termination throws before the handler forgets them. */
const failingTerminations = new Set<string>()
const discoveryTabs = new Map<string, number>()
/** What each discovery named, which the SDK's session for that request id carries. */
const discovered = new Map<string, { origin: string; chainInfo: unknown }>()
const droppedTabs = new Set<number>()
let approveReturns = true
/** Stands in for upstream's decrypt of one secure message; patched over by `serializeDecryption`. */
let decryptHook: (sessionId: string, encrypted: unknown) => Promise<void> = () => Promise.resolve()
/** Replaces the next response send's outcome, once. */
let nextResponse: Promise<void> | undefined

vi.mock("@aztec-labs/wallet-sdk/extension/handlers", () => ({
	BackgroundConnectionHandler: class {
		constructor(_meta: unknown, _transport: unknown, callbacks: Callbacks) {
			captured = callbacks
		}
		handleEncryptedMessage(sessionId: string, encrypted: unknown) {
			return decryptHook(sessionId, encrypted)
		}
		getActiveSessions() {
			return [...sessions.values()]
		}
		getSession(id: string) {
			return sessions.get(id)
		}
		approveDiscovery(id: string) {
			handlerCalls.push(`approve:${id}`)
			return approveReturns && !droppedTabs.has(discoveryTabs.get(id) ?? -1)
		}
		rejectDiscovery(id: string) {
			handlerCalls.push(`reject:${id}`)
		}
		sendResponse(sessionId: string, response: { messageId: string; error?: { code: number } }) {
			responses.push({ sessionId, response })
			const outcome = nextResponse
			nextResponse = undefined
			return outcome ?? Promise.resolve()
		}
		terminateSession(id: string) {
			handlerCalls.push(`terminate:${id}`)
			if (failingTerminations.has(id)) throw new Error("No tab with id: 7.")
			sessions.delete(id)
			captured?.onSessionTerminated(id)
		}
		/** The SDK drops the tab's discoveries and ends its sessions. */
		terminateForTab(tabId: number) {
			droppedTabs.add(tabId)
			for (const id of [...sessions.keys()]) if (discoveryTabs.get(id) === tabId) this.terminateSession(id)
		}
		initialize() {}
	},
}))
vi.mock("./content-message-relay", () => ({ attachContentListener: () => {} }))
vi.mock("@nulo/wallet-sdk-schema-patch/register", () => ({}))
vi.mock("./discovery-approval", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./discovery-approval")>()
	return { ...actual, approveOrRollbackDiscoverySession: vi.fn(actual.approveOrRollbackDiscoverySession) }
})

import { initWalletSdkHandler } from "./background"
import { approveOrRollbackDiscoverySession } from "./discovery-approval"
import type { PendingVerificationEntry } from "./pending-verification"
import { chainInfoToChainId } from "./session-established"
import { RESERVATION_GRACE_MS, VerifyAdmissionGate } from "./verify-admission"
import { fakeSdkPorts } from "./test-ports"
import { SESSION_INVALID_ERROR } from "./error-envelope"
import { MAX_PENDING_PER_SESSION } from "./verification-hold"
import { FAKE_DAPP_ORIGIN as ORIGIN, FAKE_SENDER, fakeSdkServices } from "./test-services"

const OTHER_ORIGIN = "https://other.example"
const noopLogger = { log: () => {} } as never
const tabRemoved: Array<(tabId: number) => void> = []
const admit = vi.spyOn(VerifyAdmissionGate.prototype, "admit")
const dispatch = vi.spyOn(WalletSdkDispatcher.prototype, "dispatch")

/** A wire-shaped verification hash, fresh for each key exchange of `requestId`. */
const keyExchanges = new Map<string, number>()
function nextHash(requestId: string): string {
	const n = (keyExchanges.get(requestId) ?? 0) + 1
	keyExchanges.set(requestId, n)
	return createHash("sha256").update(`${requestId}#${n}`).digest("hex")
}

/** The SDK finished key exchange for `requestId`: a new session object under that id. */
function keyExchange(requestId: string, over: Record<string, unknown> = {}): Session {
	const session = {
		origin: ORIGIN,
		sessionId: requestId,
		tabId: discoveryTabs.get(requestId),
		verificationHash: nextHash(requestId),
		...chain(1),
		...discovered.get(requestId),
		...over,
	}
	sessions.set(requestId, session)
	return session
}

function deferred<T>() {
	let resolve!: (v: T) => void
	let reject!: (e: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

/** A browser that knows which windows are open: `remove` or `navigate` of a gone window rejects,
 *  and every removal reaches the listeners a turn later, as `chrome.windows.onRemoved` does. */
function fakeWindows() {
	const open = new Set<number>()
	const removed: number[] = []
	const created: Array<{ url?: string }> = []
	const navigated: Array<{ windowId: number; url: string }> = []
	const focused: number[] = []
	const listeners: Array<(id: number) => void> = []
	let nextId = 100
	/** Replaces the next navigation's outcome, once. */
	let nextNavigation: Promise<void> | undefined
	const fire = (id: number) => {
		void Promise.resolve().then(() => {
			for (const l of listeners) l(id)
		})
	}
	const port: WindowPort = {
		create: async (options) => {
			created.push(options)
			const id = nextId++
			open.add(id)
			return { id }
		},
		onRemoved: (listener) => {
			listeners.push(listener)
			return () => {}
		},
		remove: async (id) => {
			removed.push(id)
			if (!open.delete(id)) throw new Error(`No window with id: ${id}.`)
			fire(id)
		},
		update: async (id, options) => {
			if (options.focused) focused.push(id)
		},
		navigate: async (windowId, url) => {
			navigated.push({ windowId, url })
			const outcome = nextNavigation
			nextNavigation = undefined
			if (outcome) return outcome
			if (!open.has(windowId)) throw new Error(`No window with id: ${windowId}.`)
		},
		getLastFocused: async () => undefined,
	}
	const closeByUser = (id: number) => {
		if (open.delete(id)) fire(id)
	}
	const holdNextNavigation = (outcome: Promise<void>) => {
		nextNavigation = outcome
	}
	return { port, open, removed, created, navigated, focused, closeByUser, holdNextNavigation }
}

const chain = (n: number) => ({ chainInfo: { chainId: String(n), version: "0" } })

/** The operation journal as far as the queued row goes: created at `queued`, failed by kind. */
function fakeJournal() {
	const ops = new Map<string, { sessionId: string; stage: string; kind?: string }>()
	let seq = 0
	return {
		ops,
		countOperations: vi.fn(
			async (q: { sessionId?: string; stage?: string }) =>
				[...ops.values()].filter((op) => (q.sessionId ?? op.sessionId) === op.sessionId && (q.stage ?? op.stage) === op.stage)
					.length,
		),
		createOperation: vi.fn(async (args: { sessionId: string }) => {
			const id = `queued-${++seq}`
			ops.set(id, { sessionId: args.sessionId, stage: "queued" })
			return { id }
		}),
		transitionIfStage: vi.fn(async (id: string, stages: string[], next: { stage: string }, error?: { kind: string }) => {
			const op = ops.get(id)
			if (!op || !stages.includes(op.stage)) return
			op.stage = next.stage
			op.kind = error?.kind
		}),
	}
}

function boot(
	opts: { setCapabilityGrants?: () => Promise<unknown>; setVerificationHash?: () => Promise<unknown>; legal?: () => Promise<void> } = {},
) {
	const windows = fakeWindows()
	const popups = new Map<string, (answer: { approved: boolean; windowId?: number; expiredUrl?: string }) => void>()
	const asked = new Map<string, unknown>()
	const journal = fakeJournal()
	let activeProfile: { id: string } | undefined = { id: "p1" }
	/** Holds the next active-profile read, once: the execution fence's, for a read call. */
	let nextProfileRead: Promise<void> | undefined
	const { services, rows, onDappSessionDeleted, onVerificationRefused, onVerificationConfirmed, onActiveProfileChanged } =
		fakeSdkServices({
			popup: (params, requestId) => {
				asked.set(requestId, params)
				return new Promise((resolve) => popups.set(requestId, resolve))
			},
			activeProfile: async () => {
				const held = nextProfileRead
				nextProfileRead = undefined
				await held
				return activeProfile
			},
			setCapabilityGrants: opts.setCapabilityGrants,
			setVerificationHash: opts.setVerificationHash,
			operationJournal: journal,
			legal: opts.legal,
		})
	const handler = initWalletSdkHandler(services, noopLogger, fakeSdkPorts(windows.port))
	const discover = (requestId: string, over: Record<string, unknown> = {}) => {
		const discovery = { requestId, origin: ORIGIN, appId: "app", appName: "App", ...chain(1), timestamp: Date.now(), tabId: 7, ...over }
		discoveryTabs.set(requestId, discovery.tabId)
		discovered.set(requestId, { origin: discovery.origin, chainInfo: discovery.chainInfo })
		captured?.onPendingDiscovery(discovery)
	}
	/** The person clicks Allow in `requestId`'s connect window, which the browser knows as `windowId`. */
	const allow = (requestId: string, windowId: number) => {
		windows.open.add(windowId)
		popups.get(requestId)?.({ approved: true, windowId, expiredUrl: `EXPIRED-${requestId}` })
	}
	/** The SDK finished key exchange for `requestId`, under a fresh session object and hash. */
	const establish = async (requestId: string, over: Record<string, unknown> = {}) => {
		await captured?.onSessionEstablished(keyExchange(requestId, over))
	}
	/** The app sends `type` on `requestId`'s live session, or on the `session` object given. */
	const send = (requestId: string, type: string, messageId: string, session: Session | undefined = sessions.get(requestId)) =>
		captured?.onWalletMessage(session, { type, args: [], messageId })
	/** The check of the session whose hash is `verificationHash` reports They match. */
	const confirm = (verificationHash: string) => onVerificationConfirmed.invoke({ verificationHash })
	/** The check reports They don't match for the app's row on chain 1 under p1. */
	const refuse = () => onVerificationRefused.invoke({ origin: ORIGIN, chainId: String(chainInfoToChainId(chain(1))), profileId: "p1" })
	const lock = () => {
		activeProfile = undefined
		onActiveProfileChanged.invoke(undefined)
	}
	const switchProfile = (id: string) => {
		activeProfile = { id }
		onActiveProfileChanged.invoke({ id })
	}
	const holdNextProfileRead = (until: Promise<void>) => {
		nextProfileRead = until
	}
	const closeTab = (tabId: number) => {
		for (const l of tabRemoved) l(tabId)
	}
	const setProfile = (profile: { id: string } | undefined) => {
		activeProfile = profile
	}
	/** A row of the app on chain 1 under `profileId` went away. */
	const rowDeleted = (profileId: string) => onDappSessionDeleted.invoke({ dappMetadata: { url: ORIGIN }, chainId: "1", profileId })
	return {
		discover,
		allow,
		establish,
		send,
		confirm,
		refuse,
		lock,
		switchProfile,
		holdNextProfileRead,
		closeTab,
		setProfile,
		rowDeleted,
		handler,
		windows,
		rows,
		journal,
		asked,
	}
}

/** The hash of `requestId`'s live session. */
const hashOf = (requestId: string) => sessions.get(requestId)?.verificationHash ?? ""

/** Settle the handler's pending microtasks without moving the clock. */
const flush = async () => {
	for (let i = 0; i < 50; i++) await Promise.resolve()
}
const approved = () => handlerCalls.filter((c) => c.startsWith("approve:")).map((c) => c.slice(8))
const rejected = () => handlerCalls.filter((c) => c.startsWith("reject:")).map((c) => c.slice(7))
const terminated = () => handlerCalls.filter((c) => c.startsWith("terminate:")).map((c) => c.slice(10))
/** The worker's admission gate, as the handler admitted through it. */
const gate = () => admit.mock.contexts.at(-1) as VerifyAdmissionGate
/** The worker's pending-verification markers, as the approval wrote them. */
const markers = () =>
	vi.mocked(approveOrRollbackDiscoverySession).mock.calls.at(-1)?.[0].pendingVerification as Map<string, PendingVerificationEntry>

beforeEach(() => {
	vi.useFakeTimers()
	handlerCalls.length = 0
	sessions.clear()
	responses.length = 0
	failingTerminations.clear()
	keyExchanges.clear()
	discoveryTabs.clear()
	discovered.clear()
	droppedTabs.clear()
	tabRemoved.length = 0
	approveReturns = true
	decryptHook = () => Promise.resolve()
	nextResponse = undefined
	captured = undefined
	admit.mockClear()
	dispatch.mockClear()
	vi.mocked(approveOrRollbackDiscoverySession).mockClear()
	// biome-ignore lint/suspicious/noExplicitAny: chrome stub
	;(globalThis as any).chrome = {
		runtime: { getURL: (p: string) => p },
		tabs: {
			sendMessage: () => {},
			onRemoved: { addListener: (fn: (tabId: number) => void) => tabRemoved.push(fn) },
			onUpdated: { addListener: () => {} },
		},
		action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
	}
	// biome-ignore lint/suspicious/noExplicitAny: vite define-injected global
	;(globalThis as any).__VERSION__ = "test"
})
afterEach(() => vi.useRealTimers())

describe("the connect window before Allow", () => {
	test("is told the chain the discovery named, as the wallet decoded it", async () => {
		const h = boot()
		h.discover("f1", chain(5))
		await flush()

		expect(h.asked.get("f1")).toMatchObject({ chainId: String(chainInfoToChainId(chain(5))) })
		expect(String(chainInfoToChainId(chain(5)))).not.toBe(String(chainInfoToChainId(chain(1))))
	})
})

describe("the connect window after Allow", () => {
	test("an approved connection keeps its connect window as the check's standby window and creates none", async () => {
		const h = boot()
		h.discover("f1")
		await flush()
		h.allow("f1", 41)
		await flush()

		expect(approved()).toEqual(["f1"])
		expect(gate().reservation("f1")?.status).toBe("standby")
		expect(gate().reservation("f1")?.windowId).toBe(41)
		expect(markers().get("f1")?.tabId).toBe(7)
		expect(h.windows.created).toEqual([])
		expect(h.windows.removed).toEqual([])
	})

	test("an Allow past the discovery cutoff is rejected and its window closed", async () => {
		const h = boot()
		h.discover("f1", { timestamp: Date.now() - DISCOVERY_STALE_MS + 1_000 })
		await flush()
		await vi.advanceTimersByTimeAsync(2_000)
		h.allow("f1", 41)
		await flush()

		expect(rejected()).toEqual(["f1"])
		expect(approved()).toEqual([])
		expect(h.windows.removed).toEqual([41])
	})

	test("an Allow that meets another active profile is rejected and its window closed", async () => {
		const h = boot()
		h.discover("f1")
		await flush()
		h.setProfile({ id: "p2" })
		h.allow("f1", 41)
		await flush()

		expect(rejected()).toEqual(["f1"])
		expect(approved()).toEqual([])
		expect(h.windows.removed).toEqual([41])
		expect(gate().windowsHeld(ORIGIN)).toBe(0)
	})

	test("an approval that does not land closes the window and leaves no marker", async () => {
		const h = boot()
		approveReturns = false
		h.discover("f1")
		await flush()
		h.allow("f1", 41)
		await flush()

		expect(h.windows.removed).toEqual([41])
		expect(markers().has("f1")).toBe(false)
		expect(gate().windowsHeld(ORIGIN)).toBe(0)
	})

	test("a window closed while the approval's writes run: rejected, the row deleted, no marker set", async () => {
		const grants = deferred<undefined>()
		const h = boot({ setCapabilityGrants: () => grants.promise })
		h.discover("f1")
		await flush()
		h.allow("f1", 41)
		await flush()
		expect(h.rows.size).toBe(1)

		h.windows.closeByUser(41)
		await flush()
		grants.resolve(undefined)
		await flush()

		expect(rejected()).toEqual(["f1"])
		expect(approved()).toEqual([])
		expect(h.rows.size).toBe(0)
		expect(markers().has("f1")).toBe(false)
		expect(h.windows.removed).toEqual([])
	})

	test("the dApp's tab closing after the approval closes the window and deletes the marker", async () => {
		const h = boot()
		h.discover("f1")
		await flush()
		h.allow("f1", 41)
		await flush()
		expect(markers().has("f1")).toBe(true)

		h.closeTab(7)
		await flush()

		expect(h.windows.removed).toEqual([41])
		expect(markers().has("f1")).toBe(false)
		expect(gate().windowsHeld(ORIGIN)).toBe(0)
	})
})

describe("an Allow while the origin's two verification slots are held", () => {
	/** Two approved connections on standby windows 41 and 42, then a third Allow in window 43. */
	async function thirdAllowQueued(third: Record<string, unknown> = {}) {
		const h = boot()
		h.discover("f1", chain(1))
		h.discover("f2", chain(2))
		await flush()
		h.allow("f1", 41)
		h.allow("f2", 42)
		await flush()
		expect(approved()).toEqual(["f1", "f2"])
		h.discover("f3", { ...chain(3), ...third })
		await flush()
		h.allow("f3", 43)
		await flush()
		return h
	}

	test("keeps its window open while queued, and attaches it when a slot frees", async () => {
		const h = await thirdAllowQueued()
		expect(approved()).toEqual(["f1", "f2"])
		expect(gate().queued(ORIGIN)).toBe(1)
		expect(h.windows.removed).toEqual([])

		h.windows.closeByUser(41)
		await flush()

		expect(approved()).toEqual(["f1", "f2", "f3"])
		expect(gate().reservation("f3")?.status).toBe("standby")
		expect(h.windows.removed).toEqual([])
	})

	test("is rejected and its window closed when its discovery expires in the queue", async () => {
		const h = await thirdAllowQueued()
		await vi.advanceTimersByTimeAsync(DISCOVERY_STALE_MS + 1)

		expect(rejected()).toEqual(["f3"])
		expect(approved()).toEqual(["f1", "f2"])
		expect(h.windows.removed).toEqual([43])
	})

	test("whose window is closed while queued fails its attach when a slot frees, and is rejected", async () => {
		const h = await thirdAllowQueued()
		h.windows.closeByUser(43)
		await flush()
		h.windows.closeByUser(41)
		await flush()

		expect(rejected()).toEqual(["f3"])
		expect(approved()).toEqual(["f1", "f2"])
		expect(gate().windowsHeld(ORIGIN)).toBe(1)
	})

	test("whose dApp tab closes while it is queued has its window closed at once", async () => {
		const h = await thirdAllowQueued({ tabId: 9 })
		h.closeTab(9)
		await flush()
		expect(h.windows.removed).toEqual([43])

		h.windows.closeByUser(41)
		await flush()
		expect(rejected()).toEqual(["f3"])
		expect(approved()).toEqual(["f1", "f2"])
	})
})

describe("an approved connection whose key exchange never completes", () => {
	test("keeps its window on the expired page and its slot, tombstones at once, and opens no window when it establishes late", async () => {
		const h = boot()
		h.discover("f1")
		await flush()
		h.allow("f1", 41)
		await flush()

		await vi.advanceTimersByTimeAsync(DISCOVERY_STALE_MS + RESERVATION_GRACE_MS + 1)
		expect(h.windows.navigated).toEqual([{ windowId: 41, url: "EXPIRED-f1" }])
		expect(h.windows.removed).toEqual([])
		expect(markers().get("f1")?.cancelled).toBe(true)
		expect(gate().windowsHeld(ORIGIN)).toBe(1)

		await h.establish("f1")
		expect(terminated()).toEqual(["f1"])
		expect(h.windows.created).toEqual([])
		expect(h.windows.navigated).toHaveLength(1)

		h.windows.closeByUser(41)
		await flush()
		expect(gate().windowsHeld(ORIGIN)).toBe(0)
	})
})

describe("a deleted row while an approved handshake is not stamped yet", () => {
	test.each([
		["another profile's row keeps the handshake", "p2", []],
		["the approving profile's row ends it and tombstones its marker", "p1", ["f1"]],
	])("%s", async (_name, profileId, ended) => {
		const h = boot()
		h.discover("f1")
		await flush()
		h.allow("f1", 41)
		await flush()
		// Key exchange is done, so the SDK lists the session; establishment has not stamped it.
		keyExchange("f1")

		h.rowDeleted(profileId)

		expect(terminated()).toEqual(ended)
		expect(markers().get("f1")?.cancelled).toBe(ended.length > 0 ? true : undefined)
	})
})

describe("establishment shows the check in the connect window", () => {
	/** One approved connection for `requestId` waiting in `windowId`. */
	async function approvedIn(h: ReturnType<typeof boot>, requestId: string, windowId: number, over: Record<string, unknown> = {}) {
		h.discover(requestId, over)
		await flush()
		h.allow(requestId, windowId)
		await flush()
	}

	test("the approved connection navigates window 41 to its own hash and creates no window", async () => {
		const h = boot()
		await approvedIn(h, "f1", 41)
		await h.establish("f1")

		expect(h.windows.navigated).toHaveLength(1)
		expect(h.windows.navigated[0].windowId).toBe(41)
		expect(h.windows.navigated[0].url).toContain(`verificationHash=${hashOf("f1")}&isReconnect=false`)
		expect(h.windows.focused).toEqual([41])
		expect(h.windows.created).toEqual([])
		expect(terminated()).toEqual([])
		expect(markers().has("f1")).toBe(false)
	})

	test("two origins connecting at once, established in reverse order, each get their own grid in their own window", async () => {
		const h = boot()
		await approvedIn(h, "a1", 41)
		await approvedIn(h, "b1", 42, { origin: OTHER_ORIGIN, tabId: 8 })
		await h.establish("b1", { origin: OTHER_ORIGIN })
		await h.establish("a1")

		expect(h.windows.navigated.map((n) => n.windowId)).toEqual([42, 41])
		expect(h.windows.navigated[0].url).toContain(`verificationHash=${hashOf("b1")}`)
		expect(h.windows.navigated[1].url).toContain(`verificationHash=${hashOf("a1")}`)
		expect(h.windows.created).toEqual([])
		expect(terminated()).toEqual([])
	})

	test("the twin of a pending popup opens its own window with its own hash while 41 shows the first's", async () => {
		const h = boot()
		h.discover("f1")
		await flush()
		h.discover("twin")
		await flush()
		h.allow("f1", 41)
		await flush()
		expect(approved()).toEqual(["f1", "twin"])

		await h.establish("f1")
		await h.establish("twin")

		expect(h.windows.navigated).toHaveLength(1)
		expect(h.windows.navigated[0].url).toContain(`verificationHash=${hashOf("f1")}`)
		expect(h.windows.created).toHaveLength(1)
		expect(h.windows.created[0].url).toContain(`verificationHash=${hashOf("twin")}&isReconnect=true`)
		expect(terminated()).toEqual([])
	})

	test("the window closed after the approval terminates the session on establishment and keeps the row", async () => {
		const h = boot()
		await approvedIn(h, "f1", 41)
		h.windows.closeByUser(41)
		await flush()
		await h.establish("f1")

		expect(terminated()).toEqual(["f1"])
		expect(h.windows.navigated).toEqual([])
		expect(h.windows.created).toEqual([])
		expect(h.rows.size).toBe(1)
	})

	/** A sendTx from `f1`, whose row could journal and dispatch it, arrives while its check loads in 41. */
	async function sendTxWhileNavigating(h: ReturnType<typeof boot>, settle: (navigation: ReturnType<typeof deferred<void>>) => void) {
		await approvedIn(h, "f1", 41)
		Object.assign([...h.rows.values()][0], {
			accounts: [`aztec:1:${FAKE_SENDER}`],
			capabilityGrants: [{ capability: { type: "transaction", scope: "*" } }],
		})
		const navigation = deferred<void>()
		h.windows.holdNextNavigation(navigation.promise)
		const establishing = h.establish("f1")
		await vi.waitFor(() => expect(h.windows.navigated).toHaveLength(1))

		h.send("f1", "sendTx", "m1")
		settle(navigation)
		await establishing
		await flush()
	}

	test("a sendTx arriving while the check loads is journaled at once and dispatched once the check is confirmed", async () => {
		const h = boot()
		dispatch.mockResolvedValueOnce(undefined)
		await sendTxWhileNavigating(h, (navigation) => navigation.resolve())
		expect(h.journal.createOperation).toHaveBeenCalledTimes(1)
		expect(dispatch).not.toHaveBeenCalled()

		h.confirm(hashOf("f1"))
		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
		expect(dispatch.mock.calls[0][0]).toBe("sendTx")
		expect(h.journal.createOperation).toHaveBeenCalledTimes(1)
		expect(terminated()).toEqual([])
	})

	test("a batch holding a sendTx leg is refused before any leg runs and files no queued record, unlike a lone sendTx", async () => {
		const h = boot()
		dispatch.mockResolvedValueOnce(undefined)
		await sendTxWhileNavigating(h, (navigation) => navigation.resolve())
		h.confirm(hashOf("f1"))
		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
		expect(h.journal.createOperation).toHaveBeenCalledTimes(1)

		captured?.onWalletMessage(sessions.get("f1"), { type: "batch", args: [[{ name: "sendTx", args: [] }]], messageId: "m2" })
		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2))

		await expect(dispatch.mock.results[1].value).rejects.toThrow(
			'Method "sendTx" cannot be used inside batch — it requires a confirmation popup',
		)
		expect(h.journal.createOperation).toHaveBeenCalledTimes(1)
	})

	test("a sendTx arriving while the navigation fails is never dispatched and never journaled", async () => {
		const h = boot()
		await sendTxWhileNavigating(h, (navigation) => navigation.reject(new Error("No tab with id: 314.")))

		expect(terminated()).toEqual(["f1"])
		expect(dispatch).not.toHaveBeenCalled()
		expect(h.journal.createOperation).not.toHaveBeenCalled()
		expect(h.windows.removed).toEqual([41])
	})

	// An expired slot keeps its window open on the expired page; a lock closed the window itself.
	const abandonments: Array<[string, (h: ReturnType<typeof boot>) => Promise<void>, boolean]> = [
		[
			"its slot expired",
			async () => {
				await vi.advanceTimersByTimeAsync(DISCOVERY_STALE_MS + RESERVATION_GRACE_MS + 1)
				await flush()
			},
			true,
		],
		[
			"a lock closed its window",
			async (h) => {
				h.windows.closeByUser(41)
				await flush()
			},
			false,
		],
	]

	test.each(abandonments)(
		"an attempt abandoned because %s never establishes, even once a sibling trusts the row",
		async (_, abandon, kept) => {
			const h = boot()
			await approvedIn(h, "f1", 41)
			await abandon(h)
			expect(markers().get("f1")?.cancelled).toBe(true)
			expect(h.windows.open.has(41)).toBe(kept)

			// A new discovery from the origin is a reconnect: its own window, since the row is untrusted.
			h.discover("r2")
			await flush()
			await h.establish("r2")
			expect(h.windows.created).toHaveLength(1)
			expect(h.windows.created[0].url).toContain(`verificationHash=${hashOf("r2")}&isReconnect=true`)

			// A sibling's check set "Skip this check next time" on the row the abandoned attempt wrote.
			const row = [...h.rows.values()][0]
			row.trustedVerification = true
			await h.establish("f1")
			await h.establish("f1")
			expect(terminated()).toEqual(["f1", "f1"])
			// No check is ever loaded for f1: the only navigation is the expired page.
			expect(h.windows.navigated).toEqual(kept ? [{ windowId: 41, url: "EXPIRED-f1" }] : [])
			expect(h.windows.created).toHaveLength(1)

			// The trusted skip is unchanged for a new request id.
			h.discover("r3")
			await flush()
			await h.establish("r3")
			expect(terminated()).toEqual(["f1", "f1"])
			expect(h.windows.created).toHaveLength(1)
		},
	)
})

describe("an app's calls wait for the person to confirm the check", () => {
	const CHAIN = String(chainInfoToChainId(chain(1)))
	/** The app's remembered row on chain 1 under p1, sharing `FAKE_SENDER` with a transaction grant. */
	const remember = (h: ReturnType<typeof boot>, trusted: boolean) =>
		h.rows.set(`${ORIGIN}|${CHAIN}`, {
			id: "row-1",
			profileId: "p1",
			chainId: CHAIN,
			trustedVerification: trusted,
			accounts: [`aztec:${CHAIN}:${FAKE_SENDER}`],
			capabilityGrants: [{ capability: { type: "transaction", scope: "*" } as { type: string } }],
		})
	/** A reconnect of the remembered app on `requestId`, which shows its own check unless the row is trusted. */
	async function reconnect(h: ReturnType<typeof boot>, requestId: string) {
		h.discover(requestId)
		await flush()
		await h.establish(requestId)
		await settle()
	}
	/** The session ends, its check window closes, and the page key-exchanges the same id again. */
	async function rekey(h: ReturnType<typeof boot>, requestId: string, checkWindow: number) {
		h.handler.terminateSession(requestId)
		h.windows.closeByUser(checkWindow)
		await settle()
		await reconnect(h, requestId)
	}
	/** Enough turns for a released call to reach the dispatcher; each control proves it with the same count. */
	const settle = async () => {
		for (let i = 0; i < 300; i++) await Promise.resolve()
	}
	const dispatched = () => dispatch.mock.calls.map(([method, , ctx]) => `${(ctx as { sessionId: string }).sessionId}:${method}`)
	const row = (h: ReturnType<typeof boot>, n = 1) => h.journal.ops.get(`queued-${n}`)
	/** The first verify window the fake browser created. */
	const FIRST_CHECK_WINDOW = 100

	beforeEach(() => {
		dispatch.mockImplementation(async () => "ok")
	})
	afterEach(() => dispatch.mockReset())

	test("calls sent while the check shows wait, then run in arrival order once it is confirmed; a later call runs at once", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "r1")
		expect(h.windows.created).toHaveLength(1)
		h.send("r1", "getChainInfo", "a")
		h.send("r1", "sendTx", "s")
		h.send("r1", "getAccounts", "b")
		await settle()
		expect(row(h)?.stage).toBe("queued")
		expect(dispatched()).toEqual([])

		h.confirm(hashOf("r1"))
		await settle()
		expect(dispatched()).toEqual(["r1:getChainInfo", "r1:sendTx", "r1:getAccounts"])
		h.send("r1", "getAddressBook", "c")
		await settle()
		expect(dispatched()).toEqual(["r1:getChainInfo", "r1:sendTx", "r1:getAccounts", "r1:getAddressBook"])
		expect(terminated()).toEqual([])
	})

	test("control: a trusted reconnect shows no check and runs the same calls with no confirmation", async () => {
		const h = boot()
		remember(h, true)
		await reconnect(h, "r1")
		expect(h.windows.created).toEqual([])
		h.send("r1", "getChainInfo", "a")
		h.send("r1", "sendTx", "s")
		h.send("r1", "getAccounts", "b")
		await settle()
		expect(dispatched()).toEqual(["r1:getChainInfo", "r1:sendTx", "r1:getAccounts"])
		h.send("r1", "getAddressBook", "c")
		await settle()
		expect(dispatched()).toHaveLength(4)
	})

	test("They don't match ends the session; its calls never run and the held send's row is refused", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "r1")
		h.send("r1", "getChainInfo", "a")
		h.send("r1", "sendTx", "s")
		await settle()
		h.refuse()
		await settle()
		expect(terminated()).toEqual(["r1"])
		expect(dispatched()).toEqual([])
		expect(responses).toEqual([])
		expect(row(h)).toEqual({ sessionId: "r1", stage: "failed", kind: "wallet_refused" })
	})

	test("closing the check keeps the calls held; the tab closing then ends the session and refuses the row", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "r1")
		h.send("r1", "sendTx", "s")
		await settle()
		h.windows.closeByUser(FIRST_CHECK_WINDOW)
		await settle()
		expect(terminated()).toEqual([])
		expect(row(h)?.stage).toBe("queued")

		h.closeTab(7)
		await settle()
		expect(terminated()).toEqual(["r1"])
		expect(dispatched()).toEqual([])
		expect(row(h)?.kind).toBe("wallet_refused")
	})

	test("a lock ends only the session whose check is unanswered, and its held send's row reads the lock", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "c1")
		h.confirm(hashOf("c1"))
		await reconnect(h, "h1")
		h.send("h1", "sendTx", "s")
		await settle()

		h.lock()
		await settle()
		expect(terminated()).toEqual(["h1"])
		expect(sessions.has("c1")).toBe(true)
		expect(row(h)?.kind).toBe("session_ended")
		expect(dispatched()).toEqual([])
	})

	test("an establishment that fails with no termination, its id's approval taken by another attempt, settles its hold: a lock ends nothing", async () => {
		const h = boot()
		h.discover("f1")
		await flush()
		h.allow("f1", 41)
		await flush()
		const establishing = h.establish("f1")
		markers().set("f1", { ...markers().get("f1")! })
		await establishing
		await settle()
		expect(terminated()).toEqual([])
		expect(sessions.has("f1")).toBe(true)

		h.lock()
		await settle()
		expect(terminated()).toEqual([])
	})

	test("a lock whose first termination throws still drops the other held session's calls", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "h1")
		await reconnect(h, "h2")
		h.send("h1", "sendTx", "s1")
		h.send("h2", "sendTx", "s2")
		await settle()
		failingTerminations.add("h1")

		h.lock()
		await settle()
		expect(terminated()).toEqual(["h1", "h2"])
		expect([row(h, 1)?.kind, row(h, 2)?.kind]).toEqual(["session_ended", "session_ended"])
		expect(dispatched()).toEqual([])
	})

	test("a direct switch to another profile ends the held session through the switch teardown", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "r1")
		h.send("r1", "sendTx", "s")
		await settle()
		h.switchProfile("p2")
		await settle()
		expect(terminated()).toEqual(["r1"])
		expect(dispatched()).toEqual([])
		expect(row(h)?.kind).toBe("wallet_refused")
	})

	test("two checks for one app hold independently: each hash releases only its own session's calls", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "r1")
		await reconnect(h, "r2")
		h.send("r1", "getChainInfo", "a1")
		h.send("r2", "getChainInfo", "a2")
		await settle()
		h.confirm(hashOf("r2"))
		await settle()
		expect(dispatched()).toEqual(["r2:getChainInfo"])
		h.confirm(hashOf("r1"))
		await settle()
		expect(dispatched()).toEqual(["r2:getChainInfo", "r1:getChainInfo"])
	})

	test("past 32 held calls the next is answered -32005 before any row; the 32 run after the confirmation", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "r1")
		for (let i = 0; i < 32; i++) h.send("r1", "getChainInfo", `m${i}`)
		h.send("r1", "sendTx", "over")
		// The refusal is queued on the session's decrypt lane, so it goes out a few turns later.
		await flush()
		expect(responses).toEqual([
			{
				sessionId: "r1",
				response: expect.objectContaining({
					messageId: "over",
					error: expect.objectContaining({ code: -32005, data: { walletErrorCode: "TOO_MANY_PENDING" } }),
				}),
			},
		])
		await settle()
		expect(h.journal.createOperation).not.toHaveBeenCalled()

		h.confirm(hashOf("r1"))
		await vi.waitFor(() => expect(dispatched()).toHaveLength(32))
		expect(dispatched()).not.toContain("r1:sendTx")
	})

	test("a hold dropped while the held send's row is still being written fails that row once the write lands", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "r1")
		const write = deferred<void>()
		const create = h.journal.createOperation.getMockImplementation()!
		h.journal.createOperation.mockImplementationOnce(async (args) => {
			await write.promise
			return create(args)
		})
		h.send("r1", "sendTx", "s")
		await settle()
		expect(h.journal.createOperation).toHaveBeenCalledTimes(1)
		h.refuse()
		await settle()

		write.resolve()
		await settle()
		expect(row(h)?.kind).toBe("wallet_refused")
		expect(dispatched()).toEqual([])
	})

	test("the app's row deleted while its calls wait ends the session and refuses the held send", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "r1")
		h.send("r1", "sendTx", "s")
		await settle()
		h.rowDeleted("p1")
		await settle()
		expect(terminated()).toEqual(["r1"])
		expect(dispatched()).toEqual([])
		expect(row(h)?.kind).toBe("wallet_refused")
	})

	test.each([
		["They don't match", (h: ReturnType<typeof boot>) => h.refuse()],
		["the row deleted", (h: ReturnType<typeof boot>) => h.rowDeleted("p1")],
		["a direct switch to another profile", (h: ReturnType<typeof boot>) => h.switchProfile("p2")],
	])(
		"%s whose termination throws still refuses the held send; the live session's later calls run nothing and file nothing",
		async (_, end) => {
			const h = boot()
			remember(h, false)
			await reconnect(h, "r1")
			const held = hashOf("r1")
			h.send("r1", "sendTx", "s1")
			await settle()
			failingTerminations.add("r1")

			end(h)
			await settle()
			expect(sessions.has("r1")).toBe(true)
			expect(row(h)?.kind).toBe("wallet_refused")
			h.confirm(held)
			h.send("r1", "sendTx", "s2")
			await settle()
			expect(dispatched()).toEqual([])
			expect([...h.journal.ops.keys()]).toEqual(["queued-1"])
		},
	)

	test.each([
		["completes", (write: ReturnType<typeof deferred<undefined>>) => write.resolve(undefined)],
		["fails", (write: ReturnType<typeof deferred<undefined>>) => write.reject(new Error("the profile is locked"))],
	])(
		"an establishment whose hash write %s after a lock, an unlock into another profile and a same-id re-key leaves the successor alone",
		async (_, finish) => {
			const firstWrite = deferred<undefined>()
			let writes = 0
			const h = boot({ setVerificationHash: () => (++writes === 1 ? firstWrite.promise : Promise.resolve()) })
			remember(h, false)
			h.discover("r1")
			await flush()
			const stale = h.establish("r1")
			await settle()
			h.lock()
			await settle()
			// The person unlocks another profile, which has its own row for the app.
			h.rows.set(`${ORIGIN}|${CHAIN}`, { ...h.rows.get(`${ORIGIN}|${CHAIN}`)!, profileId: "p2" })
			h.switchProfile("p2")
			await reconnect(h, "r1")
			const successor = sessions.get("r1")
			h.send("r1", "getChainInfo", "a")

			finish(firstWrite)
			await stale
			await settle()
			expect(sessions.get("r1")).toBe(successor)
			expect(terminated()).toEqual(["r1"])
			expect(dispatched()).toEqual([])
			h.confirm(hashOf("r1"))
			await settle()
			expect(dispatched()).toEqual(["r1:getChainInfo"])
			expect(terminated()).toEqual(["r1"])
		},
	)

	test("a send decrypted for an ended session files nothing and runs nothing on the session that re-keyed its id", async () => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "r1")
		const ended = sessions.get("r1")
		await rekey(h, "r1", FIRST_CHECK_WINDOW)
		h.confirm(hashOf("r1"))
		await settle()

		h.send("r1", "sendTx", "late", ended)
		await settle()
		expect(h.journal.createOperation).not.toHaveBeenCalled()
		expect(dispatched()).toEqual([])
		expect(responses).toEqual([])
		h.send("r1", "sendTx", "own")
		await settle()
		expect(h.journal.createOperation).toHaveBeenCalledTimes(1)
		expect(dispatched()).toEqual(["r1:sendTx"])
	})

	test("a call parked behind a confirmed session's slow call never runs on the session that re-keys its id", async () => {
		const legal = vi.fn(async () => undefined)
		const h = boot({ legal })
		remember(h, false)
		await reconnect(h, "r1")
		h.confirm(hashOf("r1"))
		const slow = deferred<unknown>()
		dispatch.mockImplementationOnce(() => slow.promise as never)
		h.send("r1", "getChainInfo", "first")
		h.send("r1", "sendTx", "parked")
		await settle()
		expect(dispatched()).toEqual(["r1:getChainInfo"])

		await rekey(h, "r1", FIRST_CHECK_WINDOW)
		const termsReads = legal.mock.calls.length
		slow.resolve("ok")
		await settle()
		expect(dispatched()).toEqual(["r1:getChainInfo"])
		expect(responses).toEqual([])
		expect(row(h)?.kind).toBe("wallet_refused")
		// Dropped as soon as the FIFO reaches it, before it reads anything for a session that is gone.
		expect(legal.mock.calls.length).toBe(termsReads)

		h.send("r1", "getAccounts", "own")
		h.confirm(hashOf("r1"))
		await settle()
		expect(dispatched()).toEqual(["r1:getChainInfo", "r1:getAccounts"])
	})

	test.each([
		["ends and its id re-keys", true],
		["stays live (control)", false],
	])("a confirmed session's call paused in the Terms read while the session %s", async (_, rekeyed) => {
		let nextRead: Promise<void> | undefined
		const h = boot({
			legal: () => {
				const held = nextRead
				nextRead = undefined
				return held ?? Promise.resolve()
			},
		})
		remember(h, false)
		await reconnect(h, "r1")
		h.confirm(hashOf("r1"))
		const read = deferred<void>()
		nextRead = read.promise
		h.send("r1", "sendTx", "s")
		await settle()
		expect(dispatched()).toEqual([])

		if (rekeyed) await rekey(h, "r1", FIRST_CHECK_WINDOW)
		read.resolve()
		await settle()
		expect(dispatched()).toEqual(rekeyed ? [] : ["r1:sendTx"])
		expect(responses.map((r) => r.response.messageId)).toEqual(rekeyed ? [] : ["s"])
		expect(row(h)?.kind).toBe(rekeyed ? "wallet_refused" : undefined)
	})

	test.each([
		["ends and its id re-keys", true],
		["stays live (control)", false],
	])("a profile mismatch found after the fence read, while the session %s", async (_, rekeyed) => {
		const h = boot()
		remember(h, false)
		await reconnect(h, "r1")
		h.confirm(hashOf("r1"))
		const fence = deferred<void>()
		h.holdNextProfileRead(fence.promise)
		h.send("r1", "getChainInfo", "g")
		await settle()

		if (rekeyed) await rekey(h, "r1", FIRST_CHECK_WINDOW)
		const successor = sessions.get("r1")
		h.setProfile({ id: "p2" })
		fence.resolve()
		await settle()
		expect(dispatched()).toEqual([])
		if (rekeyed) {
			expect(responses).toEqual([])
			expect(terminated()).toEqual(["r1"])
			expect(sessions.get("r1")).toBe(successor)
		} else {
			expect(responses).toEqual([
				{ sessionId: "r1", response: expect.objectContaining({ messageId: "g", error: SESSION_INVALID_ERROR }) },
			])
			expect(terminated()).toEqual(["r1"])
			expect(sessions.has("r1")).toBe(false)
		}
	})

	describe("a session's pending calls are bounded", () => {
		const refusedIds = () => responses.filter((r) => r.response.error?.code === -32005).map((r) => r.response.messageId)
		/** A secure message reaching the handler, as the content relay hands it over. */
		const post = (h: ReturnType<typeof boot>, requestId: string, encrypted: string) =>
			(h.handler as unknown as { handleEncryptedMessage(id: string, enc: unknown): Promise<void> }).handleEncryptedMessage(
				requestId,
				encrypted,
			)
		async function confirmedSession(h: ReturnType<typeof boot>, requestId: string) {
			await reconnect(h, requestId)
			h.confirm(hashOf(requestId))
			await settle()
		}
		/** The bound's worth of calls in flight on `requestId`: its head waits in dispatch, the rest behind it. */
		async function fillToBound(h: ReturnType<typeof boot>, requestId: string) {
			dispatch.mockImplementationOnce(() => new Promise(() => {}))
			h.send(requestId, "getChainInfo", `${requestId}-head`)
			for (let i = 1; i < MAX_PENDING_PER_SESSION; i++) h.send(requestId, "getAccounts", `${requestId}-${i}`)
			await settle()
		}
		const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

		test("a confirmed session whose head waits in dispatch admits 31 more, answers the next -32005 with no row, and frees a slot when the head fails", async () => {
			const h = boot()
			remember(h, false)
			await confirmedSession(h, "r1")
			await confirmedSession(h, "r2")
			const head = deferred<unknown>()
			dispatch.mockImplementationOnce(() => head.promise as never)
			h.send("r1", "getChainInfo", "head")
			h.send("r1", "sendTx", "admitted")
			for (let i = 0; i < MAX_PENDING_PER_SESSION - 2; i++) h.send("r1", "getAccounts", `m${i}`)
			await settle()
			h.send("r1", "sendTx", "over")
			h.send("r2", "getChainInfo", "other")
			await settle()
			expect(refusedIds()).toEqual(["over"])
			expect(h.journal.createOperation).toHaveBeenCalledTimes(1)
			expect(row(h)?.stage).toBe("queued")
			expect(dispatched()).toEqual(["r1:getChainInfo", "r2:getChainInfo"])

			// The admitted send then holds the FIFO, so the head's failure frees exactly its own slot.
			dispatch.mockImplementationOnce(() => new Promise(() => {}))
			head.reject(new Error("node unreachable"))
			await settle()
			expect(dispatched()).toEqual(["r1:getChainInfo", "r2:getChainInfo", "r1:sendTx"])
			h.send("r1", "getAccounts", "next")
			h.send("r1", "getAccounts", "over-again")
			await settle()
			expect(refusedIds()).toEqual(["over", "over-again"])
		})

		test("a send past its FIFO release keeps its slot until it is answered", async () => {
			const h = boot()
			remember(h, false)
			await confirmedSession(h, "r1")
			dispatch
				.mockImplementationOnce((_method, _args, _ctx, hooks) => {
					hooks?.onExecutionEnqueued?.()
					return new Promise(() => {})
				})
				.mockImplementationOnce(() => new Promise(() => {}))
			h.send("r1", "sendTx", "s")
			for (let i = 1; i < MAX_PENDING_PER_SESSION; i++) h.send("r1", "getAccounts", `m${i}`)
			await settle()
			expect(dispatched()).toEqual(["r1:sendTx", "r1:getAccounts"])

			h.send("r1", "getAccounts", "over")
			await settle()
			expect(refusedIds()).toEqual(["over"])
		})

		test("with a session's head decrypt held, 32 more wait and the next is dropped, never decrypted or answered", async () => {
			const h = boot()
			remember(h, true)
			await reconnect(h, "r1")
			const head = deferred<void>()
			const decrypted: unknown[] = []
			decryptHook = async (_id, encrypted) => {
				decrypted.push(encrypted)
				if (encrypted === "head") await head.promise
			}
			const queued = range("c", MAX_PENDING_PER_SESSION)
			void post(h, "r1", "head")
			for (const c of queued) void post(h, "r1", c)
			void post(h, "r1", "over")
			head.resolve()
			await settle()
			expect(decrypted).toEqual(["head", ...queued])
			expect(responses).toEqual([])

			void post(h, "r1", "after")
			await settle()
			expect(decrypted.at(-1)).toBe("after")
		})

		test("control: an id that re-keys while its old lane is full and held decrypts its successor's message at once", async () => {
			const h = boot()
			remember(h, true)
			await reconnect(h, "r1")
			const head = deferred<void>()
			const decrypted: unknown[] = []
			decryptHook = async (_id, encrypted) => {
				decrypted.push(encrypted)
				if (encrypted === "head") await head.promise
			}
			const queued = range("c", MAX_PENDING_PER_SESSION)
			void post(h, "r1", "head")
			for (const c of queued) void post(h, "r1", c)

			await rekey(h, "r1", FIRST_CHECK_WINDOW)
			void post(h, "r1", "successor")
			await settle()
			expect(decrypted).toEqual(["head", "successor"])
			head.resolve()
			await settle()
			expect(decrypted).toEqual(["head", "successor", ...queued])
		})

		test("at the bound, a refusal appended while a decrypt runs still goes out: every decrypted call is answered, the dropped one never", async () => {
			const h = boot()
			remember(h, false)
			await confirmedSession(h, "r1")
			await fillToBound(h, "r1")
			const first = deferred<void>()
			const decrypted: unknown[] = []
			decryptHook = async (id, encrypted) => {
				decrypted.push(encrypted)
				if (encrypted === "d0") await first.promise
				captured?.onWalletMessage(sessions.get(id), { type: "getChainInfo", args: [], messageId: encrypted })
			}
			const behind = range("q", MAX_PENDING_PER_SESSION)
			void post(h, "r1", "d0")
			for (const q of behind) void post(h, "r1", q)
			void post(h, "r1", "dropped")
			first.resolve()
			await settle()
			expect(decrypted).toEqual(["d0", ...behind])
			expect(refusedIds()).toEqual(["d0", ...behind])
		})

		test("a held refusal reply takes the lane's turn, so 32 ciphertexts fill it; a reply that fails still lets the lane advance", async () => {
			const h = boot()
			remember(h, false)
			await confirmedSession(h, "r1")
			await fillToBound(h, "r1")
			const reply = deferred<void>()
			nextResponse = reply.promise
			h.send("r1", "getChainInfo", "over")
			await settle()
			expect(refusedIds()).toEqual(["over"])
			const decrypted: unknown[] = []
			decryptHook = async (_id, encrypted) => {
				decrypted.push(encrypted)
			}
			const queued = range("c", MAX_PENDING_PER_SESSION)
			for (const c of queued) void post(h, "r1", c)
			void post(h, "r1", "dropped")
			await settle()
			expect(decrypted).toEqual([])

			reply.reject(new Error("tab gone"))
			await settle()
			expect(decrypted).toEqual(queued)
		})

		test("a refusal queued behind a held decrypt sends nothing once its id re-keys; the successor's refusal is sent", async () => {
			const h = boot()
			remember(h, false)
			await confirmedSession(h, "r1")
			await fillToBound(h, "r1")
			const held = deferred<void>()
			decryptHook = (_id, encrypted) => (encrypted === "held" ? held.promise : Promise.resolve())
			void post(h, "r1", "held")
			h.send("r1", "getChainInfo", "old-over")
			await settle()
			expect(responses).toEqual([])

			await rekey(h, "r1", FIRST_CHECK_WINDOW)
			h.confirm(hashOf("r1"))
			await settle()
			await fillToBound(h, "r1")
			h.send("r1", "getChainInfo", "new-over")
			await settle()
			expect(refusedIds()).toEqual(["new-over"])

			held.resolve()
			await settle()
			expect(refusedIds()).toEqual(["new-over"])
		})
	})
})
