import { Flex, RowAction, Text } from "@nulo/design"
import { createTestingPinia } from "@pinia/testing"
import { mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import ItemsContainer from "@/components/ui/Settings/ItemsContainer.vue"
import SettingItem from "@/components/ui/Settings/SettingItem.vue"
import { usePopupStore } from "@/stores/popup.store"
import type { RouteView } from "@/utils/endpoint-status"
import EndpointOrderList from "./EndpointOrderList.vue"

/** As stored and as the wire carries them: 8-hex ids, the router's state names, epoch ms. */
const A = { id: "3f9a0c1e", rpcUrl: "http://127.0.0.1:41001" }
const B = { id: "b07c55d2", rpcUrl: "http://127.0.0.1:41002", label: "backup" }
const C = { id: "e4d1a9f0", rpcUrl: "http://127.0.0.1:41003" }
const D = { id: "09c2f7aa", rpcUrl: "http://127.0.0.1:41004" }
const READ_AT = 1_762_480_000_000
const ROW_HEIGHT = 56

type Entry = NonNullable<RouteView["snapshot"]>["endpoints"][number]
const view = (activeId: string | null, endpoints: Entry[]): RouteView => ({ snapshot: { activeId, endpoints }, readAt: READ_AT })

const mounted: VueWrapper[] = []
function mountList(props: Record<string, unknown> = {}) {
	const wrapper = mount(EndpointOrderList, {
		attachTo: document.body,
		props: { endpoints: [A, B, C], view: null, ...props },
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			components: { Flex, Text, RowAction, SettingItem, ItemsContainer },
			stubs: { Icon: { template: "<i />" }, Tooltip: { template: "<span><slot /></span>" } },
		},
	})
	mounted.push(wrapper)
	return wrapper
}

const rows = (w: VueWrapper) => w.findAll('[data-testid="endpoint-row"]')
const tones = (w: VueWrapper) => w.findAll('[data-testid="endpoint-status-dot"]').map((d) => d.attributes("data-tone"))
const numbers = (w: VueWrapper) => w.findAll('[data-testid="endpoint-position"]').map((n) => n.text())
const handle = (w: VueWrapper, i: number) => w.findAll('[data-testid="endpoint-drag-handle"]')[i]!
const said = (w: VueWrapper) => w.get('[data-testid="endpoint-order-announcement"]').text()
const reorders = (w: VueWrapper) => (w.emitted("reorder") ?? []).map(([ids]) => ids)

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: ROW_HEIGHT } as DOMRect)
})
afterEach(() => {
	for (const w of mounted.splice(0)) w.unmount()
	vi.restoreAllMocks()
})

describe("EndpointOrderList — the dots", () => {
	test("each state the router names reads as its tone; one it has not asked, or no read yet, is grey", () => {
		const w = mountList({
			endpoints: [A, B, C, D],
			view: view(A.id, [
				{ id: A.id, state: "ready", since: READ_AT - 5_000 },
				{ id: B.id, state: "down", since: READ_AT - 60_000, failure: "unreachable" },
				{ id: C.id, state: "behind", since: READ_AT - 1_000 },
				{ id: D.id, state: "wrong-chain", since: READ_AT - 1_000 },
			]),
		})
		expect(tones(w)).toEqual(["green", "red", "amber", "amber"])
		expect(rows(w).map((r) => r.attributes("data-endpoint-tone"))).toEqual(["green", "red", "amber", "amber"])

		const unasked = mountList({
			view: view(A.id, [
				{ id: A.id, state: "ready", since: READ_AT },
				{ id: B.id, state: "unknown", since: READ_AT },
			]),
		})
		expect(tones(unasked)).toEqual(["green", "gray", "gray"])
		expect(tones(mountList({ view: null }))).toEqual(["gray", "gray", "gray"])
		expect(tones(mountList({ view: { snapshot: null, readAt: READ_AT } }))).toEqual(["gray", "gray", "gray"])
	})

	test("a down endpoint is red even while it holds the role, as a lone one does", () => {
		const w = mountList({ endpoints: [A], view: view(A.id, [{ id: A.id, state: "down", since: READ_AT - 1_000, failure: "timeout" }]) })
		expect(tones(w)).toEqual(["red"])
	})
})

describe("EndpointOrderList — the rows at rest", () => {
	test("numbered in the order shown, each with its handle, the first with no delete", () => {
		const w = mountList()
		expect(numbers(w)).toEqual(["1", "2", "3"])
		expect(rows(w).map((r) => r.attributes("data-endpoint-id"))).toEqual([A.id, B.id, C.id])
		expect(w.findAll('[data-testid="endpoint-drag-handle"]').map((h) => h.attributes("aria-label"))).toEqual([
			`Move ${A.rpcUrl}, position 1 of 3`,
			"Move backup, position 2 of 3",
			`Move ${C.rpcUrl}, position 3 of 3`,
		])
		expect(w.findAll('[data-testid="endpoint-edit-btn"]')).toHaveLength(3)
		expect(w.findAll('[data-testid="endpoint-delete-btn"]')).toHaveLength(2)
		expect(rows(w)[0]!.find('[data-testid="endpoint-delete-btn"]').exists()).toBe(false)
	})

	test("no control takes a positive tabindex, and every handle is a named button described by its keys", () => {
		const w = mountList()
		for (const el of w.findAll("[tabindex]")) expect(Number(el.attributes("tabindex"))).toBeLessThanOrEqual(0)
		const hint = handle(w, 0).attributes("aria-describedby") as string
		expect(handle(w, 0).element.tagName).toBe("BUTTON")
		expect(document.getElementById(hint)?.textContent).toBe(
			"Space or Enter lifts the endpoint and drops it, the arrow keys move it, Escape puts it back.",
		)
	})

	test("a one-row list and a held reset show no handle; a held one is inert, with no edit or delete", async () => {
		expect(
			mountList({ endpoints: [A] })
				.find('[data-testid="endpoint-drag-handle"]')
				.exists(),
		).toBe(false)
		const held = mountList({ held: true })
		expect(held.find('[data-testid="endpoint-drag-handle"]').exists()).toBe(false)
		expect(held.find('[data-testid="endpoint-edit-btn"]').exists()).toBe(false)
		expect(held.find("[data-row-target]").exists()).toBe(false)
		await rows(held)[1]!.trigger("click")
		expect(reorders(held)).toEqual([])
	})

	test("a tap moves the row first, the others as shown; a tap on the first writes nothing", async () => {
		const w = mountList()
		await rows(w)[0]!.trigger("click")
		await rows(w)[2]!.trigger("click")
		expect(reorders(w)).toEqual([[C.id, A.id, B.id]])
	})

	test("while a move is written, neither the first shown nor the stored primary has a delete", async () => {
		const w = mountList({ endpoints: [C, A, B], primaryId: A.id })
		expect(rows(w).map((r) => r.find('[data-testid="endpoint-delete-btn"]').exists())).toEqual([false, false, true])
	})

	test("edit and delete reach the page, never the row's tap", async () => {
		const w = mountList()
		await rows(w)[1]!.get('[data-testid="endpoint-edit-btn"]').trigger("click")
		await rows(w)[1]!.get('[data-testid="endpoint-delete-btn"]').trigger("click")
		expect(w.emitted("edit")).toEqual([[B]])
		expect(w.emitted("remove")).toEqual([[B]])
		expect(reorders(w)).toEqual([])
	})

	test("the moved-first line shows on its row only, in the danger colour, under the label's URL", () => {
		const w = mountList({
			endpoints: [B, A, C],
			warning: { id: B.id, text: "This endpoint was not answering. The wallet will try another if needed." },
		})
		const line = rows(w)[0]!.get('[data-testid="endpoint-moved-warning"]')
		expect(line.text()).toBe("This endpoint was not answering. The wallet will try another if needed.")
		expect(line.classes()).toContain("color--txt-danger")
		expect(rows(w)[0]!.get('[data-testid="setting-description"]').text()).toContain(B.rpcUrl)
		expect(w.findAll('[data-testid="endpoint-moved-warning"]')).toHaveLength(1)
	})
})

describe("EndpointOrderList — the pointer drag", () => {
	/** `trigger` cannot set a PointerEvent's read-only `pointerId`; the handle's own listener is the
	 *  first on the event's path, so a direct dispatch reaches it. */
	const pointer = async (w: VueWrapper, i: number, type: string, init: PointerEventInit) => {
		handle(w, i).element.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...init }))
		await w.vm.$nextTick()
	}
	const press = (w: VueWrapper, i: number, clientY: number) => pointer(w, i, "pointerdown", { button: 0, clientY, pointerId: 7 })
	const move = (w: VueWrapper, i: number, clientY: number) => pointer(w, i, "pointermove", { clientY, pointerId: 7 })

	test("while a row is lifted every number shows the place a drop would give it; the drop writes once", async () => {
		const w = mountList()
		await press(w, 2, 300)
		expect(rows(w)[2]!.classes().join(" ")).toMatch(/lifted/)
		await move(w, 2, 300 - ROW_HEIGHT)
		expect(numbers(w)).toEqual(["1", "3", "2"])
		await move(w, 2, 300 - 2 * ROW_HEIGHT)
		expect(numbers(w)).toEqual(["2", "3", "1"])
		await pointer(w, 2, "pointerup", { pointerId: 7 })
		await pointer(w, 2, "lostpointercapture", { pointerId: 7 })
		expect(reorders(w)).toEqual([[C.id, A.id, B.id]])
		expect(said(w)).toBe(`${C.rpcUrl} dropped, position 1 of 3.`)
	})

	test("a drag past either end stops at it; a drop where it started writes nothing", async () => {
		const w = mountList()
		await press(w, 0, 100)
		await move(w, 0, 100 + 10 * ROW_HEIGHT)
		expect(numbers(w)).toEqual(["3", "1", "2"])
		await move(w, 0, 100)
		await pointer(w, 0, "pointerup", { pointerId: 7 })
		expect(reorders(w)).toEqual([])
		expect(said(w)).toBe("Order unchanged.")
	})

	test("a cancelled pointer or a lost capture puts the row back, and the release that follows writes nothing", async () => {
		for (const lost of ["pointercancel", "lostpointercapture"]) {
			const w = mountList()
			await press(w, 2, 300)
			await move(w, 2, 300 - 2 * ROW_HEIGHT)
			await pointer(w, 2, lost, { pointerId: 7 })
			expect(numbers(w)).toEqual(["1", "2", "3"])
			await pointer(w, 2, "pointerup", { pointerId: 7 })
			expect(reorders(w)).toEqual([])
		}
	})

	test("another pointer, a secondary button and a held list lift nothing", async () => {
		const w = mountList()
		await pointer(w, 1, "pointerdown", { button: 2, clientY: 200, pointerId: 7 })
		expect(rows(w)[1]!.classes().join(" ")).not.toMatch(/lifted/)
		await press(w, 1, 200)
		await pointer(w, 1, "pointermove", { clientY: 0, pointerId: 8 })
		await pointer(w, 1, "pointerup", { pointerId: 8 })
		expect(numbers(w)).toEqual(["1", "2", "3"])
		expect(reorders(w)).toEqual([])
	})

	test("the list changing under a lift cancels it", async () => {
		const w = mountList()
		await press(w, 2, 300)
		await move(w, 2, 300 - 2 * ROW_HEIGHT)
		await w.setProps({ endpoints: [A, B, C, D] })
		expect(numbers(w)).toEqual(["1", "2", "3", "4"])
		await pointer(w, 2, "pointerup", { pointerId: 7 })
		expect(reorders(w)).toEqual([])
	})

	test("the pointer is captured at the lift, and focus stays where it was", async () => {
		const capture = vi.fn()
		HTMLElement.prototype.setPointerCapture = capture
		try {
			const w = mountList()
			await press(w, 1, 200)
			expect(capture).toHaveBeenCalledWith(7)
			expect(document.activeElement).toBe(document.body)
		} finally {
			delete (HTMLElement.prototype as { setPointerCapture?: unknown }).setPointerCapture
		}
	})

	test("an Escape during a pointer drag puts the row back and is marked handled; the release and its click write nothing", async () => {
		const w = mountList()
		await press(w, 2, 300)
		await move(w, 2, 300 - 2 * ROW_HEIGHT)
		const pressed = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
		document.body.dispatchEvent(pressed)
		await w.vm.$nextTick()
		expect(pressed.defaultPrevented).toBe(true)
		expect(numbers(w)).toEqual(["1", "2", "3"])
		const after = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
		document.body.dispatchEvent(after)
		expect(after.defaultPrevented, "an Escape with nothing lifted is left to the page").toBe(false)
		await pointer(w, 2, "pointerup", { pointerId: 7 })
		rows(w)[2]!.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
		expect(reorders(w)).toEqual([])
	})

	test("a sheet opening over a pointer drag ends it, and leaves the Escape to the sheet", async () => {
		const w = mountList()
		await press(w, 2, 300)
		await move(w, 2, 300 - 2 * ROW_HEIGHT)
		usePopupStore().popups = { edit_endpoint: { order: 0 } } as never
		await w.vm.$nextTick()
		expect(numbers(w)).toEqual(["1", "2", "3"])
		const pressed = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
		document.body.dispatchEvent(pressed)
		expect(pressed.defaultPrevented).toBe(false)
		await pointer(w, 2, "pointerup", { pointerId: 7 })
		expect(reorders(w)).toEqual([])
	})

	test("a click on a handle never taps its row; a drop's click writes only the drop", async () => {
		const w = mountList()
		await press(w, 2, 300)
		await pointer(w, 2, "pointerup", { pointerId: 7 })
		handle(w, 2).element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
		expect(reorders(w)).toEqual([])
		await press(w, 0, 100)
		await move(w, 0, 100 + ROW_HEIGHT)
		await pointer(w, 0, "pointerup", { pointerId: 7 })
		handle(w, 0).element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
		expect(reorders(w)).toEqual([[B.id, A.id, C.id]])
	})

	test("a press elsewhere ends a handle press's claim: the next click on a row taps it", async () => {
		const w = mountList()
		await press(w, 1, 200)
		await pointer(w, 1, "pointerup", { pointerId: 7 })
		rows(w)[2]!.element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
		rows(w)[2]!.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
		expect(reorders(w)).toEqual([[C.id, A.id, B.id]])
	})

	test("rows of unequal height: the drop place follows the rows' middles, and the rows passed make room by the lifted one's height", async () => {
		const tall = { [A.id]: 120, [B.id]: 60, [C.id]: 60 } as Record<string, number>
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			return { height: tall[this.dataset.endpointId ?? ""] ?? 24 } as DOMRect
		})
		const w = mountList()
		await press(w, 2, 210)
		await move(w, 2, 210 - 90)
		expect(numbers(w), "past B's middle, short of A's").toEqual(["1", "3", "2"])
		expect(rows(w)[1]!.attributes("style")).toContain("translateY(60px)")
		await move(w, 2, 210 - 151)
		expect(numbers(w), "past A's middle").toEqual(["2", "3", "1"])
		expect(rows(w)[0]!.attributes("style")).toContain("translateY(60px)")
		await pointer(w, 2, "pointerup", { pointerId: 7 })
		expect(reorders(w)).toEqual([[C.id, A.id, B.id]])
	})
})

describe("EndpointOrderList — the keyboard", () => {
	const key = (w: VueWrapper, i: number, k: string, init: Record<string, unknown> = {}) =>
		handle(w, i).trigger("keydown", { key: k, ...init })

	test("Space lifts, the arrows move with each place spoken, Enter drops, one write for the whole move", async () => {
		const w = mountList()
		await key(w, 2, " ")
		expect(said(w)).toBe(`${C.rpcUrl} lifted, position 3 of 3.`)
		await key(w, 2, "ArrowUp")
		expect(said(w)).toBe(`${C.rpcUrl}, position 2 of 3.`)
		expect(handle(w, 2).attributes("aria-label")).toBe(`Move ${C.rpcUrl}, position 2 of 3`)
		await key(w, 2, "ArrowUp")
		await key(w, 2, "ArrowUp")
		expect(numbers(w)).toEqual(["2", "3", "1"])
		expect(reorders(w)).toEqual([])
		await key(w, 2, "Enter")
		expect(reorders(w)).toEqual([[C.id, A.id, B.id]])
	})

	test("a held key's repeat neither lifts nor drops", async () => {
		const w = mountList()
		await key(w, 1, "Enter", { repeat: true })
		expect(rows(w)[1]!.classes().join(" ")).not.toMatch(/lifted/)
		await key(w, 1, "Enter")
		await key(w, 1, "ArrowDown")
		await key(w, 1, "Enter", { repeat: true })
		expect(reorders(w)).toEqual([])
		await key(w, 1, " ")
		expect(reorders(w)).toEqual([[A.id, C.id, B.id]])
	})

	test("Escape puts the row back and is marked handled; one with nothing lifted is left to the page", async () => {
		const w = mountList()
		const idle = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
		handle(w, 1).element.dispatchEvent(idle)
		expect(idle.defaultPrevented).toBe(false)

		await key(w, 1, " ")
		await key(w, 1, "ArrowUp")
		const handled = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
		handle(w, 1).element.dispatchEvent(handled)
		await w.vm.$nextTick()
		expect(handled.defaultPrevented).toBe(true)
		expect(numbers(w)).toEqual(["1", "2", "3"])
		expect(said(w)).toBe("Order unchanged.")
		await key(w, 1, "Enter")
		expect(reorders(w)).toEqual([])
	})

	test("focus leaving a lifted handle puts the row back", async () => {
		const w = mountList()
		await key(w, 0, " ")
		await key(w, 0, "ArrowDown")
		await handle(w, 0).trigger("blur")
		expect(numbers(w)).toEqual(["1", "2", "3"])
		expect(reorders(w)).toEqual([])
	})

	test("a keyboard drop keeps focus on the moved row's handle once the list re-renders in its new order", async () => {
		const w = mountList()
		;(handle(w, 2).element as HTMLElement).focus()
		await key(w, 2, " ")
		await key(w, 2, "ArrowUp")
		await key(w, 2, "ArrowUp")
		await key(w, 2, " ")
		const [order] = reorders(w)
		await w.setProps({ endpoints: (order as string[]).map((id) => [A, B, C].find((e) => e.id === id)) })
		await w.vm.$nextTick()
		expect(document.activeElement).toBe(handle(w, 0).element)
		expect(handle(w, 0).attributes("aria-label")).toBe(`Move ${C.rpcUrl}, position 1 of 3`)
	})

	test("a keyboard lift past a taller row moves by that row's height", async () => {
		const tall = { [A.id]: 120, [B.id]: 60, [C.id]: 60 } as Record<string, number>
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			return { height: tall[this.dataset.endpointId ?? ""] ?? 24 } as DOMRect
		})
		const w = mountList()
		await key(w, 2, " ")
		await key(w, 2, "ArrowUp")
		await key(w, 2, "ArrowUp")
		expect(rows(w)[2]!.attributes("style")).toContain("translateY(-180px)")
	})

	test("a pointer press after a keyboard move ends its claim on focus", async () => {
		const w = mountList()
		const target = rows(w)[2]!.get("[data-row-target]")
		;(target.element as HTMLElement).focus()
		await target.trigger("click")
		const reorder = (ids: string[]) => w.setProps({ endpoints: ids.map((id) => [A, B, C].find((e) => e.id === id)) })
		await reorder([C.id, A.id, B.id])
		;(document.activeElement as HTMLElement | null)?.blur()
		rows(w)[2]!.element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
		await reorder([B.id, C.id, A.id])
		await w.vm.$nextTick()
		expect(document.activeElement).toBe(document.body)
	})

	test("Enter on a row moves it first and keeps focus on it once the list re-renders", async () => {
		const w = mountList()
		const target = rows(w)[2]!.get("[data-row-target]")
		;(target.element as HTMLElement).focus()
		await target.trigger("click")
		const [order] = reorders(w)
		expect(order).toEqual([C.id, A.id, B.id])
		await w.setProps({ endpoints: (order as string[]).map((id) => [A, B, C].find((e) => e.id === id)) })
		await w.vm.$nextTick()
		expect(document.activeElement).toBe(rows(w)[0]!.get("[data-row-target]").element)
	})
})
