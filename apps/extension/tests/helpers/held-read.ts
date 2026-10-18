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

type Subscriber<T> = (payload: T) => void

/**
 * A real `EventHandler` whose `dispatch` settles once every handler that call reached has settled,
 * rejecting with the first failure, sync or async. `invoke` drops a handler's promise, so awaiting it
 * waits for nothing; `dispatch` runs the same `invoke`, so isolation and ordering stay production's.
 * Dispatches started before either is awaited interleave as un-awaited `invoke`s do.
 */
class AwaitedBus<T> extends EventHandler<T> {
	readonly #wrappers = new Map<Subscriber<T>, Subscriber<T>>()
	#collecting: unknown[] | undefined

	public constructor() {
		super("awaitedBus")
	}

	public override add(callback: Subscriber<T>) {
		let wrapper = this.#wrappers.get(callback)
		if (!wrapper) {
			wrapper = (payload) => this.#run(callback, payload)
			this.#wrappers.set(callback, wrapper)
		}
		super.add(wrapper)
	}

	public override remove(callback: Subscriber<T>) {
		const wrapper = this.#wrappers.get(callback)
		if (!wrapper) return
		this.#wrappers.delete(callback)
		super.remove(wrapper)
	}

	public async dispatch(payload: T): Promise<void> {
		// `invoke` runs every handler synchronously, so the collector belongs to this call alone; the
		// outer one is restored for a handler that dispatches re-entrantly.
		const outer = this.#collecting
		const collected: unknown[] = []
		this.#collecting = collected
		try {
			this.invoke(payload)
		} finally {
			this.#collecting = outer
		}
		const failed = (await Promise.allSettled(collected)).find((r) => r.status === "rejected")
		if (failed) throw failed.reason
	}

	#run(callback: Subscriber<T>, payload: T) {
		let result: unknown
		try {
			result = callback(payload)
		} catch (error) {
			this.#collecting?.push(Promise.reject(error))
			throw error
		}
		this.#collecting?.push(result)
	}
}

/** A service's peer event a test fires with `await bus.dispatch(payload)`; see {@link AwaitedBus}. */
export function awaitedBus<T>(): AwaitedBus<T> {
	return new AwaitedBus<T>()
}
