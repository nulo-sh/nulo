import type { Pin } from "./baseline"

/**
 * One pin per stamp of `snapshot.json`, added by hand from the line `bun run baseline:storage`
 * prints. Empty until the baseline is frozen, and while it is empty the one stamp may be rewritten;
 * once it is not, the stamps are append-only. A pin is never edited or removed.
 */
export const PINNED_STAMPS: readonly Pin[] = []
