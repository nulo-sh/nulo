# Arc 1: worker services (#1131, #1136)

- Gate, 2026-10-27, on the arc head: `lint`, `typecheck:all`, `test` (942 files) and `test:all` exit 0.
- #1131 replay (the issue's five-step list, armed Chrome smoke build): 15 of 15 green, about 17 s each. Base proof: with the base `gas-balance-reader.ts` rebuilt, run 1 went red at step 4 with `O4 error log from execution: unclassified`.
- #1136, network seed 1001, one proverless run: red only on the known #1132 line (two instances; arc 2's issue), no #1131 or #1136 line. Base proof: with the base `pxe/service.ts`, the same seed went red at step 7 with the `[READ] getSyncedBlockHeader failed … not-yet-synchronized PXE` line.
- Unit red/green: the two new gas cases fail on the base source; the PXE debug cases fail with the base `logOpFailure` and plain `Error` throws.
- `e2e:agent` overwrites `dist/chrome` with its network build: rebuild the armed smoke build before the next smoke run.
