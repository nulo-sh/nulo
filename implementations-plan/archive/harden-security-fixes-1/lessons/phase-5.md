# Phase 5: titles from the declared name (C5)

- `wireTitle` returns no title for a name with nothing visible left, so each site falls back as it does for a call with no name ("Transaction" for the queued record).
- `primary-method.ts` now imports `sanitizeWireString` from `capability-meta.ts`, which has no imports; `tx-amount.ts` in the same directory already does.
