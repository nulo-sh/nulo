import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"
import { useAppStore } from "@/stores/app.store"
import Register from "./register.vue"

vi.mock("@/wallet/utils/onboarding-tab", () => ({ redirectToOnboardingTabIfNeeded: vi.fn(async () => false) }))
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
	installChromeStorage({}, { persist: false })
	routerPush.mockReset()
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
