---
plan: consent-display-2
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at f55b7b4e6
trunk: dev
issues: "#975 (the class lookup row, closed by arc 2)"
post_implementation_hardening: not scheduled
---

# consent-display-2: four consent surfaces say what the wallet already knows

Two arcs, each one PR against `dev`, not stacked (the orchestrator's D-orch-1). **Arc 1** (`consent-display-2-a1`)
changes three windows: the capability window names or counts what each grant reaches, and its Details table
gains three columns (P77-01 B); the execute window says the person pays when the fee goes through the
PrivateFPC (P77-04 B); the token-add approval warns about a token the signed list flags and asks for a tick
before Confirm (P77-05 B). **Arc 2** (`consent-display-2-a2`, started only after PR #964 is on `dev`) changes
Delete Profile, the forgot-password popup and delete chain so they name imported accounts (P77-07 D, with
P78-04 A and P78-05 B settling OA-1 and OA-2), makes the capability window's class lookup row name both answers
and flags a lookup of every class (P78-09 B, #975), and carries the close-out. Every surface is the owner's pick;
nothing else on these screens changes. Recon:
[recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The brief's claims against the tree

- **Capability window.** Holds: no row names or counts its contracts (`permission-rows.ts:134,186,214`), the
  metadata-only row is never flagged (`:129-137`), events start On for any list (`:258-260`), Details collects only
  simulate, add and transact (`details-table.ts:49-57`).
- **Execute window, PrivateFPC.** Holds: the card draws the same green check and "payment method set by" for the
  PrivateFPC as for any app fee contract (`OperationCard.vue:383-415`). **Added:** the probe line reads the
  PrivateFPC's own public pool, not the person's Private Fee Juice, and its `provenShort` also holds Confirm
  (`index.vue:198-202`); this lane changes only what the card says (D8).
- **Token-add approval.** Holds: no flag read on that card or in its window (`OperationCard.vue:467-501`,
  `index.vue:100-102`). **Added:** the popup's only channel to the signed list is the price snapshot
  (`price/spec.ts:46-55`), and `usePrices` marks a token unflagged until that snapshot arrives (`usePrices.ts:119-120`).
- **Arc 2 surfaces.** Hold as written (recon § Facts): the reset sentence (`reset.vue:168-170`), the popup with no
  imported-account line (`ForgotPasswordPopup.vue:34-36`), delete chain naming only a paused reset's accounts
  (`networks/[id].vue:147-187`).

## Outcome & Quality Bar

- **For whom:** a person reading an approval window a dApp opened, or deleting a profile or chain, who must decide
  from what the screen says.
- **Excellent:** (1) every capability row and Details row states its reach from the request the dispatcher parsed
  and the names the wallet vouches for, and never reads narrower than the grant; (2) a payload that names the
  PrivateFPC as its fee payer never reads as the app's fee, in any estimate state (D7 states the residual); (3) a flagged token cannot be confirmed with a
  click that lands before the warning or before the tick, by mouse or keyboard; (4) a deletion warning names the
  imported accounts it removes and never says they are lost for good.
- **Good enough:** placeholder words may be tightened within a sentence; states no picture shows reuse words the
  screens already carry (D3, D6, D8).

## UI impact

- **Capability window** (popup window, 400×800). P77-01 B: "A, plus the any-contract details row flagged like
  "Add any contract", and private events Off by default for contracts the app has no call scope on." (A: "Each row
  names or counts the contracts it lists, and Details gains details, events and code columns.") Before:
  `p77-cap-today`, `p77-cap-details-today`. After: `p77-cap-b`, `p77-cap-a-details`. Rows read "Every transaction,
  on 1 contract", "See private events from 2 contracts", "See details of any contract in your wallet" (orange icon,
  "ANY CONTRACT" chip), "Look up the code of 1 contract class on Testnet"; the events switch starts Off with "Not
  shared. The app may ask again later." when an events contract is outside the call scope; Details gains three
  icon-headed columns, a "Contract classes" section and the "Any contract" row.
- **Execute window, PrivateFPC fee.** P77-04 B: "No green check; "You pay about X from Private Fee Juice; method set
  by <app>"; a neutral funding notice." Before `p77-fpc-today`, after `p77-fpc-b`: no check, "You pay about ~X FJ
  from Private Fee Juice", "method set by <app>" under it, and an info-marked "Your Private Fee Juice must cover
  this fee." Every other app fee contract keeps today's card.
- **Token-add approval, flagged token.** P77-05 B: "A, plus an acknowledgement the person ticks before Confirm." (A:
  "The flagged banner on the approval card.") Before `p77-addtoken-today`, after `p77-addtoken-b`: the token page's
  banner above Symbol, an unticked "I understand Nulo flagged this token as a scam" under the address, Confirm
  disabled until ticked. A listed or unknown token's card is unchanged.
- **Arc 2: Delete Profile, forgot password, delete chain.** P77-07 D: "C, plus delete chain names the live imported
  accounts." (C: "B, plus the forgot-password popup warns imported accounts are lost."; B: "A, plus name the
  imported accounts and offer Export first while unlocked."; A: "Qualify the sentence to accounts derived from the
  phrase.") Pictures `p77-delete-a`, `p77-delete-b`, `p77-delete-b-bottom`, `p77-forgot-c`, `p77-delete-chain-d`.
  P78-04 A: "The popup line shows for every profile; Delete Profile lists imported accounts only once unlocked."
  P78-05 B: "The full backup page; while a reset is pending, the account export page instead." Locked, Delete
  Profile shows the qualified sentence and no section; the popup line shows on every profile.
- **Arc 2: capability window, class lookup row.** P78-09 B: "A, plus a sub-line naming both answers, for example
  "Whether it is on chain, and whether this wallet holds its code.", the any-class chip and flag for a request
  naming every class, and a contract-classes column in Details." Before `p78-class-a`, after `p78-class-b` and
  `p78-class-anyclass-b`: the sub-line becomes the one-line "Whether it is on chain, and if this wallet has its
  code." (the example wraps at 400 px; OA-3), and `"*"` draws the orange icon and the "ANY CLASS" chip as "Add any
  contract" does. Details already has the class section and code column (#981), so it is unchanged.
- The pictures live outside the repository; each PR body shows light and dark screenshots of the built surfaces.

## Architecture & Implementation

**Capability rows (arc 1).** `permission-rows.ts` gains `reachOf(list, names)`: the listed contracts keyed as
`details-table.ts` keys them (`fieldAddressKey`, else lower case); one key the wallet names gives that name,
otherwise "1 contract" / "N contracts". `transactionRow(cap, names)` reads "Every transaction, on {reach}" for a
listed scope, unchanged for any contract. `contractsRow(cap, names)`'s metadata branch reads "See details of any
contract in your wallet", flagged with the `ANY_CONTRACT` chip, for `"*"`, else "See details of {reach} in your
wallet". `privateEventsRow(contracts, names)` reads "See private events from {reach}" for a list.
`contractClassesRow(networkName, classes)` reads "Look up the code of N contract class(es) on {network}" for a list
and today's title for `"*"` (classes have no names). `privateEventsDefault(contracts, resulting)` is On only when
the list is not `"*"` and every listed contract is inside the call scope of `resulting`: a `transaction` scope or a
`simulation.transactions` scope that is `"*"`, holds a well-formed pattern on contract `"*"`, or names the contract
(`sameFieldAddress`). Utility scopes never count; an entry that is not a field address, or a scope that is neither
`"*"` nor an array of `{ contract, function }` strings, counts as outside, so the default fails Off (projection
refuses such scopes today, `capability-negotiation.ts:162`). `build-items.ts`: params gain
`knownContracts`; `plainRows`, `heldEntries` and `newDataRows` pass the names, `newDataRows` passes `resulting`.
`index.vue`'s `windowParams` adds `knownContracts: params.knownContracts ?? []`. The add and simulation rows keep
their titles (outside the brief's four rows); `isBroadRequest` is unchanged.

**Details table (arc 1).** `DetailsRow` gains `details`, `events`, `code` (booleans); `DetailsTable` gains
`classes: DetailsRow[]` (keyed like contracts, `address` holding the class id). `collect` marks `details` for every
`contracts` grant with `canGetMetadata` (with or without `canRegister`), `events` for `data.privateEvents`,
and `code` on a class row per listed id of a `contractClasses` grant with `canGetMetadata`; `"*"` in any of the
three marks the "Any contract" row. The label counts contract rows ("any contract" when that row exists); with no
contract row it counts classes ("1 contract class"). `DetailsTable.vue`: the head draws the six rows' own glyphs
(`play`, `add`, `check`, `info`, `mail-lock`, `code`), aria-hidden, in the head's `--nulo-secondary` (never
`--nulo-outline`, whose uses `a11y-css.test.ts` pins); grid `minmax(0, 1fr) repeat(6, 26px) 14px`
(the mockup's geometry); a "Contract classes" section after "Nulo doesn't know" with id, copy button and chevron;
`spokenName` lists the column words (simulate, add, transact, details, events, code) and calls a class row
"Contract class {id}"; class rows reuse `cap-details-row` and `cap-details-copy`, keyed `classes-N`. `collect`
splits into one collector per capability type to stay inside the complexity budget. Details keeps reading the
request over the held grants, switches aside (D15). `index.vue` shows Details when `classes` is non-empty too.

**PrivateFPC fee card (arc 1).** `fee-figure.ts` exports `paysFromPrivateFeeJuice(op)` (an `aztec_sendTx` whose
`exec.feePayer` is the PrivateFPC), and `personPaysAppPayment` reuses it. `AppFeeLine.vue` takes `privateFeeJuice`:
line one reads "You pay about {fee} from Private Fee Juice" (the skeleton while estimating), line two "method set by
{app}", followed by today's priority sentence ". Includes a … the app asked for." when there is one.
`OperationCard.vue` hides the green check, passes the prop, keeps the legend "Fee payment method set by {app}" for
a failed or previewed estimate, shows the notice "Your Private Fee Juice must cover this fee." (`info` glyph,
secondary, testid `execute-op-private-fee-notice`) in every state, and never the probe line for the PrivateFPC.

**Flagged token add (arc 1).** `execute/index.vue` owns a `PriceServiceClient` and `useTokenFlags` (the list half of
`usePrices.ts`, no price fetch): the client connects
in `connectServices`, and `disconnectServices` disconnects it, then calls `tokenFlags.dispose()` (CLAUDE.md's order). `flaggedAdds` = indices of `register_token` operations that
`tokenFlags.isFlagged({ chainId: op.network.chainId, contract: op.address })`; `acknowledged = ref(new Set<number>())`,
empty at every mount and never read from anywhere. One `tokenFlagHold` computed (a token add while `!prices.mapped`, or
a flagged add not ticked) joins `confirm-disabled` and the existing `payerShort || awaitsFeeFigure` return in
`approve()`, so no early return is added. `OperationCard.vue`
takes `tokenFlagged` and `tokenFlagAcknowledged`, emits `acknowledgeTokenFlag(index, on)`, and in the
`register_token` branch draws `FlaggedTokenBanner` after the account row and, after the address row, a design
`Checkbox` (`register-token-flag-ack`) reading "I understand Nulo flagged this token as a scam".

**Arc 2.** `reset.vue`: the sentence "You will be able to recover the accounts derived from your recovery phrase
later if you have saved it"; while unlocked, an "Imported accounts" section after "Profile to delete" listing each
imported account of the profile on every chain (name, trimmed address) with "Your recovery phrase can't bring these
back." and an "Export first" button: the full backup page, or while a reset is pending the account export page on a
password profile and no button on a passkey one (P78-05 B, D16). The list (`imported-accounts.ts`) reads `managers.network.getNetworks()` then
`managers.account.getAccounts(profileId, chainId, true)` per chain, filtered `AccountType.Imported`, plus a paused
reset's `reset.heldImported` once `reset.purged` (`getPendingReset`, `getStaleNetwork`: imports a purge left only in the
journal; before the purge the live rows are those accounts, at their old addresses),
merged by `(chainId, address)` (a held import keyed on its network's chain, which the rewrite moves before any row is recreated) so a recreated row is named once
and one address on two chains is named twice. `getNetworks` refuses while locked (`requireActiveProfile`);
`getAccounts` has no session check, so the page itself makes no read while locked, and no locked reader is built
(OA-1, P78-04 A). Unlocked, Delete stays disabled while the read runs and `handleReset` re-checks it; a failed read
is never "no imports": a press is refused with the page's existing "Couldn't delete profile. Try again" and the read
retried, as delete chain already refuses on an unknown hold (D17). The page re-reads on `onStaleNetworkChanged`. `ForgotPasswordPopup.vue` (shown only while locked)
adds, under its sentence, a warning glyph and "Accounts you imported are lost with this profile. The recovery
phrase can't bring them back." (OA-1).
`networks/[id].vue`: the confirmation appends `deleteChainImported(names, exportable)` with a paused reset's
`reset.imported` (which already merges live imports, `network-reset/service.ts:127,366`) when one is held, else the
chain's live imported accounts (hidden ones included, `getAccounts(…, true)`), read inside the delete's existing
`try` so a failed read keeps today's refusal; "Export it first." follows the reachable export page (D18).

**Class lookup row (arc 2).** `contractClassesRow` keeps its titles; its sub-line reads "Whether it is on chain, and
if this wallet has its code." for every request, and `"*"` sets `flagged` and the `ANY_CLASS` chip ("Any class"),
the treatment `contractsRow` gives "Add any contract". No other row and no Details code changes.

**Trade-offs not taken.** A worker-built display model (the competing outline: the dispatcher computes reach,
defaults and the token flag and ships them in the payload): one source, but a new wire contract in
`@nulo/wallet-bridge` for facts the window already derives from the same snapshot (D10). `usePrices` itself for the
flag read: its mount-time `refreshIfStale` would add a price fetch to every execute window, token adds included,
which Privacy Policy § 5.2 rules out for transaction execution (D10). Naming every known contract in a row: unbounded titles (D2).

## Decision ledger

| # | Question | Decision |
|---|---|---|
| D1 | Arcs | Two PRs on `dev`, no stack; arc 2 after #964; close-out rides arc 2 |
| D2 | Name or count | One listed contract the wallet names → its name; otherwise the count. The brief's rule, singular |
| D3 | `"*"` titles | Transaction and events keep today's "any contract" titles; details reads as pictured; classes keep "Look up contract code on {network}" |
| D4 | Call scope for the events default | `transaction` ∪ `simulation.transactions` over the resulting grants (`holdsCallScope`'s definition); utilities excluded; unreadable entries outside |
| D5 | Details columns | `details` for every metadata grant, add or not; classes `"*"` marks code on "Any contract" (the brief's "an 'Any contract' row") |
| D6 | Details label | Contracts counted, classes not; classes-only counts classes in the row's own words |
| D7 | Which fee card changes | `aztec_sendTx` with `exec.feePayer` the PrivateFPC, the popup's existing notion (`personPaysAppPayment`); the claim route and every other payer unchanged. Residual: a payload declaring another payer while one of its calls makes the PrivateFPC the kernel's payer reads as today's app card (the worker still treats it as the person's: `fee-reask.ts:37-52`); the popup sees the kernel payer only through the probe, so the clean fix carries it on the estimate, a contract change outside this lane: a known limit filed at close-out |
| D8 | Notice and probe line | The picture shows the notice on a send whose today frame has no probe line, so the notice shows in every state; the probe line never shows for the PrivateFPC; `provenShort` still holds Confirm, and then the notice names the cause: `pay_fee` deducts the max gas cost from the caller's credit and credit is minted only from claims into the pool, so a pool short of the fee limit means every credit is short of it (the installed `PrivateFPC` source) |
| D9 | Priority sentence | After "method set by {app}", as today's sentence orders them |
| D10 | Flag source | `useTokenFlags`, the list half `usePrices` already holds (`listState`, the network-free `getQuotes` read, the broadcasts): the token page's check on the same snapshot, and the flag read asks for no price fetch (Privacy Policy § 5.2) |
| D11 | List not yet read | A window with a token add stays unapprovable until the first price snapshot answers (it carries the list the worker loaded at start, `token-list/service.ts:112-116`), as it does for token details. A price service that answers neither read leaves Confirm off with Reject open: it needs a worker whose storage reads fail, a known limit filed at close-out |
| D12 | Tick state | Window-level `Set` of op indices, empty at mount, never persisted or restored |
| D13 | E2E | `cap-request-partial` asserts the new Off default and switches the other row; one added scenario, the flagged add in `register-token.test.ts`; no other new scenario |
| D14 | Accessibility (owner's 2026-10-19 delegation) | Details heads aria-hidden, the row targets speak the column words; the tick is the design `Checkbox` (Tab stop, Enter and Space), before the footer; glyphs aria-hidden |
| D15 | Details under a switch Off | Details reads the request over the held grants, as today, so it still ticks events while the events switch is Off: the approved B window takes A's Details picture (`p77-cap-a-details`, the lane brief) |
| D16 | Export first (P78-05 B) | No reset pending: the full backup page (every imported account on every network, both profile kinds). Pending: the account export page, which reaches journal-held imports, on a password profile; a passkey profile gets no button, since neither page serves it then |
| D17 | Delete while the list is unknown or stale | Held (disabled) while the read runs; a press reads the list again and goes only if it holds no account the page does not show, else it is refused with the existing toast and the page shows the fresh list (an import from another window); a failed read refuses the same way, so the page is never a dead end and never deletes on an unknown list. A read the lock or a newer read overtakes starts no account read (`getAccounts` answers while locked) and shows nothing. Delete chain's Confirm reads again and reopens the confirmation when its text changed; each press and Confirm takes a generation, so one a newer one or the lock overtook acts no further. Residual (known limit): an import that completes in another window in the milliseconds between the press-time check and the delete call is not named; closing it needs the worker to delete only on the set the page showed, a contract change |
| D18 | "Export it first." on delete chain | Live imports: said when an export page reaches them: no reset pending (full backup), or a password profile and a chain that is not stale (account export, once the chain is active); a paused reset of this chain keeps its own rule (`exportsHeld`). Delete Profile's "Export first" keeps the owner's target (P78-05 B) even when a second, quarantined chain's imports are reachable from neither page while a reset is pending: the button promises no particular account |
| D19 | Class row sub-line (P78-09 B) | One line at 400 px: "Whether it is on chain, and if this wallet has its code."; the owner signs the words from the screenshot (OA-3). `"*"` flagged with the "Any class" chip; Details unchanged (#981 lists classes) |
| D20 | Locked (P78-04 A) | The popup line on every profile; Delete Profile reads nothing while locked and shows no section; no locked reader exists |
| D21 | Arc 2 e2e | One added step, no new scenario: `type-roles.test.ts` imports a donor's account and sweeps Delete Profile, since the identifier inventory requires every smoke-owned address site to be observed in a real browser (the computed face and spacing, which no unit layer reads). The flows themselves are proven at the composition and component layers |

## Security & Adversarial Considerations

- **Threat model.** A hostile dApp shapes its request or its token to make a window read narrower than it is. Reach
  is counted from the projected request; two spellings of one address count once, an entry that is not an address
  counts apart (it can only overstate), and an unreadable scope reads as any contract (`isAnyContractScope`). Names
  come only from `knownContracts`, which the wallet fills and replaces on every dispatch; a dApp listing a
  wallet-known address is named by what it lists. The events default fails Off for any entry it cannot place.
- **The tick.** The flag keys on the operation's chain and contract, never on dApp strings; Confirm and
  `approve()` both refuse an unticked flagged add, so Enter cannot pass it; the tick is never seeded; the add
  grants nothing on chain. A list that flags a token mid-window re-disables Confirm.
- **Known limits (filed closed at close-out).** D7's residual: a payload that declares another payer while a
  call makes the PrivateFPC pay reads as today's app card; the figure is shown and the worker caps it. D11's: a
  price service that answers neither read keeps Confirm off with Reject open.
- **Network.** The flag read asks for no price fetch: Privacy Policy § 5.2 says "Transaction execution reads
  cached prices and never triggers a fetch", and a window test pins zero `refreshIfStale` calls on a token add. The
  execute window's fee children (`AppFeeLine`, `FeeSettingsCard`) and the fee window (`FeeRaisedCard`) already
  call `usePrices`, so they can refresh; that predates this plan and is reported as a follow-up.
- **Deletion lists (arc 2).** Names and addresses are read and shown only while unlocked; the locked popup and
  page read nothing (P78-04 A). A failed or pending read can never pass as "no imports", so a
  delete never proceeds on an unknown list (D17). A wildcard class lookup now reads as broad (D19).
- **Logging.** No new log line; nothing about flags, counts or names is logged.
- **Input validation, crypto, least privilege, supply chain.** No new input path, key, dependency or permission.

## Assumptions

**Facts:** recon § Facts. **Inferences:** I1 a `registerToken` call carries one operation (`dispatcher.ts:619-630`),
but the gates read every `register_token` operation; I2 the snapshot read answers before the token details in
practice, so D11's wait is not visible; it is timing, not a safety argument, and no gate rests on it. (A former
I3, that the enumeration answers while locked: `getAccounts` does, `getNetworks` throws through
`requireActiveProfile`; the page reads nothing while locked either way.) **Asks:** OA-1 and OA-2, answered by P78-04 A and
P78-05 B; OA-3 (the class row's one-line words) is signed from the screenshots. Arc 1 has none.

## Phases

### Arc 1 (branch `consent-display-2-a1`, from this plan's commit on `origin/dev`)

**✓ Phase 1 — capability rows and the events default.** Files: `permission-rows.ts`, `build-items.ts`, capability
`index.vue`; tests `permission-rows.test.ts`, `build-items.test.ts`, capability `index.test.ts`;
`tests/e2e/network/cap-request-partial.test.ts`. Tests: each row with one unknown, two, and one named contract;
the details `"*"` row flagged with its chip; classes counted and `"*"` unchanged; `privateEventsDefault` as one
`test.each` (Off: a contract outside, no call scope, a utilities-only scope, an unreadable entry, a malformed scope, `"*"`;
On: inside a transaction scope, a `simulation.transactions` scope, an any-contract call scope); a re-request whose held
transaction scope covers the events contract starts On; one wire-shaped window case (the picture's request) reads
the four titles and the Off line, and its grant omits `privateEvents`. `cap-request-partial` expects Off, switches
private events On and the address book Off, and expects `{ type: "data", privateEvents: { contracts: [token] } }`.
Gate: `bun run lint`, `bun run typecheck:all`, `bun run --cwd apps/extension test src/popup/windows/capabilities`
exit 0.

**✓ Phase 2 — the Details table.** Files: `details-table.ts`, `DetailsTable.vue`, `DetailsTable.stories.ts`,
capability `index.vue`; tests `details-table.test.ts`, `DetailsTable.test.ts`. Tests: the "feed no column" case
becomes one case per new column (details from a metadata grant, listed and `"*"`; events, listed and `"*"`;
code on a class row, and on "Any contract" for `"*"`); accounts and the address book still feed nothing; the label
counts contracts not classes, and classes alone; with the events switch Off the window's Details still ticks
events (D15); the head's six glyphs in order, aria-hidden; a class row under
"Contract classes" with its trimmed id and copy; a spoken name with the new words. Gate: lint, `typecheck:all`,
`bun run --cwd apps/extension test src/popup/windows/capabilities src/components/composite/capabilities`,
`bun run --cwd apps/extension build-storybook` exit 0.

**✓ Phase 3 — the PrivateFPC fee card.** Files: `fee-figure.ts`, `AppFeeLine.vue`, `OperationCard.vue`; tests
`fee-figure.test.ts`, `AppFeeLine.test.ts`, `OperationCard.fee.test.ts`. Tests (wire-shaped `aztec_sendTx`, payer
`PRIVATE_FPC_ADDRESS`): no check glyph, the two lines and the notice once landed; the estimating skeleton line;
the failed legend with the notice and no check; `funded: false` draws no probe line (never-happens), while a
third-party FPC with `funded: false` draws the check and the probe line (control); the priority sentence follows
line two; `paysFromPrivateFeeJuice` true only for the PrivateFPC payer (not a third-party FPC, not a claim).
Gate: lint, `typecheck:all`, `bun run --cwd apps/extension test src/popup/windows/execute src/popup/components/modules/send` exit 0.

**✓ Phase 4 — the flagged token add.** Files: execute `index.vue`, `OperationCard.vue`; tests `OperationCard.test.ts`,
execute `index.test.ts`; `tests/e2e/network/register-token.test.ts`, `tests/e2e/fixtures/token-list.ts` (a
`flagged` option on `signTestList`), and whatever `fixtures/extension.ts` plumbing a network launch needs to serve
a list (the session source key plus `requestListRefresh`, as `token-list.test.ts` does). Tests: a flagged card draws the banner and an unticked tick that emits; an
unflagged card draws neither (control); in the window (wire-shaped `0x`+64-hex token, a fake price client whose
snapshot flags it): Confirm stays disabled and a direct `approve()` sends nothing before the tick, then both work;
an unflagged add confirms with no tick (control); before the snapshot answers Confirm is disabled, and it enables
once the snapshot lands (pair); an unflagged window that a broadcast then flags re-disables Confirm and refuses
`approve()` until the tick; a remount starts unticked. E2E: the happy path also asserts no banner and no tick; a new
flagged case (a served list flags the sandbox token: banner, Confirm disabled, the tick reached by Tab and set by
Space, which sends nothing, then approve and the token added). It proves the gate on a real window fed by the
worker's held list and the keyboard path, which no component test reaches; estimate 60 s per browser. Gate: lint, `typecheck:all`,
`bun run --cwd apps/extension test src/popup/windows/execute` exit 0.

**✓ Phase 5 — e2e, screenshots, full gates.** Run, each at retry 0, on Chrome then Firefox
(`NULO_E2E_BROWSER=firefox`): `cd <worktree> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run
e2e:agent tests/e2e/network/{cap-request-partial,data-privateEvents,cap-window,cap-request-rerequest,register-token,fee-sponsor-funding,type-roles-windows,selfpay-phase}.test.ts`.
Measure each browser's wall-clock for the two changed files (`register-token`, `cap-request-partial`) on
`origin/dev` and on the arc's head, the same selection, suite time apart from the build.
`cap-window`'s S2 pin (12 px) must hold; a changed value is a measured layout change, re-pinned with the reason.
Screenshots: a scratch spec outside the repo (adapted from the pictures' spec) shoots the capability window
(rows and Details open), the PrivateFPC card and the flagged add (unticked, Confirm disabled), light and dark,
into `implementations-plan/consent-display-2/screenshots/`. No smoke spec opens these windows; since `fixtures/token-list.ts`
changes, the smoke specs that import it (`token-list.test.ts`, `rows.test.ts`) run on both browsers too
(`cd apps/extension && bun run test:e2e -- <file> --retry=0`, `NULO_E2E_BROWSER=firefox` for the twin). Gate: `bun run audit:vue`, `bun run test:all` exit 0; every listed e2e green on both browsers;
each screenshot matches its approved picture in all but placeholder words, or an OWNER-ASKS entry and a draft PR.

### Arc 2 (branch `consent-display-2-a2`, off `origin/dev` after #964 and arc 1 merge)

The export pages as #964 left them hold OA-2's options as written. OA-1 and OA-2 were answered before phase 6
(P78-04 A, P78-05 B), so the PR opens ready.

**✓ Phase 6 — Delete Profile and the forgot-password popup.** Files: `reset.vue`, a new `imported-accounts.ts`,
`ForgotPasswordPopup.vue`; tests `imported-accounts.test.ts`, `reset.test.ts`, a new `ForgotPasswordPopup.test.ts`,
a composition case in `network-reset/service.composition.test.ts`. Tests: the derived-accounts sentence; the list
across two chains, a hidden import included and a derived account not (wire-shaped addresses); a paused reset's
held import named from the journal, once when recreated, and one address on two chains named twice (controls, the
merge mutation-checked in both layers); a reset paused before its purge named from its live row; a running reset's
journal unread but the reset pending; each failed read fails the list; on the page, no imports means no section and Delete goes (control); while the read runs Delete is
disabled, after a failure a press deletes nothing, toasts and re-reads, then the answer lets it go; an account
imported after the list refuses the press and is shown, then the press goes; a reset event re-reads and an older
read answering last never replaces the newer one; a lock mid-read starts no account read (D17); a pending
reset sends Export first to the account export page, a passkey profile gets none (D16); locked, no read and no
section; the popup line and its `aria-hidden` glyph on every profile; the composition case drives the real reset
service to a paused reset and reads the held import once on its new chain and the same key elsewhere apart.
E2E: `type-roles.test.ts` sweeps the new address site (an imported account on Delete Profile, D21).

**✓ Phase 7 — delete chain.** Files: `networks/[id].vue`; test `networks/[id].test.ts`: live imports named, a hidden
one included and two of one name both ("Export them first."); a reset pending elsewhere says "Export" on a password
profile and a chain that is not stale (D18); a paused reset of this chain uses its own list and reads no live
accounts; a failed read refuses with today's toast and deletes nothing; an import made after the confirmation opened
reopens it naming the account instead of deleting, and the next Confirm deletes (D17).

**✓ Phase 8 — the class lookup row (#975).** Files: `permission-rows.ts`; tests `permission-rows.test.ts`,
capability `index.test.ts` (wire-shaped request): the listed row's line, unflagged with no chip; `"*"` flagged with
the "Any class" chip, approved as requested.

**Phase 9 — e2e, screenshots, gates, then the close-out.** Smoke at retry 0 on Chrome then Firefox, on the armed
build (`agent.sh` runs only the network config): `cd apps/extension && bun run test:e2e -- tests/e2e/{type-roles,security-reset,auth-flows,tooltips-glossary,settings-crud,stale-network,stale-network-captures}.test.ts --retry=0`.
Network at retry 0 through `agent.sh`, both browsers: `type-roles-windows`, `contracts-getClassMetadata` (the class
row). Screenshots from a scratch spec outside the repo, light and dark, Chrome 360×600 (the capability window at its
400×800), into `screenshots/arc2/`. Gate: lint, `typecheck:all`, `test:all`, every listed e2e green on both
browsers, `bun run check:plans` after staging, exit 0.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `f55b7b4e6`; step 1 absent (`code_review: off`).
Per arc after its last phase: the Codex loop over the arc's diff against its base
(`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with
`resume-codex.sh`), the two verbatim rules in every prompt, arc 1's prompt naming arc 2 ("arc 2 adds the deletion
warnings"), hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1;
each round in `lessons/phase-N.md` and § Audit verdicts. Arc 2's loop is also the cross-arc pass. The close-out
rides arc 2: merge `origin/dev` first; Outcome (`Known limits: none` unless filed; `Open items:`); lessons pass;
`STATUS.md` deleted; `git mv` to `archive/` in its own commit. Teardown once
`implementations-plan/archive/consent-display-2/plan.md` is on `origin/dev`: `agent-worktree done consent-display-2 --merged`.

## Delivery

| Arc | Phases | Base | PR title (≤ 93) | Closes |
|---|---|---|---|---|
| 1 | 1–5 | `origin/dev` + this plan's commit | `feat(consent): windows count what a grant reaches; private fee juice card; flagged token add` (92) | none |
| 2 | 6–9 + close-out | `origin/dev` after #964 and arc 1 merge | `fix(profile): deletion warnings name imported accounts the phrase cannot restore` (80) | #975 |

Each PR opens without labels once its loop converges; add `e2e:extension-network` (arc 1) or
`e2e:extension-smoke` (arc 2) only if the path filter skips a needed suite. Arc 1 opens ready when the screenshots
match the pictures; arc 2 opens ready (OA-1 and OA-2 answered), its class row words signed from the screenshots
(OA-3). Bodies quote each surface's pick (id
and text), show the light and dark screenshots, state the e2e wall-clock before and after, and name no decision page, finding or advisory.
Parallelism: none (arc 2 waits on #964).

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, session `01a15b8b`): **conditional approve**. Accepted: no locked account read
  (both reads refuse while locked; OA-1 rewritten around the lock); Export first's reach (OA-2); OA-1 kept open,
  arc 2 a draft until answered; D11 reworded to the first price snapshot, its dead-service state a known limit;
  the broadcast and direct-`approve()` window tests; the paused reset's merged names; same-selection e2e timing and
  `audit:vue`. Nothing rejected.
- **Opus 5.5 r1** (Plan): **conditional approve**. Accepted: the locked read (as Codex); the Details events column
  under a switch Off, settled by the approved picture (D15) and pinned by a test; D7's decoy payer as a narrowed bar
  and a known limit; the locked-page privacy point (OA-1); class-row testids; the fixture and smoke-spec files the
  e2e change touches, and `type-roles.test.ts` in arc 2; one `tokenFlagHold` and per-type collectors for the
  complexity budget; the malformed-scope default failing Off; the broadcast test and the dispose order;
  address-keyed merging and the Export first testid; the `details-table.ts` line numbers. Rejected: an owner ask
  for the PrivateFPC pool-short state, since the contract's accounting makes the notice the true cause (D8).
- **Codex final** (gpt-6.1-sol, high, fresh session `01a15b9d`): **conditional approve**, D1-D15 hold, then
  **approve** after two confirmation turns in the same session. Accepted
  (all arc 2): Delete Profile also names a paused reset's journal-held imports, merged by chain and address (its
  confirmation turn); Delete held until the read answers,
  a failed read refused; the locked-read claim corrected (`getAccounts` has no session check, the page reads nothing
  while locked); OA-2 notes the full backup refuses while a reset is pending; explicit test commands for phases 6-7.
- **Arc 1 Codex r1** (gpt-6.1-sol, high, session `01a15bc4`): **findings (1)**, low: two comments restated their
  declarations. Fixed in `75c15eca4`: the stories one deleted, the `COLUMNS` one replaced by the glyph-to-row-icon
  coupling it guards.
- **Arc 1 Opus 5.5 r1** (general-purpose): **findings (3)**. Accepted: Details omitted held private events Allow
  keeps when a data re-request replaces the data cap in `effectiveGrants` while `dataGrant` keeps the held field
  (demonstrated; the window now reads the held data with the request's, pinned by a window test red without it);
  `params.knownContracts` for the table; the events-default comment. Its note on the window's stale-quote refresh
  is recorded under Security (Network), with the fee window as precedent.
- **Arc 1 Codex r2** (resumed `01a15bc4`): **clean**. The union can only overstate (requested events that replace
  held ones show both); the `COLUMNS` comment now documents a coupling.
- **Arc 1 Codex r3** (resumed `01a15bc4`): **clean** over `92e9a1709` (two e2e spec corrections) and the whole arc.
  Argued the execute window's stale-quote refresh: the price host does gain activity times, but no dApp, call or
  token, and the flag read never waits on the refresh; keep D10. The Security line is corrected to say so.
- **After r3: Privacy Policy § 5.2** (read while merging `origin/dev`) promises "Transaction execution reads cached
  prices and never triggers a fetch", which `usePrices`' mount-time `refreshIfStale` in the execute window breaks
  when quotes are stale; r3 had argued without that text. D10 now reads `useTokenFlags`, the list half `usePrices`
  already holds (`c23b75760`), pinned by a window test red under `usePrices`.
- **Codex consult on `c23b75760`** (resumed `01a15bc4`): the flag read is right and the stale-read guard holds
  with `adoptFull` passed by reference; **findings (1)**, medium, pre-existing: the execute window's fee children
  `AppFeeLine` and `FeeSettingsCard` call `usePrices` too, so the window as a whole is not fetch-free. Not changed
  here (it predates the plan, outside its surfaces); the claim narrowed to the flag read, and the fee children and
  the fee window go to the orchestrator as one follow-up.

- **Arc 2 Codex r1** (gpt-6.1-sol, high, session `01a15f7f`): **findings (4)**. Accepted: Delete Profile and delete
  chain acted on a list read before an import made in another window (both high, demonstrated); a lock mid-read
  still started `getAccounts` (medium); two comments restating what they sat on (low). Fixed in `d43f0f0fc`.
- **Arc 2 Opus 5.5 r1** (general-purpose): **findings (4)**, all low. Accepted: a reset paused before its purge
  listed a moved import twice (held only once purged); no test for the reset-event re-read and its out-of-order
  guard; the cross-window import (as Codex); delete chain's "Export it first." for a stale chain while another
  reset is pending (D18). Not changed: the same gap on Delete Profile's "Export first", the owner's target (D18).
  Every fix mutation-checked.
- **Arc 2 Codex r2** (resumed `01a15f7f`): **findings (3)**. Accepted: an older Confirm whose read a newer press
  overtook could delete under the newer confirmation (high; a per-attempt generation); delete chain could start
  `getAccounts` after a lock (medium). Argued and accepted in r3: an import completing during the press-time read is
  the check-then-act race no client-side check closes; a known limit (D17). Fixed in `fefff6582`.
- **Arc 2 Codex r3** (resumed `01a15f7f`, the last round): **findings (1)**, medium: a delete-chain read answering
  after the lock could still open a confirmation naming the imports. Fixed in `dd9139e84` (the post-read guards
  check the lock), pinned by a test red without it; not re-reviewed, the loop's three rounds being spent.

## Seeds

- `/goal` Phases 1–5 marked ✓ in implementations-plan/consent-display-2/plan.md, each with its gate's output in the transcript; arc 1's Codex loop converged (a resumed pass with no new material finding quoted); PR for `consent-display-2-a1` open against `dev`; `bun run lint` and `bun run test:all` exit 0.
- `/loop 15m` Drive implementations-plan/consent-display-2 arc 1: read plan.md and lessons/, run the next phase and its gate, tick it, then the Codex loop and the PR; never merge.
