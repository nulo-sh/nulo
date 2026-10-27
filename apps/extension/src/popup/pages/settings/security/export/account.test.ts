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

import { Icon } from "@nulo/design"
import { UserRejectedError } from "@nulo/extension-messaging/errors"
import { useAppStore } from "@/stores/app.store"
import SubPageHeader from "@/components/ui/SubPageHeader.vue"
import AccountExport from "./account.vue"

const wrappers: VueWrapper[] = []

function mountPage(profileType = "password") {
	const w = mount(AccountExport, {
		attachTo: document.body,
		global: {
			plugins: [
				createTestingPinia({
					createSpy: vi.fn,
					initialState: {
						app: {
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

describe("a passkey profile's account file", () => {
	async function approved() {
		const w = mountPage("passkey")
		await flushPromises()
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		expect(w.find('[data-testid="unlock-password-input"]').exists()).toBe(false)
		await w.get('[data-testid="account-file-confirm-passkey-btn"]').trigger("click")
		await flushPromises()
		return w
	}
	const save = (w: VueWrapper) => w.get('[data-testid="account-file-save-btn"]').element as HTMLButtonElement
	async function typeFilePassword(w: VueWrapper, password: string, repeat = password) {
		await w.get('[data-testid="file-password"]').setValue(password)
		await w.get('[data-testid="file-password-repeat"]').setValue(repeat)
	}

	test("its passkey approves, then one sealed export under the file password downloads", async () => {
		const w = await approved()
		expect(passkey.runCeremony).toHaveBeenCalledExactlyOnceWith({
			mode: "get",
			credentialId: "cred",
			prfSalt: "salt",
			step: "accountFile",
			profileName: "Main",
		})
		await typeFilePassword(w, "1234567")
		expect(save(w).disabled).toBe(true)
		await typeFilePassword(w, "12345678", "12345679")
		expect(save(w).disabled).toBe(true)
		await typeFilePassword(w, "12345678")
		expect(save(w).disabled).toBe(false)
		await w.get('[data-testid="account-file-save-btn"]').trigger("click")
		await flushPromises()
		expect(passkey.verifyExportCredential).toHaveBeenCalledExactlyOnceWith("p1", { passkey: ANSWER })
		expect(exportAccount).toHaveBeenCalledExactlyOnceWith("p1", 7, ADDRESS, "12345678", true, ANSWER)
		expect(downloadFile).toHaveBeenCalledExactlyOnceWith({
			data: "sealed-body",
			filename: `NuloEncryptedAccount_Main_${ADDRESS.slice(0, 10)}.txt`,
		})
		expect(w.get('[data-testid="account-file-protected-banner"]').text()).toContain(
			"This password will be required to import this account.",
		)
	})

	test("Enter in the file password saves, but not while a composition is open", async () => {
		const w = await approved()
		await typeFilePassword(w, "12345678")
		const field = w.get('[data-testid="file-password"]').element
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }))
		await flushPromises()
		expect(exportAccount).not.toHaveBeenCalled()
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
		await flushPromises()
		expect(exportAccount).toHaveBeenCalledOnce()
	})

	test("a cancelled passkey leaves the page at its button and exports nothing", async () => {
		passkey.runCeremony.mockRejectedValueOnce(new UserRejectedError("cancelled"))
		const w = await approved()
		expect(w.find('[data-testid="account-file-confirm-passkey-btn"]').exists()).toBe(true)
		expect(w.find('[data-testid="file-password"]').exists()).toBe(false)
		expect(exportAccount).not.toHaveBeenCalled()
	})

	test("an answer that cannot open the profile is refused at its prompt, with the passkey failure line", async () => {
		passkey.verifyExportCredential.mockRejectedValueOnce(new Error("Passkey did not open this profile"))
		const w = await approved()
		expect(w.find('[data-testid="account-file-confirm-passkey-btn"]').exists()).toBe(true)
		expect(w.find('[data-testid="file-password"]').exists()).toBe(false)
		expect(openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Couldn't unlock. Try again." })
		expect(exportAccount).not.toHaveBeenCalled()
	})

	test("a failed Save drops the answer: the page is back at its passkey button, and the next file asks again", async () => {
		exportAccount.mockRejectedValueOnce(new Error("Passkey did not open this profile"))
		const w = await approved()
		await typeFilePassword(w, "12345678")
		await w.get('[data-testid="account-file-save-btn"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="account-file-save-btn"]').exists()).toBe(false)
		expect(w.find('[data-testid="file-password"]').exists()).toBe(false)
		expect(downloadFile).not.toHaveBeenCalled()
		expect(document.activeElement).toBe(w.get('[data-testid="account-file-confirm-passkey-btn"]').element)
		await w.get('[data-testid="account-file-confirm-passkey-btn"]').trigger("click")
		await flushPromises()
		expect(passkey.runCeremony).toHaveBeenCalledTimes(2)
		expect(w.find('[data-testid="file-password"]').exists()).toBe(true)
	})

	test("a network switch ends the flow: the approval goes with it, and switching back asks the passkey again", async () => {
		const w = await approved()
		await typeFilePassword(w, "12345678")
		const app = useAppStore()
		app.network = { id: "n2", chainId: 8 } as never
		await flushPromises()
		expect(w.find('[data-testid="account-file-save-btn"]').exists()).toBe(false)
		app.network = { id: "n1", chainId: 7 } as never
		await flushPromises()
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		expect(w.find('[data-testid="account-file-confirm-passkey-btn"]').exists()).toBe(true)
		expect(w.find('[data-testid="file-password"]').exists()).toBe(false)
		expect(exportAccount).not.toHaveBeenCalled()
	})

	test.each(["answer", "check", "file"] as const)(
		"a passkey %s that comes back after a network switch lands nothing",
		async (pending) => {
			const held = Promise.withResolvers<string>()
			if (pending === "answer") passkey.runCeremony.mockReturnValueOnce(held.promise)
			else if (pending === "check") passkey.verifyExportCredential.mockReturnValueOnce(held.promise as Promise<never>)
			else exportAccount.mockReturnValueOnce(held.promise as Promise<"sealed-body">)
			const w = await approved()
			if (pending === "file") {
				await typeFilePassword(w, "12345678")
				await w.get('[data-testid="account-file-save-btn"]').trigger("click")
				await flushPromises()
			}
			useAppStore().network = { id: "n2", chainId: 8 } as never
			await flushPromises()
			held.resolve(pending === "answer" ? (ANSWER as never) : pending === "check" ? (undefined as never) : "sealed-body")
			await flushPromises()
			expect(w.find('[data-testid="file-password"]').exists()).toBe(false)
			expect(w.find('[data-testid="account-file-protected-banner"]').exists()).toBe(false)
			expect(downloadFile).not.toHaveBeenCalled()
		},
	)

	test("a pending file ends when the profile's unlock changes to a password, before a network switch", async () => {
		const held = Promise.withResolvers<string>()
		exportAccount.mockReturnValueOnce(held.promise as Promise<"sealed-body">)
		const w = await approved()
		await typeFilePassword(w, "12345678")
		await w.get('[data-testid="account-file-save-btn"]').trigger("click")
		await flushPromises()
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
		const w = await approved()
		await typeFilePassword(w, "12345678")
		await w.get('[data-testid="account-file-save-btn"]').trigger("click")
		await flushPromises()
		useAppStore().network = { id: "n2", chainId: 8 } as never
		await flushPromises()
		expect(w.find('[data-testid="account-file-protected-banner"]').exists()).toBe(true)
	})

	test("a lock the page outlives drops the approval and the typed file password: the next file asks its passkey again", async () => {
		const w = await approved()
		const app = useAppStore()
		app.isLogined = true
		await typeFilePassword(w, "file-pass-1234")
		expect(save(w).disabled).toBe(false)
		app.isLogined = false
		app.isLogined = true
		await flushPromises()
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		await w.get('[data-testid="account-file-confirm-passkey-btn"]').trigger("click")
		await flushPromises()
		expect(passkey.runCeremony).toHaveBeenCalledTimes(2)
		expect(w.findComponent({ name: "FilePasswordSection" }).props()).toMatchObject({ password: "", repeatedPassword: "" })
		expect(save(w).disabled).toBe(true)
	})

	test("a lock during the passkey lookup opens no prompt; one while the prompt is up closes it", async () => {
		let answerLookup: (params: { credentialId: string; prfSalt: string }) => void = () => {}
		passkey.getPasskeyUnlockParams.mockImplementationOnce(() => new Promise((r) => (answerLookup = r)))
		const w = mountPage("passkey")
		await flushPromises()
		const app = useAppStore()
		app.isLogined = true
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		await w.get('[data-testid="account-file-confirm-passkey-btn"]').trigger("click")
		app.isLogined = false
		app.isLogined = true
		answerLookup({ credentialId: "cred", prfSalt: "salt" })
		await flushPromises()
		expect(passkey.runCeremony).not.toHaveBeenCalled()
		expect(ceremonyReject).toHaveBeenCalledTimes(1)
	})

	test("a profile switch drops the approval: the next file asks its passkey again", async () => {
		const w = await approved()
		expect(w.find('[data-testid="file-password"]').exists()).toBe(true)
		useAppStore().profile = { id: "p2", name: "Other", type: "passkey" } as never
		await flushPromises()
		await w.get('[data-testid="agree-continue-btn"]').trigger("click")
		expect(w.find('[data-testid="account-file-confirm-passkey-btn"]').exists()).toBe(true)
		expect(w.find('[data-testid="file-password"]').exists()).toBe(false)
	})
})
