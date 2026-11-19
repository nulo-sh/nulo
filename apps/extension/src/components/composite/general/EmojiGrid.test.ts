import { hashToEmoji } from "@aztec-labs/wallet-sdk/crypto"
import { describe, expect, test } from "vitest"
import { mount } from "@vue/test-utils"
import EmojiGrid from "./EmojiGrid.vue"
import { emojiCells } from "./emoji-cells"

const STUBS = {
	Flex: { template: '<div :class="$attrs.class"><slot /></div>', inheritAttrs: false },
	Text: { props: ["variant"], template: '<span :data-variant="variant"><slot /></span>' },
}

const FE0F = "\uFE0F"
const ALL_BYTES = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0")).join("")

const mountGrid = (emojis: string) => mount(EmojiGrid, { props: { emojis }, global: { stubs: STUBS } })
const cellTexts = (emojis: string) =>
	mountGrid(emojis)
		.findAll("[class*='cell']")
		.map((c) => c.element.textContent)

describe("composite/EmojiGrid", () => {
	test("renders nine cells in three rows of three", () => {
		const rows = mountGrid("🐷🐔🐮🦊🐭🦁🐶🐱🐰").findAll("[class*='grid'] > div")
		expect(rows.map((row) => row.findAll("[class*='cell']").length)).toEqual([3, 3, 3])
	})

	test("handles fewer than 9 emojis (renders only the provided ones)", () => {
		expect(cellTexts("🐷🐔🐮")).toHaveLength(3)
	})

	test("handles empty string (renders 0 cells)", () => {
		expect(cellTexts("")).toHaveLength(0)
	})

	test("preserves emoji order in the rendered output", () => {
		expect(cellTexts("🐷🐔🐮🦊🐭🦁🐶🐱🐰")).toEqual(["🐷", "🐔", "🐮", "🦊", "🐭", "🦁", "🐶", "🐱", "🐰"])
	})

	test("gives every cell the emoji role", () => {
		const variants = mountGrid("🐷🐔🐮🦊🐭🦁🐶🐱🐰")
			.findAll("[class*='cell'] > span")
			.map((s) => s.attributes("data-variant"))
		expect(variants).toEqual(Array(9).fill("emoji"))
	})

	test("asks for emoji presentation on the two squares and the text-default symbols, and leaves the rest as the SDK wrote them", () => {
		const emojis = hashToEmoji("6e196d1483a9c83f4a")
		expect(emojis).toBe("⬜🐷⬛🦊🖥🚀🎨🌤🍕")
		expect(cellTexts(emojis)).toEqual([`⬜${FE0F}`, "🐷", `⬛${FE0F}`, "🦊", `🖥${FE0F}`, "🚀", "🎨", `🌤${FE0F}`, "🍕"])
	})

	test("keeps a symbol that already carries its selector in one cell, with one selector", () => {
		expect(cellTexts(`❤${FE0F}🐷`)).toEqual([`❤${FE0F}`, "🐷"])
	})

	test("keeps a ZWJ sequence in one cell, unchanged", () => {
		expect(cellTexts("👩\u200D💻🐷")).toEqual(["👩\u200D💻", "🐷"])
	})

	test("keeps a flag's two regional indicators in one cell", () => {
		expect(cellTexts("🇺🇸🐷")).toEqual(["🇺🇸", "🐷"])
	})

	test("gives every symbol of the SDK's alphabet its own cell, as written plus at most one selector", () => {
		const alphabet = [...hashToEmoji(ALL_BYTES, 256)]
		const cells = emojiCells(alphabet.join(""))
		expect(cells.map((cell) => cell.replace(new RegExp(`${FE0F}$`), ""))).toEqual(alphabet)
		expect(cells.filter((cell) => cell.endsWith(FE0F))).toHaveLength(21)
	})
})
