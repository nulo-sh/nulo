# Phase 0 — planning consults

## Browser probe (2026-10-17)

A throwaway MV3 extension, outside the repo, run through Puppeteer 25.8.0's pinned browsers. Chrome 152.0.7977.42: `chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })` resolves; a content-script read then fails with "Access to storage is not allowed from this context."; after the browser is closed and relaunched on the same profile, without a new call, the read still fails. Firefox 153.0.4 (`browser.installExtension` over BiDi): `storage.local.setAccessLevel` is `undefined`; the content script keeps reading.

## Recon (2026-10-17)

Two Explore agents (sonnet): the record-id consumers and test surface; the worker entry, untrusted contexts, typings, tests and e2e browsers. Results in [recon.md](../recon.md).

## Codex review, round 1 (gpt-6.1-sol, high)

Verdict: `reject`. Blocking: the first draft keyed rows by `(txHash, noteIndexInTx)`, which is not a note's identity. A fee-bump replacement keeps the protocol nullifier, hence every nonce, under a new `txHash`; a reorg that re-executes a tx's public part can complete a different partial note at the same index. Verified in the installed stdlib (`tx_request.js:51-61`, `hash.js:37-65`, `tx.js:135-137`). The key moved to the unique note hash (D1), computed in `NoteService` (D2), and a move now rewrites `txHash` (D8). Also accepted: the log sink is the logger's buffer, not the fake's session area; I2 is hardening, not a zero-window claim.

## Opus Plan leg (opus)

Verdict: `conditional approve`. It approved the position key, but did not weigh the public re-execution path. Accepted: the composition test's choreography and a non-vacuous check (the stub's note carries the nullifier by cast); D3's account of old settled rows; one default `txHash` in the scenario factories; the journal's send-expiry reason; an `async` helper. Rejected: dropping the unused `noteHash` (outside scope); an extra network e2e assertion.

## Codex review, round 2 (resumed)

Verdict: `conditional approve`. Accepted: an identity hash that fails must reject `getNotesRaw`, since an empty id lets two verified scans strike and delete a live row (D2, two tests); the identity claim scoped to the standard token note. Not taken as a change: the own-send exclusion after a replacement of the user's own send. The wallet mints a fresh salt per build (`operation-fingerprint.ts:189-191`), so it never builds such a replacement; D9 files it as a known limit.

## Final Codex pass (fresh session) and its verification

Verdict: `conditional approve`, then `approve` on the resumed verification. Taken: the committed plan files state the change and its invariant only; `getNotes` and `getNotesRaw` share a private read and only the raw read hashes; a service-level case for a re-mine under a new transaction; OA-1 for installs upgraded from an earlier build (ships option A, the standing rule); I2 as best-effort with its residual in D6; D9 cites `Fr.random()` in the installed entrypoints. Codex agreed OA-1 does not block the arc.
