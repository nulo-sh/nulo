import { readFileSync } from "node:fs"
import { join } from "node:path"
import { mount } from "@vue/test-utils"
import { beforeAll, describe, expect, test } from "vitest"
import Button from "./Button.vue"
import buttonSource from "./Button.vue?raw"

const STUBS = {
	Spinner: { template: '<span data-testid="stub-spinner" />' },
	Icon: { template: '<span data-testid="stub-icon" />' },
}

const mountButton = (props: Record<string, unknown> = {}, slots: Record<string, string> = {}) =>
	mount(Button, { props, slots, global: { stubs: STUBS } })

describe("Button (router-free base)", () => {
	test("renders default slot content inside a <button>", () => {
		const w = mountButton({}, { default: "Click me" })
		expect(w.element.tagName).toBe("BUTTON")
		expect(w.text()).toBe("Click me")
	})

	test("disabled sets the native disabled attribute + tabindex -1", () => {
		const w = mountButton({ disabled: true }, { default: "X" })
		expect(w.attributes("disabled")).toBeDefined()
		expect(w.attributes("tabindex")).toBe("-1")
	})

	test("loading renders a Spinner + applies the loading class + sets aria-busy", () => {
		const w = mountButton({ loading: true }, { default: "Saving" })
		expect(w.find('[data-testid="stub-spinner"]').exists()).toBe(true)
		expect(w.attributes("class") ?? "").toMatch(/loading/)
		expect(w.attributes("aria-busy")).toBe("true")
	})

	test("disabled + loading stack BOTH classes (the saving-state opacity override's precondition)", () => {
		// The stylesheet keys `.disabled.loading { opacity: 0.8 }` on this exact
		// stacking so a running submit reads as "saving", not "invalid form",
		// while the native disabled attribute still blocks activation.
		const w = mountButton({ disabled: true, loading: true }, { default: "Saving" })
		const cls = w.attributes("class") ?? ""
		expect(cls).toMatch(/disabled/)
		expect(cls).toMatch(/loading/)
		expect(w.attributes("disabled")).toBeDefined()
		expect(w.attributes("tabindex")).toBe("-1")
	})

	test("leftIcon + rightIcon render two Icon stubs flanking the slot", () => {
		const w = mountButton({ leftIcon: "arrow-left", rightIcon: "arrow-right" }, { default: "Continue" })
		expect(w.findAll('[data-testid="stub-icon"]')).toHaveLength(2)
	})

	test("size + variant apply the matching CSS module classes", () => {
		const cls = mountButton({ size: "large", variant: "secondary" }, { default: "Big" }).attributes("class") ?? ""
		expect(cls).toMatch(/large/)
		expect(cls).toMatch(/secondary/)
	})

	test("a compact CTA carries both the variant and the compact size", () => {
		const cls = mountButton({ size: "compact", variant: "cta_outline" }, { default: "Cancel" }).attributes("class") ?? ""
		expect(cls).toMatch(/compact/)
		expect(cls).toMatch(/cta_outline/)
	})

	test("cta / cta_outline / cta_destructive / ghost variants apply their classes", () => {
		for (const v of ["cta", "cta_outline", "cta_destructive", "ghost"]) {
			expect(mountButton({ variant: v }, { default: "x" }).attributes("class") ?? "").toMatch(new RegExp(v))
		}
	})

	test("wide applies the wide modifier class", () => {
		expect(mountButton({ wide: true }, { default: "Full" }).attributes("class") ?? "").toMatch(/wide/)
	})

	test('tag="a" renders an anchor with href; target=_blank adds rel hygiene', () => {
		const w = mountButton({ tag: "a", href: "/x", target: "_blank" }, { default: "Link" })
		expect(w.element.tagName).toBe("A")
		expect(w.attributes("href")).toBe("/x")
		expect(w.attributes("rel")).toBe("noopener noreferrer")
	})

	test('tag="a" without a target has no rel', () => {
		expect(mountButton({ tag: "a", href: "/x" }, { default: "Link" }).attributes("rel")).toBeUndefined()
	})

	test('tag="a" with a NAMED target also gets rel hygiene (named contexts are opener-capable)', () => {
		const w = mountButton({ tag: "a", href: "/x", target: "report" }, { default: "Link" })
		expect(w.attributes("rel")).toBe("noopener noreferrer")
	})

	test('tag="a" target=_self/_parent/_top reuse an existing context → no rel', () => {
		for (const t of ["_self", "_parent", "_top"]) {
			expect(mountButton({ tag: "a", href: "/x", target: t }, { default: "Link" }).attributes("rel")).toBeUndefined()
		}
	})

	test("(BUG PIN) disabled applies only in button mode, never on an anchor", () => {
		// Original `:disabled="!link && disabled"` never set disabled on links; preserved as
		// `tag === 'button' && disabled`.
		const w = mountButton({ tag: "a", href: "/x", disabled: true }, { default: "Link" })
		expect(w.attributes("disabled")).toBeUndefined()
	})
})

describe("Button type roles", () => {
	const ROLES: Record<string, string | undefined> = {
		cta: "type--button",
		cta_outline: "type--button",
		cta_destructive: "type--button",
		primary: "type--button-md",
		primary_outline: "type--button-md",
		destructive: "type--button-md",
		secondary: undefined,
		ghost: undefined,
		text: undefined,
	}
	const SIZES = ["large", "medium", "compact", "small", "mini", "micro", "dynamic"]

	// Button.vue's module CSS reaches jsdom through `css.include`; the roles it composes are read from
	// disk, since a type-checked side-effect `.css` import has no declaration and `?raw` CSS is stubbed.
	beforeAll(() => {
		const sheet = document.createElement("style")
		sheet.textContent = readFileSync(join(process.cwd(), "src/utilities.css"), "utf8")
		document.head.append(sheet)
	})

	/** What jsdom's cascade picks for the button, unresolved: `var()` and `em` come back as written. */
	const declared = (props: Record<string, unknown>) => {
		const w = mount(Button, { props, slots: { default: "Continue" }, global: { stubs: STUBS }, attachTo: document.body })
		const { fontFamily, fontSize, fontWeight, letterSpacing, textTransform, padding } = getComputedStyle(w.element)
		w.unmount()
		return { fontFamily, fontSize, fontWeight, letterSpacing, textTransform, padding }
	}

	test.each(Object.entries(ROLES))("%s carries %s", (variant, role) => {
		const roles = (mountButton({ variant }, { default: "x" }).attributes("class") ?? "")
			.split(/\s+/)
			.filter((c) => c.startsWith("type--"))
		expect(roles).toEqual(role ? [role] : [])
	})

	test("a CTA reads the button role in its own box, compact too", () => {
		const type = {
			fontFamily: "var(--font-headline)",
			fontSize: "14px",
			fontWeight: "700",
			letterSpacing: "0.2em",
			textTransform: "uppercase",
		}
		expect(declared({ variant: "cta" })).toEqual({ ...type, padding: "20px 0px" })
		expect(declared({ variant: "cta", size: "compact" })).toEqual({ ...type, padding: "14px 0px" })
	})

	/** Today's box: a CTA keeps its compound padding (compact its own), every other variant its size's. */
	const SIZE_PADDING: Record<string, string> = {
		large: "0px 16px",
		medium: "0px 14px",
		compact: "0px 16px",
		small: "0px 12px",
		mini: "0px 10px",
		micro: "0px 8px",
		dynamic: "10px 0px",
	}

	test.each(SIZES)("at size %s every CTA reads 14px/0.2em and every primary 13px/0.03em, each in its box", (size) => {
		for (const [variant, role] of Object.entries(ROLES).filter(([, r]) => r !== undefined)) {
			const { fontSize, letterSpacing, padding } = declared({ variant, size })
			const cta = role === "type--button"
			const box = cta ? (size === "compact" ? "14px 0px" : "20px 0px") : SIZE_PADDING[size]
			expect([variant, fontSize, letterSpacing, padding]).toEqual(
				cta ? [variant, "14px", "0.2em", box] : [variant, "13px", "0.03em", box],
			)
		}
	})
})

describe("Button destructive variant (the regular button in red)", () => {
	/** Module class names are `_name_<hash>`; the style block itself shows what a variant looks like. */
	const classes = (props: Record<string, unknown>) =>
		(mountButton(props, { default: "Download anyway" }).attributes("class") ?? "").split(/\s+/)
	const hasClass = (list: string[], name: string) => list.some((c) => new RegExp(`^_${name}_[0-9a-z]+$`).test(c))

	const rules = [
		...(buttonSource.split("<style module>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g),
	].map((m) => ({ selectors: m[1].split(",").map((sel) => sel.trim()), body: m[2] }))
	const rulesOf = (pattern: RegExp) => rules.filter((r) => r.selectors.some((sel) => pattern.test(sel)))

	test("maps to its own class, never primary's or a CTA's", () => {
		const list = classes({ variant: "destructive" })
		expect(hasClass(list, "destructive")).toBe(true)
		for (const other of ["primary", "cta", "cta_destructive"]) expect(hasClass(list, other)).toBe(false)
	})

	test("stays out of the CTA box, and neither it nor primary sets a size, so the size classes give its padding", () => {
		const ctaBox = rules.find((r) => r.selectors.includes(".wrapper.cta") && r.body.includes("padding"))
		expect(ctaBox).toBeDefined()
		expect(ctaBox?.selectors).not.toContain(".wrapper.destructive")
		const own = rulesOf(/^\.wrapper\.(primary|destructive)(:|$)/)
		expect(own.length).toBeGreaterThanOrEqual(4)
		for (const r of own) expect(r.body).not.toMatch(/font-size|letter-spacing|padding|height/)
	})

	test("both red variants fill with the destructive token, a white label, and hover 18% toward black", () => {
		for (const variant of ["destructive", "cta_destructive"]) {
			const fill = rules.find(
				(r) => r.selectors.length === 1 && r.selectors[0] === `.wrapper.${variant}` && /background/.test(r.body),
			)
			expect(fill?.body).toMatch(/background:\s*var\(--btn-destructive\)/)
			expect(fill?.body).toMatch(/color:\s*var\(--txt-white\)/)
			const hover = rulesOf(new RegExp(`^\\.wrapper\\.${variant}:hover`))
			expect(hover.map((r) => r.body.trim())).toEqual(["background: color-mix(in srgb, var(--btn-destructive), black 18%);"])
		}
	})

	test("its hover and press never answer a disabled or loading button", () => {
		const states = rulesOf(/^\.wrapper\.destructive:(hover|active)/).flatMap((r) =>
			r.selectors.filter((sel) => sel.startsWith(".wrapper.destructive:")),
		)
		expect(states).toHaveLength(2)
		for (const sel of states) expect(sel).toMatch(/:not\(\.disabled\):not\(\.loading\)$/)
	})
})
