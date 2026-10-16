# Phase 0: planning consults

## Recon

- Sonnet reuse sweep (11 capabilities). Its main finding: `infra/token-list/test/publish.test.ts` pins everything the publish workflow runs to `SIGNING_PATHS` with only `node:` and `@nulo/token-list` imports, so the extension's SDK-based preflights cannot run in `prepare` without loosening that pin.
- Probes, 2026-10-16: `https://aztec-testnet.drpc.org` answers keyless on chain 3415328944 (6.0.0-rc.3); `rpc.testnet.aztec-labs.com` refused TLS; `aztec-testnet-fullnode.zkv.xyz` timed out. Both preflights pass against the dRPC endpoint for USDC and GBPC.

## Round 1 audits (2026-10-16)

- Codex (gpt-6.1-sol, high, session `01a14474-759c-72b3-b048-26dba27a0885`): conditional approve, six findings (C1 to C6 in plan.md § Audit verdicts). Its own probe of the keyless endpoint returned an HTTP error, so it could not reproduce the wire shapes; the planner's probes and the preflight runs stand as the evidence.
- Opus 5.5 (Plan lens): conditional approve, eight findings (O1 to O8). Its `aztec_` prefix claim was verified at `@aztec-labs/stdlib` `dest/interfaces/aztec-node.js:399`, and `getContract(address, block?)` at `:357-361`.
- Planner check on C3: the artifact's embedded `token_contract/src/main.nr` shows the getters return storage verbatim, and the wallet decodes the symbol field as UTF-8 with NULs removed (`descriptors.ts:50`), looser than the preflight's decoder. So the decoder move both reviewers approved was dropped: it would have reported false differences for a non-ASCII symbol.

## Round 2 (2026-10-16)

- Codex, resumed in the same session: **approve**. Two non-blocking Lows (wallet-decoding test cases; qualify "never blocks" by the job timeout), both folded into plan.md.
