# Phase 0: planning consults

Every consult of the planning panel, failed ones included. Paths are repo-relative.

## Round 1, Codex (gpt-6.1-sol, high, session 01a1418d)

Ran on the `alejo-icloud` Codex home: the managed `CODEX_ACCOUNT=best` routed it there although the brief set no account. Verdict: conditional approve.

1. High, "`bun run test:e2e -- --retry=0` keeps the config's two retries". **Rejected, refuted:** Bun 1.4.2 consumes the `--` (a scratch script printed argv `a --retry=0` for `bun run show -- a --retry=0`), so vitest receives `--retry=0`; vitest's `parseCLI` would only bury it under `options["--"]` if the `--` survived.
2. Medium, a stale `origin/dev` can base arc 2 without arc 1. **Accepted:** fetch first and prove arc 1's squash commit is an ancestor.
3. Medium, the network config includes only `tests/e2e/network/**`, so a top-level shot spec never runs under `e2e:agent` (`vitest.e2e.network.config.ts:15`). **Accepted:** the connect-window spec lives under `network/`.
4. Medium, Fact 3 overreached on `Input` callers. **Accepted:** a template walk of every `Input` and `SearchField` call site found one more fill, the log viewer's `Popover` (`--dropdown-bg`, 5.77 / 5.52); a pin row is added. I2 became part of Fact 3.
5. Low, `sourceFiles()` skips `base.css` and `utilities.css`. **Accepted:** the sweep adds both; keys use `resolveSelector()`.
6. Low, OWNER-ASKS said arc 2's PR exists only on A, while the plan opens a close-out PR on B. **Accepted:** the ask states both.

## Round 1, Opus 5.5 Plan lens

Verdict: conditional approve; spot-checked 12 rows of recon's background table, all held. Accepted, each verified in the tree: the copy-back could land captures flat with the hash file and still pass `sha256sum -c` (store layout kept, `git status` gate exact); hashes beside the files certify themselves (recorded in SA-1); a scratch script importing `puppeteer` would let Bun fetch it from npm, since `bunfig.toml:15-19`'s `auto = "disable"` applies only in its working directory (`--no-install`, resolve from `apps/extension`); a stale `origin/dev` (with Codex); I1 is weak, so a capture-spec fix ships on either answer with its network runs; B leaves #364 open against the open-work rule (closed as not planned); the identity strip and Presto card reach more surfaces (`DappStatusStrip`, `SignerIdentityStrip`, `verify/index.vue`, `onboarding/pages/presto.vue:103`); the cross-arc pass needs a stated skip; the exact regex, a blind-spot comment, `source-scan.ts`'s header; one flake rule; screenshots after the loop; the title is 67 characters; the promo tile takes no capture (`store-art.ts:70-75`); split procedural sentences. Rejected: dropping the local Firefox smoke run, which the lane brief requires.

## Round 2, Codex (resume)

Verdict: conditional approve; withdrew round 1's #1 ("my direct-executable probe did not establish package-script argument forwarding"). Accepted: phase 4's gate could not pass on B and could refuse an unchanged promo tile on A (split by answer); SA-1 still described B as leaving #364 open; screenshots before the loop and the loop after the gate formed a cycle (screenshots now follow the loop, before the PR).

## Round 3, Codex (resume)

Verdict: approve, no new material finding; the three round 2 fixes and the base-red wording verified.
