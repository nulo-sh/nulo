import { afterEach, describe, expect, test } from "vitest"
import { selectedWithin } from "./selection"

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
