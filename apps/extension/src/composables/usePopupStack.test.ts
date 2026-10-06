import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, test } from "vitest"
import { usePopupStore } from "@/stores/popup.store"
import { usePopupStack } from "./usePopupStack"

let store: ReturnType<typeof usePopupStore>

beforeEach(() => {
	setActivePinia(createPinia())
	store = usePopupStore()
})

const values = (key: string) => {
	const { order, depth } = usePopupStack(key)
	return [order.value, depth.value]
}

describe("usePopupStack", () => {
	test("a closed key reads undefined and NaN", () => {
		expect(values("confirm")).toEqual([undefined, Number.NaN])
	})

	test("the only open popup is order 0, depth 1", () => {
		store.open("confirm")
		expect(values("confirm")).toEqual([0, 1])
	})

	test("the top of three is order 2, depth 1", () => {
		store.open("a")
		store.open("b")
		store.open("c")
		expect(values("c")).toEqual([2, 1])
	})

	test("the bottom of three is order 0, depth 3", () => {
		store.open("a")
		store.open("b")
		store.open("c")
		expect(values("a")).toEqual([0, 3])
	})

	test("the values follow the store reactively", () => {
		const { order, depth } = usePopupStack("b")
		store.open("a")
		store.open("b")
		expect([order.value, depth.value]).toEqual([1, 1])
		store.open("c")
		expect([order.value, depth.value]).toEqual([1, 2])
		store.close("c")
		expect([order.value, depth.value]).toEqual([1, 1])
	})

	test("closing a popup beneath lowers the order and keeps the depth", () => {
		const { order, depth } = usePopupStack("c")
		store.open("a")
		store.open("b")
		store.open("c")
		store.close("a")
		expect([order.value, depth.value]).toEqual([1, 1])
	})

	test("a re-opened key takes the next order, so it can reach depth 0", () => {
		store.open("a")
		store.open("b")
		store.open("a")
		expect(values("a")).toEqual([2, 0])
		expect(values("b")).toEqual([1, 1])
	})

	test("closing the key returns undefined and NaN", () => {
		const { order, depth } = usePopupStack("a")
		store.open("a")
		store.close("a")
		expect([order.value, depth.value]).toEqual([undefined, Number.NaN])
	})

	test("closeAll closes every key", () => {
		store.open("a")
		store.open("b")
		store.closeAll()
		expect(values("a")).toEqual([undefined, Number.NaN])
		expect(values("b")).toEqual([undefined, Number.NaN])
	})

	test("each key reads only its own entry", () => {
		store.open("a")
		store.open("b")
		expect(values("a")).toEqual([0, 2])
		expect(values("b")).toEqual([1, 1])
		expect(values("c")).toEqual([undefined, Number.NaN])
	})
})
