import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const WORDS = Array.from({ length: 24 }, (_, i) => `w${i + 1}`)
// The worker's side of the session: a create opens it, a lock or a strict restart ends it.
const worker = vi.hoisted(() => ({
	active: undefined as { id: string } | undefined,
	opens<T extends { id: string }>(profile: T): T {
		this.active = profile
		return profile
	},
}))
const profileApi = vi.hoisted(() => ({
	getProfiles: vi.fn(async () => [] as Array<{ name: string }>),
	createProfile: vi.fn(async (): Promise<unknown> => worker.opens({ id: "p1", name: "Main", type: "password" })),
	generateProfileId: vi.fn(),
	createPasskeyProfile: vi.fn(async (): Promise<unknown> => worker.opens({ id: "k1", name: "Main", type: "passkey" })),
	exportMnemonic: vi.fn(async (): Promise<string[]> => []),
	getActiveProfile: vi.fn(async () => worker.active),
	subscribeActiveProfile: undefined as unknown as ProfileServiceClient["subscribeActiveProfile"],
	onActiveProfileChanged: undefined as unknown as EventHandler<unknown>,
	onConnected: undefined as unknown as EventHandler<void>,
	onDisconnected: undefined as unknown as EventHandler<void>,
}))
vi.mock("@/utils/core", () => ({ managers: { profile: profileApi } }))
const bootstrapActiveProfile = vi.hoisted(() => vi.fn(async (): Promise<boolean> => true))
vi.mock("@/composables/useProfileBootstrap", () => ({ useProfileBootstrap: () => ({ bootstrapActiveProfile }) }))
const setLastActiveProfileId = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/utils/lastActiveProfile", () => ({ setLastActiveProfileId }))
const markGetStarted = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/utils/get-started", () => ({ markGetStarted }))
// By default the background runs the passkey ceremony, as in Firefox's toolbar panel, so no
// ceremony is driven here; `surface.inPage` runs it in the page, through the mocked helper.
const surface = vi.hoisted(() => ({ inPage: false }))
vi.mock("@/utils/browser-surface", async (original) => ({
	...(await original<typeof import("@/utils/browser-surface")>()),
	closesOnFocusLoss: () => !surface.inPage,
}))
const ANSWER = { id: "Y3JlZA==", prf: "cHJm", prfSalt: "c2FsdA==" }
const createPasskeyProfileInPage = vi.hoisted(() =>
	vi.fn(async () => ({ profile: worker.opens({ id: "k1", name: "Main", type: "passkey" }), credentialData: ANSWER })),
)
vi.mock("@/wallet/utils/create-passkey-profile", () => ({ createPasskeyProfileInPage }))
vi.mock("@/composables/usePasskeyCeremony", () => ({
	usePasskeyCeremony: () => ({ request: { value: null }, runCeremony: vi.fn(), onResolve: vi.fn(), onReject: vi.fn() }),
}))
const routerPush = vi.fn()
vi.mock("vue-router", () => ({ useRouter: () => ({ push: routerPush }), useRoute: () => ({ meta: {} }) }))

import { BrutalistTitle, Flex, Icon, Input, Text } from "@nulo/design"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ProfileServiceClient } from "@/wallet/services/profile/client"
import { enterOn } from "../../../tests/helpers/credential-pins"
import { pressOn } from "../../../tests/helpers/press-key"
import { sendEvent } from "../../../tests/helpers/send-event"
import OnboardingBackLink from "../components/OnboardingBackLink.vue"
import OnboardingProfileNameField from "../components/OnboardingProfileNameField.vue"
import OnboardingSkipLink from "../components/OnboardingSkipLink.vue"
import OnboardingStepHeader from "../components/OnboardingStepHeader.vue"
import { RECOVERY_PHRASE_WARNINGS } from "@/utils/recovery-phrase-warnings"
import { donePath, doneRoute, settleResume } from "../steps"
import Create from "./create.vue"
import { useNotificationStore } from "@/stores/notification.store"

const wrappers: VueWrapper[] = []

async function mountCreate() {
	const wrapper = mount(Create, {
		attachTo: document.body,
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			components: {
				BrutalistTitle,
				Flex,
				Input,
				OnboardingBackLink,
				OnboardingProfileNameField,
				OnboardingSkipLink,
				OnboardingStepHeader,
				Text,
				Icon,
			},
			stubs: {
				// Registered globally, the design Button would resolve its own `<component is="button">` to itself.
				Button: { template: '<button v-bind="$attrs"><slot /></button>' },
				OnboardingPage: { template: "<main><slot /></main>" },
				StepIndicator: true,
				PasskeyCeremonyDialog: true,
			},
		},
	})
	wrappers.push(wrapper)
	await flushPromises()
	return wrapper
}

const page = (w: VueWrapper) => w.get('[data-testid="onboarding-create-page"]')
const choosePassword = (w: VueWrapper) => w.get('[data-testid="onboarding-method-password"]').trigger("click")

// The production subscription runs over the faked worker, snapshot and reconnect included.
profileApi.subscribeActiveProfile = ProfileServiceClient.prototype.subscribeActiveProfile

beforeEach(() => {
	vi.clearAllMocks()
	surface.inPage = false
	worker.active = undefined
	profileApi.onActiveProfileChanged = new EventHandler()
	profileApi.onConnected = new EventHandler()
	profileApi.onDisconnected = new EventHandler()
	profileApi.getProfiles.mockResolvedValue([])
	profileApi.exportMnemonic.mockResolvedValue(WORDS)
})
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

describe("onboarding create", () => {
	test("its notice closes when the page does", async () => {
		const w = await mountCreate()
		const notices = useNotificationStore()
		expect(notices.clear).not.toHaveBeenCalled()
		w.unmount()
		wrappers.splice(wrappers.indexOf(w), 1)
		expect(notices.clear).toHaveBeenCalledOnce()
	})

	test("a first profile: no name field, the drawn words, Passkey first and selected", async () => {
		const w = await mountCreate()
		expect(page(w).attributes("data-name-field")).toBe("hidden")
		expect(w.find('[data-testid="onboarding-name-input"]').exists()).toBe(false)
		expect(w.text()).toContain("Create")
		expect(w.text()).toContain("Wallet")
		expect(w.text()).not.toContain("Profile")
		expect(w.text()).toContain("How you'll unlock Nulo")
		expect(w.get('[role="tablist"]').attributes("aria-label")).toBe("How you'll unlock Nulo")
		expect(w.findAll('[role="tab"]').map((t) => t.attributes("data-testid"))).toEqual([
			"onboarding-method-passkey",
			"onboarding-method-password",
		])
		expect(w.get('[data-testid="onboarding-method-passkey"]').attributes("aria-selected")).toBe("true")
		expect(w.find('[data-testid="onboarding-password-input"]').exists()).toBe(false)
		expect(w.get('[data-testid="onboarding-submit-create"]').text()).toBe("Create with passkey")
		expect(w.get("step-indicator-stub").attributes()).toMatchObject({ current: "wallet", path: "passkey" })

		await choosePassword(w)
		expect(w.get('[data-testid="onboarding-submit-create"]').text()).toBe("Create wallet")
		expect(w.get("step-indicator-stub").attributes()).toMatchObject({ current: "wallet", path: "password" })
		expect(document.activeElement).toBe(w.get('[data-testid="onboarding-password-input"] input').element)
	})

	test("the first profile is created as Main", async () => {
		const w = await mountCreate()
		await choosePassword(w)
		await w.get('[data-testid="onboarding-password-input"] input').setValue("password123")
		await w.get('[data-testid="onboarding-password-confirm"] input').setValue("password123")
		await w.get('[data-testid="onboarding-submit-create"]').trigger("click")
		await flushPromises()
		expect(profileApi.createProfile).toHaveBeenCalledWith("Main", "password123")
	})

	test("with a profile already there, the field shows prefilled Profile 2", async () => {
		profileApi.getProfiles.mockResolvedValue([{ name: "Main" }])
		const w = await mountCreate()
		expect(page(w).attributes("data-name-field")).toBe("shown")
		expect((w.get('[data-testid="onboarding-name-input"] input').element as HTMLInputElement).value).toBe("Profile 2")
	})
})

describe("onboarding create — the method tablist", () => {
	type Method = "password" | "passkey"
	const tab = (w: VueWrapper, method: Method) => w.get(`[data-testid="onboarding-method-${method}"]`)
	const press = (key: string) => {
		const event = document.activeElement && sendEvent(document.activeElement, "keydown", { key })
		if (!event) throw new Error(`no ${key} reached the focused control`)
		return event
	}
	const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0))
	const focusPasskey = (w: VueWrapper) => (tab(w, "passkey").element as HTMLElement).focus()

	test("two tabs, Passkey then Password, each a non-submitting button", async () => {
		const w = await mountCreate()
		const tabs = w.findAll('[role="tablist"] > *')
		expect(tabs.map((t) => [t.attributes("data-testid"), t.attributes("role"), t.attributes("type"), t.text()])).toEqual([
			["onboarding-method-passkey", "tab", "button", "Passkey"],
			["onboarding-method-password", "tab", "button", "Password"],
		])
	})

	test("ArrowRight and ArrowLeft switch the method, move the one tab stop and the focus", async () => {
		const w = await mountCreate()
		focusPasskey(w)

		expect(press("ArrowRight").defaultPrevented).toBe(true)
		await flushPromises()
		expect(tab(w, "password").attributes()).toMatchObject({ "aria-selected": "true", tabindex: "0" })
		expect(tab(w, "passkey").attributes()).toMatchObject({ "aria-selected": "false", tabindex: "-1" })
		expect(document.activeElement).toBe(tab(w, "password").element)
		expect(w.find('[data-testid="onboarding-password-input"]').exists()).toBe(true)
		expect(w.get('[data-testid="onboarding-submit-create"]').text()).toBe("Create wallet")

		expect(press("ArrowLeft").defaultPrevented).toBe(true)
		await flushPromises()
		expect(tab(w, "passkey").attributes()).toMatchObject({ "aria-selected": "true", tabindex: "0" })
		expect(document.activeElement).toBe(tab(w, "passkey").element)
		expect(w.find('[data-testid="onboarding-password-input"]').exists()).toBe(false)
	})

	test("two ArrowRight presses in separate tasks go Passkey → Password → Passkey", async () => {
		const w = await mountCreate()
		focusPasskey(w)
		press("ArrowRight")
		await macrotask()
		expect(document.activeElement).toBe(tab(w, "password").element)
		press("ArrowRight")
		await macrotask()
		expect(tab(w, "passkey").attributes("aria-selected")).toBe("true")
		expect(document.activeElement).toBe(tab(w, "passkey").element)
	})

	test("any other key leaves the method alone and is not prevented", async () => {
		const w = await mountCreate()
		focusPasskey(w)
		for (const key of ["a", "ArrowDown", "Home"]) expect(press(key).defaultPrevented).toBe(false)
		await flushPromises()
		expect(tab(w, "passkey").attributes("aria-selected")).toBe("true")
		expect(document.activeElement).toBe(tab(w, "passkey").element)
	})

	test("the active tab carries the one class the inactive lacks, and it follows the method", async () => {
		const w = await mountCreate()
		const extra = (on: Method, off: Method) => {
			const offClasses = tab(w, off).classes()
			return tab(w, on)
				.classes()
				.filter((c) => !offClasses.includes(c))
		}
		const active = extra("passkey", "password")
		expect(active).toHaveLength(1)
		expect(extra("password", "passkey")).toEqual([])

		await tab(w, "password").trigger("click")
		expect(extra("password", "passkey")).toEqual(active)
		expect(extra("passkey", "password")).toEqual([])
	})
})

describe("onboarding create — Enter does what the focused control says, with a valid password pair", () => {
	async function mountWithValidPair() {
		const w = await mountCreate()
		await choosePassword(w)
		await w.get('[data-testid="onboarding-password-input"] input').setValue("password123")
		await w.get('[data-testid="onboarding-password-confirm"] input').setValue("password123")
		return w
	}

	test("Enter on Back goes back to Welcome and creates nothing", async () => {
		const w = await mountWithValidPair()
		pressOn(w.get('[data-testid="onboarding-create-back"]').element as HTMLElement, "Enter")
		await flushPromises()
		expect(routerPush).toHaveBeenCalledWith("/onboarding/welcome")
		expect(profileApi.createProfile).not.toHaveBeenCalled()
	})

	test("Enter on the active method tab keeps it selected and creates nothing", async () => {
		const w = await mountWithValidPair()
		const tab = w.get('[data-testid="onboarding-method-password"]')
		pressOn(tab.element as HTMLElement, "Enter")
		await flushPromises()
		expect(tab.attributes("aria-selected")).toBe("true")
		expect(profileApi.createProfile).not.toHaveBeenCalled()
	})

	test("a click on the inactive tab switches the method and submits nothing", async () => {
		const w = await mountWithValidPair()
		const submitted = vi.fn()
		w.get("form").element.addEventListener("submit", submitted)
		await w.get('[data-testid="onboarding-method-passkey"]').trigger("click")
		await flushPromises()
		expect(w.get('[data-testid="onboarding-method-passkey"]').attributes("aria-selected")).toBe("true")
		expect(submitted).not.toHaveBeenCalled()
		expect(profileApi.createProfile).not.toHaveBeenCalled()
		expect(profileApi.generateProfileId).not.toHaveBeenCalled()
		expect(profileApi.createPasskeyProfile).not.toHaveBeenCalled()
	})

	test("a repeat Enter in the confirm field is cancelled, so the form cannot submit on it", async () => {
		const w = await mountWithValidPair()
		const field = w.get('[data-testid="onboarding-password-confirm"] input').element
		expect(enterOn(field, { repeat: true }).defaultPrevented).toBe(true)
	})
})

describe("onboarding create — the focused method tab's ring", () => {
	/** Test runs answer every CSS-module name with a class, so a missing focus rule shows only here. */
	const SOURCE = readFileSync(resolve(__dirname, "create.vue"), "utf8")

	test("the filled tab's ring is in the page colour, inside its fill, and outranks the unfilled tab's by source order", () => {
		expect(SOURCE).toMatch(
			/\.tab:focus-visible \{[^}]*\}[\s\S]*\.tabActive:focus-visible \{\s*outline: 2px solid var\(--app-bg\);\s*outline-offset: -5px;\s*\}/,
		)
	})
})

describe("onboarding create — the recovery phrase step", () => {
	function defer<T>() {
		let resolve!: (value: T) => void
		let reject!: (error: unknown) => void
		const promise = new Promise<T>((res, rej) => {
			resolve = res
			reject = rej
		})
		return { promise, resolve, reject }
	}

	async function submitPassword(w: VueWrapper) {
		await choosePassword(w)
		await w.get('[data-testid="onboarding-password-input"] input').setValue("password123")
		await w.get('[data-testid="onboarding-password-confirm"] input').setValue("password123")
		await w.get('[data-testid="onboarding-submit-create"]').trigger("click")
		await flushPromises()
	}

	const typed = (w: VueWrapper) =>
		["onboarding-password-input", "onboarding-password-confirm"].map(
			(id) => (w.get(`[data-testid="${id}"] input`).element as HTMLInputElement).value,
		)

	function unmount(w: VueWrapper) {
		wrappers.splice(wrappers.indexOf(w), 1)
		w.unmount()
	}

	test("a password wallet reads its words once, with the typed password, before bootstrap, then shows them as step 3", async () => {
		const w = await mountCreate()
		await submitPassword(w)
		expect(profileApi.exportMnemonic).toHaveBeenCalledTimes(1)
		expect(profileApi.exportMnemonic).toHaveBeenCalledWith("p1", "password123")
		expect(profileApi.exportMnemonic.mock.invocationCallOrder[0]).toBeLessThan(bootstrapActiveProfile.mock.invocationCallOrder[0])
		expect(setLastActiveProfileId).toHaveBeenCalledWith("p1")

		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(true)
		expect(w.findAll('[data-testid="onboarding-phrase-word"]').map((word) => word.text())).toEqual(WORDS)
		expect(w.get("step-indicator-stub").attributes()).toMatchObject({ current: "phrase", path: "password" })
		expect(w.find('[data-testid="onboarding-create-back"]').exists()).toBe(false)
		expect(routerPush).not.toHaveBeenCalled()
		expect(document.activeElement).toBe(w.get('[data-testid="onboarding-phrase-title"]').element)
	})

	test("the step shows Settings' three warnings under the grid, then Copy beside I saved it", async () => {
		const w = await mountCreate()
		await submitPassword(w)
		const step = w.get('[data-testid="onboarding-phrase-page"]').element
		const text = step.textContent ?? ""
		const at = (needle: string) => text.indexOf(needle)
		for (const warning of RECOVERY_PHRASE_WARNINGS) expect(at(warning)).toBeGreaterThan(at(WORDS[23]))
		expect(at("Keep in mind")).toBeLessThan(at(RECOVERY_PHRASE_WARNINGS[0]))
		const copy = w.get('[data-testid="onboarding-phrase-copy"]').element
		const saved = w.get('[data-testid="onboarding-phrase-saved"]').element
		expect(copy.parentElement).toBe(saved.parentElement)
		expect(copy.nextElementSibling).toBe(saved)
		expect(at(RECOVERY_PHRASE_WARNINGS[2])).toBeLessThan(at("I saved it"))
	})

	test("the password is cleared before bootstrap runs, with no length hint under the empty fields", async () => {
		const pending = defer<boolean>()
		bootstrapActiveProfile.mockReturnValueOnce(pending.promise)
		const w = await mountCreate()
		await submitPassword(w)
		expect(bootstrapActiveProfile).toHaveBeenCalledTimes(1)
		expect(typed(w)).toEqual(["", ""])
		expect(w.text()).not.toContain("At least 8 characters")
		pending.resolve(true)
		await flushPromises()
		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(true)
	})

	test("a failed read clears the password and goes straight to Ready, with no step and no mark", async () => {
		profileApi.exportMnemonic.mockRejectedValueOnce(new Error("internal"))
		const w = await mountCreate()
		await submitPassword(w)
		expect(typed(w)).toEqual(["", ""])
		expect(bootstrapActiveProfile).toHaveBeenCalledTimes(1)
		expect(routerPush).toHaveBeenCalledWith(doneRoute("password"))
		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(false)
		expect(markGetStarted).not.toHaveBeenCalled()
	})

	test("a failed bootstrap still leaves the password cleared", async () => {
		bootstrapActiveProfile.mockRejectedValueOnce(new Error("activation"))
		const w = await mountCreate()
		await submitPassword(w)
		expect(typed(w)).toEqual(["", ""])
		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(false)
	})

	test("a session locked during bootstrap shows no words and records no last profile", async () => {
		bootstrapActiveProfile.mockResolvedValueOnce(false)
		const w = await mountCreate()
		await submitPassword(w)
		expect(profileApi.exportMnemonic).toHaveBeenCalledTimes(1)
		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(false)
		expect(setLastActiveProfileId).not.toHaveBeenCalled()
		expect(routerPush).toHaveBeenCalledWith(doneRoute("password"))
	})

	test("I saved it marks the new profile, and only then routes to Ready", async () => {
		const pending = defer<undefined>()
		markGetStarted.mockReturnValueOnce(pending.promise)
		const w = await mountCreate()
		await submitPassword(w)
		await w.get('[data-testid="onboarding-phrase-saved"]').trigger("click")
		expect(markGetStarted).toHaveBeenCalledWith("p1", "phraseSaved")
		expect(routerPush).not.toHaveBeenCalled()
		pending.resolve(undefined)
		await flushPromises()
		expect(routerPush).toHaveBeenCalledWith(doneRoute("password"))
		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(false)
	})

	test("Do it later takes the words down, routes to Ready and marks nothing", async () => {
		const w = await mountCreate()
		await submitPassword(w)
		await w.get('[data-testid="onboarding-phrase-later"]').trigger("click")
		expect(routerPush).toHaveBeenCalledExactlyOnceWith(doneRoute("password"))
		expect(markGetStarted).not.toHaveBeenCalled()
		// The push is a mock that never lands, so this is the page while the route to Ready settles.
		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(false)
		expect(w.find('[data-testid="onboarding-create-page"]').exists()).toBe(false)
	})

	test("a repeat Enter on I saved it is cancelled, so it cannot press it", async () => {
		const w = await mountCreate()
		await submitPassword(w)
		const saved = w.get('[data-testid="onboarding-phrase-saved"]').element
		const repeat = new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true })
		expect(saved.dispatchEvent(repeat)).toBe(false)
	})

	test("a Create that settles after the page left reads nothing, bootstraps nothing and routes nowhere", async () => {
		const created = defer<unknown>()
		profileApi.createProfile.mockReturnValueOnce(created.promise)
		const w = await mountCreate()
		await submitPassword(w)
		unmount(w)
		created.resolve({ id: "p1", name: "Main", type: "password" })
		await flushPromises()
		expect(profileApi.exportMnemonic).not.toHaveBeenCalled()
		expect(bootstrapActiveProfile).not.toHaveBeenCalled()
		expect(setLastActiveProfileId).not.toHaveBeenCalled()
		expect(routerPush).not.toHaveBeenCalled()
	})

	test("leaving during the read publishes nothing", async () => {
		const read = defer<string[]>()
		profileApi.exportMnemonic.mockReturnValueOnce(read.promise)
		const w = await mountCreate()
		await submitPassword(w)
		unmount(w)
		read.resolve(WORDS)
		await flushPromises()
		expect(bootstrapActiveProfile).not.toHaveBeenCalled()
		expect(routerPush).not.toHaveBeenCalled()
	})

	test("a passkey wallet reads its words once with the answer it was made from, before bootstrap, then shows them as step 3", async () => {
		surface.inPage = true
		const w = await mountCreate()
		await w.get('[data-testid="onboarding-submit-create"]').trigger("click")
		await flushPromises()
		expect(createPasskeyProfileInPage).toHaveBeenCalledTimes(1)
		expect(profileApi.exportMnemonic).toHaveBeenCalledTimes(1)
		expect(profileApi.exportMnemonic).toHaveBeenCalledWith("k1", undefined, ANSWER)
		expect(profileApi.exportMnemonic.mock.invocationCallOrder[0]).toBeLessThan(bootstrapActiveProfile.mock.invocationCallOrder[0])
		expect(w.findAll('[data-testid="onboarding-phrase-word"]').map((word) => word.text())).toEqual(WORDS)
		expect(w.get("step-indicator-stub").attributes()).toMatchObject({ current: "phrase", path: "passkey" })
		expect(routerPush).not.toHaveBeenCalled()
		await w.get('[data-testid="onboarding-phrase-saved"]').trigger("click")
		await flushPromises()
		expect(routerPush).toHaveBeenCalledWith(doneRoute("passkey"))
	})

	test("a passkey wallet whose words do not open reaches Ready, where Home keeps the reminder", async () => {
		surface.inPage = true
		profileApi.exportMnemonic.mockRejectedValueOnce(new Error("Passkey did not open this profile"))
		const w = await mountCreate()
		await w.get('[data-testid="onboarding-submit-create"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(false)
		expect(bootstrapActiveProfile).toHaveBeenCalledTimes(1)
		expect(routerPush).toHaveBeenCalledWith(doneRoute("passkey"))
	})

	test("where the background ran the passkey, the page holds no answer: no read, and Ready", async () => {
		const w = await mountCreate()
		await w.get('[data-testid="onboarding-submit-create"]').trigger("click")
		await flushPromises()
		expect(profileApi.createPasskeyProfile).toHaveBeenCalledWith("Main", undefined, false)
		expect(profileApi.exportMnemonic).not.toHaveBeenCalled()
		expect(bootstrapActiveProfile).toHaveBeenCalledTimes(1)
		expect(routerPush).toHaveBeenCalledWith(doneRoute("passkey"))
	})

	test("the link under the button takes a passkey the person already has, on the Passkey tab only", async () => {
		const w = await mountCreate()
		await w.get('[data-testid="onboarding-passkey-reuse"]').trigger("click")
		await flushPromises()
		expect(profileApi.createPasskeyProfile).toHaveBeenCalledExactlyOnceWith("Main", undefined, true)
		expect(routerPush).toHaveBeenCalledWith(doneRoute("passkey"))
		const other = await mountCreate()
		await choosePassword(other)
		expect(other.find('[data-testid="onboarding-passkey-reuse"]').exists()).toBe(false)
	})

	const lock = () => {
		worker.active = undefined
		profileApi.onActiveProfileChanged.invoke(undefined)
	}
	const shown = (w: VueWrapper) => ({
		words: w.findAll('[data-testid="onboarding-phrase-word"]').length,
		copy: w.find('[data-testid="onboarding-phrase-copy"]').exists(),
		form: w.find('[data-testid="onboarding-create-page"]').exists(),
	})

	const createPasskey = (w: VueWrapper) => w.get('[data-testid="onboarding-submit-create"]').trigger("click")
	const reusePasskey = (w: VueWrapper) => w.get('[data-testid="onboarding-passkey-reuse"]').trigger("click")

	test.each([
		{ name: "a password", path: "password", create: submitPassword },
		{ name: "a new passkey", path: "passkey", create: createPasskey },
		{ name: "an existing passkey", path: "passkey", create: reusePasskey },
	] as const)("a lock after the words show takes them and Copy off the page, on $name wallet", async ({ path, create }) => {
		surface.inPage = path === "passkey"
		const w = await mountCreate()
		await create(w)
		await flushPromises()
		expect(shown(w)).toEqual({ words: 24, copy: true, form: false })

		lock()
		await flushPromises()
		expect(shown(w)).toEqual({ words: 0, copy: false, form: false })
		expect(routerPush).toHaveBeenCalledExactlyOnceWith(doneRoute(path))
	})

	test("a dropped worker connection, with no lock event, takes the words off the page", async () => {
		const w = await mountCreate()
		await submitPassword(w)
		expect(shown(w).words).toBe(24)

		profileApi.onDisconnected.invoke()
		await flushPromises()
		expect(shown(w)).toEqual({ words: 0, copy: false, form: false })
		expect(routerPush).toHaveBeenCalledExactlyOnceWith(doneRoute("password"))
	})

	test("a lock during the last-profile write never shows the words, and leaves no Create to press", async () => {
		const pending = defer<undefined>()
		setLastActiveProfileId.mockReturnValueOnce(pending.promise)
		const w = await mountCreate()
		await submitPassword(w)
		expect(setLastActiveProfileId).toHaveBeenCalledWith("p1")

		lock()
		pending.resolve(undefined)
		await flushPromises()
		expect(shown(w)).toEqual({ words: 0, copy: false, form: false })
		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(false)
		expect(routerPush).toHaveBeenCalledExactlyOnceWith(doneRoute("password"))
	})
})

describe("onboarding create — the reload mark", () => {
	afterEach(() => window.history.replaceState(null, ""))

	test("the entry is marked once the profile exists, before the bootstrap and the words", async () => {
		let release!: (active: boolean) => void
		bootstrapActiveProfile.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
		const w = await mountCreate()
		await choosePassword(w)
		await w.get('[data-testid="onboarding-password-input"] input').setValue("password123")
		await w.get('[data-testid="onboarding-password-confirm"] input').setValue("password123")
		await w.get('[data-testid="onboarding-submit-create"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(false)
		expect(donePath(window.history.state)).toBe("password")
		release(true)
		await flushPromises()
		expect(w.find('[data-testid="onboarding-phrase-page"]').exists()).toBe(true)
	})

	test("a Create mounted after the load check drops an earlier attempt's mark and keeps the router's keys", async () => {
		settleResume(true)
		window.history.replaceState({ position: 3, onboardingPath: "passkey" }, "")
		await mountCreate()
		expect(window.history.state).toEqual({ position: 3 })
	})
})
