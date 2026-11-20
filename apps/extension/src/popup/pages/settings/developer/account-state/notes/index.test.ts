import { Flex, Input, Popover, Skeleton, Text } from "@nulo/design"
import { createTestingPinia } from "@pinia/testing"
import { type DOMWrapper, enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../../../tests/helpers/chrome-storage-mock"
import { sendEvent } from "../../../../../../../tests/helpers/send-event"
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
import { listKeyOf } from "@/utils/token-flag"
import { trimAddress } from "@/utils/string"
import NotesIndex from "./index.vue"

// Wire-shaped: 0x + 64 hex, below the field modulus.
const CHAIN = 1
const NFT = "0x1b5c09e4f72a3d8c6b10e5f94a27d3c8b05e61f7a9d42c3b8e07f15a6d29083d"
const LISTED_USDC = `0x${"0".repeat(62)}a1`
const LISTED_USDT = `0x${"0".repeat(62)}a2`
const FLAGGED = `0x${"0".repeat(62)}f1`
const UNLISTED = `0x${"0a".repeat(32)}`
const field = (n: number) => `0x${n.toString(16).padStart(64, "0")}`

const note = (contract: string, slot: number, rest: Record<string, unknown>) => ({
	contract,
	storageSlot: field(slot),
	txHash: `0x${slot.toString(16).padStart(2, "0").repeat(32)}`,
	rawContent: [field(42)],
	...rest,
})
const custom = (contract: string, slot: number, name: string, location: string) =>
	note(contract, slot, { contractName: name, contractNameFromCode: true, location })
/** Its value is its slot, so a test finds the card by it. */
const known = (contract: string, slot: number, contractName: string) =>
	note(contract, slot, { type: "UintNote", contractName, content: { value: String(slot) } })

const CARDS = [
	custom(NFT, 5, "NFT", "private_nfts"),
	custom(LISTED_USDC, 6, "Token", "private_balances"),
	known(LISTED_USDT, 7, "Token (AIP-20)"),
	known(UNLISTED, 8, "Aztec Token"),
	known(FLAGGED, 9, "Token (AIP-20)"),
]

let notes: unknown[] = []
const calls: string[] = []

vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/wallet/services/note/client", () => ({
	NoteServiceClient: function NoteServiceClient() {
		return { getNotes: vi.fn(async () => structuredClone(notes)), disconnect: vi.fn() }
	},
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: function PriceServiceClient() {
		return {
			disconnect: vi.fn(() => calls.push("price.disconnect")),
			onQuotesUpdated: { add: vi.fn(), remove: vi.fn(() => calls.push("flags.dispose")) },
			onConnected: { add: vi.fn(), remove: vi.fn() },
			getQuotes: vi.fn(async () => ({
				quotes: {},
				pricedTokens: {},
				tokenIcons: {},
				bridgeIcons: {},
				flaggedTokens: [listKeyOf(CHAIN, FLAGGED)],
				listedTokens: {
					[listKeyOf(CHAIN, LISTED_USDC)]: { symbol: "USDC", name: "Test USDC" },
					[listKeyOf(CHAIN, LISTED_USDT)]: { symbol: "USDT", name: "Test USDT" },
				},
			})),
		}
	},
}))

enableAutoUnmount(afterEach)

let popoverRoot: HTMLDivElement
// The app store reads and watches `chrome.storage.local` when it is created.
beforeEach(() => {
	vi.stubGlobal("chrome", { storage: {} })
	installChromeStorage({}, { persist: false })
	popoverRoot = document.createElement("div")
	popoverRoot.id = "popover"
	document.body.appendChild(popoverRoot)
	notes = CARDS
	calls.length = 0
})
afterEach(() => {
	popoverRoot.remove()
	vi.unstubAllGlobals()
})

async function mountPage() {
	const pinia = createTestingPinia({ createSpy: vi.fn })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.network = { id: "n", chainId: CHAIN } as never
	appStore.account = { address: `0x${"ab".repeat(32)}` } as never
	const w = mount(NotesIndex, {
		attachTo: document.body,
		global: {
			plugins: [pinia],
			components: { Flex, Input, Popover, Skeleton, Text },
			stubs: {
				SettingsPageShell: { template: "<div><slot /></div>" },
				AsyncListStatus: true,
				ListStatusMessage: { props: ["variant"], template: '<p data-testid="status" :data-variant="variant" />' },
				RowTarget: true,
				Icon: true,
			},
		},
	})
	await flushPromises()
	return { w, popupStore: usePopupStore(pinia) }
}

const cardsOf = (w: VueWrapper) => w.findAll('[style*="border-left-color"]')
const cardWith = (w: VueWrapper, text: string) => {
	const card = cardsOf(w).find((c) => c.findAll("span").some((el) => el.element.textContent === text))
	if (!card) throw new Error(`no card shows ${text}`)
	return card
}
const read = (card: DOMWrapper<Element>) => {
	const chip = card.find('[data-testid="contract-chip"]')
	return {
		header: card.get("span[id]").element.textContent,
		address: card.get('[data-testid="note-contract"]').element.textContent,
		level: chip.exists() ? chip.attributes("data-level") : undefined,
	}
}
const panelLines = () => [...document.querySelectorAll('[data-testid="contract-chip-line"]')].map((el) => el.textContent)

test("an unverified custom card shows the chip on its short address, no code name and no caveat line", async () => {
	const { w } = await mountPage()
	const card = cardWith(w, "private_nfts")
	expect(read(card)).toEqual({ header: "Custom Note", address: trimAddress(NFT), level: "none" })
	expect(card.text()).toContain("private_nfts")
	expect(card.text()).not.toContain("comes from the contract's code")
})

test("a listed contract's chip reads the list's symbol with its mark and seal, and only then the header adds the code name", async () => {
	const { w } = await mountPage()
	const card = cardWith(w, "private_balances")
	expect(read(card)).toEqual({ header: "Custom Note · Token", address: "USDC", level: "nulo" })
	expect(card.find('[data-testid="contract-chip-seal"]').exists()).toBe(true)
	expect(card.find('[data-testid="token-mark"]').exists()).toBe(true)
})

test("a known card keeps the table's name: the chip on a listed or flagged address, today's short span elsewhere", async () => {
	const { w } = await mountPage()
	const [listed, unlisted, flagged] = ["7", "8", "9"].map((value) => read(cardWith(w, value)))
	expect(listed).toEqual({ header: "UintNote · Token (AIP-20)", address: "USDT", level: "nulo" })
	expect(unlisted).toEqual({ header: "UintNote · Aztec Token", address: trimAddress(UNLISTED, 4, 4), level: undefined })
	expect(flagged).toEqual({ header: "UintNote · Token (AIP-20)", address: trimAddress(FLAGGED), level: "none" })
})

test("a chip press opens the chip's card with its one unverified line, not the note's data viewer", async () => {
	const { w, popupStore } = await mountPage()
	sendEvent(cardWith(w, "private_nfts").get('[data-testid="contract-chip"]').element, "click")
	await flushPromises()
	expect(document.querySelector('[data-testid="contract-chip-title"]')?.textContent).toBe("Unknown contract")
	expect(panelLines()).toEqual(["The name NFT comes from the contract's code. Nulo hasn't checked it."])
	expect(popupStore.open).not.toHaveBeenCalled()
	sendEvent(cardWith(w, "8").element, "click")
	expect(popupStore.open).toHaveBeenCalledWith("data_viewer")
})

test.each([
	{ term: "usdc", shown: 1, status: undefined },
	{ term: "vault", shown: 0, status: "no-results" },
])("searching $term reads what the cards show", async ({ term, shown, status }) => {
	notes = [custom(LISTED_USDC, 6, "Token", "private_balances"), custom(NFT, 5, "Vault", "deposits")]
	const { w } = await mountPage()
	await w.get("input").setValue(term)
	expect(cardsOf(w)).toHaveLength(shown)
	const line = w.find('[data-testid="status"]')
	expect(line.exists() ? line.attributes("data-variant") : undefined).toBe(status)
})

test.each([
	{ case: "with a zero-width space", pasted: "Uint​Note", shown: 1, status: undefined },
	{ case: "with a visible wrong character", pasted: "UintNotg", shown: 0, status: "no-results" },
])("a note type pasted $case shows $shown note", async ({ pasted, shown, status }) => {
	notes = [known(UNLISTED, 1, "Aztec Token"), note(`0x${"1b".repeat(32)}`, 1, { type: "FieldNote", location: "" })]
	const { w } = await mountPage()
	expect(w.findAll('[data-testid="note-contract"]')).toHaveLength(2)
	await w.get("input").setValue(pasted)
	expect(w.findAll('[data-testid="note-contract"]')).toHaveLength(shown)
	const line = w.find('[data-testid="status"]')
	expect(line.exists() ? line.attributes("data-variant") : undefined).toBe(status)
})

test("leaving the page disconnects the price client before it drops the list's listeners", async () => {
	const { w } = await mountPage()
	w.unmount()
	expect(calls).toEqual(["price.disconnect", "flags.dispose"])
})
