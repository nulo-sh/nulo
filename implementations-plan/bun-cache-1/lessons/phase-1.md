# bun-cache-1 phase 1: one rule over both caches

## Red first (before the workflow edits)

`bun test scripts/ci-cd/release-integrity.test.ts scripts/ci-cd/behavior-gating.test.ts`: 180 pass, 7 fail. The composite pin failed (`no-cache` absent). `sharedCacheFindings` on the real tree listed exactly the six planned jobs, `store-check.yml#chrome`, `#firefox`, `release.yml#publish-chrome-store`, `#publish-firefox-amo`, `pr-quick.yml#preview-comment`, `_release-pr-lockfile.yml#lock-version`, plus the lockfile job again under `release.yml#release-pr-lockfile` and `release-prerelease.yml#release-pr-lockfile`. Each mutation case failed only on those extra findings.

## Green

After the composite line, the six `no-cache: true` lines and the docs: the four touched test files 225 pass. One Biome format fix (a long `test.each` row). Gates on `58d8ab92d`: `lint:actions`, `lint`, `typecheck:all`, `test:ci-gating` (733 pass), `test`, `test:all` exit 0; `test:release` fails exactly the 7 base `zip-read`/`zip-reproducible` tests (no `zip` on this host).

## Runner proof

Branch pushed (a branch push triggers no workflow: only `release.yml` on `main` and `publish-token-list.yml` on `dev` have push triggers). Dispatches at `58d8ab92d`: pr-quick run 41362992433, source-rebuild run 41362994480.

## Codex fix loop round 1 (gpt-6.1-sol high): findings 3

1. `CUSTOM_SECRET` matched `secrets` case-sensitively; GitHub resolves context names in any case, so `${{ Secrets.X }}` escaped both `privileged()` and the new rule. Demonstrated in memory. Accepted: the `i` flag (which also reads `secrets.github_token` as the job token) and a mutation case in "credentialed jobs". Red-checked: the case fails with the flag removed.
2. SECURITY.md and the composite description said "a job that holds a credential", which reads as including read-scoped `github.token` jobs that keep the cache, and promised a download, which also rests on the runner precondition. Accepted: they name write scopes, App tokens and stored secrets, and SECURITY.md says setup-bun neither restores nor saves the binary. Rejected: deleting the composite's pre-existing install-cache rationale; it is the input's why, not this lane's text.
3. Two doc comments narrated the generator and the finding function. Accepted: one sentence each, the inheritance rule and the composite boundary.

Slip: a red check done by editing the file and then `git checkout -- <file>` also dropped that file's uncommitted round-1 edits; re-applied from the script. A red check on a file with uncommitted edits needs a WIP commit first.

## Opus diff review (beside round 1): findings 1

SECURITY.md's new sentence sat under "`release-integrity.test.ts` pins all of it", but the release builds' half is pinned by `behavior-gating.test.ts` (the composite mapping and `_build-extension.yml`'s input). Accepted: the sentence names that file. It re-ran the rule over all 24 workflows (every credentialed run covered, no false finding) and confirmed each mutation case is caught only by its own branch.

## Runner proof at `58d8ab92d`

- pr-quick dispatch 41362992433: success. `Build Chrome` and `Build Firefox` log `Downloading a new version of Bun: …/bun-v1.4.2/bun-linux-x64.zip`; `Lint + Typecheck`, `Unit tests`, `Build Landing`, `Build Storybook` (cache on) log `Using a cached version of Bun: 1.4.2+744846f84`; `Detect changes` and `Preview build comment` set up no Bun on a dispatch.
- source-rebuild dispatch 41362994480: success. `reference (fresh build)` logs the x64 download; `rebuild on x86_64` keeps the cached binary (D4); `rebuild on ARM64` downloaded on a cold cache.
