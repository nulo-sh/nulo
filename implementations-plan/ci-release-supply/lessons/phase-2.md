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

## 2.2 presto-banners 1.2.0 (#82)

`bun pm diff @alejoamiras/presto-banners@1.1.0 1.2.0`, read before the pin moved: 27 files changed, 0 added, 0 removed (+471 −119); `package.json` changes only `version` (no dependency, `exports` or licence change); `src/status.ts` is untouched, so `stateFromStatus` maps every SDK status as before.

- **New `connect` state.** `BannerState` gains `connect`, which `stateFromStatus` never returns (the host sets it); every surface gains a connect body, a `connectButton` and the `presto-banner:connect` event. Nulo never sets it: the onboarding card is pinned to `offline`, and `uiStateFromStatus` cannot produce it, so `copyFor`/`rowDescriptionFor` never see it (their `default` arms would take it).
- **Strings Nulo reads.** Only `STRINGS["permission-blocked"]` changes: title "Your browser blocked local access" → "Your browser blocked this site from reaching Presto", support "Allow local network access for this site, then retry" → "Allow it in site settings, then retry". Nulo reads the title on the onboarding arm only and never the support; `available`, `secure-connection-unavailable`, `version-mismatch` and `error` are unchanged.
- **The offline card.** `render.ts`'s `ctaLink` no longer prepends `btn `; every non-connect caller now passes `btn btn-…`, so the card's offline markup is byte-identical. `styles.ts` adds `.get`, `.spin`, `.btn[aria-disabled]`, billboard and tile link rules, a `spin` keyframe and `position: fixed` on the Sheet's dialog; none applies to the offline card.
- **Element.** A same-value `state` write now ends a pending connect wait; a host-set state other than `connect` has no connect button, so it is a no-op for Nulo.
- **CSP.** The stylesheet is still injected into the shadow root; the extension CSP's `style-src 'self' 'unsafe-inline'` already allows it, so no hash moves.
- Published 2026-09-25T21:39Z, 15 days before the bump: past the 7-day `minimumReleaseAge` with no exclude.
- Red first: with 1.2.0 installed and the onboarding arm still reading `STRINGS["permission-blocked"].title`, `presto-ui-state.test.ts` fails on "Your browser blocked this site from reaching Presto"; with the literal it passes, assertion unchanged (only the test's name changed).
- `bun audit` exits 1 whenever any advisory exists, acknowledged or not, so the gate's criterion is the audit gate: `bun audit --json` then `audit-gate.ts … --mode enforce` printed "41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable", exit 0. The bump changes a dependency line, so CI's gate runs in enforce mode on the PR too.
- Gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test` 0 (10771 passed), `test:all` 0, `build:chrome` 0, `build:firefox` 0 (each `THIRD-PARTY-NOTICES.txt` lists `@alejoamiras/presto-banners@1.2.0 MIT`), `onboarding-tab.test.ts` smoke on Chrome at `--retry=0`: 11 of 11, `bun install --frozen-lockfile` 0, audit gate (enforce) 0, `test:ci-gating` 0.
