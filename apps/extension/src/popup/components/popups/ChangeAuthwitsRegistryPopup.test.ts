/**
 * Component tests for ChangeAuthwitsRegistryPopup's keyboard contract. No document-level Enter sends
 * the toggle: a key on the header's ×, the fee card, a teleported menu item, a popup layered over this
 * one or nothing focused does only its own thing. The focused Send button is the one keyboard path,
 * and a repeat or composing Enter that first lands on it idle sends nothing.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { nextTick } from "vue"
import { EventHandler } from "@nulo/wallet-core/utils"
import type { SendStarted } from "@/wallet/services/auth-registry/spec"
import { heldJobSubscription, LIVE_STAGES, record } from "../../../../tests/helpers/held-job-subscription"
import { pressOn } from "../../../../tests/helpers/press-key"
import { describeSendPopupKeyboard } from "../../../../tests/helpers/send-popup-keyboard"

const authwitsServiceMock = {
	getRegistryEnabled: vi.fn(),
	setRegistryEnabled: vi.fn(),
	estimateRegistryToggleFee: vi.fn(),
	cancelFeeEstimate: vi.fn(),
	disconnect: vi.fn(),
	onRegistryEnabled: { add: vi.fn(), remove: vi.fn() },
	onRegistryDisabled: { add: vi.fn(), remove: vi.fn() },
	onSendStarted: new EventHandler<SendStarted>(),
}

const journalMock = { subscribeJob: vi.fn(), disconnect: vi.fn() }

const ESTIMATE = { maxFee: "1000", gasDetails: {} }
/** The popup debounces each estimate by 500 ms. */
async function estimatesLand() {
	await vi.advanceTimersByTimeAsync(500)
	await flushPromises()
}

const openToastMock = vi.fn()
const feeControlClick = vi.fn()

// Vitest 4 requires function expressions (not arrows) for `new`-constructed mocks.
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

vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({
		popups: { change_authwits_registry: { order: 1 } },
		len: 1,
	}),
}))

vi.mock("@/composables/toast", () => ({
	useToast: () => ({
		openToast: openToastMock,
	}),
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
		template: `<button data-testid="set-fee" :data-estimate="feeEstimate?.maxFee" :data-falls-back="String(fallsBack)" @click="feeControlClick(); $emit('update:modelValue', { gasLimit: 100 })">fee</button>`,
	},
	Button: {
		props: ["loading", "disabled"],
		// As the real primitive: only `disabled` sets the native attribute.
		template: `<button data-testid="registry-toggle-submit" :disabled="disabled"><slot /></button>`,
	},
	Tooltip: { template: "<div><slot /><slot name='content' /></div>" },
	Icon: { template: "<i />" },
	Text: { template: "<span><slot /></span>" },
	Flex: { template: "<div><slot /></div>" },
}

import ChangeAuthwitsRegistryPopup from "./ChangeAuthwitsRegistryPopup.vue"

// Every mounted wrapper, hidden and unmounted after each test.
const wrappers: ReturnType<typeof mount>[] = []

async function mountAndOpen() {
	authwitsServiceMock.getRegistryEnabled.mockResolvedValueOnce(true)
	const w = mount(ChangeAuthwitsRegistryPopup, {
		props: { show: false },
		global: { stubs: STUBS },
		attachTo: document.body,
	})
	wrappers.push(w)
	await w.setProps({ show: true })
	await flushPromises()
	return w
}

async function setFee(w: ReturnType<typeof mount>) {
	await w.find('[data-testid="set-fee"]').trigger("click")
	await estimatesLand()
}

const submitButton = (w: ReturnType<typeof mount>) => w.get('[data-testid="registry-toggle-submit"]').element as HTMLElement

beforeEach(() => {
	authwitsServiceMock.getRegistryEnabled.mockReset()
	authwitsServiceMock.setRegistryEnabled.mockReset().mockResolvedValue(undefined)
	authwitsServiceMock.estimateRegistryToggleFee.mockReset().mockResolvedValue(ESTIMATE)
	authwitsServiceMock.cancelFeeEstimate.mockReset().mockResolvedValue(undefined)
	vi.useFakeTimers()
	authwitsServiceMock.disconnect.mockReset()
	journalMock.subscribeJob.mockReset()
	openToastMock.mockReset()
	feeControlClick.mockReset()
})

afterEach(async () => {
	for (const w of wrappers) {
		await w.setProps({ show: false })
		await flushPromises()
		w.unmount()
	}
	wrappers.length = 0
	document.body.innerHTML = ""
	vi.useRealTimers()
})

describeSendPopupKeyboard({
	popup: "ChangeAuthwitsRegistryPopup",
	words: { button: "Send", verb: "sends", ready: "the toggle is ready", unset: "the fee is set", inFlight: "the toggle" },
	open: mountAndOpen,
	setFee,
	submit: '[data-testid="registry-toggle-submit"]',
	feeControl: '[data-testid="set-fee"]',
	feeControlClick,
	send: authwitsServiceMock.setRegistryEnabled,
})

describe("ChangeAuthwitsRegistryPopup — the send's stage line", () => {
	const stageLine = (w: ReturnType<typeof mount>) => w.get('[data-testid="authwit-stage-line"]').text()

	/** Starts a send that stays in flight and returns the key it carried. */
	async function startSend() {
		authwitsServiceMock.setRegistryEnabled.mockReturnValueOnce(new Promise(() => {}))
		const w = await mountAndOpen()
		await setFee(w)
		await w.get('[data-testid="registry-toggle-submit"]').trigger("click")
		await flushPromises()
		const correlation = authwitsServiceMock.setRegistryEnabled.mock.calls[0]?.[4] as string
		return { w, correlation }
	}

	test("follows this popup's toggle through each live stage and clears when it ends", async () => {
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

describe("ChangeAuthwitsRegistryPopup — the fee check before proving", () => {
	const disabled = (w: ReturnType<typeof mount>) => w.get('[data-testid="registry-toggle-submit"]').attributes("disabled") !== undefined

	test("Send stays off until the toggle's estimate lands, and the card is handed it", async () => {
		const w = await mountAndOpen()
		await w.get('[data-testid="set-fee"]').trigger("click")
		expect(disabled(w)).toBe(true)
		pressOn(submitButton(w), "Enter")
		await flushPromises()
		expect(authwitsServiceMock.setRegistryEnabled).not.toHaveBeenCalled()

		await estimatesLand()
		expect(authwitsServiceMock.estimateRegistryToggleFee.mock.calls[0]?.slice(0, 4)).toEqual([
			"net-1",
			"0xacct",
			false,
			{ gasLimit: 100 },
		])
		const card = w.get('[data-testid="set-fee"]')
		expect([card.attributes("data-estimate"), card.attributes("data-falls-back")]).toEqual(["1000", "true"])
		expect(disabled(w)).toBe(false)
		await w.get('[data-testid="registry-toggle-submit"]').trigger("click")
		await flushPromises()
		expect(authwitsServiceMock.setRegistryEnabled).toHaveBeenCalledTimes(1)
	})

	test("an estimate the account's own Fee Juice cannot cover keeps Send off", async () => {
		authwitsServiceMock.estimateRegistryToggleFee.mockResolvedValueOnce({
			maxFee: "800",
			gasDetails: {},
			feeJuiceShortfall: { maxFee: "800", balance: "799" },
		})
		const w = await mountAndOpen()
		await setFee(w)
		expect(disabled(w)).toBe(true)
		await w.get('[data-testid="registry-toggle-submit"]').trigger("click")
		await flushPromises()
		expect(authwitsServiceMock.setRegistryEnabled).not.toHaveBeenCalled()
	})

	test("new fee settings, a speed change or a fallback, turn Send off until their estimate lands", async () => {
		const w = await mountAndOpen()
		await setFee(w)
		expect(disabled(w)).toBe(false)
		await w.get('[data-testid="set-fee"]').trigger("click")
		expect(disabled(w)).toBe(true)
		await estimatesLand()
		expect(disabled(w)).toBe(false)
	})

	test("a failed estimate keeps Send off and says so", async () => {
		authwitsServiceMock.estimateRegistryToggleFee.mockRejectedValueOnce(new Error("node down"))
		const w = await mountAndOpen()
		await setFee(w)
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Couldn't estimate fee. Try again." })
		expect(disabled(w)).toBe(true)
	})
})
