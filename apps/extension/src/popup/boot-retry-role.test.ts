import { describe, expect, test } from "vitest"
import { declarationsOf, elementByTestid, parseSource, staticAttr } from "../../scripts/type-roles/source-scan"

const parsed = parseSource("apps/extension/src/popup/app.vue")

describe("boot retry type role", () => {
	test("the button carries the static `type--button-md` class", () => {
		const retry = elementByTestid(parsed, "boot-retry")?.node
		expect(retry && staticAttr(retry, "class")?.split(/\s+/)).toContain("type--button-md")
	})

	test("`.retry` declares no font shorthand that would reset the role", () => {
		const props = Object.keys(declarationsOf(parsed, ".retry"))
		expect(props.length).toBeGreaterThan(0)
		expect(props.filter((prop) => /^(font|letter-spacing|text-transform)/.test(prop))).toEqual([])
	})

	test("`.retry` is a block, so RETRY sits on its own line under a message short enough to share one", () => {
		expect(declarationsOf(parsed, ".retry").display).toBe("block")
	})
})
