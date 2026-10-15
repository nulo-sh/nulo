/** When a publish raises the compiled sequence floor. No import: `publish-pr` runs it with `bun --no-install`. */

export const FLOOR_PATH = "packages/token-list/src/floor.json"

type Pair = { chainId: unknown; address: unknown }
export type ListPairs = { tokens: readonly Pair[]; flagged: readonly Pair[] }

const keyOf = (pair: Pair) => `${pair.chainId}:${pair.address}`

/**
 * True when `next` drops a token `served` lists, or flags a pair `served` did not flag: an older
 * list would bring either back, so every wallet built after it must refuse one. An addition, a
 * re-listing, an unflag or a changed field moves nothing.
 */
export function raisesFloor(served: ListPairs, next: ListPairs): boolean {
	const listed = new Set(next.tokens.map(keyOf))
	const flagged = new Set(served.flagged.map(keyOf))
	return served.tokens.some((token) => !listed.has(keyOf(token))) || next.flagged.some((pair) => !flagged.has(keyOf(pair)))
}

/** `floor.json` in the tree's canonical form, which `check.ts` holds it to. */
export function floorText(sequence: number): string {
	return `${JSON.stringify({ sequence }, null, "\t")}\n`
}
