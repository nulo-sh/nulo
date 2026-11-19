/** Where an inline popover's card sits, in viewport pixels. `maxHeight` is set only when the card is
 *  taller than the room on the side it opens, and it then scrolls inside. */
export type CardPlacement = { top: number; left: number; width: number; maxHeight?: number }

type Box = { x: number; y: number; width: number; height: number }

/** Between the trigger and the card, and between the card and the view's edge. */
const GAP = 8

/**
 * The card ends at its trigger's right edge, as a left-side popover does, but never leaves the view:
 * it narrows to the view's width less both margins, slides right or left to stay inside, opens above
 * when below has too little room and above has more, and caps its height at the room it has.
 */
export function placeCard(trigger: Box, card: { width: number; height: number }, view: { width: number; height: number }): CardPlacement {
	const width = Math.max(0, Math.min(card.width, view.width - 2 * GAP))
	const left = Math.max(GAP, Math.min(trigger.x + trigger.width - width, view.width - GAP - width))
	const below = view.height - (trigger.y + trigger.height) - 2 * GAP
	const above = trigger.y - 2 * GAP
	if (card.height <= below || below >= above) {
		return { top: trigger.y + trigger.height + GAP, left, width, ...(card.height > below ? { maxHeight: Math.max(0, below) } : {}) }
	}
	const height = Math.min(card.height, above)
	return { top: trigger.y - GAP - height, left, width, ...(card.height > above ? { maxHeight: above } : {}) }
}
