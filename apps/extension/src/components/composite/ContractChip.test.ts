import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Flex, Icon, Popover, Skeleton, Text } from "@nulo/design"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { explorerDisplayName, getContractExplorerUrl } from "@/wallet/constants/explorers"
import { sendEvent } from "../../../tests/helpers/send-event"
import { appChipOf, type ChipModel, contractChipOf } from "./contract-chip"
import ContractChip from "./ContractChip.vue"

/** As the wire carries a call's target: `0x` and 64 hex digits. */
const TOKEN = "0x0f8df6867e9547fdf90e0f69187ada6fbd7b1f6ad4903ad333200bb032279ecf"
const OTHER = "0x2d8fb63a7b035198295a451cac292a50a2a58fdf4824e2f5c18356146062ff50"
const ICON = "data:image/svg+xml;base64,PHN2Zy8+"
const EXPLORER = { url: getContractExplorerUrl(CHAIN_IDS.TESTNET, "aztecscan", TOKEN) as string, name: explorerDisplayName("aztecscan") }

const LISTED = contractChipOf({ level: "nulo", source: "token", symbol: "TST", name: "Test Token", icon: ICON }, TOKEN)
const UNKNOWN = contractChipOf({ level: "none", flagged: false }, OTHER)

let root: HTMLDivElement
const mounted: VueWrapper[] = []
const mountChip = (model: ChipModel, explorer: { url: string; name: string } | null = EXPLORER) => {
	const w = mount(ContractChip, {
		props: { model, explorer, testid: "label" },
		attachTo: document.body,
		global: { components: { Flex, Icon, Popover, Skeleton, Text } },
	})
	mounted.push(w)
	return w
}
const chip = (w: VueWrapper) => w.get('[data-testid="contract-chip"]')
const panel = () => document.querySelector<HTMLElement>('[data-testid="contract-chip-panel"]')
const inPanel = (testid: string) => panel()?.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`) ?? []
const press = async (w: VueWrapper) => {
	const button = chip(w).element as HTMLButtonElement
	button.focus()
	sendEvent(button, "click")
	await flushPromises()
}
const key = (el: Element, init: Record<string, unknown>) => sendEvent(el, "keydown", init) as KeyboardEvent

describe("composite/ContractChip", () => {
	beforeEach(() => {
		root = document.createElement("div")
		root.id = "popover"
		document.body.appendChild(root)
	})
	afterEach(() => {
		for (const w of mounted.splice(0)) w.unmount()
		root.remove()
	})

	test("its accessible name carries the level, and a pending chip's is its label alone", () => {
		expect(chip(mountChip(LISTED)).attributes()).toMatchObject({ "aria-label": "TST, Nulo verified", "data-level": "nulo" })
		expect(chip(mountChip(UNKNOWN)).attributes()).toMatchObject({ "aria-label": "0x2d8fb6..ff50, Unverified", "data-level": "none" })
		const pending = chip(mountChip(contractChipOf({ level: "pending" }, OTHER)))
		expect(pending.attributes()).toMatchObject({ "aria-label": "0x2d8fb6..ff50", "data-level": "pending" })
	})

	test("Nulo verified draws the solid seal, Aztecscan verified the drawn one, and unverified and pending none", () => {
		const seal = (model: ChipModel) => mountChip(model).find('[data-testid="contract-chip-seal"]')
		/** The solid seal paints a filled shape only; the drawn one a stroke only. */
		const paint = (svg: ReturnType<typeof seal>) => ({
			filled: svg.findAll('path[stroke="none"]').length > 0,
			stroked: svg.findAll('path[fill="none"]').length > 0,
		})
		const solid = seal(LISTED)
		expect(solid.attributes("aria-hidden")).toBe("true")
		expect(paint(solid)).toEqual({ filled: true, stroked: false })
		expect(paint(seal(contractChipOf({ level: "scan", name: "Router" }, OTHER)))).toEqual({ filled: false, stroked: true })
		expect(seal(UNKNOWN).exists()).toBe(false)
		expect(seal(contractChipOf({ level: "pending" }, OTHER)).exists()).toBe(false)
	})

	test("a listed token reads by the list's symbol with its picture inside the chip, an unknown contract by its short address", () => {
		const listed = mountChip(LISTED)
		expect(listed.get('[data-testid="label"]').text()).toBe("TST")
		expect(listed.get('[data-testid="label"]').classes()).toContain("type--value")
		expect(listed.get('[data-testid="token-mark-logo"]').attributes("src")).toBe(ICON)
		const unknown = mountChip(UNKNOWN)
		expect(unknown.get('[data-testid="label"]').text()).toBe("0x2d8fb6..ff50")
		expect(unknown.get('[data-testid="label"]').classes()).toContain("type--meta")
		expect(unknown.find('[data-testid="token-mark"]').exists()).toBe(false)
	})

	test("a press opens its card, and the chip names it while open", async () => {
		const w = mountChip(LISTED)
		expect(chip(w).attributes("aria-expanded")).toBe("false")
		expect(panel()).toBeNull()
		await press(w)
		const id = panel()?.id
		expect(id).toBeTruthy()
		expect(chip(w).attributes()).toMatchObject({ "aria-expanded": "true", "aria-controls": id, "aria-describedby": id })
	})

	test("the card names the level and the token, then the short address beside the explorer link", async () => {
		const w = mountChip(LISTED)
		await press(w)
		expect(inPanel("contract-chip-level")[0].textContent).toBe("Nulo verified")
		expect(inPanel("contract-chip-title")[0].textContent).toBe("TST · Test Token")
		expect([...inPanel("contract-chip-line")].map((l) => l.textContent)).toEqual([
			"Nulo knows this contract. Knowing it isn't a promise that it's safe.",
			"Nulo names it from its token list.",
		])
		expect(inPanel("contract-chip-short-address")[0].textContent).toBe("0x0f8df6..9ecf")
		const link = inPanel("contract-chip-explorer-link")[0]
		expect(link.getAttribute("href")).toBe(`https://testnet.aztecscan.xyz/contracts/instances/${TOKEN}`)
		expect(link.getAttribute("target")).toBe("_blank")
		expect(link.getAttribute("rel")).toBe("noopener noreferrer")
		expect(link.textContent?.trim()).toBe("View on Aztecscan")
	})

	test("with no explorer for the chain the card ends on the short address alone", async () => {
		const w = mountChip(UNKNOWN, null)
		await press(w)
		expect(inPanel("contract-chip-short-address")[0].textContent).toBe("0x2d8fb6..ff50")
		expect(inPanel("contract-chip-explorer-link")).toHaveLength(0)
		expect([...inPanel("contract-chip-line")].map((l) => l.textContent)).toEqual(["Nulo hasn't checked this contract."])
	})

	test("an unverified contract whose code names itself keeps its short address, and its card says where the name comes from", async () => {
		const w = mountChip(contractChipOf({ level: "none", flagged: false }, OTHER, { selfName: "Crowdfunding" }))
		expect(w.get('[data-testid="label"]').text()).toBe("0x2d8fb6..ff50")
		await press(w)
		expect([...inPanel("contract-chip-line")].map((l) => l.textContent)).toEqual([
			"Nulo hasn't checked this contract.",
			"The name Crowdfunding comes from the contract's code. Nulo hasn't checked it.",
		])
		const listed = contractChipOf({ level: "nulo", source: "token", symbol: "TST", name: "Test Token" }, TOKEN, { selfName: "Token" })
		expect(listed.lines, "a Nulo verified card names the contract from the list alone").toEqual([
			"Nulo knows this contract. Knowing it isn't a promise that it's safe.",
			"Nulo names it from its token list.",
		])
	})

	test("an address the person named reads by that name with no mark, its card titled by it, the decoded name's line kept", async () => {
		const named = contractChipOf({ level: "none", flagged: false }, OTHER, { name: "@Alice", selfName: "Crowdfunding" })
		const w = mountChip(named)
		expect(chip(w).attributes("aria-label")).toBe("@Alice, Unverified")
		expect(w.get('[data-testid="label"]').classes()).toContain("type--name")
		expect(w.get('[data-testid="label"]').attributes("data-address-shows")).toBe("name")
		expect(w.find('[data-testid="contract-chip-seal"]').exists()).toBe(false)
		await press(w)
		expect(inPanel("contract-chip-title")[0].textContent).toBe("@Alice")
		expect([...inPanel("contract-chip-line")].map((l) => l.textContent)).toEqual([
			"Nulo hasn't checked this contract.",
			"The name Crowdfunding comes from the contract's code. Nulo hasn't checked it.",
		])
		expect(inPanel("contract-chip-short-address")[0].textContent).toBe("0x2d8fb6..ff50")
		const flagged = contractChipOf({ level: "none", flagged: true }, OTHER, { name: "@Alice" })
		expect([flagged.label, flagged.title], "a flagged token keeps its short address").toEqual([
			"0x2d8fb6..ff50",
			"Nulo flagged this token as a scam",
		])
		const listed = contractChipOf({ level: "nulo", source: "token", symbol: "TST", name: "Test Token" }, TOKEN, { name: "@Alice" })
		expect(listed.label, "a listed token keeps the list's name").toBe("TST")
	})

	test("Nulo's sponsor reads by the fee card's name for it, with the solid seal", () => {
		const sponsor = contractChipOf({ level: "nulo", source: "sponsor" }, OTHER)
		expect([sponsor.label, sponsor.accessibleName, sponsor.title]).toEqual(["Sponsored", "Sponsored, Nulo verified", "Sponsored"])
		expect(sponsor.lines).toEqual(["Nulo knows this contract. Knowing it isn't a promise that it's safe."])
	})

	test("the PrivateFPC reads by its name with the solid seal, and its card says Nulo knows it", async () => {
		const w = mountChip(contractChipOf({ level: "nulo", source: "fpc" }, OTHER))
		expect(chip(w).attributes("aria-label")).toBe("Private Fee Juice, Nulo verified")
		expect(w.find('[data-testid="token-mark"]').exists()).toBe(false)
		await press(w)
		expect(inPanel("contract-chip-level")[0].textContent).toBe("Nulo verified")
		expect(inPanel("contract-chip-title")[0].textContent).toBe("Private Fee Juice")
		expect([...inPanel("contract-chip-line")].map((l) => l.textContent)).toEqual([
			"Nulo knows this contract. Knowing it isn't a promise that it's safe.",
		])
	})

	test("a pending card names no level and says Nulo is still checking, above the short address", async () => {
		const w = mountChip(contractChipOf({ level: "pending" }, OTHER))
		await press(w)
		expect(inPanel("contract-chip-level")).toHaveLength(0)
		expect(inPanel("contract-chip-title")).toHaveLength(0)
		expect([...inPanel("contract-chip-line")].map((l) => l.textContent)).toEqual(["Nulo is still checking this contract."])
		expect(inPanel("contract-chip-short-address")[0].textContent).toBe("0x2d8fb6..ff50")
	})

	test("an Aztecscan verified card says the code is verified and who runs it is not checked", async () => {
		const w = mountChip(contractChipOf({ level: "scan", name: "Router" }, OTHER))
		await press(w)
		expect(inPanel("contract-chip-level")[0].textContent).toBe("Aztecscan verified")
		expect([...inPanel("contract-chip-line")].map((l) => l.textContent)).toEqual([
			"Its code is verified on Aztecscan. Nulo hasn't checked who runs it.",
		])
	})

	test("a flagged token keeps the person's mark with its badge, never a seal, and its card says Nulo flagged it", async () => {
		const w = mountChip(contractChipOf({ level: "none", flagged: true }, OTHER, { held: { symbol: "SCAM", badge: false } }))
		expect(w.get('[data-testid="token-mark"]').find("svg.color--red").exists(), "the red badge").toBe(true)
		expect(w.find('[data-testid="contract-chip-seal"]').exists()).toBe(false)
		expect(w.get('[data-testid="label"]').text()).toBe("0x2d8fb6..ff50")
		await press(w)
		expect(inPanel("contract-chip-title")[0].textContent).toBe("Nulo flagged this token as a scam")
		expect(inPanel("contract-chip-line")).toHaveLength(0)
	})

	test("the app's card names its site and says who chose the name, with no address row", async () => {
		const app = appChipOf("Playground", "https://playground.example") as ChipModel
		const w = mountChip(app, null)
		expect(chip(w).attributes("aria-label")).toBe("Playground, Unverified")
		await press(w)
		expect(inPanel("contract-chip-title")[0].textContent).toBe("https://playground.example")
		expect([...inPanel("contract-chip-line")].map((l) => l.textContent)).toEqual([
			"Nulo doesn't know this site. Each contract shows its own level.",
			"The name Playground comes from the site. Nulo hasn't checked it.",
		])
		expect(inPanel("contract-chip-short-address")).toHaveLength(0)
		expect(appChipOf("  ​ ", "https://x.example"), "a name that sanitizes to nothing has no chip").toBeNull()
	})

	test("the app's chip drops the emoji of its name, while its card quotes the name as declared", () => {
		const app = appChipOf("Playground \u2705", "https://playground.example") as ChipModel
		expect([app.label, app.accessibleName]).toEqual(["Playground", "Playground, Unverified"])
		expect(app.lines[1]).toBe("The name Playground \u2705 comes from the site. Nulo hasn't checked it.")
		expect(appChipOf("Swap\u{1F1E6}\u{1F1F7}Pro", "https://x.example")?.label).toBe("SwapPro")
		expect(appChipOf("\u{1F680}\u{1F680} 1\uFE0F\u20E3", "https://x.example"), "a name of emoji only has no chip").toBeNull()
		expect(appChipOf(`${"W".repeat(70)}\u{1F680}`, "https://x.example")?.label, "the cap counts what the chip shows").toBe(
			`${"W".repeat(64)}…`,
		)
	})

	test("opened from the chip, focus moves to the link, and Escape returns it to the chip", async () => {
		const w = mountChip(LISTED)
		await press(w)
		const link = inPanel("contract-chip-explorer-link")[0]
		expect(document.activeElement).toBe(link)
		expect(key(link, { key: "Escape", code: "Escape" }).defaultPrevented).toBe(true)
		await flushPromises()
		expect(document.activeElement).toBe(chip(w).element)
		expect(chip(w).attributes("aria-expanded")).toBe("false")
	})

	test("a card with no link keeps focus on the chip, which it describes, and Escape closes it", async () => {
		const w = mountChip(appChipOf("Playground", "https://playground.example") as ChipModel, null)
		await press(w)
		expect(document.activeElement).toBe(chip(w).element)
		expect(chip(w).attributes("aria-describedby")).toBe(panel()?.id)
		key(chip(w).element, { key: "Escape", code: "Escape" })
		await flushPromises()
		expect(chip(w).attributes("aria-expanded")).toBe("false")
		expect(document.activeElement).toBe(chip(w).element)
	})

	test("a repeat Enter is refused on the chip and on the link, a first Enter is not", async () => {
		const w = mountChip(LISTED)
		expect(key(chip(w).element, { key: "Enter", repeat: true }).defaultPrevented).toBe(true)
		expect(key(chip(w).element, { key: "Enter" }).defaultPrevented).toBe(false)
		await press(w)
		const link = inPanel("contract-chip-explorer-link")[0]
		expect(key(link, { key: "Enter", repeat: true }).defaultPrevented).toBe(true)
		expect(key(link, { key: "Enter" }).defaultPrevented).toBe(false)
	})
})

describe("composite/ContractChip, a pending chip held", () => {
	const PENDING = contractChipOf({ level: "pending" }, OTHER)
	const held = (w: VueWrapper) => ({
		held: chip(w).attributes("data-held") === "true",
		label: w.find('[data-testid="contract-chip-held-label"]').exists(),
		mark: w.find('[data-testid="contract-chip-held-mark"]').exists(),
		text: w.get('[data-testid="label"]').text(),
	})
	beforeEach(() => {
		vi.useFakeTimers()
		root = document.createElement("div")
		root.id = "popover"
		document.body.appendChild(root)
	})
	afterEach(() => {
		for (const w of mounted.splice(0)) w.unmount()
		root.remove()
		vi.useRealTimers()
	})

	test("from its first paint it is placeholders under its short address's name, until the cap shows the address", async () => {
		const w = mountChip(PENDING)
		expect(held(w)).toEqual({ held: true, label: true, mark: true, text: "" })
		expect(chip(w).attributes("aria-label")).toBe("0x2d8fb6..ff50")
		await vi.advanceTimersByTimeAsync(999)
		expect(held(w).held).toBe(true)
		await vi.advanceTimersByTimeAsync(1)
		expect(held(w)).toEqual({ held: false, label: false, mark: false, text: "0x2d8fb6..ff50" })
		expect(w.find('[data-testid="contract-chip-seal"]').exists()).toBe(false)
	})

	test("a level landing before the cap draws the chip final at once and ends the hold", async () => {
		const w = mountChip(PENDING)
		await vi.advanceTimersByTimeAsync(400)
		await w.setProps({ model: LISTED })
		expect(held(w)).toEqual({ held: false, label: false, mark: false, text: "TST" })
		expect(vi.getTimerCount()).toBe(0)
	})

	test("a level landing after the cap moves the released chip to its final look", async () => {
		const w = mountChip(PENDING)
		await vi.advanceTimersByTimeAsync(1000)
		await w.setProps({ model: LISTED })
		expect(held(w).text).toBe("TST")
		expect(w.find('[data-testid="contract-chip-seal"]').exists()).toBe(true)
	})

	test("a held chip's card says Nulo is still checking and names no level", async () => {
		const w = mountChip(PENDING)
		await press(w)
		expect(held(w).held).toBe(true)
		expect(inPanel("contract-chip-level")).toHaveLength(0)
		expect([...inPanel("contract-chip-line")].map((l) => l.textContent)).toEqual(["Nulo is still checking this contract."])
	})

	test("unmounting a held chip leaves no timer", () => {
		const w = mountChip(PENDING)
		expect(vi.getTimerCount()).toBe(1)
		w.unmount()
		mounted.splice(mounted.indexOf(w), 1)
		expect(vi.getTimerCount()).toBe(0)
	})

	test("another contract in its place is held afresh, even after the first was released", async () => {
		const w = mountChip(PENDING)
		await vi.advanceTimersByTimeAsync(1000)
		await w.setProps({ model: contractChipOf({ level: "pending" }, TOKEN) })
		expect(held(w).held).toBe(true)
		await vi.advanceTimersByTimeAsync(1000)
		expect(held(w)).toMatchObject({ held: false, text: "0x0f8df6..9ecf" })
	})
})
