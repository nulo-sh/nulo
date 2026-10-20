import type { GlyphName, TextColorName } from "@nulo/design"

export type TakeoverMark = "check" | "cross" | "swap"
export type TakeoverLine = { text: string; mark?: TakeoverMark; number?: number; testid?: string }
/** `guarded`: a start, disabled while one is starting, in whichever slot it sits. The primary always is. */
export type TakeoverAction = { text: string; testid: string; action: () => unknown; guarded?: boolean }
export type TakeoverContent = {
	/** `color` defaults to `txt-warning`. */
	eyebrow: { icon: GlyphName; text: string; color?: TextColorName }
	title: string
	body: string
	notice?: string
	box?: { label?: string; lines: TakeoverLine[] }
	note?: string
	primary: TakeoverAction
	secondary?: TakeoverAction
	tertiary?: TakeoverAction
}
/** Tighter gaps that keep the buttons' margin when the content runs a line long. */
export type TakeoverDensity = "dense_notice" | "dense_tight"
