import { describe, expect, test } from "vitest"
import { lockScreenProfile } from "./lock-screen-profile"

const main = { id: "p3", name: "Main" }
const savings = { id: "p1", name: "savings" }
const work = { id: "p2", name: "Work" }
const retired = { id: "p0", name: "Archive", retired: true }

describe("lockScreenProfile", () => {
	test("the last active profile while it exists, retired or not", () => {
		expect(lockScreenProfile([work, main, savings], "p1")).toBe(savings)
		expect(lockScreenProfile([main, retired], "p0")).toBe(retired)
	})

	test("with none last active, the first by name in the chooser's order, whatever the list order", () => {
		expect(lockScreenProfile([work, savings, main], "deleted")).toBe(main)
		expect(lockScreenProfile([savings, work, main], undefined)).toBe(main)
		expect(lockScreenProfile([work, savings], undefined)).toBe(savings)
	})

	test("names alike under the chooser's order fall to the lower id", () => {
		const twin = { id: "p9", name: "main" }
		expect(lockScreenProfile([twin, main], undefined)).toBe(main)
		expect(lockScreenProfile([main, twin], undefined)).toBe(main)
	})

	test("a retired profile comes after every other, and is picked only when nothing else is left", () => {
		expect(lockScreenProfile([retired, work], undefined)).toBe(work)
		expect(lockScreenProfile([{ ...retired, id: "p8", name: "Zed" }, retired], undefined)).toBe(retired)
		expect(lockScreenProfile([retired], "deleted")).toBe(retired)
	})

	test("the only profile, and no profile", () => {
		expect(lockScreenProfile([work], "deleted")).toBe(work)
		expect(lockScreenProfile([], "p1")).toBeUndefined()
	})

	test("leaves the list it reads in its order", () => {
		const list = [work, savings, main]
		lockScreenProfile(list, undefined)
		expect(list).toEqual([work, savings, main])
	})
})
