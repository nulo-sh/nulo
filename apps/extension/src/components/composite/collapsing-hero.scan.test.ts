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

/** Per file: how many sections it marks, and the labels of those that open with one. */
const PAGES = {
	"popup/pages/settings/security/reset.vue": [4, ["Profile to delete", "Imported accounts", "Agreements required", "Confirm deletion"]],
	"popup/pages/settings/security/change-password.vue": [3, ["Profile", "Current password", "New password"]],
	"popup/pages/profile/new.vue": [2, ["Profile name", "Passkey"]],
	"popup/pages/import.vue": [1, ["Profile name"]],
	"popup/pages/settings/accounts/import.vue": [5, ["Account file", "Protected file", "You are importing", "Account name"]],
	"popup/pages/settings/security/unlock-method.vue": [3, ["New Password"]],
	"popup/pages/settings/security/export/full.vue": [3, ["Before you continue", "Backup"]],
	"popup/pages/settings/security/export/account.vue": [3, ["Select account", "Before you continue", "File"]],
	"popup/pages/settings/security/export/seed.vue": [4, ["Before you continue", "Your recovery phrase", "Keep in mind"]],
	"popup/pages/restore-again.vue": [1, []],
} as const

const FORMS = {
	"popup/components/modules/settings/new-profile/NewProfileMethodTabs.vue": [1, ["Method"]],
	"popup/components/modules/settings/new-profile/NewProfileCredentials.vue": [1, ["Password"]],
	"components/composite/import/ImportMethodPicker.vue": [1, []],
	"components/composite/import/ImportSecretForm.vue": [2, ["Recovery Phrase"]],
	"components/composite/import/ImportFullBackupForm.vue": [3, ["Backup File", "Decryption Password"]],
	"components/composite/SecretUnlockSection.vue": [1, ["Unlock"]],
	"components/composite/FilePasswordSection.vue": [1, ["File password"]],
} as const

const markCount = (source: string) => source.match(/\sdata-scroll-section\b/g)?.length ?? 0

const opensWithMoreBelow = (source: string) => /<CollapsingHeroLayout\b[^>]*\smoreBelow[\s>]/.test(source)

describe("the more-below button's stops", () => {
	test.each(Object.entries(PAGES))("%s shows the button and marks its sections", (path, [count, labels]) => {
		const source = read(path)
		expect(opensWithMoreBelow(source)).toBe(true)
		expect(markCount(source)).toBe(count)
		expect(markedLabels(source)).toEqual(expect.arrayContaining([...labels]))
	})

	test.each(Object.entries(FORMS))("%s marks its section roots", (path, [count, labels]) => {
		const source = read(path)
		expect(markCount(source)).toBe(count)
		expect(markedLabels(source)).toEqual(expect.arrayContaining([...labels]))
	})
})
