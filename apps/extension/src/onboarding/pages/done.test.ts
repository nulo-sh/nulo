import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("@/wallet/utils/onboarding-tab", () => ({ clearOnboardingTabTracking: vi.fn(), OPEN_TOOLBAR_POPUP: "open-toolbar-popup" }))
const store: { profile?: { type: string } } = {}
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ setOnboardingCompleted: vi.fn(), profile: store.profile }) }))

import { BrutalistTitle, Flex, Icon, Text } from "@nulo/design"
import { doneRoute } from "../steps"
import Done from "./done.vue"

const TIP = "Click the puzzle icon in your browser's toolbar, then pin Nulo for quick access."

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	vi.unstubAllGlobals()
	window.history.replaceState(null, "")
	store.profile = undefined
})

async function mountDone(getUserSettings: () => Promise<{ isOnToolbar?: boolean }>) {
	vi.stubGlobal("chrome", { action: { getUserSettings } })
	const w = mount(Done, {
		global: {
			components: { BrutalistTitle, Flex, Icon, Text },
			stubs: { Button: true, OnboardingPage: { template: "<div><slot /></div>" }, StepIndicator: true },
		},
	})
	wrappers.push(w)
	await flushPromises()
	return w
}

const tip = (w: VueWrapper) => w.find('[data-testid="onboarding-pin-tip"]')

describe("onboarding done", () => {
	test("an unpinned wallet gets the one decided sentence, naming no browser", async () => {
		const w = await mountDone(async () => ({ isOnToolbar: false }))
		const text = tip(w).text().replace(/\s+/g, " ")
		expect(text).toBe(`Pro tip ${TIP}`)
		expect(text).not.toContain("Chrome")
		expect(text).not.toContain("from now on")
	})

	test("a wallet already on the toolbar shows no tip", async () => {
		const w = await mountDone(async () => ({ isOnToolbar: true }))
		expect(tip(w).exists()).toBe(false)
	})

	test("a browser without the settings call shows the tip", async () => {
		const w = await mountDone(async () => {
			throw new Error("not supported")
		})
		expect(tip(w).exists()).toBe(true)
	})

	test.each(["password", "passkey", "import"] as const)("Ready's row draws the %s path the entry carries", async (path) => {
		window.history.replaceState((doneRoute(path) as { state: unknown }).state, "")
		store.profile = { type: "password" }
		const w = await mountDone(async () => ({ isOnToolbar: true }))
		expect(w.get("step-indicator-stub").attributes()).toMatchObject({ current: "ready", path })
	})

	test.each([
		["password", "password"],
		["passkey", "passkey"],
	])("an entry with no path (a reload from Create) draws the %s wallet's own path", async (type, path) => {
		store.profile = { type }
		const w = await mountDone(async () => ({ isOnToolbar: true }))
		expect(w.get("step-indicator-stub").attributes()).toMatchObject({ current: "ready", path })
	})
})
