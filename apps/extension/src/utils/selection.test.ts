import { afterEach, describe, expect, test } from "vitest"
import { endsSelection, selectedWithin } from "./selection"

function page() {
	document.body.innerHTML = '<p id="before">Scope</p><span id="value">0xabc</span><p id="after">end</p>'
	const at = (id: string) => document.getElementById(id)?.firstChild as Text
	return { value: document.getElementById("value"), at }
}

function select(anchor: Text, anchorOffset: number, focus: Text, focusOffset: number) {
	window.getSelection()?.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset)
}

describe("selectedWithin", () => {
	afterEach(() => window.getSelection()?.removeAllRanges())

	test("a drag inside the element", () => {
		const { value, at } = page()
		select(at("value"), 0, at("value"), 3)
		expect(selectedWithin(value)).toBe(true)
	})

	test("a selection anchored outside and extended into the element, as a Shift-click makes", () => {
		const { value, at } = page()
		select(at("before"), 0, at("value"), 2)
		expect(selectedWithin(value)).toBe(true)
	})

	test("a selection elsewhere on the page, one that ends at the element's edge, or a caret inside it, holds none of it", () => {
		const { value, at } = page()
		select(at("after"), 0, at("after"), 3)
		expect(selectedWithin(value)).toBe(false)
		select(at("before"), 0, at("value"), 0)
		expect(selectedWithin(value)).toBe(false)
		select(at("value"), 1, at("value"), 1)
		expect(selectedWithin(value)).toBe(false)
		expect(selectedWithin(null)).toBe(false)
	})
})

describe("endsSelection", () => {
	afterEach(() => window.getSelection()?.removeAllRanges())

	/** What a click handler on `el` reads for a click with `detail` (0 for Enter or Space on a button). */
	function clickReads(el: HTMLElement, detail: number): boolean {
		let ends = false
		el.addEventListener("click", (e) => (ends = endsSelection(e)), { once: true })
		el.dispatchEvent(new MouseEvent("click", { detail, bubbles: true }))
		return ends
	}

	test("a pointer click that ends a drag inside its target", () => {
		const { value, at } = page()
		select(at("value"), 0, at("value"), 3)
		expect(clickReads(value as HTMLElement, 1)).toBe(true)
	})

	test("a key's click over the same selection, or a pointer click with nothing selected, is a click", () => {
		const { value, at } = page()
		select(at("value"), 0, at("value"), 3)
		expect(clickReads(value as HTMLElement, 0)).toBe(false)
		window.getSelection()?.removeAllRanges()
		expect(clickReads(value as HTMLElement, 1)).toBe(false)
	})
})
