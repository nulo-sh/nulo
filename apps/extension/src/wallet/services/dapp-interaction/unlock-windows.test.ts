import { beforeEach, describe, expect, test } from "vitest"
import { FakeBrowserApi, MockClock } from "@nulo/wallet-core/testing"
import type { ILogger } from "@/wallet/logger"
import { WindowManager } from "@/wallet/services/window-manager/window-manager"
import { UnlockWindows } from "./unlock-windows"

const noopLogger = { log: () => {} } as unknown as ILogger
const ORIGIN = "https://app.example"
const NOW = 1_000_000

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("UnlockWindows", () => {
	let api: FakeBrowserApi
	let clock: MockClock
	let windows: UnlockWindows
	const fake = () => api.windows as unknown as { creates: Array<{ url: string }>; closeByUser(id: number): void }

	beforeEach(() => {
		api = new FakeBrowserApi()
		api.reset()
		clock = new MockClock()
		windows = new UnlockWindows(
			new WindowManager(api.windows, clock, noopLogger),
			(hash) => `ext://popup${hash}`,
			() => NOW,
		)
	})

	async function opened(): Promise<number> {
		windows.open(ORIGIN, NOW + 50_000)
		await flush()
		return 1000
	}

	test("opens one window on the origin's route; a later retime moves its cut-off and creates nothing", async () => {
		await opened()
		expect(fake().creates.map((c) => c.url)).toEqual([`ext://popup#/windows/unlock?origin=${encodeURIComponent(ORIGIN)}`])

		expect(windows.retime(ORIGIN, NOW + 54_000)).toBe(true)
		clock.advance(50_000)
		await flush()
		expect(windows.origins()).toEqual([ORIGIN])
		clock.advance(4_000)
		await flush()
		expect(windows.origins()).toEqual([])
		expect(fake().creates).toHaveLength(1)
	})

	test("retime is false for an origin with no window", () => {
		expect(windows.retime(ORIGIN, NOW + 1)).toBe(false)
	})

	test("take hands the window id over once; the window stays open and close is then a no-op", async () => {
		const id = await opened()
		const removes: number[] = []
		api.windows.onRemoved((closed) => removes.push(closed))

		expect(windows.take(ORIGIN)).toBe(id)
		expect(windows.take(ORIGIN)).toBeUndefined()
		windows.close(ORIGIN)
		clock.advance(60_000)
		await flush()
		expect(removes).toEqual([])
	})

	test("a person's close drops the entry, and nothing else", async () => {
		const id = await opened()
		fake().closeByUser(id)
		await flush()
		expect(windows.origins()).toEqual([])
		expect(windows.retime(ORIGIN, NOW + 1)).toBe(false)
	})

	test("close removes the window", async () => {
		const id = await opened()
		const removes: number[] = []
		api.windows.onRemoved((closed) => removes.push(closed))
		windows.close(ORIGIN)
		await flush()
		expect(removes).toEqual([id])
		expect(windows.origins()).toEqual([])
	})
})
