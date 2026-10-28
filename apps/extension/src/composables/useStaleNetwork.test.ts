import { EventHandler } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import type { PendingReset, ResetNotice, StaleNetworkChanged, StaleNetworkView } from "@/wallet/services/network-reset/client"
import {
	runResetToEnd,
	runsUnattended,
	runUnattended,
	type StaleNetworkClient,
	type StaleNetworkDeps,
	useStaleNetwork,
} from "./useStaleNetwork"

const view = (over: Partial<StaleNetworkView> = {}): StaleNetworkView => ({
	networkId: "tn",
	name: "Testnet",
	cause: { networkReset: true, addressesMoved: false },
	blocked: false,
	accounts: [{ name: "Account 1", address: "0x01" }],
	unmovable: [],
	switchToSeedNode: false,
	probedEndpoint: null,
	...over,
})

/** A worker with one stale network per id, a single pending reset, one notice slot and an active profile. */
function fakeWorker() {
	const views = new Map<string, StaleNetworkView>()
	const state = { pending: null as PendingReset | null, notice: null as ResetNotice | null, profileId: "p1" }
	const onStaleNetworkChanged = new EventHandler<StaleNetworkChanged>()
	const onDisconnected = new EventHandler<void>()
	const client = {
		getStaleNetwork: vi.fn(async (id: string) => views.get(id) ?? null),
		getPendingReset: vi.fn(async () => state.pending),
		resetStaleNetwork: vi.fn(async (id: string) => {
			state.pending = { networkId: id, running: true }
			return views.get(id)!
		}),
		takeResetNotice: vi.fn(async (profileId: string) => {
			if (profileId !== state.profileId) return null
			const notice = state.notice
			state.notice = null
			return notice
		}),
		onStaleNetworkChanged,
		onDisconnected,
	} as unknown as StaleNetworkClient & { resetStaleNetwork: ReturnType<typeof vi.fn> }
	const emit = (e: Partial<StaleNetworkChanged> & { networkId: string }) =>
		onStaleNetworkChanged.invoke({ profileId: "p1", ...e } as StaleNetworkChanged)
	/** Ends the run the way the service does: journal gone, notice written, then the event. */
	const complete = (networkId: string, notice: ResetNotice | null) => {
		state.pending = null
		views.delete(networkId)
		state.notice = notice
		emit({ networkId, completed: { addressesMoved: notice?.addressesMoved ?? false } })
	}
	return { client, views, state, emit, complete, onDisconnected }
}

function harness(w: ReturnType<typeof fakeWorker>, over: Partial<StaleNetworkDeps> = {}) {
	const announce = vi.fn()
	const deps: StaleNetworkDeps = {
		client: w.client,
		scope: () => ({ profileId: "p1", networkId: "ln" }),
		syncActive: vi.fn(async () => null),
		staleActive: () => null,
		onCompleted: vi.fn(async () => {}),
		announce,
		...over,
	}
	return { stale: useStaleNetwork(deps), deps, announce }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

/** Parks the worker's next pending-reset read until the returned release; later reads answer at once. */
function parkNextPendingRead(w: ReturnType<typeof fakeWorker>, answer: PendingReset | null): () => void {
	let release!: () => void
	const parked = new Promise<PendingReset | null>((r) => (release = () => r(answer)))
	;(w.client.getPendingReset as ReturnType<typeof vi.fn>).mockImplementationOnce(() => parked)
	return () => release()
}

describe("useStaleNetwork", () => {
	test("each unlock resumes a paused reset on another network and shows its progress there", async () => {
		const w = fakeWorker()
		w.views.set("tn", view({ reset: { running: false, purged: true, doneCount: 0, imported: [] } }))
		w.state.pending = { networkId: "tn", running: false }
		const { stale } = harness(w)
		await stale.resume("p1")
		expect(w.client.resetStaleNetwork).toHaveBeenCalledWith("tn", expect.objectContaining({ accountCount: 1 }))
		expect(stale.running.value?.networkId).toBe("tn")
	})

	test("a completion on the active network announces only after the account load it starts", async () => {
		const w = fakeWorker()
		w.views.set("ln", view({ networkId: "ln" }))
		let loaded!: () => void
		const order: string[] = []
		const onCompleted = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					loaded = () => {
						order.push("loaded")
						resolve()
					}
				}),
		)
		const { stale, announce } = harness(w, { onCompleted })
		announce.mockImplementation(() => order.push("toast"))
		await stale.start(view({ networkId: "ln" }))
		expect(stale.running.value?.networkId).toBe("ln")
		w.complete("ln", { networkId: "ln", addressesMoved: false })
		await settle()
		expect(onCompleted).toHaveBeenCalledWith("ln", expect.any(Function))
		expect(stale.running.value?.networkId).toBe("ln")
		expect(announce).not.toHaveBeenCalled()
		loaded()
		await settle()
		expect(stale.running.value).toBeNull()
		expect(order).toEqual(["loaded", "toast"])
	})

	test("a resume whose read lands during a completion waits for its account load before A4 drops or A5 shows", async () => {
		const w = fakeWorker()
		w.views.set("ln", view({ networkId: "ln" }))
		let loaded!: () => void
		const order: string[] = []
		const onCompleted = vi.fn(() => new Promise<void>((resolve) => (loaded = resolve)))
		const { stale, announce } = harness(w, { onCompleted })
		announce.mockImplementation(() => order.push("toast"))
		await stale.start(view({ networkId: "ln" }))
		const release = parkNextPendingRead(w, null)
		const resumed = stale.resume("p1")
		w.complete("ln", { networkId: "ln", addressesMoved: false })
		release()
		await settle()
		expect(stale.running.value?.networkId).toBe("ln")
		expect(announce).not.toHaveBeenCalled()
		order.push("loaded")
		loaded()
		await resumed
		await settle()
		expect(stale.running.value).toBeNull()
		expect(order).toEqual(["loaded", "toast"])
	})

	test("a resume whose run-view read starts before a completion and lands during it keeps A4, and the toast follows the account load", async () => {
		const w = fakeWorker()
		w.views.set("ln", view({ networkId: "ln" }))
		let loaded!: () => void
		const order: string[] = []
		const onCompleted = vi.fn(() => new Promise<void>((resolve) => (loaded = resolve)))
		const { stale, announce } = harness(w, { onCompleted })
		announce.mockImplementation(() => order.push("toast"))
		await stale.start(view({ networkId: "ln" }))
		const reads = w.client.getPendingReset as ReturnType<typeof vi.fn>
		reads.mockImplementationOnce(async () => w.state.pending)
		const release = parkNextPendingRead(w, null)
		const resumed = stale.resume("p1")
		await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(3))
		w.complete("ln", { networkId: "ln", addressesMoved: false })
		release()
		await settle()
		expect(stale.running.value?.networkId).toBe("ln")
		expect(announce).not.toHaveBeenCalled()
		order.push("loaded")
		loaded()
		await resumed
		await settle()
		expect(stale.running.value).toBeNull()
		expect(order).toEqual(["loaded", "toast"])
	})

	test("a notice whose take lands during a completion's account load is announced only after it", async () => {
		const w = fakeWorker()
		w.views.set("ln", view({ networkId: "ln" }))
		let loaded!: () => void
		const order: string[] = []
		const onCompleted = vi.fn(() => new Promise<void>((resolve) => (loaded = resolve)))
		const { stale, announce } = harness(w, { onCompleted })
		announce.mockImplementation(() => order.push("toast"))
		let answer!: (notice: ResetNotice) => void
		;(w.client.takeResetNotice as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise((r) => (answer = r)))
		const resumed = stale.resume("p1")
		await vi.waitFor(() => expect(w.client.takeResetNotice).toHaveBeenCalled())
		w.complete("ln", null)
		answer({ networkId: "ln", addressesMoved: false })
		await settle()
		expect(announce).not.toHaveBeenCalled()
		order.push("loaded")
		loaded()
		await resumed
		await settle()
		expect(order).toEqual(["loaded", "toast"])
	})

	test("a resume while a run is pending leaves its notice to its completion, even once the notice is written", async () => {
		const w = fakeWorker()
		w.views.set("ln", view({ networkId: "ln" }))
		const order: string[] = []
		const onCompleted = vi.fn(async () => {
			order.push("loaded")
		})
		const { stale, announce } = harness(w, { onCompleted })
		announce.mockImplementation(() => order.push("toast"))
		await stale.start(view({ networkId: "ln" }))
		w.state.notice = { networkId: "ln", addressesMoved: false }
		await stale.resume("p1")
		expect(announce).not.toHaveBeenCalled()
		w.state.pending = null
		w.emit({ networkId: "ln", completed: { addressesMoved: false } })
		await settle()
		expect(order).toEqual(["loaded", "toast"])
	})

	test("a resume begun for an ended profile starts nothing", async () => {
		const w = fakeWorker()
		w.views.set("tn", view({ reset: { running: false, purged: true, doneCount: 0, imported: [] } }))
		const release = parkNextPendingRead(w, { networkId: "tn", running: false })
		const { stale } = harness(w)
		const resumed = stale.resume("p1")
		stale.clear()
		release()
		await resumed
		expect(w.client.resetStaleNetwork).not.toHaveBeenCalled()
	})

	test("a handler of the ended profile, parked at a read, never re-reads the new profile's view", async () => {
		const w = fakeWorker()
		w.views.set("tn", view())
		let scope = { profileId: "p1", networkId: "ln" }
		const { stale, deps } = harness(w, { scope: () => scope })
		const release = parkNextPendingRead(w, null)
		w.emit({ networkId: "tn" })
		await vi.waitFor(() => expect(w.client.getPendingReset).toHaveBeenCalledTimes(1))
		scope = { profileId: "p2", networkId: "mn" }
		stale.clear()
		release()
		await settle()
		expect(deps.syncActive).not.toHaveBeenCalled()
	})

	test("a handler parked across a network switch re-reads the network active now, not its event's", async () => {
		const w = fakeWorker()
		w.views.set("tn", view())
		let scope = { profileId: "p1", networkId: "tn" }
		const { deps } = harness(w, { scope: () => scope })
		const release = parkNextPendingRead(w, null)
		w.emit({ networkId: "tn" })
		await vi.waitFor(() => expect(w.client.getPendingReset).toHaveBeenCalledTimes(1))
		scope = { profileId: "p1", networkId: "ln" }
		release()
		await settle()
		expect(deps.syncActive).toHaveBeenCalledTimes(1)
		expect(deps.syncActive).toHaveBeenCalledWith("ln")
	})

	test("a resume of an ended profile, parked before its notice, never takes the next profile's", async () => {
		const w = fakeWorker()
		const { stale, announce } = harness(w)
		const reads = w.client.getPendingReset as ReturnType<typeof vi.fn>
		reads.mockImplementationOnce(async () => null)
		const release = parkNextPendingRead(w, null)
		const resumed = stale.resume("p1")
		await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(2))
		stale.clear()
		w.state.notice = { networkId: "tn", addressesMoved: true }
		release()
		await resumed
		expect(w.client.takeResetNotice).not.toHaveBeenCalled()
		expect(w.state.notice).not.toBeNull()
		expect(announce).not.toHaveBeenCalled()
	})

	test("clear drops the ended scope's run and node state, and a read started before it lands nowhere", async () => {
		const w = fakeWorker()
		w.views.set("tn", view())
		const { stale } = harness(w)
		await stale.start(view())
		stale.nodeDown.value = "cn"
		const release = parkNextPendingRead(w, { networkId: "tn", running: true })
		w.emit({ networkId: "tn" })
		stale.clear()
		expect(stale.running.value).toBeNull()
		expect(stale.nodeDown.value).toBeNull()
		release()
		await settle()
		expect(stale.running.value).toBeNull()
	})

	test("two popups announce one completion once", async () => {
		const w = fakeWorker()
		w.views.set("tn", view())
		const a = harness(w)
		const b = harness(w)
		w.complete("tn", { networkId: "tn", addressesMoved: true })
		await settle()
		expect(a.announce.mock.calls.length + b.announce.mock.calls.length).toBe(1)
	})

	test("an unattended run, whoever starts it, shows its view until it settles, and no toast", async () => {
		const w = fakeWorker()
		const target = view({ accounts: [] })
		w.views.set("tn", target)
		const { stale, announce, deps } = harness(w, { scope: () => ({ profileId: "p1", networkId: "tn" }) })
		let settled!: () => void
		const run = runUnattended(w.client, target, () => new Promise<void>((r) => (settled = r)))
		w.emit({ networkId: "tn", running: true })
		await settle()
		expect(stale.running.value).toBe(target)
		w.complete("tn", null)
		await settle()
		expect(stale.running.value).toBe(target)
		settled()
		await expect(run).resolves.toBe(true)
		expect(stale.running.value).toBeNull()
		expect(deps.onCompleted).not.toHaveBeenCalled()
		expect(announce).not.toHaveBeenCalled()
	})

	test("a completion this popup heard before its session began is finished at the resume", async () => {
		const w = fakeWorker()
		w.views.set("tn", view({ reset: { running: true, purged: true, doneCount: 0, imported: [] } }))
		w.state.pending = { networkId: "tn", running: true }
		let scope: ReturnType<StaleNetworkDeps["scope"]>
		const booted = w.views.get("tn") ?? null
		const order: string[] = []
		const onCompleted = vi.fn(() => new Promise<void>((r) => setTimeout(() => r(void order.push("loaded")), 5)))
		const { stale, announce } = harness(w, { scope: () => scope, staleActive: () => booted, onCompleted })
		announce.mockImplementation(() => order.push("toast"))
		w.complete("tn", { networkId: "tn", addressesMoved: false })
		await settle()
		expect(onCompleted).not.toHaveBeenCalled()
		scope = { profileId: "p1", networkId: "tn" }
		await stale.resume("p1")
		expect(onCompleted).toHaveBeenCalledWith("tn", expect.any(Function))
		expect(order).toEqual(["loaded", "toast"])
	})

	test("a completion both the event and the catch-up see runs once, whichever comes first", async () => {
		for (const eventFirst of [true, false]) {
			const w = fakeWorker()
			const booted = view({ reset: { running: true, purged: true, doneCount: 0, imported: [] } })
			let release!: (v: StaleNetworkView | null) => void
			const parked = new Promise<StaleNetworkView | null>((r) => (release = r))
			;(w.client.getStaleNetwork as ReturnType<typeof vi.fn>).mockImplementationOnce(() => parked)
			const { stale, deps } = harness(w, { scope: () => ({ profileId: "p1", networkId: "tn" }), staleActive: () => booted })
			const resumed = stale.resume("p1")
			await settle()
			if (eventFirst) w.complete("tn", null)
			release(null)
			await settle()
			if (!eventFirst) w.complete("tn", null)
			await resumed
			await settle()
			expect(deps.onCompleted).toHaveBeenCalledTimes(1)
		}
	})

	test("an ended session's automatic run, still settling, covers nothing of the next, which sees a resumed run", async () => {
		const w = fakeWorker()
		const target = view({ accounts: [] })
		w.views.set("tn", target)
		const { stale } = harness(w, { scope: () => ({ profileId: "p1", networkId: "tn" }) })
		let settled!: () => void
		const run = runUnattended(w.client, target, () => new Promise<void>((r) => (settled = r)))
		try {
			w.complete("tn", null)
			await settle()
			expect(stale.running.value).toBe(target)
			stale.clear()
			expect(stale.running.value).toBeNull()
			const resumed = view({ accounts: [], reset: { running: true, purged: false, doneCount: 0, imported: [] } })
			w.views.set("tn", resumed)
			w.state.pending = { networkId: "tn", running: true }
			w.emit({ networkId: "tn", running: true })
			await settle()
			expect(stale.running.value).toEqual(resumed)
		} finally {
			settled()
			await run
		}
	})

	test("the resume finishes nothing while the active network is still stale, or was live at the bootstrap", async () => {
		const w = fakeWorker()
		w.views.set("tn", view())
		const stuck = harness(w, { scope: () => ({ profileId: "p1", networkId: "tn" }), staleActive: () => w.views.get("tn") ?? null })
		await stuck.stale.resume("p1")
		expect(stuck.deps.onCompleted).not.toHaveBeenCalled()
		const live = harness(w, { scope: () => ({ profileId: "p1", networkId: "ln" }), staleActive: () => w.views.get("tn") ?? null })
		await live.stale.resume("p1")
		expect(live.deps.onCompleted).not.toHaveBeenCalled()
	})

	test("refresh re-reads the active network's view only while it is stale", async () => {
		const w = fakeWorker()
		const held = view({ heldBy: { name: "My Testnet" } })
		let stored: StaleNetworkView | null = held
		const { stale, deps } = harness(w, { scope: () => ({ profileId: "p1", networkId: "tn" }), staleActive: () => stored })
		await stale.refresh()
		expect(deps.syncActive).toHaveBeenCalledWith("tn")
		stored = null
		await stale.refresh()
		stored = view({ networkId: "ln" })
		await stale.refresh()
		expect(deps.syncActive).toHaveBeenCalledTimes(1)
	})

	test("an unreachable custom node marks that network for R4, and a later start clears it", async () => {
		const w = fakeWorker()
		w.views.set("tn", view())
		w.client.resetStaleNetwork.mockRejectedValueOnce(new Error("ERR_NODE_UNREACHABLE: the node did not answer"))
		const { stale, deps } = harness(w, { scope: () => ({ profileId: "p1", networkId: "tn" }) })
		await stale.start(view())
		expect(stale.nodeDown.value).toBe("tn")
		expect(deps.syncActive).toHaveBeenCalledWith("tn")
		await stale.start(view())
		expect(stale.nodeDown.value).toBeNull()
	})

	test("a refusal that lands after the profile ended marks no node and re-reads nothing", async () => {
		const w = fakeWorker()
		w.views.set("tn", view())
		let refuse!: () => void
		w.client.resetStaleNetwork.mockImplementationOnce(
			() => new Promise((_, reject) => (refuse = () => reject(new Error("ERR_NODE_UNREACHABLE: the node did not answer")))),
		)
		const { stale, deps } = harness(w, { scope: () => ({ profileId: "p1", networkId: "tn" }) })
		const started = stale.start(view())
		stale.clear()
		refuse()
		await started
		expect(stale.nodeDown.value).toBeNull()
		expect(deps.syncActive).not.toHaveBeenCalled()
		expect(stale.starting.value).toBe(false)
	})

	test("the ended profile's start, still in flight, does not hold back the next profile's", async () => {
		const w = fakeWorker()
		w.views.set("tn", view())
		let settleFirst!: () => void
		w.client.resetStaleNetwork.mockImplementationOnce(() => new Promise((r) => (settleFirst = () => r(view()))))
		w.client.resetStaleNetwork.mockImplementationOnce(() => new Promise(() => {}))
		const { stale } = harness(w)
		void stale.start(view())
		expect(stale.starting.value).toBe(true)
		stale.clear()
		expect(stale.starting.value).toBe(false)
		void stale.start(view({ networkId: "mn" }))
		expect(w.client.resetStaleNetwork).toHaveBeenCalledTimes(2)
		expect(w.client.resetStaleNetwork).toHaveBeenLastCalledWith("mn", expect.anything())
		settleFirst()
		await settle()
		expect(stale.starting.value).toBe(true)
	})

	test("a handler parked across a lock and unlock of the same profile re-reads nothing", async () => {
		const w = fakeWorker()
		w.views.set("tn", view())
		const { stale, deps } = harness(w)
		const release = parkNextPendingRead(w, null)
		w.emit({ networkId: "tn" })
		await vi.waitFor(() => expect(w.client.getPendingReset).toHaveBeenCalledTimes(1))
		stale.clear()
		release()
		await settle()
		expect(deps.syncActive).not.toHaveBeenCalled()
	})

	test("the ended profile's completion, still loading, holds back nothing of the next and is told it ended", async () => {
		const w = fakeWorker()
		w.views.set("ln", view({ networkId: "ln" }))
		w.views.set("tn", view())
		let live!: () => boolean
		const onCompleted = vi.fn((_id: string, l: () => boolean) => {
			live = l
			return new Promise<void>(() => {})
		})
		const { stale, announce } = harness(w, { onCompleted })
		w.complete("ln", null)
		await settle()
		expect(live()).toBe(true)
		stale.clear()
		expect(live()).toBe(false)
		w.state.pending = { networkId: "tn", running: true }
		w.state.notice = { networkId: "tn", addressesMoved: false }
		await stale.resume("p1")
		expect(stale.running.value?.networkId).toBe("tn")
		w.state.pending = null
		await stale.resume("p1")
		expect(announce).toHaveBeenCalledTimes(1)
	})

	test("a notice whose take answers after the session ended is not shown over the next one", async () => {
		const w = fakeWorker()
		const { stale, announce } = harness(w)
		let answer!: (notice: ResetNotice) => void
		;(w.client.takeResetNotice as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise((r) => (answer = r)))
		const resumed = stale.resume("p1")
		await vi.waitFor(() => expect(w.client.takeResetNotice).toHaveBeenCalled())
		stale.clear()
		answer({ networkId: "tn", addressesMoved: false })
		await resumed
		expect(announce).not.toHaveBeenCalled()
	})

	test("a notice is asked for the profile that saw the completion, and another profile's stays", async () => {
		const w = fakeWorker()
		w.state.notice = { networkId: "tn", addressesMoved: false }
		w.state.profileId = "p2"
		const { stale, announce } = harness(w)
		await stale.resume("p1")
		expect(w.client.takeResetNotice).toHaveBeenCalledWith("p1")
		expect(announce).not.toHaveBeenCalled()
		expect(w.state.notice).not.toBeNull()
	})

	test("a second start while one is in flight makes no call", async () => {
		const w = fakeWorker()
		w.views.set("tn", view())
		const { stale } = harness(w)
		await Promise.all([stale.start(view()), stale.start(view())])
		expect(w.client.resetStaleNetwork).toHaveBeenCalledTimes(1)
	})

	test("events of another profile, or before a session, change nothing; dispose detaches", async () => {
		const w = fakeWorker()
		let scope: ReturnType<StaleNetworkDeps["scope"]>
		const { stale, deps } = harness(w, { scope: () => scope })
		w.emit({ networkId: "tn", running: true })
		scope = { profileId: "p1", networkId: "ln" }
		w.emit({ networkId: "tn", running: true, profileId: "p2" } as StaleNetworkChanged)
		await settle()
		expect(w.client.getPendingReset).not.toHaveBeenCalled()
		stale.dispose()
		w.emit({ networkId: "tn", running: true })
		await settle()
		expect(deps.syncActive).not.toHaveBeenCalled()
	})
})

describe("runResetToEnd", () => {
	test("resolves false on a refusal, a failure, or the worker going away", async () => {
		const w = fakeWorker()
		w.views.set("tn", view({ accounts: [] }))
		w.client.resetStaleNetwork.mockRejectedValueOnce(new Error("ERR_STALE_CHANGED: x"))
		await expect(runResetToEnd(w.client, view({ accounts: [] }))).resolves.toBe(false)
		const failed = runResetToEnd(w.client, view({ accounts: [] }))
		w.emit({ networkId: "tn", failed: true })
		await expect(failed).resolves.toBe(false)
		const gone = runResetToEnd(w.client, view({ accounts: [] }))
		w.onDisconnected.invoke()
		await expect(gone).resolves.toBe(false)
	})
})

describe("runsUnattended", () => {
	test("only a network never opened, whatever the cause, with no journal, no conflict and no node switch", () => {
		expect(runsUnattended(view({ accounts: [] }))).toBe(true)
		expect(runsUnattended(view({ accounts: [], cause: { networkReset: false, addressesMoved: true } }))).toBe(true)
		expect(runsUnattended(view())).toBe(false)
		expect(runsUnattended(view({ accounts: [], unmovable: ["Imported 1"] }))).toBe(false)
		expect(
			runsUnattended(view({ accounts: [], unmovable: ["Imported 1"], cause: { networkReset: false, addressesMoved: true } })),
		).toBe(false)
		expect(runsUnattended(view({ accounts: [], blocked: true }))).toBe(false)
		expect(runsUnattended(view({ accounts: [], reset: { running: false, purged: false, doneCount: 0, imported: [] } }))).toBe(false)
		expect(runsUnattended(view({ accounts: [], heldBy: { name: "X" } }))).toBe(false)
		expect(runsUnattended(view({ accounts: [], otherPending: { networkId: "x", name: "X" } }))).toBe(false)
		expect(runsUnattended(view({ accounts: [], switchToSeedNode: true }))).toBe(false)
	})
})

describe("a resume whose session a lock ends", () => {
	const refuseNextPendingRead = (w: ReturnType<typeof fakeWorker>) => {
		let refuse!: (error: Error) => void
		const read = new Promise<PendingReset | null>((_, reject) => (refuse = reject))
		;(w.client.getPendingReset as ReturnType<typeof vi.fn>).mockImplementationOnce(() => read)
		return refuse
	}

	test("the read it refuses resolves the resume, logged at debug", async () => {
		const w = fakeWorker()
		const refuse = refuseNextPendingRead(w)
		const { stale } = harness(w)
		const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined)
		const resumed = stale.resume("p1")
		stale.clear()
		const refusal = new Error("Profile locked")
		refuse(refusal)
		await expect(resumed).resolves.toBeUndefined()
		expect(debug).toHaveBeenCalledExactlyOnceWith("stale-network resume ended with its session", { error: refusal })
		debug.mockRestore()
	})

	test("control: a resume whose session lasts still rejects", async () => {
		const w = fakeWorker()
		const refuse = refuseNextPendingRead(w)
		const { stale } = harness(w)
		const resumed = stale.resume("p1")
		const refusal = new Error("Profile locked")
		refuse(refusal)
		await expect(resumed).rejects.toBe(refusal)
	})
})
