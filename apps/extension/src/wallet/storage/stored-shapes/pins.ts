import type { Pin } from "./baseline"

/**
 * One pin per stamp of `snapshot.json`, added by hand from the line `bun run baseline:storage`
 * prints. Stamp 0 is the baseline 1.0.0 stores; with a pin present the stamps are append-only. A pin
 * is never edited or removed.
 */
export const PINNED_STAMPS: readonly Pin[] = [
	{
		stamp: "33d3ad02fd5a8b639d161a945784edd6253b29fb47708fb67a1e952cd39755e7",
		goldens: "ab6c0dbeaaa1421d455dd80f87176f2766b7b5f125e60ea53c0ca7b7fc06a653",
	},
]
