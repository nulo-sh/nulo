import { describe, expect, test, vi } from "vitest"
import { EventHandler } from "./event-handler"

describe("EventHandler", () => {
	test("invoke delivers the payload to every subscriber", () => {
		const eh = new EventHandler<number>()
		const seen: number[] = []
		eh.add((n) => seen.push(n))
		eh.add((n) => seen.push(n * 10))
		eh.invoke(2)
		expect(seen).toEqual([2, 20])
	})

	test("add is idempotent; remove detaches", () => {
		const eh = new EventHandler<void>()
		const cb = vi.fn()
		eh.add(cb)
		eh.add(cb) // duplicate — ignored
		eh.invoke()
		expect(cb).toHaveBeenCalledTimes(1)
		eh.remove(cb)
		eh.invoke()
		expect(cb).toHaveBeenCalledTimes(1) // no further calls
	})

	test("a throwing subscriber does NOT stop its siblings", () => {
		const eh = new EventHandler<void>()
		const after = vi.fn()
		eh.add(() => {
			throw new Error("boom")
		})
		eh.add(after)
		expect(() => eh.invoke()).not.toThrow()
		expect(after).toHaveBeenCalledTimes(1)
	})

	test("with an onError reporter, a throwing subscriber's error is reported (not swallowed silently)", () => {
		const onError = vi.fn()
		const eh = new EventHandler<void>("onThing", onError)
		const err = new Error("boom")
		eh.add(() => {
			throw err
		})
		eh.invoke()
		expect(onError).toHaveBeenCalledWith(err, "onThing")
	})

	test("without a reporter, a throwing subscriber is silently isolated (back-compat)", () => {
		const eh = new EventHandler<void>()
		const after = vi.fn()
		eh.add(() => {
			throw new Error("boom")
		})
		eh.add(after)
		expect(() => eh.invoke()).not.toThrow()
		expect(after).toHaveBeenCalledTimes(1)
	})

	test("a subscriber that removes itself mid-dispatch does not skip the next one", () => {
		const eh = new EventHandler<number>()
		const seen: string[] = []
		const once = (n: number) => {
			seen.push(`once:${n}`)
			eh.remove(once)
		}
		eh.add(once)
		eh.add((n) => seen.push(`next:${n}`))
		eh.invoke(1)
		eh.invoke(2)
		expect(seen).toEqual(["once:1", "next:1", "next:2"])
	})

	test("a subscriber an earlier sibling removes mid-dispatch is not called", () => {
		const eh = new EventHandler<void>()
		const removed = vi.fn()
		const after = vi.fn()
		eh.add(() => eh.remove(removed))
		eh.add(removed)
		eh.add(after)
		eh.invoke()
		expect(removed).not.toHaveBeenCalled()
		expect(after).toHaveBeenCalledTimes(1)
	})

	test("a subscriber added mid-dispatch receives the next event, not the one in flight", () => {
		const eh = new EventHandler<number>()
		const late = vi.fn()
		eh.add(() => eh.add(late))
		eh.invoke(1)
		expect(late).not.toHaveBeenCalled()
		eh.invoke(2)
		expect(late).toHaveBeenCalledExactlyOnceWith(2)
	})

	test("a THROWING reporter must not break dispatch", () => {
		const onError = () => {
			throw new Error("reporter down")
		}
		const eh = new EventHandler<void>("onThing", onError)
		const after = vi.fn()
		eh.add(() => {
			throw new Error("boom")
		})
		eh.add(after)
		expect(() => eh.invoke()).not.toThrow()
		expect(after).toHaveBeenCalledTimes(1)
	})
})
