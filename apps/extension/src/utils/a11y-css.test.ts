/**
 * jsdom evaluates neither media queries nor `:focus-visible`, so these rules are pinned in their
 * sources; the screenshot harness and the computed-style probe cover them in real browsers.
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { declarationsOf, enclosingRule, parseSource, REPO_ROOT, resolveSelector, sourceFiles } from "../../scripts/type-roles/source-scan"

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

describe("a settings search's row outline holds with no fade under reduced motion and Disable animations", () => {
	const source = read("composables/settings-row-highlight.css")
	const flat = source.replace(/\s+/g, " ")
	const row = "[data-settings-row][data-highlighted]"

	test("both switch the fade to one step at the end of the same moment", () => {
		expect(reducedMotionRules(source).get(row)).toBe("animation-timing-function: step-end;")
		expect(flat).toContain(`.noanimations ${row} { animation-timing-function: step-end; }`)
	})

	test("the animation fills nothing, so no outline outlives it", () => {
		expect(flat).toContain(`${row} { animation: settings-row-found 2.4s ease-out; animation-fill-mode: none; }`)
	})
})

describe("the detail pages' links draw the focus ring on :focus-visible, never on plain :focus", () => {
	const shared = read("popup/pages/detail-page.module.css")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\s+/g, " ")

	test("the shared link classes draw the accent ring on :focus-visible", () => {
		expect(shared).toContain(
			".hero_link:focus-visible, .detail_link:focus-visible { outline: 2px solid var(--nulo-accent); outline-offset: 2px; }",
		)
	})

	test("no shared rule draws on plain :focus, which a mouse press or a tap also matches", () => {
		expect(shared).not.toMatch(/:focus(?!-visible)/)
	})

	test("every link on the tx, received and journal pages binds a local class composing a ringed one", () => {
		// The links each file renders itself; the address cards' corner links are AddressCardLink's.
		const pages = [
			["popup/components/modules/tx/TxHashRow.vue", 1],
			["popup/pages/tx/[id].vue", 2],
			["popup/pages/received/[id].vue", 4],
			["popup/pages/journal/[id].vue", 2],
		] as const
		const unringed = pages.flatMap(([path, count]) => {
			const source = read(path).replace(/\s+/g, " ")
			const anchors = [...source.matchAll(/<a [^>]*>/g)].map(([tag]) => tag)
			const ringed = (tag: string) =>
				[...tag.matchAll(/\$style\.(\w+)/g)].some(([, local]) =>
					new RegExp(
						`\\.${local} \\{[^}]*composes: (hero_link|detail_link) from "(\\.\\./)+(pages/)?detail-page\\.module\\.css";`,
					).test(source),
				)
			const misses = anchors.filter((tag) => !ringed(tag))
			return anchors.length === count && misses.length === 0 ? [] : [{ path, anchors: anchors.length, misses }]
		})
		expect(unringed).toEqual([])
	})
})

describe("the recipient card's buttons show keyboard focus", () => {
	test("the accent ring on :focus-visible", () => {
		const source = read("components/composite/send/RecipientCard.vue").replace(/\s+/g, " ")
		expect(source).toContain(".icon_btn:focus-visible { outline: 2px solid var(--nulo-accent); outline-offset: 2px; }")
	})
})

describe("the toolbar button shows keyboard focus", () => {
	test("RowAction's inset accent ring, nested in .icon_btn", () => {
		const source = read("popup/pages/toolbar-button.module.css").replace(/\s+/g, " ")
		expect(source).toMatch(/\.icon_btn \{[\s\S]*&:focus-visible \{ outline: 2px solid var\(--nulo-accent\); outline-offset: -2px; \}/)
	})
})

describe("meta text reads in --nulo-secondary; --nulo-outline is for borders and decoration", () => {
	test.each([
		["components/composite/activity/activity-card.module.css", ".title_sep"],
		["popup/components/modules/activity/TransactionCard.vue", ".hash"],
		["components/composite/activity/TransactionIncomingCard.vue", ".hash"],
		["components/composite/activity/TransactionCardLayout.vue", ".amount_symbol"],
		["popup/components/modules/general/BalanceView.vue", ".fiat_partial"],
		["popup/components/modules/general/BalanceView.vue", ".breakdown_divider"],
		["popup/components/modules/holdings/TokenList.vue", ".fold_action"],
	])("%s: %s", (path, selector) => {
		const body = read(path).match(new RegExp(`^\\${selector} \\{([^{}]*)\\}`, "m"))?.[1] ?? ""
		expect(body).toMatch(/\bcolor: var\(--nulo-secondary\);/)
	})

	// Blind to template `style` / `:style` bindings, colours set from script strings, and an alias
	// custom property that names the token.
	test("no stylesheet rule colours text with --nulo-outline; the connect window's copy glyph and row chevron are icons", () => {
		const stylesheets = [
			...sourceFiles().filter((file) => /\.(vue|css|scss)$/.test(file)),
			"packages/design/src/base.css",
			"packages/design/src/utilities.css",
		]
		const outline = /var\(\s*--nulo-outline\s*[,)]/i
		const found = stylesheets.flatMap((file) =>
			parseSource(file).styles.flatMap(({ root }) => {
				const keys: string[] = []
				root.walkDecls(/^color$/i, (decl) => {
					const rule = enclosingRule(decl)
					if (outline.test(decl.value)) keys.push(`${file} ${rule ? resolveSelector(rule) : "(no rule)"}`)
				})
				return keys
			}),
		)
		expect(stylesheets).toEqual(
			expect.arrayContaining(["packages/design/src/ui/Input.vue", "apps/extension/src/popup/pages/detail-page.module.css"]),
		)
		expect(found).toEqual([
			"apps/extension/src/components/composite/capabilities/DetailsTable.vue .address .copy .copy_glyph",
			"apps/extension/src/components/composite/capabilities/DetailsTable.vue .row .chevron",
		])
	})
})

describe("the tx page's disclosure rows keep full strength under the pointer", () => {
	// Faded to 80%, their --nulo-secondary text reads under 4.5:1 in both themes.
	test("no hover rule in the toggle's sheet or a sheet composing it sets opacity; the pointer cursor stays the cue", () => {
		const sheet = "apps/extension/src/popup/components/modules/tx/tx-shared.module.css"
		const composers = sourceFiles().filter((file) =>
			/composes:\s*disclosure_toggle\b/.test(readFileSync(resolve(REPO_ROOT, file), "utf8")),
		)
		const faded = [sheet, ...composers].flatMap((file) =>
			parseSource(file).styles.flatMap(({ root }) => {
				const keys: string[] = []
				root.walkDecls(/^opacity$/i, (decl) => {
					const rule = enclosingRule(decl)
					const selector = rule ? resolveSelector(rule) : "(no rule)"
					if (/:hover\b/.test(selector)) keys.push(`${file} ${selector}`)
				})
				return keys
			}),
		)
		expect(composers).toEqual(
			expect.arrayContaining([
				"apps/extension/src/popup/components/modules/tx/TxFeeRow.vue",
				"apps/extension/src/popup/components/modules/tx/TxDebugPanel.vue",
			]),
		)
		expect(declarationsOf(parseSource(sheet), ".disclosure_toggle")).toMatchObject({ cursor: "pointer" })
		expect(faded).toEqual([])
	})
})
