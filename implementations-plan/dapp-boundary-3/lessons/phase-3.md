# Phase 3: arc gate and the arc review

## Gates before the review, 2026-10-17

- `bun run test:all`: every workspace exit 0 (extension 13570).
- Merged `origin/dev` at 5653e890: one conflict, `implementations-plan/index.md`, both lines kept. Then `bun install --frozen-lockfile`, `lint`, `typecheck:all`, `test` (13603): all exit 0.
- `bun run check:plans`: 0 findings.
- Network e2e: held, load1 above 150 (230, then 204).

## Review round 1 (Codex gpt-6.1-sol high, and one Opus general-purpose review, on `git diff 5653e890 HEAD`)

Both `conditional approve`; the same two findings from both legs, each checked against the tree before acting.

1. **The subclass did not survive the operation-result channel.** `classifyOperationCatch` sends `{ error, code }`; `unwrapOperationResult` and `remoteErrorFromResponseContent` rebuild through `walletErrorFromPayload`, which knew only the code, so a NO_FROM Confirm's dApp read the generic scope text. History stayed right: `markFailedUnlessCancelled` reads the original error in the executor. Fix (D11): the class and its three messages moved to `@nulo/extension-messaging/errors`, and the rebuild returns it for exactly those messages under `SCOPE_VIOLATION`; the class carries its own literal `name`. Tests: the error table gains a `by-message` row (any other message under the code rebuilds as `ScopeViolationError`), the three messages rebuild as the subclass and under no other code, and the classify → unwrap → envelope chain test now ends at the registry envelope. With the rebuild line removed: 4 red in extension-messaging, 1 red in the envelope chain; restored green.
2. **The pin test could pass unchecked.** The `bad_cast|wasm` catch hid any hashing failure in the package's own runner too. Fix: `auth-registry.pins.test.ts`, no catch, on the extension runner's exclude list beside the other bb.js-bound files; it runs in wallet-bridge's own suite (`test:all` in CI). `fee-payer.test.ts` keeps the same catch; outside this arc.

Opus only: three `createAuthWit` not-called assertions on the estimate and preview paths could not fail (the harness's validated build is a mock, and previews never sign): dropped. Comments tightened in `error-envelope.ts`, `method-scope-checkers.ts` and the job-kind list.
