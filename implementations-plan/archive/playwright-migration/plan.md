# Playwright migration

## Outcome

- **Date**: —
- **Status**: abandoned.
- **Shipped**: Nothing; the e2e suites stay on Puppeteer under `apps/extension/tests/e2e/`.
- **Open items**: routing the e2e gotchas the lessons rewrite retired into the `e2e-testing` skill, which includes this dead end, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Do not migrate the e2e suites from Puppeteer to Playwright. The proposal was a staged decision flow rather than a migration: triage the known failures for wallet-side bugs, then run a controlled spike that crossed runtime (Puppeteer or Playwright) with fixture scope (per file or per test), and migrate only if Playwright did something Puppeteer with fresh browsers per test could not. The spike parked the migration.

## Why

The motive was a cumulative-load failure mode in the network suite: late tests timed out on popup waits, and raising the timeout only moved the failures to different tests. The spike falsified both obvious causes. Giving every test a fresh browser did not help, nor did forking a process per file. A fresh chain sandbox still produced failures at a similar rate, in different tests each run, so accumulated sandbox state was not the explanation either. The best fit was latency variance in popup discovery brushing against fixed waits, which no browser-automation library changes.

Two more points settled it. The known deterministic failures were wallet bugs and tight timeouts, none of which a runtime swap touches. And at the time of the spike Playwright could not open a CDP session on a service-worker target, which the passkey and WebAuthn fixtures depend on, so that area would have needed a separate workaround. The one open question was whether Playwright's auto-waiting would shrink the roughly three hundred lines of CDP workarounds in the extension fixture; it was never tested, and porting one smoke test would answer it if anyone wants to know.

## What shipped

- Nothing in the tree. The suites keep their Puppeteer fixtures and the 300-second protocol timeout.
