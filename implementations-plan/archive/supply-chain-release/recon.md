# Recon: supply-chain-release

Read against `origin/dev` at `90f4fb3`, plus the live repository settings read with `gh api` on 2026-10-08 (read-only). Two read-only explorers (sonnet) mapped the release graph and swept for reuse; the planner verified the load-bearing claims by hand. Line numbers are at that commit.

## Reuse map

| Capability needed | What exists | Verdict |
|---|---|---|
| Pin a workflow's YAML shape in a test | `scripts/ci-cd/*.test.ts` parse with `Bun.YAML.parse(readFileSync(...))`, one local helper per file; `publish-packages.test.ts:26-34` pins per-job `permissions`; `behavior-gating.test.ts:584-630` (`holdsWrite`, `stepsOf`) walks jobs and reusable workflows | **adapt**: a new `release-integrity.test.ts` copies the `publish-packages.test.ts` shape. No shared YAML helper exists to reuse (each file re-declares a one-liner); adding one is out of scope. |
| SHA-pin a new action | `scripts/ci-cd/action-pins.test.ts:17` (regex `@<40 hex> # vX.Y.Z`), `:44-52` (one SHA per action repo) | **reuse-as-is**: the new `actions/attest-build-provenance` and the extra `create-github-app-token` uses pass it as long as every use of one action shares one SHA. |
| Mint a narrow App token | `.github/workflows/_release-pr-lockfile.yml:33-36` already passes `permission-contents: write` | **reuse the pattern** in every other mint. No test pins any mint today (searched `create-github-app\|permission-` in `scripts/`). |
| Release-flow decision logic, unit-tested | `scripts/release/auto-unstick.ts` (pure) + `auto-unstick-run.ts` (injected I/O, `import.meta.main` CLI); same split in `open-sync-pr*.ts`, `lock-version*.ts` | **reuse the split** for a new `attach-assets.ts` / `attach-assets-run.ts`. |
| Reproducible zips + checksums | `scripts/release/zip-reproducible.ts`; `release.yml:346-358`, `nightly.yml:501-513` | **reuse for packaging only**. The zip bytes depend on the runner's `zip` (`zip-reproducible.ts:44`), so a rebuild is not proven byte-equal; `source-rebuild.yml` proves the Firefox tree, not the zip. Superseded verdict: see § Added after the audits. |
| End-user verify text | `cliff.toml:24` (prerelease) and `:38` (stable) carry `shasum -a 256 -c SHASUMS256.txt`; nothing else does (SECURITY.md, README, landing, `apps/extension/store/` searched) | **adapt** `cliff.toml`. |
| Hash-pinned download in CI | `.github/actions/setup-aztec/action.yml:66-133` (`pin_for`, `fetch`, keyed `installer-pins.sha256`); `setup-geckodriver` and `setup-presto-server` (tarball + binary pins, single-member extract) | **adapt** `setup-aztec`: add a Foundry pin to the same file and move the install into one script both CI and `docker-ci-like.sh` run. |
| Run a repo script from a test | `assert-canary-results.test.ts:80` (`Bun.spawnSync(["bun", SCRIPT, ...])`), `aggregators.test.ts:78` (`bash -c`), `complexity-baseline.test.ts:305` (`git`) | **reuse the pattern** for the home-path guard test. No test runs a `.sh` file directly yet. |
| Audit-finding acknowledgement | none: SECURITY.md:371-378 is prose, no per-advisory list in the repo (searched `classif\|triage\|GHSA` in SECURITY.md, CLAUDE.md, `scripts/`) | **build new**: an acknowledgement file plus a small gate script. Justification: `bun audit --ignore` takes ids only, so the reasons need a home a test can read. |
| Content-script web-accessible entries | `@crxjs/vite-plugin@2.7.1` `dist/index.mjs:2907-2943` builds one entry per content script with `use_dynamic_url` hard-coded `false` (`:2928`); `contentScripts.standaloneFiles` (`index.d.mts:383-406`) builds a listed script as a self-contained IIFE, whose resource list holds no chunk | **adapt**: drop the entry if the built chunk has no imports, else `use_dynamic_url: true` through a crxjs `renderCrxManifest` hook. Superseded verdict: `standaloneFiles` fails the third-party-notices policy (§ Added after the audits). |
| Lint + typecheck of root `scripts/` | `biome.json:6-20` includes only `scripts/ci-cd/test-soak/**` and `scripts/ci-cd/plans/**`; no tsconfig covers `scripts/`; root `package.json` declares no `typescript` and no `@types/bun` (no workspace declares `@types/bun` either) | **build new**: a `scripts/tsconfig.json`, root devDependencies, a `typecheck:scripts` leg. |

## The release graph (who writes tags and releases)

- **Tags.** `auto-unstick` pushes the stable/rc tag with `GITHUB_TOKEN` as `github-actions[bot]` (`release.yml:132-147`, `auto-unstick-run.ts:161-164`), not with the App. release-please would create it with the App (mint at `release.yml:75-80`) but aborts on its known bug. The manual unstick pushes it as the owner (CLAUDE.md:574-585, 615-621). Nightly creates `v<version>-nightly.<YYDDD>` through the Releases API with `GITHUB_TOKEN` (`nightly.yml:547-559`).
- **Releases.** Stable and rc releases are created **published and empty** (`auto-unstick-run.ts:173-180`; runbook `gh release create ... --notes "Filled by publish run."`), then `attach-assets` uploads with `--clobber` and overwrites the body 15-45 minutes later (`release.yml:425-433`). A `workflow_dispatch` republish repeats the upload on a published release. Nightly makes one `gh release create <tag> <3 assets> --target --prerelease` call; gh (2.85 source, `pkg/cmd/release/create/create.go:498-560`) creates it as a draft, uploads, then publishes, and deletes the draft on failure.
- **Nothing deletes, moves or force-updates a `v*` tag**, and nothing deletes or prunes a release (searched `.github`, `scripts`, `package.json`, CLAUDE.md for `git push --force|--delete|tag -f|refs/tags|gh release delete|git/refs|-X DELETE|-X PATCH`; the only `--delete` is `prune-stale-branches.sh`, which deletes branches). The one implied tag delete is manual: CLAUDE.md:679 tells the owner to "delete/fix the bad tag" after an auto-unstick abort.
- **No workflow triggers on a tag push or a release event** (searched every `on:` block), so moving the tag push to an App token starts no run.
- **App token mints** (all `actions/create-github-app-token@bcd2ba49… # v3.2.0`): `release.yml:75-80` (release-please on `main`), `release.yml:475-480` (sync PR), `release-prerelease.yml:39-44` (release-please on `dev`), `_release-pr-lockfile.yml:33-36` (already `permission-contents: write`). Only the last is narrowed.
- **Job token permissions**: `release.yml` default `contents: read`; `release-please` contents/pull-requests/issues write; `auto-unstick` contents + pull-requests write; `attach-assets` contents write (`environment: production`); `sync-main-to-dev` contents + pull-requests write; `publish-chrome-store` contents read + id-token write. `nightly.yml` default `contents: read`, `publish-nightly` contents write.

## Live repository state (read 2026-10-08)

- Rulesets: two, both branch rulesets: `24609904` "dev: squash (+ merge for release sync)" and `24609903` "main: merge-commit only", each with one `pull_request` rule and the owner (`User` 2982991, `alejoamiras`) as a `pull_request`-mode bypass. **No tag ruleset.**
- Immutable releases: `GET repos/nulo-sh/nulo/immutable-releases` → `{"enabled":false,"enforced_by_owner":false}`. The endpoint exists, so `PUT` (enable) and `DELETE` (disable) are the API surface; no dashboard step is needed.
- The release App: `GET apps/nulo-sh-release` → id `5179103`, permissions `contents: write`, `issues: write`, `pull_requests: write`, `metadata: read`. No `workflows`, no `administration`.
- Actions: `default_workflow_permissions: read`, `can_approve_pull_request_reviews: false`, `sha_pinning_required: false`.
- Branch protection on `main`: `required_signatures` on, force-push and deletion off, the four required checks (app id 15368).
- Releases: three, all mutable (`immutable: false`): `v0.30.2` (stable, created by the owner, assets uploaded by `github-actions[bot]`, assets carry `digest` fields), `v0.30.2-nightly.26280`, `v0.30.2-nightly.26281`. Tags: those three only.

## Immutable releases, as documented

- Publishing a release locks its assets and its tag; title, notes, and prerelease/latest status stay editable. A draft is not locked. Enabling applies to future releases only. Deleting an immutable release frees the tag for deletion, but the tag name can never be reused (docs.github.com, "Immutable releases"; gh's own help text in `create.go:110-121`).
- Each immutable release gets a GitHub release attestation, checked with `gh release verify <tag>` and `gh release verify-asset <tag> <file>` (gh 2.85).

## Aztec toolchain install (#12)

- The pinned installer (`6.0.0-rc.1/install`, sha256 `af20f705…`, re-downloaded and re-hashed for this recon) hardcodes `VERSION=6.0.0-rc.1`, honours `INSTALL_URI` and `NARGO`, and has no input for its two other chains: `install_foundry` pipes `https://foundry.paradigm.xyz` into bash with `FOUNDRYUP_VERSION=0.0.8`, then runs `foundryup -i <foundry version from versions>`; `install_aztec_packages` runs `npm install @aztec-labs/aztec@$VERSION @aztec-labs/cli-wallet@$VERSION --prefix "$version_path"` with no lockfile. The whole file is one `{ ... main "$@"; exit }` block.
- The pinned `versions` manifest names `noir: 1.0.0-rc.3`, `foundry: 1.4.1`, `node: 24.12.0`.
- Foundry `v1.4.1` publishes `foundry_v1.4.1_linux_amd64.tar.gz` (GitHub asset digest `sha256:f1b044ee954402807c4dd5a5e7d29b210d24fd3633b7f199d184f034ff94d934`) and a matching `.attestation.txt`.
- A lock-only resolve of the CLI tree (scratch dir, `npm install --package-lock-only --ignore-scripts` with the 7-day gate and the two Aztec excludes, npm 11.19.0) gives 1,118 packages and a 556 KiB `package-lock.json`. Seven packages declare install scripts: `@parcel/watcher`, `bcrypto`, `leveldown`, `lmdb`, `msgpackr-extract`, `protobufjs`, `unrs-resolver`.
- `apps/extension/scripts/e2e/docker-ci-like.sh:70-76` pipes Foundry's installer and `:95-101` pipes the Aztec installer from `install.aztec.network` (a different host from CI's pinned `install.aztec-labs.com`); it also downloads Node (`:53-67`) and Bun (`:46-48`) unverified.

## Audit backlog (#20)

- `bun audit --audit-level=low` on the worktree (Bun 1.4.2): 72 advisories (35 high, 30 moderate, 7 low) in 21 packages, matching the issue.
- `bun audit fix --dry-run`: would fix 31 in 11 packages (axios, both brace-expansion lines, fast-copy, fast-uri, js-yaml, pbkdf2, qs, source-map-js, undici 7, vitest, ws); 41 remain: blocked by a dependent's range (`@fastify/busboy` via undici 5, `@opentelemetry/*` and `systeminformation` via the Aztec telemetry tree, `undici 5` via `@aztec-labs/foundation`, `ws` via `@aztec/viem`, `uuid` via gaxios/teeny-request, `sharp` and `undici 7` via miniflare, `@vue/server-renderer` via `vue@3.5.41`, `@vitest/mocker` via `vitest@4.1.10`), and no published fix for `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm) and `elliptic@6.6.1` (GHSA-848j-6mx2-7j84).
- `bun audit` takes `--ignore=<GHSA>` (repeatable); there is no config-file form.
- The CI step (`_lint-and-typecheck.yml:109-152`) never exits non-zero: advisory by construction, not by `continue-on-error`. No test pins it.

## Root `scripts/` under Biome (probe on a scratch copy, Biome 2.5.13)

- 92 files in scope once `scripts/**` is included; 38 would be reformatted.
- Lint: 7 errors (cognitive complexity 16-18 in `assert-canary-results.test.ts:99`, `publish-packages.test.ts:212`, `complexity-baseline/rescore.ts:78`, `dup-trend/report.ts:49`, `release/publish-chrome-store.ts`, `release/publish-chrome-store-run.ts`; one `noShadowRestrictedNames` in `aggregators.test.ts:71`), 20 warnings (17 `noTemplateCurlyInString`, from GitHub-expression strings in tests), 6 infos.
- 54 `.ts` files outside the two already-included trees; their external imports are `bun:test`, `bun`, `node:*`, plus a few `@nulo-sh/*`, `@aztec-labs/*` and `vitest` imports (test-soak and publish tests).

## Smaller items

- `interpretPreflight` (`scripts/release/publish-chrome-store.ts:100-133`) refuses only `PENDING_REVIEW` among submitted states; `STAGED` passes (`KNOWN_REVISION_STATES` holds it). Its tests assert refusals with `toMatchObject({ ok: false, reason: expect.stringContaining(...) })`.
- `auto-unstick` parses the flag inline (`auto-unstick-run.ts:185-188`: on only for `on|true|1`); no test covers the parse. Sentences that say the default is off: `auto-unstick-run.ts:45`, `auto-unstick.ts:55`, `release.yml:112-113`, CLAUDE.md:562 and :698, CI.md:107.
- `scripts/check-no-local-paths.sh` greps the whole tracked tree (case-insensitive) and runs only from `.githooks/pre-commit`.
- `.commitlintrc.json` overrides only `type-enum`; `config-conventional`'s `subject-case` refuses only sentence/start/pascal/upper case. All 17 subjects on `dev` are already lower-case.
- The content script (`apps/extension/src/content-script/content.ts`, 22 lines) is exercised by the network suite only (`network/cold-wake-discovery.test.ts`, `session-tabNavigate.test.ts`); no smoke spec loads it. The built manifest's web-accessible list is read only by `network/pxe-host-state.test.ts:38-50`.

## Added after the audits (verified by the planner)

- **release-please can still create releases.** `release-please-action@45996ed1` (`src/index.ts:141-144`) calls `manifest.createReleases()` unless its `skip-github-release` input is set; neither release-please config sets `draft`. release-please 17.6.0 supports `draft` and `force-tag-creation` (`src/manifest.ts:1200-1201`, `src/github-api.ts:667-690`), and selects the merged Release PRs to publish by the `autorelease: pending` label (`src/manifest.ts:1092-1118`); a later run finds the previous release through its tag (`src/manifest.ts:860-880`).
- **The privileged jobs run third-party code.** `attach-assets`, `publish-nightly` and `auto-unstick` run the `setup-bun` composite, whose last step is `bun install --frozen-lockfile` (trusted packages' lifecycle scripts run), after a checkout that keeps its token in `.git/config`, with `GH_TOKEN` set job-wide. `orhun/git-cliff-action` (pinned by SHA) downloads the git-cliff binary at run time through its `install.sh`, inside the job that would hold `id-token: write`. None of the release scripts imports anything but `node:*`, `bun` and sibling files.
- **Zip bytes depend on the runner's `zip`.** `zip-reproducible.ts:44` shells out to the system `zip`; `source-rebuild.yml` proves the unpacked Firefox tree, not zip bytes and not the Chrome build. Rebuild equality is therefore not a safe precondition for a store republish.
- **Deployment environments.** `production` (used by `attach-assets`) has no protection rule; `chrome-web-store` and `firefox-add-ons` allow `main` only and need the owner's review; `npm-publish` allows `dev` and `main`.
- **crxjs standalone output is an emitted asset.** `emitIifeOutputs` emits the IIFE as `type: "asset"` (`index.mjs:1350-1361`) from a sub-build with `plugins: []` (`:1400-1415`), and the notices generator refuses an emitted code asset that is neither a built chunk nor claimed by a VENDORED entry (`packages/third-party-notices/src/generate.ts:249-254`). The standalone route therefore needs a notices-policy change.
- **Chrome honours `use_dynamic_url` from Chrome 130** (Chromium extensions PSA, October 2024), and `chrome.runtime.getURL` returns the dynamic URL for such resources; behaviour of the crxjs loader's `import()` under it is unmeasured.
- **Attestations need a public repository on the Team plan.** `nulo-sh/nulo` is public; the org plan is `team`.
