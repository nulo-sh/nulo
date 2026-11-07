/**
 * Pins amount formatting, the + prefix, the fiat passthrough, the no-fake-fiat rule for unpriced
 * receives, and the direction's words under the card's own testid.
 */

import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { createMemoryHistory, createRouter } from "vue-router"
import { receivedDirection } from "@/utils/received-display"
import TransactionIncomingCard from "./TransactionIncomingCard.vue"

const STUBS = {
	Flex: { template: '<div :class="$attrs.class" v-bind="$attrs"><slot /></div>', inheritAttrs: false },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" :data-color="color" />', props: ["name", "size", "color"] },
	TransactionCardLayout: {
		template: `
			<div data-testid="layout">
				<span class="title">{{ title }}</span>
				<span class="title-trailing"><slot name="title-trailing" /></span>
				<slot name="badge" />
				<slot name="secondary" />
				<span class="amount">{{ amount }}</span>
				<span class="symbol">{{ amountSymbol }}</span>
				<span v-if="amountFiat" data-testid="activity-fiat">{{ amountFiat }}</span>
			</div>
		`,
		props: ["title", "icon", "amount", "amountSymbol", "titleNamesToken", "amountFiat", "testId", "txHash", "direction"],
	},
}

const mountCard = (props: Record<string, unknown> = {}) =>
	mount(TransactionIncomingCard, {
		props: {
			tokenSymbol: "cUSD",
			amountRaw: (500n * 10n ** 6n).toString(),
			tokenDecimals: 6,
			...props,
		},
		global: { stubs: STUBS },
	})

describe("composite/TransactionIncomingCard", () => {
	test("the status icon fills with the success text token", () => {
		expect(mountCard().find('[data-testid="activity-status-icon"][data-name="square-check"]').attributes("data-color")).toBe(
			"txt-success",
		)
	})

	test("formats the raw amount by token decimals with a + prefix", () => {
		const w = mountCard()
		expect(w.find(".amount").text()).toBe("+500")
	})

	test("hands the layout the symbol and tells it the title already names the token", () => {
		const layout = mountCard().findComponent(STUBS.TransactionCardLayout)
		expect(layout.props()).toMatchObject({ title: "cUSD", amountSymbol: "cUSD", titleNamesToken: true })
	})

	test("a blank symbol titles the row with the empty-value dash; the layout is handed the symbol as given", () => {
		const read = (tokenSymbol: string) => {
			const layout = mountCard({ tokenSymbol }).findComponent(STUBS.TransactionCardLayout)
			return [layout.props("title"), layout.props("amountSymbol")]
		}
		expect(read("   ")).toEqual(["—", "   "])
		expect(read("cUSD")).toEqual(["cUSD", "cUSD"])
	})

	test("fractional raw amounts keep their precision", () => {
		const w = mountCard({ amountRaw: "1500000", tokenDecimals: 6 }) // 1.5
		expect(w.find(".amount").text()).toBe("+1.5")
	})

	test.each([
		["a whole part past the row keeps every digit", 123_456_789n * 10n ** 18n, "+123.45M"],
		["a cut that ends on the separator drops it", 9_999_999n * 10n ** 17n, "+999,999"],
	])("%s", (_name, raw, expected) => {
		const w = mountCard({ amountRaw: raw.toString(), tokenDecimals: 18 })
		expect(w.find(".amount").text()).toBe(expected)
	})

	test("decimals default to 0 when unknown (raw shown as-is)", () => {
		const w = mountCard({ amountRaw: "42", tokenDecimals: 0 })
		expect(w.find(".amount").text()).toBe("+42")
	})

	test("I1: amountFiat passes through to the layout's fiat line", () => {
		const w = mountCard({ amountFiat: "≈ $499.93" })
		const fiat = w.find('[data-testid="activity-fiat"]')
		expect(fiat.exists()).toBe(true)
		expect(fiat.text()).toBe("≈ $499.93")
	})

	test("no amountFiat → no fiat element (unpriced receives stay token-only)", () => {
		const w = mountCard()
		expect(w.find('[data-testid="activity-fiat"]').exists()).toBe(false)
		expect(w.text()).not.toContain("$")
	})

	test("default token symbol falls back to 'Token'", () => {
		const w = mountCard({ tokenSymbol: undefined })
		expect(w.find(".symbol").text()).toBe("Token")
	})

	test("the direction goes to the layout and its words to a hidden span under the kind chip's testid; no title-trailing", () => {
		const direction = receivedDirection("private-to-public")
		const w = mountCard({ direction })
		expect(w.findComponent(STUBS.TransactionCardLayout).props("direction")).toEqual(direction)
		const words = w.get('[data-testid="tx-incoming-kind-chip"]')
		expect(words.element.textContent).toBe("Private → Public")
		expect(words.classes().some((c) => c.includes("direction"))).toBe(true)
		expect(w.find(".title-trailing").element.childElementCount).toBe(0)
	})

	test("without a direction there are no words to read", () => {
		expect(mountCard().find('[data-testid="tx-incoming-kind-chip"]').exists()).toBe(false)
	})
})

describe("composite/TransactionIncomingCard — the row, on the real layout and router", () => {
	const { TransactionCardLayout: _stub, ...ATOMS } = STUBS
	const makeRouter = () =>
		createRouter({ history: createMemoryHistory(), routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }] })
	const mountRow = async (props: Record<string, unknown> = {}) => {
		const router = makeRouter()
		await router.push("/popup/general")
		const push = vi.spyOn(router, "push")
		const w = mount(TransactionIncomingCard, {
			props: { tokenSymbol: "cUSD", amountRaw: (500n * 10n ** 6n).toString(), tokenDecimals: 6, to: "/popup/received/r1", ...props },
			global: { stubs: ATOMS, plugins: [router] },
			attachTo: document.body,
		})
		return { w, router, push }
	}

	test("the row links to its receipt, named by the token", async () => {
		const { w } = await mountRow()
		const target = w.find("[data-row-target]")
		expect(target.element.tagName).toBe("A")
		expect(target.attributes("href")).toBe("/popup/received/r1")
		expect(w.find(`#${target.attributes("aria-labelledby")}`).text()).toBe("cUSD")
		w.unmount()
	})

	test("the priced span keeps its title, sits outside the target above it, and a click opens the row once", async () => {
		const { w, router, push } = await mountRow({ amountFiat: "≈ $499.93" })
		const fiat = w.find('[data-testid="activity-fiat"]')
		expect(fiat.attributes("title")).toBe("At today's price")
		expect(fiat.classes().some((c) => c.includes("raised"))).toBe(true)
		expect(w.find("[data-row-target]").find('[data-testid="activity-fiat"]').exists()).toBe(false)
		await fiat.trigger("click")
		await flushPromises()
		expect(push).toHaveBeenCalledTimes(1)
		expect(router.currentRoute.value.path).toBe("/popup/received/r1")
		w.unmount()
	})

	test.each([-1, 1.5, 1000])("tokenDecimals %s renders the row without an amount column and without throwing", async (decimals) => {
		const { w } = await mountRow({ tokenDecimals: decimals, amountFiat: "≈ $1.00" })
		expect(w.find('[data-testid="tx-incoming-card"]').exists()).toBe(true)
		expect(w.text()).not.toContain("+")
		expect(w.find('[data-testid="activity-fiat"]').exists()).toBe(false)
		w.unmount()
	})

	test("a received note draws the arrow and the shield with the inbound badge, and its words lead the hash line", async () => {
		const { w } = await mountRow({ direction: receivedDirection("received-privately"), txHash: `0x${"5c".repeat(32)}` })
		const names = (testid: string) =>
			w.findAll(`[data-testid="${testid}"] [data-testid="stub-icon"]`).map((i) => i.attributes("data-name"))
		expect(names("activity-icon-pair")).toEqual(["forward", "private"])
		expect(names("activity-way-badge")).toEqual(["receive"])
		expect(w.find('[data-testid="tx-incoming-kind-sep"]').exists()).toBe(false)
		const words = w.get('[data-testid="tx-incoming-kind-chip"]').element
		expect(words.nextElementSibling?.getAttribute("data-testid")).toBe("activity-incoming-hash")
		expect(words.textContent).toBe("Received privately")
		w.unmount()
	})

	test("`arriving` stamps the root", async () => {
		const { w } = await mountRow({ arriving: true })
		expect(w.find('[data-testid="tx-incoming-card"]').attributes("data-arriving")).toBe("true")
		w.unmount()
	})

	test("a receipt whose token has invalid decimals still plays, with no amount column", async () => {
		const { w } = await mountRow({ arriving: true, tokenDecimals: 1.5 })
		const root = w.find('[data-testid="tx-incoming-card"]')
		expect(root.attributes("data-arriving")).toBe("true")
		expect(root.classes().some((c) => c.includes("n-row-glow"))).toBe(true)
		expect(w.text()).not.toContain("+")
		w.unmount()
	})
})
