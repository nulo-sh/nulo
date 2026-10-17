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
