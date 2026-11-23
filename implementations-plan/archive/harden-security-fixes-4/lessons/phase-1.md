# Phase 1-4: arc 1 review

- The P1 and P2 reproducers needed wire-shaped inputs to be red on base: scope addresses as `AztecAddress` instances (they serialize to hex), and calls as the RPC carries them.
- Deleting P1's opening line moved an existing read-ordering pin: NO_FROM now reads the call list zero times before the slot, like the standard path.
- Codex round 1: clean, two comment nits. Opus diff review: code clean; two committed texts reworded before the first push. Codex round 2: clean, one nit. Converged in two rounds.
- OA-1 panel: Opus proposed leaving bundled token code out of the backup (option D); Codex showed it loses dApp-registered contracts of a bundled kind with no token row, and has no fallback on a restore across builds. Settled: recommend C now, D as its own plan with a narrower rule.
