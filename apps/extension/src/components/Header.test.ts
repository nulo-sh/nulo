/**
 * Narrow integration test for the header — deliberately NOT a full Header suite (L4+ convention:
 * e2e owns the header). It pins the wiring unit tests cannot see: the address button hands the FULL
 * active address (not the truncated display text) to the clipboard, except on a pointer click that
 * ends a selection inside it; both switcher affordances open the accounts popup; the lock chip runs
 * the shared lock (its behavior: `useLockWallet.test.ts`); the network chip's `data-status` follows
 * the store's status; the chip shows the network name only while Show network name is on; a
 * failure log marks the settings badge; and a hand-off window's card shows no header.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { nextTick, reactive } from "vue"
import { LogLevel } from "@/wallet/logger"

const H = vi.hoisted(() => ({
	openPopup: vi.fn(),
	closePopup: vi.fn(),
	openToast: vi.fn(),
	lockActiveProfile: vi.fn(),
	noopEvent: { add: vi.fn(), remove: vi.fn() },
	getSessionHandle: vi.fn(),
	profileListeners: new Set<() => void>(),
	disconnectListeners: new Set<() => void>(),
	logListeners: new Set<(log: { level: number; id: string }) => void>(),
	config: {} as Record<string, unknown>,
	configListeners: new Set<(prop: { key: string; value: unknown }) => void>(),
	app: {} as Record<string, unknown>,
	cache: {} as { confirm: Record<string, unknown> } & Record<string, unknown>,
	cardWindow: false,
}))

const FULL_ADDRESS = "0x018d47f656a0d242e28e5d15b5c965f39529bd860f2eaae947527b5094d800f6"

vi.mock("@/wallet/services/log-viewer/client", () => ({
	LogViewerServiceClient: vi.fn(function () {
		return {
			connect: vi.fn(),
			disconnect: vi.fn(),
			onLog: {
				add: (fn: (log: { level: number; id: string }) => void) => H.logListeners.add(fn),
				remove: (fn: (log: { level: number; id: string }) => void) => H.logListeners.delete(fn),
			},
		}
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onConnected: H.noopEvent,
			onUpdate: {
				add: (fn: (prop: { key: string; value: unknown }) => void) => H.configListeners.add(fn),
				remove: (fn: (prop: { key: string; value: unknown }) => void) => H.configListeners.delete(fn),
			},
			getValue: vi.fn(async (key: string) => H.config[key]),
		}
	}),
}))
vi.mock("@/wallet/config", () => ({ defaultConfig: () => ({ indicateFailures: false, showNode: true }) }))
vi.mock("@/utils/core", () => ({
	managers: {
		profile: {
			lockActiveProfile: H.lockActiveProfile,
			getSessionHandle: H.getSessionHandle,
			onActiveProfileChanged: {
				add: (fn: () => void) => H.profileListeners.add(fn),
				remove: (fn: () => void) => H.profileListeners.delete(fn),
			},
			onDisconnected: {
				add: (fn: () => void) => H.disconnectListeners.add(fn),
				remove: (fn: () => void) => H.disconnectListeners.delete(fn),
			},
		},
	},
}))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => H.app }))
vi.mock("@/stores/cache.store", () => ({ useCacheStore: () => H.cache }))
vi.mock("@/stores/popup.store", () => ({ usePopupStore: () => ({ open: H.openPopup, close: H.closePopup }) }))
vi.mock("vue-router", async (importOriginal) => {
	const mod = await importOriginal<typeof import("vue-router")>()
	return { ...mod, useRoute: () => ({ name: "popup-general", meta: {} }), useRouter: () => ({ push: vi.fn() }) }
})

vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	isCardWindow: () => H.cardWindow,
}))

import Header from "./Header.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
	AccountAvatar: { template: '<span data-testid="stub-avatar" />', props: ["name", "address", "size"] },
	Skeleton: { template: '<span data-testid="stub-skeleton" :data-width="width" :data-height="height" />', props: ["width", "height"] },
}

function mountHeader(attachTo?: Element) {
	return mount(Header, { attachTo, global: { stubs: STUBS } })
}

/** A pointer click carries `detail` 1, the click a key makes on a button 0; `trigger` cannot set it. */
async function clickAddress(w: ReturnType<typeof mountHeader>, detail: number) {
	w.get('[data-testid="account-address-copy"]').element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }))
	await flushPromises()
}

beforeEach(() => {
	vi.stubGlobal("useToast", () => ({ openToast: H.openToast }))
	H.openPopup.mockClear()
	H.closePopup.mockClear()
	H.openToast.mockClear()
	H.profileListeners.clear()
	H.disconnectListeners.clear()
	H.logListeners.clear()
	H.configListeners.clear()
	H.config = { indicateFailures: false, showNode: true }
	H.getSessionHandle.mockReset().mockResolvedValue("session-1")
	H.lockActiveProfile.mockClear()
	H.app = reactive({
		isLogined: true,
		_isHomeScreenOpened: false,
		profile: { id: "p1" },
		account: { name: "Primary Account", address: FULL_ADDRESS, profileId: "p1", chainId: 1 },
		network: { id: "n1", name: "Alpha V5", chainId: 1 },
		staleNetwork: null,
		networkStatus: "Active",
		approvedSendsInFlight: 0,
		refreshInFlight: vi.fn(async () => {}),
		lockHeldByImport: false,
		contactImports: new Set(),
	})
	H.cache = { failureLog: null, confirm: {} }
	H.cardWindow = false
})

describe("Header — hand-off window", () => {
	test("a card window shows no header; any other page keeps it", () => {
		expect(mountHeader().find("header").exists()).toBe(true)
		H.cardWindow = true
		expect(mountHeader().find("header").exists()).toBe(false)
	})
})

describe("Header — avatar/name/address split", () => {
	test("the address button copies the FULL active address, not the truncated display text", async () => {
		const writeText = vi.fn(async () => {})
		Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true })

		const w = mountHeader()
		// Sanity: the DISPLAY is truncated — the copy must not be.
		expect(w.find('[data-testid="account-address-copy"]').text()).toContain("0x018d...00f6")
		await clickAddress(w, 1)

		expect(writeText).toHaveBeenCalledWith(FULL_ADDRESS)
		expect(H.openToast).toHaveBeenCalledWith({ kind: "success", label: "Address is copied" })
		expect(H.openPopup).not.toHaveBeenCalled() // copying never opens the switcher
	})

	test("a pointer click that ends a selection in the address copies nothing; Enter's click over it still copies", async () => {
		const writeText = vi.fn(async () => {})
		Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true })
		// `selectedWithin` reads only a node in the document.
		const w = mountHeader(document.body.appendChild(document.createElement("div")))
		try {
			const range = document.createRange()
			range.selectNodeContents(w.get('[data-testid="account-address-text"]').element)
			window.getSelection()?.addRange(range)
			expect(window.getSelection()?.toString()).toContain("0x018d...00f6")

			await clickAddress(w, 1)
			expect(writeText).not.toHaveBeenCalled()
			expect(H.openToast).not.toHaveBeenCalled()

			await clickAddress(w, 0)
			expect(writeText.mock.calls).toEqual([[FULL_ADDRESS]])
		} finally {
			window.getSelection()?.removeAllRanges()
			w.unmount()
			document.body.replaceChildren()
		}
	})

	test("avatar AND name both open the accounts popup (the two switcher affordances)", async () => {
		const w = mountHeader()
		await w.find('[data-testid="account-avatar-btn"]').trigger("click")
		expect(H.openPopup).toHaveBeenCalledWith("accounts")
		await w.find('[data-testid="account-selector"]').trigger("click")
		expect(H.openPopup).toHaveBeenCalledTimes(2)
	})
})

describe("Header — lock", () => {
	test("is a chip: the padlock alone, named for what it does", () => {
		const lock = mountHeader().get('[data-testid="header-lock"]')
		expect(lock.get('[data-testid="stub-icon"]').attributes("data-name")).toBe("lock")
		expect(lock.text()).toBe("")
		expect(lock.attributes("aria-label")).toBe("Lock wallet")
		expect(lock.attributes("type")).toBe("button")
	})

	test("a click locks through the shared lock, and unmount releases its session listeners", async () => {
		const w = mountHeader()
		expect(H.profileListeners.size + H.disconnectListeners.size).toBe(2)

		await w.find('[data-testid="header-lock"]').trigger("click")
		await flushPromises()
		expect(H.lockActiveProfile).toHaveBeenCalledExactlyOnceWith("session-1")
		expect(H.app.isLogined).toBe(false)

		w.unmount()
		expect(H.profileListeners.size + H.disconnectListeners.size).toBe(0)
	})

	test("is disabled while a contacts import holds Lock, and enabled once the hold ends", async () => {
		H.app = reactive({ ...H.app, lockHeldByImport: true })
		const w = mountHeader()
		await w.get('[data-testid="header-lock"]').trigger("click")
		await flushPromises()
		expect(w.get('[data-testid="header-lock"]').attributes()).toHaveProperty("disabled")
		expect(H.getSessionHandle).not.toHaveBeenCalled()

		H.app.lockHeldByImport = false
		await nextTick()
		expect(w.get('[data-testid="header-lock"]').attributes()).not.toHaveProperty("disabled")
	})
})

describe("Header — network status", () => {
	test("the network chip's data-status names the store's status", () => {
		expect(mountHeader().get('[data-testid="network-button"]').attributes("data-status")).toBe("active")
		H.app.networkStatus = "InvalidChain"
		expect(mountHeader().get('[data-testid="network-button"]').attributes("data-status")).toBe("invalidchain")
	})
})

describe("Header — Show network name", () => {
	const chip = (w: ReturnType<typeof mountHeader>) => ({
		name: w.find('[data-testid="network-name"]').exists() ? w.get('[data-testid="network-name"]').text() : null,
		dot: w.find('[data-testid="network-status-dot"]').exists(),
		label: w.get('[data-testid="network-button"]').attributes("aria-label"),
	})

	test("off hides the name and keeps the status dot and the chip's accessible name", async () => {
		H.config.showNode = false
		const w = mountHeader()
		await flushPromises()
		expect(chip(w)).toEqual({ name: null, dot: true, label: "Manage networks (currently Alpha V5)" })
	})

	test("on shows the name beside the dot", async () => {
		const w = mountHeader()
		await flushPromises()
		expect(chip(w)).toEqual({ name: "Alpha V5", dot: true, label: "Manage networks (currently Alpha V5)" })
	})

	test("a change made while the mount's read is in flight outlives that read's older value", async () => {
		const read = Promise.withResolvers<boolean>()
		H.config.showNode = read.promise
		const w = mountHeader()
		await flushPromises()
		for (const fn of H.configListeners) fn({ key: "showNode", value: false })
		read.resolve(true)
		await flushPromises()
		expect(chip(w).name).toBeNull()
	})

	test("a change made in Display reaches the open header", async () => {
		const w = mountHeader()
		await flushPromises()
		for (const fn of H.configListeners) fn({ key: "showNode", value: false })
		await nextTick()
		expect(chip(w).name).toBeNull()
	})
})

describe("Header — the account group follows the active scope", () => {
	const group = (w: ReturnType<typeof mountHeader>) => ({
		shown: w.find('[data-testid="account-address-copy"]').exists(),
		skeleton: w.findAll('[data-testid="stub-skeleton"]').map((el) => `${el.attributes("data-width")}x${el.attributes("data-height")}`),
	})

	test("a quarantined active network hides the group with no skeleton, and a runtime quarantine hides it at once", async () => {
		const w = mountHeader()
		expect(group(w)).toEqual({ shown: true, skeleton: [] })
		H.app.staleNetwork = { networkId: "n1" }
		await nextTick()
		expect(group(w)).toEqual({ shown: false, skeleton: [] })
		expect(w.find('[data-testid="header-account-loading"]').exists()).toBe(false)
	})

	test("another network's stale view leaves the active account shown", () => {
		H.app.staleNetwork = { networkId: "n2" }
		expect(group(mountHeader())).toEqual({ shown: true, skeleton: [] })
	})

	test("an account of the previous chain or profile never shows: the skeleton holds its footprint", async () => {
		H.app.account = { name: "Old", address: FULL_ADDRESS, profileId: "p1", chainId: 7 }
		const w = mountHeader()
		expect(group(w)).toEqual({ shown: false, skeleton: ["32x32", "90x12", "110x12"] })
		H.app.account = { name: "Other", address: FULL_ADDRESS, profileId: "p2", chainId: 1 }
		await nextTick()
		expect(group(w).shown).toBe(false)
		H.app.account = undefined
		await nextTick()
		expect(w.find('[data-testid="header-account-loading"]').exists()).toBe(true)
	})
})

describe("Header — failure indication", () => {
	test("an error log marks the failure badge red, a warning yellow, and the mark clears after a minute", () => {
		vi.useFakeTimers()
		try {
			mountHeader()
			const log = (level: LogLevel, id: string) => {
				for (const fn of H.logListeners) fn({ level, id })
			}
			log(LogLevel.Info, "log-0")
			expect(H.cache.failureLog).toBeNull()
			log(LogLevel.Error, "log-1")
			expect(H.cache.failureLog).toEqual({ id: "log-1", color: "var(--red)" })
			log(LogLevel.Warn, "log-2")
			expect(H.cache.failureLog).toEqual({ id: "log-2", color: "var(--yellow)" })
			vi.advanceTimersByTime(60_000)
			expect(H.cache.failureLog).toBeNull()
		} finally {
			vi.useRealTimers()
		}
	})
})
