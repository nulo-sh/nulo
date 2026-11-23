---
plan: wallet-followups-9
tier: light
status: building (arc 1 built, arc 2 next)
issues: "#1925, #1926"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon on two Sonnet Explore agents; no plan audit round; one Codex gpt-6.1-sol high read-only pass over the plan and each arc's diff (lane brief, bounded work), then targeted verification
base: origin/dev at c0eb5d072
trunk: dev
post_implementation_hardening: not scheduled
---

# wallet-followups-9: Delete profile names every imported account; one bound on a token's decimals

Two bugs from the 2026-11-23 wallet review, one arc and one PR each, stacked. Both change what a person can see, so both PRs wait for the owner's sign-off on their frames. Paths are under `apps/extension/src/` unless they name another root.

## The issues, checked

**#1925, demonstrated** (red at the base: `popup/pages/settings/security/imported-accounts.test.ts` "an imported account on a chain with no network row is named, after the networks' own" and `reset.test.ts` "an imported account on a chain with no network row is named by its chain id…", each missing the row). Initial conditions: a full backup holds an imported account on a user-added network; it is restored on a wallet without that network. Events: the restore reseeds only the default networks (`composables/full-backup-restore.ts` `reseedNetworksStage`), and `AccountService.restore` keeps an imported row on a chain with no network row, with its key, rather than lose a key no phrase derives (`wallet/services/account/service.ts`, `restore`). The person opens Delete profile. Order: the list reads `getNetworks()`, then `getAccounts(profile, chainId)` per network row (`imported-accounts.ts` at the base), so that chain is never read. Invariant broken: the warning names every imported key the deletion erases; `purgeForProfile` erases every account row and every imported key of the profile, on every chain. Consequence: with no other imported account, no warning and no "Export first"; the key is lost unless the person kept the account file or a backup. The issue's other claims held; deleting a network purges its accounts and keys (`clearChainState`), so a restore is the one path.

**#1926, demonstrated** (14 tests red at the base copies of the changed files, green after; among them `utils/token-amount.test.ts` "integers 0..18 only…", `popup/pages/send-amount.test.ts` "returns decimalsUnknown for decimals the wallet cannot use (1000000000)", red after 2.6 s, `wallet/services/token/service.metadata.test.ts` "decimals past the bound fail the read…"). Initial conditions: a token contract whose decimals getter returns a large value (the ABI's u8 is a claim; the value is whatever the contract's code, or the node simulating a public function, returns). Events: New token reads its metadata (`getDecimalsDescriptor.unpackResult`, `result[0].toNumber()`, no bound), `buildToken` stores it (`TokenSchema.decimals` is `z.number()`); the person opens Send. Invariant broken: every number the wallet derives from a token's decimals is cheap to compute. Consequence: a probe (Bun 1.4) timed `parseAmountToBaseUnits`/`formatBaseUnits` at ~30 ms per call at 10^6 decimals, ~0.5 s at 10^7, and a `RangeError` after 1.5-22 s at 6×10^8 and 10^9; `AmountCard` runs them on every keystroke and its rate line runs `10n ** decimals` on render. Not in the issue: Home, Holdings, the Send picker and History already read decimals through `knownDecimals`/`isValidDecimals` (`utils/token-amount.ts`, `MAX_DECIMALS = 77`) and show "—" above 77; Send's amount card, `validateSendAmount`, Send again and the execute window's `amountLabel` did not. Under the bound (18) every helper is instant (the existing 18-decimal tests).

Closed known limits searched (`delete profile imported`, `decimals`): #807, #809 and #1013 border #1925 (a paused reset's exports, a press-time race); none covers a chain with no network row.

## Outcome & Quality Bar

- **For whom:** a person deleting a profile after a restore; a person adding a token by pasting its address.
- **Excellent:** the Delete profile warning names every readable imported account the deletion erases, in the order it names them today, and "Export first" leads somewhere that exports them. A token whose decimals the wallet cannot handle is refused at import with words the form already uses, and a row stored before the change breaks no screen.
- **Good enough:** no new chain-naming scheme for the rows that have a network; no change to the paused-reset exports (known limits #807, #809).

## Architecture & Implementation

**Arc 1 (#1925).** New account RPC `getImportedAccounts(profileId)` (spec, client passthrough, `rpcMethods`, params schema): the profile's imported rows on every chain, hidden included, by chain then index (the comparator `getAccounts` already used, now shared as `byIndexThenAddress`). `readImportedAccounts` reads it with the networks and the pending reset in one `Promise.all`; it lists each network's rows (plus a paused reset's held imports) in network order, then rows on chains with no network row, deduped by `importedKey`, and marks each `networked`. `reset.vue`'s first display and its press-time re-check share `fetchImported`, so they stay in agreement. A row with `networked: false` reads `AZTEC:677692 · 0x1d7a…4d19` (`getChainName`, as Connected apps prints an account's chain). Rejected: widening `getAccounts` to an optional chain (every caller's contract changes); reading `backupImportedKeys` (no names, refuses during a reset).

**Arc 2 (#1926).** One bound, the seeder's `DECIMALS_MAX = 18`, moved to `wallet/services/token/spec.ts` with its predicate `isValidDecimals` (re-exported by `utils/token-amount.ts`, replacing its `MAX_DECIMALS = 77`). It holds: in the decimals descriptor's decode, which throws a new `TokenDecimalsOutOfRangeError` (`@nulo/extension-messaging/errors`, rebuilt across the port; a dApp still receives the constant unclassified envelope); in the seeder, which treats that error as the metadata-bounds hard skip; in the import form, which maps it to its existing interface refusal; in `TokenService.restoreRow`, which refuses such a backup row as a restore error; in `seed-preflight-metadata.ts`. Every reader that already treats unknown decimals as a token the wallet cannot use applies it: Home, Holdings and the Send picker show "—", History hides the figure, the incoming dust filter fails open. Send's `AmountCard`, `validateSendAmount` (`decimalsUnknown`), Send again (offers nothing) and `amountLabel` (base units) now read through it too. The registered stored shape is untouched (`stored-shapes` tests green, no stamp). The signed token list already bounds decimals to 0..18 (`packages/token-list/src/parse.ts`), and the seeder requires the exact listed value. Rejected: keeping 77 for display beside 18 for acceptance (D7).

## UI impact

- **#1925, Delete profile.** Before: an imported account on a chain with no network row is not listed; alone, no "Imported accounts" section and no "Export first". After: its row shows its name and `AZTEC:<chain id> · <address>`; the section and "Export first" (to the full backup) show. Rows on networks are unchanged. Wording: OWNER-ASKS OA-1. Frames: `1925-before-*`, `1925-after-*`.
- **#1926, New token.** Before: a token reporting more than 18 decimals is added. After: refused with "Couldn't auto-detect this token's interface. Try a contract whose ABI matches a known standard." Wording: OA-2. Frames: `1926-import-refused-*`.
- **#1926, a stored token with 19 to 77 decimals.** Before: Home and Holdings show its balance, History its amounts, Send takes an amount and offers Send again. After: "—", no figure, Send derives no amount and its Review stays disabled with no new words (`decimalsUnknown`), no Send again, the execute window shows base units. Above 77, before: "—" on Home, Holdings and History, and Send's field throws or stalls; after: the same "—", and Send as above. Frames: `1926-home-before-*`, `1926-home-after-*`, `1926-send-before-*`, `1926-send-after-*`. Whether Send should say why: OA-3.

## Security & Adversarial Considerations

- **#1925:** the new read returns what `getAccounts` already returns, per profile, from the same sealed rows; it answers no more while locked than `getAccounts` does, and the page discards an answer the lock overtook. Left out, each recorded (D3-D6): an unreadable account row (#1940), a reset running in another window (#1938), a passkey profile's hidden Export first (#1939), a paused reset's export of an account on a chain with no network row (#1941). Out of scope: an orphan key row (a crashed import's key with no account), which the deletion also erases and nothing lists anywhere.
- **#1926:** attacker: a token contract, or the node answering a public simulation, choosing the decimals value. Boundary: the import, the dApp `registerToken` preview (now refused before the person sees it), the metadata refresh (contained; the row keeps its stored value), a backup file (refused at restore). No log line, permission or dependency changes.

## Assumptions

**Facts** (at `c0eb5d072`)
1. `purgeForProfile` erases every live account row and every `importedKeys.forProfile` row of the profile, chain-agnostic (`account/service.ts`).
2. `AccountService.restore` holds an imported row on a chain with no network row; a derived row there is refused (`account/service.test.ts`, "holds an imported row unchecked…").
3. The full backup exports every readable account row and imported key of the profile, with no network filter, and refuses while a reset is pending (`account/service.ts` `exportFullBackupKeys`, `rowsOfProfile`); its page already warns about imported accounts on added networks (`export/full.vue`).
4. `getChainName` falls back to `` `Aztec:${chainId}` ``, printed upper-cased on Connected apps' account rows (`components/ui/utils.ts`; `settings/connected-apps/[id].vue`).
5. At the base, the decimals bounds were `DECIMALS_MAX = 18` (`token/seeder.ts`), `MAX_DECIMALS = 18n` (`scripts/seed-preflight-metadata.ts`), the token list's 0..18 (`packages/token-list`), and `MAX_DECIMALS = 77` (`utils/token-amount.ts`).
6. An unclassified `WalletError` reaches a dApp as the constant envelope (`wallet-sdk/error-envelope.ts`).

**Inferences:** no user holds a token with 19 to 77 decimals (none can be seeded; the list caps at 18).

**Asks** (OWNER-ASKS.md): OA-1, how the row names a chain with no network row; OA-2, the import refusal's words; OA-3, whether Send says why it refuses a stored token past the bound.

## Phases

**Phase 1 (arc 1, #1925).** Build as above. Gate: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/settings/security src/wallet/services/account src/wallet/services/network-reset`; `bun run audit:vue`; `bun run test:all`; smoke e2e `settings-crud.test.ts` and `type-roles.test.ts` (they read `reset-*` testids) at `--retry=0`. Pass: all exit 0.

**Phase 2 (arc 2, #1926).** First the red tests at the base (descriptor decode at 10^9, `validateSendAmount` at 24, AmountCard at 10^9), then the build. Gate: lint, typecheck, the token, send, execute and utils tests, `stored-shapes/snapshot.test.ts` green with no stamp, `audit:vue`, `test:all`; smoke `fixtures/tokens.ts` users, network `holdings.test.ts`. Pass: all exit 0.

**Phase 3 (frames, close-out).** Capture page outside the tree's commits; frames to the lane's scratch `frames/` with `manifest.json`; one commit adds them under `pr-captures/`, the next removes them.

## Decision ledger

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | A dedicated read, `getImportedAccounts(profileId)` | `getAccounts` with an optional chain; `backupImportedKeys` | one new method keeps every `getAccounts` caller's contract; the key read has no names and refuses during a reset |
| D2 | The list reads networks, the pending reset and the imported rows in one `Promise.all` | the account read after the network read, as before | no per-network read is left to wait for; a read the lock overtakes is still dropped (`fetchImported`), and none starts after the lock |
| D3 | The scope is the profile's readable imported accounts | failing the read on any unreadable owned row | an unreadable row needs damaged storage no wallet path writes (Codex F2): known limit #1940 |
| D4 | Codex F1 (a reset running in another window hides its journal-held imports) left out, filed as #1938 | refusing Delete while a reset runs, in this PR | pre-existing, another cause than #1925, and the fix is a refusal a person sees: the owner's call |
| D5 | Codex F3 (`exportFirstTo` hides Export first for a passkey profile, though the account page now exports held rows) left out, filed as #1939 | showing the button here | pre-existing, and a button appearing is a UI change |
| D6 | During a paused reset, an account on a chain with no network row cannot be exported from Export first's page | a chain picker on the account export page | known limit #1941, same class as #807; the account is still named |
| D7 | One bound for adding and for using a token: a stored row past 18 becomes a token the wallet cannot use | 18 to add, 77 to use | the brief's "one bound"; with two, a token the form refuses stays usable where an older row holds it, and every screen keeps a second constant. Cost: a row of 19 to 77 decimals, which no seed or list entry can produce, turns "—" (frames) |
| D8 | The decode refuses with a typed error, mapped by the form | refusing in `addToken` after the read; matching a message string | one check where the value enters covers the import, the dApp preview, the refresh and the seeder; a typed error is how `ContractNotFoundError` already reaches this form |

## Audit verdicts

**Arc 1, Codex (`gpt-6.1-sol`, high, read-only; session `01a209a9`).** F1 material, pre-existing: D4, #1938. F2 material, pre-existing, damaged storage only: D3, #1940; Fact 3 qualified to readable rows. F3 minor, pre-existing: D5, #1939. F4 nit, two comments: accepted (the row label's comment removed, the list's doc cut to its invariant). Verdict: "#1925's fix is sound"; no profile-isolation, keyboard or focus regression found.

## Post-implementation

Steps from `implementations-plan/README.md` § Post-implementation standard at `c0eb5d072`, bounded-work form: one Codex pass (`gpt-6.1-sol`, `high`, read-only) per arc over this plan and that arc's diff, with the adversarial ask, the brief's four targets (an unnamed imported key still deleted; an out-of-range decimals row still reaching a throwing screen; an accidental stored-shape change; a keyboard or focus regression) and the two verbatim rules; then targeted verification of each material fix.

## Delivery

`gh stack`: arc 1 on `worktree-wallet-followups-9`, arc 2 on `wallet-followups-9-decimals`, trunk `dev`. Titles: `fix(settings): delete profile names imported accounts on chains with no network row` (Closes #1925); `fix(tokens): one bound on a token's decimals, at import and where metadata is read` (Closes #1926). Each PR ready, unmerged, body ending "Waits for the owner's sign-off on the frames above." Close-out (Outcome, archive) is arc 2's last commits.

Seeds (never run; the orchestrator owns delivery): `/goal wallet-followups-9: phases 1-3 green per plan.md` · `/loop 30m check the stack's checks; stop when both PRs are green`.
