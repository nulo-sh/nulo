import { describe, expect, test } from "vitest"
import { journalAdded, journalDeleted, journalUpdated } from "./journal-mirror"

const row = (id: string, v = 0) => ({ id, v })
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

describe("journalAdded", () => {
	test("at the front, a new row leads and a listed id moves to the front as received", () => {
		const rows = [row("a"), row("b")]
		expect(ids(journalAdded(rows, row("c"), "front"))).toEqual(["c", "a", "b"])
		const moved = journalAdded(rows, row("b", 1), "front")
		expect(moved).toEqual([row("b", 1), row("a")])
	})

	test("at the back, a new row trails and a listed id is replaced where it is", () => {
		const rows = [row("a"), row("b"), row("c")]
		expect(ids(journalAdded(rows, row("d"), "back"))).toEqual(["a", "b", "c", "d"])
		expect(journalAdded(rows, row("b", 1), "back")).toEqual([row("a"), row("b", 1), row("c")])
	})
})

describe("journalUpdated", () => {
	test("a listed row keeps its position at either edge: [A, B] stays [A, B] through an update of B", () => {
		const rows = [row("a"), row("b")]
		expect(journalUpdated(rows, row("b", 1), "front")).toEqual([row("a"), row("b", 1)])
		expect(journalUpdated(rows, row("b", 1), "back")).toEqual([row("a"), row("b", 1)])
	})

	test("an unseen row goes to the edge the list names", () => {
		const rows = [row("a")]
		expect(ids(journalUpdated(rows, row("z"), "front"))).toEqual(["z", "a"])
		expect(ids(journalUpdated(rows, row("z"), "back"))).toEqual(["a", "z"])
	})

	test("with an id listed twice, the first copy is the one replaced", () => {
		expect(journalUpdated([row("a"), row("a")], row("a", 1), "back")).toEqual([row("a", 1), row("a")])
	})
})

describe("journalDeleted", () => {
	test("drops every copy of the id and nothing else", () => {
		expect(journalDeleted([row("a"), row("b"), row("a")], row("a"))).toEqual([row("b")])
		expect(journalDeleted([row("b")], row("a"))).toEqual([row("b")])
	})
})

test("no reducer writes into the array it was given", () => {
	const rows = Object.freeze([row("a"), row("b")])
	journalAdded(rows, row("c"), "front")
	journalAdded(rows, row("b", 1), "back")
	journalUpdated(rows, row("a", 1), "front")
	journalDeleted(rows, row("a"))
	expect(rows).toEqual([row("a"), row("b")])
})
