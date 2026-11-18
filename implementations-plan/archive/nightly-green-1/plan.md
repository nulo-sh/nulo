---
plan: nightly-green-1
tier: light (thinned: no plan audit round, no Opus leg; one Codex pass over the plan and the net diff)
status: delivered (one PR against dev, merge pending)
issues: "closes #1845 and #1846"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: no recon agents (two test files and one helper, read directly); Codex gpt-6.1-sol high, read-only, one pass
base: origin/dev at 90c2f61ab
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-18.
- **Status:** delivered. The fixes and this close-out are one PR against `dev`, which merges on the orchestrator's word; the next scheduled nightly is the proof of record.
- **Shipped:** the floor-chip test in `rows.test.ts` takes the held list's priced token (D1); `secondToken` draws from the scope's own pool with a distinct symbol (D2); the RP live probe accepts 400 or 404 on `/cdn-cgi/` (D3). Closes #1845 and #1846.
- **Proof:** the two smoke files at retry 0, Chrome and Firefox, on the armed build and on a production build run as the artifact leg: four green runs (§ Gates run). `infra/passkey-rp` tests green offline and live.
- **Dispositions:** #1845's "token seeds" hypothesis did not hold; the cause is the held list's pricing and `secondToken`'s pool. No workflow, Worker or source change.
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none promoted; the convention the floor test broke is already in `apps/extension/tests/e2e/README.md` (Held), and `lessons.md` is at its budget.
- **Seeds retired:** the `/goal` and `/loop` seeds below; never run them.

# nightly-green-1: the nightly back to green

`nightly.yml` has been red on every scheduled run since 2026-11-07 (last green 42208474379 at `4291a8c98`). Two unrelated causes: #1845 (`smoke-against-artifact` and its Firefox twin) and #1846 (`rp-host-live`). The owner, 2026-11-18: "go on nightly check and fix." Both fixes are test-only.

## Facts and causes

Probes at the base, retry 0, through the smoke harness (`bun run test:e2e`), against a production `build:chrome` with no `VITE_NULO_E2E_*` flag, run as the workflow's artifact leg (`NULO_E2E_ARTIFACT_RUN=1`, a bare `EXTENSION_PATH`). The same three reds as the nightly: 3 failed, 20 passed, 2 skipped. Details in [recon.md](recon.md).

1. **`rows.test.ts`, the floor chip** (demonstrated). The test seeds its transfers on `readActivityScope(page)`, which on every run is the fixture token `E2E_LIST_TOKENS[0]` (`0x…a1`). A source run's held list is `E2E_LIST_TOKENS`, so that token is listed and priced, and `seedUsdQuoteAndReload` gives each transfer a fiat line under its amount. An artifact run holds the published list, which does not name `0x…a1`: no fiat line, a narrower amount column, more room for the title, so the 16-letter symbol's app chip reads 31.6 px, cut and beside the title, not at its 20 px floor. The production bundle draws the row correctly for an unpriced token; the test's premise (a priced row) holds only in the source run. It breaks the `e2e/README.md` convention: "A spec that prices a row takes the held list's priced token (`readActivityScope(page, { priced: true })`, then `seedUsdQuoteAndReload(page, scope.token.priceId)`) and skips through `skipUnlessListPrices` when the list prices none".
2. **`type-roles.test.ts:1049`, the edge figure** (demonstrated). `openSeededHome` takes `readActivityScope(seeder, { priced: true })`, which on an artifact run is the published Testnet USDC (`0x2490…`, symbol `USDC`). `secondToken(scope)` then picks the first `E2E_LIST_TOKENS` entry at another address: the fixture USDC (`0x…a1`), also `USDC`. `readTokenFiat(page, "USDC")` finds the first row with that symbol, the large row, and reads its `≈ $123,456,789,012,345.68`. `:1478` (32 unread identifier sites) fails only because that test stopped early.
3. **`infra/passkey-rp/test/live.test.ts`** (demonstrated). The test at the base fails live on `/cdn-cgi/challenge-platform/h/b/orchestrate/jsch/v1` with `Expected: 404, Received: 400`; the body is Cloudflare's query-string refusal, `text/plain`, script-free, no `cf-mitigated`. The other three sampled paths still answer 404.

Issue claims all held. One addition to #1845: the floor-chip cause is the held list's pricing, not the token seeds. `VITE_NULO_E2E_TOKEN_SEEDS` plays no part in either smoke failure.

## Decision ledger

- **D1, the floor chip: seed, not skip.** The test takes the held list's priced token and prices it by its own `priceId`, with `skipUnlessListPrices(skip)`, as its neighbours at `rows.test.ts:857` and `:1336` do. On an artifact run it then reads the production bundle's row for a published, priced token, so the floor is still proven against the artifact. A `liveLeg` skip would drop that proof, and a longer symbol would change what the test claims ("under a 16-letter symbol"). The skip only fires on a published list that prices no Testnet token, which the convention calls valid; the list in the tree prices three.
- **D2, the edge figure: fix the helper, not the spec.** `secondToken` assumed its scope always came from the fixtures. It now draws from the held list on the scope's chain when the scope's token is one of its entries, else from the fixtures, and always returns a token with another address and another symbol, or throws. Source runs pick what they picked before (fixture USDT); `home-links.test.ts`'s fixture scope keeps fixture USDT on both legs; the artifact leg's type-roles second token becomes published USDT (`tether`, priced). A type-roles-only pick would leave the same trap in the helper.
- **D3, the RP probe: accept `[400, 404]` on every sampled path.** Both are edge refusals that serve nothing. A mitigation's 403, 429 or 503 still fails, and so does any 200; the `cf-mitigated` and `INERT_HTML` assertions stay. Pinning 400 on the challenge path alone would fail again on the next unannounced edge change between two refusals, which is what this test is not about.
- **Not done:** no change to `_extension-smoke-e2e.yml`, the nightly's schedule or its publish, the RP Worker, or any source file. No workflow is dispatched; the next scheduled nightly is the proof of record.

## Assumptions

- **Ask (none open).** Nothing here changes what a person sees: `OWNER-ASKS.md` says none.

## Arc 1 (the only arc): one PR

**Change map.**

| File | Change |
|---|---|
| `apps/extension/tests/e2e/rows.test.ts` | the floor-chip test: `skip` fixture, `skipUnlessListPrices(skip)`, `readActivityScope(page, { priced: true })`, `seedUsdQuoteAndReload(page, scope.token.priceId)`, one comment (D1) |
| `apps/extension/tests/e2e/helpers/activity-seeds.ts` | `secondToken` draws from the scope's own pool, distinct address and symbol, throws when there is none (D2) |
| `infra/passkey-rp/test/live.test.ts` | `expect([400, 404]).toContain(res.status)`, the comment says why (D3) |

No new e2e scenario, so no runtime budget entry: the two smoke files' local durations go in the PR body.

**Gates, retry 0, once, in order.** Pass = exit 0 and the counts recorded in `STATUS.md` and the PR body.

1. `bun run lint`; `bun run typecheck:all`.
2. `bun run --cwd infra/passkey-rp test`, then again with `RP_HOST_LIVE=1` (read-only GETs to the deployed host).
3. `bun run check:plans` on the staged plan files.
4. From `apps/extension`, through the smoke harness: `bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/type-roles.test.ts --retry=0` on the armed build (`ARMED_BUILD` in `global-setup-smoke.ts`, with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1`), Chrome then Firefox; then the same two files against a production build of each browser copied out of `dist/` (`NULO_E2E_ARTIFACT_RUN=1 EXTENSION_PATH=<copy>`), Chrome then Firefox. Four green runs.

**Security & Adversarial.** Test-only. The RP probe is the only security-relevant change: it guards that Cloudflare's `/cdn-cgi/` surface on the passkey host serves no script and no mitigation page. What an attacker would want is a script-bearing or challenge page on the RP origin. That still fails: any status but 400 or 404 (a 200 page, a 403 block, a 429 or 503 challenge) fails, a `cf-mitigated` header fails, and a body matching `INERT_HTML` fails, on all four paths. Accepting 400 trusts only that a 400 serves no resource, and the body assertion still checks what it carries. The e2e changes move seed inputs; no assertion is loosened, no tolerance widened.

**UI impact.** None: tests only. The owner's words for the lane are the sign-off: "go on nightly check and fix."

## Delivery

One PR against `dev` from `nightly-green-1-a1` (off `origin/dev`, carrying this plan's commit), opened ready after the gates and the Codex pass, no labels at creation. Title (≤ 92): `test(nightly): artifact smoke seeds its rows; rp live probe accepts cloudflare's 400`. Body: the cause per test, each fix and why that form, the four local proofs with counts per browser, the Codex verdict, `Closes #1845`, `Closes #1846`. Then `gh pr checks <n> --watch`. The close-out (Outcome, `STATUS.md` deleted, `git mv` into `archive/`, index line moved) is the same PR's final commits, after merging `origin/dev` in. Never merged by this session.

## Post-implementation

[`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `90c2f61ab`, bounded work: one Codex pass (gpt-6.1-sol, high, read-only) over this plan and the net diff, with the two verbatim rules and the adversarial ask, plus the lane's question: does each skip or seed keep the artifact smoke meaningful, and does accepting 400 weaken the script-free invariant. A second round only if the first finds something material; hard stop at three.

## Gates run

At retry 0, once, in order, on `79032943c` (the final test code; `origin/dev`'s `eb42af540` merged after, touching none of these files and only network-owned identifier sites).

| Gate | Result |
|---|---|
| `bun run lint`, `bun run typecheck:all` | exit 0 (one pre-existing warning in a file this lane does not touch) |
| `bun run --cwd infra/passkey-rp test` | 5 pass, 6 skip (live describe off) |
| same with `RP_HOST_LIVE=1` | 11 pass |
| `bun run check:plans` | 0 findings |
| smoke, armed build, Chrome | 24 passed, 1 skipped, 178 s |
| smoke, armed build, Firefox | 25 passed, 316 s |
| smoke, production build, artifact leg, Chrome | 23 passed, 2 skipped, 327 s |
| smoke, production build, artifact leg, Firefox | 24 passed, 1 skipped, 429 s |

The floor transfer's chip read 20 px in all four. The skips are the base's: the placeholder-row test skips on the artifact leg (`liveLeg`), and one type-roles test skips on Chrome.

## Audit verdicts

- **Codex pass over plan and diff** (gpt-6.1-sol, high, read-only): **approve**, high confidence. The floor seed and the second token keep the artifact smoke meaningful (same symbol, amount, 20 px assertion and tolerances; production pricing and rendering); accepting 400 relaxes an incidental status, not the script or mitigation checks, and 200, redirects, 403, 429 and 503 still fail. One nit, accepted: `secondToken`'s comment restated its body; cut to one sentence of invariant. Noted, no change: the artifact type-roles test needs the first distinct-symbol published entry to be priced; `openSeededHome` already throws on an unpriced one, so a reordered list fails loudly, never green. No second round: nothing material.

## Seeds

- `/goal`: the nightly's artifact smoke and RP live probe are green on the fixed tests, PR open against `dev`, `Closes #1845` and `#1846`.
- `/loop`: `gh pr checks <n>`; on red, read the failing job, fix at the cause, rerun the affected gate.
