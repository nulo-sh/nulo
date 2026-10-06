# Plans scaffolding

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The plan-tree standard and its gate: `implementations-plan/README.md`, `implementations-plan/.gitignore`, `implementations-plan/.ignore`, the curated `implementations-plan/lessons.md` and `implementations-plan/follow-ups.md`, closed plans under `implementations-plan/archive/`, and the CI check `scripts/ci-cd/plans/check.ts` (run as `bun run check:plans`, inside `test:ci-gating`). Assets that code reads moved out of the tree to `reference/`, `scripts/phantom-sweep.ts` and `apps/extension/tests/e2e/PRF-NON-PORTABLE.md`.
- **Open items**: transcript-shaped files the ignore patterns miss, and linting and type-checking the root `scripts/` tree (Biome's `files.includes` covers only two `scripts/ci-cd/` subtrees and no tsconfig reaches it), tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Move the planning tree to one standard, in stacked changes that each revert on their own:

- An active-only `index.md`, closed plans under `archive/` each with a short `## Outcome`, a curated `lessons.md` of at most 8 KiB and a `follow-ups.md`.
- Transcripts, drafts and generated explainers gitignored. Transcripts that were already tracked were untracked, and every link to one became a permalink at an allowlisted base.
- A gate in CI that keeps all of it true: no tracked transcript, no negated ignore line, no nested ignore file, no broken plan link, a permalink only at an allowlisted base reachable from `dev`, an oversize `lessons.md` fails.

The order was: the gate in report-only mode, then untracking with the gate enforcing, then the hand-curated lessons and follow-ups, then relocating the files code and CI read, then the archive move.

## Why

The tree had grown to hundreds of directories with committed transcripts beside the plans, and one flat index that was only appended to. Every planning session paid to read it, and a default search returned stale transcripts and closed plans. Transcripts are also the likeliest place for a local path to leak. Gating the standard in CI is what keeps it from decaying again.

The archive move stayed mechanical: every closed file moved unchanged apart from its generated Outcome edit, checked by re-deriving the output rather than sampling.

## What shipped

- **Gate.** `scripts/ci-cd/plans/` checks the tree from the git index: links resolve, plan paths in code resolve at HEAD or under `archive/`, permalinks use allowlisted bases, `lessons.md` stays inside its budget with every entry linked. On a PR or local run it fails; on push, nightly and release it only reports.
- **Hygiene.** The ignore files, and an `.ignore` that keeps `archive/` out of default recursive search while leaving it tracked.
- **Curation.** `lessons.md` and `follow-ups.md` were mined from the closed plans' logs, then pruned.
- **Relocation.** The reference projects, the phantom-dependency sweep, the soak baselines and the PRF note moved out of the plan tree, with their mentions repointed.
- **Archive.** Every closed plan moved under `archive/` with an Outcome that retires its seeds.

## Lessons

### Root bunx

Under the isolated linker, `bunx <tool>` at the repository root sees only the root's dependencies and falls through to npm `@latest`, past the lockfile and the age gate. A root `bunx vitest` fetched a release a day old and died at config load. Run tools through workspace scripts instead.

### Renames

`git diff -M` pairs renames by shared lines, so a 100% rename is not byte identity: a moved file with its lines reversed still paired, so the verifier compares blob ids and modes. A pathspec cuts the diff before pairing, so a move across it reads as a delete plus an add and a rename filter prints nothing, passing vacuously. Check with the sources in scope.
