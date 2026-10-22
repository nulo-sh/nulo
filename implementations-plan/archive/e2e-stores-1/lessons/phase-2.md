# e2e-stores-1 — phase 2 (the node's TMPDIR)

- Budget controls, each reverted: counting UTF-16 units instead of bytes, and `>=` for `>`. Each turned the boundary test red.
- Green probe (`… e2e:agent tests/e2e/network/meta-getChainInfo.test.ts`, no scratch `TMPDIR`, load1 ≈ 120): exit 0 in 107 s, `[e2e-setup] node stores: 26 open, all inside ~/.cache/nulo-e2e/nulo-aztec-<pid>-<ts>`. After it exited the run dir was gone and `/tmp` held no `wsdb-<node pid>-*` entry.
