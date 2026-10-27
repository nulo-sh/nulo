import { createTestingPinia } from "@pinia/testing"
import { Flex, Icon, Text } from "@nulo/design"
import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../tests/helpers/chrome-storage-mock"
import { nextTick } from "vue"
import type { ConfigProp } from "@/wallet/config"
import { expectOwnedRows, settingsContext, settingsRouter } from "../../../../tests/helpers/settings-rows"

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
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
import ItemsContainer from "@/components/ui/Settings/ItemsContainer.vue"
import SettingItem from "@/components/ui/Settings/SettingItem.vue"
import LockPage from "./lock.vue"

beforeEach(() => {
	vi.clearAllMocks()
	fakes.config.onUpdate = new EventHandler<ConfigProp>()
	fakes.config.onConnected = new EventHandler<void>()
	fakes.config.getValue.mockImplementation(async (key: string) => (key === "sessionTtl" ? 1_800_000 : true))
	installChromeStorage({}, { persist: false })
})

async function mountLock(type: "password" | "passkey" = "password") {
	const wrapper = mount(LockPage, {
		global: {
			plugins: [
				settingsRouter(),
				createTestingPinia({
					createSpy: vi.fn,
					initialState: { app: { isLogined: true, profile: { id: "p1", name: "Primary", type } } },
				}),
			],
			components: { Flex, ItemsContainer, SettingItem, Text, Icon },
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
	test.each(["password", "passkey"] as const)("renders the search registry's rows for a %s profile", async (type) => {
		expectOwnedRows(await mountLock(type), "/popup/settings/lock", settingsContext({ passkey: type === "passkey" }))
	})

	test("is titled Lock, and Lock now renders while the config reads hang", async () => {
		fakes.config.getValue.mockReturnValue(new Promise(() => {}))
		const w = await mountLock()
		expect(w.get("[data-title]").attributes("data-title")).toBe("Lock")
		expect(w.find('[data-testid="loading"]').exists()).toBe(true)
		expect(w.get('[data-testid="lock-now-btn"]').text()).toContain("Locks Nulo until you unlock it again")
	})

	test.each(["password", "passkey"] as const)(
		"a %s profile sees strict mode and the auto-lock field, and turning strict off says it holds from the next unlock for every profile on this device",
		async (type) => {
			const w = await mountLock(type)
			const strict = w.get('[data-testid="setting-strict-security-mode"]')
			expect(strict.text()).toContain("More secure, asks you to unlock more often on this device. Recommended.")
			expect(w.find('[data-testid="auto-lock-input"]').exists()).toBe(true)
			;(w.getComponent('[data-testid="strict-security-toggle"]') as VueWrapper).vm.$emit("update:modelValue", false)
			expect(useCacheStore().confirm).toMatchObject({
				title: "Disable strict security?",
				description:
					"From your next unlock, every profile on this device stays unlocked when Nulo restarts in the background, until auto-lock. Less secure. " +
					"Anyone who can read browser data can unlock the wallet without your password or passkey.",
			})
		},
	)

	test("Lock now runs the shared lock on the popup's long-lived profile client", async () => {
		const w = await mountLock()
		expect(useLockWallet).toHaveBeenCalledExactlyOnceWith(fakes.managerProfile)
		await w.get('[data-testid="lock-now-btn"]').trigger("click")
		expect(fakes.lockWallet.lock).toHaveBeenCalledTimes(1)
	})

	test("Lock now is disabled while a contacts import holds Lock, and enabled once the hold ends", async () => {
		const w = await mountLock()
		// The testing pinia lets a test set a getter; the store's type keeps it read-only.
		const app = useAppStore() as { lockHeldByImport: boolean }
		app.lockHeldByImport = true
		await nextTick()
		await w.get('[data-testid="lock-now-btn"]').trigger("click")
		expect(w.get('[data-testid="lock-now-btn"]').classes().join(" ")).toMatch(/disabled/)
		expect(fakes.lockWallet.lock).not.toHaveBeenCalled()

		app.lockHeldByImport = false
		await nextTick()
		await w.get('[data-testid="lock-now-btn"]').trigger("click")
		expect(fakes.lockWallet.lock).toHaveBeenCalledTimes(1)
	})

	test("a failed auto-lock write shows the stored timeout again, and asking again writes again", async () => {
		const debounced = () => new Promise((resolve) => setTimeout(resolve, 350)).then(flushPromises)
		fakes.config.setValue.mockRejectedValueOnce(new Error("persist failed"))
		const w = await mountLock()
		await debounced()
		const field = () => w.findComponent('[data-testid="auto-lock-input"]') as VueWrapper

		field().vm.$emit("update:modelValue", "15")
		await debounced()
		expect(fakes.config.setValue).toHaveBeenCalledExactlyOnceWith("sessionTtl", 900_000)
		expect(field().attributes("modelvalue")).toBe("30")

		field().vm.$emit("update:modelValue", "15")
		await debounced()
		expect(fakes.config.setValue).toHaveBeenCalledTimes(2)
	})

	test.each([-5, 1.5, 1441])("an auto-lock of %s minutes is never written; the stated maximum is", async (minutes) => {
		const debounced = () => new Promise((resolve) => setTimeout(resolve, 350)).then(flushPromises)
		const w = await mountLock()
		await debounced()
		const field = () => w.findComponent('[data-testid="auto-lock-input"]') as VueWrapper

		field().vm.$emit("update:modelValue", minutes)
		await debounced()
		expect(fakes.config.setValue).not.toHaveBeenCalled()

		field().vm.$emit("update:modelValue", 1440)
		await debounced()
		expect(fakes.config.setValue).toHaveBeenCalledExactlyOnceWith("sessionTtl", 86_400_000)
	})

	test("a failure that lands after a newer edit leaves that edit, which is then written", async () => {
		const debounced = () => new Promise((resolve) => setTimeout(resolve, 350)).then(flushPromises)
		let fail: (e: Error) => void = () => {}
		fakes.config.setValue.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
		const w = await mountLock()
		await debounced()
		const field = () => w.findComponent('[data-testid="auto-lock-input"]') as VueWrapper

		field().vm.$emit("update:modelValue", "45")
		await debounced()
		field().vm.$emit("update:modelValue", "15")
		fail(new Error("persist failed"))
		await flushPromises()
		expect(field().attributes("modelvalue")).toBe("15")

		await debounced()
		expect(fakes.config.setValue).toHaveBeenLastCalledWith("sessionTtl", 900_000)
	})

	describe("never locking asks first", () => {
		const debounced = () => new Promise((resolve) => setTimeout(resolve, 350)).then(flushPromises)
		const confirm = () =>
			useCacheStore().confirm as { title?: string; description?: string; confirm_text?: string; callback?: () => void }
		async function mountSettled() {
			const w = await mountLock()
			await debounced()
			const field = () => w.findComponent('[data-testid="auto-lock-input"]') as VueWrapper
			return { w, field }
		}

		test("a typed 0 asks and writes nothing; a typed 15 writes with no question", async () => {
			const { field } = await mountSettled()
			field().vm.$emit("update:modelValue", "0")
			await debounced()
			expect(confirm()).toMatchObject({
				title: "Never lock automatically?",
				description:
					"Nulo will stay unlocked until you lock it yourself. Anyone who can use this browser can use your wallet meanwhile.",
				confirm_text: "Never lock",
			})
			expect(fakes.config.setValue).not.toHaveBeenCalled()

			useCacheStore().confirm = {}
			await flushPromises()
			field().vm.$emit("update:modelValue", "15")
			await debounced()
			expect(confirm()).toEqual({})
			expect(fakes.config.setValue).toHaveBeenCalledExactlyOnceWith("sessionTtl", 900_000)
		})

		test("an emptied field, which the int field emits as the number 0, asks too", async () => {
			const { field } = await mountSettled()
			field().vm.$emit("update:modelValue", 0)
			await debounced()
			expect(confirm().title).toBe("Never lock automatically?")
			expect(fakes.config.setValue).not.toHaveBeenCalled()
		})

		test("Never lock writes 0", async () => {
			const { field } = await mountSettled()
			field().vm.$emit("update:modelValue", "0")
			await debounced()
			confirm().callback?.()
			await flushPromises()
			expect(fakes.config.setValue).toHaveBeenCalledExactlyOnceWith("sessionTtl", 0)
			expect(field().attributes("modelvalue")).toBe("0")
		})

		test("any other answer puts the stored minutes back and writes nothing", async () => {
			const { field } = await mountSettled()
			field().vm.$emit("update:modelValue", "0")
			await debounced()
			useCacheStore().confirm = {}
			await debounced()
			expect(field().attributes("modelvalue")).toBe("30")
			expect(fakes.config.setValue).not.toHaveBeenCalled()
		})

		test("an answer after the field moved leaves the newer edit alone", async () => {
			const { field } = await mountSettled()
			field().vm.$emit("update:modelValue", "0")
			await debounced()
			const ask = confirm()
			field().vm.$emit("update:modelValue", "45")
			await debounced()
			ask.callback?.()
			await flushPromises()
			expect(fakes.config.setValue).toHaveBeenCalledExactlyOnceWith("sessionTtl", 2_700_000)
			expect(field().attributes("modelvalue")).toBe("45")
		})

		test("a page that opens with 0 stored never asks", async () => {
			fakes.config.getValue.mockImplementation(async (key: string) => (key === "sessionTtl" ? 0 : true))
			const { field } = await mountSettled()
			await debounced()
			expect(field().attributes("modelvalue")).toBe("0")
			expect(confirm()).toEqual({})
			expect(fakes.config.setValue).not.toHaveBeenCalled()
		})

		test("a 0 that settles after the page closed neither asks nor writes", async () => {
			const { w, field } = await mountSettled()
			field().vm.$emit("update:modelValue", "0")
			w.unmount()
			await debounced()
			expect(confirm()).toEqual({})
			expect(fakes.config.setValue).not.toHaveBeenCalled()
		})

		test("closing the page while it asks answers no and closes the question", async () => {
			const { w, field } = await mountSettled()
			field().vm.$emit("update:modelValue", "0")
			await debounced()
			const ask = confirm()
			w.unmount()
			await flushPromises()
			expect(usePopupStore().close).toHaveBeenCalledWith("confirm")
			ask.callback?.()
			await flushPromises()
			expect(fakes.config.setValue).not.toHaveBeenCalled()
		})
	})

	describe("a port that drops under the mounted page", () => {
		const connect = () => fakes.config.onConnected.invoke()
		const update = (key: string, value: unknown) => fakes.config.onUpdate.invoke({ key, value } as ConfigProp)
		const strict = (w: VueWrapper) => w.findComponent('[data-testid="strict-security-toggle"]').attributes("modelvalue")
		const minutes = (w: VueWrapper) => w.findComponent('[data-testid="auto-lock-input"]').attributes("modelvalue")

		// A port dropped before its deferred Ready announcement never makes it, so the next open announced
		// is the reopened port's; a read that timed out waiting for Ready meets that port's own first open.
		test("a read the drop rejected is made again on the next open, the port's first included", async () => {
			fakes.config.getValue.mockRejectedValueOnce(new Error("Client disconnected"))
			const w = await mountLock()
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
