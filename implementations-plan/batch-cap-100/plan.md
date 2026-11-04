---
plan: batch-cap-100
tier: light
status: implementing
issues: "refs #1609"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit, resumed until approve; no Opus plan leg (light)
base: origin/dev at fa6913668
trunk: dev
post_implementation_hardening: not scheduled
---

# batch-cap-100: the free dRPC endpoints' batch cap at 100

dRPC raised its free-plan limits (its support message to the owner, 2026-11-04): a batch of 100 entries, a request timeout of 70 s. This plan raises both `BATCH_CAPS` entries from 25 to 100, the provider's limit, in one PR off `dev`, in the shape of #1643. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The brief, checked

- **Held: 100 is answered and 101 is refused.** My probe at about 15:00 UTC on 2026-11-04 sent 100 and 101 `node_getNodeInfo` entries to both keyless origins (lessons/phase-0.md). At 100, each origin answered HTTP 200 with every entry answered (163 KB and 171 KB, under 0.7 s). At 101, each origin answered HTTP 400 with an array of 101 errors, each with code 31 and "Batch of more than 100 requests are not allowed on free plan, …". The orchestrator's probes found the same (100 `node_getBlock`, about 180 KB, answered; 101, 150 and 250 refused).
- **Did not hold: "an uncapped client sends a tick of more than 100 calls as one batch".** The client's own default is 100 entries or 1 MiB, whichever comes first (`@aztec-labs/foundation` 6.0.0, `safe_json_rpc_client.js`: `DEFAULT_MAX_BATCH_SIZE = 100`). The adapter's doc already says so (`aztec-node-factory-adapter.ts:69-71`). So on 6.0.0, removing the two entries sends the same requests as a cap of 100. The entries stay at 100, as the brief decides; D1 gives the reason. The orchestrator relays the owner's "uncapped" with this fact.
- **Held:** `check:seeds` sends `maxBatchSizeFor(seed.rpcUrl) ?? 1` calls in one tick (`apps/extension/scripts/seed-identity.ts:21`), so it sends 100 with no script change.
- **Held:** the package test injects its own cap of 3 (`aztec-node-factory-adapter.test.ts:160-182`) and stays.

## Timeout report (no change, the lane brief)

`DEFAULT_REQUEST_TIMEOUT_MS = 60_000` (`packages/aztec-runtime/src/utils/fetch.ts:19`) bounds each HTTP attempt with an `AbortController` (`fetch.ts:46`). The production node client uses it (`aztec-node-factory-adapter.ts:80`). That client retries a timeout or a 5xx after 1, 2 and 3 s, and stops on a 4xx. The single read (`apps/extension/src/wallet/services/network/service.ts:1069`) and `check:seeds` (`apps/extension/scripts/seed-preflight-node.ts:18`) use it for one attempt. The identity, sender and sponsor probes use 5 s (`network/spec.ts:127`, `account-state/service.ts:39`, `execution/sponsor-funding.ts:19`). Each is shorter than dRPC's 70 s, so the wallet ends each slow HTTP attempt first, and a reply dRPC sends between 60 and 70 s never reaches it. With its retries, the production client can take about 246 s (four attempts of 60 s, plus 6 s of waits) before a call fails.

## Outcome & Quality Bar

- **For whom:** a person who proves a send through a free dRPC endpoint (Mainnet, or Testnet's keyless origin), and the maintainer who reads `BATCH_CAPS` after the next Aztec bump.
- **Excellent:** a tick of 250 calls leaves the wallet as 3 requests (100, 100, 50), not 10, and no request goes above the limit that dRPC refuses. The comment states the provider's limit and why the entry stays when it equals the client's default. `check:seeds` proves 100 live on both seeds.
- **Good enough:** no change to the lookup, the adapter, the timeout or the proxy.

## Assumptions

**Facts** (verified at `fa6913668`)
1. `BATCH_CAPS` holds 25 for `https://aztec-mainnet.drpc.org` and `https://aztec-testnet.drpc.org` (`apps/extension/src/wallet/services/network/seeds.ts:101-104`). `maxBatchSizeFor` reads it by literal origin (`seeds.ts:107-115`).
2. Every node client the wallet builds takes the cap: the factory (`node-factory.ts`), the adapter's four constructions (`aztec-node-factory-adapter.ts:78-127`) and the preflight client (`seed-preflight-node.ts:16-23`).
3. The upstream client sends at most `maxBatchSize` entries per request, and it defaults to 100 (recon). A larger tick goes out as more requests.
4. Four tests pin dRPC's value: `seeds.test.ts:16-19`, `node-factory.test.ts:10-20`, `scripts/seed-identity.test.ts:50-61` and `:63-74` (recon).
5. A 4xx whose body parses as JSON is terminal in `fetchOnce` (`NoRetryError`, `fetch.ts:94-104`), as dRPC's refusal array is; a body that does not parse fails first at `mapBodyFailure` (`fetch.ts:88-91`) as a retryable error. The preflight client makes one attempt anyway.
6. One reply may hold 32 MiB (`MAX_NODE_RESPONSE_BYTES`, `fetch.ts:21-24`); its comment already budgets for a batch of 100.
7. No doc, skill or workflow restates the cap (recon's absence trail).

**Inferences**
- I1. How dRPC's free plan counts a batch against its rate limits (per entry, per method, or a separate burst limit) is unknown; neither probe shows it. The PR makes no claim about quota.

**Asks:** none. The owner's "uncapped" is the orchestrator's open relay. This plan does not answer it; it records the fact above.

## Architecture & Implementation

- **Change:** both `BATCH_CAPS` entries become 100. The comment states the limit dRPC enforces, which it refuses whole above 100 with HTTP 400 (seen 2026-11). The comment also says why the entry stays when the client's default is 100 today: it holds the provider's limit if an Aztec bump moves that default. Nothing else in production code moves.
- **Tests** (D2): in `seeds.test.ts`, both remote defaults cap at 100. In `node-factory.test.ts` and `seed-identity.test.ts`, 250 calls in one tick go out as `[100, 100, 50]`. In the refusal test, the fixture answers as dRPC refuses today: HTTP 400, and an array with one error (code 31) for each entry. The seed fails after one request of 100.
- **Forwarding** (D2, Codex r1): at 100 the split cannot tell the cap from the client's default, so neither file would notice a client that drops the cap. Each file wraps the real lookup in `vi.fn` (`vi.mock` of the seeds module with `importOriginal`). One added case answers 3 for one lookup, and 8 calls in one tick go out as `[3, 3, 2]`, through the wallet's factory and through the preflight client. A third, in `seed-identity.test.ts`, has `checkSeed` send 3 reads when the lookup answers 3 (Opus, arc 1 r1).
- **Rejected:** removing the entries (D1); a test that pins the upstream default (D3); any timeout change (out of scope).

## Security & Adversarial Considerations

- **Threat model:** no new input crosses a trust boundary. The cap is a compiled per-origin constant, and the provider's replies go through the same schema check and the same 32 MiB reply cap as before.
- **Availability:** a cap above 100 would make dRPC refuse every entry of a tick. The entries keep the wallet at 100 even if the upstream default rises, and `check:seeds` and the nightly `seed-identity-live` (advisory) go red if dRPC lowers its limit.
- **Known limit (D6), plausible but unverified:** one reply holds 32 MiB at most, and the 100 entries of a batch share it and its 60 s. A tick of 100 heavy reads (each above about 330 KiB) would fail whole, where four batches of 25 would pass; one slow entry delays all 100. The probes saw small replies only (100 blocks in about 180 KB). Every non-dRPC node already batches 100 today. The close-out files this as a closed `known-limit` issue.
- **Privacy:** the provider sees the same calls in fewer requests, so batching discloses nothing more.
- **Least privilege, crypto, supply chain:** no change. No dependency is added.

## Phase 1 (arc 1): the batch cap at 100 ✓

1. Change the tests first, as the Architecture section says. Run them on the base code. Each of the four moved tests must fail. The two forwarding cases pass on the base code; show that each fails when its client drops the cap (in `node-factory.ts`, pass `() => undefined`; in `seed-preflight-node.ts`, remove `maxBatchSize`), then revert. Record the reds in `lessons/phase-1.md`.
2. Set both `BATCH_CAPS` entries to 100. Rewrite their comment as the Architecture section says.
3. Run the gate.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `(cd apps/extension && bun --bun vitest run src/wallet/services/network/seeds.test.ts src/wallet/services/network/node-factory.test.ts scripts/seed-identity.test.ts --retry=0)`; `bun run test:all`; `bun run --cwd apps/extension check:seeds` (live); `bun run check:plans` after staging. **Run from the repository root.** **Pass:** every command exits 0; the four moved tests failed on the base code, and each forwarding case failed with its client's cap dropped; `check:seeds` prints `OK` for both remote seeds. **Layers:** lint, typecheck, unit, live endpoint check.

## UI impact

None. No screen, copy or format changes. No e2e scenario is added.

## Decision ledger

| Id | Decision | Rejected | Reason |
|---|---|---|---|
| D1 | Keep both entries, at 100 | removing them (the owner's "uncapped") | the brief decides 100 and leaves "uncapped" to the owner; the entry states a provider limit, the default is a client choice an Aztec bump can move unseen; `check:seeds` proves the entry's value only while it exists (`?? 1`) |
| D2 | 250 calls → `[100, 100, 50]`; a refusal fixture shaped as dRPC's (HTTP 400, an error per entry); a forwarding case per client with the lookup answering 3 | 60 calls; the old HTTP 500 single-object fixture; the split alone | 60 fits in one request at 100; a wire-shaped fixture is the house rule; at 100 the split equals the client's default, so only a distinct cap proves each client forwards the lookup (Codex r1) |
| D3 | No test pins the upstream default of 100 | a pin on `DEFAULT_MAX_BATCH_SIZE` | the wallet's dRPC clients never read it while the entries exist |
| D4 | The package adapter test keeps its injected 3 | moving it to 100 | it proves the threading for any value |
| D5 | One PR off `dev`, the plan and its close-out in it | a stack | one arc; the brief's shape |
| D6 | The shared reply budget of a batch of 100 is a closed `known-limit` issue | a lower cap, a per-batch reply budget | unverified on the wallet's real ticks; every other node already batches 100; a fix changes the transport, out of scope |

## Audit verdicts

| Round | Reviewer | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan r1 | Codex gpt-6.1-sol high (session 01a1a71d) | conditional approve | a forwarding case per client (the split at 100 cannot prove it); the shared reply budget recorded as a known limit (D6); Fact 5 qualified to a parsed body; the gate's `cd` in a subshell; I1 restated as unknown; the timeout report says per attempt, with the retry worst case | none |
| plan r2 | Codex, resumed | approve | none needed; it confirmed the mocks reach every client (`vi.mock("./seeds")` in `node-factory.test.ts`) and that one lookup per construction makes `mockReturnValueOnce(3)` enough, set just before the client is built and outside `checkSeed`, which looks up again | none |
| arc 1 r1 | Codex gpt-6.1-sol high (session 01a1a728) + Opus 5.5 | Codex clean; Opus 2 findings | Opus: the refusal's `[100]` no longer proves `checkSeed` sizes its tick from the lookup (a hard-coded 100 passes, demonstrated): a case with the lookup answering 3 expects 3 reads, red with `length: 100`; the `BATCH_CAPS` comment's prover clause tied back to the limit | none |
| arc 1 r2 | Codex, resumed | 1 finding (minor) | demonstrated: a `mockReturnValueOnce` left unconsumed by a failing case survives `afterEach` and feeds the next test; both files' `afterEach` now `mockReset()` the lookup (restores the real one, checked on Vitest 4.1.12) | none |

## Delivery

- **Arc 1:** branch `worktree-batch-cap-100` off `origin/dev` at `fa6913668`. Title `fix(network): raise the free node endpoints' batch cap from 25 to 100` (68 characters). The body says what changed and why, gives the probe, quotes `check:seeds`' two OK lines and the timeout report, and says "Refs #1609". It closes no issue. It is opened ready, with no label. Run `gh pr checks <n> --watch`. Never merge.
- The close-out goes in as the PR's final commits. No stack and no parallel lanes.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `fa6913668`, with these values. No diff review (`code_review: off`). The Codex loop runs once over the arc's diff against `origin/dev`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, with the README's two rules verbatim, and a hard stop at three rounds. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) of the diff runs beside the first Codex round. Log each round in Audit verdicts and `lessons/phase-1.md`. Teardown: run `agent-worktree done batch-cap-100 --merged` once `implementations-plan/archive/batch-cap-100/plan.md` is on `dev`.

## Seeds

- `/goal` Phase 1 of implementations-plan/batch-cap-100/plan.md ✓ with its gate passing in the transcript; the Codex loop converged; the PR open, ready and green, holding the close-out.
- `/loop 15m` Drive implementations-plan/batch-cap-100 per plan.md: Phase 1, its gate, the Codex loop, delivery, then watch the checks; never merge.
