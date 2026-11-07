import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Router } from "vue-router"
import type { ToastOptions } from "@/composables/toast"

const surface = vi.hoisted(() => ({
	handsBack: false,
	calls: [] as string[],
	returnToPanel: vi.fn(),
	release: vi.fn(),
}))
vi.mock("@/utils/own-window", () => ({
	handsBackToPanel: () => surface.handsBack,
	returnToPanel: (...args: unknown[]) => {
		surface.calls.push("hand back")
		surface.returnToPanel(...args)
		return Promise.resolve(true)
	},
	releaseOwnWindow: () => {
		surface.calls.push("release")
		surface.release()
		return Promise.resolve()
	},
}))

import { landOpenedProfile } from "./opening-flow"

const IMPORTED = { kind: "success", label: "Profile imported" } as const
const UNLOCK = { kind: "success", label: "Profile imported. Unlock to continue" } as const

let router: { push: ReturnType<typeof vi.fn<Router["push"]>> }
let openToast: ReturnType<typeof vi.fn<(toast: ToastOptions) => unknown>>

beforeEach(() => {
	surface.handsBack = false
	surface.calls = []
	surface.returnToPanel.mockClear()
	surface.release.mockClear()
	router = {
		push: vi.fn<Router["push"]>(async () => {
			surface.calls.push("route")
		}),
	}
	openToast = vi.fn<(toast: ToastOptions) => unknown>(() => surface.calls.push("toast"))
})

describe("landing an opened profile", () => {
	test("an own window still in its flow hands Home and the panel's line back, and does nothing else", () => {
		surface.handsBack = true
		landOpenedProfile(router, openToast, { profileId: "p1", route: "/popup/auth", line: UNLOCK, panelLine: IMPORTED })

		expect(surface.returnToPanel).toHaveBeenCalledExactlyOnceWith("/popup/general", { snack: IMPORTED, profileId: "p1" })
		expect(surface.calls).toEqual(["hand back"])
	})

	test("any other document releases its window, then shows its line, then routes, before it returns", () => {
		landOpenedProfile(router, openToast, { profileId: "p1", route: "/popup/auth", line: UNLOCK, panelLine: IMPORTED })

		expect(surface.calls).toEqual(["release", "toast", "route"])
		expect(openToast).toHaveBeenCalledExactlyOnceWith(UNLOCK)
		expect(router.push).toHaveBeenCalledExactlyOnceWith("/popup/auth")
		expect(surface.returnToPanel).not.toHaveBeenCalled()
	})
})
