import { mount } from "@vue/test-utils"
import { afterEach, expect, test } from "vitest"
import TxHashRow from "./TxHashRow.vue"

const HASH = `0x${"ab".repeat(32)}`

afterEach(() => window.getSelection()?.removeAllRanges())

test("a drag that selects part of the hash copies nothing; a click copies it", () => {
	const w = mount(TxHashRow, {
		attachTo: document.body,
		props: { hash: HASH, copyTestid: "hash" },
		global: { stubs: { Flex: { template: "<div><slot /></div>" } } },
	})
	const value = w.get('[data-testid="hash"]').element
	const text = value.firstChild as Text
	window.getSelection()?.setBaseAndExtent(text, 0, text, 6)
	value.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
	expect(w.emitted("copy")).toBeUndefined()
	window.getSelection()?.removeAllRanges()
	value.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
	expect(w.emitted("copy")).toEqual([[HASH]])
	w.unmount()
})
