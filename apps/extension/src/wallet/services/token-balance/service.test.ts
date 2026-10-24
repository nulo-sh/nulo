/**
 * Pins the token→balance purge cascade: when a token is deleted,
 * `TokenBalanceService.onTokenDeleted` must remove every token-balance row for
 * that token (and emit a delete per row) while leaving other tokens' balances
 * untouched. This is the load-bearing data-integrity hop reached transitively
 * by `NetworkService.purgeChain` → `TokenService.clearChainState` →
 * `onTokenDeleted`; the network coordinator and the `purgeRows` helper are
 * tested elsewhere, but this final hop (a plain loop, not a purgeRows site) had
 * no direct coverage — a broken version would orphan balances from a
 * deleted/purged token. Exercises the REAL handler + REAL BalanceRepository
 * over an in-memory chrome.storage shim (the established repo-test pattern).
 */

import { EventHandler } from "@nulo/wallet-core/utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { deferred } from "@nulo/wallet-core/utils"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { EntityStorage } from "@/wallet/storage"
import { ACCOUNT_SERVICE_NAME } from "@/wallet/services/account/spec"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { EXECUTION_SERVICE_NAME } from "@/wallet/services/execution/spec"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { TASK_SERVICE_NAME } from "@/wallet/services/task/spec"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import { awaitedBus } from "../../../../tests/helpers/held-read"
import { svc } from "../composition-harness"
import { BalanceRepository } from "./balance-repository"
import { reconcilePlan } from "./reconcile-pairs"
import { TokenBalanceService } from "./service"
import type { TokenBalanceRaw } from "./spec"
import { rowKeysForEveryProfile, readsKey } from "@/wallet/storage/sealed-entity-storage.testing"

/** One key for every profile, as the profile fakes hold it. */
const { rowKeys: ROW_KEYS } = await rowKeysForEveryProfile()

/** A service built without `init()` still seals: its repository reads the profile service's keys.
 *  A test that starts the service replaces this with the registered profile service. */
function withRowKeys(service: TokenBalanceService): TokenBalanceService {
	;(service as unknown as { profileService: unknown }).profileService = { rowKeys: ROW_KEYS }
	return service
}

const balance = (id: number, token: number, overrides: Partial<TokenBalanceRaw> = {}): TokenBalanceRaw => ({
	id,
	token,
	account: "0xaccount",
	profileId: "A",
	chainId: 1,
	contract: `0xtok${token}`,
	privateBalance: "0",
	publicBalance: "0",
	updatedAt: 0,
	...overrides,
})

// The deletion payload carries the FULL identity (id, profileId, chainId,
// contract) — the handler's delete filter is identity-exact, so the fixture
// must align with `balance()`'s stamps.
const tokenInfo = (id: number) =>
	({ id, profileId: "A", chainId: 1, name: `T${id}`, symbol: `T${id}`, decimals: 18, contract: `0xtok${id}` }) as never

const accountA = { address: "0xa", chainId: 1, index: 0, profileId: "A" }

interface WorldOptions {
	/** The active profile `init` reads; `null` for none. */
	profile?: { id: string; name: string } | null
	/** Seeded through the repository before the service is built. */
	rows?: TokenBalanceRaw[]
	/** Seeded as raw storage entries before the service is built. */
	raw?: Record<string, string>
	/** The account service's `getAccountsRaw` answer. */
	accounts?: unknown[]
	getAccounts?: (...args: never[]) => Promise<unknown>
	/** The token service's `getTokensRaw`: a fixed answer, or the read itself. */
	tokens?: unknown[] | ((profileId: string) => Promise<unknown>)
	getTokenRaw?: (id: number) => Promise<unknown>
	/** The task service stub; by default it mints task `t1`. */
	task?: Record<string, unknown>
	deletionState?: ProfileDeletionState
}

/**
 * The real service and repository over seeded storage and stub peers, built but not started, so a
 * test acts before `init` between `world` and `start`. Each peer event is an awaited bus. A no-op
 * ticker keeps the balance queue from scheduling a real interval.
 */
async function world(opts: WorldOptions = {}) {
	const api = new FakeBrowserApi()
	api.reset()
	const repo = new BalanceRepository(api, ROW_KEYS)
	for (const row of opts.rows ?? []) await repo.set(row)
	if (opts.raw) await api.storage.local.set(opts.raw)
	const bus = {
		onActiveProfileChanged: awaitedBus<never>(),
		onAccountAdded: awaitedBus<never>(),
		onTokenAdded: awaitedBus<never>(),
		onTokenDeleted: awaitedBus<never>(),
		onTokenUpdated: awaitedBus<never>(),
		onTransactionUpdated: awaitedBus<never>(),
	}
	const tokens = opts.tokens ?? []
	const rowKeysReady = new EventHandler<string>()
	const services = new ServiceCollection()
	services.add(
		svc(PROFILE_SERVICE_NAME, {
			rowKeys: ROW_KEYS,
			onRowKeysReady: rowKeysReady,
			onActiveProfileChanged: bus.onActiveProfileChanged,
			getActiveProfile: async () => (opts.profile === null ? undefined : (opts.profile ?? { id: "A", name: "A" })),
			getDeletionState: () => opts.deletionState ?? new ProfileDeletionState(),
		}),
	)
	services.add(svc(NETWORK_SERVICE_NAME, {}))
	services.add(
		svc(ACCOUNT_SERVICE_NAME, {
			registerAccountPurgeSubscriber: () => {},
			onAccountAdded: bus.onAccountAdded,
			getAccountsRaw: async () => opts.accounts ?? [],
			...(opts.getAccounts && { getAccounts: opts.getAccounts }),
		}),
	)
	services.add(
		svc(TOKEN_SERVICE_NAME, {
			onTokenAdded: bus.onTokenAdded,
			onTokenDeleted: bus.onTokenDeleted,
			onTokenUpdated: bus.onTokenUpdated,
			getTokensRaw: typeof tokens === "function" ? tokens : async () => tokens,
			...(opts.getTokenRaw && { getTokenRaw: opts.getTokenRaw }),
		}),
	)
	services.add(svc(TRANSACTION_SERVICE_NAME, { onTransactionUpdated: bus.onTransactionUpdated }))
	services.add(svc(EXECUTION_SERVICE_NAME, {}))
	services.add(svc(TASK_SERVICE_NAME, opts.task ?? { createNewTask: () => ({ id: "t1" }) }))
	const noopTicker = { subscribe: () => ({ cancel: () => {} }) } as never
	const service = new TokenBalanceService(new LoggerStore(new ConfigStore()), api, noopTicker)
	services.add(service)
	return { api, repo, service, bus, rowKeysReady, start: () => services.start() }
}

describe("TokenBalanceService sealing at rest", () => {
	const key = (id: number) => `nulo:core:token-balances@${id}`
	const token100 = { id: 100, profileId: "A", chainId: 1, name: "T100", symbol: "T100", decimals: 18, contract: "0xtok100" }

	test("conversion against purge: the purge waits for the row's sealed commit, then no row remains", async () => {
		const legacy = JSON.stringify(balance(1, 100, { privateBalance: "123456789" }))
		const { api, service, rowKeysReady, start } = await world({ raw: { [key(1)]: legacy }, tokens: [token100] })
		await start()
		const area = api.storage.local
		const realGet = area.get.bind(area)
		const realSet = area.set.bind(area)
		const reached = deferred()
		const release = deferred()
		let parkFinalRead = true
		// The conversion's only read naming the row's key is its last one, inside its hold.
		area.get = async (keys) => {
			const got = await realGet(keys)
			if (parkFinalRead && readsKey(keys, key(1))) {
				parkFinalRead = false
				reached.resolve()
				await release.promise
			}
			return got
		}
		const sealedWrites: string[] = []
		area.set = async (items) => {
			for (const [k, v] of Object.entries(items)) if (typeof v === "string" && v.includes('"sealed"')) sealedWrites.push(k)
			return realSet(items)
		}

		rowKeysReady.invoke("A")
		await reached.promise
		let purged = false
		const purge = service.purgeForTokens([100], "A").then(() => {
			purged = true
		})
		for (let turn = 0; turn < 5; turn++) await new Promise((r) => setTimeout(r, 0))
		expect(purged).toBe(false)
		expect((await realGet(key(1)))[key(1)]).toBe(legacy)

		release.resolve()
		await purge
		expect(sealedWrites).toEqual([key(1)])
		expect(Object.keys(await realGet()).filter((k) => k.startsWith("nulo:core:token-balances@"))).toEqual([])
	})

	test("the startup sweep removes a pre-identity row and never matches a sealed one", async () => {
		const preIdentity = { id: 2, token: 100, account: "0xa", updatedAt: 0 }
		const { api, start } = await world({ rows: [balance(1, 100)], raw: { [key(2)]: JSON.stringify(preIdentity) }, tokens: [token100] })
		await start()
		const stored = await api.storage.local.get()
		expect(stored[key(2)]).toBeUndefined()
		expect(JSON.parse(stored[key(1)] as string)).toEqual({ profileId: "A", sealed: expect.any(String) })
	})
})

describe("TokenBalanceService.requestBalanceRefresh — missing-pair contract", () => {
	test("an absent (token, account) balance pair returns {missing:true} (NOT a throw)", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const service = withRowKeys(new TokenBalanceService(new LoggerStore(new ConfigStore()), api))
		// Empty repo → no balance row for the pair. The old contract THREW here; the drain could not
		// distinguish that from a transient storage failure and would discard the durable outbox row.
		const result = await service.requestBalanceRefresh(999, "0xnobody")
		expect(result).toEqual({ missing: true })
	})
})

describe("TokenBalanceService.onTokenDeleted purge cascade", () => {
	let service: TokenBalanceService
	let seedRepo: BalanceRepository
	let api: FakeBrowserApi

	beforeEach(() => {
		// One FakeBrowserApi shared by the service's internal repo and the test's
		// seedRepo (same fixed storage key) so the test can seed + assert without
		// reaching into privates.
		api = new FakeBrowserApi()
		api.reset()
		seedRepo = new BalanceRepository(api, ROW_KEYS)
		service = withRowKeys(new TokenBalanceService(new LoggerStore(new ConfigStore()), api))
	})

	const invokeDelete = (id: number) =>
		(service as unknown as { onTokenDeleted: (t: ReturnType<typeof tokenInfo>) => Promise<void> }).onTokenDeleted(tokenInfo(id))

	test("removes every balance row for the deleted token, leaves other tokens' rows", async () => {
		await seedRepo.set(balance(1, 1))
		await seedRepo.set(balance(2, 1))
		await seedRepo.set(balance(3, 2))

		await invokeDelete(1)

		const remaining = await seedRepo.getAll()
		expect(remaining.map((b) => b.id).sort()).toEqual([3])
		expect(remaining.every((b) => b.token !== 1)).toBe(true)
	})

	test("emits onTokenBalanceDeleted once per purged row", async () => {
		await seedRepo.set(balance(1, 1))
		await seedRepo.set(balance(2, 1))
		await seedRepo.set(balance(3, 2))

		const emit = vi.spyOn(service as unknown as { emit: (e: string, p: unknown) => void }, "emit")
		await invokeDelete(1)

		const deletes = emit.mock.calls.filter(([e]) => e === "onTokenBalanceDeleted")
		expect(deletes).toHaveLength(2)
	})

	test("deleting a token with no balances is a no-op", async () => {
		await seedRepo.set(balance(3, 2))

		await invokeDelete(1)

		expect((await seedRepo.getAll()).map((b) => b.id)).toEqual([3])
	})

	test("a successor's rows at a RE-MINTED token id survive the departed token's handler (identity filter)", async () => {
		// Numeric token ids are max+1-reallocatable: after A→B, B can re-mint
		// this very id for a DIFFERENT token. The delete filter is identity-exact
		// (profileId + chainId + contract, not just the id), so the departed
		// handler must delete only its own rows and leave the successor's.
		await seedRepo.set(balance(1, 1))
		await seedRepo.set(balance(2, 1, { profileId: "B", contract: "0xreminted" }))

		await invokeDelete(1)

		const remaining = await seedRepo.getAll()
		expect(remaining.map((b) => b.id)).toEqual([2])
		expect(remaining[0].profileId).toBe("B")
	})
})

describe("TokenBalanceService.purgeForTokens — raw second pass, profile scoping", () => {
	function bareWorld() {
		const api = new FakeBrowserApi()
		api.reset()
		const service = withRowKeys(new TokenBalanceService(new LoggerStore(new ConfigStore()), api))
		// purgeForTokens gates on ensureInitialized; init() wires the projector +
		// event subs, none of which the storage purge touches — flip the flag
		// instead of stubbing seven services for one purge pin.
		;(service as unknown as { initialized: boolean }).initialized = true
		return { api, service, seedRepo: new BalanceRepository(api, ROW_KEYS) }
	}

	test("removes a malformed balance row for a purged token; spares another token's and an unattributable one", async () => {
		const { api, service, seedRepo } = bareWorld()
		await seedRepo.set(balance(1, 5))
		await api.storage.local.set({
			"nulo:core:token-balances@97": JSON.stringify({ token: 5, junk: true }),
			"nulo:core:token-balances@98": JSON.stringify({ token: 5, profileId: "A", junk: true }),
			"nulo:core:token-balances@99": JSON.stringify({ token: 6, profileId: "A", junk: true }),
		})

		await service.purgeForTokens([5], "A")

		const raw = await api.storage.local.get(null)
		// No profileId → unattributable → fail-closed debris, never purge-reachable.
		expect(raw["nulo:core:token-balances@97"]).toBeDefined()
		expect(raw["nulo:core:token-balances@98"]).toBeUndefined()
		expect(raw["nulo:core:token-balances@99"]).toBeDefined()
		expect(await seedRepo.getAll()).toEqual([])
	})

	test("a resumed deletion purging a REUSED token id spares the successor profile's row and live-map entry", async () => {
		const { service, seedRepo } = bareWorld()
		// Profile A died mid-deletion holding token id 5 in its tombstone; profile B
		// later reused id 5. The resume must erase only A's leftovers.
		await seedRepo.set(balance(1, 5))
		await seedRepo.set(balance(2, 5, { profileId: "B", contract: "0xtokB" }))
		const successor = { id: 5, profileId: "B", chainId: 1, contract: "0xtokB", name: "B", symbol: "B", decimals: 18 }
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to the private map
		;(service as any).tokens.set(5, successor)

		await service.purgeForTokens([5], "A")

		expect((await seedRepo.getAll()).map((r) => r.id)).toEqual([2])
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to the private map
		expect(((service as any).tokens as Map<number, unknown>).get(5)).toBe(successor)
	})
})

describe("TokenBalanceService.restore — hostile-row validation", () => {
	let service: TokenBalanceService
	let seedRepo: BalanceRepository
	let deletionState: ProfileDeletionState
	let rawApi: FakeBrowserApi

	beforeEach(async () => {
		deletionState = new ProfileDeletionState()
		// restore() gates on ensureInitialized(), so run the real lifecycle over stub peers.
		const w = await world({
			profile: null,
			deletionState,
			// restore() derives identity from the profile's OWN token table — the
			// explicit-profileId read, not the (empty pre-activation) active map.
			tokens: async (profileId: string) =>
				profileId === "p1"
					? [
							{ id: 1, profileId: "p1", chainId: 1, contract: "0xtok1" },
							{ id: 2, profileId: "p1", chainId: 1, contract: "0xtok2" },
						]
					: [],
			task: {},
		})
		rawApi = w.api
		seedRepo = w.repo
		service = w.service
		await w.start()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	test("fenced-id incarnation guard: allocation SKIPS ids fenced this lifetime, so a reused id can neither eat a stale write nor stay suppressed", async () => {
		// Simulate: row 5 (the allocator's NEXT id — max existing is 4) was
		// deleted this lifetime and fenced while its old projection is still in
		// flight. A same-lifetime restore must skip PAST it (the ABA/suppression
		// hole: a reused id could eat a stale write or stay suppressed forever).
		await seedRepo.set(balance(4, 1))
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to the private fence
		;(service as any).invalidatedBalanceIds.add(5)

		const [restored] = await service.restore([balance(999, 1)], "p1")
		expect(restored.restoreError).toBeUndefined()
		expect(restored.id).toBe(6) // allocator's 5 was fenced → skipped
		// The new row's own projections are NOT suppressed by the fence.
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to the private fence
		expect(((service as any).invalidatedBalanceIds as Set<number>).has(restored.id)).toBe(false)
	})

	test("records a schema-invalid row as restoreError and never writes it", async () => {
		// account must be a string; a hostile backup row with a non-string account
		// would pass EntityStorage's write but be codec-hidden on read (invisible to
		// a later getValues() cleanup). restore() must parse-reject it up front.
		const bad = { id: 5, token: 1, account: 123, updatedAt: 0 } as unknown as TokenBalanceRaw

		const [restored] = await service.restore([bad], "p1")

		expect(restored.restoreError).toBeTruthy()
		expect(await seedRepo.getAll()).toEqual([])
	})

	test("restore clears both freshness signals: a future-dated updatedAt and a carried syncFailure are dropped", async () => {
		const stale = balance(999, 1, { updatedAt: 9_999_999_999_999, syncFailure: { at: 1, message: "planted" } })
		const [restored] = await service.restore([stale], "p1")
		expect(restored.restoreError).toBeUndefined()
		const [row] = await seedRepo.getAll()
		expect(row.updatedAt).toBe(0)
		expect(row.syncFailure).toBeUndefined()
		// Which is exactly the shape the reconciler schedules for a fresh projection.
		const plan = reconcilePlan({
			tokens: [{ id: row.token, profileId: row.profileId, chainId: row.chainId, contract: row.contract }],
			accounts: [{ address: row.account, chainId: row.chainId, index: 0 }],
			existing: [row],
		})
		expect(plan.staleTokens).toEqual([row])
		expect(plan.missing).toEqual([])
	})

	test("writes a valid row under a freshly allocated id (input id is ignored)", async () => {
		const [restored] = await service.restore([balance(999, 1)], "p1")

		expect(restored.restoreError).toBeUndefined()
		const all = await seedRepo.getAll()
		expect(all).toHaveLength(1)
		expect(all[0].token).toBe(1)
	})

	test("a malformed row does not abort the batch — the valid sibling still lands", async () => {
		const bad = { id: 5, token: 1, account: 123, updatedAt: 0 } as unknown as TokenBalanceRaw

		const restored = await service.restore([bad, balance(7, 2)], "p1")

		expect(restored[0].restoreError).toBeTruthy()
		expect(restored[1].restoreError).toBeUndefined()
		expect((await seedRepo.getAll()).map((b) => b.token)).toEqual([2])
	})

	test("a deleteProfile beginning DURING the restore rejects every later row write", async () => {
		const origSet = rawApi.storage.local.set.bind(rawApi.storage.local)
		let fired = false
		rawApi.storage.local.set = async (items: Record<string, unknown>) => {
			await origSet(items)
			if (!fired) {
				fired = true
				deletionState.beginDeletion("p1")
			}
		}
		const restored = await service.restore([balance(1, 1), balance(2, 2)], "p1")
		expect(restored[0].restoreError).toBeUndefined()
		expect(restored[1].restoreError).toMatch(/deleted/)
		expect((await seedRepo.getAll()).map((b) => b.token)).toEqual([1])
	})

	test("fails closed when the created-profile id is missing", async () => {
		for (const bad of ["", undefined, 5]) {
			await expect(service.restore([balance(1, 1)], bad as never)).rejects.toThrow(/^restore requires the created profile id$/)
		}
		expect(await seedRepo.getAll()).toEqual([])
	})

	test("blob-claimed identity fields are overwritten from the profile's own token table", async () => {
		const forged = { ...balance(1, 1), profileId: "evil", chainId: 999, contract: "0xevil" }
		const [restored] = await service.restore([forged], "p1")
		expect(restored.restoreError).toBeUndefined()
		const [row] = await seedRepo.getAll()
		expect(row.profileId).toBe("p1")
		expect(row.chainId).toBe(1)
		expect(row.contract).toBe("0xtok1")
	})

	test("a row referencing a token the profile does not own is rejected, not written", async () => {
		const [restored] = await service.restore([balance(1, 3)], "p1")
		expect(restored.restoreError).toMatch(/does not own/)
		expect(await seedRepo.getAll()).toEqual([])
	})

	test("duplicate (token, account) pairs collapse — the registry only dedupes row ids", async () => {
		const restored = await service.restore([balance(1, 1), balance(2, 1)], "p1")
		expect(restored[0].restoreError).toBeUndefined()
		expect(restored[1].restoreError).toMatch(/duplicate balance pair/)
		expect(await seedRepo.getAll()).toHaveLength(1)
	})

	test("a batch whose rows all name a token the profile does not own lists no balance keys and writes nothing", async () => {
		const listings = vi.spyOn(EntityStorage.prototype, "getKeys")
		const restored = await service.restore([balance(1, 3), balance(2, 4), balance(3, 3)], "p1")
		expect(restored).toHaveLength(3)
		for (const r of restored) expect(r.restoreError).toMatch(/does not own/)
		expect(listings).not.toHaveBeenCalled()
		expect(await seedRepo.getAll()).toEqual([])
	})

	test("one valid row followed by repeats of its pair lists the balance keys once and writes once", async () => {
		const listings = vi.spyOn(EntityStorage.prototype, "getKeys")
		const restored = await service.restore([balance(1, 1), balance(2, 1), balance(3, 1), balance(4, 1)], "p1")
		expect(restored[0].restoreError).toBeUndefined()
		for (const r of restored.slice(1)) expect(r.restoreError).toMatch(/duplicate balance pair/)
		expect(listings).toHaveBeenCalledOnce()
		expect(await seedRepo.getAll()).toHaveLength(1)
	})

	test("valid rows restore under distinct fresh ids after exactly one listing (control)", async () => {
		await seedRepo.set(balance(7, 2, { account: "0xseeded" }))
		const listings = vi.spyOn(EntityStorage.prototype, "getKeys")
		const restored = await service.restore(
			[balance(1, 1), balance(2, 2), balance(3, 1, { account: "0xother" }), balance(4, 2, { account: "0xother" })],
			"p1",
		)
		expect(restored.map((r) => r.restoreError)).toEqual([undefined, undefined, undefined, undefined])
		expect(restored.map((r) => r.id)).toEqual([8, 9, 10, 11])
		expect(listings).toHaveBeenCalledOnce()
		expect((await seedRepo.getAll()).map((b) => b.id).sort((a, b) => a - b)).toEqual([7, 8, 9, 10, 11])
	})
})

describe("TokenBalanceService.onActiveProfileChanged — token-map rebuild generation fence", () => {
	const tokenRaw = (id: number, profileId: string) =>
		({ id, profileId, chainId: 1, name: `T${id}`, symbol: `T${id}`, decimals: 18, contract: `0xtok${id}` }) as never

	test("(REBUILD-FENCE PIN) a slow rebuild for a switched-away profile never repopulates the active map", async () => {
		// Two profiles, one token each; a balance row per token so getTokenBalances
		// (which filters by the in-memory active-token map) can observe the map.
		const rows = [
			balance(1, 100), // profile A's token
			balance(2, 200, { profileId: "B" }), // profile B's token
		]

		// A's raw-token fetch is slow (resolves LAST); B's is immediate. The bug: A's
		// late rebuild sets its token into the map that now belongs to active profile B.
		let resolveA!: (v: unknown) => void
		const getTokensRaw = vi.fn().mockImplementation((profileId?: string) => {
			if (profileId === "A") return new Promise((r) => (resolveA = r))
			if (profileId === "B") return Promise.resolve([tokenRaw(200, "B")])
			return Promise.resolve([])
		})

		const { service, start } = await world({ profile: null, rows, tokens: getTokensRaw, task: {} })
		await start() // active profile undefined → empty map

		const handler = (service as unknown as { onActiveProfileChanged: (p?: { id: string; name: string }) => Promise<void> })
			.onActiveProfileChanged

		const switchA = handler({ id: "A", name: "A" }) // suspends on the slow getTokensRaw(A)
		const switchB = handler({ id: "B", name: "B" }) // resolves immediately → commits {200}
		await switchB
		resolveA([tokenRaw(100, "A")]) // A's stale rebuild resolves after the switch away
		await switchA

		// Active profile is B; the map must hold B's token ONLY — A's late rebuild is fenced out.
		const visible = (await service.getTokenBalances()).map((b) => b.token.id).sort((x, y) => x - y)
		expect(visible).toEqual([200])
	})

	test("(FAN-OUT PIN) onTokenAdded aborts after a mid-fan-out profile switch — no cross-context balance persisted", async () => {
		// The account fan-out parks here so a switch can land mid-flight.
		const accounts = deferred<unknown>()
		const accountsReached = deferred()
		const getAccounts = vi.fn().mockImplementation(() => {
			accountsReached.resolve()
			return accounts.promise
		})
		const { service, bus, start } = await world({ getAccounts, getTokenRaw: async () => tokenRaw(100, "A") })
		await start() // active profile A, empty token map

		const setSpy = vi.spyOn((service as never as { repo: { set: (...a: unknown[]) => Promise<void> } }).repo, "set")

		// A token is added under A; its account fan-out parks on getAccounts.
		const added = bus.onTokenAdded.dispatch(tokenRaw(100, "A"))
		await accountsReached.promise
		expect(getAccounts).toHaveBeenCalled()

		// The user switches profile mid-fan-out — bumps the generation.
		await bus.onActiveProfileChanged.dispatch({ id: "B", name: "B" } as never)

		// Release the accounts; onTokenAdded resumes and must bail on the generation
		// check before persisting any balance for the now-departed context.
		accounts.resolve([{ address: "0xa", chainId: 1 }])
		await added

		expect(setSpy).not.toHaveBeenCalled()
	})

	test("(CREATE-BALANCE PIN) a switch DURING the balance write skips the emit/enqueue for the departed context", async () => {
		const { service, bus, start } = await world({
			getAccounts: async () => [{ address: "0xa", chainId: 1 }],
			getTokenRaw: async () => tokenRaw(100, "A"),
		})
		await start()

		// Park inside the id ALLOCATION (before repo.set) so a switch lands past the
		// loop-level fence but inside createTokenBalance's own await window.
		const alloc = deferred<number>()
		const allocReached = deferred()
		vi.spyOn(
			(service as never as { repo: { allocateIdAvoiding: (avoid: ReadonlySet<number>) => Promise<number> } }).repo,
			"allocateIdAvoiding",
		).mockImplementation(() => {
			allocReached.resolve()
			return alloc.promise
		})
		const setSpy = vi.spyOn((service as never as { repo: { set: (b: unknown) => Promise<void> } }).repo, "set")

		const added = bus.onTokenAdded.dispatch(tokenRaw(100, "A"))
		await allocReached.promise

		// The switch's own reconcile queues behind the parked creation's lock hold.
		const switched = bus.onActiveProfileChanged.dispatch({ id: "B", name: "B" } as never)
		alloc.resolve(5)
		await Promise.all([added, switched])

		// The context departed mid-allocation: the write must be skipped entirely.
		expect(setSpy).not.toHaveBeenCalled()
	})

	test("boot sweep creates the row a worker death left missing, and re-queues one it never projected", async () => {
		// Token 100 has no row at all (died before repo.set); token 200 has a row
		// stuck at updatedAt 0 (died before enqueue — the card spins forever).
		const { api, start } = await world({
			rows: [balance(7, 200, { account: "0xa" })],
			accounts: [accountA],
			tokens: [tokenRaw(100, "A"), tokenRaw(200, "A")],
		})
		await start()

		const rows = await new BalanceRepository(api, ROW_KEYS).getAll()
		// One row per (token, account) — the missing one created, the stale one
		// left in place rather than duplicated.
		expect(rows).toHaveLength(2)
		expect(new Set(rows.map((r) => r.token))).toEqual(new Set([100, 200]))
		expect(rows.find((r) => r.token === 200)?.id).toBe(7)
	})

	test("boot sweep writes NOTHING when every desired row already exists", async () => {
		const { start } = await world({
			rows: [balance(1, 100, { account: "0xa", updatedAt: 123 })],
			accounts: [accountA],
			tokens: [tokenRaw(100, "A")],
		})

		// The steady state is what runs on EVERY service-worker wake, so it must
		// cost zero writes.
		const setSpy = vi.spyOn(BalanceRepository.prototype, "set")
		try {
			await start()
			expect(setSpy).not.toHaveBeenCalled()
		} finally {
			setSpy.mockRestore()
		}
	})

	test("a key/id mismatched row is hidden and replaced; its physical bytes survive", async () => {
		// A valid-shaped row stored under the WRONG key. Served by getAll() before
		// the numeric identity guard, it would suppress repair for that pair.
		const { api, start } = await world({
			raw: {
				"nulo:core:token-balances@99": JSON.stringify({
					id: 1,
					token: 100,
					account: "0xa",
					publicBalance: "0",
					privateBalance: "0",
					updatedAt: 5,
				}),
			},
			accounts: [accountA],
			tokens: [tokenRaw(100, "A")],
		})
		await start()

		// Exactly one VISIBLE canonical row, freshly created and unresolved.
		const visible = await new BalanceRepository(api, ROW_KEYS).getAll()
		expect(visible).toHaveLength(1)
		expect(visible[0].updatedAt).toBe(0)
		expect(String(visible[0].id)).not.toBe("99")
		// The mismatched bytes are retained, not overwritten.
		const raw = await api.storage.local.get("nulo:core:token-balances@99")
		expect(raw["nulo:core:token-balances@99"]).toBeDefined()
	})

	test("a well-formed row at its own key stays visible under the identity guard", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const repo = new BalanceRepository(api, ROW_KEYS)
		await repo.set({
			id: 1,
			token: 100,
			account: "0xa",
			profileId: "A",
			chainId: 1,
			contract: "0xtok100",
			publicBalance: "0",
			privateBalance: "0",
			updatedAt: 9,
		})
		expect(await repo.getAll()).toHaveLength(1)
	})

	test("two creators racing the SAME pair produce exactly one row", async () => {
		// The lock serializes allocation, but that alone does not stop two holders
		// from each creating the same (token, account): the existence check has to
		// happen inside the same hold as the write. A sweep can be parked on its
		// read while a handler queues for the lock, then both create the pair.
		const flush = () => new Promise((r) => setTimeout(r, 0))
		const { api, service, bus, start } = await world({
			getAccounts: async () => [{ address: "0xa", chainId: 1 }],
			// Empty for the boot sweep so the pair does NOT exist when the two
			// handlers race — otherwise both take the already-present skip path
			// and the race window is never entered.
			accounts: [],
			tokens: [tokenRaw(100, "A")],
			getTokenRaw: async () => tokenRaw(100, "A"),
		})
		await start()

		const repo = service as never as {
			repo: { allocateIdAvoiding: (a: ReadonlySet<number>) => Promise<number> }
		}
		const real = repo.repo.allocateIdAvoiding.bind(repo.repo)
		const allocSpy = vi.spyOn(repo.repo, "allocateIdAvoiding").mockImplementation(async (avoid) => {
			const id = await real(avoid)
			await flush()
			return id
		})

		// Both handlers target token 100 on account 0xa — the SAME pair — and both are in flight
		// before either is awaited.
		await Promise.all([
			bus.onAccountAdded.dispatch({ address: "0xa", chainId: 1 } as never),
			bus.onTokenAdded.dispatch(tokenRaw(100, "A") as never),
		])

		const rows = await new BalanceRepository(api, ROW_KEYS).getAll()
		expect(rows.filter((r) => r.token === 100 && r.account === "0xa")).toHaveLength(1)
		// Exactly one allocation: the second holder must observe the first's write,
		// which only holds if the existence check runs inside the same hold.
		expect(allocSpy).toHaveBeenCalledTimes(1)
	})

	test("a creation parked mid-write cannot survive a token deletion", async () => {
		// Deletion queues behind an in-flight creation, so its snapshot includes
		// and sweeps the completed write.
		const { api, service, bus, start } = await world({ tokens: [tokenRaw(100, "A")] })
		await start()

		// Park the creation inside its physical write, then delete the token.
		const repo = service as never as { repo: BalanceRepository }
		const writeReached = deferred()
		const releaseWrite = deferred()
		const realPrepare = repo.repo.prepare.bind(repo.repo)
		vi.spyOn(repo.repo, "prepare").mockImplementationOnce(async (b) => {
			const write = await realPrepare(b)
			return {
				...write,
				commit: async () => {
					writeReached.resolve()
					await releaseWrite.promise
					return write.commit()
				},
			}
		})

		const creation = bus.onAccountAdded.dispatch({ address: "0xa", chainId: 1 } as never)
		await writeReached.promise
		// The deletion's lock acquisition is queued synchronously, behind the parked write's hold.
		const deletion = bus.onTokenDeleted.dispatch(tokenRaw(100, "A") as never)
		releaseWrite.resolve()
		await Promise.all([creation, deletion])

		// The deletion is serialized behind the creation, so it sweeps the row the
		// creation just wrote — nothing for the deleted token survives.
		const rows = await new BalanceRepository(api, ROW_KEYS).getAll()
		expect(rows.filter((r) => r.token === 100)).toHaveLength(0)
	})

	test("(init fence) a switch while init's token read is parked cannot repopulate the old profile", async () => {
		const initRead = deferred<unknown[]>()
		const initReadReached = deferred()
		let initReadSeen = false
		const { service, bus, start } = await world({
			tokens: async (profileId: string) => {
				// Park ONLY init's read (profile A, first call).
				if (!initReadSeen && profileId === "A") {
					initReadSeen = true
					initReadReached.resolve()
					return initRead.promise
				}
				return []
			},
		})

		const starting = start()
		await initReadReached.promise
		// Subscriptions are live before init finishes awaiting, so the switch lands
		// mid-init and bumps the generation.
		const switched = bus.onActiveProfileChanged.dispatch({ id: "B", name: "B" } as never)
		initRead.resolve([tokenRaw(100, "A")])
		await Promise.all([starting, switched])

		// A's token must not be in the map after the switch to B.
		const balances = service as never as { tokens: Map<number, unknown> }
		expect(balances.tokens.has(100)).toBe(false)
	})

	test("a never-projected row is re-queued at start, not just left alone", async () => {
		// A row that exists but was never projected must be queued for projection
		// at start; row-count assertions alone cannot observe that.
		const createNewTask = vi.fn(() => ({ id: "t1" }))
		const { start } = await world({
			rows: [balance(7, 100, { account: "0xa" })],
			accounts: [accountA],
			tokens: [tokenRaw(100, "A")],
			task: { createNewTask },
		})
		await start()

		// The queue mints one TaskService record per enqueued row, so the task
		// call is the observable proof the stale row was re-queued.
		expect(createNewTask).toHaveBeenCalled()
	})

	test("two concurrent creators never collide on an id — the allocator is serialized", async () => {
		// `allocateIdAvoiding` is max+1 over the live key space, and event
		// subscribers dispatch un-awaited, so an account-added and a token-added
		// handler can interleave. Unserialized they read the same pre-write key
		// space, compute the same id, and the later repo.set silently overwrites
		// the earlier row — a balance disappears with no onTokenBalanceDeleted.
		const flush = () => new Promise((r) => setTimeout(r, 0))
		const { api, service, bus, start } = await world({
			getAccounts: async () => [{ address: "0xa", chainId: 1 }],
			// Token 100 is already mapped, so the account-added path has work.
			tokens: [tokenRaw(100, "A")],
			getTokenRaw: async () => tokenRaw(200, "A"),
		})
		await start()

		const repo = service as never as { repo: BalanceRepository }
		// Every allocation resolves on the NEXT tick, so an unserialized second
		// caller has a window to read the same key space before the first writes.
		const real = repo.repo.allocateIdAvoiding.bind(repo.repo)
		vi.spyOn(repo.repo, "allocateIdAvoiding").mockImplementation(async (avoid) => {
			const id = await real(avoid)
			await flush()
			return id
		})
		const written: number[] = []
		const realPrepare = repo.repo.prepare.bind(repo.repo)
		vi.spyOn(repo.repo, "prepare").mockImplementation(async (b) => {
			const write = await realPrepare(b)
			return {
				...write,
				commit: () => {
					written.push(b.id)
					return write.commit()
				},
			}
		})

		// Both creators in flight at once, the way independent RPCs produce them: `invoke` does not
		// await its subscribers, so neither dispatch is awaited before the other starts.
		await Promise.all([
			bus.onAccountAdded.dispatch({ address: "0xb", chainId: 1 } as never),
			bus.onTokenAdded.dispatch(tokenRaw(200, "A") as never),
		])

		expect(written).toHaveLength(2)
		expect(new Set(written).size).toBe(2)
		const rows = await new BalanceRepository(api, ROW_KEYS).getAll()
		expect(rows).toHaveLength(2)
		expect(new Set(rows.map((r) => `${r.token}:${r.account}`)).size).toBe(2)
	})
})

describe("TokenBalanceService legacy sweep + schema transition", () => {
	test("200 legacy rows are swept at init, non-legacy debris survives, the live pair is recreated once, bounded", async () => {
		// 200 legacy-shape rows (no identity fields) for ONE live pair, plus two
		// survivors the sweep must NOT touch: a partial-new row (carries profileId —
		// different provenance) and a legacy-shaped row at a mismatched key.
		const seed: Record<string, string> = {}
		for (let i = 1; i <= 200; i++) {
			seed[`nulo:core:token-balances@${i}`] = JSON.stringify({ id: i, token: 100, account: "0xa", updatedAt: 0 })
		}
		seed["nulo:core:token-balances@300"] = JSON.stringify({ id: 300, token: 100, account: "0xa", profileId: "A", updatedAt: 0 })
		seed["nulo:core:token-balances@301"] = JSON.stringify({ id: 999, token: 100, account: "0xa", updatedAt: 0 })
		const { api, start } = await world({
			raw: seed,
			accounts: [accountA],
			tokens: [{ id: 100, profileId: "A", chainId: 1, contract: "0xtok100", name: "T", symbol: "T", decimals: 18 }],
		})
		const startedAt = Date.now()
		await start()
		const elapsed = Date.now() - startedAt

		const raw = await api.storage.local.get(null)
		const balanceKeys = Object.keys(raw).filter((k) => k.startsWith("nulo:core:token-balances@"))
		expect(balanceKeys).toContain("nulo:core:token-balances@300")
		expect(balanceKeys).toContain("nulo:core:token-balances@301")
		for (let i = 1; i <= 200; i++) {
			expect(raw[`nulo:core:token-balances@${i}`]).toBeUndefined()
		}
		const rows = await new BalanceRepository(api, ROW_KEYS).getAll()
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ token: 100, account: "0xa", profileId: "A", chainId: 1, contract: "0xtok100" })
		// The whole init (sweep + reconcile + projection enqueue) over a 200-row
		// store must stay interactive.
		expect(elapsed).toBeLessThan(10_000)
	})
})

describe("TokenBalanceService reconcile — identity hardening", () => {
	const liveToken = { id: 100, profileId: "A", chainId: 1, contract: "0xtok100", name: "T", symbol: "T", decimals: 18 }

	test("a dead incarnation's row at a reused token id is deleted, fenced, and replaced by the canonical pair", async () => {
		const { service, repo, start } = await world({
			rows: [balance(7, 100, { contract: "0xdeadbeef", updatedAt: 5 })],
			tokens: [liveToken],
			accounts: [accountA],
		})
		await start()
		const rows = await repo.getAll()
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ token: 100, account: "0xa", contract: "0xtok100" })
		expect(rows[0].id).not.toBe(7)
		// The stale id is fenced: an in-flight projection for it can never write.
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to the private fence
		expect(((service as any).invalidatedBalanceIds as Set<number>).has(7)).toBe(true)
		expect((await service.getTokenBalances()).map((b) => b.id)).toEqual([rows[0].id])
	})

	test("a row whose token id has NO live token is left in place — but never rendered", async () => {
		const { service, repo, start } = await world({
			rows: [balance(7, 999, { contract: "0xwhatever", updatedAt: 5 })],
			tokens: [liveToken],
			accounts: [accountA],
		})
		await start()
		const rows = await repo.getAll()
		// The possibly-codec-hidden-token case: deletion here would destroy
		// recoverable data, so the row survives; identity filtering hides it.
		expect(rows.map((r) => r.id).sort()).toContain(7)
		const visible = await service.getTokenBalances()
		expect(visible.map((b) => b.token.id)).toEqual([100])
	})

	test("shared address across profiles: only the active profile's row renders, the foreign row is untouched", async () => {
		const { service, repo, start } = await world({
			rows: [
				balance(1, 100, { account: "0xa", updatedAt: 5 }),
				balance(2, 555, { account: "0xa", profileId: "B", contract: "0xtok555", updatedAt: 5 }),
			],
			tokens: [liveToken],
			accounts: [accountA],
		})
		await start()
		expect((await service.getTokenBalances()).map((b) => b.id)).toEqual([1])
		expect((await repo.getAll()).map((r) => r.id).sort()).toEqual([1, 2])
	})

	test("the queue's emit gate answers a strict false for a row whose token is absent from the map", async () => {
		const { service, start } = await world({ accounts: [accountA], tokens: [liveToken] })
		await start()
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to the queue's callbacks
		const gate = (service as any).queue.callbacks.isRowEmittable as (row: TokenBalanceRaw) => unknown
		expect(gate(balance(1, 100, { contract: "0xtok100" }))).toBe(true)
		expect(gate(balance(2, 100, { contract: "0xdead" }))).toBe(false)
		expect(gate(balance(3, 999, { contract: "0xtok999" }))).toBe(false)
	})
})

describe("TokenBalanceService row↔token checks — every entry point serves only a row matching its own token", () => {
	const liveToken = { id: 100, profileId: "A", chainId: 1, contract: "0xtok100", name: "T", symbol: "T", decimals: 18 }
	const good = balance(1, 100, { account: "0xa", contract: "0xtok100" })
	const dead = balance(2, 100, { account: "0xa", contract: "0xdead" })
	const absent = balance(3, 999, { account: "0xa", contract: "0xtok999" })

	async function primed() {
		const api = new FakeBrowserApi()
		api.reset()
		const repo = new BalanceRepository(api, ROW_KEYS)
		for (const row of [good, dead, absent]) await repo.set(row)
		const service = withRowKeys(new TokenBalanceService(new LoggerStore(new ConfigStore()), api))
		const enqueued: number[] = []
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-ins replacing what init would wire
		const internals = service as any
		internals.initialized = true
		internals.tokens.set(100, liveToken)
		internals.queue = {
			enqueue: (row: TokenBalanceRaw) => enqueued.push(row.id),
			hasPendingTask: () => false,
			getPendingTaskId: () => "t1",
		}
		internals.profileService = { rowKeys: ROW_KEYS, getActiveProfile: async () => ({ id: "A", name: "A", type: "password" }) }
		internals.tokenService = { getTokensRaw: async () => [liveToken] }
		const emitted: number[] = []
		service.onTokenBalanceDeleted.add((b) => {
			emitted.push(b.id)
		})
		return { service, internals, enqueued, emitted, repo }
	}

	test("reads and refreshes", async () => {
		const { service, enqueued } = await primed()
		expect((await service.getTokenBalance(1)).id).toBe(1)
		for (const id of [2, 3]) {
			await expect(service.getTokenBalance(id)).rejects.toThrow(/^unknown token balance id$/)
			await expect(service.refreshTokenBalance(id)).rejects.toThrow(/^unknown token balance id$/)
		}
		expect((await service.getTokenBalances()).map((b) => b.id)).toEqual([1])
		await service.refreshTokenBalance(1)
		await service.refreshAccountBalances("0xa")
		expect(await service.requestBalanceRefresh(100, "0xa")).toEqual({ taskId: "t1" })
		expect(await service.requestBalanceRefresh(999, "0xa")).toEqual({ missing: true })
		expect(enqueued).toEqual([1, 1, 1])
	})

	test("the narrowed tx refresh and the backup export", async () => {
		const { service, internals, enqueued } = await primed()
		await internals.enqueueNarrowedBalances(new Set(["0xa"]), new Set([100, 999]))
		expect(enqueued).toEqual([1])
		expect((await service.backup()).map((b) => b.id)).toEqual([1])
	})

	test("pair occupancy: a dead incarnation does not hold the pair's slot", async () => {
		const { internals } = await primed()
		const pair = [{ token: liveToken, account: { address: "0xa" } }]
		await internals.lock.withLock(async () => {
			expect(await internals.ensurePairsHoldingLock(pair, internals.profileGeneration, [good])).toBe(0)
			expect(await internals.ensurePairsHoldingLock(pair, internals.profileGeneration, [dead])).toBe(1)
		})
	})

	test("both purges delete every scoped row but emit only for the row matching its token", async () => {
		const a = await primed()
		await a.service.purgeForTokens([100, 999], "A")
		expect(a.emitted).toEqual([1])
		expect(await a.repo.getAll()).toEqual([])
		const b = await primed()
		await b.service.purgeForAccounts([{ chainId: 1, address: "0xa" }], "A")
		expect(b.emitted).toEqual([1])
		expect(await b.repo.getAll()).toEqual([])
	})
})

describe("TokenBalanceService.purgeForAccounts — tuple-scoped account purge", () => {
	// The purge touches only repo + lock + fence (like purgeForTokens' raw-pass
	// test): flip the init flag instead of stubbing seven services.
	function bareService() {
		const api = new FakeBrowserApi()
		api.reset()
		const service = withRowKeys(new TokenBalanceService(new LoggerStore(new ConfigStore()), api))
		;(service as unknown as { initialized: boolean }).initialized = true
		return { api, service, repo: new BalanceRepository(api, ROW_KEYS) }
	}
	const fenced = (service: TokenBalanceService, id: number) =>
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to the private fence
		((service as any).invalidatedBalanceIds as Set<number>).has(id)

	test("spares the sibling profile's rows at the SAME address — bare-address scoping would destroy them", async () => {
		const { service, repo } = bareService()
		await repo.set(balance(1, 100, { account: "0xshared" }))
		await repo.set(balance(2, 200, { account: "0xshared", profileId: "B" }))
		await service.purgeForAccounts([{ chainId: 1, address: "0xshared" }], "A")
		expect((await repo.getAll()).map((r) => r.id)).toEqual([2])
		expect(fenced(service, 1)).toBe(true)
		expect(fenced(service, 2)).toBe(false)
	})

	test("spares the SAME profile's rows on ANOTHER chain — address+profile scoping would destroy them", async () => {
		const { service, repo } = bareService()
		await repo.set(balance(1, 100, { account: "0xaddr" }))
		await repo.set(balance(2, 200, { account: "0xaddr", chainId: 2 }))
		await service.purgeForAccounts([{ chainId: 1, address: "0xaddr" }], "A")
		expect((await repo.getAll()).map((r) => r.id)).toEqual([2])
	})

	test("completes with an EMPTY/foreign active token map — deletes every scoped row, no throw, ids fenced", async () => {
		const { service, repo } = bareService()
		await repo.set(balance(1, 100, { account: "0xa" }))
		await repo.set(balance(2, 300, { account: "0xa" }))
		await service.purgeForAccounts([{ chainId: 1, address: "0xa" }], "A")
		expect(await repo.getAll()).toEqual([])
		expect(fenced(service, 1)).toBe(true)
		expect(fenced(service, 2)).toBe(true)
	})

	test("raw second pass reaps a malformed NEW-SHAPE row in scope; old-shape rows are left to the legacy sweep", async () => {
		const { api, service } = bareService()
		await api.storage.local.set({
			"nulo:core:token-balances@98": JSON.stringify({ profileId: "A", chainId: 1, account: "0xa", junk: true }),
			"nulo:core:token-balances@99": JSON.stringify({ id: 99, token: 5, account: "0xa", updatedAt: 0 }),
		})
		await service.purgeForAccounts([{ chainId: 1, address: "0xa" }], "A")
		const raw = await api.storage.local.get(null)
		expect(raw["nulo:core:token-balances@98"]).toBeUndefined()
		expect(raw["nulo:core:token-balances@99"]).toBeDefined()
	})

	test("a purge racing a parked creation serializes on the shared lock — never a half state", async () => {
		const { service, repo } = bareService()
		const tokenA = { id: 100, profileId: "A", chainId: 1, contract: "0xtok100", name: "T", symbol: "T", decimals: 18 }
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to the private map/lock
		const anyService = service as any
		anyService.tokens.set(100, tokenA)
		await repo.set(balance(1, 100, { account: "0xa" }))
		const purge = service.purgeForAccounts([{ chainId: 1, address: "0xa" }], "A")
		const create = anyService.lock.withLock(() =>
			anyService.ensurePairsHoldingLock([{ token: tokenA, account: { address: "0xa" } }], anyService.profileGeneration),
		)
		await Promise.all([purge, create])
		const rows = await repo.getAll()
		// Either order is valid (purge→recreate leaves one FRESH row; create-noop→purge
		// leaves none). Forbidden: a fenced live row or a duplicate pair.
		expect(rows.length).toBeLessThanOrEqual(1)
		for (const row of rows) {
			expect(row.updatedAt).toBe(0)
			expect(fenced(service, row.id)).toBe(false)
		}
	})
})

describe("TokenBalanceService.onTokenUpdated — a balance carries its token's current metadata", () => {
	const tokenRaw = (id: number, profileId: string, over: Record<string, unknown> = {}) =>
		({ id, profileId, chainId: 1, name: `T${id}`, symbol: `T${id}`, decimals: 18, contract: `0xtok${id}`, ...over }) as never
	async function boot(stored: Record<number, unknown>) {
		const getTokenRaw = vi.fn(async (id: number) => stored[id] ?? Promise.reject(new Error("unknown token id")))
		const w = await world({ rows: [balance(1, 100)], tokens: [tokenRaw(100, "A", { symbol: "FAKE", decimals: 6 })], getTokenRaw })
		await w.start()
		const updated: { id: number; token: { decimals: number } }[] = []
		w.service.onTokenBalanceUpdated.add((b) => updated.push(b))
		const enqueue = vi.spyOn((w.service as never as { queue: { enqueue: (row: unknown) => void } }).queue, "enqueue")
		return { service: w.service, api: w.api, onTokenUpdated: w.bus.onTokenUpdated, getTokenRaw, updated, enqueue }
	}

	test("an updated token re-sends its balances with the new metadata at once and queues them for a re-read", async () => {
		const chain = tokenRaw(100, "A", { symbol: "TST", decimals: 18 })
		const { service, onTokenUpdated, updated, enqueue } = await boot({ 100: chain })
		expect((await service.getTokenBalances())[0].token).toMatchObject({ symbol: "FAKE", decimals: 6 })

		await onTokenUpdated.dispatch(chain)
		expect((await service.getTokenBalances())[0].token).toMatchObject({ symbol: "TST", decimals: 18 })
		expect(updated.map((b) => [b.id, b.token.decimals])).toEqual([[1, 18]])
		expect(enqueue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 1, token: 100 }))
	})

	test("an update for a token the map does not hold, or for another token at its id, changes and creates nothing", async () => {
		const foreign = tokenRaw(200, "B")
		const successor = tokenRaw(100, "A", { contract: "0xother", decimals: 18 })
		const { service, api, onTokenUpdated, getTokenRaw, updated, enqueue } = await boot({ 100: successor, 200: foreign })

		await Promise.all([onTokenUpdated.dispatch(foreign), onTokenUpdated.dispatch(successor)])
		expect(getTokenRaw.mock.calls).toEqual([[200], [100]])
		expect((await service.getTokenBalances())[0].token).toMatchObject({ symbol: "FAKE", decimals: 6 })
		expect(await new BalanceRepository(api, ROW_KEYS).getAll()).toHaveLength(1)
		expect(updated).toEqual([])
		expect(enqueue).not.toHaveBeenCalled()
	})
})
