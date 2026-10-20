# Phase 1: one scoped read

Branch `terminal-card-flake-1-a1`, rebased onto `dev` at 38c449db before the first change (the plan
commit's index line conflicted with migration-rule-1's and viewer-flake-1's; both kept).

## Proof (scratch probe, Chrome, armed smoke build of the branch)

- **(a) Held router** (`pushState`, then the fixture's same-hash branch): the held state held at both
  reads (`#/popup/activity`, Home's card, `nav-general` current). The base fixture returned the
  card's values, Home's. The new one threw `no shown terminal card on activity:
  {"hash":"#/popup/activity","current":"nav-general","cards":1}` after 15,010 ms.
- **(b) Card gone during the read:** the predicate queried the card twice while it was out; once the
  card was back the fixture returned the record's values.
- **(c) Base sensitivity**, pinned to one CPU with three busy loops: the base fixture threw the CI
  message on the first cold swap of the first run (1 of 10 swaps); the other nine passed.
- **(c) Certification** per the e2e skill's § Certifying a deflake, new fixture, ten cold swaps per run
  (a fresh popup each): 10 of 10 runs as is (15-34 s each) and 20 of 20 pinned to CPU 135 with three
  busy loops (83-191 s each), every swap returning the values; zero mutation batches showed
  `nav-activity` current while Home's card was present.

## Proof (scratch probe, Firefox, armed smoke build of the branch)

(a), (b) and (c) once each, all green in 68.0 s: the base fixture returned Home's card under the held
router and the new one threw the same message after 15,058 ms; the predicate queried twice while the
card was out; ten cold swaps returned the values with zero mixed batches, so I2 holds on Firefox.
stderr carried only teardown noise (`Client disconnected` from closed pages, Firefox-internal errors).

## Gate

- `bun run lint`, `bun run typecheck:all`: exit 0 (3 pre-existing infos in files this arc does not touch).
- `bun run test:all`: exit 0.
- Network specs, retry 0, proverless, through `agent.sh`. Chrome: 4/4 (`scope-refusal` 37.8 s,
  `legal-acceptance-wall` 27.5 s, `tx-sendTx-reject` 17.1 s; the run 4 min 5 s). Firefox: 4/4 (58.3 s,
  39.5 s, 25.6 s; the run 4 min 12 s). The aztec CLI's anvil bind error at boot is the expected one.

## Review rounds

**Round 1.** Codex (gpt-6.1-sol, high, session 01a156bb-eb91-72e1-9520-a85dbcb5e9fa): conditional
approve, one low finding: ledger row 61 stated the CI sequence as established. Accepted ("consistent
with a race a probe reproduced"). Opus diff review: approve, two doc nits, both accepted: W1's range is
6-33 ms (row 61 and `plan.md`), and the skill bullet now carries the no-transition precondition.
Fixes: 591dd4f8.

**Round 2** (Codex resume): no remaining finding, high confidence; its one condition is the rest of the
gate. The loop converged.
