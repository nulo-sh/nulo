import { createTestingPinia } from "@pinia/testing"
import { mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { Flex, Text } from "@nulo/design"
import ForgotPasswordPopup from "./ForgotPasswordPopup.vue"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("vue-router", () => ({ useRouter: () => router }))
vi.mock("@/composables/usePopupStack", () => ({ usePopupStack: () => ({ order: 0, depth: 0 }) }))

const mountPopup = () =>
	mount(ForgotPasswordPopup, {
		props: { show: true },
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			components: { Flex, Text },
			stubs: {
				Popup: { template: "<div><slot /></div>" },
				PopupCard: { template: "<div><slot /></div>" },
				ItemsContainer: { template: "<div><slot /></div>" },
				SettingItem: { inheritAttrs: false, template: "<button v-bind='$attrs' />" },
				Icon: { inheritAttrs: false, template: "<i v-bind='$attrs' />" },
			},
		},
	})

describe("Lost your password?", () => {
	test("warns that imported accounts go with the profile and the phrase cannot restore them", () => {
		const w = mountPopup()
		const warning = w.get('[data-testid="forgot-imported-warning"]')
		expect(warning.text()).toBe("Accounts you imported are lost with this profile. The recovery phrase can't bring them back.")
		expect(warning.get("i").attributes()).toMatchObject({ name: "warning", "aria-hidden": "true" })
	})

	test("Delete profile still leads to the delete page", async () => {
		const w = mountPopup()
		await w.get('[data-testid="forgot-reset-btn"]').trigger("click")
		expect(router.push).toHaveBeenCalledWith("/popup/settings/security/reset")
	})
})
