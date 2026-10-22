/** ⚠ EXPLICIT RELEASE DECISIONS ONLY. A version listed here ships knowing it BLOCKS backup import
 *  for every older backup it covers (users must re-export), the stored-shape guard's pinned 1.0.0
 *  backups included. Adding an entry requires the release notes to say so. */
export const IMPORT_BLOCKING_ACK: ReadonlySet<number> = new Set([])
