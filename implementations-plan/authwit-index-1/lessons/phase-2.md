# authwit-index-1: phase 2 (arc 2, OA-1 = B)

- Base: `origin/dev` at `51ea220b1`, arc 1 merged as `cadc6f86d`; `bun install --frozen-lockfile` clean.
- Codex plan R1 (gpt-6.1-sol, high, read-only): conditional approve. Accepted: the recorder's clear runs at `submitting` (the failure transition comes after the recorder) and after every landed inline write; `listing` is judged before the url and inclusion branches; a failed-listing retry test; `sent` with and without a block; the P1 staging details; the shared grant fixture's hash was above the field modulus; `expired` is terminal. Rejected: rewriting the composition file's header link (CLAUDE.md allows it until that comment is rewritten).
- Opus plan R1 (Plan): conditional approve. Accepted: a P3 composition case; P1 started as the runtime starts the reaper and the check; never-happens checks after each write; `succeeded` drops the field; Security wording; the account residual. Rejected: dropping the recorder's clear (plan D10).
- First composition run: the three new cases timed out in `waitFor`. Cause: arc 1's composition `HASH` (`0x3e…`) is above the field modulus, so the send check's `TxHash.fromString` threw and every read was a read error. Fixed by a hash below the modulus; rerun green at retry 0.
- A zsh loop over an unquoted string did not split it (zsh does not word-split `$VAR`); the chain stopped before any checkout, nothing was lost. Redone with an array after committing.
- Red proofs at retry 0, base sources with the new tests: 8 fail (P1, P2, P3 composition, the reverted control's kept field, four send-check listing cases); restored and green.
- Storage: one golden `journal.authwits` (stamp 1, sealed), `bun run baseline:storage -- --additive "..."` appended stamp 1, its pin added; `src/wallet/storage/` 120 tests green at retry 0.
- `bun run test` red once (139 s): `execution-lane.test.ts` pins the arguments `commitJournal` passes to the journal; it now also pins the field riding through. Rerun next.
