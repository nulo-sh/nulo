import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { BRIDGE_MS, ConnectBridge } from "./connect-bridge"

const clock = {
	setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
	clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

function harness() {
	const closed: number[] = []
	const bridge = new ConnectBridge(clock, (windowId) => closed.push(windowId))
	return { bridge, closed }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("ConnectBridge", () => {
	test("an armed hold closes its window once, BRIDGE_MS after the approval", () => {
		const { bridge, closed } = harness()
		const hold = bridge.hold("r1", 7, 41)
		bridge.arm(hold)
		vi.advanceTimersByTime(BRIDGE_MS - 1)
		expect(closed).toEqual([])
		vi.advanceTimersByTime(1)
		expect(closed).toEqual([41])
		vi.advanceTimersByTime(BRIDGE_MS * 4)
		expect(closed).toEqual([41])
		expect(bridge.isOpen(hold)).toBe(false)
	})

	test("an end before the timer closes the window once, and the timer closes nothing later", () => {
		const { bridge, closed } = harness()
		const hold = bridge.hold("r1", 7, 41)
		bridge.arm(hold)
		bridge.end(hold)
		bridge.end(hold)
		vi.advanceTimersByTime(BRIDGE_MS * 2)
		expect(closed).toEqual([41])
	})

	test("a pinned hold outlives BRIDGE_MS and still closes on end", () => {
		const { bridge, closed } = harness()
		const hold = bridge.hold("r1", 7, 41)
		bridge.arm(hold)
		vi.advanceTimersByTime(BRIDGE_MS - 1)
		expect(bridge.pin("r1")).toBe(hold)
		vi.advanceTimersByTime(BRIDGE_MS * 4)
		expect(closed).toEqual([])
		expect(bridge.isOpen(hold)).toBe(true)
		bridge.end(hold)
		expect(closed).toEqual([41])
	})

	test("an establishment that beats the approval's arm keeps the hold pinned", () => {
		const { bridge, closed } = harness()
		const hold = bridge.hold("r1", 7, 41)
		bridge.pin("r1")
		bridge.arm(hold)
		vi.advanceTimersByTime(BRIDGE_MS * 4)
		expect(closed).toEqual([])
		bridge.end(hold)
		expect(closed).toEqual([41])
	})

	test("pin on an id it does not hold returns nothing and closes nothing", () => {
		const { bridge, closed } = harness()
		expect(bridge.pin("r9")).toBeUndefined()
		vi.advanceTimersByTime(BRIDGE_MS * 2)
		expect(closed).toEqual([])
	})

	test("a window the person closed reads as not open, and its end closes nothing", () => {
		const { bridge, closed } = harness()
		const first = bridge.hold("r1", 7, 41)
		const second = bridge.hold("r2", 7, 42)
		bridge.windowRemoved(41)
		expect(bridge.isOpen(first)).toBe(false)
		expect(bridge.isOpen(second)).toBe(true)
		bridge.end(first)
		bridge.end(second)
		expect(closed).toEqual([42])
	})

	test("a closed tab ends only its own holds", () => {
		const { bridge, closed } = harness()
		const mine = bridge.hold("r1", 7, 41)
		const other = bridge.hold("r2", 8, 42)
		bridge.arm(mine)
		bridge.endForTab(7)
		vi.advanceTimersByTime(BRIDGE_MS * 2)
		expect(closed).toEqual([41])
		expect(bridge.isOpen(other)).toBe(true)
	})

	test("a reused id ends the earlier hold, and the earlier hold's calls never reach its successor", () => {
		const { bridge, closed } = harness()
		const earlier = bridge.hold("r1", 7, 41)
		bridge.arm(earlier)
		const later = bridge.hold("r1", 7, 43)
		expect(closed).toEqual([41])
		expect(bridge.isOpen(earlier)).toBe(false)

		bridge.arm(earlier)
		bridge.end(earlier)
		vi.advanceTimersByTime(BRIDGE_MS * 4)
		expect(closed).toEqual([41])
		expect(bridge.isOpen(later)).toBe(true)

		bridge.end(later)
		expect(closed).toEqual([41, 43])
	})
})
