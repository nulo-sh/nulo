/**
 * How an operation-journal event lands in a list that mirrors part of the journal. Pure: each
 * returns a new array. An update keeps a listed row where it is; `place` decides where a row the
 * list has not seen goes, and what an add does to a listed one. Which events a list accepts is its
 * own choice, made before these run.
 */

export type JournalRow = { id: string }

/** `front` keeps the list newest first; `back` keeps the order rows arrived in. */
export type JournalPlace = "front" | "back"

/** At the `front`, a listed id moves to the front; at the `back`, it is replaced where it is. */
export function journalAdded<T extends JournalRow>(rows: readonly T[], op: T, place: JournalPlace): T[] {
	if (place === "front") return [op, ...rows.filter((row) => row.id !== op.id)]
	return journalUpdated(rows, op, "back")
}

export function journalUpdated<T extends JournalRow>(rows: readonly T[], op: T, place: JournalPlace): T[] {
	const idx = rows.findIndex((row) => row.id === op.id)
	if (idx !== -1) return rows.map((row, i) => (i === idx ? op : row))
	return place === "front" ? [op, ...rows] : [...rows, op]
}

export function journalDeleted<T extends JournalRow>(rows: readonly T[], op: JournalRow): T[] {
	return rows.filter((row) => row.id !== op.id)
}
