import { flushPromises, type mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from "vitest"
import { createApp, h, nextTick, ref } from "vue"
import { usePopupEntity } from "@/composables/usePopupEntity"
import { pressOn } from "./press-key"

type Wrapper = ReturnType<typeof mount>

/**
 * The keyboard contract of a popup that sends or signs: no document-level Enter sends, so a key on
 * the header's ×, the fee card, a teleported menu item, a popup layered over this one or nothing
 * focused does only its own thing; the focused submit button is the one keyboard path, and a
 * repeat or composing Enter that first lands on it idle sends nothing. Registers two `describe`
 * blocks in the calling file.
 */
export type SendPopupKeyboard = {
	/** The component's name, which opens each describe title. */
	popup: string
	/** Title words: the submit button's label, what a press does, and how the popup words its ready, unset and in-flight states. */
	words: { button: string; verb: string; ready: string; unset: string; inFlight: string }
	/** Mounts the popup shown, its fee unset. Its header renders the × as `popup-close-btn`. */
	open: () => Promise<Wrapper>
	/** Sets every fee the popup asks for, so a press would send. */
	setFee: (w: Wrapper) => Promise<void>
	/** Selectors for the submit button and for a control inside the fee card. */
	submit: string
	feeControl: string
	/** The fee control's click handler. */
	feeControlClick: Mock
	/** The service call a send makes. */
	send: Mock
}

export function describeSendPopupKeyboard(c: SendPopupKeyboard): void {
	const { button, verb, ready, unset, inFlight } = c.words
	const submit = (w: Wrapper) => w.get(c.submit).element as HTMLElement
	const openReady = async () => {
		const w = await c.open()
		await c.setFee(w)
		return w
	}
	/** Holds the next send in flight; returns its release. */
	const holdSend = () => {
		let release: (v?: unknown) => void = () => {}
		c.send.mockReturnValueOnce(new Promise((r) => (release = r)))
		return () => release()
	}

	describe(`${c.popup} — Enter elsewhere ${verb} nothing, though ${ready}`, () => {
		const nestedSubmit = vi.fn()
		const cleanups: Array<() => void> = []
		beforeEach(() => nestedSubmit.mockReset())
		afterEach(() => {
			for (const cleanup of cleanups.splice(0)) cleanup()
		})

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

		test("Enter on the header's close button closes the popup once", async () => {
			const w = await openReady()
			pressOn(w.get('[data-testid="popup-close-btn"]').element as HTMLElement, "Enter")
			await flushPromises()
			expect(w.emitted("onClose")).toHaveLength(1)
			expect(c.send).not.toHaveBeenCalled()
		})

		test("Enter on a control inside the fee card runs that control", async () => {
			const w = await openReady()
			c.feeControlClick.mockClear()
			pressOn(w.get(c.feeControl).element as HTMLElement, "Enter")
			await flushPromises()
			expect(c.feeControlClick).toHaveBeenCalledTimes(1)
			expect(c.send).not.toHaveBeenCalled()
		})

		test("Enter on an element outside the popup, as a teleported menu item, runs that element", async () => {
			await openReady()
			const item = document.createElement("div")
			item.setAttribute("data-dropdown-item", "")
			item.tabIndex = 0
			const itemClick = vi.fn()
			item.addEventListener("click", itemClick)
			document.body.appendChild(item)
			pressOn(item, "Enter")
			await flushPromises()
			expect(itemClick).toHaveBeenCalledTimes(1)
			expect(c.send).not.toHaveBeenCalled()
		})

		test("Enter with nothing focused", async () => {
			await openReady()
			expect(document.activeElement).toBe(document.body)
			document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
			await flushPromises()
			expect(c.send).not.toHaveBeenCalled()
		})

		test("Enter in the field of a form popup shown over this one submits that popup once", async () => {
			await openReady()
			pressOn(await showNestedFormPopup(), "Enter")
			await flushPromises()
			expect(nestedSubmit).toHaveBeenCalledTimes(1)
			expect(c.send).not.toHaveBeenCalled()
		})

		test(`repeat-only Enter keydowns that first land on the idle, focused ${button} button`, async () => {
			const w = await openReady()
			for (let i = 0; i < 3; i++) pressOn(submit(w), "Enter", { repeat: true })
			await flushPromises()
			expect(c.send).not.toHaveBeenCalled()
		})

		test.each([
			["isComposing", { isComposing: true }],
			["keyCode 229 with isComposing false", { keyCode: 229, isComposing: false }],
		] as const)(`a composing Enter (%s) on the idle, focused ${button} button`, async (_name, init) => {
			const w = await openReady()
			pressOn(submit(w), "Enter", init)
			await flushPromises()
			expect(c.send).not.toHaveBeenCalled()
		})
	})

	describe(`${c.popup} — the ${button} button`, () => {
		test.each(["Enter", " "] as const)(`%j on the focused ${button} button ${verb} once`, async (key) => {
			const w = await openReady()
			expect(pressOn(submit(w), key)).not.toContain(false)
			await flushPromises()
			expect(c.send).toHaveBeenCalledTimes(1)
		})

		test(`a held Enter on the focused ${button} button ${verb} once`, async () => {
			const release = holdSend()
			const w = await openReady()
			pressOn(submit(w), "Enter")
			await flushPromises()
			for (let i = 0; i < 3; i++) pressOn(submit(w), "Enter", { repeat: true })
			await flushPromises()
			expect(c.send).toHaveBeenCalledTimes(1)
			release()
		})

		test(`a press before ${unset} ${verb} nothing`, async () => {
			const w = await c.open()
			pressOn(submit(w), "Enter")
			await flushPromises()
			expect(c.send).not.toHaveBeenCalled()
			expect(w.find(c.submit).attributes("disabled")).toBeDefined()
		})

		test(`(REGRESSION-PIN) a second press while ${inFlight} is in flight ${verb} nothing`, async () => {
			const release = holdSend()
			const w = await openReady()
			pressOn(submit(w), "Enter")
			await flushPromises()
			expect(c.send).toHaveBeenCalledTimes(1)
			pressOn(submit(w), "Enter")
			pressOn(submit(w), " ")
			await flushPromises()
			expect(c.send).toHaveBeenCalledTimes(1)
			// A button stub that forwards only `disabled` makes this prove the template's :disabled includes the in-flight state.
			expect(w.find(c.submit).attributes("disabled")).toBeDefined()
			release()
		})

		test(`a click on the ${button} button ${verb} once`, async () => {
			const w = await openReady()
			await w.find(c.submit).trigger("click")
			await flushPromises()
			expect(c.send).toHaveBeenCalledTimes(1)
		})
	})
}
