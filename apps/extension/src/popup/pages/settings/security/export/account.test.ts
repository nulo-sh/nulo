/**
 * The account export page gives out only the password-protected file: the plain body Create fetches
 * never reaches a download.
 */
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../../tests/helpers/chrome-storage-mock"

const ADDRESS = `0x${"0a".repeat(32)}`
const exportAccount = vi.hoisted(() =>
	vi.fn(async (_profileId: string, _chainId: number, _address: string, _password: string, encrypt: boolean) =>
		encrypt ? "sealed-body" : "plain-body",
	),
)
const HELD = `0x${"0b".repeat(32)}`
const exportResetHeldAccount = vi.hoisted(() =>
	vi.fn(async (_profileId: string, _address: string, _password: string, encrypt: boolean) => (encrypt ? "sealed-held" : "plain-held")),
)
const networkReset = vi.hoisted(() => ({
	getPendingReset: vi.fn(async (): Promise<{ networkId: string; running: boolean } | null> => null),
	getStaleNetwork: vi.fn(async (_networkId: string): Promise<unknown> => null),
}))
const ANSWER = { id: "cred", prf: "prf", prfSalt: "salt" }
const passkey = vi.hoisted(() => ({
	getPasskeyUnlockParams: vi.fn(async () => ({ credentialId: "cred", prfSalt: "salt" })),
	runCeremony: vi.fn(async (_request: unknown): Promise<unknown> => ({ id: "cred", prf: "prf", prfSalt: "salt" })),
	verifyExportCredential: vi.fn(async (_profileId: string, _credential: unknown): Promise<void> => undefined),
}))
const openToast = vi.hoisted(() => vi.fn())
vi.mock("@/utils/core", () => ({
	managers: {
		account: { exportAccount, exportResetHeldAccount },
		networkReset,
		profile: { getPasskeyUnlockParams: passkey.getPasskeyUnlockParams, verifyExportCredential: passkey.verifyExportCredential },
	},
}))
const ceremonyReject = vi.hoisted(() => vi.fn())
vi.mock("@/composables/usePasskeyCeremony", async () => {
	const { ref } = await import("vue")
	return {
		usePasskeyCeremony: () => ({ request: ref(null), runCeremony: passkey.runCeremony, onResolve: vi.fn(), onReject: ceremonyReject }),
	}
})
const downloadFile = vi.hoisted(() => vi.fn(async (_opts: { data: string; filename: string }) => undefined))
vi.mock("@/utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils")>()),
	downloadFile,
}))
vi.mock("@/wallet/services/account/client", () => ({ AccountType: { Nulo_v1: 0, Imported: 1 } }))
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
const route = vi.hoisted(() => ({ query: {} as Record<string, string> }))
vi.mock("vue-router", () => ({
	useRouter: () => router,
	useRoute: () => ({ path: "/popup/settings/security/export/account", query: route.query, meta: {} }),
}))
vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast }) }))
const surface = vi.hoisted(() => ({ toolbar: false, panel: false }))
vi.mock("@/utils/browser-surface", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/browser-surface")>()),
	isToolbarPopup: () => surface.toolbar,
	closesOnFocusLoss: () => surface.panel,
}))
const moveToOwnWindow = vi.hoisted(() => vi.fn(async (_route: string) => true))
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	moveToOwnWindow,
	leavePanelFor: async (route: string) => surface.panel && (await moveToOwnWindow(route)),
}))

import { Icon } from "@nulo/design"
import { UserRejectedError } from "@nulo/extension-messaging/errors"
import { pressOn } from "../../../../../../tests/helpers/press-key"
import { useAppStore } from "@/stores/app.store"
import SubPageHeader from "@/components/ui/SubPageHeader.vue"
import AccountExport from "./account.vue"

const wrappers: VueWrapper[] = []

function mountPage(profileType = "password", isLogined = true) {
	const w = mount(AccountExport, {
		attachTo: document.body,
		global: {
			plugins: [
				createTestingPinia({
					createSpy: vi.fn,
					initialState: {
						app: {
							isLogined,
							profile: { id: "p1", name: "Main", type: profileType },
							network: { id: "n1", chainId: 7 },
							accounts: [{ address: ADDRESS, chainId: 7, name: "Account 1", type: 0 }],
						},
					},
				}),
			],
			components: { SubPageHeader, Icon },
			stubs: {
				FilePasswordSection: {
					name: "FilePasswordSection",
					props: ["password", "repeatedPassword", "testid"],
					emits: ["update:password", "update:repeatedPassword"],
					template:
						"<div><input data-testid='file-password' @input=\"$emit('update:password', $event.target.value)\" />" +
						"<input data-testid='file-password-repeat' @input=\"$emit('update:repeatedPassword', $event.target.value)\" /></div>",
				},
				SecretUnlockSection: {
					props: ["modelValue", "error"],
					emits: ["update:modelValue", "clearError"],
					template:
						"<input data-testid='unlock-password-input' :value='modelValue' @input=\"$emit('update:modelValue', $event.target.value)\" />",
				},
				Button: { template: "<button><slot /></button>" },
				Banner: { template: "<div><slot name='title' /><slot name='description' /></div>" },
				Flex: { template: "<div><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				Icon: true,
			},
		},
	})
	wrappers.push(w)
	return w
}

async function readyStage() {
	const w = mountPage()
	await flushPromises()
	await w.get('[data-testid="agree-continue-btn"]').trigger("click")
	await w.get('[data-testid="unlock-password-input"]').setValue("password123")
	await w.get('[data-testid="unlock-submit-btn"]').trigger("click")
	await flushPromises()
	return w
}

const download = (w: VueWrapper) => w.get('[data-testid="account-download-btn"]').element as HTMLButtonElement

beforeEach(() => {
	vi.clearAllMocks()
	surface.toolbar = false
	surface.panel = false
	route.query = { address: ADDRESS }
	installChromeStorage({}, { persist: false })
})

afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

describe("account file export", () => {
	test("the ready stage asks for protection, and its Download stays disabled", async () => {
		const w = await readyStage()
		expect(exportAccount).toHaveBeenCalledExactlyOnceWith("p1", 7, ADDRESS, "password123", false)
		expect(w.get('[data-testid="account-file-ready-banner"]').text()).toContain("Protect your account file")
		expect(download(w).disabled).toBe(true)
	})

	test("a forced press at the ready stage downloads nothing", async () => {
		const w = await readyStage()
		const button = download(w)
		button.removeAttribute("disabled")
		button.click()
		await flushPromises()
		expect(downloadFile).not.toHaveBeenCalled()
	})

	test("once protected, the banner names the password in force, and Download gives out the sealed file", async () => {
		const w = await readyStage()
		await w.get('[data-testid="account-protect-btn"]').trigger("click")
		await flushPromises()
		const banner = w.get('[data-testid="account-file-protected-banner"]').text()
		expect(banner).toContain(
			"This file opens with the profile password you have now. Changing your password later does not change that.",
		)
		expect(banner).not.toContain("will be required")
		expect(download(w).disabled).toBe(false)

		download(w).click()
		await flushPromises()
		expect(downloadFile).toHaveBeenCalledExactlyOnceWith({
			data: "sealed-body",
			filename: `NuloEncryptedAccount_Main_${ADDRESS.slice(0, 10)}.txt`,
		})
	})

	test.each(["ready", "protected"] as const)("a network switch keeps a password profile's %s file", async (stage) => {
		const w = await readyStage()
		if (stage === "protected") {
			await w.get('[data-testid="account-protect-btn"]').trigger("click")
			await flushPromises()
		}
		useAppStore().network = { id: "n2", chainId: 8 } as never
		await flushPromises()
		expect(w.find(`[data-testid="account-file-${stage}-banner"]`).exists()).toBe(true)
	})

	test("a paused reset's held account is listed, exported from the journal at Create and Protect, and warned as imported", async () => {
		route.query = {}
		networkReset.getPendingReset.mockResolvedValueOnce({ networkId: "tn", running: false })
		networkReset.getStaleNetwork.mockResolvedValueOnce({ reset: { heldImported: [{ name: "Savings", address: HELD }] } })
		const w = mountPage()
		await flushPromises()
		const rows = w.findAll('[data-testid="export-account-row"]')
		expect(rows.map((r) => r.attributes("data-account-name"))).toEqual(["Account 1", "Savings"])
		await rows[1]!.trigger("click")
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		await w.get('[data-testid="unlock-password-input"]').setValue("password123")
		await w.get('[data-testid="unlock-submit-btn"]').trigger("click")
		await flushPromises()
		expect(w.text()).toContain("This file is its only backup.")
		await w.get('[data-testid="account-protect-btn"]').trigger("click")
		await flushPromises()
		expect(exportResetHeldAccount.mock.calls).toEqual([
			["p1", HELD, "password123", false],
			["p1", HELD, "password123", true],
		])
		expect(exportAccount).not.toHaveBeenCalled()
		expect(networkReset.getStaleNetwork).toHaveBeenCalledWith("tn")
	})

	test("a lock the page outlives drops the typed password and the made file: the next file starts at the agreement", async () => {
		const w = await readyStage()
		const app = useAppStore()
		app.isLogined = true
		expect(w.find('[data-testid="account-file-ready-banner"]').exists()).toBe(true)
		app.isLogined = false
		app.isLogined = true
		await flushPromises()
		expect(w.find('[data-testid="account-file-ready-banner"]').exists()).toBe(false)
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		expect((w.get('[data-testid="unlock-password-input"]').element as HTMLInputElement).value).toBe("")
	})

	test("a profile switch drops the previous profile's held rows and its flow, and reads the new profile's", async () => {
		route.query = {}
		networkReset.getPendingReset.mockResolvedValueOnce({ networkId: "tn", running: false })
		networkReset.getStaleNetwork.mockResolvedValueOnce({ reset: { heldImported: [{ name: "Savings", address: HELD }] } })
		const w = mountPage()
		await flushPromises()
		await w.findAll('[data-testid="export-account-row"]')[1]!.trigger("click")
		expect(w.find('[data-testid="agree-continue-btn"]').exists()).toBe(true)

		const app = useAppStore()
		app.profile = { id: "p2", name: "Other", type: "password" } as never
		app.accounts = []
		await flushPromises()
		expect(w.findAll('[data-testid="export-account-row"]')).toHaveLength(0)
		expect(w.find('[data-testid="agree-continue-btn"]').exists()).toBe(false)
		expect(networkReset.getPendingReset).toHaveBeenCalledTimes(2)
	})
})

describe("an account file once saved", () => {
	const banner = (w: VueWrapper) => w.get('[data-testid="account-file-protected-banner"]').text()
	const close = (w: VueWrapper) => w.find('[data-testid="account-close-btn"]')
	async function protectedStage() {
		const w = await readyStage()
		await w.get('[data-testid="account-protect-btn"]').trigger("click")
		await flushPromises()
		return w
	}
	async function saved() {
		const w = await protectedStage()
		download(w).click()
		await flushPromises()
		return w
	}

	test("the password path's download says it is saved, and Close takes Download's place and the focus", async () => {
		const w = await saved()
		expect(downloadFile).toHaveBeenCalledOnce()
		expect(banner(w)).toContain("Saved to your downloads")
		expect(banner(w)).toContain("This file opens with the profile password you have now.")
		expect(w.find('[data-testid="account-download-btn"]').exists()).toBe(false)
		expect(close(w).text()).toBe("Close")
		expect(document.activeElement).toBe(close(w).element)
	})

	test("a held Enter's repeat on Download downloads nothing", async () => {
		const w = await protectedStage()
		expect(pressOn(download(w), "Enter", { repeat: true })).toEqual([false])
		await flushPromises()
		expect(downloadFile).not.toHaveBeenCalled()
	})

	test("a failed download keeps Download File and the protected banner", async () => {
		downloadFile.mockRejectedValueOnce(new Error("blocked"))
		const w = await saved()
		expect(banner(w)).toContain("Account file is protected")
		expect(download(w).disabled).toBe(false)
		expect(close(w).exists()).toBe(false)
	})

	test("a download that settles after the flow was reset leaves the next file's flow at its start", async () => {
		let settle = () => {}
		downloadFile.mockImplementationOnce(() => new Promise<undefined>((resolve) => (settle = () => resolve(undefined))))
		const w = await protectedStage()
		download(w).click()
		useAppStore().profile = { id: "p2", name: "Other", type: "password" } as never
		await flushPromises()
		settle()
		await flushPromises()
		// The deep-linked address is selected again, so the reset flow stands at its agree step.
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		expect(w.find('[data-testid="unlock-password-input"]').exists()).toBe(true)
		expect(w.text()).not.toContain("Saved to your downloads")
	})

	test("in the toolbar popup, Close closes the popup; a held Enter's repeat does nothing", async () => {
		const closeWindow = vi.spyOn(window, "close").mockImplementation(() => {})
		surface.toolbar = true
		const w = await saved()
		expect(pressOn(close(w).element as HTMLElement, "Enter", { repeat: true })).toEqual([false])
		expect(closeWindow).not.toHaveBeenCalled()
		await close(w).trigger("click")
		await flushPromises()
		expect(closeWindow).toHaveBeenCalledOnce()
		expect(router.push).not.toHaveBeenCalled()
	})

	test("anywhere else, Close leaves as the back arrow does", async () => {
		const closeWindow = vi.spyOn(window, "close").mockImplementation(() => {})
		const w = await saved()
		await close(w).trigger("click")
		await flushPromises()
		expect(router.push).toHaveBeenCalledWith("/popup/settings/security/export")
		expect(closeWindow).not.toHaveBeenCalled()
	})
})

describe("a passkey profile's account file", () => {
	/** Past the agreement, at the file's own password: no passkey has been asked. */
	async function atPair(isLogined = true) {
		const w = mountPage("passkey", isLogined)
		await flushPromises()
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		expect(w.find('[data-testid="unlock-password-input"]').exists()).toBe(false)
		return w
	}
	const save = (w: VueWrapper) => w.get('[data-testid="account-file-save-btn"]').element as HTMLButtonElement
	const pair = (w: VueWrapper) => w.findComponent({ name: "FilePasswordSection" }).props()
	async function typeFilePassword(w: VueWrapper, password: string, repeat = password) {
		await w.get('[data-testid="file-password"]').setValue(password)
		await w.get('[data-testid="file-password-repeat"]').setValue(repeat)
	}
	async function pressSave(w: VueWrapper) {
		await w.get('[data-testid="account-file-save-btn"]').trigger("click")
		await flushPromises()
	}

	test("Agree shows the file password; Save asks the passkey, checks it, then one sealed export downloads", async () => {
		const w = await atPair()
		expect(w.find('[data-testid="account-file-confirm-passkey-btn"]').exists()).toBe(false)
		expect(passkey.runCeremony).not.toHaveBeenCalled()
		await typeFilePassword(w, "1234567")
		expect(save(w).disabled).toBe(true)
		await typeFilePassword(w, "12345678", "12345679")
		expect(save(w).disabled).toBe(true)
		await typeFilePassword(w, "12345678")
		expect(save(w).disabled).toBe(false)
		await pressSave(w)
		expect(passkey.runCeremony).toHaveBeenCalledExactlyOnceWith({
			mode: "get",
			credentialId: "cred",
			prfSalt: "salt",
			step: "accountFile",
			profileName: "Main",
		})
		expect(passkey.verifyExportCredential).toHaveBeenCalledExactlyOnceWith("p1", { passkey: ANSWER })
		expect(exportAccount).toHaveBeenCalledExactlyOnceWith("p1", 7, ADDRESS, "12345678", true, ANSWER)
		expect(downloadFile).toHaveBeenCalledExactlyOnceWith({
			data: "sealed-body",
			filename: `NuloEncryptedAccount_Main_${ADDRESS.slice(0, 10)}.txt`,
		})
		const banner = w.get('[data-testid="account-file-protected-banner"]').text()
		expect(banner).toContain("Saved to your downloads")
		expect(banner).toContain("This password will be required to import this account.")
		expect(w.find('[data-testid="account-download-btn"]').exists()).toBe(false)
		expect(document.activeElement).toBe(w.get('[data-testid="account-close-btn"]').element)
	})

	test("an invalid pair asks no passkey, by Save or by Enter", async () => {
		const w = await atPair()
		await typeFilePassword(w, "12345678", "12345679")
		await pressSave(w)
		w.get('[data-testid="file-password-repeat"]').element.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
		)
		await flushPromises()
		expect(passkey.getPasskeyUnlockParams).not.toHaveBeenCalled()
		expect(passkey.runCeremony).not.toHaveBeenCalled()
		expect(exportAccount).not.toHaveBeenCalled()
	})

	test("Enter in the file password saves, but not while a composition is open", async () => {
		const w = await atPair()
		await typeFilePassword(w, "12345678")
		const field = w.get('[data-testid="file-password"]').element
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }))
		await flushPromises()
		expect(passkey.runCeremony).not.toHaveBeenCalled()
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
		await flushPromises()
		expect(exportAccount).toHaveBeenCalledOnce()
	})

	test("the file seals under the pair typed at Save, whatever the fields hold once the card answers", async () => {
		const w = await atPair()
		await typeFilePassword(w, "12345678")
		passkey.runCeremony.mockImplementationOnce(async () => {
			await typeFilePassword(w, "edited-meanwhile")
			return ANSWER
		})
		await pressSave(w)
		expect(exportAccount).toHaveBeenCalledExactlyOnceWith("p1", 7, ADDRESS, "12345678", true, ANSWER)
	})

	test("a held row seals from the journal under the pair typed at Save", async () => {
		route.query = {}
		networkReset.getPendingReset.mockResolvedValueOnce({ networkId: "tn", running: false })
		networkReset.getStaleNetwork.mockResolvedValueOnce({ reset: { heldImported: [{ name: "Savings", address: HELD }] } })
		const w = mountPage("passkey")
		await flushPromises()
		await w.findAll('[data-testid="export-account-row"]')[1]!.trigger("click")
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		await typeFilePassword(w, "12345678")
		await pressSave(w)
		expect(exportResetHeldAccount).toHaveBeenCalledExactlyOnceWith("p1", HELD, "12345678", true, ANSWER)
		expect(exportAccount).not.toHaveBeenCalled()
	})

	test("a cancelled passkey keeps the typed pair and exports nothing", async () => {
		passkey.runCeremony.mockRejectedValueOnce(new UserRejectedError("cancelled"))
		const w = await atPair()
		await typeFilePassword(w, "12345678")
		await pressSave(w)
		expect(pair(w)).toMatchObject({ password: "12345678", repeatedPassword: "12345678" })
		expect(save(w).disabled).toBe(false)
		expect(openToast).not.toHaveBeenCalled()
		expect(exportAccount).not.toHaveBeenCalled()
	})

	test("an answer that cannot open the profile makes no file: the pair is dropped and the toast says so", async () => {
		passkey.verifyExportCredential.mockRejectedValueOnce(new Error("Passkey did not open this profile"))
		const w = await atPair()
		await typeFilePassword(w, "12345678")
		await pressSave(w)
		expect(pair(w)).toMatchObject({ password: "", repeatedPassword: "" })
		expect(openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Failed to create the file" })
		expect(exportAccount).not.toHaveBeenCalled()
	})

	test("a failed Save drops the pair, and the next Save asks the passkey again", async () => {
		exportAccount.mockRejectedValueOnce(new Error("Passkey did not open this profile"))
		const w = await atPair()
		await typeFilePassword(w, "12345678")
		const before = w.findComponent({ name: "FilePasswordSection" }).vm
		await pressSave(w)
		expect(pair(w)).toMatchObject({ password: "", repeatedPassword: "" })
		// Mounted again, so its first field takes the keyboard back.
		expect(w.findComponent({ name: "FilePasswordSection" }).vm).not.toBe(before)
		expect(save(w).disabled).toBe(true)
		expect(downloadFile).not.toHaveBeenCalled()
		expect(openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Failed to create the file" })
		await typeFilePassword(w, "12345678")
		await pressSave(w)
		expect(passkey.runCeremony).toHaveBeenCalledTimes(2)
		expect(downloadFile).toHaveBeenCalledOnce()
	})

	test("a page left open after a lock asks no passkey", async () => {
		const w = await atPair(false)
		await typeFilePassword(w, "12345678")
		await pressSave(w)
		expect(passkey.getPasskeyUnlockParams).not.toHaveBeenCalled()
		expect(exportAccount).not.toHaveBeenCalled()
	})

	test("a network switch ends the flow: the typed pair goes with it", async () => {
		const w = await atPair()
		await typeFilePassword(w, "12345678")
		const app = useAppStore()
		app.network = { id: "n2", chainId: 8 } as never
		await flushPromises()
		expect(w.find('[data-testid="account-file-save-btn"]').exists()).toBe(false)
		app.network = { id: "n1", chainId: 7 } as never
		await flushPromises()
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		expect(pair(w)).toMatchObject({ password: "", repeatedPassword: "" })
		expect(exportAccount).not.toHaveBeenCalled()
	})

	test.each(["answer", "check", "file"] as const)(
		"a passkey %s that comes back after a network switch lands nothing",
		async (pending) => {
			const held = Promise.withResolvers<string>()
			if (pending === "answer") passkey.runCeremony.mockReturnValueOnce(held.promise)
			else if (pending === "check") passkey.verifyExportCredential.mockReturnValueOnce(held.promise as Promise<never>)
			else exportAccount.mockReturnValueOnce(held.promise as Promise<"sealed-body">)
			const w = await atPair()
			await typeFilePassword(w, "12345678")
			await pressSave(w)
			useAppStore().network = { id: "n2", chainId: 8 } as never
			await flushPromises()
			held.resolve(pending === "answer" ? (ANSWER as never) : pending === "check" ? (undefined as never) : "sealed-body")
			await flushPromises()
			expect(w.find('[data-testid="account-file-protected-banner"]').exists()).toBe(false)
			expect(downloadFile).not.toHaveBeenCalled()
			if (pending !== "file") expect(exportAccount).not.toHaveBeenCalled()
		},
	)

	test("a pending file ends when the profile's unlock changes to a password, before a network switch", async () => {
		const held = Promise.withResolvers<string>()
		exportAccount.mockReturnValueOnce(held.promise as Promise<"sealed-body">)
		const w = await atPair()
		await typeFilePassword(w, "12345678")
		await pressSave(w)
		const app = useAppStore()
		app.profile = { id: "p1", name: "Main", type: "password" } as never
		await flushPromises()
		app.network = { id: "n2", chainId: 8 } as never
		await flushPromises()
		held.resolve("sealed-body")
		await flushPromises()
		expect(w.find('[data-testid="account-file-protected-banner"]').exists()).toBe(false)
		expect(downloadFile).not.toHaveBeenCalled()
	})

	test("a made file stays through a network switch", async () => {
		const w = await atPair()
		await typeFilePassword(w, "12345678")
		await pressSave(w)
		useAppStore().network = { id: "n2", chainId: 8 } as never
		await flushPromises()
		expect(w.find('[data-testid="account-file-protected-banner"]').exists()).toBe(true)
	})

	test("a lock the page outlives drops the typed file password: the next file asks its passkey again", async () => {
		const w = await atPair()
		const app = useAppStore()
		await typeFilePassword(w, "file-pass-1234")
		expect(save(w).disabled).toBe(false)
		app.isLogined = false
		app.isLogined = true
		await flushPromises()
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		expect(pair(w)).toMatchObject({ password: "", repeatedPassword: "" })
		expect(save(w).disabled).toBe(true)
		expect(passkey.runCeremony).not.toHaveBeenCalled()
	})

	test("a lock during the passkey lookup opens no prompt, and its reset cancels the page's ceremony", async () => {
		let answerLookup: (params: { credentialId: string; prfSalt: string }) => void = () => {}
		passkey.getPasskeyUnlockParams.mockImplementationOnce(() => new Promise((r) => (answerLookup = r)))
		const w = await atPair()
		const app = useAppStore()
		await typeFilePassword(w, "12345678")
		await w.get('[data-testid="account-file-save-btn"]').trigger("click")
		app.isLogined = false
		app.isLogined = true
		answerLookup({ credentialId: "cred", prfSalt: "salt" })
		await flushPromises()
		expect(passkey.runCeremony).not.toHaveBeenCalled()
		expect(ceremonyReject).toHaveBeenCalledTimes(1)
		expect(exportAccount).not.toHaveBeenCalled()
	})

	test.each([
		["another chain id", 8, 0],
		["(control) the same chain id", 7, 1],
	] as const)(
		"a lookup that settles with %s in the store asks the passkey only for the scope Save began on",
		async (_label, chainId, asks) => {
			let answerLookup: (params: { credentialId: string; prfSalt: string }) => void = () => {}
			passkey.getPasskeyUnlockParams.mockImplementationOnce(() => new Promise((r) => (answerLookup = r)))
			const w = await atPair()
			await typeFilePassword(w, "12345678")
			await w.get('[data-testid="account-file-save-btn"]').trigger("click")
			// One synchronous block: the lookup's continuation runs before the page's network watcher.
			answerLookup({ credentialId: "cred", prfSalt: "salt" })
			useAppStore().network = { id: "n1", chainId } as never
			await flushPromises()
			expect(passkey.runCeremony).toHaveBeenCalledTimes(asks)
			expect(exportAccount).toHaveBeenCalledTimes(asks)
		},
	)

	test("a lookup that settles on another chain id asks nothing, though the chain id is back before the page resumes", async () => {
		let answerLookup: (params: { credentialId: string; prfSalt: string }) => void = () => {}
		passkey.getPasskeyUnlockParams.mockImplementationOnce(() => new Promise((r) => (answerLookup = r)))
		const w = await atPair()
		await typeFilePassword(w, "12345678")
		await w.get('[data-testid="account-file-save-btn"]').trigger("click")
		const app = useAppStore()
		answerLookup({ credentialId: "cred", prfSalt: "salt" })
		// Queued before the switch, so the chain id is back before the page's watcher reads it.
		queueMicrotask(() => {
			app.network = { id: "n1", chainId: 7 } as never
		})
		app.network = { id: "n2", chainId: 8 } as never
		await flushPromises()
		expect(passkey.runCeremony).not.toHaveBeenCalled()
		expect(passkey.verifyExportCredential).not.toHaveBeenCalled()
	})

	test.each<[string, "password" | "passkey", boolean, Record<string, string>, string[][]]>([
		[
			"a passkey profile in the toolbar panel moves with its address",
			"passkey",
			true,
			{ address: ADDRESS },
			[[`/popup/settings/security/export/account?address=${ADDRESS}`]],
		],
		[
			"a passkey profile in the toolbar panel with no address moves to the page alone",
			"passkey",
			true,
			{},
			[["/popup/settings/security/export/account"]],
		],
		["a passkey profile outside the panel stays", "passkey", false, { address: ADDRESS }, []],
		["a password profile in the panel stays", "password", true, { address: ADDRESS }, []],
	])("%s", async (_label, type, inPanel, query, moves) => {
		surface.panel = inPanel
		route.query = query
		mountPage(type)
		expect(moveToOwnWindow.mock.calls).toEqual(moves)
	})

	test("a profile switch drops the typed pair: the next file asks its passkey again", async () => {
		const w = await atPair()
		await typeFilePassword(w, "12345678")
		useAppStore().profile = { id: "p2", name: "Other", type: "passkey" } as never
		await flushPromises()
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		expect(pair(w)).toMatchObject({ password: "", repeatedPassword: "" })
		expect(passkey.runCeremony).not.toHaveBeenCalled()
	})
})
