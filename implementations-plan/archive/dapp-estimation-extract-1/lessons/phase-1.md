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
- Round 2 (resumed, same session): approve, high confidence, no new finding.

## Opus 5.5 diff review (2026-11-24)

- general-purpose agent: approve with changes, high confidence; four low findings, all accepted.
  The wiring pin did not check that the executor shares both caches with the estimation: two
  identity asserts added, each killing its mutant (the executor wired to a new `PreviewSnapshots`,
  then to a new `OperationEstimateReuse`). The new file's header overclaimed past D5 ("proves
  nothing and sends nothing"): now "the node and PXE its builds return are only read and
  simulated" (checked: `pxe.simulateTx` and `node.getNodeInfo` only). Two comments narrated
  history (the harness type's doc, "moved verbatim off the execution facade"): rewritten. One
  README row split for sense.
- The Chrome proverless e2e ran at `4a733cef2`; every later commit changes comments, docs and the
  wiring pin only.
