/**
 * The "more below" button's stops are the `data-scroll-section` blocks a page renders; a section a
 * page forgets to mark is one a press can scroll straight past. jsdom lays nothing out, so the
 * stops are read from the templates.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8")

/** The labels of the marked sections in a template: each marked block's first label. */
function markedLabels(source: string): string[] {
	const labels: string[] = []
	for (const [, label] of source.matchAll(/<div\b[^>]*\sdata-scroll-section[^>]*>\s*<span\b[^>]*>([^<]+)<\/span>/g)) {
		labels.push(label.trim())
	}
	return labels
}

const PAGES = {
	"popup/pages/settings/security/reset.vue": ["Profile to delete", "Imported accounts", "Agreements required", "Confirm deletion"],
	"popup/pages/settings/security/change-password.vue": ["Profile", "Current password", "New password"],
	"popup/pages/profile/new.vue": ["Profile name", "Passkey"],
	"popup/pages/import.vue": ["Profile name"],
	"popup/pages/settings/accounts/import.vue": ["Account file", "Protected file", "You are importing", "Account name"],
	"popup/pages/settings/security/unlock-method.vue": ["New Password"],
	"popup/pages/settings/security/export/full.vue": ["Before you continue", "Backup"],
	"popup/pages/settings/security/export/account.vue": ["Select account", "Before you continue", "File"],
	"popup/pages/settings/security/export/seed.vue": ["Before you continue", "Your recovery phrase", "Keep in mind"],
} as const

const FORMS = {
	"popup/components/modules/settings/new-profile/NewProfileMethodTabs.vue": ["Method"],
	"popup/components/modules/settings/new-profile/NewProfileCredentials.vue": ["Password"],
	"components/composite/import/ImportSecretForm.vue": ["Recovery Phrase"],
	"components/composite/import/ImportFullBackupForm.vue": ["Backup File", "Decryption Password"],
	"components/composite/SecretUnlockSection.vue": ["Unlock"],
	"components/composite/FilePasswordSection.vue": ["File password"],
} as const

const opensWithMoreBelow = (source: string) => /<CollapsingHeroLayout\b[^>]*\smoreBelow[\s>]/.test(source)

describe("the more-below button's stops", () => {
	test.each(Object.entries(PAGES))("%s shows the button and marks its sections", (path, labels) => {
		const source = read(path)
		expect(opensWithMoreBelow(source)).toBe(true)
		expect(markedLabels(source)).toEqual(expect.arrayContaining([...labels]))
	})

	test.each(Object.entries(FORMS))("%s marks its section roots", (path, labels) => {
		expect(markedLabels(read(path))).toEqual(expect.arrayContaining([...labels]))
	})

	test("Restore again keeps today's layout until the owner says otherwise", () => {
		expect(opensWithMoreBelow(read("popup/pages/restore-again.vue"))).toBe(false)
	})
})
