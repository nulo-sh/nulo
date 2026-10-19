import { beforeAll, describe, expect, it, vi } from "vitest"
import { fees } from "./fees"
import { privateBalances } from "./private-balances"
import { proofs } from "./proofs"

/** Just the DOM surface the drawing kit uses, so every scene can be built and swept in Node. */
class FakeNode {
	constructor(readonly tag = "") {}
	readonly attrs = new Map<string, string>()
	readonly children: FakeNode[] = []
	textContent = ""
	setAttribute(name: string, value: string): void {
		this.attrs.set(name, value)
	}
	append(child: FakeNode): void {
		this.children.push(child)
	}
}

const snapshot = (node: FakeNode): string => `${[...node.attrs].join(";")}|${node.textContent}[${node.children.map(snapshot).join(",")}]`

const STEP = 0.1

/** Advance per character of each mono label face the stage sets: the font's 0.6 em, plus `c-eb`'s 0.12 em tracking. */
const ADVANCE: Readonly<Record<string, number>> = { "c-num": 26 * 0.6, "c-mono": 20 * 0.6, "c-eb": 20 * 0.72 }

/** The space every label keeps from the left and right borders of the plate, note or chip it is drawn in. */
const INSET = 14

type Frame = { readonly x: number; readonly scale: number }

const boxWidth = (node: FakeNode): number | undefined => {
	const rect = node.children.find((c) => c.tag === "rect" && /\bc-(plate|chip)\b/.test(c.attrs.get("class") ?? "") && !c.attrs.has("x"))
	return rect === undefined ? undefined : Number(rect.attrs.get("width"))
}

/** The frame a group's children are drawn in, after its `place()` transform. */
function within(node: FakeNode, at: Frame): Frame {
	const m = /translate\((\S+) \S+\) scale\((\S+)\)/.exec(node.attrs.get("transform") ?? "")
	return m ? { x: at.x + Number(m[1]) * at.scale, scale: at.scale * Number(m[2]) } : at
}

/** Every mono label, at any depth, nearer than INSET to either side of the innermost box it is drawn in. */
function crowded(node: FakeNode, box?: number, at: Frame = { x: 0, scale: 1 }): string[] {
	const own = boxWidth(node)
	const width = own ?? box
	const frame = own === undefined ? within(node, at) : { x: 0, scale: 1 }
	return node.children.flatMap((child) => {
		if (child.tag !== "text") return crowded(child, width, frame)
		const advance = ADVANCE[(child.attrs.get("class") ?? "").split(" ")[0] ?? ""]
		const label = child.textContent || child.children.map((c) => c.textContent).join("")
		if (width === undefined || advance === undefined || !label) return []
		const left = frame.x + Number(child.attrs.get("x") ?? 0) * frame.scale
		const right = left + [...label].length * advance * frame.scale
		return left >= INSET && right <= width - INSET ? [] : [`"${label}" spans ${left.toFixed(1)} to ${right.toFixed(1)} in ${width}`]
	})
}

beforeAll(() => {
	vi.stubGlobal("document", { createElementNS: (_: string, tag: string) => new FakeNode(tag) })
})

describe("scenes", () => {
	it.each([privateBalances, proofs, fees])("$id draws each second the same whatever came before, with finite values", (clip) => {
		const scenes = clip.timings.scenes.map((span) => {
			const g = new FakeNode()
			const frame = clip.scenes[span.id]?.mount(g as unknown as SVGGElement, clip.timings, span)
			if (!frame) throw new Error(`no scene ${span.id}`)
			return { span, g, frame }
		})
		const times = Array.from({ length: Math.ceil(clip.timings.duration / STEP) }, (_, i) => i * STEP)
		const draw = (t: number): string => {
			const scene = scenes.find((s) => t < s.span.end) ?? (scenes.at(-1) as (typeof scenes)[number])
			scene.frame(t, t - scene.span.start)
			return snapshot(scene.g)
		}
		const forward = times.map(draw)
		const backward = times.toReversed().map(draw).toReversed()

		expect(backward).toEqual(forward)
		expect(forward.join("")).not.toMatch(/NaN|Infinity/)
		for (const { span } of scenes) {
			const own = times.filter((t) => t >= span.start && t < span.end).map((t) => forward[times.indexOf(t)])
			expect(own[0], `${clip.id} ${span.id} moves`).not.toBe(own.at(-1))
		}
	})

	it.each([privateBalances, proofs, fees])("$id keeps every label 14 units inside the box it is drawn in", (clip) => {
		const labels = clip.timings.scenes.flatMap((span) => {
			const g = new FakeNode()
			const frame = clip.scenes[span.id]?.mount(g as unknown as SVGGElement, clip.timings, span)
			frame?.(span.end - 0.01, span.end - 0.01 - span.start)
			return crowded(g)
		})
		expect(labels).toEqual([])
	})
})
