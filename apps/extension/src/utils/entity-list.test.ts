import { describe, expect, test } from "vitest"
import { withoutId } from "./entity-list"

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
