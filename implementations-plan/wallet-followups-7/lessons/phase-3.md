# Phase 3: arc gate and the review loop

## Codex fix loop (gpt-6.1-sol, high, read-only)

- Round 1 (session 01a136e1): `conditional approve`, two findings, both accepted.
  1. Demonstrated: a ciphertext whose JSON is `null` reaches `onWalletMessage` (upstream `decrypt` returns `JSON.parse` unchecked), takes a slot in `admit()`, then throws on `message.type` before `.then(release, release)` is attached; upstream swallows the throw, so 32 such messages wedge the sender's own session. Fix: drop a non-object decrypted message before admission, at `debug`. Regression in `background.connect-window.test.ts` (32 `null`s, then a call runs), red without the guard.
  2. The canonical-spelling comment in `parseTokenInterface` overstated the invariant (restored and older rows keep their spelling); reworded to what the parse guarantees.
