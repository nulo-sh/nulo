/**
 * Pins-first harness for EditFpcPopup (written BEFORE its migration onto
 * usePopupEntity; every pin must hold unchanged across it). Load-bearing pins:
 * the initialization window (listener installs after the population awaits
 * today — `submitWaitsForShow` must reproduce it) and the missing-row close.
 *
 * Cleanup is a guaranteed afterEach (tracked wrappers, hide-then-unmount) so
 * it is correct both pre- and post-migration.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { deferred } from "@nulo/wallet-core/utils"
import { holdReads, liveBus } from "../../../../tests/helpers/held-read"

const fpcServiceMock = {
	getFpc: vi.fn(),
	getFpcs: vi.fn(),
	updateFpc: vi.fn(),
	updateFpcAddress: vi.fn(),
	disconnect: vi.fn(),
	onFpcAdded: liveBus(),
	onFpcUpdated: liveBus(),
	onFpcDeleted: liveBus(),
}
/** A component never removes its handlers, so each test gets buses no earlier mount registered on. */
const freshBuses = () => Object.assign(fpcServiceMock, { onFpcAdded: liveBus(), onFpcUpdated: liveBus(), onFpcDeleted: liveBus() })
const openToastMock = vi.fn()

const FPC = { id: "fpc-1", name: "Sponsor", address: `0x${"c".repeat(64)}`, isProtocol: false, type: "default_sponsored" }

// Vitest requires `function` expressions (not arrows) for mocks used with `new`.
vi.mock("@/wallet/services/fpc/client", () => ({
	FpcServiceClient: vi.fn(function () {
		return fpcServiceMock
	}),
	FpcType: { DefaultSponsoredFpc: "default_sponsored", PrivateFpc: "private" },
}))
vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: openToastMock }),
}))
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({ network: { id: "net-1", chainId: 1 } }),
}))
vi.mock("@/stores/cache.store", () => ({
	useCacheStore: () => ({ fpcToEditIdx: "fpc-1" }),
}))
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({ len: 1, popups: { edit_fpc: { order: 1 } } }),
}))

const STUBS = {
	FormPopup: {
		props: ["show", "submitLabel", "submitDisabled", "submitLoading", "displaceIdx", "submitTestId", "title"],
		emits: ["onClose", "submit"],
		template: `<div :data-submit-disabled="String(submitDisabled)"><slot /><slot name="aboveSubmit" /><button data-testid="form-submit" :disabled="submitDisabled" @click="$emit('submit')">go</button><slot name="belowSubmit" /></div>`,
	},
	Input: {
		props: ["modelValue", "label", "disabled"],
		emits: ["update:modelValue"],
		template: `<label><input :data-input-label="label" :value="modelValue" :disabled="disabled" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></label>`,
	},
	SettingItem: { props: ["title", "description", "icon", "size", "raw"], template: "<div />" },
	ItemsContainer: { template: "<div><slot /></div>" },
	Tooltip: { template: "<div><slot /><slot name='content' /></div>" },
	Icon: { props: ["name", "color"], template: `<i :data-name="name" :data-color="color" />` },
	Text: { template: "<span><slot /></span>" },
	Flex: { template: "<div><slot /></div>" },
	Transition: { template: "<div><slot /></div>" },
}

import EditFpcPopup from "./EditFpcPopup.vue"
import ProcessingErrorNote from "@/components/composite/ProcessingErrorNote.vue"

function pressEnterOnInput() {
	const el = document.createElement("input")
	document.body.appendChild(el)
	el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
}
function pressEnterOnBody() {
	document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
}

const wrappers: VueWrapper[] = []

async function mountShown(): Promise<VueWrapper> {
	const w = mount(EditFpcPopup, { props: { show: false }, global: { stubs: STUBS, components: { ProcessingErrorNote } } })
	wrappers.push(w)
	await w.setProps({ show: true })
	await flushPromises()
	return w
}

async function typeName(w: VueWrapper, name: string) {
	const input = w.findAll("input").find((i) => i.attributes("data-input-label") === "Name")
	if (!input) throw new Error("Name input not rendered")
	await input.setValue(name)
	await flushPromises()
}

beforeEach(() => {
	freshBuses()
	fpcServiceMock.getFpc.mockResolvedValue({ ...FPC })
	fpcServiceMock.getFpcs.mockResolvedValue([{ ...FPC }])
	fpcServiceMock.updateFpc.mockResolvedValue(undefined)
	fpcServiceMock.updateFpcAddress.mockResolvedValue(undefined)
})

// Guaranteed cleanup — runs even when an assertion throws mid-test. Plain
// unmount suffices: the composable's scope cleanup removes the listener
// (onHide side effects are deliberately NOT run here — tests that need them
// hide explicitly).
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	vi.clearAllMocks()
	document.body.innerHTML = ""
})

describe("EditFpcPopup — Enter wiring + initialization window", () => {
	test("show populates the row and prefills the name field", async () => {
		const w = await mountShown()
		expect(fpcServiceMock.getFpc).toHaveBeenCalledWith("fpc-1")
		const input = w.findAll("input").find((i) => i.attributes("data-input-label") === "Name")
		expect((input?.element as HTMLInputElement | undefined)?.value).toBe("Sponsor")
	})

	test("a MISSING row closes the popup instead of rendering a dead form", async () => {
		fpcServiceMock.getFpc.mockResolvedValueOnce(null)
		const w = await mountShown()
		expect(w.emitted("onClose")).toBeTruthy()
	})

	test("Enter while an input is focused submits a name change (updateFpc called)", async () => {
		const w = await mountShown()
		await typeName(w, "Renamed")
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpc).toHaveBeenCalledWith("fpc-1", "Renamed")
		expect(w.emitted("onClose")).toBeTruthy()
	})

	test("a global Enter (body focused) does NOT submit", async () => {
		const w = await mountShown()
		await typeName(w, "Renamed")
		pressEnterOnBody()
		await flushPromises()
		expect(fpcServiceMock.updateFpc).not.toHaveBeenCalled()
	})

	test("(INIT-WINDOW PIN) Enter during the pending population is INERT", async () => {
		fpcServiceMock.getFpc.mockImplementationOnce(() => new Promise(() => {}))
		const w = await mountShown() // population hangs at getFpc
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpc).not.toHaveBeenCalled()
		expect(fpcServiceMock.updateFpcAddress).not.toHaveBeenCalled()
	})

	test("(RE-ENTRANCY PIN) repeated Enter during an in-flight update fires updateFpc ONCE", async () => {
		fpcServiceMock.updateFpc.mockImplementationOnce(() => new Promise(() => {}))
		const w = await mountShown()
		await typeName(w, "Renamed")
		pressEnterOnInput()
		await flushPromises()
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpc).toHaveBeenCalledTimes(1)
	})

	test("after hide, Enter is inert and the client disconnected", async () => {
		const w = await mountShown()
		await typeName(w, "Renamed")
		await w.setProps({ show: false })
		expect(fpcServiceMock.disconnect).toHaveBeenCalledTimes(1)
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpc).not.toHaveBeenCalled()
	})
})

describe("EditFpcPopup — the processing error note", () => {
	test("a failed update renders the shared note with the error message and keeps the popup open", async () => {
		fpcServiceMock.updateFpc.mockRejectedValueOnce(new Error("boom"))
		const w = await mountShown()
		await typeName(w, "Renamed")
		pressEnterOnInput()
		await flushPromises()
		expect(w.text()).toContain("boom")
		expect(w.find("i[data-name='info']").attributes("data-color")).toBe("red")
		expect(w.emitted("onClose")).toBeFalsy()
	})
})

describe("EditFpcPopup — duplicate names", () => {
	async function nameState(w: VueWrapper, name: string) {
		await typeName(w, name)
		return {
			warns: w.text().includes("Already exist"),
			disabled: w.find('[data-testid="form-submit"]').attributes("disabled") !== undefined,
		}
	}

	test("another saved name with outer spaces added warns and keeps Save disabled; another case, a blank or an unnamed FPC does not", async () => {
		fpcServiceMock.getFpcs.mockResolvedValue([
			{ ...FPC },
			{ ...FPC, id: "fpc-2", name: "Alice", address: `0x${"d".repeat(64)}` },
			{ ...FPC, id: "fpc-3", name: undefined, address: `0x${"e".repeat(64)}` },
		])
		const w = await mountShown()
		expect(await nameState(w, "Alice ")).toEqual({ warns: true, disabled: true })
		expect(await nameState(w, " Alice")).toEqual({ warns: true, disabled: true })
		expect(await nameState(w, "alice")).toEqual({ warns: false, disabled: false })
		expect((await nameState(w, " ")).warns).toBe(false)
		expect(await nameState(w, "Bob ")).toEqual({ warns: false, disabled: false })
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpc).toHaveBeenCalledWith("fpc-1", "Bob ")
	})
})

describe("EditFpcPopup — duplicate addresses", () => {
	// Both under the field modulus: an address above it never matches any row.
	const OTHER = `0x2a${"cf".repeat(31)}`
	const FRESH = `0x1b${"0d".repeat(31)}`

	async function addressState(w: VueWrapper, address: string) {
		const input = w.find('input[data-input-label="Address"]')
		await input.setValue(address)
		await flushPromises()
		return {
			warns: input.element.parentElement?.textContent?.includes("Already added"),
			disabled: w.find('[data-testid="form-submit"]').attributes("disabled") !== undefined,
		}
	}

	beforeEach(() => {
		fpcServiceMock.getFpcs.mockResolvedValue([{ ...FPC }, { ...FPC, id: "fpc-2", name: "Other", address: OTHER }])
	})

	test("another row's address pasted in upper case warns beside the address, keeps Save disabled, and Enter updates nothing", async () => {
		const w = await mountShown()
		expect(
			await addressState(
				w,
				OTHER.replace(/[a-f]/g, (c) => c.toUpperCase()),
			),
		).toEqual({ warns: true, disabled: true })
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpcAddress).not.toHaveBeenCalled()
	})

	test("an address no other row holds saves on Enter", async () => {
		const w = await mountShown()
		expect(await addressState(w, FRESH)).toEqual({ warns: false, disabled: false })
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpcAddress).toHaveBeenCalledWith("fpc-1", FRESH)
	})

	test("a rename from another window during an address save stays: the save renames nothing", async () => {
		const saved = deferred<undefined>()
		fpcServiceMock.updateFpcAddress.mockReturnValueOnce(saved.promise)
		const w = await mountShown()
		await addressState(w, FRESH)
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpcAddress).toHaveBeenCalledWith("fpc-1", FRESH)

		fpcServiceMock.onFpcUpdated.invoke({ ...FPC, name: "Renamed" })
		saved.resolve(undefined)
		await flushPromises()

		expect(fpcServiceMock.updateFpc).not.toHaveBeenCalled()
	})

	test("a new name and a new address the person typed both save, the address first", async () => {
		const w = await mountShown()
		await typeName(w, "Mine")
		await addressState(w, FRESH)
		pressEnterOnInput()
		await flushPromises()

		expect(fpcServiceMock.updateFpcAddress).toHaveBeenCalledWith("fpc-1", FRESH)
		expect(fpcServiceMock.updateFpc).toHaveBeenCalledWith("fpc-1", "Mine")
		expect(fpcServiceMock.updateFpcAddress.mock.invocationCallOrder[0]).toBeLessThan(
			fpcServiceMock.updateFpc.mock.invocationCallOrder[0] ?? 0,
		)
	})

	test("a rename beside an untouched address another row also holds saves", async () => {
		fpcServiceMock.getFpc.mockResolvedValue({ ...FPC, address: OTHER })
		fpcServiceMock.getFpcs.mockResolvedValue([
			{ ...FPC, address: OTHER },
			{ ...FPC, id: "fpc-2", name: "Other", address: OTHER },
		])
		const w = await mountShown()
		await typeName(w, "Renamed")
		expect(w.text()).not.toContain("Already added")
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpc).toHaveBeenCalledWith("fpc-1", "Renamed")
		expect(fpcServiceMock.updateFpcAddress).not.toHaveBeenCalled()
	})

	test("the row's own address re-cased is no change: no warning, Save disabled, Enter updates nothing; a rename beside it saves the name alone", async () => {
		fpcServiceMock.getFpc.mockResolvedValue({ ...FPC, address: OTHER })
		fpcServiceMock.getFpcs.mockResolvedValue([{ ...FPC, address: OTHER }])
		const w = await mountShown()
		expect(await addressState(w, OTHER.toUpperCase().replace("0X", "0x"))).toEqual({ warns: false, disabled: true })
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpcAddress).not.toHaveBeenCalled()
		expect(fpcServiceMock.updateFpc).not.toHaveBeenCalled()

		await typeName(w, "Renamed")
		pressEnterOnInput()
		await flushPromises()
		expect(fpcServiceMock.updateFpc).toHaveBeenCalledWith("fpc-1", "Renamed")
		expect(fpcServiceMock.updateFpcAddress).not.toHaveBeenCalled()
	})
})

describe("EditFpcPopup — the list under a held read", () => {
	test("(BUG PIN) an FPC added while the read is out is dropped, so its name does not warn; one added after it does", async () => {
		// Today's behaviour, kept until the owner decides: getFpcs answers after work that follows its
		// storage read, so an FPC added during that work is missing until the popup reopens.
		const reads = holdReads<unknown[]>(fpcServiceMock.getFpcs)
		const w = mount(EditFpcPopup, { props: { show: false }, global: { stubs: STUBS, components: { ProcessingErrorNote } } })
		wrappers.push(w)
		await w.setProps({ show: true })
		await flushPromises()
		const alice = { ...FPC, id: "fpc-2", name: "Alice", address: `0x${"d".repeat(64)}` }
		const warns = async () => {
			await typeName(w, "Alice")
			return w.text().includes("Already exist")
		}

		fpcServiceMock.onFpcAdded.invoke(alice)
		expect(reads).toHaveLength(1)
		reads[0]?.resolve([{ ...FPC }])
		await flushPromises()
		expect(await warns()).toBe(false)

		fpcServiceMock.onFpcAdded.invoke(alice)
		expect(await warns()).toBe(true)
	})
})
