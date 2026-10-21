# bridge-nonce-1 phase 0 (planning consults)

## Consult 1: Codex plan audit (gpt-6.1-sol, high, read-only, default login), 2026-10-21

Verdict: approve with changes. Findings and dispositions:

1. F1-F3 hold only for the default sandbox configuration: `global-setup.ts` spreads `process.env`, so an inherited
   `SEQ_PUBLISHER_PRIVATE_KEYS`, `VALIDATOR_PRIVATE_KEYS`, `MNEMONIC` or `KEY_STORE_DIRECTORY` could pick index 1.
   Accepted as a scope statement (the plan claims the default configuration, which CI runs); the override needs
   conditions the suite does not support, so it becomes a closed `known-limit` issue at close-out. Rejected:
   refusing inherited signer variables in global-setup (a new boot-time policy for an unsupported setup).
2. The proof command inherits `NULO_E2E_BROWSER` (`agent.sh:84` defaults it to chrome). Accepted: the command
   pins `NULO_E2E_BROWSER=chrome`.
3. The unit test proves the module, not that both bridges call it. Accepted: the quality bar is narrowed to the
   module; the call sites are checked in review. Codex judged a source scan disproportionate (see consult 2).
4. "Cross-version evidence overstated: 5.0.1 and 5.2.0 files absent." Rejected after a check: the 5.x CLIs ship
   the package as `@aztec/aztec`, not `@aztec-labs/aztec`; `local-network.js:108` holds the same line in both.
   The citation now names both paths.

I1 settled by Codex and checked: `l1-contracts/src/mock/FeeAssetHandler.sol:23` gives `mint` no modifier;
`setMintAmount` (`:27`) is `onlyOwner`. I1 is now fact F8.

## Consult 2: Opus plan audit (Plan agent, opus), 2026-10-21

Verdict: approve with changes. Accepted: a source-scan test so no other `tests/e2e` file builds its own L1
client (D6); a positive Phase 2 check (the node's output is filtered by global-setup and the race is rare at
the default block rate, so "no `nonce too low`" proves nothing); I1 as fact; the window-width sentences cut
(both fixtures' mint and approve also go through `L1TxUtils`); two address literals instead of a 1-9 range
check; the line cuts. Agreed with D2 (pin the package default), D4 (Chrome-only local proof), index 1 and the
module/test placement. Its env-override finding needs unsupported conditions: a known limit.

## Consult 3: Codex resumed (rounds 2 and 3), 2026-10-21

Round 2: approve with changes. Withdrew the 5.x evidence finding after reading `@aztec/aztec`; backed the scan
(D6: "proportionate; it guards this regression"); asked for a non-empty control per bridge helper in the Phase 2
log check. Taken for `bridgeFeeJuice`; for `bridgeForMint` it is unmeetable: `@aztec-labs/foundation`'s
`pino-logger.js:97` defaults to `silent` under `NODE_ENV=test`, and setting `LOG_LEVEL` would also reach the
spawned node. Round 3, on that evidence: approve.
