import { deferred } from "@nulo/wallet-core/utils"
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import SettingsPageShell from "@/components/composite/SettingsPageShell.vue"
import { type Account, AccountType } from "@/wallet/services/account/client"
import type { PendingReset, StaleNetworkView } from "@/wallet/services/network-reset/client"
import { SWITCH_SETTLED_KEY } from "@/popup/network-switch"
import EndpointOrderList from "@/popup/components/modules/settings/endpoints/EndpointOrderList.vue"
import NetworkDetail from "./[id].vue"

const reorderEndpoints = vi.hoisted(() => vi.fn(async (_id: string, _ids: string[]): Promise<unknown> => undefined))
const getNetworks = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []))
const route = vi.hoisted(() => ({
	getRouteSnapshot: vi.fn(async (_id: string): Promise<unknown> => null),
	onRouteChanged: { add: vi.fn(), remove: vi.fn() },
	onConnected: { add: vi.fn(), remove: vi.fn() },
}))
const openToast = vi.hoisted(() => vi.fn())
const networkReset = vi.hoisted(() => ({
	getPendingReset: vi.fn(async (): Promise<PendingReset | null> => null),
	getStaleNetwork: vi.fn(async (_id: string): Promise<Partial<StaleNetworkView> | null> => null),
	onStaleNetworkChanged: { add: vi.fn(), remove: vi.fn() },
}))
const accounts = vi.hoisted(() => ({ getAccounts: vi.fn(async (_p: string, _c: number, _all: boolean): Promise<Account[]> => []) }))
vi.mock("@/utils/core", () => ({
	managers: {
		network: { getNetworks, setActiveNetwork: vi.fn(), getActiveNetwork: vi.fn(), reorderEndpoints, ...route },
		networkReset,
	},
	requireAccount: () => accounts,
}))
const activate = vi.hoisted(() => vi.fn(async (_target: unknown): Promise<string> => "activated"))
vi.mock("@/composables/useNetworkActivation", () => ({ useNetworkActivation: () => ({ activate }) }))
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
	reorderEndpoints.mockReset().mockResolvedValue(undefined)
	getNetworks.mockReset().mockResolvedValue([])
	route.getRouteSnapshot.mockReset().mockResolvedValue(null)
	route.onRouteChanged.add.mockClear()
	openToast.mockClear()
	activate.mockReset().mockResolvedValue("activated")
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

function mountDetail(shell: { settled?: () => Promise<boolean> } = {}) {
	const wrapper = mount(NetworkDetail, {
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			provide: { [SWITCH_SETTLED_KEY as symbol]: shell.settled ?? (async () => true) },
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
	appStore.isLogined = true
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

describe("Settings › Network detail — Set as active network", () => {
	test("announces the switch once the shell's switch run settles, naming the account whose address changed", async () => {
		const run = deferred<boolean>()
		const wrapper = mountDetail({ settled: () => run.promise })
		const appStore = useAppStore()
		appStore.profile = { id: "p1" } as never
		appStore.account = { profileId: "p1", chainId: ALPHA.chainId, name: "Account 1", address: "0xa1" } as never
		activate.mockImplementationOnce(async (target) => {
			appStore.network = target as never
			return "activated"
		})
		await flushPromises()
		await wrapper.get('[data-testid="network-set-active"]').trigger("click")
		await flushPromises()
		expect(activate).toHaveBeenCalledWith(MINE)
		expect(openToast).not.toHaveBeenCalled()
		appStore.account = { profileId: "p1", chainId: MINE.chainId, name: "Account 1", address: "0xc3" } as never
		run.resolve(true)
		await flushPromises()
		expect(openToast.mock.calls).toEqual([
			[{ kind: "success", label: "Active network updated", sub: "Account 1 has a different address on My Chain." }],
		])
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
		expect(reorderEndpoints).not.toHaveBeenCalled()
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
		await flushPromises()
		expect(reorderEndpoints).toHaveBeenCalledWith("mine", ["m2", "m1"])
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

	test("a Confirm whose read a newer Delete chain press overtook deletes nothing", async () => {
		const wrapper = mountDetail()
		const appStore = useAppStore()
		appStore.profile = { id: "p1", name: "Main", type: "password" } as never
		await flushPromises()
		const press = async () => {
			await wrapper.get('[data-testid="network-delete-chain-btn"]').trigger("click")
			await flushPromises()
		}
		await press()
		const older = useCacheStore().confirm.callback
		let answer: (rows: Account[]) => void = () => {}
		accounts.getAccounts.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
		const olderDone = older?.()
		await flushPromises()

		const named = `${WIPES} It also deletes the imported account “Savings”. Export it first.`
		accounts.getAccounts.mockResolvedValue([row("Savings", AccountType.Imported, 2)])
		await press()
		expect(useCacheStore().confirm.description).toBe(named)

		answer([])
		await olderDone
		await flushPromises()
		expect(appStore.removeNetwork).not.toHaveBeenCalled()
		expect(useCacheStore().confirm.description).toBe(named)
	})

	test("a lock during the click's read starts no account read", async () => {
		const wrapper = mountDetail()
		const appStore = useAppStore()
		appStore.profile = { id: "p1", name: "Main", type: "password" } as never
		await flushPromises()
		let answer: (pending: PendingReset | null) => void = () => {}
		networkReset.getPendingReset.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
		await wrapper.get('[data-testid="network-delete-chain-btn"]').trigger("click")
		appStore.isLogined = false
		answer(null)
		await flushPromises()
		expect(accounts.getAccounts).not.toHaveBeenCalled()
		expect(useCacheStore().confirm?.description).toBeUndefined()
	})

	test("a read answering after the lock opens no confirmation naming the imports, and deletes nothing", async () => {
		const wrapper = mountDetail()
		const appStore = useAppStore()
		appStore.profile = { id: "p1", name: "Main", type: "password" } as never
		await flushPromises()
		const lockDuring = async (act: () => unknown) => {
			let answer: (rows: Account[]) => void = () => {}
			accounts.getAccounts.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
			const done = act()
			await flushPromises()
			appStore.isLogined = false
			answer([row("Savings", AccountType.Imported, 2)])
			await done
			await flushPromises()
			appStore.isLogined = true
		}
		await lockDuring(() => wrapper.get('[data-testid="network-delete-chain-btn"]').trigger("click"))
		expect(useCacheStore().confirm?.description).toBeUndefined()

		await wrapper.get('[data-testid="network-delete-chain-btn"]').trigger("click")
		await flushPromises()
		expect(useCacheStore().confirm.description).toBe(WIPES)
		const confirm = useCacheStore().confirm.callback
		await lockDuring(() => confirm?.())
		expect(useCacheStore().confirm.description).toBe(WIPES)
		expect(appStore.removeNetwork).not.toHaveBeenCalled()
	})

	test("a failed account read opens no confirmation, only the failure toast", async () => {
		accounts.getAccounts.mockRejectedValue(new Error("worker gone"))
		expect(await confirmFor("password")).toBeUndefined()
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to delete chain" })
	})
})

describe("Settings › Network detail — the endpoint order", () => {
	const THREE = { ...MINE, profileId: "p1", endpoints: [...MINE.endpoints, { id: "m3", rpcUrl: "https://m3/" }] }
	const stored = (ids: string[]) => ({
		...THREE,
		endpoints: ids.map((id) => THREE.endpoints.find((e) => e.id === id)),
		primaryEndpointId: ids[0],
	})
	const READ = {
		activeId: "m1",
		endpoints: [
			{ id: "m1", state: "ready", since: 1 },
			{ id: "m2", state: "down", since: 1, failure: "unreachable" },
		],
	}

	async function mountThree() {
		const wrapper = mountDetail()
		useAppStore().networks = [ALPHA, THREE] as never
		await flushPromises()
		return wrapper
	}
	const list = (w: ReturnType<typeof mountDetail>) => w.findComponent(EndpointOrderList)
	const shown = (w: ReturnType<typeof mountDetail>) => (list(w).props("endpoints") as { id: string }[]).map((e) => e.id)
	const move = async (w: ReturnType<typeof mountDetail>, ids: string[]) => {
		list(w).vm.$emit("reorder", ids)
		await flushPromises()
	}

	test("a move among the fallbacks shows at once, writes the whole order once, and toasts nothing", async () => {
		const written = deferred<unknown>()
		reorderEndpoints.mockReturnValueOnce(written.promise)
		getNetworks.mockResolvedValue([ALPHA, stored(["m1", "m3", "m2"])])
		const wrapper = await mountThree()
		await move(wrapper, ["m1", "m3", "m2"])
		expect(shown(wrapper)).toEqual(["m1", "m3", "m2"])
		written.resolve(undefined)
		await flushPromises()
		expect(reorderEndpoints.mock.calls).toEqual([["mine", ["m1", "m3", "m2"]]])
		expect(shown(wrapper)).toEqual(["m1", "m3", "m2"])
		expect(openToast).not.toHaveBeenCalled()
	})

	test("a move that changes the first row keeps the primary's toast", async () => {
		getNetworks.mockResolvedValue([ALPHA, stored(["m2", "m1", "m3"])])
		const wrapper = await mountThree()
		await move(wrapper, ["m2", "m1", "m3"])
		expect(openToast.mock.calls).toEqual([[{ kind: "success", label: "Primary endpoint updated" }]])
	})

	test("a failed write re-reads the row and says which write failed", async () => {
		reorderEndpoints.mockRejectedValue(new Error("Invalid endpoint order"))
		getNetworks.mockResolvedValue([ALPHA, THREE])
		const wrapper = await mountThree()
		await move(wrapper, ["m1", "m3", "m2"])
		await move(wrapper, ["m3", "m1", "m2"])
		expect(getNetworks).toHaveBeenCalledTimes(2)
		expect(shown(wrapper)).toEqual(["m1", "m2", "m3"])
		expect(openToast.mock.calls).toEqual([
			[{ kind: "error", label: "Failed to update the endpoint order" }],
			[{ kind: "error", label: "Failed to update primary endpoint" }],
		])
	})

	test("moves are written one at a time, in the order made, and the last one stays shown", async () => {
		const first = deferred<unknown>()
		const second = deferred<unknown>()
		reorderEndpoints.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		getNetworks.mockResolvedValueOnce([ALPHA, stored(["m1", "m3", "m2"])]).mockResolvedValue([ALPHA, stored(["m3", "m1", "m2"])])
		const wrapper = await mountThree()
		await move(wrapper, ["m1", "m3", "m2"])
		await move(wrapper, ["m3", "m1", "m2"])
		expect(reorderEndpoints).toHaveBeenCalledTimes(1)
		first.resolve(undefined)
		await flushPromises()
		expect(shown(wrapper), "the first write landing never shows its order over the later move's").toEqual(["m3", "m1", "m2"])
		second.resolve(undefined)
		await flushPromises()
		expect(shown(wrapper)).toEqual(["m3", "m1", "m2"])
		expect(reorderEndpoints.mock.calls.map(([, ids]) => ids)).toEqual([
			["m1", "m3", "m2"],
			["m3", "m1", "m2"],
		])
	})

	test("a row moved first while down carries the line once the write lands, until the router finds it answering", async () => {
		route.getRouteSnapshot.mockResolvedValueOnce(READ).mockResolvedValue(null)
		getNetworks.mockResolvedValue([ALPHA, stored(["m2", "m1", "m3"])])
		const written = deferred<unknown>()
		reorderEndpoints.mockReturnValueOnce(written.promise)
		const wrapper = await mountThree()
		await move(wrapper, ["m2", "m1", "m3"])
		expect(list(wrapper).props("warning")).toBeNull()
		written.resolve(undefined)
		await flushPromises()
		expect(list(wrapper).props("warning")).toEqual({
			id: "m2",
			text: "This endpoint was not answering. The wallet will try another if needed.",
		})

		route.getRouteSnapshot.mockResolvedValue({ activeId: "m2", endpoints: [{ id: "m2", state: "ready", since: 2 }] })
		const changed = route.onRouteChanged.add.mock.calls[0]?.[0] as (c: { profileId: string; chainId: number }) => void
		changed({ profileId: "p1", chainId: THREE.chainId })
		await flushPromises()
		expect(list(wrapper).props("warning")).toBeNull()
	})

	test("a move among the fallbacks keeps the line, and a later one queued behind its write does not cost it", async () => {
		route.getRouteSnapshot.mockResolvedValueOnce(READ).mockResolvedValue(null)
		getNetworks.mockResolvedValueOnce([ALPHA, stored(["m2", "m1", "m3"])]).mockResolvedValue([ALPHA, stored(["m2", "m3", "m1"])])
		const written = deferred<unknown>()
		reorderEndpoints.mockReturnValueOnce(written.promise)
		const wrapper = await mountThree()
		await move(wrapper, ["m2", "m1", "m3"])
		await move(wrapper, ["m2", "m3", "m1"])
		written.resolve(undefined)
		await flushPromises()
		expect(shown(wrapper)).toEqual(["m2", "m3", "m1"])
		expect(list(wrapper).props("warning")).toEqual({
			id: "m2",
			text: "This endpoint was not answering. The wallet will try another if needed.",
		})
	})

	test("a write that landed is not reported failed when the re-read after it fails", async () => {
		getNetworks.mockRejectedValue(new Error("port closed"))
		const wrapper = await mountThree()
		await move(wrapper, ["m2", "m1", "m3"])
		expect(openToast.mock.calls).toEqual([[{ kind: "success", label: "Primary endpoint updated" }]])
	})

	test("a row that was answering, or a move among the fallbacks, carries no line", async () => {
		route.getRouteSnapshot.mockResolvedValue(READ)
		getNetworks.mockResolvedValueOnce([ALPHA, stored(["m1", "m3", "m2"])]).mockResolvedValue([ALPHA, stored(["m3", "m1", "m2"])])
		const wrapper = await mountThree()
		await move(wrapper, ["m1", "m3", "m2"])
		await move(wrapper, ["m3", "m1", "m2"])
		expect(list(wrapper).props("warning")).toBeNull()
	})

	test("the primary first, then the rest as stored; a row whose primary is missing still lists every endpoint", async () => {
		const wrapper = mountDetail()
		useAppStore().networks = [ALPHA, { ...THREE, primaryEndpointId: "m3" }] as never
		await flushPromises()
		expect(shown(wrapper)).toEqual(["m3", "m1", "m2"])
		useAppStore().networks = [ALPHA, { ...THREE, primaryEndpointId: "gone" }] as never
		await flushPromises()
		expect(shown(wrapper)).toEqual(["m1", "m2", "m3"])
	})

	test("the route read reaches the edit sheet through the cache store, and leaves with the page", async () => {
		route.getRouteSnapshot.mockResolvedValue(READ)
		const wrapper = await mountThree()
		expect(route.getRouteSnapshot).toHaveBeenLastCalledWith(
			"mine",
			THREE.endpoints.map(({ id, rpcUrl }) => ({ id, rpcUrl })),
		)
		expect(useCacheStore().endpointRoute).toMatchObject({ networkId: "mine", snapshot: READ })
		wrapper.unmount()
		expect(useCacheStore().endpointRoute).toBeNull()
		expect(route.onRouteChanged.remove).toHaveBeenCalledWith(route.onRouteChanged.add.mock.calls[0]?.[0])
	})
})
