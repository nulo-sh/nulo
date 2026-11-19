/** A balance side, named as its glyph is. */
export type Side = "private" | "public"

/** Which way a row's value moved for its account: `self` is a move between the account's own sides. */
export type RowWay = "out" | "in" | "self"

/**
 * An activity row's direction, drawn as a glyph pair with a corner badge. `from` is null where the
 * wallet cannot know the sending side (a received note, a mint). `label` is the direction in words.
 */
export type RowDirection = { from: Side | null; to: Side; way: RowWay; label: string }

/** What a screen reader reads for the glyphs: a move's badge says the value stayed in the account,
 *  which its label alone does not. */
export function directionWords({ label, way }: RowDirection): string {
	return way === "self" ? `${label}, within this account` : label
}
