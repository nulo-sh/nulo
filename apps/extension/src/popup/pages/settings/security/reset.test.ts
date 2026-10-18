/**
 * Delete Profile's own client and the page's lifecycle. Deleting the open profile locks the wallet,
 * and the lock routes away from this page before the purge returns: the reset must still finish.
 */
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { Flex, Text } from "@nulo/design"

const client = vi.hoisted(() => {
	let reject: ((error: Error) => void) | undefined
	return {
		deleteProfile: vi.fn(),
		// As the real client: a disconnect rejects the call in flight.
		disconnect: vi.fn(() => reject?.(new Error("Client disconnected"))),
		pending(): { resolve: (value: unknown) => void } {
			let resolve: (value: unknown) => void = () => {}
			client.deleteProfile.mockReturnValueOnce(
				new Promise((res, rej) => {
					resolve = res
					reject = rej
				}),
			)
			return { resolve: (value) => resolve(value) }
		},
	}
})
vi.mock("@/wallet/services/profile/client", () => ({ deleteProfileClient: () => client }))
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("vue-router", () => ({ useRouter: () => router, useRoute: () => ({ query: {}, meta: {} }) }))
const openToast = vi.hoisted(() => vi.fn())
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast }) }))

import { useAppStore } from "@/stores/app.store"
import type { ProfileInfo } from "@/wallet/services/profile/spec"
import Reset from "./reset.vue"

const main: ProfileInfo = { id: "p1", name: "Main", type: "password" }
const other: ProfileInfo = { id: "p2", name: "Other", type: "password" }

async function mountReady() {
	const pinia = createTestingPinia({ createSpy: vi.fn, initialState: { app: { profile: main, profiles: [main, other] } } })
	const w = mount(Reset, {
		global: {
			plugins: [pinia],
			components: { Flex, Text },
			stubs: {
				CollapsingHeroLayout: { template: "<div><slot /><slot name='bottom' /></div>" },
				ItemsContainer: { template: "<div><slot /></div>" },
				SettingItem: true,
				Checkbox: {
					emits: ["update:modelValue"],
					template: "<input type='checkbox' @change=\"$emit('update:modelValue', true)\" />",
				},
				Input: { emits: ["update:modelValue"], template: "<input @input=\"$emit('update:modelValue', $event.target.value)\" />" },
				Button: { template: "<button><slot /></button>" },
			},
		},
	})
	for (const id of ["reset-checkbox-permanent", "reset-checkbox-undone", "reset-checkbox-sure"]) {
		await w.get(`[data-testid="${id}"]`).trigger("change")
	}
	await w.get('[data-testid="reset-confirm-input"]').setValue("Main")
	return { w, app: useAppStore(pinia) }
}

beforeEach(() => {
	vi.clearAllMocks()
	installChromeStorage({}, { persist: false })
})

describe("Delete Profile's client", () => {
	test("a page the lock unmounts mid-deletion still finishes the reset, and lets go of its client only then", async () => {
		const call = client.pending()
		const { w, app } = await mountReady()
		await w.get('[data-testid="reset-submit-btn"]').trigger("click")
		expect(client.deleteProfile).toHaveBeenCalledWith("p1")

		w.unmount()
		expect(client.disconnect).not.toHaveBeenCalled()

		call.resolve(main)
		await flushPromises()
		expect(client.disconnect).toHaveBeenCalledTimes(1)
		expect(app.profiles).toEqual([other])
		expect(app.profile).toEqual(other)
		expect(openToast).toHaveBeenCalledWith({ kind: "success", label: "Profile deleted" })
		expect(router.push).toHaveBeenCalledWith("/popup/auth")
	})

	test("a profile unlocked while the deletion runs keeps its session and route", async () => {
		const call = client.pending()
		const { w, app } = await mountReady()
		await w.get('[data-testid="reset-submit-btn"]').trigger("click")
		w.unmount()
		const third: ProfileInfo = { id: "p3", name: "Third", type: "password" }
		app.profiles = [main, other, third]
		app.profile = third
		app.isLogined = true

		call.resolve(main)
		await flushPromises()
		expect(app.profiles).toEqual([other, third])
		expect(app.profile).toEqual(third)
		expect(app.isLogined).toBe(true)
		expect(openToast).toHaveBeenCalledWith({ kind: "success", label: "Profile deleted" })
		expect(router.push).not.toHaveBeenCalled()
		expect(client.disconnect).toHaveBeenCalledTimes(1)
	})

	test("a page left with no deletion running lets go of its client at once", async () => {
		const { w } = await mountReady()
		w.unmount()
		expect(client.disconnect).toHaveBeenCalledTimes(1)
	})
})
