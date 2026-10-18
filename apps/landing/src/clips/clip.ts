import { type CueTable, resolveCues, type SceneSpan, type Timings } from "./timeline"

/** Draws one frame of a scene from the global time `t` and the seconds `local` since the scene began. */
export type Frame = (t: number, local: number) => void

export type Scene = {
	readonly cues: CueTable
	mount(g: SVGGElement, timings: Timings, span: SceneSpan): Frame
}

export type Clip = {
	/** The `data-clip` value of its root on the page. */
	readonly id: string
	/** Seeds the clip's grain, so each clip's feed differs but never changes between visits. */
	readonly seed: number
	readonly timings: Timings
	readonly scenes: Readonly<Record<string, Scene>>
}

/** A scene whose cue names are typed: `build` receives each cue's second by name. */
export function scene<K extends string>(cues: CueTable<K>, build: (g: SVGGElement, at: Readonly<Record<K, number>>) => Frame): Scene {
	return { cues, mount: (g, timings, span) => build(g, resolveCues(timings, span, cues)) }
}
