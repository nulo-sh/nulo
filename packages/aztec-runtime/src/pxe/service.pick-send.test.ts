/**
 * `PxeService.pickSendEndpoint`, the endpoint a send goes through, picked on the route the proof
 * read through, and `getRouteSnapshot` with `onRouteChanged`, what the endpoint list shows of that
 * route: the real router over fake per-URL clients.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("./known-artifacts", () => ({
	loadProductionKnownArtifacts: async () => ({ artifacts: new Map(), instances: new Map() }),
}))
vi.mock("./note-schemas", () => ({
	loadProductionNoteSchemas: async () => new Map<string, unknown>(),
}))
vi.mock("./opfs-store", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	removeChainStoreDir: async () => {},
	removeProfileStoreDirs: async () => {},
}))

import type { PXE } from "@aztec-labs/pxe/client/bundle"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { walletChainId } from "@nulo/wallet-core/chain-id"
import { realTimer, type RouteSpec, routeNode, type SubmissionPins } from "../routing/routed-node"
import { ChainRuntime, endpointsKey, type NetworkInfo, type PxeFactory } from "./chain-runtime"
import { StoreErasedError } from "./lifecycle-coordinator"
import { RouteSnapshotSchema } from "./schemas"
import { PxeService } from "./service"

const L1 = 11_155_111
const ROLLUP_VERSION = 4
const CHAIN_ID = walletChainId(L1, ROLLUP_VERSION)
const A = { id: "a", rpcUrl: "https://a.example" }
const B = { id: "b", rpcUrl: "https://b.example" }
const TX_HASH = `0x${"12".repeat(32)}`
const ANCHOR = `0x${"0c".repeat(32)}`
const SENDER = `0x${"0".repeat(60)}ab12`

const networkOf = (...endpoints: (typeof A)[]): NetworkInfo => ({ profileId: "p1", chainId: CHAIN_ID, l1ChainId: L1, endpoints })

interface Fixture {
	factory: PxeFactory
	/** Requests each URL received, as `method`. */
	seen: Map<string, string[]>
	built: NetworkInfo[]
	routes: { network: NetworkInfo; pins: SubmissionPins }[]
	runtimePins: SubmissionPins[]
	/** Settles the write `registerSender` holds. */
	releaseWrite: () => void
}

function fixture(): Fixture {
	const seen = new Map<string, string[]>()
	const client = (url: string): AztecNode =>
		new Proxy({} as AztecNode, {
			get: (_t, method) =>
				typeof method !== "string"
					? undefined
					: async (..._args: unknown[]) => {
							seen.set(url, [...(seen.get(url) ?? []), method])
							switch (method) {
								case "getNodeInfo":
									return { l1ChainId: L1, rollupVersion: ROLLUP_VERSION, l1ContractAddresses: {} }
								case "getChainTips":
									return { proposed: { number: 10 }, checkpointed: { block: { number: 10 } } }
								case "getBlockData":
									return { header: {} }
								case "getBlockNumber":
									return 10
								default:
									return undefined
							}
						},
		})
	const route = (endpoints: NetworkInfo["endpoints"], pins?: SubmissionPins, changed?: () => void) => {
		const spec: RouteSpec = { chainId: CHAIN_ID, l1ChainId: L1, endpoints }
		const deps = { now: Date.now, sleep: async () => {}, timer: realTimer, log: () => {}, pins, changed }
		return routeNode((url) => client(url), spec, deps)
	}
	let releaseWrite: () => void = () => {}
	const held = new Promise<void>((resolve) => {
		releaseWrite = resolve
	})
	const f: Fixture = {
		seen,
		built: [],
		routes: [],
		runtimePins: [],
		releaseWrite: () => releaseWrite(),
		factory: {
			createChainRuntime: async (n, _key, options) => {
				f.built.push(n)
				if (options?.pins) f.runtimePins.push(options.pins)
				const pxe = { registerTaggingSecretSource: () => held } as unknown as PXE
				return new ChainRuntime(n.chainId, route(n.endpoints, options?.pins, options?.onChange), pxe, endpointsKey(n.endpoints))
			},
			createRoute: (n, pins) => {
				f.routes.push({ network: n, pins })
				return route(n.endpoints, pins).route
			},
		},
	}
	return f
}

function service(f: Fixture): PxeService {
	const s = new PxeService({ connect: async () => {}, getProfiles: async () => [] }, { log: () => {} }, f.factory)
	;(s as unknown as { initialized: boolean }).initialized = true
	return s
}

beforeEach(() => {
	vi.stubGlobal("chrome", {
		runtime: { onMessage: { addListener: () => {}, removeListener: () => {} }, sendMessage: () => Promise.resolve() },
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("PxeService.pickSendEndpoint", () => {
	test("on the runtime's route it returns the active endpoint with no request, while a write holds the chain guard", async () => {
		const f = fixture()
		const s = service(f)
		const network = networkOf(A, B)
		await s.getLatestBlockNumber(network)
		const write = s.registerSender(network, SENDER as never)
		const before = structuredClone(Object.fromEntries(f.seen))

		await expect(s.pickSendEndpoint(network, { txHash: TX_HASH, anchorHash: ANCHOR })).resolves.toEqual({ rpcUrl: A.rpcUrl })

		expect(Object.fromEntries(f.seen)).toEqual(before)
		expect(f.built).toHaveLength(1)
		expect(f.routes).toEqual([])
		f.releaseWrite()
		await write
	})

	test("with no runtime for the request's endpoints it asks them on a route sharing the pair's pins, and builds none", async () => {
		const f = fixture()
		const s = service(f)
		await s.getLatestBlockNumber(networkOf(A))
		const network = networkOf(A, B)

		await expect(s.pickSendEndpoint(network, { txHash: TX_HASH, anchorHash: ANCHOR })).resolves.toEqual({ rpcUrl: A.rpcUrl })

		expect(f.built).toHaveLength(1)
		expect(f.routes.map((r) => r.network)).toEqual([network])
		expect(f.seen.get(A.rpcUrl)?.slice(-2)).toEqual(["getNodeInfo", "getBlockData"])
		expect(f.seen.get(B.rpcUrl)).toBeUndefined()
		// The runtime the next operation builds for this list reads the hash's receipts where it was sent.
		await s.getLatestBlockNumber(network)
		expect(f.built).toHaveLength(2)
		expect(f.runtimePins.at(-1)).toBe(f.routes[0]?.pins)
		expect(f.runtimePins.at(-1)?.byTxHash.get(TX_HASH)).toEqual(A)
	})

	test("refuses a malformed hash before any request", async () => {
		const f = fixture()
		const s = service(f)
		await expect(s.pickSendEndpoint(networkOf(A, B), { txHash: "0x12", anchorHash: ANCHOR })).rejects.toThrow()
		expect(f.seen.size).toBe(0)
		expect(f.routes).toEqual([])
	})

	test("refuses an erased generation's capture", async () => {
		const f = fixture()
		const s = service(f)
		await s.clearProfileState("p1", "gen-1")
		await expect(
			s.pickSendEndpoint({ ...networkOf(A, B), pxeGeneration: "gen-1" }, { txHash: TX_HASH, anchorHash: ANCHOR }),
		).rejects.toBeInstanceOf(StoreErasedError)
		expect(f.routes).toEqual([])
	})
})

describe("PxeService.getRouteSnapshot", () => {
	test("answers null and builds nothing while no runtime exists for the request's endpoint list", async () => {
		const f = fixture()
		const s = service(f)
		await expect(s.getRouteSnapshot(networkOf(A, B))).resolves.toBeNull()
		await s.getLatestBlockNumber(networkOf(A))
		await expect(s.getRouteSnapshot(networkOf(A, B))).resolves.toBeNull()
		expect(f.built).toHaveLength(1)
		expect(f.routes).toEqual([])
	})

	test("on the runtime built for the list it answers ids, states, times and failure kinds, never a URL, and asks no endpoint", async () => {
		const f = fixture()
		const s = service(f)
		const network = networkOf(A, B)
		await s.getLatestBlockNumber(network)
		const before = structuredClone(Object.fromEntries(f.seen))
		const snapshot = await s.getRouteSnapshot(network)
		expect(snapshot).toEqual({
			activeId: "a",
			endpoints: [
				{ id: "a", state: "ready", since: expect.any(Number), failure: undefined },
				{ id: "b", state: "unknown", since: expect.any(Number), failure: undefined },
			],
		})
		expect(JSON.stringify(snapshot)).not.toContain("example")
		expect(Object.fromEntries(f.seen)).toEqual(before)
	})

	test("onRouteChanged names the pair when a runtime is built, when its route moves and when a rebind drops it", async () => {
		const f = fixture()
		const s = service(f)
		const changed = vi.fn()
		s.onRouteChanged.add(changed)
		await s.getLatestBlockNumber(networkOf(A, B))
		expect(changed).toHaveBeenCalledWith({ profileId: "p1", chainId: CHAIN_ID })
		const built = changed.mock.calls.length
		expect(built, "the build, then the route's own change as A answers its first read").toBeGreaterThan(1)
		const lone = vi.fn()
		s.onRouteChanged.remove(changed)
		s.onRouteChanged.add(lone)
		await s.getLatestBlockNumber(networkOf(A))
		expect(lone, "the rebind's drop, then the lone endpoint's build: its route itself never moves").toHaveBeenCalledTimes(2)
		expect(changed.mock.calls.length).toBe(built)
	})

	test("the client's schema takes the answer and refuses an entry carrying any other key", () => {
		const entry = { id: "a", state: "down", since: 1, failure: "timeout" }
		expect(RouteSnapshotSchema.parse({ activeId: "b", endpoints: [entry] })).toEqual({ activeId: "b", endpoints: [entry] })
		expect(RouteSnapshotSchema.parse(null)).toBeNull()
		expect(() => RouteSnapshotSchema.parse({ activeId: null, endpoints: [{ ...entry, rpcUrl: A.rpcUrl }] })).toThrow()
	})

	test("refuses an erased generation's capture", async () => {
		const f = fixture()
		const s = service(f)
		await s.clearProfileState("p1", "gen-1")
		await expect(s.getRouteSnapshot({ ...networkOf(A, B), pxeGeneration: "gen-1" })).rejects.toBeInstanceOf(StoreErasedError)
	})
})
