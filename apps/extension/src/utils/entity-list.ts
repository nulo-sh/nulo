/** A new array without any row that has `item`'s id. */
export function withoutId<T extends { id: unknown }>(list: T[], item: { id: unknown }): T[] {
	return list.filter((row) => row.id !== item.id)
}
