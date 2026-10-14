/**
 * jsdom evaluates neither media queries nor `:focus-visible`, so these rules are pinned in their
 * sources; the screenshot harness and the computed-style probe cover them in real browsers.
 */
import { readdirSync, readFileSync } from "node:fs"
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

/** The rules scoped under `:global(.noanimations)`, keyed by their selector list with that scope removed. */
function noAnimationsRules(source: string): Map<string, string> {
	const scope = ":global(.noanimations) "
	const rules = new Map<string, string>()
	for (const [, selectors, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const list = selectors.split(",").map((s) => s.replace(/\s+/g, " ").trim())
		if (!list.every((s) => s.startsWith(scope))) continue
		rules.set(list.map((s) => s.slice(scope.length)).join(", "), body.replace(/\s+/g, " ").trim())
	}
	return rules
}

describe("reduced motion and Disable animations both stop the shakes and the shimmers", () => {
	test.each([
		["components/composite/shake.module.css", ".shake_password, .shake_name"],
		["popup/components/popups/NewSenderPopup.vue", ".shake"],
		["popup/pages/received/[id].vue", ".fee_shimmer"],
	])("%s: %s", (path, selectors) => {
		const source = read(path)
		expect(reducedMotionRules(source).get(selectors)).toBe("animation: none;")
		expect(noAnimationsRules(source).get(selectors)).toBe("animation: none;")
	})

	test("popup/pages/settings/security/export/full.vue: .shake is the shared one, with its stop", () => {
		expect(read("popup/pages/settings/security/export/full.vue")).toMatch(
			/\.shake \{\s*composes: shake_password from "(\.\.\/)+components\/composite\/shake\.module\.css";\s*\}/,
		)
	})

	test("no extension file draws its own skeleton shimmer: they all render the design package's Skeleton", () => {
		const root = resolve(__dirname, "..")
		const own = readdirSync(root, { recursive: true, encoding: "utf8" })
			.filter((file) => /\.(vue|css)$/.test(file))
			.filter((file) => /^\s*\.skeleton\s*\{/m.test(readFileSync(resolve(root, file), "utf8")))
		expect(own).toEqual([])
	})
})

describe("the toolbar button shows keyboard focus", () => {
	test("RowAction's inset accent ring, nested in .icon_btn", () => {
		const source = read("popup/pages/toolbar-button.module.css").replace(/\s+/g, " ")
		expect(source).toMatch(/\.icon_btn \{[\s\S]*&:focus-visible \{ outline: 2px solid var\(--nulo-accent\); outline-offset: -2px; \}/)
	})
})
