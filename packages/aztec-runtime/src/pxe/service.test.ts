/**
 * Cascade contract for `PxeService.getContractInstance`:
 *
 *   pxe.getContractInstance → (if missing) node.getContract → (if missing) known-bundle
 *
 * The `nodeBestEffort` opt softens ONLY the node leg: a transient node throw
 * becomes "not found at node" and the cascade continues to the known-bundle
 * fallback. Without the opt, the node throw propagates. The known-bundle leg's
 * own failures (e.g. a broken `ensureKnown`) MUST still propagate either way.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Both `known-artifacts.ts` and `note-schemas.ts` pull JSON via vite-only
// aliases (`@wonderland-token-artifact` etc.) that don't resolve in a plain
// vitest run. The cascade tests never reach the loaders, but the loader-return
// shape must match `KnownArtifacts` exactly — a wrong shape would let a future
// caller path silently misbehave during a test that DID exercise it.
vi.mock("./known-artifacts", () => ({
	loadProductionKnownArtifacts: async () => ({ artifacts: new Map(), instances: new Map() }),
}))
vi.mock("./note-schemas", () => ({
	loadProductionNoteSchemas: async () => new Map<string, unknown>(),
}))
// The OPFS removals are the erase's and the purge's only storage steps; each resolves unless a
// test scripts it.
const opfs = vi.hoisted(() => ({
	removeChainStoreDir: vi.fn(async (_coords: { profileId: string; chainId: number }) => {}),
	removeProfileStoreDirs: vi.fn(async (_profileId: string) => {}),
}))
vi.mock("./opfs-store", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	removeChainStoreDir: (coords: { profileId: string; chainId: number }) => opfs.removeChainStoreDir(coords),
	removeProfileStoreDirs: (profileId: string) => opfs.removeProfileStoreDirs(profileId),
}))

import type { PXE } from "@aztec-labs/pxe/client/bundle"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import type { ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import type { ILogger } from "@nulo/wallet-core/logger"
import type { ReadWriteGuard } from "@nulo/wallet-core/utils"
import { makeFetchWithTimeout, type RetryOptions } from "../utils/fetch"
import { ChainRuntime, type NetworkInfo, type PxeFactory } from "./chain-runtime"
import { StoreErasedError } from "./lifecycle-coordinator"
import { PxeService, type IProfileReader } from "./service"
import { PXE_NOT_SYNCED_DIAGNOSTIC } from "./stale-anchor"
import { LogLevel } from "@nulo/wallet-core/logger"

const noopLogger: ILogger = { log: () => {} }

beforeEach(() => {
	opfs.removeChainStoreDir.mockReset()
	opfs.removeProfileStoreDirs.mockReset()
})

const noopProfiles: IProfileReader = {
	connect: async () => {},
	getProfiles: async () => [],
}

const network: NetworkInfo = { profileId: "p1", chainId: 31337, rpcUrl: "http://localhost:8080" }

// `AztecAddress.schema` is a wire schema — it accepts hex strings or buffers,
// not instances. Pass a hex string and let the function-under-test hydrate it.
const addressHex = "0x000000000000000000000000000000000000000000000000000000000000ab12"
const address = addressHex as unknown as AztecAddress

function makeFactory(opts: {
	pxeInstance?: ContractInstanceWithAddress
	nodeBehavior: "returns-undefined" | "returns-instance" | "throws"
	nodeInstance?: ContractInstanceWithAddress
}): { factory: PxeFactory; nodeCalls: number; pxeCalls: number } {
	let nodeCalls = 0
	let pxeCalls = 0
	const factory: PxeFactory = {
		createChainRuntime: async (n) => {
			const pxe = {
				getContractInstance: async () => {
					pxeCalls++
					return opts.pxeInstance
				},
			} as unknown as PXE
			const node = {
				getContract: async () => {
					nodeCalls++
					if (opts.nodeBehavior === "throws") throw new Error("RPC timeout")
					if (opts.nodeBehavior === "returns-instance") return opts.nodeInstance
					return undefined
				},
			} as unknown as AztecNode
			return new ChainRuntime(n.chainId, node, pxe, n.rpcUrl)
		},
	}
	return {
		factory,
		get nodeCalls() {
			return nodeCalls
		},
		get pxeCalls() {
			return pxeCalls
		},
	}
}

function makeService(factory: PxeFactory): PxeService {
	const service = new PxeService(noopProfiles, noopLogger, factory)
	// Bypass Service<Methods>.start() — getContractInstance doesn't touch
	// any state that init() would set up. Mirrors the pattern in
	// extension/.../execution/feesettings-invariant.test.ts.
	;(service as unknown as { initialized: boolean }).initialized = true
	return service
}

describe("PxeService.getContractInstance cascade", () => {
	beforeEach(() => {
		// `Service` constructor calls `chrome.runtime.onMessage.addListener`;
		// `aztec-runtime` has no chrome stub at the package level, so stub here.
		vi.stubGlobal("chrome", {
			runtime: {
				onMessage: { addListener: () => {}, removeListener: () => {} },
				sendMessage: () => Promise.resolve(),
			},
		})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	test("nodeBestEffort: true + node throws + no known instance → returns undefined (no rethrow)", async () => {
		const f = makeFactory({ nodeBehavior: "throws" })
		const service = makeService(f.factory)
		// Stub the known-bundle so the cascade's local fallback returns nothing.
		;(service as unknown as { artifacts: { ensureKnown: () => Promise<void>; getKnownInstance: (a: string) => undefined } }).artifacts =
			{
				ensureKnown: async () => {},
				getKnownInstance: () => undefined,
			}

		const result = await service.getContractInstance(network, address, { nodeBestEffort: true })

		expect(result).toBeUndefined()
		expect(f.pxeCalls).toBe(1)
		expect(f.nodeCalls).toBe(1)
	})

	test("nodeBestEffort: false (default) + node throws → rethrows the node error", async () => {
		const f = makeFactory({ nodeBehavior: "throws" })
		const service = makeService(f.factory)

		await expect(service.getContractInstance(network, address)).rejects.toThrow("RPC timeout")
		expect(f.pxeCalls).toBe(1)
		expect(f.nodeCalls).toBe(1)
	})

	test("nodeBestEffort: true + node throws + known-bundle hit → returns the known instance", async () => {
		const knownInstance = { address: { toString: () => "known" } } as unknown as ContractInstanceWithAddress
		const f = makeFactory({ nodeBehavior: "throws" })
		const service = makeService(f.factory)
		;(
			service as unknown as {
				artifacts: { ensureKnown: () => Promise<void>; getKnownInstance: (a: string) => ContractInstanceWithAddress }
			}
		).artifacts = {
			ensureKnown: async () => {},
			getKnownInstance: () => knownInstance,
		}

		const result = await service.getContractInstance(network, address, { nodeBestEffort: true })

		expect(result).toBe(knownInstance)
		expect(f.pxeCalls).toBe(1)
		expect(f.nodeCalls).toBe(1)
	})

	test("PXE hit short-circuits — node is never called; preimage hydrates current := original", async () => {
		// 5.0.0: the PXE returns the address PREIMAGE. The seam hydrates it through
		// `hydratePreimage`, filling `currentContractClassId` from the original (the documented
		// no-upgrades assumption) — so the returned value is a new object, not the mock itself.
		const originalClassId = { toString: () => "class-original", equals: () => true }
		const pxeInstance = {
			address: { toString: () => "pxe-local" },
			originalContractClassId: originalClassId,
		} as unknown as ContractInstanceWithAddress
		const f = makeFactory({ pxeInstance, nodeBehavior: "throws" })
		const service = makeService(f.factory)

		const result = await service.getContractInstance(network, address)

		expect(result).toEqual({ ...pxeInstance, currentContractClassId: originalClassId })
		expect(result?.currentContractClassId).toBe(originalClassId)
		expect(f.pxeCalls).toBe(1)
		expect(f.nodeCalls).toBe(0)
	})

	test("node hit with an IMMUTABLE contract (current == original) passes through", async () => {
		const classId = { toString: () => "class-a", equals: (o: { toString(): string }) => o.toString() === "class-a" }
		const nodeInstance = {
			address: { toString: () => "node-hit" },
			originalContractClassId: classId,
			currentContractClassId: classId,
		} as unknown as ContractInstanceWithAddress
		const f = makeFactory({ nodeBehavior: "returns-instance", nodeInstance })
		const service = makeService(f.factory)

		const result = await service.getContractInstance(network, address)

		expect(result).toBe(nodeInstance)
		expect(f.nodeCalls).toBe(1)
	})

	test("node hit with an UPGRADED contract (current != original) fails explicitly", async () => {
		// The wallet does not support upgraded contracts: executing against the ORIGINAL
		// artifact would be silently wrong, so the seam rejects at entry (effective-class.ts).
		const original = { toString: () => "class-original", equals: () => false }
		const current = { toString: () => "class-upgraded", equals: (o: { toString(): string }) => o.toString() === "class-upgraded" }
		const nodeInstance = {
			address: { toString: () => "0xupgraded" },
			originalContractClassId: original,
			currentContractClassId: current,
		} as unknown as ContractInstanceWithAddress
		const f = makeFactory({ nodeBehavior: "returns-instance", nodeInstance })
		const service = makeService(f.factory)

		await expect(service.getContractInstance(network, address)).rejects.toThrow(/upgraded/)
		expect(f.nodeCalls).toBe(1)
	})

	test("nodeBestEffort: true does NOT swallow the upgrade rejection into the known-bundle fallback", async () => {
		// The upgrade rejection is a DEFINITIVE node answer, not a hiccup — best-effort must re-throw it
		// (ContractUpgradedError) rather than degrade to a stale known-bundle instance.
		const original = { toString: () => "class-original", equals: () => false }
		const current = { toString: () => "class-upgraded", equals: (o: { toString(): string }) => o.toString() === "class-upgraded" }
		const nodeInstance = {
			address: { toString: () => "0xupgraded" },
			originalContractClassId: original,
			currentContractClassId: current,
		} as unknown as ContractInstanceWithAddress
		const f = makeFactory({ nodeBehavior: "returns-instance", nodeInstance })
		const service = makeService(f.factory)
		// A known-bundle hit is available — the bug would serve THIS instead of throwing.
		const knownInstance = { address: { toString: () => "known" } } as unknown as ContractInstanceWithAddress
		;(
			service as unknown as {
				artifacts: { ensureKnown: () => Promise<void>; getKnownInstance: (a: string) => ContractInstanceWithAddress }
			}
		).artifacts = { ensureKnown: async () => {}, getKnownInstance: () => knownInstance }

		await expect(service.getContractInstance(network, address, { nodeBestEffort: true })).rejects.toThrow(/upgraded/)
	})
})

type ErasureInternals = {
	storeKeys: Map<string, Uint8Array>
	profileLifecycles: Map<string, { current?: { kind: string; gen: string }; dead: Set<string> }>
	profileBarriers: Map<string, unknown>
	getProfileBarrier(profileId: string): ReadWriteGuard
}

async function until(reached: () => boolean): Promise<void> {
	for (let i = 0; i < 500; i++) {
		if (reached()) return
		await Promise.resolve()
	}
	throw new Error("state never reached")
}

function gate(): { promise: Promise<void>; open: () => void } {
	let open: () => void = () => {}
	const promise = new Promise<void>((resolve) => {
		open = resolve
	})
	return { promise, open }
}

/** Counts microtasks from its creation; `watched()` is the first tick `watch` held. */
function tickCounter(watch?: () => boolean) {
	let ticks = 0
	let firstWatched = -1
	const spin = () => {
		ticks++
		if (firstWatched < 0 && watch?.()) firstWatched = ticks
		if (ticks < 500) queueMicrotask(spin)
	}
	queueMicrotask(spin)
	return { now: () => ticks, watched: () => firstWatched }
}

describe("PxeService deletion honesty", () => {
	const calls: string[] = []

	beforeEach(() => {
		calls.length = 0
		vi.stubGlobal("chrome", {
			runtime: { onMessage: { addListener: () => {}, removeListener: () => {} }, sendMessage: () => Promise.resolve() },
		})
		opfs.removeChainStoreDir.mockImplementation(async ({ profileId, chainId }) => {
			calls.push(`removeChainStoreDir:${profileId}/${chainId}`)
		})
		opfs.removeProfileStoreDirs.mockImplementation(async (profileId) => {
			calls.push(`removeProfileStoreDirs:${profileId}`)
		})
	})
	afterEach(() => vi.unstubAllGlobals())

	function makeErasingService(): { service: PxeService; raw: ErasureInternals } {
		const service = makeService(makeFactory({ nodeBehavior: "throws" }).factory)
		;(service as unknown as { registry: unknown }).registry = {
			dispose: async () => {
				calls.push("dispose")
			},
			disposeProfile: async () => {
				calls.push("disposeProfile")
			},
			stopRetries: () => () => {},
		}
		return { service, raw: service as unknown as ErasureInternals }
	}

	test("clearChainState disposes the runtime, then removes the chain's OPFS store", async () => {
		await makeErasingService().service.clearChainState("p1", 1)
		expect(calls).toEqual(["dispose", "removeChainStoreDir:p1/1"])
	})

	test("clearProfileState disposes, crypto-erases, then removes the OPFS tree; the generation dies and the barrier goes", async () => {
		const { service, raw } = makeErasingService()
		raw.storeKeys.set("p1", new Uint8Array(32))
		raw.storeKeys.set("p2", new Uint8Array(32))
		let p1KeyAtRemoval: boolean | undefined
		opfs.removeProfileStoreDirs.mockImplementation(async (profileId) => {
			calls.push(`removeProfileStoreDirs:${profileId}`)
			p1KeyAtRemoval = raw.storeKeys.has("p1")
		})
		await service.clearProfileState("p1", "gen-1")
		expect(calls).toEqual(["disposeProfile", "removeProfileStoreDirs:p1"])
		expect(p1KeyAtRemoval).toBe(false)
		expect(raw.storeKeys.has("p2")).toBe(true)
		expect(raw.profileLifecycles.get("p1")).toEqual({ dead: new Set(["gen-1"]) })
		expect(raw.profileBarriers.has("p1")).toBe(false)
	})

	test("a rejecting OPFS removal fails the erase; the profile stays fenced and its barrier unlocked", async () => {
		const { service, raw } = makeErasingService()
		const boom = new Error("opfs down")
		opfs.removeProfileStoreDirs.mockRejectedValue(boom)
		await expect(service.clearProfileState("p1", "gen-1")).rejects.toBe(boom)
		expect(raw.profileLifecycles.get("p1")).toEqual({ current: { kind: "deleting", gen: "gen-1" }, dead: new Set() })
		expect(raw.profileBarriers.has("p1")).toBe(true)
		await expect(raw.getProfileBarrier("p1").read(async () => "read ran")).resolves.toBe("read ran")
	})

	test("clearProfileState RETAINS the profile barrier on erase failure, then drops it on a successful retry", async () => {
		const service = makeService(makeFactory({ nodeBehavior: "throws" }).factory)
		const barriers = (service as unknown as { profileBarriers: Map<string, unknown> }).profileBarriers
		let disposeShouldFail = true
		;(service as unknown as { registry: unknown }).registry = {
			disposeProfile: async () => {
				if (disposeShouldFail) throw new AggregateError([new Error("close failed")], "dispose failed")
			},
			stopRetries: () => () => {},
		}

		// Failed erase: rejects AND keeps the barrier entry so the profile stays fenced for a retry.
		await expect(service.clearProfileState("p1", "gen-1")).rejects.toBeInstanceOf(AggregateError)
		expect(barriers.has("p1")).toBe(true)

		// Same-gen retry now succeeds → the barrier is dropped (the profile is gone).
		disposeShouldFail = false
		await service.clearProfileState("p1", "gen-1")
		expect(barriers.has("p1")).toBe(false)
	})

	test("await shape: the generation dies and a queued barrier read runs fixed ticks after the OPFS removal settles", async () => {
		const { service, raw } = makeErasingService()
		const removal = gate()
		opfs.removeProfileStoreDirs.mockImplementation(() => removal.promise)
		const run = service.clearProfileState("p1", "gen-1")
		await until(() => opfs.removeProfileStoreDirs.mock.calls.length === 1)
		let readAt = -1
		const counter = tickCounter(() => raw.profileLifecycles.get("p1")?.dead.has("gen-1") === true)
		const read = raw.getProfileBarrier("p1").read(async () => {
			readAt = counter.now()
		})
		removal.open()
		await run
		await read
		expect({ deletedAt: counter.watched(), readAt }).toEqual({ deletedAt: 2, readAt: 2 })
	})

	test("await shape: clearChainState settles fixed ticks after its OPFS removal settles", async () => {
		const removal = gate()
		opfs.removeChainStoreDir.mockImplementation(() => removal.promise)
		const run = makeErasingService().service.clearChainState("p1", 1)
		await until(() => opfs.removeChainStoreDir.mock.calls.length === 1)
		const counter = tickCounter()
		let settledAt = -1
		run.then(() => {
			settledAt = counter.now()
		})
		removal.open()
		await run
		await Promise.resolve()
		expect(settledAt).toBe(6)
	})
})

describe("PxeService op-failure log classification", () => {
	beforeEach(() => {
		vi.stubGlobal("chrome", {
			runtime: {
				onMessage: { addListener: () => {}, removeListener: () => {} },
				sendMessage: () => Promise.resolve(),
			},
		})
	})
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	function makeSpyLoggerService(factory: PxeFactory) {
		const calls: unknown[][] = []
		const logger: ILogger = {
			log: (...args: unknown[]) => {
				calls.push(args)
			},
		}
		const service = new PxeService(noopProfiles, logger, factory)
		;(service as unknown as { initialized: boolean }).initialized = true
		return { service, calls }
	}
	const errorCalls = (calls: unknown[][]) => calls.filter((c) => c[1] === LogLevel.Error)

	test("PXE_STORE_KEY_MISSING logs at DEBUG, not error — the client's re-provision retry is the designed recovery", async () => {
		// The cold-start shape: first profile-scoped op after an offscreen boot,
		// before the SW has (re)provisioned the in-memory store key. Three of
		// these painted error-level lines on every fresh unlock.
		const factory: PxeFactory = {
			createChainRuntime: async () => {
				throw new Error("PXE_STORE_KEY_MISSING: no store key provisioned for profile p1")
			},
		}
		const { service, calls } = makeSpyLoggerService(factory)
		await expect(service.getContractInstance(network, address)).rejects.toThrow(/PXE_STORE_KEY_MISSING/)
		expect(errorCalls(calls)).toEqual([])
		expect(calls.some((c) => c[1] === LogLevel.Debug && String(c[2]).includes("pre-provision miss"))).toBe(true)
	})

	test("a fresh PXE's not-synced refusal of getSyncedBlockHeader logs at DEBUG: both callers answer from elsewhere", async () => {
		const factory: PxeFactory = {
			createChainRuntime: async (n) => {
				const pxe = {
					getSyncedBlockHeader: async () => {
						throw new Error(PXE_NOT_SYNCED_DIAGNOSTIC)
					},
				} as unknown as PXE
				return new ChainRuntime(n.chainId, {} as AztecNode, pxe, n.rpcUrl)
			},
		}
		const { service, calls } = makeSpyLoggerService(factory)
		await expect(service.getSyncedBlockHeader(network)).rejects.toThrow(PXE_NOT_SYNCED_DIAGNOSTIC)
		expect(errorCalls(calls)).toEqual([])
		expect(calls.some((c) => c[1] === LogLevel.Debug && String(c[2]).includes("refused before the PXE's first sync"))).toBe(true)
	})

	test("the not-synced text on any other op still logs at ERROR", async () => {
		const factory: PxeFactory = {
			createChainRuntime: async () => {
				throw new Error(PXE_NOT_SYNCED_DIAGNOSTIC)
			},
		}
		const { service, calls } = makeSpyLoggerService(factory)
		await expect(service.getContractInstance(network, address)).rejects.toThrow(PXE_NOT_SYNCED_DIAGNOSTIC)
		expect(errorCalls(calls).filter((c) => / failed after \d+ms$/.test(String(c[2])))).toHaveLength(1)
	})

	test("a store a purge or an erase ended under the op logs at DEBUG: its caller's context went with it", async () => {
		const factory: PxeFactory = {
			createChainRuntime: async () => {
				throw new StoreErasedError("getContractInstance: chain was purged mid-operation — refusing to re-create its runtime/store")
			},
		}
		const { service, calls } = makeSpyLoggerService(factory)
		await expect(service.getContractInstance(network, address)).rejects.toBeInstanceOf(StoreErasedError)
		expect(errorCalls(calls)).toEqual([])
		expect(calls.some((c) => c[1] === LogLevel.Debug && String(c[2]).includes("ended the store it captured"))).toBe(true)
	})

	test("any OTHER op failure still logs at ERROR (the downgrade is marker-scoped)", async () => {
		const exploded = new Error("store exploded")
		const factory: PxeFactory = {
			createChainRuntime: async () => {
				throw exploded
			},
		}
		const { service, calls } = makeSpyLoggerService(factory)
		await expect(service.getContractInstance(network, address)).rejects.toThrow("store exploded")
		expect(errorCalls(calls).length).toBeGreaterThan(0)
		const opFailure = errorCalls(calls).filter((c) => / failed after \d+ms$/.test(String(c[2])))
		expect(opFailure.map((c) => c.slice(3))).toEqual([[{ error: exploded }]])
	})
})

describe("PxeService.getLatestBlockNumber", () => {
	beforeEach(() => {
		vi.stubGlobal("chrome", {
			runtime: { onMessage: { addListener: () => {}, removeListener: () => {} }, sendMessage: () => Promise.resolve() },
		})
	})
	afterEach(() => vi.unstubAllGlobals())

	test("serves the node's untagged block number", async () => {
		const tags: unknown[] = []
		const factory: PxeFactory = {
			createChainRuntime: async (n) => {
				const node = {
					getBlockNumber: async (...args: unknown[]) => {
						tags.push(...args)
						return 4242
					},
				} as unknown as AztecNode
				return new ChainRuntime(n.chainId, node, {} as PXE, n.rpcUrl)
			},
		}
		await expect(makeService(factory).getLatestBlockNumber(network)).resolves.toBe(4242)
		expect(tags).toEqual([])
	})
})

describe("PxeService teardown against an unreachable node", () => {
	type Clear = (service: PxeService) => Promise<void>
	const CLEARS: Array<{ name: string; clear: Clear }> = [
		{ name: "clearChainState", clear: (service) => service.clearChainState(network.profileId, network.chainId) },
		{ name: "clearProfileState", clear: (service) => service.clearProfileState(network.profileId, "gen-1") },
	]

	let attempts = 0
	let answer: ((blockNumber: number) => void) | undefined
	let retryWhile: (() => boolean) | undefined

	beforeEach(() => {
		attempts = 0
		answer = undefined
		vi.stubGlobal("chrome", {
			runtime: { onMessage: { addListener: () => {}, removeListener: () => {} }, sendMessage: () => Promise.resolve() },
		})
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				attempts++
				throw new TypeError(`refused #${attempts}`)
			}),
		)
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	/** A runtime whose node goes through the production retrying fetch, or answers when told to. */
	function serviceWithNode(kind: "refusing" | "answering"): PxeService {
		const factory: PxeFactory = {
			createChainRuntime: async (n, _storeKey, retries?: RetryOptions) => {
				retryWhile = retries?.retryWhile
				const fetchBlock = makeFetchWithTimeout(60_000, retries)
				const node = {
					getBlockNumber: () =>
						kind === "refusing"
							? fetchBlock(n.rpcUrl, {}).then(() => 0)
							: new Promise<number>((resolve) => {
									answer = resolve
								}),
				} as unknown as AztecNode
				return new ChainRuntime(n.chainId, node, {} as PXE, n.rpcUrl)
			},
		}
		return makeService(factory)
	}

	function track(promise: Promise<unknown>): { settled: () => boolean; outcome: Promise<unknown> } {
		let settled = false
		const outcome = promise.then(
			(value) => value,
			(error: unknown) => error,
		)
		void outcome.finally(() => {
			settled = true
		})
		return { settled: () => settled, outcome }
	}

	test.each(CLEARS)("$name settles inside the running backoff sleep of an op holding the guard", async ({ clear }) => {
		const service = serviceWithNode("refusing")
		const op = track(service.getLatestBlockNumber(network))
		await vi.advanceTimersByTimeAsync(0)
		expect(attempts).toBe(1)

		const cleared = track(clear(service))
		await vi.advanceTimersByTimeAsync(1_000)
		expect(cleared.settled()).toBe(true)
		expect(await cleared.outcome).toBeUndefined()
		expect(((await op.outcome) as Error).message).toContain("refused #1")
		expect(attempts).toBe(1)
	})

	test.each(CLEARS)("$name still waits for an op whose node answers, which completes", async ({ clear }) => {
		const service = serviceWithNode("answering")
		const op = track(service.getLatestBlockNumber(network))
		await vi.advanceTimersByTimeAsync(0)

		const cleared = track(clear(service))
		await vi.advanceTimersByTimeAsync(10_000)
		expect(cleared.settled()).toBe(false)

		answer?.(7)
		expect(await op.outcome).toBe(7)
		expect(await cleared.outcome).toBeUndefined()
	})

	test.each(CLEARS)("$name holds the stop for its whole call and releases it when it rejects", async ({ clear }) => {
		const service = serviceWithNode("answering")
		const op = track(service.getLatestBlockNumber(network))
		await vi.advanceTimersByTimeAsync(0)
		const opfsDown = new Error("opfs down")
		opfs.removeChainStoreDir.mockRejectedValue(opfsDown)
		opfs.removeProfileStoreDirs.mockRejectedValue(opfsDown)

		const cleared = track(clear(service))
		await vi.advanceTimersByTimeAsync(0)
		expect(retryWhile?.()).toBe(false)

		answer?.(7)
		await op.outcome
		expect(await cleared.outcome).toBe(opfsDown)
		expect(retryWhile?.()).toBe(true)
	})

	test("a clearProfileState refused for its generation, or for an erased one, raises no stop", async () => {
		const service = serviceWithNode("answering")
		await vi.advanceTimersByTimeAsync(0)
		const registry = (service as unknown as { registry: { stopRetries: (profileId: string) => () => void } }).registry
		const stopRetries = vi.spyOn(registry, "stopRetries")

		await service.clearProfileState(network.profileId, "gen-1")
		expect(stopRetries).toHaveBeenCalledTimes(1)
		await service.clearProfileState(network.profileId, "gen-1")
		expect(stopRetries).toHaveBeenCalledTimes(1)

		opfs.removeProfileStoreDirs.mockRejectedValue(new Error("opfs down"))
		await expect(service.clearProfileState(network.profileId, "gen-2")).rejects.toThrow("opfs down")
		expect(stopRetries).toHaveBeenCalledTimes(2)
		await expect(service.clearProfileState(network.profileId, "gen-3")).rejects.toThrow("generation mismatch")
		expect(stopRetries).toHaveBeenCalledTimes(2)
	})
})
