/**
 * One wallet send drawn queued, failed and settled, each card over the real layout and built the way
 * the activity views build it: the row keeps its icon box, its token's mark and title, words and amount
 * column, and only the status corner changes. The token is unpriced, as the in-flight cards are: fiat
 * comes only at settlement.
 */
import { RowAction } from "@nulo/design"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import TransactionAwaitingCard from "@/components/composite/activity/TransactionAwaitingCard.vue"
import TransactionTerminalCard from "@/components/composite/activity/TransactionTerminalCard.vue"
import { CHAIN_IDS } from "@/utils/chain-ids"
import {
	buildJournalTerminalCardProps,
	journalCardAmount,
	journalCardAmountSymbol,
	journalCardDirection,
	journalCardIcon,
	journalCardTitle,
	journalCardTitleMark,
	journalCardTitleNamesToken,
} from "@/utils/journal-state"
import { tokenIconFor } from "@/utils/token-icon"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { OriginType, TransferType, TxStatus } from "@/wallet/services/transaction/spec"
import TransactionCard from "./TransactionCard.vue"

vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({ network: { chainId: CHAIN_IDS.TESTNET }, defaultExplorer: "aztecscan" }),
}))
const LIST = vi.hoisted(() => ({ tokenIcons: {} as Record<string, string> }))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		const snapshot = async () => ({ quotes: {}, pricedTokens: {}, flaggedTokens: [], tokenIcons: LIST.tokenIcons })
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
const TOKEN = { symbol: "cUSDC", decimals: 6, hasDecimals: true, chainId: CHAIN_IDS.TESTNET, contract: CONTRACT }
const CTX = { tokenById: () => TOKEN, tokens: [] }
const ICON = "data:image/svg+xml;base64,PHN2Zy8+"
LIST.tokenIcons = { [`${CHAIN_IDS.TESTNET}:${CONTRACT}`]: ICON }
/** The list's reading the in-flight views hold, from the same answer the settled card's feed gives. */
const MARKS = { iconFor: (t?: { chainId?: number; contract?: string }) => tokenIconFor(LIST.tokenIcons, t), isFlagged: () => false }

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

function settledTx(req: ReturnType<typeof send>) {
	return {
		hash: HASH,
		status: TxStatus.Proposed,
		origin: { type: OriginType.UI },
		calls: [
			{
				contract: CONTRACT,
				method: "transfer_private_to_public",
				args: [req.from, req.to, req.amount],
				transfers: [
					{ token: { name: "Circle USD", ...TOKEN }, type: req.transferType, from: req.from, to: req.to, amount: req.amount },
				],
			},
		],
	}
}

const mountQueued = (op: OperationRecord) =>
	mount(TransactionAwaitingCard, {
		props: {
			title: journalCardTitle(op, CTX),
			subtitle: "Waiting for your earlier send",
			icon: journalCardIcon(op),
			amount: journalCardAmount(op, CTX.tokenById) ?? undefined,
			amountSymbol: journalCardAmountSymbol(op, CTX.tokenById) ?? undefined,
			titleNamesToken: journalCardTitleNamesToken(op),
			titleMark: journalCardTitleMark(op, CTX, MARKS),
			direction: journalCardDirection(op),
			stage: "queued",
			hasApprovalWindow: false,
		},
		global: { stubs: STUBS },
	})

const mountFailed = (op: OperationRecord) =>
	mount(TransactionTerminalCard, {
		props: { ...buildJournalTerminalCardProps(op, CTX), titleMark: journalCardTitleMark(op, CTX, MARKS) } as never,
		global: { stubs: STUBS },
	})

const mountSettled = async (req: ReturnType<typeof send>) => {
	const w = mount(TransactionCard, { props: { tx: settledTx(req) } as never, global: { stubs: STUBS, components: { RowAction } } })
	await flushPromises()
	return w
}

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
		const req = send(recipient)
		const settled = rowShape(await mountSettled(req))
		expect(settled).toEqual({
			pair: ["private", "forward", "public"],
			way: [way, glyph],
			statusCorners: 1,
			title: "cUSDC",
			titleRow: ["token-mark:logo", "activity-title"],
			words,
			amountColumn: ["1.5"],
		})
		expect(rowShape(mountQueued(record(req, false)))).toEqual(settled)
		expect(rowShape(mountFailed(record(req, true)))).toEqual(settled)
	})
})
