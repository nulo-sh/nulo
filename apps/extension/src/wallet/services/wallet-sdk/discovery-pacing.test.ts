import { describe, expect, test } from "vitest"
import { DISCOVERY_BURST, DISCOVERY_REFILL_MS, DiscoveryPacing } from "./discovery-pacing"

const TAB = 7
const OTHER_TAB = 9

function harness() {
	let now = 1_000_000
	const pacing = new DiscoveryPacing({ now: () => now })
	const burst = (tabId: number, n: number) => Array.from({ length: n }, () => pacing.admit(tabId))
	return {
		pacing,
		burst,
		advance: (ms: number) => {
			now += ms
		},
	}
}

describe("DiscoveryPacing", () => {
	test("a tab's burst passes and the next discovery is refused", () => {
		const { burst } = harness()
		expect(burst(TAB, DISCOVERY_BURST + 2)).toEqual([...Array(DISCOVERY_BURST).fill(true), false, false])
	})

	test("one discovery passes again after each refill, and only one", () => {
		const { pacing, burst, advance } = harness()
		burst(TAB, DISCOVERY_BURST)
		advance(DISCOVERY_REFILL_MS - 1)
		expect(pacing.admit(TAB)).toBe(false)
		advance(1)
		expect(burst(TAB, 2)).toEqual([true, false])
	})

	test("a second tab of the same origin is served while the first is refused", () => {
		const { pacing, burst } = harness()
		burst(TAB, DISCOVERY_BURST)
		expect(pacing.admit(TAB)).toBe(false)
		expect(burst(OTHER_TAB, DISCOVERY_BURST)).toEqual(Array(DISCOVERY_BURST).fill(true))
	})

	test("once refilled, a tab never seen again leaves no entry", () => {
		const { pacing, burst, advance } = harness()
		burst(TAB, DISCOVERY_BURST)
		advance(DISCOVERY_BURST * DISCOVERY_REFILL_MS)
		pacing.admit(OTHER_TAB)
		expect(pacing.trackedTabs).toBe(1)
	})

	test("a wall clock set back does not hold an empty bucket until it catches up", () => {
		const { pacing, burst, advance } = harness()
		burst(TAB, DISCOVERY_BURST)
		advance(-60 * 60_000)
		expect(pacing.admit(TAB)).toBe(false)
		advance(DISCOVERY_REFILL_MS)
		expect(pacing.admit(TAB)).toBe(true)
	})
})
