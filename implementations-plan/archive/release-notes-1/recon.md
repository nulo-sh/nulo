# Recon: release-notes-1

Base: `origin/dev` at `7eed331bb`. One Sonnet reuse sweep plus the driver's own reads. No open PR touches `release.yml`, `cliff.toml`, `apps/extension/store/` or the `release` skill (checked #1664, #1669, #1687). Closed `known-limit` issues on releases (#376, #377, #740, #1079, #1353) do not cover release notes.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Release body source | `release.yml` job `release-notes`: git-cliff (`orhun/git-cliff-action` v4.9.1, git-cliff v2.14.2 by the action's default) writes `/tmp/release-notes.md`, uploaded as artifact `release-notes`; `attach-assets` passes it as `NOTES` to `scripts/release/attach-assets-run.ts`, which replaces `@SOURCE_COMMIT@` and sets the body in `apply` and again in `verify-published` | reuse: compose inside the same job, same output path, so `attach-assets` and `nightly.yml` need no change |
| A gate that a stable release must pass before its tag | the legal-blank gate: `pr-quick.yml` job `launch-legal` (every PR into main, the tree's root `package.json#version`), `auto-unstick-run.ts` (`create` refuses, reading the files at the merge commit through `io.readFileAt`), the manual unstick snippet in the `release` skill | adapt: the notes gate takes the same three points |
| Code-point length, AMO caps | `publish-firefox-amo.ts`: `amoChars`, `NOTES_MAX = 3000`, `reviewerNotes` | reuse `amoChars` |
| AMO version request | `versionRequest(guid, uuid, approvalNotes)` sends `{ upload, approval_notes }`; `publish-firefox-amo-run.ts` `readInputs` checks every input before any request | adapt: add `release_notes` |
| Workflow command escaping | `scripts/release/workflow-command.ts` `command`, `plain` | reuse |
| Version parsing | `packages/legal/src/launch.ts` (`VERSION` regex, throws on an unreadable version); `resolve-tag.ts` (`-` means prerelease) | reuse the shape; no semver comparator is needed |
| Em dash rule on Markdown | none: `copy-dash-ban.test.ts` scans TS/JS/Vue only; `listing.md` holds 8 em dashes and is unscanned (searched `em dash`, `—`, `.md"` in test files) | build new, scoped to the notes files |
| Per-version notes store | none: no `release-notes/`, `notes/` or changelog page (searched `release-notes*`, `changelog*`, `apps/landing/src`) | build new |

## Constraints the change must meet (tests that pin them)

- `scripts/ci-cd/release-integrity.test.ts`: the `release-notes` job stays secret-free and unprivileged (lines 456-493, 742-900); a job with `setup-bun` and no install must be in `NO_INSTALL` (line 340) and call `bun --no-install` (its checkout sets `ref:`); a raw `oven-sh/setup-bun` step needs `with.token: ""`; `cliff.toml` must keep its two `gh attestation verify` lines (lines 683-697, 1405-1416).
- `scripts/ci-cd/artifact-handoffs.test.ts`: keep the upload step `id: upload`, artifact `release-notes`, `outputs.artifact_id`.
- `scripts/release/runner-imports.test.ts`: every script a workflow names imports only `node:`, `bun` and relative files.
- `scripts/release/publish-firefox-amo-run.test.ts:262` pins the version body with `toEqual`; it changes with `release_notes`.
- `nightly.yml` job `nightly-notes` renders the same `cliff.toml`, so a group change reaches nightly bodies.
- Test runners: `test:release` (`bun test scripts/release/ scripts/publish/`) and `test:ci-gating` run in `pr-quick.yml` `unit-tests` on every PR, unfiltered, so a root `release-notes/` file is covered. A root `release-notes/` sits in no e2e path filter; `apps/extension/**` would trip the extension filter.

## Outside facts (fetched 2026-11-05)

- addons-server `master` at `ad6dd82a`: `Version.release_notes = PurifiedMarkdownField(db_column='releasenotes', short=False, max_length=3000)` (`src/olympia/versions/models.py`); the v5 version serializer takes `release_notes` as a translated field, an object keyed by locale (`src/olympia/api/fields.py`, `TranslationSerializerField.run_validation`; docs: API v5 "Version Create", "Translated Fields"). `PurifiedMarkdownTranslation` renders Markdown and keeps only `a, abbr, acronym, b, blockquote, code, em, i, li, ol, strong, ul` (`src/olympia/translations/models.py`), so headings are dropped and `- ` bullets become a list.
- AMO public API: the add-on's `default_locale` is `en-US`; `1.2.0.0` is listed with `release_notes: null`; `1.1.0.0` carries the `listing.md` block as `{"en-US": …}`.
- The v1.2.0 GitHub Release body was edited by hand: `## What's new in 1.2.0`, a lead line, 12 bullets (1,799 code points, no em dash, no heading), `---`, then git-cliff's output. `listing.md` holds only 1.1.0's block, not 1.2.0's.

## Planning rehearsal (git-cliff v2.14.2, SHA-512 checked, run locally on 2026-11-05)

- The job's range for v1.2.0 is `v1.1.0..v1.2.0`. With `v1.2.0:cliff.toml` and the job's arguments, git-cliff reproduces the published body's git-cliff part, equal once both ends are trimmed. The published body joins the notes and that part with `\n\n---\n\n\n`.
- A candidate `cliff.toml` (groups `<!-- 0 -->Features` … `<!-- 3 -->Reverts`, a final `{ message = ".*", skip = true }`, the heading as `group | striptags | trim | upper_first`) renders v1.2.0 as Install, Verify, Features (17), Bug Fixes (62), and renders a range with no kept commit (the prerelease branch) without error.
