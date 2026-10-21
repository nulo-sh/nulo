# bridge-nonce-1 phases 1-2 and the review loop (A1)

## Phase 1, 2026-10-21

- `fixtures/l1-signer.ts` added; `bridgeFeeJuice` and `bridgeForMint` call `createFixtureL1Client`; both mnemonic
  copies and `bridgeForMint`'s unused `opts.l1Mnemonic` removed. `scripts/e2e/l1-signer.test.ts` reuses the shared
  reader `scripts/type-roles/source-scan.ts` (`sourceFiles`, `REPO_ROOT`) rather than a new walker.
- Reds proved, then restored: the index set to 0 fails test (a) ("Expected 0x7099…79C8, Received 0xf39F…2266");
  a stray `createExtendedL1Client` line in `aztec.ts` fails test (b) (the file appears in the list).
- Gate: the test 2/2, `lint`, `typecheck:all`, `test` (891 files) exit 0.

## Phase 2, 2026-10-21 (host load average 115-150)

- `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 bun run
  e2e:agent` with the eight bridging files. Deviation: proverless, as CI's network shard pool runs these files; the
  L1 signer does not depend on proving (D7).
- Result: exit 0, 7 files and 30 tests passed, `send-chaos` skipped (opt-in, `NULO_E2E_CHAOS=1`; its bridge path,
  `burst-account` → `setupPreFundedAccount`, ran in `same-token-concurrent-sends`). Wall-clock 1489 s.
- Evidence: 9 of 9 `Minting 1000000000000000000000 tokens for` lines name `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`;
  none names `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`; no `nonce too low`. Every `bridgeForMint` caller passed,
  so account 1 minted, approved and deposited with only its own ETH (F8 end to end).

## Review loop, 2026-10-21

- Codex round 1 (gpt-6.1-sol, high, read-only, run beside the e2e with no commands): fix one comment, the doc comment
  that restated `createFixtureL1Client`'s name. Accepted.
- Opus (general-purpose): clean. Accepted: the scan also matches viem's own signers (`createWalletClient`,
  `mnemonicToAccount`, `privateKeyToAccount`), which makes the quality bar's "a fixture that builds its own L1
  client" true (red proved with a `// privateKeyToAccount` line in `fixtures/poll.ts`); "by default" in the signer's
  comment and the test title. Not taken: dropping `not.toBe(LOCAL_NETWORK_SIGNER)`, which names the invariant.
- Codex round 2 (resumed with the fix diff): clean. The loop converged in two rounds.
