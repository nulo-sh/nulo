import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { flushPromises, mount, shallowMount } from "@vue/test-utils"
import { ScrollMoreButton } from "@nulo/design"
import { createPinia, setActivePinia } from "pinia"
import { effectScope, nextTick } from "vue"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const config = vi.hoisted(() => ({ getValue: vi.fn(), onConnected: undefined as unknown as { invoke: () => void } }))
const router = vi.hoisted(() => ({
	replace: vi.fn(),
	isReady: vi.fn(async () => undefined),
	currentRoute: { value: { path: "/onboarding/create" } },
}))
const hydrateKnownProfile = vi.hoisted(() => vi.fn(async (): Promise<{ id: string } | undefined> => undefined))
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
vi.mock("@/utils/core", async () => {
	const { ref } = await import("vue")
	return { isServiceReady: ref(false), managers: { profile: { getProfiles: vi.fn(async () => []) } } }
})
vi.mock("@/composables/useProfileBootstrap", () => ({ useProfileBootstrap: () => ({ hydrateKnownProfile }) }))
vi.mock("vue-router", () => ({ useRouter: () => router }))

import { useConfirm } from "@/composables/useConfirm"
import { usePopupStore } from "@/stores/popup.store"
import { THEME_HINT_KEY } from "@/utils/general"
import { doneRoute } from "./steps"
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
	router.replace.mockReset()
	hydrateKnownProfile.mockReset()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	localStorage.clear()
	root.removeAttribute("theme")
})

const mountOnboarding = () => shallowMount(App, { global: { plugins: [createPinia()], stubs: { RouterView: { template: "<div />" } } } })

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

describe("onboarding's resume", () => {
	async function reloadOn(path: string, state: Record<string, unknown> | null) {
		router.currentRoute.value.path = path
		window.history.replaceState(state, "")
		const page = mountOnboarding()
		await flushPromises()
		return page
	}

	afterEach(() => {
		router.currentRoute.value.path = "/onboarding/create"
		window.history.replaceState(null, "")
	})

	test("a reload on Import whose import never landed stays on Import", async () => {
		config.getValue.mockResolvedValue("dark")
		hydrateKnownProfile.mockResolvedValue({ id: "p1" })
		const page = await reloadOn("/onboarding/import", { position: 2 })
		expect(router.replace).not.toHaveBeenCalled()
		page.unmount()
	})

	test.each([
		["/onboarding/import", "import"],
		["/onboarding/create", "password"],
		["/onboarding/create", "passkey"],
	] as const)("a reload on %s whose flow got a %s profile in resumes at Ready on its path", async (path, made) => {
		config.getValue.mockResolvedValue("dark")
		hydrateKnownProfile.mockResolvedValue({ id: "p1" })
		const page = await reloadOn(path, { position: 2, onboardingPath: made })
		expect(router.replace).toHaveBeenCalledWith(doneRoute(made))
		page.unmount()
	})

	test("a tab opened on Welcome over another window's session stays on Welcome", async () => {
		config.getValue.mockResolvedValue("dark")
		hydrateKnownProfile.mockResolvedValue({ id: "p1" })
		const page = await reloadOn("/onboarding/welcome", null)
		expect(router.replace).not.toHaveBeenCalled()
		page.unmount()
	})

	test("a first run with no profile stays where it opened", async () => {
		config.getValue.mockResolvedValue("dark")
		const page = mountOnboarding()
		await flushPromises()
		expect(router.replace).not.toHaveBeenCalled()
		page.unmount()
	})
})

describe("onboarding's confirm", () => {
	const SHELL_STUBS = {
		RouterView: { template: "<div />" },
		ToastManager: true,
		NotificationManager: true,
		MigrationBarrier: true,
		Flex: { template: "<div><slot /></div>" },
		Icon: true,
		Popup: { props: ["show"], template: "<div v-if='show'><slot /></div>" },
		PopupCard: { template: "<div><slot /></div>" },
		Text: { template: "<span><slot /></span>" },
		Button: { emits: ["click"], template: "<button @click=\"$emit('click')\"><slot /></button>" },
	}

	test("a confirm the tab asks is shown, and each answer settles it and closes the dialog", async () => {
		config.getValue.mockResolvedValue("dark")
		const pinia = createPinia()
		setActivePinia(pinia)
		const page = mount(App, { global: { plugins: [pinia], stubs: SHELL_STUBS } })
		const scope = effectScope()
		const { askConfirm } = scope.run(() => useConfirm()) as ReturnType<typeof useConfirm>
		const popups = usePopupStore()
		for (const [control, answer] of [
			["confirm-submit", true],
			["confirm-cancel", false],
		] as const) {
			const asked = askConfirm({ title: "You already have this wallet", description: "Add it anyway?", confirm_text: "Add anyway" })
			await flushPromises()
			await page.get(`[data-testid="${control}"]`).trigger("click")
			await expect(asked).resolves.toBe(answer)
			expect(popups.isOpened("confirm")).toBe(false)
		}
		scope.stop()
		page.unmount()
	})
})

describe("onboarding's more-below button", () => {
	const docRoot = document.documentElement
	afterEach(() => {
		for (const key of ["scrollHeight", "clientHeight", "clientWidth"]) delete (docRoot as unknown as Record<string, unknown>)[key]
		docRoot.scrollTop = 0
	})

	/** The shell over a document holding 1000 px under a 720 px fold, in a window `clientWidth` px wide. */
	function mountShell(clientWidth: number) {
		config.getValue.mockResolvedValue("dark")
		Object.defineProperties(docRoot, {
			scrollHeight: { value: 1000, configurable: true },
			clientHeight: { value: 720, configurable: true },
			clientWidth: { value: clientWidth, configurable: true },
		})
		return mount(App, {
			global: {
				plugins: [createPinia()],
				stubs: { RouterView: { template: "<div />" }, ToastManager: true, NotificationManager: true, MigrationBarrier: true },
				components: { ScrollMoreButton },
			},
		})
	}

	test("shows while more than the shell's 64 px of end room is left below the window's fold, and is gone at it", async () => {
		const page = mountShell(1280)
		const shownAt = async (scrollTop: number) => {
			docRoot.scrollTop = scrollTop
			window.dispatchEvent(new Event("scroll"))
			await nextTick()
			return page.find('[data-testid="onboarding-scroll-more"]').exists()
		}
		expect(await shownAt(215)).toBe(true)
		expect(await shownAt(216)).toBe(false)
		page.unmount()
	})

	test("shows only from 776 px of client width: the 640 px column centred, 16 + 36 + 16 px right of it, a scrollbar not counted", async () => {
		expect(readFileSync(resolve(__dirname, "components/OnboardingPage.vue"), "utf8")).toMatch(/\bmax-width: 640px;/)
		// A classic 15 px scrollbar throughout: the window is wider than the room the column is centred in.
		vi.stubGlobal("innerWidth", 790)
		const page = mountShell(775)
		const more = () => page.find('[data-testid="onboarding-scroll-more"]')
		const resizeTo = async (clientWidth: number) => {
			Object.defineProperty(docRoot, "clientWidth", { value: clientWidth, configurable: true })
			vi.stubGlobal("innerWidth", clientWidth + 15)
			window.dispatchEvent(new Event("resize"))
			await nextTick()
		}
		await nextTick()
		expect(more().exists()).toBe(false)

		await resizeTo(776)
		expect(more().exists()).toBe(true)
		// A fixed box's right edge already stops at the scrollbar, so the inset does not add it.
		expect(more().attributes("style")).toContain("right: 16px")

		await resizeTo(775)
		expect(more().exists()).toBe(false)
		page.unmount()
	})
})
