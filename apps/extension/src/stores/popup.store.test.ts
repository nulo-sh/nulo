import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, test } from "vitest"
import { usePopupStore } from "./popup.store"

const orders = (store: ReturnType<typeof usePopupStore>) =>
	Object.fromEntries(Object.entries(store.popups).map(([key, entry]) => [key, entry.order]))

describe("stores/popup", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	test("opens stack in order and carry their payload", () => {
		const store = usePopupStore()
		store.open("a")
		store.open("b", { id: 1 })
		expect(orders(store)).toEqual({ a: 0, b: 1 })
		expect(store.len).toBe(2)
		expect(store.isOpened("b")).toBe(true)
		expect(store.getPayload("b")).toEqual({ id: 1 })
	})

	test("closing a popup underneath a newer one keeps orders unique and contiguous", () => {
		const store = usePopupStore()
		store.open("a")
		store.open("b")
		store.open("c")
		store.close("b")
		expect(orders(store)).toEqual({ a: 0, c: 1 })
		store.open("d")
		expect(orders(store)).toEqual({ a: 0, c: 1, d: 2 })
		expect(new Set(Object.values(orders(store))).size).toBe(3)
	})

	test("closing the top one, or one that is not open, changes nothing else", () => {
		const store = usePopupStore()
		store.open("a")
		store.open("b")
		store.close("b")
		expect(orders(store)).toEqual({ a: 0 })
		store.close("zzz")
		expect(orders(store)).toEqual({ a: 0 })
		expect(store.isOpened("b")).toBe(false)
	})

	test("(BUG PIN) re-opening an open popup leaves a gap, so a later open can share an order", () => {
		// `open` counts the re-opened key itself, so its order skips one slot. Whether the stack
		// closes that gap changes which lower card sits back: an owner decision, kept as is.
		const store = usePopupStore()
		store.open("a")
		store.open("b")
		store.open("a")
		expect(orders(store)).toEqual({ a: 2, b: 1 })
		store.close("a")
		store.open("c")
		expect(orders(store)).toEqual({ b: 1, c: 1 })
	})

	test("closeAll empties the stack", () => {
		const store = usePopupStore()
		store.open("a")
		store.open("b")
		store.closeAll()
		expect(store.len).toBe(0)
		expect(store.isOpened("a")).toBe(false)
	})
})
