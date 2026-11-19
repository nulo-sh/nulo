/**
 * The unlock window: the site from its own URL over the wallet's lock screen while locked, over a
 * spinner once unlocked, and the lock screen again on a lock. The site line reads only the origin
 * the worker wrote into the URL, so no dApp-supplied text can reach it.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { nextTick, reactive } from "vue"

const appStore = reactive({ isLogined: false })
let fullPath = "/windows/unlock?origin=https%3A%2F%2Fapp.example"

vi.mock("@/stores/app.store", () => ({ useAppStore: () => appStore }))
vi.mock("vue-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("vue-router")>()
	return { ...actual, useRoute: () => ({ fullPath }) }
})
vi.mock("@/popup/components/modules/auth/LockScreen.vue", () => ({
	default: { name: "LockScreen", template: '<div data-testid="lock-screen" />' },
}))

import Unlock from "./index.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Icon: { template: "<i />" },
	Spinner: { template: '<span data-testid="spinner" />' },
}
const mountUnlock = () => mount(Unlock, { global: { stubs: STUBS } })
const has = (w: ReturnType<typeof mountUnlock>, id: string) => w.find(`[data-testid="${id}"]`).exists()

afterEach(() => {
	appStore.isLogined = false
	fullPath = "/windows/unlock?origin=https%3A%2F%2Fapp.example"
})

describe("the unlock window", () => {
	test("locked: the site's origin, exactly, over the lock screen", () => {
		const w = mountUnlock()
		expect(w.find('[data-testid="unlock-site-hostname"]').text()).toBe("https://app.example")
		expect(w.find('[data-testid="unlock-site"]').text()).toBe("https://app.example")
		expect(has(w, "lock-screen")).toBe(true)
		expect(has(w, "unlock-waiting")).toBe(false)
		expect(has(w, "dapp-hostname-warning")).toBe(false)
	})

	test("a punycode host shows the homograph warning", () => {
		fullPath = `/windows/unlock?origin=${encodeURIComponent("https://xn--pple-43d.com")}`
		const w = mountUnlock()
		expect(w.find('[data-testid="unlock-site-hostname"]').text()).toBe("https://xn--pple-43d.com")
		expect(has(w, "dapp-hostname-warning")).toBe(true)
	})

	test("unlocked: the site over a busy spinner and no lock screen; a lock brings the lock screen back", async () => {
		appStore.isLogined = true
		const w = mountUnlock()
		expect(has(w, "unlock-site")).toBe(true)
		expect(w.find('[data-testid="unlock-waiting"]').attributes("aria-busy")).toBe("true")
		expect(has(w, "spinner")).toBe(true)
		expect(has(w, "lock-screen")).toBe(false)

		appStore.isLogined = false
		await nextTick()
		expect(has(w, "lock-screen")).toBe(true)
		expect(has(w, "unlock-waiting")).toBe(false)
	})

	test("a URL that names no origin shows no site", () => {
		fullPath = "/windows/unlock?origin=not-an-origin"
		const w = mountUnlock()
		expect(w.find('[data-testid="unlock-site-hostname"]').text()).toBe("")
	})
})
