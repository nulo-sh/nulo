/**
 * TokenList mounted with the REAL TokenCard (not a stub) so hostile rows are proven to render
 * through the whole row, not just through the pure helpers.
 */
import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { EventHandler } from "@nulo/wallet-core/utils"
import TokenList from "./TokenList.vue"

vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({}) }))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: new EventHandler(),
			onConnected: new EventHandler(),
			getQuotes: vi.fn(async () => ({ quotes: {}, pricedTokens: {} })),
			refreshIfStale: vi.fn().mockResolvedValue({ quotes: {}, pricedTokens: {} }),
		}
	}),
}))

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
}

type Row = {
	id: number
	token: { id: number; chainId: number; contract: string; name: string; symbol: string; decimals: number; hasDecimals: boolean }
	account: string
	publicBalance?: string
	privateBalance?: string
	updatedAt: number
}
const row = (id: number, symbol: string, over: Partial<Row> & { name?: string; contract?: string; decimals?: number } = {}): Row => ({
	id,
	token: {
		id,
		chainId: 1,
		contract: over.contract ?? `0x${symbol.toLowerCase()}`,
		name: over.name ?? `${symbol} Token`,
		symbol,
		decimals: over.decimals ?? 18,
		hasDecimals: true,
	},
	account: "0xacct",
	publicBalance: over.publicBalance ?? "0",
	privateBalance: over.privateBalance ?? "0",
	updatedAt: over.updatedAt ?? 1,
})
const ONE = (10n ** 18n).toString()
/** Prices keyed by symbol (micro-USD); absent = unpriced. */
const fiatBy = (prices: Record<string, bigint>) => (tb: Row) => prices[tb.token.symbol]
const rateBy = (rates: Record<string, number>) => (tb: Row) => rates[tb.token.symbol]

const mountList = (props: Record<string, unknown>) =>
	mount(TokenList, { props: { fiatOf: fiatBy({}), ...props } as never, global: { stubs: STUBS } })
const symbols = (w: ReturnType<typeof mountList>) => w.findAll('[data-testid="token-symbol"]').map((s) => s.attributes("data-symbol"))
const setQuery = async (w: ReturnType<typeof mountList>, q: string) => {
	await w.find('[data-testid="holdings-search"]').setValue(q)
	await flushPromises()
}

describe("TokenList — order, search, sort", () => {
	test("value order by default: priced desc, then unpriced held by name; the count reflects matches", async () => {
		const w = mountList({
			rows: [
				row(1, "ZED", { privateBalance: ONE }),
				row(2, "ETH", { privateBalance: ONE }),
				row(3, "ALPHA", { privateBalance: ONE }),
			],
			fiatOf: fiatBy({ ETH: 3_000n }),
		})
		await flushPromises()
		expect(symbols(w)).toEqual(["ETH", "ALPHA", "ZED"])
		expect(w.find('[data-testid="holdings-count"]').text()).toBe("3")
	})

	test("search filters by symbol, name and 0x prefix; a miss shows the no-results line", async () => {
		const w = mountList({
			rows: [row(1, "A+B", { name: "Alpha Plus", contract: "0xabc", privateBalance: ONE }), row(2, "ZED", { privateBalance: ONE })],
		})
		await setQuery(w, "a+b")
		expect(symbols(w)).toEqual(["A+B"])
		await setQuery(w, "plus")
		expect(symbols(w)).toEqual(["A+B"])
		await setQuery(w, "0xab")
		expect(symbols(w)).toEqual(["A+B"])
		await setQuery(w, "nothing")
		expect(w.find('[data-testid="holdings-no-results"]').exists()).toBe(true)
		expect(symbols(w)).toEqual([])
	})

	test("the sort toggle flips to name order and back", async () => {
		const w = mountList({
			rows: [row(1, "ZED", { privateBalance: ONE }), row(2, "ETH", { privateBalance: ONE })],
			fiatOf: fiatBy({ ETH: 1n, ZED: 3_000n }),
		})
		await flushPromises()
		expect(symbols(w)).toEqual(["ZED", "ETH"])
		await w.find('[data-testid="holdings-sort"]').trigger("click")
		expect(w.find('[data-testid="holdings-sort"]').attributes("data-sort")).toBe("name")
		expect(symbols(w)).toEqual(["ETH", "ZED"])
		await w.find('[data-testid="holdings-sort"]').trigger("click")
		expect(w.find('[data-testid="holdings-sort"]').attributes("data-sort")).toBe("value")
	})
})

describe("TokenList — pinned partition", () => {
	test("pinned rows sit above the rule; the rule only renders when both sides have rows", async () => {
		const pins = new Set(["0xp"])
		const w = mountList({
			rows: [row(1, "RICH", { privateBalance: ONE }), row(2, "P", { contract: "0xp", privateBalance: ONE })],
			fiatOf: fiatBy({ RICH: 9_999n }),
			pinnedContracts: pins,
		})
		await flushPromises()
		expect(symbols(w)).toEqual(["P", "RICH"])
		expect(w.find('[data-testid="token-list-divider"]').exists()).toBe(true)

		await setQuery(w, "P")
		expect(symbols(w)).toEqual(["P"])
		expect(w.find('[data-testid="token-list-divider"]').exists()).toBe(false)
	})

	test("a pinned empty row never folds and a pinned malformed row still renders", async () => {
		const pins = new Set(["0xe", "0xbad"])
		const w = mountList({
			rows: [
				row(1, "E", { contract: "0xe" }),
				row(2, "BAD", { contract: "0xbad", publicBalance: "1.5" }),
				row(3, "HELD", { privateBalance: ONE }),
			],
			pinnedContracts: pins,
		})
		await flushPromises()
		// Both pinned; the malformed pin ranks behind every readable pin, the held row after both.
		expect(symbols(w)).toEqual(["E", "BAD", "HELD"])
		expect(w.find('[data-testid="holdings-fold"]').exists()).toBe(false)
		expect(w.find('[data-malformed="true"]').text()).toBe("—")
	})
})

describe("TokenList — fold", () => {
	test("empties fold behind a labelled row; expanding shows them; threshold 0 says 'N empty'", async () => {
		const w = mountList({ rows: [row(1, "HELD", { privateBalance: ONE }), row(2, "E1"), row(3, "E2")] })
		await flushPromises()
		expect(symbols(w)).toEqual(["HELD"])
		const fold = w.find('[data-testid="holdings-fold"]')
		expect(fold.text()).toContain("2 empty")
		await fold.trigger("click")
		expect(symbols(w)).toEqual(["HELD", "E1", "E2"])
		expect(w.find('[data-testid="holdings-fold"]').attributes("data-open")).toBe("true")
	})

	test("with a threshold and rates, dust folds too and the label splits the count", async () => {
		const w = mountList({
			rows: [row(1, "BIG", { privateBalance: ONE }), row(2, "DUST", { privateBalance: "1000" }), row(3, "E")],
			fiatOf: fiatBy({ BIG: 2_000_000n, DUST: 1n }),
			usdRateOf: rateBy({ BIG: 2, DUST: 2 }),
			dustThresholdUsd: 1,
		})
		await flushPromises()
		expect(symbols(w)).toEqual(["BIG"])
		expect(w.find('[data-testid="holdings-fold"]').text()).toContain("2 hidden · 1 empty · 1 under $1")
	})

	test("never-synced and malformed rows stay visible; a malformed row renders a dash through the real card", async () => {
		const w = mountList({
			rows: [
				row(1, "NEW", { updatedAt: 0 }),
				row(2, "BAD", { publicBalance: "junk" }),
				row(3, "HUGE", { publicBalance: "1", decimals: 500 }),
			],
		})
		await flushPromises()
		// The two malformed rows by name ("BAD Token" < "HUGE Token"), then the never-synced one.
		expect(symbols(w)).toEqual(["BAD", "HUGE", "NEW"])
		expect(w.find('[data-testid="holdings-fold"]').exists()).toBe(false)
		expect(w.findAll('[data-malformed="true"]')).toHaveLength(2)
	})

	test("no rows at all renders no fold, no rule and no results line", async () => {
		const w = mountList({ rows: [] })
		await flushPromises()
		expect(w.find('[data-testid="holdings-fold"]').exists()).toBe(false)
		expect(w.find('[data-testid="token-list-divider"]').exists()).toBe(false)
		expect(w.find('[data-testid="holdings-no-results"]').exists()).toBe(false)
	})
})

describe("TokenList — add a pasted address", () => {
	const UNLISTED = "0x04d7bb8a4a0239077d7d246279076fdab66f5ed6167bd01882fad6131199457a"
	const OFF_CURVE = "0x24f20fb6e501242936eb1f47e2f51610f15e6c07486ed62012774e5f14ebd583"
	const LISTED = "0x0f8df6867e9547fdf90e0f69187ada6fbd7b1f6ad4903ad333200bb032279ecf"
	const listed = () => [row(1, "USDC", { contract: LISTED, privateBalance: ONE })]

	test("a valid address no row matches offers one add row in place of the no-results line; a tap emits it", async () => {
		const w = mountList({ rows: listed() })
		await setQuery(w, `  ${UNLISTED} `)
		const add = w.findAll('[data-testid="holdings-add-token"]')
		expect(add).toHaveLength(1)
		expect(add[0].text()).toBe("Add token 0x04…7a")
		expect(w.find('[data-testid="holdings-no-results"]').exists()).toBe(false)
		await add[0].trigger("click")
		expect(w.emitted("addToken")).toEqual([[UNLISTED]])
	})

	test("hex that is no curve point gets the no-results line, not an add row", async () => {
		const w = mountList({ rows: listed() })
		await setQuery(w, OFF_CURVE)
		expect(w.find('[data-testid="holdings-add-token"]').exists()).toBe(false)
		expect(w.find('[data-testid="holdings-no-results"]').exists()).toBe(true)
	})

	test("an address a listed row holds, in another case, shows that row and no add row", async () => {
		const w = mountList({ rows: listed() })
		await setQuery(w, LISTED.toUpperCase().replace("0X", "0x"))
		expect(w.find('[data-testid="holdings-add-token"]').exists()).toBe(false)
		expect(symbols(w)).toEqual(["USDC"])
	})

	test("an address an empty row behind the fold holds gets no add row", async () => {
		const w = mountList({ rows: [row(1, "HELD", { privateBalance: ONE }), row(2, "E", { contract: LISTED })] })
		await setQuery(w, LISTED)
		expect(w.find('[data-testid="holdings-add-token"]').exists()).toBe(false)
		expect(w.find('[data-testid="holdings-fold"]').text()).toContain("1 empty")
	})
})

describe("TokenList — a picker host", () => {
	const UNLISTED = "0x04d7bb8a4a0239077d7d246279076fdab66f5ed6167bd01882fad6131199457a"
	const picker = (props: Record<string, unknown>, slots: Record<string, string> = {}) =>
		mount(TokenList, {
			props: { fiatOf: fiatBy({}), testidPrefix: "select-token", label: "Your tokens", sortable: false, ...props } as never,
			slots,
			global: { stubs: STUBS },
		})
	// The balance row's id and the token's id differ, as they do in storage.
	const rows = () => [
		{ ...row(1, "ONE", { privateBalance: ONE }), id: 71, token: { ...row(1, "ONE").token, id: 7 } },
		{ ...row(2, "TWO", { privateBalance: ONE }), id: 91, token: { ...row(2, "TWO").token, id: 9 } },
	]
	const marks = (w: ReturnType<typeof picker>) =>
		Object.fromEntries(
			w.findAll('[data-testid="select-token-row"]').map((el) => [el.attributes("data-symbol"), el.attributes("data-selected")]),
		)

	test("the prefix names every control, and the label and the sort switch follow the host", async () => {
		const w = picker({ rows: [...rows(), row(3, "E")], selectable: true })
		await flushPromises()
		expect(w.find('[data-testid="select-token-search"]').exists()).toBe(true)
		expect(w.find('[data-testid="select-token-count"]').text()).toBe("3")
		expect(w.find('[data-testid="select-token-fold"]').exists()).toBe(true)
		expect(w.text()).toContain("Your tokens")
		expect(w.find('[data-testid="select-token-sort"]').exists()).toBe(false)
		expect(w.find('[data-testid^="holdings-"]').exists()).toBe(false)
		await w.find('[data-testid="select-token-search"]').setValue("zzz")
		expect(w.find('[data-testid="select-token-no-results"]').exists()).toBe(true)
	})

	test("rows are buttons marked and picked by token id, never by balance row id", async () => {
		const w = picker({ rows: rows(), selectable: true, selectedId: 9 })
		await flushPromises()
		expect(marks(w)).toEqual({ ONE: "false", TWO: "true" })
		expect(w.find('[data-testid="select-token-row"][data-symbol="TWO"]').attributes("aria-current")).toBe("true")
		expect(w.find('[data-testid="select-token-row"][data-symbol="ONE"]').attributes("aria-current")).toBeUndefined()
		expect(w.findAll("a")).toHaveLength(0)
		await w.find('[data-testid="select-token-row"][data-symbol="ONE"]').trigger("click")
		expect(w.emitted("pick")).toEqual([[7]])
	})

	test("with no current token the rows are still options, none marked", async () => {
		const w = picker({ rows: rows(), selectable: true })
		await flushPromises()
		expect(marks(w)).toEqual({ ONE: "false", TWO: "false" })
		expect(w.findAll("button[data-testid='select-token-row']")).toHaveLength(2)
		expect(w.findAll('[data-testid="tokens-card"]')).toHaveLength(0)
	})

	test("Holdings' rows stay links to the token page", async () => {
		const w = mountList({ rows: rows() })
		await flushPromises()
		expect(w.findAll('a[data-testid="tokens-card"]')).toHaveLength(2)
		expect(w.find('[data-testid="select-token-row"]').exists()).toBe(false)
	})

	test.each([
		["select-token", picker],
		["holdings", (props: Record<string, unknown>) => mountList(props)],
	])("%s: a flagged pasted address shows the flag under an enabled add button that names it", async (prefix, mountIt) => {
		const flagged = vi.fn((address: string) => address === UNLISTED)
		const w = mountIt({ rows: rows(), isFlagged: flagged })
		await w.find(`[data-testid="${prefix}-search"]`).setValue(UNLISTED)
		const add = w.get(`[data-testid="${prefix}-add-token"]`)
		const line = w.get(`[data-testid="${prefix}-add-token-flagged"]`)
		expect(line.text()).toBe("Flagged as a scam")
		expect(add.attributes("disabled")).toBeUndefined()
		expect(add.attributes("aria-describedby")?.split(" ")).toContain(line.attributes("id"))
		expect(add.text()).toBe("Add token 0x04…7a")
	})

	test("an unflagged pasted address shows no flag line", async () => {
		const w = picker({ rows: rows(), isFlagged: () => false })
		await w.find('[data-testid="select-token-search"]').setValue(UNLISTED)
		expect(w.find('[data-testid="select-token-add-token"]').exists()).toBe(true)
		expect(w.find('[data-testid="select-token-add-token-flagged"]').exists()).toBe(false)
	})

	test("the host's note shows with the add row only, and the button names it", async () => {
		const w = picker({ rows: rows() }, { "add-note": "It joins your list." })
		expect(w.text()).not.toContain("It joins your list.")
		await w.find('[data-testid="select-token-search"]').setValue(UNLISTED)
		const note = w.get(`[id="${w.get('[data-testid="select-token-add-token"]').attributes("aria-describedby")}"]`)
		expect(note.text()).toBe("It joins your list.")
	})
})
