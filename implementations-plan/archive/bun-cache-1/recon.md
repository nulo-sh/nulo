# bun-cache-1 recon

Base: `origin/dev` at `4c6e0aea3` (after #1492). One Sonnet explorer (reuse sweep) plus the planner's own reads. Paths are repo-relative.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Turn off setup-bun's binary cache | `oven-sh/setup-bun@0c5077e5` (v2.2.0) input `no-cache`; upstream `src/action.ts` `isCacheEnabled` returns false when it is set, so the step neither restores nor (post step, `src/cache-save.ts`) saves the binary; read with `getBooleanInput`, which takes `"true"`/`"false"` | reuse-as-is |
| Precedent for the inline form | `publish-packages.yml#pack` passes `no-cache: true` (`:95-99`), pinned as a boolean by `scripts/ci-cd/publish-packages.test.ts:65` | reuse-as-is |
| The composite's cache switch | `.github/actions/setup-bun/action.yml`: input `cache` (`:11-19`) gates only the `actions/cache` step (`if: inputs.cache == 'true'`, `:38-45`); its setup-bun step (`:32-36`) passes no `no-cache` | adapt (one input line) |
| "Holds a credential" predicate | `scripts/ci-cd/release-integrity.test.ts`: `privileged()` (`:97-102`: `id-token`, `attestations` or `contents` write, a stored-secret read parsed per `${{ }}` span, an App token mint) and `writes()` (`:419`: any write scope); `jobs()` (`:55`) scans a reusable workflow's jobs in its own file | reuse-as-is |
| Finding function + mutated copies | same file: `setupBunTokenFindings` (`:268`, the sibling rule), `mutated`/`unset`/`step` (`:669-683`), the "Bun's setup" describe (`:910`) | reuse-as-is (add a sibling) |
| Install-cache audit | `scripts/ci-cd/behavior-gating.test.ts` "Bun's install cache" (`:1650-1696`): the composite's cache `if` pin, `_build-extension.yml`'s `cache` expression pin, any write-holding job's composite step passes `cache: "false"` (`holdsWrite`, any write scope or App mint; composite steps only) | adapt (pin the composite's `no-cache` beside its `if`) |
| Shared workflow-scan module | none: every `scripts/ci-cd/*.test.ts` defines its own loaders (searched non-test `scripts/**/*.ts` for YAML parsing, `stepsOf`, `privileged`, `secrets`) | not built (see plan D5) |
| Other Bun-binary sources in CI | none: no tool-cache, no `~/.bun` cache, no Docker image, no curl install in `.github/**`; `apps/extension/scripts/e2e/docker-ci-like.sh` is local only (searched `.bun`, `bun upgrade`, `bun.sh/install`, `bun-linux`, `tool-cache`, `oven/bun`) | n/a |
| Input validation of `no-cache` | no `actionlint` config; actionlint does not check third-party inputs, so only tests pin it | n/a |

## Every Bun setup site (enumerated by a scratch scan of `.github/workflows/*.yml`)

- **Inline, credentialed, no `no-cache`** (the change): `store-check.yml#chrome` (`id-token: write`), `#firefox` (AMO secrets); `release.yml#publish-chrome-store` (`id-token: write`), `#publish-firefox-amo` (AMO secrets); `_release-pr-lockfile.yml#lock-version` (App mint; called from `release.yml` and `release-prerelease.yml`); `pr-quick.yml#preview-comment` (`pull-requests: write`, which `privileged()` does not count and `writes()` does).
- **Inline, no credential**: `source-rebuild.yml#rebuild-x64`, `#rebuild-arm64` (`contents: read`; rebuilds compared with the shipped tree, not shipped).
- **Composite with `cache: "false"`** (covered once the composite maps the input): `release.yml` `auto-unstick`, `select-assets`, `attach-assets`, `sync-main-to-dev`; `nightly.yml` `publish-nightly`, `prune-nightlies`; `publish-token-list.yml` `prepare`, `sign` (stored signing key, no write scope), `publish-pr`; `pr-quick.yml#changes`; `verify-store-copies.yml#compare`; `_build-extension.yml` on every event but `pull_request` (release, nightly and source-rebuild builds).
- **Composite, cache on**: the PR lanes, unit tests, lint, the e2e suites, nightly's read-only jobs. No credential beyond `secrets.GITHUB_TOKEN` with read scopes.

## Docs that describe the switch

`.github/actions/setup-bun/action.yml:12-19` (the `cache` input), `.github/WORKFLOWS.md:52`, `CI.md:263`, `CI.md:125` and `SECURITY.md:739` (the tag and publish jobs: "run no third-party action but `oven-sh/setup-bun`, which gets no token"). `SECURITY.md:604-607` and `CLAUDE.md:111` speak of the install cache only and stay.

## Path filters (what the PR will run)

`.github/actions/setup-bun/**` is in all four e2e lanes' filters (`pr-extension-smoke-e2e.yml:100`, `-firefox.yml:84`, `pr-extension-network-e2e.yml:108`, `-firefox.yml:93`), and `pr-quick.yml`'s `workflows` filter takes `.github/**`, so the PR runs all five required checks without a label.

## Collisions

- #1448 (open; its Bun half closed by #1492 as P94-18 = A, "the inline steps take it from there too"): routing the inline steps through the composite is not open; this lane keeps them inline.
- Two credential predicates exist (`privileged`/`writes` in release-integrity, `holdsWrite` in behavior-gating). The new rule uses release-integrity's, whose stored-secret read is span-parsed; a whole-text `secrets` regex in behavior-gating matched a run script's text in `_extension-network-e2e.yml` and would mark every network lane credentialed.
- Closed known limits searched (`cache`, `setup-bun`): none in this area.
