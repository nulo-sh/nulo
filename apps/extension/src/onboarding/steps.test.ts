import { afterEach, describe, expect, test, vi } from "vitest"
import { createRouter, createWebHashHistory } from "vue-router"

import { donePath, doneRoute, stepCells } from "./steps"

describe("onboarding steps", () => {
	test("only a password wallet's path carries the phrase step", () => {
		expect(stepCells("password").map((cell) => cell.step)).toEqual(["terms", "wallet", "phrase", "ready"])
		expect(stepCells("passkey").map((cell) => cell.step)).toEqual(["terms", "wallet", "phrase", "ready"])
		expect(stepCells("import").map((cell) => cell.step)).toEqual(["terms", "wallet", "ready"])
	})

	test("Ready's path round-trips through the history entry", () => {
		for (const path of ["password", "passkey", "import"] as const) {
			const route = doneRoute(path) as { path: string; state: unknown }
			expect(route.path).toBe("/onboarding/done")
			expect(donePath(route.state)).toBe(path)
		}
	})

	test.each([
		["an entry with no state", null],
		["an entry from the router alone", { back: "/onboarding/create", position: 3 }],
		["a value outside the paths", { onboardingPath: "admin" }],
		["a value of another type", { onboardingPath: 1 }],
	])("%s gives no path", (_, state) => {
		expect(donePath(state)).toBeUndefined()
	})
})

describe("the flow mark on the history entry", () => {
	afterEach(() => window.history.replaceState(null, ""))

	/** A fresh module: the load check settles once per document. */
	async function freshSteps() {
		vi.resetModules()
		return import("./steps")
	}

	test("a mark keeps the router's keys, and a clear waits for the load check to settle", async () => {
		const steps = await freshSteps()
		window.history.replaceState({ back: "/onboarding/welcome", position: 2 }, "")
		steps.markFlowPath("password")
		expect(window.history.state).toEqual({ back: "/onboarding/welcome", position: 2, onboardingPath: "password" })

		steps.clearFlowPath()
		expect(steps.donePath(window.history.state)).toBe("password")

		steps.settleResume()
		steps.clearFlowPath()
		expect(window.history.state).toEqual({ back: "/onboarding/welcome", position: 2 })
	})

	test("the router keeps a mark through push and Back, replace, a guard's redirect and a reload", async () => {
		const steps = await freshSteps()
		const page = { template: "<div />" }
		const routes = ["welcome", "terms", "create", "import", "done"].map((name) => ({ path: `/onboarding/${name}`, component: page }))
		const router = createRouter({ history: createWebHashHistory(), routes })
		router.beforeEach((to) => (to.path === "/onboarding/import" ? { path: "/onboarding/terms", replace: true } : true))
		await router.push("/onboarding/create")
		steps.markFlowPath("passkey")

		await router.push("/onboarding/welcome")
		expect(steps.donePath(window.history.state)).toBeUndefined()
		const landed = new Promise<void>((resolve) => {
			const stop = router.afterEach(() => {
				stop()
				resolve()
			})
		})
		router.back()
		await landed
		expect(router.currentRoute.value.path).toBe("/onboarding/create")
		expect(steps.donePath(window.history.state)).toBe("passkey")

		await router.replace("/onboarding/import")
		expect(router.currentRoute.value.path).toBe("/onboarding/terms")
		expect(steps.donePath(window.history.state)).toBe("passkey")

		const reloaded = createRouter({ history: createWebHashHistory(), routes })
		await reloaded.push(reloaded.options.history.location)
		expect(steps.donePath(window.history.state)).toBe("passkey")
	})
})
