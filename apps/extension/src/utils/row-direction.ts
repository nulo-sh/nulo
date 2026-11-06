/** A balance side, named as its glyph is. */
export type Side = "private" | "public"

/** Which way a row's value moved for its account: `self` is a move between the account's own sides. */
export type RowWay = "out" | "in" | "self"

/**
 * An activity row's direction, drawn as a glyph pair with a corner badge. `from` is null where the
 * wallet cannot know the sending side (a received note, a mint). `label` is the direction in words,
 * the text a screen reader reads in place of the glyphs.
 */
export type RowDirection = { from: Side | null; to: Side; way: RowWay; label: string }
