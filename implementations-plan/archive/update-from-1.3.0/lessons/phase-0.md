# Phase 0: planning

- 2026-11-19, recon by hand, no Explore agent: `git diff --stat v1.3.0 93aeedbc1` touches only the version files, `bun.lock` and `CHANGELOG.md`, so the release is `dev`'s source and a sweep of `v1.2.0..v1.3.0` (542 files) would read code the candidate-side helpers already drive. The one release-side driver written against an older UI, `openReleaseSend`, was found by reading `fixtures/update/release-ui.ts` against the tag (F4).
- 2026-11-19, v1.3.0's zips: checked four ways (recon.md). The hosts were read from `assets/seeds-CCF6EBFS.js` with every URL cut to its host, as #1650 did.
- 2026-11-19, review proportion: bounded work (the lane brief), so one Codex pass over the plan and the completed diff, no Opus leg and no separate plan audit.
