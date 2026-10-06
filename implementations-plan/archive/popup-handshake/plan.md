# Popup-open fast path in the e2e fixtures

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `openPopup` in `apps/extension/tests/e2e/fixtures/extension.ts` tries a single navigation first and falls back to the old navigate, blank, navigate sequence only on a timeout.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Every e2e popup open did an unconditional triple navigation (popup, blank page, popup) to dodge an occasional lost wallet-bridge handshake on a fresh tab. Try the single navigation first, wait briefly for a readiness signal, and run the old sequence only if the signal does not arrive.

## Why

The sequence ran on well over a hundred call sites and cost a measurable share of the smoke suite's wall time, while a measurement run took the fast path every time and never needed the fallback. The second navigation of the old sequence was also where a class of "lifecycle watcher disposed" flakes fired, so skipping it shrinks that surface too.

Alternatives were rejected:

- A readiness marker written by the wallet, in session storage or on `window`, survives service-worker suspension, goes stale, and adds a test-only path to production code.
- Deleting the blank-page bounce outright would bring the dropped handshake back on slow or cold runners.

## What shipped

- Readiness is the hash leaving the root route and the global loader being absent. The hash alone fires too early, because the app redirects before the wallet bridge is connected, and the loader's absence is the real "bridge connected" signal.
- Only a Puppeteer `TimeoutError` triggers the fallback. Any other error, such as a page crash or a dropped debugging connection, is rethrown so it is not mistaken for a handshake loss.
- The fast-path budget is two seconds and is provisional: it was measured against a service worker the launcher had already warmed, so it does not cover a true cold start. The fallback keeps the old second-navigation hazard, now rare.
- A per-call log line, enabled by `NULO_E2E_OPENPOPUP_LOG=1`, counts fallback incidence in CI artifacts.
