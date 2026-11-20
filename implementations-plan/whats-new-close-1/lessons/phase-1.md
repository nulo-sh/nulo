# Phase 1 lessons

- **Popup blocking, measured 2026-11-20** with a scratch MV3 add-on (not committed): Chrome 155 opens `window.open` from an extension page even 7 s after the click, and blocks it on a web page; Firefox 158 blocks it 7 s later from an extension page too, and opens it after the facade's awaited get and set. Both harnesses turn popup blocking off, so only such a probe sees it. Firefox needs its Remote Agent's recommended `dom.disable_open_during_load: false` overridden by a user pref for the blocker to run under Puppeteer.
- **Frames on Firefox:** BiDi `browsingContext.captureScreenshot` refuses an extension page ("browsing contexts in privileged scope"), so `shotSend` fails there; take frames on Chrome.
- **Codex r1** (gpt-6.1-sol, high): `findings`, three, verdicts in plan.md § Audit verdicts. Resumed on the fix: `clean`.
- **A `chrome.storage` mock that stores at call time cannot prove a write was awaited:** hold the `set` pending and assert nothing that must follow it has run.
