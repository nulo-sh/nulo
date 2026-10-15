# Phase 0: planning consults

Every consult of the planning run, with its verdict. Transcripts stay local (`audit-*.md`, gitignored); this file and `plan.md` § Audit verdicts are the record.

## Recon (2026-10-15)

Three Sonnet Explore agents at `dfdf4c31`: the #505 queue gate; the #503 execute window and the #504 fee card; #340, #316 and a reuse sweep. Findings in `recon.md`. The decision records for #316 and #340 (pages 15 and 18) and #217's page 9 answers (OA-10, OA-11, OA-13) were read from the issues.

## Round 1, Codex (2026-10-15)

`run-codex.sh` on gpt-6.1-sol, high, read-only (the host runs Codex in approve-for-me mode); session `01a1418a`. Verdict: conditional approve, 7 findings. All accepted; the dispositions are in `plan.md` § Audit verdicts. Its one dissent, shipping the #504 preview under the lane brief's record, lost to the Opus leg (D2).

## Round 1, Opus Plan (2026-10-15)

`Agent`, `subagent_type: Plan`, `model: opus`. Verdict: conditional approve, 16 findings, all accepted. The two that reshaped the plan: the trigger's `data-fee-method` is the e2e suite's "settled" signal, so a preview breaks `waitForFee`; and the forced read's private leg queues behind a proof, a cause of #504's wait that no preview fixes.

Verified by the parent before accepting: the payer re-resolution at `transfer-executor.ts:540-547`; `send-burst.ts:97`; the badge read at `fee-sponsor-funding.test.ts:257`; the log ring's Info threshold (`wallet/logger/store.ts:30,67`); `decorate`'s exact compare (`fpc/service.ts:109-113`).

## Round 2, Codex resume (2026-10-15)

Conditional approve, 5 findings, all accepted after verification: `readSwLogTrail` is empty without Developer Mode (`tests/e2e/fixtures/journal.ts:310-319`); `same-token-concurrent-sends` needs `NULO_E2E_PROVERLESS=1`; the e2e proof gate holds before `pxe.proveTx` (`execution-coordinator.ts:265`), so a proverless run cannot show PXE contention; the store's 20 s bound is per attempt (`balances.store.ts:499-518`); a "queued with no cap" trigger would refuse an ordinary send that became queued after its estimate.

## Round 3, Codex resume (2026-10-15)

Confirmation only: **approve**, no regression.
