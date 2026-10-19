import type { GlyphName } from "@nulo/design/core/glyphs.ts"
import { createField, renderFrame } from "../feed"
import type { Clip } from "./clip"
import { CORNERS, glyph, group, node } from "./draw"
import { captionAt, captions, clamp, formatTime, sceneAt } from "./timeline"

const GRAIN_COLS = 90
const GRAIN_ROWS = 28
const GRAIN_FPS = 12

type Player = { pause(): void }

/** The clip whose narration is playing; starting another pauses it, so two voices never overlap. */
let speaking: Player | null = null

/** The feed behind every scene, redrawn only when its 12 fps frame changes. */
function grain(svg: SVGSVGElement, seed: number): (t: number) => void {
	const field = createField(seed)
	const g = group(svg, "c-grain")
	const rows = Array.from({ length: GRAIN_ROWS }, (_, i) => node(g, "text", { x: 0, y: 11 + i * 13 }))
	let shown = -1
	return (t) => {
		const frame = Math.floor(t * GRAIN_FPS)
		if (frame === shown) return
		shown = frame
		const time = frame / GRAIN_FPS
		const lines = renderFrame(field, {
			cols: GRAIN_COLS,
			rows: GRAIN_ROWS,
			time,
			offsetX: time * 0.6,
			offsetY: time * 0.2,
			gain: 0.8,
			subject: false,
		}).split("\n")
		// SVG text collapses runs of spaces; no-break spaces keep the grid.
		rows.forEach((row, i) => {
			row.textContent = (lines[i] ?? "").replaceAll(" ", " ")
		})
	}
}

function buildStage(svg: SVGSVGElement, clip: Clip): (t: number) => void {
	const drawGrain = grain(svg, clip.seed)
	node(svg, "path", { class: "c-corners", d: CORNERS })
	const scenes = clip.timings.scenes.map((span) => {
		const scene = clip.scenes[span.id]
		if (!scene) throw new Error(`clip ${clip.id} has no scene ${span.id}`)
		const g = group(svg)
		return { span, g, frame: scene.mount(g, clip.timings, span) }
	})
	const still = matchMedia("(prefers-reduced-motion: reduce)").matches
	return (t) => {
		const current = sceneAt(clip.timings, t)
		for (const { span, g, frame } of scenes) {
			g.setAttribute("display", span === current ? "inline" : "none")
			// Reduced motion shows each scene's finished picture instead of the tween into it.
			const at = still ? span.end : t
			if (span === current) frame(at, at - span.start)
		}
		drawGrain(still ? 0 : t)
	}
}

function icon(parent: Element, name: GlyphName, cls: string): void {
	const svg = node(parent, "svg", { class: cls, viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" })
	glyph(svg, name, 0, 0, 24, "")
}

type Parts = {
	readonly svg: SVGSVGElement
	readonly stage: HTMLElement
	readonly play: HTMLButtonElement
	readonly seek: HTMLInputElement
	readonly clock: HTMLElement
	readonly caption: HTMLElement
	readonly audio: HTMLAudioElement
}

function findParts(root: HTMLElement): Parts | null {
	const svg = root.querySelector("svg")
	const stage = root.querySelector<HTMLElement>("[data-clip-stage]")
	const play = root.querySelector<HTMLButtonElement>("[data-clip-play]")
	const seek = root.querySelector<HTMLInputElement>("[data-clip-seek]")
	const clock = root.querySelector<HTMLElement>("[data-clip-time]")
	const caption = root.querySelector<HTMLElement>("[data-clip-captions]")
	const audio = root.querySelector("audio")
	if (!(svg && stage && play && seek && clock && caption && audio)) return null
	return { svg, stage, play, seek, clock, caption, audio }
}

function mountClip(root: HTMLElement, clip: Clip): void {
	const parts = findParts(root)
	if (!parts) return
	const { svg, stage, play, seek, clock, caption, audio } = parts
	const draw = buildStage(svg, clip)
	const lines = captions(clip.timings)
	// The file is the authority on length once loaded; until then (preload="none") the alignment is.
	const total = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : clip.timings.duration)
	// A source that failed to load leaves `paused` false: the spec's failure steps set only `networkState`.
	// `error` alone is no sign, since Firefox sets it when the audio output fails and keeps playing.
	const unloaded = () => audio.networkState === audio.NETWORK_NO_SOURCE
	const playing = () => !audio.paused && !audio.ended && !unloaded()
	let raf = 0

	const render = () => {
		const t = clamp(audio.currentTime, 0, total())
		draw(t)
		caption.textContent = audio.ended ? "" : captionAt(lines, t)
		seek.max = String(Math.ceil(total()))
		seek.value = String(t)
		seek.setAttribute("aria-valuetext", `${formatTime(t)} of ${formatTime(total())}`)
		clock.textContent = `${formatTime(t)} / ${formatTime(total())}`
		play.setAttribute("aria-label", playing() ? "Pause" : "Play")
		root.dataset.state = playing() ? "playing" : audio.ended ? "ended" : t === 0 ? "idle" : "paused"
	}
	const tick = () => {
		render()
		raf = playing() ? requestAnimationFrame(tick) : 0
	}
	const player: Player = { pause: () => audio.pause() }
	// play() runs inside the click: browsers refuse playback a gesture did not start.
	const toggle = () => {
		if (playing()) return audio.pause()
		if (unloaded()) audio.load()
		if (audio.currentTime >= total() - 0.05) audio.currentTime = 0
		audio.play().catch(render)
	}

	icon(play, "play", "clip__icon clip__icon--play")
	icon(play, "pause", "clip__icon clip__icon--pause")
	icon(root.querySelector(".clip__poster") ?? stage, "play", "clip__icon")
	play.addEventListener("click", toggle)
	stage.addEventListener("click", toggle)
	seek.addEventListener("input", () => {
		audio.currentTime = Number(seek.value)
		render()
	})
	// Here rather than in the click, so playback started by media keys or the browser's controls counts too.
	audio.addEventListener("play", () => {
		if (speaking !== player) speaking?.pause()
		speaking = player
		cancelAnimationFrame(raf)
		tick()
	})
	for (const event of ["pause", "ended", "seeked", "durationchange", "error"]) audio.addEventListener(event, render)
	// Frames stop in a hidden tab while sound would go on; pausing keeps picture and voice together.
	document.addEventListener("visibilitychange", () => document.hidden && audio.pause())
	render()
}

export function mountClips(clips: readonly Clip[]): void {
	for (const root of document.querySelectorAll<HTMLElement>("[data-clip]")) {
		const clip = clips.find((c) => c.id === root.dataset.clip)
		if (clip) mountClip(root, clip)
	}
}
