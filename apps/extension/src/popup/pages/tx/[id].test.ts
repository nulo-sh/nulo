import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { PRIVATE_FPC_ADDRESS } from "@/wallet/services/fpc/private-fpc-address"
import { priceFake } from "../../../../tests/helpers/price-client-fake"
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
vi.mock("@/wallet/services/price/client", async () => (await import("../../../../tests/helpers/price-client-fake")).priceClientModule())

beforeEach(() => priceFake.reset(undefined))

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

async function mountPage(tx: unknown, tokens: Promise<unknown[]>, stubs: Record<string, unknown> = {}, attachTo?: HTMLElement) {
	mocks.store.transactions = [tx]
	mocks.getTokens.mockReturnValue(tokens)
	const w = mount(TxDetail, {
		attachTo,
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

	const banner = { template: "<div data-testid='missing-banner'><slot name='title' /></div>" }
	const bannerTitle = (w: Awaited<ReturnType<typeof mountPage>>) => w.get("[data-testid='missing-banner']").text()

	test("an unlisted token's banner names its symbol", async () => {
		const w = await mountPage(sentTransfer, Promise.resolve([]), { Banner: banner })
		expect(bannerTitle(w)).toBe("TST is missing")
	})

	test("a restored transfer whose symbol is not text reads a noun in the missing-token banner", async () => {
		const w = await mountPage(transferRecord(42), Promise.resolve([]), { Banner: banner })
		expect(bannerTitle(w)).toBe("This token is missing")
	})

	test("a symbol of spaces reads a noun in the banner, and stays raw after the amount", async () => {
		const w = await mountPage(transferRecord("   "), Promise.resolve([]), { Banner: banner })
		expect(bannerTitle(w)).toBe("This token is missing")
		expect(w.get("[class*='amount_symbol']").element.textContent).toBe("   ")
	})

	test("a run of spaces longer than the cap still reads a noun in the banner", async () => {
		const w = await mountPage(transferRecord(" ".repeat(33)), Promise.resolve([]), { Banner: banner })
		expect(bannerTitle(w)).toBe("This token is missing")
	})

	test("a dApp mint of an unlisted token renders no amount block", async () => {
		const w = await mountPage(dappMint, Promise.resolve([]))
		expect(amountBlock(w).exists()).toBe(false)
		expect(w.text()).not.toContain("Mint amount")
	})
})

describe("the transaction page's fee", () => {
	const GAS = {
		feePerL2Gas: "1000000000000",
		feePerDaGas: "2000000000000",
		l2GasLimit: 1_000,
		daGasLimit: 500,
		teardownL2GasLimit: 0,
		teardownDaGasLimit: 0,
	}
	/** The row's header figure: the fee and, when priced, its dollars. */
	const headerOf = (w: Awaited<ReturnType<typeof mountPage>>) => w.get("[class*='fee_row_toggle'] > span")

	test("a settled send reads its paid fee, half up, and its estimate in the breakdown, both at the page's one quote", async () => {
		priceFake.reset(0.06)
		const tx = { ...sentTransfer, fee: "3577823500000000001", estimatedFee: "4000000000000000000", gasDetails: GAS }
		const w = await mountPage(tx, Promise.resolve([listed]), { TxFeeRow: false })
		expect(headerOf(w).text()).toBe("~3.577824 FJ ($0.215)")
		await w.get("[class*='fee_row_toggle']").trigger("click")
		expect(w.get('[data-testid="tx-estimate-usd"]').element.parentElement?.textContent).toBe("~4 FJ ($0.240)")
	})

	test("before the receipt, the estimate alone, in the same grammar", async () => {
		priceFake.reset(0.06)
		const w = await mountPage({ ...sentTransfer, estimatedFee: "4000000000000000000" }, Promise.resolve([listed]), { TxFeeRow: false })
		expect(w.text()).toContain("Estimated fee")
		expect(headerOf(w).text()).toBe("~4 FJ ($0.240)")
	})

	test("an app's own fee contract reads as the app's, whatever it names its fee function; the person's pick reads its method", async () => {
		const transfer = { contract: TOKEN, method: "transfer_in_private", args: [ACCOUNT, ACCOUNT, field(5n), field(0n)], classId: CLASS }
		const dappSend = (feeCall: unknown) => ({
			...settled({ type: OriginType.DAPP, name: "example.dapp.io" }, [feeCall, transfer]),
			feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL,
		})
		const appFpc = {
			contract: `0x${"1d".repeat(32)}`,
			method: "fee_entrypoint_private",
			args: [field(1n), field(2n)],
			classId: field(0xfc1n),
		}
		const embedded = await mountPage(dappSend(appFpc), Promise.resolve([listed]))
		expect(embedded.text()).toContain("Set by example.dapp.io")
		expect(embedded.text()).not.toContain("Private Fee Juice")
		const privateFpc = { contract: PRIVATE_FPC_ADDRESS, method: "pay_fee", args: [], classId: field(0xfc2n) }
		const picked = await mountPage(dappSend(privateFpc), Promise.resolve([listed]))
		expect(picked.text()).toContain("Private Fee Juice")
		expect(picked.text()).not.toContain("Set by")
	})
})

describe("the transaction page's words for a call", () => {
	const header = { props: ["title"], template: "<h1 data-testid='header'>{{ title }}</h1>" }
	const words = (w: Awaited<ReturnType<typeof mountPage>>) => [
		w.get("[data-testid='header']").text(),
		w.get("[data-testid='tx-call-method']").text(),
	]
	const OTHER = `0x${"0b".repeat(32)}`
	const dappTransfer = (contract: string) =>
		settled({ type: OriginType.DAPP, name: "example.dapp.io" }, [
			{ contract, method: "transfer_in_private", args: [ACCOUNT, OTHER, field(5n), field(0n)], classId: CLASS },
		])

	test("a listed mint reads its own name until the token list loads, then the window's label", async () => {
		let resolve: (tokens: unknown[]) => void = () => {}
		const w = await mountPage(dappMint, new Promise((r) => (resolve = r)), { SubPageHeader: header })
		expect(words(w)).toEqual(["Mint To Public", "Mint To Public"])
		resolve([listed])
		await flushPromises()
		expect(words(w)).toEqual(["Mint (public)", "Mint (public)"])
	})

	test("a transfer on a contract the wallet did not list reads as its contract spells it; on a listed token, as the wallet read it", async () => {
		const unread = await mountPage(dappTransfer(OTHER), Promise.resolve([listed]), { SubPageHeader: header })
		expect(words(unread)).toEqual(["Transfer In Private", "Transfer In Private"])
		const read = await mountPage(dappTransfer(TOKEN), Promise.resolve([listed]), { SubPageHeader: header })
		expect(words(read)).toEqual(["Transfer (private)", "Transfer (private)"])
	})

	test("the wallet's own send reads its type's label in the header and the Calls box", async () => {
		expect(words(await mountPage(sentTransfer, Promise.resolve([listed]), { SubPageHeader: header }))).toEqual([
			"Transfer (private)",
			"Transfer (private)",
		])
	})

	test('a dApp\'s `claim` off the Fee Juice contract reads "Claim" in the header and the Calls box', async () => {
		const claim = settled({ type: OriginType.DAPP, name: "example.dapp.io" }, [{ contract: OTHER, method: "claim", args: [ACCOUNT] }])
		expect(words(await mountPage(claim, Promise.resolve([listed]), { SubPageHeader: header }))).toEqual(["Claim", "Claim"])
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

	async function mountMined(explorer: string | null, stubs: Record<string, unknown> = {}, attachTo?: HTMLElement) {
		mocks.store.network = { chainId: CHAIN_IDS.TESTNET }
		mocks.store.defaultExplorer = explorer
		return mountPage(mined, Promise.resolve([listed]), stubs, attachTo)
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

	test("a drag that selects part of the From card's address copies nothing; a click on it copies", async () => {
		const shown = { props: ["address"], template: "<span>{{ address }}</span>" }
		const w = await mountMined("aztecscan", { AddressDisplay: shown }, document.body)
		const address = at(w, "tx-from-address").element
		const text = address.firstChild as Text
		window.getSelection()?.setBaseAndExtent(text, 2, text, 12)
		address.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
		expect(mocks.copy).not.toHaveBeenCalled()
		window.getSelection()?.removeAllRanges()
		address.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
		expect(mocks.copy).toHaveBeenCalledExactlyOnceWith(ACCOUNT, expect.any(Function), "Successfully copied")
		w.unmount()
	})
})
