/**
 * The account export page gives out only the password-protected file: the plain body Create fetches
 * never reaches a download.
 */
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const ADDRESS = `0x${"0a".repeat(32)}`
const exportAccount = vi.hoisted(() =>
	vi.fn(async (_profileId: string, _chainId: number, _address: string, _password: string, encrypt: boolean) =>
		encrypt ? "sealed-body" : "plain-body",
	),
)
vi.mock("@/utils/core", () => ({ managers: { account: { exportAccount } } }))
const downloadFile = vi.hoisted(() => vi.fn(async (_opts: { data: string; filename: string }) => undefined))
vi.mock("@/utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils")>()),
	downloadFile,
}))
vi.mock("@/wallet/services/account/client", () => ({ AccountType: { Nulo_v1: 0, Imported: 1 } }))
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
vi.mock("vue-router", () => ({
	useRouter: () => router,
	useRoute: () => ({ path: "/popup/settings/security/export/account", query: { address: ADDRESS }, meta: {} }),
}))
vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: vi.fn() }) }))

import { Icon } from "@nulo/design"
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
	const c = (globalThis as { chrome?: { storage: Record<string, unknown> } }).chrome
	if (c) {
		c.storage.local = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }
		c.storage.onChanged = { addListener: vi.fn(), removeListener: vi.fn() }
	}
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

	test("once protected, Download gives out the sealed file", async () => {
		const w = await readyStage()
		await w.get('[data-testid="account-protect-btn"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="account-file-protected-banner"]').exists()).toBe(true)
		expect(download(w).disabled).toBe(false)

		download(w).click()
		await flushPromises()
		expect(downloadFile).toHaveBeenCalledExactlyOnceWith({
			data: "sealed-body",
			filename: `NuloEncryptedAccount_Main_${ADDRESS.slice(0, 10)}.txt`,
		})
	})

	test("a passkey profile is sent back to the export choices", async () => {
		mountPage("passkey")
		await flushPromises()
		expect(router.replace).toHaveBeenCalledWith("/popup/settings/security/export")
	})
})
