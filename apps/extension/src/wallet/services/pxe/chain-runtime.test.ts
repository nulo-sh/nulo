import { describe, test, expect, vi } from "vitest"
import type { PXE } from "@aztec-labs/pxe/client/bundle"
import { ChainRuntime, ChainRuntimeRegistry, endpointsKey, type NetworkInfo, type PxeFactory } from "@nulo/aztec-runtime/pxe"
import { networkInfoFrom } from "@/wallet/services/network/spec"

const network = (profileId: string, chainId: number, ...urls: string[]): NetworkInfo => ({
	profileId,
	chainId,
	l1ChainId: 1,
	endpoints: (urls.length > 0 ? urls : [`https://rpc-${chainId}.example`]).map((rpcUrl, i) => ({ id: `e${i}`, rpcUrl })),
})

const makePxe = (id: string): { pxe: PXE; stop: ReturnType<typeof vi.fn> } => {
	const stop = vi.fn().mockResolvedValue(undefined)
	const pxe = { __id: id, stop } as unknown as PXE
	return { pxe, stop }
}

const makeFactory = () => {
	const creations: Array<{ network: NetworkInfo; runtime: ChainRuntime; stop: ReturnType<typeof vi.fn> }> = []
	let nextId = 0
	const factory: PxeFactory = {
		async createChainRuntime(net) {
			const id = `pxe-${nextId++}-${net.profileId}-${net.chainId}`
			const { pxe, stop } = makePxe(id)
			const node = { __id: `node-${id}` } as never
			const runtime = new ChainRuntime(net.chainId, node, pxe, endpointsKey(net.endpoints))
			creations.push({ network: net, runtime, stop })
			return runtime
		},
	}
	return { factory, creations }
}

describe("ChainRuntime.dispose", () => {
	test("calls pxe.stop() when present", async () => {
		const { pxe, stop } = makePxe("a")
		const runtime = new ChainRuntime(1, {} as never, pxe, "[]")
		await runtime.dispose()
		expect(stop).toHaveBeenCalledTimes(1)
	})

	test("swallows errors from pxe.stop()", async () => {
		const stop = vi.fn().mockRejectedValue(new Error("stop failed"))
		const pxe = { stop } as unknown as PXE
		const runtime = new ChainRuntime(1, {} as never, pxe, "[]")
		await expect(runtime.dispose()).resolves.toBeUndefined()
	})

	test("no-op when pxe has no stop method", async () => {
		const pxe = {} as unknown as PXE
		const runtime = new ChainRuntime(1, {} as never, pxe, "[]")
		await expect(runtime.dispose()).resolves.toBeUndefined()
	})
})

describe("ChainRuntimeRegistry", () => {
	test("ensure returns same runtime for same (profileId, chainId)", async () => {
		const { factory, creations } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		const r1 = await registry.ensure(network("p1", 1))
		const r2 = await registry.ensure(network("p1", 1))
		expect(r1).toBe(r2)
		expect(creations.length).toBe(1)
	})

	test("sequential ensure calls reuse the bound runtime (concurrency is the caller's WRITE guard)", async () => {
		// The old shared-init-promise dedup is gone: `ensure` may
		// dispose a live runtime on rebind, so it runs under the chain WRITE
		// guard — per-key concurrency is impossible by contract, and the
		// second caller simply finds the runtime already bound.
		const { factory, creations } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		const a = await registry.ensure(network("p1", 1))
		const b = await registry.ensure(network("p1", 1))
		expect(a).toBe(b)
		expect(creations.length).toBe(1)
	})

	test("different profileId produces separate runtimes even for same chainId", async () => {
		const { factory, creations } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		const r1 = await registry.ensure(network("p1", 1))
		const r2 = await registry.ensure(network("p2", 1))
		expect(r1).not.toBe(r2)
		expect(creations.length).toBe(2)
	})

	test("an edited endpoint list disposes the old runtime and creates a new one", async () => {
		const { factory, creations } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		const r1 = await registry.ensure(network("p1", 1, "https://a"))
		const r2 = await registry.ensure(network("p1", 1, "https://a", "https://b"))
		expect(r1).not.toBe(r2)
		expect(creations.map((c) => c.network.endpoints.map((e) => e.rpcUrl))).toEqual([["https://a"], ["https://a", "https://b"]])
		expect(creations[0].stop).toHaveBeenCalledTimes(1)
		expect(creations[1].stop).not.toHaveBeenCalled()
	})

	test("the runtime takes a network's endpoints primary first, then the rest as stored, labels left out", async () => {
		const { factory, creations } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		const row = {
			id: "n",
			profileId: "p1",
			chainId: 1,
			l1ChainId: 1,
			name: "Alpha",
			primaryEndpointId: "c",
			endpoints: [
				{ id: "a", rpcUrl: "https://a", label: "First" },
				{ id: "b", rpcUrl: "https://b" },
				{ id: "c", rpcUrl: "https://c" },
			],
		}
		await registry.ensure(networkInfoFrom(row))
		expect(creations[0]?.network.endpoints).toEqual([
			{ id: "c", rpcUrl: "https://c" },
			{ id: "a", rpcUrl: "https://a" },
			{ id: "b", rpcUrl: "https://b" },
		])
		// A new primary reorders the list, which rebuilds the runtime once.
		await registry.ensure(networkInfoFrom({ ...row, primaryEndpointId: "a" }))
		expect(creations).toHaveLength(2)
		await registry.ensure(networkInfoFrom({ ...row, primaryEndpointId: "a", name: "Renamed" }))
		expect(creations).toHaveLength(2)
	})

	test("peek does not initialize; returns undefined before ensure", () => {
		const { factory } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		expect(registry.peek("p1", 1)).toBeUndefined()
	})

	test("peek returns initialized runtime after ensure", async () => {
		const { factory } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		const r = await registry.ensure(network("p1", 1))
		expect(registry.peek("p1", 1)).toBe(r)
	})

	test("clear disposes all runtimes", async () => {
		const { factory, creations } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		await registry.ensure(network("p1", 1))
		await registry.ensure(network("p1", 2))
		await registry.ensure(network("p2", 1))
		await registry.clear()
		expect(registry.peek("p1", 1)).toBeUndefined()
		expect(registry.peek("p1", 2)).toBeUndefined()
		expect(registry.peek("p2", 1)).toBeUndefined()
		for (const c of creations) {
			expect(c.stop).toHaveBeenCalledTimes(1)
		}
	})

	test("factory failure leaves no binding, so a retry re-invokes the factory", async () => {
		let callCount = 0
		const factory: PxeFactory = {
			async createChainRuntime(net) {
				callCount++
				if (callCount === 1) throw new Error("first call fails")
				const { pxe } = makePxe("ok")
				return new ChainRuntime(net.chainId, {} as never, pxe, endpointsKey(net.endpoints))
			},
		}
		const registry = new ChainRuntimeRegistry(factory)
		await expect(registry.ensure(network("p1", 1))).rejects.toThrow("first call fails")
		const r = await registry.ensure(network("p1", 1))
		expect(r).toBeDefined()
		expect(callCount).toBe(2)
	})

	test("clear after ensure: subsequent ensure re-creates", async () => {
		const { factory, creations } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		const r1 = await registry.ensure(network("p1", 1))
		await registry.clear()
		const r2 = await registry.ensure(network("p1", 1))
		expect(r1).not.toBe(r2)
		expect(creations.length).toBe(2)
		expect(creations[0].stop).toHaveBeenCalledTimes(1)
	})

	test("disposeProfile only disposes runtimes for the named profile", async () => {
		const { factory, creations } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		const p1c1 = await registry.ensure(network("p1", 1))
		const p1c2 = await registry.ensure(network("p1", 2))
		const p2c1 = await registry.ensure(network("p2", 1))

		await registry.disposeProfile("p1")

		// p1's runtimes are gone, p2's is intact.
		expect(registry.peek("p1", 1)).toBeUndefined()
		expect(registry.peek("p1", 2)).toBeUndefined()
		expect(registry.peek("p2", 1)).toBe(p2c1)

		// p1's pxes were stopped, p2's was not.
		const p1c1Stop = creations.find((c) => c.runtime === p1c1)?.stop
		const p1c2Stop = creations.find((c) => c.runtime === p1c2)?.stop
		const p2c1Stop = creations.find((c) => c.runtime === p2c1)?.stop
		expect(p1c1Stop).toHaveBeenCalledTimes(1)
		expect(p1c2Stop).toHaveBeenCalledTimes(1)
		expect(p2c1Stop).not.toHaveBeenCalled()
	})

	test("disposeProfile is a no-op for a profile with no runtimes", async () => {
		const { factory, creations } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		await registry.ensure(network("p1", 1))
		await registry.disposeProfile("p99")
		expect(registry.peek("p1", 1)).toBeDefined()
		expect(creations[0].stop).not.toHaveBeenCalled()
	})

	test("disposeProfile then ensure re-creates the runtime", async () => {
		const { factory, creations } = makeFactory()
		const registry = new ChainRuntimeRegistry(factory)
		const r1 = await registry.ensure(network("p1", 1))
		await registry.disposeProfile("p1")
		const r2 = await registry.ensure(network("p1", 1))
		expect(r1).not.toBe(r2)
		expect(creations.length).toBe(2)
		expect(creations[0].stop).toHaveBeenCalledTimes(1)
	})
})
