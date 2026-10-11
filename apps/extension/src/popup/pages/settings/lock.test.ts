import { createTestingPinia } from "@pinia/testing"
import { Flex, MaterialIcon, Text } from "@nulo/design"
import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ConfigProp } from "@/wallet/config"

const fakes = vi.hoisted(() => ({
	managerProfile: { name: "managers.profile" },
	lockWallet: { lock: vi.fn(), dispose: vi.fn() },
	config: {
		getValue: vi.fn(),
		setValue: vi.fn(),
		onUpdate: undefined as unknown as EventHandler<ConfigProp>,
		onConnected: undefined as unknown as EventHandler<void>,
		disconnect: vi.fn(),
	},
	profile: { refreshSession: vi.fn(), disconnect: vi.fn() },
}))
vi.mock("@/utils/core", () => ({ managers: { profile: fakes.managerProfile } }))
vi.mock("@/composables/useLockWallet", () => ({ useLockWallet: vi.fn(() => fakes.lockWallet) }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return fakes.config
	}),
}))
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: vi.fn(function () {
		return fakes.profile
	}),
}))

import { useLockWallet } from "@/composables/useLockWallet"
import ItemsContainer from "@/components/ui/Settings/ItemsContainer.vue"
import SettingItem from "@/components/ui/Settings/SettingItem.vue"
import LockPage from "./lock.vue"

beforeEach(() => {
	vi.clearAllMocks()
	fakes.config.onUpdate = new EventHandler<ConfigProp>()
	fakes.config.onConnected = new EventHandler<void>()
	fakes.config.getValue.mockImplementation(async (key: string) => (key === "sessionTtl" ? 1_800_000 : true))
	const c = (globalThis as { chrome?: { storage: Record<string, unknown> } }).chrome
	if (c) {
		c.storage.local = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }
		c.storage.onChanged = { addListener: vi.fn(), removeListener: vi.fn() }
	}
})

async function mountLock(type: "password" | "passkey" = "password") {
	const wrapper = mount(LockPage, {
		global: {
			plugins: [
				createTestingPinia({
					createSpy: vi.fn,
					initialState: { app: { isLogined: true, profile: { id: "p1", name: "Primary", type } } },
				}),
			],
			components: { Flex, ItemsContainer, MaterialIcon, SettingItem, Text },
			stubs: {
				SettingsPageShell: { props: ["title"], template: '<div :data-title="title"><slot /></div>' },
				LoadingState: { template: '<div data-testid="loading" />' },
				Toggle: true,
				Tooltip: true,
				Icon: true,
				Input: true,
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe("settings/lock", () => {
	test("is titled Lock, and Lock now renders while the config reads hang", async () => {
		fakes.config.getValue.mockReturnValue(new Promise(() => {}))
		const w = await mountLock()
		expect(w.get("[data-title]").attributes("data-title")).toBe("Lock")
		expect(w.find('[data-testid="loading"]').exists()).toBe(true)
		expect(w.get('[data-testid="lock-now-btn"]').text()).toContain("Locks Nulo until you unlock it again")
	})

	test.each([
		["password", true],
		["passkey", false],
	] as const)("a %s profile sees strict mode: %s; both see the auto-lock field", async (type, strict) => {
		const w = await mountLock(type)
		expect(w.find('[data-testid="setting-strict-security-mode"]').exists()).toBe(strict)
		expect(w.find('[data-testid="auto-lock-input"]').exists()).toBe(true)
	})

	test("Lock now runs the shared lock on the popup's long-lived profile client", async () => {
		const w = await mountLock()
		expect(useLockWallet).toHaveBeenCalledExactlyOnceWith(fakes.managerProfile)
		await w.get('[data-testid="lock-now-btn"]').trigger("click")
		expect(fakes.lockWallet.lock).toHaveBeenCalledTimes(1)
	})

	test("a failed auto-lock write shows the stored timeout again, and asking again writes again", async () => {
		const debounced = () => new Promise((resolve) => setTimeout(resolve, 350)).then(flushPromises)
		fakes.config.setValue.mockRejectedValueOnce(new Error("persist failed"))
		const w = await mountLock()
		await debounced()
		const field = () => w.findComponent('[data-testid="auto-lock-input"]') as VueWrapper

		field().vm.$emit("update:modelValue", "0")
		await debounced()
		expect(fakes.config.setValue).toHaveBeenCalledExactlyOnceWith("sessionTtl", 0)
		expect(field().attributes("modelvalue")).toBe("30")

		field().vm.$emit("update:modelValue", "0")
		await debounced()
		expect(fakes.config.setValue).toHaveBeenCalledTimes(2)
	})

	test("a failure that lands after a newer edit leaves that edit, which is then written", async () => {
		const debounced = () => new Promise((resolve) => setTimeout(resolve, 350)).then(flushPromises)
		let fail: (e: Error) => void = () => {}
		fakes.config.setValue.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
		const w = await mountLock()
		await debounced()
		const field = () => w.findComponent('[data-testid="auto-lock-input"]') as VueWrapper

		field().vm.$emit("update:modelValue", "0")
		await debounced()
		field().vm.$emit("update:modelValue", "15")
		fail(new Error("persist failed"))
		await flushPromises()
		expect(field().attributes("modelvalue")).toBe("15")

		await debounced()
		expect(fakes.config.setValue).toHaveBeenLastCalledWith("sessionTtl", 900_000)
	})

	describe("a port that drops under the mounted page", () => {
		const connect = () => fakes.config.onConnected.invoke()
		const update = (key: string, value: unknown) => fakes.config.onUpdate.invoke({ key, value } as ConfigProp)
		const strict = (w: VueWrapper) => w.findComponent('[data-testid="strict-security-toggle"]').attributes("modelvalue")
		const minutes = (w: VueWrapper) => w.findComponent('[data-testid="auto-lock-input"]').attributes("modelvalue")

		test("a read the drop rejected is made again on the reconnect, never on the first open", async () => {
			fakes.config.getValue.mockRejectedValueOnce(new Error("Client disconnected"))
			const w = await mountLock()
			connect()
			await flushPromises()
			expect(fakes.config.getValue).toHaveBeenCalledTimes(1)
			expect(w.find('[data-testid="loading"]').exists()).toBe(true)

			connect()
			await flushPromises()
			expect(fakes.config.getValue).toHaveBeenCalledTimes(3)
			expect(w.find('[data-testid="loading"]').exists()).toBe(false)
			expect(strict(w)).toBe("true")
			expect(minutes(w)).toBe("30")
		})

		test("an older read that answers after the newer one is ignored", async () => {
			const first = Promise.withResolvers<number>()
			fakes.config.getValue.mockReturnValueOnce(first.promise)
			const w = await mountLock()
			connect()
			fakes.config.getValue.mockResolvedValueOnce(900_000).mockResolvedValueOnce(false)
			connect()
			await flushPromises()
			expect(strict(w)).toBe("false")
			expect(minutes(w)).toBe("15")

			first.resolve(1_800_000)
			await flushPromises()
			expect(strict(w)).toBe("false")
			expect(minutes(w)).toBe("15")
		})

		test("a reconnect's read keeps an edit in progress while the stored timeout is unchanged", async () => {
			const w = await mountLock()
			connect()
			;(w.findComponent('[data-testid="auto-lock-input"]') as VueWrapper).vm.$emit("update:modelValue", "15")
			connect()
			await flushPromises()
			expect(fakes.config.getValue).toHaveBeenCalledTimes(4)
			expect(minutes(w)).toBe("15")
		})

		test("an update sent while a read is in flight beats the read's older value", async () => {
			const w = await mountLock()
			connect()
			const reread = Promise.withResolvers<boolean>()
			fakes.config.getValue.mockResolvedValueOnce(1_800_000).mockReturnValueOnce(reread.promise)
			connect()
			await flushPromises()
			update("strictSecurityMode", false)
			reread.resolve(true)
			await flushPromises()
			expect(strict(w)).toBe("false")
		})
	})

	test("unmount disposes the lock after both service clients disconnect", async () => {
		const w = await mountLock()
		w.unmount()
		expect(fakes.lockWallet.dispose).toHaveBeenCalledTimes(1)
		const [dispose] = fakes.lockWallet.dispose.mock.invocationCallOrder
		expect(fakes.config.disconnect.mock.invocationCallOrder[0]).toBeLessThan(dispose)
		expect(fakes.profile.disconnect.mock.invocationCallOrder[0]).toBeLessThan(dispose)
	})
})
