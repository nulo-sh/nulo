---
plan: send-picker-1
tier: light (the orchestrator's spawn: one Codex audit round-trip and the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 0a659726c
trunk: dev
status: completed; delivered as one PR carrying this close-out
issues: "#1333"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-28. Planned and implemented in one session, as one arc.
- **Status:** completed. The arc and this close-out ship as one PR into `dev`; its merge closes #1333 and archives this plan.
- **Shipped:** Send's picker on the shared Holdings list, its rows native buttons (`TokenList.vue`, `TokenCard.vue`, `SelectTokenPopup.vue`); paste-to-add with the signed list's flag on the offer, and a whole pasted address matching by contract only, on Holdings too (`token-search.ts`); New token's `{ address, onAdded }` payload in place of the cache-store field, reported after its close while the scope holds (`NewTokenPopup.vue`); Send's pick of the reported token once its list holds it, keeping the recipient and a token-mode amount, a hand pick made meanwhile winning (`send.vue`); the corner's read zero and skeleton (`AmountCard.vue`, `balanceState`), drawing nothing for a stored side or decimals it cannot parse; S1 and N1; `token-list.test.ts`'s seed naming its balance functions (e2e-testing flake ledger row 66).
- **Dropped or rejected:** S2, merged into S1, and N1's never-minted token (D11). A pending-pick watcher or a re-read waiting on its successor (D4, known limit #1340). A focus return past an add row that a new row replaced (#1339). No `lessons.md` line: it holds 8191 of 8192 bytes and none of its entries is superseded; the candidates stay in [lessons/phase-4.md](lessons/phase-4.md), and the seed lesson is the e2e-testing skill's ledger row 66.
- **Known limits:** #1339, #1340.
- **Open items:** #1341 (owner decision: From and To after a paste-to-add).
- **Seeds retired:** the `/goal` and `/loop` below are a record, not an instruction.

## Goal

#1333: Send keeps its page; the Select token sheet becomes the Holdings-style list with paste-to-add, and the amount card's corner reads "0 TST" at zero. `E` is `apps/extension`, `P` is `E/src/popup`; recon in [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** a person on Send who wants to know what each token holds before picking it, or who has a token's address but not the token in the list.
- **Excellent:** (1) the sheet reads like Holdings, row for row, with the current token marked, and a pasted address offers the add, flagged when the signed list flags it; (2) an add returns to Send with the token picked and nothing typed lost; the corner never shows a zero the wallet did not read.
- **Good enough:** the rest of Send, Holdings' look and the New token popup stay as they are.

## Assumptions

**Facts** (verified at the base; recon.md § Facts):
- F1. The owner's sign-off (decision page 92, record P92-01, 2026-10-28): "Ok -- I in general want to keep "as is" I JUST want to change the token picker to the one you've implemented in "A", and also, I want to add the balance "0" when it's zero. As is today, it just shows nothing for some reason." #1333 restates it: Import "returns to Send with it picked, the recipient and amount kept"; "The picker and Holdings share one list component and one add rule."
- F2. `TokenList.vue` is presentational with literal `holdings-*` testids; its add rule is `matching.length === 0 && isValidAztecAddress(q)` (:86-89); rows are `TokenCard` links.
- F3. A token change on Send runs `send.vue:559-568`: close the review, re-init both types, clear the amount; the recipient is untouched.
- F4. `ImportContactsPopup.vue:105-116` hands `edit_contact` a payload `{ contact, onSave }` that lives only while the form is open; it is the repo's pattern for a popup's result.
- F5. `NewTokenPopup.vue:205` gets the added token's id and never reports it; every outcome after the add (synced, already synced, timed out, sync error, another chain) toasts and closes; a close mid-wait aborts with no toast. `popupStore.close` deletes a popup's payload (`popup.store.ts:31-38`).
- F6. `AmountCard.vue:247-251` hides the corner when `tokenBalanceByType` is falsy, pinned at `AmountCard.test.ts:128-134`; a never-synced row holds a zero placeholder (`send.vue:255`).
- F7. `Popup.vue` renders its slot under `v-if="show"`, and returns focus on close to what was focused when it opened. Two sheets closed in one flush return focus in component order (`PopupManager.vue:95-97` mounts New token before the picker), so the picker's return to `send-token-trigger` lands last.
- F8. Token names are capped at 80 characters and symbols at 32 by the worker (`token/service.ts:1117-1118`), so a name can hold a 66-character address.

**Inferences:** I1. The add path's balance wait (≤ 30 s) usually outlasts Send's `onTokenAdded` re-read; nothing orders the two, and a dropped port or a failed re-read leaves Send's list without the token, so the page re-reads before it picks (D4). I2. Firefox needs no product difference; the twins prove it.

**Asks:** none open. Manage tokens (brief: argued with Codex) is D6.

## Architecture & Implementation

- **`TokenList.vue`** gains props `testidPrefix` (default `holdings`), `label` (default "All holdings"), `placeholder` (default "Search tokens"), `sortable` (default true), `selectable` (default false), `selectedId` (a `token.id`) and `isFlagged(address)` (default never), an emit `pick: [tokenId]`, and a slot `add-note`. Its testids become `${prefix}-search|count|sort|fold|no-results|add-token|add-token-address|add-token-flagged`. With `selectable`, each `TokenCard` gets `pickPrefix` and `selected` (`tb.token.id === selectedId`, never the row's own id) and `pick` relays `tb.token.id`. The flag line and the note sit under the add button, never inside it; the button names both through `aria-describedby`.
- **`utils/token-search.ts`** `matchesQuery`: a query of `0x` and 64 hex digits matches a row only by contract, case-insensitively, never by name or symbol (an 80-character name can hold an address). Shorter `0x` prefixes and text keep today's rule. One rule for Holdings and the picker.
- **`TokenCard.vue`** gains a pick form: with `pickPrefix` set it renders a native `<button type="button">` with `${pickPrefix}-row`, `data-symbol`, `data-selected`, `aria-current` on the selected row, and `${pickPrefix}-flagged` on the flag line; the body is shared with the link form. The selected row draws the mockup's mark: `--nulo-surface-low` fill and an inset 2 px `--nulo-accent` bar.
- **`SelectTokenPopup.vue`** keeps its clients, snapshot, pins and prices, and mounts `TokenList` with `testidPrefix="select-token"`, "Your tokens", "Search or paste an address", `sortable=false`, `selectable`, `selectedId=cacheStore.activeTokenIdx`, and the flag check on the active chain, once its snapshot is `loaded` (an unread list would offer to add a held token). The note reads "It joins your list on {network name} and is picked for this send." A row pick writes `activeTokenIdx` and closes, as today. It keeps its own payload on show; `addToken` opens `new_token` with `{ address, onAdded }`, whose `onAdded` calls the kept one and closes the picker. "Couldn't load tokens" and Manage tokens stay.
- **`NewTokenPopup.vue`** keeps its whole payload on show (`popupStore.close` deletes it) and fills the address from it. On a success outcome (synced, already synced, timed out, sync error) on the submitting chain, with `appStore.scopeEpoch` unchanged since the submit, it emits `onClose`, then calls `onAdded(newToken)`. A refusal, an abort, another chain or a moved scope reports nothing. `holdings.vue` passes `{ address }` and the flag check; `cacheStore.preselectedTokenAddressToAdd` goes.
- **`SelectTokenCard.vue`** opens the picker with `{ onAdded }` from a new `onTokenAdded` prop. **`send.vue`** passes `pickAddedToken(token)`: it notes the epoch; if `tokens` lacks the token it awaits `reloadTokens()` (a rejection is caught and logged as today); it stops if the page is unmounted (`cancelled`), the epoch moved, or `tokens` still lacks the token; if the token is already active it stops; else it records `keepAmountFor = token.id` and writes `activeTokenIdx`. The token watcher clears the amount unless the new id is `keepAmountFor`, and clears the mark on every run. The kept amount then meets `AmountCard`'s own swap rules: it is cut to the new decimals with the clamp hint, and a USD session exits and clears (fail-closed on the old quote).
- **Corner:** `send.vue` computes `balanceState` for the active token, first match wins: its row has `updatedAt !== 0` → `read` (the last read figure, even if a later sync failed); the row has `syncFailure`, or the page's balance read is `unavailable` with no row → `unavailable`; otherwise (snapshot loading, no row yet, row never synced) → `loading`. `AmountCard` takes it as one prop, default `loading` so a missing prop never shows an unread zero: `read` shows the figure, "0 TST" included; `loading` shows a `Skeleton` (`send-amount-balance-loading`); `unavailable` shows nothing. Input and Max keep `!tokenBalanceByType`.
- **Not taken:** a `variant` enum (one prop, four hidden behaviours; the house's lists take plain props); a composable plus two templates (copies the fold markup); the picker finding the token by contract on `onTokenAdded` (an implicit hand-off, with no signal on an abort).

## Decision ledger

- D1. Plain props on `TokenList` over a variant or a forked template (Not taken).
- D2. Testids by one prefix: the add row is `select-token-add-token`, `-add-token-address`, `-add-token-flagged`, not the brief's `select-token-add*`; one prefix cannot give both those and Holdings' kept `holdings-add-token*`. All other kept and new ids hold.
- D3. The hand-off is the payload-callback pattern of F4, not a store field; one input channel for New token.
- D4. The page owns the add pick, so it keeps the amount (F1) without a store flag; a row pick still clears it (F3, "stays as it is"). It picks only a token its reactive `tokens` holds (Codex 4, Opus 3, final Codex 1). When its re-read is superseded by a later one that has not landed by the time it returns, whether that one then lists the token or fails, the token is added but not picked: the person picks it from the list (a successor that landed first, listing it, still picks it) (the implementation review's Opus pass corrected the earlier "and the later read fails"). A pending-pick watcher, or a re-read that waits on whichever read supersedes it, would cover that and was rejected as a new coordination state; the path needs a token event during the report's own re-read, which runs only when the add's event re-read has not landed. A token picked by hand while the re-read is out wins (implementation Codex round 1).
- D5. The corner's three states mirror `TokenCard`: a figure only once read, a skeleton until then, nothing on failure (today's blank, no new copy).
- D6. Manage tokens stays the sheet's last row: the mockup omits it, the owner did not ask for its removal, and it sits below the add row, not against it.
- D7. The fold hides empty rows, the current one included, as Holdings does; the search field gets no autofocus (today's).
- D8. Accessibility calls (owner's 2026-10-19 delegation): rows are native buttons with the 2 px accent ring on `:focus-visible` and `aria-current` on the current row; after an add, focus returns to `send-token-trigger` (F7, asserted in N1); the add button names its flag line and note with `aria-describedby`.
- D9. "Amount kept" is the token-mode text, through `AmountCard`'s existing swap rules (F6's neighbours at `AmountCard.vue:131-142`, `:346-352`): a decimals clamp with its hint, and a USD session's fail-closed exit. Re-deriving a USD amount at a new token's quote is new behaviour nobody signed, and a pasted token is usually unpriced.
- D10. A full pasted address matches by contract only (Codex 6, F8): the signed rule is "an address a row holds", and a name may hold another token's address.
- D11. E2E size (Opus 10): the flagged paste joins S1's launch (the list-to-flag path is already proven by `token-list.test.ts:147-187`; only the popup-side lookup of a pasted address is new, which a component test proves with the real `usePrices`). N1 drops the never-minted token: `PICK` is minted public only, so its default private side reads "0 PICK" after its first sync, the same zero-corner path at no extra deploy.

## Phases and gates

Commands run from the worktree root unless they `cd`. Every gate also runs `bun run lint` (Biome plus the complexity scan) and `bun run typecheck:all`, exit 0. "Red first" marks a test that fails on the base and passes after; the rest are controls that pass on both.

**1. The shared list** ✓ (F2, F8, D1, D2, D8, D10). Change `TokenList.vue`, `TokenCard.vue`, `utils/token-search.ts`, and `holdings.vue` (the flag check only). `TokenList.test.ts`, red first: the `select-token` prefix renders every id; with `selectable`, a row whose `id` differs from its `token.id` is marked by `token.id`, and a press emits `token.id`; with `selectable` and no `selectedId`, rows are still buttons; `isFlagged` true shows the flag line under an enabled add button that names it (`aria-describedby`), for both prefixes; the note slot shows only with the add row; `sortable=false` drops the sort. Controls: Holdings rows stay `tokens-card` links; `isFlagged` false shows no line. `token-search.test.ts`, red first: a full address matches by contract in either case, never through a name or symbol that holds it; controls: `0x12` matches by prefix, text by symbol and name. `TokenCard.test.ts`, red first: the pick form is a `button`, never an `a`. Gate: `cd apps/extension && bun run test src/popup/components/modules src/popup/pages/holdings.test.ts src/utils/token-search.test.ts`, green.

**2. The picker and the add** ✓ (F3-F5, F7, D3, D4, D6, D9). Change `SelectTokenPopup.vue`, `NewTokenPopup.vue`, `SelectTokenCard.vue`, `send.vue`, `holdings.vue` (the payload), `cache.store.ts`. `SelectTokenPopup.test.ts` replaces its search-threshold cases; red first unless marked: the field shows with one row; no list (so no add row) before the snapshot loads. Case 1: an unheld address shows the add row and the note, and a press opens `new_token` with that address; its `onAdded` calls the opener's and closes the picker. Case 2: a held address in either case narrows to its row, marked if current, with no add row; an empty one stays behind the fold; a press picks it (control). Case 3 (controls): hex that is no address gives no-results; `0x12` filters by prefix; text filters symbol and name; none shows an add row. Case 4: a flagged address in mixed case, through the real `usePrices` and a fake price client, shows the flag line on an enabled add row. Case 6 (control here; S1 proves it): `new_token` closing leaves the picker with its query, its add row and `activeTokenIdx`. `NewTokenPopup.test.ts`, red first, with a popup-store mock that deletes the payload on close: the payload fills the field; `onAdded` runs once with the token for each success outcome; never on a refusal, an abort, another chain or a moved `scopeEpoch`, each beside the success control. `holdings.test.ts:198` moves to the payload. `SelectTokenCard.test.ts`, red first: a tap, Enter and Space open the picker with `{ onAdded }` from its prop. `send.test.ts` with `realAmountCard: true`, red first: `pickAddedToken` keeps recipient and amount, cuts a 6-place amount for a 2-decimal token with the hint, and re-asks the fee; with the report before the re-read and after it (deferred promises), the token ends picked; an unmounted page, a moved epoch, a rejected re-read, or a re-read superseded by one that rejects picks nothing and leaves the active token listed. Controls: the row pick at `send.test.ts:990-1002` still clears the amount; a USD session still clears on the swap. Gate: `cd apps/extension && bun run test src/popup`, green.

**3. The zero corner** ✓ (F6, D5). Change `AmountCard.vue`, `AmountCard.stories.ts` (`NoBalance` reads "0 TST"), `send.vue`. Red first: `AmountCard.test.ts` flips the zero pin to "0 TST" and adds `loading` (a skeleton, no figure; also the default) and `unavailable` (nothing); `send.test.ts` walks `balanceState` through its truth table: snapshot loading, no row, a never-synced row (`loading`), its first sync (`read`, "0"), a first sync that fails (`unavailable`), a synced row whose later sync fails (`read`). Gate: `cd apps/extension && bun run test src/components/composite/send src/popup/pages` green; `bun run --cwd apps/extension build-storybook` and `bun run audit:vue`, exit 0.

**4. End to end** ✓, at retry 0 on Chrome, then on Firefox; each file's vitest time goes in `STATUS.md`.
- S1, smoke, new `apps/extension/tests/e2e/send-picker-add.test.ts`, on a held-list launch with one token row seeded as `send-keyboard.test.ts`'s `openSendPage` does (a held list seeds nothing, and with no token the trigger opens New token instead). Type a recipient; open the picker; paste `E2E_LIST_FLAGGED`'s address and see the flag line on an enabled add row; paste `UNLISTED`, press the add row, see New token filled in, press Escape. New token closes; the picker stays with its query, its add row and focus inside it; Send keeps its token and recipient. Failure mode: the stacked close also closes the picker, the form loses state beneath two popups, or the verified list's flag never reaches a pasted address; a component test mounts one popup at a time and stubs the price client. Estimate 14 s / 18 s.
- N1, `apps/extension/tests/e2e/network/send-picker.test.ts`: the existing test now asserts the field shows with two tokens. A new test deploys `PICK` (public mint) unimported, types a recipient and an amount, and adds `PICK` from the picker. Right after the import it sees focus on `send-token-trigger`, `PICK` picked, recipient and amount kept, and "0 PICK" in the corner (the private side, after the first sync); it flips From to public and sees the minted balance and `fee-estimate`. Failure mode: the add returns without the pick, with a blank or false balance, or with a lost recipient or amount; adding needs a node and the balance projector's timing. Estimate 50 s / 60 s.
- Captures, both themes through `shotSend` under `NULO_E2E_SHOT_DIR`: list and add row, flagged add row (S1), amount card at zero (N1).

Gate, in this order (`e2e:agent` overwrites `dist`, so the smoke build comes after it):
1. `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-picker.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`.
2. For each browser: `env -u EXTENSION_PATH VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`, then `cd apps/extension && env -u EXTENSION_PATH NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- send-picker-add.test.ts holdings-add-token.test.ts token-list.test.ts send-keyboard.test.ts --retry=0`.
3. `bun run test:all`.
All green.

## Security & Adversarial Considerations

- **Threat model:** a pasted address is hostile text; it reaches only `isValidAztecAddress` (hex before `BigInt`), `trimAddress`, Vue text interpolation and New token's sanitizing input. A contract named by it supplies a symbol and a name, cut by the worker (F8); the corner, now drawn at zero for every new token, wraps a 32-character symbol (#625 bounds it). A name that holds another address cannot hide the add offer (D10). A user-named network renders as text. The payload callbacks live in one window's memory and cross no boundary.
- **Scam tokens:** the flag line comes from the signed list (`usePrices.isFlagged`, keys normalised), sits on the add row, and never blocks the add; sends of flagged tokens stay allowed (P18-05 A), and Send's banner and caveat stay. An unflagged token is not a vetted one; a person can spend only what they hold of an attacker's token.
- **Logging:** no new log line; none may carry an address or a balance.
- **Storage:** no stored shape changes; `preselectedTokenAddressToAdd` is memory only.
- **Supply chain:** no new dependency.

## UI impact

Sign-off, the owner's words (decision page 92, record P92-01, 2026-10-28): "Ok -- I in general want to keep "as is" I JUST want to change the token picker to the one you've implemented in "A", and also, I want to add the balance "0" when it's zero. As is today, it just shows nothing for some reason." Select token sheet: before, symbol-only rows with square marks, search only past three rows, Manage tokens last; after, the Holdings-style list ("Your tokens N", pinned rows, value order, fiat or name, both balances, "N empty" fold, the current row marked), "Search or paste an address" always shown, the add row with "Flagged as a scam" when flagged and the note, Manage tokens still last (D6). Amount card: before, a blank corner at zero; after, "0 TST" once read and a skeleton until then. Holdings: unchanged, except a flagged pasted address shows "Flagged as a scam" under its add row, and a pasted address no row's contract holds offers the add even when a name contains it (#1333's one add rule; D10). Light and dark captures go in the PR.

## Delivery

One arc, one PR, the close-out as its final commits. Branch `worktree-send-picker-1`, base `dev`. Title (87 chars): `feat(send): the token picker lists holdings and adds a pasted token; the corner shows 0`. Body: what and why, the UI sign-off quote, the D8 accessibility call, the gates with outcomes, per-browser suite wall-clock before and after, the captures, `Closes #1333`. Opened without labels after the Codex loop; `e2e:extension-smoke` or `e2e:extension-network` added only if a path filter skips a suite. Serial; no lanes.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `0a659726c`, with:
- Loop once over the whole diff: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus review (`Agent`, `opus`, `general-purpose`) beside round 1; three rounds at most.
- `/code-review`: off.
- Close-out: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; lessons; known limits filed closed (at least: closing New token mid balance wait, once the new row has replaced the add row, returns focus to nothing; reopen on a keyboard user's report); `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans`.
- Teardown once merged: `agent-worktree done send-picker-1 --merged --trunk dev`; a `/loop` checks each firing, a `/goal` arms one wait after its report.

## Review verdicts

Each finding was checked against the tree; detail in lessons/phase-0.md.

- **Codex, round 1:** conditional approve; 8 findings, all accepted. Picks compare and emit `token.id`, and the pick form does not hang on `selectedId` (A&I, Phase 1). A USD session's swap still clears; token-mode text is kept through the card's clamp (D9). The payload is kept on show; a moved `scopeEpoch` or an unmounted page reports nothing (A&I). The page re-reads before a pick it does not hold (D4). Focus is asserted after the import and after Escape (S1, N1). A full address matches by contract only (D10). The corner's truth table (A&I). Red-first versus controls, the real `AmountCard`, explicit cwd, `audit:vue`, the armed build (Phases).
- **Opus, round 1:** conditional approve; 10 findings, all accepted. An explicit `selectable` (Codex 1 too). Capture before close, a mock that deletes the payload, the already-synced outcome (F5). Pick only a token a read list holds (D4). The mark cleared on every run and an already-active token skipped (A&I). The list waits for its snapshot (A&I). `aria-describedby` on the add button (D8). Focus order comes from component order, not emit order (F7), and the abort case is a known limit (Post-implementation). Gates: armed builds with `env -u EXTENSION_PATH`, `NULO_E2E_RETRY=0`, `e2e:agent` from the root and before the smoke build, `holdings.test.ts` in phase 1. Tests: `SelectTokenCard`, the page guards, the mixed-case flag through real `usePrices`, the existing row-pick control, case 6 as a control, `loading` as the default. S2 merged into S1 and the never-minted token dropped from N1 (D11).

- **Codex, final pass (fresh session):** conditional approve; 2 conditions. Accepted: D4 picks only when the reactive `tokens` holds the token, with a regression for a superseded read whose successor rejects. Rebutted: a skeleton after a rejected initial balance read needs an active token, which the all-or-nothing identity fetch never sets (`send.vue:684-695`). **Resumed:** approve; condition 2 withdrawn, no material finding left.

## Implementation review verdicts

- **Codex, round 1** (whole arc diff): conditional approve; 1 finding, accepted. A row picked while the import's re-read is out was overridden by the import, which kept the amount typed for the row: the pick now captures the selection before the await and drops itself if it moved (red on the prior head, green after).
- **Opus** (whole arc diff, beside round 1): conditional approve; 4 points. 1, accepted as a correction: any superseded re-read loses the pick, not only one followed by a failure; D4 now says so, the test names what it proves, and the panel's earlier ruling against coordination state stands (put to Codex in round 2). 2, accepted: a stored side that is no digit string reached `BigInt` in the corner's render once the float gate went; the corner parses through `parseSide` and draws nothing (3 red on the prior head). 3, accepted: the held-address press now starts on another token and asserts the pick and the close (fails with the pick removed). 4, an owner question, recorded in `OWNER-ASKS.md`: the import keeps the amount while From/To reset to the default side, as every token change does today; shipped as today.
- **Codex, round 2** (resumed, the fixes above): approve, no new material finding. It confirmed D4's residual as a closed known limit, qualified (a successor that lands first still picks), left an A→C→A pick during one read alone, and named From/To retention the owner's call.
- **Codex, round 3** (resumed; the standard's two review rules and adversarial ask, verbatim, which rounds 1 and 2 had left out): conditional approve. Accepted: the corner trusted stored decimals, so a read zero of a token stored with `decimals: -1` or `1.5` reached `formatBaseUnits` in render; it now checks `isValidDecimals` (2 red on the prior head). Accepted, reworded where the suggested text lost a fact: eleven comments tightened or deleted (narration, feature inventories, one inaccurate clause), and `SelectTokenCard.test.ts`'s header restored to the base's. The loop stopped at its three-round cap; round 3's fixes are gated locally and were not re-reviewed by Codex.

## Seeds

```
/goal Every phase in implementations-plan/send-picker-1/plan.md marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE printed per phase; the Codex loop converged (a resumed pass reporting no new material finding, quoted); the PR with its close-out on GitHub, opened after the loop; `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/send-picker-1 forward per its plan.md and the README's Post-implementation standard: reality check from plan.md and lessons/ (the archived path present on dev means merged: tear down and stop); next pending step; fast gates after each edit; Codex consult instead of waiting; five failures on one step: reassess with Codex; never merge.
```
