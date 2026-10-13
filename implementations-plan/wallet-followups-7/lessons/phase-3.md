# Phase 3: arc gate and the review loop

## Codex fix loop (gpt-6.1-sol, high, read-only)

- Round 1 (session 01a136e1): `conditional approve`, two findings, both accepted.
  1. Demonstrated: a ciphertext whose JSON is `null` reaches `onWalletMessage` (upstream `decrypt` returns `JSON.parse` unchecked), takes a slot in `admit()`, then throws on `message.type` before `.then(release, release)` is attached; upstream swallows the throw, so 32 such messages wedge the sender's own session. Fix: drop a non-object decrypted message before admission, at `debug`. Regression in `background.connect-window.test.ts` (32 `null`s, then a call runs), red without the guard.
  2. The canonical-spelling comment in `parseTokenInterface` overstated the invariant (restored and older rows keep their spelling); reworded to what the parse guarantees.

## Opus 5.5 review (general-purpose agent, alongside round 1)

- Verdict `approve`, five low findings. It read the diff before round 1's fix and called the span between `admit()` and the release "nothing that can throw"; the `null` payload Codex demonstrated is the exception.
- Accepted: the `findToken` comment cited history ("before adds were canonical") and now states the case; "Answered at arrival" became "Refused at arrival" (the reply now waits on the lane); the "two holds count apart" unit test is dropped, since each session owns its `Hold` and T4's second-session control proves the isolation end to end (a deviation from T3 as written); T6's title no longer claims "never answered", which its hook could not fail; the module doc is reflowed.
- Rejected: deleting the line note on the rewritten hold test. The orchestrator asked for the intended change to be stated at that line, so the note now says exactly that.
