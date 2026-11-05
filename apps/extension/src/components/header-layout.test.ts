/**
 * The header row's shrink order, which only a real layout shows: the name claims no width of its
 * own, so the account group never shrinks below the avatar and the address, and the actions may
 * shrink below their content, so a long network name truncates the chip instead; and the network
 * chip's height with its name hidden.
 */
import type { AtRule } from "postcss"
import { expect, test } from "vitest"
import { boundAttr, declarationsOf, elementByTestid, parseSource, resolveSelector } from "../../scripts/type-roles/source-scan"

const parsed = parseSource("apps/extension/src/components/Header.vue")

/** `selector`'s declarations outside any at-rule, or inside the at-rule whose params are `media`;
 *  `declarationsOf` merges both, the last winning. */
function declarationsAt(selector: string, media?: string): Record<string, string> {
	const out: Record<string, string> = {}
	for (const sheet of parsed.styles) {
		sheet.root.walkRules((rule) => {
			const at = rule.parent?.type === "atrule" ? (rule.parent as AtRule).params : undefined
			if (resolveSelector(rule) !== selector || at !== media) return
			for (const node of rule.nodes) if (node.type === "decl") out[node.prop] = node.value
		})
	}
	return out
}

test("the name sits in a slot with no intrinsic width, and the account group keeps its content minimum", () => {
	const name = elementByTestid(parsed, "account-selector")
	expect(name && boundAttr(name.ancestors[name.ancestors.length - 1], "class")).toBe("$style.name_slot")
	expect(declarationsOf(parsed, ".name_slot")).toMatchObject({ contain: "inline-size", "align-self": "stretch" })
	expect(declarationsOf(parsed, ".account_group")["min-width"]).toBeUndefined()
	expect(declarationsOf(parsed, ".account_col")["min-width"]).toBeUndefined()
	// The copy icon spans 2 to 14px past the address: this padding and the row's 8px gap hold it.
	expect(declarationsOf(parsed, ".account_address").padding).toBe("0 6px 0 0")
	expect(declarationsOf(parsed, ".copy_reveal").left).toBe("calc(100% + 2px)")
})

test("the network chip's row may shrink below its content", () => {
	const chip = elementByTestid(parsed, "network-button")
	expect(chip && boundAttr(chip.ancestors[chip.ancestors.length - 1], "class")).toBe("$style.actions")
	expect(declarationsOf(parsed, ".actions")["min-width"]).toBe("0")
	expect(declarationsOf(parsed, ".network_chip")).toMatchObject({ "min-width": "0", "flex-shrink": "1" })
})

test("with its name hidden, the network chip keeps the height the name gives it, and the lock chip takes it", () => {
	// One line of the label's role, plus the 6px padding and 1px border above and below.
	expect(declarationsOf(parsed, ".network_label").composes).toBe("type--label-section from global")
	expect(declarationsAt(".network_chip")).toMatchObject({
		composes: "type--label-section from global",
		padding: "6px 8px",
		border: "1px solid var(--nulo-border)",
		"min-height": "calc(1lh + 14px)",
	})
	expect(declarationsOf(parsed, ".lock_chip")).toMatchObject({
		composes: "type--label-section from global",
		border: "1px solid var(--nulo-border)",
		"min-height": "calc(1lh + 14px)",
	})
	expect(declarationsOf(parsed, ".lock_chip").height).toBeUndefined()
})

test("below the popup's width the network chip keeps its narrow sides, so its dot stays inside it at 240px", () => {
	expect(declarationsAt(".network_chip", "(width < 359px)")).toEqual({ gap: "4px", padding: "6px 3px" })
})

test("at the popup's width the avatar keeps the 24px column, the chips take the right-hand room, and the chip has no cap", () => {
	expect(declarationsAt(".wrapper")).toMatchObject({ gap: "8px", padding: "0 6px 0 24px" })
	expect(declarationsAt(".wrapper", "(width < 359px)")).toEqual({ padding: "0 12px 0 16px" })
	expect(declarationsOf(parsed, ".network_chip")["max-width"]).toBeUndefined()
})

test("narrow with the name on, the account column gives way first: below 117px its name and address leave", () => {
	expect(declarationsAt(".name_first .account_group", "(width < 359px)")).toEqual({ flex: "1 1 0" })
	expect(declarationsAt(".name_first .account_col", "(width < 359px)")).toEqual({ container: "account / inline-size" })
	expect(declarationsOf(parsed, ".account_col").container).toBeUndefined()
	expect(declarationsAt(".name_slot, .account_address", "account (width < 117px)")).toEqual({ display: "none" })
})
