# Round a1b: the owner's page-137 changes to the form

Page 137 (signed 2026-11-12 14:44:49 UTC) asked four changes of #1795: the check line's words, a warning fix that never relies on the sponsor, the token row's tint over its whole band, and the prototype's fee sheet. Decisions D21 to D24; owner asks OA-2, 3, 4, 8, 12 and 14 answered, OA-17 opened.

## Build log

- The check line and the warning's fix landed as unit-level changes with component tests (`PayeeBlock`, `PublishLine`, `FeeSettingsCard`'s remedy, `send.test.ts`). The fix's "covers the fee" reads the PrivateFPC row's balance against the estimate's max fee; the estimate is for the payer in use, so a balance below it can never pay, and with no estimate yet a balance read above zero offers the fix.
- The token row's band: the section supplied the 14 px, so the row's box was only its content's 36 px and its tint a slim strip. The row now pads itself to the rules; a banner or caveat in the same section keeps its spacing through classes the page sets. jsdom has no layout, so the band is proven in `send-keyboard`'s smoke spec (box edges against the section's rules, 64 px, tinted at focus, hover and press).
- The fee sheet: Send's card draws `FeeMethodRadios.vue`, keyed off the card's existing Send discriminator (`originPrivacy`), not a new prop. The card's unit tests stub the radios with the menu's stub, so its Send-mode suite (186 cases) kept its picks unchanged. The menu's tag was drawn for Send alone, so it and its prop leave with the menu; the e2e invariant now reads the card's pick (public Fee Juice under a private origin) in its place.
- A failed integration test left its page mounted (it threw before `unmount`), and that page's estimate timers counted into the next test's call total: one red became five until the first was fixed. Read the first red of a run first.
