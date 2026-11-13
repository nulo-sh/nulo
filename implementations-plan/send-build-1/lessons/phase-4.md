# Round a1b: the owner's page-137 changes to the form

Page 137 (signed 2026-11-12 14:44:49 UTC) asked four changes of #1795: the check line's words, a warning fix that never relies on the sponsor, the token row's tint over its whole band, and the prototype's fee sheet. Decisions D21 to D24; owner asks OA-2, 3, 4, 8, 12 and 14 answered, OA-17 opened.

## Build log

- The check line and the warning's fix landed as unit-level changes with component tests (`PayeeBlock`, `PublishLine`, `FeeSettingsCard`'s remedy, `send.test.ts`). The fix's "covers the fee" reads the PrivateFPC row's balance against the estimate's max fee, an approximation (the estimate is for the payer in use; OA-18), and with no estimate yet a balance read above zero offers the fix.
- The token row's band: the section supplied the 14 px, so the row's box was only its content's 36 px and its tint a slim strip. The row now pads itself to the rules; a banner or caveat in the same section keeps its spacing through classes the page sets. jsdom has no layout, so the band is proven in `send-keyboard`'s smoke spec (box edges against the section's rules, 64 px, tinted at focus, hover and press).
- The fee sheet: Send's card draws `FeeMethodRadios.vue`, keyed off the card's existing Send discriminator (`originPrivacy`), not a new prop. The card's unit tests stub the radios with the menu's stub, so its Send-mode suite (186 cases) kept its picks unchanged. The menu's tag was drawn for Send alone, so it and its prop leave with the menu; the e2e invariant now reads the card's pick (public Fee Juice under a private origin) in its place.
- A failed integration test left its page mounted (it threw before `unmount`), and that page's estimate timers counted into the next test's call total: one red became five until the first was fixed. Read the first red of a run first.

## Review round (Codex and Opus, side by side)

- Both conditionally approved. Both found the native radios' check can stay on a pick the card refuses: Vue patches `checked` only when its bound value changes, and a refused pick changes nothing. Codex reproduced it in memory (unread balance, public picked, the sponsor kept). Fixed in the component, with a test red without it.
- Opus traced, and the touched network spec reproduced, an e2e red: the invariant's derived tag read the radios' `data-fee-method`, which previews a saved pick while balances load, so `waitForFee` asserted on a preview (`fee-methods`, both gases held, a fresh popup: tag set, warning off, `you` unknown). The old tag came from the publish facts, the same source as the warning; a stand-in for a removed DOM signal must read the same source, here the fee line's payer in effect.
- Codex: the "covers" heuristic compares against the payer-in-use estimate, whose cap multiplier and gas differ from the PrivateFPC's. An exact check is a second estimate lifecycle, a plan change: OA-18.
- Codex, resumed over the fixes: approve, with in-memory harnesses over the real components and focus-trap. The touched network specs: 11 of 12 before the e2e fix, 12 of 12 after.

## Gates (retry 0, head `477d1f040`)

- Static: lint, typecheck:all, test:ci-gating (755), check:plans green. test:all: one red at load 278, `price/convert.test.ts` timing out at 5 s (21 tests, 143 ms alone, untouched here); rerun green.
- Smoke: Chrome 290 passed (2044 s). Firefox 294 passed and 1 red, `sealed-storage`: the unlock's sealing pass outran its 120 s wait at load ~330 (31 s in the arc's earlier Firefox gate, 129 s alone at load ~200); the file rerun green. The spec's wait is load-sensitive, not this round's.
- Network, the 24 specs: Chrome 62 passed (2663 s), Firefox 62 passed (3394 s). Armed on Chrome: `send-chaos`, `stale-network-a10-capture`, `store-captures`, 3 of 3 (the store art restored after).
