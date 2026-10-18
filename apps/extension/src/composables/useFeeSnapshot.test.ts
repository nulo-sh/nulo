import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { effectScope, reactive, ref } from "vue"
import { ImportedAccountUnusableError } from "@nulo/extension-messaging/errors"

const mocks = vi.hoisted(() => ({ getGasBalances: vi.fn(), getFpcs: vi.fn() }))

vi.mock("@/wallet/services/execution/client", () => ({
	ExecutionServiceClient: vi.fn().mockImplementation(function () {
		return { connect: vi.fn(), disconnect: vi.fn(), getGasBalances: mocks.getGasBalances }
	}),
}))
vi.mock("@/wallet/services/fpc/client", () => ({
	FpcServiceClient: vi.fn().mockImplementation(function () {
		return { connect: vi.fn(), disconnect: vi.fn(), getFpcs: mocks.getFpcs }
	}),
}))
vi.mock("@/wallet/services/transaction/client", () => ({
	TransactionServiceClient: vi.fn().mockImplementation(function () {
		return {
			connect: vi.fn(),
			disconnect: vi.fn(),
			onTransactionAdded: { add: vi.fn(), remove: vi.fn() },
			onTransactionUpdated: { add: vi.fn(), remove: vi.fn() },
		}
	}),
}))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ profile: undefined }) }))

import { INIT_RETRY_BACKOFF_MS, useBalancesStore } from "@/stores/balances.store"
import type { FeeScope } from "@/popup/components/modules/send/fee-helpers"
import { type SnapshotSelection, useFeeSnapshot, watchFeeSnapshot } from "./useFeeSnapshot"

const GAS = { publicFeeJuice: "5", privateFeeJuice: null }
const FPCS = [{ id: "s1", type: 1, name: "Sponsored", isProtocol: true }]

function setup(over: Partial<SnapshotSelection<string>> = {}) {
	const store = useBalancesStore()
	const released = vi.fn()
	const spy = {
		entry: store.entry,
		ensure: vi.fn(store.ensure),
		subscribe: vi.fn((...args: Parameters<typeof store.subscribe>) => {
			const lease = store.subscribe(...args)
			return {
				release: () => {
					released()
					lease.release()
				},
			}
		}),
	}
	const props = reactive({ profile: { id: "p1" }, network: { id: "n1", chainId: 1 }, account: { address: "0xa" } })
	const accountUnusable = ref(false)
	const selection = {
		forceRefresh: vi.fn(() => false),
		load: vi.fn(async (_: FeeScope, isCurrent: () => boolean) => (isCurrent() ? "loaded" : null)),
		reload: vi.fn(async (_: FeeScope) => "reloaded"),
		reconcile: vi.fn((_: string, __: FeeScope) => {}),
		...over,
	}
	const scope = effectScope()
	const snapshot = scope.run(() => {
		const s = useFeeSnapshot(props, { store: spy, selection: () => selection, accountUnusable })
		watchFeeSnapshot(s)
		return s
	})
	if (!snapshot) throw new Error("no scope")
	return { snapshot, props, selection, spy, released, accountUnusable, scope }
}

beforeEach(() => {
	setActivePinia(createPinia())
	mocks.getGasBalances.mockReset().mockResolvedValue(GAS)
	mocks.getFpcs.mockReset().mockResolvedValue(FPCS)
})

afterEach(() => {
	vi.useRealTimers()
})

describe("useFeeSnapshot", () => {
	test("the commit reconciles after the refs are written and before the gate opens", async () => {
		const seen: unknown[] = []
		const t = setup({
			reconcile: (load, scope) => {
				seen.push([
					load,
					scope.accountAddress,
					t.snapshot.gasBalances.value,
					t.snapshot.registeredFpcs.value.length,
					t.snapshot.isInitComplete.value,
				])
			},
		})
		await t.snapshot.run()
		expect(seen).toEqual([["loaded", "0xa", GAS, 1, false]])
		expect(t.snapshot.isInitComplete.value).toBe(true)
		expect(t.snapshot.snapshotCommitted.value).toBe(true)
		expect(t.snapshot.failure.value).toBeNull()
		t.scope.stop()
	})

	test("a load that comes back null ends the run with no lease and no read", async () => {
		const t = setup({ load: async () => null })
		await t.snapshot.run()
		expect(t.spy.subscribe).not.toHaveBeenCalled()
		expect(t.spy.ensure).not.toHaveBeenCalled()
		expect(t.selection.reconcile).not.toHaveBeenCalled()
		expect(t.snapshot.snapshotPending.value).toBe(false)
		t.scope.stop()
	})

	test("an identity change during the selection read discards the run; the next run commits", async () => {
		let release!: () => void
		const held = new Promise<void>((r) => {
			release = r
		})
		let reads = 0
		const t = setup({
			load: async (_, isCurrent) => {
				if (reads++ === 0) await held
				return isCurrent() ? "loaded" : null
			},
		})
		const first = t.snapshot.run()
		expect(t.snapshot.snapshotPending.value).toBe(true)
		t.props.account = { address: "0xb" }
		expect(t.snapshot.invalidate()).toBe(true)
		release()
		await first
		expect(t.spy.subscribe).not.toHaveBeenCalled()
		expect(t.selection.reconcile).not.toHaveBeenCalled()

		await t.snapshot.run()
		expect(t.selection.reconcile).toHaveBeenCalledWith("loaded", expect.objectContaining({ accountAddress: "0xb" }))
		t.scope.stop()
	})

	test("a degraded entry opens the gate with the degraded failure; a throw keeps it closed", async () => {
		mocks.getGasBalances.mockRejectedValue(new Error("boom"))
		const degraded = setup()
		await degraded.snapshot.run()
		expect(degraded.snapshot.isInitComplete.value).toBe(true)
		expect(degraded.snapshot.gasBalances.value).toBeUndefined()
		expect(degraded.snapshot.failure.value).toBe("degraded")
		degraded.snapshot.dispose()
		degraded.scope.stop()

		setActivePinia(createPinia())
		const thrown = setup({
			load: async () => {
				throw new Error("storage refused")
			},
		})
		await thrown.snapshot.run()
		expect(thrown.snapshot.isInitComplete.value).toBe(false)
		expect(thrown.snapshot.failure.value).toBe("init")
		thrown.scope.stop()
	})

	test("invalidate is true only when the live identity is not the committed one", async () => {
		const t = setup()
		await t.snapshot.run()
		expect(t.snapshot.invalidate()).toBe(false)
		expect(t.snapshot.isInitComplete.value).toBe(true)
		t.props.network = { id: "n1", chainId: 2 }
		expect(t.snapshot.invalidate()).toBe(true)
		expect(t.snapshot.isInitComplete.value).toBe(false)
		t.scope.stop()
	})

	test("a store retry that recovers a degraded commit reloads, then commits", async () => {
		vi.useFakeTimers()
		mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
		const t = setup()
		await t.snapshot.run()
		expect(t.snapshot.failure.value).toBe("degraded")
		expect(t.selection.reload).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
		expect(t.selection.reload).toHaveBeenCalledTimes(1)
		expect(t.selection.reconcile).toHaveBeenLastCalledWith("reloaded", expect.objectContaining({ accountAddress: "0xa" }))
		expect(t.snapshot.failure.value).toBeNull()
		expect(t.snapshot.gasBalances.value).toEqual(GAS)
		t.snapshot.dispose()
		t.scope.stop()
	})

	test("an unusable imported key reaches the page from the commit and from a later retry", async () => {
		mocks.getGasBalances.mockRejectedValue(ImportedAccountUnusableError.because("signing key missing"))
		const committed = setup()
		await committed.snapshot.run()
		expect(committed.accountUnusable.value).toBe(true)
		committed.snapshot.dispose()
		committed.scope.stop()

		vi.useFakeTimers()
		setActivePinia(createPinia())
		mocks.getGasBalances.mockReset().mockRejectedValueOnce(new Error("boom"))
		mocks.getGasBalances.mockRejectedValue(ImportedAccountUnusableError.because("signing key missing"))
		const retried = setup()
		await retried.snapshot.run()
		expect(retried.accountUnusable.value).toBe(false)
		await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
		expect(retried.accountUnusable.value).toBe(true)
		expect(retried.selection.reload).not.toHaveBeenCalled()
		retried.snapshot.dispose()
		retried.scope.stop()
	})

	test.each([true, false])("forceRefresh %s reaches the store's ensure", async (forced) => {
		const t = setup({ forceRefresh: () => forced })
		await t.snapshot.run()
		expect(t.spy.ensure).toHaveBeenCalledWith(expect.objectContaining({ accountAddress: "0xa" }), {
			legs: ["gas", "fpc"],
			forceRefresh: forced,
		})
		t.scope.stop()
	})

	test("dispose releases the lease, and a later run reads and subscribes nothing", async () => {
		const t = setup()
		await t.snapshot.run()
		expect(t.spy.subscribe).toHaveBeenCalledTimes(1)
		expect(t.released).not.toHaveBeenCalled()

		t.snapshot.dispose()
		expect(t.released).toHaveBeenCalledTimes(1)
		await t.snapshot.run()
		expect(t.selection.load).toHaveBeenCalledTimes(1)
		expect(t.spy.subscribe).toHaveBeenCalledTimes(1)
		t.scope.stop()
	})
})
