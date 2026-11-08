import { afterEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"
import { WHATS_NEW_SEEN_KEY } from "@/utils/whats-new"
import { stampWhatsNewSeen } from "./whats-new-stamp"

afterEach(() => vi.restoreAllMocks())

describe("stampWhatsNewSeen", () => {
	test("an install writes the running minor and an update the minor it came from", async () => {
		const installed = installChromeStorage()
		await stampWhatsNewSeen({ reason: "install" }, "1.3.0")
		expect(installed.data).toEqual({ [WHATS_NEW_SEEN_KEY]: "1.3" })

		const updated = installChromeStorage()
		await stampWhatsNewSeen({ reason: "update", previousVersion: "1.2.4.0" }, "1.3.0")
		expect(updated.data).toEqual({ [WHATS_NEW_SEEN_KEY]: "1.2" })
	})

	test("a readable marker is left as stored", async () => {
		const storage = installChromeStorage({ [WHATS_NEW_SEEN_KEY]: "1.1" })
		await stampWhatsNewSeen({ reason: "update", previousVersion: "1.2.0.0" }, "1.3.0")
		expect(storage.set).not.toHaveBeenCalled()
		expect(storage.data).toEqual({ [WHATS_NEW_SEEN_KEY]: "1.1" })
	})

	test("a rejected read resolves and writes nothing", async () => {
		const storage = installChromeStorage()
		storage.get.mockRejectedValueOnce(new Error("storage gone"))
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		await expect(stampWhatsNewSeen({ reason: "install" }, "1.3.0")).resolves.toBeUndefined()
		expect(storage.set).not.toHaveBeenCalled()
		expect(debug).toHaveBeenCalledWith("whats-new marker not stamped", { error: expect.any(Error) })
	})
})
