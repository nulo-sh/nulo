# Phase 2: the pass and the promotions

- `0d6fd6b34`: every other row of the dispositions table, written from the draft the panel reviewed; the word diff matched the table row for row. `fb2dea422`: P1 and P2. The file equals the reviewed draft byte for byte.
- Result: 7592 B, 31 entries (from 8191 B, 33).
- Gate: `bun run lint` exit 0; `check:plans` 0 findings; `bun test scripts/ci-cd/plans/` 108 pass; `check-no-local-paths.sh` ok; the diff from `87d04118e` holds no account name, launch day or advisory text.
