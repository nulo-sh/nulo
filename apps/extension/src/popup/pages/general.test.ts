/**
 * Home's reminders: the sources that decide the Get started card and the backup banner, and what
 * a row does. BalanceView and the lists are stubbed; the flags go through the real storage facade.
 */
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { EventHandler } from "@nulo/wallet-core/utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { defineComponent, h } from "vue"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("vue-router", () => ({ useRouter: () => router, useRoute: () => ({}) }))
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: vi.fn(function () {
		return { disconnect: vi.fn() }
	}),
}))
vi.mock("@/composables/useSeedStatus", () => ({
	useSeedStatus: () => ({
		entries: { value: [] },
		ready: { value: true },
		refresh: vi.fn(async () => {}),
		retry: vi.fn(),
		dispose: vi.fn(),
	}),
}))
const configEvents = { update: new EventHandler(), connected: new EventHandler() }
let prestoReached: unknown = false
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onUpdate: configEvents.update,
			onConnected: configEvents.connected,
			getValue: vi.fn(async () => prestoReached),
		}
	}),
}))
let gas: unknown
vi.mock("@/stores/balances.store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/balances.store")>()),
	useBalancesStore: () => ({ entry: () => (gas === undefined ? undefined : { gas }) }),
}))

import { useAppStore } from "@/stores/app.store"
import { HOW_AZTEC_WORKS_URL } from "@/utils/get-started"
import { type ChromeStorageMock, installChromeStorage } from "../../../tests/helpers/chrome-storage-mock"
import General from "./general.vue"

let tokenHoldings = "none"
const BalanceView = defineComponent({
	name: "BalanceView",
	emits: ["holdings"],
	mounted() {
		this.$emit("holdings", tokenHoldings)
	},
	render: () => h("div"),
})
const STUBS = {
	BalanceView,
	TokensView: true,
	RecentActivityView: true,
	RecoveryModeBanner: true,
	RestoreOutcomeBanner: true,
	Flex: { template: "<div><slot /></div>" },
	Icon: true,
	SectionLabel: { template: "<span>{{ label }}</span>", props: ["label"] },
	ItemsContainer: { template: "<div><slot /></div>" },
	SettingItem: {
		template: '<button type="button" @click="$emit(\'click\')">{{ title }}</button>',
		props: ["title", "description", "value", "chevron"],
		emits: ["click"],
	},
}

const ZERO = { status: "ready", display: { publicFeeJuice: "0", privateFeeJuice: null }, version: 1 }
const AZTEC_KEY = "nulo:ui:getStartedAztecOpened@p1"

const wrappers: VueWrapper[] = []
let storage: ChromeStorageMock

async function mountHome(type: "password" | "passkey" = "password") {
	storage = installChromeStorage()
	const pinia = createTestingPinia({ stubActions: false })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.profile = { id: "p1", type } as never
	appStore.network = { id: "n1", chainId: 1 } as never
	appStore.account = { address: "0xacct" } as never
	const wrapper = mount(General, { global: { plugins: [pinia], stubs: STUBS, provide: {} } })
	wrappers.push(wrapper)
	await flushPromises()
	return wrapper
}

const has = (w: VueWrapper, testId: string) => w.find(`[data-testid="${testId}"]`).exists()

afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	tokenHoldings = "none"
	gas = undefined
	prestoReached = false
	vi.restoreAllMocks()
	vi.clearAllMocks()
})

describe("Home — the backup reminder's sources", () => {
	test("a first gas read that failed does not hold back the banner token funds raise", async () => {
		gas = { status: "degraded", version: 1 }
		tokenHoldings = "some"
		const w = await mountHome()
		expect(has(w, "backup-reminder-banner")).toBe(true)
		expect(has(w, "get-started-phrase")).toBe(false)
	})

	test("Fee Juice alone is funds: a positive read raises the banner with no token", async () => {
		gas = { status: "ready", display: { publicFeeJuice: "5", privateFeeJuice: null }, version: 1 }
		const w = await mountHome()
		expect(has(w, "backup-reminder-banner")).toBe(true)
	})

	test("an empty wallet keeps the calm phrase row and offers Fee Juice (control)", async () => {
		gas = ZERO
		const w = await mountHome()
		expect(has(w, "backup-reminder-banner")).toBe(false)
		expect(has(w, "get-started-phrase")).toBe(true)
		expect(has(w, "get-started-feeJuice")).toBe(true)
		expect(w.get('[data-testid="home-scroller"]').attributes("data-reminders-settled")).toBe("true")
	})

	test("while the gas read is still out, an empty token list shows nothing yet", async () => {
		gas = { status: "fetching", version: 0 }
		const w = await mountHome()
		expect(has(w, "get-started")).toBe(false)
		expect(has(w, "backup-reminder-banner")).toBe(false)
		expect(w.get('[data-testid="home-scroller"]').attributes("data-reminders-settled")).toBe("false")
	})

	test("a funded passkey wallet gets the backup row, never the banner", async () => {
		gas = ZERO
		tokenHoldings = "some"
		const w = await mountHome("passkey")
		expect(has(w, "backup-reminder-banner")).toBe(false)
		expect(has(w, "get-started-backup")).toBe(true)
	})
})

describe("Home — what the reminders do", () => {
	test("How Aztec works writes its flag before the tab opens", async () => {
		gas = ZERO
		const order: string[] = []
		const w = await mountHome()
		storage.set.mockImplementation(async (items: Record<string, unknown>) => {
			if (AZTEC_KEY in items) order.push("mark")
		})
		const open = vi.spyOn(window, "open").mockImplementation(() => {
			order.push("open")
			return null
		})
		await w.get('[data-testid="get-started-aztec"]').trigger("click")
		await flushPromises()
		expect(order).toEqual(["mark", "open"])
		expect(open).toHaveBeenCalledWith(HOW_AZTEC_WORKS_URL, "_blank", "noopener,noreferrer")
	})

	test("a flag write that fails still opens the link", async () => {
		gas = ZERO
		vi.spyOn(console, "debug").mockImplementation(() => {})
		const w = await mountHome()
		storage.set.mockRejectedValue(new Error("quota"))
		const open = vi.spyOn(window, "open").mockImplementation(() => null)
		await w.get('[data-testid="get-started-aztec"]').trigger("click")
		await flushPromises()
		expect(open).toHaveBeenCalledTimes(1)
	})

	test("the phrase row and the banner's Save phrase both open the phrase reveal", async () => {
		gas = ZERO
		const calm = await mountHome()
		await calm.get('[data-testid="get-started-phrase"]').trigger("click")
		tokenHoldings = "some"
		const urgent = await mountHome()
		await urgent.get('[data-testid="backup-reminder-save"]').trigger("click")
		expect(router.push.mock.calls).toEqual([["/popup/settings/security/export/seed"], ["/popup/settings/security/export/seed"]])
	})

	test("Hide writes the profile's hidden flag, and the card keeps only what cannot be hidden", async () => {
		gas = ZERO
		const w = await mountHome()
		await w.get('[data-testid="get-started-hide"]').trigger("click")
		await flushPromises()
		expect(storage.data["nulo:ui:getStartedHidden@p1"]).toBe(true)
		storage.fire({ "nulo:ui:getStartedHidden@p1": { newValue: true } })
		await flushPromises()
		expect(w.findAll('[data-testid^="get-started-"]').map((el) => el.attributes("data-testid"))).toEqual(["get-started-phrase"])
	})

	test("a Presto already reached leaves its row out", async () => {
		gas = ZERO
		prestoReached = true
		const w = await mountHome()
		expect(has(w, "get-started-presto")).toBe(false)
		expect(has(w, "get-started-aztec")).toBe(true)
	})
})
