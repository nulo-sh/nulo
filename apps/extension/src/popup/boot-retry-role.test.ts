import { describe, expect, test } from "vitest"
import { NODE, parseSource, type TemplateNode } from "../../scripts/type-roles/source-scan"

const { template, styles } = parseSource("apps/extension/src/popup/app.vue")

function findByTestid(node: TemplateNode, testid: string): TemplateNode | undefined {
	const hit = node.props?.some((p) => p.type === NODE.ATTRIBUTE && p.name === "data-testid" && p.value?.content === testid)
	if (hit) return node
	for (const child of node.children ?? []) {
		if (typeof child !== "object") continue
		const found = findByTestid(child, testid)
		if (found) return found
	}
	return undefined
}

describe("boot retry type role", () => {
	test("the button carries the static `type--button-md` class", () => {
		const retry = template && findByTestid(template, "boot-retry")
		const staticClass = retry?.props?.find((p) => p.type === NODE.ATTRIBUTE && p.name === "class")
		expect(staticClass?.value?.content.split(/\s+/)).toContain("type--button-md")
	})

	test("`.retry` declares no font shorthand that would reset the role", () => {
		const props: string[] = []
		for (const sheet of styles) {
			sheet.root.walkRules(".retry", (rule) => {
				rule.walkDecls((decl) => {
					props.push(decl.prop)
				})
			})
		}
		expect(props.length).toBeGreaterThan(0)
		expect(props.filter((prop) => /^(font|letter-spacing|text-transform)/.test(prop))).toEqual([])
	})
})
