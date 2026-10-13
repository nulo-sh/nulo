/**
 * Component tests for RevokeAuthwitsPopup's keyboard contract. No document-level Enter revokes: a key
 * on the header's ×, the fee card, a teleported menu item, a popup layered over this one or nothing
 * focused does only its own thing. The focused Revoke button is the one keyboard path, and a repeat or
 * composing Enter that first lands on it idle revokes nothing.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { createApp, h, nextTick, ref } from "vue"
import { EventHandler } from "@nulo/wallet-core/utils"
import { usePopupEntity } from "@/composables/usePopupEntity"
import type { SendStarted } from "@/wallet/services/auth-registry/spec"
import { heldJobSubscription, LIVE_STAGES, record } from "../../../../tests/helpers/held-job-subscription"
import { pressOn } from "../../../../tests/helpers/press-key"

const authwitsServiceMock = {
	getRegistryEnabled: vi.fn(),
	revokeAuthwits: vi.fn(),
	estimateRevokeFee: vi.fn(),
	cancelFeeEstimate: vi.fn(),
	disconnect: vi.fn(),
	onRegistryEnabled: { add: vi.fn(), remove: vi.fn() },
	onRegistryDisabled: { add: vi.fn(), remove: vi.fn() },
	onSendStarted: new EventHandler<SendStarted>(),
}

const journalMock = { subscribeJob: vi.fn(), disconnect: vi.fn() }

const ESTIMATE = { maxFee: "1000", maxFeeFormatted: "0.000000000000001", gasDetails: {} }
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

vi.mock("@/wallet/services/operation-journal/client", () => ({
	OperationJournalServiceClient: vi.fn(function () {
		return journalMock
	}),
}))

vi.mock("@/popup/utils/cancellable-rejection", () => ({
	classifyCancellableRejection: () => "fail",
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

vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: openToastMock }),
}))

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
			fallsBack: Boolean,
		},
		emits: ["update:modelValue"],
		setup: () => ({ feeControlClick }),
		// Single button per chunk that emits a fee. Tests can target by index.
		template: `<button class="set-fee" :data-estimate="feeEstimate?.maxFee" :data-falls-back="String(fallsBack)" @click="feeControlClick(); $emit('update:modelValue', { gasLimit: 100 })">fee</button>`,
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
const cleanups: Array<() => void> = []

const nestedSubmit = vi.fn()
/** Shows a form popup with one field over the sheet under test, in an app of its own: a second VTU
 *  mount would drop the sheet's stubs, as VTU's vnode transform is global. */
async function showNestedFormPopup(): Promise<HTMLInputElement> {
	const show = ref(false)
	const app = createApp({
		setup() {
			usePopupEntity(() => show.value, { submit: nestedSubmit })
			return () => h("input")
		},
	})
	const host = document.body.appendChild(document.createElement("div"))
	app.mount(host)
	cleanups.push(() => app.unmount())
	show.value = true
	await nextTick()
	return host.querySelector("input") as HTMLInputElement
}

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
	journalMock.subscribeJob.mockReset()
	openToastMock.mockReset()
	popupOpenMock.mockReset()
	feeControlClick.mockReset()
	nestedSubmit.mockReset()
	preselected.preselectedAuthwits = []
})

afterEach(async () => {
	for (const w of wrappers) {
		await w.setProps({ show: false })
		await flushPromises()
		w.unmount()
	}
	wrappers.length = 0
	for (const c of cleanups.splice(0)) c()
	document.body.innerHTML = ""
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

describe("RevokeAuthwitsPopup — Enter elsewhere revokes nothing, though a revoke is ready", () => {
	test("Enter on the header's close button closes the popup once", async () => {
		const w = await mountAndOpen()
		await setAllFees(w)
		pressOn(w.get('[data-testid="popup-close-btn"]').element as HTMLElement, "Enter")
		await flushPromises()
		expect(w.emitted("onClose")).toHaveLength(1)
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
	})

	test("Enter on a control inside the fee card runs that control", async () => {
		const w = await mountAndOpen()
		await setAllFees(w)
		feeControlClick.mockClear()
		pressOn(w.get(".set-fee").element as HTMLElement, "Enter")
		await flushPromises()
		expect(feeControlClick).toHaveBeenCalledTimes(1)
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
	})

	test("Enter on an element outside the popup, as a teleported menu item, runs that element", async () => {
		const w = await mountAndOpen()
		await setAllFees(w)
		const item = document.createElement("div")
		item.setAttribute("data-dropdown-item", "")
		item.tabIndex = 0
		const itemClick = vi.fn()
		item.addEventListener("click", itemClick)
		document.body.appendChild(item)
		pressOn(item, "Enter")
		await flushPromises()
		expect(itemClick).toHaveBeenCalledTimes(1)
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
	})

	test("Enter with nothing focused", async () => {
		const w = await mountAndOpen()
		await setAllFees(w)
		expect(document.activeElement).toBe(document.body)
		document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
	})

	test("Enter in the field of a form popup shown over this one submits that popup once", async () => {
		const w = await mountAndOpen()
		await setAllFees(w)
		pressOn(await showNestedFormPopup(), "Enter")
		await flushPromises()
		expect(nestedSubmit).toHaveBeenCalledTimes(1)
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
	})

	test("repeat-only Enter keydowns that first land on the idle, focused Revoke button", async () => {
		const w = await mountAndOpen()
		await setAllFees(w)
		for (let i = 0; i < 3; i++) pressOn(submitButton(w), "Enter", { repeat: true })
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
	})

	test.each([
		["isComposing", { isComposing: true }],
		["keyCode 229 with isComposing false", { keyCode: 229, isComposing: false }],
	] as const)("a composing Enter (%s) on the idle, focused Revoke button", async (_name, init) => {
		const w = await mountAndOpen()
		await setAllFees(w)
		pressOn(submitButton(w), "Enter", init)
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
	})
})

describe("RevokeAuthwitsPopup — the Revoke button", () => {
	test.each(["Enter", " "] as const)("%j on the focused Revoke button revokes once", async (key) => {
		const w = await mountAndOpen()
		await setAllFees(w)
		expect(pressOn(submitButton(w), key)).not.toContain(false)
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).toHaveBeenCalledTimes(1)
	})

	test("a held Enter on the focused Revoke button revokes once", async () => {
		let resolveRevoke: (v?: unknown) => void = () => {}
		authwitsServiceMock.revokeAuthwits.mockReturnValueOnce(new Promise((r) => (resolveRevoke = r)))
		const w = await mountAndOpen()
		await setAllFees(w)
		pressOn(submitButton(w), "Enter")
		await flushPromises()
		for (let i = 0; i < 3; i++) pressOn(submitButton(w), "Enter", { repeat: true })
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).toHaveBeenCalledTimes(1)
		resolveRevoke()
	})

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

	test("a press before every chunk has a fee revokes nothing", async () => {
		const w = await mountAndOpen()
		pressOn(submitButton(w), "Enter")
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).not.toHaveBeenCalled()
		expect(w.find('[data-testid="revoke-authwits-submit"]').attributes("disabled")).toBeDefined()
	})

	test("(REGRESSION-PIN) a second press while the revoke is in flight revokes nothing", async () => {
		let resolveRevoke: (v?: unknown) => void = () => {}
		authwitsServiceMock.revokeAuthwits.mockReturnValueOnce(new Promise((r) => (resolveRevoke = r)))
		const w = await mountAndOpen()
		await setAllFees(w)
		pressOn(submitButton(w), "Enter")
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).toHaveBeenCalledTimes(1)
		pressOn(submitButton(w), "Enter")
		pressOn(submitButton(w), " ")
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).toHaveBeenCalledTimes(1)
		// The stub forwards only `disabled`, so this proves the template's :disabled includes isLoading.
		expect(w.find('[data-testid="revoke-authwits-submit"]').attributes("disabled")).toBeDefined()
		resolveRevoke()
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

	test("a click on the Revoke button revokes once", async () => {
		const w = await mountAndOpen()
		await setAllFees(w)
		await w.find('[data-testid="revoke-authwits-submit"]').trigger("click")
		await flushPromises()
		expect(authwitsServiceMock.revokeAuthwits).toHaveBeenCalledTimes(1)
	})
})

describe("RevokeAuthwitsPopup — the send's stage line", () => {
	const stageLine = (w: ReturnType<typeof mount>) => w.get('[data-testid="authwit-stage-line"]').text()

	/** Starts a send that stays in flight and returns the key it carried. */
	async function startSend() {
		authwitsServiceMock.revokeAuthwits.mockReturnValueOnce(new Promise(() => {}))
		const w = await mountAndOpen()
		await setAllFees(w)
		await w.get('[data-testid="revoke-authwits-submit"]').trigger("click")
		await flushPromises()
		const correlation = authwitsServiceMock.revokeAuthwits.mock.calls[0]?.[4] as string
		return { w, correlation }
	}

	test("follows this popup's revoke through each live stage and clears when it ends", async () => {
		const job = heldJobSubscription(journalMock.subscribeJob)
		const { w, correlation } = await startSend()
		expect(correlation).toMatch(/^[0-9a-f]{16}$/)
		authwitsServiceMock.onSendStarted.invoke({ correlation, journalId: "j1" })
		expect(journalMock.subscribeJob).toHaveBeenCalledWith("j1", expect.any(Function))
		for (const [progress, line] of LIVE_STAGES) {
			job.show(record(progress))
			await nextTick()
			expect(stageLine(w)).toBe(line)
		}
		job.show(record({ stage: "succeeded" }, 9))
		await nextTick()
		expect(stageLine(w)).toBe("")
	})

	test("another popup's send is ignored", async () => {
		const { w } = await startSend()
		authwitsServiceMock.onSendStarted.invoke({ correlation: "0xsomeone-else", journalId: "j2" })
		await nextTick()
		expect(journalMock.subscribeJob).not.toHaveBeenCalled()
		expect(stageLine(w)).toBe("")
	})

	test("hidden before the record's snapshot lands: the subscription is released and nothing renders", async () => {
		const job = heldJobSubscription(journalMock.subscribeJob)
		const { w, correlation } = await startSend()
		authwitsServiceMock.onSendStarted.invoke({ correlation, journalId: "j1" })
		await w.setProps({ show: false })
		await flushPromises()
		job.land()
		await flushPromises()
		expect(job.release).toHaveBeenCalledTimes(1)
		authwitsServiceMock.getRegistryEnabled.mockResolvedValueOnce(true)
		await w.setProps({ show: true })
		await flushPromises()
		job.show(record({ stage: "simulating" }))
		await nextTick()
		expect(stageLine(w)).toBe("")
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

	test("a failed estimate keeps Revoke off and says so", async () => {
		authwitsServiceMock.estimateRevokeFee.mockRejectedValueOnce(new Error("node down"))
		const w = await mountAndOpen()
		await setAllFees(w)
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Couldn't estimate fee. Try again." })
		expect(disabled(w)).toBe(true)
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
