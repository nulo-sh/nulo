# quality-tooling-1 recon

Base: `origin/dev` at `038901c5b`. Two Sonnet explorers (release I/O; tsconfig consumers) plus the planner's own reads. Nothing in `scripts/release/` or `infra/token-list/scripts/` changed since the issues' commit `51ea220`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| GitHub REST request (token, `Accept`, API version `2022-11-28`, timeout, redirect) | four closures: `lock-version-run.ts:62-79` (60 s, follow, throws on `!ok` with detail), `attach-assets-run.ts:372-384` (300 s, manual, lets 302/404/422 through), `prune-nightlies-run.ts:83-90` (60 s, manual, never throws), `infra/token-list/scripts/open-publish-pr.ts:178-189` (60 s, follow, 404 on GET passes, no detail) | adapt: `githubHeaders` and `refusal` in `scripts/release/github-rest.ts`; each caller keeps its own `fetch`, status, redirect and timeout (plan D1) |
| Refusal text `METHOD path: HTTP n[: message]` | `lock-version-run.ts:70-75`, `attach-assets-run.ts:380-383`, `prune-nightlies-run.ts:91-94` | reuse-as-is (moves into the module) |
| `createCommitOnBranch` | `lock-version-run.ts:88-104`, `open-publish-pr.ts:203-217` | stays: see the signing closure below |
| Commit-to-PR lookup through `gh api commits/<sha>/pulls --jq .[]` | `open-sync-pr-run.ts:117-139` (exit ≠ 0 → `null`), `auto-unstick-run.ts:146-174` (exit ≠ 0 → throws) | adapt: `scripts/release/gh-pulls.ts` |
| Ensure a label, then edit | `open-sync-pr-run.ts:204-211`, `auto-unstick-run.ts:192-199` | stays: one line with a colour per caller (plan D6) |
| Store answer decode, request-failure reason, non-JSON refusal | chrome `publish-chrome-store-run.ts:43-47,206-222,267-277`; firefox `publish-firefox-amo-run.ts:46-50,280-296,329-338`; byte-identical apart from the timeout variable | adapt: `scripts/release/store-http.ts` |
| Store status policy, `apiError`, JWT minting | per store; `apiError` differs (`publish-chrome-store.ts:356` vs `publish-firefox-amo.ts:157`) | stays per runner |
| Zip reads | `zip-read.ts` (async, 60 s deadline, streamed caps, literal names), used only by `store-copy-run.ts`; runners use sync `execFileSync("unzip")` | stays: decision D9 of the archived `ci-release-supply` plan, re-checked (plan § D5) |
| SHASUMS check | `attach-assets-run.ts:298-306` (checks both zips; no name-set check), `store-copy-run.ts:113-117` (name set checked; one zip hashed) | adapt: export one `checkShasums` with the stricter name check and a list of zips to hash |
| Asset digest lookup and compare | `attach-assets-run.ts:256-269` (`attestedAsset`, `checkBytes`); `store-copy-run.ts:88-93` (`fetchDigestOnly`, the frozen 0.30.2 path) | stays: the frozen path keeps its one compare line (plan D8) |
| Root compiler options | none: no `tsconfig.base.json`; 20 standalone configs restate `module`, `moduleResolution`, `strict`, `noEmit`, `skipLibCheck`; `target` ESNext in 18 (ES2022 in `infra/passkey-rp`, `infra/subscribe`); `isolatedModules` in 18 (not landing, playground) | build new: `tsconfig.base.json` |

Absence trails: no other GitHub REST client (searched `api.github.com`, `X-GitHub-Api-Version`, `Bearer`, `createCommitOnBranch`, `redirect: "manual"` over `scripts/**`, `infra/**`, `apps/**`, `packages/**`); no other production `unzip` caller (`"unzip"` over the same; `apps/extension/tests/e2e/fixtures/update/release.ts:129` is an e2e fixture); no test or script enumerates tsconfigs or reads `compilerOptions` (`tsconfig` over `scripts/`, `apps/*/{scripts,src,tests}`, `packages/*`, `infra/*`, `*.test.ts`).

## Facts that shape the design

- **The token-list signing closure.** `infra/token-list/test/publish.test.ts:429-463` requires every file `publish-token-list.yml` runs, and every repository file those import, to sit under `SIGNING_PATHS` (`infra/token-list/scripts/summary.ts:21-29`): "everything that decides what gets signed, what this summary shows, or what runs beside a secret". A relative import of `scripts/release/github-rest.ts` from `open-publish-pr.ts` fails that test until `SIGNING_PATHS` grows, which widens what the token-list approver reviews.
- **No-install jobs.** Every job that runs one of the eight runners is on `release-integrity.test.ts`'s `NO_INSTALL` list (Opus r1). Their imports today are relative files, `node:*` and `bun` only (`auto-unstick-run.ts` reaches the dependency-free `packages/legal/src/launch.ts` by relative path). A shared module may import nothing else; no test checks it yet.
- **The real I/O is mostly untested.** `realPruneIO` and lock-version's in-`main` IO have no test; `realIO` (attach) has one URL/method/body test (`attach-assets-run.test.ts:390-398`); `githubIO` (token-list) pins `"POST repos/nulo-sh/nulo/pulls: HTTP 404"` (`publish.test.ts:370`). No test pins the refusal detail suffix.
- **Store runners' zips are this run's own.** `release.yml` downloads them from the run's `attach-assets` artifact and checks their SHA-256 before the publish step; the Firefox source archive is `git archive HEAD` built in the job.
- **`audit:dup` sees neither item.** jscpd at `--min-tokens 50` finds no production clone under `scripts/release` (the copies sit under the token floor), and it ignores `*.json` and `infra/`. Base: 1548 clones, 21216 duplicated lines, 3.36 % lines.
- **tsconfig consumers.** `typecheck:all` (unfiltered in `pr-quick.yml`), `vue-tsc`, `tsc -p` per workspace, `scripts/publish/stage.ts:203` (in-repo `packages/<dir>`, so `extends` resolves), Vite (reads class-field transform options through `extends`; `tsconfig.target` does not select its output target). `git archive HEAD` builds the Mozilla source archive, so a tracked root file is included. `behavior-gating.test.ts` refuses a filter pattern not all five lanes hold, and its explicit root list (`:729` on `a0458e21a`) requires a root input to be present. `_lint-and-typecheck.yml:44` keys the tsbuildinfo cache on `tsconfig.json` files. `CI.md:236` lists the root build inputs.
- **`apps/extension/tsconfig.node.json`** is `composite`, run by no script, and fails `tsc -p` today (TS5097, TS6307).
- **Probes** (no emit): `tsc --noEmit --isolatedModules` passes in `apps/landing`, `apps/playground` and its `test/`; `--target ESNext` passes in `infra/passkey-rp`, `infra/subscribe` and its `test/`.
- **Base `bun run test:release`**: 334 pass, 7 fail (`zip-read`, `zip-reproducible`: this host has no `zip` binary; CI does).

## Collisions

- `w3-ci-1` edited the four e2e lane filters and `behavior-gating.test.ts`; it merged as #1583 (`a0458e21a`) while this plan was audited, so arc 2 builds on it. The root-input list moved to `behavior-gating.test.ts:729`.
- No open PR touches `scripts/release/` or `infra/token-list/scripts/`.
