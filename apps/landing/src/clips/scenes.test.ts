import { beforeAll, describe, expect, it, vi } from "vitest"
import { fees } from "./fees"
import { privateBalances } from "./private-balances"
import { proofs } from "./proofs"

/** Just the DOM surface the drawing kit uses, so every scene can be built and swept in Node. */
class FakeNode {
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

beforeAll(() => {
	vi.stubGlobal("document", { createElementNS: () => new FakeNode() })
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
})
