# exec-empty-1: phase 1

- 2026-11-07 deviation: a third pins fixture fed `calls: []` to reach the account lookup (`tx-request-builder.pins.test.ts`, the `account resolution` table's `buildNoFrom` row); it gets one call too, beside the two Codex named. No composition test builds a NO_FROM request with the real builder.
- 2026-11-07 red-on-base proofs at 0f1f5ad6d, each source restored after:
  - the base `tx-request-builder.ts`: only the new "no call or two calls" pins test reds (the plain `Error`);
  - `isDefaultEntrypointRefusal` without the new class: the `service.refusal`, `mark-failed-unless-cancelled` and `queued-journal` rows and the two-hop row red;
  - `REBUILT_AS` without it: the wire-table rows, the two-hop row and the window's `none` preview row red;
  - `refusalKind` without its line: the window's `none` preview row reds.
  - The two `error-envelope.test.ts` rows cannot red on base: the envelope classifies only `ScopeViolationError`, so any new class answers unclassified by default. They pin that answer against a later change.
- 2026-11-07 captures: Chrome, local network, proverless, at 0f1f5ad6d, through a temporary playground button (`{ calls: [], authWitnesses: [], capsules: [], extraHashedArgs: [] }`, `from: "NO_FROM"`) and a temporary spec step, neither committed. Green at retry 0 (84 s): the notice `data-kind="none"` with the owner's two sentences and no Confirm; Reject answered the app with `UNCLASSIFIED_ERROR_MESSAGE`; one `dapp_execute` record `failed` / `wallet_refused`. Frames: `screenshots/execute-no-call-refused-{light,dark}.png`.
- 2026-11-07 diff review: Codex round 1 `approve` with one Low (a historical sentence in a doc comment), folded in ed8ae66b7; the Opus review beside it `approve` with one Low needing a second caller that does not exist, rejected; Codex round 2 (resumed) `approve`, no findings.
