# Phase 0: planning consults

## Recon (2026-10-17)

- Two Explore agents on sonnet: the #548 mirror inventory, and #518/#519/#517/#520. Their findings are in `recon.md`. The driver read #541's files directly.
- One issue claim did not hold: #541's import half (the selection union and one decrypt path) had already shipped in #623 (`e021210a`).

## Dual audit, round 1

- Codex: gpt-6.1-sol at high, read-only. Prompt: the standard audit packet over plan.md, recon.md and the competing outline B.
- Opus 5.5: a Plan agent with the same packet.

### Codex round 1: reject

- Session `01a14ae1-71ef-7380-b7d0-799ce6643a30`. It ran on the `alejo-icloud` roster account, which the managed `CODEX_ACCOUNT=best` picked.
- C1 (High): two gaps in the export fence, both pre-existing.
  - `openRun`'s last check passes, then the caller resumes without one (`full.vue:317-342`). A discard in that microtask lets the superseded run build clients and call the key export.
  - `downloadFile` awaits compression before `chrome.downloads.download`, so a discard cannot stop a requested write.
- C2: Send's balance read fails the whole identity read (Retry). The hook swallows a rejection.
- C3: `pxe/service.test.ts:488-529` uses an IndexedDB failure as the stimulus for retry-stop and generation fencing.
- C4: gate defects.
  - The picker spec is a network spec.
  - `send-queue` does not exist.
  - Smoke needs a fresh armed build.
  - jsdom cannot read `:focus-visible`.
- C5, C6: A5 convergences change behaviour (Holdings' unseen Updated; Select token's scope-gated Updated, which a test pins).
- C7: A6's interface lacks the parent's synchronous begin, refresh and retry token.
- C8: three overrides do not prove pixel identity.
- C9: per-run clients in a C1 composable contradict CLAUDE.md § Composables.
- C10: OA-1's example overstates; removing a token reaches `send.vue:134-148`.

### Opus round 1: conditional approve

- O1: Select token's gate becomes a parent wrapper, which keeps both pinned tests.
- O2: Send would show 0 in place of Retry.
- O3: the supersede table needs rows that settle both ways, both profile types, a successor run and the confirm callback, plus an await-count pin.
- O4: `dispose()` must be terminal.
- O5: the composable owns password, repeat and agreement.
- O6: the premise check belongs in the prover-on canary.
- O7: the journal mirror needs `begin`/`resnapshot`; `onRecord` fires only on accepted events.
- O8: the `accept` show gate is unreachable.
- O9: specificity and the narrow `:active` state.
- O10: gate names.
- O11: more observable Holdings and Select token differences.

### Consolidation

- Both legs are folded into plan.md's ledger (D101-D601, G). OA-1 was rewritten to cover every observable balance-list difference; OA-2 (the open-run hop) is new.
- Nothing was rejected outright. The two legs disagreed on one point: Codex wanted every convergence to be an ask, Opus allowed race-window convergence. The plan sides with Codex for anything observable (D505) and converges only sequences the services cannot produce, with a trace.

### Final fresh Codex pass: conditional approve

- Session `01a14af1-8ce6-7822-8882-3d47b8e3e77d`.
- F1: A6's move-to-front would reorder Home's import rows on an update. Known rows now stay in place, and `place` sets only where a new row goes (D602).
- F2: the unchanged-test gate also checks the working tree.
- It confirmed D104/OA-2 and D105. Its wording note on the hop was applied. A resumed round was asked for an explicit verdict.
- Resume 1: F1 and F2 are fixed. New F3: A6's claim that Added cannot meet a listed row was categorical and not proven. It became a release check (D603). Resume 2: **approve**.
