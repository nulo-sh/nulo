import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const exportMnemonic = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ["alpha", "bravo", "charlie"]))
const getPasskeyUnlockParams = vi.hoisted(() => vi.fn(async () => ({ credentialId: "Y3JlZA==", prfSalt: "c2FsdA==" })))
vi.mock("@/utils/core", () => ({ managers: { profile: { exportMnemonic, getPasskeyUnlockParams } } }))
const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }))
/** A test that needs real history sets its own router here. */
const real = vi.hoisted(() => ({ router: undefined as unknown }))
vi.mock("vue-router", async (original) => ({
	...(await original<typeof import("vue-router")>()),
	useRouter: () => real.router ?? router,
	useRoute: () => ({ query: {}, meta: {} }),
}))
const openToast = vi.hoisted(() => vi.fn())
vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast }) }))
const runCeremony = vi.hoisted(() => vi.fn())
vi.mock("@/composables/usePasskeyCeremony", () => ({
	usePasskeyCeremony: () => ({ request: { value: null }, runCeremony, onResolve: vi.fn(), onReject: vi.fn() }),
}))
const surface = vi.hoisted(() => ({ inPanel: false }))
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: () => surface.inPanel }))
const moveToOwnWindow = vi.hoisted(() => vi.fn(async () => true))
vi.mock("@/utils/own-window", async (original) => ({ ...(await original<typeof import("@/utils/own-window")>()), moveToOwnWindow }))

import { UserRejectedError } from "@nulo/extension-messaging/errors"
import { createRouter, createWebHashHistory, type Router } from "vue-router"
import { Flex, Icon, Input, Text } from "@nulo/design"
import { enterOn } from "../../../../../../tests/helpers/credential-pins"
import { pressOn } from "../../../../../../tests/helpers/press-key"
import SubPageHeader from "@/components/ui/SubPageHeader.vue"
import { useAppStore } from "@/stores/app.store"
import { RECOVERY_PHRASE_WARNINGS } from "@/utils/recovery-phrase-warnings"
import Seed from "./seed.vue"
import { installChromeStorage } from "../../../../../../tests/helpers/chrome-storage-mock"

const wrappers: VueWrapper[] = []

async function mountAgreed(type: "password" | "passkey") {
	const w = mount(Seed, {
		attachTo: document.body,
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn, initialState: { app: { profile: { id: "p1", name: "Main", type } } } })],
			components: { Flex, Icon, Input, SubPageHeader, Text },
			stubs: {
				Button: { template: "<button><slot /></button>" },
				RecoveryPhraseGrid: true,
				SecretCountdownClose: true,
				PasskeyCeremonyDialog: true,
			},
		},
	})
	wrappers.push(w)
	await flushPromises()
	await w.get('[data-testid="agree-continue-btn"]').trigger("click")
	return w
}

async function mountAgreedWithPassword() {
	const w = await mountAgreed("password")
	await w.get('[data-testid="unlock-password-input"] input').setValue("password123")
	return w
}

const reveal = (w: VueWrapper) => w.get('[data-testid="unlock-submit-btn"]').element as HTMLElement

beforeEach(() => {
	vi.clearAllMocks()
	real.router = undefined
	surface.inPanel = false
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
		enterOn(w.get('[data-testid="unlock-password-input"] input').element)
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
			await vi.advanceTimersByTimeAsync(5 * 60_000)
			expect(router.replace).not.toHaveBeenCalled()
			expect(router.back).not.toHaveBeenCalled()
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
			await vi.advanceTimersByTimeAsync(5 * 60_000)
			expect(router.replace).toHaveBeenCalledWith("/popup/settings/security/export")
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("recovery phrase — a reveal clears Home's reminder", () => {
	test("a reveal settling after a profile switch shows no words and marks no profile", async () => {
		const w = await mountAgreedWithPassword()
		let settle: (words: string[]) => void = () => {}
		exportMnemonic.mockImplementationOnce(() => new Promise<string[]>((r) => (settle = r)))
		reveal(w).click()
		await flushPromises()
		useAppStore().profile = { id: "p2", name: "Other", type: "password" } as never
		settle(["alpha", "bravo", "charlie"])
		await flushPromises()
		expect(exportMnemonic).toHaveBeenCalledWith("p1", "password123")
		expect(w.findComponent({ name: "RecoveryPhraseGrid" }).exists()).toBe(false)
		expect(storageSet()).not.toHaveBeenCalled()
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

describe("recovery phrase — a lock or a profile switch the page outlives ends the reveal", () => {
	const ends: Array<[string, () => void]> = [
		[
			"a lock",
			() => {
				const app = useAppStore()
				app.isLogined = false
				app.isLogined = true
			},
		],
		[
			"a profile switch",
			() => {
				useAppStore().profile = { id: "p2", name: "Other", type: "password" } as never
			},
		],
	]
	const countdown = (w: VueWrapper) => w.findComponent({ name: "SecretCountdownClose" })
	const agree = (w: VueWrapper) => w.get('[data-testid="agree-continue-btn"]').trigger("click")
	const field = (w: VueWrapper) => w.get('[data-testid="unlock-password-input"] input').element as HTMLInputElement

	test.each(ends)("%s after keep open: the page is back at its agreement, and the next reveal counts down", async (_label, end) => {
		const w = await mountAgreedWithPassword()
		useAppStore().isLogined = true
		reveal(w).click()
		await flushPromises()
		countdown(w).vm.$emit("disableAutoClose")
		await flushPromises()
		expect(countdown(w).props("autoCloseDisabled")).toBe(true)

		end()
		await flushPromises()
		expect(w.findComponent({ name: "RecoveryPhraseGrid" }).exists()).toBe(false)
		await agree(w)
		expect(field(w).value).toBe("")
		await w.get('[data-testid="unlock-password-input"] input').setValue("password123")
		reveal(w).click()
		await flushPromises()
		expect(w.findComponent({ name: "RecoveryPhraseGrid" }).props("words")).toEqual(["alpha", "bravo", "charlie"])
		expect(countdown(w).props()).toMatchObject({ autoCloseDisabled: false, countdownLabel: "5:00" })
	})

	test.each(ends)("%s after a wrong password: the next agreement shows an empty field and no error", async (_label, end) => {
		exportMnemonic.mockRejectedValueOnce(new Error("wrong password"))
		const w = await mountAgreedWithPassword()
		useAppStore().isLogined = true
		reveal(w).click()
		await flushPromises()
		expect(w.find('[data-testid="unlock-error-text"]').exists()).toBe(true)

		end()
		await flushPromises()
		await agree(w)
		expect(field(w).value).toBe("")
		expect(w.find('[data-testid="unlock-error-text"]').exists()).toBe(false)
	})
})

describe("recovery phrase — a passkey profile", () => {
	const ANSWER = { id: "Y3JlZA==", prf: "cHJm", prfSalt: "c2FsdA==" }
	const passkeyButton = (w: VueWrapper) => w.get('[data-testid="reveal-passkey-btn"]')

	test("after the agreement the gate is Reveal with passkey under one sentence, with no password field", async () => {
		const w = await mountAgreed("passkey")
		expect(passkeyButton(w).text()).toBe("Reveal with passkey")
		expect(w.get('[data-testid="reveal-passkey-note"]').text()).toBe("Your passkey confirms it's you before the phrase shows.")
		expect(w.find('[data-testid="unlock-password-input"]').exists()).toBe(false)
		expect(w.find('[data-testid="unlock-submit-btn"]').exists()).toBe(false)
	})

	test("(control) a password profile's gate is its field, without the passkey's sentence", async () => {
		const w = await mountAgreed("password")
		expect(w.find('[data-testid="unlock-password-input"]').exists()).toBe(true)
		expect(w.find('[data-testid="reveal-passkey-note"]').exists()).toBe(false)
	})

	test("the passkey is asked at this profile's own input, and its answer opens the words once", async () => {
		runCeremony.mockResolvedValueOnce(ANSWER)
		const w = await mountAgreed("passkey")
		await passkeyButton(w).trigger("click")
		await flushPromises()
		expect(getPasskeyUnlockParams).toHaveBeenCalledWith("p1")
		expect(runCeremony).toHaveBeenCalledWith({
			mode: "get",
			credentialId: "Y3JlZA==",
			prfSalt: "c2FsdA==",
			step: "reveal",
			profileName: "Main",
		})
		expect(exportMnemonic).toHaveBeenCalledTimes(1)
		expect(exportMnemonic).toHaveBeenCalledWith("p1", undefined, ANSWER)
		expect(w.findComponent({ name: "RecoveryPhraseGrid" }).props("words")).toEqual(["alpha", "bravo", "charlie"])
		expect(storageSet()).toHaveBeenCalledWith({ "nulo:ui:getStartedPhraseSaved@p1": true })
	})

	test("a cancelled prompt says nothing, opens nothing and keeps the button", async () => {
		runCeremony.mockRejectedValueOnce(new UserRejectedError("User cancelled passkey ceremony"))
		const w = await mountAgreed("passkey")
		await passkeyButton(w).trigger("click")
		await flushPromises()
		expect(openToast).not.toHaveBeenCalled()
		expect(exportMnemonic).not.toHaveBeenCalled()
		expect(w.find('[data-testid="reveal-passkey-btn"]').exists()).toBe(true)
		expect(storageSet()).not.toHaveBeenCalled()
	})

	test.each<[string, () => void, string]>([
		[
			"a prompt not confirmed",
			() => runCeremony.mockRejectedValueOnce(new DOMException("not allowed", "NotAllowedError")),
			"Passkey not confirmed. Try again.",
		],
		[
			"an answer that opens nothing",
			() => {
				runCeremony.mockResolvedValueOnce(ANSWER)
				exportMnemonic.mockRejectedValueOnce(new Error("Passkey did not open this profile"))
			},
			"Couldn't open the recovery phrase. Try again.",
		],
	])("%s gets a toast in fixed words, and no words show", async (_label, arrange, label) => {
		arrange()
		const w = await mountAgreed("passkey")
		await passkeyButton(w).trigger("click")
		await flushPromises()
		expect(openToast).toHaveBeenCalledTimes(1)
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label })
		expect(w.findComponent({ name: "RecoveryPhraseGrid" }).exists()).toBe(false)
		expect(storageSet()).not.toHaveBeenCalled()
	})

	test.each<[string, "password" | "passkey", boolean, boolean]>([
		["a passkey profile in the toolbar panel", "passkey", true, true],
		["a passkey profile outside the panel", "passkey", false, false],
		["a password profile in the panel", "password", true, false],
	])("%s: moves to its own window first, %s", async (_label, type, inPanel, moves) => {
		surface.inPanel = inPanel
		await mountAgreed(type)
		expect(moveToOwnWindow.mock.calls).toEqual(moves ? [["/popup/settings/security/export/seed"]] : [])
	})
})

// Last in the file: these push entries onto jsdom's one history, which the back-arrow test above
// expects empty.
describe("recovery phrase — Close leaves the reveal behind", () => {
	const MENU = "/popup/settings/security/export"
	const arrive = (router: Router) =>
		new Promise<string>((resolve) => {
			const stop = router.afterEach((to) => {
				stop()
				resolve(to.path)
			})
		})

	test.each(["password", "passkey"] as const)(
		"a %s profile's Close scrubs the words and returns to the Backup menu, whose Back reaches Settings, never the phrase",
		async (type) => {
			const history = createRouter({
				history: createWebHashHistory(),
				routes: [{ path: "/:p(.*)*", component: { render: () => null } }],
			})
			for (const path of ["/popup/settings", MENU, "/popup/settings/security/export/seed"]) await history.push(path)
			real.router = history
			runCeremony.mockResolvedValueOnce({ id: "Y3JlZA==", prf: "cHJm", prfSalt: "c2FsdA==" })
			const w = await mountAgreed(type)
			if (type === "password") {
				await w.get('[data-testid="unlock-password-input"] input').setValue("password123")
				await w.get('[data-testid="unlock-submit-btn"]').trigger("click")
			} else {
				await w.get('[data-testid="reveal-passkey-btn"]').trigger("click")
			}
			await flushPromises()
			const grid = () => w.findComponent({ name: "RecoveryPhraseGrid" }).props("words")
			expect(grid()).toEqual(["alpha", "bravo", "charlie"])

			let arrived = arrive(history)
			w.findComponent({ name: "SecretCountdownClose" }).vm.$emit("close")
			expect(await arrived).toBe(MENU)
			expect(grid()).toEqual([])
			arrived = arrive(history)
			history.back()
			expect(await arrived).toBe("/popup/settings")
		},
	)
})
