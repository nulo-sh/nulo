# Phase 3: the review loop

## Codex round 1

`run-codex.sh … high read-only gpt-6.1-sol`, fresh session `01a150a2-3b7b-7f03-9623-fef5fb216f77`, over `b53e1d4a...HEAD`, with the standard's two rules and the adversarial ask. Verdict: approve, no new material finding. It checked that exactly ten PNGs changed, that every listed hash matches `7081a393` and the head, the old and new scratch pairs against their commits, the IHDR sizes, chunk types and CRCs, the byte-identical tile, the log's Chrome proverless run with its two fits, OA-1's scroll container, and that the rows' second line is a transaction hash. It noted that pixel judgments rest on the visual review.

## Opus review

`Agent`, `model: opus`, `general-purpose`, beside round 1; it viewed every old and new pair. Conditional approve, six findings, all records, all accepted (plan § Audit verdicts). Checked by hand: the shadow overlay (`apps/extension/src/popup/pages/pinned-hero.module.css:15-21`), the window's 400×800 open size (`apps/extension/src/wallet/services/dapp-interaction/service.ts:596-597`), #759 (`9470d4e9`).

## Codex round 2 (resume)

Same session, over `ab6834d5`. Approve, no new material finding: the store bytes still equal `7081a393`, and OA-1 and OA-2 agree with D4 (b). Converged.
