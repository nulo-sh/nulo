import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../tests/helpers/chrome-storage-mock"
import type { SendCheckOutcome } from "@nulo/wallet-core/jobs"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { CHAIN_IDS } from "@/utils/chain-ids"
import JournalDetail from "./[id].vue"

const mocks = vi.hoisted(() => ({
	getOperation: vi.fn(),
	updated: [] as Array<(op: OperationRecord) => void>,
	tokens: [] as Array<Record<string, unknown>>,
}))

vi.mock("vue-router", () => ({
	useRoute: () => ({ params: { id: "j1" } }),
	useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/composables/usePrices", () => ({ usePrices: () => ({ tokenFiatLabel: () => null, dispose: vi.fn() }) }))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return { disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return { getProps: vi.fn(async () => []), disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return { getTokens: vi.fn(async () => mocks.tokens), disconnect: vi.fn() }
	}),
}))
// The app store opens its own journal client for the in-flight rows; it reads none here.
vi.mock("@/wallet/services/operation-journal/client", () => ({
	OperationJournalServiceClient: vi.fn(function () {
		return {
			connect: vi.fn(async () => {}),
			getOperation: mocks.getOperation,
			getOperations: vi.fn(async () => []),
			onOperationAdded: { add: vi.fn(), remove: vi.fn() },
			onOperationDeleted: { add: vi.fn(), remove: vi.fn() },
			onOperationUpdated: { add: (fn: (op: OperationRecord) => void) => mocks.updated.push(fn), remove: vi.fn() },
			onConnected: { add: vi.fn(), remove: vi.fn() },
			disconnect: vi.fn(),
		}
	}),
}))

// The stores read `chrome.storage.local` through the migration-aware facade on setup.
beforeEach(() => {
	mocks.tokens = [{ id: 7, symbol: "TST", decimals: 0, hasDecimals: true }]
	vi.stubGlobal("chrome", {
		storage: {},
		runtime: { connect: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
	})
	installChromeStorage({}, { persist: false })
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
	mocks.updated.length = 0
})

const ACCOUNT = `0x${"0a".repeat(32)}`

/** A transfer that failed at the send line, shaped as the journal stores it. */
function failedSend(check?: SendCheckOutcome): OperationRecord {
	return {
		id: "j1",
		kind: "transfer",
		origin: "popup",
		profileId: "p1",
		networkId: "n1",
		accountAddress: ACCOUNT,
		tokenId: 7,
		amountRaw: "1",
		progress: {
			stage: "failed",
			from: "submitting",
			txHash: `0x${"2b".repeat(32)}`,
			submittedEndpointUrl: "https://rpc.example",
			check,
		},
		error: { kind: "transfer", message: "fetch failed", normalizedRaw: null },
		terminalAt: 1_000,
		attempts: 0,
		createdAt: 0,
		updatedAt: 1_000,
	}
}

async function mountPage(record: OperationRecord, app: Record<string, unknown> = {}) {
	mocks.getOperation.mockResolvedValue(record)
	const w = mount(JournalDetail, {
		global: {
			plugins: [
				createTestingPinia({
					createSpy: vi.fn,
					initialState: {
						app: { profile: { id: "p1" }, network: { id: "n1", chainId: 1 }, account: { address: ACCOUNT }, ...app },
					},
				}),
			],
			stubs: {
				SubPageHeader: true,
				Flex: { inheritAttrs: false, template: "<div v-bind='$attrs'><slot /></div>" },
			},
		},
	})
	await flushPromises()
	return w
}

const row = (w: Awaited<ReturnType<typeof mountPage>>, id: string) => w.find(`[data-testid="journal-detail-${id}"]`)

describe("the journal page of a failed send its wallet checks", () => {
	test("while the check asks, State reads Checking and no Ended row shows; the answer brings it back", async () => {
		const w = await mountPage(failedSend())
		expect(row(w, "state").text()).toBe("Checking")
		expect(row(w, "ended").exists()).toBe(false)

		const answered = failedSend("sent")
		mocks.getOperation.mockResolvedValue(answered)
		for (const onUpdated of mocks.updated) onUpdated(answered)
		await flushPromises()
		expect(row(w, "state").text()).toBe("Sent")
		expect(row(w, "ended").exists()).toBe(true)
	})

	test("an unconfirmed send reads State Unconfirmed, and its Outcome row, which would repeat it, is hidden", async () => {
		const w = await mountPage(failedSend("unconfirmed"))
		expect(row(w, "state").text()).toBe("Unconfirmed")
		expect(row(w, "context").text()).toBe(
			"Your wallet couldn't confirm this. It may still go through, so check History before sending it again.",
		)
		expect(row(w, "category").exists()).toBe(false)
		expect(row(w, "ended").exists()).toBe(true)
	})

	test("an expired send reads State Failed, with Outcome Won't go through and its context", async () => {
		const w = await mountPage(failedSend("expired"))
		expect(row(w, "state").text()).toBe("Failed")
		expect(row(w, "category").text()).toBe("Won't go through")
		expect(row(w, "context").text()).toBe(
			"This transaction expired before the network included it. No fee was paid, and you can send it again.",
		)
	})
})

describe("the amount of a failed transfer", () => {
	test("shows in the token's decimals when the wallet knows them", async () => {
		mocks.tokens = [{ id: 7, symbol: "TST", decimals: 0, hasDecimals: true }]
		const w = await mountPage(failedSend())
		expect(row(w, "amount").text()).toBe("1 TST")
	})

	test("shows no figure when the wallet does not know them", async () => {
		mocks.tokens = [{ id: 7, symbol: "TST", decimals: 0, hasDecimals: false }]
		const w = await mountPage(failedSend())
		expect(row(w, "amount").exists()).toBe(false)
		expect(row(w, "state").text()).toBe("Checking")
	})
})

describe("the hash of a send that reached the send line", () => {
	const TESTNET = { network: { id: "n1", chainId: CHAIN_IDS.TESTNET } }
	const HASH = `0x${"2b".repeat(32)}`

	test("shows the Tx hash row and View on the explorer, both linking to its page", async () => {
		const w = await mountPage(failedSend("unconfirmed"), { ...TESTNET, defaultExplorer: "aztecscan" })
		const url = `https://testnet.aztecscan.xyz/tx-effects/${HASH}`
		expect(row(w, "explorer-link").attributes("href")).toBe(url)
		expect(row(w, "explorer-link").text()).toBe("View on Aztecscan")
		expect(row(w, "tx-hash-link").attributes("href")).toBe(url)
		expect(row(w, "tx-hash-link").text()).toBe("0x2b2b..2b2b")
	})

	test("under explorer None the row keeps the hash, to copy, and no link shows", async () => {
		const w = await mountPage(failedSend("unconfirmed"), { ...TESTNET, defaultExplorer: null })
		expect(row(w, "explorer-link").exists()).toBe(false)
		expect(row(w, "tx-hash-link").exists()).toBe(false)
		expect(row(w, "tx-hash-copy").text()).toBe("0x2b2b..2b2b")
	})

	test("a record with no network stamp shows its hash and no link; one with no hash shows neither", async () => {
		const legacy = { ...failedSend("unconfirmed"), networkId: undefined }
		const w = await mountPage(legacy, { ...TESTNET, defaultExplorer: "aztecscan" })
		expect(row(w, "explorer-link").exists()).toBe(false)
		expect(row(w, "tx-hash-copy").exists()).toBe(true)

		const neverSent = { ...failedSend(), progress: { stage: "failed" as const, from: "simulating" as const } }
		const x = await mountPage(neverSent, { ...TESTNET, defaultExplorer: "aztecscan" })
		expect(x.find('[data-testid^="journal-detail-tx-hash"]').exists()).toBe(false)
		expect(row(x, "explorer-link").exists()).toBe(false)
	})
})

describe("the App row of a dApp's operation", () => {
	/** No break opportunity anywhere in it: only breaking anywhere keeps it inside the box. */
	const HOST = "verylongsubdomainwithoutbreaks.example.com"

	test("shows the dApp's host whole, in the shared value that breaks anywhere, beside the shared label", async () => {
		const { tokenId: _tokenId, amountRaw: _amountRaw, ...base } = failedSend()
		const w = await mountPage({ ...base, kind: "dapp_execute", origin: "dapp", title: "swap", subtitle: HOST })
		expect(row(w, "origin").text()).toBe(HOST)
		expect(row(w, "origin").classes().join(" ")).toMatch(/app_value/)
		expect(row(w, "app-label").text()).toBe("App")
		expect(row(w, "app-label").classes().join(" ")).toMatch(/app_key/)
	})

	test("reads dApp for a dApp that named itself nothing, as its activity row does; a transfer has no App row", async () => {
		const { tokenId: _tokenId, amountRaw: _amountRaw, ...base } = failedSend()
		const nameless = await mountPage({ ...base, kind: "dapp_execute", origin: "dapp", title: "swap", subtitle: "" })
		expect(row(nameless, "origin").text()).toBe("dApp")
		expect(row(nameless, "app-label").text()).toBe("App")

		const transfer = await mountPage(failedSend())
		expect(row(transfer, "state").exists()).toBe(true)
		expect(row(transfer, "origin").exists()).toBe(false)
		expect(row(transfer, "app-label").exists()).toBe(false)
	})
})

describe("the title and Method row of a dApp's call", () => {
	test("both read the call by its settled rule: a movement label once the build recorded a listed token's class", async () => {
		const token = { contract: `0x${"0d".repeat(32)}`, classId: `0x${"0e".repeat(32)}` }
		mocks.tokens = [{ id: 7, symbol: "TST", decimals: 0, hasDecimals: true, ...token }]
		const { tokenId: _tokenId, amountRaw: _amountRaw, ...base } = failedSend()
		const read = async (call: OperationRecord["call"]) => {
			const w = await mountPage({ ...base, kind: "dapp_execute", origin: "dapp", title: "transfer_in_public", call })
			return [w.find("sub-page-header-stub").attributes("title"), row(w, "method").text()]
		}
		expect(await read({ ...token, argCount: 4 })).toEqual(["Transfer (public)", "Transfer (public)"])
		expect(await read({ contract: token.contract, argCount: 4 })).toEqual(["Transfer In Public", "Transfer In Public"])
	})
})

describe("the To row of a send that named its recipient", () => {
	const TESTNET = { network: { id: "n1", chainId: CHAIN_IDS.TESTNET } }
	const RECIPIENT = `0x${"09".repeat(32)}`
	const addressed = (over: Partial<OperationRecord> = {}) => ({ ...failedSend("unconfirmed"), recipientAddress: RECIPIENT, ...over })

	test("the shortened address opens the recipient's page on the explorer", async () => {
		const w = await mountPage(addressed(), { ...TESTNET, defaultExplorer: "aztecscan" })
		expect(row(w, "recipient-link").attributes("href")).toBe(`https://testnet.aztecscan.xyz/address/${RECIPIENT}`)
		expect(row(w, "recipient-link").text()).toBe("0x0909…0909")
		expect(row(w, "recipient").exists()).toBe(false)
	})

	test.each([
		["under explorer None", addressed(), null],
		["for a record with no network stamp", addressed({ networkId: undefined }), "aztecscan"],
	])("stays text %s", async (_, record, defaultExplorer) => {
		const w = await mountPage(record, { ...TESTNET, defaultExplorer })
		expect(row(w, "recipient-link").exists()).toBe(false)
		expect(row(w, "recipient").text()).toBe("0x0909…0909")
	})
})
