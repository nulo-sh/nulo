# Phase 0: planning consults

## Plan audit, Codex round 1 (2026-10-19)

- gpt-6.1-sol, high, read-only, session `01a153ae-f6e5-71b1-b94d-9694d447e7a8`. Verdict: `conditional approve` (correct F8 and the scope claims; strengthen the Send and retry controls).
- F1 (Medium, demonstrated ordering): F8's "cannot occur since #781" was wrong; a worker's events reach a port before its Ready (`background/service.ts:55`, `client.ts:152-187`), so a reused id's Added can beat the reconnect read. Screen equivalence still holds: a created row's Added carries zero balances and its first Updated replaces the first row with its id. Accepted: F8 rewritten, D5's control holds the read and asserts each step.
- F2 (Medium, demonstrated fence behaviour): the Security line claimed a scope change drops the retry; History and TokensView have no journal scope watcher, so the retry reads the live profile. Accepted as a documentation fix plus a History control; no scope watcher added (it would change switching behaviour).
- F3 (Low, coverage gap): late refusals after supersession and after dispose. Accepted: two hook cases.
- Ask note: F6's trigger list was incomplete (config and quote updates). Accepted: wording fixed.
- Verified each claim against the tree before accepting.

## Plan audit, Opus leg (2026-10-19)

- Opus 5.5, `Plan` agent. Verdict: `conditional approve`, six findings, no owner ask.
- F1 (Medium, demonstrated): `types/auto-imports.d.ts:717` re-exports `JournalAddRules`; a stale generated file fails `_build-extension.yml`'s unchanged-sources step. Taken.
- F2 (Low-medium, demonstrated): the mount's read is superseded by the first connect's read in History and TokensView; a refused connect read empties nothing but waits 2 s where today the mount's rows showed. #839 row 5 names it; § UI impact now says it. Taken.
- F3 (Low): two Security sentences overstated (scope fence; key answer to a dropped run). Taken.
- F4 (Low): D6 cannot hold for Send's row; D7's reason misstated (a no-profile read throws a TypeError, no service call). Taken.
- F5 (Low, demonstrated): `activity.test.ts:397` and `useJournalMirror.test.ts:72` would leave a real retry timer armed. Taken.
- F6 (Low, plausible): Home's catch also re-armed on a throwing `onSnapshot`; the mirror's covers `read()` only (D8), and `onSnapshot` has no throwing path. Taken.

## Plan audit, Codex round 2 (2026-10-19)

- Same session, resumed. Verdict: `approve`, no new material finding. Audit converged; light tier, so no further fresh pass.
