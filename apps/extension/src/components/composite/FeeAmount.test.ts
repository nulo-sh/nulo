import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { type FeeDisplay, feeDisplay, feeText } from "@/utils/fee-estimation"
import FeeAmount from "./FeeAmount.vue"

const FJ = 10n ** 18n
const factory = (display: FeeDisplay, attrs: Record<string, unknown> = {}) => mount(FeeAmount, { props: { display }, attrs })
const usdSpan = (w: ReturnType<typeof factory>) => w.find("span > span")

describe("composite/FeeAmount", () => {
	test.each([
		["a quoted fee, rounded half-up past its sixth decimal", feeDisplay("3577823500000000001", 0.06), "~3.577824 FJ ($0.215)"],
		["a fee without a usable quote", feeDisplay("3577823500000000001", undefined), "~3.577824 FJ"],
		["a fee under a tenth of a cent", feeDisplay(FJ / 1_000_000n, 0.06), "~0.000001 FJ (<$0.001)"],
		["a zero fee", feeDisplay(0n, 0.06), "~0 FJ ($0.000)"],
		["a fee worth whole dollars", feeDisplay(250n * FJ, 0.06), "~250 FJ ($15.000)"],
	])("%s reads as the string grammar does", (_, display, text) => {
		const w = factory(display)
		expect(w.text()).toBe(text)
		expect(w.text()).toBe(feeText(display))
	})

	test("the USD span is absent without a quote, present with one", () => {
		expect(usdSpan(factory(feeDisplay(FJ, undefined))).exists()).toBe(false)
		expect(usdSpan(factory(feeDisplay(FJ, 0.06))).text()).toBe("($0.060)")
	})

	test("the USD span says which price it is at", () => {
		expect(usdSpan(factory(feeDisplay(FJ, 0.06))).attributes("title")).toBe("At today's AZTEC price")
	})

	test("the USD span carries the testid it is given, and none otherwise", () => {
		const given = mount(FeeAmount, { props: { display: feeDisplay(FJ, 0.06), usdTestid: "tx-fee-usd" } })
		expect(given.find('[data-testid="tx-fee-usd"]').text()).toBe("($0.060)")
		expect(usdSpan(factory(feeDisplay(FJ, 0.06))).attributes("data-testid")).toBeUndefined()
	})

	test("the parent's class lands on the figure's root and `usdClass` on the USD alone", () => {
		const w = mount(FeeAmount, { props: { display: feeDisplay(FJ, 0.06), usdClass: "aux" }, attrs: { class: "value" } })
		expect(w.classes()).toEqual(["value"])
		expect(usdSpan(w).classes()).toEqual(["aux"])
	})

	test("without `usdClass` the USD takes no class of its own", () => {
		expect(usdSpan(factory(feeDisplay(FJ, 0.06), { class: "value" })).classes()).toEqual([])
	})
})
