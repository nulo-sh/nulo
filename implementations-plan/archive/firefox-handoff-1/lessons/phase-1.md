# Phase 1: the record, the opener, the reopen

## I6, measured first (Firefox 153.0.4, headless, the smoke harness; scratch spec, not committed)

- Firefox's own `handleEvent` (read from the privileged scope): `mousedown` calls `getPopup(window, popupURL)` with the parser unblocked; `mouseover` preloads with it blocked; a `mouseup` off the button calls `clearPopup()`.
- Driving `handleEvent({ type: "mousedown" })` on the wallet's action: a `webextension-preload-browser` appears in a `closed` panel and the wallet boots in it in full (`readyState` complete, `#app` mounted, `#/popup/general`), with `visibilityState: "visible"`, `hidden: false`, `hasFocus()` false. A `mouseup` off the button destroys it.
- So a visibility wait cannot tell a preload from a shown panel: per D6 it is not built, consumption happens at the first arrival on an open session, and the abandoned press is a known limit (filed at close-out).

## The record, the opener, the reopen

- The record's reader lives in its own module, `utils/panel-handback.ts` (decode, `readHandback`, `settleLanding`), beside `own-window.ts`, which writes it (`returnToPanel`) and reads its landing in `postAuthRoute`; one direction of import, no cycle. Its key is a full literal, so `stored-shapes.scan.test.ts` registers it by name, not through the `nulo:own-window:` prefix.
- Profile ids are 8 hex characters when generated and a passkey's user handle otherwise, so the decoder bounds the id at 1 to 128 characters and compares it with the open session's `profile.id`.
- A failed removal at arrival still shows the snack: the person sees the result now, and at worst the next panel lands there once more.
- Gate: `bun run lint`, `bun run typecheck:all`, `bun run test` (898 files) exit 0.

# Phase 2: the card, the outcomes, the three pages

- One outcome type, `Outcome = { snack, profileId }` in `utils/snack.ts`, serves all three flows and `returnToPanel(route, outcome?)`; the record flattens it to `{ kind, label, profileId }`.
- The contacts outcome snack still opens inside the import's Lock hold (`applyHoldingLock`), so a lock waiting for the import's end closes it with the session, as before.
- `HandoffCard` owns the window's centring and the shared line as its `description` default; the three pages pass only their title. A global `Button` registration in a component test recurses through the design base's `<component :is="tag">`, so the card imports `Button` explicitly.
- Branch text keys the type-roles identifier inventory: a new `v-if` around an identifier site (Header, Import account's preview) re-keys its entry in `identifier-sites.expected.json`.
- `audit:vue` once failed `useLogFilters.scan.test.ts` on its 5 s timeout at load average ~370 (31/31 alone in 3.3 s); the rerun passed whole.
