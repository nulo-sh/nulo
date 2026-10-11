import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ConfigProp } from "@/wallet/config"

const fakes = vi.hoisted(() => ({ config: undefined as unknown }))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return fakes.config
	}),
}))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/components/ui/Dropdown", () => ({
	Dropdown: { template: '<div><slot name="trigger" /><slot name="popup" /></div>' },
}))

import DisplayPage from "./display.vue"

let config: {
	getProps: ReturnType<typeof vi.fn>
	setValue: ReturnType<typeof vi.fn>
	onUpdate: EventHandler<ConfigProp>
	onConnected: EventHandler<void>
	disconnect: ReturnType<typeof vi.fn>
}

beforeEach(() => {
	config = {
		getProps: vi.fn(async () => [{ key: "theme", value: "dark" }] as ConfigProp[]),
		setValue: vi.fn(async () => undefined),
		onUpdate: new EventHandler<ConfigProp>(),
		onConnected: new EventHandler<void>(),
		disconnect: vi.fn(),
	}
	fakes.config = config
})
afterEach(() => vi.restoreAllMocks())

async function mountDisplay() {
	const wrapper = mount(DisplayPage, {
		global: {
			stubs: {
				SubPageHeader: true,
				SectionLabel: true,
				Toggle: true,
				Icon: true,
				Flex: { template: "<div><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				DropdownTrigger: { template: "<button><slot /></button>" },
				DropdownItem: { template: "<div><slot /></div>" },
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe("settings/display", () => {
	test("a read the drop rejected is made again on the reconnect, and the page loads", async () => {
		// The mount's request opens the port, as the real client's first request does, and the drop rejects it.
		config.getProps.mockImplementationOnce(async () => {
			config.onConnected.invoke()
			throw new Error("Client disconnected")
		})
		const w = await mountDisplay()
		expect(w.find('[data-testid="theme-trigger"]').exists()).toBe(false)
		config.onConnected.invoke()
		await flushPromises()
		expect(config.getProps).toHaveBeenCalledTimes(2)
		expect(w.get('[data-testid="theme-trigger"]').text()).toBe("dark")
	})

	test("a reread that finds the side panel setting changed shows it and closes nothing", async () => {
		// The side panel row exists only where the browser has the API, and applying it closes the window.
		const sidePanel = { open: vi.fn() }
		Object.assign(chrome, { sidePanel, windows: { getCurrent: vi.fn(async () => ({ id: 1 })) } })
		const close = vi.spyOn(window, "close").mockImplementation(() => {})
		config.getProps.mockImplementationOnce(async () => {
			config.onConnected.invoke()
			return [{ key: "sidePanel", value: false }] as ConfigProp[]
		})
		const w = await mountDisplay()
		const sidePanelToggle = () => w.findAll("toggle-stub")[0]
		expect(sidePanelToggle().attributes("modelvalue")).toBe("false")
		config.getProps.mockResolvedValueOnce([{ key: "sidePanel", value: true }] as ConfigProp[])
		config.onConnected.invoke()
		await flushPromises()
		expect(sidePanelToggle().attributes("modelvalue")).toBe("true")
		expect(close).not.toHaveBeenCalled()
		expect(sidePanel.open).not.toHaveBeenCalled()
	})
})
