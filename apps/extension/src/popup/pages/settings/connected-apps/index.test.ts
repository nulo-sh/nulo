import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import ConnectedApps from "./index.vue"

type Session = { id: string; expiry: number; dappMetadata: { name: string; url: string } }

const mocks = vi.hoisted(() => ({
	getDappSessions: vi.fn(),
	deleted: [] as Array<(session: unknown) => void>,
}))

vi.mock("vue-router", () => ({ useRoute: () => ({ params: {} }), useRouter: () => ({ push: vi.fn(), go: vi.fn() }) }))
vi.mock("@/wallet/services/dapp-session/client", () => ({
	DappSessionServiceClient: vi.fn(function () {
		return {
			getDappSessions: mocks.getDappSessions,
			deleteDappSession: vi.fn(),
			disconnect: vi.fn(),
			onDappSessionAdded: { add: vi.fn() },
			onDappSessionUpdated: { add: vi.fn() },
			onDappSessionDeleted: { add: (fn: (session: unknown) => void) => mocks.deleted.push(fn) },
		}
	}),
}))

beforeEach(() => {
	vi.stubGlobal("chrome", {
		storage: {
			local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) },
			onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
		},
		runtime: { connect: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
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
				Dropdown: true,
				Flex: { template: "<div><slot /></div>" },
				SectionLabel: { props: ["label", "count"], template: "<h2>{{ count }}</h2>" },
				ItemsContainer: { template: "<div><slot /></div>" },
				RowTarget: { template: "<a data-testid='connected-app-row' />" },
				Tooltip: { template: "<div><slot /></div>" },
				RowAction: { template: "<button><slot /></button>" },
				Icon: true,
				MaterialIcon: true,
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
