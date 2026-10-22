/**
 * Unit tests for `AccountService.restore` validation + provenance hardening
 * using `FakeBrowserApi` + `svc` dependency stubs. Real service
 * lifecycle via `ServiceCollection`.
 */

import { beforeEach, describe, expect, test, vi } from "vitest"
import { keyedSegment } from "@nulo/wallet-crypto"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { deferred, EventHandler, type KeyedLock } from "@nulo/wallet-core/utils"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { ServiceCollection } from "@/wallet/base"
import { LoggerStore } from "@/wallet/logger"
import { ConfigStore } from "@/wallet/config"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { ERR_UNATTENDED_LIVE_CHECK, NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { loggedAfter } from "../../../../tests/helpers/logged"
import { svc } from "../composition-harness"
import { recordWrites } from "../storage-write-log"
import { ImportedKeysRepository } from "./imported-keys-repository"
import { AccountService } from "./service"
import { accountRowId, accountRowIdOf } from "./spec"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"

/** One key for every profile, as the profile fakes hold it. */
const ROW_KEY_FAKE = await rowKeysForEveryProfile()
const SEALED_0xI = accountRowId("p1", 1, await keyedSegment(ROW_KEY_FAKE.rowKeys("p1")!, "0xI"))

const mkAccount = (address: string, over: Record<string, unknown> = {}) =>
	({ profileId: "p1", chainId: 1, address, index: 0, type: 0, l1ChainId: 1, name: "A", visible: true, ...over }) as never

// The deletion-fence pins exercise createAccountInternal's ORDERING, not the real
// key derivation — bb.js WASM does not run in this vitest env (std::bad_cast).
vi.mock("@nulo/wallet-crypto", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	deriveAccountSeed: async () => new Fr(7n),
	unsealImportedSigningKeyV2: async () => new Uint8Array(32),
	sealImportedSigningKeyV2: async () => "sealed-under-destination",
}))
vi.mock("@nulo/aztec-runtime/account", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	NuloAccount: { new: async () => ({ address: { toString: () => "0xderived-addr" } }) },
}))

/** A liveness read that rejects after the row write, as a storage read error would. */
const readFailsOnSecondCall = (call: number): boolean => {
	if (call === 2) throw new Error("read failed")
	return true
}

/** Parks the first `get(rowKey)` after it returns, so the parked run holds a row it has already
 *  read; parked before the read, its resumed read would see fresh state. */
function parkRowRead(api: FakeBrowserApi, rowKey: string): { release: () => void; parked: Promise<void> } {
	const realGet = api.storage.local.get.bind(api.storage.local)
	let release!: () => void
	let reached!: () => void
	const parked = new Promise<void>((r) => {
		reached = r
	})
	let armed = true
	api.storage.local.get = (async (key: unknown) => {
		const value = await realGet(key as never)
		if (armed && key === rowKey) {
			armed = false
			reached()
			await new Promise<void>((r) => {
				release = r
			})
		}
		return value
	}) as typeof api.storage.local.get
	return { release: () => release(), parked }
}

describe("AccountService.createAccount — deletion fence", () => {
	async function makeHarness(over: { secret?: Promise<unknown>; probe?: Promise<number>; chainLive?: (call: number) => boolean } = {}) {
		const api = new FakeBrowserApi()
		api.reset()
		const deletion = new ProfileDeletionState()
		const master = new Fr(42n)
		const services = new ServiceCollection()
		let liveCalls = 0
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				...ROW_KEY_FAKE,
				onProfileDeleted: new EventHandler(),
				getDeletionState: () => deletion,
				getProfileSecret: () => over.secret ?? Promise.resolve(master),
			}),
		)
		services.add(
			svc(NETWORK_SERVICE_NAME, {
				registerChainPurgeSubscriber: () => {},
				isChainQuarantined: async () => false,
				isChainLive: async () => over.chainLive?.(++liveCalls) ?? true,
				resolveVerifiedL1ChainId: () => over.probe ?? Promise.resolve(1),
			}),
		)
		const service = new AccountService(new LoggerStore(new ConfigStore()), api)
		services.add(service)
		await services.start()
		const emit = vi.spyOn(service as unknown as { emit: (e: string, p: unknown) => void }, "emit")
		return { api, deletion, master, service, emit }
	}

	async function accountRowCount(api: FakeBrowserApi): Promise<number> {
		const raw = await api.storage.local.get(null)
		return Object.keys(raw).filter((k) => k.startsWith("nulo:core:accounts@")).length
	}

	test("a deletion completing DURING the secret await still rejects the write (capture-order pin)", async () => {
		// Discriminates capture-BEFORE-the-secret-await from capture-after: the
		// deletion begins AND fully releases while the secret promise is parked,
		// so a post-await capture would observe the settled post-bump epoch and
		// pass the pre-write assert — landing the orphan row.
		const gate = deferred<unknown>()
		const h = await makeHarness({ secret: gate.promise })
		const run = h.service.createAccount("p1", 1, 0, "A")
		await new Promise((r) => setTimeout(r, 0)) // the run captures its fence, then parks on the secret
		h.deletion.beginDeletion("p1")
		h.deletion.release("p1") // deletion fully completed — reservation gone, epoch settled
		gate.resolve(h.master)
		await expect(run).rejects.toThrow(/deleted|unauthorized/)
		expect(await accountRowCount(h.api)).toBe(0)
	})

	test("a deletion beginning during the network probe rejects the write", async () => {
		const gate = deferred<number>()
		const h = await makeHarness({ probe: gate.promise })
		const run = h.service.createAccount("p1", 1, 0, "A")
		await new Promise((r) => setTimeout(r, 0)) // let the run park on the probe
		h.deletion.beginDeletion("p1")
		gate.resolve(1)
		await expect(run).rejects.toThrow(/deleted/)
		expect(await accountRowCount(h.api)).toBe(0)
	})

	test("positive control: no deletion → the account row lands", async () => {
		const h = await makeHarness()
		const account = await h.service.createAccount("p1", 1, 0, "A")
		expect(account.address.length).toBeGreaterThan(0)
		expect(await accountRowCount(h.api)).toBe(1)
		expect(h.emit.mock.calls.filter(([e]) => e === "onAccountAdded")).toEqual([["onAccountAdded", account]])
	})

	test.each([
		["a chain reserved for deletion before the write: refused, nothing written", (call: number) => call !== 1, /^network deleted$/],
		["a chain reserved during the row write: the row is removed", (call: number) => call !== 2, /^network deleted$/],
		["a liveness read that fails after the row write: the row is removed", readFailsOnSecondCall, /^read failed$/],
	])("%s", async (_label, chainLive, refusal) => {
		const h = await makeHarness({ chainLive })
		await expect(h.service.createAccount("p1", 1, 0, "A")).rejects.toThrow(refusal)
		expect(await accountRowCount(h.api)).toBe(0)
		expect(h.emit).not.toHaveBeenCalled()
	})

	test("a profile deletion landing during the post-write liveness read: the row is removed, nothing emitted", async () => {
		const h = await makeHarness({
			chainLive: (call) => {
				if (call === 2) h.deletion.beginDeletion("p1")
				return true
			},
		})
		await expect(h.service.createAccount("p1", 1, 0, "A")).rejects.toThrow(/^profile p1 deleted$/)
		expect(await accountRowCount(h.api)).toBe(0)
		expect(h.emit).not.toHaveBeenCalled()
	})
})

describe("AccountService restore writers — deletion fence", () => {
	async function makeHarness() {
		const api = new FakeBrowserApi()
		api.reset()
		const deletion = new ProfileDeletionState()
		const services = new ServiceCollection()
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				...ROW_KEY_FAKE,
				onProfileDeleted: new EventHandler(),
				getDeletionState: () => deletion,
				consumeDekRewrapContext: async () => ({ sourceDek: {} as never, destinationDek: {} as never }),
			}),
		)
		services.add(
			svc(NETWORK_SERVICE_NAME, {
				registerChainPurgeSubscriber: () => {},
				isChainQuarantined: async () => false,
				isChainLive: async () => true,
				getL1ChainIdStored: async () => 1,
			}),
		)
		const service = new AccountService(new LoggerStore(new ConfigStore()), api)
		services.add(service)
		await services.start()
		return { api, deletion, service }
	}

	function armDeletionOnFirstWrite(api: FakeBrowserApi, deletion: ProfileDeletionState) {
		const origSet = api.storage.local.set.bind(api.storage.local)
		let fired = false
		api.storage.local.set = async (items: Record<string, unknown>) => {
			await origSet(items)
			if (!fired) {
				fired = true
				deletion.beginDeletion("p1")
			}
		}
	}

	test("restore: a deleteProfile beginning DURING the batch rejects every later row write", async () => {
		const h = await makeHarness()
		armDeletionOnFirstWrite(h.api, h.deletion)
		const restored = await h.service.restore([mkAccount("0xr1"), mkAccount("0xr2")])
		expect(restored[0].restoreError).toBeUndefined()
		expect(restored[1].restoreError).toMatch(/deleted/)
		const raw = await h.api.storage.local.get(null)
		expect(Object.keys(raw).some((k) => k.includes("0xr2"))).toBe(false)
	})

	test("restoreImportedKeys: a deleteProfile beginning DURING the batch rejects every later rewrap write", async () => {
		const h = await makeHarness()
		armDeletionOnFirstWrite(h.api, h.deletion)
		const mkKey = (address: string) => ({ profileId: "p1", chainId: 1, address, encryptedSigningKey: "sealed-src" })
		const restored = await h.service.restoreImportedKeys([mkKey("0xk1"), mkKey("0xk2")])
		expect(restored[0].restoreError).toBeUndefined()
		expect(restored[1].restoreError).toMatch(/deleted/)
		const raw = await h.api.storage.local.get(null)
		expect(Object.keys(raw).some((k) => k.includes("0xk2"))).toBe(false)
	})

	test("a hostile null row is a per-row restoreError, never a whole-slice abort", async () => {
		// The collision precheck extracts keys from every row — a raw null must be
		// excluded there (it would TypeError and abort the slice) yet still flow
		// to restoreRows for its own per-row error.
		const h = await makeHarness()
		const restored = await h.service.restore([mkAccount("0xr1"), null as never])
		expect(restored[0].restoreError).toBeUndefined()
		expect(typeof restored[1].restoreError).toBe("string")
	})

	test("null, primitive and empty rows are per-row restoreErrors in both writers; the valid row still lands", async () => {
		const h = await makeHarness()
		const hostile = [null, 5, {}] as never[]
		const accounts = await h.service.restore([...hostile, mkAccount("0xr1")])
		expect(accounts.map((r) => typeof r.restoreError)).toEqual(["string", "string", "string", "undefined"])
		const keys = await h.service.restoreImportedKeys([
			...hostile,
			{ profileId: "p1", chainId: 1, address: "0xk1", encryptedSigningKey: "sealed-src" },
		])
		expect(keys.map((r) => typeof r.restoreError)).toEqual(["string", "string", "string", "undefined"])
	})

	test("positive control: no deletion → all rows land through both writers", async () => {
		const h = await makeHarness()
		const accounts = await h.service.restore([mkAccount("0xr1"), mkAccount("0xr2")])
		expect(accounts.every((r) => r.restoreError === undefined)).toBe(true)
		const keys = await h.service.restoreImportedKeys([
			{ profileId: "p1", chainId: 1, address: "0xk1", encryptedSigningKey: "sealed-src" },
		])
		expect(keys[0].restoreError).toBeUndefined()
	})
})

describe("AccountService.restore — a chain the profile has no network for", () => {
	test("holds an imported row unchecked; refuses a derived row there and every row of a network that fails its validation", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const services = new ServiceCollection()
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				...ROW_KEY_FAKE,
				onProfileDeleted: new EventHandler(),
				getDeletionState: () => new ProfileDeletionState(),
			}),
		)
		services.add(
			svc(NETWORK_SERVICE_NAME, {
				registerChainPurgeSubscriber: () => {},
				getNetworksRaw: async (profileId: string) => [1, 2].map((chainId) => ({ profileId, chainId })),
				getL1ChainIdStored: async (_profileId: string, chainId: number) => {
					if (chainId === 1) return 1
					if (chainId === 2) throw new Error("Seeded network L1 identity mismatch: stored 9, expected 11155111")
					throw new Error(`No network for chain ${chainId} in this profile`)
				},
			}),
		)
		const service = new AccountService(new LoggerStore(new ConfigStore()), api)
		services.add(service)
		await services.start()
		const imported = (address: string, chainId: number) => mkAccount(address, { chainId, type: 1, l1ChainId: 5 })

		const results = await service.restore([
			imported("0xheld", 1337),
			mkAccount("0xderived", { chainId: 1337 }),
			imported("0xtampered", 2),
			imported("0xwrongl1", 1),
			mkAccount("0xok"),
		])

		expect(results.map((r) => r.restoreError)).toEqual([
			undefined,
			"No network for chain 1337 in this profile",
			"Seeded network L1 identity mismatch: stored 9, expected 11155111",
			"account/network chain identity mismatch: 5 vs 1",
			undefined,
		])
		const stored = Object.keys(await api.storage.local.get(null)).filter((k) => k.startsWith("nulo:core:accounts@"))
		expect(stored).toHaveLength(2)
		expect((await service.getAccountsRaw("p1")).map(accountRowIdOf).sort()).toEqual(
			[accountRowId("p1", 1337, "0xheld"), accountRowId("p1", 1, "0xok")].sort(),
		)
	})
})

describe("AccountService.restore — validation + provenance", () => {
	let accountService: AccountService
	let api: FakeBrowserApi

	beforeEach(async () => {
		api = new FakeBrowserApi()
		api.reset()
		const services = new ServiceCollection()
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				...ROW_KEY_FAKE,
				onProfileDeleted: new EventHandler(),
				getDeletionState: () => new ProfileDeletionState(),
			}),
		)
		services.add(
			svc(NETWORK_SERVICE_NAME, {
				registerChainPurgeSubscriber: () => {},
				isChainQuarantined: async () => false,
				isChainLive: async () => true,
				getL1ChainIdStored: async () => 1,
			}),
		)
		accountService = new AccountService(new LoggerStore(new ConfigStore()), api)
		services.add(accountService)
		await services.start()
	})

	test("rejects an empty/whitespace account address — never written", async () => {
		const [res] = await accountService.restore([mkAccount("   ")])
		expect(res.restoreError).toBeDefined()
		const raw = await api.storage.local.get(null)
		expect(Object.keys(raw).some((k) => k.startsWith("nulo:core:accounts@"))).toBe(false)
	})

	test("dedupes an address repeated within the same restore batch", async () => {
		const [ok, dup] = await accountService.restore([mkAccount("0xabc"), mkAccount("0xabc")])
		expect(ok.restoreError).toBeUndefined()
		expect(dup.restoreError).toBeDefined()
	})

	test("rejects a schema-malformed account row — never written + codec-hidden", async () => {
		const [res] = await accountService.restore([mkAccount("0xdef", { visible: "yes" })])
		expect(res.restoreError).toBeDefined()
		const raw = await api.storage.local.get(null)
		expect(Object.keys(raw).some((k) => k.includes("0xdef"))).toBe(false)
	})

	test("rejects an out-of-bound account index — negative / fractional / NaN / Infinity / >= 2^53", async () => {
		const badIndices: Array<[string, unknown]> = [
			["neg", -1],
			["frac", 1.5],
			["nan", Number.NaN],
			["inf", Number.POSITIVE_INFINITY],
			["unsafe", Number.MAX_SAFE_INTEGER],
		]
		for (const [label, index] of badIndices) {
			const [res] = await accountService.restore([mkAccount(`0xidx-${label}`, { index })])
			expect(res.restoreError, `index=${String(index)} must be rejected`).toBeDefined()
		}
		const raw = await api.storage.local.get(null)
		expect(Object.keys(raw).some((k) => k.startsWith("nulo:core:accounts@"))).toBe(false)
	})

	test("accepts the largest safe index (2^53 - 2) — the bound is < MAX_SAFE_INTEGER, not tighter", async () => {
		const [res] = await accountService.restore([mkAccount("0xbig", { index: Number.MAX_SAFE_INTEGER - 1 })])
		expect(res.restoreError).toBeUndefined()
	})

	test("a well-formed unique account restores cleanly", async () => {
		const [res] = await accountService.restore([mkAccount("0x111")])
		expect(res.restoreError).toBeUndefined()
		expect(await accountService.getAccount("p1", 1, "0x111")).toMatchObject({ address: "0x111" })
		// Sealed: the address is in no stored key or value.
		expect(JSON.stringify(await api.storage.local.get(null))).not.toContain("0x111")
	})

	test("two concurrent restores of the SAME account — the lock lets exactly ONE win", async () => {
		// Without the restore lock both would pass the (empty-store) intersection
		// check and both write the same row (ownership flip). The lock serialises
		// them → the 2nd sees the 1st's write → throws Duplicate.
		const results = await Promise.allSettled([
			accountService.restore([mkAccount("0xrace")]),
			accountService.restore([mkAccount("0xrace")]),
		])
		const fulfilled = results.filter((r) => r.status === "fulfilled")
		const rejected = results.filter((r) => r.status === "rejected")
		expect(fulfilled).toHaveLength(1)
		expect(rejected).toHaveLength(1)
		expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ message: expect.stringContaining("Duplicate account") })
	})

	test("the same address in two different profiles restores into two independent rows", async () => {
		// Same mnemonic imported twice derives one address per profile; each profile
		// owns its own row, so neither restore can take the other's account away.
		const [first] = await accountService.restore([mkAccount("0xshared", { profileId: "p1", name: "P1" })])
		const [second] = await accountService.restore([mkAccount("0xshared", { profileId: "p2", name: "P2" })])

		expect(first?.restoreError).toBeUndefined()
		expect(second?.restoreError).toBeUndefined()
		expect(await accountService.getAccount("p1", 1, "0xshared")).toMatchObject({ profileId: "p1", name: "P1" })
		expect(await accountService.getAccount("p2", 1, "0xshared")).toMatchObject({ profileId: "p2", name: "P2" })
	})

	test("purgeForProfile removes a MALFORMED row the profile owns; spares another profile's malformed row", async () => {
		await api.storage.local.set({
			"nulo:core:accounts@junk-p1": JSON.stringify({ profileId: "p1", junk: 1 }),
			"nulo:core:accounts@junk-p2": JSON.stringify({ profileId: "p2", junk: 1 }),
		})

		await accountService.purgeForProfile("p1")

		const raw = await api.storage.local.get(null)
		expect(raw["nulo:core:accounts@junk-p1"]).toBeUndefined()
		expect(raw["nulo:core:accounts@junk-p2"]).toBeDefined()
	})

	test("KEY ownership beats the value's claim — a malformed row at ANOTHER profile's canonical key is never deleted", async () => {
		// Deterministic, no race needed: whatever the bytes claim, a row at p2's
		// canonical key is p2's junk. Deleting it here is exactly the aliased-key
		// hazard (a concurrent p2 create/restore legitimately targets this key);
		// it is erased when p2 itself is deleted.
		const p2Key = `nulo:core:accounts@${accountRowId("p2", 1, "0xalias")}`
		await api.storage.local.set({ [p2Key]: JSON.stringify({ profileId: "p1", junk: 1 }) })

		await accountService.purgeForProfile("p1")

		expect((await api.storage.local.get(p2Key))[p2Key]).toBeDefined()
	})

	test("a row at the DELETED profile's canonical key IS deleted even when its bytes claim another profile", async () => {
		const p1Key = `nulo:core:accounts@${accountRowId("p1", 1, "0xmine")}`
		await api.storage.local.set({ [p1Key]: JSON.stringify({ profileId: "p9", junk: 1 }) })

		await accountService.purgeForProfile("p1")

		expect((await api.storage.local.get(p1Key))[p1Key]).toBeUndefined()
	})

	test("an unreadable value is purged by its canonical key alone: p1's goes, p2's and a non-canonical key's stay", async () => {
		const p1Key = `nulo:core:accounts@${accountRowId("p1", 1, "0xbroken")}`
		const p2Key = `nulo:core:accounts@${accountRowId("p2", 1, "0xbroken")}`
		await api.storage.local.set({ [p1Key]: "{not json", [p2Key]: "{not json", "nulo:core:accounts@legacy": "{not json" })

		await accountService.purgeForProfile("p1")

		const raw = await api.storage.local.get(null)
		expect(raw[p1Key]).toBeUndefined()
		expect(raw[p2Key]).toBe("{not json")
		expect(raw["nulo:core:accounts@legacy"]).toBe("{not json")
	})

	test("a concurrent restore of ANOTHER profile survives the purge's raw pass (key-attribution + restoreLock)", async () => {
		// End-state guard for the aliased-key hazard under real concurrency: the
		// malformed bytes claim p1 but sit at the canonical key p2's restore
		// legitimately writes. Key-attribution means the purge never targets p2's
		// key at all; p2's fresh valid row must survive either interleaving.
		await api.storage.local.set({
			[`nulo:core:accounts@${accountRowId("p2", 1, "0xalias")}`]: JSON.stringify({ profileId: "p1", junk: 1 }),
		})

		await Promise.all([accountService.purgeForProfile("p1"), accountService.restore([mkAccount("0xalias", { profileId: "p2" })])])

		expect(await accountService.getAccount("p2", 1, "0xalias")).toMatchObject({ profileId: "p2", address: "0xalias" })
	})

	test("rawAddressesForProfile harvests identity from canonical KEYS only — a foreign key's value claim donates nothing", async () => {
		await api.storage.local.set({
			// p1-keyed, malformed value (even the claim disagrees): address comes from the KEY.
			[`nulo:core:accounts@${accountRowId("p1", 1, "0xfromkey")}`]: JSON.stringify({ profileId: "p9", junk: 1 }),
			// p1-keyed, syntax-broken value: still attributable by key.
			[`nulo:core:accounts@${accountRowId("p1", 1, "0xbroken")}`]: "{not json",
			// p2-keyed bytes claiming p1 with a stealable address: must NOT donate
			// p2's address to p1's cascade (it would purge p2's authwits/txs).
			[`nulo:core:accounts@${accountRowId("p2", 1, "0xsteal")}`]: JSON.stringify({ profileId: "p1", address: "0xsteal" }),
			// Non-canonical key claiming p1: no trustworthy identity — not harvested.
			"nulo:core:accounts@legacy": JSON.stringify({ profileId: "p1", address: "0xlegacy" }),
		})

		expect((await accountService.rawAddressesForProfile("p1")).sort()).toEqual(["0xbroken", "0xfromkey"])
	})

	test("purgeForProfile removes rows but emits NO onAccountDeleted (coordinator awaits dependents directly)", async () => {
		await accountService.restore([mkAccount("0xp1a"), mkAccount("0xp1b")])
		const emit = vi.spyOn(accountService as unknown as { emit: (e: string, p: unknown) => void }, "emit")

		await accountService.purgeForProfile("p1")

		// Rows gone…
		const raw = await api.storage.local.get(null)
		expect(Object.keys(raw).some((k) => k.startsWith("nulo:core:accounts@"))).toBe(false)
		// …but no fire-and-forget onAccountDeleted (its async consumers would run
		// after the coordinator releases the id and clobber a successor).
		expect(emit.mock.calls.filter(([e]) => e === "onAccountDeleted")).toHaveLength(0)
	})

	test("getAccounts returns index-sorted regardless of restore/insertion order (import default-account fix)", async () => {
		// Restore in reverse-index order, exactly as a full-backup restore can insert rows: the resulting
		// storage/insertion order is NOT index order. Without the sort, getAccounts[0] would be index 2 →
		// the LAST account becomes the default active after import. It must return index 0 first.
		await accountService.restore([mkAccount("0xc", { index: 2 }), mkAccount("0xa", { index: 0 }), mkAccount("0xb", { index: 1 })])
		const accounts = await accountService.getAccounts("p1", 1, true)
		expect(accounts.map((a) => a.index)).toEqual([0, 1, 2])
		expect(accounts[0]!.address).toBe("0xa")
	})

	test("getAccounts is TOTALLY ordered — duplicate indices (hostile backup) break the tie by address, not insertion order", async () => {
		// Legitimate per-type indices are unique; a crafted backup could carry two rows at the same index.
		// The address tie-breaker keeps ordering deterministic instead of leaking insertion order.
		await accountService.restore([mkAccount("0xbbb", { index: 0 }), mkAccount("0xaaa", { index: 0 })])
		const accounts = await accountService.getAccounts("p1", 1, true)
		expect(accounts.map((a) => a.address)).toEqual(["0xaaa", "0xbbb"])
	})
})

describe("AccountService.sweepOrphanImportedKeys", () => {
	// The sweep runs when a profile's row keys arrive, after its conversion, so each case seeds
	// storage, boots a service and announces p1's keys. An account counts in either form, readable
	// or not: a codec-hidden or non-string account row still keeps the signing key behind it.
	const ACCOUNT_KEY = (address: string) => `nulo:core:accounts@${accountRowId("p1", 1, address)}`
	const IMPORTED_KEY = (address: string) => `nulo:core:imported-account-keys@${accountRowId("p1", 1, address)}`
	const keyRow = (address: string) => JSON.stringify({ profileId: "p1", chainId: 1, address, encryptedSigningKey: "sealed" })

	const boot = async (api: FakeBrowserApi) => {
		const keys = await rowKeysForEveryProfile()
		const services = new ServiceCollection()
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				...keys,
				onProfileDeleted: new EventHandler(),
				getDeletionState: () => new ProfileDeletionState(),
			}),
		)
		services.add(
			svc(NETWORK_SERVICE_NAME, {
				registerChainPurgeSubscriber: () => {},
				isChainQuarantined: async () => false,
				isChainLive: async () => true,
				getL1ChainIdStored: async () => 1,
			}),
		)
		const logger = new LoggerStore(new ConfigStore())
		services.add(new AccountService(logger, api))
		await services.start()
		keys.onRowKeysReady.invoke("p1")
		const keyRows = new ImportedKeysRepository(api.storage.local, keys.rowKeys)
		return { logger, hasKeyRow: async (address: string) => (await keyRows.get("p1", 1, address)) !== undefined }
	}
	const keyRowsLeft = async (api: FakeBrowserApi) =>
		Object.keys(await api.storage.local.get(null)).filter((k) => k.startsWith("nulo:core:imported-account-keys@")).length

	test("a TRUE orphan key row (no account in either form) is reaped, sealed or not — proves the sweep ran", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		await api.storage.local.set({ [IMPORTED_KEY("0xorphan")]: keyRow("0xorphan") })
		await boot(api)
		await vi.waitFor(async () => expect(await keyRowsLeft(api)).toBe(0))
	})

	test("a codec-hidden (malformed string) account row keeps its imported-key row alive", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		await api.storage.local.set({
			[ACCOUNT_KEY("0xhidden")]: "{ not json at all",
			[IMPORTED_KEY("0xhidden")]: keyRow("0xhidden"),
			[IMPORTED_KEY("0xorphan")]: keyRow("0xorphan"), // control: sweep still reaps
		})
		const { hasKeyRow } = await boot(api)
		await vi.waitFor(async () => expect(await hasKeyRow("0xorphan")).toBe(false))
		expect(await hasKeyRow("0xhidden")).toBe(true)
	})

	test("a sweep that throws is logged as the error's projection", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		await api.storage.local.set({ [IMPORTED_KEY("0xorphan")]: keyRow("0xorphan") })
		api.storage.local.remove = async () => {
			throw new Error("storage unavailable")
		}
		const { logger } = await boot(api)
		await vi.waitFor(() =>
			expect(loggedAfter(logger, "converting or sweeping the profile's accounts failed; the next worker retries")).toEqual([
				{ error: { name: "Error", message: "storage unavailable" } },
			]),
		)
	})

	test("a non-string-VALUED account row keeps its imported-key row alive (the physical-key discriminator)", async () => {
		// rawStringEntries skips non-string values: only the physical key sees this row. A live-set
		// built any narrower deletes the key.
		const api = new FakeBrowserApi()
		api.reset()
		await api.storage.local.set({
			[ACCOUNT_KEY("0xobj")]: { not: "a string" },
			[IMPORTED_KEY("0xobj")]: keyRow("0xobj"),
			[IMPORTED_KEY("0xorphan")]: keyRow("0xorphan"),
		})
		const { hasKeyRow } = await boot(api)
		await vi.waitFor(async () => expect(await hasKeyRow("0xorphan")).toBe(false))
		expect(await hasKeyRow("0xobj")).toBe(true)
	})
})

describe("AccountService — same-row field editors serialize", () => {
	test("a name change parked at its read cannot revert a concurrent visibility change", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const deletion = new ProfileDeletionState()
		const services = new ServiceCollection()
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				...ROW_KEY_FAKE,
				onProfileDeleted: new EventHandler(),
				getDeletionState: () => deletion,
			}),
		)
		services.add(
			svc(NETWORK_SERVICE_NAME, {
				registerChainPurgeSubscriber: () => {},
				isChainQuarantined: async () => false,
				isChainLive: async () => true,
			}),
		)
		const service = new AccountService(new LoggerStore(new ConfigStore()), api)
		services.add(service)
		await services.start()

		const rowId = accountRowId("p1", 1, "0xaa")
		const rowKey = `nulo:core:accounts@${rowId}`
		await api.storage.local.set({ [rowKey]: JSON.stringify(mkAccount("0xaa")) })

		const gate = parkRowRead(api, rowKey)
		const nameRun = service.changeAccountName("p1", 1, "0xaa", "B")
		await gate.parked
		const visRun = service.changeAccountVisibility("p1", 1, "0xaa", false)
		// An editor takes the row's lock before its first await, so the visibility change is queued here.
		expect((service as unknown as { tupleLocks: { waiting(key: string): number } }).tupleLocks.waiting(rowId)).toBe(1)
		gate.release()
		await Promise.all([nameRun, visRun])

		const row = await service.getAccount("p1", 1, "0xaa")
		expect(row?.name).toBe("B")
		expect(row?.visible).toBe(false)
	})
})

describe("AccountService.importAccount — deletion fence", () => {
	// Where the service seals the pair: both roots hash the address alike.
	const accountKey = `nulo:core:accounts@${SEALED_0xI}`
	const keyRowKey = `nulo:core:imported-account-keys@${SEALED_0xI}`
	const staleText = /^profile p1 is being deleted — write rejected \(epoch 0 → 1\)$/

	async function makeHarness(
		over: {
			dekGate?: Promise<void>
			l1Gate?: Promise<void>
			afterSet?: (key: string) => void
			chainLive?: (call: number) => boolean | Promise<boolean>
		} = {},
	) {
		const api = new FakeBrowserApi()
		api.reset()
		const deletion = new ProfileDeletionState()
		const deks: Uint8Array[] = []
		let liveCalls = 0
		const services = new ServiceCollection()
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				...ROW_KEY_FAKE,
				onProfileDeleted: new EventHandler(),
				getDeletionState: () => deletion,
				getProfileDek: async () => {
					if (over.dekGate) await over.dekGate
					const dek = new Uint8Array(32).fill(1)
					deks.push(dek)
					return dek
				},
			}),
		)
		services.add(
			svc(NETWORK_SERVICE_NAME, {
				registerChainPurgeSubscriber: () => {},
				isChainQuarantined: async () => false,
				isChainLive: async () => over.chainLive?.(++liveCalls) ?? true,
				getL1ChainIdStored: async () => {
					if (over.l1Gate) await over.l1Gate
					return 1
				},
			}),
		)
		const service = new AccountService(new LoggerStore(new ConfigStore()), api)
		services.add(service)
		await services.start()
		vi.spyOn(service as unknown as { decodeAccountExport: () => Promise<unknown> }, "decodeAccountExport").mockResolvedValue({
			signingKey: { toBuffer: () => new Uint8Array(32).fill(5) },
			address: "0xI",
		})
		const emit = vi.spyOn(service as unknown as { emit: (e: string, p: unknown) => void }, "emit")
		const { log } = recordWrites(api.storage.local, "nulo:core:", (key) => over.afterSet?.(key))
		const run = () => service.importAccount("p1", 1, "body", "0xI", "pw", "I")
		const keysLeft = async () => Object.keys(await api.storage.local.get(null)).filter((k) => k === accountKey || k === keyRowKey)
		const dekWiped = () => deks.length === 1 && deks[0]!.every((b) => b === 0)
		return { api, service, deletion, emit, log, run, keysLeft, dekWiped }
	}

	function gate() {
		let open!: () => void
		const promise = new Promise<void>((r) => {
			open = r
		})
		return { promise, open }
	}

	const added = (emit: { mock: { calls: unknown[][] } }) => emit.mock.calls.filter(([e]) => e === "onAccountAdded")

	test("(i) a deletion beginning while the L1 lookup is parked: refused before any write", async () => {
		const l1 = gate()
		const h = await makeHarness({ l1Gate: l1.promise })
		const run = h.run()
		await new Promise((r) => setTimeout(r, 0))
		h.deletion.beginDeletion("p1")
		l1.open()
		await expect(run).rejects.toThrow(staleText)
		expect(h.log).toEqual([])
		expect(await h.keysLeft()).toEqual([])
		expect(h.dekWiped()).toBe(true)
	})

	test("(ii) a deletion beginning during the key-row write: key row rolled back, no account row", async () => {
		const h = await makeHarness({ afterSet: (key) => key === keyRowKey && h.deletion.beginDeletion("p1") })
		await expect(h.run()).rejects.toThrow(staleText)
		expect(h.log).toEqual([`set:${keyRowKey}`, `remove:${keyRowKey}`])
		expect(await h.keysLeft()).toEqual([])
		expect(added(h.emit)).toEqual([])
		expect(h.dekWiped()).toBe(true)
	})

	test("(iv) a deletion beginning and releasing during the account-row write: both rows gone, no emit", async () => {
		const h = await makeHarness({
			afterSet: (key) => {
				if (key !== accountKey) return
				h.deletion.beginDeletion("p1")
				h.deletion.release("p1")
			},
		})
		await expect(h.run()).rejects.toThrow(/^profile p1 deleted$/)
		expect(h.log).toEqual([`set:${keyRowKey}`, `set:${accountKey}`, `remove:${accountKey}`, `remove:${keyRowKey}`])
		expect(await h.keysLeft()).toEqual([])
		expect(added(h.emit)).toEqual([])
		expect(h.dekWiped()).toBe(true)
	})

	test("the add is announced in the turn its final epoch check passes, never after a deletion that follows", async () => {
		const h = await makeHarness()
		const isCurrent = h.deletion.isCurrent.bind(h.deletion)
		vi.spyOn(h.deletion, "isCurrent").mockImplementation((id, captured) => {
			queueMicrotask(() => h.deletion.beginDeletion("p1"))
			return isCurrent(id, captured)
		})
		const epochAtEmit: number[] = []
		h.emit.mockImplementation((event) => {
			if (event === "onAccountAdded") epochAtEmit.push(h.deletion.capture("p1"))
		})

		await expect(h.run()).resolves.toMatchObject({ address: "0xI" })
		expect(epochAtEmit).toEqual([0])
	})

	test("(iii) a deletion beginning and releasing while the DEK read is parked is still refused", async () => {
		const dek = gate()
		const h = await makeHarness({ dekGate: dek.promise })
		const run = h.run()
		await new Promise((r) => setTimeout(r, 0))
		h.deletion.beginDeletion("p1")
		h.deletion.release("p1")
		dek.open()
		await expect(run).rejects.toThrow(staleText)
		expect(h.log).toEqual([])
		expect(h.dekWiped()).toBe(true)
	})

	test("a rename parked on the written row cannot resurrect it after the compensation", async () => {
		const importGate = gate()
		const renameGate = gate()
		let importParked!: () => void
		let renameParked!: () => void
		const importReached = new Promise<void>((r) => {
			importParked = r
		})
		const renameReached = new Promise<void>((r) => {
			renameParked = r
		})
		// The import parks in its post-write liveness read, after both writes and outside the row lock.
		const h = await makeHarness({
			chainLive: async (call) => {
				if (call === 2) {
					importParked()
					await importGate.promise
				}
				return true
			},
		})
		const area = h.api.storage.local
		const realGet = area.get.bind(area)
		let parkRename = false
		area.get = (async (key: unknown) => {
			const value = await realGet(key as never)
			if (parkRename && key === accountKey) {
				parkRename = false
				renameParked()
				await renameGate.promise
			}
			return value
		}) as typeof area.get

		const run = h.run()
		await importReached
		parkRename = true
		const rename = h.service.changeAccountName("p1", 1, "0xI", "renamed")
		await renameReached
		h.deletion.beginDeletion("p1")
		importGate.open()
		await new Promise((r) => setTimeout(r, 0))
		renameGate.open()

		await expect(run).rejects.toThrow(/^profile p1 deleted$/)
		await rename
		expect(await h.keysLeft()).toEqual([])
		expect(added(h.emit)).toEqual([])
		expect(h.dekWiped()).toBe(true)
	})

	test("a chain reserved for deletion before the writes: refused, nothing written", async () => {
		const h = await makeHarness({ chainLive: () => false })
		await expect(h.run()).rejects.toThrow(/^network deleted$/)
		expect(h.log).toEqual([])
		expect(added(h.emit)).toEqual([])
		expect(h.dekWiped()).toBe(true)
	})

	test.each([
		["a chain reserved during the account-row write", /^network deleted$/, () => false],
		["a liveness read that fails after the account-row write", /^read failed$/, () => readFailsOnSecondCall(2)],
		["a profile deletion landing during the post-write liveness read", /^profile p1 deleted$/, undefined],
	])("%s: both rows removed, nothing announced", async (_label, refusal, postWrite) => {
		const h = await makeHarness({
			chainLive: (call) => {
				if (call === 1) return true
				if (postWrite) return postWrite()
				h.deletion.beginDeletion("p1")
				return true
			},
		})
		await expect(h.run()).rejects.toThrow(refusal)
		expect(h.log).toEqual([`set:${keyRowKey}`, `set:${accountKey}`, `remove:${accountKey}`, `remove:${keyRowKey}`])
		expect(await h.keysLeft()).toEqual([])
		expect(added(h.emit)).toEqual([])
		expect(h.dekWiped()).toBe(true)
	})

	test("control: with no deletion both rows land and the account is announced", async () => {
		const h = await makeHarness()
		expect(await h.run()).toMatchObject({ profileId: "p1", chainId: 1, address: "0xI", type: 1, name: "I" })
		expect(h.log).toEqual([`set:${keyRowKey}`, `set:${accountKey}`])
		expect((await h.keysLeft()).sort()).toEqual([accountKey, keyRowKey].sort())
		expect(added(h.emit)).toHaveLength(1)
		expect(h.dekWiped()).toBe(true)
	})
})

describe("AccountService purges wait for a rename holding the same row", () => {
	const rowId = accountRowId("p1", 1, "0xaa")
	const rowKey = `nulo:core:accounts@${rowId}`
	const keyRowKey = `nulo:core:imported-account-keys@${rowId}`

	async function makeHarness() {
		const api = new FakeBrowserApi()
		api.reset()
		const services = new ServiceCollection()
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				...ROW_KEY_FAKE,
				onProfileDeleted: new EventHandler(),
				getDeletionState: () => new ProfileDeletionState(),
			}),
		)
		services.add(svc(NETWORK_SERVICE_NAME, { registerChainPurgeSubscriber: () => {}, isChainLive: async () => true }))
		const service = new AccountService(new LoggerStore(new ConfigStore()), api)
		services.add(service)
		await services.start()
		await api.storage.local.set({
			[rowKey]: JSON.stringify(mkAccount("0xaa", { type: 1 })),
			[keyRowKey]: JSON.stringify({ profileId: "p1", chainId: 1, address: "0xaa", encryptedSigningKey: "s" }),
		})
		return { api, service }
	}

	/** Every key left under either root, sealed rows included. */
	async function rowsLeft(api: FakeBrowserApi): Promise<string[]> {
		const keys = Object.keys(await api.storage.local.get(null))
		return keys.filter((k) => k.startsWith("nulo:core:accounts@") || k.startsWith("nulo:core:imported-account-keys@"))
	}

	/** Parks a rename at its read of the row, starts `purge`, and releases the rename once the purge
	 *  has queued on the row's lock, which it reaches only after awaits of its own. */
	async function purgeBehindRename<T>(api: FakeBrowserApi, service: AccountService, purge: () => Promise<T>) {
		const gate = parkRowRead(api, rowKey)
		const rename = service.changeAccountName("p1", 1, "0xaa", "renamed")
		await gate.parked
		const locks = (service as unknown as { tupleLocks: KeyedLock }).tupleLocks
		const withLock = locks.withLock.bind(locks)
		const requested = deferred()
		// `withLock` queues its caller before it returns, so the signal marks a request already waiting.
		locks.withLock = ((key: string, fn: () => unknown) => {
			const queued = withLock(key, fn)
			if (key === rowId) requested.resolve()
			return queued
		}) as KeyedLock["withLock"]
		const purging = purge()
		// A purge that settles without asking for the row's lock fails the queue check at once.
		await Promise.race([requested.promise, purging])
		expect(locks.waiting(rowId)).toBe(1)
		gate.release()
		return Promise.all([rename, purging])
	}

	test.each([
		["clearChainState", (s: AccountService) => s.clearChainState("p1", 1)],
		["purgeForProfile", (s: AccountService) => s.purgeForProfile("p1")],
	])("%s: the renamed row is not written back after the delete", async (_name, purge) => {
		const { api, service } = await makeHarness()
		const [renamed] = await purgeBehindRename(api, service, () => purge(service))
		expect(renamed?.name).toBe("renamed")
		expect(await rowsLeft(api)).toEqual([])
	})

	test("reconcileImportedAccounts: a keyless row is not written back by a rename parked on it", async () => {
		const { api, service } = await makeHarness()
		await api.storage.local.remove(keyRowKey)
		const [renamed, dropped] = await purgeBehindRename(api, service, () => service.reconcileImportedAccounts("p1"))
		expect(renamed?.name).toBe("renamed")
		expect(dropped).toEqual([{ chainId: 1, address: "0xaa" }])
		expect(await rowsLeft(api)).toEqual([])
	})

	test("reconcileImportedAccounts: a rename started after the keyless check is not written back", async () => {
		const { api, service } = await makeHarness()
		await api.storage.local.remove(keyRowKey)
		// Held in a purge subscriber, the reconcile is past its keyless check, so only the delete's
		// own lock can order it behind the rename.
		const inSubscriber = deferred()
		const resume = deferred()
		service.registerAccountPurgeSubscriber(async () => {
			inSubscriber.resolve()
			await resume.promise
		})
		const reconciling = service.reconcileImportedAccounts("p1")
		const staged = await Promise.race([inSubscriber.promise.then(() => "subscriber"), reconciling.then(() => "settled")])
		expect(staged).toBe("subscriber")
		const [renamed, dropped] = await purgeBehindRename(api, service, () => {
			resume.resolve()
			return reconciling
		})
		expect(renamed?.name).toBe("renamed")
		expect(dropped).toEqual([{ chainId: 1, address: "0xaa" }])
		expect(await rowsLeft(api)).toEqual([])
	})
})

describe("AccountService.provisionDefaultAccount — unattended rule", () => {
	async function makeHarness(resolve: (opts?: { unattended?: boolean }) => Promise<number>) {
		const api = new FakeBrowserApi()
		api.reset()
		const deletion = new ProfileDeletionState()
		const services = new ServiceCollection()
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				...ROW_KEY_FAKE,
				onProfileDeleted: new EventHandler(),
				getDeletionState: () => deletion,
				getProfileSecret: () => Promise.resolve(new Fr(42n)),
			}),
		)
		services.add(
			svc(NETWORK_SERVICE_NAME, {
				registerChainPurgeSubscriber: () => {},
				isChainQuarantined: async () => false,
				isChainLive: async () => true,
				resolveVerifiedL1ChainId: (_profileId: string, _chainId: number, opts?: { unattended?: boolean }) => resolve(opts),
			}),
		)
		const service = new AccountService(new LoggerStore(new ConfigStore()), api)
		services.add(service)
		await services.start()
		return { api, service }
	}

	const seedRow = (api: FakeBrowserApi, address: string, over: Record<string, unknown>) =>
		api.storage.local.set({ [`nulo:core:accounts@${accountRowId("p1", 1, address)}`]: JSON.stringify(mkAccount(address, over)) })

	const offline = async () => 1

	test("an empty probe-free chain gets one visible index-0 default account", async () => {
		const h = await makeHarness(offline)
		await h.service.provisionDefaultAccount("p1", 1)
		const rows = await h.service.getAccounts("p1", 1, true)
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ index: 0, visible: true, type: 0, name: "Account 1" })
	})

	test("the resolver is asked for an unattended verification", async () => {
		const seen: Array<{ unattended?: boolean } | undefined> = []
		const h = await makeHarness(async (opts) => {
			seen.push(opts)
			return 1
		})
		await h.service.provisionDefaultAccount("p1", 1)
		expect(seen).toEqual([{ unattended: true }])
	})

	test("a chain whose identity would need a probe is declined: no row, no throw", async () => {
		const h = await makeHarness(async () => {
			throw new Error(`${ERR_UNATTENDED_LIVE_CHECK}: needs a live check`)
		})
		await h.service.provisionDefaultAccount("p1", 1)
		expect(await h.service.getAccounts("p1", 1, true)).toEqual([])
	})

	test("a chain holding only a hidden account is left alone", async () => {
		const h = await makeHarness(offline)
		await seedRow(h.api, "0xhidden", { visible: false })
		await h.service.provisionDefaultAccount("p1", 1)
		expect((await h.service.getAccounts("p1", 1, true)).map((a) => a.address)).toEqual(["0xhidden"])
	})

	test("a chain holding only an imported account is left alone", async () => {
		const h = await makeHarness(offline)
		await seedRow(h.api, "0ximported", { type: 1 })
		await h.service.provisionDefaultAccount("p1", 1)
		expect((await h.service.getAccounts("p1", 1, true)).map((a) => a.address)).toEqual(["0ximported"])
	})

	test("a second call is a no-op", async () => {
		const h = await makeHarness(offline)
		await h.service.provisionDefaultAccount("p1", 1)
		await h.service.provisionDefaultAccount("p1", 1)
		expect(await h.service.getAccounts("p1", 1, true)).toHaveLength(1)
	})

	test("any other resolver failure propagates", async () => {
		const h = await makeHarness(async () => {
			throw new Error("Seeded network L1 identity mismatch")
		})
		await expect(h.service.provisionDefaultAccount("p1", 1)).rejects.toThrow("identity mismatch")
	})
})

describe("AccountService keyed reads bind the row body to the requested address", () => {
	async function makeHarness() {
		const api = new FakeBrowserApi()
		api.reset()
		const deletion = new ProfileDeletionState()
		const services = new ServiceCollection()
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				...ROW_KEY_FAKE,
				onProfileDeleted: new EventHandler(),
				getDeletionState: () => deletion,
				getProfileDek: async () => undefined,
			}),
		)
		services.add(
			svc(NETWORK_SERVICE_NAME, {
				registerChainPurgeSubscriber: () => {},
				isChainQuarantined: async () => false,
				isChainLive: async () => true,
				getL1ChainIdStored: async () => 1,
			}),
		)
		const service = new AccountService(new LoggerStore(new ConfigStore()), api)
		services.add(service)
		await services.start()
		return { api, service }
	}

	test("account B's row transplanted under account A's key is neither returned nor used as A's signer", async () => {
		const { api, service } = await makeHarness()
		const rowB = mkAccount("0xB", { type: 1 })
		await api.storage.local.set({ [`nulo:core:accounts@${accountRowId("p1", 1, "0xA")}`]: JSON.stringify(rowB) })
		expect(await service.getAccount("p1", 1, "0xA")).toBeUndefined()
		await expect(service.getAccountContract("p1", 1, "0xA")).rejects.toThrow("unknown account address")
		await expect(service.exportAccount("p1", 1, "0xA", "pw", false)).rejects.toThrow("unknown account address")
	})

	test("a rename of A finds B's transplanted row absent: no write under B's key, no emit", async () => {
		const { api, service } = await makeHarness()
		await api.storage.local.set({ [`nulo:core:accounts@${accountRowId("p1", 1, "0xA")}`]: JSON.stringify(mkAccount("0xB")) })
		const { log } = recordWrites(api.storage.local, "nulo:core:accounts@")
		const emit = vi.spyOn(service as unknown as { emit: (e: string, p: unknown) => void }, "emit")
		expect(await service.changeAccountName("p1", 1, "0xA", "renamed")).toBeUndefined()
		expect(await service.changeAccountVisibility("p1", 1, "0xA", false)).toBeUndefined()
		expect(log).toEqual([])
		expect(emit).not.toHaveBeenCalled()
		expect(Object.keys(await api.storage.local.get(null))).toEqual([`nulo:core:accounts@${accountRowId("p1", 1, "0xA")}`])
	})

	test.each([
		["profileId", { profileId: "p2" }],
		["chainId", { chainId: 2 }],
		["address", { address: "0xB" }],
	])("a row body differing only in %s reads as absent", async (_field, over) => {
		const { api, service } = await makeHarness()
		await api.storage.local.set({ [`nulo:core:accounts@${accountRowId("p1", 1, "0xA")}`]: JSON.stringify(mkAccount("0xA", over)) })
		expect(await service.getAccount("p1", 1, "0xA")).toBeUndefined()
	})

	test("an omitted profile id is refused before any read: the keyed root names no owner", async () => {
		// In-process calls skip the RPC params check; the sealed root cannot hash an id that names no
		// profile, so it refuses rather than reading or guessing one.
		const { api, service } = await makeHarness()
		const { log } = recordWrites(api.storage.local, "nulo:core:")
		const missing = undefined as unknown as string
		const refusal = /^nulo:core:accounts is keyed per profile: name the owner$/
		await expect(service.getAccount(missing, 1, "0xA")).rejects.toThrow(refusal)
		await expect(service.getAccountContract(missing, 1, "0xA")).rejects.toThrow(refusal)
		await expect(service.exportAccount(missing, 1, "0xA", "pw", false)).rejects.toThrow(refusal)
		await expect(service.changeAccountName(missing, 1, "0xA", "x")).rejects.toThrow(refusal)
		expect(log).toEqual([])
	})
})
