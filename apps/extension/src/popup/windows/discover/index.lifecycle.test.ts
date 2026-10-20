/**
 * The discover approval window on the shared approval shell, whose own contracts
 * `composables/useDappApprovalWindow.test.ts` pins. This file pins what the window adds to it: the
 * services it connects and the order it disconnects them (A1, A5), an init the shell gates and
 * waits for, the profile fetch then the payload load (A2, A4, a throwing init included), its
 * overlay dismiss and its reject routed through the shell's close (A6, B8, B10), its reject's
 * bail-out with no request id, where capabilities proceeds (B9), the profile guard it subscribes
 * (C12) and what follows a resolved Allow. The Allow button's phishing gate is pinned in
 * `index.test.ts`.
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
	windowsRemoveMock,
} from "../../../../tests/helpers/approval-window-harness"

const resolveInteractionMock = vi.fn(async () => undefined)

vi.mock(
	"@/composables/useDappInteractionPayload",
	async () => (await import("../../../../tests/helpers/approval-window-harness")).payloadModule,
)
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
		props: ["dapp", "actionLabel", "hostnameTestId", "nameTestId"],
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

type DiscoverVm = { reject: (end: "reject") => Promise<void>; closeWindow: (interactionCompleted?: boolean) => void }

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

	test("B8: window-local reject() detaches the unload listener, sends its end, THEN closes — order pinned", async () => {
		w = factory()
		await completeInit()
		callLog.length = 0
		await (w.vm as unknown as DiscoverVm).reject("reject")
		expect(callLog).toEqual(["removeEventListener:beforeunload", "composableReject:User rejected:reject", "windows.remove"])
	})

	test("B9 (DIVERGENCE): reject() with NO requestId is a COMPLETE no-op — discover bails where capabilities proceeds", async () => {
		// discover's reject() guards on `isInteractionCancelled || !requestId`, so a
		// pre-init reject (requestId still undefined) neither calls the composable
		// reject nor closes the window. Capabilities deliberately does the opposite
		// (implementations-plan/archive/harden-quality-arc/window-characterization.md § 6.5) — this asymmetry is preserved verbatim.
		w = factory()
		await flushPromises()
		expect(approval.requestId.value).toBeUndefined()
		await (w.vm as unknown as DiscoverVm).reject("reject")
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

	test("the beforeunload listener is removed, then the window closes, and its unload rejects nothing", async () => {
		w = factory()
		await completeInit()
		callLog.length = 0
		await approve()
		await flushPromises()
		expect(callLog).toEqual(["removeEventListener:beforeunload", "windows.remove"])
		window.dispatchEvent(new Event("beforeunload"))
		expect(rejectViaInteractionServiceMock).not.toHaveBeenCalled()
	})
})
