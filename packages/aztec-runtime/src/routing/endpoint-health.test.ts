import { describe, expect, test } from "vitest"
import { type HealthChange, type ProbeAnswer, ROUTE_TIMING, RouteHealth } from "./endpoint-health"

const { holdDownMinMs, holdDownMaxMs, holdResetMs, probeSpacingMs, probeTimeoutMs } = ROUTE_TIMING

const passing = (tip: number): ProbeAnswer => ({ answered: true, sameChain: true, tip })
const failing = (): ProbeAnswer => ({ answered: false, failure: "unreachable", cause: new Error("refused") })

/** Two endpoints, the primary admitted and active, both seen at `tip`, the floor at `tip`. */
function admittedPair(tip = 10, now = 0): RouteHealth {
	const health = new RouteHealth(2, now)
	health.probed(0, passing(tip), now)
	health.probed(1, passing(tip), now)
	health.servedTip(0, tip, now)
	return health
}

/** Moves the role from the primary to the fallback by taking the primary down; the fallback then serves a call. */
function failOver(health: RouteHealth, now: number): void {
	health.failed(0, "timeout", new Error("abort"), now)
	expect(health.active()).toBe(1)
	health.succeeded(1, now)
}

/** Brings the primary back through two passing return probes `holdDown` apart; returns the time it took the role. */
function returnPrimary(health: RouteHealth, from: number, tip = 10): number {
	const first = Math.max(from, health.nextProbeAt(0))
	health.probed(0, passing(tip), first)
	expect(health.active()).toBe(1)
	const second = health.nextProbeAt(0)
	health.probed(0, passing(tip), second)
	expect(health.active()).toBe(0)
	return second
}

describe("down", () => {
	test("after three counting failures in a row, or one timeout; a success between resets the count", () => {
		const health = admittedPair()
		health.failed(1, "server", new Error("a"), 1)
		health.failed(1, "unreachable", new Error("b"), 2)
		health.succeeded(1, 3)
		health.failed(1, "malformed", new Error("c"), 4)
		health.failed(1, "server", new Error("d"), 5)
		expect(health.state(1)).toBe("ready")
		health.failed(1, "server", new Error("e"), 6)
		expect(health.state(1)).toBe("down")

		const timedOut = admittedPair()
		timedOut.failed(1, "timeout", new Error("abort"), 1)
		expect(timedOut.state(1)).toBe("down")
	})

	test("a probe's or a caller's shorter abort counts as one failure; only a call attempt timing out downs at once", () => {
		const health = admittedPair()
		health.failed(0, "timeout", new Error("caller abort"), 1, probeTimeoutMs)
		health.probed(0, { answered: false, failure: "timeout", cause: new Error("probe abort") }, 2)
		expect(health.state(0)).toBe("ready")
		expect(health.active()).toBe(0)
		health.failed(0, "timeout", new Error("caller abort again"), 3, probeTimeoutMs)
		expect(health.state(0)).toBe("down")
	})

	test("never on a 429 or a gateway refusal", () => {
		const health = admittedPair()
		for (let n = 0; n < 5; n++) {
			health.failed(0, "overloaded", new Error(`429 #${n}`), n)
			health.failed(0, "refused", new Error(`400 #${n}`), n)
		}
		expect(health.state(0)).toBe("ready")
		expect(health.active()).toBe(0)
	})

	test("one failed batch counts once: its callers share the fetch's error object", () => {
		const health = admittedPair()
		const batch = new Error("503")
		for (let n = 0; n < 5; n++) health.failed(1, "server", batch, n)
		expect(health.state(1)).toBe("ready")
		health.failed(1, "server", new Error("503 again"), 6)
		health.failed(1, "server", new Error("503 once more"), 7)
		expect(health.state(1)).toBe("down")
	})

	test("the active endpoint going down passes the role to the next qualifying one", () => {
		const changes: HealthChange[] = []
		const health = new RouteHealth(2, 0, (change) => changes.push(change))
		health.probed(0, passing(10), 0)
		health.probed(1, passing(10), 0)
		failOver(health, 1)
		expect(changes).toContainEqual({ kind: "state", index: 0, state: "down", failure: "timeout" })
		expect(changes.at(-1)).toEqual({ kind: "active", index: 1 })
	})
})

describe("the last failure", () => {
	test("keeps the latest counted kind, never a 429, a refusal or a batch already counted, and announces a new kind on a down endpoint", () => {
		const changes: HealthChange[] = []
		const health = new RouteHealth(2, 0, (change) => changes.push(change))
		health.probed(0, passing(10), 0)
		health.probed(1, passing(10), 0)
		expect(health.lastFailure(1)).toBeUndefined()
		health.failed(1, "server", new Error("a"), 1)
		health.failed(1, "overloaded", new Error("429"), 2)
		health.failed(1, "refused", new Error("400"), 3)
		expect(health.lastFailure(1)).toBe("server")
		const batch = new Error("refused")
		health.failed(1, "unreachable", batch, 4)
		health.failed(1, "unreachable", new Error("b"), 5)
		expect(health.state(1)).toBe("down")
		expect(health.lastFailure(1)).toBe("unreachable")
		const before = changes.length
		health.failed(1, "timeout", batch, 6)
		expect(health.lastFailure(1)).toBe("unreachable")
		health.failed(1, "unreachable", new Error("c"), 7)
		expect(changes.length).toBe(before)
		health.failed(1, "timeout", new Error("abort"), 8)
		expect(health.lastFailure(1)).toBe("timeout")
		expect(changes.slice(before)).toEqual([{ kind: "failure", index: 1, failure: "timeout" }])
		expect(health.state(1)).toBe("down")
		expect(health.since(1)).toBe(5)
	})
})

describe("the active role", () => {
	test("returns to the primary only after two passing probes holdDown apart, each meeting identity and the floor", () => {
		const health = admittedPair()
		failOver(health, 1)
		const due = health.nextProbeAt(0)
		expect(due).toBeGreaterThanOrEqual(1 + holdDownMinMs)
		health.probed(0, passing(10), due)
		expect(health.active()).toBe(1)
		health.probed(0, passing(10), due + holdDownMinMs - 1)
		expect(health.active()).toBe(1)
		health.probed(0, passing(10), due + holdDownMinMs)
		expect(health.active()).toBe(0)
	})

	test.each<{ name: string; second: ProbeAnswer }>([
		{ name: "another chain", second: { answered: true, sameChain: false, tip: 10 } },
		{ name: "a tip below the floor", second: passing(9) },
		{ name: "no answer", second: failing() },
	])("a second probe with $name restarts the return", ({ second }) => {
		const health = admittedPair()
		failOver(health, 1)
		const first = health.nextProbeAt(0)
		health.probed(0, passing(10), first)
		health.probed(0, second, first + holdDownMinMs)
		expect(health.active()).toBe(1)
	})

	test("holdDown doubles on each re-fall while another endpoint served, caps at 30 min and resets after 30 min held", () => {
		const health = admittedPair()
		failOver(health, 1)
		let now = returnPrimary(health, 1)
		const holds: number[] = []
		for (let n = 0; n < 8; n++) {
			failOver(health, ++now)
			holds.push(health.holdDownMs(0))
			now = returnPrimary(health, now)
		}
		expect(holds).toEqual([60_000, 120_000, 240_000, 480_000, 960_000, holdDownMaxMs, holdDownMaxMs, holdDownMaxMs])
		health.tick(now + holdResetMs)
		expect(health.holdDownMs(0)).toBe(holdDownMinMs)
	})

	test("every endpoint failing together doubles no holdDown, in either order, and the primary takes the role back at once", () => {
		const health = admittedPair()
		failOver(health, 1)
		let now = returnPrimary(health, 1)
		for (let n = 0; n < 4; n++) {
			now += 1
			health.probed(1, passing(10), now)
			const order = n % 2 === 0 ? [1, 0] : [0, 1]
			for (const index of order) health.failed(index, "timeout", new Error("abort"), now)
			expect(health.active()).toBeUndefined()
			now += probeSpacingMs
			health.probed(0, passing(10), now)
			expect(health.active()).toBe(0)
			health.succeeded(0, now)
		}
		expect([health.holdDownMs(0), health.holdDownMs(1)]).toEqual([holdDownMinMs, holdDownMinMs])
	})

	test("a lone endpoint holds the role through down, is never probed or behind, and a success returns it to ready", () => {
		const health = new RouteHealth(1, 0)
		expect(health.active()).toBe(0)
		expect(health.needsProbe(0)).toBe(false)
		health.failed(0, "timeout", new Error("abort"), 1)
		expect(health.state(0)).toBe("down")
		expect(health.active()).toBe(0)
		health.seedFloor(1_000, 2)
		expect(health.active()).toBe(0)
		expect(health.returnProbesDue(10 * holdDownMaxMs)).toEqual([])
		health.succeeded(0, 3)
		expect(health.state(0)).toBe("ready")
	})

	test("with no active endpoint the first qualifying probe takes the role: a behind fallback catching up while the primary is dead", () => {
		const health = admittedPair(10)
		health.probed(1, passing(8), 1)
		expect(health.state(1)).toBe("behind")
		health.failed(0, "timeout", new Error("abort"), 2)
		expect(health.active()).toBeUndefined()
		expect(health.mayProbe(1, 3)).toBe(false)
		expect(health.mayProbe(1, 1 + probeSpacingMs)).toBe(true)
		health.probed(1, passing(9), 1 + probeSpacingMs)
		expect(health.active()).toBeUndefined()
		health.probed(1, passing(10), 1 + 2 * probeSpacingMs)
		expect(health.active()).toBe(1)
	})

	test("an endpoint answering for another chain is wrong-chain, never qualifies and is probed again after 30 min", () => {
		const health = new RouteHealth(2, 0)
		health.probed(0, { answered: true, sameChain: false, tip: 10 }, 0)
		expect(health.state(0)).toBe("wrong-chain")
		expect(health.qualifies(0)).toBe(false)
		expect(health.active()).toBeUndefined()
		health.probed(1, passing(10), 1)
		expect(health.mayProbe(0, ROUTE_TIMING.wrongChainRetryMs - 1)).toBe(false)
		expect(health.mayProbe(0, ROUTE_TIMING.wrongChainRetryMs)).toBe(true)
	})
})

describe("the floor", () => {
	test("is never raised by a candidate's probe", () => {
		const health = admittedPair(10)
		health.probed(1, passing(50), 1)
		expect(health.floor()).toBe(10)
		health.servedTip(1, 60, 2)
		expect(health.floor()).toBe(10)
		health.servedTip(0, 12, 3)
		expect(health.floor()).toBe(12)
	})

	test("takes the tip of each endpoint that takes the role, and is raised, never lowered, by a probe the active one answers", () => {
		const health = new RouteHealth(2, 0)
		health.probed(0, passing(100), 0)
		expect(health.active()).toBe(0)
		expect(health.floor()).toBe(100)
		health.probed(1, passing(99), 1)
		expect(health.state(1)).toBe("behind")
		health.probed(1, passing(103), 1 + probeSpacingMs)
		expect(health.floor()).toBe(100)
		health.failed(0, "timeout", new Error("abort"), 2 + probeSpacingMs)
		expect(health.active()).toBe(1)
		expect(health.floor()).toBe(103)
		const first = health.nextProbeAt(0)
		health.probed(0, passing(104), first)
		health.probed(0, passing(104), first + holdDownMinMs)
		expect(health.active()).toBe(0)
		expect(health.floor()).toBe(104)
		health.probed(0, passing(110), first + 2 * holdDownMinMs)
		expect(health.floor()).toBe(110)
		health.servedTip(0, 120, first + 2 * holdDownMinMs + 1)
		health.probed(0, passing(110), first + 2 * holdDownMinMs + 2)
		expect(health.floor()).toBe(120)
		expect([health.active(), health.qualifies(0)]).toEqual([0, true])
	})

	test("follows the active endpoint down, and an endpoint seen below it no longer qualifies", () => {
		const health = admittedPair(10)
		health.servedTip(0, 20, 1)
		health.servedTip(0, 18, 2)
		expect(health.floor()).toBe(18)
		expect(health.qualifies(1)).toBe(false)
		expect(health.needsProbe(1)).toBe(true)
		health.probed(1, passing(18), 3)
		expect(health.qualifies(1)).toBe(true)
	})

	test("seeding it above the active endpoint takes the role, the primary included, when another endpoint exists; the higher of the seed and the new holder's tip wins", () => {
		const health = admittedPair(10)
		health.probed(1, passing(30), 1)
		health.seedFloor(25, 2)
		expect(health.state(0)).toBe("behind")
		expect(health.active()).toBe(1)
		expect(health.floor()).toBe(30)
		health.seedFloor(5, 3)
		expect(health.floor()).toBe(30)
	})

	test("seeding it above every endpoint leaves no active endpoint", () => {
		const health = admittedPair(10)
		health.seedFloor(25, 1)
		expect(health.active()).toBeUndefined()
		expect(health.needsProbe(1)).toBe(true)
	})
})

describe("probe spacing", () => {
	test("a behind endpoint is probed at most every 5 s; a due return probe is listed only for an endpoint more preferred than the active one", () => {
		const health = admittedPair(10)
		health.servedTip(0, 12, 1)
		health.probed(1, passing(11), 2)
		expect(health.state(1)).toBe("behind")
		expect(health.mayProbe(1, 2 + probeSpacingMs - 1)).toBe(false)
		expect(health.mayProbe(1, 2 + probeSpacingMs)).toBe(true)
		expect(health.returnProbesDue(10 * holdDownMaxMs)).toEqual([])
		health.probed(1, passing(12), 2 + probeSpacingMs)
		failOver(health, 3 + probeSpacingMs)
		expect(health.returnProbesDue(health.nextProbeAt(0) - 1)).toEqual([])
		expect(health.returnProbesDue(health.nextProbeAt(0))).toEqual([0])
	})
})
