# Phase 1: arc 1158 (never-lock confirm)

- `askConfirm` needs one signal only, the confirm slot's identity: `popupStore.open` closes and re-adds, and the dialog clears its request on every close, so a replacement and a close both move the slot. A second `isOpened` watch was redundant; mutation testing showed no test needed it, so it went.
- A page test that emits then unmounts at once never reaches a debounce: unmount stops the watcher before its queued job runs. Flush the watcher first, or the guard under test is never exercised.
- Codex round 1 (gpt-6.1-sol, high): two findings accepted (a replaced question's no undid the newer 0; two narrating comments). Opus diff review: three accepted (two page tests that could not fail; a stale header). Round 2: `clean`.
- Gates at `7adc3eb5a`: `bun run audit:vue` green (942 files, 15949 tests); armed Chrome build; `security.test.ts` on Chrome 6/6.
