/**
 * The Holdings page owns the service graph and hands rows to TokenList. Mounted to prove the one
 * thing no network test exercises: a same-address balance row from ANOTHER chain is neither
 * listed nor counted in the summary (the balance service returns every chain's rows).
 */
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { EventHandler } from "@nulo/wallet-core/utils"
import { afterEach, describe, expect, type Mock, test, vi } from "vitest"
import { TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"

const TEST_USDC = TEST_TOKENS.USDC
let seedRows: unknown[] = []
let fetchError: Error | undefined
/** Set, the balance read waits on it: the list has not answered. */
let readGate: Promise<void> | undefined
const balanceEvents = { added: new EventHandler(), updated: new EventHandler(), deleted: new EventHandler(), connected: new EventHandler() }

vi.mock("@/utils/core", async (importOriginal) => {
	const { chromeUiPreferences } = await import("../../../tests/helpers/ui-preference-fake")
	return { ...(await importOriginal<typeof import("@/utils/core")>()), managers: { uiPreference: chromeUiPreferences() } }
})
vi.mock("@/wallet/services/token-balance/client", () => ({
	TokenBalanceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onTokenBalanceAdded: balanceEvents.added,
			onTokenBalanceUpdated: balanceEvents.updated,
			onTokenBalanceDeleted: balanceEvents.deleted,
			onConnected: balanceEvents.connected,
			getTokenBalances: vi.fn().mockImplementation(async (tokenId?: unknown) => {
				if (readGate) await readGate
				if (fetchError) throw fetchError
				return tokenId === undefined ? seedRows : seedRows.filter((tb) => (tb as { token: { id: unknown } }).token.id === tokenId)
			}),
		}
	}),
}))
let mockQuotes: Record<string, unknown> = {}
const ANSWER = async () => ({ quotes: mockQuotes, pricedTokens: TEST_PRICED_TOKENS, tokenIcons: {}, bridgeIcons: {} })
let answerQuotes: () => Promise<unknown> = ANSWER
/** The signed list's read; a case that parks it leaves no flag known. */
const LIST = async () => ({ quotes: {}, pricedTokens: TEST_PRICED_TOKENS, tokenIcons: {}, bridgeIcons: {}, flaggedTokens: [] as string[] })
let answerList: () => Promise<unknown> = LIST
const tokenCalls = {
	getTokens: vi.fn(async (): Promise<{ contract: string }[]> => []),
	parseTokenInterface: vi.fn(async (): Promise<unknown> => ({ isComplete: true })),
	addToken: vi.fn(),
}
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return { ...tokenCalls, disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: new EventHandler(),
			onConnected: new EventHandler(),
			getQuotes: vi.fn(() => answerList()),
			refreshIfStale: vi.fn().mockImplementation(() => answerQuotes()),
		}
	}),
}))
const taskEvents = { created: new EventHandler(), updated: new EventHandler(), deleted: new EventHandler(), connected: new EventHandler() }
let seedTasks: unknown[] = []
vi.mock("@/wallet/services/task/client", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/wallet/services/task/client")>()),
	TaskServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onTaskCreated: taskEvents.created,
			onTaskUpdated: taskEvents.updated,
			onTaskDeleted: taskEvents.deleted,
			onConnected: taskEvents.connected,
			getTasks: vi.fn(async () => seedTasks),
		}
	}),
}))
/** The newest page's config events: a page an earlier case left mounted hears none of them. */
let configEvents = { update: new EventHandler(), connected: new EventHandler() }
let configValues: Record<string, unknown> = { showFiatValues: true, incomingDustUsdThreshold: 0 }
/** A read answers the value stored when it was asked; a case that parks reads replaces this. */
let answerConfig: (key: string, stored: unknown) => Promise<unknown> = async (_key, stored) => stored
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		const events = { update: new EventHandler(), connected: new EventHandler() }
		configEvents = events
		let opened = false
		return {
			disconnect: vi.fn(),
			onUpdate: events.update,
			onConnected: events.connected,
			// The first read opens the port, as the real client's does.
			getValue: vi.fn().mockImplementation((key: string) => {
				if (!opened) {
					opened = true
					events.connected.invoke(undefined as never)
				}
				return answerConfig(key, configValues[key])
			}),
		}
	}),
}))

// jsdom has no layout: a stand-in font measures the total at its full 26 px (digits and signs
// 15 px, separators 6 px), and `room` is the summary line's width.
let room = 10_000
const standInWidth = (text: string) => [...text].reduce((w, c) => w + (c === "," || c === "." ? 6 : 15), 0)
vi.mock("@/utils/hero-ruler", () => ({
	heroRoom: () => room,
	rulerWidth: (el: Element, scale: number) => standInWidth(el.textContent ?? "") * scale,
}))

import { ContractNotFoundError } from "@nulo/extension-messaging/errors"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { listKeyOf } from "@/utils/token-flag"
import { ContentKind } from "@/wallet/services/task/client"
import { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
import Holdings from "./holdings.vue"
import TokenList from "../components/modules/holdings/TokenList.vue"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Spinner: { template: '<i data-testid="stub-spinner" />' },
	// `custom` hands the slot its href and navigate, as the real RouterLink does.
	RouterLink: {
		template: '<slot v-if="custom" :href="to" :navigate="() => {}" /><a v-else :href="to"><slot /></a>',
		props: { to: [String, Object], custom: Boolean },
	},
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
	Tooltip: { template: "<span><slot /></span>", props: ["side", "position", "delay"] },
	LoadingState: { template: '<div data-testid="stub-loading">{{ label }}</div>', props: ["label"] },
}

const row = (id: string, symbol: string, chainId: number, contract = `0x${symbol.toLowerCase()}`) => ({
	id,
	account: "0xacct",
	token: { id, symbol, name: `${symbol} Token`, decimals: 6, hasDecimals: true, chainId, contract },
	publicBalance: (250n * 10n ** 6n).toString(),
	privateBalance: (1_000n * 10n ** 6n).toString(),
	updatedAt: 1,
})

async function mountPage(attachTo?: HTMLElement) {
	const pinia = createTestingPinia({ stubActions: false })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.profile = { id: "p1" } as never
	appStore.network = { id: "n1", chainId: CHAIN_IDS.TESTNET } as never
	appStore.account = { address: "0xacct" } as never
	const wrapper = mount(Holdings, { attachTo, global: { plugins: [pinia], stubs: STUBS } })
	await flushPromises()
	return wrapper
}

/** The mounted page's own balance reads: a page an earlier case left mounted answers the shared events too. */
const balanceReads = () => {
	const client = vi.mocked(TokenBalanceServiceClient).mock.results.at(-1)?.value as { getTokenBalances: Mock } | undefined
	return client?.getTokenBalances.mock.calls.length ?? 0
}

afterEach(() => {
	seedRows = []
	fetchError = undefined
	readGate = undefined
	seedTasks = []
	mockQuotes = {}
	answerQuotes = ANSWER
	answerList = LIST
	tokenCalls.getTokens.mockImplementation(async () => [])
	tokenCalls.parseTokenInterface.mockImplementation(async () => ({ isComplete: true }))
	tokenCalls.addToken.mockReset()
	configValues = { showFiatValues: true, incomingDustUsdThreshold: 0 }
	answerConfig = async (_key, stored) => stored
	vi.clearAllMocks()
})

describe("holdings page", () => {
	test("lists the active chain's rows, counts them, and skips a same-address row from another chain", async () => {
		installChromeStorage()
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
		seedRows = [
			row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC),
			row("b2", "BBB", CHAIN_IDS.TESTNET),
			row("b-foreign", "FOR", CHAIN_IDS.SANDBOX),
		]
		const w = await mountPage()

		const symbols = w.findAll('[data-testid="token-symbol"]').map((s) => s.attributes("data-symbol"))
		expect(symbols).toEqual(["AAA", "BBB"])
		const summary = w.find('[data-testid="holdings-summary"]').text()
		expect(summary).toContain("$1,250.00")
		expect(w.get('[data-testid="holdings-meta"]').text()).toBe("2 tokens")
	})

	// The total tells the two apart: an unpriced holding counts but adds nothing to it.
	test.each([
		["one of two holdings unpriced", row("b2", "BBB", CHAIN_IDS.TESTNET), "$1,250.00"],
		["both holdings priced", row("b2", "USDT", CHAIN_IDS.TESTNET, TEST_TOKENS.USDT), "$2,500.00"],
	])("with %s, the meta line is the count alone beside the priced total", async (_, second, figure) => {
		installChromeStorage()
		mockQuotes = Object.fromEntries(
			["usd-coin", "tether"].map((id) => [id, { coingeckoId: id, usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null }]),
		)
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC), second]
		const w = await mountPage()
		expect(w.get('[data-testid="holdings-total"]').text()).toBe(figure)
		expect(w.get('[data-testid="holdings-meta"]').text()).toBe("2 tokens")
		expect(w.get('[data-testid="holdings-summary"]').text()).not.toMatch(/priced/)
	})

	test("one row being refreshed shows one grey dot beside All holdings and no mark on any row, until its task finishes", async () => {
		installChromeStorage()
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET), row("b2", "BBB", CHAIN_IDS.TESTNET)]
		const refresh = { id: "t1", content: { kind: ContentKind.BalanceUpdate, tbId: "b2", account: "0xacct" } }
		seedTasks = [refresh]
		const w = await mountPage()
		const marks = () => w.findAll('[data-testid$="refreshing"]').map((el) => el.attributes("data-testid"))

		expect(marks()).toEqual(["holdings-refreshing"])
		expect(w.get('[data-testid="holdings-refreshing"]').attributes("aria-hidden")).toBe("true")
		const label = w.get('[data-testid="holdings-count"]').element.parentElement
		expect(label?.nextElementSibling).toBe(w.get('[data-testid="holdings-refreshing"]').element)
		taskEvents.updated.invoke({ ...refresh, finishedAt: 2 })
		await flushPromises()
		expect(marks()).toEqual([])

		// Success control: another account's refresh lights nothing.
		taskEvents.created.invoke({ id: "t2", content: { kind: ContentKind.BalanceUpdate, tbId: "b1", account: "0xother" } })
		await flushPromises()
		expect(marks()).toEqual([])
		taskEvents.created.invoke({ id: "t3", content: { kind: ContentKind.BalanceUpdate, tbId: "b1", account: "0xacct" } })
		await flushPromises()
		expect(marks()).toEqual(["holdings-refreshing"])
	})

	test("a reconnect reads the tasks again, so a finish missed while the worker was gone puts the dot out", async () => {
		installChromeStorage()
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET)]
		seedTasks = [{ id: "t1", content: { kind: ContentKind.BalanceUpdate, tbId: "b1", account: "0xacct" } }]
		const w = await mountPage()
		expect(w.find('[data-testid="holdings-refreshing"]').exists()).toBe(true)
		seedTasks = []
		taskEvents.connected.invoke(undefined)
		await flushPromises()
		expect(w.find('[data-testid="holdings-refreshing"]').exists()).toBe(false)
	})

	test("a live add for another chain is ignored; one for this chain lands", async () => {
		installChromeStorage()
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET)]
		const w = await mountPage()

		balanceEvents.added.invoke(row("b9", "FOR", CHAIN_IDS.SANDBOX))
		balanceEvents.added.invoke(row("b2", "BBB", CHAIN_IDS.TESTNET))
		await flushPromises()

		const symbols = w.findAll('[data-testid="token-symbol"]').map((s) => s.attributes("data-symbol"))
		expect(symbols).toEqual(["AAA", "BBB"])
	})

	test("a reconnect rereads the config: a fiat switch flipped while detached takes effect", async () => {
		installChromeStorage()
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC)]
		const w = await mountPage()
		expect(w.find('[data-testid="holdings-summary"]').text()).toContain("$")

		configValues = { showFiatValues: false, incomingDustUsdThreshold: 0 }
		configEvents.connected.invoke(undefined as never)
		await flushPromises()
		expect(w.find('[data-testid="holdings-summary"]').text()).not.toContain("$")
	})

	describe("a change during the mount's reads wins over their older answers", () => {
		function parkReads() {
			const reads: Record<string, PromiseWithResolvers<unknown>> = {}
			answerConfig = (key) => {
				reads[key] = Promise.withResolvers<unknown>()
				return reads[key].promise
			}
			return reads
		}
		const fiatShown = (w: Awaited<ReturnType<typeof mountPage>>) => w.get('[data-testid="holdings-summary"]').text().includes("$")
		const dustThreshold = (w: Awaited<ReturnType<typeof mountPage>>) => w.getComponent(TokenList).props("dustThresholdUsd")

		test("a fiat change wins, and the dust read lands what was stored", async () => {
			installChromeStorage()
			mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
			seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC)]
			const reads = parkReads()
			const w = await mountPage()

			configEvents.update.invoke({ key: "showFiatValues", value: false })
			reads.showFiatValues.resolve(true)
			reads.incomingDustUsdThreshold.resolve(5)
			await flushPromises()
			expect(fiatShown(w)).toBe(false)
			expect(dustThreshold(w)).toBe(5)
		})

		test("a dust change wins, and the fiat read lands what was stored", async () => {
			installChromeStorage()
			mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
			seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC)]
			const reads = parkReads()
			const w = await mountPage()

			configEvents.update.invoke({ key: "incomingDustUsdThreshold", value: 7 })
			reads.incomingDustUsdThreshold.resolve(0)
			reads.showFiatValues.resolve(false)
			await flushPromises()
			expect(dustThreshold(w)).toBe(7)
			expect(fiatShown(w)).toBe(false)
		})

		test("each key settles alone: the fiat read lands while the dust read hangs, then fails", async () => {
			installChromeStorage()
			mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
			seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC)]
			const reads = parkReads()
			const w = await mountPage()

			reads.showFiatValues.resolve(false)
			await flushPromises()
			expect(fiatShown(w)).toBe(false)
			reads.incomingDustUsdThreshold.reject(new Error("port closed"))
			await flushPromises()
			expect(dustThreshold(w)).toBe(0)
		})
	})

	test("rejected config reads keep the defaults and never surface as an error", async () => {
		installChromeStorage()
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET)]
		configValues = new Proxy({}, { get: () => Promise.reject(new Error("port closed")) })
		const w = await mountPage()

		expect(w.find('[data-testid="holdings-error"]').exists()).toBe(false)
		expect(w.findAll('[data-testid="token-symbol"]')).toHaveLength(1)
		expect(w.get('[data-testid="holdings-meta"]').text()).toMatch(/^1 token( · |$)/)
	})

	test("live events: a delete from any chain removes its row, an add replaces a listed row, an update for an unseen row waits for the next read", async () => {
		installChromeStorage()
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET), row("b2", "BBB", CHAIN_IDS.TESTNET), row("b3", "CCC", CHAIN_IDS.TESTNET)]
		const w = await mountPage()

		balanceEvents.deleted.invoke(row("b1", "AAA", CHAIN_IDS.SANDBOX))
		balanceEvents.added.invoke(row("b2", "BB2", CHAIN_IDS.TESTNET))
		balanceEvents.updated.invoke(row("b3", "CC2", CHAIN_IDS.SANDBOX))
		balanceEvents.updated.invoke(row("b8", "FOR", CHAIN_IDS.SANDBOX))
		balanceEvents.updated.invoke(row("b9", "DDD", CHAIN_IDS.TESTNET))
		await flushPromises()

		const symbols = () => w.findAll('[data-testid="token-symbol"]').map((s) => s.attributes("data-symbol"))
		expect(symbols()).toEqual(["BB2", "CCC"])

		seedRows = [row("b2", "BB2", CHAIN_IDS.TESTNET), row("b3", "CCC", CHAIN_IDS.TESTNET), row("b9", "DDD", CHAIN_IDS.TESTNET)]
		balanceEvents.connected.invoke(undefined as never)
		balanceEvents.connected.invoke(undefined as never)
		await flushPromises()
		expect(symbols()).toEqual(["BB2", "CCC", "DDD"])
		w.unmount()
	})

	test("the first connect is the mount read's own; a later one re-reads behind the list, and a refused one keeps it and retries after 2 s", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		try {
			installChromeStorage()
			seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET)]
			const w = await mountPage()
			const symbols = () => w.findAll('[data-testid="token-symbol"]').map((s) => s.attributes("data-symbol"))
			balanceEvents.connected.invoke(undefined as never)
			await flushPromises()
			expect(balanceReads()).toBe(1)

			let release: (rows: unknown[]) => void = () => {}
			seedRows = new Promise((resolve) => {
				release = resolve
			}) as never
			balanceEvents.connected.invoke(undefined as never)
			await flushPromises()
			expect(balanceReads()).toBe(2)
			expect(w.find('[data-testid="stub-loading"]').exists()).toBe(false)
			expect(symbols()).toEqual(["AAA"])
			release([row("b1", "AAA", CHAIN_IDS.TESTNET), row("b2", "BBB", CHAIN_IDS.TESTNET)])
			await flushPromises()
			expect(symbols()).toEqual(["AAA", "BBB"])

			fetchError = new Error("port closed")
			balanceEvents.connected.invoke(undefined as never)
			await flushPromises()
			expect(w.find('[data-testid="holdings-error"]').exists()).toBe(false)
			expect(symbols()).toEqual(["AAA", "BBB"])
			expect(w.get('[data-testid="holdings-meta"]').text()).toContain("2 tokens")
			fetchError = undefined
			seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET), row("b2", "BBB", CHAIN_IDS.TESTNET), row("b3", "CCC", CHAIN_IDS.TESTNET)]
			await vi.advanceTimersByTimeAsync(2_000)
			await flushPromises()
			expect(balanceReads()).toBe(4)
			expect(symbols()).toEqual(["AAA", "BBB", "CCC"])
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a refused first read shows the error line until its retry 2 s later lands the list", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		try {
			installChromeStorage()
			fetchError = new Error("port closed")
			const w = await mountPage()
			const symbols = () => w.findAll('[data-testid="token-symbol"]').map((s) => s.attributes("data-symbol"))
			expect(w.find('[data-testid="holdings-error"]').exists()).toBe(true)
			fetchError = undefined
			seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET)]
			await vi.advanceTimersByTimeAsync(1_999)
			await flushPromises()
			expect(w.find('[data-testid="holdings-error"]').exists()).toBe(true)
			expect(balanceReads()).toBe(1)
			await vi.advanceTimersByTimeAsync(1)
			await flushPromises()
			expect(w.find('[data-testid="holdings-error"]').exists()).toBe(false)
			expect(symbols()).toEqual(["AAA"])
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a read in flight reads again over an add that came meanwhile, which stays", async () => {
		installChromeStorage()
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET)]
		const w = await mountPage()
		const symbols = () => w.findAll('[data-testid="token-symbol"]').map((s) => s.attributes("data-symbol"))
		balanceEvents.connected.invoke(undefined as never)
		let release: (rows: unknown[]) => void = () => {}
		seedRows = new Promise((resolve) => {
			release = resolve
		}) as never
		balanceEvents.connected.invoke(undefined as never)
		await flushPromises()
		balanceEvents.added.invoke(row("b2", "BBB", CHAIN_IDS.TESTNET))
		await flushPromises()
		expect(symbols()).toEqual(["AAA", "BBB"])
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET), row("b2", "BBB", CHAIN_IDS.TESTNET)]
		release([row("b1", "AAA", CHAIN_IDS.TESTNET)])
		await flushPromises()
		expect(balanceReads()).toBe(3)
		expect(symbols()).toEqual(["AAA", "BBB"])
		w.unmount()
	})

	test("a failed fetch shows the error line under the dash and no count, not an empty list", async () => {
		installChromeStorage()
		fetchError = new Error("port closed")
		const w = await mountPage()

		expect(w.find('[data-testid="holdings-error"]').exists()).toBe(true)
		expect(w.find('[data-testid="holdings-search"]').exists()).toBe(false)
		expect(w.find('[data-testid="holdings-total-loading"]').exists()).toBe(false)
		const figure = w.get('[data-testid="holdings-total"] span[style]')
		expect(figure.text()).toBe("—")
		expect(figure.attributes("aria-hidden")).toBe("true")
		expect(w.get('[data-testid="holdings-meta"]').text()).toBe("")
		w.unmount()
	})

	test("a priced row a live event stores while the read stays failed brings no count, skeleton or figure", async () => {
		installChromeStorage()
		fetchError = new Error("port closed")
		const held: Array<(snapshot: unknown) => void> = []
		answerQuotes = () => new Promise((resolve) => held.push(resolve))
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const w = await mountPage()
		const total = () => w.get('[data-testid="holdings-total"]')
		const meta = () => w.get('[data-testid="holdings-meta"]').text()
		balanceEvents.added.invoke(row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC))
		await flushPromises()
		expect(w.find('[data-testid="holdings-error"]').exists()).toBe(true)
		expect(w.findAll('[data-testid="token-symbol"]')).toHaveLength(0)
		expect(w.find('[data-testid="holdings-total-loading"]').exists()).toBe(false)
		expect(total().text()).toBe("—")
		expect(meta()).toBe("")

		expect(held.length).toBeGreaterThan(0)
		const snapshot = await ANSWER()
		for (const resolve of held) resolve(snapshot)
		await flushPromises()
		expect(total().text()).toBe("—")
		expect(meta()).toBe("")
		w.unmount()
	})

	test("with fiat off, a failed fetch shows no total and no count", async () => {
		installChromeStorage()
		configValues = { showFiatValues: false, incomingDustUsdThreshold: 0 }
		fetchError = new Error("port closed")
		const w = await mountPage()
		expect(w.find('[data-testid="holdings-error"]').exists()).toBe(true)
		expect(w.find('[data-testid="holdings-total"]').exists()).toBe(false)
		expect(w.get('[data-testid="holdings-meta"]').text()).toBe("")
		w.unmount()
	})
})

describe("holdings page — prices unavailable", () => {
	const summaryOf = (w: Awaited<ReturnType<typeof mountPage>>) => w.get('[data-testid="holdings-summary"]').text()

	test.each([
		["an answer that prices no holding", ANSWER],
		["a rejected answer", () => Promise.reject(new Error("port closed"))],
	])("after %s, the total is Home's dash and the meta line says why, with no count", async (_, answer) => {
		installChromeStorage()
		answerQuotes = answer
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC)]
		const w = await mountPage()
		expect(w.find('[data-testid="holdings-total-loading"]').exists()).toBe(false)
		expect(w.get('[data-testid="holdings-total"]').text()).toBe("—")
		expect(summaryOf(w)).toContain("—")
		expect(summaryOf(w)).toContain("Prices unavailable")
		expect(summaryOf(w)).not.toContain("$")
		expect(summaryOf(w)).not.toContain("tokens")
		expect(w.get('[data-testid="holdings-summary"] span[style]').attributes("aria-hidden")).toBe("true")
	})
})

// The summary also holds a hidden ruler that repeats the figure, so these read the visible spans only.
describe("holdings page — before the first price answer", () => {
	const total = (w: Awaited<ReturnType<typeof mountPage>>) => w.get('[data-testid="holdings-total"]')
	const meta = (w: Awaited<ReturnType<typeof mountPage>>) => w.get('[data-testid="holdings-meta"]').text()
	const skeleton = (w: Awaited<ReturnType<typeof mountPage>>) => w.find('[data-testid="holdings-total-loading"]')

	test("a priced holding shows a skeleton in the total's place and the count alone, until the answer brings the figure", async () => {
		installChromeStorage()
		// Each token row asks too; the service answers every caller with its one refresh.
		const held: Array<(snapshot: unknown) => void> = []
		answerQuotes = () => new Promise((resolve) => held.push(resolve))
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC), row("b2", "BBB", CHAIN_IDS.TESTNET)]
		const w = await mountPage()
		expect(skeleton(w).exists()).toBe(true)
		expect(total(w).attributes("aria-busy")).toBe("true")
		expect(total(w).text()).toBe("")
		expect(meta(w)).toBe("2 tokens")

		const snapshot = await ANSWER()
		for (const resolve of held) resolve(snapshot)
		await flushPromises()
		expect(skeleton(w).exists()).toBe(false)
		expect(total(w).attributes("aria-busy")).toBeUndefined()
		expect(total(w).text()).toBe("$1,250.00")
		expect(meta(w)).toBe("2 tokens")
	})

	test("while the list reads, the total is the skeleton and no count shows; the list's answer brings the count, the price answer the figure", async () => {
		installChromeStorage()
		let answerRead = () => {}
		readGate = new Promise((resolve) => {
			answerRead = resolve
		})
		const held: Array<(snapshot: unknown) => void> = []
		answerQuotes = () => new Promise((resolve) => held.push(resolve))
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC), row("b2", "BBB", CHAIN_IDS.TESTNET)]
		const w = await mountPage()
		expect(skeleton(w).exists()).toBe(true)
		expect(total(w).attributes("aria-busy")).toBe("true")
		expect(meta(w)).toBe("")
		expect(total(w).text()).toBe("")

		answerRead()
		await flushPromises()
		expect(skeleton(w).exists()).toBe(true)
		expect(meta(w)).toBe("2 tokens")

		const snapshot = await ANSWER()
		for (const resolve of held) resolve(snapshot)
		await flushPromises()
		expect(skeleton(w).exists()).toBe(false)
		expect(total(w).text()).toBe("$1,250.00")
	})

	test("with fiat off, a list still reading shows no count, until its answer does", async () => {
		installChromeStorage()
		configValues = { showFiatValues: false, incomingDustUsdThreshold: 0 }
		let answerRead = () => {}
		readGate = new Promise((resolve) => {
			answerRead = resolve
		})
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET), row("b2", "BBB", CHAIN_IDS.TESTNET)]
		const w = await mountPage()
		expect(w.find('[data-testid="holdings-total"]').exists()).toBe(false)
		expect(meta(w)).toBe("")

		answerRead()
		await flushPromises()
		expect(meta(w)).toBe("2 tokens")
	})

	test("an empty list, answered, reads $0.00 and 0 tokens", async () => {
		installChromeStorage()
		const w = await mountPage()
		expect(skeleton(w).exists()).toBe(false)
		expect(total(w).text()).toBe("$0.00")
		expect(meta(w)).toBe("0 tokens")
	})

	test("a wallet the signed list prices nothing of shows $0.00 and its count, no skeleton, while the answer is held", async () => {
		installChromeStorage()
		answerQuotes = () => new Promise(() => {})
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET)]
		const w = await mountPage()
		expect(skeleton(w).exists()).toBe(false)
		expect(total(w).attributes("aria-busy")).toBeUndefined()
		expect(total(w).text()).toBe("$0.00")
		expect(meta(w)).toBe("1 token")
	})
})

describe("holdings page — the total fits beside its meta line", () => {
	afterEach(() => {
		room = 10_000
	})

	// "$1,250.00" in the stand-in font: 7 digits and signs, 2 separators, 117 px at 26 px.
	test.each([
		["keeps 26 px when it fits", 10_000, "1"],
		["shrinks to the largest scale that fits, 8 px clear of the meta line", 90, "0.7"],
		["has no floor, so no digit is ever hidden", 20, "0.1"],
	])("the total %s", async (_, width, scale) => {
		installChromeStorage()
		room = width
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC)]
		const w = await mountPage()
		const figures = w.findAll('[data-testid="holdings-summary"] span[style]')
		expect(figures.map((figure) => figure.text())).toEqual(["$1,250.00"])
		expect((figures[0].element as HTMLElement).style.getPropertyValue("--hero-scale")).toBe(scale)
	})

	// "2 tokens" in a 7 px stand-in: 56 px whole, 42 px at its narrowest word. The meta line never
	// wraps, so the total's room is the line less the whole count.
	test.each([
		["keeps 26 px at the page's width", 312, "1"],
		["keeps 26 px 4 px clear of the whole count", 117 + 56 + 4, "1"],
		["keeps 26 px when the measured room rounds a hair short of it", 117 + 56 - 0.02, "1"],
		["shrinks, 8 px clear of the count, where only its narrowest word would leave it room", 117 + 42 + 4, "0.84"],
	])("a total beside the count %s", async (_, width, scale) => {
		installChromeStorage()
		room = width
		const metaWidth = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			return { width: 7 * (this.textContent ?? "").trim().length } as DOMRect
		})
		try {
			mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
			seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC), row("b2", "BBB", CHAIN_IDS.TESTNET)]
			const w = await mountPage()
			expect(w.get('[data-testid="holdings-meta"]').text()).toBe("2 tokens")
			const figure = w.get('[data-testid="holdings-summary"] span[style]').element as HTMLElement
			expect(figure.style.getPropertyValue("--hero-scale")).toBe(scale)
		} finally {
			metaWidth.mockRestore()
		}
	})

	// "1 token" is 49 px in the stand-in, "2 tokens" 56: the count alone widens, the total stays.
	test("a total refits when only the count beside it grows", async () => {
		installChromeStorage()
		room = 117 + 49 + 4
		const metaWidth = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			return { width: 7 * (this.textContent ?? "").trim().length } as DOMRect
		})
		try {
			mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
			seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC)]
			const w = await mountPage()
			const figure = () => w.get('[data-testid="holdings-summary"] span[style]').element as HTMLElement
			expect(figure().style.getPropertyValue("--hero-scale")).toBe("1")
			balanceEvents.added.invoke(row("b2", "BBB", CHAIN_IDS.TESTNET))
			await flushPromises()
			expect(w.get('[data-testid="holdings-meta"]').text()).toBe("2 tokens")
			expect(w.get('[data-testid="holdings-total"]').text()).toBe("$1,250.00")
			expect(figure().style.getPropertyValue("--hero-scale")).toBe("0.9")
		} finally {
			metaWidth.mockRestore()
		}
	})

	test("a summary that renders after the page mounts is still watched for resizes", async () => {
		installChromeStorage()
		const observed: Element[] = []
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe = (el: Element) => observed.push(el)
				unobserve = vi.fn()
				disconnect = vi.fn()
			},
		)
		try {
			const pinia = createTestingPinia({ stubActions: false })
			const appStore = useAppStore(pinia)
			appStore.network = { id: "n1", chainId: CHAIN_IDS.TESTNET } as never
			appStore.account = { address: "0xacct" } as never
			const w = mount(Holdings, { global: { plugins: [pinia], stubs: STUBS } })
			await flushPromises()
			expect(observed).toEqual([])
			appStore.isLogined = true
			await flushPromises()
			expect(observed).toEqual([w.get('[data-testid="holdings-summary"]').element])
		} finally {
			vi.unstubAllGlobals()
		}
	})
})

describe("holdings page — Add imports in one press", () => {
	const PASTED = "0x04d7bb8a4a0239077d7d246279076fdab66f5ed6167bd01882fad6131199457a"
	const added = row("b9", "NEW", CHAIN_IDS.TESTNET, PASTED)

	/** The page with a pasted address and its Add row focused, as a press leaves it. */
	async function pasteAndFocusAdd() {
		installChromeStorage()
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC)]
		const w = await mountPage(document.body)
		await w.find('[data-testid="holdings-search"]').setValue(PASTED)
		const add = w.get('[data-testid="holdings-add-token"]')
		;(add.element as HTMLElement).focus()
		return { w, add }
	}

	test("one press imports once, opens no popup, and the token's row takes the focus", async () => {
		// The worker stores the token, then its first balance row reaches the page.
		tokenCalls.addToken.mockImplementation(async () => {
			seedRows = [...seedRows, added]
			balanceEvents.added.invoke(added as never)
			return added.token
		})
		const { w, add } = await pasteAndFocusAdd()

		await add.trigger("click")
		await add.trigger("click")
		await flushPromises()
		await flushPromises()

		expect(tokenCalls.parseTokenInterface).toHaveBeenCalledTimes(1)
		expect(tokenCalls.addToken).toHaveBeenCalledTimes(1)
		expect(usePopupStore().isOpened("new_token")).toBe(false)
		expect(w.find('[data-testid="holdings-add-token"]').exists()).toBe(false)
		expect(document.activeElement?.querySelector('[data-testid="token-symbol"]')?.getAttribute("data-symbol")).toBe("NEW")
		w.unmount()
	})

	test("an added token whose balance lands empty stays in view under its searched address, and keeps the focus", async () => {
		const unsynced = { ...added, publicBalance: "0", privateBalance: "0", updatedAt: 0 }
		tokenCalls.addToken.mockImplementation(async () => {
			seedRows = [...seedRows, unsynced]
			balanceEvents.added.invoke(unsynced as never)
			return unsynced.token
		})
		const { w, add } = await pasteAndFocusAdd()
		await add.trigger("click")
		await flushPromises()
		// The worker finishes the balance task, then sends the balance it read.
		taskEvents.updated.invoke({ id: "t1", content: { kind: ContentKind.BalanceUpdate, tbId: "b9", account: "0xacct" }, finishedAt: 1 })
		await flushPromises()
		const focusedSymbol = () => document.activeElement?.querySelector('[data-testid="token-symbol"]')?.getAttribute("data-symbol")
		expect(focusedSymbol()).toBe("NEW")

		balanceEvents.updated.invoke({ ...unsynced, updatedAt: 2 } as never)
		await flushPromises()
		expect(w.find('[data-testid="holdings-fold"]').exists()).toBe(false)
		expect(focusedSymbol()).toBe("NEW")
		w.unmount()
	})

	test("a scope change mid-add ends its wait: no refusal, no focus, and Add is free in the new scope", async () => {
		let parsed!: (v: unknown) => void
		tokenCalls.parseTokenInterface.mockImplementationOnce(() => new Promise((resolve) => (parsed = resolve)))
		const { w, add } = await pasteAndFocusAdd()
		await add.trigger("click")
		await flushPromises()

		useAppStore().account = { address: "0xother" } as never
		await flushPromises()
		parsed({ isComplete: false })
		await flushPromises()

		await w.find('[data-testid="holdings-search"]').setValue(PASTED)
		expect(w.find('[data-testid="holdings-add-token-error"]').exists()).toBe(false)
		expect(w.get('[data-testid="holdings-add-token"]').attributes("loading")).toBe("false")
		w.unmount()
	})

	test("an add the page outlives sends nothing after its unmount", async () => {
		let parsed!: (v: unknown) => void
		tokenCalls.parseTokenInterface.mockImplementationOnce(() => new Promise((resolve) => (parsed = resolve)))
		const { w, add } = await pasteAndFocusAdd()
		await add.trigger("click")
		await flushPromises()
		w.unmount()
		parsed({ isComplete: true })
		await flushPromises()
		expect(tokenCalls.addToken).not.toHaveBeenCalled()
	})

	test.each([
		["a flagged address", async () => ({ ...(await LIST()), flaggedTokens: [listKeyOf(CHAIN_IDS.TESTNET, PASTED)] })],
		["an address pasted before the signed list is read", () => new Promise<never>(() => {})],
	])("%s opens the New token popup with the address, as before", async (_, list) => {
		// A read and a refresh both carry the list.
		answerList = list
		answerQuotes = list
		const { w, add } = await pasteAndFocusAdd()
		await add.trigger("click")
		await flushPromises()

		expect(usePopupStore().isOpened("new_token")).toBe(true)
		expect(usePopupStore().getPayload("new_token")).toEqual({ address: PASTED })
		expect(tokenCalls.getTokens).not.toHaveBeenCalled()
		w.unmount()
	})

	test.each([
		[
			"a listed token with no row here",
			() => tokenCalls.getTokens.mockResolvedValue([{ contract: PASTED.toUpperCase().replace("0X", "0x") }]),
			"Already exists",
		],
		[
			"an interface no standard matches",
			() => tokenCalls.parseTokenInterface.mockResolvedValue({ isComplete: false }),
			"Couldn't auto-detect this token's interface. Try a contract whose ABI matches a known standard.",
		],
		[
			"no contract at the address",
			() => tokenCalls.parseTokenInterface.mockRejectedValue(new ContractNotFoundError()),
			"There is no token at this address on this network.",
		],
		[
			"any other failure",
			() => tokenCalls.parseTokenInterface.mockRejectedValue(new Error("pxe down")),
			"Something went wrong. Try again.",
		],
	])("%s is refused on Holdings in the popup's words, announced, with focus left on Add", async (_, arrange, message) => {
		arrange()
		const { w, add } = await pasteAndFocusAdd()
		await add.trigger("click")
		await flushPromises()

		const refusal = w.get('[data-testid="holdings-add-token-error"]')
		expect(refusal.element.textContent).toBe(message)
		expect(refusal.attributes("role")).toBe("alert")
		expect(add.attributes("aria-describedby")?.split(" ")).toContain(refusal.attributes("id"))
		expect(document.activeElement).toBe(add.element)
		expect(tokenCalls.addToken).not.toHaveBeenCalled()
		expect(usePopupStore().isOpened("new_token")).toBe(false)
		w.unmount()
	})
})
