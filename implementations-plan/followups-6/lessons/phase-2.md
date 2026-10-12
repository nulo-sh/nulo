# Phase 2: every artifact launch guarded, with the stand-in

## Step 4: Home read-through (2026-10-12)

After the change an artifact launch differs from a guarded source launch in one state: the production bundle seeds the four shipped Testnet tokens, which show as `token-seed-row` skeletons (`data-status` pending) from registration, then as `failed` rows with a `token-seed-retry` button after the seeder's third attempt, about 75 s in (15 s and 60 s waits). Before the change the same rows resolved into `tokens-card` links against the live node. Swept: every smoke spec that names a token-area selector (`tokens-card`, `tokens-list`, `token-seed-*`, `tokens-menu-*`, `data-settled`) or walks, measures or hit-tests Home (`tabAround`, `tabTo`, `press("Tab")`, `getBoundingClientRect`, `elementFromPoint`, screenshots).

| Spec | What it reads on Home | 15 s end (pending skeletons) | 75 s end (failed rows) |
|---|---|---|---|
| `rows.test.ts` | Tab walk to `tx-card`, the row's ring and activation, row gaps | waits for `data-settled` with no non-terminal seed row (`TOKEN_LOADING`, 150 s), so never measured here | holds: the walk is logged, not asserted; the gap test measures activity rows (`settledRows`) |
| `home-links.test.ts` | Tab from `tokens-menu-trigger` to `activity-view-all`, no `BODY`/`nav-` crossed | `data-settled` stays false while a default is pending, so never measured here | holds: the failed rows' retry buttons sit between the menu and the link in DOM order; the walk crosses no nav |
| `tooltips-glossary.test.ts` | Tab walk stops at `gas-label-private`; bubble geometry; clicks under the bubble | holds: the walk and the bubble are above the token card; rows growing below move nothing above | holds: same; `recordClicks` prevents every click, so a retry button under the bubble does nothing |
| `navigation.test.ts` | `tokens-menu-trigger` dropdown | holds: the trigger is in the card header | holds |
| `popup-stack.test.ts` | Tab inside popups over Home | holds: the trap keeps Tab inside the popup | holds |
| `snackbar.test.ts` | snack geometry on Home; Tab to the last page control | holds: geometry is relative to the window; the last control is found when measured | holds; the seeder raises no toast (none in `seeder.ts` or `TokensView.vue`) |
| `send-keyboard.test.ts` priced tests | the Send page with seeded token row 1 | holds: the Send picker lists token rows only; a seed row is never a picker option (`TokenSeedRow.vue`) | holds: the same state as a source run (no shipped tokens) |
| `send-fee-privacy.test.ts` | Send with nothing readable | holds, and now matches its header in both modes: no token row exists | holds |

No spec needs a change; the stop rule is not reached. The two Home specs that measure below the token list already wait for a settled list with no seed row working, written for a failing node.

## Step 5: measured artifact runs (2026-10-12)

Fresh release-shaped copies built at 2cef116 (no `VITE_*`, no stamp), the Phase 2 tree applied, a local uncommitted append of `guard.attempts()` after each guarded close's guard stop (dropped afterwards). `NULO_E2E_ARTIFACT_RUN=1 EXTENSION_PATH=<copy> bun run test:e2e -- --retry=0`.

- **Chrome**, 03:14-03:37, 1353 s, **exit 0**: 47 files passed, 5 skipped; 207 tests passed, 15 skipped. Against Phase 0: `egress-guard.test.ts` 7 skipped → 7 passed (the control spec now runs). Duration changes over 15 s: `home-links` 18 → 85 s and `rows` 38 → 99 s (each waits for the four shipped seeds to stop, about 75 s, as written for a failing node); `legal-acceptance` 198 → 136 s, `passkey-retry` 77 → 55 s (no live node round trips).
- **Firefox**, 03:15-03:44, 1760 s, **exit 0**: 50 files passed, 2 skipped; 204 tests passed, 18 skipped. Same tally change; `home-links` 21 → 87 s, `rows` 54 → 112 s; `legal-acceptance` 250 → 182 s, `passkey-toolbar-panel` 148 → 98 s, `auth-flows` 50 → 34 s, `send-keyboard` 69 → 51 s.

Guard records, summed over every guarded close (113 Chrome, 115 Firefox):

| Browser | Host:port | Count | Launches | Declared by |
|---|---|---|---|---|
| Chrome | `accounts.google.com:443` | 373 | 113 | `CHROME_OWN_HOSTS` |
| Chrome | `update.googleapis.com:443` | 342 | 113 | `CHROME_OWN_HOSTS` |
| Chrome | `www.google.com:443` | 117 | 113 | `CHROME_OWN_HOSTS` |
| Chrome | `egress-canary.test:<launch port>` | 116 | 113 | `DECLARED_REFUSALS` (the canary) |
| Chrome | `clients2.google.com:80` | 113 | 113 | `CHROME_OWN_HOSTS` |
| Chrome | `api.coingecko.com:443` | 112 | 98 | `DECLARED_REFUSALS` (price fetch) |
| Chrome | `android.clients.google.com:443` | 52 | 45 | `CHROME_OWN_HOSTS` |
| Chrome | `update.googleapis.com:80` | 3 | 3 | `CHROME_OWN_HOSTS` |
| Chrome | `lb.drpc.live:443` | 3 | 2 (`contacts-import`, `sw-resilience`) | `DECLARED_REFUSALS` (a request before the stand-in, or during a spec's interception swap) |
| Chrome | `egress-probe.test:443`, `169.254.0.1:443` | 1 each | 1 | `DECLARED_REFUSALS` (control spec) |
| Firefox | `firefox-settings-attachments.cdn.mozilla.net:443` | 2546 | 114 | `FIREFOX_OWN_HOSTS` |
| Firefox | `content-signature-2.cdn.mozilla.net:443` | 2444 | 115 | `FIREFOX_OWN_HOSTS` |
| Firefox | `firefox.settings.services.mozilla.com:443` | 846 | 115 | `FIREFOX_OWN_HOSTS` |
| Firefox | `egress-canary.test:<launch port>` | 118 | 115 | `DECLARED_REFUSALS` |
| Firefox | `api.coingecko.com:443` | 110 | 101 | `DECLARED_REFUSALS` |
| Firefox | `lb.drpc.live:443` | 1 | 1 (`sw-resilience`) | `DECLARED_REFUSALS` |
| Firefox | `egress-probe.test:443`, `169.254.0.1:443` | 1 each | 1 | `DECLARED_REFUSALS` |

I2 holds: the production bundle under the stand-in tries no outside host beyond the price host and each browser's own hosts. No undeclared host, no canary connection. I3 holds as read in step 4: no spec needed a change, so the stop rule (D-orch-4) was not reached.

Gate: `bun run --cwd apps/extension test` 0, `bun run lint` 0, `bun run typecheck:all` 0, both artifact runs green on their first run, the control spec ran in both: **pass**.
