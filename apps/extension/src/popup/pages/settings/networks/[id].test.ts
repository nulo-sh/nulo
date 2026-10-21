import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import SettingsPageShell from "@/components/composite/SettingsPageShell.vue"
import { type Account, AccountType } from "@/wallet/services/account/client"
import type { PendingReset, StaleNetworkView } from "@/wallet/services/network-reset/client"
import NetworkDetail from "./[id].vue"

const setPrimaryEndpoint = vi.hoisted(() => vi.fn(async () => undefined))
const openToast = vi.hoisted(() => vi.fn())
const networkReset = vi.hoisted(() => ({
	getPendingReset: vi.fn(async (): Promise<PendingReset | null> => null),
	getStaleNetwork: vi.fn(async (_id: string): Promise<Partial<StaleNetworkView> | null> => null),
	onStaleNetworkChanged: { add: vi.fn(), remove: vi.fn() },
}))
const accounts = vi.hoisted(() => ({ getAccounts: vi.fn(async (_p: string, _c: number, _all: boolean): Promise<Account[]> => []) }))
vi.mock("@/utils/core", () => ({
	managers: {
		network: { getNetworks: vi.fn(async () => []), setActiveNetwork: vi.fn(), getActiveNetwork: vi.fn(), setPrimaryEndpoint },
		networkReset,
	},
	requireAccount: () => accounts,
}))
vi.mock("@/composables/useNetworkActivation", () => ({ useNetworkActivation: () => ({ activate: vi.fn(async () => "activated") }) }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast }) }))
const routing = vi.hoisted(() => ({ route: undefined as unknown as { params: { id: string } } }))
vi.mock("vue-router", async () => {
	const { reactive } = await import("vue")
	routing.route = reactive({ params: { id: "mine" } })
	return { useRoute: () => routing.route, useRouter: () => ({ push: vi.fn(), go: vi.fn(), replace: vi.fn() }) }
})
// The detail page must never consult Developer Mode: managing a row that already exists is not
// gated, only creating one is. A constructed config client here is a regression.
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: function ConfigServiceClient() {
		throw new Error("the network detail page must not read config")
	},
}))

beforeEach(() => {
	routing.route.params.id = "mine"
	setPrimaryEndpoint.mockClear()
	openToast.mockClear()
	networkReset.getPendingReset.mockReset().mockResolvedValue(null)
	networkReset.getStaleNetwork.mockReset().mockResolvedValue(null)
	accounts.getAccounts.mockReset().mockResolvedValue([])
	vi.stubGlobal("chrome", {
		storage: {},
		runtime: { connect: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
	})
	installChromeStorage({}, { persist: false })
})
afterEach(() => vi.unstubAllGlobals())

const ALPHA = {
	id: "alpha",
	name: "Alpha V5",
	chainId: 4248422646,
	kind: "mainnet",
	endpoints: [{ id: "a1", rpcUrl: "https://a/" }],
	primaryEndpointId: "a1",
}
const MINE = {
	id: "mine",
	name: "My Chain",
	chainId: 4242,
	kind: "custom",
	endpoints: [
		{ id: "m1", rpcUrl: "https://m1/" },
		{ id: "m2", rpcUrl: "https://m2/", label: "backup" },
	],
	primaryEndpointId: "m1",
}

function mountDetail() {
	const wrapper = mount(NetworkDetail, {
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			components: { SettingsPageShell },
			stubs: {
				SettingItem: {
					inheritAttrs: false,
					template: "<div v-bind='$attrs' :data-clickable='String(!!$attrs.onClick)'><slot name='right' /></div>",
				},
				Button: { inheritAttrs: false, template: "<button v-bind='$attrs'><slot /></button>" },
				Icon: { inheritAttrs: false, template: "<i v-bind='$attrs' />" },
				Tooltip: { template: "<span><slot /></span>" },
				Flex: { inheritAttrs: false, template: "<div v-bind='$attrs'><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				SubPageHeader: true,
				SectionLabel: true,
				ItemsContainer: { template: "<div><slot /></div>" },
			},
		},
	})
	const appStore = useAppStore()
	appStore.networks = [ALPHA, MINE] as never
	appStore.network = ALPHA as never
	return wrapper
}

describe("Settings › Network detail — an existing custom row is fully manageable without Developer Mode", () => {
	test("rename, endpoint add/edit/delete and chain deletion all render for a non-active custom network", async () => {
		const wrapper = mountDetail()
		await flushPromises()
		expect(wrapper.get('[data-testid="network-detail-rename"]').attributes("trailingicon")).toBe("edit")
		expect(wrapper.find('[data-testid="endpoint-add-btn"]').exists()).toBe(true)
		expect(wrapper.findAll('[data-testid="endpoint-row"]')).toHaveLength(2)
		expect(wrapper.findAll('[data-testid="endpoint-edit-btn"]')).toHaveLength(2)
		// Only the non-primary endpoint can be deleted while two exist.
		expect(wrapper.findAll('[data-testid="endpoint-delete-btn"]')).toHaveLength(1)
		expect(wrapper.find('[data-testid="network-delete-chain-btn"]').exists()).toBe(true)
	})
})

describe("Settings › Network detail — a paused reset of this network", () => {
	const holdMine = (imported: string[]) => {
		networkReset.getPendingReset.mockResolvedValue({ networkId: "mine", running: false })
		networkReset.getStaleNetwork.mockResolvedValue({
			networkId: "mine",
			reset: { running: false, purged: true, doneCount: 0, imported },
		})
	}
	const deleteConfirmText = async () => {
		const wrapper = mountDetail()
		await flushPromises()
		await wrapper.get('[data-testid="network-delete-chain-btn"]').trigger("click")
		await flushPromises()
		return useCacheStore().confirm?.description
	}
	/** The page's own first read answers only when `release` is called. */
	const holdFirstRead = () => {
		let release!: (pending: PendingReset | null) => void
		networkReset.getPendingReset.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve
				}),
		)
		return (pending: PendingReset | null) => release(pending)
	}
	const WIPES = "This wipes accounts, balances, tokens, and PXE state on this chain. This cannot be undone."

	test("Delete chain's confirmation names the imported accounts it also deletes", async () => {
		holdMine(["Savings", "Trading"])
		expect(await deleteConfirmText()).toBe(`${WIPES} It also deletes the imported accounts “Savings” and “Trading”.`)
		expect(networkReset.getStaleNetwork).toHaveBeenCalledWith("mine")
		holdMine(["Savings"])
		expect(await deleteConfirmText()).toBe(`${WIPES} It also deletes the imported account “Savings”.`)
	})

	test("for a password profile whose reset holds their keys, Delete chain's sentence ends asking to export them", async () => {
		const heldAs = async (profileType: string, heldImported: Array<{ name: string; address: string }>) => {
			networkReset.getPendingReset.mockResolvedValue({ networkId: "mine", running: false })
			networkReset.getStaleNetwork.mockResolvedValue({
				networkId: "mine",
				reset: { running: false, purged: true, doneCount: 0, imported: ["Savings", "Trading"], heldImported },
			})
			const wrapper = mountDetail()
			useAppStore().profile = { id: "p1", name: "Main", type: profileType } as never
			await flushPromises()
			await wrapper.get('[data-testid="network-delete-chain-btn"]').trigger("click")
			await flushPromises()
			return useCacheStore().confirm?.description
		}
		const held = [
			{ name: "Savings", address: "0xs" },
			{ name: "Trading", address: "0xt" },
		]
		const names = "It also deletes the imported accounts “Savings” and “Trading”."
		expect(await heldAs("password", held)).toBe(`${WIPES} ${names} Export them first.`)
		expect(await heldAs("passkey", held)).toBe(`${WIPES} ${names}`)
		expect(await heldAs("password", [])).toBe(`${WIPES} ${names}`)
	})

	test("its endpoints are held: rows inert, no edit or delete, Add disabled, and the reason line", async () => {
		holdMine(["Savings"])
		const wrapper = mountDetail()
		await flushPromises()
		expect(wrapper.get('[data-testid="endpoint-reset-held"]').text()).toBe(
			"My Chain’s reset is paused. Endpoints can be edited once it finishes.",
		)
		const rows = wrapper.findAll('[data-testid="endpoint-row"]')
		expect(rows.map((r) => r.attributes("data-clickable"))).toEqual(["false", "false"])
		expect(wrapper.find('[data-testid="endpoint-edit-btn"]').exists()).toBe(false)
		expect(wrapper.find('[data-testid="endpoint-delete-btn"]').exists()).toBe(false)
		expect(wrapper.get('[data-testid="endpoint-add-btn"]').attributes("disabled")).toBeDefined()
		await wrapper.findAll('[data-testid="endpoint-row"]')[1]!.trigger("click")
		expect(setPrimaryEndpoint).not.toHaveBeenCalled()
	})

	test("a reset of another network holds nothing here", async () => {
		networkReset.getPendingReset.mockResolvedValue({ networkId: "alpha", running: false })
		const wrapper = mountDetail()
		await flushPromises()
		expect(wrapper.find('[data-testid="endpoint-reset-held"]').exists()).toBe(false)
		expect(wrapper.findAll('[data-testid="endpoint-edit-btn"]')).toHaveLength(2)
		expect(wrapper.findAll('[data-testid="endpoint-row"]').map((r) => r.attributes("data-clickable"))).toEqual(["true", "true"])
		expect(wrapper.get('[data-testid="endpoint-add-btn"]').attributes("disabled")).toBeUndefined()
		await wrapper.findAll('[data-testid="endpoint-row"]')[1]!.trigger("click")
		expect(setPrimaryEndpoint).toHaveBeenCalledWith("mine", "m2")
	})

	test("a Delete chain clicked before the page's read lands still names the imported accounts", async () => {
		const release = holdFirstRead()
		holdMine(["Savings"])
		const wrapper = mountDetail()
		await flushPromises()
		expect(wrapper.find('[data-testid="endpoint-reset-held"]').exists()).toBe(false)
		await wrapper.get('[data-testid="network-delete-chain-btn"]').trigger("click")
		await flushPromises()
		expect(useCacheStore().confirm?.description).toBe(`${WIPES} It also deletes the imported account “Savings”.`)
		release({ networkId: "mine", running: false })
		await flushPromises()
	})

	test("a click-time read that fails opens no confirmation, only the failure toast", async () => {
		const release = holdFirstRead()
		const wrapper = mountDetail()
		await flushPromises()
		networkReset.getPendingReset.mockRejectedValueOnce(new Error("worker gone"))
		await wrapper.get('[data-testid="network-delete-chain-btn"]').trigger("click")
		await flushPromises()
		expect(useCacheStore().confirm?.description).toBeUndefined()
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to delete chain" })
		release(null)
		await flushPromises()
	})

	test("a click-time read that lands after the page unmounted opens nothing", async () => {
		const wrapper = mountDetail()
		await flushPromises()
		let release!: (pending: PendingReset | null) => void
		networkReset.getPendingReset.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve
				}),
		)
		await wrapper.get('[data-testid="network-delete-chain-btn"]').trigger("click")
		wrapper.unmount()
		release({ networkId: "mine", running: true })
		await flushPromises()
		expect(useCacheStore().confirm?.description).toBeUndefined()
		expect(openToast).not.toHaveBeenCalled()
	})

	test("a hold read for one network never shows on another the page moves to, and comes back with it", async () => {
		const release = holdFirstRead()
		holdMine(["Savings"])
		const wrapper = mountDetail()
		await flushPromises()
		routing.route.params.id = "alpha"
		await flushPromises()
		release({ networkId: "mine", running: false })
		await flushPromises()
		expect(wrapper.find('[data-testid="endpoint-reset-held"]').exists()).toBe(false)
		routing.route.params.id = "mine"
		await flushPromises()
		expect(wrapper.find('[data-testid="endpoint-reset-held"]').exists()).toBe(true)
	})

	test("the confirmation is unchanged with no imported account, or when the reset names another network", async () => {
		holdMine([])
		expect(await deleteConfirmText()).toBe(WIPES)
		networkReset.getPendingReset.mockResolvedValue({ networkId: "alpha", running: false })
		networkReset.getStaleNetwork.mockClear()
		expect(await deleteConfirmText()).toBe(WIPES)
		expect(networkReset.getStaleNetwork).not.toHaveBeenCalled()
	})
})

describe("Settings › Network detail — the live imported accounts Delete chain deletes", () => {
	const WIPES = "This wipes accounts, balances, tokens, and PXE state on this chain. This cannot be undone."
	/** Wire-shaped rows: `0x` + 64 hex, as the account service stores them. */
	const row = (name: string, type: AccountType, n: number): Account =>
		({
			profileId: "p1",
			chainId: MINE.chainId,
			address: `0x${n.toString(16).padStart(64, "0")}`,
			name,
			type,
			index: n,
			visible: n !== 3,
		}) as Account
	const confirmFor = async (profileType: string) => {
		const wrapper = mountDetail()
		useAppStore().profile = { id: "p1", name: "Main", type: profileType } as never
		await flushPromises()
		await wrapper.get('[data-testid="network-delete-chain-btn"]').trigger("click")
		await flushPromises()
		return useCacheStore().confirm?.description
	}

	test("names each imported account on the chain, a hidden one and two of one name included, and asks to export them", async () => {
		accounts.getAccounts.mockResolvedValue([
			row("Account 1", AccountType.Nulo_v1, 1),
			row("Savings", AccountType.Imported, 2),
			row("Savings", AccountType.Imported, 3),
		])
		expect(await confirmFor("passkey")).toBe(
			`${WIPES} It also deletes the imported accounts “Savings” and “Savings”. Export them first.`,
		)
		expect(accounts.getAccounts).toHaveBeenLastCalledWith("p1", MINE.chainId, true)

		accounts.getAccounts.mockResolvedValue([row("Savings", AccountType.Imported, 2)])
		expect(await confirmFor("password")).toBe(`${WIPES} It also deletes the imported account “Savings”. Export it first.`)
	})

	test("while another network's reset is pending, full backup refuses, so only a password profile is asked to export, and not from a stale chain", async () => {
		networkReset.getPendingReset.mockResolvedValue({ networkId: "alpha", running: false })
		accounts.getAccounts.mockResolvedValue([row("Savings", AccountType.Imported, 2)])
		expect(await confirmFor("password")).toBe(`${WIPES} It also deletes the imported account “Savings”. Export it first.`)
		expect(await confirmFor("passkey")).toBe(`${WIPES} It also deletes the imported account “Savings”.`)

		networkReset.getStaleNetwork.mockImplementation(async (id) => (id === "mine" ? { networkId: "mine", name: MINE.name } : null))
		expect(await confirmFor("password")).toBe(`${WIPES} It also deletes the imported account “Savings”.`)
	})

	test("Confirm deletes only what the confirmation named: an import made since reopens it naming the account", async () => {
		expect(await confirmFor("password")).toBe(WIPES)
		const appStore = useAppStore()
		accounts.getAccounts.mockResolvedValue([row("Savings", AccountType.Imported, 2)])
		await useCacheStore().confirm.callback?.()
		await flushPromises()
		expect(appStore.removeNetwork).not.toHaveBeenCalled()
		expect(useCacheStore().confirm.description).toBe(`${WIPES} It also deletes the imported account “Savings”. Export it first.`)

		await useCacheStore().confirm.callback?.()
		await flushPromises()
		expect(appStore.removeNetwork).toHaveBeenCalledWith(MINE)
	})

	test("a paused reset of this network names its own list, which already holds the live imports", async () => {
		networkReset.getPendingReset.mockResolvedValue({ networkId: "mine", running: false })
		networkReset.getStaleNetwork.mockResolvedValue({
			networkId: "mine",
			reset: { running: false, purged: true, doneCount: 0, imported: ["Savings"] },
		})
		accounts.getAccounts.mockResolvedValue([row("Savings", AccountType.Imported, 2)])
		expect(await confirmFor("passkey")).toBe(`${WIPES} It also deletes the imported account “Savings”.`)
		expect(accounts.getAccounts).not.toHaveBeenCalled()
	})

	test("a failed account read opens no confirmation, only the failure toast", async () => {
		accounts.getAccounts.mockRejectedValue(new Error("worker gone"))
		expect(await confirmFor("password")).toBeUndefined()
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to delete chain" })
	})
})
