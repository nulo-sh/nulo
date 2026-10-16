import { type Deferred, deferred, EventHandler } from "@nulo/wallet-core/utils"
import { type Mock, vi } from "vitest"

export { deferred as held, type Deferred as Held }

/** Every later call to `read` waits for the test: `reads[n]` settles the n-th. The implementation
 *  outlives `vi.clearAllMocks`, so the test resets `read` after itself. */
export function holdReads<T>(read: { mockImplementation(impl: () => Promise<T>): unknown }): Deferred<T>[] {
	const reads: Deferred<T>[] = []
	read.mockImplementation(() => {
		const next = deferred<T>()
		reads.push(next)
		return next.promise
	})
	return reads
}

/**
 * A real `EventHandler` for a service-client mock: `invoke` reaches every handler the component
 * registered, and `add`/`remove` stay spies. A handler that throws fails the test instead of being
 * swallowed, so a dropped row cannot be a crash; the throw leaves on a microtask because `invoke`
 * also catches its reporter's. Build a bus per test: an unmounted component never removes its handlers.
 */
export function liveBus<T>(): EventHandler<T> & { add: Mock<EventHandler<T>["add"]>; remove: Mock<EventHandler<T>["remove"]> } {
	const bus = new EventHandler<T>("liveBus", (error) =>
		queueMicrotask(() => {
			throw error
		}),
	)
	return Object.assign(bus, { add: vi.fn(bus.add.bind(bus)), remove: vi.fn(bus.remove.bind(bus)) })
}
