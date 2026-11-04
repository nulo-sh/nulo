# update-fpc-1: phase 0 (recon and the lost row)

## Diagnostic live run, 2026-11-04

- Candidate: `bash apps/extension/scripts/e2e/build-update-candidate.sh chrome` at `040334f53` (`1.1.0.1`, 11 s).
- Uncommitted change: two `console.log` lines in `endOnSecondAccount` printing the release's own reads of its fee payer rows (id, chain, type, address, name) and networks (chain, kind, name). Reverted after the run.
- Run: live scenario from v1.1.0, Chrome, retry 0, 15:54:05-15:58:04 UTC. Red as the lane brief says, test 146.5 s: `updateProblems` named exactly `nulo:core:fpcs@c2769f0f: lost in the update`.
- The release's reads: `c2769f0f` is type 1, the canonical sponsor address, on chain 1685367866, the custom network "Sandbox" the scenario adds on the run's sandbox. The other fee payer row is the PrivateFPC on the same chain. Networks: Local Network (0, local), Sandbox (1685367866, custom), Testnet (685146337), Alpha V6 (2070860441, mainnet). No fee payer row on Alpha Mainnet.
- Conclusion: the row #1652's rule deletes (canonical sponsor, unlisted chain), on a custom chain rather than Alpha Mainnet as the lane brief assumed.

## Consults

(Codex plan audit rounds are logged below as they run.)
- Codex plan audit r1 (gpt-6.1-sol, high, read-only, 2026-11-04): reject. P1 picks never compared after the removal (faulty forget passes); P2 lower-case compare accepts a `0X` prefix the product refuses; P2 forgotten form should follow the rows actually gone; P2 handoff not self-contained; P3 "every custom network" too broad. All verified against the tree and accepted; plan revised (D2, F3, I2, Phase 1 tests, Delivery).
- Codex plan audit r2 (resumed): approve, no remaining material finding.
