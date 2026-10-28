# naming-copy-1 phase 2: the spec waits, captures

- Firefox before (Phase 1 tree, spec unedited): 2 passed; cases 86.1 s (3 calls) and 105.0 s (7 calls), 191.1 s of tests, 287 s with the build.
- Spec edit (`tests/e2e/network/tx-sendTx-multicall.test.ts`): after the at-rest counts, wait (60 s bound, 200 ms polling) until a summary row exists and none reads "Reading arguments…", then expect `execute-op-summary-unchecked` to read "…what these calls do.", then the existing `shotSend`. `biome format` rewrapped one line.
- Chrome after, capture mode: 2 passed; cases 47.0 s and 47.2 s, 94.3 s of tests, 210 s with the build. Chrome before (base, `lessons/phase-0.md`): 71.3 s and 60.0 s, 131.3 s. The node logged `Address already in use (os error 98)` once during boot; the run went on and passed.
- Firefox after: 2 passed; cases 102.8 s and 112.2 s, 215.0 s of tests, 335 s with the build.
- Read honestly: approval does not wait for call decodes (`src/popup/windows/execute/index.vue:144-146`), so the wait can add the decode's tail to a case. One run per side under a host load average of 120 to 140; the build step alone took 18.5 s and 35.7 s on two Firefox runs. Chrome moved down 37 s and Firefox up 24 s: no claim of equivalence either way.
- Captures: the 3-call and 7-call summaries show the line under the numbered calls, no suffix on a row, wrapped at line height 1.3, in both themes. The 3-call pair is committed as `screenshots/after-light.png` and `after-dark.png`.
- Deviation from the plan's step 4: the base pair is not committed. It pictures every row as "Reading arguments…" (the race this phase fixes), so it shows no "before" of the change; the old suffix is described in words in the PR instead.

## Review

- Codex fix loop, round 1 (fresh session, the net diff from `0a659726c`): approve, no findings.
- Opus diff review beside it: conditional approve, 2 findings, both checked and accepted. `CLAIM_DECODE`'s fourth parameter is `message_leaf_index`, a Field, in the bundled `@aztec-labs/protocol-contracts@6.0.0` `FeeJuice.json` (read from the artifact), not an integer `leaf_index`; fixed. The "every call read" test's name now says it also proves no line beside an app authorization. `OperationCard.summary.test.ts`: 15 passed.
