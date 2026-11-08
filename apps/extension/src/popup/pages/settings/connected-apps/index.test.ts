import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { VueWrapper } from "@vue/test-utils"
import { SETTING_UPDATE_FAILED } from "@/composables/useSettingUpdate"
import { useAppStore } from "@/stores/app.store"
import { EVERY_SITE_CONFIRM } from "@/utils/every-site"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { expectOwnedRows, settingsContext } from "../../../../../tests/helpers/settings-rows"
import ConnectedApps from "./index.vue"

type Session = {
	id: string
	expiry: number
	dappMetadata: { name: string; url: string; logo?: string; logoBlobUrl?: string }
	verificationHash?: string
	capabilityGrants?: Array<{ capability: { type: string } }>
}

const mocks = vi.hoisted(() => ({
	getDappSessions: vi.fn(),
	getEverySite: vi.fn(),
	setEverySite: vi.fn(),
	requestConfirm: vi.fn(),
	askConfirm: vi.fn(),
	openToast: vi.fn(),
	everySiteChanged: [] as Array<(change: unknown) => void>,
	added: [] as Array<(session: unknown) => void>,
	updated: [] as Array<(session: unknown) => void>,
	deleted: [] as Array<(session: unknown) => void>,
}))

vi.mock("@/composables/useConfirm", () => ({
	useConfirm: () => ({ requestConfirm: mocks.requestConfirm, askConfirm: mocks.askConfirm }),
}))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: mocks.openToast }) }))
vi.mock("vue-router", () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: vi.fn(), go: vi.fn() }) }))
vi.mock("@/wallet/services/dapp-session/client", () => ({
	DappSessionServiceClient: vi.fn(function () {
		return {
			getDappSessions: mocks.getDappSessions,
			getEverySite: mocks.getEverySite,
			setEverySite: mocks.setEverySite,
			deleteDappSession: vi.fn(),
			disconnect: vi.fn(),
			onDappSessionAdded: { add: (fn: (session: unknown) => void) => mocks.added.push(fn) },
			onDappSessionUpdated: { add: (fn: (session: unknown) => void) => mocks.updated.push(fn) },
			onDappSessionDeleted: { add: (fn: (session: unknown) => void) => mocks.deleted.push(fn) },
			onEverySiteChanged: { add: (fn: (change: unknown) => void) => mocks.everySiteChanged.push(fn) },
		}
	}),
}))

beforeEach(() => {
	vi.stubGlobal("chrome", {
		storage: {},
		runtime: { connect: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
	})
	installChromeStorage({}, { persist: false })
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
	mocks.added.length = 0
	mocks.updated.length = 0
	mocks.deleted.length = 0
	mocks.everySiteChanged.length = 0
})

const session = (id: string, name: string, expiry: number): Session => ({
	id,
	expiry,
	dappMetadata: { name, url: `http://${name}.test` },
})

async function mountPage(sessions: Session[], everySite: Promise<unknown> = Promise.resolve({ profileId: "p1", on: false })) {
	mocks.getDappSessions.mockResolvedValue(sessions)
	mocks.getEverySite.mockReturnValue(everySite)
	const w = mount(ConnectedApps, {
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			stubs: {
				SettingsPageShell: { template: "<div><slot name='trailing' /><slot /></div>" },
				DropdownRoot: { template: "<div><slot /><slot name='popup' /></div>" },
				DropdownItem: { template: "<button data-testid='disconnect-all'><slot /></button>" },
				Flex: { template: "<div><slot /></div>" },
				SectionLabel: { props: ["label", "count"], template: "<h2>{{ count }}</h2>" },
				ItemsContainer: { template: "<div><slot /></div>" },
				RowTarget: { template: "<a data-testid='connected-app-row' />" },
				Tooltip: { template: "<div><slot /></div>" },
				RowAction: { template: "<button><slot /></button>" },
				Icon: true,
				Toggle: true,
			},
		},
	})
	await flushPromises()
	return w
}

describe("Settings › Connected apps — session delete reducer", () => {
	test("a delete drops every row with its id, into a new array, and the list re-renders", async () => {
		const w = await mountPage([session("s1", "alpha", 1), session("s2", "beta", 2), session("s1", "gamma", 3)])
		expect(w.findAll('[data-testid="connected-app-row"]')).toHaveLength(3)
		const vm = w.vm as unknown as { dappSessions: Session[] }
		const before = vm.dappSessions
		mocks.deleted[0](session("s1", "alpha", 1))
		await flushPromises()
		expect(vm.dappSessions).not.toBe(before)
		expect(vm.dappSessions.map((s) => s.dappMetadata.name)).toEqual(["beta"])
		expect(w.findAll('[data-testid="connected-app-row"]')).toHaveLength(1)
		expect(w.find("h2").text()).toBe("1")
	})

	test("a delete for an unlisted id leaves the rows", async () => {
		const w = await mountPage([session("s1", "alpha", 1)])
		mocks.deleted[0](session("s9", "zeta", 9))
		await flushPromises()
		expect(w.findAll('[data-testid="connected-app-row"]')).toHaveLength(1)
	})
})

describe("Settings › Connected apps — session add and update reducers", () => {
	const withLogo = (s: Session, logo: string, logoBlobUrl?: string): Session => ({
		...s,
		dappMetadata: { ...s.dappMetadata, logo, logoBlobUrl },
	})
	const rows = (w: Awaited<ReturnType<typeof mountPage>>) => (w.vm as unknown as { dappSessions: Session[] }).dappSessions

	test("an add appends the row and shows its logo", async () => {
		const w = await mountPage([session("s1", "alpha", 1)])
		mocks.added[0](withLogo(session("s2", "beta", 2), "data:beta"))
		await flushPromises()
		expect(rows(w).map((s) => [s.id, s.dappMetadata.logoBlobUrl])).toEqual([
			["s1", undefined],
			["s2", "data:beta"],
		])
	})

	test("an update for an unlisted id appends the row and shows its logo", async () => {
		const w = await mountPage([session("s1", "alpha", 1)])
		mocks.updated[0](withLogo(session("s2", "beta", 2), "data:beta"))
		await flushPromises()
		expect(rows(w).map((s) => [s.id, s.dappMetadata.logoBlobUrl])).toEqual([
			["s1", undefined],
			["s2", "data:beta"],
		])
	})

	test("an update for a listed id replaces the row and keeps the logo it shows", async () => {
		const w = await mountPage([withLogo(session("s1", "alpha", 1), "data:old", "blob:shown")])
		mocks.updated[0](withLogo(session("s1", "alpha renamed", 1), "data:new"))
		await flushPromises()
		expect(rows(w).map((s) => [s.dappMetadata.name, s.dappMetadata.logoBlobUrl])).toEqual([["alpha renamed", "blob:shown"]])
	})
})

describe("Settings › Connected apps — a row no connection reached", () => {
	const NOT_CONNECTED = '[data-testid="connected-app-row-not-connected"]'

	test("reads as allowed and not connected yet; a row a connection reached shows its grants instead (control)", async () => {
		const w = await mountPage([
			{ ...session("s1", "alpha", 1) },
			{
				...session("s2", "beta", 2),
				verificationHash: "ab".repeat(32),
				capabilityGrants: [{ capability: { type: "accounts" } }],
			} as Session,
		])
		const rows = w.findAll('[data-testid="connected-app-row"]').map((row) => row.element.parentElement as HTMLElement)
		expect(rows[0].querySelector(NOT_CONNECTED)?.textContent?.trim()).toBe("Allowed. Not connected yet.")
		expect(rows[1].querySelector(NOT_CONNECTED)).toBeNull()
		expect(rows[1].textContent).toContain("Accounts")
	})
})

describe("Settings › Connected apps — the host under each app's name", () => {
	const HOST = '[data-testid="connected-app-row-host"]'
	const rowOf = (target: { element: Element }) => target.element.parentElement as HTMLElement
	/** The text of the element the row's target is labelled by. */
	const labelOf = (target: { element: Element; attributes: (name: string) => string | undefined }) =>
		rowOf(target).querySelector(`[id="${target.attributes("labelledby")}"]`)?.textContent

	// As discovery stores a row: the name sanitized to 64 characters, the url the origin the browser
	// reported. The path and query stand for anything past the host, which the row must not print.
	const NAME = "Nulo support: restore your wallet at the link below before it ex"
	const LABEL = "a".repeat(63)
	const wire = (id: string, url?: string): Session => ({
		id,
		expiry: 1,
		dappMetadata: { name: NAME, ...(url === undefined ? {} : { url }) } as Session["dappMetadata"],
	})

	test("shows the parsed host of a long origin under the name, and the row is still named by the name", async () => {
		expect(NAME).toHaveLength(64)
		const w = await mountPage([wire("s1", `https://${LABEL}.example:8443/connect?from=nulo#x`)])
		const [target] = w.findAll('[data-testid="connected-app-row"]')
		expect(rowOf(target!).querySelector(HOST)?.textContent).toBe(`${LABEL}.example:8443`)
		expect(target!.attributes("data-app-host")).toBe(`${LABEL}.example:8443`)
		expect(labelOf(target!)).toBe(NAME)
	})

	test.each([
		["no url", undefined],
		["an opaque origin", "null"],
		["a file origin", "file:///etc/passwd"],
	])("a row with %s shows no host line; a row with a host shows one (control)", async (_, url) => {
		const w = await mountPage([wire("s1", url), wire("s2", "https://dapp.example")])
		const rows = w.findAll('[data-testid="connected-app-row"]').map(rowOf)
		expect(rows.map((row) => row.querySelector(HOST)?.textContent ?? null)).toEqual([null, "dapp.example"])
	})
})

describe("Settings › Connected apps — Disconnect all", () => {
	const confirmText = async (sessions: Session[]) => {
		const w = await mountPage(sessions)
		await w.get("[data-testid='disconnect-all']").trigger("click")
		return mocks.requestConfirm.mock.calls[0]?.[0]?.description
	}

	test("asks about one session in the singular", async () => {
		expect(await confirmText([session("s1", "alpha", 1)])).toBe("Disconnect all 1 session?")
	})

	test("asks about two sessions in the plural (control)", async () => {
		expect(await confirmText([session("s1", "alpha", 1), session("s2", "beta", 2)])).toBe("Disconnect all 2 sessions?")
	})
})

describe("Settings › Connected apps — the every-site switch", () => {
	const toggle = (w: VueWrapper) => w.findComponent('[data-testid="every-site-toggle"]')
	const shown = (w: VueWrapper) => [toggle(w).attributes("modelvalue"), toggle(w).attributes("disabled")]
	const press = async (w: VueWrapper, on: boolean) => {
		;(toggle(w) as VueWrapper).vm.$emit("update:modelValue", on)
		await flushPromises()
	}

	test("the page owns the row, first, above the sessions", async () => {
		const w = await mountPage([session("s1", "alpha", 1)])
		expectOwnedRows(w, "/popup/settings/connected-apps", settingsContext())
		const order = w.findAll('[data-testid="privacy-row-every-site"], h2').map((el) => el.element.tagName)
		expect(order).toEqual(["DIV", "H2"])
		expect(toggle(w).attributes("aria-label")).toBe("Let every site see that Nulo is installed")
	})

	test("the Toggle is disabled until the switch is read, then shows it", async () => {
		const read = Promise.withResolvers<unknown>()
		const w = await mountPage([], read.promise)
		expect(shown(w)).toEqual(["false", "true"])
		read.resolve({ profileId: "p1", on: true })
		await flushPromises()
		expect(shown(w)).toEqual(["true", "false"])
	})

	test("on asks the shared confirm and writes nothing when it is cancelled", async () => {
		const w = await mountPage([])
		mocks.askConfirm.mockResolvedValue(false)
		await press(w, true)
		expect(mocks.askConfirm).toHaveBeenCalledWith(EVERY_SITE_CONFIRM)
		expect(mocks.setEverySite).not.toHaveBeenCalled()
		expect(shown(w)).toEqual(["false", "false"])
	})

	test("Turn on writes for the profile the switch was read for, then shows on", async () => {
		const w = await mountPage([])
		mocks.askConfirm.mockResolvedValue(true)
		await press(w, true)
		expect(mocks.setEverySite).toHaveBeenCalledWith("p1", true)
		expect(shown(w)).toEqual(["true", "false"])
	})

	test("off writes at once, with no confirm", async () => {
		const w = await mountPage([], Promise.resolve({ profileId: "p1", on: true }))
		await press(w, false)
		expect(mocks.askConfirm).not.toHaveBeenCalled()
		expect(mocks.setEverySite).toHaveBeenCalledWith("p1", false)
		expect(shown(w)).toEqual(["false", "false"])
	})

	test("a refused write shows the shared failure toast and leaves the Toggle as it was", async () => {
		const w = await mountPage([], Promise.resolve({ profileId: "p1", on: true }))
		mocks.setEverySite.mockRejectedValueOnce(new Error("locked"))
		await press(w, false)
		expect(mocks.openToast).toHaveBeenCalledWith({ kind: "error", label: SETTING_UPDATE_FAILED })
		expect(shown(w)).toEqual(["true", "false"])
	})

	test("a change made elsewhere, as by the connect window, is read again", async () => {
		const w = await mountPage([])
		mocks.getEverySite.mockResolvedValue({ profileId: "p1", on: true })
		for (const listener of mocks.everySiteChanged) listener({ profileId: "p1", on: true })
		await flushPromises()
		expect(shown(w)).toEqual(["true", "false"])
	})

	test("a profile switched elsewhere disables the Toggle until that profile's switch is read", async () => {
		const w = await mountPage([])
		const read = Promise.withResolvers<unknown>()
		mocks.getEverySite.mockReturnValue(read.promise)
		;(useAppStore() as unknown as { profile: { id: string } }).profile = { id: "p2" }
		await flushPromises()
		expect(shown(w)).toEqual(["false", "true"])
		read.resolve({ profileId: "p2", on: true })
		await flushPromises()
		expect(shown(w)).toEqual(["true", "false"])
		await press(w, false)
		expect(mocks.setEverySite).toHaveBeenCalledWith("p2", false)
	})

	test("a confirm answered after a profile switch writes nothing", async () => {
		const w = await mountPage([])
		const answer = Promise.withResolvers<boolean>()
		mocks.askConfirm.mockReturnValueOnce(answer.promise)
		await press(w, true)
		mocks.getEverySite.mockResolvedValue({ profileId: "p2", on: false })
		;(useAppStore() as unknown as { profile: { id: string } }).profile = { id: "p2" }
		await flushPromises()
		answer.resolve(true)
		await flushPromises()
		expect(mocks.setEverySite).not.toHaveBeenCalled()
		expect(shown(w)).toEqual(["false", "false"])
	})

	test("only the latest read lands, and a failed read disables the Toggle", async () => {
		const w = await mountPage([])
		const [older, newer] = [Promise.withResolvers<unknown>(), Promise.withResolvers<unknown>()]
		mocks.getEverySite.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
		for (let i = 0; i < 2; i++) for (const listener of mocks.everySiteChanged) listener({ profileId: "p1", on: i === 1 })
		newer.resolve({ profileId: "p1", on: true })
		await flushPromises()
		older.resolve({ profileId: "p1", on: false })
		await flushPromises()
		expect(shown(w)).toEqual(["true", "false"])
		mocks.getEverySite.mockRejectedValueOnce(new Error("locked"))
		for (const listener of mocks.everySiteChanged) listener({ profileId: "p1", on: true })
		await flushPromises()
		expect(toggle(w).attributes("disabled")).toBe("true")
	})
})
