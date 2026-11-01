# dapp-disconnect-1: phase 1 (the disconnect ends the fee question)

- 2026-11-01: first run of the new cases timed out at 5 s, the controls included. Cause: the harness's `approve()` returned the dApp's pending `execute` promise from an async function, which adopts it, so the caller awaited the whole send. Fix: return it wrapped (`{ sent }`). No timeout raised.
- 2026-11-01: red on the test commit (`9f36efbeb`) as planned: the disconnect and the refused check failed on the window's removal, case B on the row still `queued`, each in about 1.1 s; the Decline and the Accept control passed.
- 2026-11-01: the old "stays open" pin was the only user of the harness's `internals.interaction` accessor; both removed.
- 2026-11-01: gate green after the fix: `bun run lint` (four pre-existing infos, none in touched files), `bun run typecheck:all`, `bun --bun vitest run` over dapp-interaction, execution, operation-journal and wallet-sdk at retry 0 (129 files, 2379 tests).
