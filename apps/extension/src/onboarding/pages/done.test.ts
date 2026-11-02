import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
	createMemoryHistory,
	createRouter,
	createWebHashHistory,
	isNavigationFailure,
	NavigationFailureType,
	type NavigationFailure,
	type Router,
	type RouterHistory,
} from "vue-router"

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
const LINE = "Your wallet is ready. Open it to get your address and your first token."
const TAGLINE = "Private by default. Sovereign by design."

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
// A hash history listens on the window until destroyed, and would answer the next test's pops.
const histories: RouterHistory[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	for (const h of histories.splice(0)) h.destroy()
	vi.unstubAllGlobals()
	window.history.replaceState(null, "")
	store.profile = undefined
	stored = {}
	flagReadFails = false
})

const page = { template: "<div />" }

/** Ready behind a real router, by default entered from Create; the other routes are blank pages. */
async function mountRouted(
	getUserSettings: () => Promise<{ isOnToolbar?: boolean }>,
	history: RouterHistory,
	visits = ["/onboarding/create", "/onboarding/done"],
): Promise<{ w: VueWrapper; router: Router }> {
	vi.stubGlobal("chrome", { action: { getUserSettings }, storage })
	const routes = [
		{ path: "/onboarding/create", component: page },
		{ path: "/onboarding/welcome", component: page },
		{ path: "/onboarding/done", component: Done },
	]
	histories.push(history)
	const router = createRouter({ history, routes })
	for (const path of visits) await router.push(path)
	const w = mount(
		{ template: "<RouterView />" },
		{
			global: {
				plugins: [router],
				components: { BrutalistTitle, Flex, Icon, OnboardingStepHeader, Text },
				stubs: { Button: true, OnboardingPage: { template: "<div><slot /></div>" }, StepIndicator: true },
			},
		},
	)
	wrappers.push(w)
	await flushPromises()
	return { w, router }
}

/** A memory history leaves `window.history.state`, which Ready reads its path from, as a test set it. */
async function mountDone(getUserSettings: () => Promise<{ isOnToolbar?: boolean }>) {
	return (await mountRouted(getUserSettings, createMemoryHistory())).w
}

/** Presses Back and resolves with the navigation's outcome once the router has settled it. */
function back(router: Router): Promise<NavigationFailure | undefined> {
	return new Promise((resolve) => {
		const stop = router.afterEach((_to, _from, failure) => {
			stop()
			resolve(failure ?? undefined)
		})
		router.back()
	})
}

const tip = (w: VueWrapper) => w.find('[data-testid="onboarding-pin-tip"]')
const unsavedLine = (w: VueWrapper) => w.find('[data-testid="onboarding-done-phrase-unsaved"]')
const phraseUnsaved = (w: VueWrapper) => w.get('[data-testid="onboarding-done-page"]').attributes("data-phrase-unsaved")
const enterFrom = (path: OnboardingPath) => window.history.replaceState((doneRoute(path) as { state: unknown }).state, "")

describe("onboarding done", () => {
	test("the line under the title says what to do next, and the tagline stays", async () => {
		const w = await mountDone(async () => ({ isOnToolbar: true }))
		expect(w.get('[data-testid="onboarding-done-line"]').text()).toBe(LINE)
		expect(w.text()).toContain(TAGLINE)
		expect(w.text()).not.toContain("coordination")
	})

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

describe("onboarding done: Back", () => {
	test("Back on Ready is refused, and the URL comes back to Ready", async () => {
		const { w, router } = await mountRouted(async () => ({ isOnToolbar: true }), createWebHashHistory())
		const failure = await back(router)
		expect(isNavigationFailure(failure, NavigationFailureType.aborted)).toBe(true)
		await vi.waitFor(() => expect(window.location.hash).toBe("#/onboarding/done"))
		expect(router.currentRoute.value.path).toBe("/onboarding/done")
		expect(w.find('[data-testid="onboarding-done-page"]').exists()).toBe(true)
	})

	test("control: the same Back between two other pages leaves", async () => {
		const visits = ["/onboarding/create", "/onboarding/welcome"]
		const { router } = await mountRouted(async () => ({ isOnToolbar: true }), createWebHashHistory(), visits)
		expect(await back(router)).toBeUndefined()
		expect(router.currentRoute.value.path).toBe("/onboarding/create")
		expect(window.location.hash).toBe("#/onboarding/create")
	})
})
