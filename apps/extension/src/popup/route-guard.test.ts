/**
 * Seam tests for the popup router guard (extracted from `popup/index.ts`, which mounts on import):
 * the decision table, and the two cold-boot invariants — the early branches make NO service calls
 * and call `next` SYNCHRONOUSLY, before the guard callback's promise resolves.
 */
import { describe, expect, test, vi } from "vitest"
import type { RouteLocationNormalized } from "vue-router"

const gateMock = vi.fn()
const lastActiveMock = vi.fn()
vi.mock("./auth-guard", () => ({ authRequiredGate: (...args: unknown[]) => gateMock(...args) }))
vi.mock("@/utils/lastActiveProfile", () => ({ getLastActiveProfileId: () => lastActiveMock() }))

import { createPopupGuard, earlyDecision, lateDecision } from "./route-guard"
import { createStartGrace, START_GRACE_MS } from "./start-grace"

const route = (name: string, meta: Record<string, unknown> = {}) => ({ name, meta }) as unknown as RouteLocationNormalized
const store = (over: Record<string, unknown> = {}) =>
	({ isRegistered: false, isLogined: false, isSessionChecked: true, profile: undefined, ...over }) as never
const profileApi = () => ({
	getActiveProfile: vi.fn(async () => undefined),
	getProfiles: vi.fn(async () => [] as never[]),
})
/** A service that is already Ready: the grace never waits. */
const readyGrace = () => ({ ready: vi.fn(async () => true), markProvisional: vi.fn(), settle: vi.fn(), replay: vi.fn() })

describe("earlyDecision (synchronous)", () => {
	test("a passkey interaction proceeds; register-when-registered and auth-when-logined bounce to `from` (or general)", () => {
		expect(earlyDecision(route("x", { isPasskeyInteraction: true }), route("y"), store())).toEqual({ kind: "proceed" })
		expect(earlyDecision(route("popup-register"), route("popup-home"), store({ isRegistered: true }))).toEqual({
			kind: "redirect",
			to: { name: "popup-home" },
		})
		expect(earlyDecision(route("popup-auth"), { name: undefined, meta: {} } as never, store({ isLogined: true }))).toEqual({
			kind: "redirect",
			to: { name: "popup-general" },
		})
		expect(earlyDecision(route("popup-register"), route("y"), store())).toBeUndefined()
		expect(earlyDecision(route("popup-auth"), route("y"), store())).toBeUndefined()
	})
})

describe("lateDecision", () => {
	test("auth-required while not logged in consults the gate; `auth` redirects, anything else falls through", async () => {
		const api = profileApi()
		gateMock.mockResolvedValueOnce("auth")
		expect(await lateDecision(route("p", { isAuthRequired: true }), store({ profile: { id: "p1" } }), api, readyGrace())).toEqual({
			name: "popup-auth",
		})
		gateMock.mockResolvedValueOnce("proceed")
		expect(
			await lateDecision(route("p", { isAuthRequired: true }), store({ profile: { id: "p1" } }), api, readyGrace()),
		).toBeUndefined()
		expect(gateMock).toHaveBeenCalledTimes(2)
	})

	test("no profile: selects the last active (else the first), or redirects to register when there are none", async () => {
		const api = profileApi()
		api.getProfiles.mockResolvedValueOnce([{ id: "a" }, { id: "b" }] as never)
		lastActiveMock.mockResolvedValueOnce("b")
		const s = store()
		expect(await lateDecision(route("popup-general"), s, api, readyGrace())).toBeUndefined()
		expect((s as { profile?: { id: string } }).profile).toEqual({ id: "b" })

		api.getProfiles.mockResolvedValueOnce([{ id: "a" }] as never)
		lastActiveMock.mockResolvedValueOnce(null)
		const s2 = store()
		await lateDecision(route("popup-general"), s2, api, readyGrace())
		expect((s2 as { profile?: { id: string } }).profile).toEqual({ id: "a" })

		api.getProfiles.mockResolvedValueOnce([])
		expect(await lateDecision(route("popup-general"), store(), api, readyGrace())).toEqual({ name: "popup-register" })
		// The onboarding routes never trigger the selection.
		expect(await lateDecision(route("popup-import"), store(), api, readyGrace())).toBeUndefined()
		expect(api.getProfiles).toHaveBeenCalledTimes(3)
	})

	test("a password-only route bounces a passkey profile to settings", async () => {
		expect(
			await lateDecision(
				route("p", { requirePasswordProfile: true }),
				store({ profile: { id: "p", type: "passkey" } }),
				profileApi(),
				readyGrace(),
			),
		).toEqual({
			path: "/popup/settings/profile",
		})
		expect(
			await lateDecision(
				route("p", { requirePasswordProfile: true }),
				store({ profile: { id: "p", type: "password" } }),
				profileApi(),
				readyGrace(),
			),
		).toBeUndefined()
	})
})

describe("createPopupGuard — cold-boot contract", () => {
	test("early branches call next SYNCHRONOUSLY, before the callback's promise settles, and touch no service", () => {
		const api = profileApi()
		const guard = createPopupGuard(
			() => store({ isLogined: true }),
			() => api,
			readyGrace(),
		)
		const next = vi.fn()
		const pending = guard(route("popup-auth"), route("popup-home"), next)
		expect(next).toHaveBeenCalledWith({ name: "popup-home" })
		expect(api.getActiveProfile).not.toHaveBeenCalled()
		expect(api.getProfiles).not.toHaveBeenCalled()
		expect(gateMock).not.toHaveBeenCalled()
		return pending
	})

	test("the late path calls next exactly once with the decision (or bare)", async () => {
		const api = profileApi()
		api.getProfiles.mockResolvedValueOnce([])
		const guard = createPopupGuard(
			() => store(),
			() => api,
			readyGrace(),
		)
		const next = vi.fn()
		await guard(route("popup-general"), route("x"), next)
		expect(next).toHaveBeenCalledTimes(1)
		expect(next).toHaveBeenCalledWith({ name: "popup-register" })

		const next2 = vi.fn()
		await guard(route("popup-import"), route("x"), next2)
		expect(next2).toHaveBeenCalledTimes(1)
		expect(next2).toHaveBeenCalledWith()
	})
})

describe("lateDecision — the page-load grace", () => {
	/** A grace on a fake clock whose Ready comes at `readyAt` ms after page load, or never. */
	function graceOn(readyAt?: number) {
		let ready = false
		const replace = vi.fn(async () => undefined)
		const waitForReady = vi.fn(
			(ms: number) =>
				new Promise<boolean>((resolve) => {
					if (readyAt !== undefined && readyAt - Date.now() <= ms) {
						setTimeout(
							() => {
								ready = true
								resolve(true)
							},
							Math.max(0, readyAt - Date.now()),
						)
					} else setTimeout(() => resolve(false), ms)
				}),
		)
		const grace = createStartGrace({ deadline: START_GRACE_MS, now: Date.now, isReady: () => ready, waitForReady, replace })
		return {
			grace,
			waitForReady,
			replace,
			setReady: () => {
				ready = true
			},
		}
	}

	test("past the grace with no Ready, an unchecked session goes to the unlock screen with no read, provisionally; later navigations do not wait", async () => {
		vi.useFakeTimers({ now: 0 })
		try {
			const api = profileApi()
			const { grace, waitForReady, replace, setReady } = graceOn()
			const s = store({ isSessionChecked: false })
			const first = lateDecision(route("popup-general", { isAuthRequired: true }), s, api, grace)
			await vi.advanceTimersByTimeAsync(START_GRACE_MS)
			expect(await first).toEqual({ name: "popup-auth" })
			expect(gateMock).not.toHaveBeenCalled()
			expect(api.getProfiles).not.toHaveBeenCalled()
			expect((s as { profile?: unknown }).profile).toBeUndefined()

			const auth = { ...route("popup-auth"), path: "/popup/auth", query: {}, hash: "" } as RouteLocationNormalized
			expect(await lateDecision(auth, s, api, grace)).toBeUndefined()
			expect(waitForReady).toHaveBeenCalledTimes(1)
			expect(api.getProfiles).not.toHaveBeenCalled()

			grace.replay()
			expect(replace).not.toHaveBeenCalled()
			setReady()
			grace.replay()
			expect(replace).toHaveBeenCalledWith(expect.objectContaining({ path: "/popup/auth", force: true }))
		} finally {
			vi.useRealTimers()
		}
	})

	test("a Ready inside the grace decides with the reads, as before; a checked session never waits", async () => {
		vi.useFakeTimers({ now: 0 })
		try {
			const api = profileApi()
			api.getProfiles.mockResolvedValueOnce([{ id: "a" }] as never)
			lastActiveMock.mockResolvedValueOnce(null)
			const { grace, waitForReady } = graceOn(120)
			const s = store({ isSessionChecked: false })
			const decision = lateDecision(route("popup-auth"), s, api, grace)
			await vi.advanceTimersByTimeAsync(120)
			expect(await decision).toBeUndefined()
			expect((s as { profile?: { id: string } }).profile).toEqual({ id: "a" })

			const checked = graceOn()
			expect(await lateDecision(route("popup-auth"), store({ profile: { id: "a" } }), api, checked.grace)).toBeUndefined()
			expect(checked.waitForReady).not.toHaveBeenCalled()
			expect(waitForReady).toHaveBeenCalledTimes(1)
		} finally {
			vi.useRealTimers()
		}
	})

	test("a profile the boot run selects while the guard reads stands; with none selected, even the reset's `0`, the last active is chosen", async () => {
		let answerLastActive!: (id: string) => void
		lastActiveMock.mockImplementation(() => new Promise((resolve) => (answerLastActive = resolve)))
		const api = profileApi()
		api.getProfiles.mockResolvedValue([{ id: "a" }, { id: "b" }] as never)

		const raced = store() as { profile?: { id: string } }
		const pending = lateDecision(route("popup-auth"), raced as never, api, readyGrace())
		await vi.waitFor(() => expect(answerLastActive).toBeTypeOf("function"))
		raced.profile = { id: "b" }
		answerLastActive("a")
		await pending
		expect(raced.profile).toEqual({ id: "b" })

		// The last profile's deletion leaves `profile` as `0`, not undefined.
		const quiet = store() as { profile?: { id: string } | 0 }
		quiet.profile = 0
		const control = lateDecision(route("popup-auth"), quiet as never, api, readyGrace())
		await vi.waitFor(() => expect(lastActiveMock).toHaveBeenCalledTimes(2))
		answerLastActive("a")
		await control
		expect(quiet.profile).toEqual({ id: "a" })
		lastActiveMock.mockReset()
	})
})
