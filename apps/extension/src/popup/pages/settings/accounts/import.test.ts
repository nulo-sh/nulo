import { Input } from "@nulo/design"
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { expectNativeAttrs } from "../../../../../tests/helpers/credential-pins"

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
const surface = vi.hoisted(() => ({
	leavePanelFor: vi.fn(async (_route: string) => false),
	ownRoute: vi.fn((): string | undefined => undefined),
	cardWindow: false,
	returnToPanel: vi.fn(async (..._args: unknown[]) => surface.cardWindow),
	closeOwnWindow: vi.fn(async () => true),
}))
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	leavePanelFor: surface.leavePanelFor,
	ownWindowRoute: surface.ownRoute,
	isCardWindow: () => surface.cardWindow,
	returnToPanel: surface.returnToPanel,
	closeOwnWindow: surface.closeOwnWindow,
}))

import { pickFile } from "@/utils"
import ImportAccount from "./import.vue"

const wrappers: VueWrapper[] = []

const InputStub = {
	props: ["modelValue"],
	emits: ["update:modelValue"],
	template: `<label><input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></label>`,
}

function mountImport({ realInput = false } = {}) {
	const w = mount(ImportAccount, {
		global: {
			components: realInput ? { Input } : {},
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
				Input: realInput ? false : InputStub,
				FieldWarning: { template: "<em data-testid='name-warning'><slot /></em>" },
				Button: { template: "<button><slot /></button>" },
				Flex: { template: "<div><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				Icon: true,
			},
		},
	})
	wrappers.push(w)
	return w
}

async function confirmStep() {
	const w = mountImport()
	await w.get(surface.cardWindow ? '[data-testid="handoff-card-choose"]' : '[data-testid="import-account-pick-file"]').trigger("click")
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
	surface.leavePanelFor.mockResolvedValue(false)
	surface.ownRoute.mockReturnValue(undefined)
	surface.cardWindow = false
	installChromeStorage({}, { persist: false })
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

	test("a name no account has imports on Enter, and the imported account does not warn against itself", async () => {
		const w = await confirmStep()
		expect(await nameAndEnter(w, "Imported")).toEqual({ warns: false, disabled: false })
		expect(account.importAccount).toHaveBeenCalledWith("p1", 7, '{"type":"nulo-account"}', ADDRESS, "", "Imported")
		expect(w.find('[data-testid="name-warning"]').exists()).toBe(false)
	})
})

test("the protected file's password field names its purpose to a password manager", async () => {
	vi.mocked(pickFile).mockResolvedValueOnce({ name: "account.nulo", text: async () => "c2VhbGVk" } as never)
	const w = mountImport({ realInput: true })
	await w.get('[data-testid="import-account-pick-file"]').trigger("click")
	await flushPromises()
	expectNativeAttrs(w, "import-account-password-input", { autocomplete: "current-password" })
})

describe("settings/accounts/import — Firefox's toolbar panel", () => {
	const pressChooseFile = async (w: VueWrapper) => {
		await w.get('[data-testid="import-account-pick-file"]').trigger("click")
		await flushPromises()
	}

	test("a press the panel hands to the page's own window opens no picker", async () => {
		surface.leavePanelFor.mockResolvedValue(true)
		await pressChooseFile(mountImport())
		expect(surface.leavePanelFor).toHaveBeenCalledWith("/popup/settings/accounts/import")
		expect(pickFile).not.toHaveBeenCalled()
	})

	test("a press that stays on the page opens the picker", async () => {
		await pressChooseFile(mountImport())
		expect(surface.leavePanelFor).toHaveBeenCalledWith("/popup/settings/accounts/import")
		expect(pickFile).toHaveBeenCalledTimes(1)
	})

	test.each([
		["an own window replaces to the account list", "/popup/settings/accounts/import", { replace: 1, back: 0 }],
		["a page with history goes back", undefined, { replace: 0, back: 1 }],
	])("after the import, %s", async (_case, ownRoute, calls) => {
		surface.ownRoute.mockReturnValue(ownRoute)
		const length = vi.spyOn(window.history, "length", "get").mockReturnValue(3)
		try {
			const w = await confirmStep()
			await nameAndEnter(w, "Imported")
			expect({ replace: router.replace.mock.calls.length, back: router.back.mock.calls.length }).toEqual(calls)
			if (calls.replace) expect(router.replace).toHaveBeenCalledWith("/popup/settings/accounts")
		} finally {
			length.mockRestore()
		}
	})
})

describe("settings/accounts/import — the hand-off window", () => {
	beforeEach(() => {
		surface.cardWindow = true
	})

	test("shows only the card until a file is picked; a cancelled picker keeps it", async () => {
		const w = mountImport()
		expect(w.get('[data-testid="handoff-card"]').text()).toContain("Pick the account file")
		expect(w.find('[data-testid="import-account-pick-file"]').exists()).toBe(false)

		vi.mocked(pickFile).mockRejectedValueOnce(new Error("canceled"))
		await w.get('[data-testid="handoff-card-choose"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="handoff-card"]').exists()).toBe(true)

		await w.get('[data-testid="handoff-card-choose"]').trigger("click")
		await flushPromises()
		expect(surface.leavePanelFor).not.toHaveBeenCalled()
		expect(w.find('[data-testid="handoff-card"]').exists()).toBe(false)
		expect(w.get('[data-testid="import-account-submit"]').text()).toBe("Continue")
	})

	test("a refused file shows the page with its error and its own file row", async () => {
		const { FileTooLargeError } = await import("@/utils")
		vi.mocked(pickFile).mockRejectedValueOnce(new FileTooLargeError(256 * 1024))
		const w = mountImport()
		await w.get('[data-testid="handoff-card-choose"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="handoff-card"]').exists()).toBe(false)
		expect(w.get('[data-testid="import-account-error"]').text()).toBe("Account file is too large.")
		expect(w.find('[data-testid="import-account-pick-file"]').exists()).toBe(true)
	})

	test("the import hands 'Account imported' back to the account list, for the profile it imported into", async () => {
		const w = await confirmStep()
		await nameAndEnter(w, "Imported")
		expect(surface.returnToPanel).toHaveBeenCalledWith("/popup/settings/accounts", {
			snack: { kind: "success", label: "Account imported" },
			profileId: "p1",
		})
		expect(router.replace).not.toHaveBeenCalled()
		expect(router.back).not.toHaveBeenCalled()
	})

	test("Cancel closes the window through the own window's way back", async () => {
		const w = mountImport()
		await w.get('[data-testid="handoff-card-cancel"]').trigger("click")
		await flushPromises()
		expect(surface.closeOwnWindow).toHaveBeenCalledTimes(1)
		expect(pickFile).not.toHaveBeenCalled()
	})
})
