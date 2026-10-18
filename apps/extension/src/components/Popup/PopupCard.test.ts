import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import PopupCard from "./PopupCard.vue"

const FlexStub = { template: '<div v-bind="$attrs"><slot /></div>', inheritAttrs: false }
const mountCard = (props: Record<string, unknown> = {}) =>
	mount(PopupCard, {
		props: { displaceIdx: 1, ...props },
		slots: { default: '<button data-testid="slot-control">Close</button>' },
		global: { stubs: { Flex: FlexStub } },
	})

describe("PopupCard", () => {
	test("sits at its content height: no grow and nothing above the content, which renders in the body", () => {
		const w = mountCard()
		const card = w.element as HTMLElement
		expect(card.style.flexGrow).toBe("")
		expect([...card.children].map((el) => el.getAttribute("data-testid"))).toEqual(["popup-card-body"])
		expect(w.find('[data-testid="popup-card-body"] [data-testid="slot-control"]').exists()).toBe(true)
		w.unmount()
	})

	test("sits back only below the top of the stack: depth 2, not depth 1 or a closed key's NaN", () => {
		const displaced = (displaceIdx: number) => {
			const w = mountCard({ displaceIdx })
			const out = w.classes().some((c) => c.includes("displace"))
			w.unmount()
			return out
		}
		expect(displaced(2)).toBe(true)
		expect(displaced(1)).toBe(false)
		expect(displaced(Number.NaN)).toBe(false)
	})
})
