# Phase 3: final validation and the fix loop

## Fix loop (2026-10-11)

- Codex round 1 (session `01a12ad0-3586-7a20-bf4c-da6e5f977a5e`, gpt-6.1-sol, high, read-only), over `git diff 403623d..HEAD` at dccf80f: approve, two Low comment findings, both applied in 203b3cb (the `storageLocalSet` TSDoc cut to two sentences; the `loggedAfter` comments deleted and the three copies of its filter made one helper, `apps/extension/tests/helpers/logged.ts`).
- Opus 5.5 diff review, run alongside: approve; the same two Lows; `syncedRef.js`'s unawaited write noted as no-action and left out (its one user writes a number).
- Codex round 2 (same session, resumed) over the whole diff at 203b3cb: no new material findings. Converged.

## Gates on the arc head

Every run at retry 0.

- `bun run lint` exit 0 (27 warnings, 3 infos, pre-existing), `bun run typecheck:all` exit 0, `bun run test:all` exit 0 (13 workspaces; the extension 740 files, 11233 tests), `bun run lint:actions` exit 0, at 203b3cb.
- Firefox network, the seven files, proverless, two calls (call A at dccf80f, whose sources differ from 203b3cb only by a doc comment; call B at 203b3cb):

  | File | Tests | `DataCloneError` |
  |---|---|---|
  | `same-token-concurrent-sends` | 14/14 | 0 |
  | `concurrent-sendtx-confirm` | 1/1 | 0 |
  | `concurrent-sendtx-approve` | 1/1 | 0 |
  | `selfpay-phase` | 1/1 | 0 |
  | `authwit-lifecycle` | 1/1 | 0 |
  | `tx-sendTx-sponsoredFpc` (with the readback) | 1/1 | 0 |
  | `popup-escape-layered` | 2/2 | 0 |

  Fix count 0 on both calls (`grep -c` exit 1, no match), against 10 on base.
- `tx-sendTx-sponsoredFpc` on Chrome, proverless: 1/1 pass, readback included.
- Chrome smoke (armed build): 48 files passed, 3 skipped; 212 tests passed, 10 skipped; exit 0.
- Firefox smoke (armed build): 50 files passed, 1 skipped; 209 tests passed, 13 skipped; exit 0. No `DataCloneError` in either smoke log.
