/** A narrated clip's clock: scene spans and word times from the narration's alignment, in seconds. Pure. */

export type Word = { readonly w: string; readonly s: number; readonly e: number }
export type SceneSpan = { readonly id: string; readonly start: number; readonly end: number; readonly text: string }
export type Timings = { readonly duration: number; readonly scenes: readonly SceneSpan[]; readonly words: readonly Word[] }
export type Caption = { readonly start: number; readonly end: number; readonly text: string }

/** Names a spoken word and its occurrence within its own scene, so editing one scene never moves another's cues. */
export type CueTable<K extends string = string> = Readonly<Record<K, readonly [word: string, nth: number]>>

/** Longest caption line, in characters: one line in a card at desktop width, at most two on a phone. */
export const CAPTION_CHARS = 42
/** A line this long may also end at a comma or colon, so lines follow the spoken phrasing. */
const CLAUSE_CHARS = 18

export const clamp = (x: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, x))
const ease = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
/** 0 before `a`, 1 after `b`, eased between; a step at `a` when `b <= a`, never NaN. Every tween is built
 *  from it, so a frame depends on time alone. */
export const seg = (t: number, a: number, b: number): number => (b > a ? ease(clamp((t - a) / (b - a))) : t < a ? 0 : 1)
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

export const formatTime = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`

export function sceneAt(timings: Timings, t: number): SceneSpan {
	return timings.scenes.find((s) => t < s.end) ?? (timings.scenes.at(-1) as SceneSpan)
}

const wordsIn = (timings: Timings, scene: SceneSpan): Word[] => timings.words.filter((w) => w.s >= scene.start && w.s < scene.end)
const bare = (w: string): string => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")

/** The second each cue's word starts; throws on a word the scene does not speak, so a mistyped cue fails its test. */
export function resolveCues<K extends string>(timings: Timings, scene: SceneSpan, table: CueTable<K>): Record<K, number> {
	const words = wordsIn(timings, scene)
	const entries = (Object.entries(table) as [K, readonly [string, number]][]).map(([name, [word, nth]]) => {
		const hit = words.filter((w) => bare(w.w) === bare(word))[nth]
		if (!hit) throw new Error(`cue ${scene.id}.${name}: "${word}" #${nth} is not spoken in the scene`)
		return [name, hit.s] as const
	})
	return Object.fromEntries(entries) as Record<K, number>
}

const textLength = (line: readonly Word[]): number => line.reduce((n, w) => n + w.w.length, line.length - 1)

function phrases(words: readonly Word[]): Word[][] {
	const out: Word[][] = [[]]
	for (const word of words) {
		const phrase = out.at(-1) as Word[]
		phrase.push(word)
		if (/[.?!]$/.test(word.w) || (/[,:]$/.test(word.w) && textLength(phrase) >= CLAUSE_CHARS)) out.push([])
	}
	return out.filter((p) => p.length > 0)
}

/** A phrase too long for one line becomes the fewest lines that fit, of even length, so none is a stray word. */
function balance(phrase: readonly Word[]): Word[][] {
	const target = textLength(phrase) / Math.ceil(textLength(phrase) / CAPTION_CHARS)
	const lines: Word[][] = [[]]
	for (const word of phrase) {
		const line = lines.at(-1) as Word[]
		if (line.length > 0 && (textLength(line) >= target || textLength([...line, word]) > CAPTION_CHARS)) lines.push([word])
		else line.push(word)
	}
	return lines
}

function sceneCaptions(words: readonly Word[], end: number): Caption[] {
	const lines = phrases(words).flatMap(balance)
	return lines.map((l, i) => ({
		start: (l[0] as Word).s,
		end: (lines[i + 1]?.[0] as Word | undefined)?.s ?? end,
		text: l.map((w) => w.w).join(" "),
	}))
}

/** Caption lines per scene, at most CAPTION_CHARS long and following the spoken phrasing. A line
 *  shows from its first word until the next line starts, and the last one until its scene ends. */
export function captions(timings: Timings): Caption[] {
	return timings.scenes.flatMap((scene) => sceneCaptions(wordsIn(timings, scene), scene.end))
}

export function captionAt(lines: readonly Caption[], t: number): string {
	return lines.find((c) => t >= c.start && t < c.end)?.text ?? ""
}

const vttTime = (t: number): string => {
	const ms = Math.round(t * 1000)
	const pad = (n: number, w = 2) => String(n).padStart(w, "0")
	return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`
}

export function toVtt(lines: readonly Caption[]): string {
	return `WEBVTT\n\n${lines.map((c) => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}\n`).join("\n")}`
}
