import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { glyphs } from "./glyphs"
import Icon from "./Icon.vue"

const render = (props: Record<string, unknown>) => mount(Icon, { props: props as { name: "close" } })

describe("Icon", () => {
	test("strokes render unfilled, at 2.5 units or the 1.5 px floor", () => {
		const big = render({ name: "close", size: 24 })
		const small = render({ name: "close", size: 12 })
		expect(big.findAll("path").map((p) => p.attributes("fill"))).toEqual(["none"])
		expect(big.attributes("stroke-width")).toBe("2.5")
		expect(small.attributes("stroke-width")).toBe("3")
		expect(big.attributes("stroke-linecap")).toBe("square")
	})

	test("each solid is its own even-odd path", () => {
		const paths = render({ name: "holdings" }).findAll("path")
		expect(paths).toHaveLength(glyphs.holdings.f.length)
		for (const p of paths) {
			expect(p.attributes("fill-rule")).toBe("evenodd")
			expect(p.attributes("stroke")).toBe("none")
		}
	})

	test("square-check cuts its tick as a hole in the one solid", () => {
		const [solid] = render({ name: "square-check" }).findAll("path")
		expect(solid?.attributes("fill-rule")).toBe("evenodd")
		expect(solid?.attributes("d")?.match(/M/g)).toHaveLength(2)
	})

	test("paints through color: the color-- class, with the root's currentColor", () => {
		const w = render({ name: "close", color: "red" })
		expect(w.classes()).toContain("color--red")
		expect(w.attributes("fill")).toBe("currentColor")
		expect(w.attributes("stroke")).toBe("currentColor")
	})

	test("rotate turns the glyph about its centre", () => {
		expect(render({ name: "chevron", rotate: 90 }).attributes("style")).toContain("rotate(90deg)")
		expect(render({ name: "chevron" }).attributes("style") ?? "").not.toContain("rotate")
	})

	test("an unknown name renders no path; a known one does", () => {
		const unknown = render({ name: "check-circle" })
		expect(unknown.element.tagName.toLowerCase()).toBe("svg")
		expect(unknown.findAll("path")).toHaveLength(0)
		expect(render({ name: "toString" }).findAll("path")).toHaveLength(0)
		expect(render({ name: "check" }).findAll("path")).toHaveLength(1)
	})
})
