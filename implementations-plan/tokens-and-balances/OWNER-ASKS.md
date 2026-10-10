# tokens-and-balances — owner asks

Four asks. Page 8 (P8-01, P8-02) is already on the owner's pages and is not repeated here; these
asks cover only what those records do not say. Each ask says what ships if it is not answered. OA-3
is the only one that touches Arc 1, and it covers race paths only: in normal operation Arc 1 changes
nothing a person sees. Arc 1 is built and its PR opens without an answer; it merges only on OA-3's.

## OA-1. #105: when a mint row in Activity may show an amount

**Surface.** A mint row in Activity (Home's recent activity, History) and its transaction page: the
"+N SYMBOL" amount on a mint of a token in your token list.

**Situation.** Today the wallet shows a mint's amount when the call is named `mint_to_public`,
`mint_to_private` or `mint_to_commitment`, has two arguments, and goes to a token in your list. It
reads the second argument as the amount, in that token's decimals. It does not check that the
contract still runs the code it ran when you added the token. A token contract can be upgraded; a
contract whose mint has the same name and argument count but a different meaning would show a wrong
amount. Default tokens already carry a pin on their contract's code (its "class"); tokens you add do
not.

**Options.**

- **A. Pin the class** (the issue's fix; recommended). When you add a token, the wallet records the
  class of its contract. When it builds a transaction, it records the class it sees for the called
  contract. A mint row shows its amount only when the two match. Limits:
  - The record is the class the wallet saw when it built the transaction, not proof of what ran.
  - The pin is trust on first use. A contract whose mint already meant something else when you added
    it keeps showing that amount.
  - A class restored from a backup file is checked for shape only. A forged backup can pin any class.
  - A token whose contract was upgraded after you added it shows its mint rows with no amount, the
    way an unlisted token's mint looks today.
  - Mint rows recorded before this change show no amount, and so do tokens added before it until they
    are added again (pre-production: developer installs only).
- **B. Keep today's rule.** The wallet already trusts a token in your list to report its own balance
  and symbol; it trusts its mint the same way. #105 closes as not planned.
- **C. Pin the mint's signature only.** A mint row shows its amount only when the called function has
  the standard token's exact parameter types (address, then a 128-bit amount), not just its name and
  argument count. The wallet has no stored signature for `mint_to_commitment`; C either adds it or
  stops showing amounts for that method. Mint rows recorded before this change show no amount. An
  upgraded contract that keeps the standard signature still shows its amount.

**Recommendation.** A. It closes the case the issue names (an implementation that changed), it hides
an amount only for a contract that did change, and it matches how default tokens are already pinned.
B is defensible if the owner treats a listed token as trusted for everything. C is cheaper but does
not cover an upgrade.

**What ships now.** Nothing of #105. Mint rows behave as today and the issue stays open. Arc 3 of the
plan builds the chosen option.

## OA-2. #136, beyond P8-02: other raw text under Submit in the New token popup

**Surface.** The line under Submit in the New token popup, opened from Home's empty token list
("Tap to import your first token") and from Send's token card when no token is chosen; after page 8,
also from the Holdings search row (P8-01).

**Situation.** P8-02 covers the PXE store's refusals (a reopen, a stalled open). The same line also
shows other errors' raw text, for example `network deleted` (the network was removed during the add),
`profile 1a2b3c4d deleted`, or the node's own message when the address is not a contract it knows.
P8-02 does not say what those read.

**Options.**

- **A. One generic line for every error that has no approved copy.** Each reads "Something went
  wrong. Try again." (P8-02's words). The existing "Couldn't auto-detect this token's interface…" and
  "Account is still loading…" lines stay.
- **B. Keep the raw text for every other error** (today).
- **C. Write copy per error.** Needs the owner's words for each; nothing is built until then.

**Recommendation.** A. It follows P8-02's rule to its end: developer wording never reaches the
person, and the two lines that already have copy keep it.

**What ships now.** Only P8-02 (after page 8 is signed); every other error keeps its raw text, as
today.

## OA-3. Arc 1: three effects a person could notice on a race path

**Surface.** Home's balance hero and token list, the New token popup's Submit, and Home's pinned
tokens after a restore. Nothing changes in normal operation; each effect needs a race.

**Situation.** Arc 1 fixes three races. Each fix restores what the code already intends, and each
shows only when its race happens:

| Issue | Today, on the race | After Arc 1 |
|---|---|---|
| #206 | A late "token added" event for a token already on Home holds the balance hero's loading skeleton until its 12-second cap | The hero leaves the skeleton when that token's balance settles. The figure is the same either way |
| #94 | After a token add held the wallet's token lock for five minutes (a slow lookup behind a long proof), the add writes at once: it can overwrite a token added meanwhile, add the same token twice, delete another token's row after a network was removed and replaced, or list again, until the list reloads, a token the person deleted while it waited | The add waits for the current holder, then writes. A token added meanwhile keeps its row and balance, no token appears twice, and a token the person deleted stays off the list. One add that succeeds today fails: one that races the deletion of its network reports success today, for a token the deletion already removed, and shows today's "network deleted" error under Submit after. And only when the wallet's five-minute lock timer runs out while one of them waits on storage, a token restore, deletion or profile deletion that lost the lock fails with a new raw message, `token lock lost` (on that restored row, as the deletion's error, or as a profile deletion that stops and finishes on the next background start), instead of overwriting or deleting another token's row. A restored token whose network was deleted during that wait stays, and shows again if a network for its chain is added back |
| #93 | A restored or re-imported profile whose id was used before can open with the old profile's pinned tokens, if a page wrote a pin back while that profile was being deleted | It opens with no pinned tokens left from before, which is what every restore already shows otherwise (pins are not in backups). A page still showing the deleted profile can pin again after the restore; that stays |

**Options.**

- **A. Merge Arc 1 with all three** (recommended).
- **B. Merge Arc 1 without the effects the owner strikes.** Each struck phase leaves the PR and its
  issue stays open.
- **C. Merge none of it.** #206, #94 and #93 stay open.

**Recommendation.** A. In normal operation none changes a screen. On its race, each removes a wrong
state: a held skeleton, a lost, doubled or ghost token row, or a stale pin.

**What ships now.** Nothing of Arc 1 merges. It is built and its PR opens, and it waits for this
answer.

## OA-4. #136: does "debug log only" also lower the background's log lines?

**Surface.** The wallet's log viewer and its CSV export (Settings → Developer → Logs), which a person
attaches to a bug report.

**Situation.** P8-02 says the raw developer text "goes to the debug log only". The popup will show
the generic line and log nothing of its own. But the background already records each store refusal
when it happens: at `error` for the failed operation and, for a version mismatch, also at `warn`.
Both levels are captured for every user with every setting off. The lines carry the operation, its
duration and the refusal (the store's directory, or the stored and current rollup address and schema
version); no balance, key or account address.

**Options.**

- **A. Keep the background's levels** (recommended). The person never sees the raw text; a bug report
  still carries the failure that explains it.
- **B. Lower those lines to `debug`.** Nothing reaches a log unless debug mode is on; a bug report from
  a default install loses the store failure.

**Recommendation.** A. P8-02's concern is what the person reads under Submit, which the popup fixes;
the background's lines are the evidence a bug report needs.

**What ships now.** No log level changes.
