# Light theme fix

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the repaired light palette in `packages/design/src/base.css`, the contrast gate in `packages/design/src/theme-contrast.test.ts`, the undefined-variable guard in `packages/design/src/theme-vars.test.ts`, and the pre-paint theme hint in `apps/extension/public/theme-boot.js`.
- **Open items**: onboarding applies the default `system` theme instead of the stored choice, so a person who chose light or dark sees onboarding in the OS scheme, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Repair the extension's broken light theme at its root rather than restyle components, and give the faucet a matching Dark, Light and System toggle in the same change. The dark theme stays frozen, with two reviewed exceptions: the `--nulo-primary` focus ring, which was undefined and invisible in both themes, and an additive `color-scheme: dark`.

The light accent is a saturated burnt amber, not a near-black ink, and the contrast gate is an honest hand-curated pairing table, not a cascade resolver.

## Why

The theme machinery worked. The failure was a small set of gaps: eight brand tokens were missing from the light block, so hundreds of call sites silently inherited dark values, `--border` was aliased to a dark surface, about 37 hardcoded dark literals sat in 27 files, and a few undefined variables resolved to black.

The accent is both a fill and the colour of links, active tabs and an ON toggle. An ink accent passed contrast but made a link read as body text and an ON security toggle read as OFF, which is dangerous in a wallet. The first amber was darkened because the gate measured 4.29:1 for white text on the fill, below AA.

The gate cannot resolve the live CSS cascade, because jsdom cannot, so it resolves the token graph in `base.css` and checks curated pairs. It is only as complete as its pairing list. Playwright visual regression was declined, so the dark freeze is proven structurally plus manually, not by pixel diff.

## What shipped

- **Palette**: the eight tokens and an explicit `--border` in the light block, with every semantic text, background and accent pair verified for AA in both themes.
- **Tokenisation**: the hardcoded dark literals became tokens with no new tokens added, and the dead `_base.scss`, `_flex.scss` and `_text.scss` were removed.
- **Flash of dark**: an external `theme-boot.js` sets the real theme attribute before first paint. The extension CSP forbids only inline scripts, so a self-hosted external script is allowed, and a media-query fallback would have missed the components gated on the attribute.
- **Guards**: the contrast gate and the undefined-variable guard, the second of which found ghost tokens the inventory missed.
- **Faucet toggle**: shipped in the same change; the faucet app is no longer in this repository.
- **Security copy**: a later audit found light muted text below AA on the scam-token prompt and the irreversible-action confirm. The light muted tokens were raised and a required contrast test now checks them in both themes on the card and surface tokens.
- **Accepted**: a one-time flash for people whose chosen theme differs from their OS, until settings replay; the deferred cleanup of dead `--btn-*` tokens.
