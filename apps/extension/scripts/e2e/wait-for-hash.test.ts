import { type Page, TimeoutError } from "puppeteer"
import { afterEach, describe, expect, test, vi } from "vitest"
import { waitForHash } from "../../tests/e2e/fixtures/dom"

function fakePage(evaluate: () => Promise<string>, wait: () => Promise<unknown>): Page {
	return { waitForFunction: vi.fn(wait), evaluate: vi.fn(evaluate) } as unknown as Page
}

const timeout = new TimeoutError("Waiting failed: 15000ms exceeded")
const timedOut = () => Promise.reject(timeout)

describe("waitForHash", () => {
	afterEach(() => vi.useRealTimers())

	test("a timeout names the hash the page is at and stays a TimeoutError", async () => {
		const error = await waitForHash(
			fakePage(async () => "#/popup/auth", timedOut),
			"#/popup/general",
		).catch((e: unknown) => e)

		expect(error).toBeInstanceOf(TimeoutError)
		expect((error as Error).message).toBe('waitForHash: #/popup/general not reached in 15000 ms; the page is at "#/popup/auth"')
		expect((error as Error).cause).toBe(timeout)
	})

	test("a page that does not answer after the timeout still fails within 2 s", async () => {
		vi.useFakeTimers()
		const outcome = waitForHash(
			fakePage(() => new Promise(() => {}), timedOut),
			"#/popup/general",
			5_000,
		).catch((e: unknown) => e)

		await vi.advanceTimersByTimeAsync(2_000)
		expect(((await outcome) as Error).message).toBe(
			"waitForHash: #/popup/general not reached in 5000 ms; the page did not answer within 2 s",
		)
	})

	test("any other failure passes through unread", async () => {
		const closed = new Error("Target closed")
		const page = fakePage(
			async () => "#/",
			() => Promise.reject(closed),
		)

		await expect(waitForHash(page, "#/popup/general")).rejects.toBe(closed)
		expect(page.evaluate).not.toHaveBeenCalled()
	})
})
