/**
 * The clips' drawing kit, in the landing's look: plates with corner ticks, mono labels and the wallet's
 * own glyphs on a 640×360 stage. A scene builds its elements once; each frame only rewrites attributes,
 * so a seek in either direction redraws the right picture.
 */
import { type GlyphName, glyphs } from "@nulo/design/core/glyphs.ts"
import { clamp } from "./timeline"

const NS = "http://www.w3.org/2000/svg"
const MONO_ADVANCE = 0.6

type Attrs = Readonly<Record<string, string | number>>

export function node<K extends keyof SVGElementTagNameMap>(
	parent: Element,
	tag: K,
	attrs: Attrs = {},
	text?: string,
): SVGElementTagNameMap[K] {
	const el = document.createElementNS(NS, tag)
	for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value))
	if (text !== undefined) el.textContent = text
	parent.append(el)
	return el
}

export const group = (parent: Element, cls?: string): SVGGElement => node(parent, "g", cls ? { class: cls } : {})

/** Opacity in [0, 1]. Elements stay in the tree when invisible, so going back in time only rewrites values. */
export const show = (el: Element, k: number): void => el.setAttribute("opacity", clamp(k).toFixed(3))

export function place(el: Element, x: number, y: number, scale = 1): void {
	el.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})`)
}

/** Width of `chars` mono characters at `size`; layouts assume the page's mono face, whose advance is 0.6 em. */
export const monoWidth = (chars: number, size: number): number => chars * size * MONO_ADVANCE

export function plate(parent: Element, x: number, y: number, w: number, h: number): SVGGElement {
	const g = group(parent)
	place(g, x, y)
	node(g, "rect", { class: "c-plate", width: w, height: h })
	node(g, "path", { class: "c-tick", d: `M 0 10 V 0 H 10 M ${w - 10} ${h} H ${w} V ${h - 10}` })
	return g
}

/** `cls` picks the face and colour: `c-eb` (small mono caps), `c-mono`, `c-num` (large mono), `c-head`. */
export function text(parent: Element, x: number, y: number, content: string, cls = "c-eb"): SVGTextElement {
	return node(parent, "text", { class: cls, x, y }, content)
}

/** A glyph from the wallet's set, `size` units square, its top-left at (x, y); colour from `cls`. */
export function glyph(parent: Element, name: GlyphName, x: number, y: number, size: number, cls = "c-ink"): SVGGElement {
	const g = group(parent, `c-glyph ${cls}`)
	place(g, x, y, size / 24)
	const shape: { s?: readonly string[]; f?: readonly string[] } = glyphs[name]
	for (const d of shape.s ?? []) node(g, "path", { class: "c-glyph-s", d })
	for (const d of shape.f ?? []) node(g, "path", { class: "c-glyph-f", d })
	return g
}

/** A line of mono text whose spans light up separately: a dim copy under an ink copy whose spans fade in. */
export type LitLine = { readonly g: SVGGElement; light(index: number, k: number): void }

export function litLine(parent: Element, parts: readonly string[], cls = "c-mono"): LitLine {
	const g = group(parent)
	node(g, "text", { class: `${cls} c-dim-fill` }, parts.join(""))
	const ink = node(g, "text", { class: `${cls} c-ink-fill` })
	const spans = parts.map((part) => node(ink, "tspan", { "fill-opacity": 0 }, part))
	return {
		g,
		light: (index, k) => spans[index]?.setAttribute("fill-opacity", clamp(k).toFixed(3)),
	}
}

/** The public record as a plate of mono lines; `line(i)` is the baseline of row i. */
export type RecordPlate = { readonly g: SVGGElement; line(i: number): number }

export function record(parent: Element, x: number, y: number, w: number, h: number, title = "PUBLIC RECORD"): RecordPlate {
	const g = plate(parent, x, y, w, h)
	text(g, 16, 30, title)
	return { g, line: (i) => 68 + i * 34 }
}

/** An open note: a plate showing its amount, `w` wide. */
export function note(parent: Element, amount: string, w = 112): SVGGElement {
	const g = group(parent)
	node(g, "rect", { class: "c-plate", width: w, height: 52 })
	node(g, "path", { class: "c-tick", d: `M 0 8 V 0 H 8 M ${w - 8} 52 H ${w} V 44` })
	text(g, 14, 35, amount, "c-num c-ink-fill")
	return g
}

/** A track with a fill; `set(k)` fills it to the fraction k. */
export function bar(parent: Element, x: number, y: number, w: number, h = 10): (k: number) => void {
	node(parent, "rect", { class: "c-track", x, y, width: w, height: h })
	const fill = node(parent, "rect", { class: "c-fill", x, y, width: 0, height: h })
	return (k) => fill.setAttribute("width", (w * clamp(k)).toFixed(2))
}

/** A path drawn on from its start: `set(k)` reveals the fraction k of its length. */
export function stroke(parent: Element, d: string, cls = "c-wire"): (k: number) => void {
	const path = node(parent, "path", { class: cls, d, pathLength: 1, "stroke-dasharray": "1 1" })
	return (k) => path.setAttribute("stroke-dashoffset", (1 - clamp(k)).toFixed(4))
}
