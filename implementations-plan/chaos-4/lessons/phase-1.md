# chaos-4 phase 1: arc 1

## 1.1 The model

- The purity check's first regex, `[^;]*?from`, ran across statements in a file with no semicolons and swallowed a side-effect import into the next `from`; `[^;"]*?` keeps the clause inside its own statement. Its planted-import case caught it.
- The plan digest (seeds 1, 1001, 3001, 7001-7030, 7101-7105, 7201-7205; Chrome, Firefox and network caps; both starts) is identical at `2914b9699` and with `Caps.actions` absent.
