/**
 * The incoming-trust prompt queue that PopupManager hosts.
 *
 * The IncomingTransferService can emit a burst of Pending events (a replay on reconnect covers
 * every pending contract), but the popup shows one prompt at a time. These tests pin each guard
 * of the queue (live-identity ingress, triple dedup, dequeue checks, closure binding, purges,
 * the visibility gate, replay idempotency) and the listener lifecycle around mount and unmount.
 * Handler `remove` mocks splice by identity, so a deregistration of the wrong function shows.
 */

import { type VueWrapper, flushPromises, mount as rawMount } from "@vue/test-utils"
import { reactive } from "vue"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// ── Reactive store stand-ins ────────────────────────────────────────────
//
// Real Pinia would also work but adds setup mass. The watcher inside
// PopupManager watches `popupStore.isOpened("incoming_trust")`, which is
// reactive via reading `target in popupsState` on each tracker tick — so
// a reactive() proxy here is enough to drive the close→dequeue cycle.

interface IncomingTrustState {
	tokenSymbol?: string
	tokenDecimals?: number
	amountRaw?: string
	contract?: string
	profileId?: string
	networkId?: string
	accountAddress?: string
	allow?: () => Promise<void>
	reject?: () => Promise<void>
}

const popupsState: Record<string, { order: number; payload?: unknown }> = reactive({})
const cacheState: { incomingTrust: IncomingTrustState } = reactive({ incomingTrust: {} })

const popupStore = {
	get popups() {
		return popupsState
	},
	get len() {
		return Object.keys(popupsState).length
	},
	isOpened: (target: string) => target in popupsState,
	open: (target: string) => {
		popupsState[target] = { order: Object.keys(popupsState).length }
	},
	close: (target: string) => {
		if (target in popupsState) delete popupsState[target]
	},
	getPayload: (target: string) => popupsState[target]?.payload,
}

// ── Captured listener bus ───────────────────────────────────────────────

interface PendingPayload {
	profileId: string
	networkId: string
	accountAddress: string
	contract: string
	tokenId: number
	tokenSymbol: string
	tokenDecimals: number
	amountRaw: string
}

interface TrustChangedPayload {
	profileId: string
	networkId: string
	contract: string
	state: "unknown" | "pending" | "trusted" | "blocked"
	updatedAt?: number
}

const incomingPendingHandlers: Array<(p: PendingPayload) => void | Promise<void>> = []
const incomingTrustChangedHandlers: Array<(p: TrustChangedPayload) => void | Promise<void>> = []
const configUpdateHandlers: Array<(p: { key: string; value: unknown }) => void> = []
const incomingConnectedHandlers: Array<() => void | Promise<void>> = []

/** Ordered log of the lifecycle calls both clients receive. */
const calls: string[] = []
let incomingConnectImpl: () => Promise<void> = () => Promise.resolve()
let configConnectImpl: () => Promise<void> = () => Promise.resolve()

function bus<T>(name: string, handlers: T[]) {
	return {
		add: (h: T) => {
			calls.push(`${name}.add`)
			handlers.push(h)
		},
		remove: (h: T) => {
			calls.push(`${name}.remove`)
			const idx = handlers.indexOf(h)
			if (idx >= 0) handlers.splice(idx, 1)
		},
	}
}

const setTrustAllow = vi.fn().mockResolvedValue(undefined)
const setTrustReject = vi.fn().mockResolvedValue(undefined)
const replayPendingPrompts = vi.fn().mockResolvedValue(undefined)

vi.mock("@/wallet/services/incoming-transfer/client", () => ({
	IncomingTransferServiceClient: vi.fn(function () {
		return {
			onIncomingTransferPending: bus("pending", incomingPendingHandlers),
			onIncomingTrustChanged: bus("trustChanged", incomingTrustChangedHandlers),
			onConnected: bus("connected", incomingConnectedHandlers),
			connect: vi.fn(() => {
				calls.push("incoming.connect")
				return incomingConnectImpl()
			}),
			disconnect: vi.fn(() => calls.push("incoming.disconnect")),
			setTrustAllow,
			setTrustReject,
			replayPendingPrompts,
		}
	}),
}))

// Controllable getValue resolver for the seed-race tests. Tests can swap
// this to a deferred to simulate the connect-vs-seed window.
let configGetValueImpl: () => Promise<boolean> = () => Promise.resolve(true)
const configUpdateRemoveSpy = vi.fn()
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return {
			onUpdate: {
				add: (h: (p: { key: string; value: unknown }) => void) => {
					calls.push("config.add")
					configUpdateHandlers.push(h)
				},
				remove: (h: (p: { key: string; value: unknown }) => void) => {
					calls.push("config.remove")
					configUpdateRemoveSpy(h)
					const idx = configUpdateHandlers.indexOf(h)
					if (idx >= 0) configUpdateHandlers.splice(idx, 1)
				},
			},
			connect: vi.fn(() => {
				calls.push("config.connect")
				return configConnectImpl()
			}),
			disconnect: vi.fn(() => calls.push("config.disconnect")),
			getValue: vi.fn().mockImplementation(() => {
				calls.push("config.getValue")
				return configGetValueImpl()
			}),
		}
	}),
}))

vi.mock("@/stores/cache.store.ts", () => ({
	useCacheStore: () => cacheState,
}))
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => popupStore,
}))
// Controllable appStore for the identity-ready watcher tests. Reactive
// so the watcher inside PopupManager observes changes.
const appStoreState = reactive({
	profile: { id: "p1" } as { id?: string } | null,
	network: { id: "net-1", chainId: 1 } as { id?: string; chainId?: number } | null,
	account: { address: "0xacct" } as { address?: string } | null,
})
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => appStoreState,
}))

// `shallow: true` auto-stubs every child component. The queue logic lives
// in PopupManager's <script>; the template just renders child popups.
const SHALLOW = true

import PopupManager from "./PopupManager.vue"

// ── Helpers ─────────────────────────────────────────────────────────────

function payload(overrides = {}) {
	return {
		profileId: "p1",
		networkId: "net-1",
		accountAddress: "0xacct",
		contract: "0xcontractA",
		tokenId: 1,
		tokenSymbol: "TST",
		tokenDecimals: 18,
		amountRaw: "1000",
		...overrides,
	}
}

async function firePending(p: PendingPayload) {
	for (const h of incomingPendingHandlers) {
		await h(p)
	}
}

async function fireAndFlush(p: PendingPayload) {
	await firePending(p)
	await flushPromises()
}

async function fireTrustChangedAndFlush(p: TrustChangedPayload) {
	for (const h of incomingTrustChangedHandlers) {
		await h(p)
	}
	await flushPromises()
}

function reset() {
	incomingPendingHandlers.length = 0
	incomingTrustChangedHandlers.length = 0
	configUpdateHandlers.length = 0
	incomingConnectedHandlers.length = 0
	for (const k of Object.keys(popupsState)) delete popupsState[k]
	for (const k of Object.keys(cacheState.incomingTrust)) delete (cacheState.incomingTrust as Record<string, unknown>)[k]
	setTrustAllow.mockClear()
	setTrustReject.mockClear()
	replayPendingPrompts.mockClear()
	configUpdateRemoveSpy.mockClear()
	configGetValueImpl = () => Promise.resolve(true)
	incomingConnectImpl = () => Promise.resolve()
	configConnectImpl = () => Promise.resolve()
	calls.length = 0
	appStoreState.profile = { id: "p1" }
	appStoreState.network = { id: "net-1", chainId: 1 }
	appStoreState.account = { address: "0xacct" }
}

// Track mounted wrappers so afterEach can unmount them. Required because
// the identity watcher in PopupManager listens to the shared reactive
// `appStoreState` — without unmounting, watchers from prior test mounts
// continue firing on subsequent tests' state mutations.
const trackedWrappers: VueWrapper<unknown>[] = []
function mount(component: unknown, options?: Parameters<typeof rawMount>[1]): VueWrapper<unknown> {
	const w = rawMount(component as never, options)
	trackedWrappers.push(w)
	return w
}

beforeEach(reset)
afterEach(() => {
	while (trackedWrappers.length > 0) {
		const w = trackedWrappers.pop()
		w?.unmount()
	}
})

// ── Tests ───────────────────────────────────────────────────────────────

describe("PopupManager — trust queue and triple dedup", () => {
	test("single event: enqueues, opens popup, populates cacheStore", async () => {
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()

		await fireAndFlush(payload({ contract: "0xcA" }))

		expect(popupStore.isOpened("incoming_trust")).toBe(true)
		expect(cacheState.incomingTrust.contract).toBe("0xcA")
		expect(cacheState.incomingTrust.profileId).toBe("p1")
		expect(cacheState.incomingTrust.networkId).toBe("net-1")
	})

	test("duplicate event for queued triple: dropped silently", async () => {
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()

		await fireAndFlush(payload({ contract: "0xcA" }))
		// Same triple while popup is open → already-open coalesce: no-op.
		await fireAndFlush(payload({ contract: "0xcA" }))

		// Close popup; queue should be empty (the duplicate was dropped, not queued).
		popupStore.close("incoming_trust")
		await flushPromises()
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
	})

	test("3 events across 2 contracts (1 repeat): open A → close → open B → close → stays closed", async () => {
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()

		await fireAndFlush(payload({ contract: "0xcA" })) // → opens A
		await fireAndFlush(payload({ contract: "0xcA" })) // → dedup (already open)
		await fireAndFlush(payload({ contract: "0xcB" })) // → queued behind A

		expect(cacheState.incomingTrust.contract).toBe("0xcA")
		expect(popupStore.isOpened("incoming_trust")).toBe(true)

		popupStore.close("incoming_trust")
		await flushPromises()

		// Queue dequeued: B surfaces.
		expect(cacheState.incomingTrust.contract).toBe("0xcB")
		expect(popupStore.isOpened("incoming_trust")).toBe(true)

		popupStore.close("incoming_trust")
		await flushPromises()

		// Queue empty: stays closed.
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
	})

	test("same contract on DIFFERENT networks: BOTH surface (triple-key dedup, not bare-contract)", async () => {
		// The stale-triple guard drops payloads
		// whose triple doesn't match the live appStore. To still exercise
		// the queue's triple-key dedup (vs bare-contract dedup), switch
		// `appStoreState.network` between firing the two payloads so each
		// is valid at fire-time. This models the real scenario where the
		// user changes network between two pending-prompt events.
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()

		// Fire net-1 payload while appStore is on net-1.
		await fireAndFlush(payload({ networkId: "net-1", contract: "0xUSDC" }))
		expect(cacheState.incomingTrust.contract).toBe("0xUSDC")
		expect(cacheState.incomingTrust.networkId).toBe("net-1")
		expect(popupStore.isOpened("incoming_trust")).toBe(true)

		popupStore.close("incoming_trust")
		await flushPromises()

		// Switch the live triple to net-2 before firing the net-2 payload.
		appStoreState.network = { id: "net-2", chainId: 2 }
		await flushPromises()
		await fireAndFlush(payload({ networkId: "net-2", contract: "0xUSDC" }))

		// Net-2 twin surfaces — would have been suppressed under bare-contract dedup.
		expect(cacheState.incomingTrust.contract).toBe("0xUSDC")
		expect(cacheState.incomingTrust.networkId).toBe("net-2")
		expect(popupStore.isOpened("incoming_trust")).toBe(true)
	})

	test("stale-triple defense: payload for non-active triple is dropped", async () => {
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		// appStore is on net-1; fire a payload for net-2 → must NOT enqueue.
		await fireAndFlush(payload({ networkId: "net-2", contract: "0xstaleNet" }))
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
		expect(cacheState.incomingTrust.contract).toBeUndefined()
	})

	test("account-switch on same profile/network closes the stale open popup", async () => {
		// Trust payloads are account-scoped (`IncomingTransferPending.accountAddress`
		// in incoming-transfer/spec.ts). Account-only switches MUST also
		// close a popup whose payload references the prior account.
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()

		// Open popup on account 0xacct.
		await fireAndFlush(payload({ accountAddress: "0xacct", contract: "0xcAcc" }))
		expect(popupStore.isOpened("incoming_trust")).toBe(true)
		expect(cacheState.incomingTrust.accountAddress).toBe("0xacct")

		// User switches account within the same profile + network.
		appStoreState.account = { address: "0xother" }
		await flushPromises()

		// The stale popup must close (it referenced 0xacct, not 0xother).
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
		expect(cacheState.incomingTrust.accountAddress).toBeUndefined()
	})

	test("accept on A, switch to B, close → no stale A popup re-opens under B", async () => {
		// Queue/open A payloads,
		// switch identity to B, close the active popup. Without the
		// triple-watcher purge + dequeue defense, the next queued A
		// payload would still open under B.
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()

		// Two A payloads — first opens, second queues.
		await fireAndFlush(payload({ contract: "0xcA1" }))
		await fireAndFlush(payload({ contract: "0xcA2" }))
		expect(popupStore.isOpened("incoming_trust")).toBe(true)
		expect(cacheState.incomingTrust.contract).toBe("0xcA1")

		// User switches profile to a new identity.
		appStoreState.profile = { id: "p2" }
		await flushPromises()

		// The open popup was for profile p1 → triple no longer matches →
		// watcher closed it AND purged the queue.
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
		expect(cacheState.incomingTrust.contract).toBeUndefined()

		// Force a dequeue attempt — the prior A's second payload (0xcA2)
		// must NOT open under B even if it survived the purge.
		// (Defensive depth in dequeueNextPendingTrust.)
		// Simulating a close re-trigger:
		popupStore.close("incoming_trust")
		await flushPromises()
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
	})

	test("currently-open popup coalesce: dup fired while open does NOT add to queue", async () => {
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()

		await fireAndFlush(payload({ contract: "0xcA" })) // → opens A
		// Same triple fires repeatedly while open (replay-while-open case).
		await fireAndFlush(payload({ contract: "0xcA" }))
		await fireAndFlush(payload({ contract: "0xcA" }))
		await fireAndFlush(payload({ contract: "0xcA" }))

		popupStore.close("incoming_trust")
		await flushPromises()

		// All dups were coalesced — queue must be empty after close.
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
	})

	test("allow/reject closures bind to the dequeued payload's triple, not the most recent event", async () => {
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()

		await fireAndFlush(payload({ networkId: "net-1", contract: "0xcA" }))
		await fireAndFlush(payload({ networkId: "net-2", contract: "0xcB" }))

		// Popup is for the FIRST event (net-1, 0xcA). The allow closure must
		// call setTrustAllow(p1, net-1, 0xcA) — NOT the most recent (net-2, 0xcB).
		await cacheState.incomingTrust.allow?.()

		expect(setTrustAllow).toHaveBeenCalledExactlyOnceWith("p1", "net-1", "0xcA")
	})

	test("trust→unknown for the open triple closes the popup + clears cache", async () => {
		// Open the trust prompt for (p1, net-1, 0xcA), then simulate the
		// service emitting onIncomingTrustChanged with state=unknown for the
		// same triple — the signal sent by onTokenDeleted's trust-reset.
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		await fireAndFlush(payload({ networkId: "net-1", contract: "0xcA" }))
		expect("incoming_trust" in popupsState).toBe(true)
		expect(cacheState.incomingTrust.contract).toBe("0xcA")

		await fireTrustChangedAndFlush({ profileId: "p1", networkId: "net-1", contract: "0xcA", state: "unknown" })

		expect("incoming_trust" in popupsState).toBe(false)
		expect(cacheState.incomingTrust.contract).toBeUndefined()
	})

	test("trust→unknown for a QUEUED (not-yet-open) triple purges it from the queue", async () => {
		// Enqueue triples A + B (B is queued behind A's open popup). Then
		// emit trust→unknown for B. Closing A must NOT then open B.
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		await fireAndFlush(payload({ networkId: "net-1", contract: "0xcA" }))
		await fireAndFlush(payload({ networkId: "net-1", contract: "0xcB" }))
		expect("incoming_trust" in popupsState).toBe(true)
		expect(cacheState.incomingTrust.contract).toBe("0xcA")

		await fireTrustChangedAndFlush({ profileId: "p1", networkId: "net-1", contract: "0xcB", state: "unknown" })

		// Now close A's popup → dequeue runs but the only queued entry (B)
		// was purged, so nothing reopens.
		delete popupsState.incoming_trust
		await flushPromises()
		expect("incoming_trust" in popupsState).toBe(false)
	})

	test("trust→trusted/pending/blocked do NOT close an open popup", async () => {
		// Only the `unknown` transition signals "registration is gone".
		// Other transitions are normal state changes — leave the popup alone.
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		await fireAndFlush(payload({ networkId: "net-1", contract: "0xcA" }))
		expect("incoming_trust" in popupsState).toBe(true)

		await fireTrustChangedAndFlush({ profileId: "p1", networkId: "net-1", contract: "0xcA", state: "trusted" })
		expect("incoming_trust" in popupsState).toBe(true)

		await fireTrustChangedAndFlush({ profileId: "p1", networkId: "net-1", contract: "0xcA", state: "pending" })
		expect("incoming_trust" in popupsState).toBe(true)

		await fireTrustChangedAndFlush({ profileId: "p1", networkId: "net-1", contract: "0xcA", state: "blocked" })
		expect("incoming_trust" in popupsState).toBe(true)
	})
})

describe("PopupManager — visibility seed and listener cleanup", () => {
	test("(post-init) OFF→ON config event calls replayPendingPrompts with active triple", async () => {
		// Seed reads false (persisted OFF state).
		configGetValueImpl = () => Promise.resolve(false)
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()

		// Fire the OFF→ON event after init completes.
		for (const h of configUpdateHandlers) h({ key: "incomingTransfersVisible", value: true })
		await flushPromises()

		expect(replayPendingPrompts).toHaveBeenCalledExactlyOnceWith("p1", "net-1", "0xacct")
	})

	test("(pre-init) config event fired BEFORE seed resolves is ignored", async () => {
		// Hold getValue in a never-resolving promise so init can't complete.
		let resolveGet: (v: boolean) => void = () => {}
		configGetValueImpl = () =>
			new Promise<boolean>((r) => {
				resolveGet = r
			})
		mount(PopupManager, { shallow: SHALLOW })
		// flush microtasks so connect() resolves but getValue stays pending
		await flushPromises()

		// At this point: connect resolved, getValue still pending. The
		// listener should NOT be registered yet OR (if it is) the gate
		// flag should suppress.
		// Registration happens inside onMounted after the seed resolves, so
		// configUpdateHandlers is still empty here.
		expect(configUpdateHandlers.length).toBe(0)

		// Resolve seed, finalize init.
		resolveGet(false)
		await flushPromises()

		// Listener now registered.
		expect(configUpdateHandlers.length).toBe(1)

		// Fire post-init OFF→ON: replay called once.
		for (const h of configUpdateHandlers) h({ key: "incomingTransfersVisible", value: true })
		await flushPromises()
		expect(replayPendingPrompts).toHaveBeenCalledTimes(1)
	})

	test("mount → unmount removes the config listener (no listener leak)", async () => {
		const w = mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		expect(configUpdateHandlers.length).toBe(1)

		w.unmount()
		await flushPromises()

		expect(configUpdateRemoveSpy).toHaveBeenCalledTimes(1)
		// And the handlers array reflects the removal (our mock spliced).
		expect(configUpdateHandlers.length).toBe(0)
	})

	test("mount → unmount → mount: exactly one listener registered after the second mount", async () => {
		const w1 = mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		w1.unmount()
		await flushPromises()
		expect(configUpdateHandlers.length).toBe(0)

		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		expect(configUpdateHandlers.length).toBe(1)
	})
})

describe("PopupManager — replay once the identity is ready", () => {
	test("onConnected with active triple ready: replayPendingPrompts called once", async () => {
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		// Fire onConnected; triple is populated from the default reset state.
		for (const h of incomingConnectedHandlers) await h()
		await flushPromises()
		expect(replayPendingPrompts).toHaveBeenCalledExactlyOnceWith("p1", "net-1", "0xacct")
	})

	test("onConnected with empty triple, then triple populates: replay fires via watcher", async () => {
		appStoreState.profile = null
		appStoreState.network = null
		appStoreState.account = null
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		// onConnected fires while triple unset → early-return, no replay.
		for (const h of incomingConnectedHandlers) await h()
		await flushPromises()
		expect(replayPendingPrompts).not.toHaveBeenCalled()

		// Now populate the triple → watcher fires tryReplay → replay called.
		appStoreState.profile = { id: "p1" }
		appStoreState.network = { id: "net-1", chainId: 1 }
		appStoreState.account = { address: "0xacct" }
		await flushPromises()
		expect(replayPendingPrompts).toHaveBeenCalledExactlyOnceWith("p1", "net-1", "0xacct")
	})

	test("idempotency: onConnected fires twice for the same triple → replay called only once", async () => {
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		for (const h of incomingConnectedHandlers) await h()
		await flushPromises()
		for (const h of incomingConnectedHandlers) await h()
		await flushPromises()
		expect(replayPendingPrompts).toHaveBeenCalledTimes(1)
	})

	test("profile switch: triple .id changes → replay re-fires for the new profile", async () => {
		mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		for (const h of incomingConnectedHandlers) await h()
		await flushPromises()
		expect(replayPendingPrompts).toHaveBeenCalledExactlyOnceWith("p1", "net-1", "0xacct")

		// Profile switch — watcher fires, replay re-runs for the new triple.
		appStoreState.profile = { id: "p2" }
		await flushPromises()
		expect(replayPendingPrompts).toHaveBeenCalledTimes(2)
		expect(replayPendingPrompts).toHaveBeenLastCalledWith("p2", "net-1", "0xacct")
	})

	test("unmount: watcher deregistered → triple changes after unmount do not call replay", async () => {
		const w = mount(PopupManager, { shallow: SHALLOW })
		await flushPromises()
		for (const h of incomingConnectedHandlers) await h()
		await flushPromises()
		w.unmount()
		await flushPromises()
		replayPendingPrompts.mockClear()
		// Triple changes post-unmount.
		appStoreState.profile = { id: "p2" }
		await flushPromises()
		expect(replayPendingPrompts).not.toHaveBeenCalled()
	})
})

// ── One discriminating test per queue guard ────────────────────────────────────────────────

/** Invokes every pending subscriber synchronously, as the real `EventHandler.invoke` does. */
function firePendingSync(p: PendingPayload) {
	for (const h of incomingPendingHandlers) void h(p)
}

async function mounted() {
	const w = mount(PopupManager, { shallow: SHALLOW })
	await flushPromises()
	return w
}

describe("PopupManager — trust queue guards", () => {
	test.each([
		["profile", { profileId: "p2" }, () => (appStoreState.profile = { id: "p2" })],
		["network", { networkId: "net-2" }, () => (appStoreState.network = { id: "net-2", chainId: 2 })],
		["account", { accountAddress: "0xother" }, () => (appStoreState.account = { address: "0xother" })],
	])("ingress drops a payload whose %s is not the live one", async (_field, override, switchTo) => {
		await mounted()
		await fireAndFlush(payload({ contract: "0xcA" }))
		// Foreign to the live identity: dropped, so it cannot open once the identity becomes its own.
		await fireAndFlush(payload({ contract: "0xcF", ...override }))
		switchTo()
		await flushPromises()
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
		expect(cacheState.incomingTrust.contract).toBeUndefined()
	})

	test("a payload repeated while it is still queued is queued once", async () => {
		await mounted()
		await fireAndFlush(payload({ contract: "0xcA" }))
		await fireAndFlush(payload({ contract: "0xcB" }))
		await fireAndFlush(payload({ contract: "0xcB" }))
		popupStore.close("incoming_trust")
		await flushPromises()
		expect(cacheState.incomingTrust.contract).toBe("0xcB")
		popupStore.close("incoming_trust")
		await flushPromises()
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
	})

	test("the open prompt's dedup key reads a missing profile id as empty (pinned quirk)", async () => {
		appStoreState.profile = null
		await mounted()
		const noProfile = payload({ contract: "0xcA", profileId: undefined as unknown as string })
		await fireAndFlush(noProfile)
		expect(cacheState.incomingTrust.contract).toBe("0xcA")
		// "undefined|…" never equals the open prompt's "|…", so the repeat queues behind it.
		await fireAndFlush(noProfile)
		popupStore.close("incoming_trust")
		await flushPromises()
		expect(popupStore.isOpened("incoming_trust")).toBe(true)
		expect(cacheState.incomingTrust.contract).toBe("0xcA")
	})

	test("dequeue skips an entry that no longer matches the live identity", async () => {
		await mounted()
		await fireAndFlush(payload({ contract: "0xcA" }))
		await fireAndFlush(payload({ contract: "0xcB" }))
		// One synchronous run, before any watcher flushes: B is stale, C is live.
		popupStore.close("incoming_trust")
		appStoreState.account = { address: "0xother" }
		firePendingSync(payload({ contract: "0xcC", accountAddress: "0xother" }))
		expect(cacheState.incomingTrust.contract).toBe("0xcC")
		await flushPromises()
		expect(cacheState.incomingTrust.contract).toBe("0xcC")
		expect(popupStore.isOpened("incoming_trust")).toBe(true)
	})

	test("a pending event while a prompt is open does not replace it", async () => {
		await mounted()
		await fireAndFlush(payload({ contract: "0xcA" }))
		firePendingSync(payload({ contract: "0xcB" }))
		expect(cacheState.incomingTrust.contract).toBe("0xcA")
		await flushPromises()
		expect(cacheState.incomingTrust.contract).toBe("0xcA")
	})

	test("allow and reject keep the dequeued triple after the live identity moves", async () => {
		await mounted()
		await fireAndFlush(payload({ contract: "0xcA" }))
		const { allow, reject } = cacheState.incomingTrust
		appStoreState.profile = { id: "p2" }
		appStoreState.network = { id: "net-2", chainId: 2 }
		await flushPromises()
		await allow?.()
		await reject?.()
		expect(setTrustAllow).toHaveBeenCalledExactlyOnceWith("p1", "net-1", "0xcA")
		expect(setTrustReject).toHaveBeenCalledExactlyOnceWith("p1", "net-1", "0xcA")
	})

	test.each([
		["profile", { profileId: "p2" }],
		["network", { networkId: "net-2" }],
		["contract", { contract: "0xcZ" }],
	])("a trust→unknown purge differing only in %s leaves the queue and the open prompt", async (_field, override) => {
		await mounted()
		await fireAndFlush(payload({ contract: "0xcA" }))
		await fireAndFlush(payload({ contract: "0xcB" }))
		await fireTrustChangedAndFlush({ profileId: "p1", networkId: "net-1", contract: "0xcA", state: "unknown", ...override })
		await fireTrustChangedAndFlush({ profileId: "p1", networkId: "net-1", contract: "0xcB", state: "unknown", ...override })
		expect(cacheState.incomingTrust.contract).toBe("0xcA")
		popupStore.close("incoming_trust")
		await flushPromises()
		expect(cacheState.incomingTrust.contract).toBe("0xcB")
	})

	test("the incoming-trust cache holds exactly the dequeued payload's fields and two closures", async () => {
		await mounted()
		await fireAndFlush(payload({ contract: "0xcA" }))
		const t = cacheState.incomingTrust as Record<string, unknown>
		expect(Object.keys(t).sort()).toEqual([
			"accountAddress",
			"allow",
			"amountRaw",
			"contract",
			"networkId",
			"profileId",
			"reject",
			"tokenDecimals",
			"tokenSymbol",
		])
		expect({ ...t, allow: typeof t.allow, reject: typeof t.reject }).toEqual({
			tokenSymbol: "TST",
			tokenDecimals: 18,
			amountRaw: "1000",
			contract: "0xcA",
			profileId: "p1",
			networkId: "net-1",
			accountAddress: "0xacct",
			allow: "function",
			reject: "function",
		})
	})

	test("a rejected replay is retried on the next connect", async () => {
		await mounted()
		replayPendingPrompts.mockRejectedValueOnce(new Error("port hiccup"))
		for (const h of incomingConnectedHandlers) await h()
		await flushPromises()
		for (const h of incomingConnectedHandlers) await h()
		await flushPromises()
		expect(replayPendingPrompts).toHaveBeenCalledTimes(2)
	})

	test("a remount starts with an empty queue", async () => {
		const first = await mounted()
		await fireAndFlush(payload({ contract: "0xcA" }))
		await fireAndFlush(payload({ contract: "0xcB" }))
		first.unmount()
		await flushPromises()
		await mounted()
		popupStore.close("incoming_trust")
		await flushPromises()
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
	})
})

describe("PopupManager — visibility gate", () => {
	type Case = [string, boolean, { key: string; value: unknown }[], boolean, number]
	const ON = (value: unknown) => ({ key: "incomingTransfersVisible", value })
	const cases: Case[] = [
		["OFF→ON replays", false, [ON(true)], true, 1],
		["an undefined value reads as ON", false, [ON(undefined)], true, 1],
		["ON→ON does not replay", true, [ON(true)], true, 0],
		["OFF→OFF does not replay, and a later ON does", false, [ON(false), ON(true)], true, 1],
		["another key is ignored", false, [{ key: "other", value: true }], true, 0],
		["another key leaves the tracked value", false, [{ key: "other", value: true }, ON(true)], true, 1],
		["ON→OFF→ON replays once", true, [ON(false), ON(true)], true, 1],
		["OFF→ON with no full identity does not replay", false, [ON(true)], false, 0],
	]
	test.each(cases)("%s", async (_name, seed, events, identity, replays) => {
		configGetValueImpl = () => Promise.resolve(seed)
		if (!identity) appStoreState.account = null
		await mounted()
		replayPendingPrompts.mockClear()
		for (const e of events) for (const h of configUpdateHandlers) h(e)
		await flushPromises()
		expect(replayPendingPrompts).toHaveBeenCalledTimes(replays)
	})

	test("a no-identity OFF→ON still records ON, so a later ON is not a flip", async () => {
		configGetValueImpl = () => Promise.resolve(false)
		appStoreState.account = null
		await mounted()
		for (const h of configUpdateHandlers) h(ON(true))
		appStoreState.account = { address: "0xacct" }
		await flushPromises()
		replayPendingPrompts.mockClear()
		for (const h of configUpdateHandlers) h(ON(true))
		await flushPromises()
		expect(replayPendingPrompts).not.toHaveBeenCalled()
	})
})

describe("PopupManager — listener lifecycle", () => {
	test("mount registers the incoming listeners, connects both clients, reads the seed, then adds the config listener", async () => {
		await mounted()
		expect(calls).toEqual([
			"pending.add",
			"trustChanged.add",
			"connected.add",
			"incoming.connect",
			"config.connect",
			"config.getValue",
			"config.add",
		])
	})

	test("a rejected connect or seed read still registers the config listener", async () => {
		incomingConnectImpl = () => Promise.reject(new Error("no port"))
		configConnectImpl = () => Promise.reject(new Error("no port"))
		configGetValueImpl = () => Promise.reject(new Error("no read"))
		await mounted()
		expect(calls.slice(-4)).toEqual(["incoming.connect", "config.connect", "config.getValue", "config.add"])
		// The seed failed open: the tracked value stayed ON, so ON is not a flip.
		for (const h of configUpdateHandlers) h({ key: "incomingTransfersVisible", value: true })
		await flushPromises()
		expect(replayPendingPrompts).not.toHaveBeenCalled()
	})

	test("the config listener registers in the first microtask after the seed resolves", async () => {
		let resolveGet: (v: boolean) => void = () => {}
		configGetValueImpl = () =>
			new Promise<boolean>((r) => {
				resolveGet = r
			})
		await mounted()
		resolveGet(true)
		let ticks = 0
		while (configUpdateHandlers.length === 0 && ticks < 10) {
			await Promise.resolve()
			ticks++
		}
		expect(ticks).toBe(1)
	})

	test("unmount removes every listener by identity, before either client disconnects", async () => {
		const w = await mounted()
		calls.length = 0
		w.unmount()
		expect(calls).toEqual(["config.remove", "trustChanged.remove", "pending.remove", "incoming.disconnect", "config.disconnect"])
		expect(configUpdateHandlers).toHaveLength(0)
		expect(incomingTrustChangedHandlers).toHaveLength(0)
		expect(incomingPendingHandlers).toHaveLength(0)
		// onConnected is never removed.
		expect(incomingConnectedHandlers).toHaveLength(1)
	})

	test("an unmount before the seed settles still registers the config listener afterwards (pinned drift)", async () => {
		let resolveGet: (v: boolean) => void = () => {}
		configGetValueImpl = () =>
			new Promise<boolean>((r) => {
				resolveGet = r
			})
		const w = await mounted()
		calls.length = 0
		w.unmount()
		resolveGet(true)
		await flushPromises()
		expect(calls).toEqual([
			"config.remove",
			"trustChanged.remove",
			"pending.remove",
			"incoming.disconnect",
			"config.disconnect",
			"config.add",
		])
		expect(configUpdateHandlers).toHaveLength(1)
	})
})

describe("PopupManager — identity-switch queue purge", () => {
	test("a payload queued during a switch that returns in the same tick is purged, so it never opens later", async () => {
		await mounted()
		await fireAndFlush(payload({ contract: "0xcA" }))
		// One synchronous run: leave for p2, queue B for p2 behind the open A, come back to p1.
		appStoreState.profile = { id: "p2" }
		firePendingSync(payload({ contract: "0xcB", profileId: "p2" }))
		appStoreState.profile = { id: "p1" }
		await flushPromises()
		expect(cacheState.incomingTrust.contract).toBe("0xcA")
		// Switching to p2 closes A; B was purged on the return to p1, so nothing opens.
		appStoreState.profile = { id: "p2" }
		await flushPromises()
		expect(popupStore.isOpened("incoming_trust")).toBe(false)
	})
})
