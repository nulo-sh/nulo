import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { fees } from "./fees"
import { privateBalances } from "./private-balances"
import { proofs } from "./proofs"
import { captions, resolveCues, toVtt } from "./timeline"

const CLIPS = [privateBalances, proofs, fees]
const landing = resolve(import.meta.dirname, "../..")
const page = readFileSync(resolve(landing, "how-aztec-works.html"), "utf8")
const MAX_MEDIA_BYTES = 20 * 1024 * 1024

/** The markup of one clip's root, from its `data-clip` to the end of its card. */
const block = (id: string): string =>
	page.slice(page.indexOf(`data-clip="${id}"`), page.indexOf("</article>", page.indexOf(`data-clip="${id}"`)))
const fileAt = (src: string): string => resolve(landing, src.replace(/^\//, ""))
const flat = (s: string): string => s.replace(/\s+/g, " ").trim()

describe("clips", () => {
	it("the page holds one player per clip, in order", () => {
		expect([...page.matchAll(/data-clip="([^"]+)"/g)].map((m) => m[1])).toEqual(CLIPS.map((c) => c.id))
	})

	it.each(CLIPS)("$id draws every narrated scene, and each cue is a word the scene speaks", (clip) => {
		expect(Object.keys(clip.scenes)).toEqual(clip.timings.scenes.map((s) => s.id))
		for (const span of clip.timings.scenes) {
			const cues = resolveCues(clip.timings, span, clip.scenes[span.id]?.cues ?? {})
			for (const at of Object.values(cues)) expect(at).toBeGreaterThanOrEqual(span.start)
		}
	})

	it.each(CLIPS)("$id waits for a press, ships its captions track, and its transcript is the narration", (clip) => {
		const markup = block(clip.id)
		const audio = /<audio src="([^"]+)" preload="none">/.exec(markup)
		const track = /<track kind="captions" src="([^"]+)" srclang="en" label="English" default \/>/.exec(markup)
		expect(audio?.[1]).toBe(`/src/clips/media/${clip.id}.mp3`)
		expect(markup).not.toMatch(/autoplay/i)
		expect(readFileSync(fileAt(track?.[1] ?? ""), "utf8")).toBe(toVtt(captions(clip.timings)))
		const transcript = [...(markup.split('<details class="transcript">')[1] ?? "").matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) =>
			flat(m[1] ?? ""),
		)
		expect(transcript).toEqual(clip.timings.scenes.map((s) => s.text))
	})

	it("the media files exist and stay within the page's media budget", () => {
		const bytes = CLIPS.map((clip) => fileAt(`/src/clips/media/${clip.id}.mp3`)).map((path) =>
			existsSync(path) ? statSync(path).size : 0,
		)
		for (const size of bytes) expect(size).toBeGreaterThan(0)
		expect(bytes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MAX_MEDIA_BYTES)
	})
})
