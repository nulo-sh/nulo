/** Pictures more than one clip draws: a ledger entry, a balance row, the laptop. */
import { glyph, group, litLine, node, place, plate, text } from "./draw"

/** One entry of the public record: a kind in small caps over a mono value, 64 units tall. */
export type Entry = { readonly g: SVGGElement; light(k: number): void }

export function entry(parent: Element, y: number, kind: string, value: string, w = 248): Entry {
	const g = group(parent)
	place(g, 16, y)
	node(g, "line", { class: "c-rule", x1: 0, x2: w, y1: 46, y2: 46 })
	text(g, 0, 0, kind)
	const line = litLine(g, [value])
	place(line.g, 0, 28)
	return { g, light: (k) => line.light(0, k) }
}

export type BalanceRow = { readonly g: SVGGElement; readonly amount: SVGTextElement; light(k: number): void }

/** `stacked` puts the amount under the label, for a narrow card. */
export function balanceRow(parent: Element, kind: "private" | "public", amount: string, stacked = false): BalanceRow {
	const g = group(parent)
	glyph(g, kind, 0, -22, 28)
	const label = litLine(g, [kind.toUpperCase()], "c-eb")
	place(label.g, 40, -1)
	const value = stacked ? text(g, 40, 38, amount, "c-num c-ink-fill") : text(g, 166, 0, amount, "c-num c-ink-fill")
	return { g, amount: value, light: (k) => label.light(0, k) }
}

/** A laptop outline: a plate for its screen over a mitred base. Children go in `screen`, origin at its top-left. */
export function laptop(
	parent: Element,
	x: number,
	y: number,
	w: number,
	h: number,
): { readonly g: SVGGElement; readonly screen: SVGGElement } {
	const g = group(parent)
	place(g, x, y)
	const screen = plate(g, 0, 0, w, h)
	node(g, "path", { class: "c-outline", d: `M -14 ${h + 18} L 0 ${h + 4} H ${w} L ${w + 14} ${h + 18} Z` })
	return { g, screen }
}
