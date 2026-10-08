import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises } from "@vue/test-utils"

const H = vi.hoisted(() => ({
	openPopup: vi.fn(),
	closePopup: vi.fn(),
	app: {} as Record<string, unknown>,
	cache: {} as { confirm: Record<string, unknown> },
}))

vi.mock("@/stores/app.store", () => ({ useAppStore: () => H.app }))
vi.mock("@/stores/cache.store", () => ({ useCacheStore: () => H.cache }))
vi.mock("@/stores/popup.store", () => ({ usePopupStore: () => ({ open: H.openPopup, close: H.closePopup }) }))

import { type LockProfileClient, useLockWallet } from "./useLockWallet"

type Listener = () => void

function fakeProfileClient() {
	const changed = new Set<Listener>()
	const disconnected = new Set<Listener>()
	const getSessionHandle = vi.fn(async (): Promise<string | undefined> => "session-1")
	const lockActiveProfile = vi.fn()
	const client = {
		getSessionHandle,
		lockActiveProfile,
		onActiveProfileChanged: { add: (fn: Listener) => changed.add(fn), remove: (fn: Listener) => changed.delete(fn) },
		onDisconnected: { add: (fn: Listener) => disconnected.add(fn), remove: (fn: Listener) => disconnected.delete(fn) },
	} as unknown as LockProfileClient
	return {
		client,
		getSessionHandle,
		lockActiveProfile,
		listeners: () => changed.size + disconnected.size,
		changeSession: () => {
			for (const fn of [...changed]) fn()
		},
		dropConnection: () => {
			for (const fn of [...disconnected]) fn()
		},
	}
}

function deferred() {
	let resolve: () => void = () => {}
	let reject: (reason: unknown) => void = () => {}
	const promise = new Promise<void>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function readAnswers(running: number, gate?: Promise<void>) {
	return vi.fn(async () => {
		await gate
		H.app.approvedSendsInFlight = running
	})
}

let fake: ReturnType<typeof fakeProfileClient>

beforeEach(() => {
	fake = fakeProfileClient()
	H.openPopup.mockClear()
	H.closePopup.mockClear()
	H.app = { isLogined: true, approvedSendsInFlight: 0, refreshInFlight: readAnswers(0) }
	H.cache = { confirm: {} }
})

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("useLockWallet — the lock decision", () => {
	test("not logged in: no read starts", async () => {
		H.app.isLogined = false
		await useLockWallet(fake.client).lock()
		expect(fake.getSessionHandle).not.toHaveBeenCalled()
		expect(H.app.refreshInFlight).not.toHaveBeenCalled()
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
	})

	test("nothing running after a fresh read: it locks at once with the read's handle", async () => {
		await useLockWallet(fake.client).lock()
		expect(H.app.refreshInFlight).toHaveBeenCalledTimes(1)
		expect(fake.lockActiveProfile).toHaveBeenCalledExactlyOnceWith("session-1")
		expect(H.app.isLogined).toBe(false)
		expect(H.openPopup).not.toHaveBeenCalled()
	})

	test.each([
		{ running: 1, description: "1 transaction is still running. Locking cancels it." },
		{ running: 3, description: "3 transactions are still running. Locking cancels them." },
	])(
		"$running running: it asks with the header's copy, and Lock anyway locks with the read's handle",
		async ({ running, description }) => {
			// The count before the read is 0, so asking proves the decision waited for the read.
			H.app.refreshInFlight = readAnswers(running)
			await useLockWallet(fake.client).lock()

			expect(H.openPopup).toHaveBeenCalledExactlyOnceWith("confirm")
			expect(H.cache.confirm).toMatchObject({
				pre_title: "Running transactions",
				title: "Lock wallet?",
				description,
				confirm_text: "Lock anyway",
				confirm_color: "red",
			})
			expect(fake.lockActiveProfile).not.toHaveBeenCalled()
			expect(H.app.isLogined).toBe(true)

			const lockAnyway = H.cache.confirm.callback as () => void
			lockAnyway()
			expect(fake.lockActiveProfile).toHaveBeenCalledExactlyOnceWith("session-1")
			expect(H.app.isLogined).toBe(false)
		},
	)

	test("a read past 3 s locks without asking, and its late answer changes nothing", async () => {
		vi.useFakeTimers()
		// Events had counted a send before the click; an unanswered read must not ask on that count.
		H.app.approvedSendsInFlight = 1
		const gate = deferred()
		H.app.refreshInFlight = readAnswers(1, gate.promise)
		const done = useLockWallet(fake.client).lock()

		await vi.advanceTimersByTimeAsync(2_999)
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		await done
		expect(fake.lockActiveProfile).toHaveBeenCalledExactlyOnceWith(undefined)
		expect(H.app.isLogined).toBe(false)

		gate.resolve()
		await flushPromises()
		expect(H.openPopup).not.toHaveBeenCalled()
		expect(fake.lockActiveProfile).toHaveBeenCalledTimes(1)
	})

	test("a rejected read locks without asking", async () => {
		H.app.approvedSendsInFlight = 2
		H.app.refreshInFlight = vi.fn(async () => {
			throw new Error("journal unavailable")
		})
		await useLockWallet(fake.client).lock()
		expect(fake.lockActiveProfile).toHaveBeenCalledExactlyOnceWith(undefined)
		expect(H.app.isLogined).toBe(false)
		expect(H.openPopup).not.toHaveBeenCalled()
	})

	test("a session change during the read abandons: no second read, no dialog, no lock", async () => {
		H.app.refreshInFlight = vi.fn(async () => fake.changeSession())
		await useLockWallet(fake.client).lock()
		expect(H.app.refreshInFlight).toHaveBeenCalledTimes(1)
		expect(H.openPopup).not.toHaveBeenCalled()
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
		expect(H.app.isLogined).toBe(true)
	})

	test.each(["changeSession", "dropConnection"] as const)("%s closes this instance's open confirm", async (event) => {
		H.app.refreshInFlight = readAnswers(1)
		await useLockWallet(fake.client).lock()
		expect(H.openPopup).toHaveBeenCalledWith("confirm")

		fake[event]()
		expect(H.closePopup).toHaveBeenCalledExactlyOnceWith("confirm")
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
	})

	test("a confirm someone else opened stays open on a session change and on dispose()", async () => {
		H.app.refreshInFlight = readAnswers(1)
		const { lock, dispose } = useLockWallet(fake.client)
		await lock()
		expect(H.openPopup).toHaveBeenCalledWith("confirm")

		// ConfirmPopup resets the slot on close; another page then fills it with its own confirm.
		H.cache.confirm = { title: "Delete contact?", callback: vi.fn() }
		fake.changeSession()
		dispose()
		expect(H.closePopup).not.toHaveBeenCalled()
	})

	test("lockActiveProfile rejects: lock() resolves, the popup stays marked locked, and nothing retries", async () => {
		const refused = Promise.reject(new Error("Lock did not persist"))
		refused.catch(() => {})
		fake.lockActiveProfile.mockReturnValue(refused)

		const { lock } = useLockWallet(fake.client)
		await expect(lock()).resolves.toBeUndefined()
		await flushPromises()
		expect(H.app.isLogined).toBe(false)

		await lock()
		await flushPromises()
		expect(fake.getSessionHandle).toHaveBeenCalledTimes(1)
		expect(fake.lockActiveProfile).toHaveBeenCalledTimes(1)
	})
})

describe("useLockWallet — dispose()", () => {
	test("during a read with nothing running: it still locks when the read answers", async () => {
		const gate = deferred()
		H.app.refreshInFlight = readAnswers(0, gate.promise)
		const { lock, dispose } = useLockWallet(fake.client)
		const done = lock()
		dispose()

		gate.resolve()
		await done
		expect(fake.lockActiveProfile).toHaveBeenCalledExactlyOnceWith("session-1")
		expect(H.app.isLogined).toBe(false)
		expect(fake.listeners()).toBe(0)
	})

	test("during a read with sends running: no confirm opens, nothing locks", async () => {
		const gate = deferred()
		H.app.refreshInFlight = readAnswers(2, gate.promise)
		const { lock, dispose } = useLockWallet(fake.client)
		const done = lock()
		dispose()

		gate.resolve()
		await done
		expect(H.openPopup).not.toHaveBeenCalled()
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
		expect(H.app.isLogined).toBe(true)
		expect(fake.listeners()).toBe(0)
	})

	test("removes both listeners and closes its own confirm", async () => {
		H.app.refreshInFlight = readAnswers(1)
		const { lock, dispose } = useLockWallet(fake.client)
		await lock()
		expect(fake.listeners()).toBe(2)

		dispose()
		expect(fake.listeners()).toBe(0)
		expect(H.closePopup).toHaveBeenCalledExactlyOnceWith("confirm")
	})

	test("during a read, then a session change before it settles: nothing locks, and the listeners go once the decision finishes", async () => {
		const gate = deferred()
		H.app.refreshInFlight = readAnswers(0, gate.promise)
		const { lock, dispose } = useLockWallet(fake.client)
		const done = lock()
		dispose()
		expect(fake.listeners()).toBe(2)

		fake.changeSession()
		expect(fake.listeners()).toBe(2)
		gate.resolve()
		await done
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
		expect(H.app.isLogined).toBe(true)
		expect(fake.listeners()).toBe(0)
	})

	test.each([
		{ disposeFirst: false, listenersAfter: 2 },
		{ disposeFirst: true, listenersAfter: 0 },
	])(
		"a session change between the read's settle and the decision's resume abandons (disposed: $disposeFirst)",
		async ({ disposeFirst, listenersAfter }) => {
			const gate = deferred()
			H.app.refreshInFlight = readAnswers(0, gate.promise)
			const { lock, dispose } = useLockWallet(fake.client)
			const done = lock()
			if (disposeFirst) dispose()

			// The read clears its budget timer as it settles. A microtask queued there runs after that
			// settle completes and before the decision, which awaits the settled read, resumes.
			const realClearTimeout = globalThis.clearTimeout
			let changed = false
			vi.spyOn(globalThis, "clearTimeout").mockImplementationOnce((id) => {
				realClearTimeout(id)
				queueMicrotask(() => {
					fake.changeSession()
					changed = true
				})
			})
			gate.resolve()
			await done

			expect(changed).toBe(true)
			expect(fake.lockActiveProfile).not.toHaveBeenCalled()
			expect(H.app.isLogined).toBe(true)
			expect(fake.listeners()).toBe(listenersAfter)
		},
	)

	test("two overlapping lock() calls with sends running, then dispose(): the listeners stay until the second decision finishes", async () => {
		const first = deferred()
		const second = deferred()
		H.app.refreshInFlight = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		H.app.approvedSendsInFlight = 1
		const { lock, dispose } = useLockWallet(fake.client)
		const firstDone = lock()
		const secondDone = lock()
		dispose()

		first.resolve()
		await firstDone
		expect(H.openPopup).not.toHaveBeenCalled()
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
		expect(fake.listeners()).toBe(2)

		H.app.approvedSendsInFlight = 0
		fake.changeSession()
		expect(fake.listeners()).toBe(2)
		second.resolve()
		await secondDone
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
		expect(H.app.isLogined).toBe(true)
		expect(fake.listeners()).toBe(0)
	})

	test("a second dispose() does nothing, and lock() after dispose() starts no read", async () => {
		H.app.refreshInFlight = readAnswers(1)
		const { lock, dispose } = useLockWallet(fake.client)
		await lock()
		dispose()
		dispose()
		expect(H.closePopup).toHaveBeenCalledTimes(1)
		expect(fake.listeners()).toBe(0)

		await lock()
		expect(fake.getSessionHandle).toHaveBeenCalledTimes(1)
		expect(H.app.refreshInFlight).toHaveBeenCalledTimes(1)
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
	})

	test("two instances on one client: each closes only its own confirm, and disposing one leaves the other working", async () => {
		H.app.refreshInFlight = readAnswers(1)
		const a = useLockWallet(fake.client)
		const b = useLockWallet(fake.client)
		await a.lock()
		await b.lock()
		expect(H.openPopup).toHaveBeenCalledTimes(2)

		a.dispose()
		expect(H.closePopup).not.toHaveBeenCalled()
		expect(fake.listeners()).toBe(2)

		fake.changeSession()
		expect(H.closePopup).toHaveBeenCalledExactlyOnceWith("confirm")

		H.app.refreshInFlight = readAnswers(0)
		await b.lock()
		expect(fake.lockActiveProfile).toHaveBeenCalledExactlyOnceWith("session-1")
	})

	test.each([false, true])("with fake timers, no timer is left after the read settles (disposed: %s)", async (disposeFirst) => {
		vi.useFakeTimers()
		const gate = deferred()
		H.app.refreshInFlight = readAnswers(0, gate.promise)
		const { lock, dispose } = useLockWallet(fake.client)
		const done = lock()
		if (disposeFirst) dispose()
		expect(vi.getTimerCount()).toBe(1)

		gate.resolve()
		await done
		expect(fake.lockActiveProfile).toHaveBeenCalledOnce()
		expect(vi.getTimerCount()).toBe(0)
	})
})
