# Phase 0: planning consults

## Recon, 2026-10-13

One Explore agent (sonnet), read-only, seven capabilities. Its findings are in `recon.md`; the planner re-checked the Outcome regexes (`structure.ts:42`), the results-file pin (`behavior-gating.test.ts:968`), the e2e path filters and the e2e file counts.

## Codex round 1, 2026-10-13: reject

`run-codex.sh` (gpt-6.1-sol, high, read-only), session `01a13515-7586-70c3-b0e4-a51c3a30f23d`. The lane brief and the common brief's § Proportion were revised on disk while the draft was in audit; Codex read the revised blueprint rules and flagged Phases 1, 2 and 4 as superseded (High). Also: the cited standard had no revision, recon missed `apps/extension/tests/e2e/FIREFOX.md:84`, and D2 left gate-versus-documentation open. All four accepted; the plan was rewritten against the revised briefs. Codex also mutated three safety lines of the runbook in memory and confirmed the normalized diff shows each.

## Codex round 2 (resumed), 2026-10-13: conditional approve

Verified the four fixes. New: the wall-clock formula counted a rerun's gap as runtime. Reproduced: run 38373410688 is attempt 2; its first attempt was cancelled after 35 min and the mixed reading is 50 min. F8 now measures the job envelope of a first-attempt-green run (`gh run view <id> --attempt 1`). Also accepted: the e2e skill links the CLAUDE.md rule. Conditions met; no third round.

## Brief discrepancies noted, not acted on

- The common brief's Delivery still says "open items to `follow-ups.md`"; the repository retired that file (CLAUDE.md § Where open work lives), so the plan files issues.
- The common brief names a `Claude Fable 5.1` commit trailer; this planner runs on Opus 5.5 and signs its own commit with that model's trailer.
