/**
 * The notice on the real focus-trap: it takes the keyboard while it shows, Escape and a tap outside
 * answer as Cancel and never as the confirm, and a cleared notice leaves nothing behind. jsdom
 * reports no client rects and moves no focus on Tab, so the harness supplies both, as
 * `Popup.snackbar.test.ts` does.
 */
import { Flex, Text } from "@nulo/design"
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { nextTick } from "vue"
import { type NotificationPayload, useNotificationStore } from "@/stores/notification.store"
import { usePopupStore } from "@/stores/popup.store"
import Popup from "./Popup/Popup.vue"
import NotificationManager from "./NotificationManager.vue"

vi.mock("@/utils/core", () => ({ managers: { profile: { refreshSession: vi.fn() } } }))

enableAutoUnmount(afterEach)

const byTestId = (testid: string) => document.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
const activeTestId = () => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? "none"
const shown = () => byTestId("notification") !== null
const realGetClientRects = Element.prototype.getClientRects

/** focus-trap activates after a tick and returns focus on a timer. */
const settle = async () => {
	await nextTick()
	await flushPromises()
	await new Promise((resolve) => setTimeout(resolve, 0))
	await flushPromises()
}

/** The browser's default Tab: the next (or previous) tabbable in DOM order, wrapping at the ends. */
function nativeTab(from: Element, backward: boolean) {
	const all = [...document.querySelectorAll<HTMLElement>("button, a[href], input, [tabindex]")].filter(
		(el) => el.tabIndex >= 0 && !el.matches(":disabled"),
	)
	const at = all.indexOf(from as HTMLElement)
	all[(at + (backward ? -1 : 1) + all.length) % all.length]?.focus()
}

async function pressTab(backward = false): Promise<string> {
	const from = document.activeElement ?? document.body
	const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: backward, bubbles: true, cancelable: true })
	from.dispatchEvent(event)
	if (!event.defaultPrevented) nativeTab(from, backward)
	await settle()
	return activeTestId()
}

async function pressEscape() {
	const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
	;(document.activeElement ?? document.body).dispatchEvent(event)
	await settle()
	return event
}

const BUTTON = { inheritAttrs: true, template: "<button type='button'><slot /></button>" }

/** A page with one control behind the notice, focused when the notice opens, as a create button is. */
async function openNotice(payload: Partial<NotificationPayload>) {
	mount(
		{ components: { NotificationManager }, template: '<div><button data-testid="behind">behind</button><NotificationManager /></div>' },
		{ attachTo: document.body, global: { components: { Flex, Text, Popup, Button: BUTTON }, stubs: { Icon: true } } },
	)
	byTestId("behind")?.focus()
	useNotificationStore().create({ type: "warning", payload: { title: "Profile creation failed", description: "Try again.", ...payload } })
	await settle()
}

describe("the notice", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		document.body.innerHTML = '<div id="popup"></div>'
		Element.prototype.getClientRects = function (this: Element) {
			return (this.isConnected ? [{}] : []) as unknown as DOMRectList
		}
	})
	afterEach(() => {
		Element.prototype.getClientRects = realGetClientRects
		document.body.innerHTML = ""
	})

	test("opens on Cancel and keeps Tab on its own controls, so no key reaches the page behind", async () => {
		await openNotice({ onConfirm: vi.fn(), onCancel: vi.fn() })
		expect(activeTestId()).toBe("notification-cancel")
		expect([await pressTab(), await pressTab(), await pressTab(true), await pressTab(true)]).toEqual([
			"notification-confirm",
			"notification-cancel",
			"notification-confirm",
			"notification-cancel",
		])
	})

	test("an OK-only notice opens on its OK, and Tab stays there", async () => {
		await openNotice({ onConfirm: vi.fn() })
		expect(activeTestId()).toBe("notification-confirm")
		expect([await pressTab(), await pressTab(true)]).toEqual(["notification-confirm", "notification-confirm"])
	})

	test("Escape closes an OK notice without its confirm and hands the focus back", async () => {
		const onConfirm = vi.fn()
		await openNotice({ onConfirm })
		const keydown = await pressEscape()
		expect(keydown.defaultPrevented).toBe(true)
		expect(shown()).toBe(false)
		expect(onConfirm).not.toHaveBeenCalled()
		expect(activeTestId()).toBe("behind")
	})

	test.each([
		["Escape", pressEscape],
		["a tap outside", async () => byTestId("notification")?.parentElement?.dispatchEvent(new MouseEvent("click", { bubbles: true }))],
	])("%s answers as Cancel, never as the confirm", async (_how, close) => {
		const onConfirm = vi.fn()
		const onCancel = vi.fn()
		await openNotice({ onConfirm, onCancel })
		await close()
		await settle()
		expect(onCancel).toHaveBeenCalledOnce()
		expect(onConfirm).not.toHaveBeenCalled()
		expect(shown()).toBe(false)
	})

	test("control: OK answers as the confirm", async () => {
		const onConfirm = vi.fn()
		await openNotice({ onConfirm })
		byTestId("notification-confirm")?.click()
		await settle()
		expect(onConfirm).toHaveBeenCalledOnce()
		expect(shown()).toBe(false)
	})

	test("sits above the popups open when it shows, and keeps that place when another opens over it", async () => {
		usePopupStore().open("confirm")
		await openNotice({ onConfirm: vi.fn() })
		const place = () => byTestId("notification")?.parentElement?.parentElement?.style.zIndex
		expect(place()).toBe("1000")
		usePopupStore().open("edit_profile")
		await settle()
		expect(place()).toBe("1000")
	})

	test("clear closes the shown notice and drops every queued one", async () => {
		await openNotice({ onConfirm: vi.fn() })
		const notices = useNotificationStore()
		notices.create({ type: "warning", payload: { title: "Second", description: "Queued.", onConfirm: vi.fn() } })
		notices.clear()
		await settle()
		expect(shown()).toBe(false)
		notices.create({ type: "warning", payload: { title: "Third", description: "Raised after.", onConfirm: vi.fn() } })
		await settle()
		expect(byTestId("notification")?.textContent).toContain("Third")
		byTestId("notification-confirm")?.click()
		await settle()
		expect(shown()).toBe(false)
	})
})
