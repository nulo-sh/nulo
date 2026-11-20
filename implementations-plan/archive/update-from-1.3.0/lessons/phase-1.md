# Phase 1: pins, the `send` trait, the Codex pass

- 2026-11-19, gate at `aa9d10d2a`: `lint` 0, `typecheck:all` 0, `bun --bun vitest run scripts/e2e` 770 passed and the one expected failure (no v1.3.0 recording).
- 2026-11-19, Codex pass (gpt-6.1-sol, high, read-only; session `01a1f5e3-1c0f-7e03-9de6-b7db10f9a24e`) over the plan and `aa9d10d2a`: **reject**, high confidence.
  - P1, accepted: on the sandbox a `listed-chains` release's Send preselects its one payer, public Fee Juice, and its radio emits only on `change`, so the press saves no Send pick and `expectReleasePreferences` fails on the empty map (F8). Codex reproduced the zero `change` events in memory; the planner confirmed the trace (`FeeMethodRadios.vue:53-58`, `:98`; `fee-privacy.ts:66-77`; `useFeeSelection.ts:114-122`). Fixed by D5: with `saveFor`, the release's own `saveFeePick` writes the record the press would have.
  - P2, accepted: the recording is written inside `populate`, before the update's checks, so a failed recording run leaves one. Phase 2's gate now deletes it after any failed recording run.
  - P3, accepted: F2's diff inventory also holds `BEFORE-LAUNCH.md`.
  - Held: every trait at the tag, D2, F4-F7, the `one-form` branch unchanged, no further trait, the run order.
- 2026-11-19, Codex targeted verification (same session, over `6699e3575` merged with `dev` at `49d65d90e`): **verified**, high confidence: the profile id, account, side and records match `pickForSend`/`recordOf` at the tag; `saveFeePick` returns `true` only after the sealed write; the pending send unchanged; `tsc -p tsconfig.e2e.json` clean. One P3, accepted: the helper's TSDoc cut to the radio constraint.
