import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("@/wallet/utils/onboarding-tab", () => ({ clearOnboardingTabTracking: vi.fn(), OPEN_TOOLBAR_POPUP: "open-toolbar-popup" }))
const store: { profile?: { id?: string; type: string } } = {}
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ setOnboardingCompleted: vi.fn(), profile: store.profile }) }))

import { BrutalistTitle, Flex, Icon, Text } from "@nulo/design"
import { getStartedPhraseSavedKey, profileImportedKey } from "@/utils/profile-ui-keys"
import OnboardingStepHeader from "../components/OnboardingStepHeader.vue"
import { doneRoute, type OnboardingPath } from "../steps"
import Done from "./done.vue"

const TIP = "Click the puzzle icon in your browser's toolbar, then pin Nulo for quick access."
const UNSAVED = "Your recovery phrase is not saved yet. Save it from Get started on Home."

let stored: Record<string, unknown> = {}
let flagReadFails = false
const storage = {
	local: {
		get: vi.fn(async (keys: string | string[]) => {
			if (Array.isArray(keys) && flagReadFails) throw new Error("storage unavailable")
			const wanted = typeof keys === "string" ? [keys] : keys
			return Object.fromEntries(wanted.filter((k) => k in stored).map((k) => [k, stored[k]]))
		}),
	},
	onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
}

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	vi.unstubAllGlobals()
	window.history.replaceState(null, "")
	store.profile = undefined
	stored = {}
	flagReadFails = false
})

async function mountDone(getUserSettings: () => Promise<{ isOnToolbar?: boolean }>) {
	vi.stubGlobal("chrome", { action: { getUserSettings }, storage })
	const w = mount(Done, {
		global: {
			components: { BrutalistTitle, Flex, Icon, OnboardingStepHeader, Text },
			stubs: { Button: true, OnboardingPage: { template: "<div><slot /></div>" }, StepIndicator: true },
		},
	})
	wrappers.push(w)
	await flushPromises()
	return w
}

const tip = (w: VueWrapper) => w.find('[data-testid="onboarding-pin-tip"]')
const unsavedLine = (w: VueWrapper) => w.find('[data-testid="onboarding-done-phrase-unsaved"]')
const phraseUnsaved = (w: VueWrapper) => w.get('[data-testid="onboarding-done-page"]').attributes("data-phrase-unsaved")
const enterFrom = (path: OnboardingPath) => window.history.replaceState((doneRoute(path) as { state: unknown }).state, "")

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
	])("an entry with no path (a typed URL) draws the %s wallet's own path", async (type, path) => {
		store.profile = { type }
		const w = await mountDone(async () => ({ isOnToolbar: true }))
		expect(w.get("step-indicator-stub").attributes()).toMatchObject({ current: "ready", path })
	})
})

describe("onboarding done: an unsaved recovery phrase", () => {
	test.each(["password", "passkey"] as const)("a created %s wallet whose phrase is unsaved is told where to save it", async (path) => {
		enterFrom(path)
		store.profile = { id: "p1", type: path }
		const w = await mountDone(async () => ({ isOnToolbar: true }))
		expect(phraseUnsaved(w)).toBe("true")
		expect(unsavedLine(w).text()).toBe(UNSAVED)
	})

	test.each([
		["the phrase was saved", "password", getStartedPhraseSavedKey("p1")],
		["the wallet was imported", "import", profileImportedKey("p1")],
		["an imported wallet reaches Ready by an entry with no path", undefined, profileImportedKey("p1")],
	] as const)("no line when %s", async (_, path, doneKey) => {
		if (path) enterFrom(path)
		stored[doneKey] = true
		store.profile = { id: "p1", type: "password" }
		const w = await mountDone(async () => ({ isOnToolbar: true }))
		expect(phraseUnsaved(w)).toBe("false")
		expect(unsavedLine(w).exists()).toBe(false)
	})

	// Unread is not done, as on Home; only an Import entry says the wallet was brought in.
	test.each([
		["import", "false"],
		["password", "true"],
	] as const)("a failed flag read on a %s entry reads as %s", async (path, unsaved) => {
		enterFrom(path)
		flagReadFails = true
		store.profile = { id: "p1", type: "password" }
		const w = await mountDone(async () => ({ isOnToolbar: true }))
		expect(phraseUnsaved(w)).toBe(unsaved)
		expect(unsavedLine(w).exists()).toBe(unsaved === "true")
	})
})
