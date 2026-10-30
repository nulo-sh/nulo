# Phase 0: planning consults

- 2026-10-30 recon: one Explore sweep (sonnet) over seven capabilities; findings in [recon.md](../recon.md). No grapheme helper exists; `caretAfter` is Send-only; `new-token-error` has no e2e.
- 2026-10-30 Codex plan round 1 (gpt-6.1-sol, high, read-only): `conditional approve`, six findings, all verified and adopted (plan § Audit verdicts). The one that changed the design: a refused edit's selection cannot be inferred from the text before and after it, so the `int` field records it at `beforeinput`.
- 2026-10-30 Issue comment on #1391 records the strength-wording question for the owner (D7).
- 2026-10-30 Opus Plan leg (opus): `conditional approve`, eight findings; three matched Codex's, the rest verified and adopted or merged (plan § Audit verdicts). One disagreement with Codex, on the one-key sign's residual: settled as D9 (accepted under the brief's rule, recorded on #1389 and #1390, filed `owner-decision` at close-out, no OWNER-ASKS entry).
- 2026-10-30 Codex round 2 (resumed, verifying): `conditional approve`; a fractional stored minute (`settings-labels.ts:7`) made F2 false, so the `int` refusal judges the edit's own characters. Round 3: `approve`.
