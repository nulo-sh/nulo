import { describe, expect, it } from "vitest"
import { CAPTION_CHARS, captionAt, captions, resolveCues, type Timings } from "./timeline"

/** Words spaced 0.3 s apart, scenes split where the given texts split. */
function timingsOf(...texts: string[]): Timings {
	let t = 0
	const scenes = texts.map((text, i) => {
		const start = t
		const words = text.split(" ").map((w) => {
			const word = { w, s: t, e: t + 0.25 }
			t += 0.3
			return word
		})
		t += 1
		return { span: { id: `s${i + 1}`, start, end: t, text }, words }
	})
	return { duration: t, scenes: scenes.map((s) => s.span), words: scenes.flatMap((s) => s.words) }
}

describe("resolveCues", () => {
	const timings = timingsOf("the proof goes out.", "the network checks the proof.")
	const [first, second] = timings.scenes as [Timings["scenes"][0], Timings["scenes"][0]]

	it("counts a word's occurrences within its own scene, not the whole narration", () => {
		expect(resolveCues(timings, second, { check: ["proof", 0], again: ["the", 1] })).toEqual({
			check: (timings.words[8] as { s: number }).s,
			again: (timings.words[7] as { s: number }).s,
		})
		expect(resolveCues(timings, first, { out: ["out", 0] }).out).toBeCloseTo(0.9)
	})

	it("throws on a word the scene does not speak, or an occurrence past its last", () => {
		expect(() => resolveCues(timings, first, { x: ["network", 0] })).toThrow(/s1\.x/)
		expect(() => resolveCues(timings, second, { x: ["proof", 1] })).toThrow(/"proof" #1/)
	})
})

describe("captions", () => {
	it("keeps every word in order, within the line length, with no line a stray last word", () => {
		const text = "The network keeps a fingerprint of each note, and a sealed copy only its owner can open."
		const lines = captions(timingsOf(text, "It never needed your private data to trust it."))
		expect(lines.map((l) => l.text).join(" ")).toBe(`${text} It never needed your private data to trust it.`)
		for (const line of lines) expect(line.text.length).toBeLessThanOrEqual(CAPTION_CHARS)
		expect(Math.min(...lines.map((l) => l.text.split(" ").length))).toBeGreaterThan(1)
	})

	it("shows each line until the next begins or its scene ends, and nothing past the end", () => {
		const timings = timingsOf("One sentence here.", "Another one there.")
		const lines = captions(timings)
		expect(captionAt(lines, 0.1)).toBe("One sentence here.")
		expect(captionAt(lines, (timings.scenes[1] as { start: number }).start - 0.05)).toBe("One sentence here.")
		expect(captionAt(lines, timings.duration + 1)).toBe("")
	})
})
