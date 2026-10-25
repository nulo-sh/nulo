import { createTestingPinia } from "@pinia/testing"
import { mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { reactive } from "vue"
import { Flex, Text } from "@nulo/design"
import ForgotPasswordPopup from "./ForgotPasswordPopup.vue"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("vue-router", () => ({ useRouter: () => router }))
vi.mock("@/composables/usePopupStack", () => ({ usePopupStack: () => ({ order: 0, depth: 0 }) }))
const appStore = vi.hoisted(() => ({ value: { profile: { type: "password" } as { type: string } | null } }))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => appStore.value }))

const mountPopup = (type: "password" | "passkey" = "password") => {
	appStore.value = reactive({ profile: { type } })
	return mount(ForgotPasswordPopup, {
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
}

describe("Lost your password?", () => {
	test("warns that imported accounts go with the profile and the phrase cannot restore them", () => {
		const w = mountPopup()
		const warning = w.get('[data-testid="forgot-imported-warning"]')
		expect(warning.text()).toBe("Accounts you imported are lost with this profile. The recovery phrase can't bring them back.")
		expect(warning.get("i").attributes()).toMatchObject({ name: "warning", "aria-hidden": "true" })
	})

	test.each([
		["password", "Lost your password?", "Password recovery is not possible."],
		["passkey", "Lost your passkey?", "A lost passkey can't be recovered."],
	] as const)("a %s profile is told its own loss, and how to come back", (type, title, lead) => {
		const w = mountPopup(type)
		expect(w.get('[data-testid="forgot-title"]').text()).toBe(title)
		expect(w.text()).toContain(`${lead} Delete this profile, then re-import it with its recovery phrase.`)
		expect(w.find('[data-testid="forgot-imported-warning"]').exists()).toBe(true)
	})

	test("Delete profile still leads to the delete page", async () => {
		const w = mountPopup()
		await w.get('[data-testid="forgot-reset-btn"]').trigger("click")
		expect(router.push).toHaveBeenCalledWith("/popup/settings/security/reset")
	})
})
