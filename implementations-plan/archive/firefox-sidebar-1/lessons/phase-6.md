# Phase 6: the 240 px layout

## Measurement before the plan (2026-10-20)

A scratch spec (uncommitted) seeded a listed wallet as `type-roles.test.ts` does:
- a token row, a transaction from a dApp with a long name, a receipt, a failed journal record;
- the protocol FPCs and all four authwit kinds, a USD quote, a long contact name, Developer Mode on.

It set the viewport, lifted the shell's floor with `body.style.minWidth = "0"; body.style.maxWidth = "100%"` (the CSSOM, which the extension's CSP allows), and visited 45 popup routes plus the logger and JSON windows. Last, it locked the wallet and visited the four entry routes; with a profile present, three of them redirect to the lock screen.

On each route it read:
- **outside**: a box past the view, except fixed ones, and not counting boxes inside one already counted;
- **clipped-text**: an `overflow: hidden/clip` box narrower than the view whose content is wider, with no ellipsis drawn;
- **overlap**: two in-flow siblings of a row overlapping by more than 1 px both ways.

Runs:
- Chrome 152 at 240 and at 360 (the floor kept at 360);
- Firefox 153 at 240.

Build: `bc3db6e9` with the smoke flags. Each run exited 0 in about 4 minutes.

| Finding at 240 (not at 360) | Routes | Chrome | Firefox |
|---|---|---|---|
| `header-lock` box at 207–277 px | 31 signed-in routes | yes | yes |
| an activity row's state chip at 130–257 px | Home, History, a token's page | yes | yes |
| `activity-title-row` content 135 px in a 50 px box | the same | yes | yes |
| the From/To card's contact name past the view (154–280 px) | a transaction | no contact landed | yes |
| `send-submit` label 200–201 px in 192 | Send | yes | yes |
| `register-submit-btn` label 206 px in 192 | New profile | yes | yes |
| `accounts-new-btn` 107 in 90, `accounts-import-btn` 117 in 88 | Accounts | yes | yes |

By eye, from the shots:
- the network chip collapses to its dot;
- `RECENT ACTIVITY` and `VIEW HISTORY` touch;
- account-state records break a mono address as `0x1a` / `1a1…`;
- the logger window's toolbar overlaps its first lines.

At 360 the same sweep finds what `dev` already has: the activity row's hash overlaps its explorer link by 3 px on four routes, and the logger's wrapper reaches 361 px.

Not measured:
- the dApp windows, which need the network lane;
- the routes that need a state the seeds do not make: register, restore-again, legal/declined and connected-app detail.

Both are Phase 6 step 2.

## Step 1: the floor becomes a cap, I3 (2026-10-20)

The build of `e36474acd` with only `index.scss` changed (`max-width: 100%` in place of `min-width`), armed:
- Firefox's real panel: `action-popup-layout.test.ts`, now reading `innerWidth` on every tab and sample, passed in 24.0 s: 360 throughout.
- Chrome's real popup: a scratch spec, headful under `xvfb-run`, opened it with `chrome.action.openPopup()` from a tab: `outerWidth`, `innerWidth` and the body 360 at 0 to 1,200 ms after load and after a route change to Settings.

I3 holds on both; the floor became a cap for every view (Fact 20).

## Step 2: the inventory, on the cap-only build

The same seeded sweep as before the plan, now with the floor gone for real, on 45 routes, Chrome 152 and Firefox 153: 152 and 153 findings, the same set on both. Past the findings of the measurement above:
- the activity row's text column is about 50 px, narrower than its 127 px chip (Fact 21);
- by eye and from the review: settings rows' titles and descriptions end in an ellipsis ("Te…" for Testnet), sub-page titles ("MANAGE N…"), the Get started steps ("Ho…"), a contact's name and address ("Ale", "0…"), Manage accounts' names at zero width beside four controls (Fact 22), a record's values in a 50 px column, the logs Source panel opening at about −68 px;
- toasts fit: the card is the view's width less 32 px.

## Step 3: the checks on the base

The committed checks (`expectFitsNarrow` in `type-roles.test.ts`, `registration.test.ts`, `legal-acceptance.test.ts`, `restore-outcome.test.ts`), in a scratch mode that logged each check instead of failing, on the cap-only build, Chrome: 63 failing checks out of 99, every signed-in page through the header. The Home journey stopped at its tokens menu at 240 (the header past the view), as a non-scratch check does. The Firefox leg was stopped before it ran, when the gate changed in review; its route inventory above is the same set as Chrome's.

Per page, at least one check failed on 27 of 32: layout and view on every page with the header, the CTA cut on both New profile forms, and "Restore again" by its fates. Every check passed on five: register, the passkey ceremony, Export account, Import account with a file previewed and Reset, which show no header and cut nothing.

## Review rounds on the diff

| Round | Reviewer | Verdict | Taken |
|---|---|---|---|
| 1 | Codex gpt-6.1-sol | request changes | the gate reads text fates and contains a box only in a scroller inside the view (the shell clips, Fact 23); `display: contents` on the trailing slot; every Button label wraps; Settings rows' controls under the text; the Popover clamp; transitions settled |
| 1 | Opus 5.5 | request changes | the same, plus onboarding excluded and the comments |
| 2 | Codex, resumed | request changes | dApp titles take a second line below 359 px (seeded in `rows.test.ts`); the Popover clamp only below 359 px; replaced elements judged by their replacement; ancestor clipping counted; the log's box read inside its shadow root |
| 3 | Codex, resumed (the last) | request changes | a row's actions under its text, no side reservation; a recipient's name wraps; replacements matched one to one; a held snack released before the wait |
| final | Opus 5.5 | request changes | the amount and actions packed right (two auto margins split the row); two classes where a global `Flex` utility (`gap--N`, `justify-*`) could win; the stale confirmation's name wraps; a function name cut only past a third line |
| delta | Opus 5.5 | request changes | the windows' network under the account, no separator; a deterministic detail gap; the wrapped title row's line gap; settle before the snack wait |
| last | Opus 5.5 | conditional approve | the Details table's marks under their headings (one shared grid); its rows' padding; the note header's rule at two classes; the fee wait settles on the nudge |
| execute rows | Opus 5.5 | request changes | the split fate's line test failed at `line-height: 1` (glyph boxes overlap the next line): distinct tops; the planted page at the identifiers' own face and leading, proved against the old test; a negative control on the windows spec |

Kept, with the reason given to the reviewers: the Lock word and the network ellipsis are planned fits; a record's value keeps its two-line clamp, which it has at 360 too; the hero figure fits itself at every width; Chrome's real popup is checked by hand only.

## Step 5: the checks pass

The strict run before the Opus fixes failed once, on Chrome: the token metadata popup at 240 read the token menu's five items as gone. The menu closes with an 80 ms leave as the popup opens, and the record had caught it mid-leave. `expectFitsNarrow` now settles (two frames, any transitions, two frames) before it records. With that and the Opus fixes, the seven smoke files passed at retry 0 on both browsers: Chrome in 492 s, Firefox in 1,139 s, load 160–310.

## Step 6: the windows, and the pictures read by eye

The network lane's 240 px sweep found, one run at a time, since a test stops at its first failure: the dApp windows' identity strip 0.4 px wide (the NULO mark clipped), the capabilities window's account row cutting its address beside "Rename for this app", Send's summary strip 0.3 px wide on Firefox, the Details table's four fixed columns (192 px) wider than the 182 px its window leaves, a note's type ending in an ellipsis beside its contract, and a connected app's address past the view. Each fit is in § Architecture.

Twice the gate read a data race as a layout fault, never a width effect: Home's token quote landing during the check replaces the token's name with its figure, and an execute window's fee estimate landing replaces its "You pay" row. The specs now wait for each to land before the sweep, as they wait for any page to be ready.
