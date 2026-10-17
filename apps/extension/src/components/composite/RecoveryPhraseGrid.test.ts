import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import RecoveryPhraseGrid from "./RecoveryPhraseGrid.vue"

const WORDS = Array.from({ length: 24 }, (_, i) => `word${String.fromCharCode(97 + i)}`)

const STUBS = { Button: { template: '<button v-bind="$attrs"><slot /></button>' } }

const mountGrid = (props: Partial<{ words: string[]; columns: 3 | 4; testId: string; isCopied: boolean }> = {}) =>
	mount(RecoveryPhraseGrid, {
		props: { words: WORDS, columns: 3, testId: "phrase", isCopied: false, ...props },
		global: { stubs: STUBS },
	})

const cells = (w: ReturnType<typeof mountGrid>) => w.findAll("ol > li")

describe("composite/RecoveryPhraseGrid", () => {
	test("renders the words in order, one list item each", () => {
		const w = mountGrid()
		expect(w.findAll('[data-testid="phrase-word"]').map((word) => word.text())).toEqual(WORDS)
	})

	test("numbers the words 1 to 24", () => {
		const w = mountGrid()
		expect(cells(w).map((cell) => cell.text().replace(/\D/g, ""))).toEqual(WORDS.map((_, i) => String(i + 1)))
	})

	test("is an ordered list, so the reading order is the phrase's order", () => {
		const w = mountGrid()
		expect(w.find("ol").exists()).toBe(true)
		expect(cells(w)).toHaveLength(24)
	})

	test("three columns and four columns take different layouts", () => {
		const three = mountGrid({ columns: 3 }).get("ol").classes()
		const four = mountGrid({ columns: 4 }).get("ol").classes()
		expect(three).not.toEqual(four)
	})

	test("the root carries the given testid", () => {
		const w = mountGrid({ testId: "reveal-content" })
		expect(w.attributes("data-testid")).toBe("reveal-content")
		expect(w.findAll('[data-testid="reveal-content-word"]')).toHaveLength(24)
	})

	test("the root keeps page translation off the words", () => {
		expect(mountGrid().attributes("translate")).toBe("no")
	})

	test("Copy emits copy once per click and carries no words itself", async () => {
		const w = mountGrid()
		const copy = w.get('[data-testid="phrase-copy"]')
		await copy.trigger("click")
		expect(w.emitted("copy")).toEqual([[]])
		expect(copy.text()).toBe("Copy")
	})

	test("isCopied flips the label to Copied", () => {
		expect(mountGrid({ isCopied: true }).get('[data-testid="phrase-copy"]').text()).toBe("Copied")
	})

	test("Copy sits under the grid", () => {
		const w = mountGrid()
		const children = [...w.element.children].map((el) => el.tagName)
		expect(children).toEqual(["OL", "BUTTON"])
	})

	test("an empty list renders nothing, not an empty card", () => {
		const w = mountGrid({ words: [] })
		expect(w.find("ol").exists()).toBe(false)
		expect(w.find('[data-testid="phrase-copy"]').exists()).toBe(false)
	})

	test("new words replace the old ones", async () => {
		const w = mountGrid()
		await w.setProps({ words: ["alpha", "bravo"] })
		expect(w.findAll('[data-testid="phrase-word"]').map((word) => word.text())).toEqual(["alpha", "bravo"])
	})
})
