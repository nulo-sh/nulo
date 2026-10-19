import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const exportMnemonic = vi.hoisted(() => vi.fn(async () => ["alpha", "bravo", "charlie"]))
vi.mock("@/utils/core", () => ({ managers: { profile: { exportMnemonic } } }))
const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }))
vi.mock("vue-router", () => ({ useRouter: () => router, useRoute: () => ({ query: {}, meta: {} }) }))
vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: vi.fn() }) }))

import { Flex, Icon, Input, Text } from "@nulo/design"
import { pressOn } from "../../../../../../tests/helpers/press-key"
import SubPageHeader from "@/components/ui/SubPageHeader.vue"
import { useAppStore } from "@/stores/app.store"
import { RECOVERY_PHRASE_WARNINGS } from "@/utils/recovery-phrase-warnings"
import Seed from "./seed.vue"
import { installChromeStorage } from "../../../../../../tests/helpers/chrome-storage-mock"

const wrappers: VueWrapper[] = []

async function mountAgreedWithPassword() {
	const w = mount(Seed, {
		attachTo: document.body,
		global: {
			plugins: [
				createTestingPinia({ createSpy: vi.fn, initialState: { app: { profile: { id: "p1", name: "Main", type: "password" } } } }),
			],
			components: { Flex, Icon, Input, SubPageHeader, Text },
			stubs: {
				Button: { template: "<button><slot /></button>" },
				RecoveryPhraseGrid: true,
				SecretCountdownClose: true,
			},
		},
	})
	wrappers.push(w)
	await flushPromises()
	await w.get('[data-testid="agree-continue-btn"]').trigger("click")
	await w.get('[data-testid="unlock-password-input"] input').setValue("password123")
	return w
}

const reveal = (w: VueWrapper) => w.get('[data-testid="unlock-submit-btn"]').element as HTMLElement

beforeEach(() => {
	vi.clearAllMocks()
	installChromeStorage({}, { persist: false })
})

afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

const storageSet = () =>
	(globalThis as unknown as { chrome: { storage: { local: { set: ReturnType<typeof vi.fn> } } } }).chrome.storage.local.set

describe("recovery phrase — Enter does what the focused control says", () => {
	test("Enter on the back arrow goes back and reveals nothing", async () => {
		const w = await mountAgreedWithPassword()
		// With no history behind the page, SubPageHeader pushes its backTo.
		expect(window.history.length).toBe(1)
		pressOn(w.get('[data-testid="subpage-back"]').element as HTMLElement, "Enter")
		await flushPromises()
		expect(router.push).toHaveBeenCalledWith("/popup/settings/security/export")
		expect(exportMnemonic).not.toHaveBeenCalled()
	})

	test("Enter on Reveal reveals once", async () => {
		const w = await mountAgreedWithPassword()
		expect(reveal(w).textContent?.trim()).toBe("Reveal Recovery Phrase")
		pressOn(reveal(w), "Enter")
		await flushPromises()
		expect(exportMnemonic).toHaveBeenCalledTimes(1)
		expect(exportMnemonic).toHaveBeenCalledWith("p1", "password123")
	})

	test("a repeat Enter on Reveal reveals nothing", async () => {
		const w = await mountAgreedWithPassword()
		pressOn(reveal(w), "Enter", { repeat: true })
		await flushPromises()
		expect(exportMnemonic).not.toHaveBeenCalled()
	})

	test("(preservation) Enter in the password field reveals once", async () => {
		const w = await mountAgreedWithPassword()
		const field = w.get('[data-testid="unlock-password-input"] input').element
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
		await flushPromises()
		expect(exportMnemonic).toHaveBeenCalledTimes(1)
	})
})

describe("recovery phrase — one reveal per press, none after the page left", () => {
	function deferMnemonic() {
		let resolve: (words: string[]) => void = () => {}
		exportMnemonic.mockImplementationOnce(() => new Promise<string[]>((r) => (resolve = r)))
		return (words: string[]) => resolve(words)
	}

	test("two clicks on Reveal decrypt the phrase once", async () => {
		const w = await mountAgreedWithPassword()
		deferMnemonic()
		reveal(w).click()
		reveal(w).click()
		await flushPromises()
		expect(exportMnemonic).toHaveBeenCalledTimes(1)
	})

	test("a reveal settling after unmount marks nothing and arms no close timer", async () => {
		const w = await mountAgreedWithPassword()
		const settle = deferMnemonic()
		reveal(w).click()
		await flushPromises()
		vi.useFakeTimers()
		try {
			wrappers.splice(wrappers.indexOf(w), 1)
			w.unmount()
			settle(["alpha", "bravo", "charlie"])
			await flushPromises()
			expect(storageSet()).not.toHaveBeenCalled()
			expect(vi.getTimerCount()).toBe(0)
			vi.advanceTimersByTime(5 * 60_000)
			expect(router.push).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})

	test("(control) a reveal settling while mounted shows the phrase and arms one countdown", async () => {
		const w = await mountAgreedWithPassword()
		const settle = deferMnemonic()
		reveal(w).click()
		await flushPromises()
		vi.useFakeTimers()
		try {
			settle(["alpha", "bravo", "charlie"])
			await flushPromises()
			expect(w.findComponent({ name: "RecoveryPhraseGrid" }).props()).toMatchObject({
				words: ["alpha", "bravo", "charlie"],
				columns: 3,
				testId: "reveal-content",
			})
			const warnings = w.findAll("p, span").map((el) => el.text())
			expect(warnings).toEqual(expect.arrayContaining([...RECOVERY_PHRASE_WARNINGS]))
			expect(RECOVERY_PHRASE_WARNINGS[2]).toBe(
				"Paper keeps the phrase off every computer; keep it somewhere safe from loss, water and fire.",
			)
			expect(vi.getTimerCount()).toBe(2)
			vi.advanceTimersByTime(5 * 60_000)
			expect(router.push).toHaveBeenCalledWith("/popup/settings/security/export")
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("recovery phrase — a reveal clears Home's reminder", () => {
	test("a reveal marks the profile it was asked for, even when another became active during the read", async () => {
		const w = await mountAgreedWithPassword()
		let settle: (words: string[]) => void = () => {}
		exportMnemonic.mockImplementationOnce(() => new Promise<string[]>((r) => (settle = r)))
		reveal(w).click()
		await flushPromises()
		useAppStore().profile = { id: "p2", name: "Other", type: "password" } as never
		settle(["alpha", "bravo", "charlie"])
		await flushPromises()
		expect(storageSet()).toHaveBeenCalledTimes(1)
		expect(storageSet()).toHaveBeenCalledWith({ "nulo:ui:getStartedPhraseSaved@p1": true })
	})

	test("a wrong password marks nothing", async () => {
		const w = await mountAgreedWithPassword()
		exportMnemonic.mockRejectedValueOnce(new Error("wrong password"))
		reveal(w).click()
		await flushPromises()
		expect(w.find('[data-testid="unlock-error-text"]').exists()).toBe(true)
		expect(storageSet()).not.toHaveBeenCalled()
	})
})
