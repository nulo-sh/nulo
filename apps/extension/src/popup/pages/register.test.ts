import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"
import { useAppStore } from "@/stores/app.store"
import { openOrFocusOnboardingTab, setupWaitsInTab } from "@/wallet/utils/onboarding-tab"
import Register from "./register.vue"

vi.mock("@/wallet/utils/onboarding-tab", () => ({
	setupWaitsInTab: vi.fn(async () => false),
	openOrFocusOnboardingTab: vi.fn(async () => undefined),
}))
const routerPush = vi.hoisted(() => vi.fn())
vi.mock("vue-router", () => ({ useRouter: () => ({ push: routerPush }), useRoute: () => ({ name: "popup-register", meta: {} }) }))

const MAIN = { id: "p1", name: "Main", type: "password" }

function mountRegister(state: { isLogined?: boolean; profile?: typeof MAIN } = {}) {
	return mount(Register, {
		global: {
			plugins: [createTestingPinia({ initialState: { app: { isLogined: false, ...state } }, stubActions: false })],
			directives: { snackFooter: {} },
		},
	})
}

beforeEach(() => {
	vi.clearAllMocks()
	installChromeStorage({}, { persist: false })
	routerPush.mockReset()
})
afterEach(() => {
	vi.restoreAllMocks()
})

describe("register follows a session opened in another window", () => {
	test("leaves for where an unlock goes once the session is open here, and not while its activation runs", async () => {
		mountRegister()
		const appStore = useAppStore()
		appStore.profile = MAIN as never
		await flushPromises()
		expect(routerPush).not.toHaveBeenCalled()

		appStore.isLogined = true
		await flushPromises()
		expect(routerPush).toHaveBeenCalledTimes(1)
		expect(routerPush).toHaveBeenCalledWith("/popup/general")
	})

	test("goes to a dApp window's saved page, as an unlock does", async () => {
		mountRegister()
		const appStore = useAppStore()
		appStore.pageAwaitingAuth = "/popup/windows-execute?id=7"
		appStore.isLogined = true
		await flushPromises()
		expect(routerPush).toHaveBeenCalledWith("/popup/windows-execute?id=7")
	})

	test("opened over a session that is already open, it leaves at once", async () => {
		mountRegister({ isLogined: true, profile: MAIN })
		await flushPromises()
		expect(routerPush).toHaveBeenCalledWith("/popup/general")
	})

	test("a locked wallet keeps the register screen", async () => {
		const wrapper = mountRegister()
		await flushPromises()
		expect(routerPush).not.toHaveBeenCalled()
		expect(wrapper.find("[data-testid='register-create-btn']").exists()).toBe(true)
	})
})

describe("register before setup is finished in its tab", () => {
	const shown = (w: ReturnType<typeof mountRegister>) => ({
		waits: w.find("[data-testid='register-setup-waits']").exists(),
		create: w.find("[data-testid='register-create-btn']").exists(),
		terms: w.find("[data-testid='legal-register-terms']").exists(),
	})

	test("says where setup goes on, with one button and no profile actions; the brand and the Terms stay", async () => {
		vi.mocked(setupWaitsInTab).mockResolvedValueOnce(true)
		const w = mountRegister()
		await flushPromises()
		expect(shown(w)).toEqual({ waits: true, create: false, terms: true })
		expect(w.get("h1").text()).toBe("Finish setting up Nulo in its tab")
		expect(w.get("[data-testid='register-setup-tab-btn']").text()).toBe("Go to the tab")
		expect(w.text()).toContain("NULO")
		expect(w.text()).not.toContain("Import profile")
	})

	test("Go to the tab brings the tab forward, or opens a new one, and only then closes the popup", async () => {
		vi.mocked(setupWaitsInTab).mockResolvedValueOnce(true)
		let focused!: () => void
		vi.mocked(openOrFocusOnboardingTab).mockReturnValueOnce(new Promise<void>((resolve) => (focused = resolve)))
		const close = vi.spyOn(window, "close").mockImplementation(() => {})
		const w = mountRegister()
		await flushPromises()
		await w.get("[data-testid='register-setup-tab-btn']").trigger("click")
		expect(openOrFocusOnboardingTab).toHaveBeenCalledOnce()
		expect(close).not.toHaveBeenCalled()
		focused()
		await flushPromises()
		expect(close).toHaveBeenCalledOnce()
	})

	test("a tab that cannot be reached leaves the popup open on the same screen", async () => {
		vi.mocked(setupWaitsInTab).mockResolvedValueOnce(true)
		vi.mocked(openOrFocusOnboardingTab).mockRejectedValueOnce(new Error("No tab with id"))
		const close = vi.spyOn(window, "close").mockImplementation(() => {})
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		const w = mountRegister()
		await flushPromises()
		await w.get("[data-testid='register-setup-tab-btn']").trigger("click")
		await flushPromises()
		expect(close).not.toHaveBeenCalled()
		expect(debug).toHaveBeenCalledWith("onboarding tab focus failed", { error: expect.any(Error) })
		expect(shown(w).waits).toBe(true)
	})

	test("shows nothing while the read is out", async () => {
		vi.mocked(setupWaitsInTab).mockReturnValueOnce(new Promise(() => {}))
		const w = mountRegister()
		await flushPromises()
		expect(shown(w)).toEqual({ waits: false, create: false, terms: false })
	})

	test("a failed read shows the profile actions", async () => {
		vi.mocked(setupWaitsInTab).mockRejectedValueOnce(new Error("storage"))
		vi.spyOn(console, "debug").mockImplementation(() => {})
		const w = mountRegister()
		await flushPromises()
		expect(shown(w)).toEqual({ waits: false, create: true, terms: true })
	})

	test("once setup is done, the profile actions and not the sentence", async () => {
		const w = mountRegister()
		await flushPromises()
		expect(shown(w)).toEqual({ waits: false, create: true, terms: true })
		expect(openOrFocusOnboardingTab).not.toHaveBeenCalled()
	})
})
