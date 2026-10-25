/**
 * Home's reminders: the sources that decide the Get started card and the backup banner, and what
 * a row does. BalanceView and the lists are stubbed; the flags go through the real storage facade.
 */
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { activityScopeKey } from "@nulo/wallet-core/activity"
import { EventHandler } from "@nulo/wallet-core/utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { defineComponent, h, reactive } from "vue"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("@/utils/core", async (importOriginal) => {
	const { chromeUiPreferences } = await import("../../../tests/helpers/ui-preference-fake")
	return { ...(await importOriginal<typeof import("@/utils/core")>()), managers: { uiPreference: chromeUiPreferences() } }
})
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
let prestoReadFailures = 0
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onUpdate: configEvents.update,
			onConnected: configEvents.connected,
			getValue: vi.fn(async () => {
				if (prestoReadFailures-- > 0) throw new Error("port closed")
				return prestoReached
			}),
		}
	}),
}))
/** The selected scope's gas slice at mount; later changes go through `gasByScope`. */
let gas: unknown
vi.mock("@/stores/balances.store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/balances.store")>()),
	useBalancesStore: () => ({ entry: gasEntry }),
}))

import { useAppStore } from "@/stores/app.store"
import type { BalanceScope } from "@/stores/balances.store"
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
const FUNDED = { status: "ready", display: { publicFeeJuice: "5", privateFeeJuice: null }, version: 1 }
const HOME_SCOPE: BalanceScope = { profileId: "p1", networkId: "n1", chainId: 1, accountAddress: "0xacct" }

/** Reactive as the store's entries are, so a mounted Home sees a slice change. */
const gasByScope = reactive(new Map<string, unknown>())
function gasEntry(scope: BalanceScope) {
	const slice = gasByScope.get(activityScopeKey(scope))
	return slice === undefined ? undefined : { gas: slice }
}
const AZTEC_KEY = "nulo:ui:getStartedAztecOpened@p1"
const HIDDEN = { "nulo:ui:getStartedHidden@p1": true }
const FEE_JUICE_KEY = "nulo:ui:getStartedFeeJuiceHeld@p1"
const PRESTO_KEY = "nulo:ui:getStartedPrestoOpened@p1"

const wrappers: VueWrapper[] = []
let storage: ChromeStorageMock

async function mountHome(type: "password" | "passkey" = "password", stored: Record<string, unknown> = {}) {
	storage = installChromeStorage(stored)
	const pinia = createTestingPinia({ stubActions: false })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.profile = { id: "p1", type } as never
	appStore.network = { id: "n1", chainId: 1 } as never
	appStore.account = { address: "0xacct" } as never
	if (gas !== undefined) gasByScope.set(activityScopeKey(HOME_SCOPE), gas)
	const wrapper = mount(General, { global: { plugins: [pinia], stubs: STUBS, provide: {} } })
	wrappers.push(wrapper)
	await flushPromises()
	return wrapper
}

const has = (w: VueWrapper, testId: string) => w.find(`[data-testid="${testId}"]`).exists()
/** The card's steps in order, a done one marked: `["phrase", "aztec done", ...]`. */
const rows = (w: VueWrapper) =>
	w
		.findAll('[data-testid="get-started"] [data-done]')
		.map((el) => `${el.attributes("data-testid")?.replace("get-started-", "")}${el.attributes("data-done") === "true" ? " done" : ""}`)

afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	tokenHoldings = "none"
	gas = undefined
	gasByScope.clear()
	prestoReached = false
	prestoReadFailures = 0
	vi.restoreAllMocks()
	vi.clearAllMocks()
})

describe("Home — the backup reminder's sources", () => {
	test("a first gas read that failed reads as empty: the calm card shows, offering Fee Juice", async () => {
		gas = { status: "degraded", version: 1 }
		const w = await mountHome()
		expect(rows(w)).toEqual(["phrase", "aztec", "feeJuice", "presto"])
		expect(has(w, "backup-reminder-banner")).toBe(false)
	})

	test("on a hidden card, token funds raise the banner before the gas read lands, but Home is not settled until it does", async () => {
		gas = { status: "fetching", version: 0 }
		tokenHoldings = "some"
		const w = await mountHome("password", HIDDEN)
		expect(has(w, "backup-reminder-banner")).toBe(true)
		expect(w.get('[data-testid="home-scroller"]').attributes("data-reminders-settled")).toBe("false")
	})

	test("on a hidden card, Fee Juice alone is funds: a positive read raises the banner with no token", async () => {
		gas = FUNDED
		const w = await mountHome("password", HIDDEN)
		expect(has(w, "backup-reminder-banner")).toBe(true)
		expect(has(w, "get-started")).toBe(false)
	})

	test("a funded first password wallet keeps the phrase as the card's next step, counts of 4, and shows no banner", async () => {
		gas = FUNDED
		const w = await mountHome()
		expect(has(w, "backup-reminder-banner")).toBe(false)
		expect(rows(w)).toEqual(["phrase", "aztec", "feeJuice done", "presto"])
		expect(w.get('[data-testid="get-started-count"]').text()).toBe("1 of 4 done")
		expect(w.findAll('[aria-current="step"]').map((el) => el.attributes("data-testid"))).toEqual(["get-started-phrase"])
	})

	test("an empty wallet keeps the calm phrase row and offers Fee Juice (control)", async () => {
		gas = ZERO
		const w = await mountHome()
		expect(has(w, "backup-reminder-banner")).toBe(false)
		expect(rows(w)).toEqual(["phrase", "aztec", "feeJuice", "presto"])
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
		expect(rows(w)).toEqual(["backup", "aztec", "feeJuice", "presto"])
	})
})

describe("Home — Get Fee Juice stays done once the profile holds Fee Juice", () => {
	test("Fee Juice arriving while Home is open writes the profile's flag once, and a spend back to zero keeps the step done", async () => {
		gas = { status: "fetching", version: 0 }
		const w = await mountHome("passkey")
		expect(storage.set).not.toHaveBeenCalled()
		gasByScope.set(activityScopeKey(HOME_SCOPE), ZERO)
		await flushPromises()
		expect(rows(w)).toEqual(["backup", "aztec", "feeJuice", "presto"])
		expect(storage.set).not.toHaveBeenCalled()
		gasByScope.set(activityScopeKey(HOME_SCOPE), FUNDED)
		await flushPromises()
		expect(storage.set).toHaveBeenCalledWith({ [FEE_JUICE_KEY]: true })
		storage.fire({ [FEE_JUICE_KEY]: { newValue: true } })
		gasByScope.set(activityScopeKey(HOME_SCOPE), ZERO)
		await flushPromises()
		expect(rows(w)).toEqual(["backup", "aztec", "feeJuice done", "presto"])
		gasByScope.set(activityScopeKey(HOME_SCOPE), FUNDED)
		await flushPromises()
		expect(storage.set).toHaveBeenCalledTimes(1)
	})

	test("after one account held it, another account and a reset's new chain holding none keep the step done; the phrase stays open", async () => {
		gas = ZERO
		const w = await mountHome("password", { [AZTEC_KEY]: true })
		const app = useAppStore()
		expect(rows(w)).toEqual(["phrase", "aztec done", "feeJuice", "presto"])
		const savings = { ...HOME_SCOPE, accountAddress: "0xsavings" }
		gasByScope.set(activityScopeKey(savings), FUNDED)
		app.account = { address: savings.accountAddress } as never
		await flushPromises()
		expect(storage.data[FEE_JUICE_KEY]).toBe(true)
		storage.fire({ [FEE_JUICE_KEY]: { newValue: true } })
		app.account = { address: HOME_SCOPE.accountAddress } as never
		await flushPromises()
		expect(rows(w)).toEqual(["phrase", "aztec done", "feeJuice done", "presto"])
		// A network whose chain id moved, as after a Testnet reset, is a scope with no read yet.
		app.network = { id: "n1", chainId: 2 } as never
		await flushPromises()
		expect(has(w, "get-started")).toBe(false)
		gasByScope.set(activityScopeKey({ ...HOME_SCOPE, chainId: 2 }), ZERO)
		await flushPromises()
		expect(rows(w)).toEqual(["phrase", "aztec done", "feeJuice done", "presto"])
	})
})

describe("Home — an imported profile", () => {
	const IMPORTED = { "nulo:ui:profileImported@p1": true }

	test.each(["password", "passkey"] as const)("an imported %s profile shows no card, and Home still settles", async (type) => {
		gas = ZERO
		const w = await mountHome(type, IMPORTED)
		expect(has(w, "get-started")).toBe(false)
		expect(has(w, "backup-reminder-banner")).toBe(false)
		expect(w.get('[data-testid="home-scroller"]').attributes("data-reminders-settled")).toBe("true")
	})

	test("an imported password wallet holding funds gets no banner either", async () => {
		gas = ZERO
		tokenHoldings = "some"
		const w = await mountHome("password", IMPORTED)
		expect(has(w, "backup-reminder-banner")).toBe(false)
		expect(has(w, "get-started")).toBe(false)
	})

	test.each(["password", "passkey"] as const)("a new %s profile shows the card (control)", async (type) => {
		gas = ZERO
		const w = await mountHome(type)
		expect(has(w, "get-started")).toBe(true)
		expect(has(w, "get-started-aztec")).toBe(true)
	})
})

describe("Home — a later profile", () => {
	const NOT_FIRST = { "nulo:ui:profileNotFirst@p1": true }

	test("a later password profile shows its phrase row alone, with no Hide, and no banner once funded", async () => {
		gas = ZERO
		tokenHoldings = "some"
		const w = await mountHome("password", NOT_FIRST)
		expect(w.findAll('[data-testid^="get-started-"]').map((row) => row.attributes("data-testid"))).toEqual(["get-started-phrase"])
		expect(has(w, "backup-reminder-banner")).toBe(false)
	})

	test("a later passkey profile shows no card, and Home still settles", async () => {
		gas = ZERO
		const w = await mountHome("passkey", NOT_FIRST)
		expect(has(w, "get-started")).toBe(false)
		expect(w.get('[data-testid="home-scroller"]').attributes("data-reminders-settled")).toBe("true")
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

	test("Make proofs faster opens Proving at once and marks the step once its write lands", async () => {
		gas = ZERO
		const w = await mountHome()
		const write = Promise.withResolvers<void>()
		storage.set.mockImplementationOnce(async (items: Record<string, unknown>) => {
			await write.promise
			Object.assign(storage.data, items)
		})
		await w.get('[data-testid="get-started-presto"]').trigger("click")
		await flushPromises()
		expect(router.push).toHaveBeenCalledWith("/popup/settings/proving")
		expect(storage.data[PRESTO_KEY]).toBeUndefined()
		write.resolve()
		await flushPromises()
		expect(storage.data[PRESTO_KEY]).toBe(true)
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
		await flushPromises()
		expect(storage.data[PRESTO_KEY]).toBeUndefined()
		tokenHoldings = "some"
		const urgent = await mountHome("password", HIDDEN)
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

	test("a failed Presto read leaves the step open, and a reconnect reads it again", async () => {
		gas = ZERO
		prestoReached = true
		prestoReadFailures = 1
		vi.spyOn(console, "debug").mockImplementation(() => {})
		const w = await mountHome()
		expect(rows(w)).toEqual(["phrase", "aztec", "feeJuice", "presto"])
		configEvents.connected.invoke(undefined)
		await flushPromises()
		expect(rows(w)).toEqual(["phrase", "aztec", "feeJuice", "presto done"])
	})

	test("a Presto already reached checks its step", async () => {
		gas = ZERO
		prestoReached = true
		const w = await mountHome()
		expect(rows(w)).toEqual(["phrase", "aztec", "feeJuice", "presto done"])
	})
})
