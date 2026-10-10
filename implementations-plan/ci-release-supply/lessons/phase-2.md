# Phase 2 lessons: arc 2, scripts and installs

Arc 2 branches from `dev` at c0e1e69 (#252 squash-merged arc 1; D-orch-5).

## 2.1 The launch gate (#183)

- `packages/legal/src/launch.ts` imports nothing and owns `PLACEHOLDER`; `document.ts` imports it from there, so the placeholder has one spelling. `launchBlanks` throws on a version it cannot read rather than treating it as "not a launch".
- `auto-unstick-run.ts` reads both documents at the merge commit through a new `readFileAt` IO call (`git show <sha>:<path>`, so a missing file throws) and vetoes a `create` with the new runner action `refused` (exit 1, no tag, no relabel). The pure `decideUnstick` is unchanged.
- The manual unstick's check is a `case` with leading-paren patterns inside `$(...)`, which both bash and zsh parse; run against HEAD it prints the two Terms blanks for `1.0.0` and tags for `0.31.0`.
- Wiring proved once (step 5): root `version` set to `1.0.0` in the working tree, `NULO_LAUNCH_GATE=1 bun run test src/launch.test.ts` in `packages/legal` failed listing `legal/terms.md:3` and `:578` (exit 1); `package.json` restored with `git checkout`.
- Reds: the threshold disabled (`< 99`) fails the 1.0.0 and 2.1.0 unit cases; the threshold removed fails the 0.x/rc control; the preflight disabled fails the auto-unstick refusal case; the base copy of `auto-unstick-run.ts` fails four of the five new cases; the `expect launch-legal` line removed fails every `pr-quick.yml` "fails … once any one need ends otherwise" world (70 pass, 5 fail); the base `pr-quick.yml` fails the new behaviour pin.
- `bunx biome` at the root fetches npm's latest (lessons.md); format with `node_modules/.bin/biome` (2.5.13).
- Gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test` 0 (Tests 10771 passed | 4 skipped | 7 todo), `test:all` 0, `test:ci-gating` 0 (477 pass), `test:release` 0 (243 tests, 9 skip, 0 fail; `zip` is now on this host), `lint:actions` 0.
