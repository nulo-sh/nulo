import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import type { GetStartedItem } from "@/utils/get-started"
import GetStartedCard from "./GetStartedCard.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	SectionLabel: { template: '<span data-testid="stub-label">{{ label }}</span>', props: ["label"] },
	ItemsContainer: { template: "<div><slot /></div>" },
	SettingItem: {
		template:
			'<button type="button" :data-chevron="chevron" @click="$emit(\'click\')"><b>{{ title }}</b><i>{{ description }}</i><s>{{ value }}</s></button>',
		props: { title: String, description: String, value: String, chevron: Boolean },
		emits: ["click"],
	},
}
const ALL: GetStartedItem[] = ["phrase", "backup", "aztec", "feeJuice", "presto"]

const mountCard = (items: GetStartedItem[] = ALL, canHide = true) =>
	mount(GetStartedCard, { props: { items, canHide }, global: { stubs: STUBS } })
const row = (w: ReturnType<typeof mountCard>, item: GetStartedItem) => w.get(`[data-testid="get-started-${item}"]`)

describe("general/GetStartedCard", () => {
	test("the section is labelled Get started", () => {
		const w = mountCard()
		expect(w.attributes("data-testid")).toBe("get-started")
		expect(w.get('[data-testid="stub-label"]').text()).toBe("Get started")
	})

	test("rows follow the given order, each with a chevron", () => {
		const w = mountCard(["aztec", "phrase"])
		expect(w.findAll("button[data-chevron]").map((b) => b.attributes("data-testid"))).toEqual([
			"get-started-aztec",
			"get-started-phrase",
		])
		expect(row(w, "aztec").attributes("data-chevron")).toBe("true")
	})

	test("each row carries the drawn copy", () => {
		const w = mountCard()
		expect(row(w, "phrase").text()).toBe("Save your recovery phraseThe 24 words that restore this wallet")
		expect(row(w, "backup").text()).toBe("Back up this walletSync your passkey or save a backup file")
		expect(row(w, "aztec").text()).toBe("How Aztec works1 min")
		expect(row(w, "feeJuice").text()).toBe("Get Fee Juice")
		expect(row(w, "presto").text()).toBe("Make proofs fasterOptional")
	})

	test("a row's click names its item", async () => {
		const w = mountCard()
		await row(w, "feeJuice").trigger("click")
		await row(w, "phrase").trigger("click")
		expect(w.emitted("select")).toEqual([["feeJuice"], ["phrase"]])
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
		expect(mountCard(["phrase"], false).find('[data-testid="get-started-hide"]').exists()).toBe(false)
	})
})
