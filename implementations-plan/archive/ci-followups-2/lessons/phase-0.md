# Phase 0: planning consults

## Recon

- One Explore agent (sonnet), read-only, over seven capabilities: the pins that read nightly's gates, the "need or advisory by name" pattern, helpers, doc sentences, plan collisions, `continue-on-error`, the chaos fixture. Its findings are in recon.md; two claims in the lane brief did not hold (plan.md § Claims).
- Measurements came from `gh run view --json jobs` and the job logs of nightly runs 37607270016, 37765624647, 37919470569, 38043372938 and 38130969762, and of four green runs of each PR network lane on 2026-10-11. No local e2e run (D5).
- GitHub Docs, Contexts reference: `github.run_id` "does not change if you re-run the workflow run"; `github.run_attempt` "increments with each re-run" (fetched 2026-10-11). Basis of D3.

## Panel, round 1 (2026-10-11)

- Codex gpt-6.1-sol, high, read-only (`run-codex.sh`; the host runs Codex in approve-for-me mode, account alejo-icloud): **conditional approve**, six findings (C1-C6). Opus 5.5 Plan agent, in parallel: **conditional approve**, eight findings (O1-O8). Every finding and its disposition is in plan.md § Audit verdicts.
- Verified before acting: `gh run view` confirmed C3 (Firefox smoke skipped on 10-10 behind the red `unit-tests`; Chrome smoke 16.0 min on 10-07). `gh api …/branches/main/protection/required_status_checks` confirmed F10 (four checks, app 15368, strict).
- Decisions changed: D2 (exact set plus execution, in `aggregators.test.ts`), D3 (claim narrowed), D6 (OA-1 recommends B now). Rejected: O5 (caller `retry: "0"`), with the reason in plan.md.

## D2 probe (2026-10-11)

- A scratch script (outside the repo) ran `nightly.yml`'s `status` script the way `aggregators.test.ts`' `exitCode()` does, against the base workflow: one step; a green world and a quiet-day world (resolve green, the rest skipped) exit 0; each need set to `failure` or `cancelled` exits non-zero (0 of 22 passed); `publish-nightly`'s `if:` equals the success conjunction of its needs exactly; its needs equal `status`'s minus `publish-nightly` and its dependents (only `status`). The exact set reports exactly the seven jobs missing from `status`'s needs, which is the planned red-on-base result.

## Panel, rounds 2 and 3 (2026-10-11)

- Round 2, Codex resumed (session 01a12b81…): **conditional approve**, three findings (C7 the Phase 2 search matched plan files and could not pass; C8 published nightlies cannot show a chaos count, and the ~26 % bound assumed independent runs; C9 stale recon verdicts). All accepted. Codex's in-memory checks confirmed the D2 design, the `publish-nightly` formula with `prune-nightlies`, and all six mutations.
- Ran the scoped Phase 2 search on the base tree: it matches exactly the eight sites the plan edits.
- Round 3, Codex resumed: **approve**, no new material finding. Final verdict for the approval gate.
