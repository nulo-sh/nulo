# Quality quick wins

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `packages/wallet-core/src/utils/event-handler.ts`, `packages/wallet-core/src/utils/alarm-dispatcher.ts`, `packages/extension-messaging/src/core/terminal-status.ts`, `packages/wallet-bridge/src/call-shapes.ts` and `apps/extension/src/utils/sanitize-parity.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Four low-blast-radius maintainability fixes with no behavior change, taken together as the first wave of a quality remediation:

- `EventHandler` reports a throwing listener through an optional plain `onError` callback instead of swallowing it.
- A parity test pins the extension's `sanitizeString` to the design package's copy.
- Two layering smells are removed by moving shared types down.
- A thin `AlarmDispatcher` takes over the repeated alarm ritual.

## Why

A bare `catch {}` in listener dispatch left no diagnostic. The callback is not the logger contract because the logger interfaces import `EventHandler`, and importing them back would close a type cycle, the smell class the layering fix removes. A reporter that itself throws is caught so it cannot break dispatch.

The two `sanitizeString` copies had drifted with nothing cross-checking them. The layering fixes were a request status type imported upward from the offscreen telemetry into the base client, and a type cycle between the authwit content and action modules.

Four service-worker components hand-rolled the same alarm plumbing (name, create and clear, name-filtered dispatch). A full task primitive bundling the period and a boot run fits only one of them, since the session manager reschedules a one-shot alarm under a lock and the reaper's boot sweep takes different arguments. So the primitive is deliberately thin: it owns only the create, clear and name-filtered listen ritual, is logger-agnostic (the caller's `onError` receives a failed tick, so each site keeps its diagnostic and nothing is reported twice), and leaves scheduling, boot runs and gating to each caller.

## What shipped

- The `EventHandler` change with unit tests: a throwing listener no longer stops later listeners and is reported, a throwing reporter is swallowed, and with no reporter dispatch stays silent. The default constructor is unchanged, so call sites did not move.
- A fixture table asserting byte-identical output from both sanitizers across quotes, Cyrillic, CJK, Greek, bidi and zero-width controls, emoji and truncation; flipping a fixture or diverging one copy turns it red.
- The terminal status type moved into the messaging package (telemetry re-exports it), and the call payload shapes moved into a neutral module both sides import from.
- `AlarmDispatcher` with its own tests, adopted first by the operation-journal sweep, whose `stop()` always clears the alarm and whose log strings are unchanged. The journal reaper, the price service and the session manager now use it as well.
