import { BlockHash } from "@aztec-labs/stdlib/block"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { TxHash } from "@aztec-labs/stdlib/tx"
import { walletChainId } from "@nulo/wallet-core/chain-id"
import { describe, expect, test, vi } from "vitest"
import { type TransportFailure, withTransportFailure } from "../utils/fetch"
import { ROUTE_TIMING } from "./endpoint-health"
import { createSubmissionPins, type RouteSpec, type RoutedNode, routeNode, type SubmissionPins } from "./routed-node"

const L1 = 11_155_111
const ROLLUP_VERSION = 4
const CHAIN_ID = walletChainId(L1, ROLLUP_VERSION)
const ROLLUP = `0x${"11".repeat(20)}`
const TX = TxHash.fromString(`0x0${"ab".repeat(31)}b`)
const ANCHOR = `0x${"0c".repeat(32)}`
const { callTimeoutMs, probeTimeoutMs, holdDownMinMs } = ROUTE_TIMING

/** The error a node client's caller sees when the request failed in transport: the SDK puts the
 *  fetch's tagged error in `cause.data`. */
function transport(kind: TransportFailure): Error {
	const fetchError = withTransportFailure(new Error(`fetch ${kind}`), kind)
	return new Error(fetchError.message, { cause: { code: -32000, data: fetchError, message: fetchError.message } })
}

/** The error a caller sees for one entry the server answered with `code`. */
const entryError = (code: number) => new Error(`entry ${code}`, { cause: { code, message: `entry ${code}` } })

type Failure = Error | undefined
interface FakeEndpoint {
	tip: number
	l1ChainId: number
	rollupVersion: number
	rollupAddress: string
	knownBlocks: Set<string>
	receipts: Map<string, { status: string }>
	/** The error the endpoint answers `method` with, if any. */
	fail: (method: string, timeoutMs: number) => Failure
	/** A promise the endpoint holds `method` on, if any. */
	hold?: (method: string) => Promise<void> | undefined
}

interface Request {
	url: string
	method: string
	timeoutMs: number
}

class Harness {
	public now = 0
	public readonly sleeps: number[] = []
	/** Deadlines a caller set; `advance` settles the ones it passes. */
	private readonly timers: { at: number; fire: () => void }[] = []
	public readonly requests: Request[] = []
	public readonly endpoints = new Map<string, FakeEndpoint>()
	public retryWhile: () => boolean = () => true
	public onSleep: () => Promise<unknown> | undefined = () => undefined
	/** Flags a test's injected race sets. */
	public stopped = false
	public raised = false
	public node!: RoutedNode

	public constructor(
		urls: readonly string[],
		options: { chainId?: number; l1ChainId?: number; rollupAddress?: string; pins?: SubmissionPins } = {},
	) {
		for (const url of urls) this.add(url)
		this.build(urls, options)
	}

	public add(url: string): FakeEndpoint {
		const endpoint: FakeEndpoint = {
			tip: 10,
			l1ChainId: L1,
			rollupVersion: ROLLUP_VERSION,
			rollupAddress: ROLLUP,
			knownBlocks: new Set([ANCHOR]),
			receipts: new Map(),
			fail: () => undefined,
		}
		this.endpoints.set(url, endpoint)
		return endpoint
	}

	public build(
		urls: readonly string[],
		{
			chainId = CHAIN_ID,
			l1ChainId = L1,
			rollupAddress,
			pins,
		}: { chainId?: number; l1ChainId?: number; rollupAddress?: string; pins?: SubmissionPins },
	): void {
		const spec: RouteSpec = { chainId, l1ChainId, endpoints: urls.map((rpcUrl, i) => ({ id: `e${i}`, rpcUrl })), rollupAddress }
		this.node = routeNode((url, timeoutMs) => this.client(url, timeoutMs), spec, {
			now: () => this.now,
			sleep: async (ms) => {
				this.sleeps.push(ms)
				this.now += ms
				await this.onSleep()
			},
			timer: (ms) => {
				let fire = () => {}
				const expired = new Promise<void>((resolve) => {
					fire = resolve
				})
				const entry = { at: this.now + ms, fire }
				this.timers.push(entry)
				const cancel = () => {
					const at = this.timers.indexOf(entry)
					if (at >= 0) this.timers.splice(at, 1)
				}
				return { expired, cancel }
			},
			log: () => {},
			retryWhile: () => this.retryWhile(),
			pins,
		})
	}

	/** Moves the clock and settles every deadline it reaches. */
	public advance(ms: number): void {
		this.now += ms
		for (const timer of this.timers.filter((t) => t.at <= this.now)) timer.fire()
	}

	public endpoint(url: string): FakeEndpoint {
		const endpoint = this.endpoints.get(url)
		if (!endpoint) throw new Error(`no fake endpoint ${url}`)
		return endpoint
	}

	/** The requests `url` received, as `method@timeout`. */
	public seen(url: string): string[] {
		return this.requests.filter((r) => r.url === url).map((r) => `${r.method}@${r.timeoutMs}`)
	}

	private client(url: string, timeoutMs: number): AztecNode {
		const answer = async (method: string, args: unknown[]): Promise<unknown> => {
			this.requests.push({ url, method, timeoutMs })
			const endpoint = this.endpoint(url)
			await endpoint.hold?.(method)
			const failure = endpoint.fail(method, timeoutMs)
			if (failure) throw failure
			return this.answer(endpoint, method, args)
		}
		return new Proxy({} as AztecNode, {
			get: (_t, method) => (typeof method === "string" ? (...args: unknown[]) => answer(method, args) : undefined),
		})
	}

	private answer(endpoint: FakeEndpoint, method: string, args: unknown[]): unknown {
		switch (method) {
			case "getNodeInfo":
				return {
					l1ChainId: endpoint.l1ChainId,
					rollupVersion: endpoint.rollupVersion,
					l1ContractAddresses: { rollupAddress: { toString: () => endpoint.rollupAddress } },
				}
			case "getChainTips":
				return { proposed: { number: endpoint.tip }, checkpointed: { block: { number: endpoint.tip } } }
			case "getBlockNumber":
				return endpoint.tip
			case "getBlockData":
				return endpoint.knownBlocks.has(String(args[0])) ? { header: {} } : undefined
			case "getTxReceipt":
				return endpoint.receipts.get(String(args[0])) ?? { status: "pending" }
			default:
				return `${method}:ok`
		}
	}
}

const A = "https://a.example"
const B = "https://b.example"
const C = "https://c.example"
const call = (h: Harness) => h.node.getContract(undefined as never)

describe("routing calls", () => {
	test("with two or more endpoints the primary is probed before its first call, then serves it", async () => {
		const h = new Harness([A, B])
		await expect(call(h)).resolves.toBe("getContract:ok")
		expect(h.seen(A)).toEqual([`getNodeInfo@${probeTimeoutMs}`, `getChainTips@${probeTimeoutMs}`, `getContract@${callTimeoutMs}`])
		expect(h.seen(B)).toEqual([])
		expect(h.node.route.active()?.id).toBe("e0")
	})

	test("a call failing on the active endpoint moves to the next at once, and the half-dead primary keeps the role", async () => {
		const h = new Harness([A, B])
		await call(h)
		h.endpoint(A).fail = (m) => (m === "getContract" ? transport("server") : undefined)
		await expect(call(h)).resolves.toBe("getContract:ok")
		expect(h.seen(B)).toEqual([`getNodeInfo@${probeTimeoutMs}`, `getChainTips@${probeTimeoutMs}`, `getContract@${callTimeoutMs}`])
		expect(h.sleeps).toEqual([])
		expect(h.node.route.active()?.id).toBe("e0")
		expect(h.node.route.snapshot().map((e) => e.state)).toEqual(["ready", "ready"])
	})

	test("reads by hash move like any other call", async () => {
		const h = new Harness([A, B])
		await call(h)
		h.endpoint(A).fail = (m) => (m === "getBlock" || m === "getBlockData" ? transport("unreachable") : undefined)
		const hash = BlockHash.fromString(ANCHOR)
		await h.node.getBlock({ hash })
		await h.node.getBlockData(hash)
		expect(h.seen(B).filter((r) => r.startsWith("getBlock"))).toEqual([`getBlock@${callTimeoutMs}`, `getBlockData@${callTimeoutMs}`])
		expect(h.node.route.active()?.id).toBe("e0")
	})

	test("an overloaded or refused endpoint is spent for the call, which ends once every endpoint is spent; neither goes down", async () => {
		const h = new Harness([A, B])
		await call(h)
		h.endpoint(A).fail = (m) => (m === "getContract" ? transport("overloaded") : undefined)
		h.endpoint(B).fail = (m) => (m === "getContract" ? entryError(31) : undefined)
		await expect(call(h)).rejects.toThrow("entry 31")
		expect(h.seen(A).filter((r) => r.startsWith("getContract"))).toHaveLength(2)
		expect(h.seen(B).filter((r) => r.startsWith("getContract"))).toHaveLength(1)
		expect(h.sleeps).toEqual([])
		expect(h.node.route.snapshot().map((e) => e.state)).toEqual(["ready", "ready"])
	})

	test("the node's own answer (a reserved code) ends the call where it is", async () => {
		const h = new Harness([A, B])
		await call(h)
		h.endpoint(A).fail = (m) => (m === "getContract" ? entryError(-32602) : undefined)
		await expect(call(h)).rejects.toThrow("entry -32602")
		expect(h.seen(B)).toEqual([])
	})

	test("down endpoints are skipped, and when none can take the call its rounds try only the most-preferred", async () => {
		const h = new Harness([A, B])
		await call(h)
		h.endpoint(A).fail = (m) => (m === "getContract" ? transport("server") : undefined)
		await call(h)
		h.endpoint(A).fail = () => transport("server")
		h.endpoint(B).fail = () => transport("timeout")
		const contractReads = (url: string) => h.seen(url).filter((r) => r.startsWith("getContract")).length
		const [fromA, fromB] = [contractReads(A), contractReads(B)]
		await expect(call(h)).rejects.toThrow("fetch server")
		expect(h.node.route.snapshot().map((e) => e.state)).toEqual(["down", "down"])
		expect(contractReads(A) - fromA).toBe(4)
		expect(contractReads(B) - fromB).toBe(1)
		expect(h.sleeps).toEqual([1_000, 2_000, 3_000])
	})

	test("a call never moves to an admitted endpoint the floor has passed, probed again or not", async () => {
		const h = new Harness([A, B])
		await call(h)
		h.endpoint(B).tip = 15
		h.endpoint(A).fail = (m) => (m === "getContract" ? transport("server") : undefined)
		await call(h)
		expect(h.seen(B)).toEqual([`getNodeInfo@${probeTimeoutMs}`, `getChainTips@${probeTimeoutMs}`, `getContract@${callTimeoutMs}`])
		h.endpoint(A).tip = 20
		await h.node.getChainTips()
		h.endpoint(A).fail = (m) => (m === "getContract" ? transport("refused") : undefined)
		await expect(call(h)).rejects.toThrow("fetch refused")
		h.now += ROUTE_TIMING.probeSpacingMs
		await expect(call(h)).rejects.toThrow("fetch refused")
		expect(h.seen(B).slice(3)).toEqual([`getNodeInfo@${probeTimeoutMs}`, `getChainTips@${probeTimeoutMs}`])
		expect(h.node.route.snapshot()[1]?.state).toBe("behind")
	})

	test("a read the freshly admitted primary refuses never moves to an endpoint behind the tip its admission saw", async () => {
		const h = new Harness([A, B])
		h.endpoint(A).tip = 100
		h.endpoint(B).tip = 99
		h.endpoint(A).fail = (m) => (m === "getPublicStorageAt" ? entryError(35) : undefined)
		await expect(h.node.getPublicStorageAt("latest", undefined as never, undefined as never)).rejects.toThrow("entry 35")
		expect(h.seen(B)).toEqual([`getNodeInfo@${probeTimeoutMs}`, `getChainTips@${probeTimeoutMs}`])
		expect(h.node.route.snapshot().map((e) => e.state)).toEqual(["ready", "behind"])
	})

	test("a fallback is admitted while the primary is dead; another chain and another rollup are refused", async () => {
		const h = new Harness([A, B, C, "https://d.example"], { rollupAddress: ROLLUP })
		h.endpoint(A).fail = () => transport("unreachable")
		h.endpoint(B).l1ChainId = 1
		h.endpoint(C).rollupAddress = `0x${"22".repeat(20)}`
		await expect(call(h)).resolves.toBe("getContract:ok")
		expect(h.node.route.snapshot().map((e) => e.state)).toEqual(["unknown", "wrong-chain", "wrong-chain", "ready"])
		expect(h.node.route.active()?.id).toBe("e3")
		expect(
			h
				.seen(B)
				.concat(h.seen(C))
				.every((r) => r.endsWith(`@${probeTimeoutMs}`)),
		).toBe(true)
	})

	test("lazy single-flight return probes: calls keep going to the active endpoint while one probe of the primary runs", async () => {
		const h = new Harness([A, B])
		await call(h)
		h.endpoint(A).fail = () => transport("timeout")
		await call(h)
		expect(h.node.route.active()?.id).toBe("e1")
		h.endpoint(A).fail = () => undefined
		let release: () => void = () => {}
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		h.endpoint(A).hold = (m) => (m === "getNodeInfo" ? held : undefined)
		const before = h.seen(A).length
		h.now += holdDownMinMs
		await Promise.all([call(h), call(h), call(h)])
		expect(h.seen(A).slice(before)).toEqual([`getNodeInfo@${probeTimeoutMs}`, `getChainTips@${probeTimeoutMs}`])
		release()
		await call(h)
		expect(h.node.route.active()?.id).toBe("e1")
	})

	test("chain 0 drops every non-loopback endpoint and keeps the local one alone, with no probe", async () => {
		const local = "http://localhost:8080"
		const h = new Harness([A, local], { chainId: 0, l1ChainId: 31_337 })
		await call(h)
		expect(h.seen(A)).toEqual([])
		expect(h.seen(local)).toEqual([`getContract@${callTimeoutMs}`])
		expect(() => new Harness([A, B], { chainId: 0, l1ChainId: 31_337 })).toThrow()
	})

	test("the node is not thenable, and refuses a submission without a request", async () => {
		const h = new Harness([A, B])
		expect((h.node as unknown as { then?: unknown }).then).toBeUndefined()
		expect(await Promise.resolve(h.node)).toBe(h.node)
		await expect(h.node.sendTx(undefined as never)).rejects.toThrow(/submission/)
		expect(h.requests).toEqual([])
	})

	test("a timeout under a caller's shorter budget counts as one failure: the endpoint keeps serving and the role", async () => {
		const h = new Harness([A, B])
		await call(h)
		h.endpoint(A).fail = (_method, timeoutMs) => (timeoutMs === probeTimeoutMs ? transport("timeout") : undefined)
		const read = () => h.node.route.singleAttempt(probeTimeoutMs).getContract(undefined as never)
		await expect(read()).rejects.toThrow("fetch timeout")
		await expect(read()).rejects.toThrow("fetch timeout")
		expect(h.node.route.snapshot().map((e) => e.state)).toEqual(["ready", "unknown"])
		expect(h.node.route.active()?.id).toBe("e0")
		await expect(read()).rejects.toThrow("fetch timeout")
		expect(h.node.route.snapshot()[0]?.state).toBe("down")
		expect(h.seen(B)).toEqual([])
	})
})

describe("sync reads", () => {
	test("a failed sync read passes the active role and is re-sent there once", async () => {
		const h = new Harness([A, B])
		await h.node.getChainTips()
		h.endpoint(A).fail = (m) => (m === "getChainTips" ? transport("server") : undefined)
		await h.node.getChainTips()
		expect(h.node.route.active()?.id).toBe("e1")
		expect(h.node.route.snapshot()[0]?.state).toBe("ready")
		h.endpoint(B).fail = (m) => (m === "getBlocks" ? transport("server") : undefined)
		h.endpoint(A).fail = (m) => (m === "getBlocks" ? transport("server") : undefined)
		await expect(h.node.getBlocks(1 as never, 1)).rejects.toThrow("fetch server")
		expect(h.seen(B).filter((r) => r.startsWith("getBlocks"))).toHaveLength(1)
		expect(h.seen(A).filter((r) => r.startsWith("getBlocks"))).toHaveLength(1)
		expect(h.sleeps).toEqual([])
	})

	test("a sync read is re-sent to the endpoint its failure handed the role to, never to another that qualified meanwhile", async () => {
		const h = new Harness([A, B, C])
		h.endpoint(B).fail = () => transport("unreachable")
		await h.node.getChainTips()
		h.endpoint(A).fail = (m) => (m === "getContract" ? transport("server") : undefined)
		await call(h)
		expect(h.node.route.snapshot().map((e) => e.state)).toEqual(["ready", "unknown", "ready"])
		h.now += ROUTE_TIMING.probeSpacingMs
		h.endpoint(B).fail = () => undefined
		h.endpoint(B).tip = 20
		h.endpoint(A).fail = (m) => (m === "getChainTips" ? transport("timeout") : undefined)
		await expect(h.node.getChainTips()).resolves.toMatchObject({ proposed: { number: 10 } })
		expect(h.node.route.active()?.id).toBe("e2")
		expect(h.seen(B).filter((r) => r.startsWith("getChainTips@60"))).toEqual([])
	})

	test("a refusal on a sync read passes the role without marking the endpoint down", async () => {
		const h = new Harness([A, B])
		await h.node.getChainTips()
		h.endpoint(A).fail = (m) => (m === "getBlock" ? entryError(35) : undefined)
		await expect(h.node.getBlock(5 as never)).resolves.toBe("getBlock:ok")
		expect(h.node.route.active()?.id).toBe("e1")
		expect(h.node.route.snapshot()[0]?.state).toBe("ready")
	})

	test("with no other qualifying endpoint a failed sync read keeps today's rounds on the active one", async () => {
		const h = new Harness([A, B])
		await h.node.getChainTips()
		h.endpoint(B).l1ChainId = 1
		let failures = 2
		h.endpoint(A).fail = (m) => (m === "getChainTips" && failures-- > 0 ? transport("server") : undefined)
		await expect(h.node.getChainTips()).resolves.toMatchObject({ proposed: { number: 10 } })
		expect(h.sleeps).toEqual([1_000, 2_000])
		expect(h.node.route.active()?.id).toBe("e0")
	})

	test("a sync read's same-endpoint retries stop once another endpoint holds the role", async () => {
		const h = new Harness([A, B])
		await h.node.getChainTips()
		h.endpoint(B).tip = 5
		h.endpoint(A).fail = (m) => (m === "getChainTips" ? transport("timeout") : undefined)
		h.onSleep = async () => {
			h.endpoint(B).tip = 10
			h.now += ROUTE_TIMING.probeSpacingMs
			await h.node.getContract(undefined as never)
		}
		await expect(h.node.getChainTips()).rejects.toThrow("fetch timeout")
		expect(h.node.route.active()?.id).toBe("e1")
		expect(h.seen(A).filter((r) => r.startsWith(`getChainTips@${callTimeoutMs}`))).toHaveLength(2)
	})
})

describe("races", () => {
	const held = () => {
		let release: () => void = () => {}
		const promise = new Promise<void>((resolve) => {
			release = resolve
		})
		return { promise, release }
	}

	test("a sync read's same-endpoint retry never dispatches below a floor another endpoint raised meanwhile", async () => {
		const h = new Harness([A, B])
		await h.node.getChainTips()
		h.endpoint(B).tip = 5
		await h.node.route.pickForSend(TX.toString(), ANCHOR)
		h.endpoint(A).fail = (m) => (m === "getChainTips" ? transport("timeout") : undefined)
		let once = true
		h.onSleep = async () => {
			if (!once) return
			once = false
			h.endpoint(B).tip = 20
			h.now += ROUTE_TIMING.probeSpacingMs
			await h.node.getChainTips()
			h.endpoint(B).fail = () => transport("timeout")
			await h.node.getContract(undefined as never).catch(() => {})
		}
		await expect(h.node.getChainTips()).rejects.toThrow("fetch timeout")
		expect(h.node.route.active()).toBeUndefined()
		expect(h.seen(A).filter((r) => r === `getChainTips@${callTimeoutMs}`)).toHaveLength(2)
	})

	test("singleAttempt reads a pinned receipt only where it was sent", async () => {
		const pins = createSubmissionPins()
		pins.byTxHash.set(TX.toString(), { id: "e1", rpcUrl: B })
		const h = new Harness([A, B], { pins })
		await call(h)
		await h.node.route.singleAttempt(probeTimeoutMs).getTxReceipt(TX)
		expect(h.seen(B)).toEqual([`getTxReceipt@${probeTimeoutMs}`])
		expect(h.seen(A).filter((r) => r.startsWith("getTxReceipt"))).toEqual([])
	})

	test("two picks for one hash racing return the same endpoint", async () => {
		const h = new Harness([A, B])
		const gate = held()
		let blockReads = 0
		h.endpoint(A).hold = (m) => (m === "getBlockData" && blockReads++ === 0 ? gate.promise : undefined)
		const first = h.node.route.pickForSend(TX.toString(), ANCHOR)
		await Promise.resolve()
		h.endpoint(A).knownBlocks.clear()
		const second = await h.node.route.pickForSend(TX.toString(), ANCHOR)
		h.endpoint(A).knownBlocks.add(ANCHOR)
		gate.release()
		expect(second.id).toBe("e1")
		expect((await first).id).toBe("e1")
	})

	test("a stop raised while a moved call's admission probe runs dispatches nothing after it", async () => {
		const h = new Harness([A, B])
		await call(h)
		h.endpoint(A).fail = (m) => (m === "getContract" ? transport("server") : undefined)
		const gate = held()
		let probing: () => void = () => {}
		const probeStarted = new Promise<void>((resolve) => {
			probing = resolve
		})
		h.endpoint(B).hold = (m) => {
			if (m !== "getNodeInfo") return undefined
			probing()
			return gate.promise
		}
		let allowed = true
		h.retryWhile = () => allowed
		const pending = call(h)
		await probeStarted
		allowed = false
		gate.release()
		await expect(pending).rejects.toThrow("fetch server")
		expect(h.seen(B).filter((r) => r.startsWith("getContract"))).toEqual([])
	})

	test("a stopped sync read probes no alternative", async () => {
		const h = new Harness([A, B])
		await h.node.getChainTips()
		h.endpoint(A).fail = (m) => (m === "getChainTips" ? transport("server") : undefined)
		h.retryWhile = () => false
		await expect(h.node.getChainTips()).rejects.toThrow("fetch server")
		expect(h.seen(B)).toEqual([])
	})

	/** Runs `run` once per question `retryWhile` is asked, `act` landing in a microtask queued by that
	 *  question, so it lands after the check and before anything the router awaits next. */
	async function landAfterEachQuestion(questions: number, run: (h: Harness) => Promise<unknown>, act: (h: Harness) => void) {
		for (let k = 1; k <= questions; k++) {
			const pins = createSubmissionPins()
			pins.byTxHash.set(TX.toString(), { id: "e1", rpcUrl: B })
			const h = new Harness([A, B], { pins })
			await call(h)
			h.endpoint(A).fail = (m) => (m === "getContract" ? transport("server") : undefined)
			let asked = 0
			h.retryWhile = () => {
				if (++asked === k) queueMicrotask(() => act(h))
				return h.stopped !== true
			}
			await run(h).catch(() => {})
		}
	}

	test("a stop landing after any question is honoured before the next dispatch", async () => {
		const sentAfterStop: string[] = []
		await landAfterEachQuestion(
			24,
			async (h) => {
				h.endpoint(B).fail = () => transport("server")
				for (const url of [A, B]) h.endpoint(url).hold = (m) => void (h.stopped && sentAfterStop.push(`${url} ${m}`))
				await call(h).catch(() => {})
				h.stopped = false
				await h.node.getTxReceipt(TX)
			},
			(h) => {
				h.stopped = true
			},
		)
		expect(sentAfterStop).toEqual([])
	})

	test("a floor rising after any question keeps the next dispatch off an endpoint below it", async () => {
		const belowFloor: string[] = []
		await landAfterEachQuestion(
			6,
			async (h) => {
				h.endpoint(B).hold = (m) => void (h.raised && m === "getContract" && belowFloor.push(m))
				await call(h)
			},
			(h) => {
				h.raised = true
				h.node.route.seedFloor(20)
			},
		)
		expect(belowFloor).toEqual([])
	})

	test("singleAttempt with no active endpoint admits one first, then makes its one attempt there", async () => {
		const h = new Harness([A, B])
		const read = () => h.node.route.singleAttempt(probeTimeoutMs).getContract(undefined as never)
		await expect(read()).resolves.toBe("getContract:ok")
		expect(h.seen(A)).toEqual([`getNodeInfo@${probeTimeoutMs}`, `getChainTips@${probeTimeoutMs}`, `getContract@${probeTimeoutMs}`])
		expect(h.seen(B)).toEqual([])
	})

	test("admission and the attempt share the caller's budget: the attempt gets what admission left", async () => {
		const h = new Harness([A, B])
		h.endpoint(A).hold = (m) => {
			if (m === "getNodeInfo") h.now += 2_000
			return undefined
		}
		await expect(h.node.route.singleAttempt(probeTimeoutMs).getContract(undefined as never)).resolves.toBe("getContract:ok")
		expect(h.seen(A).at(-1)).toBe(`getContract@${probeTimeoutMs - 2_000}`)
	})

	test("a probe that outlives the caller's budget ends the caller's wait at its deadline and runs on for the next read", async () => {
		const h = new Harness([A, B])
		h.endpoint(A).fail = (method) => (method === "getNodeInfo" ? transport("timeout") : undefined)
		h.endpoint(A).hold = (m) => {
			if (m === "getNodeInfo") h.now += 4_000
			return undefined
		}
		let release: () => void = () => {}
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		h.endpoint(B).hold = (m) => (m === "getNodeInfo" ? held : undefined)
		const read = h.node.route.singleAttempt(probeTimeoutMs).getContract(undefined as never)
		const outcome = read.then(
			() => "resolved",
			(error: Error) => error.message,
		)
		await vi.waitFor(() => expect(h.seen(B)).toContain(`getNodeInfo@${probeTimeoutMs}`))
		h.advance(probeTimeoutMs - 4_000 - 1)
		await Promise.resolve()
		expect(await Promise.race([outcome, Promise.resolve("waiting")])).toBe("waiting")
		h.advance(1)
		expect(await outcome).toMatch(/No endpoint/)
		expect(h.now).toBe(probeTimeoutMs)

		release()
		await expect(h.node.route.singleAttempt(probeTimeoutMs).getContract(undefined as never)).resolves.toBe("getContract:ok")
		expect(h.node.route.active()?.id).toBe("e1")
		expect(h.seen(B).filter((r) => r.startsWith("getNodeInfo"))).toHaveLength(1)
	})

	test("a shorter budget joining a running admission leaves at its own deadline; the longer one is served when the probe lands", async () => {
		const h = new Harness([A, B])
		let release: () => void = () => {}
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		h.endpoint(A).hold = (m) => (m === "getNodeInfo" ? held : undefined)
		const long = h.node.route.singleAttempt(60_000).getContract(undefined as never)
		await vi.waitFor(() => expect(h.seen(A)).toContain(`getNodeInfo@${probeTimeoutMs}`))
		const short = h.node.route.singleAttempt(1_000).getContract(undefined as never)
		h.advance(1_000)
		await expect(short).rejects.toThrow(/No endpoint/)

		release()
		await expect(long).resolves.toBe("getContract:ok")
		expect(h.seen(A).filter((r) => r.startsWith("getNodeInfo"))).toHaveLength(1)
		expect(h.seen(A).at(-1)).toBe(`getContract@${60_000 - 1_000}`)
		expect(h.seen(B)).toEqual([])
	})

	test("an admission that spends the budget fails the read and starts no probe past it; the next read admits the fallback", async () => {
		const h = new Harness([A, B])
		h.endpoint(A).fail = (method) => (method === "getNodeInfo" ? transport("timeout") : undefined)
		h.endpoint(A).hold = (m) => {
			if (m === "getNodeInfo") h.now += probeTimeoutMs
			return undefined
		}
		const read = () => h.node.route.singleAttempt(probeTimeoutMs).getContract(undefined as never)
		await expect(read()).rejects.toThrow(/No endpoint/)
		expect(h.seen(B)).toEqual([])
		await expect(read()).resolves.toBe("getContract:ok")
		expect(h.node.route.active()?.id).toBe("e1")
		expect(h.seen(B)).toEqual([`getNodeInfo@${probeTimeoutMs}`, `getChainTips@${probeTimeoutMs}`, `getContract@${probeTimeoutMs}`])
	})
})

describe("one endpoint", () => {
	test.each<{ name: string; failure: () => Error; attempts: number; sleeps: number[] }>([
		{ name: "a 5xx", failure: () => transport("server"), attempts: 4, sleeps: [1_000, 2_000, 3_000] },
		{ name: "a timeout", failure: () => transport("timeout"), attempts: 4, sleeps: [1_000, 2_000, 3_000] },
		{ name: "a JSON 429", failure: () => transport("overloaded"), attempts: 1, sleeps: [] },
		{ name: "a gateway refusal", failure: () => entryError(31), attempts: 1, sleeps: [] },
		{ name: "the node's own error", failure: () => entryError(-32603), attempts: 1, sleeps: [] },
	])("$name: today's $attempts attempt(s), no probe, also after down", async ({ failure, attempts, sleeps }) => {
		const h = new Harness([A])
		h.endpoint(A).fail = () => failure()
		for (const _ of [1, 2]) {
			h.requests.length = 0
			h.sleeps.length = 0
			await expect(h.node.getChainTips()).rejects.toThrow()
			await expect(call(h)).rejects.toThrow()
			expect(h.seen(A)).toEqual([
				...Array(attempts).fill(`getChainTips@${callTimeoutMs}`),
				...Array(attempts).fill(`getContract@${callTimeoutMs}`),
			])
			expect(h.sleeps).toEqual([...sleeps, ...sleeps])
		}
		h.endpoint(A).fail = () => undefined
		await call(h)
		expect(h.node.route.snapshot()[0]?.state).toBe("ready")
	})

	test("retryWhile is asked before the sleep and after it", async () => {
		const h = new Harness([A])
		h.endpoint(A).fail = () => transport("server")
		h.retryWhile = () => false
		await expect(call(h)).rejects.toThrow("fetch server")
		expect(h.seen(A)).toHaveLength(1)
		expect(h.sleeps).toEqual([])
		let allowed = true
		h.retryWhile = () => allowed
		h.onSleep = () => {
			allowed = false
			return undefined
		}
		h.requests.length = 0
		await expect(call(h)).rejects.toThrow("fetch server")
		expect(h.seen(A)).toHaveLength(1)
		expect(h.sleeps).toEqual([1_000])
	})

	test("retryWhile is asked before a move", async () => {
		const h = new Harness([A, B])
		await call(h)
		h.endpoint(A).fail = () => transport("server")
		h.retryWhile = () => false
		await expect(call(h)).rejects.toThrow("fetch server")
		expect(h.seen(B)).toEqual([])
	})
})

describe("pickForSend", () => {
	test("sends nothing while the active endpoint is ready, and a second pick for the hash returns the same endpoint", async () => {
		const h = new Harness([A, B])
		await call(h)
		const before = h.requests.length
		expect((await h.node.route.pickForSend(TX.toString(), ANCHOR)).id).toBe("e0")
		h.endpoint(A).fail = () => transport("timeout")
		await call(h)
		expect((await h.node.route.pickForSend(TX.toString(), ANCHOR)).id).toBe("e0")
		expect(h.requests.length).toBe(before + 4)
	})

	test.each<TransportFailure>(["unreachable", "overloaded", "refused"])(
		"an active endpoint whose last call failed (%s) is not taken on trust: the others are asked",
		async (kind) => {
			const h = new Harness([A, B])
			await call(h)
			h.endpoint(A).fail = () => transport(kind)
			await call(h)
			expect(h.node.route.active()?.id).toBe("e0")
			expect(h.node.route.snapshot()[0]?.state).toBe("ready")
			const [fromA, fromB] = [h.seen(A).length, h.seen(B).length]
			expect((await h.node.route.pickForSend(TX.toString(), ANCHOR)).id).toBe("e1")
			expect(h.seen(A).length).toBe(fromA)
			expect(h.seen(B).slice(fromB)).toEqual([`getNodeInfo@${probeTimeoutMs}`, `getBlockData@${probeTimeoutMs}`])
		},
	)

	test("with no active endpoint, asks the endpoints in order and picks the first that knows the anchor", async () => {
		const h = new Harness([A, B, C])
		await call(h)
		h.node.route.seedFloor(1_000)
		h.endpoint(A).knownBlocks.clear()
		const before = h.requests.length
		expect((await h.node.route.pickForSend(TX.toString(), ANCHOR)).id).toBe("e1")
		expect(h.requests.slice(before).map((r) => `${r.url} ${r.method}@${r.timeoutMs}`)).toEqual([
			`${A} getNodeInfo@${probeTimeoutMs}`,
			`${A} getBlockData@${probeTimeoutMs}`,
			`${B} getNodeInfo@${probeTimeoutMs}`,
			`${B} getBlockData@${probeTimeoutMs}`,
		])
	})

	test("refuses when every answer is another chain, and when nothing answers; pins nothing", async () => {
		const pins = createSubmissionPins()
		const h = new Harness([A, B], { pins })
		h.endpoint(A).l1ChainId = 1
		h.endpoint(B).l1ChainId = 1
		await expect(h.node.route.pickForSend(TX.toString(), ANCHOR)).rejects.toThrow(/Chain identity mismatch/)
		const dead = new Harness([A, B], { pins })
		dead.endpoint(A).fail = () => transport("unreachable")
		dead.endpoint(B).fail = () => transport("unreachable")
		await expect(dead.node.route.pickForSend(TX.toString(), ANCHOR)).rejects.toThrow()
		expect(pins.byTxHash.size).toBe(0)
	})

	test("identity is judged when the block read fails, and the node's own refusal of it means the anchor is unknown", async () => {
		const h = new Harness([A, B, C])
		await call(h)
		h.node.route.seedFloor(1_000)
		const unknownBlock = (m: string) => (m === "getBlockData" ? entryError(-32602) : undefined)
		h.endpoint(A).fail = unknownBlock
		h.endpoint(B).l1ChainId = 1
		h.endpoint(B).fail = unknownBlock
		expect((await h.node.route.pickForSend(TX.toString(), ANCHOR)).id).toBe("e2")
		expect(h.node.route.snapshot().map((e) => e.state)).toEqual(["behind", "wrong-chain", "unknown"])
		const elsewhere = new Harness([A, B])
		for (const url of [A, B]) {
			elsewhere.endpoint(url).l1ChainId = 1
			elsewhere.endpoint(url).fail = unknownBlock
		}
		await expect(elsewhere.node.route.pickForSend(TX.toString(), ANCHOR)).rejects.toThrow(/Chain identity mismatch/)
		const mixed = new Harness([A, B])
		mixed.endpoint(A).fail = unknownBlock
		mixed.endpoint(B).l1ChainId = 1
		await expect(mixed.node.route.pickForSend(TX.toString(), ANCHOR)).rejects.toThrow(/No endpoint/)
	})

	test("a lone endpoint is picked with no request, down or not", async () => {
		const h = new Harness([A])
		h.endpoint(A).fail = () => transport("timeout")
		await expect(call(h)).rejects.toThrow()
		const before = h.requests.length
		expect((await h.node.route.pickForSend(TX.toString(), ANCHOR)).id).toBe("e0")
		expect(h.requests.length).toBe(before)
	})
})

describe("pinned receipts", () => {
	test("never move: a failing pinned endpoint answers pending, sends nothing while down, then one attempt per hold-down", async () => {
		const h = new Harness([A, B])
		await call(h)
		await h.node.route.pickForSend(TX.toString(), ANCHOR)
		h.endpoint(A).fail = (m) => (m === "getTxReceipt" ? transport("server") : undefined)
		await expect(h.node.getTxReceipt(TX)).resolves.toMatchObject({ status: "pending" })
		expect(h.seen(A).filter((r) => r.startsWith("getTxReceipt"))).toHaveLength(4)
		expect(h.seen(B).filter((r) => r.startsWith("getTxReceipt"))).toEqual([])
		expect(h.node.route.snapshot()[0]?.state).toBe("down")
		const sent = h.requests.length
		await expect(h.node.getTxReceipt(TX)).resolves.toMatchObject({ status: "pending" })
		expect(h.requests.length).toBe(sent)
		h.now += holdDownMinMs
		await expect(h.node.getTxReceipt(TX)).resolves.toMatchObject({ status: "pending" })
		expect(h.seen(A).filter((r) => r.startsWith("getTxReceipt"))).toHaveLength(5)
		h.endpoint(A).fail = () => undefined
		h.endpoint(A).receipts.set(TX.toString(), { status: "proposed" })
		h.now += holdDownMinMs
		await expect(h.node.getTxReceipt(TX)).resolves.toMatchObject({ status: "proposed" })
		expect(h.node.route.snapshot()[0]?.state).toBe("ready")
		expect(h.seen(B).filter((r) => r.startsWith("getTxReceipt"))).toEqual([])
	})

	test("an endpoint the route no longer lists recovers the same way: timeout, then recovery, then the real receipt", async () => {
		const pins = createSubmissionPins()
		const gone = "https://gone.example"
		pins.byTxHash.set(TX.toString(), { id: "old", rpcUrl: gone })
		const h = new Harness([A, B], { pins })
		const old = h.add(gone)
		old.fail = () => transport("timeout")
		await expect(h.node.getTxReceipt(TX)).resolves.toMatchObject({ status: "pending" })
		const sent = h.seen(gone).length
		await expect(h.node.getTxReceipt(TX)).resolves.toMatchObject({ status: "pending" })
		expect(h.seen(gone)).toHaveLength(sent)
		old.fail = () => undefined
		old.receipts.set(TX.toString(), { status: "checkpointed" })
		h.now += holdDownMinMs
		await expect(h.node.getTxReceipt(TX)).resolves.toMatchObject({ status: "checkpointed" })
		expect(h.seen(gone)).toHaveLength(sent + 1)
		expect(
			h
				.seen(A)
				.concat(h.seen(B))
				.filter((r) => r.startsWith("getTxReceipt")),
		).toEqual([])
	})

	test("the pin holds through a prune of its block and ends once its endpoint reports the transaction finalized", async () => {
		const pins = createSubmissionPins()
		const h = new Harness([A, B], { pins })
		await call(h)
		await h.node.route.pickForSend(TX.toString(), ANCHOR)
		const receipts = h.endpoint(A).receipts
		for (const status of ["proposed", "pending", "checkpointed", "finalized"]) {
			receipts.set(TX.toString(), { status })
			await expect(h.node.getTxReceipt(TX)).resolves.toMatchObject({ status })
			expect(pins.byTxHash.has(TX.toString())).toBe(status !== "finalized")
		}
	})
})
