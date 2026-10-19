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
	test("an armed bridge closes its window once, BRIDGE_MS after the approval", () => {
		const { bridge, closed } = harness()
		bridge.hold("r1", 7, 41)
		bridge.arm("r1")
		vi.advanceTimersByTime(BRIDGE_MS - 1)
		expect(closed).toEqual([])
		vi.advanceTimersByTime(1)
		expect(closed).toEqual([41])
		vi.advanceTimersByTime(BRIDGE_MS * 4)
		expect(closed).toEqual([41])
		expect(bridge.isOpen("r1")).toBe(false)
	})

	test("an end before the timer closes the window once, and the timer closes nothing later", () => {
		const { bridge, closed } = harness()
		bridge.hold("r1", 7, 41)
		bridge.arm("r1")
		bridge.end("r1")
		bridge.end("r1")
		vi.advanceTimersByTime(BRIDGE_MS * 2)
		expect(closed).toEqual([41])
	})

	test("a pinned bridge outlives BRIDGE_MS and still closes on end", () => {
		const { bridge, closed } = harness()
		bridge.hold("r1", 7, 41)
		bridge.arm("r1")
		vi.advanceTimersByTime(BRIDGE_MS - 1)
		bridge.pin("r1")
		vi.advanceTimersByTime(BRIDGE_MS * 4)
		expect(closed).toEqual([])
		expect(bridge.isOpen("r1")).toBe(true)
		bridge.end("r1")
		expect(closed).toEqual([41])
	})

	test("an establishment that beats the approval's arm keeps the bridge pinned", () => {
		const { bridge, closed } = harness()
		bridge.hold("r1", 7, 41)
		bridge.pin("r1")
		bridge.arm("r1")
		vi.advanceTimersByTime(BRIDGE_MS * 4)
		expect(closed).toEqual([])
		bridge.end("r1")
		expect(closed).toEqual([41])
	})

	test("arm, pin and end on an id it does not hold do nothing", () => {
		const { bridge, closed } = harness()
		bridge.arm("r9")
		bridge.pin("r9")
		bridge.end("r9")
		vi.advanceTimersByTime(BRIDGE_MS * 2)
		expect(closed).toEqual([])
		expect(bridge.isOpen("r9")).toBe(false)
	})

	test("a window the person closed reads as not open, and its end closes nothing", () => {
		const { bridge, closed } = harness()
		bridge.hold("r1", 7, 41)
		bridge.hold("r2", 7, 42)
		bridge.windowRemoved(41)
		expect(bridge.isOpen("r1")).toBe(false)
		expect(bridge.isOpen("r2")).toBe(true)
		bridge.end("r1")
		bridge.end("r2")
		expect(closed).toEqual([42])
	})

	test("a closed tab ends only its own bridges", () => {
		const { bridge, closed } = harness()
		bridge.hold("r1", 7, 41)
		bridge.hold("r2", 8, 42)
		bridge.arm("r1")
		bridge.endForTab(7)
		vi.advanceTimersByTime(BRIDGE_MS * 2)
		expect(closed).toEqual([41])
		expect(bridge.isOpen("r2")).toBe(true)
	})

	test("holding an id again closes the window it held first", () => {
		const { bridge, closed } = harness()
		bridge.hold("r1", 7, 41)
		bridge.hold("r1", 7, 43)
		expect(closed).toEqual([41])
		bridge.end("r1")
		expect(closed).toEqual([41, 43])
	})
})
