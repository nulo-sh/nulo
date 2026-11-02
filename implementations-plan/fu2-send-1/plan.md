---
plan: fu2-send-1
tier: light
status: plan approved (Codex final approve); arc 1 in review (#1544); arc 2 waits on OA-1, arc 3 on OA-2, OA-3 and A4
issues: "#1517, #1518, #1519, #1520, #1521, #1522"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: origin/dev at 1e6c5bc1f
trunk: dev
post_implementation_hardening: not scheduled
---

# fu2-send-1: Send's origin side, a pasted address, Holdings' split lines, the priority row, and sends in progress on Home and History

Six signed picks from decision page 93 (first-users lab 1, signed 2026-11-02). No issue existed for any of them; this lane filed #1517 to #1522, one per item, each body quoting its pick. Recon: [recon.md](recon.md). Paths are under `apps/extension/src/` unless they name a package.

## Outcome & Quality Bar

- **For whom**: a first-time sender in the 360 px popup or a 240 px sidebar, with a faucet balance that is often all public, waiting 13 to 90 s for a proof.
- **Excellent**: (1) Send opens on the side that can pay, so the amount takes typing at once, and every label reads exactly as the pick says; (2) a send in progress is in view wherever the person lands (a toast) and in History, from the moment of Confirm and after a popup reopen, and leaves both when it is done; (3) the test of each change fails at the base and passes after it.
- **Good enough**: no change to any surface beyond the six picks; no new e2e file or launch.

## Assumptions

**Facts**
- F1. `initSendType` sets From from `cacheStore.preselectedBalanceType`, which only ever holds `"private"`; it never reads a balance (`popup/pages/send.vue:188-201`, `stores/cache.store.ts:43`, `send.vue:812`).
- F2. Send's first load reads tokens, balances and contacts before it calls `initSendType` (`send.vue:718-742`); a token pick calls it from the `activeTokenIdx` watch, and an imported token keeps its sides (`keepFormFor`, `:576-600`).
- F3. `AddressInput.vue` wraps both address fields (`RecipientField.vue:249`, `ContactFormFields.vue:42`) and resets `scrollLeft` only while blurred (`:27-30`); neither field passes `maxLength`, so a paste is the browser's own insertion.
- F4. `TokenCard.vue` formats the total at 10 characters and each side at 6 (`:52`, `:66-67`); `balanceFormatted` cuts by width, never rounds up (`utils/amount.ts:98-137`). `BalanceView.vue:71-77` already formats sides at 10.
- F5. `FeePriorityRow.vue` gives a hovered level the same accent border as the chosen one (`.priority_btn:hover`, `.priority_active`).
- F6. Home lists in-flight journal records (`terminalAt === null`, kind in `ACTIVITY_FEED_KINDS`, in scope) from a journal mirror whose snapshot also covers a send in flight at popup open (`general/RecentActivityView.vue:233,326-337`); History mirrors terminal records only (`pages/activity.vue`, `isTerminal: true`).
- F7. The toast is a singleton: a new open replaces the current one; `info` stays until closed; `openToast` returns an id; `closeToast()` takes none (`packages/design/src/composables/toast.ts`). Send's submit opens no toast until "Transaction submitted" or a failure (`popup/pages/send-submit.ts`).

**Inferences**
- I1. The lab's two outlines on the priority row are the hover rule (F5): the pointer rested on Fast. The screenshot shows both borders in the accent colour, not the UA focus ring. Phase 1 reproduces it.
- I2. Whether a browser scrolls back to the caret after a scripted `scrollLeft = 0` that follows a real paste is browser-specific; only a browser can witness it. A real paste is drivable on both browsers with key events alone (`lessons/phase-0.md`), so phase 2's e2e uses one.
- I3. Formatting the sides at the total's width never cuts a side to fewer decimals than the total shows: a side is at most the total, so its whole part is no longer. A side with fewer significant decimals still shows fewer (1.2 under 4.656; Codex R1).

**Asks** ([OWNER-ASKS.md](OWNER-ASKS.md); arc 1 depends on none of them)
- A1 (OA-1). P93-57: the split lines formatted as the total is (each may show more decimals than the total) or cut to the total's count of decimals. Arc 2 waits for it.
- A2 (OA-2). P93-08: what the Sending toast does when another message replaces it, when the person closes it, and with two sends running. Arc 3 waits for it.
- A3 (OA-3). P93-08 and P93-09: whether History's pending rows include a dApp's operation, and what the toast says for a send whose amount the wallet cannot read. Arc 3 waits for it.
- A4 (orchestrator, not a screen question). The mirror's event replay (Architecture, arc 3 amendment) is a coordination change in a shared composable; arc 3 waits for its approval.

## Architecture & Implementation

- **P93-01** (#1517, arc 1): new `popup/pages/send-sides.ts` exports `openingSendSide(row)`: `"public"` when the row's public side parses above 0 and its private side parses as 0, else `"private"` (`parseSide`; a missing or malformed row reads private). `initSendType`'s preselect branch (both transfer kinds supported, `keepSide` false) takes `openingSendSide(tokenBalance.value)` instead of `cacheStore.preselectedBalanceType`. The forced-side branches, the receiver and the paste-to-add path stay. #1470 later moves the other side rules into the same file.
- **P93-26** (#1520, arc 1): `.priority_btn:hover` sets `background: var(--nulo-surface-low)` (the house hover on Send's rows, `RecipientField.vue:368-370`) instead of the accent border; `.priority_active` alone draws the accent border.
- **P93-55** (#1518, arc 1): `AddressInput.vue` adds a native `input` listener: when `inputType === "insertFromPaste"`, it sets `scrollLeft = 0` once the value has landed (`nextTick`); every other input keeps the browser's caret-following scroll. Removed in `onBeforeUnmount` with the other three. The real-paste e2e decides whether `nextTick` holds: Opus R1 traces Blink revealing the caret after `insertFromPaste` dispatches, which would undo it, and Codex R1 asks for the evidence first. If either browser scrolls back after `nextTick`, the reset moves to `requestAnimationFrame` (after the paste's reveal, before paint), recorded in the ledger with the measurement.
- **P93-57** (#1519, arc 2, after OA-1): the split line gains a `token-split` testid (the total already reads the same digits, so a text match proves nothing). On answer A, `TokenCard.vue` formats each side as the total, `balanceFormatted(raw, decimals, 10, { compact: true })`; on B, each side is cut to the total's count of decimals, with a non-zero side below the last shown digit reading `<0.001` (the formatter's hint form) and a compact side kept compact.
- **One source for sends in progress** (#1521, #1522, arc 3, after OA-2 and OA-3): new C1 composable `composables/useSendsInProgress.ts`, built once in `popup/app.vue` beside `useArrivals` and provided by an injection key as it is. It owns the shell's journal mirror (`useJournalMirror`, its own `OperationJournalServiceClient`, connected and disconnected by app.vue) over the active scope; a lock or a scope change empties it. It exposes the in-scope in-flight records (`isInFlightActivityOp`, a new predicate in `utils/journal-state.ts` that Home's filter also calls), newest first. The toast and History read this one list, so they cannot disagree; Home keeps its own mirror, which also carries terminal records and task decoration. It never runs in a dApp window (an explicit route gate: `useArrivals`' scope does not exclude those routes).
- **P93-08** (#1521, arc 3): the composable announces each in-flight `transfer` it has not announced (the list at popup open, then each addition) with `{ kind: "info", label: "Sending <amount> <symbol> to <0x0c2b…4b5c>" }`, and closes the toast when that record leaves the list, only if the toast showing is its own. On a lock or a scope change it closes its own toast first, then drops its state; after an unlock a send still running is announced again, as at popup open. The symbol and decimals come from app.vue's token lookup (`arrivalsTokens`, `app.vue:104-108`); the lookup is fenced by the epoch and the record's state, so a record that ends or a scope that moves during it announces nothing. Interruption, dismissal and several sends follow OA-2. The summary is the one `send-submit.ts` builds for "Transaction submitted", moved into `utils/` and shared; the amount is parsed with `parseSide` before it is formatted, and the address checked with `isValidAztecAddress`. Send's submit path does not change: its success or failure toast replaces this one.
- **P93-09** (#1522, arc 3): History lists the injected records first (scope as OA-3 says), filtered by `?token=` like every row, as `TransactionAwaitingCard`s (the layout its settled rows share) with Home's title, icon and chip helpers, the stage line `Pending · <progress word>`, and no action. The progress word is Home's own: the journal-only part of `awaitingSubtitleFor` (a queued send reads "Waiting for your earlier send", proving names its backend) moves into the shared util, so History and Home read the same word. The empty state (`activity.vue:220-224`) counts the pending rows. Its terminal mirror stays as it is. `filterPendingDoubleRender` moves from Home's feature folder into `utils/` (its element type kept) so History hides a pending chain row that a `submitting` record names. Home's amount and symbol helpers move into a shared util with the same `parseSide` guard.
- **Arc 3 amendment, needs design approval before arc 3 (A4)**: `useJournalMirror` lets a snapshot that began before an event and lands after it overwrite that event (`useJournalMirror.ts:55`, pinned by `useJournalMirror.test.ts:63`). Codex final reproduced a terminal update undone by such a snapshot, which would leave a ghost pending row and a Sending toast up after the send ended; the worker's `getOperations` decodes after reading raw rows, so a transition can commit between the two (production timing plausible but unverified). Fix in the mirror: record the events that arrive while a snapshot is out and replay them over it when it lands. It adds transient state and an ordering contract (a superseded or failed snapshot drops its record; a delete replays as a delete; a scope change and `dispose()` clear it). Home's and History's terminal mirrors gain it too; the pinned test changes meaning.
- **Not taken**: a toast opened from Send's submit (it misses a send in flight at popup open, and is a second source); moving Home onto the shell's list (its mirror holds terminal records and decoration; a refactor no pick asks for); polling or a second mirror for the snapshot race (more obligations than the replay); a roving tablist for the priority row (D4). `utils/in-flight-send.ts` is not the predicate: it guards scope switches for popup sends by stage and is not the activity set.

## UI impact

Every pick: decision page 93, signed 2026-11-02. Each PR body quotes the picks it ships and carries before and after captures (light theme, Chrome) of every surface it names.

1. Send, From origin and the amount block (arc 1). P93-01, B: "Send opens on the side that holds the token's balance when only one side has any, and on Private when both do." A public-only holding opens on Public, with its balance and Max on; on a token pick too (D1).
2. Send's recipient and the add and edit contact forms' address field (arc 1). P93-55, B: "After a paste the field scrolls back to the start; while typing it follows the cursor as now."
3. Send's priority row (arc 1). P93-26, the owner's note: "For now, let's only fix "stop showing two levels outlined at once"". A hovered level takes the surface tint, not the outline (accessibility call under the owner's 2026-10-19 delegation, D4).
4. Holdings, Home's token list and Send's token picker, which all draw `TokenCard`'s split lines (arc 2). P93-57, B: "The split lines use the total's decimals." 999.999 public reads "999.999" on both lines under either answer to OA-1; the pick names Holdings only, so OA-1 also asks the owner to confirm the other two.
5. Any screen while a popup send runs (arc 3). P93-08, D: "A toast stays until the send is done: “Sending 10 TST to 0x0c2b…4b5c”."
6. History (arc 3). P93-09, B: "History lists sends in progress at the top, marked “Pending” with the progress word, and they become normal rows when done."

## Security & Adversarial Considerations

- **Privacy**: a public origin names the sender on chain. P93-01 starts a send on Public only when the private side is empty, where a private send cannot run at all; From, the privacy strip and the review still show the side. The panel recommended C for this reason; the owner signed B.
- **Hostile data**: balance strings and journal records come from storage. `parseSide` refuses a malformed side (Send reads private). Arc 3 parses `amountRaw` before `balanceFormatted`, which would throw on a non-integer string (Codex R1: demonstrated at the formatter; a journal row carrying one needs a writer the wallet does not have, as the journal is sealed and outside backups), and checks the recipient before it builds the toast.
- **Scope**: the shell's list holds only the active scope; a lock or a switch closes the toast it owns before its state goes, so another profile's amount and recipient never stay on screen. **Logging**: no new log line. Crypto, permissions, supply chain: no change.

## Phase 1: reproduce, then Send's opening side and the priority row (arc 1) ✓

- Reproduce the arc's three items on armed base builds with the scratch spec (`lessons/phase-0.md` holds the results); its screenshots are the "before" captures.
- Change `send-sides.ts`, `send.vue` and `FeePriorityRow.vue` as above.
- **Tests**: unit `send-sides.test.ts`, one table: public only → public; private only, both, neither, a missing row, a malformed side → private. Component `send.test.ts`: a public-only row opens on Public (red at the base, by behaviour) and a pick of a public-only token switches From to Public; the existing both-sides fixture stays Private (control).
- **Validation gate**
  - `bun run lint`, `bun run typecheck:all`: exit 0.
  - From `apps/extension`: `bun --bun vitest run src/popup/pages/send src/popup/components/modules/send --retry=0`: green; the two page cases red with the base's `send.vue` (`git show 1e6c5bc1f:<path>`).
  - Network, from the repo root: `NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/fee-methods.test.ts --retry=0`, and the same with `NULO_E2E_BROWSER=firefox`: pass. Its fee walks hold a public-only balance, so they assert the public opening, then pick Private (D9).

## Phase 2: the pasted address, and both browser checks (arc 1) ✓

- Change `AddressInput.vue` as above.
- **Tests**: `AddressInput.test.ts`, focused: an `insertFromPaste` input resets `scrollLeft` to 0; an `insertText` input leaves it (control).
- **E2E**, two assertions inside existing `tests/e2e/send-keyboard.test.ts` tests, so no new launch:
  - Paste (in the destination test): type a 66-character address into the field, Ctrl+A, Ctrl+C, Backspace, Ctrl+V. The field holds the address, `scrollWidth > clientWidth` and `scrollLeft === 0`; one typed character then leaves `scrollLeft > 0`. A real paste's own event order is the failure mode; jsdom lays nothing out. Red at the base (242 of 554 on both browsers).
  - Hover (in a test whose fee card shows the priority row): Normal chosen, the pointer on Fast: Normal's border is the accent, Fast's is not. Only a browser computes `:hover`. Red at the base.
  - Estimated +2 s per browser; each file's measured duration, base and after, in the PR body.
- **Validation gate**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run audit:vue`: exit 0.
  - From `apps/extension`: `bun --bun vitest run src/components/composite/general src/popup --retry=0`: green; the paste case red at the base.
  - Smoke, from `apps/extension`, on an armed build of this source: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/send-keyboard.test.ts tests/e2e/send-fee-privacy.test.ts tests/e2e/send-outcome-rows.test.ts tests/e2e/send-picker-add.test.ts tests/e2e/contacts.test.ts --retry=0`; the same with `build:firefox` and `NULO_E2E_BROWSER=firefox`: pass. The two new assertions red against the base dist (`EXTENSION_PATH` at it).
  - The scratch spec on branch builds: the "after" captures.
  - `bun run check:plans` after staging: exit 0.
  - After CI: each browser's smoke suite wall-clock, before and after, by the `e2e-testing` skill's § Runtime budget, in the PR body.

## Phase 3: Holdings' split lines (arc 2, after OA-1)

- Change `TokenCard.vue` as the answer says. **Tests**: `TokenCard.test.ts`, on the `token-split` testid: 999.999 all public shows "999.999" on the public side (red at the base on the digits: the red run uses the base `TokenCard.vue` with only the testid added, failing on "999.99"); `:370` re-premised to the chosen form; on B, a non-zero side below the last shown digit reads the hint. **Gate**: lint, `typecheck:all`, `test`, `test:all`, `audit:vue` exit 0; `bun --bun vitest run src/popup/components/modules --retry=0` green; smoke `holdings-add-token`, `rows`, `type-roles` on both browsers; captures of Holdings, Home's token list and Send's picker at 360 px, and Holdings at 240 px with a 1,234.5678 / 1,234.5678 row (if the line no longer fits, stop and ask).

## Phase 4: sends in progress, the toast and History (arc 3, after OA-2 and OA-3)

- Add `useSendsInProgress.ts`, wire it in `app.vue`, change `activity.vue`, `journal-state.ts` and Home's filter, move the summary, the amount helpers and `filterPendingDoubleRender` into `utils/`.
- **Tests**: `useSendsInProgress.test.ts`, at least ten cases: announce from the list at open; announce on an addition; close on terminal while its toast shows; no close of another caller's toast; a lock and a profile switch (same address, A to B to A) close its own toast first, and an unlock announces a send still running; a terminal update, a lock or a switch during the token lookup announces nothing; another scope's record and a `dapp_execute` get no toast; a malformed amount gets the OA-3 form; `dispose()` is terminal; plus OA-2's cases. `activity.test.ts`: an in-flight transfer lists first with `Pending · Generating proof...` (and `Proving in browser…` for the browser backend, `Waiting for your earlier send` when queued), no action, and no empty-state line beside it; on success it hands off to exactly one chain row, on failure to exactly one terminal row; a `?token=` of another token hides it; a submitting record hides the pending chain row of its hash while an unrelated pending chain row stays. Home's tests stay green unchanged.
- **Gate**: lint, `typecheck:all`, `test`, `test:all`, `audit:vue` exit 0; `bun --bun vitest run src/composables src/popup src/utils --retry=0` green, the page cases red at the base; smoke `rows`, `home-links`, `snackbar` on both browsers; captures of History and of Home with the toast, with an in-flight record seeded after the worker starts (`helpers/activity-seeds.ts` `seedJournalRecord` writes a terminal one; the capture writes `terminalAt: null` and an in-flight stage).

## Decision ledger

- D1. P93-01 applies wherever Send picks a default side for a token: at open and on a token pick (the same initializer). A paste-to-add keeps the sides (#1341). Neither side funded opens on Private. A public-only balance that lands after Send opened leaves From where it is (Opus R1): moving it needs a "person chose From" flag and moves a control under the person; known limit #1537.
- D2. P93-55 keys on `inputType === "insertFromPaste"`, not on a `paste` event flag: a paste that changes nothing fires no `input`, and a flag would then reset the scroll on the next typed character. Codex R1 agreed.
- D3. P93-57's two readings differ on screen (0.0005 + 999.9985 under 999.999: four decimals per side under A; "<0.001" and "999.998" under B), so the owner chooses (OA-1, Codex R1). The planner recommends A: B's cut makes the sides read less than the total again, the reason the owner gave.
- D4. P93-26: the hover state is a delegated accessibility call; it takes the house hover tint. Codex R1 asked for the house roving tablist too; not taken: the owner limited the item to the outline ("For now, let's only fix"), and the keyboard model of the row is its own change, filed as #1535.
- D5. Browser checks only where a browser is the only witness: the real paste and `:hover` (Codex R1 asked for the hover one). P93-01 and P93-57 are proven at the component layer; the captures are the visual evidence.
- D6. Arc 3 reads one shell-owned list (Codex R1: a shared predicate over separate mirrors lets two views disagree while a snapshot lands). The toast covers popup sends, the copy the pick names. "Pending · <word>" is the stage line, the one place the card shows text beside its spinner, and History's pending row carries no action: the pick names none (Codex R1: close readings).
- D7. Arc order: arc 1 needs no answer and ships now; arcs 2 and 3 wait on their asks and touch files arc 1 leaves alone.
- D8. As built: the paste reset runs on the next animation frame. With `nextTick` the real paste still read `scrollLeft` 242 of 554 two frames later on Chrome and Firefox 158, since both reveal the caret after the `input` event; with `requestAnimationFrame` both read 0, and a typed character then scrolls to the caret (250). The hover check waits for `:hover` to apply: a wait on settled transitions alone read Chrome before the hover and passed at the base.

- D9. P93-01 moves the opening side of two network fee walks (`fee-methods.test.ts`, "no gas at all" and "both gases held"), whose fixtures mint public only: both timed out at the base of this fix waiting for a Private origin (Opus fix R1). Each now asserts Send opens on Public, a network witness for P93-01, then picks Private. No other e2e opening-side assertion needs changing (`send-fee-privacy` asserts Private on an unfunded fixture).

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | conditional approve | D3 and the toast and History presentation questions to the owner (OA-1 to OA-3); a real-paste and a hover browser check; one shell-owned list for the toast and History; the owned toast closed before a scope change drops it, lookups fenced; amount and address checked before the toast; History's handoff, backend and unrelated-row tests; `filterPendingDoubleRender` into `utils/`; `audit:vue` and the suite wall-clock in the gates; I3 restated | the roving tablist (D4, filed as #1535); an event overlay in the mirror (reversed by Codex final: A4) |
| Opus R1 | conditional approve | the real-paste witness (the execCommand emulation is none, confirmed in `lessons/phase-0.md`); the `nextTick` versus animation-frame question settled by that witness; the split line's testid; Send's picker and Home's list named for OA-1; the late-balance known limit (#1537); the toast's token lookup and its races; the unlock rule; History's progress word and empty state; History injects the shell's list | none |
| Codex final (fresh) | conditional approve, arc 1 may proceed | OA-1's wording (no "adds up" promise; "at most" under B); the base-red proof with the testid alone; the pending seed for the arc 3 captures; the mirror's event replay as an arc 3 amendment needing approval (A4); `utils/in-flight-send.ts` named and set apart | none |
| Codex final (resumed) | approve | none; arc 1 may proceed, arcs 2 and 3 wait on their asks; A4 not granted by the review | none |
| Codex fix R1 (arc 1) | changes requested | cancel a pending paste reset on every input, so a key typed before the frame keeps the caret (test red with the old order); two comments trimmed | none |
| Opus fix R1 (arc 1) | changes requested | the network fee walks pick Private after the public opening (D9), and `fee-methods.test.ts` joins the gate on both browsers; messages on the two new smoke assertions; Send's `flagged-send` capture in `token-list.test.ts` now shows Public, noted in the PR | none |
| Codex fix R2 (arc 1) | approve | D9's sweep sentence corrected | none |

## Delivery

- **Arc 1** (phases 1-2; #1517, #1518, #1520), now: branch `worktree-fu2-send-1` to `dev`, `gh pr create`, ready, no labels at creation. Title: `fix(send): open on the funded side, show a pasted address's start, outline one priority` (87 characters). Body: each pick quoted with its captures, the accessibility call, the gates, the e2e durations and wall-clock, `Closes #1517`, `Closes #1518`, `Closes #1520`.
- **Arc 2** (phase 3; #1519), after OA-1, off `dev`: title `fix(holdings): the split lines use the total's decimals` (55 characters); `Closes #1519`.
- **Arc 3** (phase 4; #1521, #1522), after OA-2 and OA-3, off `dev` or stacked with `gh stack` on whichever arc is open: title `feat(activity): a send in progress shows as a toast and as a pending history row` (80 characters); `Closes #1521`, `Closes #1522`. The close-out is the last arc's final commits.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `1e6c5bc1f`, with these values:

- Step 1 is absent (`code_review: off`). Step 2 per arc over that arc's diff (arc 1 from `1e6c5bc1f`), then one fresh pass over the net diff after the last arc: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written. Close-out: the Outcome block; lessons promoted with a pruning pass; a comment on any issue left out; `STATUS.md` deleted; `git mv` to `archive/fu2-send-1/` in its own commit; the index line moved.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/fu2-send-1/plan.md`, then `agent-worktree done fu2-send-1 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1-2 ✓ in implementations-plan/fu2-send-1/plan.md, each gate passing in the transcript; the Codex loop converged on arc 1's diff from 1e6c5bc1f; a ready PR to dev closing #1517, #1518 and #1520; `bun run test` and `bun run lint` exit 0. Phases 3 and 4 only once their asks are answered.
- `/loop 15m` Drive implementations-plan/fu2-send-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, the close-out; never merge.
