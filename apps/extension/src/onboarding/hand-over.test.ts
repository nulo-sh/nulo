import { SCHEMA_RUNNING_KEY } from "@nulo/wallet-core/migration"
import { describe, expect, test, vi } from "vitest"
import { ONBOARDING_COMPLETED_KEY } from "@/stores/app.store"
import { installChromeStorage } from "../../tests/helpers/chrome-storage-mock"
import { isOnboardingDone, startOnboarding } from "./hand-over"

const start = (isDone: () => Promise<boolean>, handOver: () => Promise<void> = vi.fn(async () => undefined)) => {
	const mount = vi.fn()
	return { mount, handOver, run: startOnboarding({ isDone, handOver, mount }) }
}

describe("startOnboarding", () => {
	test("a finished onboarding hands over to the popup and never mounts, so no route starts loading in the closing tab", async () => {
		const { mount, handOver, run } = start(async () => true)
		await run
		expect(handOver).toHaveBeenCalledTimes(1)
		expect(mount).not.toHaveBeenCalled()
	})

	test("an onboarding not done, or a read that fails, mounts and hands nothing over", async () => {
		for (const isDone of [async () => false, async () => Promise.reject(new Error("worker restarting"))]) {
			const { mount, handOver, run } = start(isDone)
			await run
			expect(mount).toHaveBeenCalledTimes(1)
			expect(handOver).not.toHaveBeenCalled()
		}
	})

	test("a hand-over that fails mounts the app, as a tab that never handed over did", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const { mount, run } = start(
			async () => true,
			async () => Promise.reject(new Error("no window")),
		)
		await run
		expect(mount).toHaveBeenCalledTimes(1)
		expect(warn).toHaveBeenCalledWith("onboarding hand-over to the popup failed", { error: expect.any(Error) })
		warn.mockRestore()
	})
})

describe("isOnboardingDone", () => {
	test("a migration still running reads as not done at once, so the tab mounts its migration barrier", async () => {
		installChromeStorage({ [SCHEMA_RUNNING_KEY]: 2, [ONBOARDING_COMPLETED_KEY]: true })
		expect(await isOnboardingDone()).toBe(false)
		installChromeStorage({ [ONBOARDING_COMPLETED_KEY]: true })
		expect(await isOnboardingDone()).toBe(true)
	})
})
