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

## 2.3 Store copies (#179)

- **Re-measure (step 1), 2026-10-10, before any code.** Both stores still serve 0.30.2.0 (`version_name` 0.30.2) for tag `v0.30.2`. Chrome: 36,680,569-byte CRX3, header 1,310 bytes, sha256 `65b3d142…5ad81`; AMO: v5 API `file.hash` `sha256:e3948938…37ad`, matched by the download (36,895,518 bytes). Unpacked against the release zips (both matched `SHASUMS256.txt`): the same differences as phase 0, and one more the tree diff had hidden: the Chrome copy's central directory also holds a `_metadata/` directory entry (627 entries: 625 files, that directory, `_metadata/verified_contents.json`). A directory entry carries no bytes (`unzip -p` reads it as 0 bytes, exit 0), so the allowlist names it exactly beside the file (D20). Every other file is byte-identical; the AMO manifest is equal as JSON, Chrome's adds only `update_url`. The release zips hold no directory entries (`zip -D`).
- **`unzip` is the trust boundary of the reader.** Measured on Info-ZIP 6.0: with a central directory and local header claiming 10 bytes, `unzip -p` still streamed all 5,000,000 bytes and exited 0, so the reader counts bytes as they stream and stops at the caller's bound. `unzip -Z1` prints a control character as `^` plus a letter (`a\x01b` lists as `a^Ab`), and `unzip -p zip -dash` reads `-d` as an option and dumped every entry: the reader refuses a leading `-`, wildcards, a backslash and a caret before it spawns, and `entryListProblem` refuses the same in a listing.
- **`fetchVerified`** is exported with `PublishedReadIO` (the read half of `AttachIO`, which now extends it) and `Pick<RunInput, "tag" | "tagSha">`; its body is unchanged, `runVerifyPublished` is unchanged, and `attach-assets-run.test.ts` passes with no edit (its `["download 1", "download 2", "download 3", "notes"]` order included). The store script composes it for `SHASUMS256.txt` and the one zip, checks that `SHASUMS256.txt` lists exactly the two zips and that the zip's line matches, and holds only the read methods (`realStoreIO`'s keys are pinned).
- **The job token's attestation scope could not be measured before merge** (D19): anonymous `api.github.com` answers 403 rate-limited from this host, and a scheduled or dispatched workflow first runs once it is on `dev`. The workflow grants `attestations: read` explicitly.
- Mutations, each red: attestation skipped for every version (3 cases), the `SHASUMS256.txt` line check removed, the AMO hash check removed, the draft check removed, the `update_url` value unchecked, the `.gitkeep` emptiness unchecked; in the reader, the byte count removed (the lying-directory case) and the name guard removed (2 cases).
- **Live case** (`TMPDIR` under the lane's cache, `GH_TOKEN` from the local `gh` login, never printed): `NULO_STORE_COPY_LIVE=1 bun test scripts/release/store-copy.test.ts` exit 0; both stores "the served copy is the release zip, up to the store's own additions", each with the frozen-list notice for v0.30.2.
- Local gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test` 0 (10771 passed), `test:ci-gating` 0, `test:release` 0 (294 tests, 283 pass, 11 skip, 0 fail), `lint:actions` 0, live case 0. The gate counts once the D-orch-7 review answers.
- **Review fixes** (Codex round 1, the Opus review; verdicts in plan.md). The manual block: `git grep` exits 1 both on no match and on a path missing from the commit, so the block checks both files with `git cat-file -e` before trusting exit 1; and in zsh `"$MERGE_COMMIT:legal/…"` reads `:l` as the lowercase modifier, so the variable is braced. Exercised in bash and zsh on five commits (0.x, blank, filled, a missing document, a bad sha): it tags only on the filled one. Each new run guard (`SHASUMS256.txt` naming another zip, `readArchive`'s entry-list check, the shared output budget, `__proto__` in a served manifest) is red with its guard removed.
- `pages-options.test.ts` fails whenever `TMPDIR` sits under a dot-directory (the lane's `~/.cache`): run the suites with the default `TMPDIR`, and point only the live case's scratch there. And never run `typecheck:all` beside `test:ci-gating`: the rescore test writes `*.rescore-*` siblings that `tsc` then reports missing (TS6053).
- Gate after the fixes, 2026-10-10: `lint` 0, `typecheck:all` 0, `test:ci-gating` 0 (479 pass), `test:release` 0 (301 tests, 291 pass, 10 skip), `lint:actions` 0, `packages/legal` 59 pass + 1 skip.

## 2.4 `hoist = false` (#172): stop rule fired, reverted

- **Baseline (step 1)** at phase 2.3's tip `2f46ecf`, default `TMPDIR`: 13,988 test identities (13,958 pass, 23 skip, 7 todo, 0 fail) across every workspace's vitest json report and the `bun test` junit of `test:release`, `test:ci-gating` and `infra/passkey-rp`.
- **Fresh install (steps 2-4):** `hoist = false` under `[install]`; all 19 `node_modules` directories deleted; `bun install --frozen-lockfile` exit 0 with the pxe patch applied (patched store dir `+9654951505f092be`, the patch's first added line present in `dest/pxe.js`); `node_modules/.bun/node_modules` absent.
- **Battery (step 5):** release, ci-gating, the landing build and `phantom-sweep` exit 0. These failed:
  - `audit:vue` 2: aztec-runtime typecheck, 49 errors.
  - `test:all` 1.
  - `build:firefox` 1.
  - the playground build 1.
  - `build-storybook` 1.

  Six third-party packages import what they do not declare. The first five:
  - `@aztec-foundation/aztec-standards` (it declares no dependencies) → `@aztec-labs/aztec.js`.
  - `@pinia/testing` → `vue`.
  - `local-pkg`'s `importModule`, for vite-plugin-pages → `@vue/compiler-sfc`.
  - `storybook` → `@storybook/vue3-vite`.
  - vite-plugin-node-polyfills rewrites `buffer` in store modules to `vite-plugin-node-polyfills/shims/buffer`. The extension's absolute alias for that specifier never runs on a rewritten one.

  The sixth surfaced only after the first five were hoisted: presto's lazy `import("@aztec-labs/simulator/client")`. In this repository: aztec-runtime uses Node APIs with no `@types/node` declared.
- **Six entries is past the rule's three**: reverted (`git checkout -- bunfig.toml`, fresh frozen install, fallback directory back, tree equal to `2f46ecf`). The list is commented on #172. Steps 6-7 did not run.
- **One bounded probe, not committed**, completed the list for #172. With the six in `publicHoistPattern`, `test:all`, `build:firefox`, the playground build and `build-storybook` exit 0; typecheck still needs the aztec-runtime declaration. Smoke and network e2e were never reached, so the list may be incomplete.
- **Silent hazard:** vite-plugin-pages catches a route-block parse failure, logs it and carries on. With `@vue/compiler-sfc` unreachable the build succeeds (68 logged errors) with every page's `<route>` meta gone, `isAuthRequired` included. `legacy-routes.test.ts` is what fails, and CI runs the unit tests before any build.
