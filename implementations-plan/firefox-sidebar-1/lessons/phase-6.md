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
