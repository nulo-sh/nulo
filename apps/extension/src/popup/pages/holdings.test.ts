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
			getTokenBalances: vi.fn().mockImplementation(async () => {
				if (readGate) await readGate
				if (fetchError) throw fetchError
				return seedRows
			}),
		}
	}),
}))
let mockQuotes: Record<string, unknown> = {}
const ANSWER = async () => ({ quotes: mockQuotes, pricedTokens: TEST_PRICED_TOKENS })
let answerQuotes: () => Promise<unknown> = ANSWER
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: new EventHandler(),
			onConnected: new EventHandler(),
			getQuotes: vi.fn(async () => ({ quotes: {}, pricedTokens: TEST_PRICED_TOKENS })),
			refreshIfStale: vi.fn().mockImplementation(() => answerQuotes()),
		}
	}),
}))
const configEvents = { update: new EventHandler(), connected: new EventHandler() }
let configValues: Record<string, unknown> = { showFiatValues: true, incomingDustUsdThreshold: 0 }
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onUpdate: configEvents.update,
			onConnected: configEvents.connected,
			getValue: vi.fn().mockImplementation(async (key: string) => configValues[key]),
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

import { CHAIN_IDS } from "@/utils/chain-ids"
import { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
import Holdings from "./holdings.vue"
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

async function mountPage() {
	const pinia = createTestingPinia({ stubActions: false })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.profile = { id: "p1" } as never
	appStore.network = { id: "n1", chainId: CHAIN_IDS.TESTNET } as never
	appStore.account = { address: "0xacct" } as never
	const wrapper = mount(Holdings, { global: { plugins: [pinia], stubs: STUBS } })
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
	mockQuotes = {}
	answerQuotes = ANSWER
	configValues = { showFiatValues: true, incomingDustUsdThreshold: 0 }
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
		expect(summary).toContain("2 tokens")
		expect(summary).toContain("priced assets only") // BBB is unpriced
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

	test("rejected config reads keep the defaults and never surface as an error", async () => {
		installChromeStorage()
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET)]
		configValues = new Proxy({}, { get: () => Promise.reject(new Error("port closed")) })
		const w = await mountPage()

		expect(w.find('[data-testid="holdings-error"]').exists()).toBe(false)
		expect(w.findAll('[data-testid="token-symbol"]')).toHaveLength(1)
		expect(w.find('[data-testid="holdings-summary"]').text()).toContain("1 tokens")
	})

	test("the add row opens the New token popup with the pasted address handed over", async () => {
		installChromeStorage()
		seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC)]
		const w = await mountPage()
		const address = "0x04d7bb8a4a0239077d7d246279076fdab66f5ed6167bd01882fad6131199457a"

		await w.find('[data-testid="holdings-search"]').setValue(address)
		await w.find('[data-testid="holdings-add-token"]').trigger("click")

		expect(usePopupStore().isOpened("new_token")).toBe(true)
		expect(usePopupStore().getPayload("new_token")).toEqual({ address })
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

// The summary also holds a hidden ruler that repeats the figure and the meta line, so these read the
// visible spans only.
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
		expect(meta(w)).toBe("2 tokens · priced assets only")
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
		expect(meta(w)).toBe("1 tokens · priced assets only")
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

	// "2 tokens · priced assets only" in a 7 px stand-in: 203 px on one line, 42 px at its narrowest
	// ("tokens", "priced", "assets"), which only the hidden ruler is laid out at.
	test.each([
		["at the page's width", 312],
		["4 px clear of the meta line at its narrowest", 117 + 42 + 4],
		["when the measured room rounds a hair short of it", 117 + 42 - 0.02],
	])("a total beside a partial meta line keeps 26 px %s", async (_, width) => {
		installChromeStorage()
		room = width
		const metaWidth = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			const words = (this.textContent ?? "").trim().split(/\s+/)
			const narrowest = this.closest("[aria-hidden]") !== null
			return { width: 7 * (narrowest ? Math.max(...words.map((w) => w.length)) : words.join(" ").length) } as DOMRect
		})
		try {
			mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
			seedRows = [row("b1", "AAA", CHAIN_IDS.TESTNET, TEST_USDC), row("b2", "BBB", CHAIN_IDS.TESTNET)]
			const w = await mountPage()
			expect(w.find('[data-testid="holdings-summary"]').text()).toContain("2 tokens · priced assets only")
			const figure = w.get('[data-testid="holdings-summary"] span[style]').element as HTMLElement
			expect(figure.style.getPropertyValue("--hero-scale")).toBe("1")
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
