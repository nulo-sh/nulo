import { createTestingPinia } from "@pinia/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { Flex, Icon, MaterialIcon, Spinner, Text } from "@nulo/design"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createMemoryHistory, createRouter } from "vue-router"
import type { ConfigProp } from "@/wallet/config"

const clients = vi.hoisted(() => ({ config: undefined as unknown, execution: undefined as unknown }))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return clients.config
	}),
}))
vi.mock("@/wallet/services/execution/client", () => ({
	ExecutionServiceClient: vi.fn(function () {
		return clients.execution
	}),
}))
vi.mock("@/composables/usePrestoCheck", async () => {
	const { ref } = await import("vue")
	const available = { available: true, needsDownload: false, appVersion: "1.1.1", nativeAztecVersion: "6.0.0", protocol: "https" }
	return {
		usePrestoCheck: () => ({ state: ref({ kind: "available", info: available }), start: vi.fn(async () => {}), dispose: vi.fn() }),
	}
})

import AccountAvatar from "@/components/composite/general/AccountAvatar.vue"
import ItemsContainer from "@/components/ui/Settings/ItemsContainer.vue"
import SettingItem from "@/components/ui/Settings/SettingItem.vue"
import SettingsHub from "./index.vue"

type Read = { resolve: (props: ConfigProp[]) => void; reject: (error: Error) => void }

/** The hub's config client: its first request opens the port, as the real client's does. */
function fakeConfig() {
	const reads: Read[] = []
	let connected = false
	const client = {
		onUpdate: new EventHandler<ConfigProp>(),
		onConnected: new EventHandler<void>(),
		getProps: vi.fn(() => {
			if (!connected) {
				connected = true
				client.onConnected.invoke()
			}
			return new Promise<ConfigProp[]>((resolve, reject) => reads.push({ resolve, reject }))
		}),
		disconnect: vi.fn(),
		reads,
		/** A worker restart: the port drops, its pending requests reject, and the client reconnects. */
		restart() {
			for (const read of reads) read.reject(new Error("disconnected"))
			client.onConnected.invoke()
		},
	}
	return client
}

const props = (over: Partial<Record<string, unknown>> = {}): ConfigProp[] =>
	Object.entries({
		sessionTtl: 1_800_000,
		showFiatValues: true,
		theme: "system",
		developerMode: false,
		prestoReached: true,
		...over,
	}).map(([key, value]) => ({ key, value }) as ConfigProp)

let config: ReturnType<typeof fakeConfig>
let execution: { getLastProveOutcome: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }

beforeEach(() => {
	config = fakeConfig()
	execution = { getLastProveOutcome: vi.fn(async () => ({ outcome: null, denial: null })), disconnect: vi.fn() }
	clients.config = config
	clients.execution = execution
	const c = (globalThis as { chrome?: { storage: Record<string, unknown> } }).chrome
	if (c) {
		c.storage.local = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }
		c.storage.onChanged = { addListener: vi.fn(), removeListener: vi.fn() }
	}
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			observe() {}
			disconnect() {}
		},
	)
})
afterEach(() => vi.unstubAllGlobals())

const PASSWORD = { id: "p1", name: "Primary", type: "password" }
const PASSKEY = { id: "p2", name: "Travel key", type: "passkey" }

async function mountHub(profile = PASSWORD) {
	const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:path(.*)*", component: { render: () => null } }] })
	const wrapper = mount(SettingsHub, {
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn, initialState: { app: { isLogined: true, profile } } }), router],
			components: { AccountAvatar, Flex, Icon, ItemsContainer, MaterialIcon, SettingItem, Spinner, Text },
		},
	})
	await flushPromises()
	return wrapper
}

type Hub = Awaited<ReturnType<typeof mountHub>>

const ROWS = '[data-testid^="setting-nav-"], [data-testid$="-link-btn"]'
const rowIds = (w: Hub) => w.findAll(ROWS).map((row) => row.attributes("data-testid"))
const rowValue = (w: Hub, row: string) => w.find(`[data-testid="${row}"] [data-testid="setting-value"]`)
const shownValues = (w: Hub) =>
	Object.fromEntries(
		["setting-nav-lock", "setting-nav-privacy", "setting-nav-display", "setting-nav-developer"].map((row) => [
			row,
			rowValue(w, row).exists() ? rowValue(w, row).text() : undefined,
		]),
	)

const PASSWORD_ROWS = [
	["setting-nav-profile", "/popup/settings/profile"],
	["setting-nav-accounts", "/popup/settings/accounts"],
	["setting-nav-contacts", "/popup/settings/contacts"],
	["setting-nav-tokens", "/popup/settings/tokens"],
	["setting-nav-connected-apps", "/popup/settings/connected-apps"],
	["setting-nav-networks", "/popup/settings/networks"],
	["setting-nav-fpcs", "/popup/settings/fpcs"],
	["setting-nav-proving", "/popup/settings/proving"],
	["setting-nav-lock", "/popup/settings/lock"],
	["backup-link-btn", "/popup/settings/security/export"],
	["change-password-link-btn", "/popup/settings/security/change-password"],
	["setting-nav-privacy", "/popup/settings/privacy"],
	["setting-nav-display", "/popup/settings/display"],
	["setting-nav-developer", "/popup/settings/developer"],
	["setting-nav-glossary", "/popup/settings/glossary"],
	["setting-nav-about", "/popup/settings/about"],
	["delete-profile-link-btn", "/popup/settings/security/reset"],
]

describe("settings hub — rows", () => {
	test("a password profile sees the card and 16 rows in their groups, each linking to its page", async () => {
		const w = await mountHub()
		expect(w.findAll(ROWS).map((row) => [row.attributes("data-testid"), row.attributes("href")])).toEqual(PASSWORD_ROWS)
		const groups = w.findAllComponents(ItemsContainer)
		expect(groups.map((g) => g.props("title"))).toEqual([
			undefined,
			"Your wallet",
			"Apps and networks",
			"Safety",
			"Preferences",
			"Help",
			"Danger zone",
		])
		expect(groups.map((g) => g.props("danger"))).toEqual([false, false, false, false, false, false, true])
	})

	test("a passkey profile sees no Change password row, and Lock describes auto-lock only", async () => {
		const w = await mountHub(PASSKEY)
		expect(rowIds(w)).toEqual(PASSWORD_ROWS.map(([id]) => id).filter((id) => id !== "change-password-link-btn"))
		const lock = w.findAllComponents(SettingItem).find((row) => row.attributes("data-testid") === "setting-nav-lock")
		expect(lock?.props("description")).toBe("Auto-lock")
		expect(w.get('[data-testid="setting-nav-profile"]').text()).toContain("Passkey profile")
	})

	test("the rows read as the signed copy", async () => {
		const w = await mountHub()
		const copy = w.findAllComponents(SettingItem).map((row) => [row.props("title"), row.props("description")])
		expect(copy).toEqual([
			["Primary", "Password profile"],
			["Accounts", "Switch, create, manage"],
			["Contacts", "Saved addresses"],
			["Tokens", "Tracked tokens and balances"],
			["Connected Apps", "Apps with granted permissions"],
			["Networks", "Aztec networks and RPCs"],
			["Fee Payments", "FPCs and fee methods"],
			["Proving", "Presto · connected"],
			["Lock", "Auto-lock, strict mode"],
			["Back up profile", "Keep a copy of this profile"],
			["Change password", undefined],
			["Privacy", "Prices, explorer"],
			["Display", "Theme, layout"],
			["Developer", "Mode, logs, account state"],
			["Glossary", "What Nulo's words mean"],
			["About Nulo", "Version, contact, legal"],
			["Delete profile", undefined],
		])
	})

	test("the card shows the shared two-letter avatar for the profile's name", async () => {
		const avatar = (await mountHub()).get('[data-testid="profile-card-avatar"]')
		expect(avatar.attributes("data-initials")).toBe("PR")
		expect(avatar.text()).toBe("PR")
	})
})

describe("settings hub — values", () => {
	test("show nothing until the read answers, then one value inside each of the four rows", async () => {
		const w = await mountHub()
		expect(w.findAll('[data-testid="setting-value"]')).toHaveLength(0)
		config.reads[0].resolve(props())
		await flushPromises()
		expect(shownValues(w)).toEqual({
			"setting-nav-lock": "30 min",
			"setting-nav-privacy": "Prices on",
			"setting-nav-display": "System",
			"setting-nav-developer": "Off",
		})
		expect(w.findAll('[data-testid="setting-value"]')).toHaveLength(4)
	})

	test("an update that arrives before the read answers survives the older answer", async () => {
		const w = await mountHub()
		config.onUpdate.invoke({ key: "theme", value: "dark" } as ConfigProp)
		await flushPromises()
		expect(rowValue(w, "setting-nav-display").text()).toBe("Dark")
		config.reads[0].resolve(props({ theme: "system" }))
		await flushPromises()
		expect(shownValues(w)).toMatchObject({ "setting-nav-display": "Dark", "setting-nav-lock": "30 min" })
	})

	test("an update that arrives after the read answers replaces its value", async () => {
		const w = await mountHub()
		config.reads[0].resolve(props({ theme: "system" }))
		await flushPromises()
		config.onUpdate.invoke({ key: "theme", value: "light" } as ConfigProp)
		await flushPromises()
		expect(rowValue(w, "setting-nav-display").text()).toBe("Light")
	})

	test("a read that never answers holds no other row: the Proving description still renders", async () => {
		execution.getLastProveOutcome.mockResolvedValue({ outcome: null, denial: { at: 1 } })
		const w = await mountHub()
		expect(w.get('[data-testid="setting-nav-proving"]').text()).toContain("Presto · approval needed")
		expect(w.findAll('[data-testid="setting-value"]')).toHaveLength(0)
	})
})

describe("settings hub — reconnects", () => {
	test("the port's first open reads nothing extra; a reconnect after a rejected read shows the values", async () => {
		const w = await mountHub()
		expect(config.getProps).toHaveBeenCalledTimes(1)
		config.reads[0].reject(new Error("worker restarting"))
		await flushPromises()
		expect(w.findAll('[data-testid="setting-value"]')).toHaveLength(0)
		config.restart()
		config.reads[1].resolve(props())
		await flushPromises()
		expect(rowValue(w, "setting-nav-lock").text()).toBe("30 min")
	})

	test("a value from a write that never persisted gives way to the restarted worker's config", async () => {
		const w = await mountHub()
		config.reads[0].resolve(props({ showFiatValues: true }))
		await flushPromises()
		config.onUpdate.invoke({ key: "showFiatValues", value: false } as ConfigProp)
		await flushPromises()
		expect(rowValue(w, "setting-nav-privacy").text()).toBe("Prices off")
		config.restart()
		config.reads[1].resolve(props({ showFiatValues: true }))
		await flushPromises()
		expect(rowValue(w, "setting-nav-privacy").text()).toBe("Prices on")
	})

	test("when two reads overlap and the older answers last, the newer values stay", async () => {
		const w = await mountHub()
		config.onConnected.invoke()
		expect(config.getProps).toHaveBeenCalledTimes(2)
		config.reads[1].resolve(props({ theme: "dark", developerMode: true }))
		await flushPromises()
		config.reads[0].resolve(props({ theme: "light", developerMode: false }))
		await flushPromises()
		expect(shownValues(w)).toMatchObject({ "setting-nav-display": "Dark", "setting-nav-developer": "On" })
	})
})
