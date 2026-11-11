/**
 * TransactionCard (settled) — colocated unit tests.
 *
 * The settled card derives its direction and its app chip from independent sources (call shape →
 * direction; tx.origin → originLabel), unlike the journal-driven awaiting + terminal cards where
 * the two are mutually exclusive. A dApp-initiated transfer sets both, and must show both.
 */

import { mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { OriginType, TransferType, TxExecutionResult, TxStatus } from "@/wallet/services/transaction/spec"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { flushPromises } from "@vue/test-utils"
import { flaggedKeysOf } from "@/utils/token-flag"
import { tokenIconsOf } from "@/utils/token-icon"
import { TEST_ICONS, TEST_LIST_ENTRIES_WITH_ICONS, TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"

// Bypass the real Pinia app store + its chrome.storage subscriptions —
// TransactionCard only reads `network.chainId` + `defaultExplorer` for the
// explorer URL computed; nothing in the chip-render path needs the store.
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({ network: { chainId: CHAIN_IDS.TESTNET }, defaultExplorer: "aztecscan" }),
}))

// Controllable price feed for the fiat case; the list's flags and pictures ride every answer.
let mockQuotes: Record<string, unknown> = {}
let mockList: { flaggedTokens: string[]; tokenIcons: Record<string, string> } = { flaggedTokens: [], tokenIcons: {} }
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: { add: vi.fn(), remove: vi.fn() },
			onConnected: { add: vi.fn(), remove: vi.fn() },
			getQuotes: vi.fn(async () => ({ quotes: {}, pricedTokens: TEST_PRICED_TOKENS, ...mockList })),
			refreshIfStale: vi.fn().mockImplementation(async () => ({ quotes: mockQuotes, pricedTokens: TEST_PRICED_TOKENS, ...mockList })),
		}
	}),
}))

import { RowAction } from "@nulo/design"
import TransactionCard from "./TransactionCard.vue"

const STUBS = {
	Flex: { template: '<div :class="$attrs.class" v-bind="$attrs"><slot /></div>', inheritAttrs: false },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" :data-color="color" />', props: ["name", "size", "color"] },
	TransactionCardLayout: {
		template: `
			<div :data-testid="testId" :data-tx-transfer-type="txTransferTypeLabel">
				<span class="title">{{ title }}</span>
				<slot name="title-trailing" />
				<slot name="badge" />
				<slot name="secondary" />
				<span class="amount">{{ amount }}</span>
				<span class="symbol">{{ amountSymbol }}</span>
				<span v-if="amountFiat" data-testid="activity-fiat">{{ amountFiat }}</span>
			</div>
		`,
		props: [
			"title",
			"icon",
			"amount",
			"amountSymbol",
			"titleNamesToken",
			"amountFiat",
			"testId",
			"txAmountDisplay",
			"txTransferTypeLabel",
			"txStatus",
			"txHash",
			"to",
			"oneLineTitle",
			"direction",
			"titleMark",
		],
	},
}

const TX_HASH = `0x${"abcd1234".repeat(8)}`
const dappTransferTx = {
	hash: TX_HASH,
	status: TxStatus.Proposed,
	calls: [
		{
			contract: "0xtoken",
			method: "transfer_private_to_public",
			args: ["0xfrom", "0xto", "5000000"],
			transfers: [
				{
					token: { name: "USDC", symbol: "USDC", decimals: 6 },
					type: TransferType.PrivateToPublic,
					from: "0xfrom",
					to: "0xto",
					amount: "5000000",
				},
			],
		},
	],
	origin: { type: OriginType.DAPP, name: "example.dapp.io" },
}

const mountCard = (tx: Record<string, unknown>, props: Record<string, unknown> = {}) =>
	mount(TransactionCard, { props: { tx, ...props } as never, global: { stubs: STUBS, components: { RowAction } } })

describe("modules/activity/TransactionCard (settled)", () => {
	test.each([
		["mined", { status: TxStatus.Proposed, executionResult: TxExecutionResult.Success }, "square-check", "txt-success"],
		["reverted", { status: TxStatus.Proposed, executionResult: TxExecutionResult.AppLogicReverted }, "square-cross", "txt-danger"],
		["dropped", { status: TxStatus.Dropped }, "square-cross", "txt-danger"],
		["pending", { status: TxStatus.Pending }, "square-half", "gray"],
	])("a %s tx's status icon fills with its state's status text token", (_label, over, name, fill) => {
		const icon = mountCard({ ...dappTransferTx, ...over }).find(`[data-testid="activity-status-icon"][data-name="${name}"]`)
		expect(icon.attributes("data-color")).toBe(fill)
	})

	test("a transfer of a blank symbol is titled with the empty-value dash; its amount keeps the symbol as stored", () => {
		const [call] = dappTransferTx.calls
		const blankTx = {
			...dappTransferTx,
			calls: [{ ...call, transfers: [{ ...call.transfers[0], token: { name: "", symbol: "   ", decimals: 6 } }] }],
		}
		const read = (tx: Record<string, unknown>) => {
			const layout = mountCard(tx).findComponent(STUBS.TransactionCardLayout)
			return [layout.props("title"), layout.props("amountSymbol")]
		}
		expect(read(blankTx)).toEqual(["—", "   "])
		expect(read(dappTransferTx)).toEqual(["USDC", "USDC"])
	})

	test("a dApp-initiated transfer keeps both its direction and its app chip", () => {
		const w = mountCard(dappTransferTx)
		expect(w.findComponent(STUBS.TransactionCardLayout).props("direction")).toEqual({
			from: "private",
			to: "public",
			way: "out",
			label: "Private → Public",
		})
		expect(w.get('[data-testid="activity-direction-chip"]').text()).toBe("Private → Public")
		expect(w.get('[data-testid="activity-app-chip"]').text()).toBe("example.dapp.io")
	})

	describe("the direction's way", () => {
		const ACCOUNT = `0x${"0a".repeat(32)}`
		const sentTo = (from: string, to: string, type: unknown = TransferType.PrivateToPublic) => {
			const [call] = dappTransferTx.calls
			const tx = { ...dappTransferTx, calls: [{ ...call, transfers: [{ ...call.transfers[0], type, from, to }] }] }
			return mountCard(tx).findComponent(STUBS.TransactionCardLayout)
		}

		test("a transfer to its own sender is a move, whatever the hex case; to another account it goes out", () => {
			expect(sentTo(ACCOUNT, ACCOUNT.replace(/a/g, "A")).props("direction")?.way).toBe("self")
			expect(sentTo(ACCOUNT, `0x${"0b".repeat(32)}`).props("direction")?.way).toBe("out")
		})

		test("a move's hidden words say the value stayed in the account; the row's transfer type keeps the label", () => {
			const moved = sentTo(ACCOUNT, ACCOUNT)
			expect(moved.find('[data-testid="activity-direction-chip"]').text()).toBe("Private → Public, within this account")
			expect(moved.props("txTransferTypeLabel")).toBe("Private → Public")
			expect(
				sentTo(ACCOUNT, `0x${"0b".repeat(32)}`)
					.find('[data-testid="activity-direction-chip"]')
					.text(),
			).toBe("Private → Public")
		})

		test("two equal addresses that are no address never make a move", () => {
			expect(sentTo("", "").props("direction")?.way).toBe("out")
		})

		test("a type the wallet does not send draws no direction, and the transfer's title stays whole", () => {
			const layout = sentTo(ACCOUNT, ACCOUNT, "constructor")
			expect(layout.props("direction")).toBeNull()
			expect(layout.props("oneLineTitle")).toBe(false)
			expect(layout.props("txTransferTypeLabel")).toBeNull()
			expect(layout.find('[data-testid="activity-direction-chip"]').exists()).toBe(false)
		})
	})

	describe("the title row, with a dApp's function and host as the wire carries them", () => {
		const HOST = "staging-nemi-interface.nemi-e65.workers.dev"
		const dappCallTx = {
			hash: TX_HASH,
			status: TxStatus.Proposed,
			calls: [{ contract: "0xamm", method: "swap_exact_tokens_for_tokens_supporting_fee_on_transfer_tokens", args: [] }],
			origin: { type: OriginType.DAPP, name: HOST },
		}
		const layout = (w: ReturnType<typeof mountCard>) => w.findComponent(STUBS.TransactionCardLayout)

		test("a call names the dApp and no direction: its function title is cut to one line and the host sits in the app chip", () => {
			const w = mountCard(dappCallTx)
			expect(layout(w).props("title")).toBe("Swap Exact Tokens For Tokens Supporting Fee On Transfer Tokens")
			expect(layout(w).props("oneLineTitle")).toBe(true)
			expect(w.find('[data-testid="activity-app-chip"]').text()).toBe(HOST)
			expect(w.html()).not.toMatch(/chips/)
		})

		test("a transfer from the popup is never cut and has no app chip", () => {
			const { origin: _origin, ...popupTransfer } = dappTransferTx
			const w = mountCard(popupTransfer)
			expect(layout(w).props("oneLineTitle")).toBe(false)
			expect(w.find('[data-testid="activity-app-chip"]').exists()).toBe(false)
			expect(w.find('[data-testid="activity-direction-chip"]').text()).toBe("Private → Public")
			expect(w.html()).not.toMatch(/app_slot/)
		})

		test("a dApp's transfer keeps its symbol whole: its app chip sits alone in a slot that gives way, and no direction chip shows", () => {
			const w = mountCard({ ...dappTransferTx, origin: { type: OriginType.DAPP, name: HOST } })
			expect(layout(w).props("oneLineTitle")).toBe(false)
			const slot = w.find('[data-testid="activity-app-chip"]').element.parentElement
			expect(slot?.className).toMatch(/app_slot/)
			expect(slot?.textContent).toBe(HOST)
			expect(slot?.previousElementSibling?.getAttribute("data-testid")).toBe("activity-title-sep")
			expect(
				w
					.get('[data-testid="activity-direction-chip"]')
					.classes()
					.some((c) => c.includes("direction")),
			).toBe(true)
		})

		test("a dApp's transfer drops the spaces its name leads with, which nothing else would collapse there", () => {
			const w = mountCard({ ...dappTransferTx, origin: { type: OriginType.DAPP, name: "  NEMI" } })
			expect(w.find('[data-testid="activity-app-chip"]').element.textContent).toBe("NEMI")
		})
	})

	describe("a dApp's mint, as the wire carries it", () => {
		const field = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`
		const TOKEN = `0x${"0a".repeat(32)}`
		const RECIPIENT = `0x${"0c".repeat(32)}`
		const CLASS = field(0xc1a55n)
		const tokens = [
			{
				id: 1,
				chainId: CHAIN_IDS.TESTNET,
				contract: TOKEN,
				classId: CLASS,
				name: "Test",
				symbol: "TST",
				decimals: 18,
				hasDecimals: true,
			},
		]
		const mintTx = (...amounts: bigint[]) => ({
			hash: "0xmint1",
			status: TxStatus.Proposed,
			calls: amounts.map((a) => ({ contract: TOKEN, method: "mint_to_public", args: [RECIPIENT, field(a)], classId: CLASS })),
			origin: { type: OriginType.DAPP, name: "example.dapp.io" },
		})

		test("of a listed 18-decimal token reads 1 and its symbol, which its kind's title does not name", () => {
			const w = mountCard(mintTx(10n ** 18n), { tokens })
			expect(w.find(".amount").text()).toBe("1")
			expect(w.find(".symbol").text()).toBe("TST")
			expect(w.findComponent(STUBS.TransactionCardLayout).props("titleNamesToken")).toBe(false)
		})

		test("a transfer of the same token is titled by its symbol, so the layout is told the title names it", () => {
			const transfer = {
				hash: field(0x7a7an),
				status: TxStatus.Proposed,
				calls: [
					{
						contract: TOKEN,
						method: "transfer_private_to_public",
						args: [RECIPIENT, `0x${"1e".repeat(32)}`, field(10n ** 18n)],
						classId: CLASS,
						transfers: [
							{
								token: { name: "Test", symbol: "TST", decimals: 18 },
								type: 1,
								from: RECIPIENT,
								to: `0x${"1e".repeat(32)}`,
								amount: "1000000000000000000",
							},
						],
					},
				],
				origin: { type: OriginType.UI },
			}
			const layout = mountCard(transfer, { tokens }).findComponent(STUBS.TransactionCardLayout)
			expect(layout.props()).toMatchObject({ title: "TST", amountSymbol: "TST", titleNamesToken: true })
		})

		test("of an unlisted token shows no amount", () => {
			const w = mountCard(mintTx(10n ** 18n))
			expect(w.find(".amount").text()).toBe("")
		})

		test("of 1,234,567 tokens reads the compact form", () => {
			const w = mountCard(mintTx(1_234_567n * 10n ** 18n), { tokens })
			expect(w.find(".amount").text()).toBe("1.23M")
		})

		test("with two mint calls shows no amount", () => {
			const w = mountCard(mintTx(10n ** 18n, 10n ** 18n), { tokens })
			expect(w.find(".amount").text()).toBe("")
		})

		test("a listed mint reads as the window names it, with the faucet; a call no token reading covers, by its own name with the call glyph", () => {
			const layout = (w: ReturnType<typeof mountCard>) => w.findComponent(STUBS.TransactionCardLayout)
			const mint = layout(mountCard(mintTx(10n ** 18n), { tokens }))
			expect([mint.props("title"), mint.props("icon")]).toEqual(["Mint (public)", "faucet"])
			const ownership = layout(
				mountCard(
					{ ...mintTx(), calls: [{ contract: TOKEN, method: "transfer_ownership", args: [RECIPIENT], classId: CLASS }] },
					{ tokens },
				),
			)
			expect([ownership.props("title"), ownership.props("icon")]).toEqual(["Transfer Ownership", "zap"])
		})
	})

	test("`to` reaches the layout, and the explorer link is a named action opening a new tab", () => {
		const w = mountCard(dappTransferTx, { to: `/popup/tx/${TX_HASH}` })
		expect(w.findComponent(STUBS.TransactionCardLayout).props("to")).toBe(`/popup/tx/${TX_HASH}`)
		const explorer = w.find('a[aria-label="Open in block explorer"]')
		expect(explorer.attributes("target")).toBe("_blank")
		expect(explorer.attributes("rel")).toBe("noopener noreferrer")
		expect(explorer.attributes("href")).toContain(TX_HASH)
	})
})

describe("TransactionCard fiat (D2 activity rows)", () => {
	const TEST_USDC = TEST_TOKENS.USDC
	const mkTransferTx = (contract: string) =>
		({
			hash: "0xfiat1",
			status: TxStatus.Proposed,
			origin: { type: OriginType.UI },
			calls: [
				{
					contract,
					method: "transfer",
					transfers: [
						{
							token: { name: "cUSD", symbol: "cUSD", decimals: 6 },
							type: TransferType.Private,
							from: "0xa",
							to: "0xb",
							amount: (125n * 10n ** 6n).toString(),
						},
					],
				},
			],
		}) as never

	test("priced transfer row renders the ≈ fiat under the amount", async () => {
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1.0, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const w = mount(TransactionCard, { props: { tx: mkTransferTx(TEST_USDC) }, global: { stubs: STUBS } })
		await flushPromises()
		const fiat = w.find('[data-testid="activity-fiat"]')
		expect(fiat.exists()).toBe(true)
		expect(fiat.text()).toBe("≈ $125.00")
	})

	test("unpriced transfer row renders NO fiat element", async () => {
		mockQuotes = {}
		const w = mount(TransactionCard, { props: { tx: mkTransferTx("0xunmapped") }, global: { stubs: STUBS } })
		await flushPromises()
		expect(w.find('[data-testid="activity-fiat"]').exists()).toBe(false)
	})

	test.each([
		["unknown decimals: no figure and no fiat", false, { amount: "", fiat: false }],
		["known decimals (control): the figure and its fiat", true, { amount: "125", fiat: true }],
	])("a priced transfer of a listed token with %s; the title keeps the symbol", async (_label, hasDecimals, want) => {
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1.0, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const tokens = [{ contract: TEST_USDC, symbol: "cUSD", decimals: hasDecimals ? 6 : 0, hasDecimals }]
		const w = mount(TransactionCard, { props: { tx: mkTransferTx(TEST_USDC), tokens } as never, global: { stubs: STUBS } })
		await flushPromises()
		expect({
			title: w.find(".title").text(),
			amount: w.find(".amount").text(),
			fiat: w.find('[data-testid="activity-fiat"]').exists(),
		}).toEqual({ title: "cUSD", ...want })
	})
})

describe("TransactionCard's title mark", () => {
	const field = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`
	const FLAGGED = `0x${"0e".repeat(32)}`
	const transferOf = (contract: string, origin: Record<string, unknown> = { type: OriginType.UI }) => ({
		hash: field(0x5e5en),
		status: TxStatus.Proposed,
		origin,
		calls: [
			{
				contract,
				method: "transfer_private_to_public",
				args: [field(0xa1n), field(0xb2n), field(125n * 10n ** 6n)],
				transfers: [
					{
						token: { name: "USD Coin", symbol: "USDC", decimals: 6 },
						type: TransferType.PrivateToPublic,
						from: field(0xa1n),
						to: field(0xb2n),
						amount: (125n * 10n ** 6n).toString(),
					},
				],
			},
		],
	})
	const layoutOf = async (tx: Record<string, unknown>, tokens: unknown[] = []) => {
		mockList = {
			flaggedTokens: flaggedKeysOf([{ chainId: CHAIN_IDS.TESTNET, address: FLAGGED }]),
			tokenIcons: tokenIconsOf(TEST_LIST_ENTRIES_WITH_ICONS),
		}
		const w = mountCard(tx, { tokens })
		await flushPromises()
		return w.findComponent(STUBS.TransactionCardLayout)
	}
	const markOf = async (tx: Record<string, unknown>) => (await layoutOf(tx)).props("titleMark")

	test.each([
		["the wallet's", { type: OriginType.UI }],
		["a dApp's", { type: OriginType.DAPP, name: "example.dapp.io" }],
	])(
		"%s transfer of a listed token draws the list's picture; a custom one its initials; a flagged one the badge",
		async (_who, origin) => {
			expect(await markOf(transferOf(TEST_TOKENS.USDC, origin))).toEqual({ symbol: "USDC", icon: TEST_ICONS.USDC, badge: false })
			expect(await markOf(transferOf(field(0xc0ffeen), origin))).toEqual({ symbol: "USDC", icon: undefined, badge: false })
			expect(await markOf(transferOf(FLAGGED, origin))).toEqual({ symbol: "USDC", icon: undefined, badge: true })
		},
	)

	test("an outgoing mint is titled by its kind and a dApp's call by its function: neither has a mark", async () => {
		const CLASS = field(0xc1a55n)
		const usdc = {
			id: 1,
			chainId: CHAIN_IDS.TESTNET,
			contract: TEST_TOKENS.USDC,
			classId: CLASS,
			symbol: "USDC",
			decimals: 6,
			hasDecimals: true,
		}
		const mint = {
			hash: field(0x3a3an),
			status: TxStatus.Proposed,
			origin: { type: OriginType.UI },
			calls: [{ contract: TEST_TOKENS.USDC, method: "mint_to_public", args: [field(0xa1n), field(10n ** 6n)], classId: CLASS }],
		}
		const layout = await layoutOf(mint, [usdc])
		expect([layout.props("title"), layout.props("amount"), layout.props("titleMark")]).toEqual(["Mint (public)", "1", null])
		const call = {
			hash: field(0x4c4cn),
			status: TxStatus.Proposed,
			origin: { type: OriginType.DAPP, name: "example.dapp.io" },
			calls: [{ contract: field(0xd1n), method: "swap_exact_tokens", args: [field(1n)] }],
		}
		const dapp = await layoutOf(call)
		expect([dapp.props("title"), dapp.props("titleMark")]).toEqual(["Swap Exact Tokens", null])
	})
})
