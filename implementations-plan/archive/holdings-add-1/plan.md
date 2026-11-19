---
plan: holdings-add-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: c1bca82cb
---

## Outcome

- **Date:** 2026-11-19.
- **Status:** delivered in draft PR #1892 against `dev`, in three arcs. It merges on the orchestrator's word.
- **Owner sign-off:** page 195, 2026-11-19 at 22:14Z. P195-01 approved arc 1 as built, the refusal under the Add row included. P195-02 = 3 and P195-03 = 2 are built in arc 2. Page 197, 2026-11-19 at 23:14Z: P197-01 approved arc 2 as built, and P197-02 = 2 is built in arc 3.
- **Owner asks:** A1 and A2 are answered (§ Arc 2), A3 (§ Arc 3). None is open.
- **Shipped:** `useTokenImport`, the New token import extracted from `NewTokenPopup.vue` and shared, with `contractVerdict`. Holdings' Add imports in one press with the popup's checks, words and toasts. Its row stays busy while the add runs, a refusal shows under it as an alert, and focus lands on the added row. A flagged address, or any before the signed list is read, keeps the popup. `TokenCard` gains `data-token-id` and refuses a repeat Enter. The smoke spec `holdings-add-token.test.ts` is deleted and the network add scenario presses once from the keyboard. Arc 2: the New token popup reads the signed list itself and shows "Flagged as a scam" under a flagged address, for every way in and for a list that lands late; `Input` gains `ariaDescribedby` and `FormPopup` gains `submitDescribedby`. Holdings keeps a searched whole address's row out of the fold, and `focusToken` loses its fold fallback. Arc 3: the field's green check is hidden while the address is flagged. Closes #1881.
- **Dispositions:** D1 and D5 keep the popup for a flagged or unread-list address, and arc 2's line now says why. D8 (focus following an empty row into the fold) is moot under E5 and E6. D9's wait with no timer stays #1681's. The plan audit's ask for a placement of a late refusal is rejected (D6).
- **Known limits:** #1893 (D6).
- **Open items:** none.
- **Lessons:** none promoted. The e2e skill already says `clickByTestId` never focuses (§ focus assertions), and `lessons.md` is at its 8 KiB budget. The dispose-between-helpers finding is in [lessons/phase-3.md](lessons/phase-3.md), and arc 2's log in [lessons/phase-4.md](lessons/phase-4.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below; never run them.

# holdings-add-1: add a token in one press from Holdings (#1881)

The owner, 2026-11-19, on the 1.3.0 candidate: "Importing a token through holdings, once I paste the address I need to click on the "Add 0x0..." which ten opens the pop-up for mporting the token and I need to press again import. That last import token pop-up should not happened if I have already clicked add on holdings? Let's save that step for the user."

Holdings' Add row runs the New token popup's own checks and submit, through one shared composable, and shows the result where the press happened. Every other entry point keeps the popup. The PR is a draft until 1.3.0 is published. Recon: [recon.md](recon.md).

**UI impact.** Holdings, the Add row only. Before: Add opens New token filled in; Import there adds. After: Add adds. While it runs, the row keeps its label and shows the button's spinner; on success it becomes the token's row (or the "N empty" fold for an empty balance) with the same toast as today; on a refusal the popup's sentence shows under the row. A flagged address, or any address pasted before the signed list is read, still opens the popup (OWNER-ASKS A1). Sign-off: the owner's words above for the flow; the refusal's placement is the one thing the owner checks on the captures.

## Assumptions

**Facts**
- F1. The popup's submit is `NewTokenPopup.vue:167-275`; no other code runs its parse → add → balance-wait sequence (recon, reuse map).
- F2. The popup shows no flag, warning or choice: its only messages are the six sentences in recon § "What the popup shows" 1-3. "Flagged as a scam" shows on Holdings under Add (`TokenList.vue:143`). The brief's "a flag" warning case does not hold inside the popup.
- F3. Holdings offers Add only for a curve point no row matches (`TokenList.vue:95-98`), so "Invalid address" cannot reach it; "Already exists" can (a listed token whose balance row for this account is missing), and without that check the add waits with no timer (`token/service.ts:444-451`, #1681).
- F4. `connect()` starts opening the port synchronously, never rejects and does not wait for Ready (`background/client.ts:61-70`); Holdings' reads open its task and balance clients (`holdings.vue:61,69-71`).
- F5. A new balance row reaches Holdings through `onTokenBalanceAdded` (`holdings.vue:58`), and `matchesQuery` matches a pasted contract exactly in any case (`token-search.ts:8-15`), so the row can replace the Add row; it may fold, or arrive before a late refusal (D6).
- F7. `usePrices.isFlagged` is false until the signed list's snapshot lands (`usePrices.ts:35,154`), so an unread list looks unflagged.
- F8. An import also trusts the token's incoming transfers and moves its arrival floor (`incoming-transfer/service.ts:1363-1405`).
- F6. `Button` `loading` keeps the element focusable and only blocks the pointer (`Button.vue:117-120,172`).

**Inferences**
- I1. The toast, the balance wait and the `scopeEpoch` rule carry over unchanged: Holdings sits under the popup today, so its person already sees that toast after an add from there. The identity snapshot precedes the first await, and focus rechecks the epoch after its `nextTick`.
- I2. An inserted `role="alert"` is announced (the house pattern, `AmountCard.vue:566`).

**Asks** (to the owner through `OWNER-ASKS.md`; built as today meanwhile)
- A1. A flagged address: keep the popup (built), one press, or a popup that repeats the flag.
- A2. A just-added token with a zero balance folds behind "N empty" as soon as its balance lands (today too).

## Outcome & Quality Bar

- For whom: a person on Holdings who pasted a contract address and pressed Add.
- Excellent: (1) one press adds, with exactly the checks, words and toasts the popup has, and no second add from a second press; (2) keyboard and screen reader follow it: focus never drops to the page during the add, lands on the new row, and a refusal is announced with focus not moved. An empty token's row folds once its balance lands and takes the focus with it (A2).
- Good enough: one add at a time on Holdings; the Send picker and the other entry points stay as they are.

## Architecture & Implementation

- **`src/composables/useTokenImport.ts`** (new, C1). `contractVerdict(value, tokens)` (pure: `INVALID_ADDRESS`, `ALREADY_EXISTS` or `null`) and `useTokenImport({ tokenService, tokenBalanceService, taskService })` → `{ phase, importToken, importPasted, abort, dispose }`. `importToken(contract)` is the popup's submit body moved verbatim (scope snapshot, `createBalanceWait`, parse, add, chain mismatch, synced shortcut, wait, toast labels, refusal mapping). `importPasted(contract)` first reads `getTokens(profile, chainId)` and refuses on `contractVerdict`, then runs the same body: the field check plus the submit, for a caller with no field. Outcome: `{ kind: "added", token, inScope } | { kind: "refused", message, inScope } | { kind: "aborted" }`; `inScope` = same `scopeEpoch` (and, for an add, the submitting chain). `abort()` ends the wait (the popup's hide, unchanged); `dispose()` aborts and is terminal: a run returns `aborted` at its next step and starts no call. A call while busy returns `aborted`. Callers own `connect`.
- **`NewTokenPopup.vue`**: validator → `contractVerdict`; `handleAddToken` → guard, `void taskService.connect()`, `importToken`, then close / `onAdded` / `error` from the outcome (any refusal, whatever `inScope` says); `onHide` → `abort()`, which now owns the `phase` reset `onShow`/`onHide` wrote; unmount → `dispose()`. `abort` is not `dispose`: a parse refused after a hide still sets the error, which the next show clears, as today (pinned). Its tests pass unchanged.
- **`pages/holdings.vue`**: a `TokenServiceClient`, the importer over the page's own balance and task clients, `adding` (the address in flight) and `addRefusal` (`{ address, message }`). Add: busy → nothing, before anything else; list unread or address flagged → `popupStore.open("new_token", { address })` as today; else `importPasted`. Refusal stored only `inScope`; success `inScope` → `nextTick` → same epoch → `TokenList.focusToken(id)`. The scope watch clears the refusal; unmount disposes and disconnects.
- **`modules/holdings/TokenList.vue`**: props `adding` (default `""`) and `addRefusal`; the Add row stays while `adding` equals the query (the popup's "Loading balance…" analogue, so focus never falls to `body`), `:loading` while any add runs; the refusal line `${prefix}-add-token-error`, `role="alert"`, in the row's `aria-describedby`, shown only for the address it judged. `focusToken(id)` (exposed): only when focus is on `body`, focus the row (`[data-token-id]`, new on `TokenCard`'s root), else the fold toggle when the row is folded. Add, the fold toggle and `TokenCard` rows refuse a repeat Enter (`refuseRepeatEnter`). `TokenCard` is shared by Home, Tokens and the Send picker; both additions are inert there.
- **Scope change**: the page's scope watch aborts the import and a run counter keeps a stale outcome from touching `adding`, the refusal or focus (a profile switch never sends the old row, so the wait would hold Add busy until unmount).
- **Alternative not taken**: a page-local copy of the sequence (the brief forbids a copy); letting the row appear mid-wait (focus falls to `body` for the wait, and an empty row then folds away under focus).

## Security & Adversarial Considerations

- Trust boundary: the pasted address (the search field, sanitized, then `isValidAztecAddress`). It reaches the same RPCs as today (`parseTokenInterface`, `addToken`) with the same `origin: "popup"`; the worker's fence, lock and idempotency (`token/service.ts:351-451`) are untouched.
- Removed confirmation: only for an address the read signed list does not flag; the popup never showed more than the address, which the search field shows whole and the Add row trimmed. A flagged address, or any before the list is read (F7), keeps the popup until A1. The press still trusts incoming transfers as the popup's did (F8).
- Races: a double press (busy guard, one run), a profile, network or account switch mid-add (`scopeEpoch`: no focus, no stale refusal), unmount mid-add (`dispose`, no call after it). No new stored key, RPC, permission or migration; nothing new is logged.

## Decision ledger

Plan audit: Codex (`gpt-6.1-sol`, high), **conditional approve**: handle the unread flag state, keep refusals after a row arrives, guard the whole page action, narrow and recheck focus with repeat-key protection, terminal dispose on rejection, correct and complete `OWNER-ASKS.md`. All adopted except D6. Opus 5.5 lens, **conditional approve**: follow focus to the fold when a focused empty row folds (P3-a), page guard and repeat-Enter (adopted), pin the hide-during-parse quirk (adopted), record the unknown-flag path, the `TokenCard` change and the count over a held Add row (adopted; `ha-adding` is shot after the row arrives), trim page refusal tests to two (rejected: the brief asks one per class on Holdings), add scope-switch and unmount page cases and the e2e focus and price waits (adopted), abort on scope change (adopted, see Scope change).

- D1. Flagged → popup, as today (F2: the popup shows no flag; the flagged flow is the owner's, A1). Codex: agree.
- D2. `importPasted` carries the "Already exists" check; `importToken` stays the popup's exact submit (a submit-time re-read would change the popup in a race, and its tests). One private run behind both. Codex: agree. Its preflight race (another add between `getTokens` and `addToken`) stays #1681's limit.
- D3. Accessibility under the owner's 2026-10-19 delegation: busy = `Button` `loading`, focusable; success → the row, else its fold toggle, only from `body`, the epoch rechecked after `nextTick`; refusal → `role="alert"`, focus stays on Add; Add, fold and rows refuse a repeat Enter. Codex disagreed with the first draft ("anywhere inside the list" could take focus from the sort button; a held Enter would open the row): adopted both.
- D4. Delete the smoke `holdings-add-token.test.ts`: its click step no longer exists and its render checks are `TokenList.test.ts:206-215` and `type-roles.test.ts:623-640`; the network scenario proves the add. Codex: agree.
- D5. Unread signed list → popup (F7; Codex finding 1, demonstrated by trace). A list that never loads keeps today's two presses.
- D6. A refusal that lands after the token's row arrived (a dropped reply after the add landed) shows no line: the row proves the add (Codex finding 2, plausible but unverified, needs a worker restart inside the add). Codex asked for an owner ask on a new placement; rejected: the sentence would say "Something went wrong" over a token that was added, and the popup shows the same misleading line today. Filed as a known limit at close-out.
- D7. `dispose()` returns `aborted` from a rejection or a finished wait too (Codex finding 5, demonstrated); the page checks busy before the flag branch (finding 3).
- D8. Focus does not follow an empty row into the fold (Opus P3-a, demonstrated by the worker's order: `balance-job-queue.ts:402` finishes the task before `:409` sends the balance). Following it needs a watcher on the fold, a new lifecycle for a symptom whose cause, folding the searched row, is the owner's A2; option 2 there removes both. Recorded in A2.
- D9. A wait with no timer (#1681's race, a missed row event) holds Holdings' Add busy until the page is left (Opus P2-c, needs unsupported conditions); #1681 covers it.

## Phase 1 — extract the shared add ✓

1. Add `useTokenImport.ts` and `useTokenImport.test.ts` (≥10 cases: verdict classes, each outcome, listed refusal, account-loading refusal, busy, `inScope` on an epoch move, abort, terminal dispose).
2. Point `NewTokenPopup.vue` at it. Keep every testid and every message.

**Validation gate**: `bun run lint && bun run typecheck:all && bun run test` green; `NewTokenPopup.test.ts` passes with only extraction edits. Layers: lint, typecheck, unit.

## Phase 2 — Holdings adds in one press ✓

1. Wire `holdings.vue` and `TokenList.vue` as above.
2. `holdings.test.ts`: replace the popup pin with: a double press imports once and opens no popup, the row takes focus; a flagged address and an unread list open the popup; one case per refusal class Holdings can reach (already exists, interface, no contract, other) with focus left on Add ("Account is still loading" is the composable test's: Holdings lists nothing without an account). `TokenList.test.ts`: the kept row while adding, the refusal line and its `aria-describedby`, `focusToken` to the row, to the fold, and not from another control.

**Validation gate**: `bun run lint && bun run typecheck:all && bun run test && bun run test:all` green. Layers: lint, typecheck, unit, component.

## Phase 3 — e2e and captures ✓

1. Delete `tests/e2e/holdings-add-token.test.ts` (D4). Update `network/holdings.test.ts:107-143`: Add → "Token added" toast → PASTE row, focused, no New token field; no-contract → `holdings-add-token-error` reads the popup's sentence.
2. Captures (uncommitted kit from `782858322`): `ha-before`, `ha-added`, `ha-refused`, `ha-warning`, each `-light`/`-dark`, plus `ha-adding`, into `~/.cache/nulo-backlog/holdings-add-1/shots/` with `captions.json`.

**Validation gate**: from `apps/extension`, `bun run test:e2e -- tests/e2e/type-roles.test.ts tests/e2e/token-list.test.ts tests/e2e/send-picker-add.test.ts --retry=0`; from the root, `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/holdings.test.ts tests/e2e/network/send-picker.test.ts`, then the same with `NULO_E2E_BROWSER=firefox` (focus moves). All green. Layers: smoke e2e, network e2e, both browsers.

Result: smoke 3 files, 17 tests green; network green on Chrome (add scenario 14.7 s) and Firefox (16.3 s) after one red: the house `clickByTestId` is a synthetic `click()` that moves no focus, so the spec presses Add from the keyboard (`lessons/phase-3.md`). All ten frames shot.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `c1bca82cb`, bounded work: one Codex pass (`run-codex.sh … high read-only gpt-6.1-sol`) over this plan and the net diff from `c1bca82cb`, with the two verbatim rules and the adversarial ask (a check the direct path skips, a double add, a press racing a scope switch, a refusal that disappears); then targeted verification of material fixes. Log it in `lessons/phase-3.md` and below.

Verdict, Codex at `0b6d9066c`: **conditional approve**. One finding, demonstrated by a reproducer: a dispose in the turn between `importPasted`'s listed check and the parse still sent the parse (the outcome was suppressed, the RPC was not). Fixed with a liveness check at the top of `addAndWait`, its regression case red before and green after. Its comment trims were taken, except the case-insensitivity line the extraction moved verbatim. It found the other paths sound by inspection (the shared checks, the busy guard before the flag branch, scope invalidation, the flagged and unread fallbacks, the popup's behaviour and pinned quirk, `TokenCard`'s inert additions) and confirmed D6, D8 and D9 as the documented limits.

## Delivery

Single arc, one PR against `dev`, opened as a **draft** and never marked ready or merged by this lane: `feat(holdings): add a token in one press from holdings`, `Closes #1881`. Body: the owner's words, the rule C note, the refusal placement as the owner's capture check, frame ids, validation. Close-out as the PR's final commits (README § Post-implementation standard step 4); teardown (step 5) after the orchestrator's merge, `agent-worktree done holdings-add-1 --merged`.

## Seeds

`/goal` Phases 1-3 marked ✓ in implementations-plan/holdings-add-1/plan.md with each gate's output in the transcript; one Codex pass over plan + diff with material fixes verified; draft PR open with the close-out archived; `bun run test` and `bun run lint` exit 0.

`/loop 15m` Drive implementations-plan/holdings-add-1 per its plan.md and README § Post-implementation standard; never mark the PR ready or merge; after the close-out, babysit CI only.

## Arc 2 — the page-195 picks

This plan runs past the `light` target of 150 lines because it carries two arcs.

Signed by the owner on 2026-11-19 at 22:14Z, on this PR, which stays a draft until the owner approves the arc's captures:

- **P195-01 approved**: the one-press add as built, the refusal under the Add row.
- **P195-02 = 3** (answers A1): "Two presses, and the pop-up shows "Flagged as a scam" under the address. One line added to the pop-up; its capture comes back to you before it lands."
- **P195-03 = 2** (answers A2): "A searched address never folds: while the search holds a whole contract address, its row shows even when empty, and the focus stays on it."

**UI impact.** The New token popup: "Flagged as a scam" under the address field while the signed list flags the address in it, for every way in (the Tokens menu and its empty state, Settings → Tokens, Send's token card, the Send picker's add row, Holdings' flagged press). Holdings: while the search holds a whole valid address, that token's row stays in view, empty or dust, instead of folding. The Send picker keeps its fold. Sign-off: the picks above; the popup line is the one thing the owner checks on the captures (`ha-flag-popup`).

### Decision ledger (arc 2)

- E1. The popup reads the flags itself: a `PriceServiceClient` and `useTokenFlags`, allocated when it shows and disposed when it hides, the fee window's pattern. The read never touches the network, and a broadcast updates it. Rejected: the flag in the opener's payload (it misses a typed address and four of the five ways in), and a reader built once in setup (the popup stays mounted for the popup's life, so the port would stay open or go deaf after a hide).
- E2. A list read after the popup opened adds the line while the popup is open (the brief's recommendation). Holdings opens the popup when it has not read the list yet, and the popup's own read always lands after it shows, so this is the main path, not a corner case. Pinned by a test.
- E3. Accessibility, under the owner's 2026-10-19 delegation: the line is `role="alert"` and named by `aria-describedby` on the field and on Import. The line always arrives after the autofocused field took focus (E2), so a description alone would stay unread until the person reaches Import. Same pattern as Send's amount refusal (`AmountCard.vue`). The field gets this through a new `ariaDescribedby` prop on `@nulo/design`'s `Input`, the twin of `ariaLabelledby`. Import gets it through `FormPopup`'s new `submitDescribedby`.
- E4. The line goes in `Input`'s `#bottom` slot, in Holdings' style (`type--caption`, `--txt-danger`), with the exact words. Its testid is `new-token-flagged`.
- E5. The fold rule is a `TokenList` prop, `keepSearchedRow`, set by Holdings only. While the trimmed query passes `isValidAztecAddress` (the Add row's own test), no matching row folds. A whole-address query matches only the exact contract (`matchesQuery`), so the rows it keeps are the one the owner named. Rejected: the rule always on (it changes the Send picker, which folds its empty rows), and keying it on `selectable` (that ties two unrelated meanings).
- E6. `focusToken`'s fallback to the fold toggle is removed. With E5, the token Holdings just added is never folded while its address is in the search. A query the person changed during the add leaves focus in the search field, which `focusToken` never takes, and no other caller exists. D8 is moot.

### Phase 4 — the popup line and the kept row ✓

1. `Input` `ariaDescribedby`, `FormPopup` `submitDescribedby`, each with one test case. `NewTokenPopup`: the reader (E1), the line (E3, E4).
2. `TokenList` `keepSearchedRow` (E5, E6); Holdings passes it.
3. Tests. `NewTokenPopup.test.ts`: a flagged wire-shaped address shows the line, which the field and Import name, and an unflagged one shows none; a late read adds the line; a hide disposes the reader. `TokenList.test.ts`: a searched whole-address zero row stays out of the fold, and the fold comes back when the search is cleared; a partial query still folds it; without the prop it folds. `holdings.test.ts`: the searched zero-balance row stays visible and focused after the add, once its balance lands.
4. e2e: in `token-list.test.ts`, the flagged picker scenario presses Add and finds `new-token-flagged` in the popup. That proves the popup's real list read through the worker, which the component test mocks. It adds one step to an existing scenario, not a new scenario.

**Validation gate**: `bun run lint && bun run typecheck:all && bun run test && bun run test:all`. From `apps/extension`: `bun run test:e2e -- tests/e2e/token-list.test.ts tests/e2e/send-picker-add.test.ts tests/e2e/settings-crud.test.ts --retry=0`. From the root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/holdings.test.ts tests/e2e/network/send-picker.test.ts`. Each runs on Chrome and on Firefox, because focus is touched.

Result: static gates and `test:all` green. Smoke: 12 tests green on each browser, and the new step adds about 0.3 s. Network: 4 tests green on each browser ([lessons/phase-4.md](lessons/phase-4.md)).

### Phase 5 — review, captures, delivery ✓

One Codex pass (`gpt-6.1-sol`, high) over the arc-2 diff, adversarial on four points: a way into the popup that misses the line, the late read, a row that never folds again, and focus lost when the search changes. Then targeted verification. Captures come from the lane's kit: `ha-flag-popup` and `ha-empty-kept`, light and dark, plus `ha-warning` re-shot. They are pushed in one commit and removed in the next. The PR body gets the page-195 sign-off.

Verdict, Codex at `2334574d9`: **approve**, no runtime bug. It found all five ways in reach the popup's own reader, a late read and a broadcast update the open popup, and the fold rule is derived from the current query, with the picker never setting it. Taken: one test (a read an earlier showing left out never reaches the current one), two comment nits, and a correction to E6's rationale. Captures: `ha-flag-popup`, `ha-empty-kept` and `ha-warning` re-shot, light and dark. Shooting them raised A3.

## Arc 3 — the page-197 pick

Signed by the owner on 2026-11-19 at 23:14Z:

- **P197-01 approved** (the default, no note): the popup's "Flagged as a scam" line and the searched row that never folds, as built at `45c939bc6`.
- **P197-02 = 2** (answers A3): "Hide the check while the address is flagged, so the red line is the only mark beside the field."

**UI impact.** The New token popup's address field: no green check while the signed list flags the address in it. An unflagged well-formed address keeps the check, and every other state of the field is unchanged. No words change. Sign-off: the pick above.

**Change.** The check's condition gains `!isFlagged`, the flag that shows the line, so the two follow one read, a late one included. No storage, migration, RPC or testid change.

### Phase 6 — the hidden check ✓

1. `NewTokenPopup.vue`: the check's `v-if`. `NewTokenPopup.test.ts`: the flagged case asserts no check beside the line, the unflagged one the check and no line, and the late read takes the check away when it adds the line. Without the change both cases are red.
2. e2e: no spec asserts the check, which has no testid. The flagged scenario of `token-list.test.ts` proves the popup's real read reaches `isFlagged`; the component test proves the check follows it.

**Validation gate**: `bun run lint && bun run typecheck:all`, the extension's `bun run test`. From `apps/extension`: `bun run test:e2e -- tests/e2e/token-list.test.ts --retry=0`, on Chrome and on Firefox.

Result: lint, `typecheck:all` and the extension's `bun run test` green (1,050 files). `token-list.test.ts`: 2 tests green on Chrome and on Firefox ([lessons/phase-6.md](lessons/phase-6.md)).

### Phase 7 — review, capture, delivery ✓

One Codex pass (`gpt-6.1-sol`, high) over the arc-3 diff, adversarial: a flagged state that still shows the check, an unflagged state that loses it, the late read. Capture `ha-flag-nocheck`, light and dark, pushed in one commit and removed in the next. The PR body gets the page-197 sign-off.

Verdict, Codex at `2faf38359`: **approve**, no findings. It traced the check and the line to the one `isFlagged`, found the flag's address normalisation consistent with the field's, a parked read of an earlier showing unable to reach the current reader, and both test cases red without the change. Capture: `ha-flag-nocheck`, light and dark.

