---
plan: ui-dedupe-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ ced2c51c
standard: implementations-plan/README.md § Post-implementation standard, read at ced2c51c
---

# ui-dedupe-2: the two ui-dedupe-1 leftovers the owner signed

Decision page 59 (2026-10-19), both option B. Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md).

| Pick | Issue | Text (quoted by id in the PR body) |
|---|---|---|
| P59-01 = B | #839 | "Converge all five onto Home's rules, as your earlier pick did for the seven; the held Holdings row converges with them." |
| P59-02 = B | #840 | "Add the one missing check, so a dropped run stops before it builds clients or calls the service; the pinned test flips to prove the stop." |

## Outcome & Quality Bar

- **For whom**: a person whose wallet meets one of the rare orders #839 names (an event that overtakes a read, a refused read after a reconnect), and the next maintainer of the two mirrors.
- **Excellent**:
  1. Each list follows Home's rule in every order #839 names, and each mirror keeps only the options that still have a caller (`added: "replace"`, `place`). A test names each converged row, red over the old code; each replaced test is red over the new code.
  2. A dropped export run makes no client and no key request; nothing else in the export changes.
- **Good enough**: no new option, abstraction or e2e scenario. Home's own behaviour stays identical: its suites pass unchanged.

## Assumptions

**Facts** (verified at `ced2c51c`):
- F1. `runBackup` resumes after `await openRun(...)` with no currency check, then builds clients and calls the key export (`composables/useFullBackupExport.ts:334-344`); the pin is `useFullBackupExport.test.ts:350`. The source pin counts 12 awaits (`:527-530`).
- F2. The token-balance hook's options: `added: "keep" | "replace" | "append"`, `insertUnseenUpdated`, `refetchWhenDirty` (`composables/useTokenBalanceSnapshot.ts:10-34`). Callers: Holdings `replace`, `insertUnseenUpdated: true`, `refetchWhenDirty: false` (`popup/pages/holdings.vue:48-55`); Select token `refetchWhenDirty: false` (`popup/components/popups/SelectTokenPopup.vue:72-82`); Send `append` (`popup/pages/send.vue:164-170`); Home's `TokensView` and `BalanceView` take the defaults.
- F3. The journal mirror's options: `appendAdded` (`utils/journal-mirror.ts:13-17`), `dropRefusedUpdate`, `supersede` (`composables/useJournalMirror.ts:6-21`). Callers: TokensView `place: "back"`, `appendAdded`, `supersede: false` (`TokensView.vue:59-70`); History `place: "front"`, `dropRefusedUpdate`, `supersede: false` (`popup/pages/activity.vue:82-93`); Home's `RecentActivityView` the defaults (`:232-246`). The store calls the reducers with `{ place: "back" }` only (`stores/app.store.ts:345-347`).
- F4. Home's journal retry lives in its page, not the mirror: on a refused read, if the run is current, one timer re-runs it after 2 s on the same run, again after each refusal (`RecentActivityView.vue:248-250`, `:616-630`, cleared at unmount `:830`).
- F5. `terminalAt` is set on a terminal transition and otherwise kept, never cleared (`wallet/services/operation-journal/service.ts:388`, created `null` at `:309`). So History's refused update is only a late copy of an earlier non-terminal state (D605 of ui-dedupe-1 holds).
- F6. History's `onMounted` awaits the journal read; a refused read aborts the rest of the mount, so the received-transfer read and the config connect do not run (`activity.vue:161-174`). `useIncomingTransfers` connects nothing itself (`composables/useIncomingTransfers.ts:145-170`). `activity.test.ts:397` pins the abort reaching Vue's error handler.
- F7. Send shows the first row whose `token.id` matches the selected token (`send.vue:174-176`); a token id belongs to one chain.
- F8. `send.test.ts:993` pins `append` with a nonzero add that reuses a listed balance id for another token. A reused id needs a worker restart (ids are fenced for a worker's lifetime, `wallet/services/token-balance/service.ts:266-274`), and the new worker's Added can reach the new port before the reconnect's read lands (`packages/extension-messaging/src/background/service.ts:55`, `client.ts:152-187`). But a created row's Added carries zero balances (`token-balance/service.ts:291-306`), and its first Updated replaces the first row with that id (`useTokenBalanceSnapshot.ts:66-70`): under `keep` and `append` alike the selected token shows the same amount at every step.

**Inferences** (each checked by its gate):
- I1. Removing the three balance options and `append` changes no Home behaviour: Home already runs the defaults (F2).
- I2. Moving Home's retry into the mirror keeps Home's timing exactly: the same run, the same 2 s, re-armed after each refusal, dropped once the run is stale or the view is disposed. `RecentActivityView.test.ts:1057` and `:1083` pass unchanged.
- I3. Row 2 (Send) has no screen effect (F7, F8 and #839's trace), so it has no red-over-old test; a control proves the equivalence (D5).

**Asks**: none open. D3's alternative (the mirror swallows refusals) would change History's received rows in an order #839 does not name; the plan does not build it, and `OWNER-ASKS.md` says so.

## Architecture & Implementation

**#840 (phase 1).** `runBackup`: `if (opened === "handled" || !isCurrent()) return`, and the two-line comment that marked the gap goes. No await is added, so the source pin keeps 12.

**#839, balance family (phase 2).** In `useTokenBalanceSnapshot`, `insertUnseenUpdated`, `refetchWhenDirty` and `added`'s `append` go with their last callers. An in-scope add or update always marks a run dirty, and a dirty run reads again (Home's rule); an unseen update is never listed. `added` keeps `"keep" | "replace"` (Holdings' deliberate difference). Holdings drops two options, Select token one, Send one.

**#839, journal family (phase 3).**
- `utils/journal-mirror.ts`: `appendAdded` goes; `JournalAddRules` is gone and `journalAdded(rows, op, place)` takes `place` as `journalUpdated` does. The store passes `"back"`.
- `useJournalMirror`: `dropRefusedUpdate` and `supersede` go, so a later run always supersedes and a refused update changes nothing. The retry moves in from Home (D3): the catch wraps `await read()` only. On a refusal, while `run()` holds, it clears any armed timer and arms one that re-runs `resnapshot(run)` after `RETRY_MS = 2_000`, that call's own refusal swallowed; current or stale, it then rethrows to the caller. `dispose()` clears the timer.
- Home: `resnapshotJournal(run)` becomes `journal.resnapshot(run).catch(() => undefined)`; `JOURNAL_RETRY_MS`, `journalRetry` and its unmount clear go. Its comments move with the code they describe.
- TokensView drops `appendAdded` and `supersede`; History drops `dropRefusedUpdate` and `supersede`. Each keeps its own handling of the rejection (TokensView swallows, History's mount aborts as today, F6). History's no-profile check moves from `loadTerminalJournalOps` into its `read`, which answers `undefined` (lands nothing), so a retry obeys it too (D7).


## Security & Adversarial Considerations

- **Threat model**: no new trust boundary. The export still binds a run to one session of one profile; #840 only stops earlier. A run dropped in the open-run hop now builds no client and requests no key; one dropped while its key request is out still receives the answer and discards it, as today. The mirrors read the wallet's own worker; journal and balance rows are the worker's records, not dApp input.
- **Containment**: every scope and account filter stays (`accept`, `inActiveScope`, `scopeFence`, Home's captured-account read, the render filters). The retry re-runs its run, so a later run or an unmount drops it, and no request follows an unmount, which would reconnect a client (`useJournalMirror.ts:42`). Home's scope watcher begins a run, so a scope change drops Home's retry. History and TokensView have no journal scope watcher (as today): their retry reads the live profile, and their render filters keep the screen to the active scope. The journal service still answers only for its own profile. Adding scope watchers there would change switching behaviour, so the plan does not.
- **Logging, supply chain, crypto, privileges**: no new log line; nothing else touched.

## UI impact

- **Home's token-import rows** (P59-01 rows 3 and 5): an import is listed once; a read overtaken by a later one lands nothing (the mount's by the first connect's), and a refused one is retried after 2 s, so a failed add no longer stays "Adding token…". Before and after pictures of row 5 in the PR body, Chrome 400×600, light and dark (before: `implementations-plan/archive/ui-dedupe-1/screenshots/oa3/`).
- **History's cancelled and failed rows** (rows 4 and 5): a late earlier update keeps the row; a read overtaken by a later one lands nothing, and a refused one is retried after 2 s. No picture: the harness cannot schedule the worker's lock (#839 § Pictures).
- **Holdings and Select token** (row 1 and the held row): an add during a read survives it; an unseen update waits for the next read. No screen effect found (#839 § Pictures); no picture, and the body says why.
- **Send** (row 2): none (F7).
- **Full backup** (P59-02): none.

## Phases

**Phase 1 — #840.** ✓
- Change: `composables/useFullBackupExport.ts` (F1 line). Test: `useFullBackupExport.test.ts:347-366` becomes "a discard in the open-run hop stops the run before it builds clients or requests its keys": the same `profileId` getter discards in the hop; `exportCalls()` is 0, nothing is built, and `expectNothingPublished` holds. The success controls ("a current run") stay.
- Gate: `bun --bun vitest run src/composables/useFullBackupExport.test.ts` (in `apps/extension`) green; the base test file over the new code red on the old case; the new case red over the base composable; `bun run lint`, `bun run typecheck:all`.

**Phase 2 — #839 rows 1, 2 and the held row.** ✓
- Change: `useTokenBalanceSnapshot.ts`, `holdings.vue`, `SelectTokenPopup.vue`, `send.vue`.
- Tests (D5):
  - hook: the cases "an unseen update is ignored; with insertUnseenUpdated…", both `added: append` cases and "refetchWhenDirty: false lands…" go; the Home halves they carried are already default cases or stay as one.
  - `holdings.test.ts`: "live events: … an update lists an unseen one of this chain" → "… an update for an unseen row of this chain waits for the next read"; "a read in flight lands over an add that came meanwhile" → "a read in flight reads again over an add that came meanwhile, which stays".
  - `SelectTokenPopup.test.ts`: the same read-over-add case, flipped the same way.
  - `send.test.ts:993` (F8) → a control: the reconnect's read is held; the new worker's zero Added for the listed id, then its Updated, then the read lands; Send's amount for both tokens is asserted after each step. Green over base and new (I3), so exempt from D6.
- Gate: the four suites and `send.integration.test.ts` green; each new case red over base; each replaced base case red over the new code; mutations (D6) red; lint, typecheck.

**Phase 3 — #839 rows 3, 4 and 5.** ✓
- Change: `journal-mirror.ts`, `useJournalMirror.ts`, `RecentActivityView.vue`, `TokensView.vue`, `activity.vue`, `app.store.ts`, and the regenerated `types/auto-imports.d.ts` (it re-exports `JournalAddRules`; CI fails a build that changes a committed generated file).
- Tests:
  - `journal-mirror.test.ts`: the appending case goes; the others take the new signature.
  - `useJournalMirror.test.ts` (the 10-case floor holds): the `supersede: false` and `dropRefusedUpdate` and `appendAdded` cases go; "a rejected read rejects to the caller…" → "a refused read rejects to the caller, keeps the rows, and is retried on its run every 2 s until one lands"; new "a retry armed for a run a later run superseded reads nothing", "a superseded run's late refusal arms nothing and leaves the current run's retry armed", "dispose cancels an armed retry, and a refusal after it arms none".
  - `TokensView.test.ts`: the `(BUG PIN)` listed-twice case → "an add for a listed import replaces it where it is, and its end reaches the one row"; "a reconnect reads again, and its refused read keeps…" → "a reconnect's read supersedes the mount's, and a refused one is retried after 2 s".
  - `activity.test.ts`: "an update it refuses drops its row…" → "an update it refuses keeps the row where it is"; the reconnect case flips as TokensView's; new control "a retry armed under one profile reads the live one, and none runs with no profile" (D7); every case that ends on a refused read unmounts, `:397` included, so its timer dies with it; `useJournalMirror.test.ts:72` disposes its mirror.
  - `RecentActivityView.test.ts` and the store's suites: unchanged and green (I2).
- Gate: as phase 2, over these suites; mutations (D6) red.

**Phase 4 — validation and pictures.** ✓
- `bun run audit:vue`; `bun run test:all`; smoke on Chrome, then Firefox, on the armed build, `--retry=0`, load1 under 150: `holdings-add-token`, `token-list`, `send-outcome-rows`, `type-roles`, `navigation`, `send-keyboard` (`recon.md` § E2E). No network subset: the journal's import path is unchanged. Pass: every spec green on both browsers.
- Row 5's after pictures: ui-dedupe-1's scratch spec (outside the repo, copied into `tests/e2e/` only for the run, never staged) on the new Chrome build with `NULO_E2E_SHOT_DIR`; the shots land in `implementations-plan/ui-dedupe-2/screenshots/`.

## Decision ledger

| Id | Decision | Rejected | Who |
|---|---|---|---|
| D1 | one arc for both issues | #840 alone (one line; a second PR and loop for no review gain) | driver |
| D2 | `added` keeps its two-valued union | a boolean `replaceOnAdded` (renames a live option for no behaviour) | driver |
| D3 | the retry moves into the mirror, which still rejects to the caller | a copy per page (three copies); the mirror swallows refusals (History's mount would then read its received rows after a refused journal read, a screen change #839 does not name) | driver |
| D4 | `journalAdded` takes `place` | keep a one-field rules object | driver |
| D5 | a test per converged row with an effect; for Send's row a control over the realistic restart order | a Send case reading internal rows (tests no screen); a control asserting only the landed read (misses the interval in dispute) | driver; Codex R1 F1 |
| D6 | mutations: restore each removed rule in turn; each reddens its row's case, Send's `append` excepted (D5) | — | driver; Opus F4 |
| D7 | History's profile check sits in its `read`, which answers `undefined` | keep it in the wrapper (a retry with no profile would throw inside `read` and re-arm every 2 s until unmount) | driver; Opus F4 |
| D8 | the retry's catch covers `read()` only and always rethrows | Home's wider catch (also re-arms on a throwing `onSnapshot`, which has no throwing path) | Opus F6 |

## Audit verdicts

Each finding verified against the tree before it was taken; details in [`lessons/phase-0.md`](lessons/phase-0.md).
- **Codex R1** (sol, high): `conditional approve`. F1: F8's impossibility claim was wrong; screen equivalence holds, D5's control holds the read (taken). F2: the retry is not scope-fenced in History or TokensView (taken as wording and a control; no scope watcher). F3: late refusals after supersession and dispose (taken: two cases). F6's trigger list (taken).
- **Opus R1** (Plan): `conditional approve`. F1: `auto-imports.d.ts` (taken). F2: the superseded mount read belongs in § UI impact (taken; #839 row 5 names it). F3: two Security sentences (taken). F4: D6 and D7 wording (taken). F5: two tests leave timers armed (taken). F6: what the catch covers (taken, D8).
- **Codex R2** (resumed): `approve`, no new material finding; the revisions add no state, lifecycle, protocol or recovery policy beyond the signed retry.
- **Diff review R1**: Codex `findings 1` (a stale comment over Home's retry, taken); Opus `findings 3` (the regenerated `.eslintrc-auto-import.json`, the docblock's "until one lands", a blank line; all taken). Details: [`lessons/phase-4.md`](lessons/phase-4.md).
- **Diff review R2** (Codex, resumed): `clean`; the loop converged after two rounds.

## Delivery

- One arc, one PR against `dev` (D-orch-1, no stack), closing both issues, the close-out its final commits. Branch `ui-dedupe-2-a1` off `origin/dev`; the plan commit cherry-picked first. Collisions: `recon.md`. One PR, opened ready after the gates and the Codex loop, no label at creation; add `e2e:extension-smoke` only if the path filter skips smoke.
- Title: `fix(popup): five list rules take home's; a dropped backup export stops before its keys` (86).
- Body: what and why, both picks quoted by id, the UI impact lines with row 5's pictures, the validation runs, `Closes #839`, `Closes #840`.

## Post-implementation

The contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at `ced2c51c`. Specific here:
- Step 1 absent (`code_review: off`).
- Step 2 once over the arc's diff: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds; one Opus 5.5 `general-purpose` review alongside round 1. Log each round in `lessons/phase-4.md` and the ledger.
- Step 4: close-out as the PR's final commits; Known limits: none planned.
- Step 5: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ui-dedupe-2/plan.md` succeeds, `agent-worktree done ui-dedupe-2 --merged`.
- While implementing: comments per CLAUDE.md § Code-comment style; three failures on one step stop the arc.

## Seeds (not run; the orchestrator owns spawning)

```
/goal implementations-plan/ui-dedupe-2/plan.md phases 1-4 marked ✓ with each gate's output in the transcript, the Codex loop converged (a resumed pass with no new material finding quoted), the PR open against dev with `Closes #839` and `Closes #840`, `bun run test` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/ui-dedupe-2 forward per its plan.md: reality-check plan.md and lessons/, take the next ✗ phase, run its gate before ✓, e2e only with load1 < 150, the Codex loop after phase 4, then the PR; never merge.
```
