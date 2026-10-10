import { EventHandler } from "@nulo/wallet-core/utils"
import { type Mock, vi } from "vitest"

/** A promise the test settles by hand. */
export type Held<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void }

export function held<T>(): Held<T> {
	let resolve!: Held<T>["resolve"]
	let reject!: Held<T>["reject"]
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

/** Every later call to `read` waits for the test: `reads[n]` settles the n-th. */
export function holdReads<T>(read: { mockImplementation(impl: () => Promise<T>): unknown }): Held<T>[] {
	const reads: Held<T>[] = []
	read.mockImplementation(() => {
		const next = held<T>()
		reads.push(next)
		return next.promise
	})
	return reads
}

/**
 * A real `EventHandler` for a service-client mock: `invoke` reaches every handler the component
 * registered, and `add`/`remove` stay spies. A bus outlives no test: build it per test, since an
 * unmounted component never removes its handlers.
 */
export function liveBus<T>(): EventHandler<T> & { add: Mock<EventHandler<T>["add"]>; remove: Mock<EventHandler<T>["remove"]> } {
	const bus = new EventHandler<T>()
	return Object.assign(bus, { add: vi.fn(bus.add.bind(bus)), remove: vi.fn(bus.remove.bind(bus)) })
}
