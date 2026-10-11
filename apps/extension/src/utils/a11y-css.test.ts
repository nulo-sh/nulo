/**
 * jsdom evaluates neither media queries nor `:focus-visible`, so these rules are pinned in their
 * sources; the screenshot harness and the computed-style probe cover them in real browsers.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8")

/** The rule bodies inside `@media (prefers-reduced-motion: reduce)`, keyed by their selector list. */
function reducedMotionRules(source: string): Map<string, string> {
	const rules = new Map<string, string>()
	const marker = "@media (prefers-reduced-motion: reduce) {"
	for (let at = source.indexOf(marker); at !== -1; at = source.indexOf(marker, at + 1)) {
		let depth = 1
		let end = at + marker.length
		while (depth > 0 && end < source.length) {
			if (source[end] === "{") depth++
			if (source[end] === "}") depth--
			end++
		}
		for (const [, selectors, body] of source.slice(at + marker.length, end - 1).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			rules.set(selectors.replace(/\s+/g, " ").trim(), body.replace(/\s+/g, " ").trim())
		}
	}
	return rules
}

describe("reduced motion stops the shake and the shimmers", () => {
	test.each([
		["components/composite/shake.module.css", ".shake_password, .shake_name"],
		["popup/components/modules/send/fee-shared.module.css", ".skeleton"],
		["components/composite/send/AmountCard.vue", ".skeleton"],
	])("%s: %s", (path, selectors) => {
		expect(reducedMotionRules(read(path)).get(selectors)).toBe("animation: none;")
	})

	test("popup/pages/settings/security/export/full.vue: .shake is the shared one, with its stop", () => {
		expect(read("popup/pages/settings/security/export/full.vue")).toMatch(
			/\.shake \{\s*composes: shake_password from "(\.\.\/)+components\/composite\/shake\.module\.css";\s*\}/,
		)
	})
})

describe("the toolbar button shows keyboard focus", () => {
	test("RowAction's inset accent ring, nested in .icon_btn", () => {
		const source = read("popup/pages/toolbar-button.module.css").replace(/\s+/g, " ")
		expect(source).toMatch(/\.icon_btn \{[\s\S]*&:focus-visible \{ outline: 2px solid var\(--nulo-accent\); outline-offset: -2px; \}/)
	})
})
