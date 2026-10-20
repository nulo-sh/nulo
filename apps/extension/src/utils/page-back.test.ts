import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const closeOwnWindow = vi.hoisted(() => vi.fn(async () => false))
vi.mock("@/utils/own-window", () => ({ closeOwnWindow }))

import { goBack } from "./page-back"

const router = { back: vi.fn(), push: vi.fn(async () => undefined) }
let length: ReturnType<typeof vi.spyOn>
const historyOf = (n: number) => length.mockReturnValue(n)

beforeEach(() => {
	vi.clearAllMocks()
	closeOwnWindow.mockResolvedValue(false)
	length = vi.spyOn(window.history, "length", "get")
})

afterEach(() => {
	length.mockRestore()
})

describe("goBack", () => {
	test("an own window closes and the router stays put", async () => {
		closeOwnWindow.mockResolvedValue(true)
		historyOf(5)
		await goBack(router, "/popup/settings")
		expect(router.back).not.toHaveBeenCalled()
		expect(router.push).not.toHaveBeenCalled()
	})

	test("with history, it goes back", async () => {
		historyOf(2)
		await goBack(router, "/popup/settings")
		expect(router.back).toHaveBeenCalledOnce()
		expect(router.push).not.toHaveBeenCalled()
	})

	test("without history, it goes to backTo", async () => {
		historyOf(1)
		await goBack(router, "/popup/settings/security/export")
		expect(router.push).toHaveBeenCalledWith("/popup/settings/security/export")
		expect(router.back).not.toHaveBeenCalled()
	})

	test("without history or backTo, it goes Home", async () => {
		historyOf(1)
		await goBack(router)
		expect(router.push).toHaveBeenCalledWith("/popup/general")
	})
})
