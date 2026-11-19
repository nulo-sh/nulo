import { Icon, RowAction } from "@nulo/design"
import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import DetailsTable from "./DetailsTable.vue"
import source from "./DetailsTable.vue?raw"

// Wire-shaped: 0x + 64 hex, each value below the field modulus.
const TOKEN = `0x0c1e${"0".repeat(56)}5a7f`
const DRIP = `0x0643${"1".repeat(56)}15fd`
const FEE_JUICE = `0x${"0".repeat(63)}5`

const CLASS_ID = `0x0c3e${"2".repeat(56)}d726`

const unmarked = { details: false, events: false, code: false }
const feeJuice = {
	...unmarked,
	address: FEE_JUICE,
	name: "Fee Juice",
	simulate: ["claim", "balance_of_public"],
	add: false,
	transact: ["claim"],
}
const token = { ...unmarked, address: TOKEN, simulate: ["balance_of_public"], add: true, transact: ["transfer", "burn_public"] }
const drip = { ...unmarked, address: DRIP, simulate: [], add: true, transact: ["drip_to_public"] }
const anyContract = { ...unmarked, name: "Any contract", simulate: ["Any function"], add: false, transact: [] }
const contractClass = { ...unmarked, address: CLASS_ID, simulate: [], add: false, transact: [], code: true }

const mountTable = (props: Record<string, unknown> = {}) =>
	mount(DetailsTable, {
		props: { known: [feeJuice], unknown: [token, drip], classes: [], anyContract: null, label: "3 contracts", ...props } as never,
		global: { components: { RowAction, Icon } },
	})

/** The compiled `<style module>` class names; a script-setup instance does not expose `$style`. */
const STYLE = (DetailsTable as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style

const opened = async (props: Record<string, unknown> = {}) => {
	const w = mountTable(props)
	await w.find('[data-testid="cap-detail-toggle"]').trigger("click")
	return w
}
const targets = (w: ReturnType<typeof mountTable>) => w.findAll('[data-testid="cap-details-row"]')
const rowOf = (w: ReturnType<typeof mountTable>, i: number) => targets(w)[i].element.parentElement as HTMLElement
const fnLines = (w: ReturnType<typeof mountTable>) =>
	w
		.find('[data-testid="cap-details-fns"]')
		.findAll(`.${STYLE.fn}`)
		.map((line) => line.findAll("span").map((cell) => cell.text()))

/** The body of the `@container details-table` block with exactly `query`, and the block itself. */
const container = (query: string) => {
	const at = source.indexOf(`@container details-table ${query} {\n`)
	const end = source.indexOf("\n}\n", at)
	return at < 0 || end < 0
		? { block: "", body: "" }
		: { block: source.slice(at, end + 2), body: source.slice(source.indexOf("{", at) + 1, end) }
}
const ONE_LINE = container("(290px <= width < 330px)")
const SPLIT = container("(width < 290px)")
const WIDE = source.replace(ONE_LINE.block, "").replace(SPLIT.block, "")
/** "Sponsored fee payer", the wallet's longest name, at the name's 13 px: 130.6 px in Chrome. */
const LONGEST_NAME_PX = 131
/** A shortened address and its copy button's box: 111.5 px in Chrome. */
const ADDRESS_PX = 112

/** The declarations of the one rule whose selector is exactly `selector`; none when two could compete. */
const rule = (css: string, selector: string): Record<string, string> => {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	const matches = [...css.matchAll(new RegExp(`^\\s*${escaped} \\{([^}]*)\\}`, "gm"))]
	const body = matches.length === 1 ? matches[0][1] : ""
	return Object.fromEntries(
		body
			.split(";")
			.map((declaration) => declaration.split(":").map((part) => part.trim()))
			.filter(([property, value]) => property && value),
	)
}

/** The width the six mark tracks, the chevron and the gaps between all eight columns take; NaN on any other tracks. */
const fixedWidth = (grid: Record<string, string>) => {
	const [, mark, chevron] = /^minmax\(0, 1fr\) repeat\(6, (\d+)px\) (\d+)px$/.exec(grid["grid-template-columns"] ?? "") ?? []
	return 6 * Number(mark) + Number(chevron) + 7 * Number.parseFloat(grid["column-gap"])
}

/** What a screen reader says for the row: the text of the element its target is labelled by. */
const spoken = (w: ReturnType<typeof mountTable>, i: number) => w.find(`[id="${targets(w)[i].attributes("aria-labelledby")}"]`).text()

describe("composite/capabilities/DetailsTable", () => {
	test("a Details fold reading its label, closed until pressed", async () => {
		const w = mountTable()
		const toggle = w.find('[data-testid="cap-detail-toggle"]')
		expect(toggle.find("span").text()).toBe("Details · 3 contracts")
		expect(toggle.attributes("aria-expanded")).toBe("false")
		expect(targets(w)).toHaveLength(0)
		await toggle.trigger("click")
		expect(toggle.attributes("aria-expanded")).toBe("true")
		expect(targets(w)).toHaveLength(3)
	})

	test("the head, the sub-headers in order, classes after contracts, and the any-contract row last under none", async () => {
		const w = await opened({ anyContract, classes: [contractClass] })
		expect(w.find(`.${STYLE.head}`).attributes("aria-hidden")).toBe("true")
		const lines = [...w.find(`.${STYLE.table}`).element.children].flatMap((el) => {
			if (el.classList.contains(STYLE.sub)) return [`# ${el.textContent}`]
			if (!el.classList.contains(STYLE.row)) return []
			return [(el.querySelector(`.${STYLE.name}`) ?? el.querySelector(`.${STYLE.address} > span`))?.textContent]
		})
		expect(lines).toEqual([
			"# Nulo knows",
			"Fee Juice",
			"# Nulo doesn't know",
			"0x0c1e…5a7f",
			"0x0643…15fd",
			"# Contract classes",
			"0x0c3e…d726",
			"Any contract",
		])
	})

	test("the head draws each column as its row's glyph, in the rows' order", async () => {
		const w = await opened()
		const head = w.find(`.${STYLE.head}`)
		const glyphs = w.findAllComponents(Icon).filter((glyph) => head.element.contains(glyph.element))
		expect(glyphs.map((glyph) => glyph.props("name"))).toEqual(["play", "add", "send", "search", "mail-lock", "code"])
		expect(head.text()).toBe("Contract")
	})

	test("no sub-header for an empty side", async () => {
		const w = await opened({ known: [], unknown: [token] })
		expect(w.findAll(`.${STYLE.sub}`).map((sub) => sub.text())).toEqual(["Nulo doesn't know"])
	})

	test("a check in each column that includes the contract, a dash in the others", async () => {
		const w = await opened()
		const marks = (i: number) =>
			[...rowOf(w, i).children]
				.filter((el) => el.classList.contains(STYLE.yes) || el.classList.contains(STYLE.no))
				.map((el) => (el.classList.contains(STYLE.yes) ? "check" : "dash"))
		expect(marks(0)).toEqual(["check", "dash", "check", "dash", "dash", "dash"])
		expect(marks(1)).toEqual(["check", "check", "check", "dash", "dash", "dash"])
		expect(marks(2)).toEqual(["dash", "check", "check", "dash", "dash", "dash"])
		const yes = w.findAllComponents(Icon).find((glyph) => glyph.classes().includes(STYLE.yes))
		expect(yes?.props("name")).toBe("check")
	})

	test("details, events and code mark their own columns", async () => {
		const w = await opened({
			known: [],
			unknown: [{ ...drip, add: false, transact: [], details: true, events: true }],
			classes: [contractClass],
		})
		const marks = (i: number) => [...rowOf(w, i).children].filter((el) => el.classList.contains(STYLE.yes)).length
		const columns = (i: number) =>
			[...rowOf(w, i).children]
				.filter((el) => el.classList.contains(STYLE.yes) || el.classList.contains(STYLE.no))
				.map((el) => el.classList.contains(STYLE.yes))
		expect(columns(0)).toEqual([false, false, false, true, true, false])
		expect(columns(1)).toEqual([false, false, false, false, false, true])
		expect([marks(0), marks(1)]).toEqual([2, 1])
		expect(spoken(w, 0)).toBe("Unknown contract 0x0643…15fd: details, events")
	})

	test("a class row shows its id with a copy button and says it is a contract class", async () => {
		const w = await opened({ known: [], unknown: [], classes: [contractClass] })
		expect(targets(w)[0].attributes("data-details-key")).toBe("classes-0")
		expect(spoken(w, 0)).toBe("Contract class 0x0c3e…d726: code")
		const copy = w.find('[data-testid="cap-details-copy"]')
		expect(copy.attributes("data-details-key")).toBe("classes-0")
		await copy.trigger("click")
		expect(w.emitted("copy")).toEqual([[CLASS_ID]])
	})

	test("a named row's target is named for what it lists, since the head is hidden", async () => {
		const w = await opened({ anyContract })
		expect(spoken(w, 0)).toBe("Fee Juice: simulate, transact")
		expect(spoken(w, 3)).toBe("Any contract: simulate")
	})

	test("an unknown row's target says it is unknown, then its address as shown and what it lists", async () => {
		const w = await opened()
		expect(spoken(w, 1)).toBe("Unknown contract 0x0c1e…5a7f: simulate, add, transact")
		expect(spoken(w, 2)).toBe("Unknown contract 0x0643…15fd: add, transact")
	})

	test("a row opens on its native button and lists the functions the app sent", async () => {
		const w = await opened()
		const target = targets(w)[1]
		expect((target.element as HTMLButtonElement).type).toBe("button")
		for (const key of ["Enter", " "]) {
			const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
			target.element.dispatchEvent(event)
			expect(event.defaultPrevented).toBe(false)
		}
		expect(target.attributes("aria-expanded")).toBe("false")
		await target.trigger("click")
		expect(target.attributes("aria-expanded")).toBe("true")
		expect(fnLines(w)).toEqual([
			["Simulate", "balance_of_public"],
			["Transact", "transfer · burn_public"],
		])
		await target.trigger("click")
		expect(w.find('[data-testid="cap-details-fns"]').exists()).toBe(false)
	})

	test("an opened row shows only the lines it has functions for", async () => {
		const w = await opened()
		await targets(w)[2].trigger("click")
		expect(fnLines(w)).toEqual([["Transact", "drip_to_public"]])
	})

	test("an unknown contract shows its address's first six and last four characters", async () => {
		const w = await opened()
		expect(w.findAll(`.${STYLE.address}`).map((cell) => cell.find("span").text())).toEqual(["0x0c1e…5a7f", "0x0643…15fd"])
	})

	test("a named row shows its name, with no address and no copy button", async () => {
		const w = await opened()
		expect(rowOf(w, 0).querySelector(`.${STYLE.name}`)?.textContent).toBe("Fee Juice")
		expect(rowOf(w, 0).textContent).not.toContain("0x")
		expect(rowOf(w, 0).querySelector('[data-testid="cap-details-copy"]')).toBeNull()
	})

	test("copy emits the full address, leaves its row as it was, and is not a Tab stop", async () => {
		const w = await opened()
		const copy = w.findAll('[data-testid="cap-details-copy"]')[0]
		expect(copy.attributes("tabindex")).toBe("-1")
		expect(copy.attributes("aria-label")).toBe("Copy address")
		expect(copy.attributes("data-details-key")).toBe(targets(w)[1].attributes("data-details-key"))
		await copy.trigger("click")
		expect(w.emitted("copy")).toEqual([[TOKEN]])
		expect(targets(w)[1].attributes("aria-expanded")).toBe("false")
	})

	test("bidi and control characters in a function name and an address are stripped", async () => {
		const hostile = `0x0c1e‮${"0".repeat(56)}​5a7f`
		const w = await opened({
			known: [],
			unknown: [{ ...unmarked, address: hostile, simulate: ["bal‮ance\u0007_of"], add: false, transact: [] }],
		})
		expect(w.find(`.${STYLE.address}`).find("span").text()).toBe("0x0c1e…5a7f")
		await targets(w)[0].trigger("click")
		expect(w.find('[data-testid="cap-details-fns"]').text()).toContain("balance_of")
		await w.find('[data-testid="cap-details-copy"]').trigger("click")
		expect(w.emitted("copy")).toEqual([[TOKEN]])
	})

	test("a legend under the rows names each head glyph once, in its order, hidden from screen readers", async () => {
		const legendOf = (w: ReturnType<typeof mountTable>) => {
			const legend = w.find('[data-testid="cap-details-legend"]')
			const glyphs = w.findAllComponents(Icon).filter((glyph) => legend.element.contains(glyph.element))
			return { legend, pairs: glyphs.map((glyph) => [glyph.props("name"), glyph.element.parentElement?.textContent]) }
		}
		const w = await opened({ anyContract })
		const { legend, pairs } = legendOf(w)
		expect(pairs).toEqual([
			["play", "Simulate"],
			["add", "Add"],
			["send", "Transact"],
			["search", "Details"],
			["mail-lock", "Events"],
			["code", "Code"],
		])
		const head = w.find(`.${STYLE.head}`).element
		const headGlyphs = w.findAllComponents(Icon).filter((glyph) => head.contains(glyph.element))
		expect(pairs.map(([glyph]) => glyph)).toEqual(headGlyphs.map((glyph) => glyph.props("name")))
		expect(legend.attributes("aria-hidden")).toBe("true")
		const order = [...w.find(`.${STYLE.table}`).element.children]
		const lastRow = order.findLastIndex((el) => el.classList.contains(STYLE.row))
		expect(order.indexOf(legend.element)).toBe(lastRow + 1)
		expect(order[lastRow + 2]?.classList).toContain(STYLE.foot)

		const bare = legendOf(mountTable({ bare: true, foot: false }))
		expect(bare.pairs).toEqual(pairs)
		expect(bare.legend.element.nextElementSibling).toBeNull()
	})

	test("the footnote says where the function names come from", async () => {
		const w = await opened()
		expect(w.find(`.${STYLE.foot}`).text()).toBe(
			"Function names come from the app. Anything it didn't list is refused instantly; you won't be asked.",
		)
	})

	test("bare draws the table open, with no fold, the same rows and the footnote unless told not to", async () => {
		const w = mountTable({ bare: true })
		expect(w.find('[data-testid="cap-detail-toggle"]').exists()).toBe(false)
		expect(targets(w)).toHaveLength(3)
		expect(w.find(`.${STYLE.foot}`).exists()).toBe(true)

		await targets(w)[1].trigger("click")
		expect(fnLines(w)).toEqual([
			["Simulate", "balance_of_public"],
			["Transact", "transfer · burn_public"],
		])

		expect(mountTable({ bare: true, foot: false }).find(`.${STYLE.foot}`).exists()).toBe(false)
	})

	test("the narrow drawings key on the table's own width, never the viewport's", () => {
		const w = mountTable({ bare: true })
		expect(w.find(`.${STYLE.table}`).element.parentElement?.classList).toContain(STYLE.frame)
		expect(source).toMatch(/\.frame \{\s*container: details-table \/ inline-size;\s*\}/)
		expect([ONE_LINE.body, SPLIT.body]).not.toContain("")
		expect(source.match(/@container /g)).toHaveLength(2)
		expect(source).not.toMatch(/@media \([^)]*width/)
	})

	// jsdom lays nothing out: these read the rules the browser applies, and the captures measure them.
	test("at 312 px the head and each row are one line: the narrower tracks leave a name its room", () => {
		expect(312 - fixedWidth(rule(ONE_LINE.body, ".grid"))).toBeGreaterThanOrEqual(LONGEST_NAME_PX)
		expect(ONE_LINE.body).not.toMatch(/grid-column|subgrid|display:/)

		// Head and rows share one set of tracks, so each glyph stands over its column's marks.
		const w = mountTable({ bare: true })
		const head = w.find(`.${STYLE.head}`)
		const cells = (el: Element) => [...el.children].filter((c) => !c.hasAttribute("hidden") && !c.hasAttribute("data-row-target"))
		expect(head.classes()).toContain(STYLE.grid)
		expect(cells(head.element)).toHaveLength(8)
		for (const target of targets(w)) {
			expect(target.element.parentElement?.classList).toContain(STYLE.grid)
			expect(cells(target.element.parentElement as Element)).toHaveLength(8)
		}
	})

	test("a 30-character name wraps inside its cell, whole, its row padded off the hairlines", () => {
		const long = "Private token bridge registrar"
		const w = mountTable({ bare: true, known: [{ ...feeJuice, name: long }] })
		expect(rowOf(w, 0).querySelector(`.${STYLE.name}`)?.textContent).toBe(long)
		expect(rule(ONE_LINE.body, ".row > .name")).toEqual({ "white-space": "normal", "overflow-wrap": "anywhere" })
		expect(rule(ONE_LINE.body, ".row")).toEqual({ "padding-block": "4px" })
	})

	test("below 290 px, where an address no longer fits beside the marks, names and addresses take their own line", () => {
		expect(290 - fixedWidth(rule(ONE_LINE.body, ".grid"))).toBeGreaterThanOrEqual(ADDRESS_PX)
		expect(rule(SPLIT.body, ".table > .grid")).toEqual({ "grid-template-columns": "subgrid", "row-gap": "4px" })
		expect(SPLIT.body).toMatch(/\.grid > \.name,\s*\.grid > \.address,\s*\.head > span:first-child \{\s*grid-column: 1 \/ -1;\s*\}/)
		expect(SPLIT.body).toMatch(
			/\.grid > \.name \+ \*,\s*\.grid > \.address \+ \*,\s*\.head > span:first-child \+ \* \{\s*grid-column-start: 2;\s*\}/,
		)
	})

	test("at 342 px nothing changes: the narrow rules start below 330 px and the wide tracks hold", () => {
		expect(rule(WIDE, ".grid")).toEqual({
			display: "grid",
			"grid-template-columns": "minmax(0, 1fr) repeat(6, 26px) 14px",
			"align-items": "center",
			"column-gap": "4px",
		})
		expect(342 - fixedWidth(rule(WIDE, ".grid"))).toBeGreaterThanOrEqual(LONGEST_NAME_PX)
		expect(rule(WIDE, ".name")).toMatchObject({ "white-space": "nowrap", "text-overflow": "ellipsis" })
	})
})
