# Phase 1: arc 1 (the extraction)

Paths repo-relative to `apps/extension/src/wallet/services/execution/` unless rooted.

## Implementation (2026-11-24)

- The frozen-range script found exactly the four receivers; the moved bodies differ only by
  `private` → public, `export` and the two structural `built` parameters.
- Mutants M1, M1b, M2, M3, M4 and M5 each failed their named test. A first M3 run matched no test:
  vitest's `-t` is a regular expression, so a title with parentheses must be escaped.
- commitlint's `subject-case` rejects `dApp` in a subject; the commit and the PR title say `dapp`.
- The fee-race stub defect is real: with a logging probe in `attempt`, three `no_from` previews
  fail on `decoded.signable.map` and the model accepts the error. Pre-existing; filed at close-out.
- Own review: the new file held code moved out of an Azguard-derived file without the
  "Modified from Azguard Wallet" header the third-party notices policy asks of each derived file;
  added, as `registration-executor.ts` did when it was extracted.

## Codex fix loop (2026-11-24)

- Round 1, `gpt-6.1-sol` high, session `01a20aee-8c1e-7d03-923a-c555db3a2766`: approve, high
  confidence. Two low findings: the fee-race stub (pre-existing, already an open item) and the
  "clone to prevent mutation side effects" comment in `estimateOperationFee`, which narrates two
  copies nothing downstream mutates. Comment deleted.
