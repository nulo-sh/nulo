/**
 * True when the selection holds any of `el`'s text. A press-drag-release inside an element, or a
 * Shift-click that extends a selection into it, ends in a click on it, so a click handler that
 * copies or opens checks this first: acting on that click too would overwrite the clipboard or
 * leave the page under the selection. A selection that only reaches the element's edge, as a
 * triple-click above it leaves, holds none of it.
 */
export function selectedWithin(el: EventTarget | null): boolean {
	const selection = window.getSelection()
	if (!(el instanceof Node) || !el.isConnected || !selection || selection.isCollapsed) return false
	for (let i = 0; i < selection.rangeCount; i++) {
		const range = selection.getRangeAt(i)
		const overlap = document.createRange()
		overlap.selectNodeContents(el)
		// A boundary past the other collapses the overlap, so a range outside `el` leaves it empty.
		if (range.compareBoundaryPoints(Range.START_TO_START, overlap) > 0) overlap.setStart(range.startContainer, range.startOffset)
		if (range.compareBoundaryPoints(Range.END_TO_END, overlap) < 0) overlap.setEnd(range.endContainer, range.endOffset)
		if (overlap.toString() !== "") return true
	}
	return false
}

/** A pointer click that ends a selection inside its target; Enter and Space reach a native button
 *  as a click with `detail` 0, so a key copies even over a selection. */
export function endsSelection(e: MouseEvent): boolean {
	return e.detail > 0 && selectedWithin(e.currentTarget)
}
