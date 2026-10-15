# Extension log safety

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a retention gate and an error-safe redactor in `apps/extension/src/wallet/logger/`, allowlisted transport and restore-error logging, and the call-site guard `apps/extension/src/utils/log-payload-ban.test.ts`; the policy is the Logging policy section of [`CLAUDE.md`](../../../CLAUDE.md).
- **Open items**: none. The home-path guard running only as a local hook was closed by supply-chain-release (#63): CI runs it through `test:ci-gating`.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make every log line in the extension safe to persist and export, as a stack of three deliberately redundant layers delivered as one unit:

- **Retention**: persisting the log buffer to `chrome.storage.session` is gated behind Developer Mode, so a normal user's logs live in memory and die with the service worker.
- **Redaction**: `trim()` in `wallet/logger/utils.ts` stays the one universal walker, extended with a larger key denylist (camelCase and the kebab-case spelling of exported backups), shape collapses for notes, sessions and profiles, typed-array, `Map` and `Set` summaries, and an error projection.
- **Boundaries**: allowlisted shapes where a log line crosses a transport, a restore error or the dApp-facing error envelope, plus a guard test that fails CI on a sensitive value interpolated into a log call.

## Why

`console.*` is hijacked and funnels into the log store, so an ordinary `console.warn` reaches the persisted buffer and the CSV export. The only redaction was a five-key denylist that cannot see inside a finished string, and most call sites build strings. A single layer fails open: a denylist misses names nobody listed, a retention gate does not help a developer's own machine, a lint rule sees only `console`. Redacting inside the generic request path was rejected because it would rewrite live secret parameters and break unlock, restore and export; redaction lives in the logger client only. The bare key `secret` is deliberately not denylisted, since it names ciphertext in one shape and plaintext in another, so those shapes are collapsed by shape instead. Branded-type enforcement was dropped because brands erase before Biome sees them. `noConsole` is only a nudge; the guard test is the control.

## What shipped

- Developer-Mode-gated persistence in `wallet/logger/store.ts`, with one serialized write-and-purge queue so a clear is ordered after every pending write, and "Clear logs" purging the stored copy.
- Transport envelopes log method and request id only, never `params` or `result`.
- The redactor, with tests, and `scrubUrls` in `apps/extension/src/utils/scrub-urls.ts` reducing endpoint URLs to their origin.
- Per-service allowlists on restore errors (`apps/extension/src/wallet/services/restore-rows.ts`, `apps/extension/src/utils/full-backup-helpers.ts`), each field checked against the type its service declares.
- A fixed, classified fall-through for errors that cross to a dApp in `wallet/services/wallet-sdk/error-envelope.ts`.
- The guard test, which imports its denied names from the runtime lists so the two cannot drift.

## Lessons

### Error text

An error message carries text the redactor never sees: `JSON.parse` quotes an excerpt of its input inside `err.message`, so interpolating the error re-leaks what removing a payload preview had closed. Log a fixed failure category and never the message. A length cap bounds exposure and does not sanitize it.

### Enforcement is attacked before it is trusted

Every bypass of the guard was found by attacking it, not by reading it, and each fix was reverted in place to watch its new test fail. Enumerate what a log call may contain (object keys, arity reads) rather than what it may not. A value taken from the page, such as a request id, is not a safe substitute for another page-controlled value; a locally minted token is.
