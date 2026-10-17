# Phase 4: arc gate and the implementation review

## Arc gate (2026-10-17)

- `bun run test:all`: green in every workspace. The extension ran 13 433 tests.
- Smoke, armed Chrome build, retry 0: `send-keyboard`, `send-fee-privacy`, `legal-acceptance`. 3 files, 20 tests, green in 278 s at load 152. This ran at 6b5a5de9: the review fixes after it touch only the revoke path and comments, which no Send spec reaches.
- Network, `e2e:agent`, retry 0, one at a time, at 7f154336: `authwit-lifecycle` green, test 144 s (458 s wall with boot and build), started at load 147; `transfers` green, test 174 s (358 s wall), started at load 141. No e2e scenario was added or changed.

## Review loop, round 1

- Codex (gpt-6.1-sol, high, read-only, session 01a14ad1-1488-7152-b70e-500fbd649f2a): `approve`, one minor (a stale residual comment) and three comment nits. Opus general-purpose: `conditional approve`, on one major.
- The major held: a grant still Dropped at the 120 s deadline refused its whole batch. "Revoke all" revokes in batches of 28 and continues past a failed batch, so only that batch was affected, but its other grants then stayed authorized on every retry; base revoked them. The planning panel missed it because D3's wait treated Dropped like Pending, while its own "Not taken" line cited the same cost against another option.
- Consulted Codex in the same session on three options: send past a grant still Dropped at the deadline, stop waiting on Dropped at once, or file a known limit. Verdict `A`, the first. A transient Dropped keeps its chance to resolve within the bound, and nothing that can still land is pruned: the verify keeps the row and the call rejects, unless the grant has since landed at or below the revoke's block. Implemented that way: `awaitGrantBlock` returns its last read (a block, `"dropped"`, or `undefined`), and only `undefined` refuses.
- Rejected: dropping the `TOKEN_MOVED_MESSAGE` doc (its sibling constants carry the same, Codex agreed), and a comment above `onSent` (the outcome is identical either way).

## Review loop, round 2

- Same Codex session over the fix diff: `approve`, one comment nit, accepted. A grant read Dropped at the deadline can still land before the revoke, and the verify then rightly prunes it. The loop has converged.
