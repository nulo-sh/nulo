/**
 * True when text inside `el` is selected. A press-drag-release inside an element ends in a click
 * on it, so a click handler that copies or opens checks this first: that click selected text, and
 * acting on it too would overwrite the clipboard or leave the page under the selection.
 */
export function selectedWithin(el: EventTarget | null): boolean {
	const selection = window.getSelection()
	return el instanceof Node && !!selection && !selection.isCollapsed && el.contains(selection.anchorNode)
}
