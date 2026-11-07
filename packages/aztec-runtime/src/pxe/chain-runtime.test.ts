/**
 * `ProductionPxeFactory` proving-mode unit tests.
 *
 * Default mode (no options or `provingMode: "default"`) must keep the SDK's silent WASM fallback
 * for end users and must prove over HTTPS only; required mode (`VITE_NULO_PRESTO_REQUIRED=1`, CI)
 * is the env-gated hard-fail path. `@alejoamiras/presto` is mocked to capture the options the
 * factory hands the prover and to program `checkPrestoStatus`; no real proving here.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { PrestoConfig, PrestoPhase, PrestoStatus } from "@alejoamiras/presto"

vi.mock("@aztec-labs/pxe/client/bundle", () => ({
	createPXE: vi.fn(async () => ({
		getSyncedBlockHeader: async () => {
			throw new Error("Trying to get block header with a not-yet-synchronized PXE - this should never happen")
		},
	})),
}))
vi.mock("@aztec-labs/pxe/config", () => ({ getPXEConfig: () => ({}) }))
vi.mock("@aztec-labs/simulator/client", () => ({ WASMSimulator: class {} }))

const checkPrestoStatusMock = vi.fn()
const proverInstances: Array<{
	onPhase: ((phase: PrestoPhase) => void) | undefined
	presto: PrestoConfig | undefined
}> = []

vi.mock("@alejoamiras/presto", () => ({
	PrestoProver: class {
		constructor(opts: { onPhase?: (phase: PrestoPhase) => void; presto?: PrestoConfig }) {
			proverInstances.push({ onPhase: opts.onPhase, presto: opts.presto })
		}
		checkPrestoStatus() {
			return checkPrestoStatusMock()
		}
	},
}))

import { createPXE } from "@aztec-labs/pxe/client/bundle"
import {
	advanceProve,
	ChainRuntime,
	ChainRuntimeRegistry,
	endpointsKey,
	type NetworkInfo,
	ProductionPxeFactory,
	type ProvePhaseEvent,
	type PxeFactory,
} from "./chain-runtime"
import type { NodeFactory } from "../ports/node-factory-port"
import { createSubmissionPins, type ConnectEndpoint, realTimer, routeNode, type RouteSpec } from "../routing/routed-node"
import { withTransportFailure } from "../utils/fetch"
import { initStoreVersionStamp, openChainStore, readStoreStamp } from "./opfs-store"
import { NO_ROUTE } from "./pxe-factory.testing"

// The injected encrypted store is unit-mocked (real OPFS needs a browser; the production-build
// spike is the empirical proof). The factory only needs open/close handles and the stamp here.
vi.mock("./opfs-store", () => ({
	openChainStore: vi.fn(async () => ({ close: async () => {}, delete: async () => {} })),
	readStoreStamp: vi.fn(async () => undefined),
	initStoreVersionStamp: vi.fn(async () => {}),
}))

const createPXEMock = vi.mocked(createPXE)

/** A routed node answering as a node of chain 31337 on rollup `0x…aa`; `seedFloor` is recorded. */
function fakeRoutedNode(over: Record<string, unknown> = {}) {
	return {
		getNodeInfo: async () => ({ l1ChainId: 31337, rollupVersion: 0 }),
		getL1ContractAddresses: async () => ({ rollupAddress: "0x00000000000000000000000000000000000000aa" }),
		route: { seedFloor: vi.fn() },
		...over,
	}
}

const fakeNodeFactory: NodeFactory = {
	createNode: () => {
		throw new Error("a runtime's node is routed")
	},
	createSingleAttemptNode: () => ({}) as never,
	probeChainId: async () => 0,
	readPublicStorageOnce: async () => {
		throw new Error("not read here")
	},
	createRoutedNode: () => fakeRoutedNode() as never,
}

const fakeNetwork: NetworkInfo = {
	profileId: "p",
	chainId: 31337,
	l1ChainId: 31337,
	endpoints: [
		{ id: "a", rpcUrl: "http://node.local" },
		{ id: "b", rpcUrl: "http://fallback.local" },
	],
}
const fakeStoreKey = new Uint8Array(32)
const available: PrestoStatus = { available: true, needsDownload: false, protocol: "http" }
const fallbackClass = ["fallback", "denied", "secure-connection-unavailable", "version-mismatch"] as const

beforeEach(() => {
	proverInstances.length = 0
	checkPrestoStatusMock.mockReset()
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe("ProductionPxeFactory default (production) mode", () => {
	test("passes httpsOnly: true explicitly and no endpoint when none is configured", async () => {
		const factory = new ProductionPxeFactory(fakeNodeFactory)
		await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		expect(proverInstances).toHaveLength(1)
		expect(proverInstances[0].presto).toEqual({ httpsOnly: true })
	})

	test("does NOT run the preflight", async () => {
		checkPrestoStatusMock.mockResolvedValue(available)
		const factory = new ProductionPxeFactory(fakeNodeFactory)
		await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		expect(checkPrestoStatusMock).not.toHaveBeenCalled()
	})

	test("onPhase never throws on a fallback-class phase (silent WASM fallback preserved)", async () => {
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "default" })
		await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		const onPhase = proverInstances[0].onPhase
		for (const p of fallbackClass) {
			expect(() => onPhase?.(p)).not.toThrow()
		}
	})

	test("succeeds even when Presto is reported unavailable", async () => {
		checkPrestoStatusMock.mockResolvedValue({ available: false, reason: "offline" })
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "default" })
		await expect(factory.createChainRuntime(fakeNetwork, fakeStoreKey)).resolves.toBeDefined()
	})
})

describe("ProductionPxeFactory store identity gate", () => {
	beforeEach(() => {
		vi.mocked(openChainStore).mockClear()
		vi.mocked(readStoreStamp).mockClear()
		vi.mocked(initStoreVersionStamp).mockClear()
		createPXEMock.mockClear()
	})

	/** A factory whose routed node is `node`, recording each step's order. */
	function factoryRecording(node: ReturnType<typeof fakeRoutedNode>, order: string[] = []) {
		const store = { close: vi.fn(async () => {}) }
		vi.mocked(openChainStore).mockImplementationOnce(async () => {
			order.push("open")
			return store as never
		})
		vi.mocked(readStoreStamp).mockImplementationOnce(async () => {
			order.push("stamp read")
			return "0x00000000000000000000000000000000000000aa"
		})
		const createRoutedNode = vi.fn((spec: RouteSpec) => {
			order.push("route")
			return { ...node, spec } as never
		})
		return { factory: new ProductionPxeFactory({ ...fakeNodeFactory, createRoutedNode }), createRoutedNode, store }
	}

	test("opens the store and reads its stamp before the route is built, and gives the route that rollup", async () => {
		const order: string[] = []
		const node = fakeRoutedNode({
			getNodeInfo: async () => {
				order.push("node read")
				return { l1ChainId: 31337, rollupVersion: 0 }
			},
		})
		const { factory, createRoutedNode } = factoryRecording(node, order)
		await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		expect(order.slice(0, 4)).toEqual(["open", "stamp read", "route", "node read"])
		expect(createRoutedNode.mock.calls[0]?.[0]).toEqual({
			chainId: 31337,
			l1ChainId: 31337,
			endpoints: fakeNetwork.endpoints,
			rollupAddress: "0x00000000000000000000000000000000000000aa",
		})
		expect(initStoreVersionStamp).toHaveBeenCalledWith(
			expect.anything(),
			"0x00000000000000000000000000000000000000aa",
			expect.anything(),
		)
	})

	test("refuses a node serving another chain, closing the store it opened, before the PXE is built", async () => {
		const alpha = fakeRoutedNode({
			getNodeInfo: async () => ({ l1ChainId: 1, rollupVersion: 4248422647 }),
			getL1ContractAddresses: vi.fn(),
		})
		const { factory, store } = factoryRecording(alpha)
		const v6 = { ...fakeNetwork, chainId: (1 ^ 2070860440) >>> 0, l1ChainId: 1 }
		await expect(factory.createChainRuntime(v6, fakeStoreKey)).rejects.toThrow(/Refusing to open its PXE store/)
		expect(store.close).toHaveBeenCalledTimes(1)
		expect(alpha.getL1ContractAddresses).not.toHaveBeenCalled()
		expect(initStoreVersionStamp).not.toHaveBeenCalled()
		expect(createPXEMock).not.toHaveBeenCalled()
	})

	test("a node read that fails after the open closes the store", async () => {
		const down = fakeRoutedNode({
			getNodeInfo: async () => {
				throw withTransportFailure(new Error("fetch failed"), "unreachable")
			},
		})
		const { factory, store } = factoryRecording(down)
		await expect(factory.createChainRuntime(fakeNetwork, fakeStoreKey)).rejects.toThrow("fetch failed")
		expect(store.close).toHaveBeenCalledTimes(1)
		expect(createPXEMock).not.toHaveBeenCalled()
	})

	test("opens chain 0 without reading the node's identity", async () => {
		const getNodeInfo = vi.fn()
		const { factory } = factoryRecording(fakeRoutedNode({ getNodeInfo }))
		await expect(factory.createChainRuntime({ ...fakeNetwork, chainId: 0 }, fakeStoreKey)).resolves.toBeDefined()
		expect(getNodeInfo).not.toHaveBeenCalled()
	})
})

describe("ProductionPxeFactory floor seeding", () => {
	const headerAt = (block: number) => ({ getBlockNumber: () => block })

	test("raises the route's floor to the block the store has synced, before the runtime is returned", async () => {
		const node = fakeRoutedNode()
		createPXEMock.mockResolvedValueOnce({ getSyncedBlockHeader: async () => headerAt(42) } as never)
		const runtime = await new ProductionPxeFactory({ ...fakeNodeFactory, createRoutedNode: () => node as never }).createChainRuntime(
			fakeNetwork,
			fakeStoreKey,
		)
		expect(runtime.node).toBe(node)
		expect(node.route.seedFloor.mock.calls).toEqual([[42]])
	})

	test("keeps the genesis floor on a store that never synced", async () => {
		const node = fakeRoutedNode()
		await new ProductionPxeFactory({ ...fakeNodeFactory, createRoutedNode: () => node as never }).createChainRuntime(
			fakeNetwork,
			fakeStoreKey,
		)
		expect(node.route.seedFloor).not.toHaveBeenCalled()
	})

	test("any other error reading the synced block fails the build and stops the PXE it made", async () => {
		const close = vi.fn(async () => {})
		vi.mocked(openChainStore).mockResolvedValueOnce({ close } as never)
		const stop = vi.fn(async () => {})
		createPXEMock.mockResolvedValueOnce({
			stop,
			getSyncedBlockHeader: async () => {
				throw new Error("disk I/O error")
			},
		} as never)
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "proverless" })
		await expect(factory.createChainRuntime(fakeNetwork, fakeStoreKey)).rejects.toThrow("disk I/O error")
		expect(stop).toHaveBeenCalledTimes(1)
		expect(close).toHaveBeenCalledTimes(1)
	})
})

describe("ProductionPxeFactory required mode", () => {
	test("derives httpsOnly: false from the mode and passes the endpoint through", async () => {
		checkPrestoStatusMock.mockResolvedValue(available)
		const factory = new ProductionPxeFactory(fakeNodeFactory, {
			provingMode: "required",
			host: "127.0.0.1",
			port: 59833,
			httpsPort: 59834,
		})
		await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		expect(proverInstances[0].presto).toEqual({ host: "127.0.0.1", port: 59833, httpsPort: 59834, httpsOnly: false })
	})

	test("preflight names the reason when Presto is unavailable", async () => {
		checkPrestoStatusMock.mockResolvedValue({ available: false, reason: "permission-blocked" })
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "required" })
		await expect(factory.createChainRuntime(fakeNetwork, fakeStoreKey)).rejects.toThrow(
			/\[presto-required\] presto-server unavailable: reason=permission-blocked/,
		)
	})

	test("preflight names the diagnosis on secure-connection-unavailable", async () => {
		checkPrestoStatusMock.mockResolvedValue({
			available: false,
			reason: "secure-connection-unavailable",
			diagnosis: "https-disabled",
		})
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "required" })
		await expect(factory.createChainRuntime(fakeNetwork, fakeStoreKey)).rejects.toThrow(
			/reason=secure-connection-unavailable diagnosis=https-disabled/,
		)
	})

	test("preflight runs exactly once and does NOT throw when available", async () => {
		checkPrestoStatusMock.mockResolvedValue(available)
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "required" })
		await expect(factory.createChainRuntime(fakeNetwork, fakeStoreKey)).resolves.toBeDefined()
		expect(checkPrestoStatusMock).toHaveBeenCalledTimes(1)
	})

	test("warns (does NOT throw) when status.needsDownload === true", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
		checkPrestoStatusMock.mockResolvedValue({ ...available, needsDownload: true, sdkAztecVersion: "5.2.0" })
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "required" })
		await expect(factory.createChainRuntime(fakeNetwork, fakeStoreKey)).resolves.toBeDefined()
		expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/needsDownload=true/))
	})

	test("onPhase throws on every fallback-class phase", async () => {
		checkPrestoStatusMock.mockResolvedValue(available)
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "required" })
		await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		const onPhase = proverInstances[0].onPhase
		expect(onPhase).toBeDefined()
		// The last two precede `fallback` on the paths that detect them: redundant, but precise. A
		// legacy health-version mismatch reaches `fallback` without its own phase and is caught there.
		for (const p of fallbackClass) {
			expect(() => onPhase?.(p)).toThrow(new RegExp(`SDK emitted phase="${p}"`))
		}
	})

	test("onPhase does NOT throw on benign phases", async () => {
		checkPrestoStatusMock.mockResolvedValue(available)
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "required" })
		await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		const onPhase = proverInstances[0].onPhase
		const benign: PrestoPhase[] = ["detect", "serialize", "transmit", "proving", "proved", "receive"]
		for (const p of benign) {
			expect(() => onPhase?.(p)).not.toThrow()
		}
	})

	test('onPhase warns (does NOT throw) on phase="downloading"', async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
		checkPrestoStatusMock.mockResolvedValue(available)
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "required" })
		await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		const onPhase = proverInstances[0].onPhase
		expect(() => onPhase?.("downloading")).not.toThrow()
		expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/phase="downloading"/))
	})
})

describe("ProductionPxeFactory prove-phase observer", () => {
	const nativeSequence: PrestoPhase[] = ["detect", "serialize", "transmit", "proving", "proved", "receive"]

	async function runtimeWithObserver(mode: "default" | "required" = "default") {
		const events: ProvePhaseEvent[] = []
		checkPrestoStatusMock.mockResolvedValue(available)
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: mode, onProvePhase: (e) => events.push(e) })
		const runtime = await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		const onPhase = proverInstances[0].onPhase
		if (!onPhase) throw new Error("prover constructed without onPhase")
		return { runtime, events, onPhase }
	}

	test("every phase reaches the observer with the runtime's activeProve evidence, in order", async () => {
		const { runtime, events, onPhase } = await runtimeWithObserver()
		runtime.activeProve = { proveId: "attempt-1", seq: 0 }
		for (const p of nativeSequence) onPhase(p)
		expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6])
		expect(events.every((e) => e.proveId === "attempt-1")).toBe(true)
		expect(events.map((e) => e.backend)).toEqual([undefined, undefined, "presto", "presto", "presto", "presto"])
		expect(runtime.activeProve).toEqual({ proveId: "attempt-1", seq: 6, backend: "presto" })
	})

	test("no phase reaches the observer while activeProve is unset", async () => {
		const { runtime, events, onPhase } = await runtimeWithObserver()
		for (const p of nativeSequence) onPhase(p)
		expect(events).toEqual([])
		expect(runtime.activeProve).toBeUndefined()
	})

	test("a throwing observer does not propagate into the prover (default mode)", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {})
		checkPrestoStatusMock.mockResolvedValue(available)
		const factory = new ProductionPxeFactory(fakeNodeFactory, {
			onProvePhase: () => {
				throw new Error("observer exploded")
			},
		})
		const runtime = await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		runtime.activeProve = { proveId: "a", seq: 0 }
		expect(() => proverInstances[0].onPhase?.("transmit")).not.toThrow()
		expect(runtime.activeProve.seq).toBe(1)
	})

	test("required mode: the guard fires before the observer, so a forbidden phase is never reported", async () => {
		const { runtime, events, onPhase } = await runtimeWithObserver("required")
		runtime.activeProve = { proveId: "a", seq: 0 }
		expect(() => onPhase("fallback")).toThrow(/presto-required/)
		expect(events).toEqual([])
	})

	test("advanceProve: transmit then fallback ends as browser; proved never changes the backend", () => {
		const active = { proveId: "a", seq: 0 }
		expect(advanceProve(active, "transmit").backend).toBe("presto")
		expect(advanceProve(active, "fallback").backend).toBe("browser")
		expect(advanceProve(active, "proved")).toEqual({ proveId: "a", seq: 3, phase: "proved", backend: "browser" })
	})
})

describe("ProductionPxeFactory proverless mode (e2e-only)", () => {
	test("does NOT construct a PrestoProver", async () => {
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "proverless" })
		await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		expect(proverInstances).toHaveLength(0)
	})

	test("sets proverEnabled:false and omits proverOrOptions (default fakeProofs prover)", async () => {
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "proverless" })
		await factory.createChainRuntime(fakeNetwork, fakeStoreKey)
		const lastCall = createPXEMock.mock.calls.at(-1)
		if (!lastCall) throw new Error("createPXE was not called")
		const config = lastCall[1] as { proverEnabled?: boolean }
		const options = lastCall[2] as { proverOrOptions?: unknown; simulator?: unknown }
		expect(config.proverEnabled).toBe(false)
		expect(options.proverOrOptions).toBeUndefined()
		// The simulator is still passed so kernel simulation stays on the
		// bundled WASM path (the MV3 dynamic-import fallback fails offscreen).
		expect(options.simulator).toBeDefined()
	})

	test("proverless + required is unrepresentable in the options union (compile-time guarantee)", () => {
		// The `provingMode` discriminated union makes the previously-illegal combo a
		// TYPE error — stronger than the old runtime throw. The @ts-expect-error IS
		// the assertion: if the union ever allowed both, this line would compile and
		// the directive would become an unused-error.
		// @ts-expect-error - `provingMode: "proverless"` cannot also carry `required`.
		const factory = new ProductionPxeFactory(fakeNodeFactory, { provingMode: "proverless", required: true })
		expect(factory).toBeDefined()
	})
})

describe("ChainRuntimeRegistry.disposeProfile — allSettled + AggregateError + poisoned re-add", () => {
	const P = "prof-1"
	const net = (chainId: number): NetworkInfo => ({
		profileId: P,
		chainId,
		l1ChainId: 1,
		endpoints: [{ id: "a", rpcUrl: `http://n/${chainId}` }],
	})

	function runtimeWith(chainId: number, close: () => Promise<void>): ChainRuntime {
		const pxe = { stop: async () => {} } as never
		const node = {} as never
		const store = { close } as never
		return new ChainRuntime(chainId, node, pxe, endpointsKey(net(chainId).endpoints), store)
	}

	test("disposes all, throws AggregateError on a failed close, and re-adds ONLY the poisoned runtime", async () => {
		const ok = runtimeWith(1, async () => {})
		const bad = runtimeWith(2, async () => {
			throw new Error("close failed: lock leaked")
		})
		const factory: PxeFactory = { createRoute: NO_ROUTE, createChainRuntime: async (n) => (n.chainId === 1 ? ok : bad) }
		const reg = new ChainRuntimeRegistry(factory)
		await reg.ensure(net(1))
		await reg.ensure(net(2))

		await expect(reg.disposeProfile(P)).rejects.toBeInstanceOf(AggregateError)
		// The cleanly-disposed chain is gone; the poisoned one is RETAINED as the retry handle.
		expect(reg.peek(P, 1)).toBeUndefined()
		expect(reg.peek(P, 2)).toBe(bad)
	})

	test("resolves cleanly + clears the registry when every close succeeds", async () => {
		const factory: PxeFactory = { createRoute: NO_ROUTE, createChainRuntime: async (n) => runtimeWith(n.chainId, async () => {}) }
		const reg = new ChainRuntimeRegistry(factory)
		await reg.ensure(net(1))
		await reg.ensure(net(2))

		await expect(reg.disposeProfile(P)).resolves.toBeUndefined()
		expect(reg.peek(P, 1)).toBeUndefined()
		expect(reg.peek(P, 2)).toBeUndefined()
	})
})

describe("ChainRuntimeRegistry peek/ensure split", () => {
	const P = "prof-1"
	const A = { id: "a", rpcUrl: "http://a" }
	const B = { id: "b", rpcUrl: "http://b" }
	const netAt = (chainId: number, ...endpoints: { id: string; rpcUrl: string }[]): NetworkInfo => ({
		profileId: P,
		chainId,
		l1ChainId: 1,
		endpoints,
	})

	function runtimeAt(network: NetworkInfo, close: () => Promise<void> = async () => {}): ChainRuntime {
		const pxe = { stop: async () => {} } as never
		const node = {} as never
		const store = { close } as never
		return new ChainRuntime(network.chainId, node, pxe, endpointsKey(network.endpoints), store)
	}

	test("peekMatching returns the runtime only for the endpoint list it was built for; never mutates", async () => {
		const rt = runtimeAt(netAt(1, A, B))
		const reg = new ChainRuntimeRegistry({ createRoute: NO_ROUTE, createChainRuntime: async () => rt })
		await reg.ensure(netAt(1, A, B))

		expect(reg.peekMatching(netAt(1, A, B))).toBe(rt)
		// Endpoints edited: a read-path caller gets a miss (it escalates to
		// ensure under the chain WRITE guard) — the live runtime is untouched.
		expect(reg.peekMatching(netAt(1, B))).toBeUndefined()
		expect(reg.peekMatching(netAt(1, B, A))).toBeUndefined()
		expect(reg.peekMatching(netAt(1, A, { id: "b", rpcUrl: "http://b2" }))).toBeUndefined()
		expect(reg.peek(P, 1)).toBe(rt)
	})

	test("ensure rebinds on an endpoint-list edit: disposes the old runtime, binds the new list", async () => {
		let closed = 0
		const reg = new ChainRuntimeRegistry({
			createRoute: NO_ROUTE,
			createChainRuntime: async (n) =>
				runtimeAt(n, async () => {
					closed++
				}),
		})
		const first = await reg.ensure(netAt(1, A, B))
		expect(await reg.ensure(netAt(1, A, B))).toBe(first) // idempotent on match

		const reordered = await reg.ensure(netAt(1, B, A))
		expect(reordered).not.toBe(first)
		expect(closed).toBe(1) // the old runtime was disposed
		expect(reg.peekMatching(netAt(1, B, A))).toBe(reordered)
	})

	test("a failover moves the route, never the runtime: the same list still matches and nothing is rebuilt", async () => {
		const calls: string[] = []
		const connect: ConnectEndpoint = (rpcUrl) =>
			({
				getL1ContractAddresses: async () => {
					calls.push(rpcUrl)
					if (rpcUrl === A.rpcUrl) throw withTransportFailure(new Error("fetch failed"), "unreachable")
					return "addresses"
				},
				getNodeInfo: async () => ({ l1ChainId: 1, rollupVersion: 0 }),
				getChainTips: async () => ({ proposed: { number: 5 } }),
			}) as never
		let built = 0
		const reg = new ChainRuntimeRegistry({
			createRoute: NO_ROUTE,
			createChainRuntime: async (n) => {
				built++
				const node = routeNode(
					connect,
					{ chainId: 1, l1ChainId: 1, endpoints: n.endpoints },
					{ now: () => 0, sleep: async () => {}, timer: realTimer, log: () => {} },
				)
				return new ChainRuntime(n.chainId, node, { stop: async () => {} } as never, endpointsKey(n.endpoints))
			},
		})
		const runtime = await reg.ensure(netAt(1, A, B))
		await expect(runtime.node.getL1ContractAddresses()).resolves.toBe("addresses")
		expect(calls).toEqual([A.rpcUrl, B.rpcUrl])

		expect(reg.peekMatching(netAt(1, A, B))).toBe(runtime)
		expect(await reg.ensure(netAt(1, A, B))).toBe(runtime)
		expect(built).toBe(1)
	})

	test("every runtime built for a (profile, chain) gets that pair's pins; another chain gets its own", async () => {
		const pins: unknown[] = []
		const reg = new ChainRuntimeRegistry({
			createRoute: NO_ROUTE,
			createChainRuntime: async (n, _key, options) => {
				pins.push(options?.pins)
				return runtimeAt(n)
			},
		})
		await reg.ensure(netAt(1, A, B))
		await reg.ensure(netAt(1, B))
		await reg.ensure(netAt(2, A))
		expect(pins[0]).toBeDefined()
		expect(pins[1]).toBe(pins[0])
		expect(pins[2]).not.toBe(pins[0])
		expect(reg.pinsFor(P, 1)).toBe(pins[0])
	})

	test("a profile's erase drops its pins; another profile's stay", async () => {
		const reg = new ChainRuntimeRegistry({ createRoute: NO_ROUTE, createChainRuntime: async (n) => runtimeAt(n) })
		const mine = reg.pinsFor(P, 1)
		const theirs = reg.pinsFor("prof-2", 1)
		mine.byTxHash.set("0x01", A)
		await reg.disposeProfile(P)
		expect(reg.pinsFor(P, 1)).not.toBe(mine)
		expect(reg.pinsFor("prof-2", 1)).toBe(theirs)
		expect(createSubmissionPins().byTxHash.size).toBe(0)
	})

	test("ensure keeps the old runtime referenced when its dispose fails (retry handle, no double-open)", async () => {
		const bad = runtimeAt(netAt(1, A), async () => {
			throw new Error("close failed: lock leaked")
		})
		let factoryCalls = 0
		const reg = new ChainRuntimeRegistry({
			createRoute: NO_ROUTE,
			createChainRuntime: async (n) => {
				factoryCalls++
				return n.endpoints[0]?.id === "a" ? bad : runtimeAt(n)
			},
		})
		await reg.ensure(netAt(1, A))
		expect(factoryCalls).toBe(1)

		// The rebind's dispose throws: ensure must NOT init the new list over a
		// possibly-leaked SAH lock, and must keep the old reference for retry.
		await expect(reg.ensure(netAt(1, B))).rejects.toThrow("close failed")
		expect(factoryCalls).toBe(1)
		expect(reg.peek(P, 1)).toBe(bad)
	})
})

describe("ChainRuntimeRegistry.stopRetries", () => {
	type Stop = [profileId: string, chainId?: number]
	const RUNTIMES = ["a:1", "a:12", "b:1"] as const

	async function registryWith(...keys: string[]) {
		const retryWhile = new Map<string, () => boolean>()
		const reg = new ChainRuntimeRegistry({
			createRoute: NO_ROUTE,
			createChainRuntime: async (n, _storeKey, retries) => {
				retryWhile.set(`${n.profileId}:${n.chainId}`, retries?.retryWhile ?? (() => true))
				return new ChainRuntime(n.chainId, {} as never, {} as never, endpointsKey(n.endpoints))
			},
		})
		const ensure = async (key: string) => {
			const [profileId, chainId] = key.split(":")
			await reg.ensure({ profileId, chainId: Number(chainId), l1ChainId: 1, endpoints: [{ id: "a", rpcUrl: "http://n" }] })
		}
		for (const key of keys) await ensure(key)
		const retrying = () => Object.fromEntries([...retryWhile].map(([key, allowed]) => [key, allowed()]))
		return { reg, ensure, retrying }
	}

	test.each<{ name: string; stops: Stop[]; stopped: string[] }>([
		{ name: "no stop", stops: [], stopped: [] },
		{ name: "one chain's stop", stops: [["a", 1]], stopped: ["a:1"] },
		{ name: "a profile's stop", stops: [["a"]], stopped: ["a:1", "a:12"] },
		{ name: "another profile's stop", stops: [["b"]], stopped: ["b:1"] },
	])("$name turns off exactly its runtimes' retries", async ({ stops, stopped }) => {
		const { reg, retrying } = await registryWith(...RUNTIMES)
		for (const [profileId, chainId] of stops) reg.stopRetries(profileId, chainId)
		expect(retrying()).toEqual(Object.fromEntries(RUNTIMES.map((key) => [key, !stopped.includes(key)])))
	})

	test("a release restores retries; overlapping stops need every release, each counted once", async () => {
		const { reg, retrying } = await registryWith(...RUNTIMES)
		const chain = reg.stopRetries("a", 1)
		const profile = reg.stopRetries("a")
		const again = reg.stopRetries("a")

		profile()
		profile()
		expect(retrying()).toEqual({ "a:1": false, "a:12": false, "b:1": true })
		again()
		expect(retrying()).toEqual({ "a:1": false, "a:12": true, "b:1": true })
		chain()
		expect(retrying()).toEqual({ "a:1": true, "a:12": true, "b:1": true })
	})

	test("a runtime built while its profile is stopped starts with retries off", async () => {
		const { reg, ensure, retrying } = await registryWith()
		const release = reg.stopRetries("a")
		await ensure("a:3")
		expect(retrying()).toEqual({ "a:3": false })
		release()
		expect(retrying()).toEqual({ "a:3": true })
	})

	test("the production factory builds its routed node with the registry's retry policy and pins", async () => {
		const createRoutedNode = vi.fn(fakeNodeFactory.createRoutedNode)
		const options = { retryWhile: () => false, pins: createSubmissionPins() }
		await new ProductionPxeFactory({ ...fakeNodeFactory, createRoutedNode }).createChainRuntime(fakeNetwork, fakeStoreKey, options)
		expect(createRoutedNode).toHaveBeenCalledWith(expect.objectContaining({ endpoints: fakeNetwork.endpoints }), options)
	})
})
