# Arc 3b — lessons

## P10-04 probe (2026-10-13): the snack over a queued send's Cancel

Chrome, a 360x600 popup. Setup: a Send-page send from a drained balance fails ("Send failed", an error snack that stays until closed), then a dApp send waits on its approval window, so Home shows its queued card with Cancel.

- **On the base.** The snack spanned y 452-524 (12px above the 64px nav), Cancel y 433-461: its lower 9px sat under the snack at rest. At the scroll's end (Cancel at y 237) and centred, it was clear.
- **A centre-point hit test hid the overlap.** `elementFromPoint` at Cancel's centre (y 447) hit Cancel, because the snack started at 452. Only a rectangle intersection reproduced it. A placement probe must intersect boxes, not sample one point.
- **The action row as a plain footer over-corrected.** The plain rule lifts the snack above every point a footer reaches, now or at the scroll's end. The card's row reaches y 237 at the end, so the snack sat at 153-225 over the balance while Cancel was still at 433. With several cards, or a scrolled feed, the highest row pushed it off the top of the screen (both reviews, round 1). A row inside a list needs its own rule (`vSnackFooter.listed`): only where it is, and only while the resting snack would cover it.

## What could not be shot

- **#209's premise (no active network).** Removing the active-network key and reloading does not leave the popup without a network: it restores the primary one while it loads. No Home or History of that state exists to capture, so the rule stays unit-proven.
- **The info snack and the stage-less awaiting card.** No deterministic e2e reaches "Send not confirmed", and the stage-less window lasts one snapshot. Both were captured from the built Storybook: `build-storybook`, serve `storybook-static` on port 0 with `Bun.serve`, and drive each story's iframe in both browsers with the e2e suite's Puppeteer. Chrome on this host needs `--no-sandbox`, as the e2e launcher passes.

## Smoke-spec gotchas

- **A seeded token row needs its decimals getter.** A real row carries `getDecimalsFn`; without it `hasDecimals` is false and, after #103, every amount of that token reads "—". `seedTokenRow` writes the getter unless `decimalsGetter: false`.
- **A hash set before the seeding reload settles is overridden.** The reload's start-up navigation lands on Home, so wait for Home's cards before navigating.
- **The journal page has no bottom nav.** Navigate Home before `clickNavTab`.
- **Never build code in the page with `new Function` or `eval`.** The extension's CSP refuses it inside `page.evaluate`; inline the code.
- **A row's amount text is the figure alone.** The symbol is a separate element: assert `"1.5"`, not `"1.5 USDC"`.

## Guards that shaped the code

- `toast-call-sites.test.ts` requires a literal kind at every `openToast` call, or a ternary of literals. A kind chosen by the copy module had to become a flag (`checking`) read at the call: `kind: checking ? "info" : "error"`.
- `base.css.test.ts` pins the stylesheet's hash. A deliberate token change re-hashes it, and the pin comment names the choice.

## Code review round 1 (2026-10-13)

Codex (gpt-6.1-sol, high, session `01a13373-67ab-76a0-9b2a-ba17bf94bc67`) and one Opus review over `39b50d82..f575ab8d`. The verdicts and dispositions are in `plan.md` § Audit verdicts; the fixes are D35, D36 and D43.

- **The task-before-record gap (Opus).** `TransferExecutor.execute` starts its task, awaits `sequence()`, then creates the record. Any "until the snapshot lands" guard is too early, since a snapshot can land with the record not yet written. Only a running step or the record itself names the stage.
- **A failed journal snapshot was never retried while the port stayed up.** The catch's comment said the next event would retry; no event handler snapshots.
