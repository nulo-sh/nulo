/**
 * Unit pins for `TokenService.addToken`'s journal/lock machinery (F-Q09
 * characterization — this path had no unit coverage; the composition layer
 * excludes it because the real `fetchTokenMetadata` runs a view simulation).
 * The private fetch is stubbed via the repo's established test-only reach-in,
 * which is legitimate HERE (a unit file) but would violate the composition
 * layer's boundary rules — see COMPOSITION-TESTS.md.
 */

import { EventHandler } from "@nulo/wallet-core/utils"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { FakeNodeFactory } from "@/core/testing/fake-node-factory"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { AccountService } from "@/wallet/services/account/service"
import { svc } from "@/wallet/services/composition-harness"
import { NetworkService } from "@/wallet/services/network/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { ProfileService } from "@/wallet/services/profile/service"
import { TaskService } from "@/wallet/services/task/service"
import { recordWrites } from "@/wallet/services/storage-write-log"
import { TokenService } from "./service"
import type { TokenInterface } from "./spec"

const NETWORK = { id: "net1", chainId: 1, primaryEndpointId: "ep1", endpoints: [{ id: "ep1", rpcUrl: "http://fake" }] }

const ti = (contract: string): TokenInterface =>
	({
		chainId: 1,
		contract,
		getNameFn: { name: "get_name", impl: 1 },
		getSymbolFn: { name: "get_symbol", impl: 1 },
		getDecimalsFn: { name: "get_decimals", impl: 1 },
		isComplete: true,
	}) as unknown as TokenInterface

async function makeHarness() {
	const api = new FakeBrowserApi()
	api.reset()
	const deletionState = new ProfileDeletionState()
	const logger = new LoggerStore(new ConfigStore())
	const journal = {
		createOperation: vi.fn(async () => ({ id: "op-1" })),
		transitionOperation: vi.fn(async () => {}),
		setOperationMeta: vi.fn(async () => {}),
		purgeForProfile: vi.fn(async () => {}),
	}
	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			getActiveProfile: async () => ({ id: "p1" }),
			onProfileDeleted: { add: () => {} },
			onActiveProfileChanged: new EventHandler(),
			getDeletionState: () => deletionState,
			captureExecutionFence: async () => ({ profileId: "p1", epoch: deletionState.capture("p1"), session: 1 }),
		}),
	)
	const networkLive = { value: true }
	collection.add(
		svc(NetworkService.name, {
			getNetwork: async () => NETWORK,
			registerChainPurgeSubscriber: () => {},
			onActiveNetworkChanged: new EventHandler(),
			isNetworkLive: async () => networkLive.value,
			isChainLive: async () => networkLive.value,
		}),
	)
	collection.add(svc(AccountService.name, { onAccountAdded: new EventHandler() }))
	collection.add(svc(TaskService.name, { startNewTask: () => ({ complete() {}, fail() {} }) }))
	collection.add(svc(OperationJournalService.name, journal))
	const tokenService = new TokenService(logger, api)
	collection.add(tokenService)
	await collection.start()

	const fetchStub = vi.fn(async (): Promise<[string, string, number]> => ["Fetched Name", "FTCH", 9])
	// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to stub the private simulate-backed fetch
	;(tokenService as any).fetchTokenMetadata = fetchStub
	return { tokenService, journal, fetchStub, api, deletionState, networkLive }
}

describe("TokenService.addToken — journal/lock machinery (characterization)", () => {
	test("journals the import (dapp origin + subtitle), backfills the title with the fetched symbol, succeeds", async () => {
		const { tokenService, journal } = await makeHarness()
		const emitted: unknown[] = []
		tokenService.onTokenAdded.add((t) => {
			emitted.push(t)
			return Promise.resolve()
		})

		const info = await tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xc0ffee"), {
			origin: "dapp",
			dappOrigin: "https://app.example",
		})

		expect(info.symbol).toBe("FTCH")
		expect(journal.createOperation).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "token_import",
				origin: "dapp",
				title: undefined,
				subtitle: "Requested by https://app.example",
			}),
		)
		expect(journal.setOperationMeta).toHaveBeenCalledWith("op-1", { title: "FTCH" })
		expect(journal.transitionOperation).toHaveBeenLastCalledWith("op-1", { stage: "succeeded" })
		expect(emitted).toHaveLength(1)
	})

	test("idempotency short-circuit: a repeat add returns the existing row and creates NO journal op", async () => {
		const { tokenService, journal, fetchStub } = await makeHarness()
		await tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xc0ffee"), { origin: "popup" })
		journal.createOperation.mockClear()
		fetchStub.mockClear()

		const again = await tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xc0ffee"), { origin: "popup" })

		expect(again.symbol).toBe("FTCH")
		expect(journal.createOperation).not.toHaveBeenCalled()
		expect(fetchStub).not.toHaveBeenCalled()
	})

	test("a failed fetch journals 'failed' and rethrows", async () => {
		const { tokenService, journal, fetchStub } = await makeHarness()
		fetchStub.mockRejectedValueOnce(new Error("metadata boom"))

		await expect(tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xbad"), { origin: "popup" })).rejects.toThrow("metadata boom")

		expect(journal.transitionOperation).toHaveBeenLastCalledWith("op-1", { stage: "failed" }, expect.anything())
	})

	test("the metadata fetch runs INSIDE the token lock — a queued token op waits for a blocked fetch", async () => {
		const { tokenService, fetchStub } = await makeHarness()
		let releaseFetch!: (v: [string, string, number]) => void
		fetchStub.mockReturnValueOnce(new Promise((r) => (releaseFetch = r)))

		const adding = tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xslow"), { origin: "popup" })
		// Give addToken time to enter the lock and block on the fetch.
		await new Promise((r) => setTimeout(r, 20))

		let restored = false
		const restoring = tokenService.restore([]).then((r) => {
			restored = true
			return r
		})
		await new Promise((r) => setTimeout(r, 20))
		expect(restored).toBe(false) // queued behind the lock the fetch holds

		releaseFetch(["Slow", "SLW", 6])
		await adding
		await restoring
		expect(restored).toBe(true)
	})

	test("seeded persistence never backfills a title (no setOperationMeta)", async () => {
		const { tokenService, journal } = await makeHarness()

		await tokenService.addSeededToken({
			profileId: "p1",
			networkId: NETWORK.id,
			accountAddress: "0xacc",
			tokenInterface: ti("0x5eed"),
			name: "Seeded",
			symbol: "SEED",
			decimals: 18,
		})

		expect(journal.createOperation).toHaveBeenCalledWith(
			expect.objectContaining({ origin: "seed", title: "SEED", subtitle: "Default token" }),
		)
		expect(journal.setOperationMeta).not.toHaveBeenCalled()
	})
})

describe("TokenService.restore — per-row allocation", () => {
	test("a hostile MAX_SAFE_INTEGER key is never overwritten — each row re-allocates instead of id++", async () => {
		// A shared `id++` cursor assumed forward-contiguous free space: with a
		// physical key at MAX_SAFE_INTEGER the allocator gap-fills DOWNWARD, and
		// the old increment then stepped onto (and overwrote) the occupied
		// boundary key. Per-row re-allocation always lands on free keys.
		const { tokenService, api } = await makeHarness()
		const max = String(Number.MAX_SAFE_INTEGER)
		const junk = JSON.stringify({ junk: true })
		await api.storage.local.set({ [`nulo:core:tokens@${max}`]: junk })

		const mk = (contract: string) => ({
			id: 0,
			profileId: "p1",
			chainId: 1,
			contract,
			name: "T",
			symbol: "T",
			decimals: 9,
		})
		const restored = await tokenService.restore([mk("0xaaa"), mk("0xbbb")])
		expect(restored[0].restoreError).toBeUndefined()
		expect(restored[1].restoreError).toBeUndefined()
		// Both landed on fresh keys; the hostile key's raw bytes are intact.
		const raw = await api.storage.local.get(null)
		expect(raw[`nulo:core:tokens@${max}`]).toBe(junk)
		expect(restored[0].id).not.toBe(restored[1].id)
	})
})

describe("TokenService.restore — deletion fence", () => {
	const mk = (contract: string) => ({ id: 0, profileId: "p1", chainId: 1, contract, name: "T", symbol: "T", decimals: 9 })

	test("null, primitive and empty rows are per-row restoreErrors; the valid row still lands", async () => {
		const { tokenService } = await makeHarness()
		const restored = await tokenService.restore([null, 5, {}, mk("0xaaa")] as never)
		expect(restored.map((r) => typeof r.restoreError)).toEqual(["string", "string", "string", "undefined"])
	})

	test("a deleteProfile beginning DURING the restore rejects every later row write", async () => {
		const { tokenService, api, deletionState } = await makeHarness()
		const origSet = api.storage.local.set.bind(api.storage.local)
		let fired = false
		api.storage.local.set = async (items: Record<string, unknown>) => {
			await origSet(items)
			if (!fired) {
				fired = true
				deletionState.beginDeletion("p1")
			}
		}
		const restored = await tokenService.restore([mk("0xaaa"), mk("0xbbb")])
		expect(restored[0].restoreError).toBeUndefined()
		expect(restored[1].restoreError).toMatch(/deleted/)
		const raw = await api.storage.local.get(null)
		expect(Object.values(raw).filter((v) => typeof v === "string" && v.includes("0xbbb"))).toHaveLength(0)
	})

	test("positive control: no deletion → both rows land", async () => {
		const { tokenService } = await makeHarness()
		const restored = await tokenService.restore([mk("0xaaa"), mk("0xbbb")])
		expect(restored.every((r) => r.restoreError === undefined)).toBe(true)
	})
})

describe("TokenService.addToken — creation fences", () => {
	function _deferred<T>() {
		let resolve!: (v: T) => void
		const promise = new Promise<T>((res) => {
			resolve = res
		})
		return { promise, resolve }
	}

	async function tokenRowCount(api: { storage: { local: { get: (k: null) => Promise<Record<string, unknown>> } } }): Promise<number> {
		const raw = await api.storage.local.get(null)
		return Object.keys(raw).filter((k) => k.startsWith("nulo:core:tokens@")).length
	}

	test("addToken for a profile that is not the active one fails closed (authority-match pin)", async () => {
		// Token ops are not switch-blocked: a post-approval profile switch must
		// make the write fail rather than land under the wrong profile (F11 —
		// the register_token cross-profile write).
		const { tokenService, api } = await makeHarness()
		await expect(
			tokenService.addToken("other-profile", NETWORK.id, "0xacc", ti("0xdead"), { origin: "dapp", dappOrigin: "https://x" }),
		).rejects.toThrow(/unauthorized/)
		expect(await tokenRowCount(api)).toBe(0)
	})

	test("a THREADED fence from a settled-out authorization is honored, not re-minted (F11 ABA pin)", async () => {
		// The dApp dispatch threads the fence captured at authorization; if the
		// profile is deleted AND the deletion settles (release) before the token
		// write runs, a fresh mint would observe the settled epoch and land the
		// row — only honoring the CALLER's stale capture rejects the ABA. The
		// assert must also beat the idempotent short-circuit, so it fires with
		// ZERO rows present.
		const { tokenService, api, deletionState } = await makeHarness()
		const staleFence = { profileId: "p1", epoch: deletionState.capture("p1"), session: 1 }
		deletionState.beginDeletion("p1")
		deletionState.release("p1")

		await expect(
			tokenService.addTokenAuthorized(staleFence, "p1", NETWORK.id, "0xacc", ti("0xdead"), {
				origin: "dapp",
				dappOrigin: "https://x",
			}),
		).rejects.toThrow(/deleted|not current/i)
		expect(await tokenRowCount(api)).toBe(0)
	})

	test("a stale authorization cannot exit through the idempotent short-circuit either (F11)", async () => {
		// With the row ALREADY present, the fast path would return it as a
		// success for the deleted incarnation's flow — the fence assert must
		// come before every exit, not just the write.
		const { tokenService, deletionState } = await makeHarness()
		await tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xdead"), { origin: "popup" })
		const staleFence = { profileId: "p1", epoch: deletionState.capture("p1"), session: 1 }
		deletionState.beginDeletion("p1")
		deletionState.release("p1")

		await expect(
			tokenService.addTokenAuthorized(staleFence, "p1", NETWORK.id, "0xacc", ti("0xdead"), { origin: "popup" }),
		).rejects.toThrow(/deleted|not current/i)
	})

	test("clearChainState sweeps WITHOUT the token lock — it completes while a create holds it (ABBA pin)", async () => {
		// purgeChain's caller holds the watchdog-disabled NETWORK lock, and a
		// create's in-token-lock metadata fetch takes the network lock via
		// getNode — a sweep queued on the token lock here would deadlock that
		// pair for the token watchdog's full 5 minutes. The sweep must proceed
		// while the token lock is held.
		const { tokenService, fetchStub } = await makeHarness()
		let releaseFetch!: (v: [string, string, number]) => void
		fetchStub.mockReturnValueOnce(new Promise((r) => (releaseFetch = r)))
		const adding = tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xheld"), { origin: "popup" })
		await new Promise((r) => setTimeout(r, 20)) // create now holds the token lock, parked in the fetch

		let sweepDone = false
		const sweeping = tokenService.clearChainState("p1", 1).then(() => {
			sweepDone = true
		})
		await new Promise((r) => setTimeout(r, 30))
		expect(sweepDone).toBe(true) // did NOT queue behind the held token lock

		releaseFetch(["Held", "HLD", 9])
		await adding
		await sweeping
	})

	test("a purge reservation landing DURING the row set is self-compensated (lockless-sweep belt)", async () => {
		// The sweep no longer holds the token lock, so a row landing between the
		// sweep's snapshot and its purge would survive — unless the create
		// re-checks liveness AFTER its set and compensates.
		const { tokenService, api, networkLive } = await makeHarness()
		const realSet = api.storage.local.set.bind(api.storage.local)
		api.storage.local.set = (async (items: Record<string, unknown>) => {
			await realSet(items)
			if (Object.keys(items).some((k) => k.startsWith("nulo:core:tokens@"))) {
				networkLive.value = false // the deleteNetwork reservation lands mid-set
			}
		}) as typeof api.storage.local.set

		await expect(tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xdead"), { origin: "popup" })).rejects.toThrow(/network deleted/)
		api.storage.local.set = realSet as typeof api.storage.local.set
		expect(await tokenRowCount(api)).toBe(0)
	})

	test("a purge reservation landing DURING a restore row's set is self-compensated", async () => {
		const { tokenService, api, networkLive } = await makeHarness()
		const realSet = api.storage.local.set.bind(api.storage.local)
		let armed = true
		api.storage.local.set = (async (items: Record<string, unknown>) => {
			await realSet(items)
			if (armed && Object.keys(items).some((k) => k.startsWith("nulo:core:tokens@"))) {
				armed = false
				networkLive.value = false
			}
		}) as typeof api.storage.local.set
		const mk = (contract: string) => ({ id: 0, profileId: "p1", chainId: 1, contract, name: "T", symbol: "T", decimals: 9 })

		const restored = await tokenService.restore([mk("0xaaa")])

		api.storage.local.set = realSet as typeof api.storage.local.set
		expect(restored[0].restoreError).toMatch(/network deleted/)
		expect(await tokenRowCount(api)).toBe(0)
	})

	test("restore rejects rows for a dead/purging chain per-row (restoreError, no write)", async () => {
		const { tokenService, api, networkLive } = await makeHarness()
		networkLive.value = false
		const mk = (contract: string) => ({ id: 0, profileId: "p1", chainId: 1, contract, name: "T", symbol: "T", decimals: 9 })

		const restored = await tokenService.restore([mk("0xaaa"), mk("0xbbb")])

		expect(restored[0].restoreError).toMatch(/network deleted/)
		expect(restored[1].restoreError).toMatch(/network deleted/)
		expect(await tokenRowCount(api)).toBe(0)
	})

	test("a deletion completing DURING findToken rejects the fast-path read exit too (F11)", async () => {
		// The entry assert passes (fence fresh), findToken parks, the deletion
		// begins AND settles, and the re-imported row is what findToken returns —
		// only a re-assert at the read exit stops the stale flow claiming the
		// successor's row as its own success.
		const { tokenService, api, deletionState } = await makeHarness()
		await tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xdead"), { origin: "popup" })
		const fence = { profileId: "p1", epoch: deletionState.capture("p1"), session: 1 }

		const realGet = api.storage.local.get.bind(api.storage.local)
		let armed = true
		api.storage.local.get = (async (key: unknown) => {
			const value = await realGet(key as never)
			if (armed) {
				armed = false
				deletionState.beginDeletion("p1")
				deletionState.release("p1")
			}
			return value
		}) as typeof api.storage.local.get

		await expect(tokenService.addTokenAuthorized(fence, "p1", NETWORK.id, "0xacc", ti("0xdead"), { origin: "popup" })).rejects.toThrow(
			/deleted|not current/i,
		)
		api.storage.local.get = realGet as typeof api.storage.local.get
	})

	test("a deletion completing DURING the metadata fetch rejects the write (entry-capture pin)", async () => {
		// begin + RELEASE while parked: the deletion fully settles, so only a
		// fence captured at the AUTHORIZING entry still rejects — a fence minted
		// at commit would observe the settled epoch and land the orphan row.
		const { tokenService, fetchStub, api, deletionState } = await makeHarness()
		const gate = _deferred<[string, string, number]>()
		fetchStub.mockReturnValueOnce(gate.promise)

		const writes = recordWrites(api.storage.local, "nulo:core:tokens@")
		const run = tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xdead"), { origin: "popup" })
		await new Promise((r) => setTimeout(r, 0))
		deletionState.beginDeletion("p1")
		deletionState.release("p1")
		gate.resolve(["Name", "SYM", 9])

		await expect(run).rejects.toThrow(/^profile p1 is being deleted — write rejected \(epoch 0 → 1\)$/)
		writes.restore()
		expect(writes.log).toEqual([])
		expect(await tokenRowCount(api)).toBe(0)
	})

	test("a chain deleted during the metadata fetch rejects the write (liveness-at-commit pin)", async () => {
		const { tokenService, fetchStub, api } = await makeHarness()
		const gate = _deferred<[string, string, number]>()
		fetchStub.mockReturnValueOnce(gate.promise)
		const networks = (tokenService as unknown as { networks: { isNetworkLive: (id: string) => Promise<boolean> } }).networks

		const run = tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xdead"), { origin: "popup" })
		await new Promise((r) => setTimeout(r, 0))
		networks.isNetworkLive = async () => false
		gate.resolve(["Name", "SYM", 9])

		await expect(run).rejects.toThrow(/network deleted/)
		expect(await tokenRowCount(api)).toBe(0)
	})

	test("a deletion landing DURING the row write is compensated away before any emit", async () => {
		const { tokenService, api, deletionState } = await makeHarness()
		const emitted: unknown[] = []
		tokenService.onTokenAdded.add((t) => emitted.push(t))
		const writes = recordWrites(api.storage.local, "nulo:core:tokens@", () => deletionState.beginDeletion("p1"))

		await expect(tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xbeef"), { origin: "popup" })).rejects.toThrow(
			/^profile p1 deleted$/,
		)
		writes.restore()
		expect(writes.log).toHaveLength(2)
		expect(writes.log[1]).toBe(writes.log[0]?.replace(/^set:/, "remove:"))
		expect(await tokenRowCount(api)).toBe(0)
		expect(emitted).toHaveLength(0)
	})

	test("a deletion landing DURING the row write refuses before the post-write network check", async () => {
		const { tokenService, api, deletionState, networkLive } = await makeHarness()
		const networks = (tokenService as unknown as { networks: { isNetworkLive: (id: string) => Promise<boolean> } }).networks
		const checks: string[] = []
		networks.isNetworkLive = async () => {
			checks.push("live")
			return networkLive.value
		}
		const writes = recordWrites(api.storage.local, "nulo:core:tokens@", () => {
			checks.push("written")
			deletionState.beginDeletion("p1")
		})

		await expect(tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xbeef"), { origin: "popup" })).rejects.toThrow(
			/^profile p1 deleted$/,
		)
		writes.restore()
		expect(checks.slice(checks.indexOf("written"))).toEqual(["written"])
	})

	test("a deletion landing DURING the last network check is compensated away before any emit", async () => {
		const { tokenService, api, deletionState, networkLive } = await makeHarness()
		const emitted: unknown[] = []
		tokenService.onTokenAdded.add((t) => emitted.push(t))
		const networks = (tokenService as unknown as { networks: { isNetworkLive: (id: string) => Promise<boolean> } }).networks
		let checks = 0
		networks.isNetworkLive = async () => {
			checks += 1
			if (checks === 2) deletionState.beginDeletion("p1")
			return networkLive.value
		}
		const writes = recordWrites(api.storage.local, "nulo:core:tokens@")

		await expect(tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xbeef"), { origin: "popup" })).rejects.toThrow(
			/^profile p1 deleted$/,
		)
		writes.restore()
		expect(writes.log).toHaveLength(2)
		expect(writes.log[1]).toBe(writes.log[0]?.replace(/^set:/, "remove:"))
		expect(checks).toBe(2)
		expect(await tokenRowCount(api)).toBe(0)
		expect(emitted).toHaveLength(0)
	})

	test("an add the watchdog released in its last network check neither emits nor deletes a same-id restore's row", async () => {
		// The token lock's watchdog admits the profile's purge while the add is parked, so a deletion
		// and a same-id restore that reuses the add's token id both complete before it resumes.
		const { tokenService, api, deletionState, networkLive } = await makeHarness()
		const emitted: unknown[] = []
		tokenService.onTokenAdded.add((t) => emitted.push(t))
		const networks = (tokenService as unknown as { networks: { isNetworkLive: (id: string) => Promise<boolean> } }).networks
		const lastCheck = _deferred<void>()
		let checks = 0
		networks.isNetworkLive = async () => {
			checks += 1
			if (checks === 2) await lastCheck.promise
			return networkLive.value
		}
		const tokenRows = async () => Object.entries(await api.storage.local.get(null)).filter(([k]) => k.startsWith("nulo:core:tokens@"))
		vi.useFakeTimers()
		try {
			const run = tokenService.addToken("p1", NETWORK.id, "0xacc", ti("0xbeef"), { origin: "popup" }).catch((error: unknown) => error)
			await vi.advanceTimersByTimeAsync(0)
			expect(checks).toBe(2)
			const [[addKey]] = await tokenRows()

			await vi.advanceTimersByTimeAsync(5 * 60_000 + 1)
			deletionState.beginDeletion("p1")
			await tokenService.purgeForProfile("p1")
			deletionState.release("p1")
			const [restored] = await tokenService.restore([
				{ id: 0, profileId: "p1", chainId: 1, contract: "0xcafe", name: "T", symbol: "T", decimals: 9 },
			])
			expect(restored.restoreError).toBeUndefined()
			expect(`nulo:core:tokens@${restored.id}`).toBe(addKey)
			lastCheck.resolve()

			expect(await run).toEqual(expect.objectContaining({ message: "profile p1 deleted" }))
		} finally {
			vi.useRealTimers()
		}
		const rows = await tokenRows()
		expect(rows).toHaveLength(1)
		expect(String(rows[0][1])).toContain("0xcafe")
		expect(emitted).toHaveLength(0)
	})
})

describe("TokenService — a token-lock holder the watchdog released", () => {
	const WATCHDOG_MS = 5 * 60_000 + 1
	const mk = (contract: string, profileId = "p1") => ({ id: 0, profileId, chainId: 1, contract, name: "T", symbol: "T", decimals: 9 })

	function gate<T = void>() {
		let resolve!: (v: T) => void
		let reject!: (e: unknown) => void
		const promise = new Promise<T>((res, rej) => {
			resolve = res
			reject = rej
		})
		return { promise, resolve, reject }
	}

	type Harness = Awaited<ReturnType<typeof makeHarness>>
	type Networks = {
		isNetworkLive: (id: string) => Promise<boolean>
		isChainLive: (profileId: string, chainId: number) => Promise<boolean>
	}
	const networksOf = (h: Harness) => (h.tokenService as unknown as { networks: Networks }).networks

	async function setup() {
		const h = await makeHarness()
		const added: string[] = []
		h.tokenService.onTokenAdded.add((t) => {
			added.push(t.contract)
		})
		vi.useFakeTimers()
		return { ...h, added }
	}
	afterEach(() => {
		vi.useRealTimers()
	})

	const add = (h: Harness, contract: string) => h.tokenService.addToken("p1", NETWORK.id, "0xacc", ti(contract), { origin: "popup" })
	const settle = () => vi.advanceTimersByTimeAsync(0)
	const release = () => vi.advanceTimersByTimeAsync(WATCHDOG_MS)
	async function rows(h: Harness): Promise<Record<string, string>> {
		const out: Record<string, string> = {}
		for (const [key, raw] of Object.entries(await h.api.storage.local.get(null))) {
			if (key.startsWith("nulo:core:tokens@")) out[key.slice("nulo:core:tokens@".length)] = JSON.parse(raw as string).contract
		}
		return out
	}
	const stagesOf = (h: Harness, opId: string) =>
		(h.journal.transitionOperation.mock.calls as unknown as [string, { stage: string }][])
			.filter(([id]) => id === opId)
			.map(([, progress]) => progress.stage)

	/** Holds the answer of the `nth` read of `key`, already taken, until `release`. */
	function holdRead(h: Harness, key: string, nth = 1) {
		const get = h.api.storage.local.get.bind(h.api.storage.local)
		const held = gate()
		const reached = gate()
		let reads = 0
		h.api.storage.local.get = (async (keys?: string | string[] | null) => {
			const answer = await get(keys)
			if (keys === key && ++reads === nth) {
				reached.resolve()
				await held.promise
			}
			return answer
		}) as typeof h.api.storage.local.get
		return { reached: reached.promise, release: () => held.resolve() }
	}

	/** Parks the `nth` call of `isNetworkLive` until `release(answer)`; other calls read `networkLive`. */
	function holdNetworkCheck(h: Harness, nth: number) {
		const held = gate<boolean>()
		let calls = 0
		networksOf(h).isNetworkLive = async () => {
			calls += 1
			return calls === nth ? await held.promise : h.networkLive.value
		}
		return { calls: () => calls, release: (answer: boolean) => held.resolve(answer) }
	}

	test("released in the pre-set network check, it resumes on a fresh id: an add that took its id keeps its row", async () => {
		const h = await setup()
		const check = holdNetworkCheck(h, 1)
		const first = add(h, "0xa11")
		await settle()
		expect(check.calls()).toBe(1)
		await release()

		await add(h, "0xb0b")
		check.release(true)
		await first

		expect(Object.values(await rows(h)).sort()).toEqual(["0xa11", "0xb0b"])
		expect(h.added).toEqual(["0xb0b", "0xa11"])
		expect(h.fetchStub).toHaveBeenCalledTimes(2)
	})

	test("released in the fetch, it reports a same-contract add that landed meanwhile and writes nothing", async () => {
		const h = await setup()
		h.journal.createOperation.mockResolvedValueOnce({ id: "op-1" }).mockResolvedValueOnce({ id: "op-2" })
		const fetch = gate<[string, string, number]>()
		h.fetchStub.mockReturnValueOnce(fetch.promise)
		const first = add(h, "0xa11")
		await settle()
		await release()

		const second = await add(h, "0xa11")
		fetch.resolve(["Late", "LATE", 6])

		expect(await first).toEqual(second)
		expect(Object.values(await rows(h))).toEqual(["0xa11"])
		expect(h.added).toEqual(["0xa11"])
		expect(stagesOf(h, "op-1")).toEqual(["simulating", "succeeded"])
	})

	test("released in the fetch and again in the resumed pre-set check, it still writes one row and emits once", async () => {
		const h = await setup()
		const fetch = gate<[string, string, number]>()
		h.fetchStub.mockReturnValueOnce(fetch.promise)
		const check = holdNetworkCheck(h, 2)
		const run = add(h, "0xa11")
		await settle()
		await release()
		fetch.resolve(["Name", "NAM", 6])
		await settle()
		expect(check.calls()).toBe(2)
		await release()
		check.release(true)
		await run

		expect(Object.values(await rows(h))).toEqual(["0xa11"])
		expect(h.added).toEqual(["0xa11"])
		expect(h.fetchStub).toHaveBeenCalledTimes(1)
	})

	test("released while its set is still applying, a successor waits for that set before it allocates", async () => {
		const h = await setup()
		const set = gate()
		let sets = 0
		const writes = recordWrites(h.api.storage.local, "nulo:core:tokens@", undefined, () => (++sets === 1 ? set.promise : undefined))
		const first = add(h, "0xa11")
		await settle()
		expect(sets).toBe(1)
		await release()

		const second = add(h, "0xb0b")
		await settle()
		set.resolve()
		await Promise.all([first, second])
		writes.restore()

		expect(Object.values(await rows(h)).sort()).toEqual(["0xa11", "0xb0b"])
		expect(h.added.sort()).toEqual(["0xa11", "0xb0b"])
	})

	test("its set rejecting while a successor drains it, the successor also waits for the failure it journals", async () => {
		const h = await setup()
		const set = gate()
		const failed = gate()
		recordWrites(h.api.storage.local, "nulo:core:tokens@", undefined, () => set.promise)
		;(h.journal.transitionOperation as ReturnType<typeof vi.fn>).mockImplementation(async (...args: unknown[]) => {
			if ((args[1] as { stage: string }).stage === "failed") await failed.promise
		})
		const first = add(h, "0xa11").catch((error: unknown) => error)
		await settle()
		await release()
		let admitted = false
		const successor = h.tokenService.restore([]).then(() => {
			admitted = true
		})
		await settle()
		expect(admitted).toBe(false)

		set.reject(new Error("disk full"))
		await settle()
		expect(admitted).toBe(false)
		failed.resolve()
		await successor
		expect(admitted).toBe(true)
		expect(await first).toEqual(expect.objectContaining({ message: "disk full" }))
	})

	test("an add parked before the lock while its profile is deleted and restored with that contract rejects", async () => {
		const h = await setup()
		const created = gate<{ id: string }>()
		h.journal.createOperation.mockReturnValueOnce(created.promise)
		const run = add(h, "0xa11")
		await settle()
		h.deletionState.beginDeletion("p1")
		h.deletionState.release("p1")
		const [restored] = await h.tokenService.restore([mk("0xa11")])
		expect(restored.restoreError).toBeUndefined()
		created.resolve({ id: "op-1" })

		await expect(run).rejects.toThrow(/^profile p1 deleted$/)
		expect(stagesOf(h, "op-1")).not.toContain("succeeded")
		expect(Object.values(await rows(h))).toEqual(["0xa11"])
	})

	test.each([
		{ name: "another token", identical: false, replacement: () => mk("0xccc") },
		{ name: "the same token, byte for byte", identical: true, replacement: (own: string) => JSON.parse(own) },
	])("released after its set, it keeps a restore's row at its id on a replaced network: $name", async ({ identical, replacement }) => {
		const h = await setup()
		const check = holdNetworkCheck(h, 2)
		networksOf(h).isChainLive = async () => true
		const run = add(h, "0xa11").catch((error: unknown) => error)
		await settle()
		expect(check.calls()).toBe(2)
		const [[key, own]] = Object.entries(await h.api.storage.local.get(null)).filter(([k]) => k.startsWith("nulo:core:tokens@"))
		await release()

		h.networkLive.value = false
		await h.tokenService.clearChainState("p1", 1)
		const [restored] = await h.tokenService.restore([replacement(own as string)])
		expect(`nulo:core:tokens@${restored.id}`).toBe(key)
		const written = (await h.api.storage.local.get(key))[key]
		expect(written === own).toBe(identical)
		check.release(false)

		expect(await run).toEqual(expect.objectContaining({ message: "network deleted" }))
		expect((await h.api.storage.local.get(key))[key]).toBe(written)
	})

	test("released in the dead-chain read, it deletes nothing on resume", async () => {
		const h = await setup()
		h.networkLive.value = true
		let chainReads = 0
		const chainRead = gate<boolean>()
		networksOf(h).isChainLive = async () => (++chainReads === 1 ? await chainRead.promise : true)
		let checks = 0
		networksOf(h).isNetworkLive = async () => ++checks === 1
		const run = add(h, "0xa11").catch((error: unknown) => error)
		await settle()
		expect(chainReads).toBe(1)
		await release()

		await h.tokenService.clearChainState("p1", 1)
		const [restored] = await h.tokenService.restore([mk("0xccc")])
		chainRead.resolve(false)

		expect(await run).toEqual(expect.objectContaining({ message: "network deleted" }))
		expect(await rows(h)).toEqual({ [`${restored.id}`]: "0xccc" })
	})

	test("released after its set while the person deleted the token, it succeeds without announcing a row", async () => {
		const h = await setup()
		const check = holdNetworkCheck(h, 2)
		const run = add(h, "0xa11")
		await settle()
		await release()

		const [id] = Object.keys(await rows(h))
		await h.tokenService.deleteToken(Number(id))
		check.release(true)

		expect((await run).contract).toBe("0xa11")
		expect(h.added).toEqual([])
		expect(await rows(h)).toEqual({})
		expect(stagesOf(h, "op-1")).toEqual(["simulating", "succeeded"])
	})

	test("resumed after its set, a deletion beginning while it reads its row rejects it with no success", async () => {
		const h = await setup()
		const check = holdNetworkCheck(h, 2)
		const run = add(h, "0xa11").catch((error: unknown) => error)
		await settle()
		await release()
		const [id] = Object.keys(await rows(h))
		const read = holdRead(h, `nulo:core:tokens@${id}`)
		check.release(true)
		await read.reached
		h.deletionState.beginDeletion("p1")
		read.release()

		expect(await run).toEqual(expect.objectContaining({ message: "profile p1 deleted" }))
		expect(stagesOf(h, "op-1")).not.toContain("succeeded")
		expect(h.added).toEqual([])
	})

	test("owned throughout, a network deletion that reserves and sweeps during its post-set check fails it with no row", async () => {
		const h = await setup()
		vi.useRealTimers()
		const factory = new FakeNodeFactory()
		for (const chainId of [1, 2]) {
			factory.setOverrides(`https://rpc.test/${chainId}`, {
				getNodeInfo: vi.fn().mockResolvedValue({ l1ChainId: 0, rollupVersion: chainId }) as never,
			})
		}
		const networks = new NetworkService(new LoggerStore(new ConfigStore()), h.api, factory)
		Object.assign(networks as unknown as Record<string, unknown>, {
			initialized: true,
			pxeServiceClient: { clearChainState: async () => {} },
			profileService: {
				getActiveProfile: async () => ({ id: "p1" }),
				getDeletionState: () => h.deletionState,
				captureExecutionFence: async () => ({ profileId: "p1", epoch: h.deletionState.capture("p1"), session: 1 }),
			},
		})
		const doomed = await networks.addNetwork("One", "https://rpc.test/1")
		await networks.setActiveNetwork((await networks.addNetwork("Two", "https://rpc.test/2")).id)
		networks.registerChainPurgeSubscriber((profileId, chainId) => h.tokenService.clearChainState(profileId, chainId))
		Object.assign(networksOf(h), {
			isNetworkLive: (id: string) => networks.isNetworkLive(id),
			isChainLive: (profileId: string, chainId: number) => networks.isChainLive(profileId, chainId),
		})
		const postSetRead = holdRead(h, `nulo:core:networks@${doomed.id}`, 2)
		const run = h.tokenService.addToken("p1", doomed.id, "0xacc", ti("0xa11"), { origin: "popup" }).catch((error: unknown) => error)
		await postSetRead.reached
		await networks.deleteNetwork(doomed.id)
		postSetRead.release()

		expect(await run).toEqual(expect.objectContaining({ message: "network deleted" }))
		expect(h.added).toEqual([])
		expect(await rows(h)).toEqual({})
	})

	test("released after its set on a dead chain, it removes its own row on resume", async () => {
		const h = await setup()
		const check = holdNetworkCheck(h, 2)
		const run = add(h, "0xa11").catch((error: unknown) => error)
		await settle()
		await release()
		h.networkLive.value = false
		check.release(false)

		expect(await run).toEqual(expect.objectContaining({ message: "network deleted" }))
		expect(await rows(h)).toEqual({})
	})

	test("a fetch rejected after the release journals its failure before a token operation queued after it runs", async () => {
		const h = await setup()
		const fetch = gate<[string, string, number]>()
		h.fetchStub.mockReturnValueOnce(fetch.promise)
		const failed = gate()
		;(h.journal.transitionOperation as ReturnType<typeof vi.fn>).mockImplementation(async (...args: unknown[]) => {
			if ((args[1] as { stage: string }).stage === "failed") await failed.promise
		})
		const run = add(h, "0xa11").catch((error: unknown) => error)
		await settle()
		await release()
		fetch.reject(new Error("metadata boom"))
		await settle()

		let ran = false
		const queued = h.tokenService.restore([]).then(() => {
			ran = true
		})
		await settle()
		expect(ran).toBe(false)
		failed.resolve()
		await queued
		expect(ran).toBe(true)
		expect(await run).toEqual(expect.objectContaining({ message: "metadata boom" }))
	})

	test("a restore released in a row's pre-set chain read refuses that row and the rest; an add's row at its id survives", async () => {
		const h = await setup()
		let chainReads = 0
		const chainRead = gate<boolean>()
		networksOf(h).isChainLive = async () => (++chainReads === 1 ? await chainRead.promise : true)
		const restoring = h.tokenService.restore([mk("0xaaa"), mk("0xbbb")])
		await settle()
		expect(chainReads).toBe(1)
		await release()

		const added = await add(h, "0xb0b")
		chainRead.resolve(true)

		expect((await restoring).map((r) => r.restoreError)).toEqual(["token lock lost", "token lock lost"])
		expect(await rows(h)).toEqual({ [`${added.id}`]: "0xb0b" })
	})

	test("a deletion released after its read refuses to delete the row that reused the id", async () => {
		const h = await setup()
		const { id } = await add(h, "0xa11")
		const read = holdRead(h, `nulo:core:tokens@${id}`, 2)
		const deleting = h.tokenService.deleteToken(id).catch((error: unknown) => error)
		await read.reached
		await release()

		await h.tokenService.deleteToken(id)
		const [restored] = await h.tokenService.restore([mk("0xccc")])
		expect(restored.id).toBe(id)
		read.release()

		expect(await deleting).toEqual(expect.objectContaining({ message: "token lock lost" }))
		expect(await rows(h)).toEqual({ [`${id}`]: "0xccc" })
	})

	test("a deletion released while its remove applies still announces the removal", async () => {
		const h = await setup()
		const { id } = await add(h, "0xa11")
		const deleted: number[] = []
		h.tokenService.onTokenDeleted.add((t) => {
			deleted.push(t.id)
		})
		const removal = gate()
		const remove = h.api.storage.local.remove.bind(h.api.storage.local)
		h.api.storage.local.remove = async (keys) => {
			await removal.promise
			await remove(keys)
		}
		const deleting = h.tokenService.deleteToken(id)
		await settle()
		await release()
		removal.resolve()

		expect((await deleting).id).toBe(id)
		expect(deleted).toEqual([id])
		expect(await rows(h)).toEqual({})
	})

	test("a profile purge released after its snapshot throws instead of deleting another profile's row at a freed id", async () => {
		const h = await setup()
		const a = await add(h, "0xa11")
		const b = await add(h, "0xa22")
		const read = holdRead(h, `nulo:core:tokens@${a.id}`)
		const purging = h.tokenService.purgeForProfile("p1").catch((error: unknown) => error)
		await read.reached
		await release()

		await h.tokenService.deleteToken(b.id)
		const [restored] = await h.tokenService.restore([mk("0xccc", "p2")])
		expect(restored.id).toBe(b.id)
		read.release()

		expect(await purging).toEqual(expect.objectContaining({ message: "token lock lost" }))
		expect(await rows(h)).toEqual({ [`${a.id}`]: "0xa11", [`${b.id}`]: "0xccc" })
	})
})
