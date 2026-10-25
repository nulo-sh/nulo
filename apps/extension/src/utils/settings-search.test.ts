import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import {
	SETTINGS_ROWS,
	type SettingsContext,
	type SettingsRowId,
	searchSettings,
	settingsResultTo,
	settingsRow,
	visibleSettingsRows,
} from "./settings-search"

const CHROME: SettingsContext = { sidePanel: true, passkey: false, developerMode: false, provingStatus: "Presto · connected" }
const NO_SIDE_SURFACE: SettingsContext = { ...CHROME, sidePanel: false }

const ids = (groups: ReturnType<typeof searchSettings>) => groups?.map((g) => [g.caption, g.rows.map((r) => r.id)])
const find = (query: string, context = CHROME) => ids(searchSettings(visibleSettingsRows(context), query))
const ALL = Object.keys(SETTINGS_ROWS) as SettingsRowId[]

describe("matching", () => {
	test('"ation" finds Disable animations by its title, then Theme by its description', () => {
		expect(find("ation")).toEqual([["Display", ["display-animations", "display-theme"]]])
	})

	test('"full" finds Open as Side Panel by a synonym, and nothing on a browser with no side panel', () => {
		expect(find("full")).toEqual([["Display", ["display-side-panel"]]])
		expect(find("full", NO_SIDE_SURFACE)).toEqual([])
	})

	test("case and accents fold: THÉME finds Theme", () => {
		expect(find("THÉME")).toEqual([
			["Preferences", ["hub-display"]],
			["Display", ["display-theme"]],
		])
	})

	test("a term inside a word matches", () => {
		expect(find("nimat")).toEqual([["Display", ["display-animations"]]])
	})

	test("every term must match, each in any field", () => {
		// Lock now has "lock" but not "session"; the two Lock rows have "session" as a synonym.
		expect(find("lock session")).toEqual([
			["Safety", ["hub-lock"]],
			["Lock", ["lock-auto-lock"]],
		])
	})

	test("inside a group a title match ranks first, then a description match, then a synonym match", () => {
		const rows = [settingsRow("display-incoming-transfers"), settingsRow("display-dust")]
		// Show incoming transfers has "receipts" as a synonym; Hide dust has it in its description.
		expect(ids(searchSettings(rows, "receipts"))).toEqual([["Display", ["display-dust", "display-incoming-transfers"]]])
		// Hide dust has "hide" in its title; Show incoming transfers in its description.
		expect(ids(searchSettings(rows, "hide"))).toEqual([["Display", ["display-dust", "display-incoming-transfers"]]])
		// A row ranks by the weakest field any of its terms needed.
		expect(ids(searchSettings(rows, "hide receipts"))).toEqual([["Display", ["display-dust", "display-incoming-transfers"]]])
		expect(ids(searchSettings(rows, "hide spam"))).toEqual([["Display", ["display-dust"]]])
	})

	test("rows found by the same field keep page order", () => {
		const rows = [settingsRow("display-network-name"), settingsRow("display-incoming-transfers")]
		expect(ids(searchSettings(rows, "show"))).toEqual([["Display", ["display-network-name", "display-incoming-transfers"]]])
	})

	test("a blank query is no search; no match is an empty result", () => {
		expect(searchSettings(visibleSettingsRows(CHROME), "")).toBeNull()
		expect(searchSettings(visibleSettingsRows(CHROME), "  \t ")).toBeNull()
		expect(searchSettings(visibleSettingsRows(CHROME), "zzz")).toEqual([])
	})

	test("the Danger zone group carries its fence", () => {
		expect(searchSettings(visibleSettingsRows(CHROME), "delete")).toEqual([
			{ caption: "Danger zone", danger: true, rows: [settingsRow("hub-delete-profile", CHROME)] },
		])
	})
})

describe("where a result goes", () => {
	test("a Settings-list row's result opens the row's own page, as a tap on the row does", () => {
		expect(settingsResultTo(settingsRow("hub-backup"))).toBe("/popup/settings/security/export")
		expect(settingsResultTo(settingsRow("hub-display"))).toBe("/popup/settings/display")
	})

	test("a sub-page row's result opens its page, naming the row to outline", () => {
		expect(settingsResultTo(settingsRow("display-animations"))).toBe("/popup/settings/display?row=display-animations")
		expect(settingsResultTo(settingsRow("lock-now"))).toBe("/popup/settings/lock?row=lock-now")
	})
})

describe("visibility", () => {
	const visible = (context: SettingsContext) => visibleSettingsRows(context).map((r) => r.id)

	test.each([
		["display-side-panel", { sidePanel: false }],
		["hub-change-password", { passkey: true }],
		["lock-strict-mode", { passkey: true }],
		["developer-indicate-failures", { developerMode: false }],
		["developer-debug", { developerMode: false }],
		["developer-logs", { developerMode: false }],
	] as const)("%s hides under %o and shows otherwise", (id, hiding) => {
		const shown = { ...CHROME, passkey: false, sidePanel: true, developerMode: true }
		expect(visible(shown)).toContain(id)
		expect(visible({ ...shown, ...hiding })).not.toContain(id)
	})

	test("a context-dependent description resolves from the context", () => {
		expect(settingsRow("hub-lock", CHROME).description).toBe("Auto-lock, strict mode")
		expect(settingsRow("hub-lock", { ...CHROME, passkey: true }).description).toBe("Auto-lock")
		expect(settingsRow("hub-proving", { ...CHROME, provingStatus: "Presto · update needed" }).description).toBe(
			"Presto · update needed",
		)
		expect(find("update needed", { ...CHROME, provingStatus: "Presto · update needed" })).toEqual([
			["Apps and networks", ["hub-proving"]],
		])
	})
})

describe("the registry", () => {
	test("ids and testids are unique, and ids are slugs", () => {
		const testids = ALL.map((id) => SETTINGS_ROWS[id].testid)
		expect(new Set(testids).size).toBe(ALL.length)
		for (const id of ALL) expect(id).toMatch(/^[a-z0-9-]+$/)
	})

	test("each caption is one run, so a search shows it once", () => {
		const runs = ALL.map((id) => SETTINGS_ROWS[id].section).filter((s, i, all) => s !== all[i - 1])
		expect(new Set(runs).size).toBe(runs.length)
	})

	test("every page and every row's link is a route the popup renders", () => {
		const pages = resolve(__dirname, "../popup/pages")
		const links = ALL.map((id) => settingsRow(id).to).filter((to) => to !== undefined)
		for (const page of new Set([...ALL.map((id) => SETTINGS_ROWS[id].page), ...links])) {
			const path = page.replace(/^\/popup/, pages)
			expect(existsSync(`${path}.vue`) || existsSync(`${path}/index.vue`), page).toBe(true)
		}
	})

	test("exactly the Settings list's rows carry a link of their own", () => {
		const linked = ALL.filter((id) => settingsRow(id).to !== undefined)
		expect(linked).toEqual(ALL.filter((id) => SETTINGS_ROWS[id].page === "/popup/settings"))
		expect(linked).toHaveLength(16)
	})
})
