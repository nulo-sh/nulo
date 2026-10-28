import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"
import { InvalidPasswordError, RestoreTornError, UserRejectedError } from "@nulo/extension-messaging/errors"
import { Flex, Icon, Input, Text } from "@nulo/design"
import { expectMaskToggle, expectNativeAttrs, nativeInput, typeNow } from "../../../tests/helpers/credential-pins"
import { sendEvent } from "../../../tests/helpers/send-event"
import { PasskeyPrfError } from "@/wallet/utils/passkey-errors"
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
import { useToast } from "@/composables/toast"
import { managers } from "@/utils/core"
import { AccountServiceClient } from "@/wallet/services/account/client"
import { closesOnFocusLoss } from "@/utils/browser-surface"
import { captureOwnWindow, releaseOwnWindow } from "@/utils/own-window"
import { getLastActiveProfileId } from "@/utils/lastActiveProfile"
import type { ProfileInfo } from "@/wallet/services/profile/spec"
import Auth from "./auth.vue"

const unlockProfile = vi.fn()
const unlockPasskeyProfile = vi.fn()
const getPasskeyUnlockParams = vi.fn()
const runCeremony = vi.fn()
const initTransactionServiceMock = vi.fn()
const setLastActiveProfileIdMock = vi.fn(async () => undefined)
const openToastMock = vi.fn()
// Controllable activation wait: defaults to the REAL implementation; the
// window-1 drift pin overrides one call to simulate the wait resolving in the
// exact microtask where a different unlock has already won (unreachable
// deterministically through the real watcher — Vue batches the flips).
const waitHolder = vi.hoisted(() => ({
	mock: vi.fn(),
	real: undefined as unknown as (...a: unknown[]) => Promise<void>,
}))
vi.mock("@/composables/unlockWait", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@/composables/unlockWait")>()
	waitHolder.real = mod.awaitProfileActivation as (...a: unknown[]) => Promise<void>
	return { ...mod, awaitProfileActivation: (...a: unknown[]) => waitHolder.mock(...(a as [])) }
})

/** Profile ids whose activation runs in this document, as the bootstrap's registry reports them. */
const activations = vi.hoisted(() => ({ ids: undefined as unknown as Set<string> }))
vi.mock("@/composables/useProfileBootstrap", async () => {
	const { reactive } = await import("vue")
	activations.ids = reactive(new Set<string>())
	return { isAnyActivating: () => activations.ids.size > 0 }
})

/** Another window's writes of the last-active pointer, and the service's deletions, as this page hears them. */
const elsewhere = vi.hoisted(() => {
	const picks = new Set<(id: string | undefined) => void>()
	const deletions = new Set<(profile: { id: string }) => void>()
	return {
		picks,
		deletions,
		pick: (id: string | undefined) => {
			for (const listener of picks) listener(id)
		},
		delete: (id: string) => {
			for (const listener of deletions) listener({ id })
		},
	}
})
vi.mock("@/utils/core", () => ({
	managers: {
		profile: {
			unlockProfile: (...args: unknown[]) => unlockProfile(...args),
			unlockPasskeyProfile: (...args: unknown[]) => unlockPasskeyProfile(...args),
			getPasskeyUnlockParams: (...args: unknown[]) => getPasskeyUnlockParams(...args),
			getProfiles: vi.fn(async () => []),
			onProfileDeleted: {
				add: (listener: (profile: { id: string }) => void) => elsewhere.deletions.add(listener),
				remove: (listener: (profile: { id: string }) => void) => elsewhere.deletions.delete(listener),
			},
		},
		account: undefined,
	},
	initTransactionService: (...args: unknown[]) => initTransactionServiceMock(...(args as [])),
	refreshBalances: vi.fn(async () => undefined),
}))
vi.mock("@/composables/toast", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/composables/toast")>()
	return {
		...real,
		useToast: () => {
			const toast = real.useToast()
			return {
				...toast,
				openToast: (options: Parameters<typeof toast.openToast>[0]) => {
					openToastMock(options)
					toast.openToast(options)
				},
			}
		},
	}
})
vi.mock("@/composables/usePasskeyCeremony", () => ({
	usePasskeyCeremony: () => ({
		request: { value: null },
		runCeremony: (...args: unknown[]) => runCeremony(...args),
		onResolve: vi.fn(),
		onReject: vi.fn(),
	}),
}))
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: vi.fn(() => false) }))
vi.mock("@/utils/lastActiveProfile", () => ({
	getLastActiveProfileId: vi.fn(async () => undefined),
	setLastActiveProfileId: (...args: unknown[]) => setLastActiveProfileIdMock(...(args as [])),
	onLastActiveProfileChanged: (listener: (id: string | undefined) => void) => {
		elsewhere.picks.add(listener)
		return () => elsewhere.picks.delete(listener)
	},
}))
vi.mock("@/wallet/services/account/client", () => ({ AccountServiceClient: vi.fn() }))
const routerPush = vi.fn()
vi.mock("vue-router", () => ({
	useRouter: () => ({ push: routerPush, go: vi.fn() }),
	useRoute: () => ({ name: "popup-auth", meta: {} }),
}))

beforeEach(() => {
	activations.ids?.clear()
	unlockProfile.mockReset()
	unlockPasskeyProfile.mockReset()
	getPasskeyUnlockParams.mockReset()
	runCeremony.mockReset()
	vi.mocked(closesOnFocusLoss).mockReturnValue(false)
	openToastMock.mockReset()
	useToast().closeToast()
	initTransactionServiceMock.mockReset()
	setLastActiveProfileIdMock.mockReset()
	setLastActiveProfileIdMock.mockResolvedValue(undefined)
	waitHolder.mock.mockReset().mockImplementation((...a: unknown[]) => waitHolder.real(...a))
	vi.mocked(managers.profile.getProfiles).mockReset().mockResolvedValue([])
	vi.mocked(getLastActiveProfileId).mockReset().mockResolvedValue(undefined)
	vi.stubGlobal("chrome", {
		storage: {},
		runtime: { connect: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
	})
	installChromeStorage({}, { persist: false })
})
// A page left mounted still hears picks and deletions, and its reads would take a later test's answers.
const mounted: VueWrapper[] = []
afterEach(() => {
	for (const wrapper of mounted.splice(0)) wrapper.unmount()
	vi.unstubAllGlobals()
})

/** Minimal Input stub that keeps v-model wiring alive so the submit gate
 *  (`isAllowedToContinue`) opens once a password is typed. */
const InputStub = {
	props: ["modelValue"],
	emits: ["update:modelValue", "input"],
	// auth.vue's onMounted calls the template-ref's focus(); expose a no-op.
	methods: { focus() {} },
	template: `<input :value="modelValue" data-stub-input @input="$emit('update:modelValue', $event.target.value); $emit('input', $event)" />`,
}

/** `selectedAtMount` is the selection the page mounts with; without it, `p1` is selected just after. */
function mountAuth(provide: Record<string, unknown> = {}, selectedAtMount?: ProfileInfo) {
	const initialState = selectedAtMount ? { app: { profile: selectedAtMount } } : {}
	const wrapper = mount(Auth, {
		global: {
			provide,
			plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false, initialState })],
			stubs: {
				Input: InputStub,
				Button: { template: `<button type="submit" v-bind="$attrs"><slot /></button>` },
				Tooltip: { template: `<div><slot /></div>` },
				Flex: { template: `<div><slot /></div>` },
				AuthProfilePill: true,
				PasskeyCeremonyDialog: true,
				Transition: true,
			},
		},
	})
	mounted.push(wrapper)
	const appStore = useAppStore()
	if (!selectedAtMount) appStore.profile = { id: "p1", name: "P", type: "password" } as never
	return { wrapper, appStore }
}

describe("auth.vue — torn-import unlock refusal", () => {
	test("a RestoreTornError from unlock surfaces the torn explanation (no route, no wrong-password shake)", async () => {
		unlockProfile.mockRejectedValue(new RestoreTornError(undefined, { profileId: "p1" }))
		const { wrapper } = mountAuth()
		await flushPromises()

		await wrapper.find("[data-stub-input]").setValue("pass1234")
		await wrapper.find("form").trigger("submit")
		await flushPromises()

		const torn = wrapper.find('[data-testid="auth-restore-torn"]')
		expect(torn.exists()).toBe(true)
		expect(torn.text()).toContain("didn't finish")
		expect(wrapper.find('[data-testid="error-text"]').exists()).toBe(false)
		expect(openToastMock).not.toHaveBeenCalled()
		expect(routerPush).not.toHaveBeenCalled()
	})

	test("the torn state clears when the user switches profiles on this screen", async () => {
		unlockProfile.mockRejectedValue(new RestoreTornError(undefined, { profileId: "p1" }))
		const { wrapper, appStore } = mountAuth()
		await flushPromises()
		await wrapper.find("[data-stub-input]").setValue("pass1234")
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(wrapper.find('[data-testid="auth-restore-torn"]').exists()).toBe(true)

		appStore.profile = { id: "p2", name: "Q", type: "password" } as never
		await flushPromises()
		await wrapper.vm.$nextTick()
		expect(wrapper.find('[data-testid="auth-restore-torn"]').exists()).toBe(false)
	})
})

describe("auth.vue — post-unlock navigation is single-shot", () => {
	beforeEach(() => {
		routerPush.mockReset()
		window.location.hash = "#/popup/auth"
	})
	afterEach(() => {
		window.location.hash = ""
	})

	test("watcher and submit handler race to ONE push even while the hash has not moved yet", async () => {
		unlockProfile.mockResolvedValue({ id: "p1", name: "P", type: "password" })
		// The real router moves the hash only AFTER async route resolution — the mock leaves it
		// untouched to model that window, so only the claim election can stop the second push.
		routerPush.mockResolvedValue(undefined)
		const { wrapper, appStore } = mountAuth()
		await flushPromises()

		await wrapper.find("[data-stub-input]").setValue("pass1234")
		await wrapper.find("form").trigger("submit")
		await flushPromises()

		// The submit handler is parked in its activation wait; the flip below fires the
		// watcher (push #1) and resolves the wait, whose continuation must find the claim taken.
		appStore.isLogined = true
		await new Promise((r) => setTimeout(r, 350))
		await flushPromises()

		expect(routerPush).toHaveBeenCalledTimes(1)
		expect(routerPush).toHaveBeenCalledWith("/popup/general")
	})

	test("the isLogined watcher never pushes when the popup already left the auth screen", async () => {
		window.location.hash = "#/popup/send"
		const { appStore } = mountAuth()
		await flushPromises()

		appStore.isLogined = true
		await flushPromises()

		expect(routerPush).not.toHaveBeenCalled()
	})

	test("a route merely CARRYING ?from=/popup/auth is off-screen: no push (substring regression)", async () => {
		// The select-profile popup navigates to /popup/import?from=/popup/auth — a substring
		// hash test matched it and yanked the user out of the import flow.
		window.location.hash = "#/popup/import?from=/popup/auth"
		const { appStore } = mountAuth()
		await flushPromises()

		appStore.isLogined = true
		await flushPromises()

		expect(routerPush).not.toHaveBeenCalled()
	})

	test("in an own window, unlocking returns to the flow the window opened for", async () => {
		captureOwnWindow("#/popup/settings/security/export/full?window=own")
		try {
			const { appStore } = mountAuth()
			await flushPromises()
			appStore.isLogined = true
			await flushPromises()

			expect(routerPush).toHaveBeenCalledWith("/popup/settings/security/export/full")
		} finally {
			releaseOwnWindow()
		}
	})

	test("a dApp window's waiting page still comes first", async () => {
		captureOwnWindow("#/popup/settings/security/export/full?window=own")
		try {
			const { appStore } = mountAuth()
			appStore.pageAwaitingAuth = "/windows/execute?id=1"
			await flushPromises()
			appStore.isLogined = true
			await flushPromises()

			expect(routerPush).toHaveBeenCalledWith("/windows/execute?id=1")
		} finally {
			releaseOwnWindow()
		}
	})
})

describe("auth.vue — bounded activation wait", () => {
	async function submitUnlock(wrapper: ReturnType<typeof mountAuth>["wrapper"]) {
		await wrapper.find("[data-stub-input]").setValue("pw")
		await wrapper.find("form").trigger("submit")
	}

	test("timeout: the latch releases and the timeout toast fires (the spinner can no longer brick)", async () => {
		vi.useFakeTimers()
		try {
			unlockProfile.mockResolvedValue({ id: "p1", name: "P", type: "password" })
			const { wrapper } = mountAuth()
			await submitUnlock(wrapper)
			await vi.advanceTimersByTimeAsync(30_001) // isLogined never flips
			expect(openToastMock).toHaveBeenCalledWith(
				expect.objectContaining({ kind: "error", label: expect.stringContaining("timed out") }),
			)
			// Latch released: a second submit reaches the service again.
			await submitUnlock(wrapper)
			expect(unlockProfile).toHaveBeenCalledTimes(2)
		} finally {
			vi.useRealTimers()
		}
	})

	test("bootstrap failure releases the waiter IMMEDIATELY — no timeout burn, no auth-side toast", async () => {
		unlockProfile.mockResolvedValue({ id: "p1", name: "P", type: "password" })
		const { wrapper, appStore } = mountAuth()
		await submitUnlock(wrapper)
		appStore.bootstrapFailure = { profileId: "p1", message: "rpc down" }
		await flushPromises() // real timers — release must not need the 30 s bound
		// The shell owns the failure toast; auth stays silent and just releases.
		expect(openToastMock).not.toHaveBeenCalled()
		await submitUnlock(wrapper)
		expect(unlockProfile).toHaveBeenCalledTimes(2) // latch was released
	})

	test("hijack: a different profile wins — silent yield, no toast, no continuation writes", async () => {
		vi.useFakeTimers()
		try {
			unlockProfile.mockResolvedValue({ id: "p1", name: "P", type: "password" })
			const { wrapper, appStore } = mountAuth()
			await submitUnlock(wrapper)
			appStore.profile = { id: "p2", name: "Q", type: "password" } as never
			appStore.isLogined = true
			await vi.advanceTimersByTimeAsync(30_001) // p1's wait can only time out
			expect(openToastMock).not.toHaveBeenCalled() // silent yield
			expect(initTransactionServiceMock).not.toHaveBeenCalled() // no continuation writes
		} finally {
			vi.useRealTimers()
		}
	})

	test("reentry guard: a second submit while the first awaits does not reach the service twice", async () => {
		let resolveUnlock!: (v: unknown) => void
		unlockProfile.mockReturnValue(new Promise((r) => (resolveUnlock = r)))
		const { wrapper } = mountAuth()
		await submitUnlock(wrapper)
		await submitUnlock(wrapper) // latch held — must be a no-op
		expect(unlockProfile).toHaveBeenCalledTimes(1)
		resolveUnlock(undefined)
	})

	test("IMMEDIATE post-wait drift: a stale continuation persists nothing (window 1)", async () => {
		// The wait "resolves" for p1 in the exact microtask where a different
		// unlock already won — the continuation's FIRST check must stand down
		// before setLastActiveProfileId, or the stale run persists p1 as
		// last-active OVER the winner.
		unlockProfile.mockResolvedValue({ id: "p1", name: "P", type: "password" })
		waitHolder.mock.mockResolvedValueOnce(undefined)
		const { wrapper, appStore } = mountAuth()
		appStore.profile = { id: "p2", name: "Q", type: "password" } as never // the winner is installed
		appStore.isLogined = true
		await submitUnlock(wrapper)
		await flushPromises()
		expect(setLastActiveProfileIdMock).not.toHaveBeenCalled()
		expect(initTransactionServiceMock).not.toHaveBeenCalled()
	})

	test("a stale bootstrapFailure record from a prior attempt does not insta-reject the next attempt", async () => {
		unlockProfile.mockResolvedValue({ id: "p1", name: "P", type: "password" })
		const { wrapper, appStore } = mountAuth()
		appStore.bootstrapFailure = { profileId: "p1", message: "old failure" }
		await submitUnlock(wrapper) // clears the record before waiting
		appStore.profile = { id: "p1", name: "P", type: "password" } as never
		appStore.isLogined = true
		await flushPromises()
		// The attempt SUCCEEDED — the stale record neither rejected the wait
		// nor produced a failure branch.
		expect(initTransactionServiceMock).toHaveBeenCalled()
		expect(openToastMock).not.toHaveBeenCalled()
	})

	test("post-setLastActiveProfileId drift: a resumed stale continuation replaces nothing", async () => {
		unlockProfile.mockResolvedValue({ id: "p1", name: "P", type: "password" })
		let releaseSetLast!: () => void
		setLastActiveProfileIdMock.mockReturnValue(new Promise<undefined>((r) => (releaseSetLast = () => r(undefined))))
		const { wrapper, appStore } = mountAuth()
		await submitUnlock(wrapper)
		appStore.profile = { id: "p1", name: "P", type: "password" } as never
		appStore.isLogined = true
		await flushPromises() // wait resolves; continuation parks in setLastActiveProfileId
		appStore.profile = { id: "p2", name: "Q", type: "password" } as never // drift
		releaseSetLast()
		await flushPromises()
		expect(initTransactionServiceMock).not.toHaveBeenCalled() // second check stood down
	})
})

describe("auth.vue — the mount's last-active lookup", () => {
	const A = { id: "pA", name: "A", type: "password" } as ProfileInfo
	const B = { id: "pB", name: "B", type: "password" } as ProfileInfo

	/** Mounts with nothing selected and holds the profile list until the returned release. */
	async function mountWithHeldLookup() {
		vi.mocked(getLastActiveProfileId).mockResolvedValueOnce("pA")
		let release!: () => void
		vi.mocked(managers.profile.getProfiles).mockReturnValueOnce(
			new Promise((resolve) => {
				release = () => resolve([A, B])
			}),
		)
		const mounted = mountAuth()
		mounted.appStore.profile = undefined
		await flushPromises()
		return { ...mounted, release }
	}

	test("selects the last active profile when nothing changed meanwhile", async () => {
		const { appStore, release } = await mountWithHeldLookup()
		release()
		await flushPromises()
		expect(appStore.profile?.id).toBe("pA")
	})

	test("a profile opened while the list loads stays selected", async () => {
		const { appStore, release } = await mountWithHeldLookup()
		appStore.profile = B
		appStore.isLogined = true
		release()
		await flushPromises()
		expect(appStore.profile?.id).toBe("pB")
	})

	test("a list that answers after the page left selects nothing", async () => {
		const { wrapper, appStore, release } = await mountWithHeldLookup()
		wrapper.unmount()
		release()
		await flushPromises()
		expect(appStore.profile).toBeUndefined()
	})

	test("after the last active profile was deleted, several left: the first by name is selected and no chooser opens", async () => {
		vi.mocked(getLastActiveProfileId).mockResolvedValueOnce("deleted")
		vi.mocked(managers.profile.getProfiles).mockResolvedValueOnce([B, A])
		const { appStore } = mountAuth()
		const selected = () => appStore.profile?.id
		appStore.profile = undefined
		await flushPromises()

		expect(selected()).toBe("pA")
		expect(usePopupStore().isOpened("select_profile")).toBe(false)
	})
})

describe("auth.vue — the profile it shows follows other windows", () => {
	const A = { id: "pA", name: "A", type: "password" } as ProfileInfo
	const B = { id: "pB", name: "B", type: "password" } as ProfileInfo
	const C = { id: "pC", name: "C", type: "password" } as ProfileInfo

	beforeEach(() => {
		vi.mocked(getLastActiveProfileId).mockResolvedValue(undefined)
		vi.mocked(managers.profile.getProfiles).mockResolvedValue([A, B, C])
	})

	test("another window's pick on its lock screen moves this one, and a later pick wins over an earlier one still loading", async () => {
		const { appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()

		let releaseEarlier!: () => void
		vi.mocked(managers.profile.getProfiles).mockReturnValueOnce(new Promise((resolve) => (releaseEarlier = () => resolve([A, B, C]))))
		elsewhere.pick("pB")
		elsewhere.pick("pC")
		await flushPromises()
		releaseEarlier()
		await flushPromises()

		expect(appStore.profile?.id).toBe("pC")
	})

	test("a pick elsewhere while an unlock runs here leaves the profile that unlock reads", async () => {
		unlockProfile.mockReturnValue(new Promise(() => {}))
		const { wrapper, appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()
		await wrapper.find("[data-stub-input]").setValue("pass1234")
		await wrapper.find("form").trigger("submit")
		await flushPromises()

		elsewhere.pick("pB")
		await flushPromises()

		expect(appStore.profile?.id).toBe("pA")
	})

	test("a selection made here while another window's pick loads stands", async () => {
		const { appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()

		let release!: () => void
		vi.mocked(managers.profile.getProfiles).mockReturnValueOnce(new Promise((resolve) => (release = () => resolve([A, B, C]))))
		elsewhere.pick("pB")
		appStore.profile = C
		release()
		await flushPromises()

		expect(appStore.profile?.id).toBe("pC")
	})

	test("a pick or a deletion elsewhere during an unlock that fails here settles the profile once it ends", async () => {
		const unlockThatFails = async (profile: ProfileInfo, elsewhereMeanwhile: () => void) => {
			let fail!: () => void
			unlockProfile.mockReturnValueOnce(new Promise((_resolve, reject) => (fail = () => reject(new Error("refused")))))
			const mounted = mountAuth()
			mounted.appStore.profile = profile
			await flushPromises()
			await mounted.wrapper.find("[data-stub-input]").setValue("pass1234")
			await mounted.wrapper.find("form").trigger("submit")
			await flushPromises()
			elsewhereMeanwhile()
			await flushPromises()
			expect(mounted.appStore.profile?.id).toBe(profile.id)
			fail()
			await flushPromises()
			return mounted
		}

		const picked = await unlockThatFails(A, () => {
			vi.mocked(getLastActiveProfileId).mockResolvedValue("pB")
			elsewhere.pick("pB")
		})
		expect(picked.appStore.profile?.id).toBe("pB")
		picked.wrapper.unmount()

		vi.mocked(getLastActiveProfileId).mockResolvedValue(undefined)
		const deleted = await unlockThatFails(A, () => {
			vi.mocked(managers.profile.getProfiles).mockResolvedValue([C, B])
			elsewhere.delete("pA")
		})
		expect(deleted.appStore.profile?.id).toBe("pB")
		expect(usePopupStore().isOpened("select_profile")).toBe(false)
	})

	test("a pick elsewhere waits out an activation running here, and applies only if that activation leaves the page locked", async () => {
		const { appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()

		activations.ids.add("pA")
		vi.mocked(getLastActiveProfileId).mockResolvedValue("pB")
		elsewhere.pick("pB")
		await flushPromises()
		expect(appStore.profile?.id).toBe("pA")
		activations.ids.delete("pA")
		await flushPromises()
		expect(appStore.profile?.id).toBe("pB")

		activations.ids.add("pB")
		vi.mocked(getLastActiveProfileId).mockResolvedValue("pC")
		elsewhere.pick("pC")
		await flushPromises()
		appStore.isLogined = true
		activations.ids.delete("pB")
		await flushPromises()
		expect(appStore.profile?.id).toBe("pB")
	})

	test("a profile chosen here during an unlock stands over a pick that arrived during it", async () => {
		let fail!: () => void
		unlockProfile.mockReturnValueOnce(new Promise((_resolve, reject) => (fail = () => reject(new Error("refused")))))
		const { wrapper, appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()
		await wrapper.find("[data-stub-input]").setValue("pass1234")
		await wrapper.find("form").trigger("submit")
		await flushPromises()

		vi.mocked(getLastActiveProfileId).mockResolvedValue("pB")
		elsewhere.pick("pB")
		appStore.profile = C
		fail()
		await flushPromises()

		expect(appStore.profile?.id).toBe("pC")
	})

	test("its profile deleted elsewhere: several left select the first by name; the only one left is selected", async () => {
		const { appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()
		const popups = usePopupStore()

		vi.mocked(managers.profile.getProfiles).mockResolvedValue([C, B])
		elsewhere.delete("pA")
		await flushPromises()
		expect(appStore.profile?.id).toBe("pB")
		expect(popups.isOpened("select_profile")).toBe(false)

		vi.mocked(managers.profile.getProfiles).mockResolvedValue([C])
		elsewhere.delete("pB")
		await flushPromises()
		expect(appStore.profile?.id).toBe("pC")
		expect(popups.isOpened("select_profile")).toBe(false)
	})

	test("its selection cleared from outside while locked: the only profile left is selected, else the first by name", async () => {
		const { appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()
		const popups = usePopupStore()
		const selected = () => appStore.profile?.id

		vi.mocked(managers.profile.getProfiles).mockResolvedValue([B])
		appStore.profile = undefined
		await flushPromises()
		expect(selected()).toBe("pB")

		vi.mocked(managers.profile.getProfiles).mockResolvedValue([C, B])
		appStore.profile = undefined
		await flushPromises()
		expect(selected()).toBe("pB")
		expect(popups.isOpened("select_profile")).toBe(false)
	})

	test("a selection cleared while the person has the chooser open still settles behind it, and the chooser stays", async () => {
		const { appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()
		const popups = usePopupStore()
		popups.open("select_profile")
		const selected = () => appStore.profile?.id

		vi.mocked(managers.profile.getProfiles).mockResolvedValue([C, B])
		appStore.profile = undefined
		await flushPromises()
		expect(selected()).toBe("pB")
		expect(popups.isOpened("select_profile")).toBe(true)
	})

	test("a pick another window makes while an automatic settle reads is the one that stands", async () => {
		const { appStore } = mountAuth()
		await flushPromises()
		const selected = () => appStore.profile?.id
		let releaseSettle!: () => void
		let releasePick!: () => void
		vi.mocked(managers.profile.getProfiles)
			.mockReturnValueOnce(new Promise((resolve) => (releaseSettle = () => resolve([C, B]))))
			.mockReturnValueOnce(new Promise((resolve) => (releasePick = () => resolve([C, B]))))
		appStore.profile = undefined
		await flushPromises()

		// On Firefox a read can still answer the pointer the pick replaced: the settle never sees "pC".
		elsewhere.pick("pC")
		await flushPromises()
		releaseSettle()
		await flushPromises()
		releasePick()
		await flushPromises()
		expect(selected()).toBe("pC")
	})

	test("a profile picked here after an automatic settle stands over another window's pick still loading", async () => {
		const { appStore } = mountAuth()
		await flushPromises()
		const selected = () => appStore.profile?.id
		let releaseSettle!: () => void
		let releasePick!: () => void
		vi.mocked(managers.profile.getProfiles)
			.mockReturnValueOnce(new Promise((resolve) => (releaseSettle = () => resolve([C, B]))))
			.mockReturnValueOnce(new Promise((resolve) => (releasePick = () => resolve([C, B]))))
		appStore.profile = undefined
		await flushPromises()

		elsewhere.pick("pC")
		await flushPromises()
		releaseSettle()
		await flushPromises()
		expect(selected()).toBe("pB")
		// The chooser's pick, before its pointer write is heard: no newer follow supersedes the old one.
		appStore.profile = { ...A }
		releasePick()
		await flushPromises()
		expect(selected()).toBe("pA")
	})

	test("a pick of the selected profile another window makes while a settle reads keeps it", async () => {
		vi.mocked(getLastActiveProfileId).mockResolvedValueOnce("pB")
		let release!: () => void
		vi.mocked(managers.profile.getProfiles).mockReturnValueOnce(new Promise((resolve) => (release = () => resolve([A, B]))))
		const { appStore } = mountAuth({}, A)
		await flushPromises()

		// The settle read the pointer this pick replaced.
		elsewhere.pick("pA")
		release()
		await flushPromises()
		expect(appStore.profile?.id).toBe("pA")
	})

	test("a stale pick naming a deleted selection does not stop the settle that follows the deletion", async () => {
		const { appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()

		vi.mocked(getLastActiveProfileId).mockResolvedValueOnce("pB")
		let release!: () => void
		vi.mocked(managers.profile.getProfiles).mockReturnValueOnce(new Promise((resolve) => (release = () => resolve([B, C]))))
		elsewhere.delete("pA")
		await flushPromises()
		elsewhere.pick("pA")
		release()
		await flushPromises()
		expect(appStore.profile?.id).toBe("pB")
	})

	test("with nothing selected, a pointer event with no id does not stop the settle", async () => {
		const { appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()
		const selected = () => appStore.profile?.id

		let release!: () => void
		vi.mocked(managers.profile.getProfiles).mockReturnValueOnce(new Promise((resolve) => (release = () => resolve([C, B]))))
		appStore.profile = undefined
		await flushPromises()
		elsewhere.pick(undefined)
		release()
		await flushPromises()
		expect(selected()).toBe("pB")
	})

	test("with no last active profile in the list, a selection it still holds stays; a last active one is selected", async () => {
		vi.mocked(managers.profile.getProfiles).mockResolvedValue([A, B, C])
		const kept = mountAuth({}, C)
		await flushPromises()
		expect(kept.appStore.profile?.id).toBe("pC")
		kept.wrapper.unmount()

		vi.mocked(getLastActiveProfileId).mockResolvedValue("pB")
		const lastActive = mountAuth({}, C)
		await flushPromises()
		expect(lastActive.appStore.profile?.id).toBe("pB")
	})

	test("a deletion of another profile changes nothing here", async () => {
		const { appStore } = mountAuth()
		appStore.profile = A
		await flushPromises()

		vi.mocked(managers.profile.getProfiles).mockResolvedValue([A, C])
		elsewhere.delete("pB")
		await flushPromises()

		expect(appStore.profile?.id).toBe("pA")
		expect(usePopupStore().isOpened("select_profile")).toBe(false)
	})
})

describe("auth.vue — the account client survives an unlock", () => {
	test("a successful unlock keeps the account client the wallet already holds and still runs its continuation", async () => {
		const existing = { getAccounts: vi.fn() }
		managers.account = existing as never
		unlockProfile.mockResolvedValue({ id: "p1", name: "P", type: "password" })
		const { wrapper, appStore } = mountAuth()
		await wrapper.find("[data-stub-input]").setValue("pw")
		await wrapper.find("form").trigger("submit")
		appStore.isLogined = true
		await flushPromises()

		expect(AccountServiceClient).not.toHaveBeenCalled()
		expect(managers.account).toBe(existing)
		expect(initTransactionServiceMock).toHaveBeenCalled()
	})
})

describe("auth.vue — passkey unlock", () => {
	async function submitPasskeyUnlock() {
		const { wrapper, appStore } = mountAuth()
		appStore.profile = { id: "p1", name: "P", type: "passkey" } as never
		await flushPromises()
		await wrapper.find("form").trigger("submit")
		await flushPromises()
	}

	// Another input would rebuild another key, which opens nothing this profile sealed.
	test("in the page, the ceremony runs against this profile's credential at its own input", async () => {
		getPasskeyUnlockParams.mockResolvedValue({ credentialId: "cred-1", prfSalt: "c2FsdA==" })
		runCeremony.mockResolvedValue({ id: "cred-1", prfSalt: "c2FsdA==" })
		await submitPasskeyUnlock()
		expect(getPasskeyUnlockParams).toHaveBeenCalledWith("p1")
		expect(runCeremony).toHaveBeenCalledWith({
			mode: "get",
			credentialId: "cred-1",
			prfSalt: "c2FsdA==",
			step: "unlock",
			profileName: "P",
		})
		expect(unlockPasskeyProfile).toHaveBeenCalledWith("p1", { id: "cred-1", prfSalt: "c2FsdA==" })
	})

	test("in Firefox's toolbar panel, the background runs the step and the page runs no ceremony", async () => {
		vi.mocked(closesOnFocusLoss).mockReturnValue(true)
		await submitPasskeyUnlock()
		expect(unlockPasskeyProfile).toHaveBeenCalledTimes(1)
		expect(unlockPasskeyProfile.mock.calls[0]).toEqual(["p1"])
		expect(getPasskeyUnlockParams).not.toHaveBeenCalled()
		expect(runCeremony).not.toHaveBeenCalled()
	})
})

describe("auth.vue — what a failed unlock says", () => {
	async function failPasskeyUnlock(error: unknown) {
		getPasskeyUnlockParams.mockResolvedValue({ credentialId: "cred-1", prfSalt: "c2FsdA==" })
		runCeremony.mockRejectedValue(error)
		const { wrapper, appStore } = mountAuth()
		appStore.profile = { id: "p1", name: "P", type: "passkey" } as never
		await flushPromises()
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		return wrapper
	}

	async function failPasswordUnlock(error: unknown) {
		unlockProfile.mockRejectedValue(error)
		const { wrapper } = mountAuth()
		await flushPromises()
		await wrapper.find("[data-stub-input]").setValue("pass1234")
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		return wrapper
	}

	test("a password unlock that fails for an unlisted reason says so, without the error's text, and stops the spinner", async () => {
		const wrapper = await failPasswordUnlock(new Error("Invalid profile id"))
		expect(openToastMock).toHaveBeenCalledTimes(1)
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Something went wrong", sub: "Try unlocking again." })
		expect(wrapper.find('[data-testid="error-text"]').exists()).toBe(false)
		// The latch is released: the next submit reaches the service again.
		await wrapper.find("form").trigger("submit")
		expect(unlockProfile).toHaveBeenCalledTimes(2)
	})

	test("Continue closes whatever error toast shows before the new attempt; an info toast stays", async () => {
		const { toast, openToast } = useToast()
		const wrapper = await failPasswordUnlock(new Error("Invalid profile id"))
		expect(toast.value).toMatchObject({ label: "Something went wrong", sub: "Try unlocking again." })
		/** The toast before the attempt answers: the close must not wait for the unlock. */
		const retry = async () => {
			let answer!: (profile: unknown) => void
			unlockProfile.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
			await wrapper.find("form").trigger("submit")
			const shown = toast.value
			answer(undefined)
			await flushPromises()
			return shown
		}

		expect(await retry()).toBeNull()
		openToast({ kind: "error", label: "Something went wrong", sub: "Open the wallet again to unlock your new profile." })
		expect(await retry()).toBeNull()
		const info = { kind: "info", label: "Importing" } as const
		openToast(info)
		expect(await retry()).toMatchObject(info)
		expect(unlockProfile).toHaveBeenCalledTimes(4)
	})

	test("a wrong password keeps its inline error and gets no toast", async () => {
		unlockProfile.mockRejectedValue(new InvalidPasswordError())
		const { wrapper } = mountAuth()
		await flushPromises()
		await wrapper.find("[data-stub-input]").setValue("wrong")
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(wrapper.find('[data-testid="error-text"]').exists()).toBe(true)
		expect(openToastMock).not.toHaveBeenCalled()
	})

	test("a dismissed or timed-out passkey prompt says the passkey was not confirmed", async () => {
		await failPasskeyUnlock(new DOMException("not allowed", "NotAllowedError"))
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Passkey not confirmed. Try again." })
	})

	test("a passkey without PRF says it can't unlock Nulo", async () => {
		await failPasskeyUnlock(new PasskeyPrfError("Passkey PRF not available"))
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "This passkey can't unlock Nulo." })
	})

	test("any other passkey failure gets the generic line", async () => {
		await failPasskeyUnlock(new Error("authenticator exploded"))
		expect(openToastMock).toHaveBeenCalledTimes(1)
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Couldn't unlock. Try again." })
	})

	test("a cancelled passkey prompt stays silent", async () => {
		await failPasskeyUnlock(new UserRejectedError("User cancelled passkey ceremony"))
		expect(openToastMock).not.toHaveBeenCalled()
	})

	test("a passkey whose answer opens nothing gets the generic line, never the error's text", async () => {
		getPasskeyUnlockParams.mockResolvedValue({ credentialId: "cred-1", prfSalt: "c2FsdA==" })
		runCeremony.mockResolvedValue({ id: "cred-1", prfSalt: "c2FsdA==" })
		unlockPasskeyProfile.mockRejectedValue(new Error("Passkey did not open this profile"))
		const { wrapper, appStore } = mountAuth()
		appStore.profile = { id: "p1", name: "P", type: "passkey" } as never
		await flushPromises()
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Couldn't unlock. Try again." })
	})
})

describe("auth.vue — an unlock refused as an unknown id", () => {
	async function refuse(check: string, { passkey = false, moveTo }: { passkey?: boolean; moveTo?: string } = {}) {
		const checkSelection = vi.fn(async () => check)
		const { wrapper, appStore } = mountAuth({ checkSelection })
		const refusal = new Error("Invalid profile id")
		if (passkey) {
			appStore.profile = { id: "p1", name: "P", type: "passkey" } as never
			getPasskeyUnlockParams.mockResolvedValue({ credentialId: "cred-1", prfSalt: "c2FsdA==" })
			runCeremony.mockResolvedValue({ id: "cred-1", prfSalt: "c2FsdA==" })
			unlockPasskeyProfile.mockImplementation(async () => {
				if (moveTo) appStore.profile = { id: moveTo, name: "Q", type: "password" } as never
				throw refusal
			})
		} else unlockProfile.mockRejectedValue(refusal)
		await flushPromises()
		if (!passkey) await wrapper.find("[data-stub-input]").setValue("pass1234")
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		return checkSelection
	}

	test("the screen that followed the deleted profile, or moved on meanwhile, offers no retry", async () => {
		for (const check of ["followed", "superseded"]) {
			openToastMock.mockReset()
			expect(await refuse(check)).toHaveBeenCalledTimes(1)
			expect(openToastMock).not.toHaveBeenCalled()
		}
	})

	test("an attempt whose profile was replaced on screen during its last call says nothing, whatever the error", async () => {
		expect(await refuse("present", { passkey: true, moveTo: "p2" })).not.toHaveBeenCalled()
		expect(openToastMock).not.toHaveBeenCalled()
	})

	test("a profile still listed, or a list that could not be read, keeps the attempt's own failure line", async () => {
		await refuse("present")
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Something went wrong", sub: "Try unlocking again." })
		openToastMock.mockReset()
		await refuse("unread", { passkey: true })
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Couldn't unlock. Try again." })
	})
})

describe("auth.vue — a passkey attempt belongs to the profile it started on", () => {
	test("a selection replaced or cleared during the prompt sends the answer nowhere and says nothing", async () => {
		for (const next of [{ id: "p2", name: "Q", type: "password" }, undefined]) {
			unlockPasskeyProfile.mockReset()
			openToastMock.mockReset()
			const { wrapper, appStore } = mountAuth()
			appStore.profile = { id: "p1", name: "P", type: "passkey" } as never
			getPasskeyUnlockParams.mockResolvedValue({ credentialId: "cred-1", prfSalt: "c2FsdA==" })
			runCeremony.mockImplementation(async () => {
				appStore.profile = next as never
				return { id: "cred-1", prfSalt: "c2FsdA==" }
			})
			await flushPromises()
			await wrapper.find("form").trigger("submit")
			await flushPromises()
			expect(unlockPasskeyProfile).not.toHaveBeenCalled()
			expect(openToastMock).not.toHaveBeenCalled()
			wrapper.unmount()
		}
	})

	test("an unlock that won but whose profile left the screen before its activation ended releases Continue at once, silently", async () => {
		unlockProfile.mockResolvedValue({ id: "p1", name: "P", type: "password" })
		const { wrapper, appStore } = mountAuth()
		await flushPromises()
		await wrapper.find("[data-stub-input]").setValue("pass1234")
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(waitHolder.mock).toHaveBeenCalledTimes(1)

		appStore.profile = { id: "p2", name: "Q", type: "password" } as never
		await flushPromises()
		expect(openToastMock).not.toHaveBeenCalled()
		await wrapper.find("[data-stub-input]").setValue("pass1234")
		await wrapper.find("form").trigger("submit")
		expect(unlockProfile).toHaveBeenLastCalledWith("p2", "pass1234")
	})

	test("an unchanged selection sends the answer to the profile the attempt started on", async () => {
		const { wrapper, appStore } = mountAuth()
		appStore.profile = { id: "p1", name: "P", type: "passkey" } as never
		getPasskeyUnlockParams.mockResolvedValue({ credentialId: "cred-1", prfSalt: "c2FsdA==" })
		runCeremony.mockResolvedValue({ id: "cred-1", prfSalt: "c2FsdA==" })
		unlockPasskeyProfile.mockRejectedValue(new Error("Passkey did not open this profile"))
		await flushPromises()
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(unlockPasskeyProfile).toHaveBeenCalledWith("p1", { id: "cred-1", prfSalt: "c2FsdA==" })
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Couldn't unlock. Try again." })
	})
})

describe("auth.vue — a passkey profile made before 1.1", () => {
	async function mountRetired() {
		const mounted = mountAuth()
		mounted.appStore.profile = { id: "p1", name: "Old", type: "passkey", retired: true } as never
		await flushPromises()
		return mounted
	}

	test("offers only its deletion: no unlock form, no passkey prompt", async () => {
		const { wrapper } = await mountRetired()
		expect(wrapper.get('[data-testid="auth-setup-again"]').text()).toBe("Set upagain")
		expect(wrapper.get('[data-testid="auth-setup-again-text"]').text()).toBe(
			"This profile was made with an earlier version of Nulo and can't be opened in this version. Delete it, then create or import a profile. What it held stays on the network, out of this version's reach.",
		)
		expect(wrapper.find('[data-testid="auth-form"]').exists()).toBe(false)
		expect(getPasskeyUnlockParams).not.toHaveBeenCalled()
		expect(runCeremony).not.toHaveBeenCalled()
		expect(unlockPasskeyProfile).not.toHaveBeenCalled()
	})

	test("Delete profile leads to the delete page", async () => {
		const { wrapper } = await mountRetired()
		await wrapper.get('[data-testid="auth-delete-retired"]').trigger("click")
		expect(routerPush).toHaveBeenCalledWith("/popup/settings/security/reset")
	})

	test("a later profile picked on this screen gets its unlock form back", async () => {
		const { wrapper, appStore } = await mountRetired()
		appStore.profile = { id: "p2", name: "New", type: "passkey" } as never
		await flushPromises()
		expect(wrapper.find('[data-testid="auth-setup-again"]').exists()).toBe(false)
		expect(wrapper.find('[data-testid="auth-form"]').exists()).toBe(true)
	})
})

describe("auth.vue — the password field's controls, real Input", () => {
	/** `known: false` mounts before the service has named the profile. */
	const mountReal = ({ known = true } = {}) => {
		const wrapper = mount(Auth, {
			attachTo: document.body,
			global: {
				plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false })],
				components: { Flex, Input, Text, Icon },
				stubs: {
					Button: { template: `<button type="submit" v-bind="$attrs"><slot /></button>` },
					Tooltip: { template: `<div><slot /></div>` },
					AuthProfilePill: true,
					PasskeyCeremonyDialog: true,
					Transition: true,
				},
			},
		})
		if (known) useAppStore().profile = { id: "p1", name: "P", type: "password" } as never
		return wrapper
	}
	const FIELD = "auth-password-input"
	// jsdom applies no module CSS, so this reads the class; the held-boot e2e reads the computed visibility.
	const hidden = (testid: string) =>
		(wrapper as NonNullable<typeof wrapper>)
			.get(`[data-testid="${testid}"]`)
			.classes()
			.some((name) => /unknown/.test(name))
	let wrapper: ReturnType<typeof mountReal> | undefined
	afterEach(() => {
		wrapper?.unmount()
		wrapper = undefined
	})

	test("focused on mount, current-password autofill, no autocapitalize or autocorrect", async () => {
		wrapper = mountReal()
		await flushPromises()
		expect(document.activeElement).toBe(nativeInput(wrapper, FIELD))
		expectNativeAttrs(wrapper, FIELD, { autocomplete: "current-password", autocapitalize: "none", autocorrect: "off" })
	})

	test("the toggle masks the field and never submits the form", async () => {
		wrapper = mountReal()
		await flushPromises()
		typeNow(nativeInput(wrapper, FIELD), "pass1234")
		await expectMaskToggle(wrapper, { toggle: "auth-password-input-visibility-toggle", field: FIELD, drives: [FIELD] })
		await flushPromises()
		expect(unlockProfile).not.toHaveBeenCalled()
	})

	test("a wrong password shakes the field's wrapper", async () => {
		unlockProfile.mockRejectedValue(new InvalidPasswordError())
		wrapper = mountReal()
		await flushPromises()
		const shaker = () => (wrapper as NonNullable<typeof wrapper>).get(`[data-testid="${FIELD}"]`).element.parentElement as HTMLElement
		expect(shaker().className).not.toMatch(/shake/)
		typeNow(nativeInput(wrapper, FIELD), "wrong-pass")
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(unlockProfile).toHaveBeenCalledTimes(1)
		expect(shaker().className).toMatch(/shake/)
	})

	const P1 = { id: "p1", name: "P", type: "password" } as never
	const P2 = { id: "p2", name: "Q", type: "password" } as never
	const submit = () => (wrapper as NonNullable<typeof wrapper>).get('[data-testid="auth-submit"]').element as HTMLButtonElement

	test("a switch to another profile and back leaves the field empty and masked, and Continue off", async () => {
		wrapper = mountReal()
		await flushPromises()
		typeNow(nativeInput(wrapper, FIELD), "pass1234")
		sendEvent(wrapper.get('[data-testid="auth-password-input-visibility-toggle"]').element, "click")
		await flushPromises()
		expect(nativeInput(wrapper, FIELD).type).toBe("text")
		expect(submit().disabled).toBe(false)

		useAppStore().profile = P2
		await flushPromises()
		useAppStore().profile = P1
		await flushPromises()
		expect(nativeInput(wrapper, FIELD).value).toBe("")
		expect(nativeInput(wrapper, FIELD).type).toBe("password")
		expect(submit().disabled).toBe(true)
	})

	test("a switch clears a wrong password's error", async () => {
		unlockProfile.mockRejectedValue(new InvalidPasswordError())
		wrapper = mountReal()
		await flushPromises()
		typeNow(nativeInput(wrapper, FIELD), "wrong-pass")
		await wrapper.find("form").trigger("submit")
		await flushPromises()
		expect(wrapper.find('[data-testid="error-text"]').exists()).toBe(true)

		useAppStore().profile = P2
		await flushPromises()
		expect(wrapper.find('[data-testid="error-text"]').exists()).toBe(false)
		expect(nativeInput(wrapper, FIELD).value).toBe("")
	})

	test("(control) the first profile a screen learns keeps what the field holds", async () => {
		wrapper = mountReal({ known: false })
		await flushPromises()
		typeNow(nativeInput(wrapper, FIELD), "pass1234")
		useAppStore().profile = P1
		await flushPromises()
		expect(nativeInput(wrapper, FIELD).value).toBe("pass1234")
	})

	test("before the profile is known, the heading, its line and the form keep their place hidden and the field takes no focus", async () => {
		wrapper = mountReal({ known: false })
		await flushPromises()
		expect(hidden("auth-heading")).toBe(true)
		expect(hidden("auth-form")).toBe(true)
		expect(document.activeElement).not.toBe(nativeInput(wrapper, FIELD))
	})

	test("a password profile known later shows the form and takes focus from the page, never from a control", async () => {
		wrapper = mountReal({ known: false })
		await flushPromises()
		useAppStore().profile = { id: "p1", name: "P", type: "password" } as never
		await flushPromises()
		expect(hidden("auth-heading")).toBe(false)
		expect(hidden("auth-form")).toBe(false)
		expect(document.activeElement).toBe(nativeInput(wrapper, FIELD))
		wrapper.unmount()

		wrapper = mountReal({ known: false })
		await flushPromises()
		const reset = wrapper.get('[data-testid="auth-reset"]').element as HTMLButtonElement
		reset.focus()
		useAppStore().profile = { id: "p1", name: "P", type: "password" } as never
		await flushPromises()
		expect(document.activeElement).toBe(reset)
	})

	test("a passkey profile known later shows the passkey form and never the password field", async () => {
		wrapper = mountReal({ known: false })
		await flushPromises()
		useAppStore().profile = { id: "k1", name: "K", type: "passkey" } as never
		await flushPromises()
		expect(hidden("auth-form")).toBe(false)
		expect(wrapper.find(`[data-testid="${FIELD}"]`).exists()).toBe(false)
		expect(wrapper.get("h1").text()).toBe("Passkey required")
	})
})
