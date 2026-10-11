# Phase 1: #309, the tag rides every release edit

## Gate (2026-10-11)

- `bun test scripts/release/attach-assets-run.test.ts`: 22 pass, 3 skip (the opt-in REST probe), 0 fail.
- Base proof: `scripts/release/attach-assets-run.ts` replaced by its `2a41b1d` copy, the new test file run, the fix restored. 15 pass, 7 fail:
  - `apply` happy path: red at its exit assertion with the run's log as the message, `release 100 changed while it was published: it belongs to untagged-100`.
  - `verify-published` happy path: red on its edit, `{ body: "notes" }` without `tag`.
  - `realIO` edit test: red, the PATCH body carries `tag` instead of `tag_name`.
  - Also red, each at `exit` 1 for the same detachment: `apply` "writes the tagged commit into the notes", "replaces what a failed run left", "reads again while GitHub trails", "creates a nightly's tag at the target". Every refusal test stays green on the base copy, as before.
- After the restore: `bun run test:release` (304 tests, 0 fail), `bun run test:ci-gating` (526, 0 fail), `bun run lint` (exit 0; the 27 warnings and 3 infos are the base's, none in the touched files), `bun run typecheck:all` (exit 0; `scripts/tsconfig.json` covers `scripts/release/`).

## Notes

- The base proof used a copy of the base file rather than commit-then-`git checkout HEAD --`; the same bytes run either way.
- The fake's `editRelease` takes `{ tag?: string; ... }` while `AttachIO` requires `tag`: a wider parameter is assignable, and the fake has to model the tagless edit the base code sent.
