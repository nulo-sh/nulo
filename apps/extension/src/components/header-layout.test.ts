/**
 * The header row's shrink order, which only a real layout shows: the name claims no width of its
 * own, so the account group never shrinks below the avatar and the address, and the actions may
 * shrink below their content, so a long network name truncates the chip instead.
 */
import { expect, test } from "vitest"
import { boundAttr, declarationsOf, elementByTestid, parseSource } from "../../scripts/type-roles/source-scan"

const parsed = parseSource("apps/extension/src/components/Header.vue")

test("the name sits in a slot with no intrinsic width, and the account group keeps its content minimum", () => {
	const name = elementByTestid(parsed, "account-selector")
	expect(name && boundAttr(name.ancestors[name.ancestors.length - 1], "class")).toBe("$style.name_slot")
	expect(declarationsOf(parsed, ".name_slot")).toMatchObject({ contain: "inline-size", "align-self": "stretch" })
	expect(declarationsOf(parsed, ".account_group")["min-width"]).toBeUndefined()
	expect(declarationsOf(parsed, ".account_col")["min-width"]).toBeUndefined()
})

test("the network chip's row may shrink below its content", () => {
	const chip = elementByTestid(parsed, "network-button")
	expect(chip && boundAttr(chip.ancestors[chip.ancestors.length - 1], "class")).toBe("$style.actions")
	expect(declarationsOf(parsed, ".actions")["min-width"]).toBe("0")
	expect(declarationsOf(parsed, ".network_chip")).toMatchObject({ "min-width": "0", "flex-shrink": "1" })
})
