import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { glyphs } from "./glyphs"
import Icon from "./Icon.vue"

const render = (props: Record<string, unknown>) => mount(Icon, { props: props as { name: "close" } })

describe("Icon", () => {
	test("strokes render unfilled at Tabler's 2 units at every size, with round ends", () => {
		const big = render({ name: "close", size: 24 })
		const small = render({ name: "close", size: 9 })
		expect(big.findAll("path").map((p) => p.attributes("fill"))).toEqual(["none", "none"])
		expect([big.attributes("stroke-width"), small.attributes("stroke-width")]).toEqual(["2", "2"])
		expect([big.attributes("stroke-linecap"), big.attributes("stroke-linejoin")]).toEqual(["round", "round"])
	})

	test("a filled glyph's paths take the root's fill, unstroked, under the default fill rule", () => {
		const paths = render({ name: "square-check" }).findAll("path")
		expect(paths).toHaveLength(glyphs["square-check"].f.length)
		for (const p of paths) {
			expect(p.attributes("stroke")).toBe("none")
			expect(p.attributes("fill")).toBeUndefined()
			expect(p.attributes("fill-rule")).toBeUndefined()
		}
	})

	test("paints through color: the color-- class, with the root's currentColor, as an img", () => {
		const w = render({ name: "close", color: "red" })
		expect(w.classes()).toContain("color--red")
		expect(w.attributes("role")).toBe("img")
		expect(w.attributes("fill")).toBe("currentColor")
		expect(w.attributes("stroke")).toBe("currentColor")
	})

	test("private is one filled path and public stroked paths only, and neither is the padlock or the network globe", () => {
		const [priv, pub] = [render({ name: "private" }).findAll("path"), render({ name: "public" }).findAll("path")]
		expect(priv).toHaveLength(1)
		expect(priv[0]?.attributes("stroke")).toBe("none")
		expect(pub.length).toBeGreaterThan(1)
		for (const p of pub) expect(p.attributes("fill")).toBe("none")
		expect([glyphs.private, glyphs.public]).not.toContainEqual(glyphs.lock)
		expect([glyphs.private, glyphs.public]).not.toContainEqual(glyphs["network-edit"])
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
