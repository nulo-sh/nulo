import { describe, expect, test } from "vitest"
import { installChromeStorage } from "../../tests/helpers/chrome-storage-mock"

describe("installChromeStorage", () => {
	test("persist: false records set and remove and keeps nothing", async () => {
		const storage = installChromeStorage({ seeded: 1 }, { persist: false })
		await chrome.storage.local.set({ written: 2, seeded: 3 })
		await chrome.storage.local.remove("seeded")

		expect(storage.set).toHaveBeenCalledExactlyOnceWith({ written: 2, seeded: 3 })
		expect(storage.remove).toHaveBeenCalledExactlyOnceWith("seeded")
		expect(await chrome.storage.local.get()).toEqual({ seeded: 1 })
	})

	test("the default mode persists writes and removals", async () => {
		installChromeStorage({ seeded: 1 })
		await chrome.storage.local.set({ written: 2 })
		await chrome.storage.local.remove("seeded")

		expect(await chrome.storage.local.get()).toEqual({ written: 2 })
	})
})
