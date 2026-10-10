# Phase 1 lessons: arc 1, workflows

## 1.1 Storybook gate (#166)

- Local `STORYBOOK_DISABLE_TELEMETRY=1 bun run --cwd apps/extension build-storybook`: 8.9 s wall (22.7 s user), "Storybook build completed successfully". `storybook-static/` is already in the root `.gitignore`.
- Red on the old shape: with the `expect build-storybook` line removed, `aggregators.test.ts` fails the four "fails … once any one need ends otherwise" cases for `pr-quick.yml` (61 pass, 4 fail). With the base copy of `pr-quick.yml` (ac259a7), the new `behavior-gating.test.ts` case "Storybook builds wherever the extension does, and reports nothing to Storybook" fails (0 pass, 1 fail).
- Gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test` 0 (Tests  10715 passed | 4 skipped | 7 todo (10726)), `test:ci-gating` 0 (449 tests, 0 fail), `lint:actions` 0, `build-storybook` 0.

## 1.2 Live labels and live head (#167)

- Deviation (D13): the step runs `scripts/ci-cd/live-labels.sh` after the checkout rather than four inline copies; the four lanes are pinned to one script and their own two labels.
- `gh api` prints `gh: <message> (HTTP <code>)` on stderr (`gh: Not Found (HTTP 404)`, gh 2.85.0), so the retry rule matches `HTTP 4xx` other than 403/429 as a refusal and retries everything else once. The body is buffered per attempt, so a failed attempt's error JSON never reaches the parsed output.
- Red on the base copies of the four lanes (ac259a7): `behavior-gating.test.ts -t "live labels"` 6 pass, 2 fail (the snapshot ban and the wiring pin); `aggregators.test.ts -t "live label"` 0 pass, 4 fail (the base `decide` reads an empty `LABEL_HIT` as false). Script mutations: dropping the head comparison fails "moved past"; dropping the retry fails "fails closed".
- Gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test` 0 (Tests  10715 passed | 4 skipped | 7 todo (10726)), `test:ci-gating` 0 (461 tests, 0 fail), `lint:actions` 0; `shellcheck scripts/ci-cd/live-labels.sh` clean.
