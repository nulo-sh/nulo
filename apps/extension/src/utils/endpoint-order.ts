/** `ids` with the one at `from` moved to `to`, clamped to the list. */
export function moveId(ids: readonly string[], from: number, to: number): string[] {
	const next = [...ids]
	const [moved] = next.splice(from, 1)
	if (moved === undefined) return next
	next.splice(Math.min(Math.max(to, 0), next.length), 0, moved)
	return next
}

/** Each id's 1-based place if the row lifted from `from` were dropped at `to`. */
export function placesWhileLifted(ids: readonly string[], from: number, to: number): Record<string, number> {
	return Object.fromEntries(moveId(ids, from, to).map((id, i) => [id, i + 1]))
}

/** The order a tap makes: the tapped row first, the others as shown. */
export function tapOrder(ids: readonly string[], tapped: string): string[] {
	return [tapped, ...ids.filter((id) => id !== tapped)]
}

/** The order Settings shows and the route asks: the primary, then the rest as stored. A list whose
 *  primary is missing keeps its stored order. */
export function routeOrder<E extends { id: string }>(endpoints: readonly E[], primaryId: string): E[] {
	const primary = endpoints.find((e) => e.id === primaryId)
	return primary ? [primary, ...endpoints.filter((e) => e !== primary)] : [...endpoints]
}
