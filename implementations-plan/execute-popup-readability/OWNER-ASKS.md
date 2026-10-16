# Owner asks: execute-popup-readability

One call in two parts, for one decision page. It changes what a person sees on the screen that authorizes a transaction, so nothing visible is built before the answer. The recommendation is the planner's own. The panel (Codex and Opus) checked that each option is drawn fairly and what each risks; it did not pick. "As is" is always an answer.

## R1. How the approval window reads a transaction with several calls and authorizations (#508)

**Surface:** the dApp approval window ("execute"), the body of a transaction card: from under "From account:" down to the line above the fee block. Everything else on the window is unchanged in every option: the account strip, the app block ("wants to execute the following"), the scope banner, "Requested operations" with its JSON icon, the card title ("Send tx") and "From account:", the fee block (#503 owns it), Reject and Confirm. The single-authorization card a dApp's `createAuthWit` opens, and the read-only cards, are also unchanged.

### The example every mockup draws

One transaction from the account **Main**: three calls, and the two authorizations the wallet finds while it estimates the fee. Addresses are shortened as the window shortens them.

| # | What | Contract | Today's reading |
|---|---|---|---|
| call 1 | `exit_to_l1(token, amount, recipient, authwit_nonce)` on the app's Hub; `recipient` is an Ethereum address | `0x1b5c09..3d4e` | decoded from the interface the app registered: 4 named values, amount `25000000` with no unit (Hub is no token) |
| call 2 | `transfer_private_to_private(Main, 0x5e6f12..7a8b, 100000, 0)` | USDC, a token Main added: `0x2f4e81..77a0` | the wallet's own reading: 0.1 USDC |
| call 3 | `checkpoint`, 2 arguments | unknown: `0x2c3d4e..4e5f` | unreadable: the wallet has no interface for it |
| auth 1 | Hub may call USDC `transfer_private_to_public(Main, Hub, 25000000, nonce)` | consumer USDC | the wallet's own reading: 25 USDC leaves Main for Hub |
| auth 2 | Hub may call `withdraw_for(Main, 1000)` on a Vault | consumer `0x3d9a17..5f6a` | decoded from the interface the app registered |

The point the example makes: **today the 25 USDC that leaves the account is visible only behind the first authorization's "Show details"**. The call that causes it (call 1) shows `25000000` with no unit, and nothing at rest tells the person which part moves value.

### Rules every option keeps

1. Every fact the window shows today stays reachable, at most two presses away.
2. No authorization is ever hidden: at rest each shows who it lets act and what it lets them do.
3. A call the wallet cannot read keeps today's warning and notice on screen at rest.
4. Only the wallet's own reading states an amount and a recipient as fact: a transfer or mint on a token the person added, checked against the function's selector and parameter names. A function or parameter name the app supplied is shown as the app's, never as the wallet's claim.
5. Call order is kept: calls run in that order.
6. No new glossary term, no new tooltip, no change to when Confirm is enabled.

**What none of this proves.** The wallet's reading checks a function's name, selector and parameter names on a token the person added; it does not prove what that contract's code does. A name the app supplied passes the wallet's character filter (control and direction marks removed) but can still claim anything in readable letters. Every option keeps each contract's address on screen beside its name.

### Shared line wording (used by options A, B, C and E)

- Wallet-read transfer: "{amount} {unit} from {sender} to {recipient}". {unit} is the token's symbol, or "base units" when the symbol is empty. {sender} is "this account", an address, or an own account or contact name, as today's From row reads. With no sender (an app-paid entry point): "{amount} {unit} to {recipient}. Caller: none".
- Wallet-read mint: "{amount} {unit} to {recipient}".
- An app's decoded call: "Named by the app".
- A call still being read: "Reading arguments…" (today's words).
- Token authorization: "Lets {caller} move {amount} {unit} from {sender} to {recipient}".
- Any other authorization: "Lets {caller} call it" (beside its title), or "Lets {caller} call {function} on {consumer}" (in a summary list).

### Type roles and colours (both themes)

Each mockup is one layout for both themes; only the colour values change. Every element uses an existing role and token.

| Key | Element | Role | Token | Dark | Light |
|---|---|---|---|---|---|
| T | card and row titles | `row-title` | `--txt-primary` | #f5f0e6 | rgba(0,0,0,.88) |
| S | section labels ("ACTIONS 3") | `label-section` | `--nulo-secondary` | #999187 | #6b655c |
| L | field labels ("FROM:"), toggles ("› SHOW DETAILS") | `label` | `--txt-secondary` | #999187 | rgba(0,0,0,.60) |
| D | addresses, amounts, function names | `data` (mono) | `--txt-primary` | #f5f0e6 | rgba(0,0,0,.88) |
| N | an own account or contact name ("Main") | `name` | `--txt-primary` | as D | as D |
| C | "on 0x…" beside a title; "Named by the app" | `caption` | `--txt-secondary` | #999187 | rgba(0,0,0,.60) |
| B | sentences | `body` | `--txt-primary`; the notice `--txt-tertiary` | #f5f0e6; rgba(245,240,230,.56) | rgba(0,0,0,.88); rgba(0,0,0,.56) |
| W | warning line and icon | `body` | `--orange` | #ff5500 | #ff5500 |
| R | card border, row dividers | 1 px | `--nulo-border` | #231f1c | #d8d4cc |
| X | tabs (option E only) | `segment` | `--txt-secondary`, active `--txt-primary` over a 2 px `--nulo-accent` underline | accent #f8f1e7 | accent #a8480c |

The window background is `--app-bg` (#0a0908 dark, #f5f5f7 light). The warning keeps today's colour in both themes, so its contrast is today's.

### Today

```
 Send tx                                       T
 FROM ACCOUNT:           Main (0x0a1b2c..9c2d)  L N D
 PAYLOAD                                        L
 Exit To L1                on 0x1b5c09..3d4e    D C
 TOKEN:                       0x2f4e81..77a0    L D
 AMOUNT:                            25000000
 RECIPIENT:                   0x7c41d2..e9f0
 AUTHWIT_NONCE:           0x2f9e41c7..7c1b08
 ─────────────────────────────────────────────  R
 Transfer (private)        on 0x2f4e81..77a0
 FROM:                                  Main    L N
 TO:                          0x5e6f12..7a8b
 AMOUNT:                            0.1 USDC
 ─────────────────────────────────────────────
 Checkpoint                on 0x2c3d4e..4e5f
 ⚠ Can't read the arguments                     W
 Nulo doesn't have this contract's interface,   B
 so it can't read the arguments. Check what
 the app says this does before approving.
 › SHOW 2 RAW VALUES                            L
 AUTHORIZATIONS THE WALLET WILL SIGN (FOUND     L
 DURING ESTIMATION)
 CONSUMER:                    0x2f4e81..77a0
 AUTHORIZES:                  0x1b5c09..3d4e
 FUNCTION:                Transfer to public
 › SHOW DETAILS
 CONSUMER:                    0x3d9a17..5f6a
 AUTHORIZES:                  0x1b5c09..3d4e
 FUNCTION:                      Withdraw For
 › SHOW DETAILS
 ═════════ fee block (unchanged) ═════════════
```

About 30 lines at rest. Tab stops in the body: "Show 2 raw values", then each "Show details".

### Option A. A summary first, everything else under one "Show all details"

New strings: section labels "What this does" and "Authorizations" (with the count); the shared lines; toggle "Show all details" / "Hide all details".

```
 Send tx
 FROM ACCOUNT:           Main (0x0a1b2c..9c2d)
 WHAT THIS DOES                                 S
 1  Exit To L1 on 0x1b5c09..3d4e. Named by the  B D
    app.
 2  Transfer (private) on 0x2f4e81..77a0:
    0.1 USDC from Main to 0x5e6f12..7a8b
 3  Checkpoint on 0x2c3d4e..4e5f
    ⚠ Can't read the arguments                  W
    Nulo doesn't have this contract's
    interface, so it can't read the arguments.
    Check what the app says this does before
    approving.
 AUTHORIZATIONS 2                               S
 •  Lets 0x1b5c09..3d4e move 25 USDC from Main
    to 0x1b5c09..3d4e
 •  Lets 0x1b5c09..3d4e call Withdraw For on
    0x3d9a17..5f6a
 › SHOW ALL DETAILS                             L
 ═════════ fee block (unchanged) ═════════════
```

- **Hidden at rest:** every value row and the raw values. One press on "Show all details" opens today's body below the summary, with each authorization's details already open, so a raw value stays within two presses.
- **Reading order:** title, From account, "What this does", items 1 to 3, "Authorizations, 2", two lines, the "Show all details" button (`aria-expanded`), then the opened body. One Tab stop at rest; today's three once open.
- **Cost:** once opened, every call and authorization appears twice, in the summary and in the body.

### Option B. Today's rows, with sections, call numbers and the authorization lines added; nothing moves behind a press

New strings: section labels "Actions" and "Authorizations" (with the count); a header "{n} · ON {contract}" per call ("{n} to {m} · ON {contract}" when consecutive calls share it); each authorization's title gains "on {consumer}" and the shared line, replacing its "Consumer:", "Authorizes:" and "Function:" rows.

```
 Send tx
 FROM ACCOUNT:           Main (0x0a1b2c..9c2d)
 ACTIONS 3                                      S
 1 · ON 0x1b5c09..3d4e                          L D
   Exit To L1                                   D
   TOKEN:                     0x2f4e81..77a0
   AMOUNT:                          25000000
   RECIPIENT:                 0x7c41d2..e9f0
   AUTHWIT_NONCE:         0x2f9e41c7..7c1b08
 2 · ON 0x2f4e81..77a0
   Transfer (private)
   FROM:                                Main
   TO:                        0x5e6f12..7a8b
   AMOUNT:                          0.1 USDC
 3 · ON 0x2c3d4e..4e5f
   Checkpoint
   ⚠ Can't read the arguments                   W
   Nulo doesn't have this contract's interface,
   so it can't read the arguments. Check what
   the app says this does before approving.
   › SHOW 2 RAW VALUES
 AUTHORIZATIONS 2                               S
   Transfer to public      on 0x2f4e81..77a0    D C
   Lets 0x1b5c09..3d4e move 25 USDC from Main   B D
   to 0x1b5c09..3d4e
   › SHOW DETAILS
   Withdraw For            on 0x3d9a17..5f6a
   Lets 0x1b5c09..3d4e call it
   › SHOW DETAILS
 ═════════ fee block (unchanged) ═════════════
```

- **Hidden at rest:** what today hides (raw values, each authorization's values and inner hash), nothing more.
- **Reading order:** as today, with the section labels and call headers read first in each block. Tab stops as today.
- **Cost:** about as long as today. Grouping shortens only when a dApp sends consecutive calls to one contract (the playground's three-transfer multicall reads as one header); here every call has its own contract.

### Option C. One row per call and per authorization, each opening on its own (recommended)

New strings: section labels "Actions" and "Authorizations" (with the count); each row keeps today's title line ("{name} on {contract}", now also for authorizations) and the shared line under it; a per-row toggle "Show details" / "Hide details" (today's words). An unreadable call shows today's warning and notice at rest, with today's raw-values toggle; a row whose decode has not landed shows "Reading arguments…".

```
 Send tx
 FROM ACCOUNT:           Main (0x0a1b2c..9c2d)
 ACTIONS 3                                      S
 Exit To L1                on 0x1b5c09..3d4e    D C
 Named by the app                               C
 › SHOW DETAILS                                 L
 ─────────────────────────────────────────────  R
 Transfer (private)        on 0x2f4e81..77a0
 0.1 USDC from Main to 0x5e6f12..7a8b           D N
 › SHOW DETAILS
 ─────────────────────────────────────────────
 Checkpoint                on 0x2c3d4e..4e5f
 ⚠ Can't read the arguments                     W
 Nulo doesn't have this contract's interface,   B
 so it can't read the arguments. Check what
 the app says this does before approving.
 › SHOW 2 RAW VALUES
 AUTHORIZATIONS 2                               S
 Transfer to public        on 0x2f4e81..77a0
 Lets 0x1b5c09..3d4e move 25 USDC from Main to  B D
 0x1b5c09..3d4e
 › SHOW DETAILS
 ─────────────────────────────────────────────
 Withdraw For              on 0x3d9a17..5f6a
 Lets 0x1b5c09..3d4e call it                    B D
 › SHOW DETAILS
 ═════════ fee block (unchanged) ═════════════
```

- **Hidden at rest:** a decoded call's named values (call 1's four); a wallet-read transfer's From, To and Amount rows, which its line states; each authorization's values and inner hash (closed today too). Each is one press on its own row.
- **Reading order:** title, From account, "Actions, 3", then per row: title, contract, line, its "Show details" button (`aria-expanded`, described by the row's title so a screen reader hears which row); then "Authorizations, 2", the same per row. Tab stops: one per row toggle plus the raw-values toggle: five here (today three).
- **Cost, stated in full:** every value of a call the wallet reads only through the app's interface is one press away. That includes value movements: a burn or a commitment transfer on a token the person added, and any transfer on a token the person has not added (the playground's own send is one). Today those amounts are on screen at rest. The row still shows the function's name and contract, marked "Named by the app"; part 2 below keeps the wallet's own labels off such rows. If nothing on screen today may move behind a press, B is the option.

### Option D. Today's layout, each value block cut to two rows with "Show more"

New strings: "Show {n} more" / "Show less" under a value block longer than two rows. The unreadable call's warning and notice are never cut.

```
 PAYLOAD
 Exit To L1                on 0x1b5c09..3d4e
 TOKEN:                       0x2f4e81..77a0
 AMOUNT:                            25000000
 › SHOW 2 MORE
 ─────────────────────────────────────────────
 Transfer (private)        on 0x2f4e81..77a0
 FROM:                                  Main
 TO:                          0x5e6f12..7a8b
 › SHOW 1 MORE                  ← the amount is the row cut
 ─────────────────────────────────────────────
 (call 3 and the authorizations exactly as today)
```

- **Hidden at rest:** whatever falls past the cut, chosen by position, not by importance; here the transfer's amount.
- **Reading order:** as today, plus one button per cut block. Five Tab stops here.
- **Cost:** a few lines shorter, no structure added, and the cut can hide the one row that matters. The planner advises against it.

### Option E. Two tabs: "What it does" and "Technical"

New strings: tabs "What it does" and "Technical". "What it does" holds option A's summary (its items, its unreadable-call warning and notice, its authorization lines); "Technical" holds today's body, with each authorization's details already open (as in A). The fee block sits under both.

```
 Send tx
 FROM ACCOUNT:           Main (0x0a1b2c..9c2d)
 WHAT IT DOES    TECHNICAL                      X
 ‾‾‾‾‾‾‾‾‾‾‾‾
 (option A's items 1 to 3 and its two authorization lines)
 ═════════ fee block (unchanged) ═════════════
```

- **Hidden at rest:** the whole "Technical" tab.
- **Reading order:** title, From account, a tab list (one Tab stop; ← and → switch tabs), then the open panel. Inside "Technical", today's three stops.
- **Cost:** the summary and the values are never on screen together; it needs a tab control the wallet does not have in a reusable form (today's one is fixed to Password/Passkey).

### As is

Nothing changes.

### Part 2 (with any of A to E): the wallet's transfer and mint labels only on rows the wallet read

Today a call named `transfer_public_to_public` is titled "Transfer (public)", the wallet's own label, on any contract, even one the person never added as a token, whose values the wallet has not read as a transfer.

- **Yes:** in the transaction body and its authorizations, the six labels "Transfer (private)", "Transfer (public)", "Transfer to public", "Transfer to private", "Mint (private)" and "Mint (public)" name only a row the wallet read as that transfer or mint; any other row shows the function's own name ("Transfer Public To Public"). Every other label ("Claim Fee Juice", "Shield", "Unshield", "Redeem shield") and every other card, the `createAuthWit` card included, stays as today. The example above does not change (both its transfers are wallet-read).
- **No:** titles stay as today.
- **Planner's recommendation: Yes**, with any option; with C it matters most, since C closes such rows.

### Planner's recommendation: C, with part 2 Yes

- At a glance it says what each call is (its title and contract), what the wallet reads as moving value (its own lines: "0.1 USDC from Main to …", "Lets 0x1b5c09..3d4e move 25 USDC …"), and what grants permission (its own section).
- Each fact lives in one place. A repeats every item once opened; E never shows the summary and the values together; D cuts by position.
- The rows the wallet cannot vouch for are marked: an unreadable call stays open, an app's decoded call says "Named by the app", and every authorization's line is always on screen.
- It reuses the window's own "Show details" toggle and keeps every test hook, so the change stays inside the card body.
- Its cost is real (see C's Cost). An owner who wants nothing on screen today to move behind a press should pick B, which keeps today's rows and adds the sections and the authorization lines.

### What ships now

Until R1 is answered nothing visible ships. If the answer is "As is" (and part 2 No), the lane ships nothing and #508 is closed by the owner's call. The test-only phase (a shared wire-shaped fixture and a check that every fact stays reachable) changes no pixel and lands inside the same PR as the signed option.

## R3 (non-blocking). Part 2 on the grant-authorization card

**Surface:** the execute window's `send_transaction` card, which a dApp's `grantPublicAuthwit` opens (its "Payload:" rows, `OperationActionRow.vue`). R1 part 2 was drawn for the transaction body and its authorizations and kept "every other card" as today, so this card still titles a call with the wallet's transfer and mint labels on any contract, read or not.

- **Yes:** the same rule there: "Transfer (public)" and the other five only on a call the wallet read as that transfer or mint (this card has no reading yet, so every such row would show its own name, "Transfer In Public").
- **No:** as today.
- **Recommendation:** Yes, for one rule across the window; it is a later, small change, and nothing in the shipped arc depends on it.
