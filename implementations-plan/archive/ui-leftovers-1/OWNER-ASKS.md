# ui-leftovers-1: owner asks

Two gaps found while planning page 35's picks. The arc ships each in its "ships now" form and does not wait.

## OA-1 (#628): a nameless dApp's row after it fails or is cancelled, and its details page

**Surface.** A dApp whose name sanitizes to nothing. With the page 35 pick, its in-flight row shows the "dApp" chip and its settled row already does. Two places still show nothing:

- the activity row of the same call once it is **cancelled or failed** (the terminal journal row, `TransactionTerminalCard`);
- the **App** row of that call's details page (`journal/[id].vue`), which the transaction page shows as "App · dApp".

**Options.**
- **A. Both take the same fallback.** The cancelled row keeps the "dApp" chip it showed in flight. Its details page reads "App · dApp", as the transaction page does.
- **B. Leave both as they are.** The chip shows while the call runs and disappears if it fails or is cancelled. The details page has no App row.

**Recommendation.** A. One call then reads the same in flight, settled, failed and cancelled. The code is one helper, already shared.

**Ships now.** B (unchanged). With A, the terminal row is one line in this arc. The App row waits for testers-fixes-3 (#629), which reshapes that row.

## OA-2 (#618): Holdings' total before the first price answer

**Surface.** Holdings with fiat display on, a funded wallet, and a price answer not back yet. That lasts one round trip with fresh prices, and up to about 10 s when they are stale and the provider is slow. Today the total reads "$0.00" with "N tokens · priced assets only" until the answer lands. Home shows a skeleton in its place.

**Options.**
- **A. Keep today's figure** until the answer.
- **B. A skeleton in the total's place**, as Home's hero does, with the token count beside it.
- **C. A dash with no caption** until the answer.

**Recommendation.** B. It is the state the owner already signed for Home, and it never shows a figure that is about to change.

**Ships now.** A (unchanged). The page 35 pick applies from the first answer on: a dash and "Prices unavailable".

## OA-3 (#583, P35-08 B): the two-chip row from a five-digit dollar figure

**Surface.** A dApp's transfer row (Home, History, a token page) at a five-digit dollar figure or more. Page 35's B was drawn up to 1,250 USDC. Measured in the built extension (Chrome, 360 px, with #649's type scale, whose 13 px dollar figure takes room from the chips): from 250 to 1,250 USDC the app chip sits under the whole direction chip at 96 px and the row is 71 px. From about $10K (12,345.67 USDC) the direction chip alone is wider than the room left beside the amount, so it breaks onto two lines too, above the dropped chip (96 px, then 71 and 64 px from eight digits), and the row is 84 px. #650's layout draws 68 px there, with "…" beside a two-line direction (76 px and three lines from eight digits). Before #649 these points were $1,000 (68 px) and about $10M (81 px).

**Options.**
- **A. The direction breaks above the dropped chip (what ships now).** 84 px from about $10K; the app's name stays.
- **B. The app chip disappears from where the direction would break.** 68 px; the name stays on the details page. Needs code that measures the row's room.

**Recommendation.** A. It keeps the name, which is why B was picked; since #649 it costs 16 px from five digits, an amount a testnet wallet shows far more often than eight, so the trade is closer than it was.

**Ships now.** A.
