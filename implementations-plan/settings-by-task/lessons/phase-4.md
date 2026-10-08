# Phase 4: screenshots and full gates

## Captures

- Throwaway spec `tests/e2e/zz-settings-shots.test.ts` on the smoke config, 2/2 passed, deleted after the run; `git status --porcelain` showed only the gitignored `_impl.diff`. No rebuild: HEAD differed from the `dist` build only in comments under `src`.
- 36 PNGs at 720x1200 (360x600 at 2x), each surface light and dark, published as a private Artifact (link in `plan.md` § P4). The hub needed five scroll positions per profile kind (top, Apps and networks, Safety, Preferences, bottom): top and bottom alone skip three groups.
- Checked against the UI impact table: the profile card, the six groups in order, the row values ("30 min", "Prices on", the theme name, "Off"), the passkey hub without Change password, Lock without strict mode for passkey, Your profile's Type row, Privacy's two controls, Display without the fiat toggle and with the Lists label, Developer without Block Explorer.
- Fully scrolled, the Delete profile row ends at 503px and the bottom nav starts at 536px: nothing hides under the nav.
- A fresh e2e profile is named "Main", so the avatar reads "MA"; the plan's "PR" example assumes a profile named "Primary".

## Gates

Run alone at `9b04b28` plus the plan edits, before the rebase onto `origin/dev` (rerun after it; see `phase-5.md`):

- `bun run audit:vue`: exit 0 in 2:37 wall (typecheck 33.6s, lint 1.9s, 699 test files / 10,372 tests passed, 3 files and 4 tests skipped, build 12.1s).
- `bun run check:plans`: 0 findings.
- `bun run test:ci-gating`: 334 pass, 0 fail.
- `git status --porcelain`: only the gitignored `_impl.diff`; no spec, no image.
