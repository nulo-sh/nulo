# capture-hang-1, phase 0: root cause by experiment

All runs: Chrome, `NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/connect-verify-mismatch.test.ts --retry=0`, `NULO_E2E_SHOT_DIR` set to a scratch dir outside the repo, base 24399338. The probe was a throwaway patch to `shotSend` (never committed): it logged `document.visibilityState`, `document.hasFocus()`, the theme and `document.getAnimations()` before each step, and the pending step every 10 s.

## r1: which call blocks (load1 ~78)

- Case 1 (`check`, a popup window): every step `visible`, `focus: true`; both shots in 521 ms.
- Case 2 (`wallet`, the tab `openPopup` opened before `openPlayground`'s tab): `vis: "hidden"`, `focus: false` at every probe. Light shot 65 ms; flip; `settleThemeTransitions` returned at its 1 s bound (the 7 transitions never ended); the dark `page.screenshot` was still pending at +150 s, while `page.evaluate` kept answering every 10 s (`theme: "dark"`, no animations). Test timeout 150 s at 165 s, then "reading the CSP violation record took over 15s" at close. Same failure as #885.
- The light picture is current: it shows the Connected app page with its grid.

## r2: what a hidden tab paints (load1 ~66)

On the hidden wallet tab, each step bounded by a 20 s race that only logs:

| Step | Result |
|---|---|
| `requestAnimationFrame` callback | none in 20 s |
| capture A | ok, 101 ms |
| capture B, at once, no DOM change | ok, 142 ms |
| capture C, 2 s later, no DOM change | pending at 20 s |
| capture D, after the theme flip and 1.5 s | pending at 20 s; confounded: it queued behind C's pending capture on the context's screenshot lock |
| `page.bringToFront()`, then probe | `vis: "visible"`, `focus: true` |
| `requestAnimationFrame` callback | 27 ms |
| capture E (dark) | ok, 44 ms, a correct dark picture |

Then the test's own steps ran with the playground now hidden, and the case passed (76.7 s), the reconnect's check window shots included.

## Conclusion

- Blocks: `Page.captureScreenshot` (Puppeteer 25.8 `page.screenshot`, no `bringToFront` of its own) on a Chrome tab whose `visibilityState` is `hidden`. Demonstrated.
- A hidden tab runs no animation frame. A capture of it can still return, as the first one and one right after it did; a later capture, with or without a DOM change, did not return. Why Chrome serves the first capture and not a later one is not established; nothing here depends on it.
- Not the cause: the theme flip (capture C hung with no flip; D adds nothing, being queued behind C); a page that never settles (`settleThemeTransitions` returns at its 1 s bound); a different window (the probe reads the same page).
- Why only this case: on Chrome `newPage` opens a tab in the one window (`fixtures/browser/chrome.ts:239`), so the wallet tab is hidden once `openPlayground` opens its tab, and nothing brings it back before `shotSend(wallet, …)` (`connect-verify-mismatch.test.ts:70-81`). Case 1 shoots a popup window, which is visible. Firefox opens every page as a window (`fixtures/browser/firefox.ts:395`). Whether any other `shotSend` site shoots a hidden page is settled by the arc's capture-mode run over every file that shoots.
- The chrome launch flags (`--disable-renderer-backgrounding`, `--disable-backgrounding-occluded-windows`) do not make a background tab visible.

## Unit-layer probe

A throwaway `scripts/e2e/*.test.ts` importing `tests/e2e/fixtures/send-page.ts` under `bun --bun vitest run` passed (import 4.6 s): a unit test can load `shotSend` with a fake page.

## Consults

- Codex round 1 (gpt-6.1-sol, high, session 01a15664; `run-codex.sh` routed it to the alejo-icloud account through the managed `CODEX_ACCOUNT=best`): conditional approve, 6 findings, all accepted. The one fact it corrected: Puppeteer's default args already carry `--disable-background-timer-throttling` (`ChromeLauncher.js`), so a hidden page's timers are not the reason to bring the dApp back.
- Opus Plan leg round 1: conditional approve, 5 findings, all accepted. It found `chrome.ts:60-64`'s comment contradicted by r2 (the flags keep no frame running in a background tab) and that `page.screenshot` holds a per-context lock, so one hung capture holds every later one.
- Codex round 2 (resume): conditional approve, 2 findings, accepted: stale counts in the gate and `/goal`; capture D confounded by the screenshot lock.
- Codex round 3 (resume): approve, high confidence.
