/** The popup's wiring onto `usePopupEntity`; the composable's own mechanics are in `usePopupEntity.test.ts`. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ABOVE_MODULUS, BELOW_MODULUS, DIGITS_63, MODULUS } from "../../../../tests/helpers/field-modulus"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"

const accountStateServiceMock = {
	getSenders: vi.fn(),
	addSender: vi.fn(),
	disconnect: vi.fn(),
}
const openToastMock = vi.fn()

// Vitest requires `function` expressions (not arrows) for mocks used with `new`.
vi.mock("@/wallet/services/account-state/client", () => ({
	AccountStateServiceClient: vi.fn(function () {
		return accountStateServiceMock
	}),
}))

vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: openToastMock }),
}))

vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({ network: { id: "net-1" } }),
}))
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({ len: 1, popups: { new_sender: { order: 1 } } }),
}))

const STUBS = {
	Popup: { props: ["show", "displaceIdx"], template: "<div><slot /></div>" },
	PopupCard: { props: ["displaceIdx"], template: "<div><slot /></div>" },
	PopupHeader: { emits: ["onClose"], template: "<div><slot name='title' /></div>" },
	Input: {
		props: ["modelValue"],
		emits: ["update:modelValue"],
		template: `<label><input data-testid="sender-input" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></label>`,
	},
	Button: { props: ["disabled", "loading"], template: "<button :disabled='disabled'><slot /></button>" },
	Tooltip: { template: "<div><slot /><slot name='content' /></div>" },
	Icon: { template: "<i />" },
	Text: { template: "<span><slot /></span>" },
	Flex: { template: "<div><slot /></div>" },
	Transition: { template: "<div><slot /></div>" },
}

import NewSenderPopup from "./NewSenderPopup.vue"

const VALID_HEX = `0x0${"a".repeat(63)}`

function pressEnterOnInput() {
	const el = document.createElement("input")
	document.body.appendChild(el)
	el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
}
function pressEnterOnBody() {
	document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
}

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((r) => {
		resolve = r
	})
	return { promise, resolve }
}

const wrappers: VueWrapper[] = []

async function mountShown(): Promise<VueWrapper> {
	const w = mount(NewSenderPopup, { props: { show: false }, global: { stubs: STUBS } })
	wrappers.push(w)
	await w.setProps({ show: true })
	await flushPromises()
	return w
}

/** Plain unmount suffices since usePopupEntity's scope cleanup removes the
 *  document listener; onHide side effects are NOT run here — tests that need
 *  them hide explicitly. */
async function dispose(w: VueWrapper) {
	w.unmount()
}

async function typeAddress(w: VueWrapper, address: string) {
	await w.find('[data-testid="sender-input"]').setValue(address)
}

beforeEach(() => {
	accountStateServiceMock.getSenders.mockResolvedValue([])
	accountStateServiceMock.addSender.mockResolvedValue(undefined)
})

afterEach(() => {
	// Guaranteed net — runs even when an assertion skipped the in-test dispose.
	for (const w of wrappers.splice(0)) {
		try {
			w.unmount()
		} catch {
			/* already unmounted by the test */
		}
	}
	vi.clearAllMocks()
	document.body.innerHTML = ""
})

describe("NewSenderPopup — Enter-submit wiring (usePopupEntity)", () => {
	test("show connects the client and fetches the existing senders", async () => {
		const w = await mountShown()
		expect(accountStateServiceMock.getSenders).toHaveBeenCalledWith("net-1")
		await dispose(w)
	})

	test("Enter while an input is focused submits (addSender called)", async () => {
		const w = await mountShown()
		await typeAddress(w, VALID_HEX)
		pressEnterOnInput()
		await flushPromises()
		expect(accountStateServiceMock.addSender).toHaveBeenCalledWith("net-1", VALID_HEX)
		expect(w.emitted("onClose")).toBeTruthy()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "success", label: "Sender is added" })
		await dispose(w)
	})

	test("a global Enter (body focused) does NOT submit", async () => {
		const w = await mountShown()
		await typeAddress(w, VALID_HEX)
		pressEnterOnBody()
		await flushPromises()
		expect(accountStateServiceMock.addSender).not.toHaveBeenCalled()
		await dispose(w)
	})

	test("Enter does NOT submit an invalid hex address", async () => {
		const w = await mountShown()
		await typeAddress(w, "not-hex")
		pressEnterOnInput()
		await flushPromises()
		expect(accountStateServiceMock.addSender).not.toHaveBeenCalled()
		await dispose(w)
	})

	test("Enter waits for the senders list: inert while it is out, then an unlisted address submits", async () => {
		const list = deferred<string[]>()
		accountStateServiceMock.getSenders.mockReset()
		accountStateServiceMock.getSenders.mockImplementationOnce(() => list.promise)
		const w = await mountShown()
		await typeAddress(w, VALID_HEX)
		pressEnterOnInput()
		await flushPromises()
		expect(accountStateServiceMock.addSender).not.toHaveBeenCalled()
		list.resolve([])
		await flushPromises()
		pressEnterOnInput()
		await flushPromises()
		expect(accountStateServiceMock.addSender).toHaveBeenCalledWith("net-1", VALID_HEX)
		await dispose(w)
	})

	test("(RE-ENTRANCY PIN) repeated Enter during an in-flight add fires addSender ONCE", async () => {
		accountStateServiceMock.addSender.mockImplementationOnce(() => new Promise(() => {}))
		const w = await mountShown()
		await typeAddress(w, VALID_HEX)
		pressEnterOnInput()
		await flushPromises()
		pressEnterOnInput()
		await flushPromises()
		// Cleanup BEFORE the assertion: a failing expect must not skip dispose
		// and leak this instance's document listener into the next test.
		const calls = accountStateServiceMock.addSender.mock.calls.length
		await dispose(w)
		expect(calls).toBe(1)
	})

	test("the button is NATIVELY disabled while the add is in flight (loading alone is only pointer-events CSS)", async () => {
		// The template's :disabled is re-based onto the folded validity source,
		// so the in-flight latch reaches the DOM — closing keyboard-focused
		// activation, which pointer-events:none does not cover.
		accountStateServiceMock.addSender.mockImplementationOnce(() => new Promise(() => {}))
		const w = await mountShown()
		await typeAddress(w, VALID_HEX)
		expect(w.find("button").attributes("disabled")).toBeUndefined()
		pressEnterOnInput()
		await flushPromises()
		const disabledDuringFlight = w.find("button").attributes("disabled")
		await dispose(w)
		expect(disabledDuringFlight).toBeDefined()
	})

	test("hide disconnects the client and resets the field; Enter after hide is inert", async () => {
		const w = await mountShown()
		await typeAddress(w, VALID_HEX)
		await w.setProps({ show: false })
		expect(accountStateServiceMock.disconnect).toHaveBeenCalledTimes(1)
		pressEnterOnInput()
		await flushPromises()
		expect(accountStateServiceMock.addSender).not.toHaveBeenCalled()
		// Re-show renders an empty field (senderAddress was reset on hide).
		await w.setProps({ show: true })
		await flushPromises()
		expect((w.find('[data-testid="sender-input"]').element as HTMLInputElement).value).toBe("")
		await dispose(w)
	})
})

describe("NewSenderPopup — the field modulus", () => {
	test.each([
		["the last value below the modulus is added", BELOW_MODULUS, "", 1],
		["the modulus reads as the contact form", MODULUS, "Invalid address", 0],
		["a value above the modulus reads as the contact form", ABOVE_MODULUS, "Invalid address", 0],
		["63 digits keep this form's words", DIGITS_63, "Invalid sender address", 0],
	])("%s", async (_, address, warning, adds) => {
		const w = await mountShown()
		await typeAddress(w, address)
		await flushPromises()
		expect(w.find('[data-testid="sender-input"]').element.parentElement?.textContent?.trim()).toBe(warning)
		expect(w.find("button").attributes("disabled") !== undefined).toBe(adds === 0)
		pressEnterOnInput()
		await flushPromises()
		expect(accountStateServiceMock.addSender).toHaveBeenCalledTimes(adds)
	})
})

describe("NewSenderPopup — a saved sender", () => {
	const warning = (w: VueWrapper) => w.find('[data-testid="sender-input"]').element.parentElement?.textContent?.trim()

	test('an address already saved reads "Already exists"; Enter adds nothing, as the disabled button', async () => {
		accountStateServiceMock.getSenders.mockResolvedValue([VALID_HEX])
		const w = await mountShown()
		await typeAddress(w, VALID_HEX)
		await flushPromises()
		expect(warning(w)).toBe("Already exists")
		expect(w.find("button").attributes("disabled")).toBeDefined()
		pressEnterOnInput()
		await flushPromises()
		expect(accountStateServiceMock.addSender).not.toHaveBeenCalled()
		expect(openToastMock).not.toHaveBeenCalled()
	})

	test('the listed address typed in upper case reads "Already exists", and Enter adds nothing', async () => {
		accountStateServiceMock.getSenders.mockResolvedValue([VALID_HEX])
		const w = await mountShown()
		await typeAddress(w, `0x${VALID_HEX.slice(2).toUpperCase()}`)
		await flushPromises()
		expect(warning(w)).toBe("Already exists")
		pressEnterOnInput()
		await flushPromises()
		expect(accountStateServiceMock.addSender).not.toHaveBeenCalled()
	})

	test('a list that lands after the address was typed reads "Already exists", and Enter adds nothing', async () => {
		const list = deferred<string[]>()
		accountStateServiceMock.getSenders.mockImplementationOnce(() => list.promise)
		const w = await mountShown()
		await typeAddress(w, VALID_HEX)
		expect(warning(w)).toBe("")
		list.resolve([VALID_HEX])
		await flushPromises()
		expect(warning(w)).toBe("Already exists")
		pressEnterOnInput()
		await flushPromises()
		expect(accountStateServiceMock.addSender).not.toHaveBeenCalled()
	})
})
