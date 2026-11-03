import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppServices } from "@/utils/core"
import type { NetworkServiceClient } from "@/wallet/services/network/client"
import { initAppServiceContext, isServiceReady, managers, refreshBalances, waitForServiceReady } from "@/utils/core"

const tbMock = vi.hoisted(() => ({
	getTokenBalances: vi.fn(),
	refreshTokenBalance: vi.fn(),
	disconnect: vi.fn(),
}))
vi.mock("@/wallet/services/token-balance/client", () => ({
	// Constructed with `new` — needs a real function (a constructor returning an object
	// yields that object), not an arrow.
	TokenBalanceServiceClient: vi.fn(function TokenBalanceServiceClient() {
		return tbMock
	}),
}))

/** Each construction of a lazy slot's client yields a fresh stub, so a test can tell them apart. */
const slotClients = vi.hoisted(() => {
	const stub = () =>
		vi.fn(function SlotClient() {
			return { connect: vi.fn(), disconnect: vi.fn(), onTransactionAdded: { add: vi.fn() }, onTransactionUpdated: { add: vi.fn() } }
		})
	return { account: stub(), network: stub(), transaction: stub() }
})
vi.mock("@/wallet/services/account/client", async (importOriginal) => ({
	...(await importOriginal<object>()),
	AccountServiceClient: slotClients.account,
}))
vi.mock("@/wallet/services/network/client", async (importOriginal) => ({
	...(await importOriginal<object>()),
	NetworkServiceClient: slotClients.network,
}))
vi.mock("@/wallet/services/transaction/client", async (importOriginal) => ({
	...(await importOriginal<object>()),
	TransactionServiceClient: slotClients.transaction,
}))

/** A registry no test has written yet: the lazy slots start unset. */
async function freshCore(): Promise<typeof import("@/utils/core")> {
	vi.resetModules()
	return await import("@/utils/core")
}

type SlotStub = { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }
const stub = (client: unknown) => client as SlotStub

describe("the lazy slots' owned writers", () => {
	beforeEach(() => {
		for (const client of Object.values(slotClients)) client.mockClear()
	})

	test("replace disconnects the slot's client, then installs and returns a new one", async () => {
		const core = await freshCore()
		for (const [replace, read, constructed] of [
			[core.replaceNetworkClient, core.requireNetwork, slotClients.network],
			[core.replaceAccountClient, core.requireAccount, slotClients.account],
		] as const) {
			const first = replace()
			expect(read()).toBe(first)
			const next = replace()
			expect(next).not.toBe(first)
			expect(read()).toBe(next)
			expect(stub(first).disconnect).toHaveBeenCalledTimes(1)
			expect(stub(first).disconnect.mock.invocationCallOrder[0]).toBeLessThan(constructed.mock.invocationCallOrder[1])
			expect(stub(next).disconnect).not.toHaveBeenCalled()
		}
	})

	test("ensure creates the account client only while the slot is unset and keeps an existing one", async () => {
		const core = await freshCore()
		const created = core.ensureAccountClient()
		expect(core.requireAccount()).toBe(created)
		expect(core.ensureAccountClient()).toBe(created)
		expect(slotClients.account).toHaveBeenCalledTimes(1)
		expect(stub(created).disconnect).not.toHaveBeenCalled()

		const replaced = core.replaceAccountClient()
		expect(core.ensureAccountClient()).toBe(replaced)
		expect(slotClients.account).toHaveBeenCalledTimes(2)
	})

	test("the transaction service disconnects its predecessor and installs a connected client with both listeners", async () => {
		const core = await freshCore()
		const added = vi.fn()
		const updated = vi.fn()
		core.initTransactionService(added, updated)
		const first = core.getTransaction()
		core.initTransactionService(added, updated)
		const next = core.getTransaction() as unknown as SlotStub & {
			onTransactionAdded: { add: ReturnType<typeof vi.fn> }
			onTransactionUpdated: { add: ReturnType<typeof vi.fn> }
		}
		expect(next).not.toBe(first)
		expect(stub(first).disconnect).toHaveBeenCalledTimes(1)
		expect(next.connect).toHaveBeenCalledTimes(1)
		expect(next.onTransactionAdded.add).toHaveBeenCalledWith(added)
		expect(next.onTransactionUpdated.add).toHaveBeenCalledWith(updated)
		expect(next.disconnect).not.toHaveBeenCalled()
	})

	test("the registry refuses a write, and the owned writer still installs its client", async () => {
		const core = await freshCore()
		expect(() => {
			;(core.managers as AppServices).network = {} as NetworkServiceClient
		}).toThrow(TypeError)
		expect(core.getNetwork()).toBeNull()
		const installed = core.replaceNetworkClient()
		expect(core.requireNetwork()).toBe(installed)
	})
})

/**
 * The 3 lazy clients are typed `| null`. require*() asserts non-null with a
 * clear error (the safety net replacing the prior silent `null.foo()` TypeError);
 * get*() returns `| null` for the sites that tolerate the unset case.
 */
describe("AppServices lazy-client accessors", () => {
	test("(BUG-PIN) require*() throws a clear error when the client is unset", async () => {
		const core = await freshCore()
		expect(() => core.requireNetwork()).toThrow("network service not initialized")
		expect(() => core.requireAccount()).toThrow("account service not initialized")
	})

	test("get*() returns null when unset (tolerant path — no throw)", async () => {
		const core = await freshCore()
		expect(core.getNetwork()).toBeNull()
		expect(core.getTransaction()).toBeNull()
		expect(core.getAccount()).toBeNull()
	})

	test("require*()/get*() return the client its owned writer installed", async () => {
		const core = await freshCore()
		const net = core.replaceNetworkClient()
		const acc = core.replaceAccountClient()
		core.initTransactionService(vi.fn(), vi.fn())
		expect(core.requireNetwork()).toBe(net)
		expect(core.getNetwork()).toBe(net)
		expect(core.getTransaction()).toBe(slotClients.transaction.mock.results.at(-1)?.value)
		expect(core.getTransaction()).not.toBeNull()
		expect(core.requireAccount()).toBe(acc)
		expect(core.getAccount()).toBe(acc)
	})
})

describe("refreshBalances — the disconnect must not cancel its own refresh RPCs", () => {
	const STALE = () => Date.now() - 31 * 60_000

	beforeEach(() => {
		tbMock.getTokenBalances.mockReset()
		tbMock.refreshTokenBalance.mockReset()
		tbMock.disconnect.mockReset()
	})

	test("disconnect waits for every stale-balance refresh to settle; fresh rows are not refreshed", async () => {
		tbMock.getTokenBalances.mockResolvedValue([
			{ id: 1, updatedAt: STALE() },
			{ id: 2, updatedAt: Date.now() },
		])
		let release!: () => void
		tbMock.refreshTokenBalance.mockImplementation(
			() =>
				new Promise<void>((r) => {
					release = r
				}),
		)

		const done = refreshBalances([{ address: "0xa" }])
		await new Promise((r) => setTimeout(r, 0))

		expect(tbMock.refreshTokenBalance).toHaveBeenCalledTimes(1)
		expect(tbMock.refreshTokenBalance).toHaveBeenCalledWith(1)
		// The refresh is still in flight — the port used to be torn down right here.
		expect(tbMock.disconnect).not.toHaveBeenCalled()

		release()
		await done
		expect(tbMock.disconnect).toHaveBeenCalledTimes(1)
	})

	test("a thrown balance read still releases the connection (the throw path used to leak it)", async () => {
		tbMock.getTokenBalances.mockRejectedValue(new Error("port closed"))

		await expect(refreshBalances([{ address: "0xa" }])).rejects.toThrow("port closed")
		expect(tbMock.refreshTokenBalance).not.toHaveBeenCalled()
		expect(tbMock.disconnect).toHaveBeenCalledTimes(1)
	})

	test("one failed refresh is logged and does not cut the others short; the function still resolves", async () => {
		tbMock.getTokenBalances.mockResolvedValue([
			{ id: 1, updatedAt: STALE() },
			{ id: 2, updatedAt: STALE() },
		])
		let releaseSecond!: () => void
		tbMock.refreshTokenBalance.mockImplementation((id: number) =>
			id === 1
				? Promise.reject(new Error("boom"))
				: new Promise<void>((r) => {
						releaseSecond = r
					}),
		)
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		const done = refreshBalances([{ address: "0xa" }])
		await new Promise((r) => setTimeout(r, 0))

		// The first refresh has already rejected while the second is still in flight — a
		// fail-fast implementation (Promise.all) would have disconnected right here.
		expect(tbMock.disconnect).not.toHaveBeenCalled()

		releaseSecond()
		await done

		expect(tbMock.refreshTokenBalance).toHaveBeenCalledTimes(2)
		expect(consoleSpy).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }))
		expect(tbMock.disconnect).toHaveBeenCalledTimes(1)
		consoleSpy.mockRestore()
	})
})

describe("isServiceReady", () => {
	test("follows the profile port's Ready and its drop; the wait resolves at Ready, or false at its bound", async () => {
		// Let the real client's own first Ready settle before the clock is faked.
		initAppServiceContext()
		await new Promise((resolve) => setTimeout(resolve, 10))
		vi.useFakeTimers()
		try {
			managers.profile.onDisconnected.invoke()
			expect(isServiceReady.value).toBe(false)
			const bounded = waitForServiceReady(200)
			await vi.advanceTimersByTimeAsync(200)
			expect(await bounded).toBe(false)

			const waiting = waitForServiceReady(200)
			await vi.advanceTimersByTimeAsync(100)
			managers.profile.onConnected.invoke()
			expect(isServiceReady.value).toBe(true)
			expect(await waiting).toBe(true)
			expect(await waitForServiceReady(0)).toBe(true)

			managers.profile.onDisconnected.invoke()
			expect(isServiceReady.value).toBe(false)
		} finally {
			vi.useRealTimers()
		}
	})
})
