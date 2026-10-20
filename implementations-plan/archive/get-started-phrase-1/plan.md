---
plan: get-started-phrase-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at f5b7fd5ad (includes #743)
trunk: dev
status: completed (2026-10-20); closed in A1's final commits
issues: "#936 (closed by A1)"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-20
- **Status:** completed. Its delivery is A1, one PR against `dev` that closes #936; this close-out is its final commits. The orchestrator merges it.
- **Shipped:** P73-01: a funded password wallet's unsaved phrase stays a step of the Get started card (step 1, "of 4" on the first profile; the row alone on a later one), and the urgent banner shows only after Hide. `getStartedView`'s banner needs `hidden`; the pure, Home and e2e pins follow the rule, with a funded hidden passkey case, a red proof on the base and pictures in both themes ([screenshots/](screenshots/)).
- **Superseded or dropped:** D7's hero-prices frames, dropped for a scratch spec (D7a).
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none promoted: `lessons.md` is at its budget (8152 B). The first-receive sheet over Home's middle in a backup-imported spec went to the `e2e-testing` skill's `NULO_E2E_SHOT_DIR` row.
- **Seeds retired:** the `/goal` and `/loop` seeds below; they are not instructions.

# get-started-phrase-1: the phrase stays in the Get started card; the banner only after Hide

One arc, one PR against `dev`, ready (the pick is signed). It closes #936 on the owner's pick P73-01: a funded password wallet's unsaved phrase stays a step of the Get started card, and the urgent banner shows only once Hide has put the card away. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/` unless they start with `implementations-plan/` or `.claude/`.

## The claims and what did not hold

- **#936's trace holds**: `getStartedView` drops the phrase step when the banner shows (`src/utils/get-started.ts:135-139`), so a funded first card lists A F R and counts "of 3"; `get-started.test.ts:142` pins it.
- **The lane brief's "Home's banner wiring"**: Home holds no rule (`src/popup/pages/general.vue:152,167`); only the view changes.
- **The brief's pins are incomplete**: `get-started.test.ts:205-207,215-221`, `general.test.ts:140,148,255,298`, `tests/e2e/network/fee-methods.test.ts:356-358` and `.claude/skills/e2e-testing/SKILL.md:595-597` also encode the old rule ([recon.md](recon.md)).
- **"Hidden by Hide" is not "no card on screen"**: a hidden password card still lists the phrase alone (`get-started.test.ts:189`). D1 keeps the brief's two named cases as written.

## Outcome & Quality Bar

- **For whom:** a person on a password profile who holds funds and has not saved the 24 words, looking at Home.
- **Excellent:** (1) once Home's reads settle, the phrase is asked for in exactly one place, the card's open step or the banner, never both and never neither; (2) funds never move, renumber or remove the phrase step: the first card counts "of 4" from creation to the last step.
- **Good enough:** no change to copy, the banner, the card's look, Hide, or a passkey or imported profile.

## UI impact

- **Home · the install's first created password profile, card not hidden, phrase unsaved, funds held** (the matrix's M8, M11, M23; M10 follows). Before: the banner "Your funds have no backup · Save phrase" above the balance; the card lists How Aztec works, Get Fee Juice, Make proofs faster as 1 to 3 ("n of 3 done"), or no card once those are done; spending to zero brought the phrase step back. After: no banner; the card lists "Save your recovery phrase" as step 1, open, with the accent "next" mark, then the others as 2 to 4 ("n of 4 done"); the card stays while the phrase is unsaved. Signed: **P73-01** (decision page 73, 2026-10-20), the owner's note: "I think we should just leave it on the "get started" and say "of 4"? We are blastering the users with CTAs if not, and not even in the same place. What do you thinl? Put it as first task?", and the call confirmed in chat: "let's do card only tbh"; the Decision: "The banner shows only when the card is not on screen (hidden by Hide, or a profile with no card)."
- **Home · a later password profile, phrase unsaved, funds held** (M2, M4). Before: the banner, no row. After: the phrase row alone stays (no count, no Hide), no banner. Signed: the orchestrator's no-ask record for this lane (2026-10-20): "A later password profile (P50-01 B: its Home shows the phrase row alone, no Hide) therefore shows no banner while that row is on screen".
- **Home · Hide pressed on a funded first card** (M17). The end state is today's (the banner, no card); pressing Hide now brings the banner up, where before it was already up. Signed: P73-01, "hidden by Hide".
- **Moves:** the ask moves from the hero, which stays put, to the card in Home's scroller, which can scroll out of view. Accepted by "card only".
- **Unchanged:** an unfunded wallet, a saved phrase (P checked in place), an imported profile (neither), a passkey profile (no banner). No other row, count or copy changes.

## Architecture & Implementation

- **Rule** (`src/utils/get-started.ts:136`): `banner = password && !phraseSaved && funds === "some" && flags.hidden`. Nothing else moves: the phrase step is listed when `password && !banner`, ahead of `firstProfileSteps`; `null` until every input is read (`funds === "unknown"` included); `imported` → nothing; every listed step done → no card; `canHide` while a non-phrase step is listed. Consequence: `banner` implies `hidden`, so `firstProfileSteps` is empty and the phrase is unlisted: the card and the banner never show together.
- **Comments:** `:135` becomes the invariant (the phrase step cannot be hidden; after Hide a funded wallet's phrase is the banner instead); the `banner` field's TSDoc (`:95`) gains "only after Hide".
- **Files:** `src/utils/get-started.ts`, `src/utils/get-started.test.ts`, `src/popup/pages/general.test.ts`, `tests/e2e/network/hero-prices-unavailable.test.ts`, `tests/e2e/network/fee-methods.test.ts`, `.claude/skills/e2e-testing/SKILL.md`. No change to `general.vue`, `GetStartedCard.vue`, `BackupReminderBanner.vue`, storage, or any flag.
- **Not taken:** a Home-side condition (`v-if="reminders.banner && !reminders.steps.length"`): two places would own one rule. Deriving the banner from `firstProfileSteps` being empty: that is D1's rejected reading.

## Decision ledger

| # | Question | Decision | Rejected |
|---|---|---|---|
| D1 | When the banner shows | only after Hide (funded, phrase unsaved): the brief's two named cases, Hide → banner and a later profile → its row and no banner | (a) whenever `firstProfileSteps` is empty (hidden or later): keeps today's later-profile banner, against the brief's later-profile line and the owner's "leave it on the get started" (Opus r1 read the line as true either way; Codex r1 rejected (a)); (c) never: against "hidden by Hide" |
| D2 | M23 funded (A F R done, phrase unsaved) | the card stays, P open, "3 of 4 done" (P69-01 C: the card leaves once every listed step is done) | the card leaving for the banner: funds would move the phrase, the swap P73-01 removes |
| D3 | Unread funds | still `null` for every profile: the card appears when it does today | showing the card before funds are read (a load-order change nobody asked for) |
| D4 | The brief's "one component case on the card for the row and count" | a Home cell (`general.test.ts`) with the real `GetStartedCard`: rows P A F✓ R, count "1 of 4 done", `aria-current="step"` on the phrase row, no banner | a `GetStartedCard.test.ts` case for P A F R: the card does not change, and `GetStartedCard.test.ts:43-53,91-96` pin numbering, the next mark and the count for any list |
| D5 | Home's banner-source cases (`:140,148,298`) | kept on a hidden card, titles naming it: their subject is what raises the banner | deleting them (the banner's funds sources would lose their Home proof) |
| D6 | e2e | hero-prices: import record removed → card (P first, open, "of 4"), no banner; Hide → banner, no card; reveal → neither. fee-methods: rows P A F✓ R, no banner. No new spec; the smoke suite runs in CI (its profiles hold no funds) | a new spec for Hide → banner: hero-prices already reads the banner on a real node |
| D7 | Pictures | hero-prices under `NULO_E2E_SHOT_DIR`: three `shotSend` frames (card; after Hide; after saving), both themes, 360×600, Chrome, a real node | a scratch spec: the frames are the spec's own states |
| D7a | Pictures, deviation found in Phase 2 | in hero-prices a "First receive · Allow TST?" sheet (the backup-imported token) covers Home's scroller, so its new frames could not show the card: they were dropped; the pictures come from a scratch spec on `tokenReadyExtension` (token imported through the UI, no sheet), copied into `tests/e2e/network/` only while it ran: card, after Hide, then un-hidden after the reveal (the phrase checked) | dismissing the sheet inside hero-prices (changes the spec's flow for a picture) |
| D8 | The stale skill line | rewritten in `.claude/skills/e2e-testing/SKILL.md` (CLAUDE.md routes e2e know-how there) | — |

## Security & Adversarial Considerations

- **Threat model:** no new input, storage key, message, permission or dependency. Only the wallet writes the flags (`markGetStarted`, `get-started.ts:61-67`; the profile service). The flags record actions, not proof of a backup; this lane does not change that contract. The risk that matters is a wrong screen: a funded wallet with no visible ask. Once reads settle, a created password profile with its phrase unsaved lists the phrase open unless `hidden` and funded, and then shows the banner; a lost Hide write leaves the card up, phrase included. The pure cases prove each side.
- **Accepted by the owner's pick:** the funded ask is the calm numbered step, not the urgent banner, and it scrolls with Home's middle (P73-01).
- **Crypto, least privilege, supply chain, input validation:** N/A; nothing added.

## Assumptions

**Facts:** F1 `getStartedView` is the one source of the card and the banner (`get-started.ts:130-142`; `general.vue:76,152,167`). F2 `firstProfileSteps` returns no step iff `hidden` or `notFirst`, else three or four (`:114-125`). F3 a hidden password card lists P alone unfunded and the banner funded today (`get-started.test.ts:188-191`). F4 `GetStartedCard` numbers its list from 1, marks the first open step `aria-current="step"` and fills its mark, and counts when more than one step is listed (`GetStartedCard.vue:20-52`). F5 only a create writes `notFirst` (`wallet/services/profile/service.ts:1460-1463`), so hero-prices' imported profile reads as a first one once its import record goes. F6 `shotSend` saves the page in both themes (`tests/e2e/fixtures/shots.ts:19`); the popup loader sizes it 360×600 (`fixtures/wallet-pages.ts:140`). F7 the network config honours `NULO_E2E_RETRY=0` (`vitest.e2e.network.config.ts:24-28`).

**Inferences:** I1 the brief's later-profile line asks for the row to stay when funded (D1). I2 hero-prices' Fee Juice state after the import is not fixed, so its step asserts the order, P open and "of 4", not F. I3 the other network specs survive the layout shift: `fiat-send` scrolls before it measures, `store-captures` imports, `snack-placement` runs `clearGetStarted` ([recon.md](recon.md)); CI's full lanes on both browsers confirm.

**Asks:** none. P73-01 and the brief's later-profile record sign every visible change above.

## Phases (arc A1, branch `get-started-phrase-1-a1` from this plan's commit on `origin/dev`)

**Phase 1 — the rule, its unit and Home tests, the skill line.** ✓ 2026-10-20: red proof 5 of 48 on the base, 48 of 48 on the branch; lint, `typecheck:all`, `test:all`, `audit:vue` exit 0; smoke 13 of 13 at retry 0 on the armed build ([lessons/phase-1.md](lessons/phase-1.md)).
- `get-started.ts`: the rule and comments above.
- `get-started.test.ts`: `:142` → "a funded password wallet keeps the phrase as the card's step 1, with no banner" (`toEqual` P A F R open, `canHide: true`, `banner: false`); `:162` title loses "and ends the banner"; `:188` adds hidden, funded and saved → nothing; `:205` → a funded later profile keeps its row alone (`banner: false`, P open, `canHide: false`), retitled; `:215` funded case → P open plus A F R done, `canHide: true`, no banner, retitled.
- `general.test.ts`: `:140` and `:148` mount with `nulo:ui:getStartedHidden@p1`, keep their banner and settle assertions, `:148` drops its row check, both retitled; a new cell after `:155` per D4; `:255` adds token funds and asserts no banner; `:298`'s urgent mount adds the hidden flag.
- `.claude/skills/e2e-testing/SKILL.md:595-597`: a funded password wallet's phrase is the card's step; only after Hide is it the banner above the hero; a spec framing Home without either runs `clearGetStarted`.
- **Red first:** with `git show f5b7fd5ad:apps/extension/src/utils/get-started.ts` in place, the rewritten `get-started.test.ts:142,205,215` cases and the new Home cell fail; on the branch they pass.
- **Gate:** `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run audit:vue` exit 0; then the armed smoke build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`; `audit:vue`'s build disarms `dist/`) and `cd apps/extension && env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/security-backup.test.ts tests/e2e/onboarding-tab.test.ts tests/e2e/stale-network.test.ts --retry=0` green (the smoke files that read the card); the red proof recorded in `lessons/phase-1.md`. Smoke runs before Phase 2: `e2e:agent` leaves a network build in `dist/`.

**Phase 2 — the e2e steps and the pictures.** ✓ 2026-10-20: `hero-prices-unavailable` and `fee-methods` 9 of 9 at retry 0 (558 s; hero-prices 60.8 s with shots on, CI before 32.7 s Chrome / 38.5 s Firefox); pictures per D7's deviation ([lessons/phase-2.md](lessons/phase-2.md)).
- `hero-prices-unavailable.test.ts:50-63`: after the import record goes, wait for `get-started-phrase` visible; assert it is the first row, `data-done="false"`, `aria-current="step"`, the count ends "of 4 done", no banner; `shotSend(page, "home-get-started-phrase", "get-started")` (dropped, D7a). Click `get-started-hide`; wait for the banner; assert no `get-started`; keep `shotSend(page, "home-backup-reminder", …)`. After the reveal and Home: wait until neither the banner nor `get-started` is in the page (the reveal's flag write is not awaited, `seed.vue:76`), then take `shotSend(page, "home-phrase-saved", "home-hero")` (dropped, D7a); the banner seen after Hide is its success control. Rewrite the step comment to the new rule.
- `fee-methods.test.ts:356-358`: rows `get-started-phrase`, `get-started-aztec`, `get-started-feeJuice done`, `get-started-presto`; no banner; the comment says the funded card keeps the phrase first.
- **Before:** the wall-clock of the latest green full runs of `pr-extension-network-e2e.yml` and `pr-extension-network-e2e-firefox.yml` on a PR off the same `dev`, and hero-prices' duration from their logs (`gh run list --workflow <file> --limit 5`). Estimate: +2 s for the Hide step.
- **Gate:** `cd <worktree> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_SHOT_DIR=~/.cache/nulo-backlog/get-started-phrase-1/shots bun run e2e:agent tests/e2e/network/hero-prices-unavailable.test.ts tests/e2e/network/fee-methods.test.ts` green at retry 0; the six pictures (D7a) show the states their names say; lint exit 0. Copy those six to `implementations-plan/get-started-phrase-1/screenshots/` and commit them.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `f5b7fd5ad`; step 1 absent (`code_review: off`). Single arc: after Phase 2, the Codex loop over `git diff origin/dev...HEAD` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`), the two verbatim rules in every prompt, hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Each round goes in `lessons/phase-2.md` and § Audit verdicts. Then the local gates on the final head: Phase 1's in full, and Phase 2's network run again if the loop changed the rule or an e2e file. Close-out as the PR's final commits, before `gh pr create`: merge `origin/dev` first; the Outcome block (`Known limits: none`, `Open items: none` unless the loop files one); the lessons pass; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, links repaired, the index line moved to `archive/index.md`; `bun run check:plans` after staging. Teardown once `implementations-plan/archive/get-started-phrase-1/plan.md` is on `origin/dev`: `agent-worktree done get-started-phrase-1 --merged`; a session still running checks with `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/get-started-phrase-1/plan.md`.

## Delivery

| Arc | Phases | Base | PR title (≤ 93) | Issues |
|---|---|---|---|---|
| A1 | 1, 2 + close-out | `origin/dev` + this plan's commit | `fix(home): keep the phrase in the get started card; show the banner only after hide` (83) | Closes #936 |

One PR, ready, no labels (`src/utils/**` trips the smoke and network filters). Body: what changed and why, P73-01 and the later-profile record quoted, the six pictures (blob links at the PR head), the local runs, each browser's network suite wall-clock before and after, `Closes #936`. Then `gh pr checks <n> --watch` once; never merge. No parallel lanes: two phases on one view.

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, session `01a15a23`): **reject**: D1 (a) contradicts the brief's later-profile line; its pin `get-started.test.ts:205` was kept. Accepted: the banner only after Hide (D1), `:205` and Home `:255` rewritten, the invariant scoped to settled reads, F5 and F6 restated, no `firstProfileSteps`-first restructure. Confirmed D2, D4, D5, D6, I2; no further pin.
- **Opus 5.5 r1** (Plan): **conditional approve**. Accepted: the smoke run dropped from Phase 2's gate (it would run on the network build; CI runs smoke), the red proof names the failing cases, the hero-to-scroller move stated, M10 and the Hide transition in UI impact, citations (F4, D4), the `:148` retitle, the six PNGs named, the layout-spec search recorded (I3), the base moved to `f5b7fd5ad`. Rejected: D1 (a), for Codex's reason above.
- **Codex r2** (resumed `01a15a23`): **conditional approve**. On D1: Opus's circularity holds for the conditional alone, not for the brief's named later-profile line; Hide records a dismissal, `notFirst` a history, so two like-looking rows may differ; no owner ask. Conditions, both accepted: wait for the post-reveal state before asserting (the flag write is not awaited); keep `audit:vue` and a smoke run on the armed build in the local gates (Phase 1).
- **Codex r3** (resumed `01a15a23`): **approve**, no new material finding.
- **A1 Codex loop r1** (gpt-6.1-sol, high, session `01a15a4b`): **clean**; it evaluated the view over 384 input combinations, exactly one ask each.
- **A1 Opus 5.5 diff review**: **findings (3)**, all fixed: a funded hidden passkey case (the passkey half of the rule had lost its test; a mutation proves it now fails); the post-reveal wait also needs Home settled; two redundant assertions dropped and the skill line's wording.

## Seeds

- `/goal` Phases 1 and 2 marked ✓ in implementations-plan/get-started-phrase-1/plan.md with their gates' output in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); the plan archived in the PR's final commits; PR `fix(home): keep the phrase in the get started card; show the banner only after hide` open against `dev` with `Closes #936`; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/get-started-phrase-1 arc A1: read plan.md and lessons/, run the next phase and its gate, tick it, run the Codex loop, close out, open the PR; never merge.
