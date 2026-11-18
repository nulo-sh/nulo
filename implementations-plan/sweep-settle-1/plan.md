---
plan: sweep-settle-1
tier: light (thinned: no plan audit round, no Opus leg; one Codex pass over the plan and the net diff)
status: in progress
issues: "#1794"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon inline (no explorer: three files); Codex gpt-6.1-sol high, read-only, one pass
base: origin/dev at b22893f42
trunk: dev
post_implementation_hardening: not scheduled
---

# sweep-settle-1: the window sweep waits for the argument previews to settle

`tests/e2e/network/type-roles-windows.test.ts` red once on Chrome at retry 0 (#1794): `expectFitsNarrow` read `execute-authwit-args-pending` ("Reading arguments…") as gone, because the decode landed between its record pass (400 px) and its compare pass (240 px). Tests only; no screen changes.

## Cause (demonstrated: the issue's stack trace plus this trace)

1. `runRequest` → `openExecute` waits for the request's `ready` element and the fee readout (`feeSettled`). For the `createAuthWit` call intent, `ready` is `execute-authwit-target`, which renders before the call's arguments decode.
2. The window starts `decodeOperationArguments` without awaiting it (`apps/extension/src/popup/windows/execute/index.vue`, "None is awaited here"); until it answers, `callSurface` returns `pending` and `CallArguments.vue` draws `<prefix>-args-pending`.
3. `sweepWindow` (`type-roles-windows.test.ts:104`) waits only for its states' sites, then measures. `expectFitsNarrow` records the pending line as shown; the decode lands; the line's element is replaced by the decoded block, so the compare pass finds no element with the same testid and text: fate `gone`. The coverage test then reds on the sites the aborted test would have read.

`goAndSweep` (`tests/e2e/type-roles.test.ts:827`) got the same wait for `loading-state` in #1763; `sweepWindow` has no twin. Every claim in the issue holds at the base (line numbers moved by one).

## What ends the wait

The sweep waits until the page draws none of these, each the mark of a read in flight that its answer or its failure replaces:

| Selector | Drawn while | Ends on success | Ends on failure (pinned by) |
|---|---|---|---|
| `loading-state` | a list fetches (`AsyncListStatus`, page loaders) | the list | the list's empty or error line (the RPC fails within 60 s) |
| `[data-testid$="-args-pending"]` (`execute-op-summary-`, `execute-op-`, `execute-authwit-`, `execute-grant-`, `execute-discovered-authwit-`) | a call's, grant's or authorization's arguments decode | the decoded block | the raw fields under `unavailable`: `decodeCallsOrUnavailable` maps a rejected decode to `undecodedAll` (`display-calls.test.ts`, "an unreachable decoder…"); `OperationCard.fallback.test.ts` and `OperationCard.authwit.test.ts` render `unavailable` as the unverified block, never pending; a grant's rejected decode shows the error row (`index.test.ts`, "a grant that reads as unavailable…") |
| `execute-op-authwits-pending` | a no-account send's authorizations are previewed | the list | `execute-op-authwits-preview-failed` (`OperationCard.summary.test.ts`, `previewFailed`) |
| `register-token-details[aria-busy="true"]` | a token's metadata loads | the metadata rows | `register-token-meta-error`; the flag clears in `finally` (`index.test.ts`, "register_token metadata is prefetched AFTER the commit…") |
| `[data-testid^="contract-chip-held-"]` | a chip waits for its level | the level | released by `ContractChip`'s 1 s timer whatever the reader does |

Every read is a popup RPC that fails at most `DEFAULT_RPC_TIMEOUT_MS` (60 s) after it began, and every failure rests as its own line, so a window at rest always ends the wait. The bound is that 60 s, as `goAndSweep`'s; past it the wait fails naming the testids still drawn. One exception: the authorization preview's transport bound is 15 min (`ESTIMATE_JOB_TTL_MS`); a preview slower than 60 s reds with its testid named, which is a real finding, not a hang. No window in this file is a no-account send. The fee estimate stays `openExecute`'s `feeSettled` and Send's balance read stays inside `expectFitsNarrow`; both are already awaited.

## Decision ledger

- **D1, one helper in `fixtures/type-roles.ts`, used by both sweeps.** `goAndSweep`'s wait is the same wait with a smaller set; the shared helper replaces its inline copy. Its set grows by markers no popup page draws except the chip hold, which ends within a second.
- **D2, wait before the sites.** `sweepWindow` waits for rest, then for its states' sites: a decoded row's sites exist only after its decode, so the site wait is no longer spent on a row still pending.
- **D3, named testids, not `[aria-busy]`.** `aria-busy` also marks surfaces that can rest busy on popup pages (`TokenCard`'s loading row, holdings' prices), which would turn a slow price into a 60 s red in `goAndSweep`.
- **D4, the summary's authorization line is left out (plausible, unverified).** A discovered authorization's summary row (`SendTxSummary.vue`) shows the selector until its decode lands and carries no pending mark; on a registered token's transfer from a named sender the line then swaps from "call" to "move", which the narrow check would read as `execute-discovered-line-function` gone. The path is traced, never observed: the move-form test already waits for `execute-discovered-line-from` (post-decode); the on-behalf test's line form is unverified. The clean fix is a product-side mark on the pending row, outside this lane's "no product code"; a text-shaped test predicate (a `0x` + 8 hex function name) would select by content, against the testid rule. Filed as a closed `known-limit` issue at close-out, reopened by a red naming an `execute-discovered-line-*` site.
- **D5, ten sequential Chrome runs, two Firefox.** Vitest 4.1.12 has no CLI repeat and dedupes a file listed twice, and `agent.sh` boots one sandbox per invocation; a `repeats` edit would also re-run the file's stateful requests (the approved `registerToken`) against a wallet that already holds the token. So twelve sequential `e2e:agent` runs, one at a time.

## Phase 1: the wait, its two callers, the proof

Change map:
- `apps/extension/tests/e2e/fixtures/type-roles.ts`: `READS_IN_FLIGHT` (the selector list above) and `waitForReadsSettled(page, label)`: `waitForFunction` on no match, polling 100 ms, bounded by `DEFAULT_RPC_TIMEOUT_MS`, under `withTimeoutMessage` naming the testids still drawn.
- `apps/extension/tests/e2e/network/type-roles-windows.test.ts`: `sweepWindow` calls it first.
- `apps/extension/tests/e2e/type-roles.test.ts`: `goAndSweep` calls it in place of its inline wait.

Gate, in order, each once, at retry 0 (`NULO_E2E_RETRY=0`):
1. `bun run lint`; `bun run typecheck:all`; `bun run check:plans` (after staging).
2. Smoke `type-roles.test.ts` (`goAndSweep` changed), Chrome then Firefox: `cd apps/extension && bun run test:e2e -- tests/e2e/type-roles.test.ts --retry=0`, then the same under `NULO_E2E_BROWSER=firefox`. Pass: green.
3. `bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts` from the root, prover-ON, ten Chrome runs then two Firefox runs (`NULO_E2E_BROWSER=firefox`), one at a time. Pass: every run green, each run's test count and duration recorded in `STATUS.md` and the PR body.

No unit test lands: the helper drives a live page, and the failure paths that end each mark are already pinned (table above). No e2e scenario is added, so no suite wall-clock comparison applies.

## Security & Adversarial Considerations

Test code only; nothing ships in the extension bundle. The risk is a wait that hides a fault: it ends only on the marks' absence, so a pending line that never resolves fails the test after 60 s naming its testid instead of passing, and a failed read still reaches the sweep as its error line, which the sweep then measures.

## UI impact

None. Tests only; no surface a person sees changes, so no owner sign-off is needed.

## Delivery

One PR against `dev` from branch `sweep-settle-1-a1` (off `origin/dev`, carrying this plan), opened ready after the gates and the Codex pass: `test(e2e): the window sweep waits for argument previews to settle` (65 characters), body with the cause, the states that end the wait, the run counts per browser, the Codex verdict, `Closes #1794`. No label at creation; the smoke and network lanes trip on `apps/extension/tests/e2e/**`. The close-out (Outcome, the D4 known-limit issue, archive move, index lines) lands as the same PR's final commits. Never merged here.

## Post-implementation

Per `implementations-plan/README.md` § Post-implementation standard at `b22893f42`, bounded work: one Codex pass (gpt-6.1-sol, high, read-only) over this plan and the net diff, with the standard's two verbatim rules and this lane's question: does the wait end on every state the window can rest in, and could it hide a real layout fault (a pending line that never resolves)? A second round only if the first finds something material.

## Seeds

- `/goal`: the window sweep waits for no read in flight before it measures; type-roles-windows green ten times on Chrome and twice on Firefox at retry 0; PR open, closing #1794.
- `/loop`: watch the PR's checks; on green, report LEAD_DONE.

## Audit verdicts

(Filled after the Codex pass.)
