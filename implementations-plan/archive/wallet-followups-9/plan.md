---
plan: wallet-followups-9
tier: light
status: completed
issues: "#1925, #1926, #1938, #1939"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon on Sonnet Explore agents; no plan audit round; one Codex gpt-6.1-sol high read-only pass over the plan and each arc's diff (bounded work), then targeted verification
base: origin/dev at c0eb5d072 (arcs 1-2); arc 3 off origin/dev at 4bbfe03f6
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-24. Three PRs into `dev`: #1942 (arc 1) and #1945 (arc 2), merged, and arc 3's, which carries this close-out; its merge closes #1938 and #1939, as the first two closed #1925 and #1926.
- **Status:** completed.
- **Shipped:**
  - #1925: Delete profile names every imported account the deletion erases, on every chain, through `getImportedAccounts(profileId)`; one on a chain with no network row reads `AZTEC:<chain id> · <address>` (decision 1).
  - #1926: one bound on a token's decimals, `MAX_DECIMALS = 77` in `utils/token-amount.ts`, read at the decimals decode, at restore, in the seeder, the seed preflight and Send; New token's refusal and Send's line "Nulo can't send this token." (decisions 4 to 6). A 24-decimal proof per screen, each red at 18; no stored-shape stamp.
  - #1938: a running reset makes Delete profile's list unreadable: the line "A network reset is running. Wait for it to finish.", a press refused with "Couldn't delete profile. Try again", and the list read again when the reset ends (decision 2). Reproduced first, at `4bbfe03f6` (§ The issues, checked).
  - #1939: during a paused reset Export first shows for every profile and leads to the account export page (decision 3).
- **Review:** one Codex pass (`gpt-6.1-sol`, high, read-only) per arc, arc 2 once per build (§ Audit verdicts); no material finding left open.
- **Dispositions:** D7, the first build's bound of 18, superseded by decision 4. Rejected: disabling Send's field and Max for a token past the bound (Codex arc 2b F1; D12, the signed frame). The close-out the first build put on #1945 was taken off it and rides here.
- **Known limits:** #1940, #1941, both closed `known-limit`.
- **Open items:** none.
- **Lessons:** none promoted: `lessons.md` sits at 8,148 of 8,192 bytes and nothing in it is superseded; the one gotcha, a list read that straddles a reset's end, stands at `readImportedAccounts`.
- **Seeds retired:** the `/goal` and `/loop` seeds in § Delivery were never run; the orchestrator drove the three arcs.

# wallet-followups-9: Delete profile names every imported account; one bound on a token's decimals; Delete profile and a running reset

Four bugs from the 2026-11-23 wallet review, in three arcs and three PRs. Every arc changes what a person can see; the owner's decisions below are the sign-off each needs. Paths are under `apps/extension/src/` unless they name another root.

## The owner's decisions

Decision page 203, signed 2026-11-24T12:38Z, on the asks of the first build (OA-1 to OA-3 in [OWNER-ASKS.md](OWNER-ASKS.md)) and on #1938 and #1939:

1. The row for an imported account on a chain the wallet has no network for: **A**, "AZTEC:677692 · 0x1d7a…4d19. The wallet's existing way to print a chain with no name. No new words." (Arc 1 as built.) Whether retired chains could show a name is a later page: nothing is built for it.
2. Delete profile while a network reset runs in another window: **B**, "As A, and the page says why while the reset runs, in a line under the list. Proposed words: "A network reset is running. Wait for it to finish."", where A is "Treat a running reset as a list that cannot be read. Pressing Delete profile shows the existing "Couldn't delete profile. Try again". When the reset ends the page reads the list again and the delete goes through." (Arc 3.)
3. Approved by the signature: "show Export first for a passkey profile too during a paused reset, leading to the account export page as it does for a password profile." (Arc 3.)
4. The most decimals a token may have: **A**, "At most 77: the bound the amount screens already use, now also applied where decimals are read and in Send. A token with 19 to 77 decimals keeps working as it does today. New token refuses one above 77, and a stored one above 77 reads "—" everywhere and cannot be sent." (Arc 2, rebuilt; supersedes D7.)
5. What New token says when it refuses: **A**, the token's own sentence, "This token has more than 77 decimals. Nulo supports up to 77." (Arc 2.)
6. Send for a stored token past the bound: **B**, as built (the token reads "—" in the picker, Send takes no amount, Review stays disabled) "plus a line under the amount. Proposed words: "Nulo can't send this token."" (Arc 2.)

## The issues, checked

**#1925, demonstrated** (red at the base: `popup/pages/settings/security/imported-accounts.test.ts` "an imported account on a chain with no network row is named, after the networks' own" and `reset.test.ts` "an imported account on a chain with no network row is named by its chain id…", each missing the row). Initial conditions: a full backup holds an imported account on a user-added network; it is restored on a wallet without that network. Events: the restore reseeds only the default networks (`composables/full-backup-restore.ts` `reseedNetworksStage`), and `AccountService.restore` keeps an imported row on a chain with no network row, with its key, rather than lose a key no phrase derives. The person opens Delete profile. Order: the list read `getNetworks()`, then `getAccounts(profile, chainId)` per network row, so that chain was never read. Invariant broken: the warning names every imported key the deletion erases; `purgeForProfile` erases every account row and every imported key of the profile, on every chain. Consequence: with no other imported account, no warning and no "Export first"; the key is lost unless the person kept the account file or a backup.

**#1926, demonstrated** (red at the base, among them `popup/pages/send-amount.test.ts` "returns decimalsUnknown for decimals the wallet cannot use (1000000000)", red after 2.6 s, and `wallet/services/token/service.metadata.test.ts` "decimals past the bound fail the read…"). Initial conditions: a token contract whose decimals getter returns a large value (the ABI's u8 is a claim). Events: New token reads its metadata (`getDecimalsDescriptor.unpackResult`, no bound), stores it (`TokenSchema.decimals` is `z.number()`); the person opens Send. Invariant broken: every number the wallet derives from a token's decimals is cheap to compute. Consequence: `parseAmountToBaseUnits`/`formatBaseUnits` took ~30 ms per call at 10^6 decimals and threw a `RangeError` after 1.5-22 s at 10^9; `AmountCard` runs them on every keystroke. Home, Holdings, the Send picker and History already read decimals through `isValidDecimals` (`utils/token-amount.ts`, `MAX_DECIMALS = 77`); Send's amount card, `validateSendAmount`, Send again and the execute window's `amountLabel` did not. Under 77 every helper is instant (the display bound was chosen for that).

**#1938, demonstrated** (the composition test `wallet/services/network-reset/service.composition.test.ts` "past a running reset's purge its import is only in the journal: Delete Profile cannot read its list until the reset ends" passed in its bug-asserting form at the base `4bbfe03f6`). Initial conditions: a profile with an imported account on a network the wallet must reset. Events: the reset runs in one window and passes its purge (hold point `network-reset-purged`); the person opens Delete profile in another. Order: the purge has removed the live row and holds the sealed key only in the reset journal; the list read the live rows, and the journal only for a paused reset, so it answered `{ accounts: [], resetPending: true }`. Invariant broken: the warning names every imported key the deletion erases; `ProfileService.deleteProfile` calls `staleNetworks.clearProfile`, which removes the journal. Consequence: no warning, no "Export first", and the key erased.

**#1939, demonstrated** (a `reset.test.ts` case pinned the hiding at the base; it now expects the link). During a paused reset `exportFirstTo` returned `null` for a passkey profile, on the stale ground that the account export page took password profiles only; that page exports a passkey profile's live and journal-held accounts after a fresh passkey ceremony.

Closed known limits searched (`delete profile imported`, `decimals`, `reset running delete`): #807, #809 and #1013 border #1925 and #1939 (a paused reset's exports, a press-time race).

## Architecture & Implementation

**Arc 1 (#1925).** New account RPC `getImportedAccounts(profileId)` (spec, client passthrough, `rpcMethods`, params schema): the profile's imported rows on every chain, hidden included, by chain then index (the comparator `getAccounts` already used, shared as `byIndexThenAddress`). `readImportedAccounts` reads it with the networks and the pending reset in one `Promise.all`; it lists each network's rows (plus a paused reset's held imports) in network order, then rows on chains with no network row, deduped by `importedKey`, and marks each `networked`. `reset.vue`'s first display and its press-time re-check share `fetchImported`. A row with `networked: false` reads `AZTEC:677692 · 0x1d7a…4d19` (`getChainName`, as Connected apps prints an account's chain; decision 1).

**Arc 2 (#1926), rebuilt for decision 4.** One bound, `MAX_DECIMALS = 77` with its predicate `isValidDecimals`, defined once in `utils/token-amount.ts` and read everywhere a token's decimals arrive or a number is derived: the decimals descriptor's decode, which throws `TokenDecimalsOutOfRangeError` past it (`@nulo/extension-messaging/errors`; covers New token, the dApp `registerToken` preview, the metadata refresh and the seeder's hard skip); `TokenService.restoreRow`, which refuses such a backup row; the seeder's metadata bounds; `seed-preflight-metadata.ts`; New token's refusal sentence, built from the constant (decision 5); and every screen that already read the display bound, plus Send's `AmountCard`, `validateSendAmount`, Send again, its Recent row and `amountLabel`. Send's amount card shows the refusal "Nulo can't send this token." (`send-amount-unsendable`) in its existing `txt-danger` line under the field, first of its refusals, for a loaded token past the bound (decision 6). The first build's 18 (`DECIMALS_MAX` in `token/spec.ts`) is gone. The signed token list keeps its own 0..18 (`packages/token-list/src/parse.ts`, a list policy), and the seeder requires the exact listed value, so no seed reaches 19-77. Stored shape untouched (`stored-shapes` tests green, no stamp).

**Arc 3 (#1938, #1939).** Branch `wallet-followups-9-delete-reset` off `origin/dev` at `4bbfe03f6`, once arc 1 landed; the reproducer above came first. `readImportedAccounts` rejects with `ResetRunningError` while `getPendingReset()` reports `running` (the background's one in-memory flight, so a reset begun in any window), and reads the pending reset after the networks and the accounts (D13, amending D2). `reset.vue`'s `fetchImported` sets `resetRunning` from that error, so the existing failed-read path refuses the press with "Couldn't delete profile. Try again" while the line `reset-network-reset-running` (`role="status"`) says "A network reset is running. Wait for it to finish." (decision 2); the reset's end report clears the line at once and its re-read brings the list back (D14). `exportFirstTo` leads every profile to the account export page during a paused reset (decision 3).

## UI impact

- **#1925, Delete profile.** Before: an imported account on a chain with no network row is not listed; alone, no "Imported accounts" section and no "Export first". After: its row shows its name and `AZTEC:<chain id> · <address>`, with the section and "Export first" (to the full backup). Decision 1.
- **#1926, New token.** Before: a token reporting more than 77 decimals is added and later breaks Send. After: refused, "This token has more than 77 decimals. Nulo supports up to 77." Decision 5.
- **#1926, Send for a stored token past 77.** Before: Home, Holdings and History read "—", and Send takes an amount (a huge value stalls or throws). After: the same "—"; Send takes no amount, Review stays disabled, no Send again, and the line "Nulo can't send this token." shows under the amount. Decision 6.
- **#1926, a token with 19 to 77 decimals.** Unchanged from before the lane on every screen (the first build's 18 had turned it "—"). Decision 4.
- **#1938, Delete profile while a reset runs.** After: no list, the line "A network reset is running. Wait for it to finish." under it, a press refused with "Couldn't delete profile. Try again", and the list back once the reset ends. Decision 2.
- **#1939, Delete profile for a passkey profile during a paused reset.** After: "Export first" shows and leads to the account export page. Decision 3.

## Security & Adversarial Considerations

- **#1925:** the new read returns what `getAccounts` already returns, per profile, from the same sealed rows, and answers no more while locked; the page discards an answer the lock overtook. Known limits: #1940 (an unreadable account row), #1941 (a paused reset's export of an account on a chain with no network row). Out of scope: an orphan key row (a crashed import's key with no account), which the deletion also erases and nothing lists.
- **#1926:** attacker: a token contract, or the node answering a public simulation, choosing the decimals value. Boundaries: the import, the dApp `registerToken` preview (refused before the person sees it), the metadata refresh (the row keeps its stored value), a backup file (refused at restore). No log line, permission or dependency changes.
- **#1938:** no attacker; two windows of one person. The refusal adds no state: the list read already fails closed, and the press-time re-check reads it again. A reset that starts after the pending-reset read purges only keys the account read before it listed (D13); a read that straddles a reset's end is dropped on the end event, which reaches the page before that read's answer on the same port. Residual, the #1013 boundary: an import landing between the page's read and a reset begun after it.

## Assumptions

**Facts** (at `c0eb5d072` unless named)
1. `purgeForProfile` erases every live account row and every `importedKeys.forProfile` row of the profile, chain-agnostic (`account/service.ts`).
2. `AccountService.restore` holds an imported row on a chain with no network row; a derived row there is refused.
3. The full backup exports every readable account row and imported key of the profile, with no network filter, and refuses while a reset is pending (`exportFullBackupKeys`, `rowsOfProfile`).
4. `getChainName` falls back to `` `Aztec:${chainId}` ``, printed upper-cased on Connected apps' account rows.
5. Before the lane the decimals bounds were 18 in the seeder and the seed preflight, the token list's 0..18, and `MAX_DECIMALS = 77` in `utils/token-amount.ts`; after arc 2 they are 77 everywhere but the token list.
6. An unclassified `WalletError` reaches a dApp as the constant envelope (`wallet-sdk/error-envelope.ts`).

**Asks:** none open; OA-1 to OA-3 answered by decisions 1, 5 and 6.

## Phases

**Phase 1 (arc 1, #1925).** Gate: `bun run lint`; `bun run typecheck:all`; the settings/security, account and network-reset tests; `bun run audit:vue`; `bun run test:all`; smoke e2e that open Delete profile at `--retry=0`.

**Phase 2 (arc 2, #1926).** The bound at 77 with every 18 the first build introduced moved, the line, and a 24-decimal proof per screen (Home row, Holdings, the Send picker, Send's amount entry, unit switch, Max and Review with the exact base units sent, Activity, the transaction page), each red at 18. Gate: lint, typecheck, `stored-shapes` green with no stamp, `audit:vue`, `test:all`, `test:ci-gating`, `check:plans`; smoke specs that open New token, Home and Send, and network `holdings`, `send-amount-exact`, `default-token-seeding`, Chrome and Firefox, retry 0.

**Phase 3 (arc 3, #1938, #1939).** Reproducer, then the build. Gate as arc 1, Chrome and Firefox; close-out on its last commits.

## Decision ledger

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | A dedicated read, `getImportedAccounts(profileId)` | `getAccounts` with an optional chain; `backupImportedKeys` | one new method keeps every `getAccounts` caller's contract; the key read has no names and refuses during a reset |
| D2 | The list reads networks, the pending reset and the imported rows in one `Promise.all` (the pending reset moved after the accounts by D13) | the account read after the network read | no per-network read waits; a read the lock overtakes is still dropped, and none starts after the lock |
| D3 | The scope is the profile's readable imported accounts | failing the read on any unreadable owned row | an unreadable row needs damaged storage no wallet path writes: known limit #1940 |
| D4 | A reset running in another window left out of arc 1, filed as #1938 | refusing Delete while a reset runs, in arc 1 | another cause, and a refusal a person sees: owner's call, now decision 2 (arc 3) |
| D5 | A passkey profile's hidden Export first left out of arc 1, filed as #1939 | showing the button in arc 1 | a button appearing is a UI change: owner's call, now decision 3 (arc 3) |
| D6 | During a paused reset, an account on a chain with no network row cannot be exported from Export first's page | a chain picker on the account export page | known limit #1941, same class as #807; the account is still named |
| D7 | Superseded by decision 4: the first build's one bound at 18 | n/a | the owner kept 77, so 19-77 tokens keep working |
| D8 | The decode refuses with a typed error, mapped by the form | refusing in `addToken` after the read; matching a message | one check where the value enters covers import, dApp preview, refresh and seeder |
| D9 | Send's Recent row reads its token's decimals through the bound (`sendText`) | n/a | a local guard and a test, red without it |
| D10 | `MAX_DECIMALS` lives in `utils/token-amount.ts`; wallet services, the seeder and the seed preflight import it | a constant in `token/spec.ts` re-exported by the utils | decision 4 names that bound; the utils module imports nothing, so a script and every layer read one definition |
| D11 | The Send line is a refusal of `AmountCard`'s existing line, first of its refusals, shown for a loaded token whose decimals fail the bound | a line in `send.vue` under the card; showing it while the token loads | the card already owns the one `txt-danger` line under the field and its `role="alert"`; a loading token is no refusal |
| D12 | The field and Max stay enabled for such a token, as built: typed text derives nothing, Max fills nothing | disabling the field and Max (Codex arc 2b F1) | decision 6 signs the first build's behaviour, whose frame shows text typed, plus the line; a disabled field is a change a person sees. Accessibility call under the 2026-10-19 delegation: the line, `role="alert"`, says why nothing derives |
| D13 | The pending reset is read after the networks and the accounts, and a running one fails the read with `ResetRunningError` | reading it with them in one `Promise.all` (D2) | read alongside, it can answer "none" just before a reset starts whose purge the account read then sees: an empty list with no reset, #1938 again |
| D14 | The running line clears on the reset's own end report, before the re-read answers | clearing it only when the re-read settles (Codex arc 3 F1) | a held re-read would keep saying a reset runs after it ended, up to the RPC timeout |

## Audit verdicts

**Arc 1, Codex (`gpt-6.1-sol`, high, read-only; session `01a209a9`).** F1 material, pre-existing: D4, #1938. F2 material, pre-existing, damaged storage only: D3, #1940. F3 minor, pre-existing: D5, #1939. F4 nit, two comments: accepted. Verdict: "#1925's fix is sound"; no profile-isolation, keyboard or focus regression found.

**Arc 2, first build, Codex (same session, resumed).** F1 material: Send's Recent row caption formatted unguarded decimals on first render: fixed, D9, red with the guard reverted. F2 minor: the refusal wording: became OA-2. F3 nit, two comments: fixed.

**Arc 2 rebuilt for 77, Codex (`gpt-6.1-sol`, high, read-only; session `01a20dd5`).** F1 material: for a 78-decimal token the field stays enabled and takes typed text, and `send.vue`'s `tokenBalanceByType` divides by `10 ** decimals` unbounded: rejected for the field (D12); the division is Number math read only as "has a balance", never shown, instant at any value (`Infinity` at worst), and bounding it would disable the field against the signed frame. F2 minor: the 78-decimal Send test's name claimed the field takes no amount: renamed, and it now asserts Max fills nothing and the line holds after typing. F3 nit: the refusal comment enumerated its cascade: cut to one line. Verdict: "the safety bounds otherwise look sound"; both signed sentences match; no other unguarded decimals exponent or padding path; 177 round trips across 19-77 passed.

**Arc 3, Codex (`gpt-6.1-sol`, high, read-only; session `01a20e18`).** F1 minor: the running line outlived a reset's explicit end while the re-read was in flight: fixed (D14), its test red with the fix reverted. F2 minor: a reader test's name claimed more than call order: renamed, and a page test added for a read that straddles the reset's end, dropped on the end event. Comment: that drop is an invariant the reader's caller owns, now stated at `readImportedAccounts`. Verdict: "No new material key-loss bug found"; both signed strings match; the line adds no focus target or key handler; every reset end (success, failure, refused admission) emits the event that re-reads.

## Post-implementation

Steps from `implementations-plan/README.md` § Post-implementation standard at `9c913679b`, bounded-work form: one Codex pass (`gpt-6.1-sol`, `high`, read-only) per arc over this plan and that arc's diff, with the adversarial ask and the two verbatim rules, plus the arc's own targets (arc 2: a reader of decimals that still uses another bound, a screen where a 19 to 77 token misreads, a word that differs from the signed words; arc 3: a delete that still goes through while a reset holds a key, a word that differs from the signed words); then targeted verification of each material fix, hard stop at three rounds.

## Delivery

Arc 1 `worktree-wallet-followups-9` (#1942), arc 2 `wallet-followups-9-decimals` (#1945, base `dev` once arc 1 lands), arc 3 `wallet-followups-9-delete-reset` (`fix(settings): delete profile waits for a running reset, and passkeys get export first`, Closes #1938, #1939), trunk `dev`. Each PR body quotes the decisions for its surface and carries before/after frames from a scratch capture page, committed once and removed in the next commit. The close-out (Outcome, lessons pass, archive) rides on arc 3's last commits.

Seeds (never run; the orchestrator owns delivery): `/goal wallet-followups-9: phases 1-3 green per plan.md` · `/loop 30m check the three PRs' checks; stop when all are green`.
