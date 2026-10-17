/**
 * Frozen-oracle characterization tests for the discover approval window's SHELL
 * lifecycle — the connect/wait/redirect/init/beforeunload skeleton, the unmount
 * disconnect ORDER, and the closeWindow/beforeunload reject routing. Discover
 * uses the same `useDappApprovalWindow` shell as capabilities/execute, so these
 * pin its composition of that shell the same way those windows' oracles do; the
 * per-pin rationale lives in the characterization spec:
 * implementations-plan/archive/harden-quality-arc/window-characterization.md.
 *
 * Discover's business gate (the `isReady` phishing defense on the Allow button)
 * is pinned separately in `index.test.ts`; this file owns ONLY the shell skeleton.
 *
 * Pins covered here (spec ids): A1 connect set+order · A2 session gate ·
 * A3 auth redirect · A4 beforeunload-after-init (incl. init-throw) · A5 unmount
 * disconnect order · A6 closeWindow(true) vs closeWindow() incl. overlay dismiss ·
 * A7 no-double-reject · B8 reject two-layer order · B9 the reject bail-out
 * (discover DIVERGES from capabilities — it bails on !requestId; do NOT "fix") ·
 * B10 cancelled-reject inert · C12 onActiveProfileChanged guard.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import {
	approval,
	beforeunloadAdds,
	beforeunloadRemoves,
	callLog,
	completeInit,
	getActiveProfileMock,
	installWindowSpies,
	onActiveProfileChangedAddMock,
	rejectViaInteractionServiceMock,
	resetWindowHarness,
	routerMock,
	routerPushMock,
	windowsRemoveMock,
} from "../../../../tests/helpers/approval-window-harness"

const resolveInteractionMock = vi.fn(async () => undefined)

vi.mock(
	"@/composables/useDappInteractionPayload",
	async () => (await import("../../../../tests/helpers/approval-window-harness")).payloadModule,
)
vi.mock("@/composables/useDappHostname", async () => (await import("../../../../tests/helpers/approval-window-harness")).hostnameModule)
vi.mock(
	"@/wallet/services/profile/client",
	async () => (await import("../../../../tests/helpers/approval-window-harness")).profileClientModule,
)
vi.mock("@/wallet/services/dapp-interaction/client", async () =>
	(await import("../../../../tests/helpers/approval-window-harness")).interactionClientModule(() => ({
		resolveInteraction: resolveInteractionMock,
	})),
)
vi.mock("@/stores/app.store", async () => (await import("../../../../tests/helpers/approval-window-harness")).appStoreModule)
vi.mock("vue-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("vue-router")>()),
	...(await import("../../../../tests/helpers/approval-window-harness")).routerModule,
}))

beforeEach(() => {
	installWindowSpies()
})

let w: ReturnType<typeof factory> | undefined

afterEach(() => {
	// Unmount first, so the window's listener removal goes through the spy.
	w?.unmount()
	w = undefined
	resetWindowHarness()
})

// ── Stubs (children flattened; overlay stub re-emits dismiss on click) ──

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
	DappStatusStrip: { template: '<div data-testid="status-strip" />', props: ["accountName", "networkName", "status"] },
	DappIdentityBlock: {
		template: '<div data-testid="identity-block" />',
		props: ["dapp", "hostname", "hostnameSuspicious", "actionLabel", "hostnameTestId", "nameTestId"],
	},
	DappCancelledOverlay: {
		props: ["message"],
		emits: ["dismiss"],
		template: `<div data-testid="cancelled-overlay" :data-message="message" @click="$emit('dismiss')" />`,
	},
}

// Lazy import after vi.mock hoist
import Discover from "./index.vue"

const factory = () => mount(Discover, { global: { stubs: STUBS } })

type DiscoverVm = { reject: () => Promise<void>; closeWindow: (interactionCompleted?: boolean) => void }

describe("discover window — shell lifecycle frozen oracle", () => {
	test("A1: onMounted eager-connects exactly profile → interaction, in order", async () => {
		w = factory()
		await flushPromises()
		expect(callLog.filter((c) => c.endsWith(".connect"))).toEqual(["profile.connect", "interaction.connect"])
	})

	test("A2: session gate — init and beforeunload wait for isSessionChecked, then the delayed path completes", async () => {
		approval.appStore.isSessionChecked = false
		w = factory()
		await flushPromises()
		expect(getActiveProfileMock).not.toHaveBeenCalled()
		expect(beforeunloadAdds()).toBe(0)
		approval.appStore.isSessionChecked = true
		await flushPromises()
		expect(getActiveProfileMock).toHaveBeenCalledTimes(1)
		// Drive the unblocked init through to completion: the listener must register
		// exactly once on the delayed path too (not only the session-ready-at-mount path).
		// Flush between the two resolves — loadInteractionPayload is only called after
		// getActiveProfile resolves, so approval.resolveLoad isn't wired until then.
		approval.resolveProfile?.({ id: "p1" })
		await flushPromises()
		approval.resolveLoad?.()
		await flushPromises()
		expect(beforeunloadAdds()).toBe(1)
	})

	test("A3: auth redirect short-circuits — pageAwaitingAuth set, no init, no beforeunload", async () => {
		approval.appStore.isLogined = false
		w = factory()
		await flushPromises()
		expect(approval.appStore.pageAwaitingAuth).toBe(routerMock.currentRoute.value.fullPath)
		expect(routerPushMock).toHaveBeenCalledWith({ path: "/popup/auth" })
		expect(getActiveProfileMock).not.toHaveBeenCalled()
		expect(beforeunloadAdds()).toBe(0)
	})

	test("A4: beforeunload is added AFTER init resolves — exactly once", async () => {
		w = factory()
		await flushPromises()
		// init is suspended on getActiveProfile — listener must not exist yet.
		expect(beforeunloadAdds()).toBe(0)
		approval.resolveProfile?.({ id: "p1" })
		await flushPromises()
		// Still inside init (payload load pending).
		expect(beforeunloadAdds()).toBe(0)
		approval.resolveLoad?.()
		await flushPromises()
		expect(beforeunloadAdds()).toBe(1)
	})

	test("A4: beforeunload is STILL added when init throws internally", async () => {
		// init swallows its own errors into the error strip; the listener must be
		// registered anyway so a failed popup still rejects the request on close.
		w = factory()
		await flushPromises()
		approval.rejectProfile?.(new Error("profile-fetch-failed"))
		await flushPromises()
		expect(beforeunloadAdds()).toBe(1)
	})

	test("A5: unmount disconnect ORDER verbatim — profile, interaction, listener removal LAST", async () => {
		w = factory()
		await completeInit()
		callLog.length = 0
		w.unmount()
		w = undefined
		expect(callLog).toEqual(["profile.disconnect", "interaction.disconnect", "removeEventListener:beforeunload"])
	})

	test("A6: closeWindow(true) removes the beforeunload listener; closeWindow() keeps it; both close", async () => {
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as DiscoverVm
		vm.closeWindow()
		expect(beforeunloadRemoves()).toBe(0)
		expect(windowsRemoveMock).toHaveBeenCalledTimes(1)
		vm.closeWindow(true)
		expect(beforeunloadRemoves()).toBe(1)
		expect(windowsRemoveMock).toHaveBeenCalledTimes(2)
	})

	test("A6: overlay @dismiss wires to closeWindow() with NO arg — listener stays attached", async () => {
		w = factory()
		await completeInit()
		approval.isCancelled.value = true
		await w.vm.$nextTick()
		const overlay = w.find('[data-testid="cancelled-overlay"]')
		expect(overlay.exists()).toBe(true)
		await overlay.trigger("click")
		// Dismiss closes WITHOUT detaching beforeunload — the rejection is
		// deliberately delivered by the unload event, not a direct call.
		expect(windowsRemoveMock).toHaveBeenCalledTimes(1)
		expect(beforeunloadRemoves()).toBe(0)
	})

	test("A7: no double-reject — a decided reject detaches the listener before the window unloads", async () => {
		w = factory()
		await completeInit()
		await (w.vm as unknown as DiscoverVm).reject()
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledTimes(1)
		window.dispatchEvent(new Event("beforeunload"))
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledTimes(1)
	})

	test("B8: window-local reject() = composable reject THEN closeWindow(true) — order pinned", async () => {
		w = factory()
		await completeInit()
		callLog.length = 0
		await (w.vm as unknown as DiscoverVm).reject()
		expect(callLog).toEqual(["composableReject:User rejected", "removeEventListener:beforeunload", "windows.remove"])
	})

	test("B9 (DIVERGENCE): reject() with NO requestId is a COMPLETE no-op — discover bails where capabilities proceeds", async () => {
		// discover's reject() guards on `isInteractionCancelled || !requestId`, so a
		// pre-init reject (requestId still undefined) neither calls the composable
		// reject nor closes the window. Capabilities deliberately does the opposite
		// (implementations-plan/archive/harden-quality-arc/window-characterization.md § 6.5) — this asymmetry is preserved verbatim.
		w = factory()
		await flushPromises()
		expect(approval.requestId.value).toBeUndefined()
		await (w.vm as unknown as DiscoverVm).reject()
		expect(rejectViaInteractionServiceMock).not.toHaveBeenCalled()
		expect(beforeunloadRemoves()).toBe(0)
		expect(windowsRemoveMock).not.toHaveBeenCalled()
	})

	test("B10: a cancelled overlay dismiss keeps the listener, and the LIVE beforeunload reject is inert", async () => {
		// Exercises the real chain end-to-end (not a direct reject() call): overlay
		// dismiss → closeWindow() with no arg → beforeunload stays attached → the
		// browser unloads → the LIVE listener calls reject() → which must be a no-op
		// because the request is already cancelled, or a dismiss would double-reject.
		w = factory()
		await completeInit()
		approval.isCancelled.value = true
		await w.vm.$nextTick()
		await w.find('[data-testid="cancelled-overlay"]').trigger("click")
		expect(beforeunloadRemoves()).toBe(0) // dismiss did NOT detach the listener
		callLog.length = 0
		window.dispatchEvent(new Event("beforeunload")) // fire the live listener
		await flushPromises()
		expect(rejectViaInteractionServiceMock).not.toHaveBeenCalled()
		expect(callLog).toEqual([])
	})

	test("C12: onActiveProfileChanged — undefined or different id rejects; same id is a no-op", async () => {
		w = factory()
		// The window subscribes to onActiveProfileChanged exactly once during init.
		expect(onActiveProfileChangedAddMock).toHaveBeenCalledTimes(1)
		const handler = onActiveProfileChangedAddMock.mock.calls[0][0] as (p?: { id: string }) => void
		await completeInit({ id: "p1" })
		handler({ id: "p1" })
		await flushPromises()
		expect(rejectViaInteractionServiceMock).not.toHaveBeenCalled()
		handler({ id: "p-other" })
		await flushPromises()
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledTimes(1)
		handler(undefined)
		await flushPromises()
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledTimes(2)
	})
})

describe("discover window — after a resolved Allow", () => {
	const approve = () => {
		if (!w) throw new Error("mount the window first")
		return (w.vm as unknown as { approve: () => Promise<void> }).approve()
	}

	test("the beforeunload listener is removed and the window is not closed: it shows the emoji check next", async () => {
		w = factory()
		await completeInit()
		callLog.length = 0
		await approve()
		await flushPromises()
		expect(callLog).toEqual(["removeEventListener:beforeunload"])
		window.dispatchEvent(new Event("beforeunload"))
		expect(rejectViaInteractionServiceMock).not.toHaveBeenCalled()
	})

	test.each([
		["a profile switch", { id: "p-other" }],
		["a lock", undefined],
	])("%s while it connects closes the window", async (_, next) => {
		w = factory()
		const handler = onActiveProfileChangedAddMock.mock.calls[0][0] as (p?: { id: string }) => void
		await completeInit({ id: "p1" })
		await approve()
		await flushPromises()
		expect(windowsRemoveMock).not.toHaveBeenCalled()
		handler(next)
		await flushPromises()
		expect(windowsRemoveMock).toHaveBeenCalledTimes(1)
	})
})
