import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { defineComponent } from "vue"
import type { ConfigProp } from "@/wallet/config"

const fakes = vi.hoisted(() => ({ config: undefined as unknown, openToast: vi.fn() }))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return fakes.config
	}),
}))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: fakes.openToast }) }))
vi.mock("@/components/ui/Dropdown", () => ({
	Dropdown: { template: '<div><slot name="trigger" /><slot name="popup" /></div>' },
}))

import PrivacyPage from "./privacy.vue"

const Toggle = defineComponent({
	props: { modelValue: Boolean },
	emits: ["update:modelValue"],
	template: '<div :data-on="String(modelValue)" />',
})

let config: {
	getProps: ReturnType<typeof vi.fn>
	setValue: ReturnType<typeof vi.fn>
	onUpdate: EventHandler<ConfigProp>
	disconnect: ReturnType<typeof vi.fn>
}

beforeEach(() => {
	fakes.openToast.mockReset()
	config = {
		getProps: vi.fn(async () => [
			{ key: "showFiatValues", value: true },
			{ key: "defaultExplorer", value: "aztecscan" },
		]),
		setValue: vi.fn(async () => undefined),
		onUpdate: new EventHandler<ConfigProp>(),
		disconnect: vi.fn(),
	}
	fakes.config = config
})

async function mountPrivacy() {
	const wrapper = mount(PrivacyPage, {
		global: {
			components: { Toggle },
			stubs: {
				SettingsPageShell: { props: ["title", "backTo"], template: '<div :data-title="title" :data-back="backTo"><slot /></div>' },
				LoadingState: true,
				Flex: { template: "<div><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				Icon: true,
				DropdownTrigger: { template: "<button><slot /></button>" },
				DropdownItem: { template: "<div><slot /></div>" },
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe("settings/privacy", () => {
	test("is titled Privacy, goes back to Settings, and shows the fiat toggle as read", async () => {
		const w = await mountPrivacy()
		expect(w.get("[data-title]").attributes()).toMatchObject({ "data-title": "Privacy", "data-back": "/popup/settings" })
		expect(w.get('[data-testid="fiat-values-toggle"]').attributes("data-on")).toBe("true")
		expect(w.text()).toContain("Fetch USD prices from CoinGecko while unlocked. Off hides all dollar values")
	})

	test("the fiat toggle writes its new value", async () => {
		const w = await mountPrivacy()
		w.getComponent(Toggle).vm.$emit("update:modelValue", false)
		await flushPromises()
		expect(config.setValue).toHaveBeenCalledExactlyOnceWith("showFiatValues", false)
		expect(w.get('[data-testid="fiat-values-toggle"]').attributes("data-on")).toBe("false")
	})

	test("the explorer trigger names the chosen explorer, and None turns links off with a toast", async () => {
		const w = await mountPrivacy()
		expect(w.get('[data-testid="explorer-trigger"]').text()).toBe("Aztecscan")
		expect(w.find('[data-testid="explorer-aztecscan-btn"]').exists()).toBe(true)
		await w.get('[data-testid="explorer-none-btn"]').trigger("click")
		await flushPromises()
		expect(config.setValue).toHaveBeenCalledExactlyOnceWith("defaultExplorer", null)
		expect(fakes.openToast).toHaveBeenCalledWith({ kind: "success", label: "Default explorer updated" })
		expect(w.get('[data-testid="explorer-trigger"]').text()).toBe("None")
	})

	test("(BUG PIN) a failed write leaves the attempted value showing, and asking for it again writes nothing", async () => {
		// The worker announces a write before it persists it, so the page has applied the value by
		// the time the write fails; the next request for that value then looks like a no-op.
		config.setValue.mockImplementationOnce(async (key: string, value: unknown) => {
			config.onUpdate.invoke({ key, value } as ConfigProp)
			throw new Error("persist failed")
		})
		const w = await mountPrivacy()
		const toggle = w.getComponent(Toggle)
		toggle.vm.$emit("update:modelValue", false)
		await flushPromises()
		expect(fakes.openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to update setting" })
		expect(w.get('[data-testid="fiat-values-toggle"]').attributes("data-on")).toBe("false")
		toggle.vm.$emit("update:modelValue", false)
		await flushPromises()
		expect(config.setValue).toHaveBeenCalledTimes(1)
	})
})
