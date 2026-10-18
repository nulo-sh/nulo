import { createTestingPinia } from "@pinia/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { ConfigProp } from "@/wallet/config"
import { expectOwnedRows, settingsContext, settingsRouter } from "../../../../../tests/helpers/settings-rows"
import AdvancedSettings from "./index.vue"

const fakes = vi.hoisted(() => ({ config: undefined as unknown, openToast: vi.fn() }))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: function ConfigServiceClient() {
		return fakes.config
	},
}))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: fakes.openToast }) }))

let config: {
	getProps: ReturnType<typeof vi.fn>
	setValue: ReturnType<typeof vi.fn>
	onUpdate: EventHandler<ConfigProp>
	onConnected: EventHandler<void>
	disconnect: ReturnType<typeof vi.fn>
}

/** The mount's read: its request opens the port, as the real client's first request does. */
function mountReadOpensPort(answer: () => Promise<ConfigProp[]>) {
	config.getProps.mockImplementationOnce(() => {
		config.onConnected.invoke()
		return answer()
	})
}

const windows = { create: vi.fn(), get: vi.fn(), update: vi.fn() }

// The app store's `useSyncedRef` reads `chrome.storage.local` and listens for changes as it is created.
beforeEach(() => {
	fakes.openToast.mockReset()
	config = {
		getProps: vi.fn(async () => [{ key: "developerMode", value: true }] as ConfigProp[]),
		setValue: vi.fn(async () => undefined),
		onUpdate: new EventHandler<ConfigProp>(),
		onConnected: new EventHandler<void>(),
		disconnect: vi.fn(),
	}
	fakes.config = config
	for (const fn of Object.values(windows)) fn.mockReset()
	vi.stubGlobal("chrome", {
		storage: {
			local: {
				get: vi.fn(async () => ({})),
				set: vi.fn(async () => undefined),
				remove: vi.fn(async () => undefined),
			},
			onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
		},
		runtime: {
			connect: vi.fn(),
			getURL: (path: string) => `chrome-extension://nulo/${path}`,
			onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
		},
		windows,
	})
})
afterEach(() => vi.unstubAllGlobals())

async function mountAdvanced() {
	const wrapper = mount(AdvancedSettings, {
		global: {
			plugins: [settingsRouter(), createTestingPinia({ createSpy: vi.fn })],
			stubs: {
				SettingsPageShell: { template: "<div><slot /></div>" },
				Flex: { template: "<div><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				LoadingState: true,
				Toggle: true,
				RowTarget: true,
				RouterLink: { template: "<a><slot /></a>" },
			},
		},
	})
	await flushPromises()
	return wrapper
}

test("a press while the log window is still being created opens no second one; a press after it focuses it", async () => {
	let created: (window: { id: number }) => void = () => {}
	windows.create.mockReturnValue(
		new Promise((resolve) => {
			created = resolve
		}),
	)
	const row = (await mountAdvanced()).get('[data-testid="settings-logs-row"]')

	await row.trigger("click")
	await row.trigger("click")
	expect(windows.create).toHaveBeenCalledTimes(1)

	created({ id: 7 })
	await flushPromises()
	windows.get.mockResolvedValue({ id: 7 })
	await row.trigger("click")
	await flushPromises()

	expect(windows.create).toHaveBeenCalledTimes(1)
	expect(windows.get).toHaveBeenCalledWith(7)
	expect(windows.update).toHaveBeenCalledWith(7, { focused: true })
})

test("a read the drop rejected is made again on the reconnect, and the page loads", async () => {
	mountReadOpensPort(async () => {
		throw new Error("Client disconnected")
	})
	const w = await mountAdvanced()
	expect(w.find('[data-testid="settings-toggle-developerMode"]').exists()).toBe(false)
	config.onConnected.invoke()
	await flushPromises()
	expect(config.getProps).toHaveBeenCalledTimes(2)
	expect(w.get('[data-testid="settings-toggle-developerMode"]').attributes("modelvalue")).toBe("true")
})

test("a reread that finds Developer Mode changed shows it and writes nothing", async () => {
	mountReadOpensPort(async () => [{ key: "developerMode", value: true }] as ConfigProp[])
	const w = await mountAdvanced()
	config.getProps.mockResolvedValueOnce([{ key: "developerMode", value: false }] as ConfigProp[])
	config.onConnected.invoke()
	await flushPromises()
	expect(w.get('[data-testid="settings-toggle-developerMode"]').attributes("modelvalue")).toBe("false")
	expect(config.setValue).not.toHaveBeenCalled()
})

test("a failed write leaves Developer Mode as stored and writes no dependent; asking again turns all three off", async () => {
	// The worker persists before it announces, so a failed write announces nothing.
	config.getProps.mockResolvedValue([
		{ key: "developerMode", value: true },
		{ key: "indicateFailures", value: true },
		{ key: "debugMode", value: true },
	] as ConfigProp[])
	config.setValue.mockRejectedValueOnce(new Error("persist failed"))
	const w = await mountAdvanced()
	// Developer Mode is the first toggle.
	const emit = () => w.getComponent({ name: "Toggle" }).vm.$emit("update:modelValue", false)
	const toggle = () => w.get('[data-testid="settings-toggle-developerMode"]')
	emit()
	await flushPromises()
	expect(fakes.openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Failed to update setting" })
	expect(config.setValue).toHaveBeenCalledExactlyOnceWith("developerMode", false)
	expect(toggle().attributes("modelvalue")).toBe("true")
	emit()
	await flushPromises()
	expect(config.setValue.mock.calls.slice(1)).toEqual([
		["developerMode", false],
		["indicateFailures", false],
		["debugMode", false],
	])
	expect(toggle().attributes("modelvalue")).toBe("false")
})

test.each([false, true])("renders the search registry's rows with developer mode %s", async (developerMode) => {
	config.getProps.mockResolvedValue([{ key: "developerMode", value: developerMode }] as ConfigProp[])
	expectOwnedRows(await mountAdvanced(), "/popup/settings/developer", settingsContext({ developerMode }))
})
