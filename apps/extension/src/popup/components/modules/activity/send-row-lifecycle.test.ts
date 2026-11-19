/**
 * One wallet send drawn queued, proving, failed and settled, each card over the real layout and built
 * the way the activity views build it, from the one price reading the view holds: the row keeps its
 * icon box, its token's mark and title, words and amount column, and only the status corner changes.
 */
import { RowAction } from "@nulo/design"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { effectScope } from "vue"
import TransactionAwaitingCard from "@/components/composite/activity/TransactionAwaitingCard.vue"
import TransactionTerminalCard from "@/components/composite/activity/TransactionTerminalCard.vue"
import { CHAIN_IDS } from "@/utils/chain-ids"
import {
	buildJournalTerminalCardProps,
	journalCardAmount,
	journalCardAmountSymbol,
	journalCardDirection,
	journalCardFiat,
	journalCardIcon,
	journalCardTitle,
	journalCardTitleMark,
	journalCardTitleNamesToken,
} from "@/utils/journal-state"
import { usePrices } from "@/composables/usePrices"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { OriginType, TransferType, TxStatus } from "@/wallet/services/transaction/spec"
import TransactionCard from "./TransactionCard.vue"

vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({ network: { chainId: CHAIN_IDS.TESTNET }, defaultExplorer: "aztecscan" }),
}))
const LIST = vi.hoisted(() => ({ tokenIcons: {} as Record<string, string>, quotes: {} as Record<string, unknown>, pricedTokens: {} }))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		const snapshot = async () => ({
			quotes: LIST.quotes,
			pricedTokens: LIST.pricedTokens,
			flaggedTokens: [],
			tokenIcons: LIST.tokenIcons,
		})
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: { add: vi.fn(), remove: vi.fn() },
			onConnected: { add: vi.fn(), remove: vi.fn() },
			getQuotes: vi.fn(snapshot),
			refreshIfStale: vi.fn(snapshot),
		}
	}),
}))

const STUBS = {
	Flex: { template: '<div :class="$attrs.class" v-bind="$attrs"><slot /></div>', inheritAttrs: false },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
	Spinner: { template: '<span data-testid="stub-spinner" />' },
	Skeleton: { template: "<i />" },
}

const ACCOUNT = `0x${"2b".repeat(32)}`
const OUTSIDE = `0x${"1e".repeat(32)}`
const CONTRACT = `0x${"0a".repeat(32)}`
const HASH = `0x${"5e".repeat(32)}`
type Token = { symbol: string; decimals: number; hasDecimals: boolean; chainId: number; contract: string }
const TOKEN: Token = { symbol: "cUSDC", decimals: 6, hasDecimals: true, chainId: CHAIN_IDS.TESTNET, contract: CONTRACT }
const PRICED: Token = { ...TOKEN, symbol: "USDC", contract: TEST_TOKENS.USDC }
const ctxOf = (token: Token) => ({ tokenById: () => token, tokens: [] })
const CTX = ctxOf(TOKEN)
const ICON = "data:image/svg+xml;base64,PHN2Zy8+"
LIST.tokenIcons = { [`${CHAIN_IDS.TESTNET}:${CONTRACT}`]: ICON, [`${CHAIN_IDS.TESTNET}:${TEST_TOKENS.USDC}`]: ICON }
LIST.pricedTokens = TEST_PRICED_TOKENS

/** The view's one price reading, answered before the rows draw, as it is long before a send lands. */
async function viewReading() {
	const prices = effectScope().run(() => usePrices(new PriceServiceClient()))
	if (!prices) throw new Error("no reading")
	await flushPromises()
	return prices
}
type Reading = Awaited<ReturnType<typeof viewReading>>

/** The send's request, as the journal record and the settled record each copy it. */
const send = (recipient: string) => ({ transferType: TransferType.PrivateToPublic, from: ACCOUNT, to: recipient, amount: "1500000" })

function record(req: ReturnType<typeof send>, failed: boolean): OperationRecord {
	return {
		id: "a1a1a1a1a1a1a1a1",
		kind: "transfer",
		tokenId: 1,
		amountRaw: req.amount,
		transferType: req.transferType,
		accountAddress: req.from,
		recipientAddress: req.to,
		progress: failed ? { stage: "failed" } : { stage: "queued" },
		error: failed ? { kind: "simulation", message: "reverted", normalizedRaw: null } : null,
		terminalAt: failed ? 2 : null,
		createdAt: 1,
		updatedAt: 2,
	} as OperationRecord
}

function settledTx(req: ReturnType<typeof send>, token = TOKEN) {
	const { contract, ...listed } = token
	return {
		hash: HASH,
		status: TxStatus.Proposed,
		origin: { type: OriginType.UI },
		calls: [
			{
				contract,
				method: "transfer_private_to_public",
				args: [req.from, req.to, req.amount],
				transfers: [
					{ token: { name: "Circle USD", ...listed }, type: req.transferType, from: req.from, to: req.to, amount: req.amount },
				],
			},
		],
	}
}

const mountInFlight = (op: OperationRecord, prices: Reading, stage: "queued" | "proving" = "queued", ctx = CTX) =>
	mount(TransactionAwaitingCard, {
		props: {
			title: journalCardTitle(op, ctx),
			subtitle: stage === "queued" ? "Waiting for your earlier send" : "Proving in browser…",
			icon: journalCardIcon(op),
			amount: journalCardAmount(op, ctx.tokenById) ?? undefined,
			amountSymbol: journalCardAmountSymbol(op, ctx.tokenById) ?? undefined,
			amountFiat: journalCardFiat(op, ctx.tokenById, prices.tokenFiatLabel) ?? undefined,
			titleNamesToken: journalCardTitleNamesToken(op),
			titleMark: journalCardTitleMark(op, ctx, prices),
			direction: journalCardDirection(op),
			stage,
			hasApprovalWindow: false,
		},
		global: { stubs: STUBS },
	})

const mountFailed = (op: OperationRecord, prices: Reading) =>
	mount(TransactionTerminalCard, {
		props: { ...buildJournalTerminalCardProps(op, CTX), titleMark: journalCardTitleMark(op, CTX, prices) } as never,
		global: { stubs: STUBS },
	})

/** Not flushed: the row's first render is what a person sees the moment the send lands. */
const mountSettled = (req: ReturnType<typeof send>, prices: Reading, token = TOKEN) =>
	mount(TransactionCard, {
		props: {
			tx: settledTx(req, token),
			fiatLabel: prices.tokenFiatLabel,
			iconFor: prices.iconFor,
			isFlagged: prices.isFlagged,
		} as never,
		global: { stubs: STUBS, components: { RowAction } },
	})

/** What a person sees of the row, but for what the status corner holds. */
function rowShape(w: VueWrapper) {
	const box = w.get("[data-testid='activity-icon']")
	const glyphs = (testid: string) =>
		box.findAll(`[data-testid='${testid}'] [data-testid='stub-icon']`).map((i) => i.attributes("data-name"))
	const corners = [...box.element.children].filter((el) => /_badge_/.test(el.className))
	return {
		pair: glyphs("activity-icon-pair"),
		way: [box.get("[data-testid='activity-way-badge']").attributes("data-way"), ...glyphs("activity-way-badge")],
		statusCorners: corners.filter((el) => !/_badge_way_/.test(el.className)).length,
		title: w.get("[data-testid='activity-title']").text(),
		titleRow: [...w.get("[data-testid='activity-title-row']").element.children].map(
			(el) => `${el.getAttribute("data-testid")}${el.getAttribute("data-kind") ? `:${el.getAttribute("data-kind")}` : ""}`,
		),
		words: w.get("[data-testid='activity-direction-chip']").element.textContent,
		amountColumn: [...w.get("[data-testid='activity-amount-col']").element.children].map((el) => el.textContent?.trim()),
	}
}

describe("a wallet send's row from queued to settled", () => {
	test.each([
		["to another account", OUTSIDE, "out", "send", "Private → Public"],
		["to its own account", ACCOUNT, "self", "swap", "Private → Public, within this account"],
	])("%s: queued, failed and settled draw one row; only the status corner changes", async (_name, recipient, way, glyph, words) => {
		LIST.quotes = {}
		const prices = await viewReading()
		const req = send(recipient)
		const settled = rowShape(mountSettled(req, prices))
		expect(settled).toEqual({
			pair: ["private", "forward", "public"],
			way: [way, glyph],
			statusCorners: 1,
			title: "cUSDC",
			titleRow: ["token-mark:logo", "activity-title"],
			words,
			amountColumn: ["1.5"],
		})
		expect(rowShape(mountInFlight(record(req, false), prices))).toEqual(settled)
		expect(rowShape(mountFailed(record(req, true), prices))).toEqual(settled)
	})

	test("a priced token's send shows its dollar line proving and settled alike, from the settled row's first render", async () => {
		LIST.quotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const prices = await viewReading()
		const req = { ...send(OUTSIDE), amount: "12500000" }
		const settled = rowShape(mountSettled(req, prices, PRICED))
		expect(settled.amountColumn).toEqual(["12.5", "≈ $12.50"])
		expect(rowShape(mountInFlight(record(req, false), prices, "proving", ctxOf(PRICED)))).toEqual(settled)
	})
})
