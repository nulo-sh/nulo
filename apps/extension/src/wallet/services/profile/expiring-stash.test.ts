import { describe, expect, test } from "vitest"
import { ExpiringStash } from "./expiring-stash"

type Entry = { secret: Uint8Array; capturedAt: number }

const TTL = 1_000
const entryAt = (capturedAt: number, fill: number): Entry => ({ secret: new Uint8Array(4).fill(fill), capturedAt })
const wiped = (entry: Entry) => entry.secret.every((b) => b === 0)

function makeStash() {
	return new ExpiringStash<Entry>(TTL, (entry) => entry.secret.fill(0))
}

describe("ExpiringStash.set", () => {
	test("replacing a live entry wipes the old one and stores the new one", () => {
		const stash = makeStash()
		const old = entryAt(Date.now(), 1)
		const next = entryAt(Date.now(), 2)
		stash.set("p", old)
		expect(stash.set("p", next)).toBe(stash)
		expect(wiped(old)).toBe(true)
		expect(stash.get("p")).toBe(next)
		expect(wiped(next)).toBe(false)
	})

	test("replacing an expired entry no sweep reached wipes it", () => {
		const stash = makeStash()
		const old = entryAt(Date.now() - TTL, 1)
		stash.set("p", old)
		stash.set("p", entryAt(Date.now(), 2))
		expect(wiped(old)).toBe(true)
	})

	test("setting the entry already stored wipes nothing", () => {
		const stash = makeStash()
		const entry = entryAt(Date.now(), 1)
		stash.set("p", entry)
		stash.set("p", entry)
		expect(wiped(entry)).toBe(false)
		expect(stash.get("p")).toBe(entry)
	})

	test("setting a new key wipes no other entry", () => {
		const stash = makeStash()
		const other = entryAt(Date.now(), 1)
		stash.set("a", other)
		stash.set("b", entryAt(Date.now(), 2))
		expect(wiped(other)).toBe(false)
		expect(stash.size).toBe(2)
	})
})
