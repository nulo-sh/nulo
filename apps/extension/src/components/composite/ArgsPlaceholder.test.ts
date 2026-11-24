/**
 * The placeholder that stands where a call's arguments will read: a pair of bars per field, capped at
 * four, or one bar on a line; the words reach assistive tech only, and never twice.
 */
import { Skeleton } from "@nulo/design"
import { mount, type VueWrapper } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import ArgsPlaceholder from "./ArgsPlaceholder.vue"

const STYLE = (ArgsPlaceholder as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style
const WORDS = "Reading arguments…"

const mountWith = (props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) => mount(ArgsPlaceholder, { props, attrs })
const pairs = (w: VueWrapper) => w.findAll(`.${STYLE.pair}`)
const bars = (w: VueWrapper) => w.findAllComponents(Skeleton)

describe("ArgsPlaceholder", () => {
	test.each([1, 2, 3, 4])("%i fields draw that many label and value pairs", (fields) => {
		const w = mountWith({ fields })
		expect(pairs(w)).toHaveLength(fields)
		expect(pairs(w).map((p) => p.findAllComponents(Skeleton).length)).toEqual(Array(fields).fill(2))
	})

	test.each([5, 32])("%i fields draw four pairs: the rows a reading lands with grow past the box", (fields) => {
		expect(pairs(mountWith({ fields }))).toHaveLength(4)
	})

	test("a call with no field draws no pair, and still says it is being read", () => {
		const w = mountWith({ fields: 0 })
		expect([pairs(w).length, bars(w).length, w.text()]).toEqual([0, 0, WORDS])
	})

	test("without a field count one bar holds a line", () => {
		const w = mountWith()
		expect([w.classes(), pairs(w).length, bars(w).length]).toEqual([[STYLE.line], 0, 1])
		expect(bars(w)[0]!.props()).toEqual({ width: 148, height: 9 })
	})

	test("the words are visually hidden, and are its only text", () => {
		for (const w of [mountWith({ fields: 4 }), mountWith()]) {
			const words = w.get(`.${STYLE.words}`)
			expect([words.text(), w.text()]).toEqual([WORDS, WORDS])
		}
	})

	test("every bar is hidden from assistive tech", () => {
		const w = mountWith({ fields: 4 })
		expect(w.findAll('[aria-hidden="true"]')).toHaveLength(8)
		expect(w.attributes("aria-hidden")).toBeUndefined()
	})

	test("decorative, it draws its bars, says nothing, and hides itself from assistive tech", () => {
		const w = mountWith({ fields: 2, decorative: true })
		expect([pairs(w).length, w.text(), w.attributes("aria-hidden")]).toEqual([2, "", "true"])
	})

	test("it claims no live region of its own", () => {
		const w = mountWith({ fields: 4 })
		expect([w.attributes("role"), w.attributes("aria-busy"), w.attributes("aria-live")]).toEqual([undefined, undefined, undefined])
	})

	test("the host's role, busy mark, id and testid land on its root", () => {
		const w = mountWith({ fields: 4 }, { role: "status", "aria-busy": "true", id: "note-1", "data-testid": "t-args-pending" })
		expect([w.attributes("role"), w.attributes("aria-busy"), w.attributes("id"), w.attributes("data-testid")]).toEqual([
			"status",
			"true",
			"note-1",
			"t-args-pending",
		])
	})
})
