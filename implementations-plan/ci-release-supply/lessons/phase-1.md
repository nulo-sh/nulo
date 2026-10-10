# Phase 1 lessons: arc 1, workflows

## 1.1 Storybook gate (#166)

- Local `STORYBOOK_DISABLE_TELEMETRY=1 bun run --cwd apps/extension build-storybook`: 8.9 s wall (22.7 s user), "Storybook build completed successfully". `storybook-static/` is already in the root `.gitignore`.
- Red on the old shape: with the `expect build-storybook` line removed, `aggregators.test.ts` fails the four "fails … once any one need ends otherwise" cases for `pr-quick.yml` (61 pass, 4 fail). With the base copy of `pr-quick.yml` (ac259a7), the new `behavior-gating.test.ts` case "Storybook builds wherever the extension does, and reports nothing to Storybook" fails (0 pass, 1 fail).
- Gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test` 0 (Tests  10715 passed | 4 skipped | 7 todo (10726)), `test:ci-gating` 0 (449 tests, 0 fail), `lint:actions` 0, `build-storybook` 0.
