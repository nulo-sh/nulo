# Documentation pass: README, architecture, comment cleanup

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the root `README.md`, `ARCHITECTURE.md`, the planning standard in `implementations-plan/README.md`, a package README for each workspace (for example `packages/wallet-core/README.md` and `apps/playground/README.md`), and the code-comment style section of `CLAUDE.md`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Split the documentation by job and sweep the code comments:

- A short root README is the front door: what the project is, quick start, a package table and the quality gates.
- `ARCHITECTURE.md` carries the system explanation: process boundaries, layer hierarchy, message flow, state, storage versioning, offscreen lifecycle, session model, concurrency, crypto, account contract, fees, build artifacts and test taxonomy.
- `CLAUDE.md` is tightened to the operating ruleset, with one new section on comment style.
- Each package gets a README with an opening sentence that states what it owns and what it must not depend on.
- Remove every milestone, plan, PR or stage tag from code comments, keeping the reason or invariant behind it.

## Why

Plan tags in comments describe where a change came from, not how the code behaves, and they rot once the plan is closed. History already lives in git. The ruleset file had also absorbed architecture narrative, which made the rules hard to find and the narrative hard to keep current.

The sweep needed guard rails. Security audit markers are content-rich and pair with tests, so they stay. A comment that says "phase N" in the runtime base classes describes live parallel-dispatch behavior, so that directory was whitelisted. Live compatibility-boundary statements and user-facing strings are product facts, not tags. A comment that mixes a live invariant with a removable tag paragraph is split rather than deleted, and non-obvious prose that deserves a home is promoted to the nearest README.

The rules that must stay character for character in the ruleset were listed up front: the unmount cleanup order, the per-layer test coverage minimums, the script-setup ordering template, the test-id preservation rule and the lint-suppression discipline. Cross-references from code to plan files were cut down to the few that still explain a real limitation.

## What shipped

- Volatile numbers (test-pass counts, port tables) stay out of READMEs; they live only in the e2e README.
- The comment-style rules are in `CLAUDE.md`: no comment by default, why and invariants only, no milestone tags, full sentences, and `biome-ignore` with a reason.
- The planning README explains when to write a plan, the per-plan layout and what a plan keeps.
- The architecture document is one file with numbered sections, so other documents can cite a section by number.
- The sweep did not reach every test name. None carries a milestone tag today, and the style rule keeps new code free of them.
