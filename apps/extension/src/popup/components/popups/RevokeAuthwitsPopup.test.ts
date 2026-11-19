/**
 * Component tests for RevokeAuthwitsPopup: its keyboard contract (no document-level Enter revokes; the
 * focused Revoke button is the one keyboard path, and a repeat or composing Enter that first lands on
 * it idle revokes nothing), its fee gating, and its hand-off: Revoke posts every chunk to the worker
 * and closes, reporting nothing itself.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { EventHandler } from "@nulo/wallet-core/utils"
import { type ToastOptions, useToast } from "@/composables/toast"
import { pressOn } from "../../../../tests/helpers/press-key"
import { describeSendPopupKeyboard } from "../../../../tests/helpers/send-popup-keyboard"

const authwitsServiceMock = {
	getRegistryEnabled: vi.fn(),
	revokeAuthwits: vi.fn(),
	estimateRevokeFee: vi.fn(),
	cancelFeeEstimate: vi.fn(),
	disconnect: vi.fn(),
	onRegistryEnabled: { add: vi.fn(), remove: vi.fn() },
	onRegistryDisabled: { add: vi.fn(), remove: vi.fn() },
	isConnected: true,
	onConnected: new EventHandler<void>(),
	onDisconnected: new EventHandler<void>(),
}

const ESTIMATE = { maxFee: "1000", gasDetails: {} }
/** The popup debounces each estimate by 500 ms. */
async function estimatesLand() {
	await vi.advanceTimersByTimeAsync(500)
	await flushPromises()
}

const openToastMock = vi.fn()
const popupOpenMock = vi.fn()
const feeControlClick = vi.fn()
const preselected = { preselectedAuthwits: [] as { id: string; content: string }[] }

vi.mock("@/wallet/services/auth-registry/client", () => ({
	AuthRegistryServiceClient: vi.fn(function () {
		return authwitsServiceMock
	}),
	MAX_REVOKES_PER_TX: 8,
}))

vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({
		network: { id: "net-1" },
		account: { address: "0xacct" },
		profile: { id: "p1" },
	}),
}))

vi.mock("@/stores/cache.store", () => ({
	useCacheStore: () => preselected,
}))

vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({
		popups: { revoke_authwits: { order: 1 } },
		len: 1,
		open: popupOpenMock,
	}),
}))

// The real snack, so a test reads what is on screen; every open is also recorded.
vi.mock("@/composables/toast", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/composables/toast")>()
	return {
		useToast: () => {
			const live = real.useToast()
			const openToast = (options: ToastOptions) => {
				openToastMock(options)
				return live.openToast(options)
			}
			return { ...live, openToast }
		},
	}
})

const STUBS = {
	Popup: { props: ["show", "displaceIdx"], template: `<div v-if="show"><slot /></div>` },
	PopupCard: { template: "<div><slot /></div>" },
	PopupHeader: {
		emits: ["onClose"],
		template: `<div><slot name='title' /><button type="button" data-testid="popup-close-btn" @click="$emit('onClose')">×</button></div>`,
	},
	Banner: { template: "<div />" },
	FeeSettingsCard: {
		props: {
			profile: Object,
			network: Object,
			account: Object,
			modelValue: Object,
			feeEstimate: Object,
			isEstimating: Boolean,
			estimateFailed: Boolean,
			fallsBack: Boolean,
		},
		emits: ["update:modelValue", "retryEstimate"],
		setup: () => ({ feeControlClick }),
		template: `<div><button class="set-fee" :data-estimate="feeEstimate?.maxFee" :data-falls-back="String(fallsBack)" :data-failed="String(estimateFailed)" @click="feeControlClick(); $emit('update:modelValue', { gasLimit: 100 })">fee</button><button class="stub-retry" @click="$emit('retryEstimate')">retry</button></div>`,
	},
	Button: {
		props: ["loading", "disabled"],
		// The stub mirrors the REAL primitive: only `disabled` sets the native
		// attribute (loading alone is CSS pointer-events). A `disabled || loading`
		// stub previously masked the template's missing isLoading in :disabled.
		template: `<button data-testid="revoke-authwits-submit" :disabled="disabled"><slot /></button>`,
	},
	Tooltip: { template: "<div><slot /><slot name='content' /></div>" },
	Icon: { template: "<i />" },
	Text: { template: "<span><slot /></span>" },
	Flex: { template: "<div><slot /></div>" },
}

import { RowAction } from "@nulo/design"
import RevokeAuthwitsPopup from "./RevokeAuthwitsPopup.vue"

// Every mounted wrapper, hidden and unmounted after each test.
const wrappers: ReturnType<typeof mount>[] = []

async function mountAndOpen(authwits: { id: string; content: string }[] = [{ id: "aw-1", content: "c1" }]) {
	preselected.preselectedAuthwits = authwits
	authwitsServiceMock.getRegistryEnabled.mockResolvedValueOnce(true)
	const w = mount(RevokeAuthwitsPopup, {
		props: { show: false },
		global: { stubs: STUBS, components: { RowAction } },
		attachTo: document.body,
	})
	wrappers.push(w)
	await w.setProps({ show: true })
	await flushPromises()
	return w
}

async function setAllFees(w: ReturnType<typeof mount>) {
	const feeBtns = w.findAll(".set-fee")
	for (const btn of feeBtns) await btn.trigger("click")
	await estimatesLand()
}

const submitButton = (w: ReturnType<typeof mount>) => w.get('[data-testid="revoke-authwits-submit"]').element as HTMLElement

beforeEach(() => {
	authwitsServiceMock.getRegistryEnabled.mockReset()
	authwitsServiceMock.revokeAuthwits.mockReset().mockResolvedValue(undefined)
	authwitsServiceMock.estimateRevokeFee.mockReset().mockResolvedValue(ESTIMATE)
	authwitsServiceMock.cancelFeeEstimate.mockReset().mockResolvedValue(undefined)
	vi.useFakeTimers()
	authwitsServiceMock.disconnect.mockReset()
	authwitsServiceMock.isConnected = true
	openToastMock.mockReset()
	popupOpenMock.mockReset()
	feeControlClick.mockReset()
	preselected.preselectedAuthwits = []
})

afterEach(async () => {
	for (const w of wrappers) {
		await w.setProps({ show: false })
		await flushPromises()
		w.unmount()
	}
	wrappers.length = 0
	document.body.innerHTML = ""
	useToast().closeToast()
	vi.useRealTimers()
})

describe("RevokeAuthwitsPopup — the content button", () => {
	test.each(["Enter", " "] as const)(
		"a named button: %j on it opens the content once and revokes nothing, though a revoke is ready",
		async (key) => {
			const w = await mountAndOpen([{ id: "aw-1", content: "c1" }])
			await setAllFees(w)
			const view = w.get('[data-testid="revoke-authwits-view-content"]')
			expect(view.element.tagName).toBe("BUTTON")
			expect(view.attributes("aria-label")).toBe("View authwits content")

			expect(pressOn(view.element as HTMLElement, key)).not.toContain(false)
			await flushPromises()
			expect(popupOpenMock).toHaveBeenCalledTimes(1)
			expect(popupOpenMock).toHaveBeenCalledWith("data_viewer")
			expect(preselected).toMatchObject({ viewerData: ["c1"] })
			expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
		},
	)
})

describeSendPopupKeyboard({
	popup: "RevokeAuthwitsPopup",
	words: { button: "Revoke", verb: "revokes", ready: "a revoke is ready", unset: "every chunk has a fee", inFlight: "the revoke" },
	open: () => mountAndOpen(),
	setFee: setAllFees,
	submit: '[data-testid="revoke-authwits-submit"]',
	feeControl: ".set-fee",
	feeControlClick,
	send: authwitsServiceMock.revokeAuthwits,
})

describe("RevokeAuthwitsPopup — what keeps the Revoke button off", () => {
	test("one chunk whose estimate finds the account's own Fee Juice short keeps every revoke off", async () => {
		// Nine authwits make two chunks; only the second, a single revoke, is short.
		authwitsServiceMock.estimateRevokeFee.mockImplementation(async (_n: unknown, _a: unknown, ids: string[]) =>
			ids.length === 1 ? { ...ESTIMATE, feeJuiceShortfall: { maxFee: "800", balance: "799" } } : ESTIMATE,
		)
		const many = Array.from({ length: 9 }, (_, i) => ({ id: `aw-${i}`, content: `c${i}` }))
		const w = await mountAndOpen(many)
		await setAllFees(w)
		expect(new Set(authwitsServiceMock.estimateRevokeFee.mock.calls.map((c) => c[2].length))).toEqual(new Set([8, 1]))
		expect(w.find('[data-testid="revoke-authwits-submit"]').attributes("disabled")).toBeDefined()
		pressOn(submitButton(w), "Enter")
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
	})

	test("(REGRESSION-PIN) an error keeps the Revoke button disabled and a press revokes nothing", async () => {
		// The registry fetch's failure sets `error`, which the button's :disabled reads.
		preselected.preselectedAuthwits = [{ id: "aw-1", content: "c1" }]
		authwitsServiceMock.getRegistryEnabled.mockRejectedValueOnce(new Error("PXE down"))
		const w = mount(RevokeAuthwitsPopup, {
			props: { show: false },
			global: { stubs: STUBS, components: { RowAction } },
			attachTo: document.body,
		})
		wrappers.push(w)
		await w.setProps({ show: true })
		await flushPromises()
		await setAllFees(w)
		expect(w.find('[data-testid="revoke-authwits-submit"]').attributes("disabled")).toBeDefined()
		pressOn(submitButton(w), "Enter")
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
	})
})

describe("RevokeAuthwitsPopup — the fee check before proving", () => {
	// MAX_REVOKES_PER_TX is mocked to 8.
	const TWO_CHUNKS = Array.from({ length: 10 }, (_, i) => ({ id: `aw-${i}`, content: `c${i}` }))
	const disabled = (w: ReturnType<typeof mount>) => w.get('[data-testid="revoke-authwits-submit"]').attributes("disabled") !== undefined
	const clickFees = async (w: ReturnType<typeof mount>) => {
		for (const btn of w.findAll(".set-fee")) await btn.trigger("click")
	}

	test("Revoke stays off until every chunk's estimate lands, and each card is handed its own", async () => {
		const w = await mountAndOpen(TWO_CHUNKS)
		await clickFees(w)
		expect(disabled(w)).toBe(true)
		pressOn(submitButton(w), "Enter")
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()

		await estimatesLand()
		const calls = authwitsServiceMock.estimateRevokeFee.mock.calls
		expect(calls.map((c) => [c[0], c[1], (c[2] as string[]).length, c[3]])).toEqual([
			["net-1", "0xacct", 8, { gasLimit: 100 }],
			["net-1", "0xacct", 2, { gasLimit: 100 }],
		])
		expect(w.findAll(".set-fee").map((b) => [b.attributes("data-estimate"), b.attributes("data-falls-back")])).toEqual([
			["1000", "true"],
			["1000", "true"],
		])
		expect(disabled(w)).toBe(false)
		await w.get('[data-testid="revoke-authwits-submit"]').trigger("click")
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).toHaveBeenCalledTimes(2)
	})

	test("new fee settings on a chunk, a speed change or a fallback, turn Revoke off until their estimate lands", async () => {
		const w = await mountAndOpen()
		await setAllFees(w)
		expect(disabled(w)).toBe(false)
		await w.get(".set-fee").trigger("click")
		expect(disabled(w)).toBe(true)
		pressOn(submitButton(w), "Enter")
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
		await estimatesLand()
		expect(disabled(w)).toBe(false)
	})

	test("a failed estimate keeps Revoke off and says so; Try again on that chunk asks it alone once more, and Revoke turns on once it lands", async () => {
		const estimate = authwitsServiceMock.estimateRevokeFee
		estimate.mockResolvedValueOnce(ESTIMATE).mockRejectedValueOnce(new Error("node down"))
		const w = await mountAndOpen(TWO_CHUNKS)
		await setAllFees(w)
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Couldn't estimate fee. Try again." })
		expect(disabled(w)).toBe(true)
		const failed = () => w.findAll(".set-fee").map((b) => b.attributes("data-failed"))
		expect(failed()).toEqual(["false", "true"])

		await w.findAll(".stub-retry")[1]!.trigger("click")
		expect(useToast().toast.value).toBeNull()
		await estimatesLand()
		expect(estimate).toHaveBeenCalledTimes(3)
		const [, second, third] = estimate.mock.calls
		expect(third!.slice(0, 4)).toEqual(second!.slice(0, 4))
		expect(third![4]).not.toBe(second![4])
		expect(failed()).toEqual(["false", "false"])
		expect(disabled(w)).toBe(false)
	})

	test("hiding the popup cancels the estimate in flight", async () => {
		authwitsServiceMock.estimateRevokeFee.mockReturnValueOnce(new Promise(() => {}))
		const w = await mountAndOpen()
		await setAllFees(w)
		const token = authwitsServiceMock.estimateRevokeFee.mock.calls[0]?.[4]
		await w.setProps({ show: false })
		await flushPromises()
		expect(authwitsServiceMock.cancelFeeEstimate).toHaveBeenCalledWith(token)
	})
})

describe("RevokeAuthwitsPopup — Revoke hands the revoke to the worker", () => {
	// MAX_REVOKES_PER_TX is mocked to 8: nine rows are two chunks.
	const NINE = Array.from({ length: 9 }, (_, i) => ({ id: `aw-${i}`, content: `c${i}` }))
	const closes = (w: ReturnType<typeof mount>) => w.emitted("onClose")?.length ?? 0
	const revoke = async (w: ReturnType<typeof mount>) => {
		await w.get('[data-testid="revoke-authwits-submit"]').trigger("click")
		await flushPromises()
	}
	/** Holds every send until the test settles it, oldest first. */
	function holdSends() {
		const held: (() => void)[] = []
		authwitsServiceMock.revokeAuthwits.mockImplementation(() => new Promise<void>((resolve) => held.push(resolve)))
		return {
			settleOne: async () => {
				held.shift()?.()
				await flushPromises()
			},
		}
	}

	test("the line under Revoke says the revoke goes on after a close, before any press", async () => {
		const w = await mountAndOpen(NINE)
		expect(w.get('[data-testid="revoke-authwits-continues"]').text()).toBe(
			"Revoking continues if you close this. Its progress shows in Activity.",
		)
	})

	test("posts every chunk at once, before any settles, with the network and account read at the press; then closes once", async () => {
		holdSends()
		const w = await mountAndOpen(NINE)
		await setAllFees(w)
		await revoke(w)
		expect(authwitsServiceMock.revokeAuthwits.mock.calls.map((c) => [c[0], c[1], (c[2] as string[]).length, c[3]])).toEqual([
			["net-1", "0xacct", 8, { gasLimit: 100 }],
			["net-1", "0xacct", 1, { gasLimit: 100 }],
		])
		expect(authwitsServiceMock.revokeAuthwits.mock.calls.every((c) => c.length === 4)).toBe(true)
		expect(closes(w)).toBe(1)
	})

	test("a revoke that lands or fails toasts nothing and raises no error line", async () => {
		authwitsServiceMock.revokeAuthwits
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("Authwit #8 is still authorized"))
		const w = await mountAndOpen(NINE)
		await setAllFees(w)
		await revoke(w)
		expect(openToastMock).not.toHaveBeenCalled()
		expect(w.text()).not.toContain("An error occurred")
		expect(closes(w)).toBe(1)
	})

	test("hidden while its requests are out, the client stays connected until the last one settles", async () => {
		const sends = holdSends()
		const w = await mountAndOpen(NINE)
		await setAllFees(w)
		await revoke(w)
		await w.setProps({ show: false })
		await flushPromises()
		expect(authwitsServiceMock.disconnect).not.toHaveBeenCalled()
		await sends.settleOne()
		expect(authwitsServiceMock.disconnect).not.toHaveBeenCalled()
		await sends.settleOne()
		expect(authwitsServiceMock.disconnect).toHaveBeenCalledTimes(1)
	})

	test("while the port reopens after a worker restart, Revoke stays off and posts nothing; once Ready, it posts", async () => {
		const w = await mountAndOpen(NINE)
		await setAllFees(w)
		authwitsServiceMock.isConnected = false
		authwitsServiceMock.onDisconnected.invoke()
		await flushPromises()
		expect(submitButton(w).hasAttribute("disabled")).toBe(true)
		pressOn(submitButton(w), "Enter")
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
		expect(closes(w)).toBe(0)

		authwitsServiceMock.isConnected = true
		authwitsServiceMock.onConnected.invoke()
		await flushPromises()
		await revoke(w)
		expect(authwitsServiceMock.revokeAuthwits).toHaveBeenCalledTimes(2)
		expect(closes(w)).toBe(1)
	})

	test("control: hidden with nothing out, the client disconnects at once", async () => {
		const w = await mountAndOpen(NINE)
		await w.setProps({ show: false })
		await flushPromises()
		expect(authwitsServiceMock.disconnect).toHaveBeenCalledTimes(1)
	})

	test("shown again while a request is out: Revoke posts the new rows, and the client waits for both", async () => {
		const sends = holdSends()
		const w = await mountAndOpen([{ id: "aw-1", content: "c1" }])
		await setAllFees(w)
		await revoke(w)
		await w.setProps({ show: false })
		await flushPromises()
		preselected.preselectedAuthwits = [{ id: "aw-2", content: "c2" }]
		authwitsServiceMock.getRegistryEnabled.mockResolvedValueOnce(true)
		await w.setProps({ show: true })
		await flushPromises()
		await setAllFees(w)
		await revoke(w)
		expect(authwitsServiceMock.revokeAuthwits.mock.calls.map((c) => c[2])).toEqual([["aw-1"], ["aw-2"]])
		await w.setProps({ show: false })
		await flushPromises()
		await sends.settleOne()
		expect(authwitsServiceMock.disconnect).not.toHaveBeenCalled()
		await sends.settleOne()
		expect(authwitsServiceMock.disconnect).toHaveBeenCalledTimes(1)
	})
})
