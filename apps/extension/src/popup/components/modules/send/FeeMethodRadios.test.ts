/**
 * Send's payers as native radios: every row the card offers, private Fee Juice first, each with its
 * glossary definition and what it can spend; one group; a row that cannot pay, or is still loading,
 * cannot be chosen.
 */
import { Skeleton } from "@nulo/design"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, describe, expect, test } from "vitest"
import { GLOSSARY } from "@/utils/glossary"
import { FpcType } from "@/wallet/services/fpc/client"
import { buildFeeMethods, type FeeMethodOption, type GasBalances } from "@/utils/fee/fee-helpers"
import FeeMethodRadios from "./FeeMethodRadios.vue"

/** As the FPC store and the gas read hand them over: wire addresses, raw 18-decimal balances. */
const PRIVATE_FPC = { id: "p1", type: FpcType.PrivateFpc, name: "Private Fee Juice", isProtocol: true, address: `0x${"1a".repeat(32)}` }
const NULO_SPONSOR = { id: "s1", type: FpcType.DefaultSponsoredFpc, name: "Sponsored", isProtocol: true, address: `0x${"2b".repeat(32)}` }
const HAND_ADDED = { id: "s2", type: FpcType.DefaultSponsoredFpc, name: "My sponsor", isProtocol: false, address: `0x${"3c".repeat(32)}` }
const HELD = { publicFeeJuice: "4200000000000000000", privateFeeJuice: "1800000000000000000" }

const rowsOf = (gas: GasBalances = HELD, fpcs = [HAND_ADDED, PRIVATE_FPC, NULO_SPONSOR]) => buildFeeMethods(fpcs, gas)

const mounted: ReturnType<typeof mount>[] = []
function mountRadios(methods: FeeMethodOption[], modelValue: FeeMethodOption | null = null, usd?: number) {
	const w = mount(FeeMethodRadios, { props: { methods, modelValue, usd }, global: { stubs: { Skeleton } }, attachTo: document.body })
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
			// A contract added by hand may charge: it is never told as one that pays for you.
			{ id: "send-fee-payer-sponsored", text: `My sponsor ${GLOSSARY.fpc.definition} —` },
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

	test("a pick the card refuses leaves the browser's check on the card's payer", async () => {
		// An unread balance leaves both Fee Juice rows open, and the card keeps its sponsor.
		const rows = buildFeeMethods([PRIVATE_FPC, NULO_SPONSOR], undefined)
		const w = mountRadios(rows, rows.find((m) => m.fpc?.id === "s1") ?? null)
		await radios(w)[1].setValue(true)
		await flushPromises()
		expect(w.emitted("update:modelValue")).toHaveLength(1)
		expect(choices(w).map((c) => c.checked)).toEqual([false, false, true])
		// Taken later, the card's own choice still lands.
		await w.setProps({ modelValue: rows.find((m) => m.type === "fj") })
		expect(choices(w).map((c) => c.checked)).toEqual([false, true, false])
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
		const vm = w.vm as unknown as { focus: () => void; target: () => HTMLElement | undefined }
		vm.focus()
		expect(document.activeElement).toBe(w.get('[data-testid="send-fee-payer-public"]').element)
		await w.setProps({ modelValue: rows.find((m) => m.fpc?.id === "s1") })
		vm.focus()
		expect(document.activeElement).toBe(radios(w)[2].element)
		// A chosen row that cannot pay is passed over.
		await w.setProps({ modelValue: rows.find((m) => m.type === "private_fpc") })
		expect(vm.target()).toBe(w.get('[data-testid="send-fee-payer-public"]').element)
		await w.setProps({ methods: rowsOf({ publicFeeJuice: "0", privateFeeJuice: "0" }, [PRIVATE_FPC]) })
		expect(vm.target()).toBeUndefined()
	})
})

describe("FeeMethodRadios: a balance's dollars", () => {
	const FJ = (whole: string) => `${whole}${"0".repeat(18)}`
	const THOUSAND = { publicFeeJuice: FJ("1000"), privateFeeJuice: FJ("1000") }
	const USD = 7
	const priv = GLOSSARY["private-fee-juice"].definition
	const pub = GLOSSARY["public-fee-juice"].definition
	const anyDollars = (w: ReturnType<typeof mount>) => choices(w).some((c) => c.text.includes("$"))

	test("each Fee Juice balance reads its dollars at cents after it; the sponsors print none", () => {
		expect(choices(mountRadios(rowsOf(THOUSAND), null, USD)).map((c) => c.text)).toEqual([
			`Private Fee Juice ${priv} 1,000 FJ $7,000.00`,
			`Public Fee Juice ${pub} 1,000 FJ $7,000.00`,
			`Sponsored ${GLOSSARY.sponsored.definition} free`,
			`My sponsor ${GLOSSARY.fpc.definition} —`,
		])
	})

	test("a balance worth less than a cent reads <$0.01", () => {
		const dust = `1${"0".repeat(15)}`
		const w = mountRadios(rowsOf({ publicFeeJuice: dust, privateFeeJuice: dust }), null, USD)
		expect(choices(w)[1].text).toBe(`Public Fee Juice ${pub} 0.001 FJ <$0.01`)
	})

	test("without a usable quote no row prints dollars", () => {
		expect(anyDollars(mountRadios(rowsOf(THOUSAND)))).toBe(false)
	})

	test("a balance not read yet prints no dollars on its open row", () => {
		const w = mountRadios(buildFeeMethods([PRIVATE_FPC, NULO_SPONSOR], undefined), null, USD)
		expect(choices(w).slice(0, 2)).toEqual([
			{ id: "send-fee-payer-private", text: `Private Fee Juice ${priv} — FJ`, disabled: false, checked: false },
			{ id: "send-fee-payer-public", text: `Public Fee Juice ${pub} — FJ`, disabled: false, checked: false },
		])
	})

	test("a row that cannot pay prints its reason and no dollars, even over a balance it holds", () => {
		// No PrivateFPC: the private row still carries the 1,000 FJ it read.
		const w = mountRadios(buildFeeMethods([NULO_SPONSOR], THOUSAND), null, USD)
		expect(
			choices(w)
				.slice(0, 2)
				.map((c) => c.text),
		).toEqual([`Private Fee Juice ${priv} not available`, `Public Fee Juice ${pub} 1,000 FJ $7,000.00`])
		const unread = mountRadios(rowsOf({ publicFeeJuice: "0", privateFeeJuice: null }), null, USD)
		expect(anyDollars(unread)).toBe(false)
	})

	test("a row still loading keeps its skeleton and prints no dollars", () => {
		const w = mountRadios(buildFeeMethods([PRIVATE_FPC, NULO_SPONSOR], undefined, { balancesPending: true }), null, USD)
		expect(w.findAllComponents(Skeleton)).toHaveLength(2)
		expect(anyDollars(w)).toBe(false)
	})

	test.each(["0x10", "abc"])("a balance that is not a decimal string (%s) prints no dollars", (balance) => {
		const row = (b: string): FeeMethodOption => ({
			type: "fj",
			title: "Public Fee Juice",
			subtitle: "public",
			spend: "1 FJ",
			balance: b,
		})
		expect(choices(mountRadios([row(FJ("1"))], null, USD))[0].text).toBe(`Public Fee Juice ${pub} 1 FJ $7.00`)
		expect(choices(mountRadios([row(balance)], null, USD))[0].text).toBe(`Public Fee Juice ${pub} 1 FJ`)
	})
})
