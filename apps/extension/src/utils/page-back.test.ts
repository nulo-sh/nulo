import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const closeOwnWindow = vi.hoisted(() => vi.fn(async () => false))
vi.mock("@/utils/own-window", () => ({ closeOwnWindow }))

import { createRouter, createWebHashHistory, type Router } from "vue-router"
import { goBack, leaveFor } from "./page-back"

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

describe("leaveFor, over a real hash history", () => {
	const PAGE = "/popup/settings/security/export/seed"
	const MENU = "/popup/settings/security/export"

	async function through(...paths: string[]): Promise<Router> {
		const router = createRouter({ history: createWebHashHistory(), routes: [{ path: "/:p(.*)*", component: { render: () => null } }] })
		for (const path of paths) await router.push(path)
		return router
	}
	const arrive = (router: Router) =>
		new Promise<string>((resolve) => {
			const stop = router.afterEach((to) => {
				stop()
				resolve(to.path)
			})
		})

	test.each([
		["opened from `to`, it returns to `to`'s entry", ["/popup/settings", MENU, PAGE], "/popup/settings"],
		["opened from elsewhere, `to` takes its place", ["/popup/general", PAGE], "/popup/general"],
	])("%s, and Back from `to` never reaches the page", async (_label, paths, behind) => {
		const router = await through(...paths)
		let arrived = arrive(router)
		leaveFor(router, MENU)
		expect(await arrived).toBe(MENU)
		arrived = arrive(router)
		router.back()
		expect(await arrived).toBe(behind)
	})
})
