# Phase 0: planning consults

## Recon (2026-10-16)

Three Sonnet Explore agents at `c5e9c8e8`. Two of their claims did not hold on re-reading and were corrected before drafting:

- "The PXE's block sync downloads 50-block pages with transactions, so node replies reach tens of MB": the rc.3 block stream runs tips-only (`block_synchronizer.js:35-40`), so it downloads no block bodies. The node reply cap is sized from contract classes, tx effects and tagged logs instead.
- "Contacts and account-state already have row caps at backup import": neither is in `normalizeBackupData`; account-state caps live in its own normalizer, and the contacts cap is the contacts-file import.

## Dual audit, round 1 (2026-10-16)

Codex (gpt-6.1-sol, high) and an Opus Plan agent, in parallel, over plan.md, recon.md and the competing outline B.

- Codex ran on the `alejo-icloud` roster account: the managed `CODEX_ACCOUNT=best` in the environment picked it, not the brief's default login. Session `01a144e7`. Verdict: reject, 10 findings (three blocking, on C3, C4 and C7).
- Opus Plan: conditional approve, 9 findings (runnable e2e commands; C3, C4 and C5 scope; committed wording; `git log --reverse`; the pin test; the account-state register path).
- Panel split on D4: Opus kept the tab URL's origin (the iframe flag's dApps keep working; Firefox lacks `sender.origin`); Codex required the document's own origin. Decided for Codex: for a top frame the two are equal, Firefox has `sender.url`, and only the document's origin binds a subframe under the flag.
- Panel split on the warn lines (D6): Opus proposed a known limit; Codex a rewrite at the capture boundary. Decided for the rewrite: local, stateless, and it holds whatever upstream logs next.
- Rejected Codex #7 (cold and warm store tests): with the wallet's copy always written, the store's cache state cannot change the written bytes.
- Plan revised (C1 to C8, gates, wording); OA-1 now carries the limits and the export gap.

## Round 2 (2026-10-16)

- Codex resume: conditional approve, 4 findings, all accepted: the frame's direct service logger (`createPxeOffscreen({ logger })`) takes the same wrapper as the planned capture hooks; resolve C6 inside the write callback, since the public read wrapper would wait on the held write; a D4 phrase; the duplicate-pair test cases.
- Checked before asking: the vendored account artifact registers through the same seam (`nulo-account.ts:130`) and is not in the compiled-in set; Codex found no wallet-internal registration whose result C6 changes.

## Final fresh pass (2026-10-16)

- Codex, new session `01a14502` (on the `alejo-gmail` login this time): conditional approve. Conditions applied: a first publish lists every signing-path commit (no 50 limit); C6's invariant covers what the wallet resolves and writes, not what upstream's store keeps (its warm cache keeps the first copy); a fail-closed bundle grep; Fact 6 names the class-only write seam. The round 1 reason for rejecting the store-cache tests was corrected; the rejection stands because the wallet never reads a class it ships from the store.
- Final pass resume: approve, no remaining material finding.
