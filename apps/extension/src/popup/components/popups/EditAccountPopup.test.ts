/**
 * Component pins for EditAccountPopup — the rejection→retry representative of
 * the submit re-entrancy sweep: its latch used to clear sequentially (never on
 * rejection), which under the folded validity source would have locked the
 * form disabled after one failed save. The latch now clears in `finally`.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"

const updateAccountMock = vi.fn()
const openToastMock = vi.fn()

const appStoreState = {
	accounts: [] as Array<{ name: string; address: string }>,
	updateAccount: (...args: unknown[]) => updateAccountMock(...args),
}

vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: openToastMock }),
}))
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => appStoreState,
}))
vi.mock("@/stores/cache.store", () => ({
	useCacheStore: () => ({ accountToEditIdx: "0xa1" }),
}))
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({ len: 1, popups: { edit_account: { order: 1 } } }),
}))

const STUBS = {
	FormPopup: {
		props: ["show", "submitLabel", "submitDisabled", "submitLoading", "displaceIdx", "submitTestId", "title"],
		emits: ["onClose", "submit"],
		template: `<div :data-submit-disabled="String(submitDisabled)"><slot /><button data-testid="form-submit" :disabled="submitDisabled" @click="$emit('submit')">go</button><slot name="belowSubmit" /></div>`,
	},
	Input: {
		props: ["modelValue"],
		emits: ["update:modelValue"],
		// The real template's data-testid falls through to this stub's ROOT, so
		// the inner input needs its own distinct handle.
		template: `<label><input data-testid="stub-name-field" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></label>`,
	},
	Transition: { template: "<div><slot /></div>" },
	Button: { template: "<button><slot /></button>" },
	Icon: { template: "<i />" },
	Text: { template: "<span><slot /></span>" },
	Flex: { template: "<div><slot /></div>" },
}

import EditAccountPopup from "./EditAccountPopup.vue"

function pressEnterOnInput() {
	const el = document.createElement("input")
	document.body.appendChild(el)
	el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
}

const wrappers: VueWrapper[] = []

async function mountShown(): Promise<VueWrapper> {
	const w = mount(EditAccountPopup, { props: { show: false }, global: { stubs: STUBS } })
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

beforeEach(() => {
	// The edited account is 0xa1 (the cache store's `accountToEditIdx`).
	appStoreState.accounts = [
		{ name: "Vault", address: "0xa1" },
		{ name: "Main", address: "0xa2" },
	]
	updateAccountMock.mockResolvedValue(undefined)
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

describe("EditAccountPopup — submit latch lifecycle", () => {
	test("(RE-ENTRANCY PIN) repeated Enter during an in-flight update fires updateAccount ONCE", async () => {
		updateAccountMock.mockImplementationOnce(() => new Promise(() => {}))
		const w = await mountShown()
		await w.find('[data-testid="stub-name-field"]').setValue("Renamed")
		pressEnterOnInput()
		await flushPromises()
		pressEnterOnInput()
		await flushPromises()
		const calls = updateAccountMock.mock.calls.length
		await dispose(w)
		expect(calls).toBe(1)
	})

	test("a REJECTED update releases the latch — the form re-enables and a retry submits again", async () => {
		updateAccountMock.mockRejectedValueOnce(new Error("rpc down"))
		const w = await mountShown()
		await w.find('[data-testid="stub-name-field"]').setValue("Renamed")
		pressEnterOnInput()
		await flushPromises()
		// The rejection must not leave the folded validity source latched: the
		// submit button is enabled again…
		expect(w.find("[data-submit-disabled]").attributes("data-submit-disabled")).toBe("false")
		// …and a retry goes through.
		pressEnterOnInput()
		await flushPromises()
		const calls = updateAccountMock.mock.calls.length
		await dispose(w)
		expect(calls).toBe(2)
	})
})

describe("EditAccountPopup — the name", () => {
	async function typeName(w: VueWrapper, name: string) {
		await w.find('[data-testid="stub-name-field"]').setValue(name)
		await flushPromises()
		return formState(w)
	}

	function formState(w: VueWrapper) {
		return {
			warns: w.text().includes("Already exist"),
			disabled: w.find('[data-testid="form-submit"]').attributes("disabled") !== undefined,
		}
	}

	test("another account's name with outer spaces warns and blocks Save and Enter", async () => {
		const w = await mountShown()
		expect(await typeName(w, "Main ")).toEqual({ warns: true, disabled: true })
		pressEnterOnInput()
		await flushPromises()
		expect(updateAccountMock).not.toHaveBeenCalled()
	})

	test("a name of only spaces counts as empty and blocks Save", async () => {
		const w = await mountShown()
		expect(await typeName(w, "   ")).toEqual({ warns: false, disabled: true })
	})

	test("a new name with outer spaces saves trimmed", async () => {
		const w = await mountShown()
		await typeName(w, "  Renamed ")
		pressEnterOnInput()
		await flushPromises()
		expect(updateAccountMock).toHaveBeenCalledWith("0xa1", "Renamed")
	})

	test("an account whose stored name another account has warns as the form opens", async () => {
		appStoreState.accounts = [
			{ name: "Vault", address: "0xa1" },
			{ name: "Vault", address: "0xa2" },
		]
		const w = await mountShown()
		expect(formState(w)).toEqual({ warns: true, disabled: true })
	})

	test("a new unique name does not warn and saves", async () => {
		const w = await mountShown()
		expect(await typeName(w, "Renamed")).toEqual({ warns: false, disabled: false })
		pressEnterOnInput()
		await flushPromises()
		expect(updateAccountMock).toHaveBeenCalledWith("0xa1", "Renamed")
	})
})
