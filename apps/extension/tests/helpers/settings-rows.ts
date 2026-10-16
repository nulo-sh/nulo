import type { VueWrapper } from "@vue/test-utils"
import { expect } from "vitest"
import { createMemoryHistory, createRouter } from "vue-router"
import { SETTINGS_ROWS, type SettingsContext, type SettingsRowId, isSettingsRowVisible, settingsRow } from "@/utils/settings-search"

/** A router that renders nothing, for a settings page that reads its route. */
export function settingsRouter() {
	return createRouter({ history: createMemoryHistory(), routes: [{ path: "/:path(.*)*", component: { render: () => null } }] })
}

/** No side panel, a password profile, developer mode off; `over` sets what a test varies. */
export function settingsContext(over: Partial<SettingsContext> = {}): SettingsContext {
	return { sidePanel: false, passkey: false, developerMode: false, provingStatus: "", ...over }
}

/**
 * Checks a mounted page against the search registry: every row the registry places on `page` and
 * shows in `context` renders under its testid, marked `v-settings-row` with its id, with its exact
 * title and description, and no hidden one renders. A row the page drops, renames or moves fails
 * here, and so does a stale entry.
 */
export function expectOwnedRows(wrapper: VueWrapper, page: string, context: SettingsContext): void {
	const owned = (Object.keys(SETTINGS_ROWS) as SettingsRowId[]).filter((id) => SETTINGS_ROWS[id].page === page)
	expect(owned.length, page).toBeGreaterThan(0)
	for (const id of owned) {
		const { testid, title, description } = settingsRow(id, context)
		const row = wrapper.find(`[data-testid="${testid}"]`)
		if (!isSettingsRowVisible(id, context)) {
			expect(row.exists(), `${id} is hidden`).toBe(false)
			continue
		}
		expect(row.exists(), `${id} renders`).toBe(true)
		expect(row.attributes("data-settings-row"), `${id} carries v-settings-row`).toBe(id)
		const texts = row.findAll("*").map((el) => el.text())
		expect(texts, `${id}'s title`).toContain(title)
		if (description !== undefined) expect(texts, `${id}'s description`).toContain(description)
	}
}
