import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ConfigProp } from "@/wallet/config"
import { expectOwnedRows, settingsContext, settingsRouter } from "../../../../tests/helpers/settings-rows"

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

import DisplayPage from "./display.vue"

let config: {
	getProps: ReturnType<typeof vi.fn>
	setValue: ReturnType<typeof vi.fn>
	isConnected: boolean
	onUpdate: EventHandler<ConfigProp>
	onConnected: EventHandler<void>
	disconnect: ReturnType<typeof vi.fn>
}

beforeEach(() => {
	fakes.openToast.mockReset()
	config = {
		getProps: vi.fn(async () => [{ key: "theme", value: "dark" }] as ConfigProp[]),
		setValue: vi.fn(async () => undefined),
		isConnected: true,
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
			plugins: [settingsRouter()],
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

	test("a failed write leaves the stored theme showing, and asking for it again writes again", async () => {
		// The worker persists before it announces, so a failed write announces nothing.
		config.setValue.mockRejectedValueOnce(new Error("persist failed"))
		const w = await mountDisplay()
		await w.get('[data-testid="theme-light-btn"]').trigger("click")
		await flushPromises()
		expect(fakes.openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Failed to update setting" })
		expect(w.get('[data-testid="theme-trigger"]').text()).toBe("dark")
		await w.get('[data-testid="theme-light-btn"]').trigger("click")
		await flushPromises()
		expect(config.setValue).toHaveBeenCalledTimes(2)
		expect(config.setValue).toHaveBeenLastCalledWith("theme", "light")
		expect(w.get('[data-testid="theme-trigger"]').text()).toBe("light")
	})

	test.each([false, true])("renders the search registry's rows, with a side panel: %s", async (sidePanel) => {
		if (sidePanel) Object.assign(chrome, { sidePanel: { open: vi.fn() } })
		expectOwnedRows(await mountDisplay(), "/popup/settings/display", settingsContext({ sidePanel }))
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

	describe("on Firefox, whose sidebar stands in for the side panel", () => {
		let open: ReturnType<typeof vi.fn>
		let closeSidebar: ReturnType<typeof vi.fn>
		let close: ReturnType<typeof vi.fn>
		let views: Window[]
		beforeEach(() => {
			open = vi.fn(async () => undefined)
			closeSidebar = vi.fn(async () => undefined)
			vi.stubGlobal("browser", { sidebarAction: { open, close: closeSidebar } })
			close = vi.spyOn(window, "close").mockImplementation(() => {})
			views = []
			Object.assign(chrome, {
				extension: { getViews: vi.fn(({ type }: { type: string }) => (type === "sidebar" ? views : [])) },
			})
		})
		afterEach(() => vi.stubGlobal("browser", undefined))

		const sidePanelToggle = (w: Awaited<ReturnType<typeof mountDisplay>>) => {
			const toggle = w.findAllComponents({ name: "Toggle" }).find((t) => t.attributes("data-testid") === "side-panel-toggle")
			if (!toggle) throw new Error("no side-panel-toggle")
			return toggle
		}

		test("renders the search registry's rows, the side panel's included", async () => {
			expectOwnedRows(await mountDisplay(), "/popup/settings/display", settingsContext({ sidePanel: true }))
		})

		test("turning it on opens the sidebar in the same event, after the write is posted, and closes the page once stored", async () => {
			let stored!: () => void
			config.setValue.mockImplementationOnce(() => new Promise<void>((resolve) => (stored = resolve)))
			const w = await mountDisplay()
			sidePanelToggle(w).vm.$emit("update:modelValue", true)
			expect(config.setValue).toHaveBeenCalledExactlyOnceWith("sidePanel", true)
			expect(open).toHaveBeenCalledTimes(1)
			expect(config.setValue.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0])
			expect(close).not.toHaveBeenCalled()
			stored()
			await flushPromises()
			expect(close).toHaveBeenCalledTimes(1)
		})

		test("turning it off in the toolbar panel closes the panel once stored and leaves the sidebar alone", async () => {
			config.getProps.mockResolvedValueOnce([{ key: "sidePanel", value: true }] as ConfigProp[])
			const w = await mountDisplay()
			sidePanelToggle(w).vm.$emit("update:modelValue", false)
			await flushPromises()
			expect(config.setValue).toHaveBeenCalledExactlyOnceWith("sidePanel", false)
			expect(open).not.toHaveBeenCalled()
			expect(closeSidebar).not.toHaveBeenCalled()
			expect(close).toHaveBeenCalledTimes(1)
		})

		test("turning it off in the sidebar closes the sidebar in the same event, after the write is posted", async () => {
			views = [window]
			config.getProps.mockResolvedValueOnce([{ key: "sidePanel", value: true }] as ConfigProp[])
			config.setValue.mockImplementationOnce(() => new Promise<void>(() => {}))
			const w = await mountDisplay()
			sidePanelToggle(w).vm.$emit("update:modelValue", false)
			expect(config.setValue).toHaveBeenCalledExactlyOnceWith("sidePanel", false)
			expect(closeSidebar).toHaveBeenCalledTimes(1)
			expect(config.setValue.mock.invocationCallOrder[0]).toBeLessThan(closeSidebar.mock.invocationCallOrder[0])
			expect(open).not.toHaveBeenCalled()
		})

		test("a client still reconnecting has not posted the write, so the sidebar neither opens nor closes", async () => {
			config.isConnected = false
			sidePanelToggle(await mountDisplay()).vm.$emit("update:modelValue", true)
			views = [window]
			config.getProps.mockResolvedValueOnce([{ key: "sidePanel", value: true }] as ConfigProp[])
			sidePanelToggle(await mountDisplay()).vm.$emit("update:modelValue", false)
			await flushPromises()
			expect(config.setValue.mock.calls).toEqual([
				["sidePanel", true],
				["sidePanel", false],
			])
			expect(open).not.toHaveBeenCalled()
			expect(closeSidebar).not.toHaveBeenCalled()
		})

		test("a refused write leaves the page open with the error, though the click already opened the sidebar", async () => {
			config.setValue.mockRejectedValueOnce(new Error("persist failed"))
			const w = await mountDisplay()
			sidePanelToggle(w).vm.$emit("update:modelValue", true)
			await flushPromises()
			expect(open).toHaveBeenCalledTimes(1)
			expect(close).not.toHaveBeenCalled()
			expect(fakes.openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Failed to update setting" })
			expect(sidePanelToggle(w).attributes("modelvalue")).toBe("false")
		})
	})
})
