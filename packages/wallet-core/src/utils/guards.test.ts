import { describe, expect, test } from "vitest"
import { isObjectLike, isPlainObject, isRecord } from "./guards"

class Box {
	value = 1
}

describe("isRecord, isObjectLike and isPlainObject", () => {
	test.each<[string, unknown, boolean, boolean, boolean]>([
		["a plain object", { a: 1 }, true, true, true],
		["an empty object", {}, true, true, true],
		["a null-prototype object", Object.create(null), true, true, true],
		["a class instance", new Box(), true, true, false],
		["a boxed number", Object(1), true, true, false],
		["a boxed string", new String(""), true, true, false],
		["a date", new Date(0), true, true, false],
		["a map", new Map(), true, true, false],
		["an object inheriting from a plain one", Object.create({ a: 1 }), true, true, false],
		["an empty array", [], false, true, false],
		["an array carrying fields", Object.assign([], { type: "accounts" }), false, true, false],
		["null", null, false, false, false],
		["undefined", undefined, false, false, false],
		["a function", () => ({}), false, false, false],
		["a number", 1, false, false, false],
		["zero", 0, false, false, false],
		["NaN", Number.NaN, false, false, false],
		["a string", "{}", false, false, false],
		["the empty string", "", false, false, false],
		["a boolean", true, false, false, false],
		["false", false, false, false, false],
		["a bigint", 1n, false, false, false],
		["a zero bigint", 0n, false, false, false],
		["a symbol", Symbol("x"), false, false, false],
	])("%s: isRecord %s, isObjectLike %s, isPlainObject %s", (_label, value, record, objectLike, plain) => {
		expect(isRecord(value)).toBe(record)
		expect(isObjectLike(value)).toBe(objectLike)
		expect(isPlainObject(value)).toBe(plain)
		// Each inline form a site replaced has exactly its helper's set.
		expect(typeof value === "object" && value !== null).toBe(objectLike)
		expect(typeof value !== "object" || value === null).toBe(!objectLike)
		expect(!value || typeof value !== "object").toBe(!objectLike)
		expect(typeof value === "object" && value !== null && !Array.isArray(value)).toBe(record)
		expect(typeof value !== "object" || value === null || Array.isArray(value)).toBe(!record)
		expect(!value || typeof value !== "object" || Array.isArray(value)).toBe(!record)
		expect(typeof value === "object" && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value))).toBe(plain)
		// The prototype test alone, as a site runs it on a value already known to be a non-null object.
		const foreignPrototype = objectLike && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null
		expect(foreignPrototype).toBe(objectLike && !plain)
	})
})
