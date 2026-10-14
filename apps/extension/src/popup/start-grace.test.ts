/**
 * The replay of a route decided without the service, through a real router and the real guard: a
 * popup that opened before the background's Ready must end where the guard's reads would have sent
 * it, whatever screen the grace showed first.
 */
import { describe, expect, test, vi } from "vitest"
import { createMemoryHistory, createRouter } from "vue-router"

const lastActiveMock = vi.fn(async (): Promise<string | undefined> => undefined)
vi.mock("@/utils/lastActiveProfile", () => ({ getLastActiveProfileId: () => lastActiveMock() }))

import { createPopupGuard } from "./route-guard"
import { createStartGrace } from "./start-grace"

const page = { template: "<div />" }
type Profile = { id: string; name: string; type: "password" | "passkey" }

function popup(getProfiles: () => Promise<Profile[]>) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: "/popup/general", name: "popup-general", component: page, meta: { isAuthRequired: true } },
			{ path: "/popup/auth", name: "popup-auth", component: page },
			{ path: "/popup/register", name: "popup-register", component: page },
			{ path: "/popup/settings/profile", name: "popup-settings-profile", component: page },
			{ path: "/popup/password-only", name: "popup-password-only", component: page, meta: { requirePasswordProfile: true } },
		],
	})
	let ready = false
	const replace = vi.fn((to: Parameters<typeof router.replace>[0]) => router.replace(to))
	// The page-load grace has already run out: every unchecked navigation is provisional.
	const grace = createStartGrace({ deadline: 0, now: () => 1, isReady: () => ready, waitForReady: async () => false, replace })
	const store = {
		isLogined: false,
		isSessionChecked: false,
		profile: undefined as Profile | undefined,
		// As the app store derives it.
		get isRegistered() {
			return !!this.profile
		},
	}
	const api = { getActiveProfile: vi.fn(async () => undefined), getProfiles: vi.fn(getProfiles) }
	router.beforeEach(
		createPopupGuard(
			() => store as never,
			() => api as never,
			grace,
		),
	)
	const settled = () => new Promise((resolve) => setTimeout(resolve, 0))
	return {
		router,
		grace,
		store,
		api,
		replace,
		settled,
		setReady: () => {
			ready = true
		},
	}
}

const alice: Profile = { id: "a", name: "Alice", type: "password" }
const bob: Profile = { id: "b", name: "Bob", type: "password" }
const key: Profile = { id: "k", name: "Key", type: "passkey" }

describe("the replay of a provisional route", () => {
	test("on Ready it is replayed once, with force, and the reads send an empty wallet to register", async () => {
		const p = popup(async () => [])
		await p.router.push("/popup/general")
		expect(p.router.currentRoute.value.name).toBe("popup-auth")
		expect(p.api.getProfiles).not.toHaveBeenCalled()

		p.setReady()
		p.grace.replay()
		await p.settled()
		expect(p.replace).toHaveBeenCalledTimes(1)
		expect(p.replace).toHaveBeenCalledWith(expect.objectContaining({ path: "/popup/auth", force: true }))
		expect(p.router.currentRoute.value.name).toBe("popup-register")
	})

	test("the reads select the last active profile on the unlock screen", async () => {
		lastActiveMock.mockResolvedValueOnce("b")
		const p = popup(async () => [alice, bob])
		await p.router.push("/popup/general")
		expect(p.store.profile).toBeUndefined()

		p.setReady()
		p.grace.replay()
		await p.settled()
		expect(p.router.currentRoute.value.name).toBe("popup-auth")
		expect(p.store.profile).toEqual(bob)
	})

	test("a passkey profile on a password-only route goes to the profile settings", async () => {
		const p = popup(async () => [key])
		await p.router.push("/popup/password-only")
		expect(p.router.currentRoute.value.name).toBe("popup-password-only")

		p.setReady()
		p.grace.replay()
		await p.settled()
		expect(p.router.currentRoute.value.path).toBe("/popup/settings/profile")
	})

	test("a failed read keeps the mark and the next trigger replays again; completed reads clear it", async () => {
		let fail = true
		const p = popup(async () => {
			if (fail) throw new Error("Client disconnected")
			return [alice]
		})
		await p.router.push("/popup/general")
		p.setReady()
		p.grace.replay()
		await p.settled()
		expect(p.api.getProfiles).toHaveBeenCalledTimes(1)
		expect(p.store.profile).toBeUndefined()

		fail = false
		p.grace.replay()
		await p.settled()
		expect(p.store.profile).toEqual(alice)
		expect(p.replace).toHaveBeenCalledTimes(2)

		p.grace.replay()
		await p.settled()
		expect(p.replace).toHaveBeenCalledTimes(2)
	})
})
