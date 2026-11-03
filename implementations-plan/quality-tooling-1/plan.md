---
plan: quality-tooling-1
tier: light
status: arc 1 merged (#1586); arc 2 in review
issues: "#1454 (arc 1); #1448, its tsconfig half (arc 2)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at a0458e21a (recon read 038901c5b; nothing planned changed between them but the `behavior-gating.test.ts` line numbers)
trunk: dev
post_implementation_hardening: not scheduled
---

# quality-tooling-1: the release runners' shared I/O, and one root tsconfig base

Three release runners each build GitHub REST headers and refusal errors, two look up a commit's PRs, the two store runners decode answers the same way, and the store-copy check restates the SHASUMS check (#1454). Twenty tsconfigs restate one compiler core (#1448; its Bun half shipped in #1492). The owner's go, quoted in the lane brief, 2026-11-02: "If they are worth doing and legit. I'd do them." Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1; arc 1 ships today's behaviour without it).

## Outcome & Quality Bar

- **For whom**: the maintainer who bumps the GitHub API version, changes an error-detail rule, adds a workspace or a compiler flag.
- **Excellent**: (1) each such change is one edit in `scripts/release` (the token-list client keeps its own, D3) or in the base (the two token-list configs keep theirs, D9), and every runner keeps its status, redirect, timeout and retry policy in its own code; (2) no release job, typecheck or build behaves differently except the named convergences D7 and D11 and the answered OA-1 (D12), proven by pins written before each move, unchanged resolved compiler options, unchanged build bytes and unchanged staged npm packages.
- **Good enough**: copies under ten lines whose sharing needs a parameter per caller stay. `audit:dup` cannot see either item (recon), so the PR reports line counts, and the trend must not rise.
- **UI impact**: none. No extension source changes; arc 2's gate proves the built extension's bytes unchanged.

## Findings (verified at `038901c5b`)

Both issues are structural duplication, demonstrated by trace (recon reuse map). Consequence: a policy change takes three to twenty edits, and the copies have drifted (detail kept or dropped, `null` or throw). Claims that did not hold: (a) #1448's Bun half and its stale comment shipped in #1492; (b) the "same class of bug" comment the issue's prose places at `open-sync-pr-run.ts:207` is about a missing label, not the swallowed lookup, and the prose's `:64-74` is really `:117-120`; (c) the publish runners skip `zip-read.ts` on purpose: D9 of the archived `ci-release-supply` plan, and `zip-read.ts:1-4` scopes itself to zips from outside the repository; (d) the `STALE_DATA` retry lives in `runLockVersion`, not in the mutation.

## Assumptions

- **Facts**: F1 every cite in recon.md, re-read on the base. F2 the token-list signing closure test (`publish.test.ts:429-464`) refuses an import of `scripts/release/` from `open-publish-pr.ts` unless `SIGNING_PATHS` grows. F3 every job that runs one of the eight runners installs nothing (`release-integrity.test.ts` `NO_INSTALL`), so a module they load may import only relative files, `node:*` and `bun`; today all do. F4 the store runners read this run's own artifact, checksum-verified before the step (`release.yml`, publish jobs). F5 a tracked root file enters the Mozilla source archive (`git archive HEAD`). F6 `behavior-gating.test.ts` refuses a filter pattern that not all five lanes hold; only its explicit root list (`:729`) requires a root input to be present. F7 base `test:release`: 334 pass, 7 fail, all `zip-read`/`zip-reproducible` (this host has no `zip` binary; green in CI). F8 Bun applies a workspace tsconfig's `paths`, through `extends`, to bare imports at run time (scratch probe).
- **Inferences**: I1 Vite reads its class-field transform options through `extends` (`target` does not pick its output); the bytes gate shows whether anything Vite emits changed, whatever it reads. I2 `tsc` emits identical declarations once the resolved options are unchanged; the resolved-config and staged-package gates check both halves.
- **Asks**: OA-1 only (OWNER-ASKS.md), answered B by the orchestrator on 2026-11-03, owner to confirm (D12). D7 and D11 are named convergences, not asks: neither changes a screen, a job's outcome or emitted bytes.

## Architecture & Implementation

New modules sit in `scripts/release/` beside `workflow-command.ts`, the precedent; each carries a TSDoc contract and imports only builtins (F3, pinned by a new closure test). `store-http.ts` does not import `github-rest.ts`, so the store jobs never load GitHub-token code.

- **`github-rest.ts`**: `githubHeaders(token, accept = "application/vnd.github+json")` returns `Authorization: Bearer`, `Accept` and `X-GitHub-Api-Version: 2022-11-28`; its TSDoc says the token goes wherever the caller's URL points, so callers pass GitHub hosts only. `refusal(res, method, url): Promise<Error>` builds `METHOD path-without-query: HTTP n`, plus `: message` when the body is JSON with a string `message`. Each runner keeps its own `fetch(url, { ...init, headers, redirect, signal })`, so its redirect and timeout stay visible.
- **`gh-pulls.ts`**: `commitPullsText(repo, sha)` runs `gh api repos/<repo>/commits/<sha>/pulls --jq .[]` and throws `gh api commits/<sha>/pulls failed (exit n): <stderr>` on a non-zero exit (auto-unstick's text). `parsePulls(text)` yields one object per line, lazily. Two functions, so open-sync could catch the transport failure alone until OA-1 was answered (D4); since D12 both callers let it reject. Each runner keeps its selection rule.
- **`store-http.ts`**: holds the store runners' logging contract ("never a request, a header, the token or a raw exception"), which justifies sharing lines this small: `ApiResponse`; `readApiResponse(res)` (`await res.text()`, then JSON or `null`; a failing body rejects); `requestFailure(what, e, timeoutMs)` (class name or "timed out after N s"); `unreadableAnswer(what, res): string | null` (a reason only, never a status, so a non-JSON 400 keeps Firefox's RECOVERY text). Status policy, `apiError` and JWT minting stay per runner. The two runner tests import `ApiResponse` from it.
- **`attach-assets-run.ts`** exports `checkShasums(io, version, dir, hashed)`, typed on `readText` and `sha256` only: the name set must equal the version's two zips, then each zip in `hashed` must match.
- **`tsconfig.base.json`**: `target` ESNext, `module` ESNext, `moduleResolution` Bundler, `strict`, `noEmit`, `isolatedModules`, `skipLibCheck`, and one comment: compiler checks only, since Bun reads this chain at run time in jobs that hold secrets (F8). Eighteen configs `extends` it and drop those keys; `paths`, `lib`, `types`, `include` stay local; the two Workers keep `target` ES2022. `infra/token-list`, `packages/token-list` and `apps/extension/tsconfig.node.json` stay as they are.
- **Changed files, arc 1**: the three modules, `github-rest.test.ts`, `store-http.test.ts`, a test-only `fake-gh.ts` (a `gh` script in a temp dir put first on `PATH`), a closure test; the eight runners; the tests of all eight. **Arc 2**: `tsconfig.base.json`, 18 tsconfigs, the five PR filters, `behavior-gating.test.ts:729`, `_lint-and-typecheck.yml:44`, `CI.md:236`; and D12's call site in `open-sync-pr-run.ts`, its test and the `release` skill.
- **Not taken**: `githubFetch(url, init, { accept, redirect, timeoutMs })` (restates `RequestInit` as options, Opus r1); `scripts/lib/` (no consumer outside `scripts/release` after D3).

## Security & Adversarial Considerations

- **Assets**: the release App token (contents and PR write), `GITHUB_TOKEN` with release write, the store credentials (WIF token, AMO JWT secret). A change to a shared module changes every runner at once, so each module stays small, builtins-only and pinned by tests at its boundary.
- **Token reach**: no transport gains a URL rule; prune's `nextPage` keeps refusing a foreign host, attach's absolute URLs stay `uploads.github.com`, and the signed-storage download keeps its bare `fetch`, pinned to carry no credential.
- **Logs**: `store-http.ts` keeps the store contract word for word; `refusal` logs only GitHub's `message`, as three runners do today.
- **Signing surface**: `SIGNING_PATHS`, `open-publish-pr.ts` and the two token-list tsconfigs stay as they are (D3, D9), so the root base stays out of the token-list publish code's resolution (F8).
- **Supply chain**: no new package. A base can loosen every workspace at once, so it holds only options the configs already share, and arc 2 compares every resolved config, build and staged package before and after.

## Arc 1 (#1454) — branch `worktree-quality-tooling-1`

### Phase 1 — GitHub transport ✓
- Move lock-version's IO verbatim out of `main` into exported `realLockIO(repo, token)` (D2).
- Pin first, green on the base, one commit, with `fetch` and `AbortSignal.timeout` spied (no wait). Prune `deleteTag("v1")` on a 422 `{"message":"Reference does not exist"}` rejects `DELETE git/refs/tags/v1: HTTP 422: Reference does not exist`, sending the bearer, the JSON `Accept`, the version, `redirect: "manual"` and 60 s. Attach `tagCommit("v9")` reads a 404 as `null` and rejects a 500 `{"message":"boom"}` as `GET git/ref/tags/v9: HTTP 500: boom`. Attach `uploadAsset` posts to `uploads.github.com` with the bearer, `Content-Type: application/octet-stream` and 300 s. Attach `downloadAsset` asks with `Accept: application/octet-stream` and `redirect: "manual"`, then follows the 302 with a request that carries no `Authorization`. Lock `read` sends the raw `Accept`, no `redirect` and 60 s, and rejects a 404 `{"message":"Not Found"}` as `GET repos/o/r/contents/bun.lock: HTTP 404: Not Found`. Lock `commit` reads a `STALE_DATA` answer as `false`.
- Add `github-rest.ts`; route the three runners. `github-rest.test.ts`: one table for `refusal` (JSON message, non-JSON body, query dropped).
- Add the closure test: from every `scripts/release/*-run.ts`, each import is relative, `node:*` or `bun`.
- **Gate**: `bun run lint && bun run typecheck:all && bun run test:release`. Pass: the first two exit 0; `test:release` fails only F7's 7 host reds; every pin is green before and after the move.

### Phase 2 — commit-to-PR lookup ✓
- Move both runners' IO verbatim out of `main` into exported `realUnstickIO(repo)` and `realSyncIO(repo)` (D2).
- Pin first, green on the base, through `fake-gh.ts`: unstick `resolveMergedPr` rejects a non-zero exit with its text, reads empty output as `null`, and skips an associated PR whose `merge_commit_sha` is not the commit; sync `resolveReleasePrMergeSha` reads a non-zero exit as `null` and picks the release PR past an unrelated one.
- Add `gh-pulls.ts`; route both runners. Open-sync catches `commitPullsText`'s throw alone and returns `null`: today's skip, until OA-1.
- **Gate**: Phase 1's.

### Phase 3 — store answers and SHASUMS ✓
- Pin first, green on the base: each runner's `realFetch` on a JSON body, a non-JSON body (`json: null`) and a body whose stream fails (rejects); Firefox on a non-JSON 400 from create-version prints RECOVERY, not REJECTED.
- Add `store-http.ts`; route both runners; the `realFetch` pins move to `store-http.test.ts`. The pinned texts ("HTTP 502 with a non-JSON body", "timed out after", "unexpected failure (…)") stay green unedited.
- Export `checkShasums`; `store-copy-run.ts` calls it with `[zip]`. New case in `attach-assets-run.test.ts`: a two-line SHASUMS naming a wrong zip reads "does not list exactly the two zips" (D7).
- **Gate**: Phase 1's, plus `bun run test:ci-gating`, `bun run audit:vue`, `bun run check:plans`, `bun run audit:dup` (no rise from 1548 clones, 21216 lines). No e2e: arc 1 touches no extension code. The PR states the eight runners' line counts before (1990) and after.

## Arc 2 (#1448, tsconfig half) — branch `quality-tooling-1-a2` off `origin/dev` (Dev4)

### Phase 4 — root tsconfig base ✓
- Before the edit, at one HEAD, twice, with one environment (`LOG_LEVEL` unset): `tsc --showConfig -p <cfg>` for each of the 27 tracked tsconfigs; `bun run --cwd apps/extension build:full`; `bun run --cwd apps/landing build`; `bun run --cwd apps/playground build`; `bun scripts/publish/stage.ts --all --version 0.0.0 --out ~/.cache/nulo-backlog/quality-tooling-1/stage-<n>`. Record each output as sorted lines of relative path and SHA-256. An output that differs between the two runs stops the phase.
- Add the base; edit the 18 configs; add `tsconfig.base.json` beside `tsconfig.json` in `pr-quick.yml`'s `root-config` and the four e2e lanes' root inputs, in `behavior-gating.test.ts:729`'s list, the `_lint-and-typecheck.yml:44` cache key and `CI.md:236`.
- **Gate**: `bun run lint && bun run typecheck:all && bun run test:all && bun run test:ci-gating && bun run lint:actions && bun run audit:vue && bun run check:plans`, then the configs, builds and staging again. Pass: every command exits 0; every build and staged tree equals its before; each of the 27 resolved configs, parsed and compared as JSON (key order ignored, arrays as they are), equals its before, except `isolatedModules: true` and the `preserveConstEnums: true` it implies on landing, playground and its test config (D11); the new base is read on its own. The resolved configs cover what no build here emits (Workers, `scripts/`, the type-only packages). No e2e: no emitted byte changes.

## Decision ledger

| Id | Decision | Rejected |
|---|---|---|
| D1 | `githubHeaders` and `refusal`; status, redirect and timeout stay in caller code | an option bag restating `RequestInit`; an `allow` option |
| D2 | the three IOs still inside `main` move out verbatim as exported factories, as the other runners' already are, so each transport is pinned before it moves | leaving them untested |
| D3 | `open-publish-pr.ts` and its `createCommitOnBranch` stay (F2): a refactor does not widen what the token-list approver reviews; the PR body and a #1454 comment say so | sharing it and growing `SIGNING_PATHS` |
| D4 | the lookup throws; open-sync catches the transport failure alone until OA-1, so a parse error still turns its job red (superseded by D12) | changing open-sync's outcome in a refactor; a blanket catch (Codex r1, Opus r1) |
| D5 | zip reads stay per runner: archived D9 stands, inputs are this run's checked bytes (F4), and async adapters would move the publish path, exercised only at release, for no behaviour gain | routing through `zip-read.ts` |
| D6 | `store-http.ts` holds the decode and failure texts; the prefix-only `fail` closures and `ensureLabel` (one line, a colour per caller) stay | sharing them (Opus r1) |
| D7 | one `checkShasums` with store-copy's stricter name check: attach's text for a SHASUMS naming a wrong zip changes, its exit does not | a flag preserving both texts |
| D8 | the frozen 0.30.2 digest path stays as it is: one compare line, a path stores no longer serve | exporting two helpers for it (Opus r1) |
| D9 | 18 configs extend the base; the Workers keep ES2022, so no typecheck accepts anything new; the token-list configs stay standalone (F8, Codex r1); `tsconfig.node.json` (composite, unused, fails `tsc -p` today) stays, noted on #1448 | settling the Workers' floor here; growing `SIGNING_PATHS`; a new issue |
| D10 | arc 1 first; `w3-ci-1` merged as #1583, so arc 2 has no collision left | one PR for both |
| Dev1 | the `realFetch` pins stay in the two runner tests: `realFetch` stays per runner and is what they exercise, so no `store-http.test.ts` | moving them (plan text) |
| Dev2 | Phase 2's verbatim extraction lands with the `gh-pulls.ts` routing in one commit: once a method, Biome scores `resolveReleasePrMergeSha` at 16; the pins ran green on the extraction first (lessons/phase-2.md) | a suppression |
| Dev3 | `checkShasums`'s `hashed` defaults to both zips, so the three attach callers stay unchanged | a zips list at each caller |
| Dev4 | arc 1 squash-merged as #1586 before arc 2 began, so arc 2 branches from `origin/dev` and opens one PR with `gh pr create` | `gh stack add` on a merged arc |
| D12 | OA-1 B, the orchestrator's answer pending the owner's: open-sync's call site no longer catches the lookup's rejection, so the job fails with the `gh` error as auto-unstick's does; the lookup pin expects that error, and the `release` skill's troubleshooting row says to re-run it. An A restores the catch, the pin's `null` and that sentence | keeping A until the owner returns |
| D11 | `isolatedModules` joins the base, a named convergence for landing and playground: both transpile per file (Vite's transformer, `bun test`), for which Vite recommends the flag; it only adds diagnostics (some refused code transpiles safely today, Codex r2), changes no emitted byte, and both pass it today | keeping it local in 16 configs (Codex r1); `false` overrides that restate the drift |

## Audit verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex r1 | conditional approve: preserve resolved options; repair arc 2's build gate; stronger pins at the moved failure and credential boundaries; keep the inherited config off the signing path | the gate (`--cwd`, two runs, path-and-digest records, resolved configs); every pin it named; D4's split; token-list configs standalone (F8 by probe); no `tsconfig.node.json` issue; narrow IO types; F6, D3, recon wording | `isolatedModules` kept local (D11, argued in the final pass) |
| Codex r2 (resumed) | conditional approve: the resolved-config gate must compare parsed JSON and allow the implied `preserveConstEnums`; D11's runtime claim overreaches; recon cells superseded | all three: the gate, D11's wording (Codex accepts D11 itself), recon's verdicts and F6 note | none |
| Codex r3 (resumed) | approve: every round-2 edit verified; no new material finding | none | none |
| Opus r1 | conditional approve: the build command; resolved configs; name D11; download, upload and timeout pins; `unreadableAnswer` returns a reason; Phase 2 unpinned; drop D8 and `ensureLabel`; wording | all: D1 reshaped to `githubHeaders`, the closure test (F3 widened), the RECOVERY pin, the base comment, D6, D8, claim (b), F3, Outcome (1), collision status | none |
| Arc 1 Codex r1 | conditional approve: the fake `gh` matched too loosely; open-sync's parse failure and the lazy parse unpinned; four comments restated code | all: exact-invocation fake `gh` that fails unmatched calls, both parse pins, the comment trims | none |
| Arc 1 Opus r1 | approve: lock-version's default Accept unpinned; the download pin installs its spies before a fallible `mkdtemp`; one over-long comment | all three | none |
| Arc 1 Codex r2 (resumed) | approve: every condition and the Opus items hold; no new finding | none | none |
| Arc 2 Codex r1 | conditional approve: `nulo-subscribe`'s Workers Build watches only `infra/subscribe/**`, so a base change redeploys nothing; plan text still says open-sync catches and `parsePulls` returns an array | the plan text; the watch-path gap as a constraint in the base's comment (the Workers keep `target`, so no option of today's base reaches their bundles) | editing the README's watch paths: a dashboard setting only the owner changes |
| Cross-arc Codex | conditional approve: the plan's Outcome, `gh-pulls` paragraph and arc map predate D12 | all three | none |
| Arc 2 Opus r1 | conditional approve: the base's no-`paths` invariant has no test; B pinned only at the IO; split B into its own PR; "stuck release" is the wrong symptom; `target` steers class-field emit; the skill row's fallback; plan text predating D12 | a closure test over every tsconfig the release scripts resolve through, a `runSync` rejection pin (each red under its mutation), the TSDoc, the base comment, the fallback sentence, D4 and Delivery | the split: the orchestrator asked for one PR, whose body names D12 under "Decision pending the owner" |

## Delivery

- **Arc 1**: one ready PR to `dev` (`gh pr create`), no labels, after its Codex loop converges and its gates pass. Title: `refactor(release): share the github transport, store http reads and the shasums check` (85). Body: what and why, gates with outcomes, line counts and `audit:dup` before and after, "Not done, and why" (D3, D5, D6, D8), `Closes #1454`.
- **Arc 2**: one ready PR to `dev` from `origin/dev` (Dev4), carrying D12 under a "Decision pending the owner" line. Title: `build(ts): a root tsconfig base holds the compiler options every workspace shares` (81). Body as arc 1's, with the comparisons, `Closes #1448`. Deviation: the close-out lands as arc 2's final commits, not a docs-only top layer, since arc 2 is the last PR. It carries the Outcome, lessons, the #1448 comment on `tsconfig.node.json` and the `git mv` to `archive/`.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `a0458e21a`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's diff, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; the arc map says arc 2 touches only tsconfigs, filters, docs and D12's call site. One Opus `general-purpose` review beside each arc's round 1. Hard stop at three rounds.
- Steps 3 and 4 as written; the final cross-arc pass runs at arc 2's boundary.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/quality-tooling-1/plan.md`, then `agent-worktree done quality-tooling-1 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Arc 1 phases ✓ in implementations-plan/quality-tooling-1/plan.md, each gate passing in the transcript; the Codex loop converged on arc 1's diff (a resumed pass with no new material finding, quoted); a ready PR to dev closing #1454; `bun run test:release` and `bun run lint` green apart from F7's host-only reds.
- `/loop 15m` Drive implementations-plan/quality-tooling-1 from plan.md and lessons/: next unchecked phase, its gate, the Codex loop, delivery; never merge.
