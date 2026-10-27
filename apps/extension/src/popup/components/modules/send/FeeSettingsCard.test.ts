/**
 * Component tests for `FeeSettingsCard`. Covers the architectural
 * contract: `feeSettings` is derived from fully-resolved init state
 * (gated on `isInitComplete`), persistence fires only on user-action
 * boundaries, and clearing `selectedMethod` cascades through to the
 * v-model.
 *
 * Bug pin: a saved `fj` (or `private_fpc`) selection used to silently
 * produce `feeSettings === undefined` because the watcher fired against
 * still-zero `gasBalances`. The first three tests guard the init-gating fix.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { config, flushPromises, mount } from "@vue/test-utils"
import { createPinia } from "pinia"
import { reactive } from "vue"
import { ImportedAccountUnusableError } from "@nulo/extension-messaging/errors"
import { type Deferred, deferred } from "@nulo/wallet-core/utils"

const mocks = vi.hoisted(() => ({
	getGasBalances: vi.fn(),
	getTokenBalances: vi.fn(),
	getFpcs: vi.fn(),
	getFeePicks: vi.fn(),
	saveFeePick: vi.fn(),
}))

// The real methods are client methods, so the card must call them on `managers.uiPreference`.
vi.mock("@/utils/core", () => {
	const uiPreference = {
		getFeePicks(this: unknown, ...args: unknown[]) {
			if (this !== uiPreference) throw new Error("getFeePicks called off managers.uiPreference")
			return mocks.getFeePicks(...args)
		},
		saveFeePick(this: unknown, ...args: unknown[]) {
			if (this !== uiPreference) throw new Error("saveFeePick called off managers.uiPreference")
			return mocks.saveFeePick(...args)
		},
	}
	return { managers: { uiPreference } }
})

// Vitest 4 requires `function` expressions (not arrow functions) for mocks
// instantiated with `new`. Arrow factories error: "() => ... is not a constructor".
vi.mock("@/wallet/services/execution/client", () => ({
	ExecutionServiceClient: vi.fn().mockImplementation(function () {
		return {
			disconnect: vi.fn(),
			connect: vi.fn(),
			getGasBalances: mocks.getGasBalances,
		}
	}),
}))

vi.mock("@/wallet/services/token-balance/client", () => ({
	TokenBalanceServiceClient: vi.fn().mockImplementation(function () {
		return {
			onTokenBalanceAdded: { add: vi.fn(), remove: vi.fn() },
			onTokenBalanceUpdated: { add: vi.fn(), remove: vi.fn() },
			onTokenBalanceDeleted: { add: vi.fn(), remove: vi.fn() },
			connect: vi.fn(),
			disconnect: vi.fn(),
			getTokenBalances: mocks.getTokenBalances,
		}
	}),
}))

vi.mock("@/wallet/services/fpc/client", () => ({
	FpcServiceClient: vi.fn().mockImplementation(function () {
		return {
			onFpcDeleted: { add: vi.fn(), remove: vi.fn() },
			onFpcUpdated: { add: vi.fn(), remove: vi.fn() },
			connect: vi.fn(),
			disconnect: vi.fn(),
			getFpcs: mocks.getFpcs,
		}
	}),
	FpcType: { DefaultSponsoredFpc: 1, PrivateFpc: 2 },
}))

// The balances store owns a tx-settle subscription; this card never uses it.
vi.mock("@/wallet/services/transaction/client", () => ({
	TransactionServiceClient: vi.fn().mockImplementation(function () {
		return {
			connect: vi.fn(),
			disconnect: vi.fn(),
			onTransactionAdded: { add: vi.fn(), remove: vi.fn() },
			onTransactionUpdated: { add: vi.fn(), remove: vi.fn() },
		}
	}),
}))

// The balances store's belt watcher reads the app store's active profile; this
// suite drives identity via PROPS, so an inert stand-in keeps the belt quiet
// (and keeps the real app.store's chrome.storage.onChanged wiring out).
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({ profile: undefined }),
}))

import FeeSettingsCard from "./FeeSettingsCard.vue"
import { applyFeePickUpdate, type FeePickUpdate } from "@/utils/fee-picks"
import { readFeePicks } from "../../../../../tests/helpers/ui-preference-fake"
import { feePicksKey, sendFeePicksKey } from "@/utils/profile-ui-keys"
import { INIT_FETCH_TIMEOUT_MS, INIT_RETRY_BACKOFF_MS, useBalancesStore } from "@/stores/balances.store"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i></i>" },
	Tooltip: { template: '<div><slot /><slot name="content" /></div>' },
	FeeMethodSelector: {
		props: ["modelValue", "methods", "payerNoticeShape", "pending"],
		emits: ["update:modelValue", "open", "close"],
		template: `
			<div data-testid="fee-method-selector"
			     :data-active-type="modelValue?.type"
			     :data-active-title="modelValue?.title"
			     :data-pending="String(pending)">
				<span v-if="payerNoticeShape" data-testid="send-fee-privacy-notice" :data-notice-shape="payerNoticeShape" />
				<button
					v-for="m in methods"
					:key="m.fpc?.id ?? m.type"
					:data-testid="'pick-' + m.type"
					:data-fpc-id="m.fpc?.id"
					:data-disabled="m.disabled ? 'true' : 'false'"
					:data-checking="m.checking ? 'true' : 'false'"
					:data-verifying="m.verifying ? 'true' : 'false'"
					:data-reason="m.disabledReason"
					:data-spend="m.spend"
					@click="!m.disabled && $emit('update:modelValue', m)"
				>{{ m.title }}</button>
			</div>
		`,
	},
	FeeMethodRow: { props: ["pending"], template: '<div data-testid="fee-method-row" :data-pending="String(pending)" />' },
	FeeCostReadout: {
		props: ["estimate", "isEstimating", "payer", "pending", "amountTyped"],
		template:
			'<div data-testid="fee-cost-readout" :data-payer="payer" :data-pending="String(pending)" :data-amount-typed="String(amountTyped)" />',
	},
	FeePriorityRow: {
		props: ["modelValue"],
		emits: ["update:modelValue"],
		template:
			'<div data-testid="fee-priority-row"><button data-testid="pick-fast" @click="$emit(\'update:modelValue\', \'fast\')">fast</button></div>',
	},
}

const FEE_METHOD_LS_KEY = feePicksKey("p1")

const profile = { id: "p1", name: "Profile 1" }
const network = { id: "n1", chainId: 11155111 }
const account = { id: "a1", address: "0xacct" }

const baseProps = (over: Record<string, unknown> = {}) => ({
	profile,
	network,
	account,
	feeEstimate: null,
	isEstimating: false,
	embedded: false,
	...over,
})

/** Storage backing — set in beforeEach so each test starts with a clean slate. */
let storageBacking: Record<string, unknown>

/** Stub `chrome.storage.local`. The global setup at tests/vitest.setup.ts:88
 *  only stubs `chrome.runtime`; storage requires per-suite shimming. Values cross it as clones, as
 *  in a browser: a write refuses what Firefox refuses, and no caller holds the backing's objects. */
function stubChromeStorage() {
	const local = {
		QUOTA_BYTES: 10485760,
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: accepted at score 19 — the Chrome-storage fake implements the null / string / string[] lookup contract; those branches are its API
		get: async (keys: string | string[] | null | undefined) => {
			const result: Record<string, unknown> = {}
			if (keys == null) {
				for (const [k, v] of Object.entries(storageBacking)) result[k] = v
			} else if (typeof keys === "string") {
				if (keys in storageBacking) result[keys] = storageBacking[keys]
			} else if (Array.isArray(keys)) {
				for (const k of keys) if (k in storageBacking) result[k] = storageBacking[k]
			}
			return structuredClone(result)
		},
		set: async (items: Record<string, unknown>) => {
			for (const [k, v] of Object.entries(structuredClone(items))) storageBacking[k] = v
		},
		remove: async (keys: string | string[]) => {
			const list = Array.isArray(keys) ? keys : [keys]
			for (const k of list) delete storageBacking[k]
		},
		getKeys: async () => Object.keys(storageBacking),
	}
	// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
	;(globalThis as any).chrome = {
		// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
		...(globalThis as any).chrome,
		storage: { local },
	}
}

beforeEach(() => {
	// A FRESH pinia is INJECTED into every mount via the global config:
	// `setActivePinia` does not isolate component suites here — the SFC's
	// transform chain resolves a different pinia module copy than this file's
	// import, so stores would silently SHARE state across tests. The injected
	// plugin wins inside the component; post-mount `useBalancesStore()` calls
	// in tests resolve to the same instance.
	config.global.plugins = [createPinia()]
	storageBacking = {}
	stubChromeStorage()
	mocks.getGasBalances.mockReset()
	mocks.getTokenBalances.mockReset()
	mocks.getFpcs.mockReset()
	mocks.getFeePicks.mockReset()
	mocks.saveFeePick.mockReset()
	// The preference service's reader and writer, over this suite's storage: the real parsers and
	// reducer, no lock and no seal.
	mocks.getFeePicks.mockImplementation((profileId: string) => readFeePicks(chrome.storage.local, profileId))
	mocks.saveFeePick.mockImplementation(async (profileId: string, update: FeePickUpdate) => {
		const keys = { app: feePicksKey(profileId), send: sendFeePicksKey(profileId) }
		const next = applyFeePickUpdate({ app: storageBacking[keys.app], send: storageBacking[keys.send] }, update)
		if (next.app) storageBacking[keys.app] = next.app
		if (next.send) storageBacking[keys.send] = next.send
		return true
	})
	// Defaults — individual tests override.
	mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: null })
	mocks.getTokenBalances.mockResolvedValue([])
	mocks.getFpcs.mockResolvedValue([])
})

afterEach(() => {
	vi.clearAllMocks()
	config.global.plugins = []
})

const lastEmittedSettings = (w: ReturnType<typeof mount>) => {
	const events = w.emitted<unknown[]>("update:modelValue")
	if (!events?.length) return undefined
	return events[events.length - 1][0]
}

/** Fires an FPC service event at the most recently mounted card. */
const fpcEvent = async (name: "onFpcDeleted" | "onFpcUpdated", payload: unknown) => {
	const { FpcServiceClient } = await import("@/wallet/services/fpc/client")
	const results = vi.mocked(FpcServiceClient).mock.results
	const instance = results[results.length - 1].value as Record<string, { add: ReturnType<typeof vi.fn> }>
	const handler = instance[name].add.mock.calls[0]?.[0] as ((f: unknown) => void) | undefined
	if (!handler) throw new Error(`the card never subscribed to ${name}`)
	handler(payload)
}

describe("FeeSettingsCard — bug pins (init race)", () => {
	test("(BUG PIN) saved fj + delayed gas: settings stays undefined until gas resolves, then emits valid", async () => {
		// Stored as the wallet currently writes — full FeeMethodOption snapshot.
		// resolveSavedSelection must read .type semantically, not the stored balance.
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: { type: "fj", title: "Fee Juice", subtitle: "public", inPublic: true },
		}
		const gas = deferred<{ publicFeeJuice: string; privateFeeJuice: string | null }>()
		mocks.getGasBalances.mockReturnValueOnce(gas.promise)

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })

		// Microtask flush — saved is read, pre-fill happens, but Promise.all is gated on gas.
		await flushPromises()
		expect(lastEmittedSettings(w)).toBeUndefined()

		// Resolve the gas promise with non-zero balance.
		gas.resolve({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
	}, 5000)

	test("(BUG PIN) saved private_fpc + delayed gas: settings stays undefined until gas resolves with non-zero privateFeeJuice", async () => {
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: {
				type: "private_fpc",
				title: "Private Fee Juice",
				subtitle: "private",
				fpc: { id: "p1", type: 2, name: "Private FPC", isProtocol: true },
			},
		}
		const gas = deferred<{ publicFeeJuice: string; privateFeeJuice: string | null }>()
		mocks.getGasBalances.mockReturnValueOnce(gas.promise)
		mocks.getFpcs.mockResolvedValue([{ id: "p1", type: 2, name: "Private FPC", isProtocol: true }])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(lastEmittedSettings(w)).toBeUndefined()

		gas.resolve({ publicFeeJuice: "0", privateFeeJuice: "5000000000000000000" })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "p1" } })
	}, 5000)
})

describe("FeeSettingsCard — mounting & init contract", () => {
	test("no saved method, sponsored available: auto-selects sponsored and emits valid settings", async () => {
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
	})

	test("no saved method, no sponsored: emits no truthy settings (stays undefined)", async () => {
		mocks.getFpcs.mockResolvedValue([])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		const events = w.emitted<unknown[]>("update:modelValue") ?? []
		const truthy = events.filter((ev) => ev[0] !== undefined && ev[0] !== null)
		expect(truthy).toEqual([])
	})

	test("saved DefaultSponsoredFpc emits valid settings", async () => {
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: {
				type: "fpc",
				fpc: { id: "s1", type: 1, name: "Sponsor" },
			},
		}
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
	})

	test("stale saved record (fpcId no longer in fresh fpcs) falls through to sponsored auto-select", async () => {
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: {
				type: "fpc",
				fpc: { id: "deleted-fpc", type: 1, name: "deleted-sponsor" },
			},
		}
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
	})
})

describe("FeeSettingsCard — a method the dApp locked", () => {
	test("locked to Fee Juice: the saved sponsored choice never replaces it, no selector is offered, settings are Fee Juice", async () => {
		storageBacking[FEE_METHOD_LS_KEY] = { [account.address]: { type: "fpc", fpc: { id: "s1", type: 1, name: "Sponsor" } } }
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps({ lockedMethod: "fj" }), global: { stubs: STUBS } })
		await flushPromises()

		const locked = w.find('[data-testid="send-fee-locked"]')
		expect(locked.findAll("span").map((n) => n.text())).toEqual(["Fee", "Public Fee Juice · set by the app"])
		expect(w.find('[data-testid="fee-method-selector"]').exists()).toBe(false)
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		expect(w.find('[data-testid="fee-cost-readout"]').attributes("data-payer")).toBe("self")
		// A locked mount reads the balance FRESH: the dApp asked because the balance just moved.
		expect(mocks.getGasBalances).toHaveBeenCalledWith(expect.anything(), expect.anything(), true)
		// The lock is the dApp's, not a preference: nothing is persisted for the account.
		expect((storageBacking[FEE_METHOD_LS_KEY] as Record<string, { type: string }>)[account.address].type).toBe("fpc")
	})

	test("locked to Fee Juice with none held: no settings, and the get-fee-juice nudge shows", async () => {
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps({ lockedMethod: "fj" }), global: { stubs: STUBS } })
		await flushPromises()

		const truthy = (w.emitted<unknown[]>("update:modelValue") ?? []).filter((ev) => ev[0] !== undefined && ev[0] !== null)
		expect(truthy).toEqual([])
		expect(w.find('[data-testid="send-fee-nudge"]').exists()).toBe(true)
	})
})

describe("FeeSettingsCard — who the readout says pays", () => {
	test("it follows the paying method: Nulo's sponsor, one added by hand, then the account", async () => {
		mocks.getFpcs.mockResolvedValue([
			{ id: "s1", type: 1, name: "Sponsored", isProtocol: true },
			{ id: "s2", type: 1, name: "Dev sponsor", isProtocol: false },
		])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		const payer = () => w.find('[data-testid="fee-cost-readout"]').attributes("data-payer")
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		expect(payer()).toBe("sponsor")

		await w.findAll('[data-testid="pick-fpc"]')[1].trigger("click")
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s2" } })
		expect(payer()).toBe("unvouched")

		await w.find('[data-testid="pick-fj"]').trigger("click")
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		expect(payer()).toBe("self")
		w.unmount()
	})
})

describe("FeeSettingsCard — the default sponsor, with no saved pick", () => {
	const HAND_ADDED = { id: "s2", type: 1, name: "Dev sponsor", isProtocol: false }

	test("Nulo's sponsor, even listed after one added by hand, and the readout says a sponsor pays", async () => {
		mocks.getFpcs.mockResolvedValue([HAND_ADDED, { id: "s1", type: 1, name: "Sponsored", isProtocol: true }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		expect(w.find('[data-testid="fee-cost-readout"]').attributes("data-payer")).toBe("sponsor")
		w.unmount()
	})

	test("only one added by hand: nothing is selected", async () => {
		mocks.getFpcs.mockResolvedValue([HAND_ADDED])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		const truthy = (w.emitted<unknown[]>("update:modelValue") ?? []).filter((ev) => ev[0] !== undefined && ev[0] !== null)
		expect(truthy).toEqual([])
		expect(w.find('[data-testid="fee-method-selector"]').attributes("data-active-type")).toBeUndefined()
		w.unmount()
	})

	/** Nulo's sponsor, then its address edited in another window: the row turns custom. */
	test.each([
		{ saved: false, after: undefined },
		{ saved: true, after: { paymentMethod: { kind: "fpc", fpcId: "s1" } } },
	])("its address edited elsewhere: dropped when chosen unasked, kept when picked (saved $saved)", async ({ saved, after }) => {
		const { FpcServiceClient } = await import("@/wallet/services/fpc/client")
		const NULO = { id: "s1", type: 1, name: "Sponsored", isProtocol: true }
		if (saved) storageBacking[FEE_METHOD_LS_KEY] = { [account.address]: { type: "fpc", fpc: NULO } }
		mocks.getFpcs.mockResolvedValue([NULO])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

		const fpc = vi.mocked(FpcServiceClient).mock.results.at(-1)?.value as { onFpcUpdated: { add: ReturnType<typeof vi.fn> } }
		const onUpdated = fpc.onFpcUpdated.add.mock.calls[0]?.[0] as (f: unknown) => void
		onUpdated({ ...NULO, address: `0x${"ab".repeat(32)}`, isProtocol: false })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual(after)
		w.unmount()
	})

	const EDITED = { id: "s1", type: 1, name: "Sponsored", address: `0x${"ab".repeat(32)}`, isProtocol: false }
	const lastFpcHandler = async (name: "onFpcUpdated") => {
		const { FpcServiceClient } = await import("@/wallet/services/fpc/client")
		const fpc = vi.mocked(FpcServiceClient).mock.results.at(-1)?.value as Record<typeof name, { add: ReturnType<typeof vi.fn> }>
		return fpc[name].add.mock.calls[0]?.[0] as (f: unknown) => void
	}

	test("a default dropped for its edited address stays dropped when a failed gas read recovers", async () => {
		vi.useFakeTimers()
		try {
			mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsored", isProtocol: true }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			;(await lastFpcHandler("onFpcUpdated"))(EDITED)
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toBeUndefined()

			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
			await vi.advanceTimersByTimeAsync(0)
			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(false)
			expect(lastEmittedSettings(w)).toBeUndefined()
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("after an account switch, the new account's saved pick follows an edit made while it loads", async () => {
		const NULO = { id: "s1", type: 1, name: "Sponsored", isProtocol: true }
		mocks.getFpcs.mockResolvedValue([NULO])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

		storageBacking[FEE_METHOD_LS_KEY] = { "0xother": { type: "fpc", fpc: NULO } }
		const gas = deferred<{ publicFeeJuice: string; privateFeeJuice: string | null }>()
		mocks.getGasBalances.mockReturnValueOnce(gas.promise)
		await w.setProps({ account: { id: "a2", address: "0xother" } })
		await flushPromises()

		;(await lastFpcHandler("onFpcUpdated"))(EDITED)
		gas.resolve({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		w.unmount()
	})
})

describe("FeeSettingsCard — user actions", () => {
	test("picking fj from dropdown: emits valid settings, persists semantic record to storage", async () => {
		mocks.getFpcs.mockResolvedValue([])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		await w.find('[data-testid="pick-fj"]').trigger("click")
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		const stored = (storageBacking[FEE_METHOD_LS_KEY] as Record<string, unknown>)?.[account.address] as { type?: string }
		expect(stored?.type).toBe("fj")
	})

	test("the mode is chosen when the card opens: an app card handed an origin later still saves an app pick", async () => {
		mocks.getFpcs.mockResolvedValue([])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		await w.setProps({ originPrivacy: "private" })
		await w.find('[data-testid="pick-fj"]').trigger("click")
		await flushPromises()

		expect(mocks.saveFeePick.mock.calls.map(([, update]) => (update as { kind: string }).kind)).toEqual(["app"])
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		w.unmount()
	})

	test("priority change: emits settings with priorityLevel set; payment method preserved", async () => {
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

		await w.find('[data-testid="pick-fast"]').trigger("click")
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({
			paymentMethod: { kind: "fpc", fpcId: "s1" },
			priorityLevel: "fast",
		})
	})
})

describe("FeeSettingsCard — the saved pick, outside Send", () => {
	const NULO = { id: "s1", type: 1, name: "Sponsored", isProtocol: true }
	const HAND_ADDED = { id: "s2", type: 1, name: "Dev sponsor", isProtocol: false }
	const HELD = { publicFeeJuice: "1000000000000000000", privateFeeJuice: null }
	const pickSponsor = (w: ReturnType<typeof mount>, id: string) =>
		w.find(`[data-testid="pick-fpc"][data-fpc-id="${id}"]`).trigger("click")
	const savedFor = (address: string) => (storageBacking[FEE_METHOD_LS_KEY] as Record<string, unknown> | undefined)?.[address]
	const selector = (w: ReturnType<typeof mount>) => w.find('[data-testid="fee-method-selector"]')
	const lastPayer = (w: ReturnType<typeof mount>) => w.emitted<unknown[]>("update:payer")?.at(-1)?.[0]

	test("a hand-added sponsor's pick is saved as plain data and is what the next card opens on", async () => {
		mocks.getFpcs.mockResolvedValue([NULO, HAND_ADDED])
		mocks.getGasBalances.mockResolvedValue(HELD)
		const first = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		await pickSponsor(first, "s2")
		await flushPromises()

		expect(savedFor(account.address)).toEqual({
			type: "fpc",
			title: "Dev sponsor",
			subtitle: "sponsored",
			fpc: { id: "s2", isProtocol: false },
		})
		first.unmount()

		// A fresh store has no FPC list to answer early, so only the saved record can name the sponsor.
		config.global.plugins = [createPinia()]
		const fpcs = deferred<unknown>()
		mocks.getFpcs.mockReturnValueOnce(fpcs.promise)
		const next = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(selector(next).attributes("data-active-title")).toBe("Dev sponsor")

		fpcs.resolve([NULO, HAND_ADDED])
		await flushPromises()
		expect(selector(next).attributes("data-active-type")).toBe("fpc")
		expect(lastEmittedSettings(next)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s2" } })
		next.unmount()
	})

	test.each([
		{ fpc: NULO, payer: "sponsor" },
		{ fpc: HAND_ADDED, payer: "unvouched" },
	])(
		"a same-identity re-run pays through the saved $fpc.name as the pick did, before and after its reads land",
		async ({ fpc, payer }) => {
			mocks.getFpcs.mockResolvedValue([NULO, HAND_ADDED])
			mocks.getGasBalances.mockResolvedValue(HELD)
			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await flushPromises()
			await pickSponsor(w, fpc.id)
			await flushPromises()

			const before = {
				picks: mocks.getFeePicks.mock.calls.length,
				gas: mocks.getGasBalances.mock.calls.length,
				fpcs: mocks.getFpcs.mock.calls.length,
				payers: w.emitted("update:payer")?.length ?? 0,
			}
			const gas = deferred<unknown>()
			const fpcs = deferred<unknown>()
			mocks.getGasBalances.mockReturnValueOnce(gas.promise)
			mocks.getFpcs.mockReturnValueOnce(fpcs.promise)
			await w.setProps({ profile: { ...profile } })
			await flushPromises()
			expect(mocks.getFeePicks.mock.calls.length).toBe(before.picks + 1)
			expect(mocks.getGasBalances.mock.calls.length).toBe(before.gas + 1)
			expect(mocks.getFpcs.mock.calls.length).toBe(before.fpcs + 1)
			expect(w.emitted("update:payer")?.length ?? 0).toBeGreaterThan(before.payers)

			const paysThroughSponsor = () => {
				expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: fpc.id } })
				expect(lastPayer(w)).toEqual({ type: "fpc", fpcId: fpc.id, isProtocol: fpc.isProtocol })
				expect(w.find('[data-testid="fee-cost-readout"]').attributes("data-payer")).toBe(payer)
			}
			paysThroughSponsor()

			gas.resolve(HELD)
			fpcs.resolve([NULO, HAND_ADDED])
			await flushPromises()
			paysThroughSponsor()
			w.unmount()
		},
	)

	test("a failed save is logged once under a named key and leaves the pick and the saved map as they were", async () => {
		const otherAccount = { "0xother": { type: "fj", title: "Public Fee Juice", subtitle: "public" } }
		storageBacking[FEE_METHOD_LS_KEY] = structuredClone(otherAccount)
		mocks.getFpcs.mockResolvedValue([NULO, HAND_ADDED])
		mocks.getGasBalances.mockResolvedValue(HELD)
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		const refusal = new Error("QUOTA_BYTES quota exceeded")
		mocks.saveFeePick.mockRejectedValueOnce(refusal)
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			await pickSponsor(w, "s2")
			await flushPromises()
			expect(logged.mock.calls.filter(([message]) => message === "Failed to save the fee method")).toEqual([
				["Failed to save the fee method", { error: refusal }],
			])
		} finally {
			logged.mockRestore()
		}
		expect(storageBacking[FEE_METHOD_LS_KEY]).toEqual(otherAccount)
		expect(selector(w).attributes("data-active-title")).toBe("Dev sponsor")
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s2" } })
		w.unmount()
	})
})

describe("FeeSettingsCard — reactivity & lifecycle", () => {
	test("FPC deletion clears selectedMethod: settings re-emits as undefined", async () => {
		const { FpcServiceClient } = await import("@/wallet/services/fpc/client")
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: {
				type: "fpc",
				fpc: { id: "s1", type: 1, name: "Sponsor" },
			},
		}
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(lastEmittedSettings(w)).toBeTruthy()

		const fpcInstances = vi.mocked(FpcServiceClient).mock.results
		const fpcInstance = fpcInstances[fpcInstances.length - 1].value as {
			onFpcDeleted: { add: ReturnType<typeof vi.fn> }
		}
		const handler = fpcInstance.onFpcDeleted.add.mock.calls[0]?.[0] as (f: unknown) => void
		handler({ id: "s1" })
		await flushPromises()

		expect(lastEmittedSettings(w)).toBeUndefined()
	})

	test("FPC rename updates selected method's fpc.name; storage NOT written", async () => {
		const { FpcServiceClient } = await import("@/wallet/services/fpc/client")
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: {
				type: "fpc",
				fpc: { id: "s1", type: 1, name: "Sponsor" },
			},
		}
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		const initialStorageSnapshot = JSON.stringify(storageBacking[FEE_METHOD_LS_KEY])

		const fpcInstances = vi.mocked(FpcServiceClient).mock.results
		const fpcInstance = fpcInstances[fpcInstances.length - 1].value as {
			onFpcUpdated: { add: ReturnType<typeof vi.fn> }
		}
		const handler = fpcInstance.onFpcUpdated.add.mock.calls[0]?.[0] as (f: unknown) => void
		handler({ id: "s1", type: 1, name: "Renamed Sponsor" })
		await flushPromises()

		// Settings shape unchanged.
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		// Storage was NOT touched by the rename event.
		expect(JSON.stringify(storageBacking[FEE_METHOD_LS_KEY])).toBe(initialStorageSnapshot)
	})

	test("user picks during init: a sponsor the early FPC list answered survives the late reconciliation", async () => {
		// Saved is Fee Juice. The FPC list lands before the balance read, so the sponsor row is
		// answered mid-init; the resolver sees selectedMethod moved off the pre-fill snapshot and
		// skips the saved-selection branch.
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: { type: "fj", title: "Public Fee Juice", subtitle: "public" },
		}
		const gas = deferred<{ publicFeeJuice: string; privateFeeJuice: string | null }>()
		mocks.getGasBalances.mockReturnValueOnce(gas.promise)
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(w.find('[data-testid="pick-fpc"]').attributes("data-checking")).toBe("false")
		await w.find('[data-testid="pick-fpc"]').trigger("click")
		await flushPromises()

		gas.resolve({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
	})

	test("a loading row is not a pick: Fee Juice clicked before its balance lands leaves the saved selection", async () => {
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: { type: "fpc", fpc: { id: "s1", type: 1, name: "Sponsor" } },
		}
		const saved = JSON.stringify(storageBacking[FEE_METHOD_LS_KEY])
		const gas = deferred<{ publicFeeJuice: string; privateFeeJuice: string | null }>()
		mocks.getGasBalances.mockReturnValueOnce(gas.promise)
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(w.find('[data-testid="pick-fj"]').attributes("data-checking")).toBe("true")
		await w.find('[data-testid="pick-fj"]').trigger("click")
		await flushPromises()
		expect(JSON.stringify(storageBacking[FEE_METHOD_LS_KEY])).toBe(saved)

		gas.resolve({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
	})

	test("account prop change re-runs init for the new account's saved record", async () => {
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

		// Set a saved selection for a DIFFERENT account; switch the prop to it.
		storageBacking[FEE_METHOD_LS_KEY] = {
			"0xother": { type: "fj" },
		}
		await w.setProps({ account: { id: "a2", address: "0xother" } })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
	})
})

describe("FeeSettingsCard — rows while the read is in flight", () => {
	const PRIVATE_FPC = { id: "p1", type: 2, name: "Private Fee Juice", isProtocol: true }
	const SPONSOR = { id: "s1", type: 1, name: "Sponsored", isProtocol: true }
	const HELD = "1000000000000000000"
	const rowState = (w: ReturnType<typeof mount>) =>
		w.findAll('[data-testid="fee-method-selector"] [data-testid^="pick-"]').map((b) => ({
			type: b.attributes("data-testid")?.slice(5),
			fpc: b.attributes("data-fpc-id") ?? null,
			checking: b.attributes("data-checking") === "true",
			spend: b.attributes("data-spend") ?? null,
		}))
	/** Holds the card's next read of its saved picks until the returned release. The value is read
	 *  before the hold. */
	const holdSavedSelectionRead = () => {
		const gate = deferred<void>()
		const read = mocks.getFeePicks.getMockImplementation() as (profileId: string) => Promise<unknown>
		mocks.getFeePicks.mockImplementationOnce(async (profileId: string) => {
			const value = await read(profileId)
			await gate.promise
			return value
		})
		return () => gate.resolve()
	}
	const SAVED_FJ = { type: "fj", title: "Public Fee Juice", subtitle: "public" }

	test("every row loads until the FPC list lands, which answers the sponsors before the balances do", async () => {
		const fpcs = deferred<unknown>()
		const gas = deferred<unknown>()
		mocks.getFpcs.mockReturnValue(fpcs.promise)
		mocks.getGasBalances.mockReturnValue(gas.promise)
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(rowState(w)).toEqual([
			{ type: "fj", fpc: null, checking: true, spend: null },
			{ type: "private_fpc", fpc: null, checking: true, spend: null },
			{ type: "fpc", fpc: null, checking: true, spend: null },
		])

		fpcs.resolve([PRIVATE_FPC, SPONSOR])
		await flushPromises()
		expect(rowState(w)).toEqual([
			{ type: "fj", fpc: null, checking: true, spend: null },
			{ type: "private_fpc", fpc: "p1", checking: true, spend: null },
			{ type: "fpc", fpc: "s1", checking: false, spend: "free" },
		])
		expect(w.emitted("update:modelValue")).toBeUndefined()

		gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: HELD })
		await flushPromises()
		expect(rowState(w).map(({ checking, spend }) => ({ checking, spend }))).toEqual([
			{ checking: false, spend: "1 FJ" },
			{ checking: false, spend: "1 FJ" },
			{ checking: false, spend: "free" },
		])
		w.unmount()
	})

	test("an identity switch never draws the previous identity's FPC rows while the new reads are pending", async () => {
		mocks.getFpcs.mockResolvedValue([SPONSOR])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: null })
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(rowState(w).find((r) => r.type === "fpc")).toMatchObject({ fpc: "s1", checking: false })

		const fpcs = deferred<unknown>()
		mocks.getFpcs.mockReturnValue(fpcs.promise)
		mocks.getGasBalances.mockReturnValue(new Promise(() => {}))
		await w.setProps({ account: { id: "a2", address: "0xother" } })
		await flushPromises()
		expect(rowState(w)).toEqual([
			{ type: "fj", fpc: null, checking: true, spend: null },
			{ type: "private_fpc", fpc: null, checking: true, spend: null },
			{ type: "fpc", fpc: null, checking: true, spend: null },
		])

		fpcs.resolve([{ ...SPONSOR, id: "s9" }])
		await flushPromises()
		expect(rowState(w).find((r) => r.type === "fpc")).toMatchObject({ fpc: "s9", checking: false })
		w.unmount()
	})

	test("a snapshot is reconciled against its own rows: a retained FPC list still gives the default sponsor when its refresh fails", async () => {
		mocks.getFpcs.mockResolvedValue([SPONSOR])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: null })
		const holder = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		mocks.getFpcs.mockRejectedValue(new Error("fpc read failed"))
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		w.unmount()
		holder.unmount()
	})

	test("a sponsor picked while the saved selection is still being read is not overwritten by it", async () => {
		mocks.getFpcs.mockResolvedValue([SPONSOR])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: null })
		const holder = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		storageBacking[FEE_METHOD_LS_KEY] = { [account.address]: SAVED_FJ }
		const release = holdSavedSelectionRead()
		const gas = deferred<unknown>()
		mocks.getGasBalances.mockReturnValue(gas.promise)
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(rowState(w).find((r) => r.type === "fpc")).toMatchObject({ fpc: "s1", checking: false })
		await w.find('[data-testid="pick-fpc"]').trigger("click")

		release()
		await flushPromises()
		gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: null })
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		w.unmount()
		holder.unmount()
	})

	test("an early pick of a sponsor the refreshed list no longer has is dropped, not paid through", async () => {
		const GONE = { id: "s2", type: 1, name: "Gone", isProtocol: false }
		mocks.getFpcs.mockResolvedValue([SPONSOR, GONE])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: null })
		const holder = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		mocks.getFpcs.mockResolvedValue([SPONSOR])
		const release = holdSavedSelectionRead()
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		await w.find('[data-testid="pick-fpc"][data-fpc-id="s2"]').trigger("click")

		release()
		await flushPromises()
		expect(lastEmittedSettings(w)).toBeUndefined()
		w.unmount()
		holder.unmount()
	})

	test("a re-pick of the selected row during a refresh's read is a pick: another card's save does not replace it", async () => {
		mocks.getFpcs.mockResolvedValue([SPONSOR])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: null })
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		// A pick from the menu makes the selection the very row the re-pick hands back.
		await w.find('[data-testid="pick-fpc"]').trigger("click")
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

		storageBacking[FEE_METHOD_LS_KEY] = { [account.address]: SAVED_FJ }
		const release = holdSavedSelectionRead()
		await w.setProps({ account: { ...account } })
		await flushPromises()
		await w.find('[data-testid="pick-fpc"]').trigger("click")

		release()
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		w.unmount()
	})

	test("a sponsor deleted before the balances land leaves the dApp menu and stays gone after the commit", async () => {
		const CUSTOM = { id: "s2", type: 1, name: "Custom", isProtocol: false }
		const gas = deferred<unknown>()
		mocks.getFpcs.mockResolvedValue([SPONSOR, CUSTOM])
		mocks.getGasBalances.mockReturnValue(gas.promise)
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		const listsCustom = () => rowState(w).some((r) => r.fpc === "s2")
		expect(listsCustom()).toBe(true)

		await fpcEvent("onFpcDeleted", { id: "s2" })
		await flushPromises()
		expect(listsCustom()).toBe(false)
		gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: null })
		await flushPromises()
		expect(listsCustom()).toBe(false)
		w.unmount()
	})

	test("an identity changed in place, which no read is coming for, does not load forever", async () => {
		mocks.getFpcs.mockResolvedValue([SPONSOR])
		const gas = deferred<unknown>()
		mocks.getGasBalances.mockReturnValueOnce(gas.promise)
		const live = { profile: reactive({ ...profile }), network: reactive({ ...network }), account: reactive({ ...account }) }
		const w = mount(FeeSettingsCard, { props: baseProps(live), global: { stubs: STUBS } })
		await flushPromises()
		expect(rowState(w).some((r) => r.checking)).toBe(true)

		live.account.address = "0xother"
		gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: null })
		await flushPromises()
		expect(rowState(w).some((r) => r.checking)).toBe(false)
		w.unmount()
	})

	test("an init that throws stops the rows loading, gives today's answers, and never claims a retry", async () => {
		vi.useFakeTimers()
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
			const local = (globalThis as any).chrome.storage.local
			const refusal = new Error("storage unavailable")
			local.get = vi.fn().mockRejectedValue(refusal)
			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(logged.mock.calls.filter(([message]) => message === "Failed to init")).toEqual([["Failed to init", { error: refusal }]])

			expect(rowState(w)).toEqual([
				{ type: "fj", fpc: null, checking: false, spend: "— FJ" },
				{ type: "private_fpc", fpc: null, checking: false, spend: "— FJ" },
			])
			expect(w.find('[data-testid="pick-private_fpc"]').attributes("data-reason")).toBe("not available")
			expect(w.find('[data-testid="fee-init-degraded"]').text()).toBe("Couldn't load fee data. Close and reopen to try again.")

			// Nothing runs the init again on its own: no read is ever issued.
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS.reduce((a, b) => a + b, 0) + INIT_FETCH_TIMEOUT_MS)
			expect(mocks.getGasBalances).not.toHaveBeenCalled()
			expect(w.find('[data-testid="fee-init-degraded"]').text()).toBe("Couldn't load fee data. Close and reopen to try again.")
			w.unmount()
		} finally {
			logged.mockRestore()
			vi.useRealTimers()
		}
	})
})

describe("FeeSettingsCard — the load error's live region", () => {
	test("a held, then refused, read lands its notice in a polite region mounted empty with the card", async () => {
		vi.useFakeTimers()
		try {
			let refuseGas!: (e: Error) => void
			let refuseFpcs!: (e: Error) => void
			mocks.getGasBalances.mockImplementationOnce(() => new Promise((_, reject) => (refuseGas = reject)))
			mocks.getFpcs.mockImplementationOnce(() => new Promise((_, reject) => (refuseFpcs = reject)))
			mocks.getGasBalances.mockRejectedValue(new Error("PXE unreachable"))
			mocks.getFpcs.mockRejectedValue(new Error("PXE unreachable"))
			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			const live = w.get('[data-testid="fee-init-degraded-live"]')
			expect(live.attributes()).toMatchObject({ role: "status", "aria-live": "polite", "aria-atomic": "true" })
			expect(live.text()).toBe("")

			refuseGas(new Error("PXE unreachable"))
			refuseFpcs(new Error("PXE unreachable"))
			await vi.advanceTimersByTimeAsync(0)
			expect(w.get('[data-testid="fee-init-degraded-live"]').element).toBe(live.element)
			expect(live.text()).toBe("Couldn't load fee data. Retrying in the background.")
			expect(w.find('[data-testid="fee-method-row"]').exists()).toBe(false)
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("FeeSettingsCard — concurrency", () => {
	test("rapid prop change while init is in flight: only one Promise.all completes per logical state", async () => {
		// First mount with one network, immediately switch to another.
		mocks.getFpcs.mockResolvedValue([])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		const callsAfterMount = mocks.getGasBalances.mock.calls.length

		// Setting a new network triggers the props watcher → init() → coalesce.
		await w.setProps({ network: { id: "n2", chainId: 31337 } })
		await flushPromises()
		const callsAfterSwitch = mocks.getGasBalances.mock.calls.length

		// At least one new fetch (for the new network).
		expect(callsAfterSwitch).toBeGreaterThan(callsAfterMount)
		// State settled to the new network.
		expect(lastEmittedSettings(w)).toBeUndefined()
	})

	test("unmount during in-flight init does not throw", async () => {
		const gas = deferred<{ publicFeeJuice: string; privateFeeJuice: string | null }>()
		mocks.getGasBalances.mockReturnValueOnce(gas.promise)

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		// Unmount while gas is still pending.
		w.unmount()

		// Now resolve — must not throw or fire onto a torn-down component.
		gas.resolve({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
		await flushPromises()

		// (No assertion — passing the tick without throwing is the assertion.)
		expect(true).toBe(true)
	})
})

describe("FeeSettingsCard — the default and the identity guard", () => {
	test("the sponsor is the default: no nudge, and the estimate row shows", async () => {
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		// The nudge signal is never raised (Sponsored FPC needs no fee-juice balance).
		const needs = w.emitted<unknown[]>("update:needsFeeJuice") ?? []
		expect(needs.some((e) => e[0] === true)).toBe(false)
		expect(w.text()).not.toContain("You have no fee juice yet")
		// Sponsored FPC is usable → the fee estimate row is shown.
		expect(w.find('[data-testid="fee-cost-readout"]').exists()).toBe(true)
	})

	test("account+network switch mid-init: the stale completion is discarded (no cross-identity leak)", async () => {
		// Account A's saved pick is Private Fee Juice, and its balance read resolves LATE.
		storageBacking[FEE_METHOD_LS_KEY] = { [account.address]: { type: "private_fpc" } }
		const gasA = deferred<{ publicFeeJuice: string; privateFeeJuice: string | null }>()
		mocks.getGasBalances.mockReturnValueOnce(gasA.promise)
		// The switched-to identity (B) resolves normally.
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: "1000000000000000000" })
		mocks.getFpcs.mockResolvedValue([
			{ id: "p1", type: 2, name: "Private FPC", isProtocol: true },
			{ id: "s1", type: 1, name: "Sponsor", isProtocol: true },
		])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises() // A's init started, awaiting gasA

		// Switch account (and network) BEFORE A resolves.
		await w.setProps({ account: { id: "a2", address: "0xB" }, network: { id: "n1", chainId: 424242 } })

		// A's stale result lands now — the identity guard must discard it.
		gasA.resolve({ publicFeeJuice: "1000000000000000000", privateFeeJuice: "1000000000000000000" })
		await flushPromises()

		// Final state reflects B (Sponsored FPC s1), NOT A's saved pick (Private FPC p1).
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
	})
})

describe("FeeSettingsCard — init failure resilience (degraded settings + silent retry)", () => {
	test("(BUG PIN) getGasBalances rejects: FPC leg still lands — sponsored auto-selected, Confirm not held hostage", async () => {
		// The reported bug: a failed balance read left `isInitComplete` false forever,
		// so `feeSettings` never populated and the Send/Confirm gates stayed disabled
		// with no error, no retry. A failed balance read must NOT discard the good
		// FPC list — sponsored methods need no balance at all.
		mocks.getGasBalances.mockRejectedValue(new Error("PXE unreachable"))
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		// The degraded state is visible (quietly), not a stuck skeleton.
		expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)
		// And never the misleading bridge nudge — the balance is UNKNOWN, not zero.
		expect(w.text()).not.toContain("You have no fee juice yet")
		w.unmount()
	})

	test("a whole read failing keeps the self-paid rows selectable, reading — FJ beside the retry notice", async () => {
		mocks.getGasBalances.mockRejectedValue(new Error("PXE unreachable"))
		mocks.getFpcs.mockResolvedValue([
			{ id: "s1", type: 1, name: "Sponsored", isProtocol: true },
			{ id: "p1", type: 2, name: "Private Fee Juice", isProtocol: true },
		])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		expect(w.find('[data-testid="fee-init-degraded"]').text()).toBe("Couldn't load fee data. Retrying in the background.")
		const row = (type: string) => w.find(`[data-testid="pick-${type}"]`)
		for (const type of ["fj", "private_fpc"]) {
			expect(row(type).attributes("data-checking")).toBe("false")
			expect(row(type).attributes("data-disabled")).toBe("false")
			expect(row(type).attributes("data-spend")).toBe("— FJ")
		}
		expect(row("fpc").attributes("data-spend")).toBe("free")
		// A failure that is not the account's own key leaves Send open.
		expect(w.emitted("update:accountUnusable")).toBeUndefined()
		w.unmount()
	})

	test("a read refused because the imported key does not open tells the page", async () => {
		mocks.getGasBalances.mockRejectedValue(ImportedAccountUnusableError.because("signing key missing"))
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsored", isProtocol: true }])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		expect(w.emitted<unknown[]>("update:accountUnusable")?.at(-1)).toEqual([true])
		w.unmount()
	})

	test("a background retry that finds the imported key unusable tells the page", async () => {
		vi.useFakeTimers()
		try {
			mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
			mocks.getGasBalances.mockRejectedValue(ImportedAccountUnusableError.because("signing key missing"))
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)
			expect(w.emitted("update:accountUnusable")).toBeUndefined()

			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
			await vi.advanceTimersByTimeAsync(0)
			expect(mocks.getGasBalances).toHaveBeenCalledTimes(2)
			expect(w.emitted<unknown[]>("update:accountUnusable")?.at(-1)).toEqual([true])
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a retry's key refusal for an account the card no longer shows leaves Send open", async () => {
		vi.useFakeTimers()
		try {
			let refuse!: (error: unknown) => void
			const retry = new Promise<never>((_, reject) => {
				refuse = reject
			})
			let reads = 0
			mocks.getGasBalances.mockImplementation((_networkId: string, address: string) => {
				if (address !== account.address) return new Promise(() => {})
				reads++
				return reads === 1 ? Promise.reject(new Error("boom")) : retry
			})
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
			expect(reads).toBe(2)

			// The retry is in flight when the page moves to another account, whose read never lands.
			await w.setProps({ account: { id: "a2", address: "0xother" } })
			await vi.advanceTimersByTimeAsync(0)
			refuse(ImportedAccountUnusableError.because("signing key missing"))
			await vi.advanceTimersByTimeAsync(0)
			expect(w.emitted("update:accountUnusable")).toBeUndefined()
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("(BUG PIN) getGasBalances rejects with saved fj: fails closed without a nudge, sponsored still pickable", async () => {
		// Self-paid fj must NOT derive settings from a balance we never saw
		// (estimation runs with skipFeeEnforcement and would not catch an
		// actually-zero balance). But the card stays operable: no misleading
		// bridge nudge, the degraded notice shows, and the user can still
		// pick a sponsored method manually.
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: { type: "fj", title: "Fee Juice", subtitle: "public" },
		}
		mocks.getGasBalances.mockRejectedValue(new Error("PXE unreachable"))
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		const truthy = (w.emitted<unknown[]>("update:modelValue") ?? []).filter((e) => e[0] != null)
		expect(truthy).toEqual([])
		const needs = w.emitted<unknown[]>("update:needsFeeJuice") ?? []
		expect(needs.some((e) => e[0] === true)).toBe(false)
		expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)

		await w.find('[data-testid="pick-fpc"]').trigger("click")
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		w.unmount()
	})

	test("(BUG PIN) getGasBalances never settles: init times out into the degraded state instead of loading forever", async () => {
		vi.useFakeTimers()
		try {
			mocks.getGasBalances.mockReturnValue(new Promise(() => {}))
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toBeUndefined()

			await vi.advanceTimersByTimeAsync(INIT_FETCH_TIMEOUT_MS)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("failed init retries silently with backoff and recovers", async () => {
		vi.useFakeTimers()
		try {
			mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
			mocks.getFpcs.mockRejectedValueOnce(new Error("boom"))
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)

			expect(mocks.getGasBalances).toHaveBeenCalledTimes(1)
			const truthyBefore = (w.emitted<unknown[]>("update:modelValue") ?? []).filter((e) => e[0] != null)
			expect(truthyBefore).toEqual([])
			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)

			// Nothing until the first backoff step elapses…
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0] - 1)
			expect(mocks.getGasBalances).toHaveBeenCalledTimes(1)

			// …then the retry fires — silently — and recovers.
			await vi.advanceTimersByTimeAsync(1)
			await vi.advanceTimersByTimeAsync(0)
			expect(mocks.getGasBalances).toHaveBeenCalledTimes(2)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(false)
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a hung raw RPC is reused across retries — retries never stack new requests", async () => {
		// The transport queues pre-connect requests unboundedly and can't
		// cancel them, so each retry must re-attach a timeout to the SAME
		// pending call rather than issue a fresh one.
		vi.useFakeTimers()
		try {
			mocks.getGasBalances.mockImplementation(() => new Promise(() => {}))
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			await vi.advanceTimersByTimeAsync(INIT_FETCH_TIMEOUT_MS)
			expect(mocks.getGasBalances).toHaveBeenCalledTimes(1)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			// First retry runs a full degraded cycle against the SAME raw call.
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0] + INIT_FETCH_TIMEOUT_MS)
			expect(mocks.getGasBalances).toHaveBeenCalledTimes(1)
			// The FPC leg settled healthy (no retry debt) — the store's
			// debt-scoped backoff never re-fetches a working leg.
			expect(mocks.getFpcs).toHaveBeenCalledTimes(1)
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a background retry never yanks committed sponsored settings during its in-flight window", async () => {
		// Re-arming the derivation gate on every retry made Confirm oscillate:
		// disabled for the 20s in-flight window of each backoff cycle. A
		// same-identity refresh must keep serving the committed snapshot.
		vi.useFakeTimers()
		try {
			mocks.getGasBalances.mockImplementation(() => new Promise(() => {}))
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			await vi.advanceTimersByTimeAsync(INIT_FETCH_TIMEOUT_MS)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			const settledCount = (w.emitted<unknown[]>("update:modelValue") ?? []).length
			// Sit inside the next retry's in-flight window.
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0] + INIT_FETCH_TIMEOUT_MS / 2)
			const during = (w.emitted<unknown[]>("update:modelValue") ?? []).slice(settledCount)
			expect(during.filter((e) => e[0] == null)).toEqual([])
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a refresh whose FPC leg fails keeps the last-good list — a working sponsor is never erased mid-session", async () => {
		// The debt-scoped backoff never re-fetches a healthy leg, so the
		// FPC-failure-after-success arc now runs through a same-identity
		// refresh: attempt 1 lands both legs; the refresh's FPC leg fails —
		// the sponsor from attempt 1 must survive (the store's per-key
		// retention; the retry-path arc is pinned in balances.store.test.ts).
		vi.useFakeTimers()
		try {
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
			mocks.getFpcs.mockResolvedValueOnce([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])
			mocks.getFpcs.mockRejectedValue(new Error("boom"))

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			await w.setProps({ profile: { ...profile } })
			await vi.advanceTimersByTimeAsync(0)
			expect(mocks.getFpcs.mock.calls.length).toBeGreaterThan(1)
			// Sponsor retained; settings still usable, dropdown still offers it.
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
			expect(w.find('[data-testid="pick-fpc"]').exists()).toBe(true)
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("identity switch mid-refresh closes the gate immediately — old snapshot never serves the new identity", async () => {
		vi.useFakeTimers()
		try {
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor", isProtocol: true }])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			// Same-identity refresh whose balance leg hangs — the committed
			// snapshot keeps serving (no oscillation).
			mocks.getGasBalances.mockImplementation(() => new Promise(() => {}))
			await w.setProps({ profile: { ...profile } })
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			// Switch identity while that refresh is still in flight: the gate
			// must close NOW, not when the hung fetch eventually settles.
			await w.setProps({ account: { id: "a2", address: "0xother" } })
			await vi.advanceTimersByTimeAsync(0)
			const events = w.emitted<unknown[]>("update:modelValue") ?? []
			expect(events[events.length - 1]?.[0]).toBeUndefined()
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a profile-switch-superseded ensure is a NO-OP — no degraded state, no retry", async () => {
		// The epoch fence rejects the in-flight ensure with the typed
		// EnsureSuperseded; runInit must swallow it silently (the post-await
		// drift guard can't observe a rejection) — never paint the degraded
		// row or arm a retry for a run the store already discarded.
		vi.useFakeTimers()
		try {
			const gas = deferred<{ publicFeeJuice: string | null; privateFeeJuice: string | null }>()
			mocks.getGasBalances.mockReturnValue(gas.promise)
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)

			// Fence the run out mid-flight — the path a real profile switch takes.
			useBalancesStore().invalidateProfile(profile.id)
			gas.resolve({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
			await vi.advanceTimersByTimeAsync(0)

			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(false)
			expect(lastEmittedSettings(w)).toBeUndefined()
			// The discarded run armed no retry chain (window kept < 60s so
			// unrelated service-client RPC timers don't fire spurious timeouts).
			const gasCalls = mocks.getGasBalances.mock.calls.length
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0] + 10_000)
			expect(mocks.getGasBalances.mock.calls.length).toBe(gasCalls)
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("an account switch releases the old key — its retry loop dies with the lease", async () => {
		// Release-before-subscribe: after A→B the old key must not stay
		// subscribed and store-retrying. Discriminated by args: a leaked lease
		// would keep fetching with A's address on the backoff ticks.
		vi.useFakeTimers()
		try {
			mocks.getGasBalances.mockImplementation(async (_net: string, account: string) => {
				if (account === "0xacct") throw new Error("boom")
				return { publicFeeJuice: "1000000000000000000", privateFeeJuice: null }
			})
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)

			await w.setProps({ account: { id: "a2", address: "0xother" } })
			await vi.advanceTimersByTimeAsync(0)
			const callsForA = mocks.getGasBalances.mock.calls.filter((c) => c[1] === "0xacct").length

			// A full backoff window later, the OLD key must not have re-fetched.
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0] + 10_000)
			expect(mocks.getGasBalances.mock.calls.filter((c) => c[1] === "0xacct").length).toBe(callsForA)
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("an A→B→A account flap re-attaches to A's still-pending raw flight — no duplicate request", async () => {
		// Keyed flights (not single slots): the flap must not drop A's pending
		// entry and start a second RPC for the same identity.
		vi.useFakeTimers()
		try {
			mocks.getGasBalances.mockImplementation(async (_net: string, account: string) => {
				if (account === "0xacct") return new Promise<never>(() => {})
				return { publicFeeJuice: "1000000000000000000", privateFeeJuice: null }
			})
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			await w.setProps({ account: { id: "a2", address: "0xother" } })
			await vi.advanceTimersByTimeAsync(0)
			await w.setProps({ account: { id: "a1", address: "0xacct" } })
			await vi.advanceTimersByTimeAsync(0)

			expect(mocks.getGasBalances.mock.calls.filter((c) => c[1] === "0xacct").length).toBe(1)
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a chainId swap under a stable networkId mid-init discards the stale-chain run", async () => {
		// The testnet-reset shape: same network id, new chainId. The stale
		// run's late completion must not commit the OLD chain's FPC list last.
		vi.useFakeTimers()
		try {
			let resolveOldGas!: (v: unknown) => void
			mocks.getGasBalances
				.mockImplementationOnce(() => new Promise((r) => (resolveOldGas = r)))
				.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
			mocks.getFpcs.mockImplementation(async (chainId: number) => [
				{ id: chainId === 11155111 ? "s-old" : "s-new", type: 1, name: "Sponsor", isProtocol: true },
			])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)

			await w.setProps({ network: { id: "n1", chainId: 222 } })
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s-new" } })

			// The old chain's hung gas leg settles late — its run is discarded.
			resolveOldGas({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s-new" } })
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	test("a user pick during a recovery recommit's storage read survives a stale storage snapshot", async () => {
		// The recommit's read RESOLVES with a pre-pick snapshot but its
		// resumption is delayed past the pick: the stale saved record must not
		// be reconciled over the user's choice (baseline is captured before
		// the await, same rule as runInit).
		vi.useFakeTimers()
		// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
		const chromeAny = (globalThis as any).chrome
		const origGet = chromeAny.storage.local.get
		try {
			storageBacking[FEE_METHOD_LS_KEY] = {
				[account.address]: { type: "fj", title: "Fee Juice", subtitle: "public" },
			}
			mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)

			// Snapshot-then-park: the read completes with pre-pick data, the
			// awaiting recommit resumes only when released.
			let gateArmed = true
			let release!: () => void
			const gate = new Promise<void>((r) => {
				release = r
			})
			chromeAny.storage.local.get = async (keys: unknown) => {
				const result = await origGet(keys)
				if (gateArmed) {
					gateArmed = false
					await gate
				}
				return result
			}
			// Retry recovers → recommit reads (parks holding the fj snapshot).
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0] + 50)

			await w.find('[data-testid="pick-fpc"]').trigger("click")
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			release()
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
			w.unmount()
		} finally {
			chromeAny.storage.local.get = origGet
			vi.useRealTimers()
		}
	})

	test("an identity switch during a recovery recommit's storage read discards the late commit", async () => {
		// A's retry recovery fires recommit; the user switches to B while it
		// awaits storage. The resumed recommit must NOT re-open the gate with
		// A's data (settings for B would derive from A's balances).
		vi.useFakeTimers()
		// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
		const chromeAny = (globalThis as any).chrome
		const origGet = chromeAny.storage.local.get
		try {
			mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)

			// Gate the NEXT storage read (recommit's), one-shot.
			let gateArmed = true
			let release!: () => void
			const gate = new Promise<void>((r) => {
				release = r
			})
			chromeAny.storage.local.get = async (keys: unknown) => {
				if (gateArmed) {
					gateArmed = false
					await gate
				}
				return origGet(keys)
			}
			// Retry recovers → recovery watch → recommit blocks on the gate.
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0] + 50)

			// Identity switch while the recommit is parked.
			await w.setProps({ account: { id: "a2", address: "0xother" } })
			await vi.advanceTimersByTimeAsync(0)
			const emitted = (w.emitted<unknown[]>("update:modelValue") ?? []).length

			release()
			await vi.advanceTimersByTimeAsync(0)
			// The late recommit was a no-op: nothing further emitted.
			expect((w.emitted<unknown[]>("update:modelValue") ?? []).length).toBe(emitted)
			w.unmount()
		} finally {
			chromeAny.storage.local.get = origGet
			vi.useRealTimers()
		}
	})

	test("a recovery recommit whose storage read fails is logged under a named key", async () => {
		vi.useFakeTimers()
		// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
		const chromeAny = (globalThis as any).chrome
		const origGet = chromeAny.storage.local.get
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])
			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(true)

			const refusal = new Error("storage unavailable")
			chromeAny.storage.local.get = vi.fn().mockRejectedValue(refusal)
			// Retry recovers → recovery watch → recommit's read rejects.
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0] + 50)
			expect(logged.mock.calls.filter(([message]) => message === "Fee recovery recommit failed")).toEqual([
				["Fee recovery recommit failed", { error: refusal }],
			])
			w.unmount()
		} finally {
			logged.mockRestore()
			chromeAny.storage.local.get = origGet
			vi.useRealTimers()
		}
	})

	test("a superseded run's late storage read never re-applies the saved pre-fill", async () => {
		// Run 1's storage read resolves AFTER run 2 committed and the user
		// picked a method — its pre-fill must not clobber that pick.
		vi.useFakeTimers()
		// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
		const chromeAny = (globalThis as any).chrome
		const origGet = chromeAny.storage.local.get
		try {
			storageBacking[FEE_METHOD_LS_KEY] = {
				[account.address]: { type: "fj", title: "Fee Juice", subtitle: "public" },
			}
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1000000000000000000", privateFeeJuice: null })
			mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])

			// Gate the FIRST storage read (mount's run), one-shot.
			let gateArmed = true
			let release!: () => void
			const gate = new Promise<void>((r) => {
				release = r
			})
			chromeAny.storage.local.get = async (keys: unknown) => {
				if (gateArmed) {
					gateArmed = false
					await gate
				}
				return origGet(keys)
			}

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			// Same-identity refire: run 2 completes normally (saved fj resolves).
			await w.setProps({ profile: { ...profile } })
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })

			// The user picks the sponsored method mid-flight.
			await w.find('[data-testid="pick-fpc"]').trigger("click")
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			// Run 1 finally resumes: it must abort, not re-apply the saved fj.
			release()
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
			w.unmount()
		} finally {
			chromeAny.storage.local.get = origGet
			vi.useRealTimers()
		}
	})

	test("unmount cancels the pending silent retry", async () => {
		vi.useFakeTimers()
		try {
			mocks.getGasBalances.mockRejectedValue(new Error("boom"))
			mocks.getFpcs.mockRejectedValue(new Error("boom"))

			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(mocks.getGasBalances).toHaveBeenCalledTimes(1)

			w.unmount()
			// One full backoff step + margin is enough to prove the retry was
			// cancelled (kept < 60s so unrelated service-client RPC timers,
			// also running on faked time, don't fire spurious timeouts).
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0] + 10_000)
			expect(mocks.getGasBalances).toHaveBeenCalledTimes(1)
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("FeeSettingsCard — null public balance (unknown wire slot)", () => {
	test("a RESOLVING read with NULL public balance fails closed for fj — never derives settings", async () => {
		// The fail-open landmine: the fetch SUCCEEDS but the public leg is
		// unknown. Pre-guard, `null !== "0"` would derive real fj settings from
		// a balance nobody verified (skipFeeEnforcement means estimation can't
		// catch it). Distinct from the whole-call-rejection pins above.
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: { type: "fj", title: "Fee Juice", subtitle: "public" },
		}
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: null, privateFeeJuice: null })
		mocks.getFpcs.mockResolvedValue([])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		const truthy = (w.emitted<unknown[]>("update:modelValue") ?? []).filter((e) => e[0] != null)
		expect(truthy).toEqual([])
		w.unmount()
	})

	test("NULL public balance never shows the get-fee-juice nudge (deviation 4, owner-approved)", async () => {
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: { type: "fj", title: "Fee Juice", subtitle: "public" },
		}
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: null, privateFeeJuice: null })
		mocks.getFpcs.mockResolvedValue([])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		const needs = w.emitted<unknown[]>("update:needsFeeJuice") ?? []
		expect(needs.some((e) => e[0] === true)).toBe(false)
		expect(w.text()).not.toContain("You have no fee juice yet")
		w.unmount()
	})

	test("a saved fj selection stays put on unknown balance — no settings derive, sponsored manually pickable (deviation 2, corrected)", async () => {
		// Reconcile-timing fact (found red-first): resolveSavedSelection runs
		// against PRE-commit methods (balances not yet applied), so the saved
		// fj row is not disabled at reconcile time and stays selected. Today's
		// behavior is identical (fabricated "0", same timing) — preserved. The
		// disabled row + fail-closed derivation + no nudge are the honest bits.
		storageBacking[FEE_METHOD_LS_KEY] = {
			[account.address]: { type: "fj", title: "Fee Juice", subtitle: "public" },
		}
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: null, privateFeeJuice: null })
		mocks.getFpcs.mockResolvedValue([{ id: "s1", type: 1, name: "Sponsor" }])

		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()

		const truthy = (w.emitted<unknown[]>("update:modelValue") ?? []).filter((e) => e[0] != null)
		expect(truthy).toEqual([])

		// The card stays operable: sponsored is one click away.
		await w.find('[data-testid="pick-fpc"]').trigger("click")
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		w.unmount()
	})
})

/**
 * The Send page's card (`originPrivacy` set): the selection is derived from the origin, the
 * committed snapshot and the account's own pick — see `fee-privacy.ts` for the rule itself.
 */
describe("FeeSettingsCard — Send: the fee source follows the transfer's origin", () => {
	const SEND_KEY = sendFeePicksKey("p1")
	const HELD = "1000000000000000000"
	const PRIVATE_FPC = { id: "p1", type: 2, name: "Private FPC", isProtocol: true }
	const SPONSOR = { id: "s1", type: 1, name: "Sponsor", isProtocol: true }
	const accountB = { id: "a2", address: "0xacctB" }

	/** Set to a deferred to hold every storage read open; reads hand back CLONES, as chrome does. */
	let storageGate: Deferred<void> | undefined

	beforeEach(() => {
		storageGate = undefined
		// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
		const local = (globalThis as any).chrome.storage.local
		const plainGet = local.get
		local.get = async (keys: string | string[] | null | undefined) => {
			if (storageGate) await storageGate.promise
			return structuredClone(await plainGet(keys))
		}
	})

	const sendProps = (over: Record<string, unknown> = {}) => baseProps({ originPrivacy: "private", ...over })
	const mountSend = (over: Record<string, unknown> = {}) => mount(FeeSettingsCard, { props: sendProps(over), global: { stubs: STUBS } })
	const activeType = (w: ReturnType<typeof mount>) => w.find('[data-testid="fee-method-selector"]').attributes("data-active-type")
	const activeTitle = (w: ReturnType<typeof mount>) => w.find('[data-testid="fee-method-selector"]').attributes("data-active-title")
	const lastNeedsFeeJuice = (w: ReturnType<typeof mount>) => (w.emitted<unknown[]>("update:needsFeeJuice") ?? []).at(-1)?.[0] ?? false
	const everEmittedSettings = (w: ReturnType<typeof mount>) =>
		(w.emitted<unknown[]>("update:modelValue") ?? []).map((e) => e[0]).filter((v) => v != null)
	const degradedText = (w: ReturnType<typeof mount>) => {
		const row = w.find('[data-testid="fee-init-degraded"]')
		return row.exists() ? row.text() : null
	}

	describe("the default, by knowledge state", () => {
		test("private origin, private gas read as zero, public held → Fee Juice", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: "0" })
			const w = mountSend()
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		})

		test("Fee Juice is taken ahead of an eligible sponsor once private gas is a read zero", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: "0" })
			const w = mountSend()
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		})

		test("private gas unread, no sponsor → nothing selected, the honest line, no second read", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: null })
			const w = mountSend()
			await flushPromises()
			expect(everEmittedSettings(w)).toEqual([])
			expect(activeType(w)).toBeUndefined()
			expect(lastNeedsFeeJuice(w)).toBe(false)
			expect(degradedText(w)).toBe("Couldn't check your private gas. Pick a fee source to continue.")
			expect(w.find('[data-testid="send-fee-nudge"]').exists()).toBe(false)
			expect(mocks.getGasBalances).toHaveBeenCalledTimes(1)
		})

		test("no FPC rows with public held → nothing selected, never Fee Juice", async () => {
			mocks.getFpcs.mockResolvedValue([])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: "0" })
			const w = mountSend()
			await flushPromises()
			expect(everEmittedSettings(w)).toEqual([])
			expect(activeType(w)).toBeUndefined()
		})

		test("sponsor-only list with public held → the sponsor, never Fee Juice", async () => {
			mocks.getFpcs.mockResolvedValue([SPONSOR])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: null })
			const w = mountSend()
			await flushPromises()
			expect(everEmittedSettings(w)).toEqual([{ paymentMethod: { kind: "fpc", fpcId: "s1" } }])
			expect(degradedText(w)).toBeNull()
		})

		test("gas read rejected: nothing selected and the retrying line — or the sponsor when there is one", async () => {
			mocks.getGasBalances.mockRejectedValue(new Error("boom"))
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			const held = mountSend({ network: { id: "n1", chainId: 424242 } })
			await flushPromises()
			expect(everEmittedSettings(held)).toEqual([])
			expect(degradedText(held)).toBe("Couldn't load fee data. Retrying in the background.")
			held.unmount()

			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			const sponsored = mountSend({ account: accountB })
			await flushPromises()
			expect(lastEmittedSettings(sponsored)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		})

		test("public origin held on a healthy store: nothing selected and no promise of a retry nobody scheduled", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: null, privateFeeJuice: null })
			const w = mountSend({ originPrivacy: "public" })
			await flushPromises()
			expect(everEmittedSettings(w)).toEqual([])
			expect(activeType(w)).toBeUndefined()
			expect(lastNeedsFeeJuice(w)).toBe(false)
			expect(degradedText(w)).toBeNull()
		})

		test("public origin → Fee Juice ahead of Private Fee Juice and the sponsor", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: HELD })
			const w = mountSend({ originPrivacy: "public" })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		})

		test("both read as zero, no sponsor → the nudge and needsFeeJuice, with no method selected", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: "0" })
			const w = mountSend()
			await flushPromises()
			expect(lastNeedsFeeJuice(w)).toBe(true)
			expect(w.find('[data-testid="send-fee-nudge"]').exists()).toBe(true)
			expect(activeType(w)).toBeUndefined()
			expect(everEmittedSettings(w)).toEqual([])
		})

		test("one zero and one unread → neither the nudge nor needsFeeJuice", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: null, privateFeeJuice: "0" })
			const w = mountSend()
			await flushPromises()
			expect(lastNeedsFeeJuice(w)).toBe(false)
			expect(w.find('[data-testid="send-fee-nudge"]').exists()).toBe(false)
		})
	})

	describe("the fresh read", () => {
		test("every Send mount forces the balance read, whatever its origin; a null origin does not", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mountSend()
			await flushPromises()
			expect(mocks.getGasBalances).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), true)

			// The origin can flip to private with no further read, so a public mount may not settle for the TTL.
			const pub = mountSend({ originPrivacy: "public", account: accountB })
			await flushPromises()
			expect(mocks.getGasBalances.mock.calls.at(-1)?.[2]).toBe(true)
			const reads = mocks.getGasBalances.mock.calls.length
			await pub.setProps({ originPrivacy: "private" })
			await flushPromises()
			expect(mocks.getGasBalances.mock.calls.length).toBe(reads)

			mount(FeeSettingsCard, { props: baseProps({ account: { id: "a3", address: "0xacctC" } }), global: { stubs: STUBS } })
			await flushPromises()
			expect(mocks.getGasBalances.mock.calls.at(-1)?.[2]).toBeFalsy()
		})

		test("a positive private balance on that read selects Private Fee Juice, never Fee Juice", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: HELD })
			const w = mountSend()
			await flushPromises()
			expect(everEmittedSettings(w)).toEqual([{ paymentMethod: { kind: "fpc", fpcId: "p1" } }])
		})
	})

	describe("the loading preview", () => {
		test("a saved sponsor pick is previewed by its saved label before the FPC list exists, and pays nothing", async () => {
			const gas = deferred<unknown>()
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			mocks.getGasBalances.mockReturnValue(gas.promise)
			storageBacking[sendFeePicksKey("p1")] = {
				[account.address]: { private: { type: "fpc", fpc: { id: "s1", name: "Sponsor" } } },
			}
			const w = mountSend()
			await flushPromises()
			expect(activeType(w)).toBe("fpc")
			expect(activeTitle(w)).toBe("Sponsor")
			expect(everEmittedSettings(w)).toEqual([])
			// A preview pays nothing, so nothing may say what it costs: the cost row is still a bar.
			expect(w.get('[data-testid="fee-cost-readout"]').attributes("data-pending")).toBe("true")

			gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: HELD })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
			expect(w.get('[data-testid="fee-cost-readout"]').attributes("data-pending")).toBe("false")
		})
	})

	describe("origin flips", () => {
		const bothHeld = () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: HELD })
		}

		test("after commit: re-resolves for the new origin with no fetch", async () => {
			bothHeld()
			const w = mountSend()
			await flushPromises()
			expect(activeType(w)).toBe("private_fpc")
			await w.setProps({ originPrivacy: "public" })
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
			await w.setProps({ originPrivacy: "private" })
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "p1" } })
			expect(mocks.getGasBalances).toHaveBeenCalledTimes(1)
		})

		test("during the init's balance read: ends resolved for the live origin", async () => {
			const gas = deferred<unknown>()
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			mocks.getGasBalances.mockReturnValue(gas.promise)
			const w = mountSend()
			await flushPromises()
			await w.setProps({ originPrivacy: "public" })
			gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: HELD })
			await flushPromises()
			expect(everEmittedSettings(w)).toEqual([{ paymentMethod: { kind: "fj" } }])
		})

		test("a Send recovery reads no saved app picks, and an origin flip right after the retry resolves for the live origin", async () => {
			vi.useFakeTimers()
			try {
				mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
				mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
				mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: HELD })
				const w = mountSend()
				await vi.advanceTimersByTimeAsync(0)
				expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
				expect(degradedText(w)).toBe("Couldn't load fee data. Retrying in the background.")

				const picksRead = mocks.getFeePicks.mock.calls.length
				storageGate = deferred<void>()
				await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
				await w.setProps({ originPrivacy: "public" })
				await vi.advanceTimersByTimeAsync(0)
				expect(mocks.getFeePicks.mock.calls.length).toBe(picksRead)
				expect(degradedText(w)).toBeNull()
				expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
				storageGate.resolve()
				storageGate = undefined
				w.unmount()
			} finally {
				vi.useRealTimers()
			}
		})

		test("during a run the drift guard then discards: the surviving run resolves for the live origin", async () => {
			const gasA = deferred<unknown>()
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			mocks.getGasBalances.mockReturnValueOnce(gasA.promise)
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: "0" })
			const w = mountSend()
			await flushPromises()
			await w.setProps({ originPrivacy: "public", account: accountB })
			await flushPromises()
			gasA.resolve({ publicFeeJuice: "0", privateFeeJuice: HELD })
			await flushPromises()
			// Account A's late balances (private held) never meet the live card: B resolves on B's own.
			expect(everEmittedSettings(w)).toEqual([{ paymentMethod: { kind: "fj" } }])
		})
	})

	describe("picks", () => {
		const allPayers = () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: HELD })
		}

		test("a pick is kept per origin, persisted under Send's own key, and survives a remount", async () => {
			allPayers()
			const w = mountSend()
			await flushPromises()
			await w.find('[data-testid="pick-fj"]').trigger("click")
			await w.setProps({ originPrivacy: "public" })
			await w.find('[data-testid="pick-fpc"]').trigger("click")
			await flushPromises()
			expect(storageBacking[SEND_KEY]).toEqual({
				[account.address]: { private: { type: "fj" }, public: { type: "fpc", fpc: { id: "s1", name: "Sponsor" } } },
			})
			expect(FEE_METHOD_LS_KEY in storageBacking).toBe(false)
			w.unmount()

			const again = mountSend()
			await flushPromises()
			expect(lastEmittedSettings(again)).toEqual({ paymentMethod: { kind: "fj" } })
			await again.setProps({ originPrivacy: "public" })
			expect(lastEmittedSettings(again)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		})

		test("a pick whose save fails is logged under a named key", async () => {
			allPayers()
			const w = mountSend()
			await flushPromises()
			const refusal = new Error("QUOTA_BYTES quota exceeded")
			mocks.saveFeePick.mockRejectedValueOnce(refusal)
			const logged = vi.spyOn(console, "error").mockImplementation(() => {})
			try {
				await w.find('[data-testid="pick-fj"]').trigger("click")
				await flushPromises()
				expect(logged.mock.calls.filter(([message]) => message === "Failed to save the send fee selection")).toEqual([
					["Failed to save the send fee selection", { error: refusal }],
				])
			} finally {
				logged.mockRestore()
			}
			w.unmount()
		})

		test("a legacy-key pick does not govern Send", async () => {
			allPayers()
			storageBacking[FEE_METHOD_LS_KEY] = { [account.address]: { type: "fpc", fpc: SPONSOR } }
			const w = mountSend()
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "p1" } })
		})

		test("a saved private-slot Fee Juice with an unread public balance is not selected", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: null, privateFeeJuice: "0" })
			storageBacking[SEND_KEY] = { [account.address]: { private: { type: "fj" } } }
			const w = mountSend()
			await flushPromises()
			expect(everEmittedSettings(w)).toEqual([])
			expect(activeType(w)).toBeUndefined()
		})

		test("a same-identity refresh does not install a stored pick past the rule", async () => {
			vi.useFakeTimers()
			try {
				mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
				mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
				mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: null, privateFeeJuice: "0" })
				const w = mountSend()
				await vi.advanceTimersByTimeAsync(0)
				// Another document saves a Fee Juice pick while this card is degraded.
				storageBacking[SEND_KEY] = { [account.address]: { private: { type: "fj" } } }
				await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
				await vi.advanceTimersByTimeAsync(0)
				expect(everEmittedSettings(w)).toEqual([])
				w.unmount()
			} finally {
				vi.useRealTimers()
			}
		})

		test("account A's pick never governs account B, and A→B→A restores A's", async () => {
			allPayers()
			const w = mountSend()
			await flushPromises()
			await w.find('[data-testid="pick-fj"]').trigger("click")
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })

			await w.setProps({ account: accountB })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "p1" } })

			await w.setProps({ account })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		})

		test("one account's pick in one profile never governs it in another, and switching back restores it", async () => {
			allPayers()
			const w = mountSend()
			await flushPromises()
			await w.find('[data-testid="pick-fj"]').trigger("click")
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })

			await w.setProps({ profile: { id: "p2", name: "Profile 2" } })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "p1" } })

			await w.setProps({ profile })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		})

		test("account A's balances never produce settings for account B, not even for the tick of the switch", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockResolvedValueOnce({ publicFeeJuice: HELD, privateFeeJuice: HELD })
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: "0" })
			const w = mountSend()
			await flushPromises()
			const emittedForA = everEmittedSettings(w).length
			expect(emittedForA).toBe(1)

			await w.setProps({ account: accountB })
			await flushPromises()
			expect(everEmittedSettings(w).length).toBe(emittedForA)
			expect(lastEmittedSettings(w)).toBeUndefined()
		})

		test("a pick made while another account's storage read is still open lands on its own account", async () => {
			allPayers()
			const w = mountSend()
			await flushPromises()
			storageGate = deferred<void>()
			await w.find('[data-testid="pick-fj"]').trigger("click")
			await w.setProps({ account: accountB })
			storageGate.resolve()
			storageGate = undefined
			await flushPromises()
			expect(storageBacking[SEND_KEY]).toEqual({ [account.address]: { private: { type: "fj" } } })
		})
	})

	describe("while loading", () => {
		const pendingOf = (w: ReturnType<typeof mount>) =>
			["fee-method-selector", "fee-method-row", "fee-cost-readout"].map((id) =>
				w.find(`[data-testid="${id}"]`).attributes("data-pending"),
			)

		test("the trigger previews the saved pick, but no settings come from it and its rows wait as bars", async () => {
			const gas = deferred<unknown>()
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockReturnValue(gas.promise)
			storageBacking[SEND_KEY] = { [account.address]: { private: { type: "fj" } } }
			const w = mountSend()
			await flushPromises()
			expect(activeType(w)).toBe("fj")
			expect(everEmittedSettings(w)).toEqual([])
			expect(pendingOf(w)).toEqual(["true", "true", "true"])
			// With a saved pick no Checking shows, so only the card's mark says the read runs.
			const readPending = () => w.get('[data-testid="fee-settings-card"]').attributes("data-read-pending")
			expect(readPending()).toBe("true")

			gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: "0" })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
			expect(pendingOf(w)).toEqual(["false", "false", "false"])
			expect(readPending()).toBeUndefined()
		})

		test("every row is drawn from the first paint, and a Priority set before the read lands is in the first settings", async () => {
			const gas = deferred<unknown>()
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockReturnValue(gas.promise)
			const w = mountSend()
			expect(activeType(w)).toBeUndefined()
			expect(pendingOf(w)).toEqual(["true", "true", "true"])
			expect(w.find('[data-testid="fee-priority-row"]').exists()).toBe(true)
			await flushPromises()

			await w.get('[data-testid="pick-fast"]').trigger("click")
			await flushPromises()
			const payers = () => (w.emitted<unknown[]>("update:payer") ?? []).map((e) => e[0])
			expect(everEmittedSettings(w)).toEqual([])
			expect(payers().every((p) => p === null)).toBe(true)

			gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: HELD })
			await flushPromises()
			expect(everEmittedSettings(w)).toEqual([{ paymentMethod: { kind: "fpc", fpcId: "p1" }, priorityLevel: "fast" }])
			expect(payers().at(-1)).toEqual({ type: "private_fpc", fpcId: "p1", isProtocol: true })
			expect(pendingOf(w)).toEqual(["false", "false", "false"])
		})

		test("the readout hears whether Send's amount field holds an amount while the read runs", async () => {
			const gas = deferred<unknown>()
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockReturnValue(gas.promise)
			const w = mountSend()
			const readout = () => w.get('[data-testid="fee-cost-readout"]')
			expect([readout().attributes("data-pending"), readout().attributes("data-amount-typed")]).toEqual(["true", "false"])
			await w.setProps({ amountTyped: true })
			expect(readout().attributes("data-amount-typed")).toBe("true")
			gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: HELD })
			await flushPromises()
		})

		test("a read that holds or an init that throws leaves no bar: the trigger asks for a method", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: null, privateFeeJuice: null })
			const held = mountSend({ originPrivacy: "public" })
			expect(held.get('[data-testid="fee-method-selector"]').attributes("data-pending")).toBe("true")
			await flushPromises()
			expect(activeType(held)).toBeUndefined()
			expect(held.get('[data-testid="fee-method-selector"]').attributes("data-pending")).toBe("false")
			expect(held.find('[data-testid="fee-cost-readout"]').exists()).toBe(false)
			expect(held.find('[data-testid="fee-priority-row"]').exists()).toBe(false)
			held.unmount()

			const logged = vi.spyOn(console, "error").mockImplementation(() => {})
			try {
				// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
				;(globalThis as any).chrome.storage.local.get = vi.fn().mockRejectedValue(new Error("storage unavailable"))
				const failed = mountSend({ account: accountB })
				expect(failed.get('[data-testid="fee-method-selector"]').attributes("data-pending")).toBe("true")
				await flushPromises()
				expect(degradedText(failed)).toBe("Couldn't load fee data. Close and reopen to try again.")
				expect(failed.get('[data-testid="fee-method-selector"]').attributes("data-pending")).toBe("false")
				expect(failed.find('[data-testid="fee-priority-row"]').exists()).toBe(false)
			} finally {
				logged.mockRestore()
			}
		})

		test("after a failed read, a switch to another account draws every row for the new read", async () => {
			const logged = vi.spyOn(console, "error").mockImplementation(() => {})
			try {
				const gas = deferred<unknown>()
				mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
				mocks.getGasBalances.mockRejectedValueOnce(new Error("boom")).mockReturnValue(gas.promise)
				const w = mountSend()
				await flushPromises()
				expect(degradedText(w)).toBe("Couldn't load fee data. Retrying in the background.")

				await w.setProps({ account: accountB })
				await flushPromises()
				expect(pendingOf(w)).toEqual(["true", "true", "true"])
				expect(degradedText(w)).toBeNull()

				gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: HELD })
				await flushPromises()
				expect(pendingOf(w)).toEqual(["false", "false", "false"])
				expect(degradedText(w)).toBeNull()
				expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "p1" } })
			} finally {
				logged.mockRestore()
			}
		})

		test("after a failed read, the next account's failed read brings its own line back", async () => {
			const logged = vi.spyOn(console, "error").mockImplementation(() => {})
			let w: ReturnType<typeof mount> | undefined
			try {
				const gas = deferred<unknown>()
				mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
				mocks.getGasBalances.mockRejectedValueOnce(new Error("boom")).mockReturnValueOnce(gas.promise)
				w = mountSend()
				await flushPromises()
				expect(degradedText(w)).toBe("Couldn't load fee data. Retrying in the background.")

				await w.setProps({ account: accountB })
				await flushPromises()
				expect(degradedText(w)).toBeNull()
				gas.reject(new Error("boom again"))
				await flushPromises()
				expect(w.get('[data-testid="fee-method-selector"]').attributes("data-pending")).toBe("false")
				expect(degradedText(w)).toBe("Couldn't load fee data. Retrying in the background.")

				storageGate = deferred<void>()
				await w.setProps({ account })
				await flushPromises()
				expect(degradedText(w)).toBeNull()
				storageGate.reject(new Error("storage unavailable"))
				await flushPromises()
				expect(degradedText(w)).toBe("Couldn't load fee data. Close and reopen to try again.")
			} finally {
				// A degraded identity arms the store's retry timer: unmounting releases it.
				w?.unmount()
				logged.mockRestore()
			}
		})

		test("a committed account's failed read keeps its line while the same account reads again", async () => {
			const logged = vi.spyOn(console, "error").mockImplementation(() => {})
			let w: ReturnType<typeof mount> | undefined
			try {
				const gas = deferred<unknown>()
				mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
				mocks.getGasBalances.mockRejectedValueOnce(new Error("boom")).mockReturnValue(gas.promise)
				w = mountSend()
				await flushPromises()
				expect(degradedText(w)).toBe("Couldn't load fee data. Retrying in the background.")

				await w.setProps({ account: { ...account } })
				await flushPromises()
				expect(mocks.getGasBalances).toHaveBeenCalledTimes(2)
				expect(degradedText(w)).toBe("Couldn't load fee data. Retrying in the background.")
				gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: HELD })
				await flushPromises()
			} finally {
				w?.unmount()
				logged.mockRestore()
			}
		})

		test("outside Send the card draws no bars while it reads", async () => {
			const gas = deferred<unknown>()
			mocks.getGasBalances.mockReturnValue(gas.promise)
			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await flushPromises()
			expect(w.get('[data-testid="fee-method-selector"]').attributes("data-pending")).toBe("false")
			expect(w.find('[data-testid="fee-cost-readout"]').exists()).toBe(false)
			expect(w.find('[data-testid="fee-priority-row"]').exists()).toBe(false)
			gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: null })
		})
	})

	describe("FPC events", () => {
		const sponsorOnly = () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: "0" })
		}

		test("deleting the selected sponsor re-resolves down the walk, toasts, and stops offering it", async () => {
			const { useToast } = await import("@/composables/toast")
			sponsorOnly()
			const w = mountSend()
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			await fpcEvent("onFpcDeleted", { id: "s1" })
			await flushPromises()
			expect(lastEmittedSettings(w)).toBeUndefined()
			expect(w.find('[data-testid="pick-fpc"]').exists()).toBe(false)
			expect(lastNeedsFeeJuice(w)).toBe(true)
			expect(useToast().toast.value?.label).toBe("Selected FPC was deleted")
		})

		test("a rename reaches the trigger without changing the settings", async () => {
			sponsorOnly()
			const w = mountSend()
			await flushPromises()
			await fpcEvent("onFpcUpdated", { ...SPONSOR, name: "Renamed" })
			await flushPromises()
			expect(activeTitle(w)).toBe("Renamed")
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		})

		test("deleted after the FPC leg resolved but before the gas leg settles: stays gone once the commit lands", async () => {
			const gas = deferred<unknown>()
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
			mocks.getGasBalances.mockReturnValue(gas.promise)
			const w = mountSend()
			await flushPromises()
			await fpcEvent("onFpcDeleted", { id: "s1" })
			gas.resolve({ publicFeeJuice: "0", privateFeeJuice: "0" })
			await flushPromises()
			expect(everEmittedSettings(w)).toEqual([])
			expect(w.find('[data-testid="pick-fpc"]').exists()).toBe(false)
		})

		test("deleted after init: stays gone across a recovery recommit whose snapshot still lists it", async () => {
			vi.useFakeTimers()
			try {
				mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
				mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
				mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: "0" })
				const w = mountSend()
				await vi.advanceTimersByTimeAsync(0)
				expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

				await fpcEvent("onFpcDeleted", { id: "s1" })
				await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
				await vi.advanceTimersByTimeAsync(0)
				expect(mocks.getGasBalances).toHaveBeenCalledTimes(2)
				expect(lastEmittedSettings(w)).toBeUndefined()
				expect(w.find('[data-testid="pick-fpc"]').exists()).toBe(false)
				w.unmount()
			} finally {
				vi.useRealTimers()
			}
		})

		test.each([
			["with a saved pick for it", true],
			["without one", false],
		])("A: delete S → B → back to A with the FPC refresh failing: S is neither selected nor offered (%s)", async (_name, withPick) => {
			sponsorOnly()
			if (withPick) storageBacking[SEND_KEY] = { [account.address]: { private: { type: "fpc", fpc: { id: "s1" } } } }
			const w = mountSend()
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			await fpcEvent("onFpcDeleted", { id: "s1" })
			await w.setProps({ account: accountB })
			await flushPromises()

			// The store still holds A's list with S in it, and the refresh that would correct it fails.
			mocks.getFpcs.mockRejectedValue(new Error("boom"))
			await w.setProps({ account })
			await flushPromises()
			expect(lastEmittedSettings(w)).toBeUndefined()
			expect(w.find('[data-testid="pick-fpc"]').exists()).toBe(false)
		})

		test("an event received before the first fetch resolves is kept", async () => {
			const fpcs = deferred<unknown>()
			mocks.getFpcs.mockReturnValue(fpcs.promise)
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: "0" })
			const w = mountSend()
			await flushPromises()
			await fpcEvent("onFpcDeleted", { id: "s1" })
			fpcs.resolve([PRIVATE_FPC, SPONSOR])
			await flushPromises()
			expect(everEmittedSettings(w)).toEqual([])
		})
	})

	describe("a sponsor that can't cover this fee", () => {
		const NULO_AT = `0x${"0a".repeat(32)}`
		const HAND_AT = `0x${"0b".repeat(32)}`
		const EDITED_AT = `0x${"0c".repeat(32)}`
		const NULO = { ...SPONSOR, address: NULO_AT }
		const HAND = { id: "s2", type: 1, name: "Dev sponsor", isProtocol: false, address: HAND_AT }
		const FEE = { maxFee: "1000" }
		const verdict = (funded: boolean, over: Record<string, unknown> = {}) => ({
			...FEE,
			sponsorFunding: { fpcId: "s1", address: NULO_AT, funded, ...over },
		})
		const PAYS_PUBLIC = "The sponsor you chose can't cover this fee right now. Public Fee Juice pays it instead."
		const NO_PAYER = "The sponsor you chose can't cover this fee right now."
		const picked = (origin: string, id = "s1") => ({ [account.address]: { [origin]: { type: "fpc", fpc: { id } } } })
		const row = (w: ReturnType<typeof mount>, id: string) => w.get(`[data-testid="pick-fpc"][data-fpc-id="${id}"]`)
		const notice = (w: ReturnType<typeof mount>) => {
			const n = w.find('[data-testid="fee-sponsor-short"]')
			return n.exists() ? n.text() : null
		}
		const funding = (w: ReturnType<typeof mount>) => w.get('[data-testid="fee-settings-card"]').attributes("data-sponsor-funding")

		/** Nulo's sponsor picked for a public send the account could pay itself. */
		const pickedWithGas = async (over: Record<string, unknown> = {}) => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, NULO])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: "0" })
			storageBacking[SEND_KEY] = picked("public")
			const w = mountSend({ originPrivacy: "public", ...over })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
			return w
		}
		const short = async (w: ReturnType<typeof mount>) => {
			await w.setProps({ feeEstimate: verdict(false) })
			await flushPromises()
		}

		test.each([
			{
				case: "no gas of its own, public origin",
				origin: "public",
				gas: { publicFeeJuice: "0", privateFeeJuice: "0" },
				saved: false,
				type: undefined,
				text: NO_PAYER,
			},
			{
				case: "picked, public Fee Juice funded, public origin",
				origin: "public",
				gas: { publicFeeJuice: HELD, privateFeeJuice: "0" },
				saved: true,
				type: "fj",
				text: PAYS_PUBLIC,
			},
			{
				case: "picked, public Fee Juice funded, private origin with private gas read zero",
				origin: "private",
				gas: { publicFeeJuice: HELD, privateFeeJuice: "0" },
				saved: true,
				type: "fj",
				text: PAYS_PUBLIC,
			},
		])("short, $case: set aside, its row disabled, and the card says why", async ({ origin, gas, saved, type, text }) => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, NULO])
			mocks.getGasBalances.mockResolvedValue(gas)
			if (saved) storageBacking[SEND_KEY] = picked(origin)
			const w = mountSend({ originPrivacy: origin })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

			await short(w)
			expect(activeType(w)).toBe(type)
			expect(lastEmittedSettings(w)).toEqual(type ? { paymentMethod: { kind: type } } : undefined)
			expect(notice(w)).toBe(text)
			expect(row(w, "s1").attributes()).toMatchObject({ "data-disabled": "true", "data-reason": "can't pay now" })
			expect(funding(w)).toBe("short")
			expect(w.find('[data-testid="send-fee-nudge"]').exists()).toBe(type === undefined)
		})

		test("the notice lands in a polite region that was there, empty, before it", async () => {
			const w = await pickedWithGas()
			const live = w.get('[data-testid="fee-sponsor-live"]')
			expect(live.attributes()).toMatchObject({ role: "status", "aria-live": "polite", "aria-atomic": "true" })
			expect(live.text()).toBe("")
			await short(w)
			expect(w.get('[data-testid="fee-sponsor-live"]').element).toBe(live.element)
			expect(live.text()).toBe(PAYS_PUBLIC)
			expect(live.get('[data-testid="fee-sponsor-short"] i').attributes("aria-hidden")).toBe("true")
		})

		test("funded: marked funded, and nothing else moves", async () => {
			const w = await pickedWithGas()
			const emitted = w.emitted("update:modelValue")?.length
			await w.setProps({ feeEstimate: verdict(true) })
			await flushPromises()
			expect(funding(w)).toBe("funded")
			expect(activeType(w)).toBe("fpc")
			expect(w.emitted("update:modelValue")?.length).toBe(emitted)
			expect(notice(w)).toBeNull()
			expect(row(w, "s1").attributes("data-disabled")).toBe("false")
		})

		test.each([
			["no verdict", FEE],
			["a verdict on a row the card does not list", verdict(false, { fpcId: "s9" })],
			["a verdict on an address the row does not have", verdict(false, { address: EDITED_AT })],
		])("%s: nothing changes", async (_case, estimate) => {
			const w = await pickedWithGas()
			await w.setProps({ feeEstimate: estimate })
			await flushPromises()
			expect(activeType(w)).toBe("fpc")
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
			expect(notice(w)).toBeNull()
			expect(funding(w)).toBeUndefined()
			expect(row(w, "s1").attributes("data-disabled")).toBe("false")
		})

		test("a hand-added sponsor's address edited while its estimate was out: the old address's verdict is discarded", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, NULO, HAND])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: "0" })
			storageBacking[SEND_KEY] = picked("public", "s2")
			const w = mountSend({ originPrivacy: "public" })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s2" } })

			await fpcEvent("onFpcUpdated", { ...HAND, address: EDITED_AT })
			await w.setProps({ feeEstimate: verdict(false, { fpcId: "s2", address: HAND_AT }) })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s2" } })
			expect(notice(w)).toBeNull()
			expect(funding(w)).toBeUndefined()
			expect(row(w, "s2").attributes("data-disabled")).toBe("false")
		})

		test("short, then its address edited: the row is offered again, the payer stays, and it is not reselected", async () => {
			const w = await pickedWithGas()
			await short(w)
			expect(activeType(w)).toBe("fj")

			await fpcEvent("onFpcUpdated", { ...NULO, address: EDITED_AT, isProtocol: false })
			await flushPromises()
			expect(row(w, "s1").attributes("data-disabled")).toBe("false")
			expect(activeType(w)).toBe("fj")
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
			expect(notice(w)).toBeNull()
		})

		test("short, then renamed: the verdict still holds for the same transaction", async () => {
			const w = await pickedWithGas()
			await short(w)

			await fpcEvent("onFpcUpdated", { ...NULO, name: "Renamed" })
			await flushPromises()
			expect(row(w, "s1").attributes("data-disabled")).toBe("true")
			expect(activeType(w)).toBe("fj")
			expect(notice(w)).toBe(PAYS_PUBLIC)
		})

		test("the fallback's own estimate, on the same transaction, keeps the row disabled", async () => {
			const w = await pickedWithGas({ txShape: "t1" })
			await short(w)
			await w.setProps({ feeEstimate: null, isEstimating: true })
			await w.setProps({ feeEstimate: FEE, isEstimating: false })
			await flushPromises()
			expect(activeType(w)).toBe("fj")
			expect(row(w, "s1").attributes("data-disabled")).toBe("true")
			expect(notice(w)).toBe(PAYS_PUBLIC)
		})

		test.each([
			["the transaction", (w: ReturnType<typeof mount>) => w.setProps({ txShape: "t2" })],
			["the priority", (w: ReturnType<typeof mount>) => w.get('[data-testid="pick-fast"]').trigger("click")],
		])("%s changes: the row is offered again, the payer stays, and a tap makes it the payer", async (_case, change) => {
			const w = await pickedWithGas({ txShape: "t1" })
			await short(w)
			await change(w)
			await flushPromises()
			expect(row(w, "s1").attributes("data-disabled")).toBe("false")
			expect(activeType(w)).toBe("fj")
			expect(notice(w)).toBeNull()

			await row(w, "s1").trigger("click")
			await flushPromises()
			expect(activeType(w)).toBe("fpc")
			expect(lastEmittedSettings(w)).toMatchObject({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		})

		describe("a transaction change while the sponsor pays", () => {
			const verifying = (w: ReturnType<typeof mount>) => row(w, "s1").attributes("data-verifying")
			const changedWhilePaying = async () => {
				const w = await pickedWithGas({ txShape: "t1" })
				await w.setProps({ feeEstimate: verdict(true) })
				await w.setProps({ txShape: "t2", feeEstimate: null, isEstimating: true })
				await flushPromises()
				return w
			}

			test("its row loads, still pickable, until its verdict lands", async () => {
				const w = await changedWhilePaying()
				expect(verifying(w)).toBe("true")
				expect(row(w, "s1").attributes("data-disabled")).toBe("false")
				expect(activeType(w)).toBe("fpc")

				await w.setProps({ feeEstimate: verdict(true), isEstimating: false })
				await flushPromises()
				expect(verifying(w)).toBe("false")
			})

			test("an estimate that ends without a verdict ends the loading", async () => {
				const w = await changedWhilePaying()
				await w.setProps({ feeEstimate: null, isEstimating: false })
				await flushPromises()
				expect(verifying(w)).toBe("false")
			})

			test.each([
				["no estimate runs", { txShape: "t2" }],
				["the priority changed instead", { isEstimating: true }],
			])("%s: no read is in flight for the row, so it never loads", async (_case, props) => {
				const w = await pickedWithGas({ txShape: "t1" })
				await w.setProps({ feeEstimate: verdict(true) })
				if (!("txShape" in props)) await w.get('[data-testid="pick-fast"]').trigger("click")
				await w.setProps(props)
				await flushPromises()
				expect(verifying(w)).toBe("false")
			})

			test("another payer is picked during the read: the sponsor's row stops loading", async () => {
				const w = await changedWhilePaying()
				await w.get('[data-testid="pick-fj"]').trigger("click")
				await flushPromises()
				expect(activeType(w)).toBe("fj")
				expect(verifying(w)).toBe("false")
			})
		})

		test("a hand-added sponsor short, Nulo's takes over: the notice names the default sponsor", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, NULO, HAND])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: "0" })
			storageBacking[SEND_KEY] = picked("public", "s2")
			const w = mountSend({ originPrivacy: "public" })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s2" } })

			await w.setProps({ feeEstimate: verdict(false, { fpcId: "s2", address: HAND_AT }) })
			await flushPromises()
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
			expect(notice(w)).toBe("The sponsor you chose can't cover this fee right now. The default sponsor pays it instead.")
		})

		test("an identity switch forgets the verdict; a replaced profile object with the same key does not", async () => {
			const w = await pickedWithGas()
			await short(w)
			await w.setProps({ profile: { ...profile } })
			await flushPromises()
			expect(row(w, "s1").attributes("data-disabled")).toBe("true")
			expect(activeType(w)).toBe("fj")

			await w.setProps({ account: accountB })
			await flushPromises()
			expect(row(w, "s1").attributes("data-disabled")).toBe("false")
			await w.setProps({ account })
			await flushPromises()
			expect(activeType(w)).toBe("fpc")
			expect(notice(w)).toBeNull()
			expect(funding(w)).toBeUndefined()
		})

		test("short on a public send, then the origin flipped to private with private gas to pay: no notice", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, NULO])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: HELD })
			storageBacking[SEND_KEY] = picked("public")
			const w = mountSend({ originPrivacy: "public" })
			await flushPromises()
			await short(w)
			expect(activeType(w)).toBe("private_fpc")
			expect(notice(w)).toBe("The sponsor you chose can't cover this fee right now. Private FPC pays it instead.")

			await w.setProps({ originPrivacy: "private" })
			await flushPromises()
			expect(activeType(w)).toBe("private_fpc")
			expect(notice(w)).toBeNull()
		})

		test("a private send whose private gas is unchecked, with the sponsor short: one notice, the sponsor's", async () => {
			mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, NULO])
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: null })
			const w = mountSend()
			await flushPromises()
			expect(activeType(w)).toBe("fpc")

			await short(w)
			expect(activeType(w)).toBeUndefined()
			expect(notice(w)).toBe(NO_PAYER)
			expect(degradedText(w)).toBeNull()
		})
	})
})

describe("FeeSettingsCard — a sponsor that can't cover this fee, outside Send", () => {
	const NULO = { id: "s1", type: 1, name: "Sponsored", isProtocol: true, address: `0x${"0a".repeat(32)}` }
	const HAND = { id: "s2", type: 1, name: "Dev sponsor", isProtocol: false, address: `0x${"0b".repeat(32)}` }
	const shortOn = (row: { id: string; address: string }) => ({
		maxFee: "1000",
		sponsorFunding: { fpcId: row.id, address: row.address, funded: false },
	})

	test.each([
		{ case: "Nulo's sponsor, chosen unasked", fpcs: [NULO], saved: undefined, row: NULO },
		{ case: "a sponsor added by hand, picked", fpcs: [HAND], saved: { type: "fpc", fpc: HAND }, row: HAND },
	])("$case: dropped to Select method with the saved pick kept, and a recovery does not reselect it", async ({ fpcs, saved, row }) => {
		vi.useFakeTimers()
		try {
			if (saved) storageBacking[FEE_METHOD_LS_KEY] = { [account.address]: saved }
			mocks.getFpcs.mockResolvedValue(fpcs)
			mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: null })
			const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: row.id } })

			const active = () => w.get('[data-testid="fee-method-selector"]').attributes("data-active-type")
			const notice = () => w.find('[data-testid="fee-sponsor-short"]')
			await w.setProps({ feeEstimate: shortOn(row) })
			await vi.advanceTimersByTimeAsync(0)
			expect(lastEmittedSettings(w)).toBeUndefined()
			expect(active()).toBeUndefined()
			expect(notice().text()).toBe("The sponsor you chose can't cover this fee right now.")
			expect(storageBacking[FEE_METHOD_LS_KEY]).toEqual(saved ? { [account.address]: saved } : undefined)

			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0])
			await vi.advanceTimersByTimeAsync(0)
			expect(mocks.getGasBalances).toHaveBeenCalledTimes(2)
			expect(w.find('[data-testid="fee-init-degraded"]').exists()).toBe(false)
			expect(lastEmittedSettings(w)).toBeUndefined()
			expect(active()).toBeUndefined()
			expect(notice().exists()).toBe(true)
			w.unmount()
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("FeeSettingsCard — a card that falls back on a short sponsor", () => {
	const NULO = { id: "s1", type: 1, name: "Sponsored", isProtocol: true, address: `0x${"0a".repeat(32)}` }
	const SHORT = {
		maxFee: "1000",
		sponsorFunding: { fpcId: "s1", address: NULO.address, funded: false },
	}

	test.each([
		{
			case: "public Fee Juice held",
			gas: { publicFeeJuice: "5", privateFeeJuice: null },
			kind: "fj",
			text: "The sponsor you chose can't cover this fee right now. Public Fee Juice pays it instead.",
		},
		{
			case: "nothing else can pay",
			gas: { publicFeeJuice: "0", privateFeeJuice: null },
			kind: undefined,
			text: "The sponsor you chose can't cover this fee right now.",
		},
	])("$case: the selection moves along Send's public walk, unsaved, and the notice names who pays", async ({ gas, kind, text }) => {
		mocks.getFpcs.mockResolvedValue([NULO])
		mocks.getGasBalances.mockResolvedValue(gas)
		const w = mount(FeeSettingsCard, { props: { ...baseProps(), fallsBack: true }, global: { stubs: STUBS } })
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })

		await w.setProps({ feeEstimate: SHORT })
		await flushPromises()
		expect((lastEmittedSettings(w) as { paymentMethod?: { kind: string } } | undefined)?.paymentMethod?.kind).toBe(kind)
		expect(w.get('[data-testid="fee-sponsor-short"]').text()).toBe(text)
		expect(mocks.saveFeePick).not.toHaveBeenCalled()
		w.unmount()
	})
})

describe("FeeSettingsCard — the fee-juice nudge outside Send", () => {
	const NULO = { id: "s1", type: 1, name: "Sponsored", isProtocol: true, address: `0x${"0a".repeat(32)}` }
	const HAND = { id: "s2", type: 1, name: "Dev sponsor", isProtocol: false, address: `0x${"0b".repeat(32)}` }
	const PRIVATE_FPC = { id: "p1", type: 2, name: "Private FPC", isProtocol: true }
	const SHORT = {
		maxFee: "1000",
		sponsorFunding: { fpcId: "s1", address: NULO.address, funded: false },
	}
	const nudge = (w: ReturnType<typeof mount>) => w.find('[data-testid="send-fee-nudge"]')

	test.each([
		{ case: "both balances read empty", gas: { publicFeeJuice: "0", privateFeeJuice: "0" }, shows: true },
		{ case: "the private balance unread", gas: { publicFeeJuice: "0", privateFeeJuice: null }, shows: false },
	])("$case, Nulo's sponsor set aside by its check: the nudge shows only on confirmed empties", async ({ gas, shows }) => {
		mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, NULO])
		mocks.getGasBalances.mockResolvedValue(gas)
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(nudge(w).exists()).toBe(false)

		await w.setProps({ feeEstimate: SHORT })
		await flushPromises()
		expect(nudge(w).exists()).toBe(shows)
		if (shows) expect(nudge(w).text()).toContain("You have no fee juice yet")
		w.unmount()
	})

	test("a sponsor added by hand stops the nudge only once picked", async () => {
		mocks.getFpcs.mockResolvedValue([HAND])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: null })
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(nudge(w).exists()).toBe(true)

		await w.get('[data-testid="pick-fpc"][data-fpc-id="s2"]').trigger("click")
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s2" } })
		expect(nudge(w).exists()).toBe(false)
		w.unmount()
	})
})

describe("FeeSettingsCard — the account's own Fee Juice short of the fee", () => {
	const NULO = { id: "s1", type: 1, name: "Sponsored", isProtocol: true, address: `0x${"0a".repeat(32)}` }
	const SHORT = {
		maxFee: "2100000000000000",
		feeJuiceShortfall: { maxFee: "2100000000000000", balance: "1500000000000000" },
	}
	const shortfall = (w: ReturnType<typeof mount>) => w.find('[data-testid="fee-juice-shortfall"]')

	test("named in the live region, with both figures, while Fee Juice pays", async () => {
		mocks.getFpcs.mockResolvedValue([])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1500000000000000", privateFeeJuice: null })
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		await w.get('[data-testid="pick-fj"]').trigger("click")
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })

		await w.setProps({ feeEstimate: SHORT })
		await flushPromises()
		expect(w.get('[data-testid="fee-sponsor-live"]').text()).toBe("This send can cost up to ~0.0021 FJ. You have 0.0015 FJ.")
		w.unmount()
	})

	test("one balance, two precisions: the Available row truncates at four decimals, the refusal at the fee's six", async () => {
		mocks.getFpcs.mockResolvedValue([])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "1512345678900000", privateFeeJuice: null })
		const row = {
			props: ["feeJuiceBalanceFormatted"],
			template: '<div data-testid="fee-method-row" :data-balance="feeJuiceBalanceFormatted" />',
		}
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: { ...STUBS, FeeMethodRow: row } } })
		await flushPromises()
		await w.get('[data-testid="pick-fj"]').trigger("click")
		await w.setProps({
			feeEstimate: { maxFee: "2100000000000000", feeJuiceShortfall: { maxFee: "2100000000000000", balance: "1512345678900000" } },
		})
		await flushPromises()
		expect(w.get('[data-testid="fee-method-row"]').attributes("data-balance")).toBe("0.0015")
		expect(w.get('[data-testid="fee-sponsor-live"]').text()).toBe("This send can cost up to ~0.0021 FJ. You have 0.001512 FJ.")
		w.unmount()
	})

	test("never while another payer pays", async () => {
		mocks.getFpcs.mockResolvedValue([NULO])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: null })
		const w = mount(FeeSettingsCard, { props: baseProps({ feeEstimate: SHORT }), global: { stubs: STUBS } })
		await flushPromises()
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
		expect(shortfall(w).exists()).toBe(false)
		w.unmount()
	})
})

describe("FeeSettingsCard — Send: the fee-source tag", () => {
	const HELD = "1000000000000000000"
	const PRIVATE_FPC = { id: "p1", type: 2, name: "Private FPC", isProtocol: true }
	const SPONSOR = { id: "s1", type: 1, name: "Sponsor" }
	const TAG = '[data-testid="send-fee-privacy-notice"]'

	const mountSend = (over: Record<string, unknown> = {}) =>
		mount(FeeSettingsCard, {
			props: baseProps({ originPrivacy: "private", ...over }),
			global: { stubs: STUBS },
		})
	const everyPayer = () => {
		mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: HELD })
	}

	test("the tag is the page's call: Fee Juice picked under a private origin draws none by itself", async () => {
		everyPayer()
		const w = mountSend()
		await flushPromises()
		await w.find('[data-testid="pick-fj"]').trigger("click")
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fj" } })
		expect(w.find(TAG).exists()).toBe(false)
		expect(w.find('[data-testid="send-fee-privacy-remedy"]').exists()).toBe(false)
	})

	test("the prop draws the tag with its shape, and withdraws it, whatever is selected", async () => {
		everyPayer()
		const w = mountSend({ payerNoticeShape: "private-private" })
		await flushPromises()
		expect(w.find(TAG).attributes("data-notice-shape")).toBe("private-private")

		await w.setProps({ payerNoticeShape: "private-public" })
		expect(w.find(TAG).attributes("data-notice-shape")).toBe("private-public")

		await w.find('[data-testid="pick-fpc"]').trigger("click")
		expect(w.find(TAG).attributes("data-notice-shape")).toBe("private-public")

		await w.setProps({ payerNoticeShape: null })
		expect(w.find(TAG).exists()).toBe(false)
	})

	test("the no-gas nudge speaks of private gas on a private send, and keeps its wording elsewhere", async () => {
		mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: "0" })
		const priv = mountSend()
		await flushPromises()
		expect(priv.find('[data-testid="send-fee-nudge"]').text()).toContain("You have no private gas yet")
		expect(priv.find('[data-testid="send-fee-get-juice"]').text()).toBe("Get private gas")
		priv.unmount()

		const pub = mountSend({ originPrivacy: "public", account: { id: "a2", address: "0xacctB" } })
		await flushPromises()
		expect(pub.find('[data-testid="send-fee-nudge"]').text()).toContain("You have no fee juice yet")
		expect(pub.find('[data-testid="send-fee-get-juice"]').text()).toBe("Get fee juice")
	})
})

describe("FeeSettingsCard — Send: the payer model", () => {
	const HELD = "1000000000000000000"
	const PRIVATE_FPC = { id: "p1", type: 2, name: "Private FPC", isProtocol: true }
	const SPONSOR = { id: "s1", type: 1, name: "Sponsor", isProtocol: true }
	const HAND_ADDED = { id: "s2", type: 1, name: "Mine", isProtocol: false }
	const accountB = { id: "a2", address: "0xacctB" }

	const mountSend = (over: Record<string, unknown> = {}) =>
		mount(FeeSettingsCard, {
			props: baseProps({ originPrivacy: "private", ...over }),
			global: { stubs: STUBS },
		})
	/** The model's value as the parent sees it: its `null` default until the first emission. */
	const payer = (w: ReturnType<typeof mount>) => (w.emitted<unknown[]>("update:payer") ?? []).at(-1)?.[0] ?? null

	test("null while the balances are pending, then the method that pays — its contract and whether the wallet vouches for it", async () => {
		const gas = deferred<unknown>()
		mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
		mocks.getGasBalances.mockReturnValue(gas.promise)
		const w = mountSend()
		await flushPromises()
		expect(payer(w)).toBeNull()

		gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: HELD })
		await flushPromises()
		expect(payer(w)).toEqual({ type: "private_fpc", fpcId: "p1", isProtocol: true })
		await w.find('[data-testid="pick-fj"]').trigger("click")
		expect(payer(w)).toEqual({ type: "fj", fpcId: undefined, isProtocol: false })
		await w.find('[data-testid="pick-fpc"]').trigger("click")
		expect(payer(w)).toEqual({ type: "fpc", fpcId: "s1", isProtocol: true })
	})

	test("null on a hold and on none: a walk that selects nothing names no payer", async () => {
		mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: null })
		const hold = mountSend()
		await flushPromises()
		expect(lastEmittedSettings(hold)).toBeUndefined()
		expect(payer(hold)).toBeNull()
		hold.unmount()

		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: "0" })
		const none = mountSend({ account: accountB })
		await flushPromises()
		expect(none.find('[data-testid="send-fee-nudge"]').exists()).toBe(true)
		expect(payer(none)).toBeNull()
	})

	test("a hand-added sponsor, once picked, is reported unvouched; an identity switch withdraws the payer until the new read lands", async () => {
		// It pays only once picked: both accounts saved it for a private send.
		const picked = { private: { type: "fpc", fpc: { id: "s2" } } }
		storageBacking[sendFeePicksKey("p1")] = { [account.address]: picked, [accountB.address]: picked }
		mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, HAND_ADDED])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: "0", privateFeeJuice: "0" })
		const w = mountSend()
		await flushPromises()
		expect(payer(w)).toEqual({ type: "fpc", fpcId: "s2", isProtocol: false })

		const gas = deferred<unknown>()
		mocks.getGasBalances.mockReturnValue(gas.promise)
		await w.setProps({ account: accountB })
		await flushPromises()
		expect(w.emitted<unknown[]>("update:payer")?.at(-1)?.[0]).toBeNull()

		gas.resolve({ publicFeeJuice: "0", privateFeeJuice: "0" })
		await flushPromises()
		expect(payer(w)).toEqual({ type: "fpc", fpcId: "s2", isProtocol: false })
	})

	test("the dApp windows' card reports its one pick the same way", async () => {
		mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, SPONSOR])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: HELD })
		storageBacking[FEE_METHOD_LS_KEY] = { [account.address]: { type: "fj" } }
		const w = mount(FeeSettingsCard, { props: baseProps(), global: { stubs: STUBS } })
		await flushPromises()
		expect(payer(w)).toEqual({ type: "fj", fpcId: undefined, isProtocol: false })
	})
})

/**
 * Each identity guard, one field at a time. An in-place change to a prop object's field never
 * fires the identity watcher (it tracks the objects, not their fields), so only the guard that
 * compares the field can discard the stale work; a replaced object carrying the same values must
 * not count as a switch.
 */
describe("FeeSettingsCard — the identity guards, field by field", () => {
	const HELD = "1000000000000000000"
	const SPONSOR = { id: "s1", type: 1, name: "Sponsor", isProtocol: true }
	const PRIVATE_FPC = { id: "p1", type: 2, name: "Private FPC", isProtocol: true }
	type Identity = {
		profile: { id: string; name: string }
		network: { id: string; chainId: number }
		account: { id: string; address: string }
	}
	const liveIdentity = (): Identity => ({
		profile: reactive({ ...profile }),
		network: reactive({ ...network }),
		account: reactive({ ...account }),
	})
	const IN_PLACE: Array<{ field: string; mutate: (i: Identity) => void }> = [
		{ field: "profile id", mutate: (i) => (i.profile.id = "p2") },
		{ field: "network id", mutate: (i) => (i.network.id = "n2") },
		{ field: "chain id", mutate: (i) => (i.network.chainId = 222) },
		{ field: "account address", mutate: (i) => (i.account.address = "0xother") },
	]
	const SWITCHES: Array<{ field: string; over: Record<string, unknown> }> = [
		{ field: "profile id", over: { profile: { id: "p2", name: "Profile 2" } } },
		{ field: "network id", over: { network: { id: "n2", chainId: network.chainId } } },
		{ field: "chain id", over: { network: { id: network.id, chainId: 222 } } },
		{ field: "account address", over: { account: { id: "a2", address: "0xother" } } },
	]
	const SAME_VALUES: Array<{ prop: string; over: () => Record<string, unknown> }> = [
		{ prop: "profile", over: () => ({ profile: { ...profile } }) },
		{ prop: "network", over: () => ({ network: { ...network } }) },
		{ prop: "account", over: () => ({ account: { ...account } }) },
	]
	const settingsEmitted = (w: ReturnType<typeof mount>) => (w.emitted<unknown[]>("update:modelValue") ?? []).map((e) => e[0])
	const degraded = (w: ReturnType<typeof mount>) => w.find('[data-testid="fee-init-degraded"]').exists()

	/** The card's init held on its gas read; `mutate` runs while it is held. */
	const initAcross = async (mutate: (i: Identity) => void) => {
		mocks.getFpcs.mockResolvedValue([SPONSOR])
		const gas = deferred<{ publicFeeJuice: string; privateFeeJuice: string | null }>()
		mocks.getGasBalances.mockReturnValueOnce(gas.promise)
		const live = liveIdentity()
		const w = mount(FeeSettingsCard, { props: baseProps(live), global: { stubs: STUBS } })
		await flushPromises()
		mutate(live)
		gas.resolve({ publicFeeJuice: HELD, privateFeeJuice: null })
		await flushPromises()
		return w
	}

	test("control: an init with no identity change commits the sponsor", async () => {
		const w = await initAcross(() => {})
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "s1" } })
	})

	test.each(IN_PLACE)("an in-place $field change during init discards the run", async ({ mutate }) => {
		const w = await initAcross(mutate)
		expect(settingsEmitted(w)).toEqual([])
	})

	/** A degraded init, then a recovery recommit held on its storage read; `mutate` runs while it is held. */
	const recommitAcross = async (mutate: (i: Identity, w: ReturnType<typeof mount>) => void | Promise<void>) => {
		vi.useFakeTimers()
		// biome-ignore lint/suspicious/noExplicitAny: test-only global stub
		const chromeAny = (globalThis as any).chrome
		const origGet = chromeAny.storage.local.get
		let w: ReturnType<typeof mount> | undefined
		try {
			mocks.getGasBalances.mockRejectedValueOnce(new Error("boom"))
			mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: null })
			mocks.getFpcs.mockResolvedValue([SPONSOR])
			const live = liveIdentity()
			w = mount(FeeSettingsCard, { props: baseProps(live), global: { stubs: STUBS } })
			await vi.advanceTimersByTimeAsync(0)
			expect(degraded(w)).toBe(true)
			const gate = deferred<void>()
			let armed = true
			chromeAny.storage.local.get = async (keys: unknown) => {
				if (armed) {
					armed = false
					await gate.promise
				}
				return origGet(keys)
			}
			await vi.advanceTimersByTimeAsync(INIT_RETRY_BACKOFF_MS[0] + 50)
			await mutate(live, w)
			gate.resolve()
			await vi.advanceTimersByTimeAsync(0)
			return w
		} catch (error) {
			w?.unmount()
			throw error
		} finally {
			chromeAny.storage.local.get = origGet
			vi.useRealTimers()
		}
	}

	test("control: a recovery recommit with no identity change clears the degraded notice", async () => {
		const w = await recommitAcross(() => {})
		expect(degraded(w)).toBe(false)
	})

	test.each(IN_PLACE)("an in-place $field change during a recovery recommit discards the late commit", async ({ mutate }) => {
		const w = await recommitAcross(mutate)
		expect(degraded(w)).toBe(true)
	})

	/** Send's settled selection, then `mutate`. */
	const sendAcross = async (mutate: (i: Identity) => void) => {
		mocks.getFpcs.mockResolvedValue([PRIVATE_FPC])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: HELD })
		const live = liveIdentity()
		const w = mount(FeeSettingsCard, {
			props: baseProps({ ...live, originPrivacy: "private" }),
			global: { stubs: STUBS },
		})
		await flushPromises()
		mutate(live)
		await flushPromises()
		return w
	}

	test("control: Send keeps its settled selection when nothing changes", async () => {
		const w = await sendAcross(() => {})
		expect(lastEmittedSettings(w)).toEqual({ paymentMethod: { kind: "fpc", fpcId: "p1" } })
	})

	test.each(IN_PLACE)("Send: an in-place $field change unsettles the selection on the same tick", async ({ mutate }) => {
		const w = await sendAcross(mutate)
		expect(lastEmittedSettings(w)).toBeUndefined()
	})

	const NULO_AT = `0x${"0a".repeat(32)}`
	const NULO = { ...SPONSOR, address: NULO_AT }
	const sponsorRow = (w: ReturnType<typeof mount>) => w.get('[data-testid="pick-fpc"][data-fpc-id="s1"]')

	/** Nulo's sponsor picked for a public send, then reported short. */
	const shortSponsor = async () => {
		mocks.getFpcs.mockResolvedValue([PRIVATE_FPC, NULO])
		mocks.getGasBalances.mockResolvedValue({ publicFeeJuice: HELD, privateFeeJuice: "0" })
		storageBacking[sendFeePicksKey("p1")] = { [account.address]: { public: { type: "fpc", fpc: { id: "s1" } } } }
		const w = mount(FeeSettingsCard, {
			props: baseProps({ originPrivacy: "public" }),
			global: { stubs: STUBS },
		})
		await flushPromises()
		await w.setProps({
			feeEstimate: {
				maxFee: "1000",
				sponsorFunding: { fpcId: "s1", address: NULO_AT, funded: false },
			},
		})
		await flushPromises()
		expect(sponsorRow(w).attributes("data-disabled")).toBe("true")
		return w
	}

	test.each(SWITCHES)("a $field switch forgets the sponsor verdict", async ({ over }) => {
		const w = await shortSponsor()
		await w.setProps(over)
		await flushPromises()
		expect(sponsorRow(w).attributes("data-disabled")).toBe("false")
	})

	test.each(SAME_VALUES)("a replaced $prop object with the same values keeps the verdict", async ({ over }) => {
		const w = await shortSponsor()
		await w.setProps(over())
		await flushPromises()
		expect(sponsorRow(w).attributes("data-disabled")).toBe("true")
	})

	test.each(SAME_VALUES)(
		"after a recovery recommit, a replaced $prop object with the same values keeps the gate open",
		async ({ over }) => {
			const w = await recommitAcross(() => {})
			expect(degraded(w)).toBe(false)
			const before = settingsEmitted(w).length
			await w.setProps(over())
			await flushPromises()
			expect(settingsEmitted(w).slice(before)).not.toContain(undefined)
		},
	)

	test.each(SAME_VALUES)("after a first init, a replaced $prop object with the same values keeps the gate open", async ({ over }) => {
		const w = await initAcross(() => {})
		const before = settingsEmitted(w).length
		await w.setProps(over())
		await flushPromises()
		expect(settingsEmitted(w).slice(before)).not.toContain(undefined)
	})
})
