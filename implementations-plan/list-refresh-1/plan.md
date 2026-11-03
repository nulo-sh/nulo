---
plan: list-refresh-1
tier: mid
status: plan approved by the panel; phase 1 next; the PR waits on OA-1
issues: "#1608"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit + Opus Plan leg; final fresh Codex pass
base: origin/dev at ff395c3d0
trunk: dev
post_implementation_hardening: not scheduled
---

# list-refresh-1: the token list every six hours, and a manual refresh on Settings → Tokens

One arc, one PR, closes #1608. The owner chose B + C on #1608: "I'd still change to 6 hours + a manual refresh sounds fair." Option A (a refetch on extension update) was not chosen and stays out. The control's placement and words wait for the owner (OA-1): the arc builds the recommended option, keeps the others a template change away, and the PR does not merge before the pick. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src/` unless they name another root.

## Outcome & Quality Bar

- **For whom**: a person whose wallet already holds a token list when a new one is published (cUSDC and cWETH on Alpha Mainnet in early November), and the owner, who can tell that person to press one control.
- **Excellent**: (1) once an install has refreshed under this build, it picks up a new list within about six and a half hours while the browser runs and alarms fire on time, and a press gets it at once; (2) the press shows that it runs, then one line that is true for what happened (updated, no newer list, host not reached, check not completed, Terms not accepted); (3) the privacy policy states the cadence, the retry ladder and the manual path exactly, and the failure backoff and the planted-deadline guard keep their behaviour.
- **Good enough**: no new storage, no new permission, no new background work, no last-checked time on screen.

## Findings

- **F-1, #1608**, demonstrated by trace. An install refreshed at `t` stores `nextAttemptAt = t + 24 h + U[0, 2 h)` (`wallet/services/token-list/service.ts:60-62`). A list published at `t + 1 h` reaches it at the alarm, boot or acceptance after that deadline: up to 26 h later. Consequence: a published token is missing from existing installs for a day.
- **F-2, the lane brief's "ceiling moved with it"**, demonstrated by trace. With a ceiling of `now + 6 h + jitter`: after five failures the service stores `now + 24 h` (`FAILURE_BACKOFF_MS[4]`, `:25`, `:62`); the next worker boot (`init` → `refreshIfDue`, `:117`, `:146`) decodes it as absent, refreshes, fails and stores `now + 24 h` again. Broken: the backoff. Consequence: during a host outage every worker boot fetches. The R3 golden (`nextAttemptAt` 19 h after `GOLDEN_NOW`) would also read differently. So the ceiling keeps its value (D2).
- **F-3, privacy § 5.11 after the change**, demonstrated by trace (Opus R1). "…about every six hours, and again sooner after a failed attempt" is false from the fourth failure on: the ladder's steps are 5 min, 30 min, 2 h, 6 h, then a day. The text states the ladder instead (Architecture § Privacy).

## Assumptions

**Facts** (recon.md § Facts carries the line references)
- F1. `refresh()` is single-flight and never rejects; `doRefresh` returns early with no request when the Terms are not current or the source is off; its `outcome` sets `failures`, `lastSuccessAt` and the deadline, and reaches only the log (`service.ts:131-138`, `:182-213`).
- F2. `TokenListService` runs in the service worker and has no client; ports reach a `Service` only from trusted internal senders.
- F3. The Terms sheet is dismissable per version, so Settings → Tokens is reachable with the Terms not current.
- F4. After this change the longest deadline the service writes is the backoff's last step, a day; the longest any build has written is a day plus two hours.
- F5. `tests/vitest.setup.ts:60-71` stubs `chrome.runtime.onConnect` before every test, node-environment files included, so a `Service` constructor runs in the token-list composition harness (`LegalAcceptanceService` already does).
- F6. `defineRpcMethods` fails to compile when a `Methods` key is not listed. `announceReady` waits for the whole collection to start, and a client posts nothing before Ready, so `refresh` never reaches a half-started service.

**Inferences**
- I1. Chrome and Firefox fire a missed alarm once when the browser wakes, so "about every six hours" holds while the browser runs and is late after a sleep, as "about once a day" is today.
- I2. No synchronizing event needs more than a few minutes of spread: installs pull a static file from Cloudflare, and acceptance times are spread by people. A capacity assumption, not a measurement (Codex R1). So jitter proportional to the period is enough (D1).

**Asks**
- A1 (OA-1). The control's placement and words on Settings → Tokens. The arc builds option A and waits for the pick before merge.

## Architecture & Implementation

**Cadence** (`wallet/services/token-list/service.ts`)
- `REFRESH_MS = 6 * HOUR_MS`; `JITTER_MS = REFRESH_MS / 12` (30 min, the ratio the daily cadence had). `nextAttemptAt` returns `now + REFRESH_MS + floor(random() * JITTER_MS)` after a usable answer. `FAILURE_BACKOFF_MS` is unchanged.
- `DEADLINE_CEILING_MS = DAY_MS + 2 * HOUR_MS`, exported, replaces `DAY_MS + JITTER_MS` in `decodeTokenListState`. Its comment states the invariant: past every deadline any build has written, the earlier daily one included, so a row stored before an update reads as written. The value does not change (D2).
- `verify-unsupported` stays on the success cadence, as today; its test name drops "daily".

**RPC** (`wallet/services/token-list/{spec,service,client}.ts`)
- `spec.ts` adds:
  ```ts
  /** What one refresh did: its request's outcome, or why it made none. */
  export type RefreshResult = RefreshOutcome | "terms-not-current" | "off" | "error"
  export type Methods = { refresh(): RefreshResult }
  export type Events = Record<never, never>
  ```
- `TokenListService extends Service<Methods, Events> implements ServiceSpec<Methods, Events>`, `rpcMethods = defineRpcMethods<Methods>()("refresh")`, as `LegalAcceptanceService` does. The constructor takes `logger` as a plain parameter (the base declares `protected readonly logger`; a `private readonly` property fails to compile) and calls `super(TOKEN_LIST_SERVICE_NAME, logger)`; the instance `name` field goes (the base sets it); `static readonly name` stays (`wallet/index.ts:101` reads it). The `start` body moves to `protected async init(services)`. `dependencies`, `booted`, `onListChanged`, `getSnapshot`, `onAlarmTick` and the private `log()` stay. The class comment adds the manual trigger.
- `refresh(): Promise<RefreshResult>` keeps one in-flight promise: a joiner, the page included, receives the same result. `doRefresh` returns `"terms-not-current"` or `"off"` at its two early returns, and the outcome after it stores the state and invokes `onListChanged`. The catch logs as today and resolves `"error"`. In-process callers (`onAcceptanceChanged`, `refreshIfDue`) ignore the value.
- `client.ts`: `TokenListServiceClient extends ServiceClient<Methods, Events>` with `refresh(): Promise<RefreshResult>`, importing `./spec` only, as every client does. The default 60 s timeout covers one refresh: the fetch aborts at 10 s, then storage.

**Page** (`popup/pages/settings/tokens/`)
- `list-refresh.ts` (pure): `LIST_REFRESH_STATE = { … } satisfies Record<RefreshResult, ListRefreshState>`, so the compiler proves every result is mapped. `accepted` → `updated`; `unchanged` → `current` (the host serves the list the wallet holds: "no newer list", never "up to date", since a host can withhold one, #386); `network` → `unreachable`; `terms-not-current` → `terms`; `http-status` (the host answered), `older-sequence`, `refused`, `oversize`, `verify-unsupported`, `off`, `error` → `failed`. Plus `LIST_REFRESH_COPY`, the line for each of `idle`, `running` and the five states (OA-1). A rejected RPC maps to `failed`.
- `index.vue`: a second client, `tokenListService`, disconnected in `onBeforeUnmount` after `tokenService`. One handler: ignore a press while running; set `running`; await `refresh()`; store the state. Option A: its own `ItemsContainer`, outside the token list's `v-if`, after the token rows or the empty message and before "Import token", so a person with no tokens has it too (Opus R1). In it one `SettingItem` (`size="small"`, `icon="refresh"`, `:loading`, `title`, `wrapDescription`, `@click`), `data-testid="token-list-refresh"`. Its description slot holds one always-mounted `role="status"` element, `data-testid="token-list-refresh-result"`, `data-state` in `idle | running | updated | current | unreachable | failed | terms`: a live region must exist before its text changes to be announced. `unreachable` and `failed` use `txt-danger`. Options B and C reuse the handler, states and words; their template blocks differ (a `Button` with `loading`; a header icon button with a tooltip).
- The result stays until the page is left or the control is pressed again. No toast.

**The press, end to end**: page → `TokenListServiceClient.refresh()` → port → `TokenListService.refresh()` (joins any running refresh) → Terms check → GET `tokens.nulo.sh` → verify → store state, re-arm the alarm → on `accepted`, `onListChanged` (the seeder and the price map, as on a timed refresh) → result → page line.

**Docs that state the cadence or the triggers**: `ARCHITECTURE.md:99` (cadence and the manual trigger), `apps/extension/store/listing.md:56`, `:81` (and its citation of `service.ts`'s lines for `refreshIfDue`), `apps/extension/tests/e2e/README.md:65`, `tests/e2e/fixtures/egress-guard.ts:95`, `tests/e2e/fixtures/token-list.ts:155` ("daily" → "scheduled").

**Privacy** (`legal/privacy.md`, `legal/archive/`, `packages/legal/src/manifest.ts`, `BEFORE-LAUNCH.md`)
- The next free patch on `dev` when the arc is built (1.2.8 today; 1.2.9 if #1612 lands first), `material: false`, `effective: null` and `«FILL: effective date»` until the promote dates it; the archive copy of the current version; the history row; the manifest `changes` line.
- § 5.11 What it is: "The extension downloads it once you have accepted the Terms, then about every six hours. After a failed attempt it tries again within minutes, then less often, at most a day apart. Once you have accepted the Terms, you can also ask for it in Settings → Tokens." § 5.11 Your control: "the regular download cannot be turned off". § 6 `alarms`: "the token list about every six hours". It names the page, not the control, so it holds for every OA-1 option.
- `BEFORE-LAUNCH.md` § 4: a "Due at the release that publishes privacy 1.2.N" block in the 1.2.8 form, plus re-pasting the Chrome `alarms` justification from `listing.md` § Permissions.

**File-level change map**: `wallet/services/token-list/{spec.ts, service.ts, client.ts (new), service.composition.test.ts}`; `popup/pages/settings/tokens/{index.vue, index.test.ts, list-refresh.ts (new), list-refresh.test.ts (new)}`; `tests/e2e/token-list.test.ts`, `tests/e2e/fixtures/{token-list.ts, egress-guard.ts}`, `tests/e2e/README.md`; `legal/privacy.md`, `legal/archive/privacy-1.2.7.md` (new), `packages/legal/src/manifest.ts`; `apps/extension/store/listing.md`; `ARCHITECTURE.md`; `BEFORE-LAUNCH.md`.

## Decision ledger

- **D1. Jitter proportional (30 min), not 2 h.** For: the owner said "6 hours", and the worst case becomes 6.5 h, not 8 h; the jitter spreads installs one event aligned, and per cycle that spread is the jitter's share of the period, which stays a twelfth. Against, kept on record: 2 h changes no constant, and a synchronized cohort's requests fall into a quarter of the old window (Codex R1, who still kept 30 min). Both legs agree. Rejected: no jitter.
- **D2. The ceiling keeps its value, 26 h.** It must cover the 24 h backoff step (F-2). Of the values that do, 24 h ("the longest this build writes") reads an old row's 24–26 h deadline as due, a change to how a stored row reads (CLAUDE.md § Persisted-storage), for one early fetch; 26 h ("the longest any build has written") changes no read and keeps the R3 golden and the e2e fixture's 12 h hold. A planted deadline still delays a refresh by at most 26 h. Both legs agree.
- **D3. An updated install moves to the new cadence after its next refresh.** It keeps its stored deadline (up to 26 h). Rejected: reading a success deadline past the new cadence as due, which refetches every install at its first boot after the update: option A by another route. Both legs agree.
- **D4. `TokenListService` becomes a `Service` with one RPC.** The service that owns the refresh exposes it. Rejected: a delegate on `TokenService` (the cheapest outline: a token-list method on the wrong service, for one caller); a page write of the stored deadline plus an alarm, as the e2e fixture does (raw storage from UI is banned, and it returns no result). Both legs agree.
- **D5. `refresh()` itself resolves the result.** One single-flight path for every trigger; a press that joins a timed refresh reports that refresh's result. Rejected: a second method beside `refresh()`; a stored last-outcome field (persistent state for one caller).
- **D6. The page maps results; the service keeps `FAILED`.** The wire carries `RefreshResult`, a closed string union with no list content. Five states keep every OA-1 word option a copy change away. Only a network failure reads as "not reached", since an HTTP error means the host answered; `unchanged` reads as "no newer list" (Codex R1). Rejected: a three-value result (it cannot say "Terms not accepted"), and the cheapest outline's single "checked" toast, which claims a check whether or not the host was reached.
- **D7. A manual refresh counts like any other.** A failed press adds a failure and moves the next attempt to the backoff step; a usable one resets the schedule to six hours. No rate limit: one press runs at most one request at a time, the same keyless GET a person can open in a tab. Consequence (Opus R1, demonstrated): five failed presses while offline set the next scheduled attempt a day out; another press recovers at once. Filed at close-out as a closed `known-limit` issue (reopen on a user report of a stale list after an offline spell); a press-only branch would be an option for one caller.
- **D8. One e2e step, inside scenario 1 of `token-list.test.ts`.** Failure mode: the page's control does not reach the worker's service in a real browser (port, RPC registration, the worker runtime). No cheaper layer runs the extension's ports. After the forged and older lists, serve a newer one, open Settings → Tokens with `navigateToSettings(popup, "tokens")` (`tests/e2e/settings-crud.test.ts:285`), press `token-list-refresh`, wait for `data-state="updated"` and the stored envelope, expect four requests. Estimate +5 s per browser on the file's recorded 20 s (Chrome) and 28 s (Firefox); measured in phase 1.
- **D9. Accessibility, decided under the owner's 2026-10-19 delegation.** A native control (the row's `RowTarget` button in option A), the row's focus ring, no positive tabindex; while running the control stays focusable and ignores presses, so focus is never lost. `SettingItem`'s `loading` changes only its glyph and sets no `aria-busy` (both legs R1): the running state reaches a screen reader through the always-mounted status line ("Checking the list"), with no change to `SettingItem`. Option B's `Button` sets `aria-busy` itself.
- **D11. As built (deviations).** (a) The `"error"` result is pinned by extending the existing failed-read test, not a new `storage.set` case: the same catch, one test fewer. (b) #1612 landed during the arc, so privacy is 1.2.9 (as planned), with 1.2.8 archived undated and the `BEFORE-LAUNCH.md` block saying a promote dates both. (c) The danger colour is the global `color--txt-danger` utility on the line, as `Text` itself applies it, so the page needs no style module. (d) The e2e step costs under 1 s (lessons/phase-1.md), not the estimated 5 s.
- **D10. The full smoke suite runs locally on both browsers before the PR.** CLAUDE.md § Quality gates asks for smoke before a popup PR and the Firefox suites when `tests/e2e/fixtures/**` changes; a reviewer cannot waive it (final Codex pass, accepted). The focused e2e files stay for development and the timing measure. CI's required smoke runs repeat both on the PR. Recorded CI time: about 27 min (Chrome) and 37 min (Firefox).

**Audit verdicts**
- **Codex R1** (gpt-6.1-sol, high): conditional approve. Accepted: the `http-status` and `unchanged` words (D6), D9's `aria-busy` claim, the armed builds and `audit:vue` in the gate, qualified targets and I2, the About and store surfaces in UI impact, OA-1's "starts or joins" and the failure description. Partly accepted: the full-suite gate (D10).
- **Opus R1** (Plan leg): conditional approve. Accepted: F-3 and the idle line; D9; the page-test harness (stub with the description slot, hoisted mocks); the empty-state placement; ceiling pins green at the base; fewer tests (extend the existing ones, the `satisfies` table); the conversion details; recon corrections (an e2e does open Settings → Tokens; F1; the client rationale); D7's consequence as a known limit; `wrapDescription`.
- **Final fresh Codex pass** (gpt-6.1-sol, high, new session): conditional approve, one condition: D10 must keep CLAUDE.md's local full smoke suites (Chrome, and Firefox for the fixture edits). Accepted (D10, the gate). No other material finding; the conversion, the result contract, the 26 h ceiling, D7's known limit and the privacy wording held. Resumed on the change: **approve**.

## Security & Adversarial Considerations

- **Threat model**: (a) a host or network attacker serving an old, forged or oversize list: the same verify, sequence and size checks run for a press, and a withheld list reads "no newer list", never "up to date"; (b) code that can write extension storage planting a far deadline: still bounded at 26 h, and a press refreshes regardless; (c) a web page, content script or dApp: the RPC is reachable only over a port from a trusted internal sender, and the wallet-sdk wiring names no token-list service.
- **Privacy**: roughly four scheduled keyless GETs a day after successful refreshes instead of one, plus one per press, each the same request (§ 5.11). The patch says so before it reaches users.
- **Input**: `refresh` takes no argument; the result is a closed string union. Log lines keep `{ outcome, failures }` only.
- **No change** to permissions, crypto, dependencies, stored shapes (D2), or the Terms gate.

## UI impact

Settings → Tokens gains one control and its result line; the owner picks its placement and words (OA-1). The privacy patch the owner directed on #1608 changes three surfaces through existing mechanisms: Settings → About's "Privacy Policy v1.2.N" title and its "Privacy Policy updated" line for an install that saw an older version (`utils/legal-about.ts`); the published policy; the store's `alarms` justification. No other surface changes.

## Phase 1: cadence, RPC, page control, docs and privacy

Steps, in order:

1. Tests in `service.composition.test.ts`. Change the "one deadline" test to `T0 + 6 h + 15 min` (random 0.5) and add the jitter bounds: random 0 gives `+6 h`, random just under 1 stays under `+6 h 30 min`. These are red at the base. Add the ceiling pins, green at the base because the value does not change: `decodeTokenListState` keeps `now + 26 * HOUR` and drops one millisecond more; every deadline `nextAttemptAt` writes (a usable outcome at random near 1, each failed outcome at failure counts 1 to 6) is at most `now + 26 * HOUR`. Then change the constants.
2. Extend the existing tests for the result: the admission test also expects `"terms-not-current"` and no request; the commit test expects `accepted`, `unchanged` and a failure outcome; the overlap test expects one shared result; one new case: when `storage.set` rejects, `refresh()` resolves `"error"`. Then convert the service and add `client.ts`.
3. `list-refresh.test.ts`: one table test over every `RefreshResult`. `index.test.ts`: change the `SettingItem` stub to render `#description` and `#right` (no new props, so the existing tests keep passing); hoist the new client's `refresh` (a deferred) and both clients' `disconnect`. Cases: the status element is mounted before a press, with the empty token list too; a press shows the running line, and a second press makes no second call; one muted state (`current`) and one danger state (`unreachable`) show their line, `data-state` and colour; a rejected RPC shows the failed line; unmount disconnects both clients, `tokenService` first (`invocationCallOrder`). Then build the page.
4. Extend scenario 1 of `tests/e2e/token-list.test.ts` (D8). Measure the file at the base and after, on Chrome and Firefox.
5. Update the cadence docs and comments (Architecture § Docs).
6. Bump privacy (Architecture § Privacy) and add the `BEFORE-LAUNCH.md` block.
7. Take the OA-1 captures (Chrome, light): A as built, with tokens and with none; then B and C by swapping the template block; then restore A. Store them under `implementations-plan/list-refresh-1/screenshots/` and link them from `OWNER-ASKS.md`.

**Validation gate**
- Commands, in this order (a plain build disarms `dist`): `bun run audit:vue` (typecheck, `test`, lint, build); `bun run test:all`; `bun run check:plans` after staging the plan files; then, from `apps/extension`, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome` (and `build:firefox`); `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/token-list.test.ts tests/e2e/settings-crud.test.ts tests/e2e/legal-acceptance.test.ts --retry=0` while developing (`settings-crud.test.ts` opens the changed page; `legal-acceptance.test.ts` reads the privacy head from the manifest); before the PR, the full smoke suite, `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`, on Chrome and then with `NULO_E2E_BROWSER=firefox` (D10).
- Pass criteria: every command exits 0; the cadence tests were red at the base (pasted in `lessons/phase-1.md`) and are green; `packages/legal`'s manifest tests and `apps/extension/scripts/store-listing.test.ts` (inside `test:all`) are green; the focused files and both full smoke suites pass at retry 0 (one rerun of a file for a known flake, named in `lessons/phase-1.md`); `token-list.test.ts`'s runtime at the base and after is recorded per browser. The smoke suite's per-browser wall-clock before is dev's last green smoke runs, after is the PR's.
- Layers: lint, typecheck, unit, component, composition, smoke e2e on Chrome and Firefox.

## Delivery

- One arc, one branch (`worktree-list-refresh-1`), one PR to `dev` with `gh pr create`; the close-out lands as that PR's final commits. No stack.
- Title (≤ 92 characters): `feat(token-list): refresh every six hours, and a manual refresh on settings → tokens`.
- Body: what changed and why, the validation runs with outcomes, the smoke suite and `token-list.test.ts` wall-clock per browser before and after, the D9 accessibility calls under the owner's 2026-10-19 delegation, "Waits for the owner's OA-1 pick before merge", `Closes #1608`.
- Labels: none at creation; add `e2e:extension-smoke` afterwards only if the smoke path filter skips the suite.
- Parallelism: one phase, nothing to split. `/code-review`: off.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `ff395c3d0`. Plan-specific values:

- **While implementing**: comments state invariants only, never this plan; log each attempt in `lessons/phase-1.md`; at the gate run `agent-worktree status list-refresh-1 "phase 1 green: codex loop"`. Three failures on one step stop the step.
- **Step 1 (diff review)**: absent (`code_review: off`).
- **Step 2 (review loop)**: once, over the net diff from `ff395c3d0`, after phase 1 is green. Reviewer: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh` against the same codex dir. Each prompt carries the diff, this plan with its ledger, the adversarial ask and the standard's two rules verbatim. Hard stop after three rounds with material findings: report instead.
- **Step 3 (delivery)**: as Delivery above, then `gh pr checks <n> --watch`.
- **Step 4 (close-out)**, as the PR's final commits after `gh pr create`: merge `origin/dev` and read what changed in `index.md` and `lessons.md`; the `## Outcome` block after the front matter (Date, Status, Shipped, `Known limits:` with D7's issue, `Open items:`, the seeds retired); lessons promoted with a pruning pass; open items filed; `STATUS.md` deleted; `git mv implementations-plan/list-refresh-1 implementations-plan/archive/list-refresh-1` in its own commit, links repaired, the index line moved to `archive/index.md`; `bun run check:plans` green. If the OA-1 pick is not in by then, the Outcome names it as the merge condition.
- **Step 5 (teardown)**: after the merge, when `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/list-refresh-1/plan.md` succeeds, run `agent-worktree done list-refresh-1 --merged`. A session without a loop arms one background wait for that check after its wrap-up report. Merging is the orchestrator's call.

## Seeds (draft; the orchestrator owns them)

```
/goal Phase 1 of implementations-plan/list-refresh-1/plan.md is marked ✓, backed by its validation gate passing in the transcript; LESSONS_FILE=implementations-plan/list-refresh-1/lessons/phase-1.md printed; the Codex loop over the net diff from ff395c3d0 converged (a resumed pass with no new material finding, quoted); the PR to dev exists (gh pr view output) with the close-out commits that archive the plan; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/list-refresh-1 forward: read plan.md and lessons/ first; if the plan is archived on dev, run `agent-worktree done list-refresh-1 --merged` and stop; else continue the next unchecked step of Phase 1 or the Post-implementation section, run its gate, commit; decide open questions with Codex (gpt-6.1-sol, high) and log them; never merge, never change what a person sees beyond OA-1's built option.
```
