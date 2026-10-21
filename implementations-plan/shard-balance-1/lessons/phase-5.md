# shard-balance-1: post-implementation review and measurement

## Fix loop, round 1 (2026-10-21)

- Codex `gpt-6.1-sol` at high, session `01a15bd5-a85b-7933-a8b9-31bdb631ad2c`, beside one Opus
  diff review. Both found the same hole: a test can print a fake file line and a fake
  `Test Files` count, and the parser trusted the first summary. Fix: exactly one summary per job.
- Opus also showed, by mutation, that the order test could not see the unknown-file sort, which
  is what keeps a new file in exactly one shard when runners glob in different orders.
- Mutation checks run on the sequencer: shard index ignored, absolute-path keys, shortest-first
  order, unsorted unknown files. Each now fails at least one pin.

## Fix loop, round 2 (2026-10-21)

- Resumed Codex session: clean. The loop converged after two rounds.
