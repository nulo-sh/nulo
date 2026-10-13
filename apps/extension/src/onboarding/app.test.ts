import { flushPromises, shallowMount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const config = vi.hoisted(() => ({ getValue: vi.fn(), onConnected: undefined as unknown as { invoke: () => void } }))
vi.mock("@/wallet/services/config/client", async () => {
	const { EventHandler } = await import("@nulo/wallet-core/utils")
	return {
		ConfigServiceClient: vi.fn(function () {
			const onConnected = new EventHandler<void>()
			config.onConnected = { invoke: () => onConnected.invoke() }
			return { onConnected, onUpdate: new EventHandler(), getValue: config.getValue, disconnect: vi.fn() }
		}),
	}
})
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ loadOnboardingCompleted: async () => {}, onboardingCompleted: false }) }))
vi.mock("@/utils/core", () => ({ managers: { profile: { getProfiles: vi.fn(async () => []) } } }))
vi.mock("@/composables/useProfileBootstrap", () => ({ useProfileBootstrap: () => ({ hydrateKnownProfile: vi.fn(async () => undefined) }) }))
vi.mock("vue-router", () => ({ useRouter: () => ({ replace: vi.fn() }) }))

import { THEME_HINT_KEY } from "@/utils/general"
import App from "./app.vue"

const root = document.documentElement
let hintWrites: string[]

beforeEach(() => {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
	)
	// What theme-boot.js left before first paint, from a hint of dark.
	localStorage.setItem(THEME_HINT_KEY, "dark")
	root.setAttribute("theme", "dark")
	hintWrites = []
	const setItem = Storage.prototype.setItem
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
		if (key === THEME_HINT_KEY) hintWrites.push(value)
		setItem.call(this, key, value)
	})
})

afterEach(() => {
	config.getValue.mockReset()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	localStorage.clear()
	root.removeAttribute("theme")
})

const mountOnboarding = () => shallowMount(App, { global: { stubs: { RouterView: { template: "<div />" } } } })

describe("onboarding's theme", () => {
	test("the stored theme is painted once read, and nothing is painted or hinted before it", async () => {
		let answer!: (theme: string) => void
		config.getValue.mockReturnValue(new Promise((resolve) => (answer = resolve)))
		const page = mountOnboarding()
		await flushPromises()
		expect(root.getAttribute("theme")).toBe("dark")
		expect(hintWrites).toEqual([])

		answer("light")
		await flushPromises()
		expect(config.getValue).toHaveBeenCalledWith("theme")
		expect(root.getAttribute("theme")).toBe("light")
		expect(hintWrites).toEqual(["light"])
		page.unmount()
	})

	test("a read that fails keeps the pre-paint theme and writes no hint", async () => {
		config.getValue.mockRejectedValue(new Error("worker restarting"))
		const page = mountOnboarding()
		await flushPromises()

		expect(root.getAttribute("theme")).toBe("dark")
		expect(hintWrites).toEqual([])
		page.unmount()
	})

	test("a reconnect reads again and paints what it reads", async () => {
		config.getValue.mockResolvedValueOnce("light").mockResolvedValueOnce("dark")
		const page = mountOnboarding()
		await flushPromises()
		expect(root.getAttribute("theme")).toBe("light")

		config.onConnected.invoke()
		config.onConnected.invoke()
		await flushPromises()
		expect(root.getAttribute("theme")).toBe("dark")
		expect(hintWrites).toEqual(["light", "dark"])
		page.unmount()
	})
})
