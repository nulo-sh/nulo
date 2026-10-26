import { Input } from "@nulo/design"
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { toBase64 } from "@nulo/wallet-core/utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { expectNativeAttrs } from "../../../../../tests/helpers/credential-pins"

const ADDRESS = `0x${"0b".repeat(32)}`
/** The shape of a protected account file: a version byte 0, an IV and a GCM tag at the least. */
const SEALED = toBase64(new Uint8Array(29))
const account = vi.hoisted(() => ({
	previewImportAccount: vi.fn(async () => `0x${"0b".repeat(32)}`),
	importAccount: vi.fn(async () => ({ address: `0x${"0b".repeat(32)}`, profileId: "p1", chainId: 7, name: "Imported" })),
}))
const uiPreference = vi.hoisted(() => ({ setSelectedAccount: vi.fn(async () => true) }))
vi.mock("@/utils/core", () => ({ managers: { account, uiPreference } }))
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
import { useAppStore } from "@/stores/app.store"
import ImportAccount from "./import.vue"

const wrappers: VueWrapper[] = []

const InputStub = {
	props: ["modelValue"],
	emits: ["update:modelValue"],
	template: `<label><input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></label>`,
}

function mountImport({ realInput = false, extraAccounts = [] as Array<Record<string, unknown>> } = {}) {
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
								{ address: `0x${"01".repeat(32)}`, profileId: "p1", chainId: 7, name: "Account 1" },
								{ address: `0x${"02".repeat(32)}`, profileId: "p1", chainId: 7, name: "Savings", hidden: true },
								...extraAccounts,
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
	vi.mocked(pickFile).mockResolvedValueOnce({ name: "account.nulo", text: async () => SEALED } as never)
	const w = mountImport({ realInput: true })
	await w.get('[data-testid="import-account-pick-file"]').trigger("click")
	await flushPromises()
	expectNativeAttrs(w, "import-account-password-input", { autocomplete: "current-password" })
})

describe("settings/accounts/import — a file the page cannot open", () => {
	const pickBody = (w: VueWrapper, text: string, name = "account.txt") => {
		vi.mocked(pickFile).mockResolvedValueOnce({ name, text: async () => text } as never)
		return w.get('[data-testid="import-account-pick-file"]').trigger("click").then(flushPromises)
	}

	test("a protected file whose preview fails with an empty message shows the one refusal line", async () => {
		account.previewImportAccount.mockRejectedValueOnce(new Error(""))
		const w = mountImport()
		await pickBody(w, SEALED)
		await w.get('[data-testid="import-account-password-input"] input').setValue("typed-for-this-file")
		await w.get('[data-testid="import-account-submit"]').trigger("click")
		await flushPromises()
		expect(w.get('[data-testid="import-account-error"]').text()).toBe("Wrong file password, or the file is damaged.")
	})

	test("a re-pick clears the password typed for the previous file, and its refusal", async () => {
		account.previewImportAccount.mockRejectedValueOnce(new Error("Wrong file password, or the file is damaged."))
		const w = mountImport()
		await pickBody(w, SEALED)
		await w.get('[data-testid="import-account-password-input"] input').setValue("typed-for-the-first-file")
		await w.get('[data-testid="import-account-submit"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="import-account-error"]').exists()).toBe(true)

		await pickBody(w, toBase64(new Uint8Array(30)), "other.txt")
		expect((w.get('[data-testid="import-account-password-input"] input').element as HTMLInputElement).value).toBe("")
		expect(w.find('[data-testid="import-account-error"]').exists()).toBe(false)
		expect(w.get('[data-testid="import-account-submit"]').attributes("disabled")).toBeDefined()
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
		await flushPromises()
		expect(account.previewImportAccount).toHaveBeenCalledTimes(1)
	})

	test.each([
		["an empty file", "  \n", "The file is empty."],
		["the wallet's full backup", "nulo:full-backup:v2:AAAA", "This is a full backup. Restore it from Import profile > Full Backup."],
		["a file that is neither JSON nor base64", "\u0089PNG\r\n\u001a\n", "This is not an account file, or it is damaged."],
		["base64 too short to be a protected file", "AAAA", "This is not an account file, or it is damaged."],
	])("%s is refused at pick, with no password asked and nothing to submit", async (_case, body, line) => {
		const w = mountImport()
		await pickBody(w, SEALED)
		await w.get('[data-testid="import-account-password-input"] input').setValue("typed-for-the-first-file")
		await pickBody(w, body, "picked.txt")
		expect(w.get('[data-testid="import-account-error"]').text()).toBe(line)
		expect(w.find('[data-testid="import-account-password-input"]').exists()).toBe(false)
		expect(w.get('[data-testid="import-account-submit"]').attributes("disabled")).toBeDefined()
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
		await flushPromises()
		expect(account.previewImportAccount).not.toHaveBeenCalled()
	})

	test("a protected file still reaches the password step", async () => {
		const w = mountImport()
		await pickBody(w, SEALED)
		expect(w.find('[data-testid="import-account-error"]').exists()).toBe(false)
		expect(w.find('[data-testid="import-account-password-input"]').exists()).toBe(true)
	})
})

describe("settings/accounts/import — an account the wallet already holds", () => {
	const HELD = `0x${"01".repeat(32)}`
	const COVERAGE = "This account is not covered by your recovery phrase. Keep its file safe."

	test("its preview names it held, drops the coverage sentence and keeps Import Account disabled", async () => {
		account.previewImportAccount.mockResolvedValueOnce(HELD)
		const w = mountImport()
		await w.get('[data-testid="import-account-pick-file"]').trigger("click")
		await flushPromises()
		await w.get('[data-testid="import-account-submit"]').trigger("click")
		await flushPromises()
		expect(w.get('[data-testid="import-account-held"]').text()).toBe("This account is already in your wallet.")
		expect(w.text()).not.toContain(COVERAGE)
		expect(await nameAndEnter(w, "A fresh name")).toEqual({ warns: false, disabled: true })
		expect(account.importAccount).not.toHaveBeenCalled()
	})

	test("a new address keeps the coverage sentence and imports once named, and the import does not mark it held", async () => {
		surface.cardWindow = true
		const w = await confirmStep()
		expect(w.find('[data-testid="import-account-held"]').exists()).toBe(false)
		expect(w.text()).toContain(COVERAGE)
		expect(await nameAndEnter(w, "Imported")).toEqual({ warns: false, disabled: false })
		expect(account.importAccount).toHaveBeenCalledTimes(1)
		expect(w.find('[data-testid="import-account-held"]').exists()).toBe(false)
	})

	test("a profile another window switches to voids the preview, which re-runs in that profile", async () => {
		account.previewImportAccount.mockResolvedValueOnce(HELD)
		const w = mountImport()
		await w.get('[data-testid="import-account-pick-file"]').trigger("click")
		await flushPromises()
		await w.get('[data-testid="import-account-submit"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="import-account-held"]').exists()).toBe(true)

		// The switch publishes the profile before its account list: the previous profile's rows are
		// still in the store when the preview below resolves.
		useAppStore().profile = { id: "p2" } as never
		await flushPromises()
		expect(w.find('[data-testid="import-account-preview"]').exists()).toBe(false)
		expect(w.find('[data-testid="import-account-held"]').exists()).toBe(false)

		account.previewImportAccount.mockResolvedValueOnce(HELD)
		await w.get('[data-testid="import-account-submit"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="import-account-held"]').exists()).toBe(false)
		expect(w.text()).toContain(COVERAGE)
	})

	test.each([
		["another chain", { profileId: "p1", chainId: 8 }],
		["another profile", { profileId: "p0", chainId: 7 }],
	])("the same address on %s is not held", async (_case, scope) => {
		account.previewImportAccount.mockResolvedValueOnce(`0x${"03".repeat(32)}`)
		const w = mountImport({ extraAccounts: [{ address: `0x${"03".repeat(32)}`, ...scope, name: "Elsewhere" }] })
		await w.get('[data-testid="import-account-pick-file"]').trigger("click")
		await flushPromises()
		await w.get('[data-testid="import-account-submit"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="import-account-held"]').exists()).toBe(false)
		expect(w.text()).toContain(COVERAGE)
	})
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

	test("an empty file shows the page with the file it named, as outside the window", async () => {
		vi.mocked(pickFile).mockResolvedValueOnce({ name: "empty.json", text: async () => "  " } as never)
		const w = mountImport()
		await w.get('[data-testid="handoff-card-choose"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="handoff-card"]').exists()).toBe(false)
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
