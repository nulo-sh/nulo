import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
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

describe("Button destructive variant (the regular button in red)", () => {
	const classes = (props: Record<string, unknown>) =>
		(mountButton(props, { default: "Download anyway" }).attributes("class") ?? "").split(/\s+/)
	/** CSS modules render `.name` as `_name_<hash>`. */
	const hasClass = (list: string[], name: string) => list.some((c) => new RegExp(`^_${name}_[0-9a-z]+$`).test(c))

	/** Selector lists of the style block's rules, comments stripped. */
	const rules = [
		...(buttonSource.split("<style module>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g),
	].map((m) => ({ selectors: m[1].split(",").map((sel) => sel.trim()), body: m[2] }))

	test("applies its own class and neither primary's nor a CTA's", () => {
		const list = classes({ variant: "destructive" })
		expect(hasClass(list, "destructive")).toBe(true)
		for (const other of ["primary", "cta", "cta_destructive"]) expect(hasClass(list, other)).toBe(false)
	})

	test("takes the regular sizes, medium by default", () => {
		expect(hasClass(classes({ variant: "destructive" }), "medium")).toBe(true)
		for (const size of ["large", "compact", "small"]) {
			const list = classes({ variant: "destructive", size })
			expect(hasClass(list, size)).toBe(true)
			expect(hasClass(list, "destructive")).toBe(true)
		}
	})

	test("disabled keeps the variant and blocks activation", () => {
		const w = mountButton({ variant: "destructive", disabled: true }, { default: "Download anyway" })
		const list = (w.attributes("class") ?? "").split(/\s+/)
		expect(hasClass(list, "destructive")).toBe(true)
		expect(hasClass(list, "disabled")).toBe(true)
		expect(w.attributes("disabled")).toBeDefined()
		expect(w.attributes("tabindex")).toBe("-1")
	})

	test("loading keeps the variant and shows the spinner", () => {
		const w = mountButton({ variant: "destructive", loading: true }, { default: "Download anyway" })
		expect(hasClass((w.attributes("class") ?? "").split(/\s+/), "destructive")).toBe(true)
		expect(w.find('[data-testid="stub-spinner"]').exists()).toBe(true)
		expect(w.attributes("aria-busy")).toBe("true")
	})

	test("as an anchor it keeps the variant and the rel hygiene", () => {
		const w = mountButton({ variant: "destructive", tag: "a", href: "/x", target: "_blank" }, { default: "Remove" })
		expect(w.element.tagName).toBe("A")
		expect(hasClass((w.attributes("class") ?? "").split(/\s+/), "destructive")).toBe(true)
		expect(w.attributes("rel")).toBe("noopener noreferrer")
	})

	test("its type is primary's rule and its padding is the size's: it never joins the CTA contract", () => {
		const typeRule = rules.find((r) => r.selectors.includes(".wrapper.primary") && r.body.includes("font-family"))
		expect(typeRule?.selectors).toContain(".wrapper.destructive")
		const ctaContract = rules.find((r) => r.selectors.includes(".wrapper.cta") && r.body.includes("letter-spacing"))
		expect(ctaContract).toBeDefined()
		expect(ctaContract?.selectors).not.toContain(".wrapper.destructive")
		for (const r of rules.filter((rule) => rule.selectors.some((sel) => sel.startsWith(".wrapper.destructive")))) {
			expect(r.body).not.toMatch(/font-size|letter-spacing|padding|height/)
		}
	})

	test("its fill is the destructive red with white text", () => {
		const fill = rules.find((r) => r.selectors.length === 1 && r.selectors[0] === ".wrapper.destructive")
		expect(fill?.body).toMatch(/background:\s*var\(--red\)/)
		expect(fill?.body).toMatch(/color:\s*var\(--txt-white\)/)
	})
})
