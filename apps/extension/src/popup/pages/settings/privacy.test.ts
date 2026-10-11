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
	onConnected: EventHandler<void>
	disconnect: ReturnType<typeof vi.fn>
}

const stored = (showFiatValues = true) =>
	[
		{ key: "showFiatValues", value: showFiatValues },
		{ key: "defaultExplorer", value: "aztecscan" },
	] as ConfigProp[]

beforeEach(() => {
	fakes.openToast.mockReset()
	config = {
		getProps: vi.fn(async () => stored()),
		setValue: vi.fn(async () => undefined),
		onUpdate: new EventHandler<ConfigProp>(),
		onConnected: new EventHandler<void>(),
		disconnect: vi.fn(),
	}
	fakes.config = config
})

/** The mount's read: its request opens the port, as the real client's first request does. */
function mountReadOpensPort(answer: () => Promise<ConfigProp[]>) {
	config.getProps.mockImplementationOnce(() => {
		config.onConnected.invoke()
		return answer()
	})
}

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

	test("a failed write leaves the stored value showing, and asking for it again writes again", async () => {
		// The worker persists before it announces, so a failed write announces nothing.
		config.setValue.mockRejectedValueOnce(new Error("persist failed"))
		const w = await mountPrivacy()
		const toggle = w.getComponent(Toggle)
		toggle.vm.$emit("update:modelValue", false)
		await flushPromises()
		expect(fakes.openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to update setting" })
		expect(w.get('[data-testid="fiat-values-toggle"]').attributes("data-on")).toBe("true")
		toggle.vm.$emit("update:modelValue", false)
		await flushPromises()
		expect(config.setValue).toHaveBeenCalledTimes(2)
		expect(w.get('[data-testid="fiat-values-toggle"]').attributes("data-on")).toBe("false")
	})

	describe("a port that drops under the mounted page", () => {
		const fiat = (w: Awaited<ReturnType<typeof mountPrivacy>>) => w.find('[data-testid="fiat-values-toggle"]')

		test("a read the drop rejected is made again on the reconnect, and the page loads", async () => {
			mountReadOpensPort(async () => {
				throw new Error("Client disconnected")
			})
			const w = await mountPrivacy()
			expect(fiat(w).exists()).toBe(false)
			config.onConnected.invoke()
			await flushPromises()
			expect(config.getProps).toHaveBeenCalledTimes(2)
			expect(fiat(w).attributes("data-on")).toBe("true")
		})

		test("an update during a held reread beats the reread's older value", async () => {
			mountReadOpensPort(async () => stored(true))
			const w = await mountPrivacy()
			const reread = Promise.withResolvers<ConfigProp[]>()
			config.getProps.mockReturnValueOnce(reread.promise)
			config.onConnected.invoke()
			config.onUpdate.invoke({ key: "showFiatValues", value: false } as ConfigProp)
			await flushPromises()
			reread.resolve(stored(true))
			await flushPromises()
			expect(fiat(w).attributes("data-on")).toBe("false")
		})
	})
})
