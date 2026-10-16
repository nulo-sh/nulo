import { deferred } from "@nulo/wallet-core/utils"
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

import { createContactImportGuard, IMPORT_LOCK_HOLD_MS } from "@/stores/contact-import-guard"
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

function readAnswers(running: number, gate?: Promise<void>) {
	return vi.fn(async () => {
		await gate
		H.app.approvedSendsInFlight = running
	})
}

let fake: ReturnType<typeof fakeProfileClient>
let guard: ReturnType<typeof createContactImportGuard>

beforeEach(() => {
	fake = fakeProfileClient()
	guard = createContactImportGuard()
	H.openPopup.mockClear()
	H.closePopup.mockClear()
	H.app = { isLogined: true, approvedSendsInFlight: 0, refreshInFlight: readAnswers(0) }
	// What the app store exposes: the guard's live set, and its hold unwrapped.
	Object.defineProperties(H.app, {
		contactImports: { get: () => guard.contactImports.value },
		lockHeldByImport: { get: () => guard.lockHeldByImport.value },
	})
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

describe("useLockWallet — a running contacts import", () => {
	/** Imports that began together and are past their two-minute hold, so Lock asks before stopping them. */
	function importsPastHold(count: number) {
		vi.useFakeTimers()
		const ends = Array.from({ length: count }, () => guard.beginContactImport())
		vi.advanceTimersByTime(IMPORT_LOCK_HOLD_MS)
		return ends
	}
	const lockAnyway = () => (H.cache.confirm.callback as () => void)()
	const ONE_IMPORT = "A contacts import is still running. Locking stops it."

	test("while it holds Lock, lock() starts no read and opens nothing", async () => {
		guard.beginContactImport()
		await useLockWallet(fake.client).lock()
		expect(fake.getSessionHandle).not.toHaveBeenCalled()
		expect(H.openPopup).not.toHaveBeenCalled()
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
		expect(H.app.isLogined).toBe(true)
	})

	test("one that begins during the read makes the direct path refuse", async () => {
		H.app.refreshInFlight = vi.fn(async () => {
			guard.beginContactImport()
		})
		await useLockWallet(fake.client).lock()
		expect(H.openPopup).not.toHaveBeenCalled()
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
		expect(H.app.isLogined).toBe(true)
	})

	test.each([
		{ imports: 1, sends: 0, pre_title: "Contacts import", description: ONE_IMPORT },
		{ imports: 2, sends: 0, pre_title: "Contacts import", description: "2 contacts imports are still running. Locking stops them." },
		{
			imports: 1,
			sends: 1,
			pre_title: "Running transactions",
			description: `1 transaction is still running. Locking cancels it. ${ONE_IMPORT}`,
		},
	])(
		"past its hold, $imports import(s) and $sends send(s): it asks with the import's wording, and Lock anyway locks",
		async ({ imports, sends, pre_title, description }) => {
			importsPastHold(imports)
			H.app.refreshInFlight = readAnswers(sends)
			await useLockWallet(fake.client).lock()

			expect(H.openPopup).toHaveBeenCalledExactlyOnceWith("confirm")
			expect(H.cache.confirm).toMatchObject({
				pre_title,
				title: "Lock wallet?",
				description,
				confirm_text: "Lock anyway",
				confirm_color: "red",
			})
			expect(H.cache.confirm).not.toHaveProperty("confirm_variant")
			lockAnyway()
			expect(fake.lockActiveProfile).toHaveBeenCalledExactlyOnceWith("session-1")
		},
	)

	test.each(["rejects", "times out"] as const)("a read that %s still asks with the import's wording", async (failure) => {
		importsPastHold(1)
		H.app.refreshInFlight =
			failure === "rejects"
				? vi.fn(async () => {
						throw new Error("journal unavailable")
					})
				: readAnswers(0, deferred().promise)
		const done = useLockWallet(fake.client).lock()
		await vi.advanceTimersByTimeAsync(3_000)
		await done

		expect(H.cache.confirm).toMatchObject({ pre_title: "Contacts import", description: ONE_IMPORT })
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
		expect(H.app.isLogined).toBe(true)
	})

	test.each(["still holds Lock", "is past its hold"] as const)(
		"a confirm opened for sends alone abandons when an import began while it was open and %s",
		async (state) => {
			vi.useFakeTimers()
			H.app.refreshInFlight = readAnswers(1)
			await useLockWallet(fake.client).lock()
			expect(H.cache.confirm.description).toBe("1 transaction is still running. Locking cancels it.")

			guard.beginContactImport()
			if (state === "is past its hold") vi.advanceTimersByTime(IMPORT_LOCK_HOLD_MS)
			lockAnyway()
			expect(fake.lockActiveProfile).not.toHaveBeenCalled()
			expect(H.app.isLogined).toBe(true)
		},
	)

	test("a confirm that named one import abandons when another began and the first ended, one running before and after", async () => {
		const [endFirst] = importsPastHold(1)
		await useLockWallet(fake.client).lock()
		expect(H.cache.confirm.description).toBe(ONE_IMPORT)

		guard.beginContactImport()
		endFirst()
		expect(guard.contactImports.value.size).toBe(1)
		lockAnyway()
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()
		expect(H.app.isLogined).toBe(true)
	})

	test("control: with the imports it named still running, Lock anyway locks; pressing Lock again after an abandon asks afresh", async () => {
		const [endFirst] = importsPastHold(1)
		const { lock } = useLockWallet(fake.client)
		await lock()
		guard.beginContactImport()
		endFirst()
		lockAnyway()
		expect(fake.lockActiveProfile).not.toHaveBeenCalled()

		await lock()
		lockAnyway()
		expect(fake.lockActiveProfile).toHaveBeenCalledExactlyOnceWith("session-1")
		expect(H.app.isLogined).toBe(false)
	})
})
