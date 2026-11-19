# Phase 0: planning consults

Every panel consult of the planning phase, with its verdict. Paths are repo-relative.

## Consult 1: Codex plan audit (gpt-6.1-sol, high, read-only)

- Prompt: the four-ask audit packet over plan.md, outline-b.md, recon.md and OWNER-ASKS.md.
- Verdict: **reject** (blocking: sanitizer bypass, incomplete capture bounds, missing prove-phase coverage, unresolved copy approval).
- Accepted: strip controls before scrubbing (a U+200B-split address was reassembled by the strip); bound the whole serialized capture and its stage count; store lines pre-rendered so no bigint reaches `JSON.stringify` or `chrome.storage`; schedule the existing flush on every capture change; compute journal durations per row and seed the row on its first event; record prove phases from `onProvePhase`; wire event sources in `runtime.ts`, not in `LogViewerService`; use the concrete class; OA-2 gates the PR with OA-1; correct Fact 8 (boot restricts `storage.local`, not session) and Facts 4 and 6; pair the e2e's absence checks with positive evidence and known addresses.
- Rejected: moving `walletTraceId` off `Task` (trusted RPC only; a private map adds a lifecycle).
- Surfaced: error texts the wallet does not author (assertions, simulator messages) can quote decimal values; no scrubber recognises them. OA-2 states it.

## Consult 2: Opus 5.5 Plan audit (same packet)

- Verdict: **conditional approve** (conditions: fold the Codex fixes, F1, F2, F3, F6, F7, and the D4 quote).
- Accepted: delete a capture with no journal alias at its end (F1: a dApp's ordinary calls would push the failed send out of 50); `describeWireMethod` for the method (F2); escape U+2028/U+2029 before the strip (F3); wrap the call's `LiveSession` instead of three respond sites (F4; `handleWalletMessage` is at 73 of 80 lines); inline hook fields, `onJournalCreated` only where a row is written (F5); six exact e2e envelope pins (F6); OA-3 gates the PR (F7); the Debug Mode fact (F8); worker lines into open captures only (F9); the interaction alias in `interaction()` (F10); one `set` per key (F11); extend `scope-refusal` case 2 instead of a new file.
- Both legs agreed on keeping `Task.walletTraceId` (trusted RPC).

## Consult 3: final fresh Codex pass (new session, gpt-6.1-sol, high, read-only)

- Verdict, round 1: **reject** (blocking: a tab-split address survives `formatArg`'s `JSON.stringify` as `\t` escapes; retention at end does not stop eviction at capacity).
- Accepted, all seven: a structural scrub of string values and keys before rendering, then the output pass, with a whole-pipeline test; Fact 3 corrected (`registerToken` writes a `token_import` row; token imports out of scope); eviction prefers unaliased captures, the arriving one included; the `Map` purged synchronously on Developer Mode off and Clear logs; a terminal reserve inside the bounds, UTF-8 byte accounting; idempotent `end`, with suppressed and dropped completion tested, producer assertions for the root task and same-backend prove phases, `audit:vue` and the full smoke suite in the gate; OA-2 states the per-field limits and the recognised URL forms.
- Rejected: none. None of the fixes adds state, a lifecycle, a protocol, a recovery policy or a public contract.
- Round 2 (resumed): **reject**, one blocker: every alias lands after `begin`, so evicting "the arriving one" dropped new sends at 50 aliased. Fixed: `sendTx` and `grantPublicAuthwit` are send candidates at `begin`; an ordinary arrival never evicts an aliased or candidate capture. Two wording nits folded.
- Round 3 (resumed): **approve with nits** (Fact 12's citation). Folded. Plan approved.
