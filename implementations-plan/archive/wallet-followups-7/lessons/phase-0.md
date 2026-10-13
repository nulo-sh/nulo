# Phase 0: planning log

## #354 probe (2026-10-13)

- Harness: a scratch copy of `background.connect-window.test.ts`'s mocks and `boot()` (relative imports rewritten to the worktree), run outside the repo through a scratch vitest config that reuses `apps/extension/vitest.config.ts` with only `include` replaced, plus a `node_modules` symlink to `apps/extension/node_modules` so bare imports resolve. Console output from tests is swallowed by the setup's console hijack; the probe appended its results to a file instead.
- Dispatch stage: trusted session, first `dispatch` held on a deferred, 64 × `registerContract` with a distinct 4 MiB argument → 1 dispatched, 63 waiting, 0 refused, heap +256 MiB after `Bun.gc(true)`.
- Decrypt stage: the mocked `handleEncryptedMessage` held on its first call, 64 × 4 MiB ciphertexts through the real `serializeDecryption` → 1 started, 63 waiting, heap +252 MiB; +4 MiB after the drain.
- Verdict: demonstrated in-process; linear in the count; the browser's arrival rate is unmeasured.
- Object-dense follow-up (asked by the Opus lens): 32 messages, each a `JSON.parse`d ~10 MiB array of small objects, behind a held head → 31 waiting, heap +772 MiB (≈2.4× the text) on Bun/JSC. The scratch test then hit its own 5 s timeout after recording; the figure was written first.

## Consults

- Round 1, Codex (gpt-6.1-sol, high, read-only; session 01a136ba): `conditional approve`, five findings (retired decrypt queues on re-key, refusal replies outside both counts, slot-lifetime tests, claim corrections, count-vs-heap wording); D1–D7 all agreed.
- Round 1, Opus 5.5 lens (Plan agent): `conditional approve`, eight findings (per-session memory at the cap, same-id re-key reset, honest pollers during a long approval, silent decrypt drop, a hex-parsing claim, test edits, upper-case display, cite fixes). The hex-parsing claim did not hold: the `AztecAddress` constructor throws on any length other than 32 bytes.
- Round 2, Codex resumed: `conditional approve`. Settled the refusal-reply fork on sending replies through the session's decrypt lane (no new counter), with its controls; kept I1 as a hypothesis; corrected the parse's truncation wording (a trailing odd digit or invalid pair is dropped by `Buffer.from`).
- Round 3, Codex resumed: `conditional approve` (re-key controls explicit in T6 and T7; caller-validation claim narrowed). Round 4: `approve` on the applied revision.
