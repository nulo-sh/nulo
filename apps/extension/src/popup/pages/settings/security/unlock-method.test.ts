/**
 * The Unlock method page changes how a profile unlocks only after the current method answered; any
 * cancel or failure before the save leaves it as it was and the page where it is, a change made
 * leaves for Settings, and a change saved but not reopened ends at the lock screen.
 */
import { createTestingPinia } from "@pinia/testing"
import { Flex, Icon, Input, Text } from "@nulo/design"
import { InvalidPasswordError, UnlockMethodChangedError, UserRejectedError } from "@nulo/extension-messaging/errors"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { nativeInput, typeNow } from "../../../../../tests/helpers/credential-pins"

const CURRENT = { id: "Y3VycmVudA==", prf: "Y3VyLXByZg==", prfSalt: "Y3VyLXNhbHQ=" }
const NEXT = { id: "bmV4dA==", prf: "bmV4dC1wcmY=", prfSalt: "fresh" }
const profile = vi.hoisted(() => ({
	verifyUnlockCredential: vi.fn(async (_id: string, _credential: unknown): Promise<void> => undefined),
	changeUnlockMethod: vi.fn(async (_id: string, _current: unknown, _next: unknown): Promise<void> => undefined),
	getPasskeyUnlockParams: vi.fn(async (_id: string) => ({ credentialId: "Y3VycmVudA==", prfSalt: "Y3VyLXNhbHQ=" })),
}))
vi.mock("@/utils/core", () => ({ managers: { profile } }))
const ceremony = vi.hoisted(() => ({ run: vi.fn(async (_req: { mode: string; prfSalt: string }): Promise<unknown> => undefined) }))
vi.mock("@/composables/usePasskeyCeremony", async () => {
	const { ref } = await import("vue")
	return {
		usePasskeyCeremony: () => ({
			request: ref(null),
			runCeremony: (req: { mode: string; prfSalt: string }) => ceremony.run(req),
			onResolve: vi.fn(),
			onReject: vi.fn(),
		}),
	}
})
const openToast = vi.hoisted(() => vi.fn())
vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast }) }))
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }))
vi.mock("vue-router", () => ({ useRouter: () => router, useRoute: () => ({ meta: {}, query: {} }) }))
const surface = vi.hoisted(() => ({ panel: false, move: vi.fn(async (_route: string) => true) }))
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: () => surface.panel }))
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	moveToOwnWindow: (route: string) => surface.move(route),
}))

import { useAppStore } from "@/stores/app.store"
import { PasskeyUnconfirmedError } from "@/wallet/utils/passkey-errors"
import UnlockMethod from "./unlock-method.vue"

const wrappers: VueWrapper[] = []

function mountPage(type: "password" | "passkey") {
	const w = mount(UnlockMethod, {
		attachTo: document.body,
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn, initialState: { app: { profile: { id: "p1", name: "Main", type } } } })],
			components: { Flex, Icon, Input, Text },
			stubs: {
				CollapsingHeroLayout: { template: "<div><slot /><slot name='bottom' /></div>" },
				Button: { template: '<button v-bind="$attrs"><slot /></button>' },
				PasskeyCeremonyDialog: true,
				Transition: { template: "<div><slot /></div>" },
			},
		},
	})
	wrappers.push(w)
	return w
}

const click = async (w: VueWrapper, id: string) => {
	await w.get(`[data-testid="${id}"]`).trigger("click")
	await flushPromises()
}
const has = (w: VueWrapper, id: string) => w.find(`[data-testid="${id}"]`).exists()
const disabled = (w: VueWrapper, id: string) => (w.get(`[data-testid="${id}"]`).element as HTMLButtonElement).disabled
const modes = () => ceremony.run.mock.calls.map(([req]) => req.mode)
const current = (w: VueWrapper) => w.get('[data-testid="unlock-method-current"]').text()
const stayed = () => {
	expect(router.replace).not.toHaveBeenCalled()
	expect(router.back).not.toHaveBeenCalled()
}
const nothingChanged = () => {
	expect(profile.changeUnlockMethod).not.toHaveBeenCalled()
	expect(openToast).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "success" }))
	stayed()
}
/** No entry is behind the page here, so Settings takes its place (`leaveFor`, `page-back.test.ts`). */
const leftForSettings = () => expect(router.replace).toHaveBeenCalledExactlyOnceWith("/popup/settings")

async function typePassword(w: VueWrapper, id: string, value: string) {
	typeNow(nativeInput(w, id), value)
	await flushPromises()
}

beforeEach(() => {
	vi.clearAllMocks()
	ceremony.run.mockReset().mockImplementation(async (req) => (req.mode === "get" ? CURRENT : NEXT))
	surface.panel = false
	installChromeStorage({}, { persist: false })
})
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

describe("a password profile", () => {
	async function atPassword() {
		const w = mountPage("password")
		await flushPromises()
		expect(current(w)).toBe("This profile unlocks with a password.")
		await click(w, "unlock-method-use-passkey")
		expect(current(w)).toBe("This profile currently unlocks with a password. After the change, it unlocks with your passkey.")
		return w
	}

	test("Use a passkey instead asks the password before any passkey", async () => {
		const w = await atPassword()
		expect(has(w, "unlock-method-password-input")).toBe(true)
		expect(disabled(w, "unlock-method-continue")).toBe(true)
		expect(ceremony.run).not.toHaveBeenCalled()
	})

	test("a wrong password says so, asks no passkey, and changes nothing", async () => {
		profile.verifyUnlockCredential.mockRejectedValueOnce(new InvalidPasswordError())
		const w = await atPassword()
		await typePassword(w, "unlock-method-password-input", "wrong-one")
		await click(w, "unlock-method-continue")
		expect(w.get('[data-testid="unlock-method-error-text"]').text()).toBe("Wrong password")
		expect(ceremony.run).not.toHaveBeenCalled()
		nothingChanged()
	})

	test("the right password, then a new passkey at a fresh input: the change, and its toast", async () => {
		const w = await atPassword()
		await typePassword(w, "unlock-method-password-input", "password123")
		await click(w, "unlock-method-continue")
		expect(profile.verifyUnlockCredential).toHaveBeenCalledExactlyOnceWith("p1", { password: "password123" })
		const [[request]] = ceremony.run.mock.calls
		expect(request).toMatchObject({ mode: "create", step: "unlockMethod", profileName: "Main" })
		expect(profile.changeUnlockMethod).toHaveBeenCalledExactlyOnceWith("p1", { password: "password123" }, { passkey: NEXT })
		expect(openToast).toHaveBeenCalledExactlyOnceWith({ kind: "success", label: "Now unlocks with your passkey" })
		leftForSettings()
		expect(has(w, "unlock-method-password-input")).toBe(false)
	})

	test("the change uses the password that was checked, whatever the field holds once the card answers", async () => {
		const w = await atPassword()
		await typePassword(w, "unlock-method-password-input", "password123")
		ceremony.run.mockImplementationOnce(async () => {
			typeNow(nativeInput(w, "unlock-method-password-input"), "edited-meanwhile")
			return NEXT
		})
		await click(w, "unlock-method-continue")
		expect(profile.changeUnlockMethod).toHaveBeenCalledExactlyOnceWith("p1", { password: "password123" }, { passkey: NEXT })
	})

	test("a password check that ends after a switch to another profile asks no passkey", async () => {
		const held = Promise.withResolvers<void>()
		profile.verifyUnlockCredential.mockReturnValueOnce(held.promise)
		const w = await atPassword()
		await typePassword(w, "unlock-method-password-input", "password123")
		await click(w, "unlock-method-continue")
		useAppStore().profile = { id: "p2", name: "Other", type: "password" } as never
		await flushPromises()
		held.resolve()
		await flushPromises()
		expect(ceremony.run).not.toHaveBeenCalled()
		nothingChanged()
	})

	test("Enter in the password field continues", async () => {
		const w = await atPassword()
		await typePassword(w, "unlock-method-password-input", "password123")
		nativeInput(w, "unlock-method-password-input").dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
		)
		await flushPromises()
		expect(profile.changeUnlockMethod).toHaveBeenCalledOnce()
	})

	test("a cancelled passkey card changes nothing and keeps the password step", async () => {
		ceremony.run.mockRejectedValueOnce(new UserRejectedError())
		const w = await atPassword()
		await typePassword(w, "unlock-method-password-input", "password123")
		await click(w, "unlock-method-continue")
		nothingChanged()
		expect(openToast).not.toHaveBeenCalled()
		expect(has(w, "unlock-method-password-input")).toBe(true)
	})
})

describe("a passkey profile", () => {
	async function atPasskey() {
		const w = mountPage("passkey")
		await flushPromises()
		expect(current(w)).toBe("This profile unlocks with a passkey.")
		return w
	}

	test("Use a new passkey: the current passkey at its own input, then a new one", async () => {
		const w = await atPasskey()
		await click(w, "unlock-method-new-passkey")
		expect(modes()).toEqual(["get", "create"])
		expect(ceremony.run.mock.calls[0][0]).toMatchObject({ credentialId: CURRENT.id, prfSalt: CURRENT.prfSalt, step: "unlockMethod" })
		expect(ceremony.run.mock.calls[1][0].prfSalt).not.toBe(CURRENT.prfSalt)
		expect(profile.verifyUnlockCredential).toHaveBeenCalledExactlyOnceWith("p1", { passkey: CURRENT })
		expect(profile.changeUnlockMethod).toHaveBeenCalledExactlyOnceWith("p1", { passkey: CURRENT }, { passkey: NEXT })
		expect(openToast).toHaveBeenCalledExactlyOnceWith({ kind: "success", label: "Now unlocks with your new passkey" })
		leftForSettings()
	})

	test.each([
		["the current card", 0],
		["the new card", 1],
	])("cancelling %s changes nothing", async (_label, at) => {
		for (const [i, answer] of [CURRENT, NEXT].entries()) {
			ceremony.run.mockImplementationOnce(async () => {
				if (i === at) throw new UserRejectedError()
				return answer
			})
		}
		const w = await atPasskey()
		await click(w, "unlock-method-new-passkey")
		nothingChanged()
		expect(openToast).not.toHaveBeenCalled()
		expect(disabled(w, "unlock-method-new-passkey")).toBe(false)
	})

	test("Use a password instead: the card, then New Password; nothing changes before Save", async () => {
		const w = await atPasskey()
		await click(w, "unlock-method-use-password")
		expect(modes()).toEqual(["get"])
		expect(has(w, "unlock-method-new-password-input")).toBe(true)
		expect(current(w)).toBe(
			"This profile currently unlocks with a passkey. After the change, it unlocks with the password you set here.",
		)
		expect(profile.changeUnlockMethod).not.toHaveBeenCalled()
		expect(disabled(w, "unlock-method-save")).toBe(true)
		await typePassword(w, "unlock-method-new-password-input", "1234567")
		await typePassword(w, "unlock-method-new-password-confirm-input", "1234567")
		expect(disabled(w, "unlock-method-save")).toBe(true)
		await typePassword(w, "unlock-method-new-password-input", "new-password")
		await typePassword(w, "unlock-method-new-password-confirm-input", "new-passwore")
		expect(disabled(w, "unlock-method-save")).toBe(true)
		await typePassword(w, "unlock-method-new-password-confirm-input", "new-password")
		await click(w, "unlock-method-save")
		expect(ceremony.run).toHaveBeenCalledOnce()
		expect(profile.changeUnlockMethod).toHaveBeenCalledExactlyOnceWith("p1", { passkey: CURRENT }, { password: "new-password" })
		expect(openToast).toHaveBeenCalledExactlyOnceWith({ kind: "success", label: "Now unlocks with your password" })
		leftForSettings()
		expect(has(w, "unlock-method-new-password-input")).toBe(false)
	})

	test("the new-password step's hint guides the pair", async () => {
		const w = await atPasskey()
		await click(w, "unlock-method-use-password")
		expect(w.text()).toContain("At least 8 characters")
		await typePassword(w, "unlock-method-new-password-input", "new-password")
		expect(w.text()).toContain("Passwords don't match")
	})

	test("a switch to another profile drops the held answer: Save then changes nothing", async () => {
		const w = await atPasskey()
		await click(w, "unlock-method-use-password")
		useAppStore().profile = { id: "p2", name: "Other", type: "passkey" } as never
		await flushPromises()
		expect(has(w, "unlock-method-new-password-input")).toBe(false)
		nothingChanged()
	})

	test("two presses run one change", async () => {
		const held = Promise.withResolvers<void>()
		profile.changeUnlockMethod.mockReturnValueOnce(held.promise)
		const w = await atPasskey()
		const btn = w.get('[data-testid="unlock-method-new-passkey"]')
		await btn.trigger("click")
		await flushPromises()
		await btn.trigger("click")
		await flushPromises()
		held.resolve()
		await flushPromises()
		expect(profile.changeUnlockMethod).toHaveBeenCalledOnce()
	})

	test("a new passkey saved but not confirmed is confirmed by the next try, and forgotten once the change is made", async () => {
		const saved = { credentialId: "c2F2ZWQ=", prfSalt: "c2FsdA==" }
		ceremony.run
			.mockImplementationOnce(async () => CURRENT)
			.mockImplementationOnce(async () => {
				throw new PasskeyUnconfirmedError(saved.credentialId, saved.prfSalt, new DOMException("no", "NotAllowedError"))
			})
		const w = await atPasskey()
		await click(w, "unlock-method-new-passkey")
		expect(profile.changeUnlockMethod).not.toHaveBeenCalled()
		await click(w, "unlock-method-new-passkey")
		await click(w, "unlock-method-new-passkey")
		const creates = ceremony.run.mock.calls.map(([req]) => req as { mode: string; prfSalt: string; credentialId?: string })
		const [, second, third] = creates.filter((req) => req.mode === "create")
		expect(second).toMatchObject(saved)
		expect(third?.credentialId).toBeUndefined()
		expect(third?.prfSalt).not.toBe(saved.prfSalt)
		expect(profile.changeUnlockMethod).toHaveBeenCalledTimes(2)
	})

	test("a change that ends after a switch to another profile tells the new one nothing", async () => {
		const held = Promise.withResolvers<void>()
		profile.changeUnlockMethod.mockReturnValueOnce(held.promise)
		const w = await atPasskey()
		await click(w, "unlock-method-new-passkey")
		useAppStore().profile = { id: "p2", name: "Other", type: "passkey" } as never
		await flushPromises()
		held.resolve()
		await flushPromises()
		expect(openToast).not.toHaveBeenCalled()
		stayed()
		expect(disabled(w, "unlock-method-new-passkey")).toBe(false)
	})
})

describe("a profile the change would refuse", () => {
	const DEGRADED = new Error("Imported-keys key unrecoverable")
	test.each([
		["password", "unlock-method-continue"],
		["passkey", "unlock-method-new-passkey"],
		["passkey", "unlock-method-use-password"],
	] as const)("a %s profile is refused at %s, before any new passkey or password", async (type, button) => {
		profile.verifyUnlockCredential.mockRejectedValueOnce(DEGRADED)
		const w = mountPage(type)
		await flushPromises()
		if (type === "password") {
			await click(w, "unlock-method-use-passkey")
			await typePassword(w, "unlock-method-password-input", "password123")
		}
		await click(w, button)
		expect(modes()).not.toContain("create")
		expect(has(w, "unlock-method-new-password-input")).toBe(false)
		expect(openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Couldn't change the unlock method. Try again." })
		nothingChanged()
	})
})

describe("how a change ends", () => {
	test("a failure before the save says nothing changed, and the page stays", async () => {
		profile.changeUnlockMethod.mockRejectedValueOnce(new Error("Profile storage corrupted"))
		const w = mountPage("passkey")
		await flushPromises()
		await click(w, "unlock-method-new-passkey")
		expect(openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Couldn't change the unlock method. Try again." })
		stayed()
		expect(disabled(w, "unlock-method-new-passkey")).toBe(false)
	})

	test("a failure of the current passkey's card is the same failure", async () => {
		ceremony.run.mockRejectedValueOnce(new Error("authenticator broke"))
		const w = mountPage("passkey")
		await flushPromises()
		await click(w, "unlock-method-new-passkey")
		expect(openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Couldn't change the unlock method. Try again." })
		nothingChanged()
	})

	test("a change saved but not reopened says so and goes to the lock screen", async () => {
		profile.changeUnlockMethod.mockRejectedValueOnce(new UnlockMethodChangedError())
		const w = mountPage("passkey")
		await flushPromises()
		await click(w, "unlock-method-new-passkey")
		expect(openToast).toHaveBeenCalledExactlyOnceWith({
			kind: "info",
			label: "Unlock method changed. Unlock Nulo again to continue.",
		})
		expect(router.replace).toHaveBeenCalledExactlyOnceWith("/popup/auth")
	})

	test("in Firefox's toolbar panel the page moves to its own window first", async () => {
		surface.panel = true
		mountPage("password")
		await flushPromises()
		expect(surface.move).toHaveBeenCalledExactlyOnceWith("/popup/settings/security/unlock-method")
	})

	test("elsewhere it stays where it is", async () => {
		mountPage("password")
		await flushPromises()
		expect(surface.move).not.toHaveBeenCalled()
	})
})
