# Nightly release

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `.github/workflows/nightly.yml` publishes a prerelease of the extension built from `dev` every night, documented in `CI.md`; `.github/workflows/release.yml` keeps nightly tags out of a stable release's notes range.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Publish one tagged prerelease per day, `v<version>-nightly.<YYDDD>`, from the tip of `dev`, so anyone can install the current state of `dev` without a maintainer building and zipping it. Each nightly is its own GitHub Release and history is kept (a rolling tag was rejected). The run is gated hard on every suite and does nothing on a day when `dev` has not moved.

## Why

Stable releases lag `dev` by days to weeks, and release candidates are cut by hand. Anyone asked to try current `dev` needed a maintainer to hand them a build.

Chrome and Firefox cap every manifest version component at 65535, and the manifest config derives its version by stripping non-numerics from the package version. A full calendar date would overflow the last component and break the build, so the suffix is the two-digit year plus the day of year. A same-day re-run advances that code instead of appending `.1`, which would add a fifth component and an invalid manifest. During a release-candidate series `dev` carries a prerelease version, so the base is normalised to its `MAJOR.MINOR.PATCH` prefix and the run fails loudly if there is none.

## What shipped

- A scheduled and manually dispatchable workflow (`force` bypasses the quiet-day skip, `dry_run` runs every gate and skips the publish) that resolves the version from an explicit checkout of `dev`, so a dispatch from any branch behaves like the schedule. The schedule avoids the top of the hour, GitHub's peak-load mark.
- Gates reuse the existing reusable workflows: lint and typecheck, unit tests, the full network suite in the shape of the pull-request gate, both browser builds with the nightly version, and a smoke run against the built artifact. Publishing requires every gate to equal `success`, so a skipped gate cannot pass it, and a red night creates no tag and no release.
- A flake policy that differs on purpose from the pull-request gate: the network suite keeps its default retries, which absorb flakes, where a pull request must surface them.
- The release job alone holds the write token, and probing for existing tags is written so a network error aborts instead of reading as "tag absent".
- Stable release notes are protected: `.github/workflows/release.yml` picks the notes range by ancestry and excludes nightly tags, so a stable cut the day after a nightly still documents everything since the previous stable. The nightly's own notes deliberately use the previous nightly as their boundary, a daily delta.
- An interrupted publish does not self-heal. Re-dispatching creates a fresh date-code tag, and the recovery path is written in `CI.md` rather than adding an idempotent create.
