# Owner asks: harden-security-fixes-1

One ask. Every other change is invisible for conforming input (plan.md § Phases, the `UI impact` lines).

## OA-1. The row limits of a backup's token and balance slices, and the reason shown at them

**Surface:** Settings, full backup import, the "Import failed" error row (`useFullBackupImport.ts:168-174`).

**Today:** a backup's token and balance slices have no row limit; each row is restored in turn.

**After the change:** a slice over its limit (1024 token rows, 16384 balance rows) is refused before anything is written. The row keeps its title, "Import failed", and its template, "The backup could not be upgraded to the current format: <reason>". Only the reason is new. Export gets no limit, so a profile above a limit could export a backup this build refuses; no profile seen holds a tenth of either limit.

| Option | Reason text |
|---|---|
| **A. The existing reason format** | `slice "token-balance" has 20000 rows, over its limit of 16384` (the shape of today's `slice "token" row 3 has a missing or malformed id`) |
| **B. Plain words** | `This backup holds more tokens or balances than Nulo can restore.` |

The limits themselves are part of the ask: raise them, or also limit export, if you expect larger profiles.

**Recommendation: A, with the limits as above.** Every other refusal in that row uses this format.

**What ships now: A, with the limits as above.**
