import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises, mount } from "@vue/test-utils"
import { reactive } from "vue"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import type { ConfigProp } from "@/wallet/config"
import type { IncomingNoteRecord, IncomingPublicEventRecord, IncomingTransferRecord } from "@/wallet/services/incoming-transfer/spec"
import ReceivedDetail from "./[id].vue"

const mocks = vi.hoisted(() => ({
	getTokens: vi.fn(),
	getNetwork: vi.fn(),
	copy: vi.fn(),
	routeId: "r1",
	incoming: undefined as unknown,
	config: undefined as unknown,
}))
const appStore = reactive({ defaultExplorer: "aztecscan" as string | null })

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

vi.mock("vue-router", () => ({ useRoute: () => ({ params: { id: mocks.routeId } }) }))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => appStore }))
vi.mock("./received-copy", () => ({ copyReceivedValue: mocks.copy }))
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
		return mocks.incoming
	}),
}))
vi.mock("@/wallet/services/network/client", () => ({
	NetworkServiceClient: vi.fn(function () {
		return { getNetwork: mocks.getNetwork, disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return { getTokens: mocks.getTokens, disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return mocks.config
	}),
}))

type Fee = { feeJuice: string } | null

function makeIncoming(record: IncomingTransferRecord) {
	return {
		getIncomingTransferById: vi.fn(async (): Promise<IncomingTransferRecord | undefined> => record),
		getReceiptFee: vi.fn(async (): Promise<Fee> => ({ feeJuice: "2500000000000000" })),
		getCachedReceiptFee: vi.fn(async (): Promise<Fee> => null),
		onIncomingTransferUpdated: new EventHandler<IncomingTransferRecord>(),
		onIncomingTransferDeleted: new EventHandler<IncomingTransferRecord>(),
		disconnect: vi.fn(),
	}
}

/** `privacyMode` answers each read in turn; the port opens on the first request, as the real client's does. */
function makeConfig(modeReads: Array<() => Promise<unknown>>) {
	const config = {
		getValue: vi.fn(async (key: string): Promise<unknown> => {
			if (!opened) {
				opened = true
				config.onConnected.invoke()
			}
			if (key === "defaultExplorer") return "aztecscan"
			const next = modeReads.shift()
			return next ? next() : false
		}),
		onUpdate: new EventHandler<ConfigProp>(),
		onConnected: new EventHandler<void>(),
		onDisconnected: new EventHandler<void>(),
		disconnect: vi.fn(),
	}
	let opened = false
	return config
}

beforeEach(() => {
	mocks.routeId = "r1"
	mocks.getNetwork.mockResolvedValue({ id: "n1", chainId: 1 })
	mocks.incoming = makeIncoming(RECEIPT as unknown as IncomingTransferRecord)
	mocks.config = makeConfig([])
})

afterEach(() => {
	vi.clearAllMocks()
	appStore.defaultExplorer = "aztecscan"
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

const PUBLIC_RECEIPT = {
	kind: "public-event",
	id: `pub:p1|n1|0x${"1d".repeat(32)}|0`,
	from: `0x${"0e".repeat(32)}`,
	blockHash: `0x${"3f".repeat(32)}`,
	profileId: "p1",
	networkId: "n1",
	accountAddress: ACCOUNT,
	contract: TOKEN,
	tokenId: 7,
	amountRaw: (10n ** 18n).toString(),
	txHash: `0x${"1d".repeat(32)}`,
	l2BlockNumber: 100,
	txIndexInBlock: 0,
	indexInTx: 0,
	hidden: false,
	discoveredAt: 1_000,
	blockTimestamp: 1_700_000_000,
} satisfies IncomingPublicEventRecord

const remined = (block: number): IncomingPublicEventRecord => ({
	...PUBLIC_RECEIPT,
	l2BlockNumber: block,
	blockHash: `0x${block.toString(16).padStart(64, "0")}`,
})

describe("the received page's network fee and updates", () => {
	const pending = () => new Promise<unknown>(() => {})
	const incoming = () => mocks.incoming as ReturnType<typeof makeIncoming>
	const config = () => mocks.config as ReturnType<typeof makeConfig>
	const testid = (w: Awaited<ReturnType<typeof mountPage>>, id: string) => w.find(`[data-testid="${id}"]`)

	beforeEach(() => {
		mocks.routeId = PUBLIC_RECEIPT.id
	})

	async function mountPublic(modeReads: Array<() => Promise<unknown>>) {
		mocks.incoming = makeIncoming(PUBLIC_RECEIPT)
		mocks.config = makeConfig(modeReads)
		return mountPage(Promise.resolve([token({ decimals: 18, hasDecimals: true })]))
	}

	test("with privacy mode off the fee is looked up on open", async () => {
		const w = await mountPublic([async () => false])
		expect(incoming().getReceiptFee).toHaveBeenCalledExactlyOnceWith(PUBLIC_RECEIPT.id)
		expect(incoming().getCachedReceiptFee).not.toHaveBeenCalled()
		expect(testid(w, "received-fee-value").text()).toBe("0.0025 FJ")
	})

	test.each<[string, () => Promise<unknown>, boolean]>([
		["on", async () => true, true],
		["still being read", pending, false],
		["unreadable", async () => Promise.reject(new Error("port closed")), true],
	])("with the mode %s nothing is looked up, an Updated meanwhile included", async (_name, read, settles) => {
		const w = await mountPublic([read])
		incoming().onIncomingTransferUpdated.invoke(remined(101))
		await flushPromises()
		expect(incoming().getReceiptFee).not.toHaveBeenCalled()
		expect(incoming().getCachedReceiptFee).toHaveBeenCalledTimes(settles ? 2 : 0)
		expect(testid(w, settles ? "received-fee-show" : "received-fee-loading").exists()).toBe(true)
	})

	test("an Updated after another client turned the mode on, or across a held or failed reconnect read, looks nothing up", async () => {
		let releaseHeld!: (value: unknown) => void
		const w = await mountPublic([
			async () => false,
			() => new Promise((r) => (releaseHeld = r)),
			async () => Promise.reject(new Error("port closed")),
			async () => false,
		])
		expect(incoming().getReceiptFee).toHaveBeenCalledTimes(1)

		config().onUpdate.invoke({ key: "privacyMode", value: true })
		incoming().onIncomingTransferUpdated.invoke(remined(101))
		await flushPromises()
		expect(testid(w, "received-fee-show").exists()).toBe(true)

		config().onUpdate.invoke({ key: "privacyMode", value: false })
		config().onDisconnected.invoke()
		config().onConnected.invoke()
		incoming().onIncomingTransferUpdated.invoke(remined(102))
		await flushPromises()
		releaseHeld(false)
		await flushPromises()

		config().onDisconnected.invoke()
		config().onConnected.invoke()
		await flushPromises()
		incoming().onIncomingTransferUpdated.invoke(remined(103))
		await flushPromises()
		expect(incoming().getReceiptFee).toHaveBeenCalledTimes(1)

		config().onDisconnected.invoke()
		config().onConnected.invoke()
		await flushPromises()
		incoming().onIncomingTransferUpdated.invoke(remined(104))
		await flushPromises()
		expect(incoming().getReceiptFee).toHaveBeenCalledTimes(2)
	})

	test("leaving while the mount still awaits the network looks nothing up afterwards", async () => {
		let failNetworkRead!: (error: Error) => void
		mocks.getNetwork.mockReturnValueOnce(new Promise((_, reject) => (failNetworkRead = reject)))
		const w = await mountPublic([async () => false])
		w.unmount()
		failNetworkRead(new Error("port closed"))
		await flushPromises()
		expect(incoming().getReceiptFee).not.toHaveBeenCalled()
		expect(incoming().getCachedReceiptFee).not.toHaveBeenCalled()
	})

	test("a press of Show fee looks the fee up once and shows it", async () => {
		const w = await mountPublic([async () => true])
		await testid(w, "received-fee-show").trigger("click")
		await flushPromises()
		expect(incoming().getReceiptFee).toHaveBeenCalledExactlyOnceWith(PUBLIC_RECEIPT.id)
		expect(testid(w, "received-fee-value").text()).toBe("0.0025 FJ")
	})

	test("an Updated moves the Block row, wins over the first read, and loses to a later Deleted", async () => {
		mocks.incoming = makeIncoming(PUBLIC_RECEIPT)
		mocks.config = makeConfig([async () => false])
		let releaseRead!: (record: IncomingTransferRecord) => void
		incoming().getIncomingTransferById.mockReturnValueOnce(new Promise((r) => (releaseRead = r)))
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
		mocks.getTokens.mockReturnValue(Promise.resolve([]))
		incoming().onIncomingTransferUpdated.invoke(remined(101))
		releaseRead(PUBLIC_RECEIPT)
		await flushPromises()
		expect(w.text()).toContain("#101")

		incoming().onIncomingTransferUpdated.invoke(remined(102))
		await flushPromises()
		expect(w.text()).toContain("#102")

		incoming().onIncomingTransferDeleted.invoke(remined(102))
		incoming().onIncomingTransferUpdated.invoke(remined(103))
		await flushPromises()
		expect(w.text()).toContain("RECEIPT NOT FOUND")
	})
})

describe("the received page's explorer links", () => {
	const BASE = "https://testnet.aztecscan.xyz"
	const SENDER = "0x1e763f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3fa3b2"
	const BLOCK_HASH = `0x${"2c".repeat(32)}`
	const common = {
		profileId: "p1",
		networkId: "n1",
		accountAddress: ACCOUNT,
		contract: TOKEN,
		tokenId: 7,
		amountRaw: (10n ** 18n).toString(),
		txHash: `0x${"2b".repeat(32)}`,
		l2BlockNumber: 48213,
		txIndexInBlock: 0,
		indexInTx: 0,
		hidden: false,
		discoveredAt: 1_000,
	}
	const note = {
		...common,
		kind: "note",
		id: "r1",
		noteHash: `0x${"ab".repeat(32)}`,
		owner: ACCOUNT,
	} satisfies IncomingNoteRecord
	/** As the public scan stores it: the sender and the block hash come from the node's log. */
	const publicReceipt = {
		...common,
		kind: "public-event",
		id: "r1",
		from: SENDER,
		blockHash: BLOCK_HASH,
	} satisfies IncomingPublicEventRecord
	const at = (w: Awaited<ReturnType<typeof mountPage>>, id: string) => w.find(`[data-testid="${id}"]`)

	async function mountReceipt(receipt: IncomingTransferRecord, chainId: number = CHAIN_IDS.TESTNET) {
		mocks.incoming = makeIncoming(receipt)
		mocks.getNetwork.mockResolvedValue({ id: "n1", chainId })
		return mountPage(Promise.resolve([]))
	}

	test("a note receipt's block number and its To card open their pages; its redacted sender has no link", async () => {
		const w = await mountReceipt(note)
		expect(at(w, "received-block-link").attributes("href")).toBe(`${BASE}/blocks/48213`)
		expect(at(w, "received-block-link").text()).toBe("#48213")
		expect(at(w, "received-to-explorer-link").attributes("href")).toBe(`${BASE}/address/${ACCOUNT}`)
		expect(at(w, "received-from-explorer-link").exists()).toBe(false)
	})

	test("a public receipt links its block hash and its sender; the block number stays text", async () => {
		const w = await mountReceipt(publicReceipt)
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
		appStore.defaultExplorer = explorer
		const w = await mountReceipt(publicReceipt, chainId)
		expect(w.find('[data-testid$="-link"]').exists()).toBe(false)
		expect(at(w, "tx-hash-copy").exists()).toBe(true)
		await at(w, "tx-block-hash").trigger("click")
		expect(mocks.copy).toHaveBeenCalledExactlyOnceWith(BLOCK_HASH, "Block hash", expect.any(Function))
	})

	test("choosing explorer None while the page is open removes every link", async () => {
		const w = await mountReceipt(publicReceipt)
		expect(w.findAll('[data-testid$="-link"]')).toHaveLength(4)
		appStore.defaultExplorer = null
		await flushPromises()
		expect(w.find('[data-testid$="-link"]').exists()).toBe(false)
	})
})
