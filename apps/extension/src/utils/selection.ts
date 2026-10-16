/**
 * True when the selection takes in any of `el`'s text. A press-drag-release inside an element, or
 * a Shift-click that extends a selection into it, ends in a click on it, so a click handler that
 * copies or opens checks this first: acting on that click too would overwrite the clipboard or
 * leave the page under the selection.
 */
export function selectedWithin(el: EventTarget | null): boolean {
	const selection = window.getSelection()
	if (!(el instanceof Node) || !selection || selection.isCollapsed) return false
	for (let i = 0; i < selection.rangeCount; i++) {
		if (selection.getRangeAt(i).intersectsNode(el)) return true
	}
	return false
}
