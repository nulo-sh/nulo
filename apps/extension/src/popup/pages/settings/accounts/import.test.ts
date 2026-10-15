/**
 * Account import refuses a name another account in the profile already has, as New account does:
 * the confirm step warns and neither the button nor Enter imports until the name changes.
 */
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const ADDRESS = `0x${"0b".repeat(32)}`
const account = vi.hoisted(() => ({
	previewImportAccount: vi.fn(async () => `0x${"0b".repeat(32)}`),
	importAccount: vi.fn(async () => ({ address: `0x${"0b".repeat(32)}`, name: "Imported" })),
}))
vi.mock("@/utils/core", () => ({ managers: { account } }))
vi.mock("@/utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils")>()),
	pickFile: vi.fn(async () => ({ name: "account.json", text: async () => '{"type":"nulo-account"}' })),
}))
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
vi.mock("vue-router", () => ({ useRouter: () => router, useRoute: () => ({ path: "/popup/settings/accounts/import", meta: {} }) }))
vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: vi.fn() }) }))

import ImportAccount from "./import.vue"

const wrappers: VueWrapper[] = []

async function confirmStep() {
	const w = mount(ImportAccount, {
		global: {
			plugins: [
				createTestingPinia({
					createSpy: vi.fn,
					initialState: {
						app: {
							profile: { id: "p1" },
							network: { id: "n1", chainId: 7 },
							accounts: [
								{ address: `0x${"01".repeat(32)}`, chainId: 7, name: "Account 1" },
								{ address: `0x${"02".repeat(32)}`, chainId: 7, name: "Savings", hidden: true },
							],
						},
					},
				}),
			],
			stubs: {
				CollapsingHeroLayout: { template: "<div><slot /><slot name='bottom' /></div>" },
				SettingItem: { template: "<button><slot name='description' /></button>" },
				ItemsContainer: { template: "<div><slot /></div>" },
				Input: {
					props: ["modelValue"],
					emits: ["update:modelValue"],
					template: `<label><input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></label>`,
				},
				FieldWarning: { template: "<em data-testid='name-warning'><slot /></em>" },
				Button: { template: "<button><slot /></button>" },
				Flex: { template: "<div><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				Icon: true,
			},
		},
	})
	wrappers.push(w)
	await w.get('[data-testid="import-account-pick-file"]').trigger("click")
	await flushPromises()
	await w.get('[data-testid="import-account-submit"]').trigger("click")
	await flushPromises()
	expect(w.find('[data-testid="import-account-preview-address"]').text()).toBe(ADDRESS)
	return w
}

async function nameAndEnter(w: VueWrapper, name: string) {
	await w.get('[data-testid="import-account-name-input"] input').setValue(name)
	const state = {
		warns: w.find('[data-testid="name-warning"]').exists() && w.get('[data-testid="name-warning"]').text() === "Already exist",
		disabled: w.get('[data-testid="import-account-submit"]').attributes("disabled") !== undefined,
	}
	document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
	await flushPromises()
	return state
}

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

describe("settings/accounts/import — the account name", () => {
	test.each([
		["another account's name with outer spaces", " Account 1 "],
		["a hidden account's name", "Savings"],
	])("%s warns, disables Import Account, and Enter imports nothing", async (_case, name) => {
		const w = await confirmStep()
		expect(await nameAndEnter(w, name)).toEqual({ warns: true, disabled: true })
		expect(account.importAccount).not.toHaveBeenCalled()
	})

	test("a name no account has imports on Enter", async () => {
		const w = await confirmStep()
		expect(await nameAndEnter(w, "Imported")).toEqual({ warns: false, disabled: false })
		expect(account.importAccount).toHaveBeenCalledWith("p1", 7, '{"type":"nulo-account"}', ADDRESS, "", "Imported")
	})
})
