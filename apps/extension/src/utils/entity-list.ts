import type { Ref } from "vue"

/** A new array without any row that has `item`'s id. */
export function withoutId<T extends { id: unknown }>(list: T[], item: { id: unknown }): T[] {
	return list.filter((row) => row.id !== item.id)
}

/**
 * A service's add, update and delete handlers for a list a view holds. An add appends, even for a
 * listed id; an update replaces the first row with its id, or appends an unlisted one unless
 * `appendUnlistedUpdate` is false; both work in place, so the array keeps its identity. A delete
 * swaps in a new array without any row of its id.
 */
export function entityListReducers<T extends { id: unknown }>(list: Ref<T[]>, { appendUnlistedUpdate = true } = {}) {
	return {
		onAdded(row: T) {
			list.value.push(row)
		},
		onUpdated(row: T) {
			const idx = list.value.findIndex((listed) => listed.id === row.id)
			if (idx !== -1) list.value[idx] = row
			else if (appendUnlistedUpdate) list.value.push(row)
		},
		onDeleted(row: { id: unknown }) {
			list.value = withoutId(list.value, row)
		},
	}
}
