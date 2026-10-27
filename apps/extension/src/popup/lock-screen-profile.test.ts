import { describe, expect, test } from "vitest"
import { lockScreenProfile } from "./lock-screen-profile"

const a = { id: "a" }
const b = { id: "b" }

describe("lockScreenProfile", () => {
	test("the last active profile while it exists, else the only one, else none: never a list position", () => {
		expect(lockScreenProfile([a, b], "b")).toBe(b)
		expect(lockScreenProfile([b, a], "deleted")).toBeUndefined()
		expect(lockScreenProfile([a, b], undefined)).toBeUndefined()
		expect(lockScreenProfile([a], "deleted")).toBe(a)
		expect(lockScreenProfile([], "a")).toBeUndefined()
	})
})
