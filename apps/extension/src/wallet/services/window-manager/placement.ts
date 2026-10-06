/**
 * Where a window opens relative to the window it belongs to. Pure, so a page can place a window
 * without loading the window manager.
 */
import type { WindowBounds } from "@nulo/wallet-core/ports"

function completeBounds(anchor: WindowBounds | undefined): Required<WindowBounds> | undefined {
	if (!anchor) return undefined
	const { left, top, width, height } = anchor
	if ([left, top, width, height].some((n) => typeof n !== "number")) return undefined
	return anchor as Required<WindowBounds>
}

/** Center a `width`×`height` window on `anchor`. Signed arithmetic: a display
 *  left of or above the primary has negative coordinates, so never clamp.
 *  `{}` (let Chrome pick) when the anchor or any of its bounds is missing. */
export function centerOn(anchor: WindowBounds | undefined, width: number, height: number): { left?: number; top?: number } {
	const bounds = completeBounds(anchor)
	if (!bounds) return {}
	return {
		left: Math.round(bounds.left + (bounds.width - width) / 2),
		top: Math.round(bounds.top + (bounds.height - height) / 2),
	}
}

/** A `width`-wide window flush with `anchor`'s right edge and top, no taller than the anchor.
 *  Signed coordinates, never clamped: a display left of or above the primary is negative. A
 *  missing or partial anchor yields no position and the requested height, so the browser picks. */
export function topRightOf(
	anchor: WindowBounds | undefined,
	width: number,
	height: number,
): { left?: number; top?: number; height: number } {
	const bounds = completeBounds(anchor)
	if (!bounds) return { height }
	return { left: bounds.left + bounds.width - width, top: bounds.top, height: Math.min(height, bounds.height) }
}
