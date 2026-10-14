import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import ReceivedDetail from "./[id].vue"

const mocks = vi.hoisted(() => ({
	getTokens: vi.fn(),
	receipt: undefined as unknown,
	chainId: 1,
	explorer: "aztecscan" as string | null,
}))

const TOKEN = `0x${"0a".repeat(32)}`
const ACCOUNT = `0x${"0c".repeat(32)}`
const RECEIPT = {
	id: "r1",
	kind: "note",
	profileId: "p1",
	networkId: "n1",
	accountAddress: ACCOUNT,
	tokenId: 7,
	contract: TOKEN,
	amountRaw: (10n ** 18n).toString(),
	txHash: `0x${"2b".repeat(32)}`,
	discoveredAt: 1_000,
}

vi.mock("vue-router", () => ({ useRoute: () => ({ params: { id: "r1" } }) }))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({}) }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/composables/usePrices", () => ({
	usePrices: () => ({ tokenFiatLabel: () => undefined, feeJuiceQuote: { value: undefined }, dispose: vi.fn() }),
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return { disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/incoming-transfer/client", () => ({
	IncomingTransferServiceClient: vi.fn(function () {
		return {
			getIncomingTransferById: vi.fn(async () => mocks.receipt ?? RECEIPT),
			getReceiptFee: vi.fn(async () => null),
			onIncomingTransferDeleted: { add: vi.fn(), remove: vi.fn() },
			disconnect: vi.fn(),
		}
	}),
}))
vi.mock("@/wallet/services/network/client", () => ({
	NetworkServiceClient: vi.fn(function () {
		return { getNetwork: vi.fn(async () => ({ id: "n1", chainId: mocks.chainId })), disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return { getTokens: mocks.getTokens, disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return { getValue: vi.fn(async () => mocks.explorer), disconnect: vi.fn() }
	}),
}))

afterEach(() => {
	vi.clearAllMocks()
	mocks.receipt = undefined
	mocks.chainId = 1
	mocks.explorer = "aztecscan"
})

async function mountPage(tokens: Promise<unknown[]>) {
	mocks.getTokens.mockReturnValue(tokens)
	const w = mount(ReceivedDetail, {
		global: {
			stubs: {
				SubPageHeader: true,
				SectionLabel: true,
				AddressDisplay: true,
				Icon: true,
				Text: true,
				Flex: { inheritAttrs: false, template: "<div v-bind='$attrs'><slot /></div>" },
			},
		},
	})
	await flushPromises()
	return w
}

const token = (over: Record<string, unknown>) => ({ id: 7, chainId: 1, contract: TOKEN, name: "Test", symbol: "TST", ...over })
const amountBlock = (w: Awaited<ReturnType<typeof mountPage>>) => w.find("[class*='amount_value']")

describe("the received page's amount", () => {
	test("shows no amount while the token list is pending", async () => {
		const w = await mountPage(new Promise(() => {}))
		expect(amountBlock(w).exists()).toBe(false)
	})

	test("shows no amount for a token without a decimals getter", async () => {
		const w = await mountPage(Promise.resolve([token({ decimals: 0, hasDecimals: false })]))
		expect(amountBlock(w).exists()).toBe(false)
	})

	test("(pin) reads +1 TST once an 18-decimal token resolves", async () => {
		const w = await mountPage(Promise.resolve([token({ decimals: 18, hasDecimals: true })]))
		expect(amountBlock(w).text()).toMatch(/^\+1\s+TST$/)
	})
})

describe("the received page's explorer links", () => {
	const BASE = "https://testnet.aztecscan.xyz"
	const SENDER = `0x${"1e".repeat(32)}`
	const BLOCK_HASH = `0x${"2c".repeat(32)}`
	const note = { ...RECEIPT, l2BlockNumber: 48213 }
	/** A public receipt as the scan stores it: the sender and the block hash come from the node's log. */
	const publicReceipt = {
		...RECEIPT,
		kind: "public-event",
		l2BlockNumber: 48213,
		txIndexInBlock: 0,
		indexInTx: 0,
		blockHash: BLOCK_HASH,
		from: SENDER,
	}
	const at = (w: Awaited<ReturnType<typeof mountPage>>, id: string) => w.find(`[data-testid="${id}"]`)

	async function mountReceipt(receipt: unknown, explorer: string | null) {
		mocks.receipt = receipt
		mocks.chainId = CHAIN_IDS.TESTNET
		mocks.explorer = explorer
		return mountPage(Promise.resolve([]))
	}

	test("a note receipt's block number and its To card open their pages; its redacted sender has no link", async () => {
		const w = await mountReceipt(note, "aztecscan")
		expect(at(w, "received-block-link").attributes("href")).toBe(`${BASE}/blocks/48213`)
		expect(at(w, "received-block-link").text()).toBe("#48213")
		expect(at(w, "received-to-explorer-link").attributes("href")).toBe(`${BASE}/address/${ACCOUNT}`)
		expect(at(w, "received-from-explorer-link").exists()).toBe(false)
	})

	test("a public receipt links its block hash and its sender; the block number stays text", async () => {
		const w = await mountReceipt(publicReceipt, "aztecscan")
		expect(at(w, "received-block-link").attributes("href")).toBe(`${BASE}/blocks/${BLOCK_HASH}`)
		expect(at(w, "received-block-link").text()).toBe("0x2c2c..2c2c")
		expect(at(w, "tx-block-hash").exists()).toBe(false)
		expect(w.text()).toContain("#48213")
		const from = at(w, "received-from-explorer-link")
		expect(from.attributes("href")).toBe(`${BASE}/address/${SENDER}`)
		expect(w.find(`#${from.attributes("aria-describedby")}`).text()).toBe("From")
	})

	test.each([
		["explorer None", CHAIN_IDS.TESTNET, null],
		["the sandbox", CHAIN_IDS.SANDBOX, "aztecscan"],
	])("under %s no link shows and the block hash copies", async (_, chainId, explorer) => {
		mocks.receipt = publicReceipt
		mocks.chainId = chainId
		mocks.explorer = explorer
		const w = await mountPage(Promise.resolve([]))
		expect(w.find('[data-testid$="-link"]').exists()).toBe(false)
		expect(at(w, "tx-block-hash").exists()).toBe(true)
		expect(at(w, "tx-hash-copy").exists()).toBe(true)
	})
})
