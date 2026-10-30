/**
 * The shell's load check against the pages a real router mounts meanwhile: a page that mounts
 * before the check settles must not erase the mark the check reads, and a form mounted after it
 * starts unmarked.
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia } from "pinia"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { defineComponent, onMounted } from "vue"
import { createRouter, createWebHashHistory } from "vue-router"

const hydrateKnownProfile = vi.hoisted(() => vi.fn<() => Promise<{ id: string } | null>>())
vi.mock("@/wallet/services/config/client", async () => {
	const { EventHandler } = await import("@nulo/wallet-core/utils")
	return {
		ConfigServiceClient: vi.fn(function () {
			return {
				onConnected: new EventHandler(),
				onUpdate: new EventHandler(),
				getValue: vi.fn(async () => "dark"),
				disconnect: vi.fn(),
			}
		}),
	}
})
vi.mock("@/utils/core", async () => {
	const { ref } = await import("vue")
	return { isServiceReady: ref(false), managers: { profile: { getProfiles: vi.fn(async () => []) } } }
})
vi.mock("@/composables/useProfileBootstrap", () => ({ useProfileBootstrap: () => ({ hydrateKnownProfile }) }))

import App from "./app.vue"
import * as steps from "./steps"

const STUBS = { ConfirmPopup: true, ToastManager: true, NotificationManager: true, MigrationBarrier: true, Flex: true, Icon: true }

type Modules = { App: typeof App; steps: typeof steps }

/** A document whose load check has not run: the check settles once per document. */
async function freshDocument(): Promise<Modules> {
	vi.resetModules()
	return { steps: await import("./steps"), App: (await import("./app.vue")).default }
}

async function reloadOn(path: string, state: Record<string, unknown>, doc: Modules) {
	// Create clears on mount as the form pages do; Welcome and Done do not.
	const page = (name: string, clears: boolean) =>
		defineComponent({ name, setup: () => onMounted(() => clears && doc.steps.clearFlowPath()), template: "<div />" })
	const routes = [
		{ path: "/onboarding/welcome", component: page("welcome", false) },
		{ path: "/onboarding/create", component: page("create", true) },
		{ path: "/onboarding/done", component: page("done", false) },
	]
	window.history.replaceState(state, "", `#${path}`)
	const router = createRouter({ history: createWebHashHistory(), routes })
	const errorHandler = vi.fn()
	const shell = mount(doc.App, { global: { plugins: [router, createPinia()], stubs: STUBS, config: { errorHandler } } })
	await router.isReady()
	await flushPromises()
	return { router, shell, errorHandler, mark: () => doc.steps.donePath(window.history.state) }
}

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

type Check = ReturnType<typeof deferred<{ id: string } | null>>

beforeEach(() => {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
	)
})

afterEach(() => {
	hydrateKnownProfile.mockReset()
	vi.unstubAllGlobals()
})

describe("onboarding's load check and the pages it races", () => {
	test("a page mounted while the check is pending keeps the mark, and the check resumes at Ready on it", async () => {
		const check = deferred<{ id: string } | null>()
		hydrateKnownProfile.mockReturnValue(check.promise)
		const { router, shell, mark } = await reloadOn("/onboarding/create", { onboardingPath: "password" }, await freshDocument())
		expect(router.currentRoute.value.path).toBe("/onboarding/create")
		expect(mark()).toBe("password")

		check.resolve({ id: "p1" })
		await flushPromises()
		expect(router.currentRoute.value.path).toBe("/onboarding/done")
		expect(mark()).toBe("password")
		shell.unmount()
	})

	test("a check that fails leaves the form it shows unmarked", async () => {
		const check = deferred<{ id: string } | null>()
		hydrateKnownProfile.mockReturnValue(check.promise)
		const { router, shell, errorHandler, mark } = await reloadOn(
			"/onboarding/create",
			{ onboardingPath: "password" },
			await freshDocument(),
		)
		expect(mark()).toBe("password")

		check.reject(new Error("worker unreachable"))
		await flushPromises()
		expect(errorHandler).toHaveBeenCalledTimes(1)
		expect(router.currentRoute.value.path).toBe("/onboarding/create")
		expect(mark()).toBeUndefined()
		shell.unmount()
	})

	test.each([
		["resolves", (check: Check) => check.resolve({ id: "p1" })],
		["rejects", (check: Check) => check.reject(new Error("worker unreachable"))],
	])("a flow that marks while the check is pending keeps its mark and its page when the check %s", async (_, settle) => {
		const check: Check = deferred()
		hydrateKnownProfile.mockReturnValue(check.promise)
		const doc = await freshDocument()
		const { router, shell, mark } = await reloadOn("/onboarding/create", {}, doc)
		doc.steps.markFlowPath("password")

		settle(check)
		await flushPromises()
		expect(router.currentRoute.value.path).toBe("/onboarding/create")
		expect(mark()).toBe("password")
		shell.unmount()
	})

	test("once the check has settled, Back onto a marked form clears its mark", async () => {
		hydrateKnownProfile.mockResolvedValue(null)
		const { router, shell, mark } = await reloadOn("/onboarding/create", {}, { App, steps })
		steps.markFlowPath("passkey")
		await router.push("/onboarding/welcome")

		const landed = new Promise<void>((resolve) => {
			const stop = router.afterEach(() => {
				stop()
				resolve()
			})
		})
		router.back()
		await landed
		await flushPromises()
		expect(router.currentRoute.value.path).toBe("/onboarding/create")
		expect(mark()).toBeUndefined()
		shell.unmount()
	})
})
