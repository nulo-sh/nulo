import { describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { createMemoryHistory, createRouter } from "vue-router"
import { EventHandler } from "@nulo/wallet-core/utils"
import { CHAIN_IDS } from "@/utils/chain-ids"
import type { PriceState } from "@/wallet/services/price/spec"
import TokenCard from "./TokenCard.vue"
import { boundAttr, declarationsOf, elementByTestid, parseSource, walkElements } from "../../../../../scripts/type-roles/source-scan"
import { flaggedKeysOf } from "@/utils/token-flag"
import { TEST_FLAGGED, TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"

// TokenCard imports useAppStore but never reads from it. The store body calls
// syncedRef which touches chrome.storage.local — not stubbed in vitest.setup.ts.
// Bypass by stubbing the module entirely.
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({}),
}))

// Controllable price feed: tests set `mockQuotes` and `mockFlagged` before mounting.
let mockQuotes: PriceState = {}
let mockFlagged: string[] = []
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: new EventHandler(),
			onConnected: new EventHandler(),
			getQuotes: vi.fn(async () => ({ quotes: {}, pricedTokens: TEST_PRICED_TOKENS, flaggedTokens: mockFlagged })),
			refreshIfStale: vi
				.fn()
				.mockImplementation(async () => ({ quotes: mockQuotes, pricedTokens: TEST_PRICED_TOKENS, flaggedTokens: mockFlagged })),
		}
	}),
}))

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Spinner: { template: '<i data-testid="stub-spinner" />' },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
	Skeleton: { template: '<i data-testid="stub-skeleton" />', props: ["width", "height"] },
}

const makeRouter = () =>
	createRouter({ history: createMemoryHistory(), routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }] })

const TEST_USDC = TEST_TOKENS.USDC

const tokenInfo = {
	id: 1,
	chainId: 1,
	contract: "0x1234",
	name: "Test Token",
	symbol: "TST",
	decimals: 18,
	hasDecimals: true,
}

const factory = (overrides: Record<string, unknown> = {}, tokenOverrides: Record<string, unknown> = {}) => {
	const tokenBalance = {
		id: 42,
		token: { ...tokenInfo, ...tokenOverrides },
		account: "0xacct",
		publicBalance: "0",
		privateBalance: "0",
		updatedAt: 0,
		isUpdating: false,
		...overrides,
	}
	return mount(TokenCard, {
		props: { tokenBalance } as never,
		global: { stubs: STUBS, plugins: [makeRouter()] },
	})
}

describe("TokenCard", () => {
	test("updatedAt===0 renders a skeleton pair where the amount will be — no spinner, no caption, no '0'", () => {
		mockQuotes = {}
		const w = factory()
		const loader = w.find('[data-testid="token-balance-loading"]')
		expect(loader.exists()).toBe(true)
		expect(loader.findAll('[data-testid="stub-skeleton"]')).toHaveLength(2)
		expect(loader.attributes("aria-busy")).toBe("true")
		expect(loader.text()).toBe("")
		expect(w.find('[data-testid="stub-spinner"]').exists()).toBe(false)
		// And the misleading "0" amount column must not be rendered
		expect(w.text()).not.toMatch(/^0$/m)
	})

	test("updatedAt>0 with zero balances renders genuine '0' (not the loader)", () => {
		mockQuotes = {}
		const w = factory({ updatedAt: 1, publicBalance: "0", privateBalance: "0" })
		expect(w.find('[data-testid="token-balance-loading"]').exists()).toBe(false)
		expect(w.text()).toContain("0")
	})

	test("isUpdating after first sync is SILENT per row — amount visible, no indicator of any kind", () => {
		// The per-row refreshing dot was retired (batch refreshes animated every row at once);
		// TokensView's section-header dot is the one activity signal. The row's contract during a
		// routine refresh: show the last-known amount, change nothing else.
		mockQuotes = {}
		const w = factory({
			updatedAt: 1700_000_000_000,
			publicBalance: "5000000000000000000",
			privateBalance: "0",
			isUpdating: true,
		})
		expect(w.find('[data-testid="token-balance-loading"]').exists()).toBe(false)
		expect(w.find('[data-testid="token-balance-refreshing"]').exists()).toBe(false)
		expect(w.find('[data-testid="token-balance-failed"]').exists()).toBe(false)
		// Total = 5 TST (decimals 18) — formatter renders as "5"
		expect(w.text()).toContain("5")
	})

	test("initial sync still shows the loading block (the never-synced state keeps speaking)", () => {
		mockQuotes = {}
		const initial = factory({ updatedAt: 0, publicBalance: "0", privateBalance: "0", isUpdating: true })
		expect(initial.find('[data-testid="token-balance-refreshing"]').exists()).toBe(false)
		expect(initial.find('[data-testid="token-balance-loading"]').exists()).toBe(true)
	})

	test("a persisted syncFailure dims the last-known amount and says why", () => {
		mockQuotes = {}
		const w = factory({
			updatedAt: 1700_000_000_000,
			publicBalance: "5000000000000000000",
			privateBalance: "0",
			syncFailure: { at: 1700_000_000_001, message: "sim failed" },
		})
		const failed = w.find('[data-testid="token-balance-failed"]')
		expect(failed.exists()).toBe(true)
		expect(failed.text()).toContain("Couldn't refresh")
		// The last-known amount stays visible (dimmed, never blanked).
		expect(w.text()).toContain("5")
	})

	test("the failed caption yields while a retry is in flight (silent row, amount stays)", () => {
		// syncFailed gates on !isUpdating, so a retry clears the caption; with the per-row dot
		// retired, the retry itself is silent — the amount just stays visible.
		mockQuotes = {}
		const w = factory({
			updatedAt: 1700_000_000_000,
			publicBalance: "5000000000000000000",
			privateBalance: "0",
			isUpdating: true,
			syncFailure: { at: 1700_000_000_001, message: "sim failed" },
		})
		expect(w.find('[data-testid="token-balance-failed"]').exists()).toBe(false)
		expect(w.find('[data-testid="token-balance-refreshing"]').exists()).toBe(false)
		expect(w.text()).toContain("5")
	})

	test("an initial-sync RETRY in flight shows the loader again, not a stale failed caption", () => {
		// updatedAt 0 + syncFailure + isUpdating: the retry's honest state is the
		// loading block — a failed caption with no in-flight indicator would read
		// as terminal while work is running.
		mockQuotes = {}
		const w = factory({ updatedAt: 0, publicBalance: "0", privateBalance: "0", isUpdating: true, syncFailure: { at: 1, message: "x" } })
		expect(w.find('[data-testid="token-balance-failed"]').exists()).toBe(false)
		expect(w.find('[data-testid="token-balance-loading"]').exists()).toBe(true)
	})

	test("a FAILED first sync shows the failure, never an infinite loading spinner", () => {
		// A never-synced row (updatedAt 0) whose first projection failed used to
		// spin forever — the exact failed-vs-still-running ambiguity the
		// persisted record exists to close. The failed state wins the block.
		mockQuotes = {}
		const w = factory({ updatedAt: 0, publicBalance: "0", privateBalance: "0", syncFailure: { at: 1, message: "x" } })
		expect(w.find('[data-testid="token-balance-loading"]').exists()).toBe(false)
		expect(w.find('[data-testid="token-balance-failed"]').exists()).toBe(true)
	})

	test("B1: a priced token renders the holding's fiat line", async () => {
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 0.999857, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const w = factory(
			{ updatedAt: 1, privateBalance: (1_000n * 10n ** 6n).toString(), publicBalance: (250n * 10n ** 6n).toString() },
			{ chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC, decimals: 6, symbol: "cUSD" },
		)
		await flushPromises()
		const fiat = w.find('[data-testid="token-fiat"]')
		expect(fiat.exists()).toBe(true)
		expect(fiat.text()).toBe("≈ $1,249.82")
	})

	test("B1: an unpriced token renders NO fiat element (no fake $0.00)", async () => {
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 0.999857, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const w = factory({ updatedAt: 1, publicBalance: "5000000000000000000" })
		await flushPromises()
		expect(w.find('[data-testid="token-fiat"]').exists()).toBe(false)
		expect(w.text()).not.toContain("$")
	})

	test("B1: with an empty price state (kill-switch / offline) nothing fiat renders", async () => {
		mockQuotes = {}
		const w = factory(
			{ updatedAt: 1, publicBalance: (250n * 10n ** 6n).toString() },
			{ chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC, decimals: 6 },
		)
		await flushPromises()
		expect(w.find('[data-testid="token-fiat"]').exists()).toBe(false)
	})
})

describe("TokenCard — the row is a link", () => {
	async function mountLinked() {
		const router = makeRouter()
		await router.push("/popup/general")
		const push = vi.spyOn(router, "push")
		const w = mount(TokenCard, {
			props: {
				tokenBalance: { id: 42, token: tokenInfo, account: "0xacct", publicBalance: "0", privateBalance: "0", updatedAt: 1 },
			} as never,
			global: { stubs: STUBS, plugins: [router] },
			attachTo: document.body,
		})
		return { w, router, push, row: w.find('[data-testid="tokens-card"]') }
	}

	test("an anchor to the token page, with no tabindex", async () => {
		const { w, row } = await mountLinked()
		expect(row.element.tagName).toBe("A")
		expect(row.attributes("href")).toBe("/popup/tokens/1")
		expect(row.attributes("tabindex")).toBeUndefined()
		w.unmount()
	})

	test("Space navigates once and prevents the scroll; Shift+Space not at all", async () => {
		const { w, router, push, row } = await mountLinked()
		const plain = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })
		row.element.dispatchEvent(plain)
		await flushPromises()
		expect(plain.defaultPrevented).toBe(true)
		expect(push).toHaveBeenCalledTimes(1)
		expect(router.currentRoute.value.path).toBe("/popup/tokens/1")

		push.mockClear()
		const shifted = new KeyboardEvent("keydown", { key: " ", shiftKey: true, bubbles: true, cancelable: true })
		row.element.dispatchEvent(shifted)
		await flushPromises()
		expect(shifted.defaultPrevented).toBe(false)
		expect(push).not.toHaveBeenCalled()
		w.unmount()
	})
})

describe("TokenCard — a picker's option", () => {
	async function mountOption(selected: boolean) {
		const router = makeRouter()
		await router.push("/popup/send")
		const push = vi.spyOn(router, "push")
		const w = mount(TokenCard, {
			props: {
				tokenBalance: { id: 42, token: tokenInfo, account: "0xacct", publicBalance: "0", privateBalance: "0", updatedAt: 1 },
				pickPrefix: "select-token",
				selected,
			} as never,
			global: { stubs: STUBS, plugins: [router] },
		})
		return { w, push, row: w.find('[data-testid="select-token-row"]') }
	}

	test("a native button that picks the token id and never navigates", async () => {
		const { w, push, row } = await mountOption(false)
		expect(row.element.tagName).toBe("BUTTON")
		expect(row.attributes("type")).toBe("button")
		expect(w.find("a").exists()).toBe(false)
		await row.trigger("click")
		await flushPromises()
		expect(w.emitted("pick")).toEqual([[1]])
		expect(push).not.toHaveBeenCalled()
		const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })
		row.element.dispatchEvent(space)
		await flushPromises()
		expect(space.defaultPrevented).toBe(false)
		expect(push).not.toHaveBeenCalled()
	})

	test("the current token says so, the others do not", async () => {
		const current = (await mountOption(true)).row
		expect(current.attributes("data-selected")).toBe("true")
		expect(current.attributes("aria-current")).toBe("true")
		expect(current.attributes("data-symbol")).toBe("TST")
		const other = (await mountOption(false)).row
		expect(other.attributes("data-selected")).toBe("false")
		expect(other.attributes("aria-current")).toBeUndefined()
	})
})

describe("TokenCard — hostile rows", () => {
	test("a malformed balance renders a dash with no split and never throws", async () => {
		const w = factory({ updatedAt: 1, publicBalance: "1.5", privateBalance: "0" })
		await flushPromises()
		const amount = w.find('[data-malformed="true"]')
		expect(amount.exists()).toBe(true)
		expect(amount.text()).toBe("—")
		expect(w.findAll('[data-testid="stub-icon"]')).toHaveLength(0)
		expect(w.find('[data-testid="token-fiat"]').exists()).toBe(false)
	})

	test("an absurd decimals value is treated the same way (no exponent is ever computed)", async () => {
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const w = factory({ updatedAt: 1, publicBalance: "1" }, { chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC, decimals: 500 })
		await flushPromises()
		expect(w.find('[data-malformed="true"]').text()).toBe("—")
		expect(w.find('[data-testid="token-fiat"]').exists()).toBe(false)
	})

	test("a token whose decimals the wallet does not know shows a dash and no fiat, never a figure", async () => {
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const w = factory(
			{ updatedAt: 1, publicBalance: "1" },
			{ chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC, decimals: 0, hasDecimals: false },
		)
		await flushPromises()
		expect(w.find('[data-malformed="true"]').text()).toBe("—")
		expect(w.find('[data-testid="token-fiat"]').exists()).toBe(false)
	})

	test("a malformed row that never synced shows the dash, not the loading block", async () => {
		const w = factory({ updatedAt: 0, publicBalance: "1.5", privateBalance: "0" })
		await flushPromises()
		expect(w.find('[data-malformed="true"]').text()).toBe("—")
		expect(w.find('[data-testid="token-balance-loading"]').exists()).toBe(false)
	})

	test("a long symbol and a long name both render clipped, with the balance still present", async () => {
		const w = factory({ updatedAt: 1, publicBalance: (7n * 10n ** 18n).toString() }, { symbol: "S".repeat(400), name: "N".repeat(400) })
		await flushPromises()
		expect(w.find('[data-testid="token-symbol"]').text()).toHaveLength(400)
		expect(w.find("[data-malformed]").exists()).toBe(false)
		expect(w.text()).toContain("7")
	})

	test("a blank symbol and an empty or blank name read as the empty-value dash; data-symbol keeps the stored symbol", async () => {
		mockQuotes = {}
		const blank = factory({ updatedAt: 1, publicBalance: "5" }, { symbol: "   ", name: "" })
		const spaces = factory({ updatedAt: 1, publicBalance: "5" }, { name: "   " })
		const plain = factory({ updatedAt: 1, publicBalance: "5" })
		await flushPromises()
		const symbol = blank.get('[data-testid="token-symbol"]')
		expect([symbol.text(), symbol.attributes("data-symbol")]).toEqual(["—", "   "])
		expect(blank.get('[data-testid="token-name"]').text()).toBe("—")
		expect(spaces.get('[data-testid="token-name"]').text()).toBe("—")
		expect([plain.get('[data-testid="token-symbol"]').text(), plain.get('[data-testid="token-name"]').text()]).toEqual([
			"TST",
			"Test Token",
		])
	})
})

describe("TokenCard — R5 layout (subtitle left, private/public split right)", () => {
	test("priced: fiat fills the subtitle slot; no PRIVATE/PUBLIC label anywhere", async () => {
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 0.999857, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const w = factory(
			{ updatedAt: 1, privateBalance: (1_000n * 10n ** 6n).toString(), publicBalance: (250n * 10n ** 6n).toString() },
			{ chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC, decimals: 6, symbol: "cUSD" },
		)
		await flushPromises()
		expect(w.find('[data-testid="token-fiat"]').exists()).toBe(true)
		expect(w.text()).not.toContain("PRIVATE / PUBLIC")
	})

	test("unpriced: the token's full NAME fills the subtitle slot (never the PRIVATE/PUBLIC label)", async () => {
		mockQuotes = {}
		const w = factory({ updatedAt: 1, publicBalance: "5" })
		await flushPromises()
		expect(w.text()).not.toContain("PRIVATE / PUBLIC")
		expect(w.text()).toContain("Test Token")
	})

	test("a holding too long for the row keeps every whole digit: the total at 10 characters, each side at 6", async () => {
		mockQuotes = {}
		const w = factory({
			updatedAt: 1,
			privateBalance: (12_345_678_912n * 10n ** 16n).toString(),
			publicBalance: (12_345n * 10n ** 17n).toString(),
		})
		await flushPromises()
		// 123,458,023.62 in total, 123,456,789.12 private, 1,234.5 public.
		expect(w.text()).toContain("123.45M")
		expect(w.text()).toContain("123.4M")
		expect(w.text()).toContain("1,234")
		expect(w.text()).not.toContain("1,234.")
	})

	test("a row the signed list flags reads 'Flagged as a scam' in place of its name; an unflagged row keeps its name", async () => {
		mockQuotes = {}
		mockFlagged = flaggedKeysOf([TEST_FLAGGED])
		try {
			// Wire-shaped, in the upper case a restored row may keep.
			const contract = `0x${TEST_FLAGGED.address.slice(2).toUpperCase()}`
			const flagged = factory({ updatedAt: 1, publicBalance: "5" }, { chainId: TEST_FLAGGED.chainId, contract })
			const plain = factory({ updatedAt: 1, publicBalance: "5" }, { chainId: TEST_FLAGGED.chainId, contract: TEST_USDC })
			await flushPromises()
			expect(flagged.find('[data-testid="token-flagged"]').text()).toBe("Flagged as a scam")
			expect(flagged.find('[data-testid="token-name"]').exists()).toBe(false)
			expect(plain.find('[data-testid="token-flagged"]').exists()).toBe(false)
			expect(plain.find('[data-testid="token-name"]').text()).toBe("Test Token")
		} finally {
			mockFlagged = []
		}
	})

	test("the split line renders the private mark and the public mark with both amounts", async () => {
		mockQuotes = {}
		const w = factory({ updatedAt: 1, privateBalance: (7n * 10n ** 18n).toString(), publicBalance: (3n * 10n ** 18n).toString() })
		await flushPromises()
		const icons = w.findAll('[data-testid="stub-icon"]')
		expect(icons.map((i) => i.attributes("data-name"))).toEqual(["private", "public"])
		expect(w.text()).toContain("7")
		expect(w.text()).toContain("3")
	})
})

describe("TokenCard — the subtitle's overflow", () => {
	const parsed = parseSource("apps/extension/src/popup/components/modules/general/TokenCard.vue")

	test("the flagged line is a caption in the danger text colour, which passes AA in both themes", () => {
		expect(declarationsOf(parsed, ".flagged")).toEqual({ composes: "type--caption from global", color: "var(--txt-danger)" })
	})

	test("a priced figure wraps rather than hide digits; a contract-supplied name stays clipped to one line", () => {
		const fiat = elementByTestid(parsed, "token-fiat")?.node
		expect(fiat && boundAttr(fiat, "class")).toBe("[$style.fiat, $style.fiat_figure]")
		expect(declarationsOf(parsed, ".fiat_figure")).toEqual({
			"max-width": "190px",
			"white-space": "normal",
			"overflow-wrap": "anywhere",
		})
		expect(declarationsOf(parsed, ".fiat")).toMatchObject({ "max-width": "160px", overflow: "hidden", "white-space": "nowrap" })
		const subtitles: string[] = []
		if (parsed.template)
			walkElements(parsed.template, (node) => void (node.tag === "span" && subtitles.push(boundAttr(node, "class") ?? "")))
		expect(subtitles.filter((cls) => cls.includes("$style.fiat"))).toEqual(["[$style.fiat, $style.fiat_figure]", "$style.fiat"])
	})
})
