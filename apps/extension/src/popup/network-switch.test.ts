/**
 * Pins for the network-switch orchestration's identity fence. Each pin
 * parks the run at ONE await boundary, forces the race there, and proves the
 * superseded/drifted run commits NOTHING past that point.
 */
import { NodeUnreachableError } from "@nulo/extension-messaging/errors"
import { deferred } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import type { StaleNetworkView } from "@/wallet/services/network-reset/client"
import { createNetworkSwitchHandler, type NetworkSwitchDeps, type NetworkSwitchScope } from "./network-switch"

const ACCOUNT = { address: "0xa" }

const staleView = (over: Partial<StaleNetworkView> = {}): StaleNetworkView => ({
	networkId: "n1",
	name: "Testnet",
	cause: { networkReset: true, addressesMoved: false },
	blocked: false,
	accounts: [{ name: "Account 1", address: `0x${"1".repeat(64)}` }],
	unmovable: [],
	switchToSeedNode: false,
	probedEndpoint: null,
	...over,
})

function makeDeps(over: Partial<NetworkSwitchDeps> = {}) {
	let scope: NetworkSwitchScope | undefined = { profileId: "p1", networkId: "n1", chainId: 1 }
	let live: NetworkSwitchScope = { profileId: "p1", networkId: "n1", chainId: 1 }
	const setAccounts = vi.fn()
	const setupActiveAccount = vi.fn(async () => {})
	const syncTransactions = vi.fn(async () => {})
	const syncNetworkStatus = vi.fn()
	const markNetworkInactive = vi.fn()
	const syncStaleNetwork = vi.fn(async (_networkId: string): Promise<StaleNetworkView | null> => null)
	const clearAccounts = vi.fn()
	const resetUnattended = vi.fn(async (_view: StaleNetworkView, _live: () => boolean) => {})
	const client = {
		getAccounts: vi.fn(async () => [ACCOUNT]),
		ensureDefaultAccount: vi.fn(async () => ({})),
	}
	const deps: NetworkSwitchDeps = {
		getScope: () => scope,
		liveScopeMatches: (s) => live.profileId === s.profileId && live.networkId === s.networkId && live.chainId === s.chainId,
		syncNetworkStatus,
		markNetworkInactive,
		replaceAccountClient: vi.fn(() => client),
		setAccounts,
		setupActiveAccount,
		syncTransactions,
		syncStaleNetwork,
		clearAccounts,
		resetUnattended,
		...over,
	}
	return {
		deps,
		client,
		markNetworkInactive,
		syncStaleNetwork,
		clearAccounts,
		resetUnattended,
		setAccounts,
		setupActiveAccount,
		syncTransactions,
		setScope: (s: NetworkSwitchScope | undefined) => {
			scope = s
		},
		setLive: (s: NetworkSwitchScope) => {
			live = s
		},
	}
}

describe("createNetworkSwitchHandler", () => {
	test("happy path: fetch → set → setup → sync; no default-create when accounts exist", async () => {
		const h = makeDeps()
		await createNetworkSwitchHandler(h.deps)()
		expect(h.setAccounts).toHaveBeenCalledWith([ACCOUNT])
		expect(h.client.ensureDefaultAccount).not.toHaveBeenCalled()
		expect(h.setupActiveAccount).toHaveBeenCalled()
		expect(h.syncTransactions).toHaveBeenCalled()
	})

	test("empty chain: ensureDefaultAccount then re-fetch, both sets land", async () => {
		const h = makeDeps()
		h.client.getAccounts.mockResolvedValueOnce([]).mockResolvedValueOnce([ACCOUNT])
		await createNetworkSwitchHandler(h.deps)()
		expect(h.client.ensureDefaultAccount).toHaveBeenCalledWith("p1", 1, expect.anything(), "Account 1")
		expect(h.setAccounts).toHaveBeenNthCalledWith(1, [])
		expect(h.setAccounts).toHaveBeenNthCalledWith(2, [ACCOUNT])
		expect(h.markNetworkInactive).not.toHaveBeenCalled()
	})

	test("a custom node that does not answer: the chain's own list lands, the dot reads inactive, the tail runs", async () => {
		const h = makeDeps()
		h.client.getAccounts.mockResolvedValue([])
		h.client.ensureDefaultAccount.mockRejectedValueOnce(new NodeUnreachableError())
		await createNetworkSwitchHandler(h.deps)()
		expect(h.markNetworkInactive).toHaveBeenCalledWith("n1")
		expect(h.client.getAccounts).toHaveBeenCalledTimes(2)
		expect(h.setAccounts).toHaveBeenLastCalledWith([])
		expect(h.setupActiveAccount.mock.invocationCallOrder[0]).toBeGreaterThan(h.setAccounts.mock.invocationCallOrder[1])
		expect(h.syncTransactions).toHaveBeenCalled()
	})

	test("a node that answers another L1 still fails the run, and a superseded failure marks nothing", async () => {
		const h = makeDeps()
		h.client.getAccounts.mockResolvedValue([])
		h.client.ensureDefaultAccount.mockRejectedValueOnce(new Error("L1 identity mismatch"))
		await expect(createNetworkSwitchHandler(h.deps)()).rejects.toThrow("L1 identity mismatch")
		expect(h.setupActiveAccount).not.toHaveBeenCalled()

		const gate = deferred<never>()
		h.client.ensureDefaultAccount.mockReturnValueOnce(gate.promise)
		const run = createNetworkSwitchHandler(h.deps)()
		await vi.waitFor(() => expect(h.client.ensureDefaultAccount).toHaveBeenCalledTimes(2))
		h.setLive({ profileId: "p1", networkId: "n2", chainId: 2 })
		gate.reject(new NodeUnreachableError())
		await run
		expect(h.markNetworkInactive).not.toHaveBeenCalled()
		expect(h.setupActiveAccount).not.toHaveBeenCalled()
	})

	test("not-ready (no scope): returns without touching anything — but still supersedes an in-flight run", async () => {
		const h = makeDeps()
		const gate = deferred<never[]>()
		h.client.getAccounts.mockReturnValueOnce(gate.promise as never)
		const handler = createNetworkSwitchHandler(h.deps)
		const run1 = handler() // parks at getAccounts
		h.setScope(undefined)
		await handler() // the transitional undefined-network fire
		gate.resolve([])
		await run1
		// run1 was superseded by the null-scope invocation's begin(): nothing landed.
		expect(h.setAccounts).not.toHaveBeenCalled()
		expect(h.setupActiveAccount).not.toHaveBeenCalled()
	})

	test("superseded at await 1 (first getAccounts): no set, no setup, no sync", async () => {
		const h = makeDeps()
		const gate = deferred<Array<typeof ACCOUNT>>()
		h.client.getAccounts.mockReturnValueOnce(gate.promise)
		const handler = createNetworkSwitchHandler(h.deps)
		const run1 = handler()
		const run2gate = deferred<Array<typeof ACCOUNT>>()
		h.client.getAccounts.mockReturnValueOnce(run2gate.promise)
		const run2 = handler() // supersedes
		gate.resolve([ACCOUNT]) // run1 resumes — must abandon
		await run1
		expect(h.setAccounts).not.toHaveBeenCalled()
		run2gate.resolve([ACCOUNT])
		await run2
		expect(h.setAccounts).toHaveBeenCalledTimes(1) // only run2's
	})

	test("superseded at await 2 (ensureDefaultAccount): the re-fetch and second set never happen", async () => {
		const h = makeDeps()
		h.client.getAccounts.mockResolvedValueOnce([])
		const gate = deferred()
		h.client.ensureDefaultAccount.mockReturnValueOnce(gate.promise as never)
		const handler = createNetworkSwitchHandler(h.deps)
		const run1 = handler() // parks at ensureDefaultAccount
		await vi.waitFor(() => expect(h.client.ensureDefaultAccount).toHaveBeenCalled())
		const run2gate = deferred<Array<typeof ACCOUNT>>()
		h.client.getAccounts.mockReturnValueOnce(run2gate.promise)
		const run2 = handler()
		gate.resolve()
		await run1
		expect(h.client.getAccounts).toHaveBeenCalledTimes(2) // run1's first + run2's — run1's RE-fetch never fired
		expect(h.setupActiveAccount).not.toHaveBeenCalled()
		run2gate.resolve([ACCOUNT])
		await run2
	})

	test("superseded at await 3 (re-fetch): the second set never lands", async () => {
		const h = makeDeps()
		h.client.getAccounts.mockResolvedValueOnce([])
		const gate = deferred<Array<typeof ACCOUNT>>()
		h.client.getAccounts.mockReturnValueOnce(gate.promise)
		const handler = createNetworkSwitchHandler(h.deps)
		const run1 = handler() // set([]) lands, parks at the re-fetch
		await vi.waitFor(() => expect(h.client.getAccounts).toHaveBeenCalledTimes(2))
		expect(h.setAccounts).toHaveBeenCalledTimes(1)
		const run2gate = deferred<Array<typeof ACCOUNT>>()
		h.client.getAccounts.mockReturnValueOnce(run2gate.promise)
		const run2 = handler()
		gate.resolve([ACCOUNT]) // run1's re-fetch resumes — must abandon
		await run1
		expect(h.setAccounts).toHaveBeenCalledTimes(1) // still only run1's first set
		run2gate.resolve([ACCOUNT])
		await run2
	})

	test("superseded at await 4 (setupActiveAccount): the tail sync never starts", async () => {
		const h = makeDeps()
		const gate = deferred()
		h.setupActiveAccount.mockReturnValueOnce(gate.promise)
		const handler = createNetworkSwitchHandler(h.deps)
		const run1 = handler() // parks in setupActiveAccount
		await vi.waitFor(() => expect(h.setupActiveAccount).toHaveBeenCalled())
		const run2gate = deferred<Array<typeof ACCOUNT>>()
		h.client.getAccounts.mockReturnValueOnce(run2gate.promise)
		const run2 = handler()
		gate.resolve()
		await run1
		expect(h.syncTransactions).not.toHaveBeenCalled()
		run2gate.resolve([ACCOUNT])
		await run2
		expect(h.syncTransactions).toHaveBeenCalledTimes(1) // run2's only
	})

	test("PROFILE DRIFT with no new watcher fire: generation intact, live scope moved — the run still abandons", async () => {
		const h = makeDeps()
		const gate = deferred<Array<typeof ACCOUNT>>()
		h.client.getAccounts.mockReturnValueOnce(gate.promise)
		const run = createNetworkSwitchHandler(h.deps)()
		h.setLive({ profileId: "p2", networkId: "n1", chainId: 1 }) // drift — no second handler call
		gate.resolve([ACCOUNT])
		await run
		expect(h.setAccounts).not.toHaveBeenCalled()
	})

	test("captured scope is passed to the calls — never a live re-read", async () => {
		const h = makeDeps()
		const gate = deferred<never[]>()
		h.client.getAccounts.mockReturnValueOnce(gate.promise as never)
		const run = createNetworkSwitchHandler(h.deps)()
		// getScope now returns a DIFFERENT scope mid-run while the LIVE scope still
		// matches the captured one — a live re-read would leak p9/9 into the calls;
		// the guard must not trip (it compares live against the CAPTURED scope).
		h.setScope({ profileId: "p9", networkId: "n9", chainId: 9 })
		gate.resolve([]) // empty chain → the post-await calls carry the scope values
		await run
		expect(h.client.ensureDefaultAccount).toHaveBeenCalledWith("p1", 1, expect.anything(), "Account 1")
		expect(h.client.getAccounts).toHaveBeenLastCalledWith("p1", 1, true)
		expect(h.setAccounts).toHaveBeenCalledWith([ACCOUNT])
	})

	test("rapid double-switch: only the second run's results land", async () => {
		const h = makeDeps()
		const g1 = deferred<Array<typeof ACCOUNT>>()
		const g2 = deferred<Array<typeof ACCOUNT>>()
		h.client.getAccounts.mockReturnValueOnce(g1.promise).mockReturnValueOnce(g2.promise)
		const handler = createNetworkSwitchHandler(h.deps)
		const run1 = handler()
		await vi.waitFor(() => expect(h.client.getAccounts).toHaveBeenCalledTimes(1))
		const run2 = handler()
		g2.resolve([ACCOUNT]) // second finishes FIRST
		await run2
		expect(h.setAccounts).toHaveBeenCalledTimes(1)
		g1.resolve([{ address: "0xstale" }] as never) // first resumes late
		await run1
		expect(h.setAccounts).toHaveBeenCalledTimes(1) // stale set never landed
		expect(h.setAccounts).toHaveBeenCalledWith([ACCOUNT])
	})

	test("a quarantined target loads no account: the list empties and no account client is made", async () => {
		const h = makeDeps()
		h.syncStaleNetwork.mockResolvedValueOnce(staleView())
		await createNetworkSwitchHandler(h.deps)()
		expect(h.syncStaleNetwork).toHaveBeenCalledWith("n1")
		expect(h.clearAccounts).toHaveBeenCalledTimes(1)
		expect(h.deps.replaceAccountClient).not.toHaveBeenCalled()
		expect(h.setAccounts).not.toHaveBeenCalled()
		expect(h.resetUnattended).not.toHaveBeenCalled()
		expect(h.syncTransactions).not.toHaveBeenCalled()
	})

	test("a network never opened resets unattended; a node switch waits for the user", async () => {
		const h = makeDeps()
		const quiet = staleView({ accounts: [] })
		h.syncStaleNetwork.mockResolvedValueOnce(quiet).mockResolvedValueOnce(staleView({ accounts: [], switchToSeedNode: true }))
		const handler = createNetworkSwitchHandler(h.deps)
		await handler()
		expect(h.resetUnattended).toHaveBeenCalledWith(quiet, expect.any(Function))
		const live = h.resetUnattended.mock.calls[0][1]
		expect(live()).toBe(true)
		h.setLive({ profileId: "p1", networkId: "n2", chainId: 2 })
		expect(live()).toBe(false)
		h.setLive({ profileId: "p1", networkId: "n1", chainId: 1 })
		await handler()
		expect(h.resetUnattended).toHaveBeenCalledTimes(1)
		expect(h.clearAccounts).toHaveBeenCalledTimes(2)
	})

	test("switched away while the target's stale view is read: the stale run commits nothing, the live one loads", async () => {
		const h = makeDeps()
		const gate = deferred<StaleNetworkView | null>()
		h.syncStaleNetwork.mockReturnValueOnce(gate.promise)
		const handler = createNetworkSwitchHandler(h.deps)
		const run1 = handler()
		h.setScope({ profileId: "p1", networkId: "n2", chainId: 2 })
		h.setLive({ profileId: "p1", networkId: "n2", chainId: 2 })
		await handler()
		gate.resolve(staleView({ accounts: [] }))
		await run1
		expect(h.clearAccounts).not.toHaveBeenCalled()
		expect(h.resetUnattended).not.toHaveBeenCalled()
		expect(h.setAccounts).toHaveBeenCalledTimes(1)
		expect(h.client.getAccounts).toHaveBeenCalledWith("p1", 2, true)
	})

	test("a reset re-keys the network under a running switch: the old chain's run abandons", async () => {
		const h = makeDeps()
		const gate = deferred<Array<typeof ACCOUNT>>()
		h.client.getAccounts.mockReturnValueOnce(gate.promise)
		const run = createNetworkSwitchHandler(h.deps)()
		h.setLive({ profileId: "p1", networkId: "n1", chainId: 7 })
		gate.resolve([ACCOUNT])
		await run
		expect(h.setAccounts).not.toHaveBeenCalled()
	})
})

describe("a lock that supersedes the run", () => {
	test("the read it refuses resolves the run at debug, and nothing after it runs", async () => {
		const h = makeDeps()
		const read = deferred<StaleNetworkView | null>()
		h.syncStaleNetwork.mockReturnValueOnce(read.promise)
		const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined)
		const handler = createNetworkSwitchHandler(h.deps)
		const run = handler()
		handler.supersede()
		const refusal = new Error("Profile locked")
		read.reject(refusal)
		await expect(run).resolves.toBeUndefined()
		expect(debug).toHaveBeenCalledExactlyOnceWith("network switch superseded", { error: refusal })
		expect(h.deps.replaceAccountClient).not.toHaveBeenCalled()
		debug.mockRestore()
	})

	test("control: a live run's failure still rejects", async () => {
		const h = makeDeps()
		const refusal = new Error("Profile locked")
		h.syncStaleNetwork.mockRejectedValueOnce(refusal)
		await expect(createNetworkSwitchHandler(h.deps)()).rejects.toBe(refusal)
	})
})
