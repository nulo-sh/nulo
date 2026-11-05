# Owner asks: release-notes-1

None blocks arc 1: the arc builds each recommendation below. A2–A5 change what a person reads, so the PR carries them as before/after and the orchestrator merges only on the owner's sign-off; A9–A11 ride on the same sign-off.

## A1. Where the per-version file lives, and its format (engineering call, proceeding)

- **Options**: (a) `release-notes/X.Y.Z.md` at the repo root, one file per stable; (b) `apps/extension/store/release-notes/X.Y.Z.md`; (c) one `RELEASE-NOTES.md` with a section per version.
- **Recommendation**: (a). Markdown: a lead line, a blank line, `- ` bullets, led by what an existing user must know (the 1.2.0 model). No heading, at most 3,000 characters (AMO's cap), no em dash. (b) runs the extension's e2e lanes on a docs-only notes PR; (c) needs per-version parsing.
- **What ships now**: (a), with `1.2.0.md` backfilled verbatim and `1.1.0.md` with the same words and `- ` markers.

## A2. Does an rc need notes?

- **Options**: (a) no: an rc body stays git-cliff's list; (b) an rc shows the upcoming stable's file when it exists; (c) an rc needs its own file.
- **Recommendation**: (a). An rc's git-cliff range runs from the previous rc, so the stable's notes would describe a different span. The stores never carry an rc.
- **What ships now**: (a).

## A3. What `cliff.toml` keeps

- **Options**: (a) keep Features, Bug Fixes, Performance and Reverts, Features first, with every breaking commit of any type first under "Breaking changes", and drop Refactor, Documentation, Tests, Build / CI, Chore, Style and Other; (b) keep everything, folded under a "Internal changes" `<details>`; (c) no change.
- **Before** (v1.2.0): Bug Fixes, Build / CI, Chore, Documentation, Features, Other, Refactor, Tests, alphabetical. Chore and Other held release-please commits, promotes, syncs and merges; Refactor and Tests 33 internal lines.
- **After (a)**: Breaking changes (only when a range has one), Features, Bug Fixes, Performance, Reverts. The same trim reaches rc and nightly bodies. `CHANGELOG.md` (release-please's) keeps every section.
- **Recommendation**: (a). A stable's notes file states any break a user must know; the "Breaking changes" group also warns rc and nightly readers, who get no notes file.
- **What ships now**: (a).

## A4. The stable Release body's layout

- **Options**: (a) `## What's new in X.Y.Z`, the notes, `---`, then git-cliff's part as today (Install, Verify, the kept groups); (b) the notes only, git-cliff's list dropped; (c) the notes below git-cliff's part.
- **Recommendation**: (a): it is the v1.2.0 body's hand layout, made automatic. The PR shows the composed 1.2.0 body beside the published one.
- **What ships now**: (a).

## A5. AMO's per-version "Release notes" field

- **Options**: (a) the store job sends the same file as `release_notes` (`en-US`); (b) the field stays a hand paste in the Developer Hub.
- **Before**: 1.2.0.0 on AMO shows no release notes. **After (a)**: each version submitted through CI shows its file, rendered as a list. `approval_notes` (reviewer notes) is unchanged. Chrome's dashboard has no such field.
- **Recommendation**: (a).
- **What ships now**: (a).

## A6. A changelog page on nulo.sh

- **Recommendation**: not in this lane. The close-out files an `owner-decision` issue: a page built from `release-notes/*.md`.
- **What ships now**: nothing on the landing.

## A7. Who writes the file, and who approves it

- **Recommendation**: whoever prepares the promote drafts `release-notes/X.Y.Z.md` on `dev` before the promote, naming the version release-please will pick (a `feat` since the last stable makes a minor, fixes alone a patch). The owner signs off the text, as for any copy a person reads. The `release` skill states this.
- **What ships now**: that step in the skill.

## A8. AMO 1.2.0.0 shows no release notes (information, no code)

- The owner may paste `release-notes/1.2.0.md` into 1.2.0.0's "Release notes" in the Developer Hub. AMO's API could set it on the existing version, but no workflow does, and a one-off script for one version is not worth one.

## A9. Tags from before this flow (v1.2.0 and older)

- **The consequence**: once this reaches `main`, a store dispatch from `main` for v1.2.0 fails at `release-notes`, because v1.2.0's tree lacks the composer and a notes file. A `--ref v1.2.0` dispatch still runs v1.2.0's own workflow, which rewrites the published body to git-cliff's list alone (dropping the hand-written "What's new"). Chrome 1.2.0 is in review now.
- **Options**: (a) accept: if 1.2.0 needs another Chrome upload, submit it by hand in the dashboard (or dispatch before this merges to `main`); (b) a version floor that exempts old tags (rewrites 1.2.0's body on a re-dispatch); (c) compatibility code for old tags.
- **Recommendation**: (a). The close-out files it as a closed `known-limit` issue.
- **What ships now**: (a), with a troubleshooting row in the `release` skill.

## A10. The issue's done line: a dispatch rehearsal

- **The gap**: #1668 is done "when a `dry_run=true` dispatch prints a body that starts with the notes, a stable tag without a notes file fails the notes job, and the AMO request body carries `release_notes`". No tag carries a notes file or the composer until the next stable, so no dispatch can print a composed body now.
- **What proves it instead**: unit tests (composer, gates, AMO request body), pins on the job's wiring, and a local run of the job's own step with git-cliff 2.14.2 that reproduces the published v1.2.0 body. The live proof is the next stable's own run (its preview prints the body; its AMO job, when dispatched, logs the notes' length). Optional, the owner's call: an rc cut from `dev` before that stable exercises the job's wiring (an rc copies git-cliff's text through).
- **Recommendation**: accept, and keep `Closes #1668` on the PR.
- **What ships now**: `Closes #1668`; if the owner declines, the orchestrator changes it to `Refs #1668` before the merge.

## A11. A stable that skips AMO

- **The case**: 1.0.0 never reached AMO, so 1.1.0.0's AMO notes covered 0.31.0.0 to 1.1.0. One file feeds both surfaces, and the GitHub Release covers only the span since the previous stable.
- **Options**: (a) the file covers the Release's span; when the previous stable skipped AMO, the owner pastes a combined text in the Developer Hub after the job; (b) the file covers AMO's span (over-describes the Release); (c) a second, AMO-only file.
- **Recommendation**: (a). The `release` skill says so.
- **What ships now**: (a).
