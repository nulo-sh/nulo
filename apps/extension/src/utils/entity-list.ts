import type { Ref } from "vue"

/** A new array without any row that has `item`'s id. */
export function withoutId<T extends { id: unknown }>(list: T[], item: { id: unknown }): T[] {
	return list.filter((row) => row.id !== item.id)
}

/**
 * The contact service's event handlers for a list the popup holds. An add appends, even for a
 * listed id; an update replaces the first row with its id, or appends; both work in place, so the
 * array keeps its identity. A delete swaps in a new array without any row of its id.
 */
export function contactListReducers<T extends { id: unknown }>(list: Ref<T[]>) {
	return {
		onAdded(row: T) {
			list.value.push(row)
		},
		onUpdated(row: T) {
			const idx = list.value.findIndex((listed) => listed.id === row.id)
			if (idx === -1) list.value.push(row)
			else list.value[idx] = row
		},
		onDeleted(row: { id: unknown }) {
			list.value = withoutId(list.value, row)
		},
	}
}
