# Phase 0: planning consults

## Consult 1: Codex plan audit (gpt-6.1-sol, high, read-only), 2026-11-05

Verdict: conditional approve. Findings and dispositions (verified against the tree or a local git-cliff 2.14.2 run):

1. An all-skipped range drops the release header (medium). Rejected: refuted by reproducer. A range holding only a `refactor` commit renders its version, Install and attestation text under the candidate `cliff.toml`, both with a range and with nightly's `--unreleased` (scratch clone, local tag).
2. The promote-time check reads the last release's version, so it enforces nothing before the promote (medium). Accepted as wording: the gate binds at the Release PR; the plan says so. The uniform tree-version check stays (it needs no Release-PR detection).
3. The manual path checked existence only, so a malformed file could still be tagged (medium). Accepted: `tag-by-hand-run.ts` refuses a stable whose commit lacks valid notes, in its existing `refusal` choke point, instead of a snippet line.
4. I2 too broad (medium). Accepted: `--ref v1.2.0` runs that tag's old workflow and rewrites the body to git-cliff's alone; a dispatch from `main` fails because the tag's tree lacks the composer. Owner acceptance asked (A9); a closed `known-limit` issue at close-out.
5. The local rehearsal does not meet the issue's dispatch criterion (medium). Accepted as an owner ask (A10): the first post-flow stable's own run is the live proof.
6. A `refactor!:` or `chore` with a `BREAKING CHANGE` footer would be skipped (medium). Accepted: a first parser `{ field = "breaking", pattern = "true" }` groups every breaking commit under "Breaking changes"; reproduced locally.
7. A literal `@SOURCE_COMMIT@` in the notes would be rewritten on GitHub only (low). Accepted: `notesProblems` refuses it.
8. The 1.1.0 backfill uses `•` markers (low). Accepted: backfill keeps the wording, with `- ` markers.

## Consult 2: Opus 5.5 Plan agent audit, 2026-11-05

Verdict: conditional approve. Dispositions:

1. The issue's dispatch criteria are replaced without saying so; the real reason is that no tag carries the composer or a notes file yet (medium). Accepted: A10, with an optional rc cut that exercises the job's wiring first.
2. A wiring slip (`OUTPUT` ≠ `CLIFF`, `OUT` ≠ the upload path, no `VERSION`) would first fail after the tag exists and burn the version (medium, plausible). Accepted: pin the three equalities in `release-integrity.test.ts`; the rehearsal runs the step's `run:` with its `env:` read from the parsed YAML.
3. The `check` step never runs in this PR's CI (`launch-legal` runs on PRs into main only). Accepted: the Phase 2 gate runs it.
4. "No log prints the text" is false: both previews `cat` the body. Accepted as wording. The optional refusal of `::` lines is rejected: git-cliff's commit subjects already reach the same preview, and the job holds no secret.
5. `@SOURCE_COMMIT@` in the notes. Accepted (same as Codex 7).
6. The PR trips the extension filters through `listing.md`. Accepted as wording in Delivery.
7. `no-cache: true` not written down. Accepted.
8. Assumptions: F3's cap moves to I3; I1 is contradicted (1.0.0 never reached AMO, so 1.1.0.0's notes span 0.31.0.0 to 1.1.0) and becomes A11; I2 narrowed (same as Codex 4); A8's reason corrected (AMO's v5 edit endpoint takes `release_notes`; no workflow sends it). Accepted.
9. `cliff.toml` edge cases: no change. An empty-`CLIFF` refusal is rejected: the empty-release drop was refuted by reproducer (Consult 1, finding 1).

## Consult 3: Codex verification round (resumed session), 2026-11-05

Verdict: approve. No remaining material finding; Codex reproduced both all-skipped cases itself and withdrew its finding 1.
