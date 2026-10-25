import { Flex, Icon, Text } from "@nulo/design"
import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import ItemsContainer from "@/components/ui/Settings/ItemsContainer.vue"
import SettingItem from "@/components/ui/Settings/SettingItem.vue"
import type { GetStartedItem, GetStartedStep } from "@/utils/get-started"
import GetStartedCard from "./GetStartedCard.vue"

/** The real rows, so a done step's missing action is the row's own inert mode, not a stub's. */
const COMPONENTS = { Flex, Icon, Text, ItemsContainer, SettingItem }

const ALL: GetStartedItem[] = ["phrase", "backup", "aztec", "feeJuice", "presto"]
const open = (...items: GetStartedItem[]): GetStartedStep[] => items.map((item) => ({ item, done: false }))
const steps = (items: GetStartedItem[], done: GetStartedItem[] = []): GetStartedStep[] =>
	items.map((item) => ({ item, done: done.includes(item) }))

const mountCard = (list: GetStartedStep[] = open(...ALL), canHide = true) =>
	mount(GetStartedCard, { props: { steps: list, canHide }, global: { components: COMPONENTS } })
const row = (w: ReturnType<typeof mountCard>, item: GetStartedItem) => w.get(`[data-testid="get-started-${item}"]`)
const mark = (w: ReturnType<typeof mountCard>, item: GetStartedItem) => row(w, item).get('[aria-hidden="true"]')
const title = (w: ReturnType<typeof mountCard>, item: GetStartedItem) => row(w, item).get('[data-testid="setting-title"]').text()

describe("general/GetStartedCard", () => {
	test("the section is labelled Get started and its steps are a list", () => {
		const w = mountCard()
		expect(w.attributes("data-testid")).toBe("get-started")
		expect(w.text()).toContain("Get started")
		expect(w.findAll('[role="list"] [role="listitem"]').map((li) => li.attributes("data-testid"))).toEqual(
			ALL.map((item) => `get-started-${item}`),
		)
	})

	test("each open step carries the drawn copy and a chevron", () => {
		const w = mountCard()
		expect(row(w, "phrase").text()).toBe("1Save your recovery phraseThe 24 words that restore this wallet")
		expect(row(w, "backup").text()).toBe("2Back up this walletSync your passkey or save a backup file")
		expect(row(w, "aztec").text()).toBe("3How Aztec works1 min")
		expect(row(w, "feeJuice").text()).toBe("4Get Fee Juice")
		expect(row(w, "presto").text()).toBe("5Make proofs fasterOptional")
		for (const item of ALL) expect(row(w, item).findAll("svg"), item).toHaveLength(1)
	})

	test("steps are numbered in the given order; the first open one is the next, filled", () => {
		const order: GetStartedItem[] = ["presto", "feeJuice", "phrase", "aztec"]
		const w = mountCard(steps(order, ["presto"]))
		expect(w.findAll('[role="listitem"]').map((li) => li.attributes("data-testid"))).toEqual(order.map((item) => `get-started-${item}`))
		expect((["feeJuice", "phrase", "aztec"] as const).map((item) => mark(w, item).text())).toEqual(["2", "3", "4"])
		expect(w.findAll('[aria-current="step"]').map((el) => el.attributes("data-testid"))).toEqual(["get-started-feeJuice"])
		const filled = (item: GetStartedItem) =>
			mark(w, item)
				.classes()
				.some((name) => /next/.test(name))
		expect((["feeJuice", "phrase", "aztec"] as const).map(filled)).toEqual([true, false, false])
	})

	test("a done step stays: a check in its number's place, its title struck, Done in place of the chevron, and no action", async () => {
		const w = mountCard(steps(["phrase", "aztec", "feeJuice", "presto"], ["phrase", "aztec"]))
		expect(row(w, "aztec").attributes("data-done")).toBe("true")
		expect(row(w, "feeJuice").attributes("data-done")).toBe("false")
		expect(mark(w, "aztec").text()).toBe("")
		expect(mark(w, "aztec").find("svg").exists()).toBe(true)
		expect(title(w, "aztec")).toBe("How Aztec works")
		const struck = (item: GetStartedItem) =>
			row(w, item)
				.classes()
				.some((name) => /done/.test(name))
		expect([struck("aztec"), struck("feeJuice")]).toEqual([true, false])
		expect(row(w, "aztec").text()).toBe("How Aztec worksDone")
		expect(row(w, "aztec").findAll("svg")).toHaveLength(1)
		expect(row(w, "aztec").find("button").exists()).toBe(false)
		expect(row(w, "feeJuice").find("button").exists()).toBe(true)
		await row(w, "aztec").trigger("click")
		expect(w.emitted("select")).toBeUndefined()
	})

	test("a step done while the card is shown loses its action", async () => {
		const w = mountCard(open("phrase", "aztec"))
		await w.setProps({ steps: steps(["phrase", "aztec"], ["aztec"]) })
		expect(row(w, "aztec").find("button").exists()).toBe(false)
		await row(w, "aztec").trigger("click")
		expect(w.emitted("select")).toBeUndefined()
	})

	test("an open step's press names its item", async () => {
		const w = mountCard()
		await row(w, "feeJuice").get("button").trigger("click")
		await row(w, "phrase").get("button").trigger("click")
		expect(w.emitted("select")).toEqual([["feeJuice"], ["phrase"]])
	})

	test("the count sits beside Hide, as a polite status, and only when there is more than one step", () => {
		const w = mountCard(steps(["phrase", "aztec", "feeJuice", "presto"], ["phrase", "aztec"]))
		const count = w.get('[data-testid="get-started-count"]')
		expect(count.text()).toBe("2 of 4 done")
		expect(count.attributes("role")).toBe("status")
		expect(mountCard(open("phrase"), false).find('[data-testid="get-started-count"]').exists()).toBe(false)
	})

	test("Hide shows with canHide and emits hide", async () => {
		const w = mountCard()
		const hide = w.get('[data-testid="get-started-hide"]')
		expect(hide.text()).toBe("Hide")
		expect(hide.attributes("type")).toBe("button")
		await hide.trigger("click")
		expect(w.emitted("hide")).toEqual([[]])
		expect(w.emitted("select")).toBeUndefined()
	})

	test("no Hide without canHide", () => {
		expect(mountCard(open("phrase"), false).find('[data-testid="get-started-hide"]').exists()).toBe(false)
	})
})
