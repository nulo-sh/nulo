import { describe, expect, test, vi } from "vitest"
import { reactive } from "vue"
import { ActivationSupersededError, awaitProfileActivation, BootstrapFailedError, UnlockTimeoutError } from "./unlockWait"

function makeStore(
	over: Partial<{ isLogined: boolean; profile?: { id: string }; bootstrapFailure: { profileId: string; message: string } | null }> = {},
) {
	return reactive({
		isLogined: false,
		profile: undefined as { id: string } | undefined,
		bootstrapFailure: null as { profileId: string; message: string } | null,
		...over,
	})
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe("awaitProfileActivation", () => {
	test("already active for the expected profile: resolves immediately", async () => {
		const store = makeStore({ isLogined: true, profile: { id: "A" } })
		await expect(awaitProfileActivation(store, "A", 1_000)).resolves.toBeUndefined()
	})

	test("pre-existing failure record for the expected profile: rejects immediately with the typed error", async () => {
		const store = makeStore({ bootstrapFailure: { profileId: "A", message: "boom" } })
		await expect(awaitProfileActivation(store, "A", 1_000)).rejects.toBeInstanceOf(BootstrapFailedError)
	})

	test("activation arriving later resolves the wait", async () => {
		const store = makeStore()
		const wait = awaitProfileActivation(store, "A", 5_000)
		store.profile = { id: "A" }
		store.isLogined = true
		await flush()
		await expect(wait).resolves.toBeUndefined()
	})

	test("isLogined WITHOUT the expected identity does not resolve; the matching identity later does", async () => {
		const store = makeStore()
		const wait = awaitProfileActivation(store, "A", 5_000)
		store.profile = { id: "B" }
		store.isLogined = true
		await flush()
		store.profile = { id: "A" }
		await flush()
		await expect(wait).resolves.toBeUndefined()
	})

	test("a failure recorded mid-wait rejects IMMEDIATELY (never burns the bound)", async () => {
		vi.useFakeTimers()
		try {
			const store = makeStore()
			const wait = awaitProfileActivation(store, "A", 30_000)
			const settled = vi.fn()
			wait.catch(settled)
			store.bootstrapFailure = { profileId: "A", message: "rpc down" }
			await vi.advanceTimersByTimeAsync(0)
			expect(settled).toHaveBeenCalledTimes(1)
			expect(settled.mock.calls[0][0]).toBeInstanceOf(BootstrapFailedError)
			expect(settled.mock.calls[0][0].message).toBe("rpc down")
		} finally {
			vi.useRealTimers()
		}
	})

	test("a failure for a DIFFERENT profile does not reject the wait", async () => {
		const store = makeStore()
		const wait = awaitProfileActivation(store, "A", 5_000)
		const settled = vi.fn()
		wait.then(settled, settled)
		store.bootstrapFailure = { profileId: "B", message: "other" }
		await flush()
		expect(settled).not.toHaveBeenCalled()
		store.profile = { id: "A" }
		store.isLogined = true
		await flush()
		await expect(wait).resolves.toBeUndefined()
	})

	test("timeout rejects with the typed UnlockTimeoutError", async () => {
		vi.useFakeTimers()
		try {
			const store = makeStore()
			const wait = awaitProfileActivation(store, "A", 1_000)
			const settled = vi.fn()
			wait.catch(settled)
			await vi.advanceTimersByTimeAsync(1_001)
			expect(settled.mock.calls[0][0]).toBeInstanceOf(UnlockTimeoutError)
		} finally {
			vi.useRealTimers()
		}
	})

	test("activation after settle is inert (watcher torn down; no double-settle throw)", async () => {
		vi.useFakeTimers()
		try {
			const store = makeStore()
			const wait = awaitProfileActivation(store, "A", 1_000)
			wait.catch(() => {})
			await vi.advanceTimersByTimeAsync(1_001)
			store.profile = { id: "A" }
			store.isLogined = true
			await vi.advanceTimersByTimeAsync(0)
			// No unhandled resolve/reject — reaching here without a throw is the assertion.
		} finally {
			vi.useRealTimers()
		}
	})

	test("resolution clears the timer (no late spurious rejection)", async () => {
		vi.useFakeTimers()
		try {
			const store = makeStore()
			const wait = awaitProfileActivation(store, "A", 1_000)
			store.profile = { id: "A" }
			store.isLogined = true
			await vi.advanceTimersByTimeAsync(0)
			await expect(wait).resolves.toBeUndefined()
			await vi.advanceTimersByTimeAsync(2_000) // past the bound — nothing fires
		} finally {
			vi.useRealTimers()
		}
	})

	test("failure settle also tears down: a later activation does not resurrect the promise", async () => {
		const store = makeStore()
		const wait = awaitProfileActivation(store, "A", 5_000)
		const outcomes: unknown[] = []
		wait.then(
			() => outcomes.push("resolved"),
			(e) => outcomes.push(e),
		)
		store.bootstrapFailure = { profileId: "A", message: "boom" }
		await flush()
		store.profile = { id: "A" }
		store.isLogined = true
		await flush()
		expect(outcomes).toHaveLength(1)
		expect(outcomes[0]).toBeInstanceOf(BootstrapFailedError)
	})
})

describe("awaitProfileActivation with a start-only deadline", () => {
	/** Runs `steps` on a fake clock and returns how the wait settled: "pending", "resolved" or the error. */
	async function settleWith(
		opts: Parameters<typeof awaitProfileActivation>[3],
		steps: (store: ReturnType<typeof makeStore>, advance: (ms: number) => Promise<unknown>) => Promise<void>,
		initial: Parameters<typeof makeStore>[0] = {},
	): Promise<unknown> {
		vi.useFakeTimers()
		try {
			const store = makeStore(initial)
			let outcome: unknown = "pending"
			awaitProfileActivation(store, "A", 30_000, opts).then(
				() => {
					outcome = "resolved"
				},
				(e) => {
					outcome = e
				},
			)
			await steps(store, (ms) => vi.advanceTimersByTimeAsync(ms))
			return outcome
		} finally {
			vi.useRealTimers()
		}
	}

	const slowStart = async (store: ReturnType<typeof makeStore>, advance: (ms: number) => Promise<unknown>) => {
		store.profile = { id: "A" }
		await advance(5 * 60_000)
		store.isLogined = true
		await advance(0)
	}

	test("once the expected profile is selected the deadline stops: activation 5 minutes later resolves", async () => {
		expect(await settleWith({ deadlineCovers: "start" }, slowStart)).toBe("resolved")
	})

	test("a profile selected before the wait began arms no deadline", async () => {
		const outcome = await settleWith(
			{ deadlineCovers: "start" },
			async (store, advance) => {
				await advance(5 * 60_000)
				store.isLogined = true
				await advance(0)
			},
			{ profile: { id: "A" } },
		)
		expect(outcome).toBe("resolved")
	})

	test("control: without the option the same schedule rejects at the deadline", async () => {
		expect(await settleWith({}, slowStart)).toBeInstanceOf(UnlockTimeoutError)
	})

	test("another profile selected after the start rejects at once with ActivationSupersededError", async () => {
		const outcome = await settleWith({ deadlineCovers: "start" }, async (store, advance) => {
			store.profile = { id: "A" }
			await advance(0)
			store.profile = { id: "B" }
			await advance(0)
		})
		expect(outcome).toBeInstanceOf(ActivationSupersededError)
	})

	test("control: another profile selected before the start is no supersede; the deadline ends the wait", async () => {
		const outcome = await settleWith({ deadlineCovers: "start" }, async (store, advance) => {
			store.profile = { id: "B" }
			await advance(30_000)
		})
		expect(outcome).toBeInstanceOf(UnlockTimeoutError)
	})
})
