import { createTestingPinia } from "@pinia/testing"
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it } from "vitest"
import { installChromeStorage } from "../../../../../../tests/helpers/chrome-storage-mock"
import BackupPage from "./index.vue"

// The app store's synced refs read chrome.storage.local.
beforeEach(() => installChromeStorage({}, { persist: false }))

function mountPage() {
	return mount(BackupPage, {
		global: {
			plugins: [createTestingPinia({ initialState: { app: { profile: { id: "p1", type: "password", name: "Main" } } } })],
			stubs: {
				SettingsPageShell: { template: "<div><slot /></div>" },
				ItemsContainer: {
					props: ["title", "description"],
					template: "<section :data-description='description'><slot /></section>",
				},
				SettingItem: {
					props: { title: String, description: String, wrapDescription: Boolean },
					template: "<div :data-title='title' :data-description='description' :data-wrap='String(wrapDescription)' />",
				},
			},
		},
	})
}

describe("export/index.vue — Back up profile", () => {
	it("says under each mode what it makes, on lines that wrap", () => {
		const row = (testid: string) => mountPage().get(`[data-testid='${testid}']`).attributes()
		expect(
			["full-backup-link-btn", "seed-phrase-link-btn", "account-backup-link-btn"].map((testid) => {
				const { "data-title": title, "data-description": description, "data-wrap": wrap } = row(testid)
				return { title, description, wrap }
			}),
		).toEqual([
			{ title: "Full Backup", description: "Everything in this profile, in one password-protected file.", wrap: "true" },
			{ title: "Recovery Phrase", description: "The 24 words that restore your accounts.", wrap: "true" },
			{ title: "Account", description: "One account in a file you can import elsewhere.", wrap: "true" },
		])
	})

	it("keeps the Frequently Asked Questions row under the line Questions about backups", () => {
		const faq = mountPage().get("[data-title='Frequently Asked Questions']")
		expect(faq.element.parentElement?.getAttribute("data-description")).toBe("Questions about backups")
	})
})
