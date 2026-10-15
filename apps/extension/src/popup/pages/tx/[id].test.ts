import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { OriginType, TransferType, TxStatus } from "@/wallet/services/transaction/spec"
import TxDetail from "./[id].vue"

const mocks = vi.hoisted(() => ({
	getTokens: vi.fn(),
	copy: vi.fn(),
	store: {
		transactions: [] as unknown[],
		profile: { id: "p1" },
		network: { chainId: 1 },
		defaultExplorer: "aztecscan" as string | null,
	},
}))

vi.mock("vue-router", () => ({
	useRoute: () => ({ params: { id: "0xh1" } }),
	useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => mocks.store }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/utils/clipboard", () => ({ copyWithToast: mocks.copy }))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return { getTokens: mocks.getTokens, disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return { getProps: vi.fn(async () => []), disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: { add: vi.fn(), remove: vi.fn() },
			onConnected: { add: vi.fn(), remove: vi.fn() },
			getQuotes: vi.fn(async () => ({ quotes: {}, pricedTokens: {} })),
			refreshIfStale: vi.fn().mockResolvedValue({ quotes: {}, pricedTokens: {} }),
		}
	}),
}))

afterEach(() => {
	vi.clearAllMocks()
	mocks.store.network = { chainId: 1 }
	mocks.store.defaultExplorer = "aztecscan"
})

const field = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`
const TOKEN = `0x${"0a".repeat(32)}`
const ACCOUNT = `0x${"0c".repeat(32)}`
const CLASS = field(0xc1a55n)
const listed = { id: 1, chainId: 1, contract: TOKEN, classId: CLASS, name: "Test", symbol: "TST", decimals: 18, hasDecimals: true }

const settled = (origin: { type: OriginType; name?: string }, calls: unknown[]) => ({
	hash: "0xh1",
	chainId: 1,
	account: ACCOUNT,
	status: TxStatus.Proposed,
	updatedAt: 1_000,
	origin,
	calls,
})
/** A sent transfer's record; a restored backup can carry any `symbol`. */
const transferRecord = (symbol: unknown = "TST") =>
	settled({ type: OriginType.UI }, [
		{
			contract: TOKEN,
			method: "transfer_private_to_private",
			args: [ACCOUNT, ACCOUNT, (10n ** 18n).toString(), "0"],
			transfers: [
				{
					token: { name: "Test", symbol, decimals: 18 },
					type: TransferType.Private,
					from: ACCOUNT,
					to: ACCOUNT,
					amount: (10n ** 18n).toString(),
				},
			],
		},
	])
const sentTransfer = transferRecord()
const dappMint = settled({ type: OriginType.DAPP, name: "example.dapp.io" }, [
	{ contract: TOKEN, method: "mint_to_public", args: [ACCOUNT, field(10n ** 18n)], classId: CLASS },
])

async function mountPage(tx: unknown, tokens: Promise<unknown[]>, stubs: Record<string, unknown> = {}) {
	mocks.store.transactions = [tx]
	mocks.getTokens.mockReturnValue(tokens)
	const w = mount(TxDetail, {
		global: {
			stubs: {
				SubPageHeader: true,
				TxFeeRow: true,
				TxDebugPanel: true,
				Banner: true,
				SectionLabel: true,
				AddressDisplay: true,
				Icon: true,
				Flex: { inheritAttrs: false, template: "<div v-bind='$attrs'><slot /></div>" },
				...stubs,
			},
		},
	})
	await flushPromises()
	return w
}

const amountBlock = (w: Awaited<ReturnType<typeof mountPage>>) => w.find("[class*='amount_value']")

describe("the transaction page's amount", () => {
	test("a sent transfer of one 18-decimal token reads 1 and its symbol while the token list loads", async () => {
		const w = await mountPage(sentTransfer, new Promise(() => {}))
		expect(amountBlock(w).text()).toMatch(/^1\s+TST$/)
	})

	test("a dApp mint of a listed 18-decimal token reads 1 TST, captioned Mint amount", async () => {
		const w = await mountPage(dappMint, Promise.resolve([listed]))
		expect(amountBlock(w).text()).toMatch(/^1\s+TST$/)
		expect(w.find("[class*='amount_caption']").text()).toBe("Mint amount")
	})

	test("a restored transfer whose symbol is not text still shows the missing-token banner", async () => {
		const banner = { template: "<div data-testid='missing-banner'><slot name='title' /></div>" }
		const w = await mountPage(transferRecord(42), Promise.resolve([]), { Banner: banner })
		expect(w.get("[data-testid='missing-banner']").text()).toBe("is missing")
	})

	test("a dApp mint of an unlisted token renders no amount block", async () => {
		const w = await mountPage(dappMint, Promise.resolve([]))
		expect(amountBlock(w).exists()).toBe(false)
		expect(w.text()).not.toContain("Mint amount")
	})
})

describe("the transaction page's explorer links", () => {
	const BLOCK_HASH = `0x${"18".repeat(32)}`
	const RECIPIENT = `0x${"09".repeat(32)}`
	const BASE = "https://testnet.aztecscan.xyz"
	/** A public transfer as the wallet stores it once its block is known. */
	const mined = {
		...settled({ type: OriginType.UI }, [
			{
				contract: TOKEN,
				method: "transfer_in_public",
				args: [ACCOUNT, RECIPIENT, field(10n ** 18n), field(0n)],
				transfers: [
					{
						token: { name: "Test", symbol: "TST", decimals: 18 },
						type: TransferType.Public,
						from: ACCOUNT,
						to: RECIPIENT,
						amount: (10n ** 18n).toString(),
					},
				],
			},
		]),
		block: { number: 48190, hash: BLOCK_HASH },
	}
	const at = (w: Awaited<ReturnType<typeof mountPage>>, id: string) => w.find(`[data-testid="${id}"]`)

	async function mountMined(explorer: string | null) {
		mocks.store.network = { chainId: CHAIN_IDS.TESTNET }
		mocks.store.defaultExplorer = explorer
		return mountPage(mined, Promise.resolve([listed]))
	}

	test("the block hash and each address card open their explorer pages", async () => {
		const w = await mountMined("aztecscan")
		expect(at(w, "tx-block-link").attributes("href")).toBe(`${BASE}/blocks/${BLOCK_HASH}`)
		expect(at(w, "tx-block-link").text()).toBe("0x1818..1818")
		expect(at(w, "tx-block-hash").exists()).toBe(false)
		for (const [id, address, label] of [
			["tx-from-explorer-link", ACCOUNT, "From"],
			["tx-to-explorer-link", RECIPIENT, "To"],
		]) {
			const link = at(w, id)
			expect(link.attributes("href")).toBe(`${BASE}/address/${address}`)
			expect(link.attributes("aria-label")).toBe("View on Aztecscan")
			expect(w.find(`#${link.attributes("aria-describedby")}`).text()).toBe(label)
		}
	})

	test("under explorer None the block hash copies and the cards show no link", async () => {
		const w = await mountMined(null)
		expect(at(w, "tx-block-link").exists()).toBe(false)
		expect(at(w, "tx-from-explorer-link").exists()).toBe(false)
		expect(at(w, "tx-to-explorer-link").exists()).toBe(false)
		await at(w, "tx-block-hash").trigger("click")
		expect(mocks.copy).toHaveBeenCalledExactlyOnceWith(BLOCK_HASH, expect.any(Function), "Successfully copied")
	})

	test("a click on a card's link opens the explorer without copying; a click on the card copies", async () => {
		const w = await mountMined("aztecscan")
		await at(w, "tx-to-explorer-link").trigger("click")
		expect(mocks.copy).not.toHaveBeenCalled()
		await at(w, "tx-to-address").element.parentElement?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		expect(mocks.copy).toHaveBeenCalledExactlyOnceWith(RECIPIENT, expect.any(Function), "Successfully copied")
	})
})
