import { deferred } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import { awaitedBus } from "../../tests/helpers/held-read"

describe("awaitedBus", () => {
	test("dispatch settles only after an async handler settles; invoke alone does not wait", async () => {
		const bus = awaitedBus<number>()
		const gate = deferred()
		const seen: number[] = []
		bus.add(async (n) => {
			await gate.promise
			seen.push(n)
		})

		bus.invoke(1)
		expect(seen).toEqual([])
		const dispatched = bus.dispatch(2)
		gate.resolve()
		await dispatched
		expect(seen).toEqual([1, 2])
	})

	test("a synchronous throw rejects dispatch, and its sibling still runs", async () => {
		const bus = awaitedBus<number>()
		const sibling = vi.fn()
		bus.add(() => {
			throw new Error("boom")
		})
		bus.add(sibling)

		await expect(bus.dispatch(1)).rejects.toThrow(/^boom$/)
		expect(sibling).toHaveBeenCalledExactlyOnceWith(1)
	})

	test("an async rejection rejects dispatch once every handler has settled", async () => {
		const bus = awaitedBus<number>()
		const slow = deferred()
		let slowDone = false
		bus.add(async () => {
			throw new Error("late boom")
		})
		bus.add(async () => {
			await slow.promise
			slowDone = true
		})

		const dispatched = bus.dispatch(1)
		const outcome = dispatched.catch((error: unknown) => ({ error, slowDone }))
		slow.resolve()
		expect(await outcome).toEqual({ error: new Error("late boom"), slowDone: true })
	})

	test("a callback added twice runs once, and removing it stops it", async () => {
		const bus = awaitedBus<number>()
		const handler = vi.fn()
		bus.add(handler)
		bus.add(handler)

		await bus.dispatch(1)
		expect(handler).toHaveBeenCalledExactlyOnceWith(1)

		bus.remove(handler)
		await bus.dispatch(2)
		expect(handler).toHaveBeenCalledTimes(1)
	})

	test("a handler that dispatches re-entrantly leaves the outer dispatch collecting its later siblings", async () => {
		const bus = awaitedBus<string>()
		let inner: Promise<void> | undefined
		bus.add(async (key) => {
			if (key === "outer") inner = bus.dispatch("inner")
		})
		bus.add(async (key) => {
			if (key === "outer") throw new Error("outer sibling")
		})

		await expect(bus.dispatch("outer")).rejects.toThrow("outer sibling")
		await expect(inner).resolves.toBeUndefined()
	})

	test("two overlapping dispatches each settle with their own handlers' work", async () => {
		const bus = awaitedBus<string>()
		const gates = { a: deferred(), b: deferred() }
		const done: string[] = []
		bus.add(async (key) => {
			await gates[key as "a" | "b"].promise
			done.push(key)
		})

		const a = bus.dispatch("a")
		const b = bus.dispatch("b")
		gates.b.resolve()
		await b
		expect(done).toEqual(["b"])

		gates.a.resolve()
		await a
		expect(done).toEqual(["b", "a"])
	})
})
