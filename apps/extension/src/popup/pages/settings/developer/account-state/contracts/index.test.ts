import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/auth-registry/constants"
import { Flex, Input, RowAction } from "@nulo/design"
import { createTestingPinia } from "@pinia/testing"
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { ref } from "vue"
import { installChromeStorage } from "../../../../../../../tests/helpers/chrome-storage-mock"
import { useAppStore } from "@/stores/app.store"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { PRIVATE_FPC_ADDRESS } from "@/wallet/services/fpc/private-fpc-address"
import { SPONSORED_FPC_ADDRESS } from "@/wallet/services/fpc/sponsored-fpc-address"
import ContractsIndex from "./index.vue"

// Wire-shaped: 0x + 64 hex, below the field modulus.
const { TOKEN, ACCOUNT, UNKNOWN, BUILT_IN, CLASS, getContractRows } = vi.hoisted(() => ({
	TOKEN: `0x${"0a".repeat(32)}`,
	ACCOUNT: `0x${"1b".repeat(32)}`,
	UNKNOWN: `0x${"2c".repeat(32)}`,
	BUILT_IN: `0x${"00".repeat(31)}02`,
	CLASS: (n: string) => `0x${n.repeat(32)}`,
	getContractRows: vi.fn(),
}))
/** A built-in outside the protocol set, so only its compiled-in name can name it. */
const AUTH_REGISTRY = STANDARD_AUTH_REGISTRY_ADDRESS.toString()
const ROWS = [
	{ address: TOKEN, classId: CLASS("0e"), builtIn: false },
	{ address: ACCOUNT, classId: CLASS("0f"), builtIn: false },
	{ address: PRIVATE_FPC_ADDRESS, classId: CLASS("1d"), builtIn: false },
	{ address: SPONSORED_FPC_ADDRESS, classId: CLASS("0d"), builtIn: false },
	{ address: BUILT_IN, classId: CLASS("2e"), builtIn: true, name: "Contract Instance Registry" },
	{ address: AUTH_REGISTRY, classId: CLASS("3e"), builtIn: true, name: "Auth Registry" },
	{ address: UNKNOWN, classId: CLASS("1f"), builtIn: false },
]

vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/wallet/services/account-state/client", () => ({
	AccountStateServiceClient: function AccountStateServiceClient() {
		return { getContractRows, disconnect: vi.fn() }
	},
}))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: function TokenServiceClient() {
		return {
			getTokens: vi.fn(async (_profileId: string, chainId: number) => [{ id: 1, chainId, contract: TOKEN, symbol: "USDC" }]),
			disconnect: vi.fn(),
		}
	},
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: function PriceServiceClient() {
		return { disconnect: vi.fn() }
	},
}))
vi.mock("@/composables/usePrices", () => ({
	useTokenFlags: () => ({
		mapped: ref(true),
		isFlagged: () => false,
		iconFor: () => undefined,
		bridgeIconFor: () => undefined,
		listedAt: (t: { contract?: string } | undefined) => (t?.contract === TOKEN ? { symbol: "USDC", name: "Test USDC" } : undefined),
		dispose: vi.fn(),
	}),
}))
vi.mock("@/utils/core", () => ({ managers: { contact: { getContacts: vi.fn(async () => []) } } }))

enableAutoUnmount(afterEach)

// The app store reads and watches `chrome.storage.local` when it is created.
beforeEach(() => {
	getContractRows.mockReset().mockImplementation(async () => ROWS)
	vi.stubGlobal("chrome", { storage: {} })
	installChromeStorage({}, { persist: false })
})
afterEach(() => {
	vi.unstubAllGlobals()
})

async function mountPage({ chainId = CHAIN_IDS.TESTNET as number, explorer = "aztecscan" as "aztecscan" | null } = {}) {
	const pinia = createTestingPinia({ createSpy: vi.fn })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.network = { id: "n", chainId } as never
	appStore.profile = { id: "p" } as never
	appStore.accounts = [{ address: ACCOUNT, name: "Account 1" }] as never
	appStore.defaultExplorer = explorer
	const w = mount(ContractsIndex, {
		attachTo: document.body,
		global: {
			plugins: [pinia],
			components: { Flex, Input, RowAction },
			stubs: {
				SettingsPageShell: { template: "<div><slot /></div>" },
				AsyncListStatus: { emits: ["retry"], template: `<button data-testid="retry" @click="$emit('retry')" />` },
				ListStatusMessage: { props: ["variant"], template: '<p data-testid="status" :data-variant="variant" />' },
				ContractChip: {
					props: ["model", "explorer"],
					template: `<span data-testid="contract-chip" :data-level="model.level ?? 'pending'" :data-explorer="explorer ? 'given' : undefined">{{ model.label }}</span>`,
				},
				Tooltip: { template: '<span><slot /><span data-testid="tooltip"><slot name="content" /></span></span>' },
				Icon: true,
				Text: { template: "<span><slot /></span>" },
			},
		},
	})
	await flushPromises()
	return { w, appStore }
}

type Page = Awaited<ReturnType<typeof mountPage>>["w"]
const rowOf = (w: Page, address: string) => w.get(`[data-testid="contract-row"][data-address="${address}"]`)
const shown = (w: Page) => w.findAll('[data-testid="contract-row"]').map((r) => r.attributes("data-address"))

test("each row reads its chip, both short ids, a copy for each and its origin", async () => {
	const { w } = await mountPage()
	const read = (address: string) => {
		const row = rowOf(w, address)
		return {
			chip: row.get('[data-testid="contract-chip"]').text(),
			level: row.get('[data-testid="contract-chip"]').attributes("data-level"),
			origin: row.get('[data-testid="contract-row-origin"]').text(),
		}
	}
	expect(read(TOKEN)).toEqual({ chip: "USDC", level: "nulo", origin: "Added with your token" })
	expect(read(ACCOUNT)).toEqual({ chip: "Account 1", level: "none", origin: "Your account" })
	expect(read(PRIVATE_FPC_ADDRESS)).toEqual({ chip: "Private Fee Juice", level: "nulo", origin: "Added by Nulo, for fees" })
	expect(read(SPONSORED_FPC_ADDRESS)).toEqual({ chip: "Sponsored", level: "nulo", origin: "Added by Nulo, for fees" })
	expect(read(BUILT_IN)).toEqual({ chip: "Contract Instance Registry", level: "nulo", origin: "Built into every wallet" })
	expect(read(AUTH_REGISTRY)).toEqual({ chip: "Auth Registry", level: "none", origin: "Built into every wallet" })
	expect(read(UNKNOWN)).toEqual({ chip: "0x2c2c2c..2c2c", level: "none", origin: "Origin not recorded" })
	const token = rowOf(w, TOKEN)
	expect(token.get('[data-testid="contract-row-instance"]').text()).toBe("0x0a0a..0a0a")
	expect(token.get('[data-testid="contract-row-class"]').text()).toBe("0x0e0e..0e0e")
	expect(token.get('[data-testid="contract-row-copy-instance"]').attributes("aria-label")).toBe("Copy contract address")
	expect(token.get('[data-testid="contract-row-copy-class"]').attributes("aria-label")).toBe("Copy class id")
})

test.each([
	["Testnet", CHAIN_IDS.TESTNET, "https://testnet.aztecscan.xyz", true],
	["Mainnet", CHAIN_IDS.MAINNET, "https://aztecscan.xyz", false],
])(
	"on %s with Aztecscan each published row links its instance page, labelled as its tooltip",
	async (_chain, chainId, host, sponsorPublished) => {
		const { w } = await mountPage({ chainId })
		const links = Object.fromEntries(
			w
				.findAll('[data-testid="contract-row"]')
				.map((r) => [r.attributes("data-address"), r.find('[data-testid="contract-row-explorer"]')]),
		)
		for (const address of [TOKEN, BUILT_IN, UNKNOWN]) {
			expect(links[address].attributes("href")).toBe(`${host}/contracts/instances/${address}`)
			expect(links[address].attributes("aria-label")).toBe("View on Aztecscan")
		}
		expect(rowOf(w, TOKEN).get('[data-testid="tooltip"]').text()).toBe("View on Aztecscan")
		// Never published: an account, the PrivateFPC, and the sponsor where none is deployed.
		expect(links[ACCOUNT].exists()).toBe(false)
		expect(links[PRIVATE_FPC_ADDRESS].exists()).toBe(false)
		expect(links[SPONSORED_FPC_ADDRESS].exists()).toBe(sponsorPublished)
		expect(rowOf(w, SPONSORED_FPC_ADDRESS).get('[data-testid="contract-row-origin"]').text()).toBe(
			sponsorPublished ? "Added by Nulo, for fees" : "Origin not recorded",
		)
		// The row's action is the only link: no chip's press carries one past the withholding.
		expect(w.findAll('[data-testid="contract-chip"][data-explorer]')).toHaveLength(0)
	},
)

test.each([
	["with Block Explorer set to None", { explorer: null }],
	["on the local network's chain", { chainId: 0 }],
])("%s no row has the action", async (_case, options) => {
	const { w } = await mountPage(options)
	expect(shown(w)).toHaveLength(ROWS.length)
	expect(w.findAll('[data-testid="contract-row-explorer"]')).toHaveLength(0)
})

test.each([
	{ case: "an account's name", term: "account 1", shown: [ACCOUNT] },
	{ case: "a class id's start", term: CLASS("2e").slice(0, 12), shown: [BUILT_IN] },
	{ case: "a protocol contract's name", term: "instance registry", shown: [BUILT_IN] },
	{ case: "a built-in's compiled-in name", term: "auth registry", shown: [AUTH_REGISTRY] },
	{ case: "an address pasted with a zero-width space", term: `${UNKNOWN.slice(0, 20)}​${UNKNOWN.slice(20)}`, shown: [UNKNOWN] },
	{ case: "an address with a visible wrong character", term: `${UNKNOWN.slice(0, -1)}g`, shown: [] },
])("a search for $case shows $shown", async ({ term, shown: expected }) => {
	const { w } = await mountPage()
	await w.get("input").setValue(term)
	expect(shown(w)).toEqual(expected)
	expect(w.find('[data-testid="status"]').exists()).toBe(expected.length === 0)
})

test("a read that answers after a later one lands nothing, so the rows are the later scope's", async () => {
	let answerFirst: (rows: unknown[]) => void = () => {}
	getContractRows.mockImplementationOnce(() => new Promise((done) => (answerFirst = done)))
	const { w, appStore } = await mountPage()
	appStore.network = { id: "n2", chainId: CHAIN_IDS.TESTNET } as never
	await flushPromises()
	// The new scope reads only once its account is set, after its accounts.
	expect(getContractRows).toHaveBeenCalledTimes(1)
	appStore.account = { address: ACCOUNT } as never
	await flushPromises()
	expect(shown(w)).toEqual(ROWS.map((r) => r.address))
	answerFirst([{ address: `0x${"3a".repeat(31)}0a`, classId: CLASS("0c"), builtIn: false }])
	await flushPromises()
	expect(shown(w)).toEqual(ROWS.map((r) => r.address))
})

test("a read whose scope ended before any other read began lands nothing", async () => {
	let answerFirst: (rows: unknown[]) => void = () => {}
	getContractRows.mockImplementationOnce(() => new Promise((done) => (answerFirst = done)))
	const { w, appStore } = await mountPage()
	appStore.network = undefined as never
	await flushPromises()
	answerFirst(ROWS)
	await flushPromises()
	expect(shown(w)).toEqual([])
	expect(getContractRows).toHaveBeenCalledTimes(1)
	// Control: the next scope reads and shows its own rows.
	appStore.network = { id: "n2", chainId: CHAIN_IDS.TESTNET } as never
	appStore.account = { address: ACCOUNT } as never
	await flushPromises()
	expect(shown(w)).toEqual(ROWS.map((r) => r.address))
})

test("a retry after a failed read shows the rows it reads", async () => {
	getContractRows.mockImplementationOnce(async () => Promise.reject(new Error("PXE request failed")))
	const { w } = await mountPage()
	expect(shown(w)).toEqual([])
	await w.get('[data-testid="retry"]').trigger("click")
	await flushPromises()
	expect(shown(w)).toEqual(ROWS.map((r) => r.address))
	expect(w.find('[data-testid="retry"]').exists()).toBe(false)
})
