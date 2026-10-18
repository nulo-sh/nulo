# Phase 0 — planning consults

Every consult of the planning run, failed ones included.

## Recon (2026-10-17)

Two Sonnet explorers: a reuse sweep of eight capabilities and a map of the imported-key and reset-journal lifecycle. Both returned; findings in `recon.md`.

## Dual audit, round 1 (2026-10-17)

- **Codex**, gpt-6.1-sol at high, read-only, session `01a14b4c-d408-7753-bfff-9b94e9368d1e`. Verdict: conditional approve. Preferred holding (D1) over dropping (Outline B). Material: held rows are visible to every service read (R0); the key filter could drop a key silently (R1); held accounts' authwits restore but a later backup skips them (R2); the held list could not subtract reconcile's drops (R3); names would bypass the log projection (R4); a held row a reset moves onto would be deleted unnamed (R5). Also asked for exact gates, `--retry=0` and a build step.
- **Opus Plan leg.** Verdict: conditional approve. Preferred D1. Material: old Testnet chain IDs make held rows permanent and the warning ask for the impossible (F-1); Developer Mode is not restored (F-2); held accounts' balances would fail re-link as new error rows (F-3); names are unbounded (F-4); a lookup returning `undefined` on a failed validation would hold a tampered row (F-5); `executeRestore` is at 78 of 80 lines (F-7); the planned restart assertion could not fail (F-8). Evidence that a running reset's takeover covers the network page settled Codex's ask about C4's wording.
- Every finding and its disposition is in plan.md's decision ledger.

## Final fresh pass (2026-10-17)

- **Codex**, gpt-6.1-sol at high, new session `01a14b63-551f-77c1-bdc9-726ac06fa83d`. Verdict: conditional approve, one condition: recording a backup's orphan key would stop the import at the warning, a visible change outside the picks, so it needs an owner ask. Applied by folding it into OA-5 with today's outcome shipping. Resumed on the change: approve, no new findings.
