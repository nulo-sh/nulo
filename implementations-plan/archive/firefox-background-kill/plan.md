# Firefox background kill

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A browser-neutral `stopBackground` and `backgroundAlive` on the e2e browser seam (`apps/extension/tests/e2e/fixtures/browser/chrome.ts`, `apps/extension/tests/e2e/fixtures/browser/firefox.ts`), the restart spec `apps/extension/tests/e2e/network/firefox-background-restart.test.ts` ending the background alone, six background-kill specs running on both browsers, and `apps/extension/tests/e2e/FIREFOX.md` stating what stays Chrome-only.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Let the e2e suite end the Firefox background page by itself, leaving popups, content scripts and `storage.session` untouched, the way Firefox ends an event page under memory pressure. Put it behind the same `BrowserDriver` seam Chrome already used, so the specs that killed the Chrome service worker can run on Firefox too. Only fixture and spec code changed; `apps/extension/src/**` was not touched.

## Why

Before this, the restart spec on Firefox reloaded the extension, which wipes `storage.session` and restarts everything. A background-only death is the event the wallet must survive, and nine specs were Chrome-only solely because only Chrome could kill its background. It continues [the PXE timer throttling work](../pxe-timer-throttling/plan.md), which could only use the public reload.

## What shipped

- **The seam.** On Chrome the existing close-target body moved into `chrome.ts` unchanged. On Firefox the privileged termination goes through geckodriver's system-access channel, waits until the old background page is gone or a different one runs, and fails by name on a 15-second budget. `backgroundAlive` answers false only for "no background is running" and rethrows any other probe failure, so a broken probe cannot pass for a dead background.
- **Hardening of the Firefox loop.** Review made it re-ask a declined termination, never treat a probe error during teardown as success, bound the whole wait with one deadline, and ask again only directly after seeing the same page. It is unit-tested without a browser in `apps/extension/scripts/e2e/firefox-driver.test.ts`.
- **Ports.** At delivery, six of the seven non-canary background-kill specs ran on Firefox. One whole-file skip remained because both its kills land under an open restore page, plus the CDP-Fetch redirect spec; the two execution canaries were ported afterwards by [the Firefox arc closeout](../firefox-arc-closeout/plan.md).
- **Mechanics now documented.** Firefox declines the termination silently while any extension page is open, so "a popup outlives the kill" is Chrome-only. A terminated event page returns only on its next event, so each spec opens a popup right after the kill. `storage.session` survives a background-only death on both browsers, and the wallet still comes back locked.
- **Measured, not fixed.** A dApp call in flight when the background died stayed unanswered for the 210 seconds observed, on both browsers, in one run each. Whether to reject pending calls on boot was a product decision outside this change; [the Firefox arc closeout](../firefox-arc-closeout/plan.md) later made the restarted background answer a forgotten session.
