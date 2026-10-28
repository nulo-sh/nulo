/**
 * The Send picker over chain-scoped balance rows, drawn by the real `TokenList` and `TokenCard`: the
 * shared order and fold, the search box, selection writing the TOKEN id, paste-to-add and its
 * hand-off, the scope fence on a slow fetch, a fetch rejected by the hide, the retry and the
 * reconnect re-read, and the teardown on hide / unmount.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { effect, nextTick, stop } from "vue"
import { createAppStoreHarness } from "../../../../tests/helpers/app-store-harness"
import { installChromeStorage } from "../../../../tests/helpers/chrome-storage-mock"
import { flaggedKeysOf } from "@/utils/token-flag"
import { TEST_FLAGGED, TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"

const H = vi.hoisted(() => {
	const makeEvent = () => {
		const handlers = new Set<(x?: unknown) => void>()
		return {
			add: (fn: (x?: unknown) => void) => handlers.add(fn),
			remove: (fn: (x?: unknown) => void) => handlers.delete(fn),
			clear: () => handlers.clear(),
			emit: (x?: unknown) => {
				for (const fn of [...handlers]) fn(x)
			},
		}
	}
	return {
		getTokenBalances: vi.fn(),
		balanceDisconnect: vi.fn(),
		balanceAdded: makeEvent(),
		balanceUpdated: makeEvent(),
		balanceDeleted: makeEvent(),
		balanceConnected: makeEvent(),
		quotesUpdated: makeEvent(),
		priceConnected: makeEvent(),
		quotes: { current: {} as Record<string, unknown> },
		store: { current: null as unknown as ReturnType<typeof createAppStoreHarness> },
		cache: { activeTokenIdx: undefined as number | undefined },
		routerPush: vi.fn(),
		closeAll: vi.fn(),
		popupOpen: vi.fn(),
		payload: { current: undefined as unknown },
		flagged: { current: [] as { chainId: number; address: string }[] },
	}
})

vi.mock("@/utils/core", async (importOriginal) => {
	const { chromeUiPreferences } = await import("../../../../tests/helpers/ui-preference-fake")
	return { ...(await importOriginal<typeof import("@/utils/core")>()), managers: { uiPreference: chromeUiPreferences() } }
})
vi.mock("@/wallet/services/token-balance/client", () => ({
	TokenBalanceServiceClient: vi.fn(function () {
		return {
			disconnect: H.balanceDisconnect,
			onConnected: H.balanceConnected,
			onTokenBalanceAdded: H.balanceAdded,
			onTokenBalanceUpdated: H.balanceUpdated,
			onTokenBalanceDeleted: H.balanceDeleted,
			getTokenBalances: H.getTokenBalances,
		}
	}),
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			// Per client: every row's card holds one beside the picker's own.
			disconnect: vi.fn(),
			onQuotesUpdated: H.quotesUpdated,
			onConnected: H.priceConnected,
			getQuotes: vi.fn(async () => ({
				quotes: {},
				pricedTokens: TEST_PRICED_TOKENS,
				flaggedTokens: flaggedKeysOf([TEST_FLAGGED, ...H.flagged.current]),
			})),
			refreshIfStale: vi.fn().mockImplementation(async () => ({
				quotes: H.quotes.current,
				pricedTokens: TEST_PRICED_TOKENS,
				flaggedTokens: flaggedKeysOf([TEST_FLAGGED, ...H.flagged.current]),
			})),
		}
	}),
}))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => H.store.current }))
// The real store is a Pinia proxy; the selection mark re-renders only through a reactive write.
vi.mock("@/stores/cache.store", async () => {
	const { reactive } = await import("vue")
	const store = reactive(H.cache)
	return { useCacheStore: () => store }
})
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({
		len: 1,
		popups: { select_token: { order: 1 } },
		closeAll: H.closeAll,
		open: H.popupOpen,
		getPayload: (target: string) => (target === "select_token" ? H.payload.current : undefined),
	}),
}))
vi.mock("vue-router", async (importOriginal) => {
	const mod = await importOriginal<typeof import("vue-router")>()
	return { ...mod, useRouter: () => ({ push: H.routerPush }) }
})

import { CHAIN_IDS } from "@/utils/chain-ids"
import { captureWindowDocument } from "@/utils/window-document"
import { PriceServiceClient } from "@/wallet/services/price/client"
import SelectTokenPopup from "./SelectTokenPopup.vue"

const STUBS = {
	Popup: { props: ["show"], template: "<div v-if='show'><slot /></div>" },
	PopupCard: { template: "<div><slot /></div>" },
	PopupHeader: { template: "<div><slot name='title' /></div>" },
	ItemsContainer: { template: "<div><slot /></div>" },
	// Draws the description only when a slot is passed, as `SettingItem` does.
	SettingItem: {
		props: ["title"],
		template:
			"<div :data-title='title'><div v-if='$slots.description' data-testid='setting-description'><slot name='description' /></div></div>",
	},
	Text: { template: "<span><slot /></span>" },
	Flex: { template: "<div><slot /></div>" },
	Icon: { template: "<i />" },
	Skeleton: { template: '<i data-testid="stub-skeleton" />' },
	// `custom` hands the slot its href and navigate, as the real RouterLink does.
	RouterLink: {
		template: '<slot v-if="custom" :href="to" :navigate="() => {}" /><a v-else :href="to"><slot /></a>',
		props: { to: [String, Object], custom: Boolean },
	},
}

const CHAIN = CHAIN_IDS.TESTNET
// Test USDC is price-mapped on the testnet; with a `usd-coin` quote seeded it is the one priced row.
const TEST_USDC = TEST_TOKENS.USDC
const ACCOUNT = `0x${"a".repeat(64)}`
const OTHER_ACCOUNT = `0x${"b".repeat(64)}`

/** The balance row id and the token id differ on purpose: selection must write the TOKEN id. */
const row = (
	id: number,
	symbol: string,
	over: Partial<{ chainId: number; contract: string; publicBalance: string; account: string }> = {},
) => ({
	id: id + 100,
	account: over.account ?? ACCOUNT,
	token: {
		id,
		chainId: over.chainId ?? CHAIN,
		contract: over.contract ?? `0x${symbol.toLowerCase()}`,
		name: `${symbol} Token`,
		symbol,
		decimals: 18,
		hasDecimals: true,
	},
	publicBalance: over.publicBalance ?? "1",
	privateBalance: "0",
	updatedAt: 1,
})

const rowSymbols = (wrapper: ReturnType<typeof mount>) =>
	wrapper.findAll('[data-testid="select-token-row"]').map((el) => el.attributes("data-symbol"))

async function mountOpen(rows: ReturnType<typeof row>[]) {
	H.getTokenBalances.mockResolvedValue(rows)
	const wrapper = mount(SelectTokenPopup, { props: { show: false }, global: { stubs: STUBS } })
	await wrapper.setProps({ show: true })
	await flushPromises()
	return wrapper
}

/** The picker's own price client: the first one built after `before` clients existed. */
const pickerPrices = (before: number) =>
	vi.mocked(PriceServiceClient).mock.results[before]?.value as unknown as { disconnect: { mock: { calls: unknown[] } } }

/** A curve point no row holds. */
const UNLISTED = "0x04d7bb8a4a0239077d7d246279076fdab66f5ed6167bd01882fad6131199457a"
const OFF_CURVE = "0x24f20fb6e501242936eb1f47e2f51610f15e6c07486ed62012774e5f14ebd583"
const search = async (wrapper: ReturnType<typeof mount>, query: string) => {
	await wrapper.find('[data-testid="select-token-search"]').setValue(query)
	await flushPromises()
}

describe("SelectTokenPopup", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// The pinned-token composable reads storage on load and subscribes to onChanged.
		installChromeStorage()
		// Mounted popups from earlier cases still hold their handlers on the shared events.
		for (const ev of [H.balanceAdded, H.balanceUpdated, H.balanceDeleted, H.balanceConnected, H.quotesUpdated, H.priceConnected])
			ev.clear()
		H.quotes.current = {}
		H.cache.activeTokenIdx = undefined
		H.payload.current = undefined
		H.flagged.current = []
		H.store.current = createAppStoreHarness()
		H.store.current.account = { address: ACCOUNT }
		H.store.current.network = { id: "net-main", name: "Testnet", chainId: CHAIN }
	})

	test("rows follow the shared order: the priced token first, then held tokens by name, an empty row last", async () => {
		H.quotes.current = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const wrapper = await mountOpen([
			row(3, "ZED"),
			row(4, "EMPTY", { publicBalance: "0" }),
			row(1, "PRICED", { contract: TEST_USDC }),
			row(2, "ALPHA"),
		])
		expect(rowSymbols(wrapper)).toEqual(["PRICED", "ALPHA", "ZED"])
		expect(wrapper.get('[data-testid="select-token-fold"]').text()).toContain("1 empty")
		await wrapper.get('[data-testid="select-token-fold"]').trigger("click")
		expect(rowSymbols(wrapper)).toEqual(["PRICED", "ALPHA", "ZED", "EMPTY"])
		expect(H.getTokenBalances).toHaveBeenCalledWith(undefined, ACCOUNT)
	})

	// The shell mounts the picker, hidden, in every unlocked document, a dApp window's included.
	test("in a window document the hidden picker reads the cache and never asks for a refresh, whatever the route is by then; in the popup it refreshes", async () => {
		const asked = () => {
			type Calls = { mock: { calls: unknown[] } }
			const client = vi.mocked(PriceServiceClient).mock.results[built]?.value as unknown as {
				getQuotes: Calls
				refreshIfStale: Calls
			}
			return [client.getQuotes.mock.calls.length, client.refreshIfStale.mock.calls.length]
		}
		H.getTokenBalances.mockResolvedValue([row(2, "ALPHA"), row(1, "PRICED", { contract: TEST_USDC })])
		let built = vi.mocked(PriceServiceClient).mock.results.length
		captureWindowDocument("#/windows/execute?requestId=r1")
		window.location.hash = "#/popup/auth"
		try {
			const hidden = mount(SelectTokenPopup, { props: { show: false }, global: { stubs: STUBS } })
			await flushPromises()
			expect(asked()).toEqual([1, 0])
			H.priceConnected.emit()
			await flushPromises()
			expect(asked()).toEqual([2, 0])
			const quote = { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null }
			H.quotesUpdated.emit({ quotes: { "usd-coin": quote }, pricedTokens: TEST_PRICED_TOKENS, flaggedTokens: [] })
			await hidden.setProps({ show: true })
			await flushPromises()
			expect(rowSymbols(hidden)).toEqual(["PRICED", "ALPHA"])
			hidden.unmount()
		} finally {
			captureWindowDocument("")
			window.location.hash = ""
		}

		built = vi.mocked(PriceServiceClient).mock.results.length
		const popup = mount(SelectTokenPopup, { props: { show: false }, global: { stubs: STUBS } })
		await flushPromises()
		expect(asked()).toEqual([1, 1])
		H.priceConnected.emit()
		await flushPromises()
		expect(asked()).toEqual([2, 2])
		popup.unmount()
	})

	test("a row the signed list flags carries 'Flagged as a scam' as its second line; the others carry none", async () => {
		// Wire-shaped, in the upper case a restored row may keep.
		const contract = `0x${TEST_FLAGGED.address.slice(2).toUpperCase()}`
		const wrapper = await mountOpen([row(1, "SCAM", { contract }), row(2, "ALPHA")])
		const lines = wrapper.findAll('[data-testid="select-token-row"]').map((el) => {
			const line = el.find('[data-testid="select-token-flagged"]')
			return [el.attributes("data-symbol"), line.exists() ? line.text() : null]
		})
		expect(lines).toEqual([
			["ALPHA", null],
			["SCAM", "Flagged as a scam"],
		])
	})

	test("a row whose symbol is blank is titled with the empty-value dash; data-symbol keeps the stored symbol", async () => {
		const wrapper = await mountOpen([row(1, "   ", { contract: "0xblank" }), row(2, "ALPHA")])
		const titles = wrapper
			.findAll('[data-testid="select-token-row"]')
			.map((el) => [el.attributes("data-symbol"), el.get('[data-testid="token-symbol"]').text()])
		expect(titles).toEqual([
			["   ", "—"],
			["ALPHA", "ALPHA"],
		])
	})

	test("a row on another chain is not listed", async () => {
		const wrapper = await mountOpen([row(1, "HERE"), row(2, "ELSEWHERE", { chainId: CHAIN + 1 })])
		expect(rowSymbols(wrapper)).toEqual(["HERE"])
	})

	test("the search box shows with one row, for a paste", async () => {
		const one = await mountOpen([row(1, "A")])
		expect(one.get('[data-testid="select-token-search"]').attributes("placeholder")).toBe("Search or paste an address")
		expect(one.text()).toContain("Your tokens")
	})

	test("no list, so no search and no add row, before the snapshot's read lands", async () => {
		let release: (rows: ReturnType<typeof row>[]) => void = () => {}
		H.getTokenBalances.mockImplementation(() => new Promise((resolve) => (release = resolve)))
		const wrapper = mount(SelectTokenPopup, { props: { show: false }, global: { stubs: STUBS } })
		await wrapper.setProps({ show: true })
		await flushPromises()
		expect(wrapper.find('[data-testid="select-token-search"]').exists()).toBe(false)
		release([row(1, "A")])
		await flushPromises()
		expect(wrapper.find('[data-testid="select-token-search"]').exists()).toBe(true)
	})

	test("search filters by symbol and shows the no-results line on a miss", async () => {
		const wrapper = await mountOpen([row(1, "ALPHA"), row(2, "BETA"), row(3, "GAMMA"), row(4, "DELTA")])
		await wrapper.find('[data-testid="select-token-search"]').setValue("eta")
		expect(rowSymbols(wrapper)).toEqual(["BETA"])

		await wrapper.find('[data-testid="select-token-search"]').setValue("zzz")
		expect(rowSymbols(wrapper)).toEqual([])
		expect(wrapper.find('[data-testid="select-token-no-results"]').exists()).toBe(true)
	})

	test("selecting a row writes the TOKEN id (not the balance row id), marks it selected, and closes", async () => {
		const wrapper = await mountOpen([row(7, "ONE"), row(9, "TWO")])
		expect(wrapper.findAll('[data-testid="select-token-row"]').map((el) => el.attributes("data-selected"))).toEqual(["false", "false"])

		await wrapper.find('[data-testid="select-token-row"][data-symbol="TWO"]').trigger("click")
		expect(H.cache.activeTokenIdx).toBe(9)
		expect(wrapper.emitted("onClose")).toHaveLength(1)

		await nextTick()
		expect(wrapper.find('[data-testid="select-token-row"][data-symbol="TWO"]').attributes("data-selected")).toBe("true")
	})

	test("a fetch for the previous account that resolves late never lands; the scope change refetches", async () => {
		const pending = new Map<string, (rows: ReturnType<typeof row>[]) => void>()
		H.getTokenBalances.mockImplementation(
			(_id: unknown, account: string) =>
				new Promise((resolve) => {
					pending.set(account, resolve)
				}),
		)
		const wrapper = mount(SelectTokenPopup, { props: { show: false }, global: { stubs: STUBS } })
		await wrapper.setProps({ show: true })
		await flushPromises()

		H.store.current.account = { address: OTHER_ACCOUNT }
		await flushPromises()
		pending.get(OTHER_ACCOUNT)?.([row(2, "THEIRS", { account: OTHER_ACCOUNT })])
		await flushPromises()
		pending.get(ACCOUNT)?.([row(1, "MINE")])
		await flushPromises()
		expect(rowSymbols(wrapper)).toEqual(["THEIRS"])
	})

	test("a fetch rejected by the hide is swallowed; one rejected while open shows the error line", async () => {
		let reject: ((e: Error) => void) | undefined
		H.getTokenBalances.mockImplementation(
			() =>
				new Promise((_resolve, rej) => {
					reject = rej
				}),
		)
		const wrapper = mount(SelectTokenPopup, { props: { show: false }, global: { stubs: STUBS } })
		await wrapper.setProps({ show: true })
		await flushPromises()
		await wrapper.setProps({ show: false })
		reject?.(new Error("port closed"))
		await flushPromises()

		await wrapper.setProps({ show: true })
		await flushPromises()
		reject?.(new Error("service failed"))
		await flushPromises()
		expect(wrapper.find('[data-testid="select-token-error"]').exists()).toBe(true)
		expect(rowSymbols(wrapper)).toEqual([])
		wrapper.unmount()
	})

	test("the connect a load opens is not a reconnect; a port drop mid-load keeps the error line until the reconnect's re-read lands", async () => {
		let rejectFirst: ((e: Error) => void) | undefined
		let releaseSecond: (rows: ReturnType<typeof row>[]) => void = () => {}
		H.getTokenBalances
			.mockImplementationOnce(
				() =>
					new Promise((_resolve, rej) => {
						rejectFirst = rej
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						releaseSecond = resolve
					}),
			)
			.mockResolvedValue([row(1, "A"), row(2, "B")])
		const wrapper = mount(SelectTokenPopup, { props: { show: false }, global: { stubs: STUBS } })
		await wrapper.setProps({ show: true })
		await flushPromises()
		// The load's own connect.
		H.balanceConnected.emit()
		await flushPromises()
		expect(H.getTokenBalances).toHaveBeenCalledTimes(1)

		// The client rejects the pending request as the port drops, and reports the next Ready in a later task.
		rejectFirst?.(new Error("port closed"))
		await flushPromises()
		expect(wrapper.find('[data-testid="select-token-error"]').exists()).toBe(true)
		H.balanceConnected.emit()
		await flushPromises()
		expect(H.getTokenBalances).toHaveBeenCalledTimes(2)
		expect(wrapper.find('[data-testid="select-token-error"]').exists()).toBe(true)
		releaseSecond([row(1, "A"), row(2, "B")])
		await flushPromises()
		expect(wrapper.find('[data-testid="select-token-error"]').exists()).toBe(false)
		expect(rowSymbols(wrapper)).toEqual(["A", "B"])

		// A hide resets the count: the next show's first connect is again its own.
		await wrapper.setProps({ show: false })
		await wrapper.setProps({ show: true })
		await flushPromises()
		H.balanceConnected.emit()
		await flushPromises()
		expect(H.getTokenBalances).toHaveBeenCalledTimes(3)
	})

	test("an incomplete scope while open reads nothing and drops the read still out; a later port drop still reloads", async () => {
		const reads: Array<(rows: ReturnType<typeof row>[]) => void> = []
		H.getTokenBalances.mockImplementation(() => new Promise((resolve) => reads.push(resolve)))
		const wrapper = mount(SelectTokenPopup, { props: { show: false }, global: { stubs: STUBS } })
		await wrapper.setProps({ show: true })
		H.balanceConnected.emit()
		H.store.current.network = null
		await flushPromises()
		reads[0]?.([row(1, "OLD")])
		await flushPromises()
		expect(rowSymbols(wrapper)).toEqual([])
		expect(H.getTokenBalances).toHaveBeenCalledTimes(1)

		H.store.current.network = { id: "net-main", chainId: CHAIN }
		await flushPromises()
		reads[1]?.([row(1, "A")])
		await flushPromises()
		expect(rowSymbols(wrapper)).toEqual(["A"])
		H.balanceConnected.emit()
		await flushPromises()
		expect(H.getTokenBalances).toHaveBeenCalledTimes(3)
	})

	test("a reconnect's read begun without a whole scope lands nothing: refused, it shows no error and arms no retry", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		try {
			const wrapper = await mountOpen([row(1, "A")])
			H.balanceConnected.emit()
			H.store.current.network = null
			await flushPromises()
			expect(rowSymbols(wrapper)).toEqual([])

			H.getTokenBalances.mockRejectedValueOnce(new Error("port closed"))
			H.balanceConnected.emit()
			await flushPromises()
			await vi.advanceTimersByTimeAsync(2_000)
			await flushPromises()
			expect(H.getTokenBalances).toHaveBeenCalledTimes(2)
			expect(wrapper.find('[data-testid="select-token-error"]').exists()).toBe(false)

			H.store.current.network = { id: "net-main", chainId: CHAIN }
			await flushPromises()
			expect(rowSymbols(wrapper)).toEqual(["A"])
			wrapper.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a port drop re-reads in place: the list stays while the read is out", async () => {
		const wrapper = await mountOpen([row(1, "A"), row(2, "B")])
		H.balanceConnected.emit()
		let release: (rows: ReturnType<typeof row>[]) => void = () => {}
		H.getTokenBalances.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve
				}),
		)
		H.balanceConnected.emit()
		await flushPromises()
		expect(H.getTokenBalances).toHaveBeenCalledTimes(2)
		expect(rowSymbols(wrapper)).toEqual(["A", "B"])
		release([row(1, "A")])
		await flushPromises()
		expect(rowSymbols(wrapper)).toEqual(["A"])
	})

	test("a refused read shows the error line until its retry 2 s later lands the list", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		try {
			H.getTokenBalances.mockRejectedValueOnce(new Error("service failed")).mockResolvedValue([row(1, "A")])
			const wrapper = mount(SelectTokenPopup, { props: { show: false }, global: { stubs: STUBS } })
			await wrapper.setProps({ show: true })
			await flushPromises()
			expect(wrapper.find('[data-testid="select-token-error"]').exists()).toBe(true)
			await vi.advanceTimersByTimeAsync(1_999)
			await flushPromises()
			expect(wrapper.find('[data-testid="select-token-error"]').exists()).toBe(true)
			expect(H.getTokenBalances).toHaveBeenCalledTimes(1)
			await vi.advanceTimersByTimeAsync(1)
			await flushPromises()
			expect(wrapper.find('[data-testid="select-token-error"]').exists()).toBe(false)
			expect(rowSymbols(wrapper)).toEqual(["A"])
			wrapper.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a read in flight reads again over an add that came meanwhile, which stays", async () => {
		const wrapper = await mountOpen([row(1, "A")])
		let release: (rows: ReturnType<typeof row>[]) => void = () => {}
		H.getTokenBalances
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						release = resolve
					}),
			)
			.mockResolvedValue([row(1, "A"), row(2, "MINE")])
		await wrapper.setProps({ show: false })
		await wrapper.setProps({ show: true })
		await flushPromises()
		H.balanceAdded.emit(row(2, "MINE"))
		await nextTick()
		// The list waits for the read: shown alone, the add would read as the whole list.
		expect(rowSymbols(wrapper)).toEqual([])
		release([row(1, "A")])
		await flushPromises()
		expect(rowSymbols(wrapper)).toEqual(["A", "MINE"])
		expect(H.getTokenBalances).toHaveBeenCalledTimes(3)
	})

	test("hiding clears the list and query and disconnects the balance client; unmount tears down prices", async () => {
		const before = vi.mocked(PriceServiceClient).mock.results.length
		const wrapper = await mountOpen([row(1, "A"), row(2, "B"), row(3, "C"), row(4, "D")])
		await wrapper.find('[data-testid="select-token-search"]').setValue("a")
		await wrapper.setProps({ show: false })
		expect(H.balanceDisconnect).toHaveBeenCalledTimes(1)
		expect(pickerPrices(before).disconnect.mock.calls).toHaveLength(0)

		// Re-open: the list is fetched fresh and the query is gone.
		H.getTokenBalances.mockResolvedValue([row(1, "A"), row(2, "B"), row(3, "C"), row(4, "D")])
		await wrapper.setProps({ show: true })
		await flushPromises()
		expect(rowSymbols(wrapper)).toEqual(["A", "B", "C", "D"])
		expect((wrapper.find('[data-testid="select-token-search"]').element as HTMLInputElement).value).toBe("")

		wrapper.unmount()
		expect(pickerPrices(before).disconnect.mock.calls).toHaveLength(1)
	})

	test("a balance added or updated while open counts only when it belongs to the active scope", async () => {
		const wrapper = await mountOpen([row(1, "A")])
		H.balanceAdded.emit(row(2, "OTHER_CHAIN", { chainId: CHAIN + 1 }))
		H.balanceAdded.emit(row(3, "OTHER_ACCOUNT", { account: OTHER_ACCOUNT }))
		H.balanceAdded.emit(row(4, "MINE"))
		H.balanceUpdated.emit({ ...row(1, "A"), token: { ...row(1, "A").token, symbol: "A2" }, account: OTHER_ACCOUNT })
		await nextTick()
		expect(rowSymbols(wrapper)).toEqual(["A", "MINE"])
	})
})

describe("SelectTokenPopup — paste to add", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		installChromeStorage()
		for (const ev of [H.balanceAdded, H.balanceUpdated, H.balanceDeleted, H.balanceConnected, H.quotesUpdated, H.priceConnected])
			ev.clear()
		H.quotes.current = {}
		H.cache.activeTokenIdx = undefined
		H.payload.current = undefined
		H.flagged.current = []
		H.store.current = createAppStoreHarness()
		H.store.current.account = { address: ACCOUNT }
		H.store.current.network = { id: "net-main", name: "Testnet", chainId: CHAIN }
	})

	const addRow = (wrapper: ReturnType<typeof mount>) => wrapper.find('[data-testid="select-token-add-token"]')

	test("an address no row holds offers the add with its note; the press hands New token the address and a report that picks and closes", async () => {
		const onAdded = vi.fn()
		H.payload.current = { onAdded }
		const wrapper = await mountOpen([row(1, "ALPHA")])
		await search(wrapper, ` ${UNLISTED} `)
		expect(rowSymbols(wrapper)).toEqual([])
		expect(wrapper.get('[data-testid="select-token-add-token-address"]').text()).toBe("0x04…7a")
		expect(wrapper.text()).toContain("It joins your list on Testnet and is picked for this send.")
		expect(wrapper.find('[data-testid="select-token-add-token-flagged"]').exists()).toBe(false)

		await addRow(wrapper).trigger("click")
		expect(H.popupOpen).toHaveBeenCalledTimes(1)
		const [target, payload] = H.popupOpen.mock.calls[0] as [string, { address: string; onAdded: (t: unknown) => void }]
		expect([target, payload.address]).toEqual(["new_token", UNLISTED])
		expect(wrapper.emitted("onClose")).toBeUndefined()

		const token = { id: 42, contract: UNLISTED }
		payload.onAdded(token)
		expect(onAdded.mock.calls).toEqual([[token]])
		expect(wrapper.emitted("onClose")).toHaveLength(1)
	})

	test("the report keeps the opener of the show it was offered in, not the payload a later show carries", async () => {
		const first = vi.fn()
		H.payload.current = { onAdded: first }
		const wrapper = await mountOpen([row(1, "ALPHA")])
		await search(wrapper, UNLISTED)
		await addRow(wrapper).trigger("click")
		const payload = H.popupOpen.mock.calls[0]?.[1] as { onAdded: (t: unknown) => void }
		await wrapper.setProps({ show: false })
		H.payload.current = { onAdded: vi.fn() }
		payload.onAdded({ id: 42 })
		expect(first).toHaveBeenCalledTimes(1)
	})

	test("a held address, in either case, narrows to its row, marked when current, and offers no add; the press picks it", async () => {
		const held = UNLISTED
		H.cache.activeTokenIdx = 5
		const wrapper = await mountOpen([row(5, "HELD", { contract: held }), row(6, "ALPHA")])
		for (const q of [held, `0x${held.slice(2).toUpperCase()}`]) {
			await search(wrapper, q)
			expect(rowSymbols(wrapper)).toEqual(["HELD"])
			expect(wrapper.get('[data-testid="select-token-row"]').attributes("aria-current")).toBe("true")
			expect(addRow(wrapper).exists()).toBe(false)
		}
		H.cache.activeTokenIdx = 6
		await search(wrapper, held)
		await wrapper.get('[data-testid="select-token-row"]').trigger("click")
		expect(H.cache.activeTokenIdx).toBe(5)
		expect(wrapper.emitted("onClose")).toHaveLength(1)
		expect(H.popupOpen).not.toHaveBeenCalled()
	})

	test("a held address whose balance is empty stays behind the fold, and still offers no add", async () => {
		const wrapper = await mountOpen([row(5, "HELD", { contract: UNLISTED, publicBalance: "0" }), row(6, "ALPHA")])
		await search(wrapper, UNLISTED)
		expect(rowSymbols(wrapper)).toEqual([])
		expect(addRow(wrapper).exists()).toBe(false)
		await wrapper.get('[data-testid="select-token-fold"]').trigger("click")
		expect(rowSymbols(wrapper)).toEqual(["HELD"])
	})

	test("hex that is no address finds nothing; a prefix and plain text filter; none offers the add", async () => {
		const wrapper = await mountOpen([row(1, "ALPHA", { contract: "0x12ab" }), row(2, "BETA", { contract: "0x34cd" })])
		await search(wrapper, OFF_CURVE)
		expect(wrapper.find('[data-testid="select-token-no-results"]').exists()).toBe(true)
		expect(addRow(wrapper).exists()).toBe(false)
		await search(wrapper, "0x12")
		expect(rowSymbols(wrapper)).toEqual(["ALPHA"])
		await search(wrapper, "beta tok")
		expect(rowSymbols(wrapper)).toEqual(["BETA"])
		expect(addRow(wrapper).exists()).toBe(false)
	})

	test("an address the signed list flags, pasted in mixed case, carries the flag line on an add that stays pressable", async () => {
		H.flagged.current = [{ chainId: CHAIN, address: UNLISTED }]
		const wrapper = await mountOpen([row(1, "ALPHA")])
		await search(wrapper, `0x${UNLISTED.slice(2, 30).toUpperCase()}${UNLISTED.slice(30)}`)
		expect(wrapper.get('[data-testid="select-token-add-token-flagged"]').text()).toBe("Flagged as a scam")
		const button = addRow(wrapper)
		expect(button.attributes("disabled")).toBeUndefined()
		const flagId = wrapper.get('[data-testid="select-token-add-token-flagged"]').attributes("id")
		expect(button.attributes("aria-describedby")?.split(" ")).toContain(flagId)
		await button.trigger("click")
		expect(H.popupOpen).toHaveBeenCalledTimes(1)
	})

	test("New token opening over the picker leaves its query, its add row and the current token", async () => {
		H.cache.activeTokenIdx = 1
		const wrapper = await mountOpen([row(1, "ALPHA")])
		await search(wrapper, UNLISTED)
		await addRow(wrapper).trigger("click")
		await flushPromises()
		expect((wrapper.get('[data-testid="select-token-search"]').element as HTMLInputElement).value).toBe(UNLISTED)
		expect(addRow(wrapper).exists()).toBe(true)
		expect(H.cache.activeTokenIdx).toBe(1)
		expect(wrapper.emitted("onClose")).toBeUndefined()
	})
})

describe("SelectTokenPopup — the scope predicate", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		installChromeStorage()
		for (const ev of [H.balanceAdded, H.balanceUpdated, H.balanceDeleted, H.balanceConnected, H.quotesUpdated, H.priceConnected])
			ev.clear()
		H.quotes.current = {}
		H.store.current = createAppStoreHarness()
		H.store.current.profile = { id: "p1" }
		H.store.current.account = { address: ACCOUNT }
		H.store.current.network = { id: "net-main", chainId: CHAIN }
	})

	test("an update for a listed id that moved to another chain is not applied", async () => {
		const wrapper = await mountOpen([row(1, "A")])
		H.balanceUpdated.emit({ ...row(1, "A"), token: { ...row(1, "A").token, symbol: "A2", chainId: CHAIN + 1 } })
		await nextTick()
		expect(rowSymbols(wrapper)).toEqual(["A"])
	})

	test("a profile-only switch while open does not reload the list", async () => {
		await mountOpen([row(1, "A")])
		expect(H.getTokenBalances).toHaveBeenCalledTimes(1)
		H.store.current.profile = { id: "p-other" }
		await flushPromises()
		expect(H.getTokenBalances).toHaveBeenCalledTimes(1)
	})

	test("the scope check reads the network only once the account matches", async () => {
		await mountOpen([row(1, "A")])
		let runs = 0
		const foreign = effect(() => {
			runs++
			H.balanceUpdated.emit(row(9, "X", { account: OTHER_ACCOUNT }))
		})
		;(H.store.current.network as { chainId: number }).chainId = CHAIN + 7
		H.store.current.network = { id: "net-main", chainId: CHAIN + 7 }
		expect(runs).toBe(1)
		stop(foreign)

		let ownRuns = 0
		const own = effect(() => {
			ownRuns++
			H.balanceUpdated.emit(row(8, "Y"))
		})
		;(H.store.current.network as { chainId: number }).chainId = CHAIN + 8
		expect(ownRuns).toBe(2)
		stop(own)
	})
})
