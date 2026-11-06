# discovery-allow-1: arc 2

- 2026-11-06. A new sealed root's goldens: `full` and `minimal` stay plaintext (the decoder's input; `stores.test.ts` and the goldens' property check read them that way) and a third `<name>.sealed` golden, authored plaintext with `sealed: true`, is sealed by the generator. Two all-sealed goldens failed both tests.
- 2026-11-06. `bun run baseline:storage` refuses to rewrite a stamp that `pins.ts` already pins ("a pinned golden is never re-signed"): to regenerate an unpushed stamp, drop its pin and `git checkout` `snapshot.json`, run it again, then add the new pin.
- 2026-11-06. Mutation checks on the flow: spending no token for the unpaced connection or its twin, and dropping the re-read after admission, each red a test in `background.every-site.test.ts`; recording the refusal after the purge reds the service's listener-order test.
- 2026-11-06. A window's buttons fade in as they enable; a shot taken right after `!disabled` catches Allow washed out. `settleThemeTransitions` before `shotSend` waits the fade out.
