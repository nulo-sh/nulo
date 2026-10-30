import { Flex, Icon, Input, Text } from "@nulo/design"
import { mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import { boundAttr, declarationsOf, elementByTestid, parseSource } from "../../../../scripts/type-roles/source-scan"
import { expectMaskToggle, expectNativeAttrs, nativeInput, pasteInto } from "../../../../tests/helpers/credential-pins"
import { COLLAPSING_HERO } from "../collapsing-hero"
import ImportFullBackupForm from "./ImportFullBackupForm.vue"

const stubs = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i></i>" },
	Transition: { template: "<div><slot /></div>" },
	ItemsContainer: { template: "<div><slot /></div>" },
	SettingItem: {
		inheritAttrs: false,
		props: ["title", "description", "iconBgColor", "disabled"],
		emits: ["click"],
		// Forward $attrs so the production `data-testid` (and any future attrs)
		// reach the rendered root element, matching how Vue inherits attrs on
		// the real component.
		template:
			'<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')">{{ title }} | {{ description }} | {{ iconBgColor }}</button>',
	},
	Input: {
		props: ["modelValue", "label", "placeholder", "type", "error", "maxLength", "autofocus"],
		emits: ["update:modelValue", "input"],
		template: `<label><span>{{ label }}</span><input :value="modelValue" :placeholder="placeholder" :type="type" @input="$emit('update:modelValue', $event.target.value); $emit('input', $event)" /></label>`,
	},
}

const baseProps = (over = {}) => ({
	selectedBackup: null,
	restoreStatus: "",
	isRestoreHasErrors: false,
	error: { type: "", title: "", tooltip: "" },
	isCopied: false,
	maxPasswordLength: 128,
	...over,
})

describe("ImportFullBackupForm", () => {
	it("renders a file picker whose hint names the .gz the export writes and the older shapes", () => {
		const wrapper = mount(ImportFullBackupForm, { props: baseProps(), global: { stubs } })
		expect(wrapper.text()).toContain("Choose a backup file")
		expect(wrapper.text()).toContain("Select a .gz, .json or .txt file")
		expect(wrapper.find("[data-testid=import-full-backup-error]").exists()).toBe(false)
	})

	it("emits pickFile when the picker row is clicked", async () => {
		const wrapper = mount(ImportFullBackupForm, { props: baseProps(), global: { stubs } })
		await wrapper.find("[data-testid=import-full-backup-pick-file]").trigger("click")
		expect(wrapper.emitted("pickFile")).toBeTruthy()
	})

	it("disables the picker while a restore is in progress", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({ restoreStatus: "progress" }),
			global: { stubs },
		})
		expect(wrapper.find("[data-testid=import-full-backup-pick-file]").attributes("disabled")).toBeDefined()
	})

	it("shows the full_backup error banner when error.type='full_backup'", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({ error: { type: "full_backup", title: "Bad backup", tooltip: "broken" } }),
			global: { stubs },
		})
		const box = wrapper.get("[data-testid=import-full-backup-error]")
		expect(box.text()).toContain("Error")
		expect(box.text()).toContain("Bad backup")
		expect(box.text()).toContain("broken")
	})

	it("includes both title and tooltip text inside the error banner", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({ error: { type: "full_backup", title: "Bad", tooltip: "Some detail" } }),
			global: { stubs },
		})
		expect(wrapper.text()).toContain("Bad")
		expect(wrapper.text()).toContain("Some detail")
	})

	it("shows the decryption-password section when the backup is encrypted with no profileType", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({ selectedBackup: { name: "x.txt", backup: "blob", kind: "sealed", profileType: null } }),
			global: { stubs },
		})
		expect(wrapper.text()).toContain("Decryption Password")
	})

	it("shows the new-password section for password-typed backups before restore starts", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({
				selectedBackup: { name: "x.json", backup: {}, kind: "plain", profileType: "password" },
				restoreStatus: "",
			}),
			global: { stubs },
		})
		expect(wrapper.text()).toContain("How you'll unlock Nulo")
	})

	it("hides the new-password section once restore is finished", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({
				selectedBackup: { name: "x.json", backup: {}, kind: "plain", profileType: "password" },
				restoreStatus: "finished",
			}),
			global: { stubs },
		})
		expect(wrapper.text()).not.toContain("How you'll unlock Nulo")
	})

	it("shows the restore-with-errors warning when restoreStatus='finished' and isRestoreHasErrors", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({
				selectedBackup: { name: "x.json", backup: {}, kind: "plain", profileType: "password" },
				restoreStatus: "finished",
				isRestoreHasErrors: true,
			}),
			global: { stubs },
		})
		expect(wrapper.text()).toContain("Warning")
		expect(wrapper.text()).toContain("import completed with some errors")
	})

	it("writes the warning in the theme's warning text colour", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({ restoreStatus: "finished", isRestoreHasErrors: true, unrestoredNetworks: ["Testnet"] }),
			global: { stubs: { ...stubs, Text } },
		})
		const sentence = wrapper.get("[data-testid=import-full-backup-warning]").findAllComponents(Text).at(-1)
		expect(sentence?.classes()).toContain("color--txt-warning")
		expect(sentence?.classes()).not.toContain("color--yellow")
	})

	it("a passkey-made backup opens on Passkey, switchable to the password fields", async () => {
		const props = baseProps({
			selectedBackup: { name: "x.txt", backup: "blob", kind: "sealed", profileType: "passkey" },
			unlockMethod: "passkey",
		})
		const wrapper = mount(ImportFullBackupForm, { props, global: { stubs } })
		expect(wrapper.get("[data-testid=import-full-backup-method-passkey]").attributes("aria-selected")).toBe("true")
		expect(wrapper.find("[data-testid=unlock-method-passkey-note]").exists()).toBe(true)
		expect(wrapper.find("[data-testid=import-full-backup-password-input]").exists()).toBe(false)
		await wrapper.get("[data-testid=import-full-backup-method-password]").trigger("click")
		expect(wrapper.emitted("update:unlockMethod")).toEqual([["password"]])
		await wrapper.setProps({ unlockMethod: "password" })
		expect(wrapper.find("[data-testid=import-full-backup-password-input]").exists()).toBe(true)
	})

	it("a page restoring into the open profile asks for no new password", () => {
		const props = baseProps({ selectedBackup: { name: "x.json", backup: {}, kind: "plain", profileType: "password" } })
		expect(mount(ImportFullBackupForm, { props, global: { stubs } }).text()).toContain("How you'll unlock Nulo")
		const own = mount(ImportFullBackupForm, { props: { ...props, askNewPassword: false }, global: { stubs } })
		expect(own.text()).not.toContain("How you'll unlock Nulo")
		expect(own.find("[data-testid=import-full-backup-password-input]").exists()).toBe(false)
	})

	it("a page's own warning replaces the worded one", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({ restoreStatus: "finished", isRestoreHasErrors: true, warningText: "Testnet couldn't be restored." }),
			global: { stubs },
		})
		expect(wrapper.get("[data-testid=import-full-backup-warning]").text()).toContain("Testnet couldn't be restored.")
		expect(wrapper.text()).not.toContain("import completed with some errors")
	})

	it("names the networks a Retry replays in the warning", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({
				restoreStatus: "finished",
				isRestoreHasErrors: true,
				unrestoredNetworks: ["Alpha V5", "Testnet"],
				hasOtherErrors: true,
			}),
			global: { stubs },
		})
		expect(wrapper.get("[data-testid=import-full-backup-warning]").text()).toContain(
			"Alpha V5 and Testnet didn't answer in time, so what was saved for them may not be restored. You can retry, review the details, or continue.",
		)
	})

	it("names the imported accounts a restore held when they are the only errors", () => {
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({
				restoreStatus: "finished",
				isRestoreHasErrors: true,
				hasOtherErrors: true,
				heldAccounts: [{ name: "Savings", chainId: 1337 }],
			}),
			global: { stubs },
		})
		expect(wrapper.get("[data-testid=import-full-backup-warning]").text()).toContain(
			"Profile import completed with some errors. The imported account “Savings” was not restored. Add the network with chain ID 1337 to restore it, or import it again from its account file. Turn on Developer Mode in Settings to add a network. You can review the details or continue.",
		)
	})

	it("scrolls the warning into view once, as it appears, and marks it an alert", async () => {
		const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
		try {
			const wrapper = mount(ImportFullBackupForm, { props: baseProps({ restoreStatus: "progress" }), global: { stubs } })
			expect(scroll).not.toHaveBeenCalled()

			await wrapper.setProps({ restoreStatus: "finished", isRestoreHasErrors: true, unrestoredNetworks: ["Alpha V5"] })
			const warning = wrapper.get("[data-testid=import-full-backup-warning]")
			expect(warning.attributes("role")).toBe("alert")
			expect(scroll).toHaveBeenCalledOnce()
			expect(scroll).toHaveBeenCalledWith({ block: "nearest" })
			expect(scroll.mock.contexts[0]).toBe(warning.element)

			await wrapper.setProps({ unrestoredNetworks: [] })
			expect(scroll).toHaveBeenCalledOnce()
		} finally {
			scroll.mockRestore()
		}
	})

	it("hands the warning to an enclosing collapsing hero instead of scrolling it itself", async () => {
		const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
		const reveal = vi.fn()
		try {
			const wrapper = mount(ImportFullBackupForm, {
				props: baseProps({ restoreStatus: "progress" }),
				global: { stubs, provide: { [COLLAPSING_HERO as symbol]: { reveal } } },
			})
			await wrapper.setProps({ restoreStatus: "finished", isRestoreHasErrors: true })
			expect(reveal).toHaveBeenCalledOnce()
			expect(reveal).toHaveBeenCalledWith(wrapper.get("[data-testid=import-full-backup-warning]").element)
			expect(scroll).not.toHaveBeenCalled()
		} finally {
			scroll.mockRestore()
		}
	})

	it("reveals the warning again when a failed Retry adds its line above the buttons", async () => {
		const reveal = vi.fn()
		const wrapper = mount(ImportFullBackupForm, {
			props: baseProps({ restoreStatus: "finished", isRestoreHasErrors: true }),
			global: { stubs, provide: { [COLLAPSING_HERO as symbol]: { reveal } } },
		})
		reveal.mockClear()

		await wrapper.setProps({ retryFailedAgain: true })

		expect(reveal).toHaveBeenCalledExactlyOnceWith(wrapper.get("[data-testid=import-full-backup-warning]").element)
	})
})

/** A typed network name is one word of up to 25 characters; a backup's held account name, of up to 32. */
describe("ImportFullBackupForm — a long name stays inside the warning", () => {
	it("the warning carries the whole name, and its block breaks a word wider than itself anywhere", () => {
		const finished = { restoreStatus: "finished", isRestoreHasErrors: true }
		const network = mount(ImportFullBackupForm, {
			props: baseProps({ ...finished, unrestoredNetworks: ["W".repeat(25)] }),
			global: { stubs },
		})
		expect(network.get("[data-testid=import-full-backup-warning]").text()).toContain(`${"W".repeat(25)} didn't answer in time`)
		const held = mount(ImportFullBackupForm, {
			props: baseProps({ ...finished, hasOtherErrors: true, heldAccounts: [{ name: "W".repeat(32), chainId: 1337 }] }),
			global: { stubs },
		})
		expect(held.get("[data-testid=import-full-backup-warning]").text()).toContain(
			`The imported account “${"W".repeat(32)}” was not restored.`,
		)

		const parsed = parseSource("apps/extension/src/components/composite/import/ImportFullBackupForm.vue")
		const block = elementByTestid(parsed, "import-full-backup-warning")?.node
		expect(block && boundAttr(block, "class")).toBe("$style.warning_block")
		expect(declarationsOf(parsed, ".warning_block")).toEqual({ padding: "8px", "overflow-wrap": "anywhere" })
	})
})

describe("ImportFullBackupForm — credential controls, real Input", () => {
	const mounted: VueWrapper[] = []
	afterEach(() => {
		for (const w of mounted.splice(0)) w.unmount()
	})
	const mountReal = (selectedBackup: Record<string, unknown>) => {
		const w = mount(ImportFullBackupForm, {
			props: baseProps({ selectedBackup }),
			attachTo: document.body,
			global: {
				components: { Flex, Icon, Input, Text },
				stubs: { ItemsContainer: stubs.ItemsContainer, SettingItem: stubs.SettingItem, Transition: stubs.Transition },
			},
		})
		mounted.push(w)
		return w
	}
	const ENCRYPTED = { name: "b.txt", kind: "sealed", profileType: null }
	const PASSWORD = { name: "b.json", kind: "plain", profileType: "password" }
	const DECRYPT = "import-full-backup-decrypt-password-input"
	const PAIR = ["import-full-backup-password-input", "import-full-backup-password-confirm-input"]

	it("the decrypt field: its own toggle, focused on mount, autocomplete current-password", async () => {
		const w = mountReal(ENCRYPTED)
		expect(document.activeElement).toBe(nativeInput(w, DECRYPT))
		expectNativeAttrs(w, DECRYPT, { autocomplete: "current-password", autocapitalize: null, autocorrect: null })
		await expectMaskToggle(w, {
			toggle: "import-full-backup-decrypt-password-input-visibility-toggle",
			field: DECRYPT,
			drives: [DECRYPT],
		})
	})

	it("the new-password pair: one toggle for both, nothing focused, autocomplete new-password, paste capped at 128", async () => {
		const w = mountReal(PASSWORD)
		expect(document.activeElement).toBe(document.body)
		for (const id of PAIR) expectNativeAttrs(w, id, { autocomplete: "new-password", autocapitalize: null, autocorrect: null })
		expect(pasteInto(nativeInput(w, PAIR[1]), "z".repeat(130))).toBe(true)
		expect(w.emitted("update:repeatedPassword")?.at(-1)).toEqual(["z".repeat(128)])
		await expectMaskToggle(w, { toggle: "import-full-backup-password-input-visibility-toggle", field: PAIR[0], drives: PAIR })
	})
})
