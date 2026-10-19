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

/** Every mono label drawn directly on a plate or chip that runs past its right border. */
function overruns(node: FakeNode): string[] {
	const box = node.children.find((c) => c.tag === "rect" && /\bc-(plate|chip)\b/.test(c.attrs.get("class") ?? "") && !c.attrs.has("x"))
	const width = Number(box?.attrs.get("width"))
	const own = box
		? node.children.flatMap((label) => {
				const advance = ADVANCE[(label.attrs.get("class") ?? "").split(" ")[0] ?? ""]
				if (label.tag !== "text" || advance === undefined) return []
				const end = Number(label.attrs.get("x")) + [...label.textContent].length * advance
				return end <= width ? [] : [`"${label.textContent}" ends at ${end.toFixed(1)} on a ${width}-wide plate`]
			})
		: []
	return [...own, ...node.children.flatMap(overruns)]
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

	it.each([privateBalances, proofs, fees])("$id keeps every label inside the plate it is drawn on", (clip) => {
		const labels = clip.timings.scenes.flatMap((span) => {
			const g = new FakeNode()
			clip.scenes[span.id]?.mount(g as unknown as SVGGElement, clip.timings, span)
			return overruns(g)
		})
		expect(labels).toEqual([])
	})
})
