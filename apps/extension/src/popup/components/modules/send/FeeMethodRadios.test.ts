/**
 * Send's payers as native radios: every row the card offers, private Fee Juice first, each with its
 * glossary definition and what it can spend; one group; a row that cannot pay, or is still loading,
 * cannot be chosen.
 */
import { Skeleton } from "@nulo/design"
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, test } from "vitest"
import { GLOSSARY } from "@/utils/glossary"
import { FpcType } from "@/wallet/services/fpc/client"
import { buildFeeMethods, type FeeMethodOption, type GasBalances } from "./fee-helpers"
import FeeMethodRadios from "./FeeMethodRadios.vue"

/** As the FPC store and the gas read hand them over: wire addresses, raw 18-decimal balances. */
const PRIVATE_FPC = { id: "p1", type: FpcType.PrivateFpc, name: "Private Fee Juice", isProtocol: true, address: `0x${"1a".repeat(32)}` }
const NULO_SPONSOR = { id: "s1", type: FpcType.DefaultSponsoredFpc, name: "Sponsored", isProtocol: true, address: `0x${"2b".repeat(32)}` }
const HAND_ADDED = { id: "s2", type: FpcType.DefaultSponsoredFpc, name: "My sponsor", isProtocol: false, address: `0x${"3c".repeat(32)}` }
const HELD = { publicFeeJuice: "4200000000000000000", privateFeeJuice: "1800000000000000000" }

const rowsOf = (gas: GasBalances = HELD, fpcs = [HAND_ADDED, PRIVATE_FPC, NULO_SPONSOR]) => buildFeeMethods(fpcs, gas)

const mounted: ReturnType<typeof mount>[] = []
function mountRadios(methods: FeeMethodOption[], modelValue: FeeMethodOption | null = null) {
	const w = mount(FeeMethodRadios, { props: { methods, modelValue }, global: { stubs: { Skeleton } }, attachTo: document.body })
	mounted.push(w)
	return w
}
/** Each text node's words, one space between nodes: the parts a reader hears, not glued spans. */
const words = (el: Element) => {
	const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
	const parts: string[] = []
	for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent?.trim()) parts.push(n.textContent.trim())
	return parts.join(" ")
}
const radios = (w: ReturnType<typeof mount>) => w.findAll('input[type="radio"]')
const choices = (w: ReturnType<typeof mount>) =>
	w.findAll("label").map((l) => ({
		id: l.get("input").attributes("data-testid"),
		text: words(l.element),
		disabled: (l.get("input").element as HTMLInputElement).disabled,
		checked: (l.get("input").element as HTMLInputElement).checked,
	}))

afterEach(() => {
	for (const w of mounted.splice(0)) w.unmount()
})

describe("FeeMethodRadios", () => {
	test("private Fee Juice, public Fee Juice, Nulo's sponsor, then one added by hand, each with its definition and balance", () => {
		const w = mountRadios(rowsOf())
		const priv = GLOSSARY["private-fee-juice"].definition
		const pub = GLOSSARY["public-fee-juice"].definition
		const sponsored = GLOSSARY.sponsored.definition
		expect(choices(w).map(({ id, text }) => ({ id, text }))).toEqual([
			{ id: "send-fee-payer-private", text: `Private Fee Juice ${priv} 1.8 FJ` },
			{ id: "send-fee-payer-public", text: `Public Fee Juice ${pub} 4.2 FJ` },
			{ id: "send-fee-payer-sponsored", text: `Sponsored ${sponsored} free` },
			{ id: "send-fee-payer-sponsored", text: `My sponsor ${sponsored} —` },
		])
		expect(w.findAll("label").map((l) => l.attributes("data-fpc-id") ?? null)).toEqual(["p1", null, "s1", "s2"])
	})

	test("one radio group named by its label, the chosen payer checked and named on the group", () => {
		const rows = rowsOf()
		const w = mountRadios(rows, rows.find((m) => m.fpc?.id === "s1") ?? null)
		const group = w.get('[role="radiogroup"]')
		expect(w.get(`#${group.attributes("aria-labelledby")}`).text()).toBe("Who pays the fee")
		expect(group.attributes("data-fee-method")).toBe("sponsored")
		expect(new Set(radios(w).map((r) => r.attributes("name"))).size).toBe(1)
		expect(choices(w).map((c) => c.checked)).toEqual([false, false, true, false])
	})

	test("a sponsor is chosen by its own contract, never by a sibling of its kind", () => {
		const rows = rowsOf()
		const w = mountRadios(rows, rows.find((m) => m.fpc?.id === "s2") ?? null)
		expect(choices(w).map((c) => c.checked)).toEqual([false, false, false, true])
	})

	test("choosing a payer emits its row", async () => {
		const rows = rowsOf()
		const w = mountRadios(rows, rows.find((m) => m.type === "private_fpc") ?? null)
		await radios(w)[1].setValue(true)
		expect(w.emitted("update:modelValue")).toEqual([[rows.find((m) => m.type === "fj")]])
	})

	test("a payer that cannot pay is out of reach and says why", () => {
		const w = mountRadios(rowsOf({ publicFeeJuice: "0", privateFeeJuice: null }))
		expect(choices(w).slice(0, 2)).toEqual([
			{
				id: "send-fee-payer-private",
				text: `Private Fee Juice ${GLOSSARY["private-fee-juice"].definition} couldn't check balance`,
				disabled: true,
				checked: false,
			},
			{
				id: "send-fee-payer-public",
				text: `Public Fee Juice ${GLOSSARY["public-fee-juice"].definition} no balance`,
				disabled: true,
				checked: false,
			},
		])
		expect(choices(w)[2].disabled).toBe(false)
	})

	test("a row still loading is out of reach and says it is checking", () => {
		const loading = buildFeeMethods([PRIVATE_FPC, NULO_SPONSOR], undefined, { balancesPending: true })
		const w = mountRadios(loading)
		const priv = w.get('[data-testid="send-fee-payer-private"]')
		expect((priv.element as HTMLInputElement).disabled).toBe(true)
		expect(priv.attributes("data-checking")).toBe("true")
		expect(w.findAll("label")[0].text()).toContain("Checking")
	})

	test("while nothing is chosen and the card still reads, the group says it is busy", async () => {
		const w = mountRadios(rowsOf(), null)
		expect(w.get('[role="radiogroup"]').attributes("aria-busy")).toBeUndefined()
		await w.setProps({ pending: true })
		expect(w.get('[role="radiogroup"]').attributes("aria-busy")).toBe("true")
	})

	test("focus lands on the chosen payer, else on the first that can be chosen", async () => {
		const rows = rowsOf({ publicFeeJuice: HELD.publicFeeJuice, privateFeeJuice: "0" })
		const w = mountRadios(rows, null)
		;(w.vm as unknown as { focus: () => void }).focus()
		expect(document.activeElement).toBe(w.get('[data-testid="send-fee-payer-public"]').element)
		await w.setProps({ modelValue: rows.find((m) => m.fpc?.id === "s1") })
		;(w.vm as unknown as { focus: () => void }).focus()
		expect(document.activeElement).toBe(radios(w)[2].element)
	})
})
