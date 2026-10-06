# Clipboard deduplication

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: one clipboard helper and one secret-copy composable replace about 20 hand-rolled copy sites: `apps/extension/src/utils/clipboard.ts` and `apps/extension/src/composables/useSecretClipboardCopy.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Extract `copyToClipboard(text, openToast, opts)` with separate success and failure toast specs per call site, an opt-in `sanitize` flag, no nullish guard, and an explicit `openToast` argument. Extract `useSecretClipboardCopy` for the secret export pages (the recovery-phrase page uses it today). The one authorized behavior change: every migrated site awaits the write and shows an honest warning when it rejects, instead of an unconditional "copied" toast.

## Why

The address-copy helper was the only correct site (await, catch, honest failure). The secret export pages duplicated the whole clipboard scrub block, and every other site showed a success toast even when the write failed, which tells a user a secret or address was copied when it was not.

Injecting `openToast` beat a composable that wires the toast itself. It keeps the dependency visible, matches how every test already injects it, and the toast singleton would hide nothing worth saving.

## What shipped

- The helper keeps each site's own labels, icons and durations. Sanitizing stays off by default, so no site's copied bytes change. Only the sites that already stripped wire control characters opt in. Sites with no failure path today share one default failure toast.
- Handlers that were synchronous stay synchronous (`void copyToClipboard(...)`), and site-local "copied" flashes still start at invocation whatever the write outcome. No caller consumes the returned boolean.
- The composable calls `writeText` synchronously inside the user gesture. It schedules the 60-second scrub and the flash in the same tick, so a never-settling clipboard promise cannot block the scrub. No timer closure captures the secret, and it registers no lifecycle hooks and exports no `dispose()`. The scrub deliberately survives unmounting, and the pages keep their own secret-nulling `onBeforeUnmount`.
- Unit tests pin the toast metadata passthrough, the sanitize opt-in, the same-tick timers (including the unresolved-promise case), re-copy rescheduling, and unmount survival.
