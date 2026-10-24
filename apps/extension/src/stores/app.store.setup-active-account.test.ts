/**
 * Stale-activation fence for `setupActiveAccount`.
 *
 * The race: `setupActiveAccount` suspends (the selection read; `commitScopeChange`'s
 * `refreshInFlight` journal RPC) with its account choice already computed from
 * the THEN-current profile's list. A profile activation that supersedes it
 * mid-await completes fully; the parked run then resumes and lands the LOSER's
 * account after the winner's — and records the loser's address as the device's
 * selection, which survives into the next bootstrap.
 * `commitScopeChange` can't catch this: it guards in-flight sends, not
 * superseded activations.
 *
 * These tests park run A deterministically inside `commitScopeChange` →
 * `refreshInFlight` → `getOperations` (the widest await window) via the mocked
 * journal client, complete winner B, then release A.
 */

import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Account } from "@/wallet/services/account/client"
import type { Network } from "@/wallet/services/network/client"

import { useAppStore } from "./app.store"

const { mockGetOperations } = vi.hoisted(() => ({ mockGetOperations: vi.fn() }))

vi.mock("@/wallet/services/operation-journal/client", () => ({
	OperationJournalServiceClient: class {
		onOperationAdded = { add: () => {} }
		onOperationUpdated = { add: () => {} }
		onOperationDeleted = { add: () => {} }
		onConnected = { add: () => {} }
		connect = async () => {}
		disconnect = () => {}
		getOperations = mockGetOperations
	},
}))

const asAccount = (address: string) => ({ address }) as unknown as Account
const asNetwork = (chainId: number, id = `net-${chainId}`) => ({ id, chainId }) as unknown as Network

/** Macrotask flush — lets watchers + parked awaits settle. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** The selection the worker answers per profile. */
let selections: Record<string, string> = {}
let setSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
	setActivePinia(createPinia())
	mockGetOperations.mockReset()
	selections = {}
	setSpy = vi.fn(async (_profileId: string, _address: string) => true)
	vi.stubGlobal("managers", {
		transaction: { getTransactions: vi.fn() },
		uiPreference: { getSelectedAccount: vi.fn(async (profileId: string) => selections[profileId]), setSelectedAccount: setSpy },
	})
	// biome-ignore lint/suspicious/noExplicitAny: chrome stub assignment
	;(chrome.storage as any).local = { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) }
	// biome-ignore lint/suspicious/noExplicitAny: chrome stub assignment
	;(chrome.storage as any).onChanged = {
		addListener: vi.fn(),
		removeListener: vi.fn(),
	}
})

/** Bring the store to profile A with its journal read already answered. */
async function scopeToProfileA(store: ReturnType<typeof useAppStore>) {
	mockGetOperations.mockResolvedValueOnce([]) // profile-watch refresh for A
	store.profile = { id: "profile-a" } as never
	store.network = asNetwork(1)
	store.accounts = [asAccount("0xA")] as never
	await flush()
}

/** Park the next journal read (run A's commitScopeChange) on a gate. */
function armJournalGate(): () => void {
	let release!: () => void
	const gate = new Promise<unknown[]>((resolve) => {
		release = () => resolve([])
	})
	mockGetOperations.mockReturnValueOnce(gate)
	return release
}

/** Winner B fully completes while the loser is parked. */
async function completeWinnerB(store: ReturnType<typeof useAppStore>) {
	mockGetOperations.mockResolvedValueOnce([]) // profile-watch refresh for B
	store.profile = { id: "profile-b" } as never
	store.accounts = [asAccount("0xB")] as never
	store.account = asAccount("0xB") as never
	await flush()
	setSpy.mockClear() // only the parked run's writes are under test
}

describe("app.store.setupActiveAccount — stale-activation fence", () => {
	test("a superseded run (first-account branch) must NOT land its account or stamp the durable pointer", async () => {
		const store = useAppStore()
		await scopeToProfileA(store)

		const release = armJournalGate()
		const runA = store.setupActiveAccount() // no remembered key → first-branch
		await flush() // parked inside commitScopeChange → getOperations

		await completeWinnerB(store)

		release()
		const result = await runA

		expect(store.account?.address).toBe("0xB") // loser's 0xA must not land after the winner
		expect(result).toBe(false)
		expect(setSpy).not.toHaveBeenCalled() // the loser must not record its account as the selection
	})

	test("a superseded run (remembered-account branch) must NOT land its account", async () => {
		const store = useAppStore()
		await scopeToProfileA(store)
		selections = { "profile-a": "0xA" } // remembered = A's account

		const release = armJournalGate()
		const runA = store.setupActiveAccount() // remembered found → guarded commit branch
		await flush() // parked inside commitScopeChange → getOperations

		await completeWinnerB(store)

		release()
		const result = await runA

		expect(store.account?.address).toBe("0xB")
		expect(result).toBe(false)
		expect(setSpy).not.toHaveBeenCalled()
	})

	test("(ABA) an A→B→A round trip must NOT let the original parked run land — scope IDs match again; only the epoch distinguishes it", async () => {
		const store = useAppStore()
		await scopeToProfileA(store)
		store.accounts = [asAccount("0xA2")] as never // old A's list at park time

		const release = armJournalGate() // journal read #2: old A's commit read
		const oldRunA = store.setupActiveAccount() // epoch 1; captures (profile-a, net-1); first = 0xA2
		await flush() // parked inside commitScopeChange → getOperations

		// B activates and FULLY RUNS its own setupActiveAccount (bumps the epoch).
		mockGetOperations.mockResolvedValueOnce([]) // #3: profile-b watch
		store.profile = { id: "profile-b" } as never
		store.accounts = [asAccount("0xB")] as never
		await flush()
		mockGetOperations.mockResolvedValueOnce([]) // #4: B's commit read
		await expect(store.setupActiveAccount()).resolves.toBe(true)
		expect(store.account?.address).toBe("0xB")

		// A re-activates: profile AND network return to old A's captured values.
		mockGetOperations.mockResolvedValueOnce([]) // #5: profile-a watch
		store.profile = { id: "profile-a" } as never
		store.accounts = [asAccount("0xA1")] as never // the fresh activation's list
		await flush()
		mockGetOperations.mockResolvedValueOnce([]) // #6: new A's commit read
		await expect(store.setupActiveAccount()).resolves.toBe(true)
		expect(store.account?.address).toBe("0xA1")

		setSpy.mockClear() // only the parked run's writes are under test
		release()
		const result = await oldRunA

		expect(store.account?.address).toBe("0xA1") // stale 0xA2 must NOT land — IDs match; the epoch is load-bearing
		expect(result).toBe(false)
		expect(setSpy).not.toHaveBeenCalled()
	})

	test("an un-superseded run still lands the first account and persists it (fence must not over-refuse)", async () => {
		const store = useAppStore()
		await scopeToProfileA(store)
		mockGetOperations.mockResolvedValueOnce([]) // run's own commitScopeChange read

		await expect(store.setupActiveAccount()).resolves.toBe(true)

		expect(store.account?.address).toBe("0xA")
		expect(setSpy).toHaveBeenCalledWith("profile-a", "0xA")
	})

	test("an un-superseded run still lands the remembered account (fence must not over-refuse)", async () => {
		const store = useAppStore()
		mockGetOperations.mockResolvedValueOnce([]) // profile-watch refresh for A
		store.profile = { id: "profile-a" } as never
		store.network = asNetwork(1)
		store.accounts = [asAccount("0xA"), asAccount("0xA2")] as never
		await flush()
		selections = { "profile-a": "0xA2" }
		mockGetOperations.mockResolvedValueOnce([]) // run's own commitScopeChange read

		await expect(store.setupActiveAccount()).resolves.toBe(true)

		expect(store.account?.address).toBe("0xA2")
	})
})
