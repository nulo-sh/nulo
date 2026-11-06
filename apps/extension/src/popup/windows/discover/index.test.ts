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
import { deferred } from "@nulo/wallet-core/utils"
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils"
import { ref } from "vue"
import { EVERY_SITE_CONFIRM } from "@/utils/every-site"
import { GLOSSARY } from "@/utils/glossary"
import { TESTNET_L1_CHAIN_ID, TESTNET_ROLLUP_VERSION } from "@/utils/chain-ids"
import { chainInfoToChainId } from "@/wallet/services/wallet-sdk/session-established"
import { shownText } from "../../../../tests/helpers/shown-text"

// ── Mock state (closure refs so tests can flip values mid-test) ──────

let requestIdMock = ref<string | undefined>(undefined)
let dappMock = ref<{ name: string; url: string } | null>(null)
let payloadMock = ref<unknown>(null)
// The chain the discovery named, decimal as the background decodes it.
let payloadChainId = "77"
let payloadDapp = { name: "Test DApp", url: "https://example.com" }
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
			dappMock.value = payloadDapp
			payloadMock.value = { params: { dappMetadata: dappMock.value, chainId: payloadChainId } }
			resolve()
		}
		loadPromiseReject = reject
	})
})

const rejectViaInteractionServiceMock = vi.fn()
const resolveInteractionMock = vi.fn(async () => undefined)
const askConfirmMock = vi.fn(async () => false)
const setEverySiteMock = vi.fn(async () => undefined)

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

vi.mock("@/wallet/services/dapp-session/client", () => ({
	DappSessionServiceClient: vi.fn(function () {
		return { connect: vi.fn(), disconnect: vi.fn(), setEverySite: setEverySiteMock }
	}),
}))

vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ askConfirm: askConfirmMock }) }))

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

// The page reads its request id through the mocked payload composable.
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
	payloadDapp = { name: "Test DApp", url: "https://example.com" }
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
	IdentityStrip: {
		template: '<div data-testid="status-strip" :data-status="status" :data-lead="accountLabel" :data-network="networkLabel" />',
		props: ["accountLabel", "networkLabel", "status", "warn"],
	},
	DappIdentityBlock: {
		template: '<div data-testid="identity-block" :data-action="actionLabel" :data-name="dapp?.name" />',
		props: ["dapp", "actionLabel", "hostnameTestId", "nameTestId"],
	},
	SectionLabel: { props: ["label"], template: "<div>{{ label }}</div>" },
	ItemsContainer: { template: "<div><slot /></div>" },
	DappCancelledOverlay: {
		props: ["message"],
		emits: ["dismiss"],
		template: `<div data-testid="cancelled-overlay" :data-message="message"><button data-testid="overlay-ok" @click="$emit('dismiss')" /></div>`,
	},
}

// Lazy import after vi.mock hoist
import Discover from "./index.vue"

// Every mount shares the mocks above: a page left mounted would react to the next test's state.
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

	test("before Allow it names the app's chain while the strip names the wallet's network alone", async () => {
		const w = await ready()
		expect(actionLine(w)).toBe("wants to connect on Devnet")
		const strip = w.get('[data-testid="status-strip"]')
		expect([strip.attributes("data-lead"), strip.attributes("data-network")]).toEqual(["TestNet", undefined])
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

describe("discover popup — what Allow reveals", () => {
	const ready = async () => {
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		loadPromiseResolve?.()
		await flushPromises()
		return w
	}
	const shown = (w: ReturnType<typeof factory>, testid: string) => shownText(w.get(`[data-testid="${testid}"]`).element)

	test("the sentence, the three facts and the remember line read as signed; the trust line is gone", async () => {
		const w = await ready()
		expect(shown(w, "discover-scope")).toBe(
			"Allowing lets this site discover Nulo. It sees no account or balance until you pass the connection check and approve a request.",
		)
		const rows = w.findAll('[data-testid="discover-facts"] [role="listitem"]').map((row) => {
			const sub = shownText(row.get('[data-testid="cap-row-sub"]').element)
			return [row.attributes("data-testid"), shownText(row.element).slice(0, -sub.length), sub]
		})
		expect(rows).toEqual([
			[
				"discover-fact-presence",
				"This site learns Nulo is installed.",
				"It also sees Nulo's version, as do the scripts on the page.",
			],
			["discover-fact-next", "It can then ask to connect.", "You compare emojis first. Sharing an account needs your OK."],
			["discover-fact-hidden", "It sees nothing else.", "No account, address, balance or history."],
		])
		expect(shown(w, "discover-remember")).toBe("Nulo remembers this site on Devnet for 7 days. Revoke it in Settings → Connected Apps.")
		expect(w.text()).not.toContain("Make sure you trust")
		expect(w.text()).not.toContain("General → Sessions")
	})

	test("the body reads in the signed order: the sentence, If you allow over the three facts, then the remember line", async () => {
		const w = await ready()
		const page = shownText(w.element)
		const at = (text: string) => page.indexOf(text)
		const order = [
			"Allowing lets this site discover Nulo.",
			"If you allow",
			"This site learns Nulo is installed.",
			"It can then ask to connect.",
			"It sees nothing else.",
			"Nulo remembers this site on",
		].map(at)
		expect(order.every((i) => i >= 0)).toBe(true)
		expect(order).toEqual([...order].sort((a, b) => a - b))
	})

	test("the two dotted terms define themselves from the glossary", async () => {
		const w = await ready()
		const terms = w.findAll('[data-testid="discover-scope"] [aria-describedby]')
		expect(terms.map((t) => [t.attributes("data-testid"), t.text()])).toEqual([
			["discover-term-discover", "discover"],
			["discover-term-check", "connection check"],
		])
		const definitions = terms.map((t) => w.get(`[id="${t.attributes("aria-describedby")}"]`).text())
		expect(definitions).toEqual([GLOSSARY.discover.definition, GLOSSARY["connection-check"].definition])
	})

	test("a request as the wire carries it: the remember line names the chain its fields decode to", async () => {
		// `chainInfo` arrives as two 32-byte hex fields and the app's name as its raw `appId`.
		const field = (n: number) => `0x${n.toString(16).padStart(64, "0")}`
		const chainInfo = { chainId: field(TESTNET_L1_CHAIN_ID), version: field(TESTNET_ROLLUP_VERSION) }
		payloadChainId = String(chainInfoToChainId({ chainInfo }))
		payloadDapp = { name: "nulo-playground", url: "https://playground.nulo.sh" }
		const w = await ready()
		expect(w.get('[data-testid="identity-block"]').attributes("data-name")).toBe("nulo-playground")
		expect(shown(w, "discover-remember")).toBe(
			"Nulo remembers this site on Testnet for 7 days. Revoke it in Settings → Connected Apps.",
		)
		expect(shown(w, "discover-scope")).toBe(
			"Allowing lets this site discover Nulo. It sees no account or balance until you pass the connection check and approve a request.",
		)
	})

	test("a chain with no wallet network: the remember line names it by its id", async () => {
		payloadChainId = "99"
		const w = await ready()
		expect(shown(w, "discover-remember")).toBe(
			"Nulo remembers this site on Aztec:99 for 7 days. Revoke it in Settings → Connected Apps.",
		)
	})

	test("before the request loads the remember line names no network", async () => {
		const w = factory()
		await flushPromises()
		expect(shown(w, "discover-remember")).toBe(
			"Nulo remembers this site on this network for 7 days. Revoke it in Settings → Connected Apps.",
		)
	})
})

describe("discover popup — Allow closes the window once the wallet has the answer", () => {
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

	test("an Allow the wallet has not answered keeps the window, Allow spinning and disabled, Deny disabled, the strip loading; its answer closes it", async () => {
		const answer = deferred<undefined>()
		resolveInteractionMock.mockReturnValueOnce(answer.promise)
		const w = await ready()
		const approving = approve(w)
		await flushPromises()
		expect(windowsRemove()).not.toHaveBeenCalled()
		expect(allow(w).attributes("data-loading")).toBe("true")
		expect(isDisabled(allow(w))).toBe(true)
		expect(isDisabled(deny(w))).toBe(true)
		expect(w.find('[data-testid="status-strip"]').attributes("data-status")).toBe("loading")

		answer.resolve(undefined)
		await approving
		await flushPromises()
		expect(windowsRemove()).toHaveBeenCalledWith(42)
		expect(rejectViaInteractionServiceMock).not.toHaveBeenCalled()
	})

	test("Deny before Allow closes the window (control)", async () => {
		const w = await ready()
		await (w.vm as unknown as { reject: () => Promise<void> }).reject()
		await flushPromises()
		expect(windowsRemove()).toHaveBeenCalledWith(42)
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

describe("discover popup — Allow every site", () => {
	const ready = async () => {
		const w = factory()
		await flushPromises()
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		loadPromiseResolve?.()
		await flushPromises()
		return w
	}
	const everySite = (w: ReturnType<typeof factory>) => w.find('[data-testid="discover-every-site"]')
	const press = async (w: ReturnType<typeof factory>) => {
		await everySite(w).trigger("click")
		await flushPromises()
	}
	// biome-ignore lint/suspicious/noExplicitAny: chrome runtime stub for tests
	const windowsRemove = () => (globalThis as any).chrome.windows.remove as ReturnType<typeof vi.fn>

	test("a native button under Deny and Allow in the footer, disabled until Allow is", async () => {
		const w = factory()
		await flushPromises()
		expect(isDisabled(everySite(w))).toBe(true)
		getActiveProfilePromiseResolve?.({ id: "p1" })
		await flushPromises()
		loadPromiseResolve?.()
		await flushPromises()
		expect(isDisabled(everySite(w))).toBe(false)
		expect(everySite(w).element.tagName).toBe("BUTTON")
		expect(everySite(w).attributes("type")).toBe("button")
		expect(shownText(everySite(w).element)).toBe("Allow every site")
		const footer = w.findAll('[data-testid="dapp-approval-footer"] button').map((b) => b.attributes("data-testid"))
		expect(footer).toEqual(["discover-deny-btn", "discover-allow-btn", "discover-every-site"])
	})

	test("the press asks the shared confirm; Cancel writes and answers nothing", async () => {
		const w = await ready()
		await press(w)
		expect(askConfirmMock).toHaveBeenCalledWith(EVERY_SITE_CONFIRM)
		expect(setEverySiteMock).not.toHaveBeenCalled()
		expect(resolveInteractionMock).not.toHaveBeenCalled()
		expect(windowsRemove()).not.toHaveBeenCalled()
	})

	test("a request as the wire carries it: Turn on writes the switch for the profile, then answers Allow, then closes", async () => {
		const field = (n: number) => `0x${n.toString(16).padStart(64, "0")}`
		payloadChainId = String(
			chainInfoToChainId({ chainInfo: { chainId: field(TESTNET_L1_CHAIN_ID), version: field(TESTNET_ROLLUP_VERSION) } }),
		)
		payloadDapp = { name: "nulo-playground", url: "https://playground.nulo.sh" }
		const order: string[] = []
		askConfirmMock.mockResolvedValueOnce(true)
		setEverySiteMock.mockImplementationOnce(async (...args: unknown[]) => {
			order.push(`write:${JSON.stringify(args)}`)
		})
		resolveInteractionMock.mockImplementationOnce(async (...args: unknown[]) => {
			order.push(`answer:${JSON.stringify(args)}`)
		})
		windowsRemove().mockImplementationOnce(() => order.push("close"))
		const w = await ready()
		await press(w)
		expect(order).toEqual(['write:["p1",true]', 'answer:["req-123",{"approved":true}]', "close"])
	})

	test("a write that fails answers nothing and keeps the window, with an error", async () => {
		askConfirmMock.mockResolvedValueOnce(true)
		setEverySiteMock.mockRejectedValueOnce(new Error("locked"))
		const w = await ready()
		await press(w)
		expect(resolveInteractionMock).not.toHaveBeenCalled()
		expect(windowsRemove()).not.toHaveBeenCalled()
		expect(w.find('[data-testid="error-text"]').exists()).toBe(true)
		expect(isDisabled(deny(w))).toBe(false)
	})

	test("Turn on writes even when the app cancelled meanwhile; the cancelled overlay shows", async () => {
		askConfirmMock.mockResolvedValueOnce(true)
		resolveInteractionMock.mockRejectedValueOnce(new JobCancelledError())
		const w = await ready()
		await press(w)
		expect(setEverySiteMock).toHaveBeenCalledWith("p1", true)
		expect(w.find('[data-testid="cancelled-overlay"]').exists()).toBe(true)
		expect(w.find('[data-testid="error-text"]').exists()).toBe(false)
	})
})
