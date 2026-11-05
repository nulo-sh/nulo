---
plan: release-notes-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 7eed331bb (origin/dev)
issues: "#1668"
---

# Release notes per version, on the GitHub Release and AMO from CI

Each stable version gets a committed, plain-language notes file. CI puts it above git-cliff's list in the Release body, sends it to AMO as `release_notes`, and refuses a stable release without one before it is tagged. Closes #1668 in one arc.

## Outcome & Quality Bar

- **For whom**: an existing user who reads the AMO version page or the GitHub Release after an update; the person who cuts a release.
- **Excellent**: (1) every stable Release body and AMO version opens with what changed for an existing user, in the 1.2.0 tone, and git-cliff's list stays below for engineers; (2) a missing or malformed notes file stops the Release PR, before any tag, with a message that names the file, so no version number is burned.
- **Good enough**: no changelog page (A6), no translation, no in-wallet "what's new".

## Assumptions

Facts:
- F1. `release.yml` job `release-notes` checks out the tag's commit and writes git-cliff's output to `/tmp/release-notes.md`; `attach-assets` sets that file as the body in `apply` and again in `verify-published` (`release.yml:422-499`, `scripts/release/attach-assets-run.ts:361`).
- F2. `publish-firefox-amo` checks out the tag and sends `{ upload, approval_notes }` only (`release.yml:809-869`, `scripts/release/publish-firefox-amo.ts:55-60`).
- F3. AMO's model caps `release_notes` at 3,000 characters; API v5 takes it as an object keyed by locale and renders purified Markdown without headings; the add-on's default locale is `en-US` (recon § Outside facts).
- F4. The legal-blank gate guards a stable at three points: `pr-quick.yml` `launch-legal` on every PR into main, `auto-unstick-run.ts` before it creates the tag, and the manual unstick snippet (`release` skill § Stable 5). `tag-by-hand-run.ts` is the one path for a manual tag.
- F5. `cliff.toml` also renders `nightly.yml`'s bodies; tests pin only its two `gh attestation verify` lines.
- F6. AMO lists 1.2.0.0 with no release notes; the v1.2.0 body was edited by hand. The lane brief's claim that `listing.md` holds 1.2.0's notes did not hold: it holds 1.1.0's block only.
- F7. No tag carries a notes file or the composer yet, so no `dry_run` dispatch can print a composed body before the next stable; the `release` concurrency group is also shared with real releases.

Inferences:
- I1. A tag from before this flow keeps its own behaviour on a `--ref vX.Y.Z` dispatch (its old workflow rewrites the body to git-cliff's alone). A dispatch from `main` for it fails at `release-notes`, because the tag's tree lacks the composer: a store submission of 1.2.0 through CI then becomes impossible (A9).
- I2. AMO's API applies the model's 3,000 cap (the declared serializer field passes no `max_length`). The local cap makes this moot.

Asks: `OWNER-ASKS.md` A1–A11, each with the form that ships now. None blocks arc 1. A2–A5 change what a person reads, so the PR carries them as before/after and merges only on the owner's sign-off.

## Architecture & Implementation

- **The file**: `release-notes/X.Y.Z.md` at the repo root, one per stable. Markdown: a lead line, a blank line, `- ` bullets. No heading (AMO drops headings; the composer adds one), at most 3,000 code points (`amoChars`), no em dash, no `@SOURCE_COMMIT@` (`attach-assets` would rewrite it on GitHub only). A prerelease needs none.
- **`scripts/release/release-notes.ts`** (pure; imports only `amoChars`): `notesPath(version)`; `needsNotes(version)` (true for `X.Y.Z`, false for a prerelease, throws on an unreadable version, as `launchBlanks` does); `notesProblems(text): string[]`; `composeBody(version, notes, cliff)` → `## What's new in X.Y.Z`, the notes, `---`, git-cliff's text: v1.2.0's hand layout.
- **`scripts/release/release-notes-run.ts`** (I/O injected, `command()` for errors): `compose` reads `VERSION`, `CLIFF`, `OUT` and the notes file from the working tree (the tag's checkout); a stable with a missing or bad file exits 1 and writes nothing; a prerelease copies `CLIFF` to `OUT` unchanged. `check` reads the root `package.json#version`, as `launch.test.ts` does, and applies the same verdict.
- **Gates**: `launch-legal` runs `check`. It binds at the Release PR, whose tree carries the new version; on a promote the tree still carries the last release, so it re-reads that file (hence `1.2.0.md`). `auto-unstick` refuses `create` when the file is absent or bad at the merge commit (catch `readFileAt`'s throw, name the file). `tag-by-hand-run.ts` refuses a stable with no valid file at the commit, in its `refusal`. `release-notes` refuses last.
- **AMO**: `versionRequest` gains `release_notes: { "en-US": notes }` (`AMO_LOCALE`); `readInputs` reads `RELEASE_NOTES_PATH` and refuses before any request; its log line carries the count only. `approval_notes` is unchanged.
- **`cliff.toml`**: a first parser `{ field = "breaking", pattern = "true" }` groups every breaking commit as "Breaking changes"; then Features, Bug Fixes, Performance, Reverts, ordered by `<!-- n -->` prefixes and `striptags | trim` in the heading; every other parser, the `.*` catch-all included, is `skip = true`. Reproduced on git-cliff 2.14.2 (recon § Planning rehearsal; Consult 1 in `lessons/phase-0.md`).
- **Not taken**: composing in `attach-assets` (fails after ~20 minutes of builds, in a `contents: write` job); running the workflow revision's composer (an edit on `main` could rewrite a shipped body at the next store dispatch, unlike AMO's copy read from the tag); a version floor (a 1.2.0 re-dispatch would replace its hand-edited body with git-cliff's alone; failing closed keeps it); one multi-version file or a `listing.md` block (per-version parsing; a store doc holding release text); files under `apps/extension/store/` (every notes PR would run the extension e2e lanes); folding internal groups into `<details>`; detecting the Release PR in `check` (the tree's version already names it).

## Security & Adversarial Considerations

- **Threat model**: notes text moves from a reviewed repo file to two public surfaces under credentials that exist today: the Release body (`attach-assets`, `contents: write`) and AMO (`firefox-add-ons`). No new credential, permission, environment or secret read; `release-notes` stays `contents: read` and secret-free (`release-integrity.test.ts`).
- **Input**: the file sits behind PR review, signed commits and required checks; `notesProblems` bounds size and shape. The two existing previews `cat` the body, as they already print git-cliff's commit subjects; the job that prints it holds no secret. Errors pass through `command()`; the AMO runner logs counts. GitHub and AMO sanitize the Markdown (AMO keeps `a b code em li ul …` and routes links through its bounce URL).
- **Tags and stores**: the tag-creation ruleset and the store jobs' `on_main` guard are unchanged. Reading text and composer from the tag keeps one rule: a release's text is fixed by its tag.
- **Supply chain**: no new dependency. The raw `oven-sh/setup-bun` step is SHA-pinned with `token: ""` and `no-cache: true`, as in the AMO job. git-cliff stays the action's pinned v2.14.2; the local rehearsal checks that release's published SHA-512 before running it. No cryptography.

## UI impact

No extension screen changes. Drafted in the PR with before/after; the merge waits for the owner's sign-off (A2–A5):
- **GitHub Release body, stable**: before, git-cliff only (v1.1.0); after, `## What's new in X.Y.Z`, the notes, `---`, git-cliff with the kept groups (v1.2.0's hand layout, automated).
- **AMO version "Release notes"**: before, empty (1.2.0.0); after, the notes file, rendered as a list.
- **rc and nightly bodies**: same layout, the kept groups only.

## Phase 1: the notes module, the files and the gates ✓

Change map:
- Add `release-notes/1.2.0.md` (the v1.2.0 body's notes section, verbatim) and `release-notes/1.1.0.md` (`listing.md`'s block, same words, `- ` markers).
- Add `scripts/release/release-notes.ts`, `release-notes-run.ts` and their tests.
- Change `publish-firefox-amo.ts`, `publish-firefox-amo-run.ts`, `auto-unstick-run.ts`, `tag-by-hand-run.ts`, each with its test.

Tests (one per refused class, each with a success control):
- `release-notes.test.ts`: the composed layout; refusals for an empty file, 3,001 code points (an emoji counts once; 3,000 passes), a heading line, an em dash and `@SOURCE_COMMIT@`; `needsNotes` on a stable, an rc and an unreadable version; every committed file is named `X.Y.Z.md` and has no problem.
- `release-notes-run.test.ts`: `compose` for a stable with a file, a stable without one (exit 1, the error names `release-notes/X.Y.Z.md`, `OUT` unwritten) and an rc (`OUT` equals `CLIFF`); `check` for a stable with and without a file, and an rc.
- AMO: the version body equals `{ upload, approval_notes, release_notes: { "en-US": … } }`; a missing or over-cap file refuses with no request sent.
- `auto-unstick-run.test.ts` and `tag-by-hand-run.test.ts`: a stable with no notes file at the commit is refused with no tag created; the existing success paths serve the file (call order pinned); an rc needs none.

**Validation gate**: `bun run test:release && bun run lint && bun run typecheck:all`. Pass: exit 0, and the new tests appear in the output.

## Phase 2: workflow wiring, `cliff.toml`, docs and the rehearsal ✓

Change map:
- `release.yml`: in `release-notes`, git-cliff's `OUTPUT` becomes `/tmp/cliff.md`; add the pinned `oven-sh/setup-bun` step; add `bun --no-install scripts/release/release-notes-run.ts compose` with env `VERSION: ${{ needs.resolve.outputs.version }}`, `CLIFF: /tmp/cliff.md`, `OUT: /tmp/release-notes.md`; keep the preview and the upload. In `publish-firefox-amo`, add env `RELEASE_NOTES_PATH: release-notes/${{ needs.resolve.outputs.version }}.md`.
- `pr-quick.yml` `launch-legal`: add the `check` step; widen its comment to cover notes.
- `release-integrity.test.ts`: add `release.yml#release-notes` to `NO_INSTALL`; pin `compose` between git-cliff and the upload, git-cliff's `OUTPUT` equal to `CLIFF`, `OUT` equal to the upload `path`, and `VERSION` from `needs.resolve.outputs.version`. `behavior-gating.test.ts`: pin the `check` step in `launch-legal`.
- `cliff.toml` as above.
- Docs: the `release` skill (who writes the file and when, the rules, the version release-please will pick, the owner's sign-off on the text, the rc rule, AMO's span, troubleshooting rows for the four refusals and for tags from before this flow); `listing.md` § Release notes (a pointer); `CLAUDE.md:90`; `CI.md:121,131,201`.
- Rehearsal, local, no dispatch (F7): download `git-cliff-2.14.2-x86_64-unknown-linux-gnu.tar.gz` and its `.sha512` from the git-cliff v2.14.2 release into `~/.cache/nulo-backlog/release-notes-1/git-cliff/`, run `sha512sum -c`, and run it with the job's arguments over the job's range for v1.2.0.

**Validation gate**: `bun run test:release && bun run test:ci-gating && bun run lint:actions && bun run lint && bun run typecheck:all && bun run test && bun run test:all`, then `bun scripts/release/release-notes-run.ts check`; all exit 0. Rehearsal pass: (a) the base `cliff.toml` reproduces the published v1.2.0 body's git-cliff part, equal once both ends are trimmed and `@SOURCE_COMMIT@` is replaced; (b) the job's `compose` step, run with the `env:` read from the parsed `release.yml`, turns that output and `1.2.0.md` into the published body, equal once blank-line runs collapse; (c) the new `cliff.toml` keeps only the kept groups, and a range of skipped commits keeps its Install text; (d) the same step for an absent version exits 1 and names the file. (b) and (c) are the PR's before/after.

## Delivery

One arc, one PR to `dev`, no stack. Branch `release-notes-1-a1` off `origin/dev`, carrying the plan commit. Title: `feat(release): per-version release notes on the github release and amo, from ci` (79 characters). The body states the before/after, the rehearsal output, the owner asks, that the orchestrator merges only with the owner's sign-off on A2–A5 (and A10 for `Closes #1668`), and `Closes #1668`. The `listing.md` edit trips the extension filters, so the smoke lanes run; no label is added. Parallelism: none; two phases, one critical path.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `7eed331bb`. `code_review: off`, so step 1 is absent. Loop (single arc, once over the whole diff after Phase 2 is green): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh` and its codex-dir, hard stop at three rounds; log each round in `lessons/phase-2.md`. Then `gh pr create` and `gh pr checks <n> --watch`. Close-out as the PR's final commits: the Outcome; lessons; A6 filed as an `owner-decision` issue and I1 as a closed `known-limit` issue (dedupe first); `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans` green. Teardown after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/release-notes-1/plan.md` succeeds, run `agent-worktree done release-notes-1 --merged`.

## Audit verdicts and decision ledger

Each finding's path and reproducer: `lessons/phase-0.md`.
- **Codex** (gpt-6.1-sol, high): conditional approve. Accepted: promote-check wording (2), `tag-by-hand-run` refusal (3), I1 narrowed and A9 (4), A10 (5), the breaking-commit parser (6), the `@SOURCE_COMMIT@` refusal (7), `- ` markers for 1.1.0 (8). Rejected: an all-skipped range drops its release header (1), refuted by a git-cliff 2.14.2 run in a scratch clone.
- **Opus 5.5 Plan**: conditional approve. Accepted: A10 and the real reason for F7 (1), wiring pins and a YAML-driven rehearsal (2), `check` in the Phase 2 gate (3), the preview wording (4), filter wording (6), `no-cache: true` (7), F3/I2, A11 and A8's reason (8). Rejected: refusing `::` lines (4; commit subjects already reach the preview, no secret in the job) and an empty-`CLIFF` refusal (9; no path after Codex 1's reproducer).
- **Final Codex pass** (same session, verification round): approve, no remaining material finding; Codex re-ran the archive's SHA-512 and both all-skipped cases and withdrew its finding 1.
- **Fix loop, Codex round 1**: two Low findings, both accepted and fixed: setext headings now refused, two comments cut (`lessons/phase-2.md`).
- **Fix loop, Opus 5.5 diff review**: four Low findings, all accepted and fixed: the skill's refusal list and its major-bump rule, `#` after a list marker, GitHub-style `Revert "…"` subjects (`lessons/phase-2.md`).

Implementation deviations (the tree won):
- The AMO runner derives the notes path from `VERSION` (`notesPath`), so `release.yml` gains no `RELEASE_NOTES_PATH`: one input fewer that could disagree with the version.
- One `notesRefusal(version, text)` serves `check`, `compose`, `auto-unstick` and `tag-by-hand-run`.
- The heading rule refuses any line or list item opening with `#` after up to three spaces, and any line of only `=` or `-`: AMO's python-markdown reads `#1668` at a line's or an item's start as a heading, and setext underlines too.

## Seeds

- `/goal` Both phases of implementations-plan/release-notes-1/plan.md marked ✓, each backed by its validation gate passing in the transcript; the Codex loop converged (a resumed pass reports no new material finding); the PR exists against dev with `Closes #1668`, created after the loop, its close-out archive commit shown with `git show --stat`; `bun run test:release` and `bun run lint:actions` exit 0.
- `/loop 15m` Drive implementations-plan/release-notes-1 per its plan.md: reality-check plan.md and lessons/, run the next pending step and its gate, decide with Codex at high on gpt-6.1-sol instead of waiting, never merge, stop at the PR and report.
