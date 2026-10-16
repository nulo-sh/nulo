/**
 * ServiceCollection.start() phase-execution pins: a mid-phase failure
 * must settle every same-phase sibling before failing, aggregate EVERY
 * rejection, and never start a later phase. (The old reject-fast Promise.all
 * left pending siblings running unobserved; note their rejections were
 * HANDLED even then — Promise.all installs handlers on all inputs — so the
 * defect was the unobserved settle, not an unhandled rejection.)
 */
import { describe, expect, test } from "vitest"
import { ServiceCollection, type IService } from "./index"
import { deferred } from "../utils/deferred"

function svc(name: string, start: (c: ServiceCollection) => Promise<void>, dependencies?: readonly string[]): IService {
	return { name, dependencies, start }
}

describe("ServiceCollection.start — mid-phase failure semantics", () => {
	test("start() stays PENDING until every same-phase sibling settles, then rejects with an AggregateError naming every rejection", async () => {
		const collection = new ServiceCollection()
		const slowB = deferred()
		let bSettled = false
		collection.add(svc("A", async () => Promise.reject(new Error("A broke"))))
		collection.add(
			svc("B", async () => {
				await slowB.promise
				bSettled = true
			}),
		)

		let settled: "pending" | "rejected" = "pending"
		const run = collection.start().catch((e: unknown) => {
			settled = "rejected"
			throw e
		})
		const outcome = expect(run).rejects.toBeInstanceOf(AggregateError)
		// A already rejected; the old reject-fast semantics would reject NOW,
		// while B is still pending. The barrier must hold.
		await new Promise((r) => setTimeout(r, 10))
		expect(settled).toBe("pending")
		slowB.resolve()
		await outcome
		expect(bSettled).toBe(true) // B ran to completion, observed
	})

	test("the aggregate names EVERY failed service, not just the first", async () => {
		const collection = new ServiceCollection()
		collection.add(svc("A", async () => Promise.reject(new Error("A broke"))))
		collection.add(svc("B", async () => Promise.reject(new Error("B broke"))))
		const err = await collection.start().then(
			() => undefined,
			(e: unknown) => e as AggregateError,
		)
		expect(err).toBeInstanceOf(AggregateError)
		expect(err?.message).toContain("A")
		expect(err?.message).toContain("B")
		expect(err?.errors.map((e: Error) => e.message).sort()).toEqual(["A broke", "B broke"])
	})

	test("a failing phase prevents every later phase from starting", async () => {
		const collection = new ServiceCollection()
		let laterStarted = false
		collection.add(svc("A", async () => Promise.reject(new Error("A broke"))))
		collection.add(
			svc("C", async () => {
				laterStarted = true
			}, ["A"]),
		)
		await expect(collection.start()).rejects.toBeInstanceOf(AggregateError)
		await new Promise((r) => setTimeout(r, 10))
		expect(laterStarted).toBe(false)
	})

	test("all-green phases start in dependency order, unchanged", async () => {
		const collection = new ServiceCollection()
		const order: string[] = []
		collection.add(
			svc("A", async () => {
				order.push("A")
			}),
		)
		collection.add(
			svc("C", async () => {
				order.push("C")
			}, ["A"]),
		)
		await collection.start()
		expect(order).toEqual(["A", "C"])
	})

	test("collectionStarted reaches every service after the last phase, and none after a failed phase", async () => {
		const started = (collection: ServiceCollection, names: string[]) => {
			const seen: string[] = []
			for (const name of names) {
				const service = collection.get<IService & { collectionStarted: () => void }>(name)
				service.collectionStarted = () => seen.push(`${name}@${order.join(",")}`)
			}
			return seen
		}
		const order: string[] = []
		const healthy = new ServiceCollection()
		healthy.add(svc("A", async () => void order.push("A")))
		healthy.add(svc("C", async () => void order.push("C"), ["A"]))
		const seen = started(healthy, ["A", "C"])
		await healthy.start()
		expect(seen).toEqual(["A@A,C", "C@A,C"])

		const failing = new ServiceCollection()
		failing.add(svc("A", async () => {}))
		failing.add(svc("C", async () => Promise.reject(new Error("C broke")), ["A"]))
		const none = started(failing, ["A", "C"])
		await expect(failing.start()).rejects.toBeInstanceOf(AggregateError)
		expect(none).toEqual([])
	})
})
