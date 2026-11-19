# Phase 4 — the browser check and the owner's pictures

- 2026-11-05: `vite preview` of two builds (HEAD, and HEAD with the three copy files reverted to `dev`), each on a port claimed in the shared registry and released after, served with the site's CSP; Puppeteer from `apps/extension`, `/api/*` answered by request interception.
- Browser check on `/confirm#<token>`, all pass: nothing posted before the press; a held first press, then a second press, sends one `POST /api/confirm` whose body is `{ "token": <fragment> }`; the answer moves focus to the heading; no CSP refusal. Also: no token → the invalid state, nothing posted; a 503 keeps the button and releases the lock; the form posts once to `/api/subscribe`, before and after.
- First run: `#7-children` is not a valid CSS selector (an id starting with a digit); `[id="7-children"]` instead. Script only.
- Pictures: 16 files (OWNER-ASKS names each).
