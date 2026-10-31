/**
 * History hands the arrival coordinator its reads and its rendered receipts: the list's rows are
 * assigned only under a loaded arrival state, each incoming row is judged by the injected
 * `isArriving`, and the incoming rows are presented after the render that showed them. Its received
 * rows resolve their token for the current profile and network, however the page was opened.
 */
import { deferred } from "@nulo/wallet-core/utils"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ref } from "vue"
import { createMemoryHistory, createRouter, type Router } from "vue-router"

import { createAppStoreHarness } from "../../../tests/helpers/app-store-harness"
import { TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"

const H = vi.hoisted(() => {
	const event = () => ({ add: () => {}, remove: () => {} })
	/** Emitting hands back what each handler returned, so a case can await a handler's promise. */
	const bus = () => {
		const handlers = new Set<(x?: unknown) => unknown>()
		return {
			add: (fn: (x?: unknown) => unknown) => handlers.add(fn),
			remove: (fn: (x?: unknown) => unknown) => handlers.delete(fn),
			emit: (x?: unknown) => [...handlers].map((fn) => fn(x)),
			handlers,
		}
	}
	const handlers = new Set<() => void>()
	const tokenAddedHandlers = new Set<() => void>()
	return {
		tokenAddedHandlers,
		event,
		incomingConnected: { add: (fn: () => void) => handlers.add(fn), remove: (fn: () => void) => handlers.delete(fn), handlers },
		journal: { connected: bus(), added: bus(), updated: bus(), deleted: bus() },
		getIncomingTransfers: vi.fn(),
		getOperations: vi.fn(),
		getTokens: vi.fn(),
		tokenAdded: {
			add: (fn: () => void) => tokenAddedHandlers.add(fn),
			remove: (fn: () => void) => tokenAddedHandlers.delete(fn),
		},
		quotes: {} as Record<string, unknown>,
		store: { current: null as unknown as ReturnType<typeof createAppStoreHarness> },
	}
})

vi.mock("@/wallet/services/transaction/client", () => ({
	TransactionServiceClient: vi.fn(function () {
		return { disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/operation-journal/client", () => ({
	OperationJournalServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onConnected: H.journal.connected,
			onOperationAdded: H.journal.added,
			onOperationUpdated: H.journal.updated,
			onOperationDeleted: H.journal.deleted,
			getOperations: H.getOperations,
		}
	}),
}))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return { disconnect: vi.fn(), onTokenAdded: H.tokenAdded, onTokenUpdated: H.event(), getTokens: H.getTokens }
	}),
}))
vi.mock("@/wallet/services/incoming-transfer/client", () => ({
	IncomingTransferServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onIncomingTransferAdded: H.event(),
			onIncomingTransferUpdated: H.event(),
			onIncomingTransferDeleted: H.event(),
			onConnected: H.incomingConnected,
			getIncomingTransfers: H.getIncomingTransfers,
		}
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return { connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn(), onUpdate: H.event() }
	}),
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: H.event(),
			onConnected: H.event(),
			getQuotes: vi.fn(async () => ({ quotes: {}, pricedTokens: TEST_PRICED_TOKENS })),
			refreshIfStale: async () => ({ quotes: H.quotes, pricedTokens: TEST_PRICED_TOKENS }),
		}
	}),
}))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => H.store.current }))

import { ARRIVALS_KEY } from "@/composables/useArrivals"
import { CHAIN_IDS } from "@/utils/chain-ids"
import TransactionsList from "../components/modules/activity/TransactionsList.vue"
import Activity from "./activity.vue"

const record = (key: string, discoveredAt: number) => ({
	kind: "note",
	id: `note:p1|net-1|${key}`,
	profileId: "p1",
	accountAddress: "0xacct",
	networkId: "net-1",
	tokenId: undefined,
	amountRaw: "1",
	txHash: "0xh",
	discoveredAt,
})

let heroCallback: IntersectionObserverCallback | undefined
let router: Router

async function historyAt(path: string): Promise<Router> {
	const memory = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: "/popup/activity", component: { render: () => null } }],
	})
	await memory.push(path)
	return memory
}

/** One observer delivery carrying a hero entry per value, oldest first, as a fast scroll batches them. */
async function deliverHero(...intersecting: boolean[]) {
	heroCallback?.(
		intersecting.map((isIntersecting) => ({ isIntersecting }) as IntersectionObserverEntry),
		{} as IntersectionObserver,
	)
	await flushPromises()
}

const barShown = (w: { get: (selector: string) => { element: Element } }) =>
	(w.get('[data-testid="page-title-bar"]').element.parentElement?.className ?? "").includes("page_title_bar_visible")

beforeEach(async () => {
	router = await historyAt("/popup/activity")
	H.tokenAddedHandlers.clear()
	H.getIncomingTransfers.mockReset().mockResolvedValue([])
	H.getOperations.mockReset().mockResolvedValue([])
	H.getTokens.mockReset().mockResolvedValue([])
	H.incomingConnected.handlers.clear()
	for (const ev of Object.values(H.journal)) ev.handlers.clear()
	H.quotes = {}
	H.store.current = createAppStoreHarness()
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			constructor(callback: IntersectionObserverCallback) {
				heroCallback = callback
			}
			observe() {}
			disconnect() {}
		},
	)
})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("pages/activity — arrivals", () => {
	test("the receipts paint only under a loaded arrival state, the list judges each one, and they are presented", async () => {
		const first = record("a", 2000)
		const second = record("b", 1000)
		H.getIncomingTransfers.mockResolvedValue([first, second])
		let finishLoad = () => {}
		const arrivals = {
			isArriving: vi.fn(),
			present: vi.fn(),
			latest: ref(null),
			load: vi.fn(
				() =>
					new Promise<void>((resolve) => {
						finishLoad = resolve
					}),
			),
		}
		const w = mount(Activity, {
			shallow: true,
			global: {
				plugins: [router],
				stubs: { Flex: { template: "<div><slot /></div>" } },
				provide: { [ARRIVALS_KEY as symbol]: arrivals },
			},
		})
		await flushPromises()
		expect(arrivals.load).toHaveBeenCalledWith({ profileId: "p1", networkId: "net-1", account: "0xacct" })
		expect(w.findComponent(TransactionsList).exists()).toBe(false)

		finishLoad()
		await flushPromises()
		const list = w.findComponent(TransactionsList)
		expect(list.props("isArriving")).toBe(arrivals.isArriving)
		expect(list.props("rows").map((row: { key: string }) => row.key)).toEqual([`incoming:${first.id}`, `incoming:${second.id}`])
		expect(arrivals.present).toHaveBeenLastCalledWith([first, second])
	})
})

describe("pages/activity — cancelled and failed operations by network", () => {
	test("each network lists only its own operations, and a switch swaps them", async () => {
		const op = (id: string, networkId: string, terminalAt: number) => ({
			id,
			kind: "transfer",
			origin: "popup",
			profileId: "p1",
			accountAddress: "0xacct",
			networkId,
			progress: { stage: "cancelled" },
			error: null,
			terminalAt,
			createdAt: 0,
			updatedAt: terminalAt,
		})
		H.getOperations.mockResolvedValue([op("here", "net-1", 2000), op("there", "net-2", 1000)])
		const w = mount(Activity, {
			shallow: true,
			global: {
				plugins: [router],
				stubs: { Flex: { template: "<div><slot /></div>" } },
			},
		})
		await flushPromises()
		const keys = () =>
			w
				.findComponent(TransactionsList)
				.props("rows")
				.map((row: { key: string }) => row.key)
		expect(keys()).toEqual(["journal:here"])

		H.store.current.network = { id: "net-2", chainId: 2 }
		await flushPromises()
		expect(keys()).toEqual(["journal:there"])
	})
})

describe("pages/activity — the cancelled and failed list's events and reads", () => {
	const op = (id: string, over: Record<string, unknown> = {}) => ({
		id,
		kind: "transfer",
		origin: "popup",
		profileId: "p1",
		accountAddress: "0xacct",
		networkId: "net-1",
		progress: { stage: "cancelled" },
		error: null,
		terminalAt: 2000,
		createdAt: 0,
		updatedAt: 2000,
		...over,
	})
	const mountActivity = () =>
		mount(Activity, { shallow: true, global: { plugins: [router], stubs: { Flex: { template: "<div><slot /></div>" } } } })
	const keys = (w: ReturnType<typeof mountActivity>) => {
		const list = w.findComponent(TransactionsList)
		return list.exists() ? list.props("rows").map((row: { key: string }) => row.key) : []
	}

	test("a new or re-added row leads, an update keeps a listed row in place, and a refused add changes nothing", async () => {
		// One end time for every row: the list's stable sort then shows the mirror's own order.
		H.getOperations.mockResolvedValue([op("x")])
		const w = mountActivity()
		await flushPromises()
		H.journal.added.emit(op("running", { terminalAt: null, progress: { stage: "proving" } }))
		H.journal.added.emit(op("late"))
		await flushPromises()
		expect(keys(w)).toEqual(["journal:late", "journal:x"])

		H.journal.added.emit(op("x"))
		H.journal.updated.emit(op("late", { progress: { stage: "failed" } }))
		H.journal.updated.emit(op("unseen"))
		await flushPromises()
		expect(keys(w)).toEqual(["journal:unseen", "journal:x", "journal:late"])
		w.unmount()
	})

	test("an update it refuses keeps the row where it is, and a later terminal one replaces it", async () => {
		H.getOperations.mockResolvedValue([op("x"), op("y")])
		const w = mountActivity()
		await flushPromises()
		expect(keys(w)).toEqual(["journal:x", "journal:y"])

		// A non-terminal update delivered after the read that saw the record end.
		H.journal.updated.emit(op("y", { terminalAt: null, progress: { stage: "proving" } }))
		await flushPromises()
		expect(keys(w)).toEqual(["journal:x", "journal:y"])
		H.journal.updated.emit(op("y"))
		H.journal.deleted.emit(op("x"))
		await flushPromises()
		expect(keys(w)).toEqual(["journal:y"])
		w.unmount()
	})

	test("a reconnect's read supersedes the mount's, and a refused one is read again after 2 s", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		try {
			const mountRead = deferred<unknown[]>()
			const reconnectRead = deferred<unknown[]>()
			H.getOperations.mockReturnValueOnce(mountRead.promise).mockReturnValueOnce(reconnectRead.promise)
			const w = mountActivity()
			await flushPromises()
			const [reconnect] = H.journal.connected.emit()
			mountRead.resolve([op("x")])
			await flushPromises()
			expect(keys(w)).toEqual([])

			reconnectRead.reject(new Error("port closed"))
			await expect(reconnect).rejects.toThrow("port closed")
			await flushPromises()
			expect(keys(w)).toEqual([])

			H.getOperations.mockResolvedValueOnce([op("x"), op("y", { terminalAt: 1000 })])
			await vi.advanceTimersByTimeAsync(2_000)
			expect(keys(w)).toEqual(["journal:x", "journal:y"])
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	// History has no journal scope watcher: a retry reads whatever profile is live when it fires.
	test("a retry armed under one profile reads the live one; one that finds no profile reads nothing and stops", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		try {
			const w = mountActivity()
			await flushPromises()
			H.getOperations.mockRejectedValueOnce(new Error("port closed"))
			const [reconnect] = H.journal.connected.emit()
			await expect(reconnect).rejects.toThrow("port closed")

			H.store.current.profile = { ...H.store.current.profile, id: "p2" } as never
			H.getOperations.mockRejectedValueOnce(new Error("port closed"))
			await vi.advanceTimersByTimeAsync(2_000)
			expect(H.getOperations).toHaveBeenLastCalledWith({ profileId: "p2", isTerminal: true })

			const reads = H.getOperations.mock.calls.length
			const profile = H.store.current.profile
			H.store.current.profile = null as never
			await vi.advanceTimersByTimeAsync(2_000)
			H.store.current.profile = profile
			await vi.advanceTimersByTimeAsync(10_000)
			expect(H.getOperations).toHaveBeenCalledTimes(reads)
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("pages/activity — the received row's token", () => {
	const TEST_USDC = TEST_TOKENS.USDC
	const TESTNET = { id: "net-1", chainId: CHAIN_IDS.TESTNET }
	const TST = { id: 7, chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC, name: "Test", symbol: "TST", decimals: 18, hasDecimals: true }
	const USDC_QUOTE = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
	const receipt = (over: Record<string, unknown> = {}) => ({
		...record("r", 1000),
		tokenId: TST.id,
		contract: TEST_USDC,
		amountRaw: (1000n * 10n ** 18n).toString(),
		...over,
	})

	const mountHistory = (errorHandler?: (error: unknown) => void) =>
		mount(Activity, {
			global: {
				plugins: [router],
				stubs: {
					Flex: { template: "<div><slot /></div>" },
					TransactionCardLayout: {
						props: ["title", "amount", "amountFiat"],
						template: `<div data-testid="row"><span class="title">{{ title }}</span><span class="amount">{{ amount }}</span><span class="fiat">{{ amountFiat }}</span></div>`,
					},
				},
				config: errorHandler ? { errorHandler } : {},
			},
		})
	const rowOf = (w: ReturnType<typeof mountHistory>) => {
		const row = w.find('[data-testid="row"]')
		expect(row.exists()).toBe(true)
		return { title: row.find(".title").text(), amount: row.find(".amount").text(), fiat: row.find(".fiat").text() }
	}

	test("opened before the network is known: once it is, the row reads the token, +1,000 and its dollar value", async () => {
		H.store.current = createAppStoreHarness({ network: null })
		H.getTokens.mockResolvedValue([TST])
		H.getIncomingTransfers.mockResolvedValue([receipt()])
		H.quotes = USDC_QUOTE
		const w = mountHistory()
		await flushPromises()
		expect(w.find('[data-testid="row"]').exists()).toBe(false)

		H.store.current.network = TESTNET
		await flushPromises()
		expect(rowOf(w)).toEqual({ title: "TST", amount: "+1,000", fiat: "≈ $1,000.00" })
	})

	test("a network switch reloads the token map for the new network", async () => {
		const OTHER = { ...TST, id: 9, contract: "0xother", symbol: "OTH" }
		H.store.current = createAppStoreHarness({ network: TESTNET })
		H.getTokens.mockImplementation(async (_profileId: string, chainId: number) => (chainId === CHAIN_IDS.TESTNET ? [TST] : [OTHER]))
		H.getIncomingTransfers.mockImplementation(async (_profileId: string, networkId: string) =>
			networkId === "net-1" ? [receipt()] : [receipt({ id: "note:p1|net-2|o", networkId: "net-2", tokenId: 9, contract: "0xother" })],
		)
		const w = mountHistory()
		await flushPromises()
		expect(rowOf(w).title).toBe("TST")

		H.store.current.network = { id: "net-2", chainId: 2 }
		await flushPromises()
		expect(H.getTokens).toHaveBeenLastCalledWith("p1", 2)
		expect(rowOf(w).title).toBe("OTH")
	})

	test("on the local network, whose chain id is 0, the row still resolves its token", async () => {
		H.store.current = createAppStoreHarness({ network: { id: "net-1", chainId: CHAIN_IDS.SANDBOX } })
		H.getTokens.mockResolvedValue([TST])
		H.getIncomingTransfers.mockResolvedValue([receipt()])
		const w = mountHistory()
		await flushPromises()
		expect(H.getTokens).toHaveBeenCalledWith("p1", CHAIN_IDS.SANDBOX)
		expect(rowOf(w)).toMatchObject({ title: "TST", amount: "+1,000" })
	})

	test("a journal read that rejects at mount does not hold back the row's token", async () => {
		const errorHandler = vi.fn()
		H.store.current = createAppStoreHarness({ network: TESTNET })
		H.getOperations.mockRejectedValue(new Error("port cannot open"))
		H.getTokens.mockResolvedValue([TST])
		H.getIncomingTransfers.mockResolvedValue([receipt()])
		H.quotes = USDC_QUOTE
		const w = mountHistory(errorHandler)
		await flushPromises()
		for (const read of [...H.incomingConnected.handlers]) read()
		await flushPromises()

		expect(errorHandler).toHaveBeenCalledWith(
			expect.objectContaining({ message: "port cannot open" }),
			expect.anything(),
			expect.anything(),
		)
		expect(rowOf(w)).toEqual({ title: "TST", amount: "+1,000", fiat: "≈ $1,000.00" })
		w.unmount()
	})
})

describe("pages/activity — the incoming load signal", () => {
	test("the feed root carries data-incoming-loaded only once the incoming read has landed", async () => {
		let release!: (rows: unknown[]) => void
		H.getIncomingTransfers.mockReturnValue(new Promise((resolve) => (release = resolve)))
		const w = mount(Activity, {
			shallow: true,
			global: {
				plugins: [router],
				stubs: { Flex: { template: "<div><slot /></div>" } },
			},
		})
		await flushPromises()
		const root = () => w.find('[data-testid="activity-feed-root"]')
		expect(root().exists()).toBe(true)
		expect(root().attributes("data-incoming-loaded")).toBeUndefined()

		release([])
		await flushPromises()
		expect(root().attributes("data-incoming-loaded")).toBe("true")
	})
})

describe("pages/activity — the title", () => {
	test("a screen reader meets the title once: the compact bar is hidden from it, the hero title is not", async () => {
		const w = mount(Activity, {
			shallow: true,
			global: {
				plugins: [router],
				stubs: { Flex: { template: "<div><slot /></div>" } },
			},
		})
		await flushPromises()
		expect(w.get('[data-testid="page-title-bar"]').element.parentElement?.getAttribute("aria-hidden")).toBe("true")
		expect(w.get('[data-testid="page-hero-title"]').element.closest('[aria-hidden="true"]')).toBeNull()
	})

	const mountTitled = async () => {
		const w = mount(Activity, {
			shallow: true,
			global: {
				plugins: [router],
				stubs: { Flex: { template: "<div><slot /></div>" } },
			},
		})
		await flushPromises()
		return w
	}

	test("the compact bar shows when a batched delivery ends with the hero gone", async () => {
		const w = await mountTitled()
		await deliverHero(true, false)
		expect(barShown(w)).toBe(true)
	})

	test("the compact bar hides when a batched delivery ends with the hero back", async () => {
		const w = await mountTitled()
		await deliverHero(false, true)
		expect(barShown(w)).toBe(false)
	})
	test("the first report draws the bar at once, its state committed before the fade comes back; later reports fade", async () => {
		const w = await mountTitled()
		const bar = w.get('[data-testid="page-title-bar"]').element.parentElement as HTMLElement
		expect(bar.className).toContain("page_title_bar_instant")
		const read = window.getComputedStyle.bind(window)
		const readWith: string[] = []
		vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
			if (el === bar) readWith.push(bar.className)
			return read(el, pseudo)
		})
		await deliverHero(false)
		expect(readWith).toHaveLength(1)
		expect(readWith[0]).toContain("page_title_bar_visible")
		expect(readWith[0]).toContain("page_title_bar_instant")
		expect(barShown(w)).toBe(true)
		expect(bar.className).not.toContain("page_title_bar_instant")

		await deliverHero(true)
		await deliverHero(false)
		expect(barShown(w)).toBe(true)
		expect(bar.className).not.toContain("page_title_bar_instant")
		expect(readWith).toHaveLength(1)
	})
})

describe("pages/activity — opened from a token page", () => {
	const USDC = { id: 1, chainId: 1, contract: "0xusdc", name: "USD Coin", symbol: "USDC", decimals: 6, hasDecimals: true }
	const EURC = { id: 2, chainId: 1, contract: "0xeurc", name: "Euro Coin", symbol: "EURC", decimals: 6, hasDecimals: true }
	const txOn = (hash: string, contract: string, createdAt: number) => ({
		hash,
		account: "0xacct",
		chainId: 1,
		profileId: "p1",
		createdAt,
		calls: [{ contract }],
	})
	const opOn = (id: string, tokenId: number, terminalAt: number) => ({
		id,
		kind: "transfer",
		origin: "popup",
		profileId: "p1",
		accountAddress: "0xacct",
		networkId: "net-1",
		tokenId,
		progress: { stage: "cancelled" },
		error: null,
		terminalAt,
		createdAt: 0,
		updatedAt: terminalAt,
	})
	const usdcIn = { ...record("u", 4000), tokenId: 1 }
	const eurcIn = { ...record("e", 3000), tokenId: 2 }
	const stubs = {
		Flex: { template: "<div><slot /></div>" },
		Badge: { template: "<div><slot /></div>" },
		RowAction: {
			props: ["label"],
			emits: ["click"],
			template: `<button :aria-label="label" @click="$emit('click')"><slot /></button>`,
		},
	}

	let arrivals: { isArriving: ReturnType<typeof vi.fn>; present: ReturnType<typeof vi.fn>; latest: unknown; load: () => Promise<void> }

	beforeEach(() => {
		H.store.current.transactions = [txOn("0xu", "0xusdc", 6000), txOn("0xe", "0xeurc", 5000)] as never
		H.getOperations.mockResolvedValue([opOn("ju", 1, 2000), opOn("je", 2, 1000)])
		H.getIncomingTransfers.mockResolvedValue([usdcIn, eurcIn])
		H.getTokens.mockResolvedValue([USDC, EURC])
		arrivals = { isArriving: vi.fn(() => true), present: vi.fn(), latest: ref(null), load: async () => {} }
	})

	async function openHistory(path: string) {
		router = await historyAt(path)
		const w = mount(Activity, {
			shallow: true,
			attachTo: document.body,
			global: { plugins: [router], stubs, provide: { [ARRIVALS_KEY as symbol]: arrivals } },
		})
		await flushPromises()
		return w
	}
	const keys = (w: Awaited<ReturnType<typeof openHistory>>) =>
		w
			.findComponent(TransactionsList)
			.props("rows")
			.map((row: { key: string }) => row.key)
	const ALL = ["tx:0xu", "tx:0xe", `incoming:${usdcIn.id}`, `incoming:${eurcIn.id}`, "journal:ju", "journal:je"]

	test("shows that token's txs, operations and receipts, never another token's", async () => {
		const w = await openHistory("/popup/activity?token=1")
		expect(keys(w)).toEqual(["tx:0xu", `incoming:${usdcIn.id}`, "journal:ju"])
		expect(router.currentRoute.value.fullPath).toBe("/popup/activity?token=1")
		w.unmount()
	})

	test("paints neither rows nor the empty state, and presents nothing, until the token list is read", async () => {
		let answer!: (tokens: unknown[]) => void
		H.getTokens.mockReturnValue(new Promise((resolve) => (answer = resolve)))
		const w = await openHistory("/popup/activity?token=1")
		expect(w.findComponent(TransactionsList).exists()).toBe(false)
		expect(w.text()).not.toContain("No transactions yet")
		expect(arrivals.present.mock.calls.flat(2)).toEqual([])

		answer([USDC, EURC])
		await flushPromises()
		expect(keys(w)).toEqual(["tx:0xu", `incoming:${usdcIn.id}`, "journal:ju"])
		expect(arrivals.present).toHaveBeenLastCalledWith([usdcIn])
		w.unmount()
	})

	test.each([
		["a token the scope does not hold", () => H.getTokens.mockResolvedValue([EURC])],
		["a token list that could not be read", () => H.getTokens.mockRejectedValue(new Error("port cannot open"))],
	])("%s drops the query and shows all activity", async (_case, arrange) => {
		vi.spyOn(console, "debug").mockImplementation(() => {})
		arrange()
		const w = await openHistory("/popup/activity?token=1")
		expect(router.currentRoute.value.fullPath).toBe("/popup/activity")
		expect(keys(w)).toEqual(ALL)
		expect(w.find('[data-testid="activity-token-filter"]').exists()).toBe(false)
		w.unmount()
	})

	test("a failed refresh after the token resolved keeps the filter", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => {})
		const w = await openHistory("/popup/activity?token=1")
		H.getTokens.mockRejectedValue(new Error("port cannot open"))
		for (const reload of [...H.tokenAddedHandlers]) reload()
		await flushPromises()

		expect(router.currentRoute.value.fullPath).toBe("/popup/activity?token=1")
		expect(keys(w)).toEqual(["tx:0xu", `incoming:${usdcIn.id}`, "journal:ju"])
		w.unmount()
	})

	test.each(["0x1", "1e0", "-1", "0", "1.0", "9007199254740993"])("?token=%s is no filter", async (raw) => {
		const w = await openHistory(`/popup/activity?token=${raw}`)
		expect(keys(w)).toEqual(ALL)
		expect(w.find('[data-testid="activity-token-filter"]').exists()).toBe(false)
		w.unmount()
	})

	test("a repeated ?token= is no filter", async () => {
		const w = await openHistory("/popup/activity?token=1&token=2")
		expect(keys(w)).toEqual(ALL)
		w.unmount()
	})

	test("the chip of a token whose symbol is blank reads the empty-value dash", async () => {
		H.getTokens.mockResolvedValue([{ ...USDC, symbol: "   " }, EURC])
		const w = await openHistory("/popup/activity?token=1")
		expect(w.get('[data-testid="activity-token-filter-symbol"]').text()).toBe("—")
		w.unmount()
	})

	test("the chip names the token without its control characters; clearing it shows everything and focuses the title", async () => {
		H.getTokens.mockResolvedValue([{ ...USDC, symbol: "\u202EUS\u200BDC" }, EURC])
		const w = await openHistory("/popup/activity?token=1")
		expect(w.get('[data-testid="activity-token-filter-symbol"]').text()).toBe("USDC")
		const clear = w.get('[data-testid="activity-token-filter-clear"]')
		expect(clear.attributes("aria-label")).toBe("Show all activity")

		await clear.trigger("click")
		await flushPromises()
		expect(router.currentRoute.value.fullPath).toBe("/popup/activity")
		expect(keys(w)).toEqual(ALL)
		expect(w.find('[data-testid="activity-token-filter"]').exists()).toBe(false)
		expect(document.activeElement).toBe(w.get('[data-testid="page-hero-title"]').element)
		w.unmount()
	})

	test("a token with no activity shows its chip over the empty state", async () => {
		H.store.current.transactions = []
		H.getOperations.mockResolvedValue([])
		H.getIncomingTransfers.mockResolvedValue([eurcIn])
		const w = await openHistory("/popup/activity?token=1")
		expect(w.find('[data-testid="activity-token-filter"]').exists()).toBe(true)
		expect(w.findComponent(TransactionsList).exists()).toBe(false)
		expect(w.text()).toContain("No transactions yet")
		expect(arrivals.present).not.toHaveBeenCalledWith([eurcIn])
		w.unmount()
	})
})
