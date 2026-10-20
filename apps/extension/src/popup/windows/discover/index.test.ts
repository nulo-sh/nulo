/**
 * Component tests for discover popup. Covers the `isReady` race fix: the
 * discover popup's Allow button is gated on `isReady` (not just `requestId`),
 * and `approve()` throws loudly if called pre-init rather than silently
 * returning. The silent-return pattern once cost nineteen debugging iterations to find; see
 * implementations-plan/archive/e2e-network-recovery/plan.md (Slow test investigation).
 *
 * The Allow gate is a phishing defense: the user must see the dApp's
 * hostname/logo/name BEFORE the Allow button becomes clickable. Otherwise
 * a slow logo fetch + auto-focused button + scripted Enter could approve
 * a session the user never identified.
 *
 * Cases (≥10 per CLAUDE.md L4/L5 minimum):
 *  1.  Allow disabled while loadInteractionPayload() pending
 *  2.  Allow disabled when profile is null but payload resolved
 *  3.  Allow enabled only after BOTH profile + payload resolve
 *  4.  Deny stays gated on !requestId (fast bail-out)
 *  5.  approve() throws when called before isReady (defensive)
 *  6.  approve() error message includes the diagnostic phrase
 *  7.  approve() works normally once isReady
 *  8.  processingError 'error' keeps Allow disabled even after isReady
 *  9.  Init failure (loadInteractionPayload throws) leaves isReady=false
 *  10. Profile fetch throws — isReady stays false
 *  11. Deny callable while isReady=false (fast bail-out path)
 *  12. requestId set but payload not loaded → Allow still disabled
 *      (regression check: the pre-fix bug was Allow gating on !requestId alone)
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { JobCancelledError } from "@nulo/extension-messaging/errors"
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils"
import { ref } from "vue"

// ── Mock state (closure refs so tests can flip values mid-test) ──────

let requestIdMock = ref<string | undefined>(undefined)
let dappMock = ref<{ name: string; url: string } | null>(null)
let payloadMock = ref<unknown>(null)
// The chain the discovery named, decimal as the background decodes it.
let payloadChainId = "77"
let isCancelledMock = ref(false)
let loadPromiseResolve: (() => void) | undefined
let loadPromiseReject: ((err: Error) => void) | undefined
let getActiveProfilePromiseResolve: ((p: unknown) => void) | undefined
let getActiveProfilePromiseReject: ((err: Error) => void) | undefined

const loadInteractionPayloadMock = vi.fn(() => {
	return new Promise<void>((resolve, reject) => {
		loadPromiseResolve = () => {
			// Simulate that loadInteractionPayload commits requestId + dapp BEFORE resolving
			requestIdMock.value = "req-123"
			dappMock.value = { name: "Test DApp", url: "https://example.com" }
			payloadMock.value = { params: { dappMetadata: dappMock.value, chainId: payloadChainId } }
			resolve()
		}
		loadPromiseReject = reject
	})
})

const rejectViaInteractionServiceMock = vi.fn()
const resolveInteractionMock = vi.fn(async () => undefined)

const getActiveProfileMock = vi.fn(() => {
	return new Promise<unknown>((resolve, reject) => {
		getActiveProfilePromiseResolve = resolve
		getActiveProfilePromiseReject = reject
	})
})

const profileServiceConnectMock = vi.fn()
const profileServiceDisconnectMock = vi.fn()
const interactionServiceConnectMock = vi.fn()
const interactionServiceDisconnectMock = vi.fn()
const onActiveProfileChangedAddMock = vi.fn()

// ── Mocks (vi.mock is hoisted; values inside must be vi.fn or vi.* primitives) ────

vi.mock("@/composables/useDappInteractionPayload", () => ({
	useDappInteractionPayload: vi.fn(() => ({
		requestId: requestIdMock,
		dapp: dappMock,
		payload: payloadMock,
		isCancelled: isCancelledMock,
		load: loadInteractionPayloadMock,
		reject: rejectViaInteractionServiceMock,
	})),
}))

// Vitest 4 requires `function` expressions (not arrow functions) for mocks
// instantiated with `new`. Arrow factories error: "Reflect.construct requires
// the first argument be a constructor". Matches NewTokenPopup.test.ts pattern.
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: vi.fn(function () {
		return {
			getActiveProfile: getActiveProfileMock,
			connect: profileServiceConnectMock,
			disconnect: profileServiceDisconnectMock,
			onActiveProfileChanged: { add: onActiveProfileChangedAddMock },
		}
	}),
}))

vi.mock("@/wallet/services/dapp-interaction/client", () => ({
	DappInteractionServiceClient: vi.fn(function () {
		return {
			connect: interactionServiceConnectMock,
			disconnect: interactionServiceDisconnectMock,
			resolveInteraction: resolveInteractionMock,
		}
	}),
}))

vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({
		isSessionChecked: true,
		isLogined: true,
		account: { name: "TestAccount" },
		network: { name: "TestNet", chainId: 1 },
		networks: [
			{ name: "TestNet", chainId: 1 },
			{ name: "Devnet", chainId: 77 },
		],
		pageAwaitingAuth: "",
	}),
}))

// The page reads its request id through the mocked payload composable; the route carries only the
// expired flag the worker sets.
const routeMock = ref<{ query: Record<string, string> }>({ query: { requestId: "req-123" } })
vi.mock("vue-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("vue-router")>()
	return { ...actual, useRouter: () => ({ currentRoute: routeMock, push: vi.fn() }) }
})

// chrome.windows mock so closeWindow() doesn't throw
beforeEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: chrome runtime stub for tests
	;(globalThis as any).chrome = {
		windows: {
			getCurrent: (_o: unknown, cb: (w: { id?: number }) => void) => cb({ id: 42 }),
			remove: vi.fn(),
		},
	}
})

afterEach(() => {
	requestIdMock = ref<string | undefined>(undefined)
	dappMock = ref<{ name: string; url: string } | null>(null)
	payloadMock = ref<unknown>(null)
	payloadChainId = "77"
	routeMock.value = { query: { requestId: "req-123" } }
	isCancelledMock = ref(false)
	loadPromiseResolve = undefined
	loadPromiseReject = undefined
	getActiveProfilePromiseResolve = undefined
	getActiveProfilePromiseReject = undefined
	vi.clearAllMocks()
})

// ── Stubs (all child components flattened so we can assert on testid directly) ──

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i />" },
	Tooltip: { template: "<div><slot /></div>" },
	// As the real primitive: only `disabled` sets the attribute; `loading` alone does not.
	Button: {
		props: ["disabled", "loading"],
		emits: ["click"],
		template: `
			<button
				:data-testid="$attrs['data-testid']"
				:disabled="disabled"
				:data-loading="String(loading)"
				@click="$emit('click', $event)"
			>
				<slot />
			</button>
		`,
	},
	DappStatusStrip: {
		template: '<div data-testid="status-strip" :data-status="status" :data-network="networkName" />',
		props: ["accountName", "networkName", "status"],
	},
	DappIdentityBlock: {
		template: '<div data-testid="identity-block" :data-action="actionLabel" />',
		props: ["dapp", "actionLabel", "hostnameTestId", "nameTestId"],
	},
	DappCancelledOverlay: {
		props: ["message"],
		emits: ["dismiss"],
		template: `<div data-testid="cancelled-overlay" :data-message="message"><button data-testid="overlay-ok" @click="$emit('dismiss')" /></div>`,
	},
}

// Lazy import after vi.mock hoist
import Discover from "./index.vue"

// Every mount reads the one shared route: a page left mounted would react to the next test's flag.
enableAutoUnmount(afterEach)

const factory = () => mount(Discover, { global: { stubs: STUBS } })

// Helpers
const allow = (w: ReturnType<typeof factory>) => w.find('[data-testid="discover-allow-btn"]')
const deny = (w: ReturnType<typeof factory>) => w.find('[data-testid="discover-deny-btn"]')
// `:disabled="false"` renders `disabled=""` instead of removing the attribute
// in some vue-test-utils versions. Treat "" + "disabled" + "true" as disabled,
// and missing-attr (undefined) as enabled.
const isDisabled = (btn: ReturnType<typeof allow>) => {
	const v = btn.attributes("disabled")
	return v === "" || v === "disabled" || v === "true"
}

describe("discover popup — isReady race fix", () => {
	test("1. Allow disabled while loadInteractionPayload() pending", async () => {
		const w = factory()
		// onMounted runs, getActiveProfile is awaiting; haven't resolved yet
		await flushPromises()
		// profile fetch hasn't resolved → init() blocked there → isReady false
		expect(isDisabled(allow(w))).toBe(true)
	})

	test("2. Allow disabled when profile is null but loadInteractionPayload resolved", async () => {
		const w = factory()
		// Resolve loadInteractionPayload first (sets requestId + dapp)
		// then leave getActiveProfile pending — init flow is profile-first, so
		// in this scenario profile is still null and isReady cannot flip.
		await flushPromises()
		expect(isDisabled(allow(w))).toBe(true)
		// Resolve getActiveProfile with null — should still keep isReady false
		getActiveProfilePromiseResolve?.(null)
		await flushPromises()
		loadPromiseResolve?.()
		await flushPromises()
		expect(isDisabled(allow(w))).toBe(true)
	})

	test("3. Allow enabled only after BOTH profile + payload resolve", async () => {
		const w = factory()
		await flushPromises()
		expect(isDisabled(allow(w))).toBe(true)
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		// payload still pending → Allow still disabled
		expect(isDisabled(allow(w))).toBe(true)
		loadPromiseResolve?.()
		await flushPromises()
		// NOW both resolved → Allow enabled
		expect(isDisabled(allow(w))).toBe(false)
	})

	test("4. Deny stays gated on !requestId (fast bail-out, NOT isReady)", async () => {
		// Inspect the rendered :disabled props on Deny vs Allow to prove Deny
		// uses the looser `!requestId` predicate while Allow uses `!isReady`.
		// The asymmetry is intentional — early-reject
		// is harmless, early-approve is a trust bug.
		const w = factory()
		await flushPromises()
		// Initially: requestId undef + isReady false → both disabled
		expect(isDisabled(deny(w))).toBe(true)
		expect(isDisabled(allow(w))).toBe(true)
		// Simulate the racy "load() set requestId early" state directly:
		// useDappInteractionPayload's load() sets requestId.value before
		// payload fully lands. We force that state without resolving the
		// init() chain (so isReady stays false).
		requestIdMock.value = "req-early"
		await w.vm.$nextTick()
		// Deny is enabled (gates on !requestId, satisfied), Allow still disabled
		// (gates on !isReady, still false because init never completed).
		expect(isDisabled(deny(w))).toBe(false)
		expect(isDisabled(allow(w))).toBe(true)
	})

	test("5. approve() throws when called before isReady (defensive)", async () => {
		const w = factory()
		await flushPromises()
		// Bypass the button (which would be disabled anyway) — call the handler
		// directly via the component instance to simulate Enter / scripted click.
		const vm = w.vm as unknown as { approve: () => Promise<void> }
		await expect(vm.approve()).rejects.toThrow(/discover approve\(\) called before init\(\) completed/)
	})

	test("6. approve() error message includes the diagnostic phrase", async () => {
		const w = factory()
		await flushPromises()
		const vm = w.vm as unknown as { approve: () => Promise<void> }
		await expect(vm.approve()).rejects.toThrow(/:disabled gate must include !isReady/)
	})

	test("7. approve() works normally once isReady (direct handler call)", async () => {
		const w = factory()
		await flushPromises()
		// Resolve profile FIRST — init() awaits this before calling loadInteractionPayload
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		// Now loadInteractionPayloadMock has been called and loadPromiseResolve is set
		loadPromiseResolve?.()
		await flushPromises()
		// init() committed isReady = true. Call approve directly.
		const vm = w.vm as unknown as { approve: () => Promise<void> }
		await vm.approve()
		await flushPromises()
		expect(resolveInteractionMock).toHaveBeenCalledWith("req-123", { approved: true })
	})

	test("8. processingError 'error' keeps Allow disabled even after isReady", async () => {
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		loadPromiseResolve?.()
		await flushPromises()
		// isReady true → Allow enabled
		expect(isDisabled(allow(w))).toBe(false)
		// Trigger the error path via direct handler call (avoid stub click issues).
		const boom = new Error("boom")
		resolveInteractionMock.mockRejectedValueOnce(boom)
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			const vm = w.vm as unknown as { approve: () => Promise<void> }
			await vm.approve()
			await flushPromises()
			await w.vm.$nextTick()
			expect(logged.mock.calls).toEqual([["Discover approve failed", { error: boom }]])
		} finally {
			logged.mockRestore()
		}
		// After the catch sets processingError, Allow should be disabled
		expect(isDisabled(allow(w))).toBe(true)
	})

	test("9. Init failure (loadInteractionPayload throws) leaves isReady=false", async () => {
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		const failure = new Error("payload-fetch-failed")
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			loadPromiseReject?.(failure)
			await flushPromises()
			expect(logged.mock.calls).toEqual([["Discover window init failed", { error: failure }]])
		} finally {
			logged.mockRestore()
		}
		// Allow must stay disabled even though requestId was never set
		expect(isDisabled(allow(w))).toBe(true)
		// Defensive: approve() should still throw
		const vm = w.vm as unknown as { approve: () => Promise<void> }
		await expect(vm.approve()).rejects.toThrow(/discover approve\(\)/)
	})

	test("10. Profile fetch throws — isReady stays false", async () => {
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseReject?.(new Error("profile-fetch-failed"))
		await flushPromises()
		expect(isDisabled(allow(w))).toBe(true)
		const vm = w.vm as unknown as { approve: () => Promise<void> }
		await expect(vm.approve()).rejects.toThrow(/discover approve\(\)/)
	})

	test("11. Deny calls rejectViaInteractionService once requestId is set", async () => {
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		loadPromiseResolve?.()
		await flushPromises()
		// Direct handler call to avoid stub click issues.
		const vm = w.vm as unknown as { reject: (end: "reject") => Promise<void> }
		await vm.reject("reject")
		await flushPromises()
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledWith("User rejected", "reject")
	})

	test("12. requestId set but payload state half-loaded → Allow still disabled (REGRESSION CHECK)", async () => {
		// Pre-fix behavior: Allow gated on `!requestId`. Bug: requestId is set
		// inside load() BEFORE the payload resolves, so the gate opens too
		// early. This test simulates that exact state: requestId is set but
		// the load promise hasn't resolved yet, AND profile is set.
		// Result MUST be: Allow still disabled (because isReady requires both).
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		// Simulate the racy state: requestId set early by useDappInteractionPayload
		requestIdMock.value = "req-half-loaded"
		dappMock.value = null // identity NOT yet loaded
		// Force re-render
		await w.vm.$nextTick()
		// Allow MUST stay disabled — even though requestId is truthy.
		// Pre-fix: this assertion would have FAILED (Allow would be enabled).
		expect(isDisabled(allow(w))).toBe(true)
	})

	test("a raced approve refused with JobCancelledError classifies as CANCELLED, not an error", async () => {
		resolveInteractionMock.mockRejectedValueOnce(new JobCancelledError())
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		loadPromiseResolve?.()
		await flushPromises()
		const vm = w.vm as unknown as { approve: () => Promise<void> }
		await vm.approve()
		await flushPromises()
		expect(w.find('[data-testid="cancelled-overlay"]').exists()).toBe(true)
		expect(w.find('[data-testid="error-text"]').exists()).toBe(false)
	})
})

describe("discover popup — the line under the app names the app's network", () => {
	const ready = async () => {
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		loadPromiseResolve?.()
		await flushPromises()
		return w
	}
	const approve = (w: ReturnType<typeof factory>) => (w.vm as unknown as { approve: () => Promise<void> }).approve()
	const actionLine = (w: ReturnType<typeof factory>) => w.get('[data-testid="identity-block"]').attributes("data-action")

	test("before Allow it names the app's chain while the strip keeps the wallet's network", async () => {
		const w = await ready()
		expect(actionLine(w)).toBe("wants to connect on Devnet")
		expect(w.get('[data-testid="status-strip"]').attributes("data-network")).toBe("TestNet")
	})

	test("an accepted Allow reads as connecting on the app's chain", async () => {
		const w = await ready()
		await approve(w)
		await flushPromises()
		expect(actionLine(w)).toBe("Connecting on Devnet")
	})

	test("a failed Allow keeps the request line", async () => {
		resolveInteractionMock.mockRejectedValueOnce(new Error("boom"))
		const w = await ready()
		await approve(w)
		await flushPromises()
		expect(actionLine(w)).toBe("wants to connect on Devnet")
	})

	test("a chain with no wallet network reads by its id", async () => {
		payloadChainId = "99"
		const w = await ready()
		expect(actionLine(w)).toBe("wants to connect on Aztec:99")
	})

	test("before the request loads it names no network", async () => {
		const w = factory()
		await flushPromises()
		expect(actionLine(w)).toBe("wants to connect on this network")
	})
})

describe("discover popup — a connection request that expired", () => {
	const EXPIRED = { requestId: "req-123", expired: "1" }
	// biome-ignore lint/suspicious/noExplicitAny: chrome runtime stub for tests
	const windowsRemove = () => (globalThis as any).chrome.windows.remove as ReturnType<typeof vi.fn>
	const overlays = (w: ReturnType<typeof factory>) => w.findAll('[data-testid="cancelled-overlay"]')

	afterEach(() => {
		vi.useRealTimers()
	})

	test("shows the cancelled overlay with its own line, and OK closes the window", async () => {
		routeMock.value = { query: EXPIRED }
		const w = factory()
		await flushPromises()
		expect(overlays(w).map((o) => o.attributes("data-message"))).toEqual(["Connection request expired"])
		await w.get('[data-testid="overlay-ok"]').trigger("click")
		expect(windowsRemove()).toHaveBeenCalledWith(42)
	})

	test("closes the window by itself after 30 seconds, not before", async () => {
		vi.useFakeTimers()
		routeMock.value = { query: EXPIRED }
		factory()
		await vi.advanceTimersByTimeAsync(29_999)
		expect(windowsRemove()).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		expect(windowsRemove()).toHaveBeenCalledTimes(1)
	})

	test("leaving the expired page (a lock routes the window away) closes the window at once, and the timer never fires", async () => {
		vi.useFakeTimers()
		routeMock.value = { query: EXPIRED }
		factory()
		await flushPromises()
		routeMock.value = { query: {} }
		await flushPromises()
		expect(windowsRemove()).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(30_000)
		expect(windowsRemove()).toHaveBeenCalledTimes(1)
	})

	test("unmounting the expired page closes the window; unmounting a live one does not", async () => {
		routeMock.value = { query: EXPIRED }
		factory().unmount()
		expect(windowsRemove()).toHaveBeenCalledTimes(1)
		routeMock.value = { query: { requestId: "req-123" } }
		factory().unmount()
		expect(windowsRemove()).toHaveBeenCalledTimes(1)
	})

	test("a page loaded already expired starts no live request", async () => {
		routeMock.value = { query: EXPIRED }
		factory()
		await flushPromises()
		expect(profileServiceConnectMock).not.toHaveBeenCalled()
		expect(getActiveProfileMock).not.toHaveBeenCalled()
		expect(loadInteractionPayloadMock).not.toHaveBeenCalled()
	})

	test("a page waiting after Allow shows the overlay over itself when the flag arrives, and starts the close", async () => {
		vi.useFakeTimers()
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		loadPromiseResolve?.()
		await flushPromises()
		await (w.vm as unknown as { approve: () => Promise<void> }).approve()
		await flushPromises()
		expect(overlays(w)).toHaveLength(0)

		routeMock.value = { query: EXPIRED }
		await flushPromises()
		expect(overlays(w).map((o) => o.attributes("data-message"))).toEqual(["Connection request expired"])
		expect(w.find('[data-testid="discover-allow-btn"]').exists()).toBe(true)
		expect(loadInteractionPayloadMock).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(30_000)
		expect(windowsRemove()).toHaveBeenCalledTimes(1)
	})

	test("a cancelled request on the expired page shows only the expired line", async () => {
		routeMock.value = { query: EXPIRED }
		isCancelledMock.value = true
		const w = factory()
		await flushPromises()
		expect(overlays(w).map((o) => o.attributes("data-message"))).toEqual(["Connection request expired"])
	})
})

describe("discover popup — the revoke line", () => {
	test("names the settings screen that lists connections", () => {
		const text = factory().text()
		expect(text).toContain("You can revoke this connection any time from Settings → Connected Apps.")
		expect(text).not.toContain("General → Sessions")
	})
})

describe("discover popup — after Allow the window waits for its emoji check", () => {
	/** Mounted with init complete, so Allow is enabled. */
	const ready = async () => {
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		loadPromiseResolve?.()
		await flushPromises()
		return w
	}
	const approve = (w: ReturnType<typeof factory>) => (w.vm as unknown as { approve: () => Promise<void> }).approve()
	// biome-ignore lint/suspicious/noExplicitAny: chrome runtime stub for tests
	const windowsRemove = () => (globalThis as any).chrome.windows.remove as ReturnType<typeof vi.fn>

	test("a resolved Allow keeps the window open, Allow spinning and disabled, Deny disabled, the strip loading", async () => {
		const w = await ready()
		await approve(w)
		await flushPromises()
		expect(windowsRemove()).not.toHaveBeenCalled()
		expect(allow(w).attributes("data-loading")).toBe("true")
		expect(isDisabled(allow(w))).toBe(true)
		expect(isDisabled(deny(w))).toBe(true)
		expect(w.find('[data-testid="status-strip"]').attributes("data-status")).toBe("loading")
	})

	test("the connect step bar shows step 1 before Allow and while it connects", async () => {
		const w = await ready()
		expect(w.get('[data-testid="connect-step-bar"]').attributes("data-step")).toBe("1")
		await approve(w)
		await flushPromises()
		expect(w.get('[data-testid="connect-step-bar"]').attributes("data-step")).toBe("1")
	})

	test("a second Allow while it connects (a repeated Enter) sends nothing and sets no error", async () => {
		const w = await ready()
		await approve(w)
		await approve(w)
		await flushPromises()
		expect(resolveInteractionMock).toHaveBeenCalledTimes(1)
		expect(w.find('[data-testid="error-text"]').exists()).toBe(false)
	})

	test("a failed Allow leaves the waiting state: Allow stops spinning, Deny is enabled, the window stays", async () => {
		resolveInteractionMock.mockRejectedValueOnce(new Error("boom"))
		const w = await ready()
		await approve(w)
		await flushPromises()
		expect(allow(w).attributes("data-loading")).toBe("false")
		expect(isDisabled(deny(w))).toBe(false)
		expect(w.find('[data-testid="error-text"]').exists()).toBe(true)
		expect(windowsRemove()).not.toHaveBeenCalled()
	})
})
