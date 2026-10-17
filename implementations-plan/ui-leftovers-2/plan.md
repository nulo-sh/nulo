---
plan: ui-leftovers-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev 2c0df3b9
issues: "#675, #676 (both closed by the one arc)"
---

# ui-leftovers-2: two picks from decision page 39

Decision page 39 (2026-10-17) settled two asks the ui-leftovers-1 lane left open; each pick is a Decision block on the parent issue (#628, #618). One arc, one PR against `dev`. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person on the popup who watches a dApp call end, or opens Holdings before prices answer, on Chrome or Firefox.
- **Excellent looks like**:
  1. One dApp call reads the same in flight, settled, failed and cancelled, and its two details pages agree. Holdings never shows a figure that is about to change, and the skeleton holds the figure's line, so the page below moves no more when the price lands than it does today (a long figure can still wrap the meta line).
  2. Each rule lives in one place: one "dApp" fallback (`journalCardOriginLabel`), one "waiting for the first price answer" check for Home and Holdings.
- **Good enough**: the list-loading state (OA-1) ships unchanged, and the wait has no cap (OA-3); both wait for the owner.

## UI impact

- **Terminal activity row and journal details (#675)**: a nameless dApp's cancelled or failed row keeps the "dApp" chip it showed in flight. Its journal details page shows the App row reading "dApp", after "What happened" and before "Method". Signed (P39-05 A): *"Both take the same fallback: the cancelled row keeps the chip; the details page reads App, dApp."* Drawing `p39-nameless-a`.
- **Holdings' total (#676)**: with fiat on, a held token the signed list may price, and no price answer yet, the total is a 96 × 26 px skeleton and the meta line reads the count alone ("2 tokens"). From the first answer on, page 35's pick applies unchanged. Signed (P39-06 B): *"A skeleton in the total's place, as Home's hero, with the token count beside it."* Drawing `p39-holdings-b`. The line keeps the figure's height (OA-2 A); while the list loads it reads as today (OA-1 A); the skeleton has no cap (OA-3 A). All three were settled A by the orchestrator on 2026-10-17 (OWNER-ASKS.md § Settled).

## Architecture & Implementation

- **#675.** `dappCardFields` (`apps/extension/src/utils/journal-state.ts:413`) sets `originLabel: journalCardOriginLabel(op)`. `journal/[id].vue`'s `originChip` becomes `op.value ? journalCardOriginLabel(op.value) : null`; its import swaps `sanitizeJournalSubtitle` for `journalCardOriginLabel`, and the comment above it goes (the helper's TSDoc says it). Two stale texts follow: the block comment above `journalCardTitle` drops "only a nameless dApp's chip takes the settled row's fallback", and `sanitizeJournalSubtitle`'s TSDoc drops "Consumed by `journal/[id].vue`". The helper keeps its name: the details page shows what the row shows.
- **#676, the check.** `token-aggregate.ts` gains `awaitingFirstPriceAnswer(rows, prices)`: `!prices.settled.value && rows.some((tb) => isPriceableHolding(tb, prices))`. `prices` is typed `PriceMapping & { settled: Readonly<Ref<boolean>> }` and both pages pass the `usePrices` result itself, as they do for `pricesUnavailable`. `BalanceView.vue`'s `awaitingQuotes` becomes `showFiatValues.value && awaitingFirstPriceAnswer(tokenBalances.value, prices)`, with no change in behaviour; its now-unused `isPriceableHolding` import goes (Biome does not flag unused imports in `.vue`).
- **#676, Holdings.** `holdings.vue` adds `const awaitingPrices = computed(() => showFiatValues.value && awaitingFirstPriceAnswer(rows.value, prices))`.
  - The visible `.summary_amount` and meta spans gain testids `holdings-total` and `holdings-meta` (the hidden ruler repeats their text).
  - While `awaitingPrices`, `.summary_amount` holds `<Skeleton :width="96" :height="26" data-testid="holdings-total-loading" :class="$style.total_skeleton" />` in place of `.summary_fit`, and the span carries `aria-busy="true"`.
  - `.total_skeleton { vertical-align: middle; }` centres it on the figure's line box, as `.hero_skeleton` does, so the line keeps its height.
  - `summaryMeta` drops " · priced assets only" while `awaitingPrices`: that clause describes a figure.
  - The ruler keeps measuring `totalDisplay`, and the fit's watch already keys on `summaryMeta`, so the figure lands at the right scale.
- **No cap timer.** Home's 12 s cap also bounds its balance pipeline. Holdings' wait ends at the first settlement. The provider fetch aborts at 10 s (`service.ts:357`), which normally ends it then, and a dropped Ready port rejects the call (`client.ts:140`). The whole call, readiness and the storage reads around the fetch included, has a 60 s RPC deadline: a worker that restarts while the page is open is one path to it, since its new port stays `Connecting` and its waiters wait (`client.ts:132-136`) (plausible, unreproduced). A cap would add a timer with its reset and cleanup, and a post-cap state that #618's `settled` gate does not have: OA-3 asks, and the arc ships the wait. While waiting, `quotes` is `{}` (only `adopt` sets it), so the ruler holds "$0.00" at scale 1 and the shrunk margin never applies to the skeleton.
- **Alternatives not taken**: a copy of Home's inline predicate in Holdings (two copies of one rule); covering the list-loading state now (a count the owner has not drawn: OA-1); renaming `journalCardOriginLabel` (churn in a file another lead edits, for no reader gain).

## Security & Adversarial Considerations

- **Threat model**: a hostile dApp controls its name (`op.subtitle`). #675 changes only the empty case: a name that sanitizes to `""` renders the fixed word "dApp" on two more surfaces. A schemeful name is still bracketed first (`sanitizeJournalSubtitle`). The chip is display text, not identity; a dApp can already name itself "dApp". #674 (a whitespace name shows a blank chip) now reaches the terminal row and the App row too, with the same disposition.
- **Prices**: #676 reads the same mapping and quotes as Home; it hides a figure, it never invents one.
- **Logs, storage, permissions, crypto, supply chain**: nothing new is stored or logged; no permission, dependency, key or workflow changes.

## Assumptions

**Facts**
- F1: `journalCardOriginLabel` returns `null` for every kind but `dapp_execute`, else the sanitized name or `DAPP_LABEL` (`journal-state.ts:442-445`); `dappCardFields` runs only for `dapp_execute` (`ACTIVITY_FEED_KINDS`, `:32`, `:380`).
- F2: the details page's App row shows only when `originChip` is set (`journal/[id].vue:119-122`, `:298-301`).
- F3: `settled` turns true on the first answer, its rejection or a broadcast (`usePrices.ts:69-92`), and never turns false again; the fetch aborts at 10 s, but the whole call's deadline is 60 s (readiness and storage reads included); a dropped Ready port rejects pending calls, a `Connecting` one keeps them up to the 60 s deadline.
- F4: Holdings' summary renders while the list loads and reads "$0.00", "0 tokens" (`holdings.vue:195`, `useEntityCrud.ts:75`).
- F5: `holdings.test.ts:211` pins today's pending summary; `journal-state.test.ts:286` and `rows.test.ts:949` pin the nameless terminal row's missing chip. No e2e reads `holdings-summary`.
- F6: smoke needs an armed build, and `audit:vue`'s plain build disarms `dist` (`.claude/skills/e2e-testing/SKILL.md` § Build-armed tests).

**Inferences**
- I1: Home's hero behaves the same after the move: its price-wait tests (`BalanceView.test.ts:385-600`) stay green unchanged.
- I2: on a nameless row the title keeps its one cut line beside a short chip: `oneLineTitle` is already true for it (`journal-state.test.ts:297`).

**Asks** (to the owner through the orchestrator; the arc ships without them): OA-1, the list-loading state (ships A, unchanged); OA-2, the line height under the skeleton (ships A, held); OA-3, a cap on the wait (ships A, no cap).

## Phases (one arc)

### Phase 0: base and "before" shots ✓
- Merge `origin/dev`. If a lead's merge touched `journal/[id].vue`, `RecentActivityView.vue` or `holdings.vue`, read its diff.
- **Smoke recipe** (every smoke run below; load1 < 150 first): an armed build, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<chrome|firefox>`; then, from `apps/extension`, `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- <file> --retry=0`.
- **Shots** (Chrome, light and dark, under `~/.cache/nulo-backlog/ui-leftovers-2/shots/`): a scratch spec, never committed, seeds a nameless dApp's cancelled and failed records (as `rows.test.ts` does) and shoots Home's activity and the cancelled record's journal page. For Holdings it holds the first price answer over a stale cache: `interceptRpc(..., "https://api.coingecko.com", { kind: "redirect", to })` to a run-owned stub that holds every request until the spec releases a valid quote (Home's refresh, which Holdings joins, starts at the reload, so the spec opens Holdings at once and releases before the 10 s abort); a second run refuses it for the failure state. It asserts the interception's hits and no failures, logs the summary's height held and after the figure lands, and samples the visible summary each frame from mount (the OA-1 frame count).
- Time `rows` on the base, per browser (the "before" figure).
- **Gate**: `bun install --frozen-lockfile && bun run lint && bun run typecheck:all` exit 0.

### Phase 1: a nameless dApp keeps its chip when it ends (#675) ✓
- Files: `utils/journal-state.ts`, `popup/pages/journal/[id].vue`, `utils/journal-state.test.ts`, `popup/pages/journal/[id].test.ts`, `tests/e2e/rows.test.ts`.
- Tests: the nameless terminal case (`journal-state.test.ts:286`) expects "dApp", its one-line title unchanged; the named and schemeful cases stay as controls. In `[id].test.ts`, a nameless dApp record shows App · "dApp" in the shared label and value; a failed transfer shows no App row (never-happens control). Two stale test names follow: `journal-state.test.ts:286` and the describe at `:533` ("the in-flight row's app chip"). In `rows.test.ts`, the nameless row's chip is whole, beside the title, in the caps role (`{ cut: false, below: false }`, type as `rows.call`), and the comment at `:773` says so. No added scenario.
- **Gate** ("fast layers" below means its first two commands): `bun run lint && bun run typecheck:all && bun run --cwd apps/extension test journal-state journal/` exit 0; then `rows` by the smoke recipe on Chrome and on Firefox (the row's layout is a browser difference), green at retry 0.

### Phase 2: Holdings waits for the first price answer (#676) ✓
- Files: `utils/token-aggregate.ts`, `utils/token-aggregate.test.ts`, `popup/components/modules/general/BalanceView.vue`, `popup/pages/holdings.vue`, `popup/pages/holdings.test.ts`.
- Tests: one table for `awaitingFirstPriceAnswer`: unsettled with a priced holding (true); settled (false); unsettled and empty, zero balance, or unpriced after the mapping (false); unsettled before the mapping (true). In `holdings.test.ts`, `:211` becomes: with the answer held, `holdings-total-loading` shows, its span is `aria-busy`, no visible figure shows, and the visible meta reads exactly "1 tokens". The hidden ruler still holds the figure, so these read new testids on the visible spans (`holdings-total`, `holdings-meta`), never the whole summary's text. Resolving the answer then shows the figure and removes the skeleton and `aria-busy` (success control). Fiat off, and an unpriced-only wallet once the mapping has answered (`getQuotes`), show no skeleton with the answer still held (never-happens: with the answer resolved they would pass whatever the check did). The fit tests' `span[style]` selectors run only in settled states, so they never meet the skeleton's styled root.
- **Gate**: fast layers plus `bun run --cwd apps/extension test token-aggregate holdings BalanceView` exit 0.

### Phase 3: arc gate and "after" shots
- **Gate**: `bun run audit:vue`, `bun run test:all`, `bun run check:plans` exit 0. Then a fresh armed build (`audit:vue` disarmed `dist`), the whole smoke suite on Chrome (the popup changed; four smoke specs open Holdings) and `rows` on Firefox, by the smoke recipe. No network e2e file is touched; CI's network lane runs Holdings and Home's price paths. A network run, if one is needed, is `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <file>` (the network config retries twice unless told).
- Shots: the Phase 0 scratch spec again, light and dark. The summary's height is equal while held and after (±0.5 px). Record `rows`' time per browser against Phase 0's.

## Decision ledger

- D1 #675: both sites call the existing `journalCardOriginLabel`; no new helper, no rename.
- D2 #676: one shared `awaitingFirstPriceAnswer` in `token-aggregate.ts`; Home's behaviour unchanged.
- D3 #676: no cap timer on Holdings (see Architecture); OA-3 carries the long wait.
- D6 #676: the check is named for what it reads, the first price answer (a rejection ends it too), not a quote.
- D7 #676 (implementation): no fiat-off control. The total's span is `v-if="showFiatValues"` and the meta's clause is gated on fiat, so no version of the check can show a difference there; the unpriced-only control runs with the answer held, and a mutant ignoring the mapping fails it.
- D8 #676 (implementation): each token row runs its own `usePrices`, so the page test resolves every held `refreshIfStale` call, as the service answers all concurrent callers with one refresh (`service.ts:324`).
- D9 e2e (implementation): the Phase 1 `rows` runs and Phase 3's ran together on the final head's armed builds; Phase 2 touches no row.
- D4 #676: the skeleton holds the figure's line box (OA-2 A); the list-loading state is OA-1 and ships unchanged.
- D5 e2e: no new scenario. `rows` flips one assertion. The held-then-released price is measured once in a real browser by the scratch spec, for the PR body; a committed twin would add a provider stub to the smoke suite for one layout fact.

## Audit verdicts

**Codex (gpt-6.1-sol, high, session 01a14b76): conditional approve.** All five accepted after checking each against the tree.
- C1 (medium, bound demonstrated, delay plausible): the 10 s bound held only on a worker that is up; a `Connecting` port keeps its waiters to the 60 s deadline. Recon, F3 and Architecture corrected; the cap is OA-3 (ships: no cap), since a cap is a timer lifecycle and a visible change.
- C2 (medium, demonstrated): `vitest.e2e.network.config.ts:26` retries twice unless `NULO_E2E_RETRY=0`. Applied to the network command.
- C3 (medium, demonstrated): the hidden ruler repeats the figure and meta, so a whole-summary text check fails. Visible spans get testids; the ruler stays.
- C4 (medium, demonstrated): a stub that never answers ends in the failure state, not the figure. The scratch stub holds, then releases a valid quote.
- C5 (low, demonstrated): after the first answer, an account change skips the skeleton (`settled` stays true). OA-1 reworded.

**Opus 5.5 (Plan): approve with changes.**
- O1 (medium, demonstrated): the same ruler problem as C3. Folded.
- O2 (low-medium, demonstrated): never-happens controls run with the answer resolved could not fail. Accepted: they run with it held; `aria-busy` checked gone after the resolve.
- O3 (low, plausible): Home's refresh starts at the reload, and Holdings joins it or meets the backoff. Accepted: the spec opens Holdings at once and releases the held answer itself.
- O4 (low, needs a wedged worker): the 60 s case needs a record. Taken as OA-3 (C1's restart path makes it a visible question first); its close-out disposition is under Post-implementation.
- O5 (low, plausible, pre-existing): a long figure can wrap the meta line and grow the summary when the price lands. Accepted: Outcome and OA-2 qualified; not this arc's change.
- O6 (low, demonstrated): BalanceView's `isPriceableHolding` import goes dead and Biome ignores unused imports in `.vue` (`biome.json:222-228`); two test names go stale. Accepted.
- O7 (nit): the check reads the first price answer, a rejection included. Accepted: `awaitingFirstPriceAnswer`, Holdings' `awaitingPrices`.
- O8 (low): CLAUDE.md asks for the smoke suite when the popup changes, and the network files touch nothing here. Accepted: the whole smoke suite on Chrome and `rows` on Firefox; the network runs left to CI.

**Codex verify (resumed): conditional approve, no new material defect.** Three wording leftovers fixed: the 10 s is the fetch's abort, not the call's bound (storage reads sit outside it); OA-1's account change skips the skeleton only after prices answered; recon's stub cell now holds and releases.

**Codex final (resumed): approve.** All three conditions confirmed; no new material defect.

**Codex fix loop, round 1 (gpt-6.1-sol, high, session 01a14bb7; the net diff from 639f0363): approve with changes.** R1-1 (low, demonstrated): the journal page's comment on `originChip` restated its line. Accepted: deleted.

**Opus 5.5 diff review (general-purpose), alongside round 1: approve with changes; no correctness or reactivity bug.**
- O1 (low, demonstrated): the page's unavailable test read `span[style]`, which the Skeleton's root matches too, so a wait keyed to "no quote yet" passed. Accepted: it reads the visible total and the skeleton's absence, on an empty and a rejected answer; that mutant now fails both.
- O2 (nit): a test name said "today's figure". Accepted: renamed. Both deviations (D7, D8) accepted.

**Codex fix loop, round 2 (resumed, the fix commit 6a8f0f09): approve, no new material finding.** The loop converged.

## Delivery

- One PR against `dev` from `worktree-ui-leftovers-2`, no stack (D-orch-1). Title: `fix(ui): a nameless dapp keeps its chip when it ends; holdings waits for prices` (79 characters).
- Body: each pick quoted with its id and the owner's words; light and dark shots of the real screens, before (from dev) and after; the validation runs; `rows`' local time and the smoke suite's CI wall-clock per browser, before (latest green `dev` run) and after; the OA-1 frame count; `Closes #675 #676`. Open it without labels, only after the gates pass and the Codex loop converges.
- Merge `origin/dev` before opening it, then retake the shots.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `2c0df3b9`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over the net diff from the merged `dev`, after Phase 3; plan files excluded. Prompts start "You are a subagent. Don't run memo." and carry the standard's two rules verbatim. Hard stop at three rounds; log each in `lessons/phase-0.md`.
- If the orchestrator relays OA-1, OA-2 or OA-3 before the PR opens, fold the answer in as its own phase. Otherwise each stays in OWNER-ASKS.md until close-out, then becomes an `owner-decision` issue (dedupe first), listed on the Outcome's `Open items:` line.
- Close-out: comment on #674 that the terminal row and the journal App row now share its path and disposition. If OA-3 is answered A, file the 60 s wait as a closed `known-limit` issue (reopen on a user report of a skeleton past 12 s) and list it on `Known limits:`.
- Teardown after the merge: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ui-leftovers-2/plan.md`, then `agent-worktree done ui-leftovers-2 --merged`.

## Seeds (draft; the orchestrator runs none)

```
/goal implementations-plan/ui-leftovers-2/plan.md done: Phases 0-3 marked ✓ with each gate's commands passing in the transcript, the Codex loop converged on the net diff (a resumed pass quoted with no new material finding), the PR open with Closes #675 #676 and green checks.
```

```
/loop 15m Drive implementations-plan/ui-leftovers-2 per its plan.md: reality check (plan, lessons, git status, PR checks), next pending phase and its gate, then the Codex loop, then delivery; never fold OA-1 or OA-2 in before the orchestrator relays an answer.
```
