# Recon: store-art-2

Base `origin/dev` at `b53e1d4a`. Two Sonnet explorers, read-only, then checked by hand. Paths are under `apps/extension/` unless they start at the repo root.

## The capture spec runs at HEAD as written

- Every `data-testid` the spec and its helpers wait on or click exists: `home-scroller` (`src/popup/pages/general.vue:67`), `bottom-nav` (`src/popup/components/Navigation.vue:38`), the three activity cards, `gas-balance-{public,private}` (`src/popup/components/modules/general/GasBalanceCard.vue:165`, `:174`), `send-footer` and `send-submit` (`src/popup/pages/send.vue:851`, `:865`), the amount card's ids (`src/components/composite/send/AmountCard.vue:451-506`), `setting-strict-security-mode` (bound from `src/utils/settings-search.ts:210` in `src/popup/pages/settings/lock.vue:199`), the network rename ids and the playground's `pg-btn-connect` / `pg-status`.
- The Fee Juice text still ends in ` FJ` (`GasBalanceCard.vue:165-176`); #788 removed only `formatGas`, the gas-count formatter. The receipt chips "Public → Public" and "Received privately" are unchanged (`src/utils/received-display.ts:40-41`).
- Every helper the spec imports resolves with the signature it uses (`tests/e2e/fixtures/{transfers,send-page,popups,extension,settings,networks}.ts`).

## The run

- `bun run e2e:agent` (`apps/extension/scripts/e2e/agent.sh`) builds `dist/chrome`, proverless when `NULO_E2E_PROVERLESS=1` (`agent.sh:102-116`), claims its ports from `~/.agents/ports.md` and releases them on exit (`agent.sh:45-50`, `:243`). The spec carries no `@requires-proverless`, so an unarmed run also passes the guard and proves for real.
- The spec sets `retry: 0` and a 40-minute timeout; the stall watchdog fails a run silent for 10 minutes (`tests/e2e/run-limits.ts:6`). `STORE_CAPTURES` reaches vitest through the environment.
- The procedure is written once, in `tests/e2e/README.md:104-116`: the capture run with `NULO_E2E_PROVERLESS=1` ("Proverless is enough, since no frame shows a proof"), then `cd apps/extension && bun scripts/store-art.ts`. (The first explorer missed this section; checked by hand.)
- The last regeneration, #573 (`78b4b754`, 2026-10-16), captured at `71f98db4`: one pass in 239 s, fits `revealCutActivityRow 15` and `clearAmountLine 42`, the promo tile byte-identical (`implementations-plan/archive/ui-followups-p18/lessons/phase-3.md`).

## What the art is made of

- `scripts/store-art.ts:17-43` holds the five frames' titles and captions; `store/listing.md` has no screenshot section. It renders the promo tile from `store/templates/tile.html` and the two fonts on every run, and one 1280×800 frame per capture.
- Since `71f98db4` the tile's inputs are unchanged: `tile.html`, `SpaceGrotesk-latin.woff2`, `JetBrainsMono-latin.woff2` and the locked `puppeteer` (`^25.1.0`). The only font change is the Material font's removal (#641), which the tile does not read.

## What changed on the five screens since the last capture

From the 76 commits above `78b4b754` that touch `src/` or `packages/design` (commit messages and skimmed diffs; no pixels compared):

| Screen | Visible change (PR) |
|---|---|
| All | Type scale: `meta` 11→13 px, `nav` 10→11 px, small caps in one `label-section` role (#649); every glyph redrawn from Tabler 3.49.0 (#790, after #641) |
| Home | The fixed hero over a scrolling middle with its fade shadow (#633); private and public marks redrawn (#655) and sized 12 px, row bars 11 px (#789); display-only hero (#642, #678) |
| Send | Fee text `~X FJ ($Y)` (#733); the privacy marks (#655) |
| History | An incoming chip that does not fit drops under the title (#793); the type scale on row amounts (#649) |
| Security (the Lock page) | One shared settings control row (#779); settings rows without their leading glyph (#641) |
| Approve | Header chips at 11 px (#782); the grant card's wording changes (#611, #594, #778, #721, inferred) |

#788's token-page hero (#762) is on no captured screen: the spec frames home, send, history, the Lock page and the permission window (`tests/e2e/network/store-captures.test.ts:347-358`). Home at HEAD has no Get started card: PR #743 (onboarding-3) is open and holds it.
