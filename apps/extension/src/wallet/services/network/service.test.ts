/**
 * Unit tests for `NetworkService`'s `NodeFactory` seam.
 *
 * Scope: drive the `nodeFactory.createNode()` → `getNodeInfo()` →
 * chainId derivation path via `addNetwork`, with a `FakeNodeFactory`
 * that returns in-memory stubs. Verifies (a) the factory seam is
 * wired, (b) the chainId calculation preserves today's XOR formula,
 * (c) the localhost special-case still returns 0, (d) getNodeInfo
 * failures bubble as "Failed to fetch node info".
 *
 * POJO-fake caveat (see FakeNodeFactory docstring): these tests do
 * NOT exercise the real `createSafeJsonRpcClient` proxy's param
 * validation or JSON-RPC error marshalling. Any code path whose
 * correctness depends on those surfaces needs a separate integration
 * test against the production adapter.
 */

import { beforeEach, describe, expect, test, vi } from "vitest"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { recordWrites } from "../storage-write-log"
import { rowKeysForEveryProfile, storedText } from "@/wallet/storage/sealed-entity-storage.testing"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { CHAIN_IDS, LOCAL_L1_CHAIN_ID, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { LoggerStore } from "@/wallet/logger"
import { ConfigStore } from "@/wallet/config"
import { FakeNodeFactory } from "@/core/testing/fake-node-factory"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { isAllowedRpcUrl } from "@nulo/aztec-runtime/adapters"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import type { ProfileService } from "@/wallet/services/profile/service"
import { type ChainResetHooks, type ChainResetRequest, LOCAL_NETWORK_RPC_URL, NetworkService } from "./service"
import { NodeUnreachableError } from "@nulo/extension-messaging/errors"
import {
	ERR_ENDPOINT_CHAIN_MISMATCH,
	ERR_RPC_URL_IPV6_LOOPBACK,
	ERR_UNATTENDED_LIVE_CHECK,
	findPrimaryEndpoint,
	IDENTITY_PROBE_MS,
	NodeStatus,
} from "./spec"
import type { Network, NetworkEndpoint } from "./spec"
import { classifyChains } from "@/wallet/services/stale-network/classify"
import { seedOffersKey } from "./seed-offers"
import { DEFAULT_SEEDS, seedForKind } from "./seeds"

/** One key for every profile, as the profile fakes hold it. */
const ROW_KEY_FAKE = await rowKeysForEveryProfile()

type NodeInfo = {
	l1ChainId: number
	rollupVersion: number
}

/** Wire a NetworkService with a fake profile service + a seeded
 *  NodeFactory. Returns the collaborators so tests can drive them. */
function harness(seeded: Record<string, NodeInfo | Error>): {
	service: NetworkService
	factory: FakeNodeFactory
	deletionState: ProfileDeletionState
	browserApi: FakeBrowserApi
} {
	const logger = new LoggerStore(new ConfigStore())

	const factory = new FakeNodeFactory()
	for (const [rpcUrl, result] of Object.entries(seeded)) {
		if (result instanceof Error) {
			factory.setOverrides(rpcUrl, {
				getNodeInfo: vi.fn().mockRejectedValue(result) as unknown as AztecNode["getNodeInfo"],
			})
		} else {
			factory.setOverrides(rpcUrl, {
				getNodeInfo: vi.fn().mockResolvedValue(result) as unknown as AztecNode["getNodeInfo"],
			})
		}
	}

	const browserApi = new FakeBrowserApi()
	browserApi.reset()
	const service = new NetworkService(logger, browserApi, factory)

	// Stub a minimal ProfileService that reports an active profile. ONE shared
	// deletion state: the fence captures + asserts against the same instance.
	const fakeProfile = { id: "p1", name: "p1", type: "password" } as const
	const deletionState = new ProfileDeletionState()
	const fakeProfileService = {
		...ROW_KEY_FAKE,
		getActiveProfile: async () => fakeProfile,
		onActiveProfileChanged: { add: vi.fn(), remove: vi.fn() },
		onProfileDeleted: { add: vi.fn(), remove: vi.fn() },
		getDeletionState: () => deletionState,
		captureExecutionFence: async () => ({ profileId: "p1", epoch: deletionState.capture("p1") }),
	} as unknown as ProfileService

	// Reach into the service's protected init via the services map the base
	// class would normally call. Using `as any` access rather than driving
	// the real service bootstrap because we only need the NodeFactory seam
	// tested, not the full lifecycle.
	// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
	;(service as any).profileService = fakeProfileService

	return { service, factory, deletionState, browserApi }
}

describe("NetworkService — addNetwork creation fence", () => {
	test("a deletion completing DURING the probe rejects the write (entry-capture pin)", async () => {
		// begin + RELEASE while the RPC probe is parked: the deletion fully
		// settles, so only a fence captured at the authorizing entry rejects.
		let release!: (v: NodeInfo) => void
		const parked = new Promise<NodeInfo>((resolve) => {
			release = resolve
		})
		const h = harness({})
		h.factory.setOverrides("https://new.example/", {
			getNodeInfo: vi.fn().mockReturnValue(parked) as unknown as AztecNode["getNodeInfo"],
		})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		;(h.service as any).initialized = true

		const run = h.service.addNetwork("Custom", "https://new.example/")
		await new Promise((r) => setTimeout(r, 0))
		h.deletionState.beginDeletion("p1")
		h.deletionState.release("p1")
		release({ l1ChainId: 5, rollupVersion: 1 })

		await expect(run).rejects.toThrow(/^profile p1 is being deleted — write rejected \(epoch 0 → 1\)$/)
		const raw = await h.browserApi.storage.local.get(null)
		expect(Object.keys(raw as Record<string, unknown>).some((k) => k.startsWith("nulo:core:networks@"))).toBe(false)
	})

	test("first-run seeding REJECTS (not empty-success) when the deletion lands mid-seed", async () => {
		// The per-seed catch soft-fails one bad seed by design — but it also
		// swallows the deletion compensate's throw, and without the post-loop
		// re-assert the call would return [] as a SUCCESS for a deleted profile.
		const h = harness({})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		;(h.service as any).initialized = true
		const logError = vi.spyOn(h.service as unknown as { logError: (m: string, e: unknown) => void }, "logError")
		let fired = false
		const writes = recordWrites(h.browserApi.storage.local, "nulo:core:networks@", () => {
			if (fired) return
			fired = true
			h.deletionState.beginDeletion("p1")
			h.deletionState.release("p1")
		})

		await expect(h.service.getOrInitNetworks()).rejects.toThrow(/^profile p1 is being deleted — write rejected \(epoch 0 → 1\)$/)
		writes.restore()
		// The first seed's write is compensated; every later seed is refused before writing.
		expect(writes.log).toHaveLength(2)
		expect(writes.log[1]).toBe(writes.log[0]?.replace(/^set:/, "remove:"))
		expect((logError.mock.calls[0]?.[1] as Error | undefined)?.message).toBe("profile p1 deleted")
	})

	test("a deletion landing DURING the row write is compensated away before any emit", async () => {
		const h = harness({ "https://new.example/": { l1ChainId: 5, rollupVersion: 1 } })
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		;(h.service as any).initialized = true
		const emitted: unknown[] = []
		h.service.onNetworkAdded.add((n) => emitted.push(n))
		const writes = recordWrites(h.browserApi.storage.local, "nulo:core:networks@", () => h.deletionState.beginDeletion("p1"))

		await expect(h.service.addNetwork("Custom", "https://new.example/")).rejects.toThrow(/^profile p1 deleted$/)
		writes.restore()
		expect(writes.log).toHaveLength(2)
		expect(writes.log[1]).toBe(writes.log[0]?.replace(/^set:/, "remove:"))
		expect(emitted).toHaveLength(0)
	})
})

describe("NetworkService — seedDefaultsForProfile (full-backup import reseeds a NOT-yet-active profile)", () => {
	function withProfiles(h: ReturnType<typeof harness>, ids: string[]) {
		const internals = h.service as unknown as {
			initialized: boolean
			profileService: { getProfiles: () => Promise<unknown[]> }
			storage: { set: (id: string, row: unknown) => Promise<void> }
		}
		internals.initialized = true
		internals.profileService.getProfiles = async () => ids.map((id) => ({ id, name: id, type: "password" }))
		return { ...h, internals }
	}
	const rowsOf = async (h: ReturnType<typeof harness>, profileId: string) =>
		(await h.service.getNetworksRaw(profileId)).sort((a, b) => a.chainId - b.chainId)

	test("seeds every default for the target profile and writes ITS active pointer, never touching the active profile's node cache", async () => {
		const h = withProfiles(harness({}), ["p1", "p2"])
		const p1 = await h.service.getOrInitNetworks()
		const p1Primary = p1.find((n) => n.chainId === CHAIN_IDS.MAINNET)!
		const p1NodeBefore = await h.service.getNode(p1Primary.chainId)
		const nodesBefore = new Map((h.service as unknown as { nodes: Map<number, unknown> }).nodes)

		const seeded = await h.service.seedDefaultsForProfile("p2")

		expect(seeded.map((n) => n.chainId).sort((a, b) => a - b)).toEqual(p1.map((n) => n.chainId).sort((a, b) => a - b))
		expect(seeded.every((n) => n.profileId === "p2")).toBe(true)
		expect(new Set(seeded.map((n) => n.id)).size).toBe(seeded.length)
		expect(seeded.some((n) => p1.some((m) => m.id === n.id))).toBe(false)
		// The cache is keyed by chainId alone: p1 keeps exactly the node objects it had.
		const nodesAfter = (h.service as unknown as { nodes: Map<number, unknown> }).nodes
		expect(nodesAfter.size).toBe(nodesBefore.size)
		for (const [chainId, node] of nodesBefore) expect(nodesAfter.get(chainId)).toBe(node)
		expect(await h.service.getNode(p1Primary.chainId)).toBe(p1NodeBefore)
		// p2's pointer names p2's primary seed; p1's pointer is untouched.
		const raw = (await h.browserApi.storage.local.get(null)) as Record<string, unknown>
		const p2Primary = seeded.find((n) => n.chainId === CHAIN_IDS.MAINNET)!
		expect(Object.entries(raw).some(([k, v]) => k.includes("p2") && v === p2Primary.id)).toBe(true)
		expect(Object.entries(raw).some(([k, v]) => k.includes("p1") && v === p1Primary.id)).toBe(true)
	})

	test("a repeat call returns the stored rows untouched — no duplicate (profileId, chainId), no endpoint reset", async () => {
		const h = withProfiles(harness({}), ["p2"])
		const first = await h.service.seedDefaultsForProfile("p2")
		const edited = { ...first[0], endpoints: [{ ...first[0].endpoints[0], rpcUrl: "https://edited.example/" }] }
		await h.internals.storage.set(edited.id, edited)

		const again = await h.service.seedDefaultsForProfile("p2")

		expect(again.map((n) => n.id).sort()).toEqual(first.map((n) => n.id).sort())
		expect((await rowsOf(h, "p2")).length).toBe(first.length)
		expect((await h.service.getNetworksRaw("p2")).find((n) => n.id === edited.id)?.endpoints[0].rpcUrl).toBe("https://edited.example/")
	})

	test("rejects a profile that does not exist, and one already under deletion, without writing a row", async () => {
		const h = withProfiles(harness({}), ["p1"])
		await expect(h.service.seedDefaultsForProfile("ghost")).rejects.toThrow(/does not exist/)
		h.deletionState.beginDeletion("p1")
		await expect(h.service.seedDefaultsForProfile("p1")).rejects.toThrow(/deleted|not captured|write rejected/i)
		const raw = (await h.browserApi.storage.local.get(null)) as Record<string, unknown>
		expect(Object.keys(raw).some((k) => k.startsWith("nulo:core:networks@"))).toBe(false)
	})

	test("a deletion landing mid-seed rejects and leaves no orphan rows", async () => {
		const h = withProfiles(harness({}), ["p2"])
		const logError = vi.spyOn(h.service as unknown as { logError: (m: string, e: unknown) => void }, "logError")
		let fired = false
		const writes = recordWrites(h.browserApi.storage.local, "nulo:core:networks@", () => {
			if (fired) return
			fired = true
			h.deletionState.beginDeletion("p2")
			h.deletionState.release("p2")
		})
		await expect(h.service.seedDefaultsForProfile("p2")).rejects.toThrow(
			/^profile p2 is being deleted — write rejected \(epoch 0 → 1\)$/,
		)
		writes.restore()
		expect(writes.log).toHaveLength(2)
		expect(writes.log[1]).toBe(writes.log[0]?.replace(/^set:/, "remove:"))
		expect((logError.mock.calls[0]?.[1] as Error | undefined)?.message).toBe("profile p2 deleted")
		expect(await rowsOf(h, "p2")).toEqual([])
	})
})

describe("NetworkService — resolveVerifiedL1ChainId single-snapshot", () => {
	test("the probe target and the returned l1ChainId come from one row read", async () => {
		// Two-faced storage: the row is swapped between reads. A split-read
		// implementation validates one row's endpoint against the OTHER row's
		// stored value and throws a spurious mismatch; the single-snapshot
		// implementation probes and returns the same row it read.
		const logger = new LoggerStore(new ConfigStore())
		const factory = new FakeNodeFactory()
		factory.setOverrides("https://rpc-a.example/", {
			getNodeInfo: vi.fn().mockResolvedValue({ l1ChainId: 5, rollupVersion: 1 }) as unknown as AztecNode["getNodeInfo"],
		})
		factory.setOverrides("https://rpc-b.example/", {
			getNodeInfo: vi.fn().mockResolvedValue({ l1ChainId: 7, rollupVersion: 1 }) as unknown as AztecNode["getNodeInfo"],
		})
		const browserApi = new FakeBrowserApi()
		browserApi.reset()
		const service = new NetworkService(logger, browserApi, factory)
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in (no full lifecycle needed)
		;(service as any).initialized = true

		const rowKey = "nulo:core:networks@n1"
		const rowA = {
			id: "n1",
			profileId: "p1",
			chainId: 123,
			l1ChainId: 5,
			name: "A",
			primaryEndpointId: "e1",
			endpoints: [{ id: "e1", rpcUrl: "https://rpc-a.example/" }],
			kind: "custom",
		}
		const rowB = { ...rowA, l1ChainId: 7, endpoints: [{ id: "e1", rpcUrl: "https://rpc-b.example/" }] }
		await browserApi.storage.local.set({ [rowKey]: JSON.stringify(rowA) })

		const realGet = browserApi.storage.local.get.bind(browserApi.storage.local)
		let swapped = false
		browserApi.storage.local.get = (async (key: unknown) => {
			const value = await realGet(key as never)
			if (!swapped && JSON.stringify(value).includes("nulo:core:networks@")) {
				swapped = true
				await browserApi.storage.local.set({ [rowKey]: JSON.stringify(rowB) })
			}
			return value
		}) as typeof browserApi.storage.local.get

		await expect(service.resolveVerifiedL1ChainId("p1", 123)).resolves.toBe(5)
	})
})

describe("NetworkService NodeFactory seam", () => {
	test("getChainId returns the XOR of l1ChainId and rollupVersion for non-localhost", async () => {
		const { service, factory } = harness({
			"https://rpc.example/1": { l1ChainId: 11155111, rollupVersion: 4127419662 },
		})
		// Calls the private probe directly, past the lock and storage.
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		const chainId = await (service as any)._getChainId("https://rpc.example/1")
		expect(chainId).toBe(4138294185)
		expect(factory.created.length).toBe(1)
		expect(factory.created[0]!.rpcUrl).toBe("https://rpc.example/1")
	})

	test("getChainId returns 0 for the localhost:8080 special-case", async () => {
		const { service } = harness({
			"http://localhost:8080": { l1ChainId: 99, rollupVersion: 77 },
		})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		const chainId = await (service as any)._getChainId("http://localhost:8080")
		expect(chainId).toBe(0)
	})

	test("getChainId(kindHint='local') short-circuits to 0 regardless of URL", async () => {
		// Structural fix for the bug where editing Local Network's endpoint URL
		// away from the seed literal yielded ERR_ENDPOINT_CHAIN_MISMATCH. With
		// kindHint, callers that already know the target's kind bypass URL
		// equality entirely.
		const { service } = harness({
			"http://localhost:18080": { l1ChainId: 1, rollupVersion: 2 },
		})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		const chainId = await (service as any)._getChainId("http://localhost:18080", "local")
		expect(chainId).toBe(0)
	})

	test("getChainId normalizes localhost URL fallback (trailing slash, case)", async () => {
		// `normalizeRpcUrl` lowercases host + drops the trailing slash for
		// path === "/". The chainId-zero check must compare normalized values
		// so user-typed variants of the seed URL still resolve to 0.
		const { service } = harness({
			"http://LOCALHOST:8080/": { l1ChainId: 1, rollupVersion: 2 },
		})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		const chainId = await (service as any)._getChainId("http://LOCALHOST:8080/")
		expect(chainId).toBe(0)
	})

	test("getChainId rethrows 'Failed to fetch node info' when getNodeInfo rejects", async () => {
		const { service } = harness({
			"https://bad.example": new Error("ECONNREFUSED"),
		})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		await expect((service as any)._getChainId("https://bad.example")).rejects.toThrow("Failed to fetch node info")
	})

	test("each getChainId call creates a fresh node — no global cache between URLs", async () => {
		const { service, factory } = harness({
			"https://rpc.example/a": { l1ChainId: 1, rollupVersion: 2 },
			"https://rpc.example/b": { l1ChainId: 2, rollupVersion: 3 },
		})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		await (service as any)._getChainId("https://rpc.example/a")
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		await (service as any)._getChainId("https://rpc.example/b")
		expect(factory.created.length).toBe(2)
		expect(factory.created[0]!.rpcUrl).toBe("https://rpc.example/a")
		expect(factory.created[1]!.rpcUrl).toBe("https://rpc.example/b")
	})

	test("default ctor wires AztecNodeFactoryAdapter — no-arg constructor works", () => {
		const logger = new LoggerStore(new ConfigStore())
		// Smoke: constructing without an explicit factory should not throw.
		expect(() => new NetworkService(logger, new FakeBrowserApi())).not.toThrow()
	})
})

describe("NetworkService transient-node cache", () => {
	test("getNodeForUrl caches per URL — same URL returns same node ref", async () => {
		const { service, factory } = harness({
			"https://rpc.a": { l1ChainId: 1, rollupVersion: 1 },
		})
		// Mark service as initialized — `getNodeForUrl` calls `ensureInitialized`
		// which would otherwise wait for `init()` to set the flag.
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		;(service as any).initialized = true
		// Pre-seed the transient cache so the call is a pure cache hit.
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		const transient: Map<string, { node: unknown; failures: number }> = (service as any).transientNodes
		const stub = { __id: "first" }
		transient.set("https://rpc.a", { node: stub as never, failures: 0 })
		const result = await service.getNodeForUrl("https://rpc.a")
		expect(result).toBe(stub)
		// No new factory call — cache hit.
		expect(factory.created.length).toBe(0)
	})

	test("getNodeForUrl pins a pending tx to its submitting endpoint ACROSS profiles", async () => {
		// Leak setup: two profiles, SAME chainId, DIFFERENT rpc endpoints.
		const { service, factory } = setupServiceWithStorage({
			"https://rpc.a": nodeInfoForChain(7),
			"https://rpc.b": nodeInfoForChain(7),
		})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to seed cross-profile networks
		const storage = (service as any).storage as { set: (id: string, n: Network) => Promise<void> }
		await storage.set("netA", {
			id: "netA",
			profileId: "p1",
			chainId: 7,
			l1ChainId: 0,
			name: "A",
			primaryEndpointId: "epA",
			endpoints: [{ id: "epA", rpcUrl: "https://rpc.a" }],
		})
		await storage.set("netB", {
			id: "netB",
			profileId: "p2",
			chainId: 7,
			l1ChainId: 0,
			name: "B",
			primaryEndpointId: "epB",
			endpoints: [{ id: "epB", rpcUrl: "https://rpc.b" }],
		})
		// Active profile is p2. The old code fell back to p2's node here → A's tx
		// hash sent to p2's RPC. getNodeForUrl now always pins to the submitted URL.
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to switch the active profile
		;(service as any).profileService.getActiveProfile = async () => ({ id: "p2", name: "p2", type: "password" })

		// Poll profile A's still-pending tx (submitted to A's endpoint) while B is active.
		const node = await service.getNodeForUrl("https://rpc.a")

		// The returned node is bound to A's endpoint — NOT a fallback to p2's (rpc.b).
		const createdEntry = factory.created.find((c) => c.node === node)
		expect(createdEntry?.rpcUrl).toBe("https://rpc.a")
		expect(factory.created.map((c) => c.rpcUrl)).not.toContain("https://rpc.b")
	})

	test("getNodeForUrl pins to the submitted URL even when it matches NO configured endpoint (deleted/edited, never falls back to active)", async () => {
		// The endpoint was deleted/edited away from every profile while the tx was
		// still pending. Pinning to the submitted URL (no active-profile fallback)
		// keeps the receipt fetch off the active profile's RPC — the leak is closed
		// here too, not just on a plain profile switch.
		const { service, factory } = setupServiceWithStorage({ "https://rpc.b": nodeInfoForChain(7) })
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to seed the active profile's network
		const storage = (service as any).storage as { set: (id: string, n: Network) => Promise<void> }
		await storage.set("netB", {
			id: "netB",
			profileId: "p1",
			chainId: 7,
			l1ChainId: 0,
			name: "B",
			primaryEndpointId: "epB",
			endpoints: [{ id: "epB", rpcUrl: "https://rpc.b" }],
		})

		// active profile is p1 (harness default, endpoint rpc.b). Poll a URL no
		// profile configures — the submitting endpoint was removed.
		const node = await service.getNodeForUrl("https://rpc.deleted")

		// Pins to the submitted URL; never touches the active profile's node (rpc.b).
		const createdEntry = factory.created.find((c) => c.node === node)
		expect(createdEntry?.rpcUrl).toBe("https://rpc.deleted")
		expect(factory.created.map((c) => c.rpcUrl)).not.toContain("https://rpc.b")
	})

	test("getSingleAttemptNodeForUrl pins the same way, through the factory's one-attempt client, one per URL", async () => {
		const { service, factory } = setupServiceWithStorage({ "https://rpc.b": nodeInfoForChain(7) })
		const node = await service.getSingleAttemptNodeForUrl("https://rpc.deleted")
		expect(await service.getSingleAttemptNodeForUrl("https://rpc.deleted")).toBe(node)
		expect(factory.singleAttempt).toEqual(["https://rpc.deleted"])
		expect(factory.created.find((c) => c.node === node)?.rpcUrl).toBe("https://rpc.deleted")
		expect(factory.created.map((c) => c.rpcUrl)).not.toContain("https://rpc.b")
	})

	test("reportEndpointFailure increments + evicts at threshold 3", () => {
		const { service } = harness({})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		const transient: Map<string, { node: unknown; failures: number }> = (service as any).transientNodes
		transient.set("https://rpc.x", { node: {} as never, failures: 0 })
		service.reportEndpointFailure("https://rpc.x")
		expect(transient.get("https://rpc.x")?.failures).toBe(1)
		service.reportEndpointFailure("https://rpc.x")
		expect(transient.get("https://rpc.x")?.failures).toBe(2)
		service.reportEndpointFailure("https://rpc.x")
		expect(transient.has("https://rpc.x")).toBe(false)
	})

	test("reportEndpointFailure for unknown URL is a no-op", () => {
		const { service } = harness({})
		expect(() => service.reportEndpointFailure("https://never-cached")).not.toThrow()
	})
})

/**
 * Minimal in-memory chrome.storage area shim. Mirrors the
 * `MinimalStorageArea` shape EntityStorage actually consumes:
 *   - `get(undefined)` returns ALL entries
 *   - `get(string|string[])` returns the requested subset
 *   - `set(items)` merges
 *   - `remove(keys)` deletes the listed keys
 * The fake stores raw values exactly as written — EntityStorage is the
 * piece that does the JSON.stringify/parse round-trip.
 */
class FakeStorageArea {
	public readonly store = new Map<string, unknown>()

	public async get(keys?: string | string[]): Promise<Record<string, unknown>> {
		if (keys === undefined) return Object.fromEntries(this.store)
		const keyList = Array.isArray(keys) ? keys : [keys]
		const out: Record<string, unknown> = {}
		for (const k of keyList) {
			if (this.store.has(k)) out[k] = this.store.get(k)
		}
		return out
	}

	public async set(items: Record<string, unknown>): Promise<void> {
		for (const [k, v] of Object.entries(items)) this.store.set(k, v)
	}

	public async remove(keys: string | string[]): Promise<void> {
		const keyList = Array.isArray(keys) ? keys : [keys]
		for (const k of keyList) this.store.delete(k)
	}
}

/**
 * Beefier harness for tests that exercise the public API end-to-end.
 * Stubs `chrome.storage.local` + `chrome.storage.session` with in-memory
 * fakes BEFORE constructing NetworkService (its `EntityStorage` field is
 * bound at construction time). Bypasses `init()` by reach-in setting
 * `profileService` + marking `initialized = true` + stubbing
 * `pxeServiceClient`. Tests can then drive `addNetwork`/`addEndpoint`/etc
 * naturally.
 */
function setupServiceWithStorage(seeded: Record<string, NodeInfo | Error>): {
	service: NetworkService
	factory: FakeNodeFactory
	local: FakeStorageArea
	session: FakeStorageArea
	pxeStub: ReturnType<typeof vi.fn>
	deletionState: ProfileDeletionState
} {
	const local = new FakeStorageArea()
	const session = new FakeStorageArea()
	// biome-ignore lint/suspicious/noExplicitAny: test stub for chrome.storage
	;(chrome.storage as any).local = local as never
	// biome-ignore lint/suspicious/noExplicitAny: test stub for chrome.storage
	;(chrome.storage as any).session = session as never

	const logger = new LoggerStore(new ConfigStore())
	const factory = new FakeNodeFactory()
	for (const [rpcUrl, result] of Object.entries(seeded)) {
		if (result instanceof Error) {
			factory.setOverrides(rpcUrl, {
				getNodeInfo: vi.fn().mockRejectedValue(result) as unknown as AztecNode["getNodeInfo"],
			})
		} else {
			factory.setOverrides(rpcUrl, {
				getNodeInfo: vi.fn().mockResolvedValue(result) as unknown as AztecNode["getNodeInfo"],
			})
		}
	}

	// The service must read/write the SAME `local` FakeStorageArea the tests seed
	// (via `local.store.set`), so inject it as the browserApi storage port. Network
	// only touches browserApi.storage, so a partial port is sufficient here.
	const browserApi = { storage: { local, session } } as unknown as BrowserApi
	const service = new NetworkService(logger, browserApi, factory)
	const fakeProfile = { id: "p1", name: "p1", type: "password" } as const
	const pxeStub = vi.fn().mockResolvedValue(undefined)
	const deletionState = new ProfileDeletionState()
	// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
	;(service as any).profileService = {
		...ROW_KEY_FAKE,
		getActiveProfile: async () => fakeProfile,
		onActiveProfileChanged: { add: vi.fn(), remove: vi.fn() },
		onProfileDeleted: { add: vi.fn(), remove: vi.fn() },
		getDeletionState: () => deletionState,
		captureExecutionFence: async () => ({ profileId: "p1", epoch: deletionState.capture("p1") }),
	} as unknown as ProfileService
	// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
	;(service as any).pxeServiceClient = { clearChainState: pxeStub }
	// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in (skip init() wait)
	;(service as any).initialized = true

	return { service, factory, local, session, pxeStub, deletionState }
}

/** Convenience: seed a single endpoint URL → chainId mapping for tests
 *  that only need one network. */
function nodeInfoForChain(chainId: number): NodeInfo {
	// XOR-decompose chainId into l1ChainId + rollupVersion. Either
	// direction works since `(a ^ b) >>> 0` is symmetric. For non-zero
	// chainIds we pick `(0, chainId)` so the math is obvious in tests.
	return { l1ChainId: 0, rollupVersion: chainId }
}

describe("NetworkService purgeChain coordinator", () => {
	test("invokes subscribers in registration order; PXE clear runs last", async () => {
		const { service } = harness({})
		// Stub the offscreen RPC so we can observe its invocation order.
		const pxeStub = vi.fn().mockResolvedValue(undefined)
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		;(service as any).pxeServiceClient = { clearChainState: pxeStub }

		const calls: string[] = []
		service.registerChainPurgeSubscriber(async () => {
			calls.push("first")
		})
		service.registerChainPurgeSubscriber(async () => {
			calls.push("second")
		})
		service.registerChainPurgeSubscriber(async () => {
			calls.push("third")
		})

		await service.purgeChain("p1", 42, "net-id")

		expect(calls).toEqual(["first", "second", "third"])
		expect(pxeStub).toHaveBeenCalledTimes(1)
		expect(pxeStub).toHaveBeenCalledWith("p1", 42)
	})

	test("subscriber failure runs the whole cascade then PROPAGATES (fail-fast, D)", async () => {
		const { service } = harness({})
		const pxeStub = vi.fn().mockResolvedValue(undefined)
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		;(service as any).pxeServiceClient = { clearChainState: pxeStub }

		const calls: string[] = []
		service.registerChainPurgeSubscriber(async () => {
			calls.push("a")
			throw new Error("boom")
		})
		service.registerChainPurgeSubscriber(async () => {
			calls.push("b")
		})

		await expect(service.purgeChain("p1", 1, "n1")).rejects.toThrow(/boom/)
		expect(calls).toEqual(["a", "b"]) // all subscribers still ran — fail-fast is at the END, not mid-cascade
		expect(pxeStub).toHaveBeenCalledTimes(1)
	})

	test("PXE clear failure PROPAGATES (fail-fast, D)", async () => {
		const { service } = harness({})
		const pxeStub = vi.fn().mockRejectedValue(new Error("offscreen down"))
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		;(service as any).pxeServiceClient = { clearChainState: pxeStub }

		await expect(service.purgeChain("p1", 1, "n1")).rejects.toThrow(/offscreen down/)
		expect(pxeStub).toHaveBeenCalledTimes(1)
	})

	test("subscribers receive (profileId, chainId, networkId) tuple", async () => {
		const { service } = harness({})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		;(service as any).pxeServiceClient = { clearChainState: vi.fn().mockResolvedValue(undefined) }

		const captured: Array<[string, number, string]> = []
		service.registerChainPurgeSubscriber(async (profileId, chainId, networkId) => {
			captured.push([profileId, chainId, networkId])
		})

		await service.purgeChain("alpha", 99, "net-77")

		expect(captured).toEqual([["alpha", 99, "net-77"]])
	})
})

describe("NetworkService public API", () => {
	beforeEach(() => {
		// Reset chrome.storage stubs between tests so prior FakeStorageArea
		// instances don't leak across cases.
	})

	describe("RPC URL scheme allowlist", () => {
		test("rejects javascript: URL", async () => {
			const { service } = setupServiceWithStorage({})
			await expect(service.addNetwork("Evil", "javascript:alert(1)")).rejects.toThrow()
		})

		test("rejects data: URL", async () => {
			const { service } = setupServiceWithStorage({})
			await expect(service.addNetwork("Evil", "data:text/html,<script>alert(1)</script>")).rejects.toThrow()
		})

		test("rejects file:// URL", async () => {
			const { service } = setupServiceWithStorage({})
			await expect(service.addNetwork("Evil", "file:///etc/passwd")).rejects.toThrow()
		})

		test("rejects http://attacker.example.com (non-loopback HTTP)", async () => {
			const { service } = setupServiceWithStorage({})
			await expect(service.addNetwork("Bad", "http://attacker.example.com:8080")).rejects.toThrow()
		})

		test("accepts https://anywhere.example.com", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.example.com": nodeInfoForChain(999),
			})
			const network = await service.addNetwork("HTTPS", "https://rpc.example.com")
			expect(network.chainId).toBe(999)
		})

		test("accepts http://localhost:8888", async () => {
			const { service } = setupServiceWithStorage({
				"http://localhost:8888": nodeInfoForChain(31337),
			})
			const network = await service.addNetwork("Local", "http://localhost:8888")
			expect(network.chainId).toBe(31337)
		})

		test("accepts http://127.0.0.1:8888", async () => {
			const { service } = setupServiceWithStorage({
				"http://127.0.0.1:8888": nodeInfoForChain(31337),
			})
			const network = await service.addNetwork("Local-v4", "http://127.0.0.1:8888")
			expect(network.chainId).toBe(31337)
		})

		test("refuses http://[::1]:8888 with its own line", async () => {
			const { service } = setupServiceWithStorage({
				"http://[::1]:8888": nodeInfoForChain(31337),
			})
			await expect(service.addNetwork("Local-v6", "http://[::1]:8888")).rejects.toThrow(ERR_RPC_URL_IPV6_LOOPBACK)
		})
	})

	// A URL saved before the transport rule refused it must fail where an unreachable node fails, so
	// popup start (which awaits `setActiveNetwork`) still reaches Settings, where the person fixes it.
	describe("a saved http://[::1] endpoint", () => {
		const SAVED_V6 = "http://[::1]:8080"

		/** The production adapter's refusal on the fake, so an unguarded `createNode` throws as it would. */
		function refuseAsTheAdapterDoes(factory: FakeNodeFactory) {
			const create = factory.createNode.bind(factory)
			vi.spyOn(factory, "createNode").mockImplementation((url) => {
				if (!isAllowedRpcUrl(url).ok) throw new Error("AztecNodeFactoryAdapter refused to construct node client")
				return create(url)
			})
		}

		test("activating it resolves, emits, evicts the chain's cached node and reads inactive", async () => {
			const { service, factory, local } = setupServiceWithStorage({ "https://old.example": nodeInfoForChain(42) })
			refuseAsTheAdapterDoes(factory)
			const row = storeRow(local, { id: "v6", chainId: 42, endpoints: [{ id: "e1", rpcUrl: "https://old.example" }] })
			await service.setActiveNetwork(row.id)

			storeRow(local, { id: "v6", chainId: 42, endpoints: [{ id: "e1", rpcUrl: SAVED_V6 }] })
			const changed: Network[] = []
			service.onActiveNetworkChanged.add(async (n) => {
				changed.push(n)
			})
			await expect(service.setActiveNetwork(row.id)).resolves.toMatchObject({ id: row.id })

			expect(changed.map((n) => n.id)).toEqual([row.id])
			expect(factory.created.map((c) => c.rpcUrl)).not.toContain(SAVED_V6)
			// A cache miss: the node primed for the old URL is gone.
			await expect(service.getNode(42)).rejects.toThrow(/refused/)
			expect(await service.getNodeStatus(row.id)).toBe(NodeStatus.Inactive)
		})

		test("an unexpected factory error on an allowed URL still rejects the switch", async () => {
			const { service, factory, local } = setupServiceWithStorage({})
			vi.spyOn(factory, "createNode").mockImplementation(() => {
				throw new Error("factory exploded")
			})
			const row = storeRow(local, { id: "ok", chainId: 42, endpoints: [{ id: "e1", rpcUrl: "https://rpc.example" }] })
			await expect(service.setActiveNetwork(row.id)).rejects.toThrow("factory exploded")
		})

		test("the person replaces it: add a localhost endpoint, make it primary, delete the [::1] one", async () => {
			const { service, factory, local } = setupServiceWithStorage({ [NON_SEED_LOCAL_URL]: nodeInfoForChain(42) })
			refuseAsTheAdapterDoes(factory)
			const row = storeRow(local, { id: "v6", chainId: 42, endpoints: [{ id: "e1", rpcUrl: SAVED_V6 }] })
			await service.setActiveNetwork(row.id)

			const added = await service.addEndpoint(row.id, undefined, NON_SEED_LOCAL_URL)
			await service.setPrimaryEndpoint(row.id, added.id)
			await service.deleteEndpoint(row.id, "e1")

			expect((await service.getNetwork(row.id)).endpoints.map((e) => e.rpcUrl)).toEqual([NON_SEED_LOCAL_URL])
			expect(await service.getNodeStatus(row.id)).toBe(NodeStatus.Active)
		})
	})

	// A trailing non-breaking space survives `URL`'s own trim and would be stored as `%C2%A0`.
	describe("a URL with a trailing non-breaking space is stored as the schema trimmed it", () => {
		const nodes = { "https://rpc.test/1": nodeInfoForChain(50), "https://rpc.test/2": nodeInfoForChain(50) }

		test("addNetwork", async () => {
			const { service } = setupServiceWithStorage(nodes)
			const network = await service.addNetwork("Chain50", "https://rpc.test/1\u00A0")
			expect((await service.getNetwork(network.id)).endpoints[0]!.rpcUrl).toBe("https://rpc.test/1")
		})

		test("addEndpoint", async () => {
			const { service } = setupServiceWithStorage(nodes)
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			const ep = await service.addEndpoint(network.id, undefined, "https://rpc.test/2\u00A0")
			expect(ep.rpcUrl).toBe("https://rpc.test/2")
			expect((await service.getNetwork(network.id)).endpoints.map((e) => e.rpcUrl)).toEqual([
				"https://rpc.test/1",
				"https://rpc.test/2",
			])
		})

		test("updateEndpoint", async () => {
			const { service } = setupServiceWithStorage(nodes)
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			await service.updateEndpoint(network.id, network.primaryEndpointId, undefined, "https://rpc.test/2\u00A0")
			expect((await service.getNetwork(network.id)).endpoints[0]!.rpcUrl).toBe("https://rpc.test/2")
		})
	})

	describe("addNetwork", () => {
		test("creates a Network with one initial endpoint and emits onNetworkAdded", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(123),
			})
			const events: Network[] = []
			service.onNetworkAdded.add((n) => {
				events.push(n)
				return Promise.resolve()
			})

			const network = await service.addNetwork("My Chain", "https://rpc.test/1")

			expect(network.profileId).toBe("p1")
			expect(network.chainId).toBe(123)
			expect(network.name).toBe("My Chain")
			expect(network.kind).toBe("custom")
			expect(network.endpoints).toHaveLength(1)
			expect(network.endpoints[0]!.rpcUrl).toBe("https://rpc.test/1")
			expect(network.primaryEndpointId).toBe(network.endpoints[0]!.id)
			expect(events).toHaveLength(1)
			expect(events[0]!.id).toBe(network.id)
		})

		test("rejects with DUPLICATE_CHAIN when chainId already present in profile", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(123),
				"https://rpc.test/2": nodeInfoForChain(123),
			})
			await service.addNetwork("First", "https://rpc.test/1")
			await expect(service.addNetwork("Second", "https://rpc.test/2")).rejects.toThrow(/DUPLICATE_CHAIN/)
		})

		test("rejects when name is already in use", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(123),
				"https://rpc.test/2": nodeInfoForChain(456),
			})
			await service.addNetwork("Same Name", "https://rpc.test/1")
			await expect(service.addNetwork("Same Name", "https://rpc.test/2")).rejects.toThrow(/already in use/)
		})

		test("normalizes the rpcUrl host (lowercase) but preserves path", async () => {
			const { service } = setupServiceWithStorage({
				"https://RPC.Test.com/Path?KEY=Value": nodeInfoForChain(7),
			})
			const network = await service.addNetwork("MixedCase", "https://RPC.Test.com/Path?KEY=Value")
			// host lowercased
			expect(network.endpoints[0]!.rpcUrl).toContain("rpc.test.com")
			// path + query preserved verbatim
			expect(network.endpoints[0]!.rpcUrl).toContain("/Path")
			expect(network.endpoints[0]!.rpcUrl).toContain("KEY=Value")
		})
	})

	describe("renameNetwork", () => {
		test("updates the name and emits onNetworkUpdated", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
			})
			const created = await service.addNetwork("Old", "https://rpc.test/1")

			const updates: Network[] = []
			service.onNetworkUpdated.add((n) => {
				updates.push(n)
				return Promise.resolve()
			})

			const renamed = await service.renameNetwork(created.id, "New")
			expect(renamed.name).toBe("New")
			expect(updates).toHaveLength(1)
			expect(updates[0]!.name).toBe("New")
		})

		test("rejects collision with another network's name", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
				"https://rpc.test/2": nodeInfoForChain(2),
			})
			await service.addNetwork("Alpha", "https://rpc.test/1")
			const beta = await service.addNetwork("Beta", "https://rpc.test/2")
			await expect(service.renameNetwork(beta.id, "Alpha")).rejects.toThrow(/already in use/)
		})

		test("no-op when name is unchanged (no event)", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
			})
			const created = await service.addNetwork("Same", "https://rpc.test/1")
			const updates: Network[] = []
			service.onNetworkUpdated.add((n) => {
				updates.push(n)
				return Promise.resolve()
			})
			const result = await service.renameNetwork(created.id, "Same")
			expect(result.id).toBe(created.id)
			expect(updates).toHaveLength(0)
		})
	})

	describe("addEndpoint", () => {
		test("appends a new endpoint when chainId matches", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
				"https://rpc.test/2": nodeInfoForChain(50),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			const ep = await service.addEndpoint(network.id, "Backup", "https://rpc.test/2")
			expect(ep.label).toBe("Backup")
			expect(ep.rpcUrl).toContain("rpc.test/2")

			const updated = await service.getNetwork(network.id)
			expect(updated.endpoints).toHaveLength(2)
			// primary unchanged
			expect(updated.primaryEndpointId).toBe(network.primaryEndpointId)
		})

		test("rejects ENDPOINT_CHAIN_MISMATCH when probed chainId differs", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
				"https://rpc.other": nodeInfoForChain(99),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			await expect(service.addEndpoint(network.id, "Wrong", "https://rpc.other")).rejects.toThrow(/ENDPOINT_CHAIN_MISMATCH/)
		})

		test("rejects DUPLICATE_ENDPOINT when rpcUrl already exists in this Network", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			await expect(service.addEndpoint(network.id, "Dup", "https://rpc.test/1")).rejects.toThrow(/DUPLICATE_ENDPOINT/)
		})

		test("Local Network accepts a non-seed endpoint URL via the kindHint short-circuit", async () => {
			// Locks the structural fix: with `kind: "local"`, the chainId probe
			// returns 0 even if the URL doesn't match the seed literal. Without
			// kindHint we'd reject with ENDPOINT_CHAIN_MISMATCH because the
			// fake node reports chainId XOR != 0.
			const { service, local } = setupServiceWithStorage({
				"http://localhost:18080": { l1ChainId: LOCAL_L1_CHAIN_ID, rollupVersion: 42 },
			})
			const localNet = {
				id: "local-1",
				profileId: "p1",
				chainId: 0,
				// Matches the fake probe's l1ChainId so the endpoint mutation's exact-L1 equality
				// check passes alongside the composite short-circuit under test.
				l1ChainId: LOCAL_L1_CHAIN_ID,
				name: "Local Network",
				kind: "local" as const,
				primaryEndpointId: "ep-1",
				endpoints: [{ id: "ep-1", rpcUrl: "http://localhost:8080" }],
			}
			local.store.set("nulo:core:networks@local-1", JSON.stringify(localNet))

			const ep = await service.addEndpoint(localNet.id, "Custom Port", "http://localhost:18080")
			expect(ep.rpcUrl).toContain("localhost:18080")
			const fetched = await service.getNetwork(localNet.id)
			expect(fetched.endpoints).toHaveLength(2)
		})
	})

	describe("updateEndpoint", () => {
		// Characterization pins: this method had ZERO coverage — every
		// branch below is pinned as-is before any structural refactor touches it.
		test("replaces the endpoint in place — same id, new url + label, array length unchanged; emits onNetworkUpdated", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
				"https://rpc.test/2": nodeInfoForChain(50),
				"https://rpc.test/3": nodeInfoForChain(50),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			const ep = await service.addEndpoint(network.id, "Backup", "https://rpc.test/2")
			const updates: Network[] = []
			service.onNetworkUpdated.add((n) => {
				updates.push(n)
				return Promise.resolve()
			})

			const updated = await service.updateEndpoint(network.id, ep.id, "Renamed", "https://rpc.test/3")

			expect(updated.id).toBe(ep.id)
			expect(updated.label).toBe("Renamed")
			expect(updated.rpcUrl).toContain("rpc.test/3")
			const after = await service.getNetwork(network.id)
			expect(after.endpoints).toHaveLength(2)
			expect(after.endpoints.find((e) => e.id === ep.id)?.rpcUrl).toContain("rpc.test/3")
			expect(updates).toHaveLength(1)
		})

		test("an unchanged URL does NOT collide with itself (self-excluding predicate)", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
				"https://rpc.test/2": nodeInfoForChain(50),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			const ep = await service.addEndpoint(network.id, "Backup", "https://rpc.test/2")

			const updated = await service.updateEndpoint(network.id, ep.id, "Label only", "https://rpc.test/2")

			expect(updated.label).toBe("Label only")
			expect(updated.rpcUrl).toContain("rpc.test/2")
		})

		test("rejects DUPLICATE_ENDPOINT when ANOTHER endpoint of this network uses the URL", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
				"https://rpc.test/2": nodeInfoForChain(50),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			const ep = await service.addEndpoint(network.id, "Backup", "https://rpc.test/2")
			await expect(service.updateEndpoint(network.id, ep.id, "Steal", "https://rpc.test/1")).rejects.toThrow(/DUPLICATE_ENDPOINT/)
		})

		test("rejects on an invalid endpoint id", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			await expect(service.updateEndpoint(network.id, "nope", "X", "https://rpc.test/1")).rejects.toThrow(/Invalid endpoint id/)
		})

		test("rejects ENDPOINT_CHAIN_MISMATCH when the new URL probes a different chain", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
				"https://rpc.other": nodeInfoForChain(99),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			await expect(service.updateEndpoint(network.id, network.primaryEndpointId, "Wrong", "https://rpc.other")).rejects.toThrow(
				/ENDPOINT_CHAIN_MISMATCH/,
			)
		})

		test("evicts the transient-node cache for the OLD url unconditionally", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
				"https://rpc.test/2": nodeInfoForChain(50),
				"https://rpc.test/3": nodeInfoForChain(50),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			const ep = await service.addEndpoint(network.id, "Backup", "https://rpc.test/2")
			// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
			const transients = (service as any).transientNodes as Map<string, unknown>
			const oldUrl = ep.rpcUrl
			transients.set(oldUrl, { node: {}, failures: 0 })

			await service.updateEndpoint(network.id, ep.id, "Moved", "https://rpc.test/3")

			expect(transients.has(oldUrl)).toBe(false)
		})

		test("evicts the chain node cache ONLY when the edited endpoint is the primary", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
				"https://rpc.test/2": nodeInfoForChain(50),
				"https://rpc.test/3": nodeInfoForChain(50),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			const ep = await service.addEndpoint(network.id, "Backup", "https://rpc.test/2")
			await service.getNode(50)
			// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
			const nodes = (service as any).nodes as Map<number, unknown>
			expect(nodes.has(50)).toBe(true)

			// Non-primary edit: chain node cache retained.
			await service.updateEndpoint(network.id, ep.id, "Moved", "https://rpc.test/3")
			expect(nodes.has(50)).toBe(true)

			// Primary edit: chain node cache evicted.
			await service.updateEndpoint(network.id, network.primaryEndpointId, "Primary moved", "https://rpc.test/2")
			expect(nodes.has(50)).toBe(false)
		})

		test("evictions happen BEFORE onNetworkUpdated fires (subscribers observe post-eviction caches)", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
				"https://rpc.test/2": nodeInfoForChain(50),
				"https://rpc.test/3": nodeInfoForChain(50),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			const ep = await service.addEndpoint(network.id, "Backup", "https://rpc.test/2")
			// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
			const transients = (service as any).transientNodes as Map<string, unknown>
			transients.set(ep.rpcUrl, { node: {}, failures: 0 })

			let transientAtEmit: boolean | undefined
			service.onNetworkUpdated.add(() => {
				transientAtEmit = transients.has(ep.rpcUrl)
				return Promise.resolve()
			})

			await service.updateEndpoint(network.id, ep.id, "Moved", "https://rpc.test/3")

			expect(transientAtEmit).toBe(false)
		})

		test("guard precedence: unknown endpoint id + wrong-chain URL throws CHAIN_MISMATCH, not invalid id", async () => {
			// The chain-mismatch guard runs BEFORE the endpoint-id lookup; a shared
			// pipeline that hoists idx-resolution would flip this precedence.
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(50),
				"https://rpc.other": nodeInfoForChain(99),
			})
			const network = await service.addNetwork("Chain50", "https://rpc.test/1")
			await expect(service.updateEndpoint(network.id, "nope", "X", "https://rpc.other")).rejects.toThrow(/ENDPOINT_CHAIN_MISMATCH/)
		})
	})

	describe("setPrimaryEndpoint", () => {
		test("updates primary, emits event, evicts AztecNode cache for that chainId", async () => {
			const { service, factory } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(7),
				"https://rpc.test/2": nodeInfoForChain(7),
			})
			const network = await service.addNetwork("X", "https://rpc.test/1")
			const ep2 = await service.addEndpoint(network.id, "B", "https://rpc.test/2")

			// Prime the AztecNode cache via getNode().
			await service.getNode(7)
			// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
			expect(((service as any).nodes as Map<number, unknown>).has(7)).toBe(true)
			const before = factory.created.length

			const events: { networkId: string; endpointId: string }[] = []
			service.onPrimaryEndpointChanged.add((evt) => {
				events.push(evt)
				return Promise.resolve()
			})

			await service.setPrimaryEndpoint(network.id, ep2.id)

			// Cache evicted.
			// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
			expect(((service as any).nodes as Map<number, unknown>).has(7)).toBe(false)
			// Event fired.
			expect(events).toEqual([{ networkId: network.id, endpointId: ep2.id }])
			// Next getNode creates a fresh node bound to the new URL.
			await service.getNode(7)
			expect(factory.created.length).toBeGreaterThan(before)
		})

		test("no-op when endpointId already primary (no event)", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
			})
			const network = await service.addNetwork("X", "https://rpc.test/1")
			const events: unknown[] = []
			service.onPrimaryEndpointChanged.add((evt) => {
				events.push(evt)
				return Promise.resolve()
			})
			await service.setPrimaryEndpoint(network.id, network.primaryEndpointId)
			expect(events).toHaveLength(0)
		})
	})

	describe("deleteEndpoint", () => {
		test("rejects PRIMARY_ENDPOINT", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
				"https://rpc.test/2": nodeInfoForChain(1),
			})
			const network = await service.addNetwork("X", "https://rpc.test/1")
			await service.addEndpoint(network.id, "B", "https://rpc.test/2")
			await expect(service.deleteEndpoint(network.id, network.primaryEndpointId)).rejects.toThrow(/PRIMARY_ENDPOINT/)
		})

		test("rejects LAST_ENDPOINT when only one endpoint exists", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
			})
			const network = await service.addNetwork("X", "https://rpc.test/1")
			await expect(service.deleteEndpoint(network.id, network.primaryEndpointId)).rejects.toThrow(/LAST_ENDPOINT/)
		})

		test("removes a non-primary endpoint and emits onNetworkUpdated", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
				"https://rpc.test/2": nodeInfoForChain(1),
			})
			const network = await service.addNetwork("X", "https://rpc.test/1")
			const ep = await service.addEndpoint(network.id, "B", "https://rpc.test/2")
			const updates: Network[] = []
			service.onNetworkUpdated.add((n) => {
				updates.push(n)
				return Promise.resolve()
			})
			const removed: NetworkEndpoint = await service.deleteEndpoint(network.id, ep.id)
			expect(removed.id).toBe(ep.id)
			const after = await service.getNetwork(network.id)
			expect(after.endpoints).toHaveLength(1)
			expect(updates).toHaveLength(1)
		})
	})

	describe("setActiveNetwork", () => {
		test("does NOT mutate primaryEndpointId; emits onActiveNetworkChanged", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
				"https://rpc.test/2": nodeInfoForChain(2),
			})
			const a = await service.addNetwork("A", "https://rpc.test/1")
			const b = await service.addNetwork("B", "https://rpc.test/2")
			const events: Network[] = []
			service.onActiveNetworkChanged.add((n) => {
				events.push(n)
				return Promise.resolve()
			})
			await service.setActiveNetwork(b.id)
			const re = await service.getNetwork(b.id)
			expect(re.primaryEndpointId).toBe(b.primaryEndpointId)
			expect(events).toHaveLength(1)
			expect(events[0]!.id).toBe(b.id)
			// Ensure A's primary still untouched too.
			const reA = await service.getNetwork(a.id)
			expect(reA.primaryEndpointId).toBe(a.primaryEndpointId)
		})
	})

	describe("getActiveNetwork", () => {
		test("returns null before any setActiveNetwork", async () => {
			const { service } = setupServiceWithStorage({})
			const result = await service.getActiveNetwork()
			expect(result).toBeNull()
		})

		test("returns the most recently activated network", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
			})
			const network = await service.addNetwork("A", "https://rpc.test/1")
			await service.setActiveNetwork(network.id)
			const got = await service.getActiveNetwork()
			expect(got?.id).toBe(network.id)
		})
	})

	describe("getPrimaryNetwork", () => {
		test("returns the network matching the primary (isPrimaryActive) seed's chainId, regardless of insertion order", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/other": nodeInfoForChain(999_999),
				"https://rpc.test/testnet": nodeInfoForChain(CHAIN_IDS.TESTNET),
				"https://rpc.test/mainnet": nodeInfoForChain(CHAIN_IDS.MAINNET),
			})
			await service.addNetwork("Other", "https://rpc.test/other")
			await service.addNetwork("Testnet", "https://rpc.test/testnet")
			const mainnet = await service.addNetwork("Mainnet", "https://rpc.test/mainnet")
			const primary = await service.getPrimaryNetwork()
			expect(primary?.id).toBe(mainnet.id)
			expect(primary?.chainId).toBe(CHAIN_IDS.MAINNET)
		})

		test("returns null when the primary network is absent (e.g. the user deleted Mainnet)", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/other": nodeInfoForChain(999_999),
			})
			await service.addNetwork("Other", "https://rpc.test/other")
			expect(await service.getPrimaryNetwork()).toBeNull()
		})
	})

	describe("setActiveForProfile (item 1b — restore active selection before finalizeRestore)", () => {
		// The harness's profileService returns profile "p1"; addNetwork stamps rows with p1.
		test("writes the active pointer for a profile-owned network without an active session", async () => {
			const { service } = setupServiceWithStorage({ "https://rpc.test/1": nodeInfoForChain(1) })
			const net = await service.addNetwork("A", "https://rpc.test/1")
			const written = await service.setActiveForProfile("p1", net.id)
			expect(written).toBe(net.id)
			expect((await service.getActiveNetwork())?.id).toBe(net.id)
		})

		test("rejects a hostile/unowned networkId (requireOwnedRow)", async () => {
			const { service } = setupServiceWithStorage({ "https://rpc.test/1": nodeInfoForChain(1) })
			const net = await service.addNetwork("A", "https://rpc.test/1")
			// A network owned by p1, but a DIFFERENT profileId → rejected.
			await expect(service.setActiveForProfile("someone-else", net.id)).rejects.toThrow()
			// A networkId that doesn't exist at all → rejected.
			await expect(service.setActiveForProfile("p1", "no-such-network")).rejects.toThrow()
		})
	})

	describe("deleteNetwork", () => {
		test("rejects ACTIVE_NETWORK when target is the current active id", async () => {
			const { service } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
			})
			const network = await service.addNetwork("X", "https://rpc.test/1")
			await service.setActiveNetwork(network.id)
			await expect(service.deleteNetwork(network.id)).rejects.toThrow(/ACTIVE_NETWORK/)
		})

		test("calls purgeChain (subscribers + PXE) before deleting the row", async () => {
			const { service, pxeStub } = setupServiceWithStorage({
				"https://rpc.test/1": nodeInfoForChain(1),
				"https://rpc.test/2": nodeInfoForChain(2),
			})
			const a = await service.addNetwork("A", "https://rpc.test/1")
			const b = await service.addNetwork("B", "https://rpc.test/2")
			// Make B active so we can delete A.
			await service.setActiveNetwork(b.id)
			const subscriberCalls: Array<[string, number, string]> = []
			service.registerChainPurgeSubscriber(async (profileId, chainId, networkId) => {
				subscriberCalls.push([profileId, chainId, networkId])
			})
			const deleted: Network[] = []
			service.onNetworkDeleted.add((n) => {
				deleted.push(n)
				return Promise.resolve()
			})

			await service.deleteNetwork(a.id)

			expect(subscriberCalls).toEqual([["p1", a.chainId, a.id]])
			expect(pxeStub).toHaveBeenCalledWith("p1", a.chainId)
			expect(deleted.map((n) => n.id)).toEqual([a.id])
			// Row really gone.
			await expect(service.getNetwork(a.id)).rejects.toThrow(/Invalid id/)
		})
	})
})

describe("NetworkService liveness reads overlapped by a reservation", () => {
	async function deletableNetwork() {
		const h = setupServiceWithStorage({ "https://rpc.test/1": nodeInfoForChain(1), "https://rpc.test/2": nodeInfoForChain(2) })
		const network = await h.service.addNetwork("A", "https://rpc.test/1")
		await h.service.setActiveNetwork((await h.service.addNetwork("B", "https://rpc.test/2")).id)
		// A failing cascade reserves the network and ends the reservation with its row still stored.
		h.service.registerChainPurgeSubscriber(async () => {
			throw new Error("cascade down")
		})
		return { ...h, network }
	}

	/** Holds the answer of the next storage read, which has already been taken, until `release`. */
	function holdNextRead(local: FakeStorageArea) {
		const get = local.get.bind(local)
		let release!: () => void
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		let started!: () => void
		const reading = new Promise<void>((resolve) => {
			started = resolve
		})
		local.get = async (keys) => {
			local.get = get
			const answer = await get(keys)
			started()
			await gate
			return answer
		}
		return { reading, release }
	}

	test.each([
		{ name: "isNetworkLive", read: (s: NetworkService, n: Network) => s.isNetworkLive(n.id) },
		{ name: "isChainLive", read: (s: NetworkService, n: Network) => s.isChainLive(n.profileId, n.chainId) },
	])("$name: a reservation that begins and ends during the read answers false; reads around it answer true", async ({ read }) => {
		const { service, local, network } = await deletableNetwork()
		expect(await read(service, network)).toBe(true)

		const held = holdNextRead(local)
		const live = read(service, network)
		await held.reading
		await expect(service.deleteNetwork(network.id)).rejects.toThrow(/cascade down/)
		held.release()

		expect(await live).toBe(false)
		expect(await read(service, network)).toBe(true)
	})

	test("a liveness mark answers false after a reservation begun since it, and none is taken while one is open", async () => {
		const { service, network } = await deletableNetwork()
		const before = await service.captureLiveness(network.id)
		expect(before).toBeDefined()
		await expect(service.deleteNetwork(network.id)).rejects.toThrow(/cascade down/)
		expect(await service.isNetworkLive(network.id)).toBe(true)
		expect(await service.isNetworkLive(network.id, before)).toBe(false)
		const after = await service.captureLiveness(network.id)
		expect(await service.isNetworkLive(network.id, after)).toBe(true)

		let release!: () => void
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		let entered!: () => void
		const purging = new Promise<void>((resolve) => {
			entered = resolve
		})
		service.registerChainPurgeSubscriber(async () => {
			entered()
			await held
		})
		const deleting = service.deleteNetwork(network.id)
		try {
			await purging
			expect(await service.captureLiveness(network.id)).toBeUndefined()
		} finally {
			release()
		}
		await expect(deleting).rejects.toThrow(/cascade down/)
	})
})

const MAINNET = seedForKind("mainnet")!

/** Runs `open` as a build that predates the Mainnet seed: the defaults every released build seeded. */
async function asEarlierBuild<T>(open: () => Promise<T>): Promise<T> {
	const at = DEFAULT_SEEDS.indexOf(MAINNET)
	DEFAULT_SEEDS.splice(at, 1)
	try {
		return await open()
	} finally {
		DEFAULT_SEEDS.splice(at, 0, MAINNET)
	}
}

describe("NetworkService default seeding", () => {
	test("seeds Testnet, Local Network and Mainnet; each dRPC endpoint carries the 'dRPC' label", async () => {
		// Settings renders `endpoint.label || endpoint.rpcUrl` as the row title — the label is what
		// keeps the raw provider URL out of the UI. Local Network is not dRPC-backed, so no label.
		const { service } = setupServiceWithStorage({})
		const networks = await service.getOrInitNetworks()
		const byName = new Map(networks.map((n) => [n.name, n]))
		expect([...byName.keys()].sort()).toEqual(["Alpha", "Local Network", "Testnet"])
		expect(byName.get("Testnet")?.endpoints[0]?.label).toBe("dRPC")
		expect(byName.get("Alpha")?.endpoints[0]?.label).toBe("dRPC")
		expect(byName.get("Local Network")?.endpoints[0]?.label).toBeUndefined()
	})
})

describe("NetworkService — Mainnet, the default this build adds", () => {
	const OFFERS_KEY = seedOffersKey("p1")
	type Harness = ReturnType<typeof setupServiceWithStorage>

	/** A profile an earlier build seeded (Testnet and Local Network, no offer record), now opened by
	 *  this build. */
	async function seededByEarlierBuild(h: Harness): Promise<Network[]> {
		const rows = await asEarlierBuild(() => h.service.getOrInitNetworks())
		h.local.store.delete(OFFERS_KEY)
		return rows
	}
	const extraRows = async (h: Harness) => (await h.service.getNetworksRaw("p1")).filter((n) => n.kind === "mainnet")
	const offered = (h: Harness) => (JSON.parse(h.local.store.get(OFFERS_KEY) as string) as { offered: string[] }).offered

	test("an existing profile gets the new default on open and nothing else moves; a second open writes nothing", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		const before = new Map(h.local.store)

		await h.service.getOrInitNetworks()

		const [extra, ...twins] = await extraRows(h)
		expect(twins).toEqual([])
		expect(extra).toMatchObject({ chainId: MAINNET.chainId, l1ChainId: MAINNET.l1ChainId, name: MAINNET.name, kind: "mainnet" })
		expect(findPrimaryEndpoint(extra!)?.rpcUrl).toBe(MAINNET.rpcUrl)
		for (const [key, value] of before) expect(h.local.store.get(key), key).toBe(value)
		expect(offered(h)).toEqual(["local", "mainnet", "testnet"])

		const writes = recordWrites(h.local as unknown as BrowserApi["storage"]["local"], "nulo:")
		await h.service.getOrInitNetworks()
		writes.restore()
		expect(writes.log).toEqual([])
	})

	test("the new default deleted stays deleted; renamed, it keeps its name and gets no twin", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		await h.service.getOrInitNetworks()
		const [extra] = await extraRows(h)

		await h.service.renameNetwork(extra!.id, "My Mainnet")
		await h.service.getOrInitNetworks()
		expect((await extraRows(h)).map((n) => n.name)).toEqual(["My Mainnet"])

		await h.service.deleteNetwork(extra!.id)
		await h.service.getOrInitNetworks()
		expect(await extraRows(h)).toEqual([])
	})

	test("two opens at once add one row of each default, on an existing profile and on a new one", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		await Promise.all([h.service.getOrInitNetworks(), h.service.getOrInitNetworks()])
		expect(await extraRows(h)).toHaveLength(1)

		const fresh = setupServiceWithStorage({})
		await Promise.all([fresh.service.getOrInitNetworks(), fresh.service.getOrInitNetworks()])
		expect((await fresh.service.getNetworksRaw("p1")).map((n) => n.kind).sort()).toEqual(["local", "mainnet", "testnet"])
	})

	test("a deletion landing while the offer is recorded rejects the open and restores the record it replaced", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		const overtaken = () =>
			recordWrites(h.local as unknown as BrowserApi["storage"]["local"], OFFERS_KEY, () => {
				h.deletionState.beginDeletion("p1")
				h.deletionState.release("p1")
			})

		const first = overtaken()
		await expect(h.service.getOrInitNetworks()).rejects.toThrow(/^profile p1 deleted$/)
		first.restore()
		expect(first.log).toEqual([`set:${OFFERS_KEY}`, `remove:${OFFERS_KEY}`])
		expect(h.local.store.has(OFFERS_KEY)).toBe(false)

		const prior = JSON.stringify({ offered: ["local", "testnet"] })
		h.local.store.set(OFFERS_KEY, prior)
		const second = overtaken()
		await expect(h.service.getOrInitNetworks()).rejects.toThrow(/^profile p1 deleted$/)
		second.restore()
		expect(h.local.store.get(OFFERS_KEY)).toBe(prior)
	})

	test("a restore into a profile with rows adds the new default and keeps its active network", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		const activeBefore = h.local.store.get("nulo:core:active-network@p1")
		const internals = h.service as unknown as { profileService: { getProfiles: () => Promise<unknown[]> } }
		internals.profileService.getProfiles = async () => [{ id: "p1", name: "p1", type: "password" }]

		const rows = await h.service.seedDefaultsForProfile("p1")

		expect(rows.filter((n) => n.kind === "mainnet")).toHaveLength(1)
		expect(h.local.store.get("nulo:core:active-network@p1")).toBe(activeBefore)
	})

	test("a default whose chain a reset names waits, unrecorded, and is added once the reset is gone", async () => {
		const h = setupServiceWithStorage({})
		const [testnet] = await seededByEarlierBuild(h)
		const staleKey = "nulo:core:stale-networks@p1"
		const entry = { networkId: testnet!.id, chainId: MAINNET.chainId, networkReset: true, addressesMoved: false }
		h.local.store.set(staleKey, JSON.stringify({ profileId: "p1", accountSetDigest: "d", entries: [entry] }))

		await h.service.getOrInitNetworks()
		expect(await extraRows(h)).toEqual([])
		expect(offered(h)).toEqual(["local", "testnet"])

		h.local.store.delete(staleKey)
		await h.service.getOrInitNetworks()
		expect(await extraRows(h)).toHaveLength(1)
	})

	test("a default whose row write fails stays unrecorded and is added at the next open", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		let failed = false
		const writes = recordWrites(h.local as unknown as BrowserApi["storage"]["local"], "nulo:core:networks@", undefined, () => {
			if (failed) return
			failed = true
			return Promise.reject(new Error("quota"))
		})

		await h.service.getOrInitNetworks()
		writes.restore()
		expect(await extraRows(h)).toEqual([])
		expect(offered(h)).toEqual(["local", "testnet"])

		await h.service.getOrInitNetworks()
		expect(await extraRows(h)).toHaveLength(1)
	})

	test("a corrupt record keeps its bytes and adds nothing; a storage read that fails fails the open", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		h.local.store.set(OFFERS_KEY, "{not json")

		await h.service.getOrInitNetworks()
		expect(await extraRows(h)).toEqual([])
		expect(h.local.store.get(OFFERS_KEY)).toBe("{not json")

		h.local.store.delete(OFFERS_KEY)
		const get = h.local.get.bind(h.local)
		h.local.get = async (keys) => (keys === OFFERS_KEY ? Promise.reject(new Error("storage read failed")) : get(keys))
		await expect(h.service.getOrInitNetworks()).rejects.toThrow("storage read failed")
	})

	test("profile deletion removes the record; a restore records every default it seeds", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		await h.service.getOrInitNetworks()
		expect(h.local.store.has(OFFERS_KEY)).toBe(true)

		await h.service.purgeForProfile("p1")
		expect(h.local.store.has(OFFERS_KEY)).toBe(false)

		const internals = h.service as unknown as { profileService: { getProfiles: () => Promise<unknown[]> } }
		internals.profileService.getProfiles = async () => [{ id: "p2", name: "p2", type: "password" }]
		await h.service.seedDefaultsForProfile("p2")
		expect(JSON.parse(h.local.store.get(seedOffersKey("p2")) as string)).toEqual({ offered: ["local", "mainnet", "testnet"] })
	})

	test("a dApp is served the new default's chain before the open, and refused it once offered and deleted", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		expect(await h.service.servesChain("p1", MAINNET.chainId)).toBe(true)

		await h.service.getOrInitNetworks()
		const [extra] = await extraRows(h)
		await h.service.deleteNetwork(extra!.id)

		expect(await h.service.servesChain("p1", MAINNET.chainId)).toBe(false)
	})

	test("a dApp check parked between its reads while a whole open commits is still served", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		const get = h.local.get.bind(h.local)
		let parked: (() => void) | undefined
		let armed = true
		h.local.get = async (keys) => {
			const result = await get(keys)
			if (armed) {
				armed = false
				await new Promise<void>((resolve) => {
					parked = resolve
				})
			}
			return result
		}

		const serves = h.service.servesChain("p1", MAINNET.chainId)
		await vi.waitFor(() => expect(parked).toBeDefined())
		await h.service.getOrInitNetworks()
		expect(offered(h)).toContain("mainnet")
		parked!()

		expect(await serves).toBe(true)
	})

	test("adding the new default leaves every chain's classification as it was", async () => {
		const h = setupServiceWithStorage({})
		const [testnet] = await seededByEarlierBuild(h)
		h.local.store.set(`nulo:core:networks@${testnet!.id}`, JSON.stringify({ ...testnet, chainId: 1816023401 }))
		const accounts = [{ chainId: 0, l1ChainId: LOCAL_L1_CHAIN_ID, index: 0, address: "0x0a", derivedAddress: "0x0b" }]
		const before = classifyChains(await h.service.getNetworksRaw("p1"), accounts)

		await h.service.getOrInitNetworks()

		expect(await extraRows(h)).toHaveLength(1)
		expect(before.entries).toHaveLength(2)
		expect(classifyChains(await h.service.getNetworksRaw("p1"), accounts)).toEqual(before)
	})

	test("a custom network on the new default's chain keeps that chain classifiable: no second row on it", async () => {
		const h = setupServiceWithStorage({})
		await seededByEarlierBuild(h)
		const custom = {
			id: "cm",
			profileId: "p1",
			chainId: MAINNET.chainId,
			l1ChainId: 7,
			name: "Mine",
			kind: "custom",
			primaryEndpointId: "cm-ep0",
			endpoints: [{ id: "cm-ep0", rpcUrl: "https://rpc.mine.example/" }],
		}
		h.local.store.set("nulo:core:networks@cm", JSON.stringify(custom))
		const accounts = [{ chainId: MAINNET.chainId, l1ChainId: 7, index: 0, address: "0x0a", derivedAddress: "0x0b" }]
		const before = classifyChains(await h.service.getNetworksRaw("p1"), accounts)
		expect(before.entries).toEqual([{ networkId: "cm", chainId: MAINNET.chainId, networkReset: false, addressesMoved: true }])

		await h.service.getOrInitNetworks()

		expect(await extraRows(h)).toEqual([])
		expect(classifyChains(await h.service.getNetworksRaw("p1"), accounts)).toEqual(before)
	})

	describe("the arrival of the new default", () => {
		const record = (h: Harness) => JSON.parse(h.local.store.get(OFFERS_KEY) as string) as { offered: string[]; announce?: string[] }
		const kindRow = (id: string, kind: "mainnet" | "custom") => ({
			id,
			profileId: "p1",
			chainId: MAINNET.chainId,
			l1ChainId: MAINNET.l1ChainId,
			name: id,
			kind,
			primaryEndpointId: `${id}-ep0`,
			endpoints: [{ id: `${id}-ep0`, rpcUrl: "https://rpc.row.example/" }],
		})

		test("is announced when the open adds the default to a profile that had networks, and shows until answered", async () => {
			const h = setupServiceWithStorage({})
			await seededByEarlierBuild(h)
			await h.service.getOrInitNetworks()
			const [extra] = await extraRows(h)

			expect(record(h).announce).toEqual(["mainnet"])
			expect((await h.service.getNetworkArrival())?.id).toBe(extra!.id)
			await h.service.getOrInitNetworks()
			expect((await h.service.getNetworkArrival())?.id).toBe(extra!.id)
		})

		test("a new profile and a restored one announce nothing", async () => {
			const h = setupServiceWithStorage({})
			await h.service.getOrInitNetworks()
			expect(await extraRows(h)).toHaveLength(1)
			expect(await h.service.getNetworkArrival()).toBeNull()

			const internals = h.service as unknown as { profileService: { getProfiles: () => Promise<unknown[]> } }
			internals.profileService.getProfiles = async () => [{ id: "p2", name: "p2", type: "password" }]
			await h.service.seedDefaultsForProfile("p2")
			expect(JSON.parse(h.local.store.get(seedOffersKey("p2")) as string)).toEqual({ offered: ["local", "mainnet", "testnet"] })
		})

		test("a row of the default an interrupted open left is announced", async () => {
			const h = setupServiceWithStorage({})
			await seededByEarlierBuild(h)
			h.local.store.set("nulo:core:networks@left", JSON.stringify(kindRow("left", "mainnet")))
			await h.service.getOrInitNetworks()
			expect((await extraRows(h)).map((n) => n.id)).toEqual(["left"])
			expect((await h.service.getNetworkArrival())?.id).toBe("left")
		})

		test("a custom network on the default's chain is the person's own: offered, never announced", async () => {
			const h = setupServiceWithStorage({})
			await seededByEarlierBuild(h)
			h.local.store.set("nulo:core:networks@cm", JSON.stringify(kindRow("cm", "custom")))
			await h.service.getOrInitNetworks()
			expect(record(h)).toEqual({ offered: ["local", "mainnet", "testnet"] })
			expect(await h.service.getNetworkArrival()).toBeNull()
		})

		test("staying answers it for good: the record is the offer alone, and a second answer writes nothing", async () => {
			const h = setupServiceWithStorage({})
			await seededByEarlierBuild(h)
			await h.service.getOrInitNetworks()
			const [extra] = await extraRows(h)

			await h.service.answerNetworkArrival(extra!.id)

			expect(h.local.store.get(OFFERS_KEY)).toBe(JSON.stringify({ offered: ["local", "mainnet", "testnet"] }))
			expect(await h.service.getNetworkArrival()).toBeNull()
			await h.service.getOrInitNetworks()
			expect(await h.service.getNetworkArrival()).toBeNull()
			const writes = recordWrites(h.local as unknown as BrowserApi["storage"]["local"], "nulo:")
			await h.service.answerNetworkArrival(extra!.id)
			writes.restore()
			expect(writes.log).toEqual([])
		})

		test("a switch to it from another network answers it; re-asserting it, or reaching it from a missing pointer, does not", async () => {
			const activeKey = "nulo:core:active-network@p1"
			const h = setupServiceWithStorage({})
			await seededByEarlierBuild(h)
			await h.service.getOrInitNetworks()
			const [extra] = await extraRows(h)

			h.local.store.set(activeKey, extra!.id)
			await h.service.setActiveNetwork(extra!.id)
			h.local.store.set(activeKey, "gone")
			await h.service.setActiveNetwork(extra!.id)
			h.local.store.delete(activeKey)
			await h.service.setActiveNetwork(extra!.id)
			expect(record(h).announce).toEqual(["mainnet"])

			const testnet = (await h.service.getNetworksRaw("p1")).find((n) => n.kind === "testnet")!
			await h.service.setActiveNetwork(testnet.id)
			expect(record(h).announce).toEqual(["mainnet"])
			await h.service.setActiveNetwork(extra!.id)
			expect(record(h)).toEqual({ offered: ["local", "mainnet", "testnet"] })
		})

		test("a corrupt record shows no arrival, and answering it leaves its bytes", async () => {
			const h = setupServiceWithStorage({})
			await seededByEarlierBuild(h)
			await h.service.getOrInitNetworks()
			const [extra] = await extraRows(h)
			h.local.store.set(OFFERS_KEY, "{not json")

			expect(await h.service.getNetworkArrival()).toBeNull()
			await h.service.answerNetworkArrival(extra!.id)
			expect(h.local.store.get(OFFERS_KEY)).toBe("{not json")
		})

		test("a deletion landing while the answer is written rejects it and restores the announcement", async () => {
			const h = setupServiceWithStorage({})
			await seededByEarlierBuild(h)
			await h.service.getOrInitNetworks()
			const [extra] = await extraRows(h)
			const announced = h.local.store.get(OFFERS_KEY)
			const writes = recordWrites(h.local as unknown as BrowserApi["storage"]["local"], OFFERS_KEY, () => {
				h.deletionState.beginDeletion("p1")
				h.deletionState.release("p1")
			})

			await expect(h.service.answerNetworkArrival(extra!.id)).rejects.toThrow(/^profile p1 deleted$/)
			writes.restore()
			expect(h.local.store.get(OFFERS_KEY)).toBe(announced)
		})
	})
})

describe("NetworkService — this build's defaults on an existing profile", () => {
	test("a profile that deleted Local Network gets nothing back and serves no chain 0", async () => {
		const h = setupServiceWithStorage({})
		const rows = await asEarlierBuild(() => h.service.getOrInitNetworks())
		h.local.store.delete(seedOffersKey("p1"))
		await h.service.deleteNetwork(rows.find((n) => n.kind === "local")!.id)

		const after = await h.service.getOrInitNetworks()

		// A build that adds a default edits this test, never `KINDS_SEEDED_BEFORE_RECORD`.
		expect(after.map((n) => n.kind)).toEqual(["testnet", "mainnet"])
		expect(await h.service.servesChain("p1", 0)).toBe(false)
		expect(JSON.parse(h.local.store.get(seedOffersKey("p1")) as string)).toEqual({
			offered: ["local", "mainnet", "testnet"],
			announce: ["mainnet"],
		})
	})
})

describe("NetworkService.servesChain (a dApp asking to connect)", () => {
	const V5_TESTNET_CHAIN = 1816023401

	test("a profile not seeded yet serves exactly the chains its default seeds will create", async () => {
		const { service } = setupServiceWithStorage({})

		expect(await service.servesChain("p1", CHAIN_IDS.TESTNET)).toBe(true)
		expect(await service.servesChain("p1", CHAIN_IDS.MAINNET)).toBe(true)
		expect(await service.servesChain("p1", 0)).toBe(true)
		expect(await service.servesChain("p1", V5_TESTNET_CHAIN)).toBe(false)
	})

	test("while the first activation writes the defaults one by one, every default counts", async () => {
		const { service, local } = setupServiceWithStorage({})
		const set = local.set.bind(local)
		let releaseWrite: (() => void) | undefined
		local.set = async (items) => {
			const texts = await Promise.all(Object.entries(items).map(([key, value]) => storedText(key, value, ROW_KEY_FAKE.rowKeys)))
			if (!releaseWrite && texts.some((text) => text?.includes("Local Network"))) {
				await new Promise<void>((resolve) => {
					releaseWrite = resolve
				})
			}
			return set(items)
		}

		const seeding = service.getOrInitNetworks()
		await vi.waitFor(() => expect(releaseWrite).toBeDefined())

		expect((await service.getNetworksRaw("p1")).map((n) => n.chainId)).toEqual([CHAIN_IDS.TESTNET])
		expect(await service.servesChain("p1", 0)).toBe(true)
		expect(await service.servesChain("p1", V5_TESTNET_CHAIN)).toBe(false)
		releaseWrite?.()
		await seeding
		expect(await service.servesChain("p1", 0)).toBe(true)
	})

	test("a seeded profile serves only its live rows: not a removed network, nor one mid-deletion", async () => {
		const { service } = setupServiceWithStorage({ "https://rpc.test/7": nodeInfoForChain(7) })
		const local = (await service.getOrInitNetworks()).find((n) => n.chainId === 0)!
		const seven = await service.addNetwork("Seven", "https://rpc.test/7")
		let releasePurge: (() => void) | undefined
		service.registerChainPurgeSubscriber(
			(_profileId, chainId) =>
				new Promise<void>((resolve) => {
					if (chainId === 7) releasePurge = resolve
					else resolve()
				}),
		)

		await service.deleteNetwork(local.id)
		const deleting = service.deleteNetwork(seven.id)
		await vi.waitFor(() => expect(releasePurge).toBeDefined())

		expect(await service.servesChain("p1", 0)).toBe(false)
		expect(await service.servesChain("p1", 7)).toBe(false)
		expect(await service.servesChain("p1", CHAIN_IDS.TESTNET)).toBe(true)
		expect(await service.servesChain("p1", V5_TESTNET_CHAIN)).toBe(false)
		releasePurge?.()
		await deleting
	})
})

describe("NetworkService.onProfileDeleted cascade", () => {
	test("purges every chain of the deleted profile (covers sender cleanup via PXE clear)", async () => {
		// This test locks the cascade ContactService.onProfileDeleted's docstring
		// references: when a profile is deleted, every network of that profile
		// gets purgeChain → pxeServiceClient.clearChainState, which wipes the
		// PXE's OPFS store (`pxe/${profileId}/${chainId}`) including its sender list.
		// So senders for deleted profiles are cleaned up here, not in
		// ContactService. If this contract ever changes, the orphan-senders
		// bug returns and ContactService needs its own cleanup path.
		const { service, pxeStub } = setupServiceWithStorage({
			"https://rpc.test/a": nodeInfoForChain(42),
			"https://rpc.test/b": nodeInfoForChain(99),
		})
		const a = await service.addNetwork("A", "https://rpc.test/a")
		const b = await service.addNetwork("B", "https://rpc.test/b")
		expect(a.profileId).toBe("p1")
		expect(b.profileId).toBe("p1")

		// Fire the private cascade handler directly (the EventHandler wiring is
		// stubbed in the harness; we assert the handler's behavior in isolation).
		await service.purgeForProfile("p1")

		expect(pxeStub).toHaveBeenCalledWith("p1", 42)
		expect(pxeStub).toHaveBeenCalledWith("p1", 99)
		expect(pxeStub).toHaveBeenCalledTimes(2)
	})

	test("only purges chains owned by the deleted profile, not other profiles' chains", async () => {
		const { service, pxeStub, local } = setupServiceWithStorage({
			"https://rpc.test/a": nodeInfoForChain(42),
		})
		// p1's network created via the public API
		await service.addNetwork("A", "https://rpc.test/a")

		// Manually inject a network owned by p2 directly into storage so we can
		// assert it's NOT purged when p1 is deleted. (addNetwork would block on
		// the profileService stub which only returns p1.)
		const p2Network = {
			id: "n-p2",
			profileId: "p2",
			chainId: 7,
			name: "P2",
			kind: "custom" as const,
			primaryEndpointId: "ep-p2",
			endpoints: [{ id: "ep-p2", rpcUrl: "https://rpc.test/c" }],
		}
		local.store.set("nulo:core:networks@n-p2", JSON.stringify(p2Network))

		await service.purgeForProfile("p1")

		expect(pxeStub).toHaveBeenCalledWith("p1", 42)
		expect(pxeStub).not.toHaveBeenCalledWith("p2", 7)
	})
})

describe("NetworkService.probeNodeStatus (bounded probe)", () => {
	test("Active when the probe answers the row's chainId", async () => {
		const { service } = setupServiceWithStorage({ "https://rpc.example.com": nodeInfoForChain(7) })
		const network = await service.addNetwork("Seven", "https://rpc.example.com")
		expect(await service.probeNodeStatus(network.id, 5_000)).toBe(NodeStatus.Active)
	})

	test("InvalidChain when the endpoint answers for a different chain", async () => {
		const { service, factory } = setupServiceWithStorage({ "https://rpc.example.com": nodeInfoForChain(7) })
		const network = await service.addNetwork("Seven", "https://rpc.example.com")
		factory.setOverrides("https://rpc.example.com", {
			getNodeInfo: vi.fn().mockResolvedValue(nodeInfoForChain(9)) as unknown as AztecNode["getNodeInfo"],
		})
		expect(await service.probeNodeStatus(network.id, 5_000)).toBe(NodeStatus.InvalidChain)
	})

	test("Inactive when the probe throws (refused / timed out)", async () => {
		const { service, factory } = setupServiceWithStorage({ "https://rpc.example.com": nodeInfoForChain(7) })
		const network = await service.addNetwork("Seven", "https://rpc.example.com")
		factory.setOverrides("https://rpc.example.com", {
			getNodeInfo: vi
				.fn()
				.mockRejectedValue(
					new Error("Request to https://rpc.example.com timed out after 5000ms"),
				) as unknown as AztecNode["getNodeInfo"],
		})
		expect(await service.probeNodeStatus(network.id, 5_000)).toBe(NodeStatus.Inactive)
	})

	test("rejects an out-of-range timeout at the schema boundary", async () => {
		const { service } = setupServiceWithStorage({ "https://rpc.example.com": nodeInfoForChain(7) })
		const network = await service.addNetwork("Seven", "https://rpc.example.com")
		await expect(service.probeNodeStatus(network.id, 999_999)).rejects.toThrow()
		await expect(service.probeNodeStatus(network.id, 1)).rejects.toThrow()
	})
})

describe("NetworkService.readChainTip", () => {
	test("reads the network's primary endpoint through the one-attempt node, once per read; a refusal rejects", async () => {
		const { service, factory } = setupServiceWithStorage({})
		for (const url of ["https://a.example", "https://a2.example"]) {
			factory.setOverrides(url, {
				getNodeInfo: vi.fn().mockResolvedValue(nodeInfoForChain(7)) as unknown as AztecNode["getNodeInfo"],
			})
		}
		const a = await service.addNetwork("A", "https://a.example")
		const second = await service.addEndpoint(a.id, "Two", "https://a2.example")
		await service.setPrimaryEndpoint(a.id, second.id)
		const getBlockNumber = vi.fn().mockResolvedValueOnce(48_190).mockRejectedValueOnce(new TypeError("Failed to fetch"))
		const single = vi.spyOn(factory, "createSingleAttemptNode").mockReturnValue({ getBlockNumber } as unknown as AztecNode)

		expect(await service.readChainTip(a.id)).toBe(48_190)
		await expect(service.readChainTip(a.id)).rejects.toThrow("Failed to fetch")

		expect(single.mock.calls.map(([url]) => url)).toEqual(["https://a2.example"])
		expect(getBlockNumber).toHaveBeenCalledTimes(2)
	})
})

describe("NetworkService.readPublicStorageOnce", () => {
	test("reads at the passed row's primary endpoint, never another network's or the active profile's row for that chain", async () => {
		const { service, factory } = setupServiceWithStorage({})
		const chainOf: Record<string, number> = {
			"https://a.example": 7,
			"https://a2.example": 7,
			"https://b.example": 9,
			"https://p2.example": 7,
		}
		const storageAt = new Map<string, ReturnType<typeof vi.fn>>()
		for (const [i, [url, chainId]] of Object.entries(chainOf).entries()) {
			const read = vi.fn(async () => new Fr(BigInt(100 + i)))
			storageAt.set(url, read)
			factory.setOverrides(url, {
				getNodeInfo: vi.fn().mockResolvedValue(nodeInfoForChain(chainId)) as unknown as AztecNode["getNodeInfo"],
				getPublicStorageAt: read as unknown as AztecNode["getPublicStorageAt"],
			})
		}
		const a = await service.addNetwork("A", "https://a.example")
		const second = await service.addEndpoint(a.id, "Two", "https://a2.example")
		const row = await service.setPrimaryEndpoint(a.id, second.id)
		await service.addNetwork("B", "https://b.example")
		// Another profile's row on the same chain: the active profile's own row for chain 7 is `row`.
		const foreign: Network = {
			...row,
			id: "net-p2",
			profileId: "p2",
			endpoints: [{ id: "ep-p2", rpcUrl: "https://p2.example" }],
			primaryEndpointId: "ep-p2",
		}
		const once = vi.spyOn(factory, "readPublicStorageOnce")
		const contract = AztecAddress.fromNumberUnsafe(5)
		const slot = new Fr(9n)

		expect((await service.readPublicStorageOnce(row, contract, slot, 5_000)).toBigInt()).toBe(101n)
		expect((await service.readPublicStorageOnce(foreign, contract, slot, 5_000)).toBigInt()).toBe(103n)

		expect(once.mock.calls).toEqual([
			["https://a2.example", contract, slot, 5_000],
			["https://p2.example", contract, slot, 5_000],
		])
		expect(storageAt.get("https://a2.example")).toHaveBeenCalledWith("latest", contract, slot)
		expect(storageAt.get("https://a.example")).not.toHaveBeenCalled()
		expect(storageAt.get("https://b.example")).not.toHaveBeenCalled()
	})
})

describe("NetworkService lock configuration", () => {
	test("the service lock's watchdog is DISABLED — deleteNetwork's 30-min clearChainState drain is a by-design hold", () => {
		const logger = new LoggerStore(new ConfigStore())
		const service = new NetworkService(logger, new FakeBrowserApi())
		// A force-release mid-cascade would admit a concurrent network mutator
		// into the purge pipeline; queueing behind it is the correct semantic.
		const lock = (service as unknown as { lock: { maxHoldMs: number | null } }).lock
		expect(lock.maxHoldMs).toBeNull()
	})
})

describe("NetworkService — resolveVerifiedL1ChainId's live check", () => {
	function makeService(getNodeInfo: ReturnType<typeof vi.fn>) {
		const factory = new FakeNodeFactory()
		factory.setOverrides("https://rpc-a.example/", { getNodeInfo: getNodeInfo as unknown as AztecNode["getNodeInfo"] })
		const browserApi = new FakeBrowserApi()
		browserApi.reset()
		const service = new NetworkService(new LoggerStore(new ConfigStore()), browserApi, factory)
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in (no full lifecycle needed)
		;(service as any).initialized = true
		return { service, browserApi, factory }
	}
	const row = (kind: string, l1ChainId: number) => ({
		id: "n1",
		profileId: "p1",
		chainId: 123,
		l1ChainId,
		name: "A",
		primaryEndpointId: "e1",
		endpoints: [{ id: "e1", rpcUrl: "https://rpc-a.example/" }],
		kind,
	})

	test("a custom row is refused with ERR_UNATTENDED_LIVE_CHECK and the node is never contacted", async () => {
		const getNodeInfo = vi.fn().mockResolvedValue({ l1ChainId: 5, rollupVersion: 1 })
		const { service, browserApi } = makeService(getNodeInfo)
		await browserApi.storage.local.set({ "nulo:core:networks@n1": JSON.stringify(row("custom", 5)) })
		await expect(service.resolveVerifiedL1ChainId("p1", 123, { unattended: true })).rejects.toThrow(ERR_UNATTENDED_LIVE_CHECK)
		expect(getNodeInfo).not.toHaveBeenCalled()
	})

	test("a seeded row resolves offline under unattended exactly as attended", async () => {
		const getNodeInfo = vi.fn()
		const { service, browserApi } = makeService(getNodeInfo)
		await browserApi.storage.local.set({ "nulo:core:networks@n1": JSON.stringify(row("local", LOCAL_L1_CHAIN_ID)) })
		await expect(service.resolveVerifiedL1ChainId("p1", 123, { unattended: true })).resolves.toBe(LOCAL_L1_CHAIN_ID)
		expect(getNodeInfo).not.toHaveBeenCalled()
	})

	test("a node that does not answer fails with NodeUnreachableError after one bounded, never-retried read", async () => {
		const { service, browserApi, factory } = makeService(vi.fn().mockRejectedValue(new Error("fetch failed")))
		await browserApi.storage.local.set({ "nulo:core:networks@n1": JSON.stringify(row("custom", 5)) })
		const probe = vi.spyOn(service, "probeIdentityOnce")
		await expect(service.resolveVerifiedL1ChainId("p1", 123)).rejects.toBeInstanceOf(NodeUnreachableError)
		expect(probe.mock.calls).toEqual([["https://rpc-a.example/", "custom", IDENTITY_PROBE_MS]])
		expect(factory.singleAttempt).toEqual(["https://rpc-a.example/"])
	})

	test("a URL the transport rule refuses at construction fails the same way", async () => {
		const { service, browserApi, factory } = makeService(vi.fn())
		await browserApi.storage.local.set({ "nulo:core:networks@n1": JSON.stringify(row("custom", 5)) })
		vi.spyOn(factory, "createSingleAttemptNode").mockImplementation(() => {
			throw new Error("AztecNodeFactoryAdapter refused to construct node client")
		})
		await expect(service.resolveVerifiedL1ChainId("p1", 123)).rejects.toBeInstanceOf(NodeUnreachableError)
	})

	test("a node that answers resolves on its matching L1 and refuses another one with a plain error", async () => {
		const getNodeInfo = vi.fn().mockResolvedValue({ l1ChainId: 5, rollupVersion: 1 })
		const { service, browserApi } = makeService(getNodeInfo)
		await browserApi.storage.local.set({ "nulo:core:networks@n1": JSON.stringify(row("custom", 5)) })
		await expect(service.resolveVerifiedL1ChainId("p1", 123)).resolves.toBe(5)
		getNodeInfo.mockResolvedValue({ l1ChainId: 6, rollupVersion: 1 })
		const mismatch = await service.resolveVerifiedL1ChainId("p1", 123).catch((error: unknown) => error)
		expect(mismatch).toBeInstanceOf(Error)
		expect(mismatch).not.toBeInstanceOf(NodeUnreachableError)
		expect((mismatch as Error).message).toMatch(/L1 identity mismatch/)
		getNodeInfo.mockResolvedValue({ l1ChainId: 5, rollupVersion: 5 })
		const chainZero = await service.resolveVerifiedL1ChainId("p1", 123).catch((error: unknown) => error)
		expect(chainZero).not.toBeInstanceOf(NodeUnreachableError)
		expect((chainZero as Error).message).toMatch(new RegExp(`^${ERR_ENDPOINT_CHAIN_MISMATCH}`))
	})
})

const NON_SEED_LOCAL_URL = "http://localhost:18080"

function storeRow(local: FakeStorageArea, over: Partial<Network> & { id: string }): Network {
	const row: Network = {
		profileId: "p1",
		chainId: 0,
		l1ChainId: 0,
		name: over.id,
		primaryEndpointId: "e1",
		endpoints: [{ id: "e1", rpcUrl: NON_SEED_LOCAL_URL }],
		kind: "custom",
		...over,
	}
	local.store.set(`nulo:core:networks@${row.id}`, JSON.stringify(row))
	return row
}

/** Both status methods on one network: which transport each used, and what each answered. */
async function bothStatuses(service: NetworkService, factory: FakeNodeFactory, networkId: string) {
	const probe = vi.spyOn(factory, "probeChainId")
	const createdBefore = factory.created.length
	const get = await service.getNodeStatus(networkId)
	const getUsedProbe = probe.mock.calls.length > 0
	const getCreated = factory.created.length - createdBefore
	const probed = await service.probeNodeStatus(networkId, 5_000)
	return { get, probed, getUsedProbe, getCreated, probeCalls: probe.mock.calls }
}

describe("NetworkService node status: getNodeStatus and probeNodeStatus", () => {
	test("a matching endpoint is Active on both; getNodeStatus builds a node, probeNodeStatus probes once with its budget", async () => {
		const { service, factory } = setupServiceWithStorage({ "https://rpc.example.com": nodeInfoForChain(7) })
		const network = await service.addNetwork("Seven", "https://rpc.example.com")
		const r = await bothStatuses(service, factory, network.id)
		expect(r).toMatchObject({ get: NodeStatus.Active, probed: NodeStatus.Active, getUsedProbe: false, getCreated: 1 })
		expect(r.probeCalls).toEqual([["https://rpc.example.com", 5_000]])
	})

	test("an endpoint answering for another chain is InvalidChain on both", async () => {
		const { service, factory } = setupServiceWithStorage({ "https://rpc.example.com": nodeInfoForChain(7) })
		const network = await service.addNetwork("Seven", "https://rpc.example.com")
		factory.setOverrides("https://rpc.example.com", {
			getNodeInfo: vi.fn().mockResolvedValue(nodeInfoForChain(9)) as unknown as AztecNode["getNodeInfo"],
		})
		const r = await bothStatuses(service, factory, network.id)
		expect([r.get, r.probed]).toEqual([NodeStatus.InvalidChain, NodeStatus.InvalidChain])
	})

	test("an unreachable endpoint is Inactive on both", async () => {
		const { service, factory } = setupServiceWithStorage({ "https://rpc.example.com": nodeInfoForChain(7) })
		const network = await service.addNetwork("Seven", "https://rpc.example.com")
		factory.setOverrides("https://rpc.example.com", {
			getNodeInfo: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as AztecNode["getNodeInfo"],
		})
		const r = await bothStatuses(service, factory, network.id)
		expect([r.get, r.probed]).toEqual([NodeStatus.Inactive, NodeStatus.Inactive])
	})

	test("a local-kind network on a non-seed URL whose node answers is Active on both", async () => {
		const { service, factory, local } = setupServiceWithStorage({
			[NON_SEED_LOCAL_URL]: { l1ChainId: LOCAL_L1_CHAIN_ID, rollupVersion: 42 },
		})
		storeRow(local, { id: "loc", kind: "local", l1ChainId: LOCAL_L1_CHAIN_ID })
		const r = await bothStatuses(service, factory, "loc")
		expect([r.get, r.probed]).toEqual([NodeStatus.Active, NodeStatus.Active])
	})

	test("a local-kind network whose node is down is Inactive on both: the carve-out never runs before the probe", async () => {
		const { service, factory, local } = setupServiceWithStorage({ [NON_SEED_LOCAL_URL]: new Error("ECONNREFUSED") })
		storeRow(local, { id: "loc", kind: "local", l1ChainId: LOCAL_L1_CHAIN_ID })
		const r = await bothStatuses(service, factory, "loc")
		expect([r.get, r.probed]).toEqual([NodeStatus.Inactive, NodeStatus.Inactive])
	})

	test("a custom network on a non-seed URL gets no carve-out: its non-zero composite is InvalidChain on both", async () => {
		const { service, factory, local } = setupServiceWithStorage({ [NON_SEED_LOCAL_URL]: nodeInfoForChain(42) })
		storeRow(local, { id: "cust" })
		const r = await bothStatuses(service, factory, "cust")
		expect([r.get, r.probed]).toEqual([NodeStatus.InvalidChain, NodeStatus.InvalidChain])
	})

	test("a custom network on the seeded local URL takes the URL carve-out on both", async () => {
		const { service, factory, local } = setupServiceWithStorage({ [LOCAL_NETWORK_RPC_URL]: nodeInfoForChain(42) })
		storeRow(local, { id: "seedurl", endpoints: [{ id: "e1", rpcUrl: LOCAL_NETWORK_RPC_URL }] })
		const r = await bothStatuses(service, factory, "seedurl")
		expect([r.get, r.probed]).toEqual([NodeStatus.Active, NodeStatus.Active])
	})

	test("a dangling primaryEndpointId is Inactive on both, with no node built and no probe", async () => {
		const { service, factory, local } = setupServiceWithStorage({ [NON_SEED_LOCAL_URL]: nodeInfoForChain(0) })
		storeRow(local, { id: "dang", primaryEndpointId: "gone" })
		const r = await bothStatuses(service, factory, "dang")
		expect(r).toMatchObject({ get: NodeStatus.Inactive, probed: NodeStatus.Inactive, getCreated: 0 })
		expect(r.probeCalls).toEqual([])
		expect(factory.created).toHaveLength(0)
	})

	test("a row another profile owns rejects on both: only the probe's failure reads Inactive", async () => {
		const { service, local } = setupServiceWithStorage({ [NON_SEED_LOCAL_URL]: nodeInfoForChain(0) })
		storeRow(local, { id: "theirs", profileId: "p2" })
		await expect(service.getNodeStatus("theirs")).rejects.toThrow(new Error("Invalid id"))
		await expect(service.probeNodeStatus("theirs", 5_000)).rejects.toThrow(new Error("Invalid id"))
	})
})

describe("NetworkService endpoint identity guard (add and update)", () => {
	const COMPOSITE = "ENDPOINT_CHAIN_MISMATCH: This RPC reports chainId 99, but this network is chain 50."
	const L1 = "ENDPOINT_CHAIN_MISMATCH: This RPC reports L1 chain 2, but this network is L1 chain 0."
	const BOTH = "ENDPOINT_CHAIN_MISMATCH: This RPC reports chainId 7, but this network is chain 50."
	const ROWS: [string, NodeInfo, string][] = [
		["a different composite", nodeInfoForChain(99), COMPOSITE],
		["the same composite from another L1", { l1ChainId: 2, rollupVersion: 48 }, L1],
		["both different: the composite is checked first", { l1ChainId: 3, rollupVersion: 4 }, BOTH],
	]

	test.each(ROWS)("addEndpoint refuses %s", async (_name, info, message) => {
		const { service } = setupServiceWithStorage({ "https://rpc.test/1": nodeInfoForChain(50), "https://rpc.other": info })
		const network = await service.addNetwork("Chain50", "https://rpc.test/1")
		await expect(service.addEndpoint(network.id, "X", "https://rpc.other")).rejects.toThrow(new Error(message))
	})

	test.each(ROWS)("updateEndpoint refuses %s", async (_name, info, message) => {
		const { service } = setupServiceWithStorage({ "https://rpc.test/1": nodeInfoForChain(50), "https://rpc.other": info })
		const network = await service.addNetwork("Chain50", "https://rpc.test/1")
		await expect(service.updateEndpoint(network.id, network.primaryEndpointId, "X", "https://rpc.other")).rejects.toThrow(
			new Error(message),
		)
	})
})

describe("NetworkService chain 0: the local L1 on a loopback node", () => {
	const REMOTE = "https://node.remote.example/"
	const LOCAL_ANSWER: NodeInfo = { l1ChainId: LOCAL_L1_CHAIN_ID, rollupVersion: 42 }
	const TESTNET_SELF_PAIR: NodeInfo = { l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: TESTNET_L1_CHAIN_ID }

	function localRow(local: FakeStorageArea, over: Partial<Network> = {}): Network {
		return storeRow(local, { id: "loc", kind: "local", l1ChainId: LOCAL_L1_CHAIN_ID, ...over })
	}

	const LOCAL_ANSWERS: [string, NodeInfo][] = [
		["a rollup of its own", LOCAL_ANSWER],
		["a rollup equal to its L1", { l1ChainId: LOCAL_L1_CHAIN_ID, rollupVersion: LOCAL_L1_CHAIN_ID }],
	]

	test.each(LOCAL_ANSWERS)("a local row refuses a remote node on the local L1 with %s, on add and on update", async (_label, info) => {
		const { service, local } = setupServiceWithStorage({ [REMOTE]: info })
		localRow(local)
		await expect(service.addEndpoint("loc", "X", REMOTE)).rejects.toThrow(/^ENDPOINT_CHAIN_MISMATCH: /)
		await expect(service.updateEndpoint("loc", "e1", "X", REMOTE)).rejects.toThrow(/^ENDPOINT_CHAIN_MISMATCH: /)
		expect((await service.getNetwork("loc")).endpoints).toEqual([{ id: "e1", rpcUrl: NON_SEED_LOCAL_URL }])
	})

	test.each(LOCAL_ANSWERS)("a local row takes a loopback node on the local L1 with %s, on add and on update", async (_label, info) => {
		const { service, local } = setupServiceWithStorage({ "https://localhost:8443/": info, "http://127.0.0.1:18081": info })
		localRow(local)
		const added = await service.addEndpoint("loc", "X", "https://localhost:8443/")
		await expect(service.updateEndpoint("loc", added.id, "X", "http://127.0.0.1:18081")).resolves.toMatchObject({
			rpcUrl: "http://127.0.0.1:18081",
		})
	})

	test("addNetwork refuses a node whose answer computes to 0, storing and announcing nothing", async () => {
		const { service, local } = setupServiceWithStorage({ [REMOTE]: TESTNET_SELF_PAIR })
		const added = vi.fn(async () => {})
		service.onNetworkAdded.add(added)
		await expect(service.addNetwork("Zero", REMOTE)).rejects.toThrow(/^ENDPOINT_CHAIN_MISMATCH: /)
		expect([...local.store.keys()].filter((k) => k.startsWith("nulo:core:networks@"))).toEqual([])
		expect(added).not.toHaveBeenCalled()
	})

	test("addNetwork stores a node whose answer computes to a non-zero chain", async () => {
		const { service } = setupServiceWithStorage({ [REMOTE]: { l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: 7 } })
		await expect(service.addNetwork("Seven", REMOTE)).resolves.toMatchObject({
			chainId: (TESTNET_L1_CHAIN_ID ^ 7) >>> 0,
			l1ChainId: TESTNET_L1_CHAIN_ID,
			kind: "custom",
		})
	})

	test("addNetwork at the Local Network's URL refuses a node on another L1 and stores one on the local L1", async () => {
		const { service, factory } = setupServiceWithStorage({
			[LOCAL_NETWORK_RPC_URL]: { l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: 9 },
		})
		await expect(service.addNetwork("Local", LOCAL_NETWORK_RPC_URL)).rejects.toThrow(/^ENDPOINT_CHAIN_MISMATCH: /)
		factory.setOverrides(LOCAL_NETWORK_RPC_URL, {
			getNodeInfo: vi.fn().mockResolvedValue(LOCAL_ANSWER) as unknown as AztecNode["getNodeInfo"],
		})
		await expect(service.addNetwork("Local", LOCAL_NETWORK_RPC_URL)).resolves.toMatchObject({
			chainId: 0,
			l1ChainId: LOCAL_L1_CHAIN_ID,
			kind: "custom",
		})
	})

	test.each<[string, string, number, boolean]>([
		["a remote URL", REMOTE, LOCAL_L1_CHAIN_ID, false],
		["another L1", NON_SEED_LOCAL_URL, TESTNET_L1_CHAIN_ID, false],
		["the local L1 on localhost", NON_SEED_LOCAL_URL, LOCAL_L1_CHAIN_ID, true],
		["the local L1 on 127.0.0.1", "http://127.0.0.1:8080", LOCAL_L1_CHAIN_ID, true],
	])("the row constructor on chain 0 with %s (%s, L1 %i) builds: %s", async (_label, rpcUrl, l1ChainId, builds) => {
		const { service } = setupServiceWithStorage({})
		// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in
		const build = (service as any)._buildNetwork("p1", "Zero", rpcUrl, 0, l1ChainId, "custom") as Promise<Network>
		if (builds) await expect(build).resolves.toMatchObject({ chainId: 0, l1ChainId })
		else await expect(build).rejects.toThrow(/^ENDPOINT_CHAIN_MISMATCH: /)
	})

	test("both L1 getters refuse a chain-0 row on another L1", async () => {
		const { service, factory, local } = setupServiceWithStorage({ [LOCAL_NETWORK_RPC_URL]: TESTNET_SELF_PAIR })
		storeRow(local, { id: "zero", l1ChainId: TESTNET_L1_CHAIN_ID, endpoints: [{ id: "e1", rpcUrl: LOCAL_NETWORK_RPC_URL }] })
		await expect(service.getL1ChainIdStored("p1", 0)).rejects.toThrow(/^Chain 0 is the local development chain/)
		await expect(service.resolveVerifiedL1ChainId("p1", 0)).rejects.toThrow(/^Chain 0 is the local development chain/)
		expect(factory.created).toHaveLength(0)
	})

	test("both L1 getters return the local L1 of a chain-0 row", async () => {
		const { service, local } = setupServiceWithStorage({ [LOCAL_NETWORK_RPC_URL]: LOCAL_ANSWER })
		storeRow(local, { id: "zero", l1ChainId: LOCAL_L1_CHAIN_ID, endpoints: [{ id: "e1", rpcUrl: LOCAL_NETWORK_RPC_URL }] })
		await expect(service.getL1ChainIdStored("p1", 0)).resolves.toBe(LOCAL_L1_CHAIN_ID)
		await expect(service.resolveVerifiedL1ChainId("p1", 0)).resolves.toBe(LOCAL_L1_CHAIN_ID)
	})

	test.each<[string, string]>([
		["promoting it", "e1"],
		["confirming it already primary", "e2"],
	])("a local row refuses a remote endpoint as its primary: %s", async (_label, primaryEndpointId) => {
		const { service, local } = setupServiceWithStorage({})
		localRow(local, {
			primaryEndpointId,
			endpoints: [
				{ id: "e1", rpcUrl: NON_SEED_LOCAL_URL },
				{ id: "e2", rpcUrl: REMOTE },
			],
		})
		const changed = vi.fn(async () => {})
		service.onPrimaryEndpointChanged.add(changed)
		await expect(service.setPrimaryEndpoint("loc", "e2")).rejects.toThrow(/^ENDPOINT_CHAIN_MISMATCH: /)
		expect((await service.getNetwork("loc")).primaryEndpointId).toBe(primaryEndpointId)
		expect(changed).not.toHaveBeenCalled()
	})

	test("a local row promotes a loopback endpoint", async () => {
		const { service, local } = setupServiceWithStorage({})
		localRow(local, {
			endpoints: [
				{ id: "e1", rpcUrl: NON_SEED_LOCAL_URL },
				{ id: "e2", rpcUrl: "http://127.0.0.1:18081" },
			],
		})
		await expect(service.setPrimaryEndpoint("loc", "e2")).resolves.toMatchObject({ primaryEndpointId: "e2" })
	})

	test("a local row whose primary is a remote node is InvalidChain on both status methods", async () => {
		const { service, factory, local } = setupServiceWithStorage({ [REMOTE]: LOCAL_ANSWER })
		localRow(local, { endpoints: [{ id: "e1", rpcUrl: REMOTE }] })
		const r = await bothStatuses(service, factory, "loc")
		expect([r.get, r.probed]).toEqual([NodeStatus.InvalidChain, NodeStatus.InvalidChain])
	})
})

describe("NetworkService endpoint labels", () => {
	const LABELS: [string | undefined, string | undefined][] = [
		["  x  ", "x"],
		["   ", undefined],
		[undefined, undefined],
	]

	test.each(LABELS)("addEndpoint and updateEndpoint store %j as %j", async (label, stored) => {
		const { service } = setupServiceWithStorage({
			"https://rpc.test/1": nodeInfoForChain(50),
			"https://rpc.test/2": nodeInfoForChain(50),
			"https://rpc.test/3": nodeInfoForChain(50),
		})
		const network = await service.addNetwork("Chain50", "https://rpc.test/1")
		const added = await service.addEndpoint(network.id, label, "https://rpc.test/2")
		expect(added.label).toBe(stored)
		const updated = await service.updateEndpoint(network.id, added.id, label, "https://rpc.test/3")
		expect(updated.label).toBe(stored)
	})
})

describe("NetworkService missing-primary policies", () => {
	test("getNetworkInfo projects the primary endpoint", async () => {
		const { service } = setupServiceWithStorage({ "https://rpc.example.com": nodeInfoForChain(7) })
		const network = await service.addNetwork("Seven", "https://rpc.example.com")
		await expect(service.getNetworkInfo(network.id)).resolves.toEqual({
			profileId: "p1",
			chainId: 7,
			rpcUrl: "https://rpc.example.com",
		})
	})

	test("getNetworkInfo rejects a dangling primaryEndpointId", async () => {
		const { service, local } = setupServiceWithStorage({})
		storeRow(local, { id: "dang", primaryEndpointId: "gone" })
		await expect(service.getNetworkInfo("dang")).rejects.toThrow(new Error("Network dang has no primary endpoint"))
	})

	test("getNode rejects a dangling primaryEndpointId, building no node", async () => {
		const { service, factory, local } = setupServiceWithStorage({})
		storeRow(local, { id: "dang", chainId: 77, primaryEndpointId: "gone" })
		await expect(service.getNode(77)).rejects.toThrow(new Error("Network dang has no primary endpoint"))
		expect(factory.created).toHaveLength(0)
	})

	test("setActiveNetwork on a dangling primaryEndpointId still activates and emits, caching no node", async () => {
		const { service, factory, local } = setupServiceWithStorage({})
		storeRow(local, { id: "dang", chainId: 77, primaryEndpointId: "gone" })
		const events: string[] = []
		service.onActiveNetworkChanged.add((n) => {
			events.push(n.id)
			return Promise.resolve()
		})
		await expect(service.setActiveNetwork("dang")).resolves.toMatchObject({ id: "dang" })
		expect(events).toEqual(["dang"])
		expect(factory.created).toHaveLength(0)
		expect((await service.getActiveNetwork())?.id).toBe("dang")
	})

	test("resolveVerifiedL1ChainId on a custom network with a dangling primary probes the first endpoint", async () => {
		const { service, factory, local } = setupServiceWithStorage({
			"https://first.example": { l1ChainId: 5, rollupVersion: 1 },
			"https://second.example": { l1ChainId: 9, rollupVersion: 1 },
		})
		storeRow(local, {
			id: "c",
			chainId: 123,
			l1ChainId: 5,
			primaryEndpointId: "gone",
			endpoints: [
				{ id: "e1", rpcUrl: "https://first.example" },
				{ id: "e2", rpcUrl: "https://second.example" },
			],
		})
		await expect(service.resolveVerifiedL1ChainId("p1", 123)).resolves.toBe(5)
		expect(factory.created.map((c) => c.rpcUrl)).toEqual(["https://first.example"])
	})
})

describe("NetworkService.isChainQuarantined", () => {
	const OLD_TESTNET = 4321

	test("a seeded row behind its seed is quarantined from the row alone; a current one is not", async () => {
		const { service, local } = setupServiceWithStorage({})
		storeRow(local, { id: "tn", chainId: OLD_TESTNET, l1ChainId: 11155111, kind: "testnet" })
		storeRow(local, { id: "ln", chainId: 0, l1ChainId: LOCAL_L1_CHAIN_ID, kind: "local" })
		storeRow(local, { id: "cn", chainId: 77, l1ChainId: 5 })
		expect(await service.isChainQuarantined("p1", OLD_TESTNET)).toBe(true)
		expect(await service.isChainQuarantined("p1", 0)).toBe(false)
		expect(await service.isChainQuarantined("p1", 77)).toBe(false)
		expect(await service.isChainQuarantined("p2", OLD_TESTNET)).toBe(false)
	})

	test("a record entry or either end of a journal quarantines its chain, for its profile only", async () => {
		const { service, local } = setupServiceWithStorage({})
		storeRow(local, { id: "tn", chainId: CHAIN_IDS.TESTNET, l1ChainId: 11155111, kind: "testnet" })
		const entry = { networkId: "tn", chainId: CHAIN_IDS.TESTNET, networkReset: false, addressesMoved: true }
		local.store.set("nulo:core:stale-networks@p1", JSON.stringify({ profileId: "p1", accountSetDigest: "d", entries: [entry] }))
		local.store.set(
			"nulo:core:network-reset@p1",
			JSON.stringify({
				profileId: "p1",
				networkId: "x",
				fromChainId: 10,
				toChainId: 20,
				l1ChainId: 5,
				cause: { networkReset: false, addressesMoved: true },
				purged: true,
				switchToSeedNode: false,
				probedEndpoint: null,
				accounts: [],
			}),
		)
		for (const chainId of [CHAIN_IDS.TESTNET, 10, 20]) expect(await service.isChainQuarantined("p1", chainId)).toBe(true)
		expect(await service.isChainQuarantined("p1", 0)).toBe(false)
		expect(await service.isChainQuarantined("p2", CHAIN_IDS.TESTNET)).toBe(false)
	})
})

describe("NetworkService in-place reset", () => {
	const OLD = 4321
	const MY_NODE = "https://my-node.example"
	const hooks = (over: Partial<ChainResetHooks> = {}): ChainResetHooks => ({
		beforePurge: async () => {},
		afterPurge: async () => {},
		onPurged: async () => {},
		...over,
	})
	const request = (over: Partial<ChainResetRequest> = {}): ChainResetRequest => ({
		profileId: "p1",
		networkId: "tn",
		fromChainId: OLD,
		toChainId: CHAIN_IDS.TESTNET,
		purged: false,
		switchToSeedNode: false,
		probedEndpoint: null,
		...over,
	})
	const staleTestnet = (local: FakeStorageArea, over: Partial<Network> = {}) =>
		storeRow(local, {
			id: "tn",
			name: "Testnet",
			chainId: OLD,
			l1ChainId: TESTNET_L1_CHAIN_ID,
			kind: "testnet",
			primaryEndpointId: "u1",
			endpoints: [
				{ id: "u1", rpcUrl: MY_NODE },
				{ id: "u2", rpcUrl: "https://other.example", label: "Other" },
			],
			...over,
		})
	const stored = async (local: FakeStorageArea, id: string): Promise<Network> =>
		(await sealedEntityStorage("networks", local, ROW_KEY_FAKE.rowKeys).get(id)) as Network
	const journalFor = (networkId: string) =>
		JSON.stringify({
			profileId: "p1",
			networkId,
			fromChainId: 10,
			toChainId: 20,
			l1ChainId: 5,
			cause: { networkReset: true, addressesMoved: false },
			purged: false,
			switchToSeedNode: false,
			probedEndpoint: null,
			accounts: [],
		})

	test("the row is not live during the purge, and the network lock stays free for other networks", async () => {
		const { service, local } = setupServiceWithStorage({})
		staleTestnet(local)
		storeRow(local, { id: "ln", chainId: 0, kind: "local" })
		let release!: () => void
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		const observed: boolean[] = []
		const run = service.resetChainInPlace(
			request(),
			hooks({
				beforePurge: async () => {
					observed.push(await service.isChainLive("p1", OLD), await service.isNetworkLive("tn"))
					await held
				},
			}),
		)
		await vi.waitFor(() => expect(observed).toHaveLength(2))
		await expect(service.renameNetwork("ln", "Local 2")).resolves.toMatchObject({ name: "Local 2" })
		release()
		await run
		expect(observed).toEqual([false, false])
		expect(await service.isChainLive("p1", CHAIN_IDS.TESTNET)).toBe(true)
	})

	test("a network reset re-keys the row to the seed and keeps its id, name, endpoints and active pointer", async () => {
		const { service, local, pxeStub } = setupServiceWithStorage({})
		staleTestnet(local)
		local.store.set("nulo:core:active-network@p1", "tn")
		const order: string[] = []
		service.onNetworkUpdated.add((n) => order.push(`updated:${n.chainId}`))
		await service.resetChainInPlace(
			request({ switchToSeedNode: true, probedEndpoint: { id: "u1", url: MY_NODE } }),
			hooks({
				afterPurge: async () => {
					order.push("after")
				},
				onPurged: async () => {
					order.push("purged")
				},
			}),
		)
		expect(pxeStub).toHaveBeenCalledWith("p1", OLD)
		const row = await stored(local, "tn")
		expect(row).toMatchObject({ id: "tn", name: "Testnet", chainId: CHAIN_IDS.TESTNET, l1ChainId: TESTNET_L1_CHAIN_ID })
		expect(row.endpoints.map((e) => e.rpcUrl)).toEqual([MY_NODE, "https://other.example", TESTNET_RPC_URL])
		expect(findPrimaryEndpoint(row)?.rpcUrl).toBe(TESTNET_RPC_URL)
		expect(local.store.get("nulo:core:active-network@p1")).toBe("tn")
		expect(order).toEqual(["after", "purged", `updated:${CHAIN_IDS.TESTNET}`])
	})

	test.each<[string, Partial<Network>, Partial<ChainResetRequest>, string]>([
		["the probed primary serves the new chain", {}, { probedEndpoint: { id: "u1", url: MY_NODE } }, MY_NODE],
		["the popup chose the seed's node", {}, { switchToSeedNode: true, probedEndpoint: { id: "u1", url: MY_NODE } }, TESTNET_RPC_URL],
		[
			"the primary was switched after the probe",
			{ primaryEndpointId: "u2" },
			{ probedEndpoint: { id: "u1", url: MY_NODE } },
			TESTNET_RPC_URL,
		],
		[
			"the primary's URL was edited in place after the probe",
			{ endpoints: [{ id: "u1", rpcUrl: "https://edited.example" }] },
			{ probedEndpoint: { id: "u1", url: MY_NODE } },
			TESTNET_RPC_URL,
		],
		["the seed's own node was primary (nothing probed)", { endpoints: [{ id: "u1", rpcUrl: TESTNET_RPC_URL }] }, {}, TESTNET_RPC_URL],
	])("A6: %s", async (_label, row, req, primaryUrl) => {
		const { service, local } = setupServiceWithStorage({})
		staleTestnet(local, row)
		await service.resetChainInPlace(request(req), hooks())
		const after = await stored(local, "tn")
		expect(findPrimaryEndpoint(after)?.rpcUrl).toBe(primaryUrl)
		expect(after.endpoints.filter((e) => e.rpcUrl === TESTNET_RPC_URL).length).toBeLessThanOrEqual(1)
	})

	test("a purge failure throws with the row untouched, nothing marked purged, and the reservation released", async () => {
		const { service, local, pxeStub } = setupServiceWithStorage({})
		staleTestnet(local)
		pxeStub.mockRejectedValueOnce(new Error("offscreen down"))
		const onPurged = vi.fn(async () => {})
		await expect(service.resetChainInPlace(request(), hooks({ onPurged }))).rejects.toThrow(/offscreen down/)
		expect(await stored(local, "tn")).toMatchObject({ chainId: OLD, primaryEndpointId: "u1" })
		expect(onPurged).not.toHaveBeenCalled()
		expect(await service.isNetworkLive("tn")).toBe(true)
	})

	test("an address-only reset purges and leaves the row; a resume after the purge only rewrites", async () => {
		const { service, local, pxeStub } = setupServiceWithStorage({})
		staleTestnet(local, { chainId: CHAIN_IDS.TESTNET })
		await service.resetChainInPlace(request({ fromChainId: CHAIN_IDS.TESTNET }), hooks())
		expect(pxeStub).toHaveBeenCalledWith("p1", CHAIN_IDS.TESTNET)
		expect(await stored(local, "tn")).toMatchObject({ chainId: CHAIN_IDS.TESTNET, primaryEndpointId: "u1" })

		const second = setupServiceWithStorage({})
		staleTestnet(second.local)
		await second.service.resetChainInPlace(request({ purged: true }), hooks())
		expect(second.pxeStub).not.toHaveBeenCalled()
		expect((await stored(second.local, "tn")).chainId).toBe(CHAIN_IDS.TESTNET)
	})

	test("refuses, purging nothing, a row not on the chain it names; the rewrite refuses a target another row holds", async () => {
		const { service, local, pxeStub } = setupServiceWithStorage({})
		staleTestnet(local)
		await expect(service.resetChainInPlace(request({ fromChainId: 999 }), hooks())).rejects.toThrow(/^ERR_NOT_RESETTABLE/)
		expect(pxeStub).not.toHaveBeenCalled()
		storeRow(local, { id: "mine", chainId: CHAIN_IDS.TESTNET })
		await expect(service.resetChainInPlace(request({ purged: true }), hooks())).rejects.toThrow(/^ERR_NOT_RESETTABLE/)
		expect((await stored(local, "tn")).chainId).toBe(OLD)
	})

	test("deleteNetwork refuses while the network's reset runs; idle, it takes the journal and the verdict with the row", async () => {
		const { service, local } = setupServiceWithStorage({})
		staleTestnet(local)
		storeRow(local, { id: "ln", chainId: 0, kind: "local" })
		local.store.set("nulo:core:active-network@p1", "ln")
		let running = true
		service.setResetRunProbe((id) => running && id === "tn")
		await expect(service.deleteNetwork("tn")).rejects.toThrow(/^RESET_RUNNING/)
		expect(local.store.has("nulo:core:networks@tn")).toBe(true)

		running = false
		local.store.set("nulo:core:network-reset@p1", journalFor("tn"))
		const entries = [
			{ networkId: "tn", chainId: OLD, networkReset: true, addressesMoved: false },
			{ networkId: "zz", chainId: 9, networkReset: false, addressesMoved: true },
		]
		local.store.set("nulo:core:stale-networks@p1", JSON.stringify({ profileId: "p1", accountSetDigest: "d", entries }))
		await service.deleteNetwork("tn")
		expect(local.store.has("nulo:core:network-reset@p1")).toBe(false)
		const record = JSON.parse(local.store.get("nulo:core:stale-networks@p1") as string)
		expect(record.entries.map((e: { networkId: string }) => e.networkId)).toEqual(["zz"])
	})

	test("deleteNetwork keeps another network's journal", async () => {
		const { service, local } = setupServiceWithStorage({})
		storeRow(local, { id: "cn", chainId: 77 })
		storeRow(local, { id: "ln", chainId: 0, kind: "local" })
		local.store.set("nulo:core:active-network@p1", "ln")
		local.store.set("nulo:core:network-reset@p1", journalFor("tn"))
		await service.deleteNetwork("cn")
		expect(local.store.get("nulo:core:network-reset@p1")).toBe(journalFor("tn"))
	})

	test("addNetwork refuses a chain a reset journal moves to, and admits another", async () => {
		const { service, local } = setupServiceWithStorage({
			"https://new.example": nodeInfoForChain(20),
			"https://other-chain.example": nodeInfoForChain(30),
		})
		local.store.set("nulo:core:network-reset@p1", journalFor("tn"))
		await expect(service.addNetwork("New", "https://new.example")).rejects.toThrow(/^CHAIN_QUARANTINED/)
		await expect(service.addNetwork("Other", "https://other-chain.example")).resolves.toMatchObject({ chainId: 30 })
	})

	test("commitResetCapture writes nothing once the row left the captured chain or is being deleted", async () => {
		const { service, local } = setupServiceWithStorage({})
		staleTestnet(local)
		const write = vi.fn(async () => {})
		await expect(
			service.commitResetCapture("p1", "tn", { chainId: 999, toChainId: CHAIN_IDS.TESTNET, primary: null }, write),
		).rejects.toThrow(/^ERR_NOT_RESETTABLE/)
		let release!: () => void
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		const run = service.resetChainInPlace(request(), hooks({ beforePurge: () => held }))
		await vi.waitFor(async () => expect(await service.isNetworkLive("tn")).toBe(false))
		await expect(
			service.commitResetCapture("p1", "tn", { chainId: OLD, toChainId: CHAIN_IDS.TESTNET, primary: null }, write),
		).rejects.toThrow(/^ERR_NOT_RESETTABLE/)
		release()
		await run
		expect(write).not.toHaveBeenCalled()
		await service.commitResetCapture("p1", "tn", { chainId: CHAIN_IDS.TESTNET, toChainId: CHAIN_IDS.TESTNET, primary: null }, write)
		expect(write).toHaveBeenCalledTimes(1)
	})

	test("commitResetCapture of a view that probed nothing refuses a user primary set since, and admits the seed's", async () => {
		const write = vi.fn(async () => {})
		const capture = { chainId: OLD, toChainId: CHAIN_IDS.TESTNET, primary: null }
		const userPrimary = setupServiceWithStorage({})
		staleTestnet(userPrimary.local)
		await expect(userPrimary.service.commitResetCapture("p1", "tn", capture, write)).rejects.toThrow(/^ERR_STALE_CHANGED/)
		expect(write).not.toHaveBeenCalled()
		// An address change keeps the row's chain, so its endpoints are not the reset's to decide.
		await userPrimary.service.commitResetCapture("p1", "tn", { ...capture, toChainId: OLD }, write)
		expect(write).toHaveBeenCalledTimes(1)
		const seedPrimary = setupServiceWithStorage({})
		staleTestnet(seedPrimary.local, {
			primaryEndpointId: "s1",
			endpoints: [
				{ id: "s1", rpcUrl: seedForKind("testnet")!.rpcUrl },
				{ id: "u1", rpcUrl: MY_NODE },
			],
		})
		await seedPrimary.service.commitResetCapture("p1", "tn", capture, write)
		expect(write).toHaveBeenCalledTimes(2)
	})

	test("commitResetCapture writes nothing while another row holds the target chain", async () => {
		const { service, local } = setupServiceWithStorage({})
		staleTestnet(local)
		local.store.set(
			"nulo:core:networks@held",
			JSON.stringify({ ...(await stored(local, "tn")), id: "held", chainId: CHAIN_IDS.TESTNET }),
		)
		const write = vi.fn(async () => {})
		await expect(
			service.commitResetCapture("p1", "tn", { chainId: OLD, toChainId: CHAIN_IDS.TESTNET, primary: null }, write),
		).rejects.toThrow(/^ERR_NOT_RESETTABLE: another network holds the new chain/)
		expect(write).not.toHaveBeenCalled()
	})

	const ADDED = "https://added.example"
	/** A node at `ADDED` serving the stale Testnet row's own chain, so an edit passes the identity check. */
	const servesOld = { l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: (OLD ^ TESTNET_L1_CHAIN_ID) >>> 0 } as NodeInfo
	const endpointEdits: Array<[string, (service: NetworkService) => Promise<unknown>]> = [
		["addEndpoint", (service) => service.addEndpoint("tn", undefined, ADDED)],
		["updateEndpoint", (service) => service.updateEndpoint("tn", "u2", "Other", ADDED)],
		["deleteEndpoint", (service) => service.deleteEndpoint("tn", "u2")],
		["setPrimaryEndpoint", (service) => service.setPrimaryEndpoint("tn", "u2")],
	]

	test.each(endpointEdits)("%s refuses while a reset journal names the network, and leaves the row as it was", async (_m, edit) => {
		const { service, local } = setupServiceWithStorage({ [ADDED]: servesOld })
		staleTestnet(local)
		local.store.set("nulo:core:network-reset@p1", journalFor("tn"))
		const before = local.store.get("nulo:core:networks@tn")
		await expect(edit(service)).rejects.toThrow(/^ERR_RESET_PENDING: /)
		expect(local.store.get("nulo:core:networks@tn")).toBe(before)
	})

	test("endpoint edits go through while the journal names another network", async () => {
		const { service, local } = setupServiceWithStorage({ [ADDED]: servesOld })
		staleTestnet(local)
		local.store.set("nulo:core:network-reset@p1", journalFor("zz"))
		const added = await service.addEndpoint("tn", "Added", ADDED)
		await service.updateEndpoint("tn", added.id, "Renamed", ADDED)
		await service.setPrimaryEndpoint("tn", "u2")
		await service.deleteEndpoint("tn", added.id)
		expect(await stored(local, "tn")).toMatchObject({
			primaryEndpointId: "u2",
			endpoints: [
				{ id: "u1", rpcUrl: MY_NODE },
				{ id: "u2", rpcUrl: "https://other.example", label: "Other" },
			],
		})
	})

	test("while edits refuse, the reset's rewrite and deleteNetwork still run", async () => {
		const { service, local } = setupServiceWithStorage({ [ADDED]: servesOld })
		staleTestnet(local)
		storeRow(local, { id: "ln", chainId: 0, kind: "local" })
		local.store.set("nulo:core:active-network@p1", "ln")
		local.store.set("nulo:core:network-reset@p1", journalFor("tn"))
		await service.resetChainInPlace(request({ purged: true }), hooks())
		expect((await stored(local, "tn")).chainId).toBe(CHAIN_IDS.TESTNET)
		await expect(service.setPrimaryEndpoint("tn", "u2")).rejects.toThrow(/^ERR_RESET_PENDING: /)
		await service.deleteNetwork("tn")
		expect(local.store.has("nulo:core:networks@tn")).toBe(false)
		expect(local.store.has("nulo:core:network-reset@p1")).toBe(false)
	})

	test("probeIdentityOnce makes one single-attempt read within its budget", async () => {
		const { service, factory } = setupServiceWithStorage({})
		const getNodeInfo = vi.fn().mockResolvedValue({ l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: 9 })
		const single = vi.spyOn(factory, "createSingleAttemptNode").mockReturnValue({ getNodeInfo } as unknown as AztecNode)
		await expect(service.probeIdentityOnce(MY_NODE, "testnet", 5000)).resolves.toEqual({
			chainId: (TESTNET_L1_CHAIN_ID ^ 9) >>> 0,
			l1ChainId: TESTNET_L1_CHAIN_ID,
		})
		expect(single).toHaveBeenCalledWith(MY_NODE, 5000)
		expect(getNodeInfo).toHaveBeenCalledTimes(1)
	})

	test("probeIdentityOnce refuses a node whose answer computes to 0", async () => {
		const { service, factory } = setupServiceWithStorage({})
		const getNodeInfo = vi.fn().mockResolvedValue({ l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: TESTNET_L1_CHAIN_ID })
		vi.spyOn(factory, "createSingleAttemptNode").mockReturnValue({ getNodeInfo } as unknown as AztecNode)
		await expect(service.probeIdentityOnce(MY_NODE, "testnet", 5000)).rejects.toThrow(/^ENDPOINT_CHAIN_MISMATCH: /)
	})
})
