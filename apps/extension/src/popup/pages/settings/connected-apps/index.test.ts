import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
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
	requestConfirm: vi.fn(),
	added: [] as Array<(session: unknown) => void>,
	updated: [] as Array<(session: unknown) => void>,
	deleted: [] as Array<(session: unknown) => void>,
}))

vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ requestConfirm: mocks.requestConfirm }) }))
vi.mock("vue-router", () => ({ useRoute: () => ({ params: {} }), useRouter: () => ({ push: vi.fn(), go: vi.fn() }) }))
vi.mock("@/wallet/services/dapp-session/client", () => ({
	DappSessionServiceClient: vi.fn(function () {
		return {
			getDappSessions: mocks.getDappSessions,
			deleteDappSession: vi.fn(),
			disconnect: vi.fn(),
			onDappSessionAdded: { add: (fn: (session: unknown) => void) => mocks.added.push(fn) },
			onDappSessionUpdated: { add: (fn: (session: unknown) => void) => mocks.updated.push(fn) },
			onDappSessionDeleted: { add: (fn: (session: unknown) => void) => mocks.deleted.push(fn) },
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
})

const session = (id: string, name: string, expiry: number): Session => ({
	id,
	expiry,
	dappMetadata: { name, url: `http://${name}.test` },
})

async function mountPage(sessions: Session[]) {
	mocks.getDappSessions.mockResolvedValue(sessions)
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
