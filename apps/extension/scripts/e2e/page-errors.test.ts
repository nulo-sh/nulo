import { describe, expect, test } from "vitest"
import { pageErrorOf } from "../../tests/e2e/fixtures/page-errors"

describe("pageErrorOf", () => {
	test("keeps an Error as the same object", () => {
		const err = new Error("boom")
		expect(pageErrorOf(err)).toBe(err)
	})

	test.each([undefined, null, "boom", 7])("records the primitive %j as an Error of its string", (payload) => {
		const err = pageErrorOf(payload)
		expect(err).toBeInstanceOf(Error)
		expect(err?.message).toBe(String(payload))
	})

	test("drops the port-close cascade", () => {
		expect(pageErrorOf(new Error("Client disconnected: port closed"))).toBeUndefined()
	})

	test("keeps a primitive that carries the cascade's text", () => {
		expect(pageErrorOf("Client disconnected")?.message).toBe("Client disconnected")
	})
})
