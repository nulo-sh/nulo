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
