import { describe, expect, test } from "vitest"
import { ref } from "vue"
import { contactListReducers, withoutId } from "./entity-list"

type Row = { id: string; n: number }
const rows = (...spec: [string, number][]): Row[] => spec.map(([id, n]) => ({ id, n }))

describe("withoutId", () => {
	test.each([
		["drops the row with the id", rows(["a", 1], ["b", 2]), { id: "a" }, rows(["b", 2])],
		["drops every duplicate", rows(["a", 1], ["b", 2], ["a", 3]), { id: "a" }, rows(["b", 2])],
		["keeps every row for an unlisted id", rows(["a", 1]), { id: "z" }, rows(["a", 1])],
	])("%s, into a new array", (_name, list, item, expected) => {
		const copy = [...list]
		const result = withoutId(list, item)
		expect(result).not.toBe(list)
		expect(result).toEqual(expected)
		expect(list).toEqual(copy)
	})
})

describe("contactListReducers", () => {
	const listed = () => {
		const list = ref(rows(["a", 1], ["b", 2], ["a", 3]))
		return { list, before: list.value, on: contactListReducers(list) }
	}

	test("an add appends in place, even for a listed id", () => {
		const { list, before, on } = listed()
		on.onAdded({ id: "a", n: 4 })
		expect(list.value).toBe(before)
		expect(list.value).toEqual(rows(["a", 1], ["b", 2], ["a", 3], ["a", 4]))
	})

	test("an update replaces the first row with its id in place, or appends an unlisted one", () => {
		const { list, before, on } = listed()
		on.onUpdated({ id: "a", n: 5 })
		on.onUpdated({ id: "z", n: 6 })
		expect(list.value).toBe(before)
		expect(list.value).toEqual(rows(["a", 5], ["b", 2], ["a", 3], ["z", 6]))
	})

	test("a delete swaps in a new array without any row of its id", () => {
		const { list, before, on } = listed()
		on.onDeleted({ id: "a" })
		expect(list.value).not.toBe(before)
		expect(list.value).toEqual(rows(["b", 2]))
		expect(before).toEqual(rows(["a", 1], ["b", 2], ["a", 3]))
	})
})
