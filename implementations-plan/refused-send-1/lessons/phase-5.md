# Phase 5: arc gate and the code review loop

- Merged `origin/dev` (`ad4de50d8`); no storage path moved and `pins.ts` is still empty, so no baseline re-run.
- Gate: `bun run audit:vue`, `bun run test:all`, `bun run check:plans`: exit 0.
- Commit signing hung on `ssh-keygen -Y sign` asking a stale agent socket; `env -u SSH_AUTH_SOCK git commit` signs from the key file (the machine note's documented case).

## Code review, round 1 (2026-10-20)

Codex (gpt-6.1-sol, high), session `01a15b0a-a516-7d92-a5a1-eaf2e8fcd842`: `approve`, two lows. One Opus `general-purpose` review beside it: `approve`, six lows. Each checked against the tree; all adopted.
- C1: the e2e comment said the journal page reads its record only at mount; it also reloads on its own record's updates (`bindJournalDetailUpdates`). Now: a new id alone does not reload it.
- C2: the `receiptOf` and `isDropped` doc lines restated their guards; deleted.
- O1: `final-refusal.ts`'s doc named the wrong distinction (an `Existing nullifier` also answers a send another node took); now: no copy held elsewhere can outlive it, barring a prune or a clock ahead.
- O2: `openRow`'s comment repeated `spec.ts`; it now states the coupling (a write the journal refuses would re-read the row every tick).
- O3, O4: two test titles overclaimed ("after a restart too"; "no node" is a node lookup that throws, outside the read's `try`).
- O5: a duplicate `Harness` alias in the composition test; deleted.
- O6: three classifier rows proved nothing an exact `Set` match does not already show; trimmed (the plan's named rows stay).
