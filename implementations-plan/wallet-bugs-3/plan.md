---
plan: wallet-bugs-3
tier: light
status: arc 1 implemented, review loop converged; PR pending
issues: "#1627, #1653, #1535 (arc 1 closes all three)"
base: 4b250dfe46f99501e175c53316e30da0f89025ba
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
---

# wallet-bugs-3: three small wallet defects

One arc, one PR against `dev`, three phases (one per issue). Recon: [`recon.md`](recon.md).

## Outcome & Quality Bar

- **For whom**: a person on Home or Holdings after a balance sync failed (#1627); a person reading which contract a call goes to in the execute window (#1653); a keyboard or screen-reader user on a fee card (#1535).
- **Excellent**: (1) every task a balance batch starts is finished before the batch releases it, whatever a storage write does, so no refresh dot stays lit; (2) the payload row never breaks a short address inside itself, the call's name takes the wrap, and nothing runs past the card; (3) the priority row is one Tab stop, ←/→ move the choice and focus with a visible ring, a screen reader hears which level is chosen.
- **Good enough**: no new e2e scenario (checks join existing ones); the batch's write order, fences and logging stay as they are outside the failure loop.

## Findings (verified against the base)

- **#1627: demonstrated.** A scratch test at the base (projector throws, `repo.prepare` rejects, two rows in one batch) ends with one `failTask` and the other task unfinished, both pointers released. Path: `syncBatch`'s catch runs `failBatchOnProjectorError` (`balance-job-queue.ts:422-440`), which fails a task, then awaits `writeSyncFailure`; a rejection ends the loop, `finally` runs `releaseOwnedTaskPointers` (`:442-451`), the later task stays unfinished with no pointer, and the next enqueue mints a second task (`:144-152`). Invariant broken: a batch finishes every task it started before releasing it. Consequence: the row's refresh dot stays lit until the worker restarts. Triggers: a rejected `chrome.storage.local` write, or `WalletLockedError` from `prepare`/`commit` (`sealed-entity-storage.ts:213-261`); row keys survive lock and switch (`profile/service.ts:318-324`), so rare. No test covers the projector-throw path.
- **#1653: holds by code.** `.call_row > *` gives both children `min-width: 0; overflow-wrap: anywhere` (`OperationCard.vue:877-881`), so the caption shrinks with the title and its address breaks at any glyph. The caption holds wallet-side text only: a trimmed address (14 glyphs, `meta`, mono 13 px) or the person's contact or account name (`name` role, Inter 600 13 px; 25-glyph cap: `contact-name.ts:9`, `NewAccountPopup.vue:125`, `EditAccountPopup.vue:109`). `.op_card` clips (`overflow: hidden`, `:771`); the sweep lays windows out down to 240 px (`tests/e2e/fixtures/type-roles.ts:721`), where the `< 359px` media query wraps the row.
- **#1535: holds.** `FeePriorityRow.vue` renders three native buttons with no role, `type`, `tabindex` or `aria-selected`; `button { outline: none }` (`packages/design/src/base.css:237-242`) leaves them no focus indicator.

## Architecture & Implementation

- **Phase 1 (#1627)**, `apps/extension/src/wallet/services/token-balance/balance-job-queue.ts`, `failBatchOnProjectorError` only: a synchronous pass fails every owned, still-known, unfinished task (no await in it); a second pass attempts the failure write for each task the first pass failed, sequentially, keeping the first rejection and rethrowing it after the loop, so `tick`'s catch logs it once as today (D1).
- **Phase 2 (#1653)**, `apps/extension/src/popup/windows/execute/OperationCard.vue` `<style module>`: `.call_row > :last-child { flex-shrink: 0; max-width: calc(100% - 12px); }` (the row's 12 px gap) with a one-line why, `max-width: 100%` for it inside the existing `@media (width < 359px)` block, where the row wraps, and the `.call_row > *` comment narrowed to the title. The caption keeps its content width up to the row's less the gap; only a caption wider than that wraps, through the existing `min-width: 0; overflow-wrap: anywhere` (D2).
- **Phase 3 (#1535)**, `apps/extension/src/popup/components/modules/send/FeePriorityRow.vue`, the house roving tablist after `AuthMethodTabs.vue`: wrapper `role="tablist"`, `aria-labelledby` the "Priority" label (`useId()`, auto-imported); each option a native `<button type="button" role="tab">` with `:aria-selected` and `:tabindex` 0 on the chosen level, -1 on the rest; a tablist `keydown` handles ArrowLeft/ArrowRight only (`preventDefault`, emit the neighbour, wrapping, `nextTick` focus it through a ref map); `.priority_btn:focus-visible` gets the house 2 px accent outline, offset 2 px (D3, D4). Testids, classes, props and emits unchanged.
- **Alternatives not taken**: #1627, a `finally` sweep before the pointer release, or unguarded writes (D1); #1653, `flex-shrink: 0` alone (a name wider than the row runs under the card's clip, Opus R1), `min-width: auto` with a no-break space after "on" (more moving parts, a long name wraps while the call name has room), `white-space: nowrap` on the address (the caption still shrinks under it), a fixed `max-width` share (a magic number); #1535, a shared roving-tab component (two callers, different shapes, no third).

## Decision ledger

- **D1 (#1627)**: two passes; every write attempted once, the first rejection rethrown. Finishing the tasks before any await fixes the cause (completion sequenced after a throwing await) at the one place it occurs; the try body's own throws all land in this catch. Codex R1: each row's record is independent and nothing guarantees a later write fails because an earlier one did; attempting each adds no retry, state or log site. Opus R1 dissented (every traced failure is store-wide; prefers unguarded). Codex's argument wins: it keeps the one log line, swallows nothing, and costs a few lines.
- **D2 (#1653)**: `flex-shrink: 0` with a `max-width` cap on the caption (Opus R1), after the house idiom (`.leaves_count`, `OperationCard.vue:792-795`). A frozen item keeps its hypothetical size, which `max-width` clamps, and a percentage resolves against the row; unwrapped, the cap leaves the row's 12 px gap so caption and gap never pass the row (Codex R2); wrapped (`< 359px`) the caption has its own line and takes 100%. A short address (about 125 px with "on") never breaks at any supported width; a 25-glyph name (about 220 px; up to about 330 px in wide capitals) keeps one line where it fits and wraps inside the card where it does not, the title then narrowed to almost nothing, contained. Supersedes the caption's part of type-roles E1 ("the call row's 'on <address>'… break inside the card", archived `type-roles/plan.md`): the PR names it for the owner's sign-off.
- **D3 (#1535)**: automatic activation (arrows select), wrap at the ends, no Home/End, as `AuthMethodTabs` does and CLAUDE.md § Keyboard & focus order prescribes. Both legs agree.
- **D5 (implementation deviations)**: the failure loop's synchronous pass is one `filter` over a helper, `failUnfinishedTask`; the sweep's `callCaptions` also returns `inRow` (each caption's right edge inside its row), so the 48-W step tells the gap-reserving cap from a 100% one (Opus diff review). The smoke check's order changed after a red on a correct Firefox build: the row ends the Send page in that state, Tab hands focus to the browser and Firefox's Shift+Tab re-enters elsewhere, so re-entry is tested by Shift+Tab out of the chosen tab, then Tab back onto it.
- **D4 (#1535)**: the 2 px accent `:focus-visible` ring, an accessibility call under the owner's 2026-10-19 delegation (precedent `onboarding/pages/create.vue:317-339`, `fee-shared.module.css:51-54`): without it a person tabbing in sees no change, as the chosen tab already carries the accent border. Focus always sits on the chosen tab, so #1520 (two levels outlined) cannot return; `.detail_row`'s padding keeps the ring unclipped (Opus R1). A deviation from the lane record "#1535 changes no pixel": none at rest, a ring on keyboard focus; both legs endorse it and the report names it to the orchestrator. No source-rule pin (both legs): the smoke check reads the computed ring.

## Phases

### Phase 1: #1627, every batch task finishes ✓

- **Assumptions**: the projector returns one result per input (`balance-projector.ts:68-108`); in the first pass `failTask` cannot throw behind the `hasTask` and `finishedAt` checks (Opus R1 traced it).
- **Tests** (`balance-job-queue.test.ts`, two rows of one account, a projector that throws): (a) control, working storage: every task fails with the projector's message, both rows get their failure record, `onBalanceUpdated` fires twice (green at the base; the existing returned-error test covers another path); (b) written first, red at the base: the first `prepare` call rejects: every task the queue minted is finished, `prepare` ran twice and the other row's record is written, `tick()` resolves and an injected logger records one error.
- **Gate**: `cd apps/extension && bun --bun vitest run src/wallet/services/token-balance/` green; (b) red on the base copy of `balance-job-queue.ts` (`git show 4b250dfe4:<path>`), green after; `bun run lint && bun run typecheck:all` (root) exit 0.

### Phase 2: #1653, the short address keeps one line ✓

- **Assumptions**: the caption is the row's last child (`OperationCard.vue:401-402`); the sweep's call goes to the token contract, which no contact names, so its caption is in address mode.
- **Tests**: `OperationCard.long-strings.test.ts` (wire-shaped `TOKEN`, 64-glyph name): the call-row case pins `declarationsOf(".call_row > :last-child")` equal to `{ "flex-shrink": "0", "max-width": "calc(100% - 12px)" }` and the media query's `max-width: 100%`; its title and the file header now say the name breaks and the caption keeps its width. `tests/e2e/network/type-roles-windows.test.ts`, inside the existing `contained` branch after `stretchPayload` (64-glyph title, 25-W caption), when `request.details` is set: at least one payload row; in each, the `execute-op-call-to` text node alone lies on one line (distinct `top` among its range's non-zero-width rects), and the caption's "on" text rect overlaps the address's first rect vertically (Codex R2: mixed fonts give one line several tops); checked at `WINDOW` and through `atWidth(win, 360, …)` (`fixtures/type-roles.ts:739`). Then, still at 360 px, a caption wider than the row (the address text set to 48 W) leaves `payloadPastCard` ≤ 0: the cap and gap path. Failure modes: the caption breaking inside itself under a long call name at the window's and the popup's width (red at the base), and a capped caption passing the card (green at the base, guards D2); jsdom applies no stylesheet. Estimated under 1 s, measured in the PR.
- **Pictures**: the payload row, details open, before (base) and after, light and dark, at a 360 px viewport (the popup's `--base-width`), from a local run with `NULO_E2E_SHOT_DIR`; for the PR body only.
- **Gate**: `cd apps/extension && bun --bun vitest run src/popup/windows/execute/` green; the e2e checks red at the base and green after, on both browsers: `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts tests/e2e/network/popup-escape-layered.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`; `payloadPastCard`, `expectLaidOut` and `expectFitsNarrow` stay green.

### Phase 3: #1535, the priority row is one roving choice ✓

- **Assumptions**: `selectedPriority` is written only by this row and starts at `"normal"` (`FeeSettingsCard.vue:163,508`), so one tab always holds `tabindex="0"`; `page.focus` in `popup-escape-layered.test.ts:175,192` focuses a `tabindex="-1"` button; the four suites that stub the row are unaffected (Opus R1).
- **Tests**: `FeePriorityRow.test.ts`, extending its five cases, mounted with `attachTo: document.body` and unmounted in `afterEach`, the host's v-model emulated through `onUpdate:modelValue` → `setProps`, keys sent with `sendEvent` (`tests/helpers/send-event.ts`): the ARIA (tablist named "Priority"; `aria-selected` and `tabindex` true/0 on the chosen tab only); ArrowRight and ArrowLeft emit the neighbour, are prevented, and move focus to it; Urgent → ArrowRight wraps to Normal, Normal → ArrowLeft to Urgent; Enter, ArrowUp and Home are not prevented and emit nothing (control). `tests/e2e/send-keyboard.test.ts`, the existing priority block (`:373-392`): `page.focus` the chosen tab, ArrowRight: focus and `aria-selected` on Fast with `expectAccentRing`; Tab, and from Fast again Shift+Tab, each leave the row. Failure modes: the real Tab path and the painted ring, neither visible to jsdom.
- **Gate**: `cd apps/extension && bun --bun vitest run src/popup/components/modules/send/` green; `cd apps/extension && bun run test:e2e -- tests/e2e/send-keyboard.test.ts --retry=0` green on Chrome and with `NULO_E2E_BROWSER=firefox`, its new checks red at the base; `popup-escape-layered.test.ts` green on both browsers (Phase 2's runs).

### Arc gate (before the review loop)

From the worktree root: `bun run audit:vue` (typecheck, test and lint, then build) and `bun run test:all` exit 0; `bun run check:plans` green after staging plan files. Locally the touched e2e files run (the lane's standing rule); the full smoke and network suites run on both browsers in the PR's required lanes.

## Security & Adversarial Considerations

- **Threat model**: no trust boundary moves. #1627 reorders in-memory task finishes in the failure path; fences, generation checks and write order are untouched. #1653 is CSS; the caption is wallet-side text and the dApp-supplied title keeps breaking inside the card, so a dApp's 64-glyph name can no longer split the contract's address, which is what a person checks. #1535 changes no data path; the chosen level reaches the fee estimate exactly as a click does.
- **Input validation, crypto, supply chain, least privilege**: N/A, no dependency, permission or key change.

## Assumptions

- **Facts**: those cited under Findings and in each phase; no closed `known-limit` issue covers these paths (#1628 and #1629 are neighbouring balance limits, untouched).
- **Inferences**: by the flex trace the 25-W stand-in breaks at the base (the caption's share of the shrink takes it below its width; Opus R1 computed about 97 px against 195); the e2e checks' red at the base is measured, not assumed.
- **Asks**: none. D2's supersession of E1 is signed in the PR with the pictures; D3 and D4 are delegated accessibility calls.

## UI impact

- **#1653, execute window, payload row (details open)**: the orchestrator's record, "#1653 changes how one row reads (where the wrap falls): pictures before and after in the PR body, and the owner signs it there before the merge." Before: the address can split ("0x1ecd47..922" / "2"). After: "on 0x1ecd47..9222" stays on one line and the call's name wraps beside it; a caption wider than the row still wraps. The PR names that this supersedes the caption's part of type-roles E1.
- **#1535, the priority row wherever `FeeSettingsCard` shows it** (Send, the execute window's fee card, `ChangeAuthwitsRegistryPopup.vue:149`, `RevokeAuthwitsPopup.vue:240`): the orchestrator's record, "#1535 changes no pixel, only the Tab path and the ARIA state; say so in the PR." At rest no pixel changes; D4's ring draws on keyboard focus only, stated in the PR as an accessibility call under the 2026-10-19 delegation, with a capture of the focused row.
- **#1627**: the orchestrator's record, "#1627 shows nothing new: a dot that stayed lit now clears."

## Delivery

Single arc, no stack (D-orch-1): branch `wallet-bugs-3-a1` off `origin/dev`, carrying the plan commit. The PR opens only after the arc gate passes and the review loop converges; `dev` is frozen for the 1.2.0 promote until #1671 merges, and the orchestrator decides when this one merges. Title (≤ 92): `fix(wallet): balance batch failures, the payload row's address wrap, the priority tablist`. Body: what changed and why, validation runs with outcomes, the e2e wall-clock of `type-roles-windows.test.ts` and `send-keyboard.test.ts` before and after on both browsers, the pictures, the D2 and D4 sentences, `Closes #1627`, `Closes #1653`, `Closes #1535`. Before opening: `git merge origin/dev` (e2e-flakes-3 may touch the balance service), then `bun run check:plans`.

## Post-implementation

Per `implementations-plan/README.md` § Post-implementation standard at `4b250dfe4`, single-arc placement: `code_review: off`, so step 1 is absent; step 2 runs once over the net diff from `base` with `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop after three rounds; rounds logged in `lessons/phase-1.md`. Close-out as the PR's final commits; teardown with `agent-worktree done wallet-bugs-3 --merged --trunk dev` once `implementations-plan/archive/wallet-bugs-3/plan.md` is on `dev`.

## Audit verdicts

- **Codex R1** (gpt-6.1-sol, high): approve with changes, six findings, all adopted: the Phase 1 control used the returned-error path (test (a) added); D1's store-wide claim unsupported (attempt every write); D2's width used the wrong typography and the card clips (bounded wrap kept); the e2e check covers the whole caption and the popup's width; the E1 supersession and D4's focus pixels named in the PR; `audit:vue` added to the arc gate.
- **Opus R1** (Plan leg): approve with changes, seven findings: control test (adopted, as Codex); `flex-shrink: 0; max-width: 100%` with the 240 px trace (adopted as D2); the e2e check must not pass on zero rows (adopted); `sendEvent` and `afterEach` (adopted); drop the ring's source pin, list every surface, name D4 as a deviation (adopted); Firefox for `popup-escape-layered` (adopted); stale caption comments (adopted). Its D1 preference for unguarded writes rejected (D1).
- **Codex R2** (resumed): approve with changes, two findings, both adopted: a whole-caption line count misreads mixed fonts (count the address text alone, "on" overlapping it); `max-width: 100%` with the row's gap can pass the row when unwrapped (cap at `calc(100% - 12px)`, 100% when wrapped). It confirmed D1, D3, D4, the gates and that the smoke checks go red at the base.
- **Codex R3** (resumed): approve, no new material findings; browser red and green stay implementation gates.
- **Review R1** (Codex, gpt-6.1-sol high, net diff from `base`): clean; two comment findings applied. **Opus diff review** alongside: clean; two test-strength findings applied (D5). **Review R2** (resumed): clean; one comment nit applied. Converged.

## Seeds

- `/goal` Phases 1–3 of implementations-plan/wallet-bugs-3/plan.md marked ✓, each gate reported passing in the transcript, the Codex loop converged on the net diff, the PR open against dev with Closes #1627, #1653, #1535, checks green.
- `/loop 15m` Drive implementations-plan/wallet-bugs-3 forward: read plan.md and lessons/, run the next unmet gate, decide open questions with Codex, never wait for input; stop at an owner ask.
